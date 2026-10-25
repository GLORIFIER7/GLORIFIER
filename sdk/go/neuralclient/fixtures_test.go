package neuralclient

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

type fixtureDocument struct {
	SchemaVersion string `json:"schemaVersion"`
	Encoding string `json:"encoding"`
	Rules []string `json:"rules"`
	Cases []fixtureCase `json:"cases"`
}

type fixtureCase struct {
	ID string `json:"id"`
	Purpose string `json:"purpose"`
	AbsentFields []string `json:"absentFields"`
	Payload map[string]any `json:"payload"`
}

func repositoryRoot(t *testing.T) string {
	t.Helper()
	_, sourceFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot determine source path for fixture discovery")
	}
	for candidate := filepath.Dir(sourceFile); ; candidate = filepath.Dir(candidate) {
		if fileExists(filepath.Join(candidate, "package.json")) &&
			fileExists(filepath.Join(candidate, "docs", "architecture", "language-neutral-interoperability.md")) {
			return candidate
		}
		parent := filepath.Dir(candidate)
		if parent == candidate {
			t.Fatalf("repository root not found from %s", sourceFile)
		}
	}
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func loadSharedFixtures(t *testing.T) fixtureDocument {
	t.Helper()
	path := filepath.Join(repositoryRoot(t), "docs", "architecture", "interoperability-contract-fixtures.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read canonical interoperability fixtures at %s: %v", path, err)
	}
	var document fixtureDocument
	if err := json.Unmarshal(raw, &document); err != nil {
		t.Fatalf("decode canonical interoperability fixtures at %s: %v", path, err)
	}
	if document.SchemaVersion != "1.0.0" || document.Encoding != "UTF-8" || len(document.Rules) == 0 || len(document.Cases) == 0 {
		t.Fatalf("invalid fixture metadata: version=%q rules=%d cases=%d", document.SchemaVersion, len(document.Rules), len(document.Cases))
	}
	seen := make(map[string]struct{}, len(document.Cases))
	for _, testCase := range document.Cases {
		if testCase.ID == "" {
			t.Fatal("fixture case id must be non-empty")
		}
		if _, exists := seen[testCase.ID]; exists {
			t.Fatalf("duplicate interoperability fixture case id %q", testCase.ID)
		}
		seen[testCase.ID] = struct{}{}
	}
	return document
}

func TestSharedFixturesPreserveCrossLanguageJSONSemantics(t *testing.T) {
	document := loadSharedFixtures(t)
	cases := make(map[string]fixtureCase, len(document.Cases))
	for _, testCase := range document.Cases {
		cases[testCase.ID] = testCase
	}

	t.Run("unicode round trip", func(t *testing.T) {
		payload := cases["unicode-round-trip"].Payload
		raw, err := json.Marshal(payload)
		if err != nil { t.Fatal(err) }
		var decoded map[string]any
		if err := json.Unmarshal(raw, &decoded); err != nil { t.Fatal(err) }
		if decoded["message"] != payload["message"] {
			t.Fatalf("Unicode message changed: got %#v, want %#v", decoded["message"], payload["message"])
		}
	})

	t.Run("arbitrary precision quantity remains string", func(t *testing.T) {
		payload := cases["large-quantity-string"].Payload
		quantity, ok := payload["quantity"].(string)
		if !ok || quantity == "" { t.Fatalf("quantity must be a string, got %#v", payload["quantity"]) }
		raw, err := json.Marshal(payload)
		if err != nil { t.Fatal(err) }
		var decoded map[string]any
		if err := json.Unmarshal(raw, &decoded); err != nil { t.Fatal(err) }
		if decoded["quantity"] != quantity { t.Fatalf("quantity changed: got %#v", decoded["quantity"]) }
	})

	t.Run("null differs from absent", func(t *testing.T) {
		payload := cases["null-versus-absent"].Payload
		if value, exists := payload["presentNull"]; !exists || value != nil {
			t.Fatalf("presentNull must exist and be null, got %#v (exists=%t)", value, exists)
		}
		for _, field := range cases["null-versus-absent"].AbsentFields {
			if _, exists := payload[field]; exists { t.Fatalf("%s must not be present", field) }
		}
		if payload["emptyString"] != "" { t.Fatalf("emptyString changed: %#v", payload["emptyString"]) }
	})

	t.Run("nested collections retain primitive types", func(t *testing.T) {
		items, ok := cases["nested-collections"].Payload["items"].([]any)
		if !ok || len(items) != 2 { t.Fatalf("unexpected items shape: %#v", cases["nested-collections"].Payload["items"]) }
		first, ok := items[0].(map[string]any)
		if !ok || first["enabled"] != true || first["count"] != float64(0) {
			t.Fatalf("first nested item changed type/value: %#v", items[0])
		}
		second, ok := items[1].(map[string]any)
		if !ok || second["enabled"] != false || second["count"] != float64(2) {
			t.Fatalf("second nested item changed type/value: %#v", items[1])
		}
	})

	t.Run("error code and status remain stable", func(t *testing.T) {
		errorPayload := cases["stable-error-envelope"].Payload
		if errorPayload["ok"] != false || errorPayload["code"] != "REQUEST_BODY_TOO_LARGE" ||
			errorPayload["status"] != "error" {
			t.Fatalf("stable error identifiers changed: %#v", errorPayload)
		}
		if _, ok := errorPayload["error"].(string); !ok {
			t.Fatalf("error message must be a string: %#v", errorPayload["error"])
		}
	})
}
