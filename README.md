# ibsng-suro

IBSng Branch E integration as an MCP server.

## Scope

This project targets only the IBSng Branch E JSON-RPC API documented at `ParspooyeshFanavar/ibsng-docs/json-rpc/E`.

The MCP layer exposes domain-oriented tools plus an optional raw JSON-RPC tool. It also exposes an IBSng E capability resource and workflow prompts that can be consumed by a higher-level AI system.

## Configuration

Copy `.env.example` to `.env` and set at least `IBSNG_URL` and `IBS_AUTH_PASS`, or provide `IBS_AUTH_SESSION` for an existing IBSng session.

The upstream sample client documents `http://127.0.0.1:1237` as its JSON-RPC endpoint and sends authentication parameters on each call when an existing session is not supplied.

## Run

```bash
npm install
npm run check
npm run dev
```

For remote MCP over Streamable HTTP:

```bash
npm run dev -- http
```

Endpoint: `http://127.0.0.1:3000/mcp` by default.

Set `MCP_AUTH_TOKEN` to protect the HTTP endpoint. Set `IBSNG_ENABLE_RAW_CALL=true` only when direct arbitrary method access is required.

## MCP surface

Tools currently include customer, user, balance and online-user operations that are directly grounded in the Branch E documentation, plus an optional `ibsng_raw_call` escape hatch.

Skills are represented as reusable workflow prompts in the `skills/` directory and can later be expanded into orchestrated agent workflows without changing the underlying IBSng transport.

## Architecture

```text
Higher-Level AI / Agent
        |
        | MCP
        v
   ibsng-suro
        |
   Domain Tools / Skills
        |
   IBSng JSON-RPC Client
        |
      IBSng E
```

Authentication, timeout handling, JSON parsing and IBSng errors are isolated in the client layer. The MCP layer never needs to know the raw HTTP authentication mechanics.
