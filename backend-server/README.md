# backend-server

mp 的 REST 后端(`@mp/backend-server`),按 `api/v1/` 目录结构实现全部端点,供 `web/` 与未来的 `mcp-server/` 消费。

## 运行

```bash
pnpm install                                # 仓库根执行一次(workspace)
pnpm --filter @mp/shared build              # shared 构建产物(backend 依赖其 dist)
pnpm --filter @mp/backend-server dev        # tsx watch,默认 http://localhost:3000
```

环境变量:`PORT`(默认 3000)、`DB_PATH`(默认 `data/mp.db`)。

## 端点

全部 `/api/v1/*`,见 [`api/v1/README.md`](../api/v1/README.md)。

## 数据

- **行情**:腾讯接口(服务端代理 + 内存 TTL 缓存 + 简单限流)。
- **用户数据**:SQLite(better-sqlite3),表 `watchlist` / `browse_history` / `formulas` / `kv`(settings、indicator-config)/ `drawings`;自选首次种子三大指数;删除自选**级联删除该股全部画线**。

## 测试

```bash
pnpm --filter @mp/backend-server test       # vitest(内存 SQLite + mock fetch)
```
