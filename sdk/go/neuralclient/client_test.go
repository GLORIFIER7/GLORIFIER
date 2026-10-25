package neuralclient

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func testClient(t *testing.T, server *httptest.Server, token string) *Client {
	t.Helper()
	client, err := NewClient(Config{BaseURL: server.URL, Token: token, HTTPClient: server.Client(), AllowLoopbackHTTP: true})
	if err != nil { t.Fatalf("NewClient: %v", err) }
	return client
}

func TestNewClientRequiresHTTPSAndExactOriginAllowlist(t *testing.T) {
	cases := []struct {
		name string
		url string
		allowedOrigins []string
		allowLoopbackHTTP bool
		wantErr bool
	}{
		{name: "canonical Worker origin accepted", url: "https://glorifier.glorifier.workers.dev"},
		{name: "exact staging origin allowlisted", url: "https://staging.example.com", allowedOrigins: []string{"https://staging.example.com"}},
		{name: "unallowlisted HTTPS rejected", url: "https://example.com", wantErr: true},
		{name: "remote HTTP rejected", url: "http://example.com", allowedOrigins: []string{"http://example.com"}, allowLoopbackHTTP: true, wantErr: true},
		{name: "loopback HTTP opt in", url: "http://127.0.0.1:3000", allowLoopbackHTTP: true},
		{name: "loopback HTTP without opt in", url: "http://127.0.0.1:3000", wantErr: true},
		{name: "userinfo rejected", url: "https://user:pass@example.com", allowedOrigins: []string{"https://example.com"}, wantErr: true},
		{name: "path rejected", url: "https://example.com/path", allowedOrigins: []string{"https://example.com"}, wantErr: true},
		{name: "query rejected", url: "https://example.com?token=secret", allowedOrigins: []string{"https://example.com"}, wantErr: true},
		{name: "empty query delimiter rejected", url: "https://example.com?", allowedOrigins: []string{"https://example.com"}, wantErr: true},
		{name: "empty fragment delimiter rejected", url: "https://example.com#", allowedOrigins: []string{"https://example.com"}, wantErr: true},
		{name: "non-origin allowlist entry rejected", url: "https://staging.example.com", allowedOrigins: []string{"https://staging.example.com/path"}, wantErr: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := NewClient(Config{BaseURL: tc.url, AllowedOrigins: tc.allowedOrigins, AllowLoopbackHTTP: tc.allowLoopbackHTTP})
			if (err != nil) != tc.wantErr { t.Fatalf("NewClient error = %v, wantErr %t", err, tc.wantErr) }
		})
	}
}

func TestNewClientAddsDefaultTimeoutToCustomHTTPClient(t *testing.T) {
	customClient := &http.Client{}
	client, err := NewClient(Config{
		BaseURL: "https://glorifier.glorifier.workers.dev",
		HTTPClient: customClient,
	})
	if err != nil { t.Fatalf("NewClient: %v", err) }
	if client.httpClient.Timeout != DefaultTimeout {
		t.Fatalf("custom client timeout = %s, want %s", client.httpClient.Timeout, DefaultTimeout)
	}
	// NewClient copies the caller's client; it must not mutate it in place.
	if customClient.Timeout != 0 {
		t.Fatalf("NewClient mutated caller HTTP client timeout to %s", customClient.Timeout)
	}
}

func TestSubmitTaskUsesCallerTokenAndCorrelationID(t *testing.T) {
	const token = "caller-scoped-test-token"
	const correlationID = "123e4567-e89b-42d3-a456-426614174000"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/neural/v1/tasks" { t.Errorf("unexpected request %s %s", r.Method, r.URL.Path) }
		if got := r.Header.Get("Authorization"); got != "Bearer "+token { t.Errorf("unexpected Authorization header %q", got) }
		if got := r.Header.Get("Content-Type"); got != "application/json" { t.Errorf("Content-Type = %q", got) }
		if got := r.Header.Get("X-Correlation-ID"); got != correlationID { t.Errorf("X-Correlation-ID = %q", got) }
		var request TaskRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil { t.Errorf("decode request: %v", err) }
		if request.Task != "Inspect 🌐 architecture" { t.Errorf("task payload changed: %q", request.Task) }
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Correlation-ID", correlationID)
		w.WriteHeader(http.StatusAccepted)
		_, _ = fmt.Fprint(w, `{"status":"PARTIALLY VERIFIED","provider":"test-mock","result":"ok","evidence":["mocked test"],"message":"accepted"}`)
	}))
	defer server.Close()

	client := testClient(t, server, token)
	result, metadata, err := client.SubmitTask(context.Background(), TaskRequest{Task: "Inspect 🌐 architecture"}, CallOptions{CorrelationID: correlationID})
	if err != nil { t.Fatalf("SubmitTask: %v", err) }
	if metadata.HTTPStatus != http.StatusAccepted || metadata.CorrelationID != correlationID { t.Fatalf("unexpected metadata: %#v", metadata) }
	if result.Status != "PARTIALLY VERIFIED" || result.Message != "accepted" || result.Provider == nil || *result.Provider != "test-mock" {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestHealthDoesNotForwardConfiguredToken(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/neural/health" { t.Errorf("unexpected path: %s", r.URL.Path) }
		if got := r.Header.Get("Authorization"); got != "" { t.Errorf("health leaked Authorization header: %q", got) }
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(w, `{"status":"PARTIALLY VERIFIED","service":"glorifier-neural","checks":{"process":"VERIFIED"}}`)
	}))
	defer server.Close()
	result, metadata, err := testClient(t, server, "configured-but-not-forwarded").Health(context.Background(), CallOptions{})
	if err != nil { t.Fatalf("Health: %v", err) }
	if metadata.HTTPStatus != http.StatusOK || result.Service != "glorifier-neural" { t.Fatalf("unexpected health result: %#v %#v", result, metadata) }
}

func TestReadinessPreservesHTTP503AsNotReadyObservation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Correlation-ID", "123e4567-e89b-42d3-a456-426614174000")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = fmt.Fprint(w, `{"status":"NOT READY","checks":{"providers":"NOT VERIFIED","database":"NOT VERIFIED"},"message":"dependencies not ready"}`)
	}))
	defer server.Close()
	result, metadata, err := testClient(t, server, "").Readiness(context.Background(), CallOptions{})
	if err != nil { t.Fatalf("Readiness: %v", err) }
	if metadata.HTTPStatus != http.StatusServiceUnavailable || result.Status != "NOT READY" { t.Fatalf("unexpected readiness result: %#v %#v", result, metadata) }
}
func TestReadinessSurfacesWorkerOriginConfigurationErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Correlation-ID", "123e4567-e89b-42d3-a456-426614174000")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = fmt.Fprint(w, `{"ok":false,"status":"unavailable","code":"NEURAL_ORIGIN_NOT_ALLOWLISTED","error":"Neural origin is not allowlisted"}`)
	}))
	defer server.Close()
	_, metadata, err := testClient(t, server, "").Readiness(context.Background(), CallOptions{})
	apiError, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected adapter configuration error, got %T (%v)", err, err)
	}
	if metadata.HTTPStatus != http.StatusServiceUnavailable || apiError.Code != "NEURAL_ORIGIN_NOT_ALLOWLISTED" {
		t.Fatalf("adapter error code/status lost: metadata=%#v error=%#v", metadata, apiError)
	}
	if apiError.Message != "Neural origin is not allowlisted" {
		t.Fatalf("adapter error message lost: %#v", apiError)
	}
}



func TestSubmissionNeverFollowsRedirectOrForwardsToken(t *testing.T) {
	var redirectedRequests atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { redirectedRequests.Add(1) }))
	defer target.Close()
	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, target.URL+"/capture", http.StatusFound) }))
	defer source.Close()
	_, metadata, err := testClient(t, source, "secret-test-token").SubmitTask(context.Background(), TaskRequest{Task: "read only"}, CallOptions{})
	if err == nil { t.Fatal("expected redirect to be returned as an error") }
	if metadata.HTTPStatus != http.StatusFound { t.Fatalf("HTTP status = %d, want 302", metadata.HTTPStatus) }
	if redirectedRequests.Load() != 0 { t.Fatalf("client followed redirect %d times", redirectedRequests.Load()) }
	if _, ok := err.(*APIError); !ok { t.Fatalf("error type = %T, want *APIError", err) }
}

func TestRejectsOversizedUTF8BodyBeforeNetworkCall(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1) }))
	defer server.Close()
	task := strings.Repeat("🌐", 17000)
	_, _, err := testClient(t, server, "caller-token").SubmitTask(context.Background(), TaskRequest{Task: task}, CallOptions{})
	if err == nil || !strings.Contains(err.Error(), fmt.Sprintf("exceeds %d bytes", MaxTaskBodyBytes)) { t.Fatalf("expected bounded body error, got %v", err) }
	if calls.Load() != 0 { t.Fatalf("oversized body reached network %d times", calls.Load()) }
}

func TestRejectsMissingTokenAndInvalidCorrelationID(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1) }))
	defer server.Close()
	client := testClient(t, server, "")
	if _, _, err := client.SubmitTask(context.Background(), TaskRequest{Task: "hello"}, CallOptions{}); err == nil { t.Fatal("expected missing token to fail") }
	client = testClient(t, server, "caller-token")
	if _, _, err := client.SubmitTask(context.Background(), TaskRequest{Task: "hello"}, CallOptions{CorrelationID: "invalid"}); err == nil { t.Fatal("expected invalid correlation ID to fail") }
	if calls.Load() != 0 { t.Fatalf("invalid request reached network %d times", calls.Load()) }
}

func TestRejectsOversizedResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
		_, _ = fmt.Fprint(w, strings.Repeat("x", int(MaxResponseBodyBytes+32)))
	}))
	defer server.Close()
	_, _, err := testClient(t, server, "caller-token").SubmitTask(context.Background(), TaskRequest{Task: "hello"}, CallOptions{})
	if err == nil || !strings.Contains(err.Error(), "response body exceeds") { t.Fatalf("expected bounded response error, got %v", err) }
}

func TestAPIErrorUsesStableCodeWithoutRawBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Retry-After", "7")
		w.Header().Set("X-Correlation-ID", "123e4567-e89b-42d3-a456-426614174000")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = fmt.Fprint(w, `{"code":"RATE_LIMITED","error":"try again","token":"never include raw body"}`)
	}))
	defer server.Close()
	_, metadata, err := testClient(t, server, "caller-token").SubmitTask(context.Background(), TaskRequest{Task: "hello"}, CallOptions{})
	apiError, ok := err.(*APIError)
	if !ok { t.Fatalf("error type = %T, want *APIError (%v)", err, err) }
	if apiError.StatusCode != http.StatusTooManyRequests || apiError.Code != "RATE_LIMITED" || apiError.Message != "try again" {
		t.Fatalf("unexpected normalized API error: %#v", apiError)
	}
	if metadata.RetryAfter != "7" || apiError.CorrelationID == "" || apiError.RetryAfter != "7" {
		t.Fatalf("correlation/retry metadata missing: %#v %#v", metadata, apiError)
	}
	if strings.Contains(apiError.Error(), "never include raw body") { t.Fatal("APIError leaked raw response fields") }
}

func TestContextDeadlineBoundsRequest(t *testing.T) {
	started := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(started)
		// Keep the handler bounded but slower than the test client's deadline.
		// The test asserts the client-side deadline contract, not whether an HTTP
		// server observes disconnect cancellation at a particular instant.
		time.Sleep(300 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_, _ = fmt.Fprint(w, `{"status":"PARTIALLY VERIFIED","message":"late response"}`)
	}))
	defer server.Close()
	client := testClient(t, server, "caller-token")
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	errCh := make(chan error, 1)
	go func() {
		_, _, err := client.SubmitTask(ctx, TaskRequest{Task: "hello"}, CallOptions{})
		errCh <- err
	}()
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("request did not reach test server")
	}
	err := <-errCh
	if err == nil {
		t.Fatal("expected client-side context deadline to stop the request")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "deadline") && !strings.Contains(strings.ToLower(err.Error()), "canceled") {
		t.Fatalf("expected context deadline/cancellation error, got %v", err)
	}
}
