// Package neuralclient provides a dependency-free Go client for the
// versioned GLORIFIER Worker Neural API. It never retries task submissions
// because the API contract does not define an idempotency key.
package neuralclient

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	MaxTaskBodyBytes int64 = 65536
	MaxResponseBodyBytes int64 = 1 << 20
	MaxTaskCharacters = 20000
	MaxPurposeCharacters = 100
	MaxActionClassCharacters = 64
	DefaultTimeout = 15 * time.Second
)

var uuidPattern = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// Config configures one trusted GLORIFIER Worker origin. Token is the caller's
// token; it is never sent to task-controlled URLs. AllowLoopbackHTTP is only
// for local development and tests. An empty Token may be used for health checks.
type Config struct {
	BaseURL string
	Token string
	HTTPClient *http.Client
	// AllowedOrigins is an exact allowlist of additional HTTPS API origins,
	// such as a reviewed staging endpoint. The canonical GLORIFIER Worker origin
	// is allowed by default. Paths, credentials, queries, and fragments are rejected.
	AllowedOrigins []string
	// AllowLoopbackHTTP is only for local development and tests.
	AllowLoopbackHTTP bool
}

// Client communicates only with its configured API origin.
type Client struct {
	baseURL string
	token string
	httpClient *http.Client
}

type TaskRequest struct {
	Task string `json:"task"`
	Purpose string `json:"purpose,omitempty"`
	RequireApproval *bool `json:"require_approval,omitempty"`
	ActionClass string `json:"action_class,omitempty"`
}

type TaskResponse struct {
	Status string `json:"status"`
	Provider *string `json:"provider"`
	Result *string `json:"result"`
	Evidence []string `json:"evidence"`
	Message string `json:"message"`
}

type HealthResponse struct {
	Status string `json:"status"`
	Service string `json:"service"`
	Checks map[string]string `json:"checks"`
}

// A 503 may be a readiness observation or an adapter/configuration error. Inspect
// Metadata.HTTPStatus; adapter errors are returned as *APIError.
type ReadinessResponse struct {
	Status string `json:"status"`
	Checks map[string]string `json:"checks"`
	Message string `json:"message"`
}

type CallOptions struct {
	CorrelationID string
}

type ResponseMetadata struct {
	HTTPStatus int
	CorrelationID string
	RetryAfter string
}

// APIError is normalized and deliberately excludes raw response bodies.
type APIError struct {
	StatusCode int
	Code string
	Message string
	CorrelationID string
	RetryAfter string
}

func (e *APIError) Error() string {
	if e.Code != "" && e.Message != "" {
		return fmt.Sprintf("GLORIFIER API returned HTTP %d (%s): %s", e.StatusCode, e.Code, e.Message)
	}
	if e.Code != "" {
		return fmt.Sprintf("GLORIFIER API returned HTTP %d (%s)", e.StatusCode, e.Code)
	}
	if e.Message != "" {
		return fmt.Sprintf("GLORIFIER API returned HTTP %d: %s", e.StatusCode, e.Message)
	}
	return fmt.Sprintf("GLORIFIER API returned HTTP %d", e.StatusCode)
}

// NewClient requires HTTPS except for explicitly opted-in loopback HTTP. It sets
// a finite timeout and disables redirects to prevent credential forwarding.
const canonicalWorkerOrigin = "https://glorifier.glorifier.workers.dev"

func NewClient(cfg Config) (*Client, error) {
	u, err := parseOrigin(cfg.BaseURL)
	if err != nil {
		return nil, fmt.Errorf("invalid BaseURL: %w", err)
	}
	isLocalHTTP := u.Scheme == "http" && cfg.AllowLoopbackHTTP && isLoopbackHost(u.Hostname())
	if u.Scheme != "https" && !isLocalHTTP {
		return nil, errors.New("BaseURL must use HTTPS; HTTP is allowed only for explicitly enabled loopback hosts")
	}
	if strings.ContainsAny(cfg.Token, " \r\n\t") {
		return nil, errors.New("Token must be a raw bearer token without whitespace")
	}

	baseOrigin := normalizedOrigin(u)
	allowedOrigins := map[string]struct{}{canonicalWorkerOrigin: {}}
	for _, rawAllowed := range cfg.AllowedOrigins {
		allowed, err := parseOrigin(rawAllowed)
		if err != nil || allowed.Scheme != "https" {
			return nil, fmt.Errorf("AllowedOrigins entries must be absolute HTTPS origins: %q", rawAllowed)
		}
		allowedOrigins[normalizedOrigin(allowed)] = struct{}{}
	}
	if !isLocalHTTP {
		if _, ok := allowedOrigins[baseOrigin]; !ok {
			return nil, errors.New("BaseURL is not the canonical GLORIFIER Worker origin or an exact HTTPS origin listed in AllowedOrigins")
		}
	}

	client := &http.Client{Timeout: DefaultTimeout}
	if cfg.HTTPClient != nil {
		copyClient := *cfg.HTTPClient
		if copyClient.Timeout <= 0 {
			copyClient.Timeout = DefaultTimeout
		}
		client = &copyClient
	}
	client.CheckRedirect = func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	}
	return &Client{baseURL: strings.TrimRight(u.String(), "/"), token: cfg.Token, httpClient: client}, nil
}

func parseOrigin(raw string) (*url.URL, error) {
	raw = strings.TrimSpace(raw)
	u, err := url.Parse(raw)
	if err != nil || !u.IsAbs() || u.Hostname() == "" {
		return nil, errors.New("expected an absolute URL with a hostname")
	}
	if u.User != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" ||
		strings.Contains(raw, "#") || (u.Path != "" && u.Path != "/") {
		return nil, errors.New("expected an origin only; user info, path, query and fragment are prohibited")
	}
	return u, nil
}

func normalizedOrigin(u *url.URL) string {
	scheme := strings.ToLower(u.Scheme)
	host := strings.ToLower(u.Hostname())
	port := u.Port()
	if (scheme == "https" && port == "443") || (scheme == "http" && port == "80") {
		port = ""
	}
	if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	if port != "" {
		host += ":" + port
	}
	return scheme + "://" + host
}

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// SubmitTask never retries; callers must not assume a failed response means a
// task was not accepted because no idempotency key exists in the wire contract.
func (c *Client) SubmitTask(ctx context.Context, task TaskRequest, options CallOptions) (TaskResponse, ResponseMetadata, error) {
	if c.token == "" {
		return TaskResponse{}, ResponseMetadata{}, errors.New("a caller GLORIFIER API token is required to submit tasks")
	}
	if !utf8.ValidString(task.Task) || !utf8.ValidString(task.Purpose) || !utf8.ValidString(task.ActionClass) {
		return TaskResponse{}, ResponseMetadata{}, errors.New("task fields must be valid UTF-8")
	}
	if strings.TrimSpace(task.Task) == "" {
		return TaskResponse{}, ResponseMetadata{}, errors.New("task must not be empty")
	}
	if utf8.RuneCountInString(task.Task) > MaxTaskCharacters {
		return TaskResponse{}, ResponseMetadata{}, fmt.Errorf("task exceeds %d Unicode characters", MaxTaskCharacters)
	}
	if utf8.RuneCountInString(task.Purpose) > MaxPurposeCharacters {
		return TaskResponse{}, ResponseMetadata{}, fmt.Errorf("purpose exceeds %d Unicode characters", MaxPurposeCharacters)
	}
	if utf8.RuneCountInString(task.ActionClass) > MaxActionClassCharacters {
		return TaskResponse{}, ResponseMetadata{}, fmt.Errorf("action_class exceeds %d Unicode characters", MaxActionClassCharacters)
	}
	body, err := json.Marshal(task)
	if err != nil {
		return TaskResponse{}, ResponseMetadata{}, fmt.Errorf("encode task JSON: %w", err)
	}
	if int64(len(body)) > MaxTaskBodyBytes {
		return TaskResponse{}, ResponseMetadata{}, fmt.Errorf("encoded task body exceeds %d bytes", MaxTaskBodyBytes)
	}
	body, metadata, err := c.perform(ctx, http.MethodPost, "/api/neural/v1/tasks", body, true, options)
	if err != nil {
		return TaskResponse{}, metadata, err
	}
	if metadata.HTTPStatus != http.StatusOK && metadata.HTTPStatus != http.StatusAccepted {
		return TaskResponse{}, metadata, newAPIError(metadata, body)
	}
	var result TaskResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return TaskResponse{}, metadata, fmt.Errorf("decode Neural task response JSON: %w", err)
	}
	if result.Status == "" || result.Message == "" {
		return TaskResponse{}, metadata, errors.New("Neural task response is missing required status or message")
	}
	return result, metadata, nil
}

// Health performs a public health read and never forwards the configured token.
func (c *Client) Health(ctx context.Context, options CallOptions) (HealthResponse, ResponseMetadata, error) {
	body, metadata, err := c.perform(ctx, http.MethodGet, "/api/neural/health", nil, false, options)
	if err != nil {
		return HealthResponse{}, metadata, err
	}
	if metadata.HTTPStatus != http.StatusOK {
		return HealthResponse{}, metadata, newAPIError(metadata, body)
	}
	var result HealthResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return HealthResponse{}, metadata, fmt.Errorf("decode Neural health response JSON: %w", err)
	}
	return result, metadata, nil
}

// Readiness preserves HTTP 503 as a not-ready observation. Transport failures
// and other HTTP failures are returned as errors.
func (c *Client) Readiness(ctx context.Context, options CallOptions) (ReadinessResponse, ResponseMetadata, error) {
	body, metadata, err := c.perform(ctx, http.MethodGet, "/api/neural/ready", nil, false, options)
	if err != nil {
		return ReadinessResponse{}, metadata, err
	}
	if metadata.HTTPStatus != http.StatusOK && metadata.HTTPStatus != http.StatusServiceUnavailable {
		return ReadinessResponse{}, metadata, newAPIError(metadata, body)
	}
	if metadata.HTTPStatus == http.StatusServiceUnavailable {
		// The Worker also uses 503 for adapter/configuration failures. Preserve
		// those stable error codes instead of misreporting them as dependency
		// readiness observations.
		var envelope map[string]json.RawMessage
		if err := json.Unmarshal(body, &envelope); err != nil {
			return ReadinessResponse{}, metadata, fmt.Errorf("decode Neural readiness response JSON: %w", err)
		}
		var code string
		var ok *bool
		_ = json.Unmarshal(envelope["code"], &code)
		_ = json.Unmarshal(envelope["ok"], &ok)
		_, hasChecks := envelope["checks"]
		if code != "" || (ok != nil && !*ok) || !hasChecks {
			return ReadinessResponse{}, metadata, newAPIError(metadata, body)
		}
	}
	var result ReadinessResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return ReadinessResponse{}, metadata, fmt.Errorf("decode Neural readiness response JSON: %w", err)
	}
	if metadata.HTTPStatus == http.StatusServiceUnavailable && result.Checks == nil {
		return ReadinessResponse{}, metadata, newAPIError(metadata, body)
	}
	return result, metadata, nil
}

func (c *Client) perform(ctx context.Context, method, path string, body []byte, authorize bool, options CallOptions) ([]byte, ResponseMetadata, error) {
	if options.CorrelationID != "" && !uuidPattern.MatchString(options.CorrelationID) {
		return nil, ResponseMetadata{}, errors.New("CorrelationID must be a UUID")
	}
	var bodyReader io.Reader
	if body == nil {
		bodyReader = http.NoBody
	} else {
		bodyReader = bytes.NewReader(body)
	}
	request, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bodyReader)
	if err != nil {
		return nil, ResponseMetadata{}, fmt.Errorf("create GLORIFIER request: %w", err)
	}
	request.Header.Set("Accept", "application/json")
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if authorize {
		request.Header.Set("Authorization", "Bearer "+c.token)
	}
	if options.CorrelationID != "" {
		request.Header.Set("X-Correlation-ID", options.CorrelationID)
	}
	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, ResponseMetadata{}, fmt.Errorf("send GLORIFIER request: %w", err)
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, MaxResponseBodyBytes+1))
	if err != nil {
		return nil, ResponseMetadata{}, fmt.Errorf("read GLORIFIER response: %w", err)
	}
	metadata := ResponseMetadata{
		HTTPStatus: response.StatusCode,
		CorrelationID: response.Header.Get("X-Correlation-ID"),
		RetryAfter: response.Header.Get("Retry-After"),
	}
	if int64(len(responseBody)) > MaxResponseBodyBytes {
		return nil, metadata, fmt.Errorf("GLORIFIER response body exceeds %d bytes", MaxResponseBodyBytes)
	}
	return responseBody, metadata, nil
}

func newAPIError(metadata ResponseMetadata, body []byte) *APIError {
	result := &APIError{
		StatusCode: metadata.HTTPStatus,
		CorrelationID: metadata.CorrelationID,
		RetryAfter: metadata.RetryAfter,
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(body, &fields) == nil {
		_ = json.Unmarshal(fields["code"], &result.Code)
		_ = json.Unmarshal(fields["error"], &result.Message)
		if result.Message == "" {
			_ = json.Unmarshal(fields["message"], &result.Message)
		}
	}
	if result.Message == "" && result.Code == "" {
		result.Message = http.StatusText(metadata.HTTPStatus)
	}
	return result
}
