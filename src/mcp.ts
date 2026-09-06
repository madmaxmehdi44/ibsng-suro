import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { loadConfig } from './config.js';
import { IBSngClient } from './ibsng/client.js';
import { expandMethods, loadOpenRpcDocumentsSync, methodDescription, methodVariantSuffix, paramsToZod, sanitizeToolName, type OpenRpcMethod } from './ibsng/openrpc.js';

const json = (value: unknown): string => JSON.stringify(value, null, 2);
const schemasRoot = path.resolve(process.cwd(), 'schemas/ibsng-e');
const LOGIN_METHODS = new Set(['login.login', 'login.webLogin']);

function toolNameForMethod(method: OpenRpcMethod, index: number, duplicateCount: number): string {
  const base = sanitizeToolName(method.name);
  return duplicateCount > 1 ? `${base}_${methodVariantSuffix(method, index)}` : base;
}

function registerGeneratedTools(server: McpServer, client: IBSngClient): { methodCount: number; exposedMethodCount: number; modules: string[]; toolNames: string[] } {
  const documents = loadOpenRpcDocumentsSync(schemasRoot);
  const methods = expandMethods(documents);
  const counts = new Map<string, number>();
  for (const method of methods) counts.set(method.name, (counts.get(method.name) ?? 0) + 1);

  const used = new Set<string>();
  const toolNames: string[] = [];
  methods.forEach((method, index) => {
    if (LOGIN_METHODS.has(method.name)) return;
    let toolName = toolNameForMethod(method, index, counts.get(method.name) ?? 1);
    let suffix = 2;
    while (used.has(toolName)) toolName = `${toolNameForMethod(method, index, counts.get(method.name) ?? 1)}_${suffix++}`;
    used.add(toolName);
    toolNames.push(toolName);
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
  });

  return {
    methodCount: methods.length,
    exposedMethodCount: methods.filter((method) => !LOGIN_METHODS.has(method.name)).length,
    modules: documents.map((document) => String(document.info?.title ?? 'unknown')),
    toolNames
  };
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

function registerSkillTools(server: McpServer, client: IBSngClient): void {
  server.registerTool(
    'ibsng_customer_diagnosis',
    {
      title: 'Customer diagnosis',
      description: 'Read-only IBSng E investigation. Resolves customer information and optionally related user/balance information without mutating data.',
      inputSchema: z.object({
        uid: z.string().default('').describe('Customer UID. Leave empty when using customer_id.'),
        customer_id: z.string().default('').describe('Customer ID. Leave empty when using uid.'),
        user_id: z.string().regex(/^\d+$/).optional().describe('Optional related user ID for direct user inspection.'),
        balance_id: z.number().int().optional().describe('Optional balance ID for direct balance inspection.')
      })
    },
    async ({ uid, customer_id, user_id, balance_id }) => {
      const evidence: Record<string, unknown> = {};
      evidence.customer = await client.call({ method: 'customer.getCustomer', params: { uid, customer_id } });
      if (user_id) evidence.user = await client.call({ method: 'user.getUserInfo', params: { user_id } });
      if (balance_id !== undefined) evidence.balance = await client.call({ method: 'balance.getBalanceInfo', params: { balance_id } });
      return { content: [{ type: 'text', text: json({ skill: 'customer_diagnosis', read_only: true, evidence }) }] };
    }
  );
}

export function createServer(): McpServer {
  const config = loadConfig();
  const server = new McpServer(
    { name: 'ibsng-suro', version: '0.2.2' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );
  const client = new IBSngClient();
  const registry = registerGeneratedTools(server, client);
  registerSchemaResources(server);
  registerSkillTools(server, client);

  if (config.enableRawCall) {
    server.registerTool(
      'ibsng_raw_call',
      {
        title: 'Raw IBSng JSON-RPC call',
        description: 'Call a documented IBSng Branch E JSON-RPC method directly. Authentication is injected server-side.',
        inputSchema: z.object({ method: z.string().min(1), params: z.record(z.string(), z.unknown()).default({}) })
      },
      async ({ method, params }) => ({ content: [{ type: 'text', text: json(await client.call({ method, params })) }] })
    );
  }

  server.registerTool(
    'ibsng_health',
    {
      title: 'IBSng health check',
      description: 'Authenticate against the configured IBSng E JSON-RPC endpoint using server-side credentials.',
      inputSchema: z.object({})
    },
    async () => {
      try {
        const result = await client.call({ method: 'login.login', params: {
          login_auth_type: config.authType,
          login_auth_name: config.authName,
          login_auth_pass: config.authPass,
          create_session: false,
          auth_remoteaddr: config.authRemoteAddr
        }});
        return { content: [{ type: 'text', text: json({ ok: true, result }) }] };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: json({ ok: false, error: error instanceof Error ? error.message : String(error) }) }] };
      }
    }
  );

  server.registerResource(
    'ibsng-e-capabilities',
    'ibsng://e/capabilities',
    { title: 'IBSng E capabilities', description: 'Generated MCP registry information for IBSng E.' },
    async () => ({
      contents: [{
        uri: 'ibsng://e/capabilities',
        mimeType: 'application/json',
        text: JSON.stringify({
          version: 'E',
          transport: 'JSON-RPC',
          documented_methods: registry.methodCount,
          exposed_methods: registry.exposedMethodCount,
          excluded_methods: [...LOGIN_METHODS],
          modules: registry.modules,
          generated_tools: registry.toolNames,
          raw_call: config.enableRawCall
        }, null, 2)
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
    ({ customer }) => ({ messages: [{ role: 'user', content: { type: 'text', text: `Investigate IBSng E customer ${customer}. Start read-only; use customer_diagnosis and generated read operations. Do not mutate data unless explicitly requested.` } }] })
  );

  return server;
}
