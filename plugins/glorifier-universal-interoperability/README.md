# GLORIFIER Universal Interoperability Plugin

A portable ChatGPT/Codex plugin package for evidence-first discovery, normalization, conformance planning, and governed integration design across plugins, MCP servers, A2A agents, AI providers, HTTP/OpenAPI services, language SDKs, databases, and developer tools.

## Scope

This initial release is **skills-only**. It helps users inventory integrations and prepare reviewable implementation plans. It does not itself connect to every service, authenticate external accounts, expose an MCP server, or grant runtime access to tools. Actual connectivity depends on separately configured host tools, authorized credentials, supported protocols, and tested adapters.

## Package contents

- `plugin.json`: portable Agent Plugins manifest.
- `.codex-plugin/plugin.json`: ChatGPT/Codex compatibility manifest.
- `skills/universal-interoperability/SKILL.md`: discovery, capability normalization, protocol mapping, safety, and verification workflow.
- `skills/host-workspace-operator/SKILL.md`: portable workspace-operation policy for repository/file tasks.
- `schemas/integration-descriptor.schema.json`: JSON Schema for normalized integration records.
- `assets/`: product-specific light/dark logo and compact square icon.

## Local validation

Run the dependency-free package contract checks with Node.js 22 or newer:

```sh
node plugins/glorifier-universal-interoperability/tests/validate-package.mjs
```

The repository workflow `.github/workflows/plugin-interoperability.yml` runs these structural checks on relevant pull-request changes and on pushes to this feature branch. These checks validate package structure and selected safety invariants; they do not replace the official Plugin Autopilot validator, a clean-host install, runtime connectivity tests, or provider-specific conformance tests.

## Verification vocabulary

Use `VERIFIED`, `PARTIALLY VERIFIED`, `NOT VERIFIED`, `DEGRADED`, or `NOT OBSERVABLE`. Never infer that discovery means connectivity, that configuration means authentication, or that a passing mock test proves live compatibility.

## Safety

Read-only discovery is the default. Never put secrets in manifests, schemas, logs, or evidence. Do not merge, deploy, spend, sign, transfer, mint, or perform destructive actions without explicit authorization and required human approval.

## Repository

https://github.com/GLORIFIER7/GLORIFIER

## Status

Package source scaffolded for review. It has not yet been run through the Plugin Autopilot validator, packaged twice for determinism, installed in a clean host, submitted, approved, or published.
