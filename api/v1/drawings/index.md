# GET /api/v1/drawings · PUT /api/v1/drawings · DELETE /api/v1/drawings

画线数据(按 股票 + 周期 隔离,对齐 web 端 `src/drawing/types.ts` 的 `SerializedDrawing`)。

## GET — 查询

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `stock` | query | string | 是 | 规范化代码 |
| `period` | query | KlinePeriod | 否 | 缺省 `day` |
| `source` | query | `system`/`user` | 否 | 按归属过滤;缺省返回全部 |

响应 200 `Drawing[]`:

```json
[
  { "id": 1, "kind": "price-line", "source": "user", "price": 1450.0 },
  { "id": 2, "kind": "action-line", "source": "system", "price": 1500.0, "action": "add", "status": "armed", "direction": "up" }
]
```

## PUT — 全量保存

请求 `DrawingsPayload`:

```json
{ "stock": "sh600519", "period": "day", "items": [] }
```

响应 200 保存后的 `Drawing[]`(全量替换)。

## DELETE — 删除

支持两种:

| 方式 | 请求 | 说明 |
| --- | --- | --- |
| 按条件批量 | `DELETE /drawings?stock=&period=&source=` | `stock`/`period` 必填,`source` 可选(缺省全部) |
| 按 id 单个 | `DELETE /drawings/{id}?stock=&period=` | 删除单个画线对象 |

响应 204。

## 说明

- `source` 语义:`user`(用户交互创建,可修改/删除)与 `system`(程序生成、无用户交互,用户不可修改/删除;系统可操作一切)。
- **级联删除**:删除自选时,该股全部画线对象(`system` + `user`)一并删除,见 `watchlist/{code}.md`。
- 画线类型目录见 [`types.md`](types.md)。