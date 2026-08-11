# AGENTS.md

本文件是仓库(mp monorepo)协作规范。各子项目目录各自维护一份 AGENTS.md 作为项目内文档(Codex 原生读取),同目录 CLAUDE.md 仅含一行 `@AGENTS.md` 导入(Claude Code 原生支持 @path 导入,不直接读 AGENTS.md)。

## 子项目

- **`web/`** — A 股 K 线看板(React 19 + Vite 8 + TypeScript + Tailwind v4 + lightweight-charts v5)。**全部开发约定(架构原则/常用命令/关键坑/目录要点)见 `web/AGENTS.md`**,修改 web 内结构或逻辑时只更新 `web/` 下的 AGENTS.md,不要改动任何 CLAUDE.md。
- **`mcp-server/` / `backend-server/`** — 规划中的子项目,待新建。每个子项目落成时在各自目录建立 `AGENTS.md`(项目约定)+ `CLAUDE.md`(一行 `@AGENTS.md` 导入),并更新本文件与根 README 的子项目清单。

## 约定

- 仓库根只放 monorepo 级配置/文档;项目代码一律在子项目目录内,不在根目录散落。
- 文档单一来源:正文只维护在 AGENTS.md,CLAUDE.md 保持一行导入。
