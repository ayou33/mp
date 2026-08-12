import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { BackendClient } from './backend'
import { registerTools } from './tools'
import { config } from './config'

/**
 * mp MCP Server(stdio):把统一 API(api/mcp.md)暴露为 MCP 工具,实现上作为 backend-server 的 REST 客户端。
 * 启动:先启动 backend-server,再 `pnpm --filter @mp/mcp-server dev`;Codex/Claude 等以 stdio 接入。
 */
const server = new McpServer({ name: config.name, version: config.version })
registerTools(server, new BackendClient(config.backendBase))

const transport = new StdioServerTransport()
await server.connect(transport)
