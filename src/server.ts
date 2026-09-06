import http from 'node:http';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './mcp.js';
import { loadConfig } from './config.js';

async function serveHttp(): Promise<void> {
  const config = loadConfig();
  const handler = createMcpHandler(() => createServer());
  const nodeHandler = toNodeHandler(handler, { onerror: (error) => console.error('[mcp:http]', error) });

  const server = http.createServer(async (req, res) => {
    if (req.url?.split('?')[0] !== '/mcp') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
      return;
    }

    if (config.mcpAuthToken && req.headers.authorization !== `Bearer ${config.mcpAuthToken}`) {
      res.writeHead(401, { 'content-type': 'application/json', 'www-authenticate': 'Bearer' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    await nodeHandler(req as Parameters<typeof nodeHandler>[0], res as Parameters<typeof nodeHandler>[1]);
  });

  server.listen(config.mcpPort, config.mcpHost, () => {
    console.error(`IBSng E MCP listening on http://${config.mcpHost}:${config.mcpPort}/mcp`);
  });

  const shutdown = async () => {
    await handler.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

const mode = process.argv[2] ?? 'stdio';
if (mode === 'http') {
  void serveHttp();
} else if (mode === 'stdio') {
  void serveStdio(() => createServer());
  console.error('IBSng E MCP running on stdio');
} else {
  console.error('Usage: npm run dev -- [stdio|http]');
  process.exitCode = 2;
}
