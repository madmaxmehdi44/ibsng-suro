import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './mcp.js';

void serveStdio(() => createServer());
console.error('ibsng-suro: IBSng Branch E MCP server running on stdio');
