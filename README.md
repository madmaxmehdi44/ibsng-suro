# ibsng-suro

IBSng Branch E integration as an MCP server.

## Scope

This project targets only the IBSng Branch E JSON-RPC API documented at `ParspooyeshFanavar/ibsng-docs/json-rpc/E`.

The MCP server builds its callable surface from the upstream OpenRPC documents at build/development time. This keeps the tool schemas synchronized with the documented Branch E API instead of manually duplicating every method in source code.

## Architecture

```text
Higher-Level AI / Agent
        |
        | MCP
        v
   ibsng-suro
        |
   +----+----------------------+
   |                           |
Tools / Resources           Skills
   |                           |
   +-------------+-------------+
                 |
        IBSng E JSON-RPC client
                 |
               IBSng E
```

## Configuration

Copy `.env.example` to `.env` and set `IBSNG_URL` plus either `IBS_AUTH_PASS` or `IBS_AUTH_SESSION`.

The upstream sample client documents `http://127.0.0.1:1237` as the JSON-RPC endpoint and sends authentication parameters on each call when an existing session is not supplied.

## Run

```bash
npm install
npm run check
npm run dev
```

`npm run dev`, `npm run check` and `npm run build` synchronize the complete Branch E OpenRPC documentation before starting/type-checking/building.

For remote MCP over Streamable HTTP:

```bash
npm run dev -- http
```

Endpoint: `http://127.0.0.1:3000/mcp` by default.

Set `MCP_AUTH_TOKEN` to protect the HTTP endpoint.

Set `IBSNG_ENABLE_RAW_CALL=true` only when direct raw JSON-RPC access is explicitly required.

## MCP surface

Every documented non-login IBSng E JSON-RPC method is exposed as a generated MCP tool using the corresponding OpenRPC parameter schema. Tool names follow this form:

```text
ibsng_rpc_<ibsng_method_name>
```

For example:

```text
ibsng_rpc_customer_getCustomer
ibsng_rpc_customer_searchCustomer
ibsng_rpc_user_getUserInfo
ibsng_rpc_balance_getBalanceInfo
```

When the E documentation contains multiple variants of the same method, the generated tool name includes an auth/permission suffix so distinct schemas are not merged incorrectly.

Authentication methods are intentionally not exposed as generic tools so credentials are never delegated to the higher-level AI. `ibsng_health` validates connectivity with server-side credentials instead.

Every Branch E JSON document is also available as an MCP resource under:

```text
ibsng://e/schema/<module>
```

The resource `ibsng://e/capabilities` reports the generated method count and module set.

The optional `ibsng_raw_call` tool is an administrative escape hatch and is disabled by default.

## Skills

Reusable workflow definitions live under `skills/`. The current implementation includes:

- `customer-diagnosis`

Additional domain workflows such as account review, session diagnosis and billing review can be added on top of the same generated tool registry without changing the IBSng transport layer.

## Development

```bash
npm run sync:docs
npm run check
npm run build
```

The documentation source is the public IBSng E OpenRPC repository. The generated files are written to `schemas/ibsng-e/` and consumed by the MCP registry.
