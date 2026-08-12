/** MCP Server 配置(env 可覆盖) */
export const config = {
  /** backend-server 的 REST 基地址(env MCP_BACKEND_URL 覆盖) */
  backendBase: process.env.MCP_BACKEND_URL ?? 'http://localhost:3000/api/v1',
  /** MCP server 名称(env MCP_SERVER_NAME 覆盖) */
  name: process.env.MCP_SERVER_NAME ?? 'mp-mcp',
  version: '0.1.0',
}
