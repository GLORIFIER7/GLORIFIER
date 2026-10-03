# Binance Agentic MCP

GLORIFIER's Binance integration uses Binance's existing Agentic MCP server rather than reimplementing Binance APIs.

## Endpoint

https://agent.binance.com/mcp/agentic

Transport: Streamable HTTP.

## Security model

- OAuth/authentication is completed through the Binance provider flow.
- No Binance API keys, secrets, OAuth tokens, or private keys belong in this repository.
- Start with read-only market/account access.
- Trading, order cancellation, and transfers remain subject to explicit human confirmation and GLORIFIER governance.
- Binance Agentic does not expose a withdrawal scope.
- Funding the Agentic sub-account is a user-controlled Binance step.

## Plugin source

The portable plugin source is under `integrations/binance-agentic-mcp/`.

The Plugin Creator can package this directory as a private plugin. Creating the plugin does not authenticate Binance or deploy the MCP server; those steps happen through the provider/host connection flow.

## Verification states

GLORIFIER should report `FULLY VERIFIED`, `VERIFIED`, `PARTIALLY VERIFIED`, `NOT VERIFIED`, `DEGRADED`, or `NOT OBSERVABLE` based on authoritative evidence. Never fabricate a Binance execution receipt.
