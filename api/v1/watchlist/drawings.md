# GET /api/v1/watchlist/drawings · DELETE /api/v1/watchlist/drawings

聚合查询 / 删除**自选股**上的画线对象(MCP 服务「查询管理我的自选股票中的画线对象」,重点为系统类型)。

## GET — 查询

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `source` | query | `system`/`user` | 否 | 按归属过滤;**缺省仅返回 `system`(系统类型)** |
| `period` | query | KlinePeriod | 否 | 缺省全部周期 |

响应 200 `Record<code, { period, drawings: Drawing[] }>`(仅含自选股;`source` 缺省时只列系统对象):

```json
{
  "sh600519": {
    "day": [ { "id": 2, "kind": "action-line", "source": "system", "price": 1500.0, "action": "add", "status": "armed", "direction": "up" } ]
  }
}
```

## DELETE — 批量删除

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `source` | query | `system`/`user` | 否 | 缺省仅删除 `system`(系统类型) |
| `period` | query | KlinePeriod | 否 | 缺省全部周期 |

响应 204;删除全部自选股上满足条件的画线对象。

## 说明

- `system` 对象由程序生成(如操作价格线的状态),用户不可改删,但系统(含 MCP)可操作;`source=user` 时需显式传入。
- 单股查询/删除用 `drawings/index.md`(`GET/DELETE /drawings?stock=`);删除自选会级联清空该股画线,见 `watchlist/{code}.md`。