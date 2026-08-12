# mcp-server

mp 的 **MCP Server**(`@mp/mcp-server`),把统一 API(`api/mcp.md`)暴露为 MCP 工具,供 AI 助手(Codex / Claude Code 等)通过 stdio 接入。实现上作为 **backend-server 的 REST 客户端**(统一数据源/鉴权/限流)。

## 运行

```bash
pnpm install                                    # 仓库根执行一次(workspace)
pnpm --filter @mp/backend-server dev            # 先启动后端(默认 http://localhost:3000)
pnpm --filter @mp/mcp-server dev                # 再启动 MCP(stdio)
```

环境变量:`MCP_BACKEND_URL`(默认 `http://localhost:3000/api/v1`)、`MCP_SERVER_NAME`(默认 `mp-mcp`)。

## 工具(25 个)

- **主服务一·自选管理**:`list_watchlist` / `add_watchlist` / `remove_watchlist`(删自选级联清该股全部画线)。
- **主服务二·画线类型**:`list_drawing_types`(9 种 + 操作方法)。
- **主服务三·自选股画线对象(系统类型)**:`list_watchlist_drawings` / `delete_watchlist_drawings` / `list_stock_drawings` / `delete_stock_drawings` / `delete_drawing`(缺省 `source=system`)。
- **辅助**:`search_stock` / `get_stock` / `get_kline` / `calc_indicator` / `test_formula` / `list_formulas` / `get_formula` / `save_formula` / `delete_formula` / `get_browse_history` / `record_browse` / `get_indicator_config` / `save_indicator_config` / `get_settings` / `save_settings` / `save_drawings`。

完整契约见 [`api/mcp.md`](../api/mcp.md)。工具入参用 zod 校验(与 `api/v1/common/types.md` 对齐),成功返回 `text(JSON) + structuredContent`,后端错误返回 `isError: true`。

## 测试

```bash
pnpm --filter @mp/mcp-server test               # vitest:校验工具 → REST 映射(mock fetch)
```

## 结构

- `src/index.ts` — McpServer(stdio)装配入口。
- `src/tools.ts` — 25 个工具定义(名称/描述/zod schema/handler)与注册。
- `src/backend.ts` — 轻量 REST 客户端(统一错误抛 `BackendError`)。
