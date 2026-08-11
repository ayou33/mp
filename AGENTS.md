# AGENTS.md

本文件是仓库(mp monorepo)协作规范。各子项目目录各自维护一份 AGENTS.md 作为项目内文档(Codex 原生读取),同目录 CLAUDE.md 仅含一行 `@AGENTS.md` 导入(Claude Code 原生支持 @path 导入,不直接读 AGENTS.md)。

## 子项目

- **`web/`** — A 股 K 线看板(React 19 + Vite 8 + TypeScript + Tailwind v4 + lightweight-charts v5)。**全部开发约定(架构原则/常用命令/关键坑/目录要点)见 `web/AGENTS.md`**,修改 web 内结构或逻辑时只更新 `web/` 下的 AGENTS.md,不要改动任何 CLAUDE.md。
- **`api/`** — 统一 API 标准(已有):以「目录 = URL 路径」组织,`api/v1/common/types.md` 为契约事实源,`api/mcp.md` 定义 MCP 工具。详见 `api/README.md`。
- **`shared/`** — 共享契约与计算引擎(已有,`@mp/shared`):类型 DTO + 内置指标 + 公式 DSL 引擎,backend 依赖其 `dist`;web 暂保留自身副本,后续迁移。详见 `shared/README.md`。
- **`backend-server/`** — REST 后端(已有,`@mp/backend-server`):Fastify + better-sqlite3,按 `api/v1/` 实现全部端点。详见 `backend-server/README.md`。
- **`mcp-server/`** — 规划中的子项目,待新建。**MCP 工具定义见 `api/mcp.md`(三大主服务 + 辅助工具),落成时以其为契约事实源。**新建时在各自目录建立 `AGENTS.md`(项目约定)+ `CLAUDE.md`(一行 `@AGENTS.md` 导入),并更新本文件与根 README 的子项目清单。

## 约定

- 仓库根只放 monorepo 级配置/文档;项目代码一律在子项目目录内,不在根目录散落。
- 文档单一来源:正文只维护在 AGENTS.md,CLAUDE.md 保持一行导入。
