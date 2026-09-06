import http from 'node:http';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './mcp.js';
import { loadConfig } from './config.js';

const json = (res: http.ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(body));
};

async function serveHttp(): Promise<void> {
  const config = loadConfig();
  const handler = createMcpHandler(() => createServer());
  const nodeHandler = toNodeHandler(handler, { onerror: (error) => console.error('[mcp:http]', error) });

  const server = http.createServer(async (req, res) => {
    const pathname = req.url?.split('?')[0] ?? '/';

    if (config.mcpAuthToken && req.headers.authorization !== `Bearer ${config.mcpAuthToken}`) {
      json(res, 401, { error: 'unauthorized' });
      return;
    }

    if (pathname === '/' || pathname === '/health') {
      json(res, 200, {
        status: 'ok',
        service: 'ibsng-suro',
        version: '0.2.6',
        protocol: 'MCP over Streamable HTTP',
        endpoint: '/mcp'
      });
      return;
    }

    if (pathname !== '/mcp') {
      json(res, 404, { error: 'not_found', path: pathname });
      return;
    }

    // A browser/Postman GET without an SSE Accept header is not an MCP request.
    // Keep /mcp standards-compliant while providing a useful response instead of
    // exposing the SDK's legacy 405 JSON-RPC error to simple endpoint checks.
    if (req.method === 'GET' && !String(req.headers.accept ?? '').includes('text/event-stream')) {
      json(res, 200, {
        status: 'ok',
        service: 'ibsng-suro',
        message: 'MCP endpoint is available. Use an MCP client or POST a valid MCP request.',
        endpoint: '/mcp',
        health: '/health'
      });
      return;
    }

    await nodeHandler(
      req as unknown as Parameters<typeof nodeHandler>[0],
      res as Parameters<typeof nodeHandler>[1]
    );
  });

  server.listen(config.mcpPort, config.mcpHost, () => {
    console.error(`IBSng E MCP listening on http://${config.mcpHost}:${config.mcpPort}/mcp`);
    console.error(`IBSng Suro health endpoint: http://${config.mcpHost}:${config.mcpPort}/health`);
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
  console.error('IBSng Suro: IBSng Branch E MCP server running on stdio');
} else {
  console.error('Usage: npm run dev -- [stdio|http]');
  process.exitCode = 2;
}
