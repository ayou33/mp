# GET /api/v1/watchlist

自选列表。

## 请求

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `limit` | query | number | 否 | 缺省 100 |

## 响应 200

`WatchlistItem[]`(见 `common/types.md`);按加入顺序。

**默认值**:用户首次使用(无数据)时返回三大指数:

```json
[
  { "code": "sh000001", "name": "上证指数", "addedAt": "2026-08-11T09:30:00Z" },
  { "code": "sh000680", "name": "科创综指", "addedAt": "2026-08-11T09:30:00Z" },
  { "code": "sz399006", "name": "创业板指", "addedAt": "2026-08-11T09:30:00Z" }
]
```

## 错误

- 401 `UNAUTHORIZED`:需登录(阶段二)。
