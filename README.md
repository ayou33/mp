# mp

A 股 K 线看板 monorepo,按子项目分目录组织。

## 子项目

| 目录 | 说明 | 状态 |
| --- | --- | --- |
| [`web/`](web/) | TradingView 风格 A 股日 K 看板(React 19 + Vite 8 + TypeScript) | ✅ 已有 |
| `mcp-server/` | MCP Server | 🚧 规划中 |
| `backend-server/` | 后端服务 | 🚧 规划中 |

`web/` 的本地运行、功能与目录说明见 [`web/README.md`](web/README.md)。

## API 设计

前后端交互与 MCP Server 的统一 API 定义见 [`docs/api-design.md`](docs/api-design.md)(基于现有 web 功能设计,作为 backend-server / mcp-server 的契约事实源)。
