# POST /api/v1/stocks/kline/batch

批量查询 K 线(自选列表刷新 / 多股对比用),一次最多 20 只。

## 请求

```json
{
  "items": [
    { "code": "sh000001", "period": "day", "limit": 10 },
    { "code": "sh000680", "period": "day", "limit": 10 }
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `items[].code` | string | 是 | 规范化代码或 6 位数字 |
| `items[].period` | KlinePeriod | 否 | 缺省 `day` |
| `items[].fq` | Fq | 否 | 缺省 `qfq` |
| `items[].limit` | number | 否 | 缺省 10,最大 320 |

## 响应 200

`Record<string, KlineResponse>`(key = 规范化代码);单只失败不整体失败,用 `null` 占位:

```json
{
  "sh000001": { "code": "sh000001", "name": "上证指数", "period": "day", "fq": "qfq", "bars": [], "nextBefore": null },
  "sh000680": null
}
```

## 错误

- 400 `BAD_REQUEST`:items 为空或超过 20 条。
