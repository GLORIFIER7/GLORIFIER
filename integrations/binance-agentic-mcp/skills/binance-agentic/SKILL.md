---
name: binance-agentic
description: Use when GLORIFIER needs Binance Agentic MCP market/account data or a governed Binance action.
---

# GLORIFIER Binance Agentic MCP

Use the verified Binance Agentic MCP endpoint from `mcp.json`. Authentication and OAuth consent must be completed by the user through Binance's provider flow. Never request or store credentials, API secrets, OAuth tokens, or private keys in chat or plugin files.

Default to read-only observation. Before any action that can trade, cancel an order, transfer funds, or change financial state: verify current evidence, apply GLORIFIER policy and authority checks, state the exact intended action, obtain explicit human confirmation, execute only after confirmation, and record the authoritative receipt when available.

Never claim success without authoritative Binance evidence. If evidence is unavailable, mark it `NOT VERIFIED`.

Do not infer withdrawal capability; Binance Agentic has no withdrawal scope. Do not move funds from the main Binance account into the Agentic sub-account on the user's behalf. Do not bypass OAuth, permission, confirmation, or emergency-stop controls.
