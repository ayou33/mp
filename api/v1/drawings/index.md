# GET /api/v1/drawings · PUT /api/v1/drawings

画线数据(按 股票 + 周期 隔离,对齐 web 端 localStorage 持久化)。

## GET

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `stock` | query | string | 是 | 规范化代码 |
| `period` | query | KlinePeriod | 是 | 周期 |

响应 200 `Drawing[]`(见 `common/types.md`):

```json
[
  { "id": "d_1", "kind": "price-line", "points": [{ "time": "2026-08-10", "price": 1450.0 }], "owner": "user" }
]
```

## PUT — 全量保存

请求 `DrawingsPayload`:

```json
{ "stock": "sh600519", "period": "day", "items": [] }
```

响应 200 保存后的 `Drawing[]`(全量替换)。

## 说明

- 画线对象分 `system`(如操作线确认状态)与 `user`(用户绘制),按 `owner` 区分;「清除」只清 user。
