import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { loadConfig } from './config.js';
import { IBSngClient } from './ibsng/client.js';
import { loadOpenRpcDocumentsSync, mergeMethods, methodDescription, paramsToZod, sanitizeToolName, type OpenRpcMethod } from './ibsng/openrpc.js';

const json = (value: unknown): string => JSON.stringify(value, null, 2);
const schemasRoot = path.resolve(process.cwd(), 'schemas/ibsng-e');

function registerGeneratedTools(server: McpServer, client: IBSngClient): { methodCount: number; modules: string[] } {
  const documents = loadOpenRpcDocumentsSync(schemasRoot);
  const methods = mergeMethods(documents);
  const used = new Set<string>();
  for (const method of methods) {
    const baseName = sanitizeToolName(method.name);
    let toolName = baseName;
    let n = 2;
    while (used.has(toolName)) toolName = `${baseName}_${n++}`;
    used.add(toolName);
    server.registerTool(
      toolName,
      {
        title: `IBSng E: ${method.name}`,
        description: methodDescription(method),
        inputSchema: paramsToZod(method)
      },
      async (params) => {
        const clean = Object.fromEntries(Object.entries(params as Record<string, unknown>).filter(([, value]) => value !== undefined));
        return { content: [{ type: 'text', text: json(await client.call({ method: method.name, params: clean })) }] };
      }
    );
  }
  return { methodCount: methods.length, modules: documents.map((document) => String(document.info?.title ?? 'unknown')) };
}

function registerSchemaResources(server: McpServer): void {
  for (const file of readdirSync(schemasRoot).filter((name) => name.endsWith('.json')).sort()) {
    const moduleName = file.slice(0, -'.json'.length);
    const uri = `ibsng://e/schema/${moduleName}`;
    server.registerResource(
      `ibsng-e-schema-${moduleName}`,
      uri,
      { title: `IBSng E schema: ${moduleName}`, description: `OpenRPC schema for IBSng E ${moduleName}.` },
      async () => ({ contents: [{ uri, mimeType: 'application/json', text: readFileSync(path.join(schemasRoot, file), 'utf8') }] })
    );
  }
}

export function createServer(): McpServer {
  const config = loadConfig();
  const server = new McpServer(
    { name: 'ibsng-suro', version: '0.2.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );
  const client = new IBSngClient();
  const registry = registerGeneratedTools(server, client);

  if (config.enableRawCall) {
    server.registerTool(
      'ibsng_raw_call',
      {
        title: 'Raw IBSng JSON-RPC call',
        description: 'Call a documented IBSng Branch E JSON-RPC method directly. Authentication is injected server-side.',
        inputSchema: z.object({
          method: z.string().min(1),
          params: z.record(z.string(), z.unknown()).default({})
        })
      },
      async ({ method, params }) => ({ content: [{ type: 'text', text: json(await client.call({ method, params })) }] })
    );
  }

  server.registerTool(
    'ibsng_health',
    {
      title: 'IBSng health check',
      description: 'Verify connectivity to the configured IBSng E JSON-RPC endpoint by calling the documented login.login operation.',
      inputSchema: z.object({ auth_type: z.enum(['ADMIN', 'NORMAL_USER', 'VOIP_USER']).optional() })
    },
    async ({ auth_type }) => {
      try {
        const type = auth_type ?? config.authType;
        if (config.authSession) return { content: [{ type: 'text', text: json(await client.call({ method: 'login.login', params: { login_auth_type: type, login_auth_name: config.authName, login_auth_pass: '***', create_session: false } })) }] };
        if (!config.authPass) throw new Error('IBS_AUTH_PASS or IBS_AUTH_SESSION is required');
        const result = await client.call({ method: 'login.login', params: { login_auth_type: type, login_auth_name: config.authName, login_auth_pass: config.authPass, create_session: false, auth_remoteaddr: config.authRemoteAddr } });
        return { content: [{ type: 'text', text: json({ ok: true, result }) }] };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: json({ ok: false, error: error instanceof Error ? error.message : String(error) }) }] };
      }
    }
  );

  server.registerResource(
    'ibsng-e-capabilities',
    'ibsng://e/capabilities',
    { title: 'IBSng E capabilities', description: 'Complete generated MCP registry information for IBSng E.' },
    async () => ({
      contents: [{
        uri: 'ibsng://e/capabilities',
        mimeType: 'application/json',
        text: JSON.stringify({ version: 'E', transport: 'JSON-RPC', generated_tools: registry.methodCount, modules: registry.modules, raw_call: config.enableRawCall }, null, 2)
      }]
    })
  );

  server.registerPrompt(
    'diagnose_customer',
    {
      title: 'Diagnose customer',
      description: 'Read-first IBSng E customer investigation workflow.',
      argsSchema: z.object({ customer: z.string() })
    },
    ({ customer }) => ({ messages: [{ role: 'user', content: { type: 'text', text: `Investigate IBSng E customer ${customer}. Resolve customer information first, then related user/account state, balances and online/session information. Do not mutate data unless explicitly requested.` } }] })
  );

  return server;
}
