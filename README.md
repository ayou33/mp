# mp

A 股 K 线看板 monorepo,按子项目分目录组织。

## 子项目

| 目录 | 说明 | 状态 |
| --- | --- | --- |
| [`web/`](web/) | TradingView 风格 A 股日 K 看板(React 19 + Vite 8 + TypeScript) | ✅ 已有 |
| [`api/`](api/README.md) | 统一 API 标准(目录即路径,web ↔ backend ↔ MCP 契约) | ✅ 已有 |
| [`shared/`](shared/README.md) | 共享契约 + 指标/公式引擎(`@mp/shared`) | ✅ 已有 |
| [`backend-server/`](backend-server/README.md) | REST 后端(Fastify + SQLite,实现 `api/v1`) | ✅ 已有 |
| `mcp-server/` | MCP Server | 🚧 规划中 |

`web/` 的本地运行、功能与目录说明见 [`web/README.md`](web/README.md)。

## API 设计

统一 API 标准以**「目录 = URL 路径」**组织在 [`api/`](api/README.md):`api/v1/` 目录段即路径段,叶子文档描述各端点详情(类型结构 + 样例数据),子节点多的目录配 `README.md`;`api/v1/common/types.md` 为契约事实源,`api/mcp.md` 定义 MCP 工具。作为 backend-server / mcp-server 的落地契约。
