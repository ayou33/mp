# PUT /api/v1/watchlist/{code} · DELETE /api/v1/watchlist/{code}

加入 / 移出自选(幂等)。

## PUT — 加入自选

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `code` | path | string | 是 | 规范化代码或 6 位数字 |

响应 200 `WatchlistItem`:

```json
{ "code": "sh600519", "name": "贵州茅台", "addedAt": "2026-08-11T09:30:00Z" }
```

- 已存在则原样返回(幂等),不重复插入。
- 404 `NOT_FOUND`:代码无法识别。

## DELETE — 移出自选

响应 204(无 body);不存在也返回 204(幂等)。