import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { loadConfig } from './config.js';
import { IBSngClient } from './ibsng/client.js';

const json = (value: unknown): string => JSON.stringify(value, null, 2);

export function createServer(): McpServer {
  const config = loadConfig();
  const server = new McpServer(
    {
      name: 'ibsng-suro',
      version: '0.1.0'
    },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  const client = new IBSngClient();

  if (config.enableRawCall) {
    server.registerTool(
      'ibsng_raw_call',
      {
        title: 'Raw IBSng JSON-RPC call',
        description: 'Call a documented IBSng Branch E JSON-RPC method directly. Authentication parameters are injected by the server.',
        inputSchema: z.object({
          method: z.string().min(1).describe('Exact IBSng Branch E method name'),
          params: z.record(z.string(), z.unknown()).default({}).describe('Method parameters excluding authentication fields')
        })
      },
      async ({ method, params }) => ({ content: [{ type: 'text', text: json(await client.call({ method, params })) }] })
    );
  }

  server.registerTool(
    'ibsng_get_customer',
    {
      title: 'Get customer',
      description: 'Get an IBSng E customer by UID or customer ID.',
      inputSchema: z.object({ uid: z.string().default(''), customer_id: z.string().default('') })
    },
    async ({ uid, customer_id }) => ({ content: [{ type: 'text', text: json(await client.call({ method: 'customer.getCustomer', params: { uid, customer_id } })) }] })
  );

  server.registerTool(
    'ibsng_add_customer',
    {
      title: 'Add customer',
      description: 'Create a customer in IBSng E.',
      inputSchema: z.object({
        uid: z.string().default(''), customer_name: z.string(), isp_name: z.string(), address: z.string(),
        mobile_number: z.string(), phone_number: z.string(), email: z.string(), comment: z.string()
      })
    },
    async (args) => ({ content: [{ type: 'text', text: json(await client.call({ method: 'customer.addNewCustomer', params: args })) }] })
  );

  server.registerTool(
    'ibsng_update_customer',
    {
      title: 'Update customer',
      description: 'Update an IBSng E customer.',
      inputSchema: z.object({
        customer_id: z.number().int().optional(), uid: z.string().default(''), customer_name: z.string(),
        isp_name: z.string(), address: z.string(), mobile_number: z.string(), phone_number: z.string(),
        email: z.string(), comment: z.string()
      })
    },
    async (args) => ({ content: [{ type: 'text', text: json(await client.call({ method: 'customer.updateCustomer', params: args })) }] })
  );

  server.registerTool(
    'ibsng_search_customers',
    {
      title: 'Search customers',
      description: 'Search IBSng E customers with pagination and sorting.',
      inputSchema: z.object({
        conds: z.record(z.string(), z.unknown()).default({}),
        sort_by: z.enum(['customer_name', 'customer_id']),
        desc: z.boolean().default(false),
        from: z.number().int().nonnegative().default(0),
        to: z.number().int().nonnegative().default(100)
      })
    },
    async ({ from, ...args }) => ({ content: [{ type: 'text', text: json(await client.call({ method: 'customer.searchCustomer', params: { ...args, _from: from } })) }] })
  );

  server.registerTool(
    'ibsng_delete_customer',
    {
      title: 'Delete customer',
      description: 'Delete an IBSng E customer by UID or customer ID.',
      inputSchema: z.object({ uid: z.string().default(''), customer_id: z.number().int().optional() })
    },
    async (params) => ({ content: [{ type: 'text', text: json(await client.call({ method: 'customer.deleteCustomer', params })) }] })
  );

  server.registerTool(
    'ibsng_get_user',
    {
      title: 'Get user information',
      description: 'Get IBSng E user information by user ID, normal username, VoIP username, or serial.',
      inputSchema: z.object({
        user_id: z.string().regex(/^\d+$/).optional(), normal_username: z.string().optional(),
        voip_username: z.string().optional(), serial: z.string().optional()
      })
    },
    async (params) => ({ content: [{ type: 'text', text: json(await client.call({ method: 'user.getUserInfo', params })) }] })
  );

  server.registerTool(
    'ibsng_update_user_attrs',
    {
      title: 'Update user attributes',
      description: 'Update IBSng E user attributes. Attributes are passed exactly as IBSng expects.',
      inputSchema: z.object({
        user_id: z.string().regex(/^\d+$/),
        attrs: z.record(z.string(), z.unknown()).default({}),
        to_del_attrs: z.array(z.string()).default([])
      })
    },
    async (params) => ({ content: [{ type: 'text', text: json(await client.call({ method: 'user.updateUserAttrs', params })) }] })
  );

  server.registerTool(
    'ibsng_get_balance',
    {
      title: 'Get balance',
      description: 'Get IBSng E balance information by balance name or ID.',
      inputSchema: z.object({ balance_name: z.string().optional(), balance_id: z.number().int().optional() })
    },
    async (params) => ({ content: [{ type: 'text', text: json(await client.call({ method: 'balance.getBalanceInfo', params })) }] })
  );

  server.registerTool(
    'ibsng_list_balances',
    {
      title: 'List balances',
      description: 'List all IBSng E balance IDs and names.',
      inputSchema: z.object({})
    },
    async () => ({ content: [{ type: 'text', text: json(await client.call({ method: 'balance.getAllBalanceIdsAndNames' })) }] })
  );

  server.registerTool(
    'ibsng_get_online_users',
    {
      title: 'Get online users',
      description: 'Get current IBSng E internet and VoIP online users.',
      inputSchema: z.object({ conds: z.record(z.string(), z.unknown()).default({}) })
    },
    async ({ conds }) => ({ content: [{ type: 'text', text: json(await client.call({
      method: 'report.getOnlineUsers',
      params: { normal_sort_by: 'user_id', normal_desc: false, voip_sort_by: 'user_id', voip_desc: false, conds }
    })) }] })
  );

  server.registerResource(
    'ibsng-e-capabilities',
    'ibsng://e/capabilities',
    { title: 'IBSng E capabilities', description: 'Integration surface of this IBSng E MCP server.' },
    async () => ({
      contents: [{
        uri: 'ibsng://e/capabilities',
        mimeType: 'application/json',
        text: JSON.stringify({ version: 'E', api: 'JSON-RPC', auth: ['auth_session', 'auth_type/auth_name/auth_pass/auth_remoteaddr/date_type'], raw_call: config.enableRawCall, domains: ['customer', 'user', 'balance', 'report'] }, null, 2)
      }]
    })
  );

  server.registerPrompt(
    'diagnose_customer',
    {
      title: 'Diagnose customer',
      description: 'Guides an agent through a read-first customer investigation workflow.',
      argsSchema: z.object({ customer: z.string() })
    },
    ({ customer }) => ({
      messages: [{ role: 'user', content: { type: 'text', text: `Investigate IBSng customer ${customer}. Start with customer lookup, then user information, balance and online state. Do not mutate the account unless the operator explicitly requests it.` } }]
    })
  );

  return server;
}
