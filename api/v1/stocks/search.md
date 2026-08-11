# GET /api/v1/stocks/search

搜索 / 规范化股票(按代码或名称),返回匹配列表。

## 请求

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `q` | query | string | 是 | 6 位代码、带前缀代码或名称关键词,如 `600519` / `sh600519` / `贵州` |
| `limit` | query | number | 否 | 上限,缺省 10,最大 50 |

## 响应 200

`Stock[]`(见 `common/types.md`);按相关度排序(精确代码 > 前缀代码 > 名称模糊)。

```json
[
  { "code": "sh600519", "name": "贵州茅台", "market": "sh", "kind": "stock" },
  { "code": "sh000680", "name": "科创综指", "market": "sh", "kind": "index" }
]
```

## 错误

- 400 `BAD_REQUEST`:q 为空或无法识别。
