# Binance Agentic MCP

GLORIFIER's Binance integration uses Binance's existing Agentic MCP server rather than reimplementing Binance APIs.

## Endpoint

https://agent.binance.com/mcp/agentic

Transport: Streamable HTTP.

## Owner-provided Agent ID reference

- Agent ID: https://web3.binance.com/agent-id/glorifier?src=user_share
- Machine-readable reference: `integrations/binance-agentic-mcp/agent-id.json`
- Status: `PARTIALLY_VERIFIED`. The URL was supplied by the owner; the public page's account association, authenticated MCP session, Agentic Wallet session, and wallet ownership are not verified by repository metadata.
- Previously supplied wallet reference: `0x393c19Ff12e1624181fBF1938b80982b9dfC4277` on Ethereum Mainnet (chain ID `1`). This is a reference only, not proof of current connection or control.

## Complete verification safely

1. Open the Agent ID link while signed in to Binance and inspect the identity/account association displayed by Binance. A URL alone is not proof.
2. In a supported MCP client, configure the endpoint above and complete Binance's provider authorization flow. Binance's official instructions say access is user-authorized and scoped; choose the minimum scopes. Keep trading and transfer scopes off unless separately reviewed and approved.
3. Verify connection from the MCP client using its supported connection/status indicator. A public market-data response alone does not prove an authenticated account session.
4. Verify wallet control separately through a provider-supported ownership proof or signed challenge, if available. Never provide a seed phrase/private key, and do not sign an arbitrary message or transaction just to mark this checklist complete.
5. Only after evidence is observed should the registry status and evidence fields be changed. Record the method, timestamp, and non-secret result; never commit OAuth tokens, cookies, pairing codes, auth codes, or secrets.

Official references:
- [Binance MCP Server FAQ](https://www.binance.com/en-PH/support/faq/detail/7a6e676e36fb455d96478932cb12d9f3)
- [Binance Agentic Wallet developer documentation](https://developers.binance.com/en/docs/products/agentic-wallet/welcome)
- [Binance Agentic Wallet authentication guide](https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-agentic-wallet/references/authentication.md)

## Security model

- Authentication is completed through Binance's supported provider flow; repository files cannot authenticate the user.
- No Binance API keys, secrets, OAuth tokens, pairing codes, or private keys belong in this repository.
- Start with read-only access and minimum scopes.
- Trading, order cancellation, and transfers require user-controlled permissions and explicit human confirmation under GLORIFIER governance.
- Binance's MCP integration does not provide an external withdrawal scope; transfers within the Agentic sub-account may still be possible if enabled.
- Funding an Agentic sub-account is a user-controlled Binance step.

## Plugin source

The portable plugin source is under `integrations/binance-agentic-mcp/`.

The Plugin Creator can package this directory as a private plugin. Creating a plugin does not authenticate Binance or establish wallet ownership; those steps require the provider/host flow and separate evidence.

## Verification states

GLORIFIER should report `FULLY VERIFIED`, `VERIFIED`, `PARTIALLY VERIFIED`, `NOT VERIFIED`, `DEGRADED`, or `NOT OBSERVABLE` based on authoritative evidence. Never fabricate a Binance execution receipt or claim ownership from a public address alone.
