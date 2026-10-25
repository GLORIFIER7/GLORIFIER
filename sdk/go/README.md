# GLORIFIER Go SDK (initial)

This module provides a small, dependency-free Go client for the versioned GLORIFIER Worker Neural API. The published HTTP/JSON contract remains the language-neutral boundary; this Go module is one client implementation, not a claim that every language or provider is supported.

## Usage

```go
package main

import (
    "context"
    "fmt"
    "os"

    "github.com/GLORIFIER7/GLORIFIER/sdk/go/neuralclient"
)

func main() {
    client, err := neuralclient.NewClient(neuralclient.Config{
        BaseURL: "https://glorifier.glorifier.workers.dev",
        Token:   os.Getenv("GLORIFIER_API_TOKEN"),
    })
    if err != nil {
        panic(err)
    }

    result, meta, err := client.SubmitTask(
        context.Background(),
        neuralclient.TaskRequest{
            Task: "Summarize the published interoperability contract",
        },
        neuralclient.CallOptions{},
    )
    if err != nil {
        panic(err)
    }
    fmt.Printf("%s (%d; correlation=%s)\n", result.Status, meta.HTTPStatus, meta.CorrelationID)
}
```

## Security behavior

- Production destinations must use HTTPS. HTTP is allowed only when explicitly opted in for loopback-only local development/tests.
- The canonical API origin is `https://glorifier.glorifier.workers.dev`; other production/staging origins must be explicitly listed in `AllowedOrigins` as exact HTTPS origins. A path, user info, query, or fragment is rejected.
- The caller's bearer token is attached only to task submissions for the allowlisted API origin. Public health/readiness calls do not forward it.
- Automatic redirects are disabled to prevent the HTTP client from forwarding credentials to a redirect target.
- The client enforces the documented 20,000-character task limit and 65,536-byte JSON request limit, bounds response bodies to 1 MiB, and uses a finite timeout.
- Error objects normalize status/code/message and correlation/retry metadata; raw response bodies are not retained.
- Task submission is not automatically retried because the current API contract does not specify an idempotency key. A failed response does not prove that a task was not accepted.
- The client does not load secrets from files, authorize financial or blockchain writes, or bypass GLORIFIER policy.

## Conformance

`neuralclient` tests use mocked HTTP servers only. `fixtures_test.go` loads the shared canonical JSON fixture document and checks Unicode, arbitrary-precision strings, null-vs-absent semantics, nested primitive types, and stable error identifiers. No production credentials or live Neural origin are required.

CI targets Go 1.26.x and 1.27.x. Passing that matrix will verify only those tested Go versions and mocked contract behavior; live provider readiness and production interoperability are separate evidence gates.
