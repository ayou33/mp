# GET /api/v1/browse-history

最近浏览记录(默认空,去重置顶,上限 30)。

## 请求

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `limit` | query | number | 否 | 缺省 30,最大 100 |

## 响应 200

`BrowseEntry[]`(见 `common/types.md`),最近优先:

```json
[
  { "code": "sh600519", "name": "贵州茅台", "viewedAt": "2026-08-11T10:00:00Z" },
  { "code": "sh000680", "name": "科创综指", "viewedAt": "2026-08-11T09:40:00Z" }
]
```

**默认**:首次使用返回 `[]`(空)。
