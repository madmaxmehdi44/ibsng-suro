import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './mcp.js';

void serveStdio(() => createServer(), { legacy: 'stateless' });
console.error('ibsng-suro: IBSng Branch E MCP server running on stdio');
