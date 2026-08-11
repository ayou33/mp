# GET /api/v1/stocks/{code}/kline

查询指定股票、周期的 K 线(前复权优先),支持游标追加更早历史。

## 请求

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `code` | path | string | 是 | 规范化代码或 6 位数字 |
| `period` | query | `day`/`week`/`month` | 否 | 缺省 `day` |
| `fq` | query | `qfq`/`none` | 否 | 缺省 `qfq`(前复权) |
| `limit` | query | number | 否 | 缺省 320,最大 2000 |
| `before` | query | string | 否 | 拉取该日期之前的更早数据(不含当天);首屏不传 |

## 响应 200

`KlineResponse`(见 `common/types.md` 与 `common/pagination.md`):

```json
{
  "code": "sh600519",
  "name": "贵州茅台",
  "period": "day",
  "fq": "qfq",
  "bars": [
    { "time": "2026-08-10", "open": 1450.0, "high": 1480.5, "low": 1445.0, "close": 1472.3, "volume": 3200000 },
    { "time": "2026-08-07", "open": 1448.0, "high": 1462.0, "low": 1438.0, "close": 1451.0, "volume": 2800000 }
  ],
  "nextBefore": "2026-08-06"
}
```

## 错误

- 404 `NOT_FOUND`:未找到股票 / 暂无 K 线数据。
- 502 `UPSTREAM_ERROR`:行情源异常(可重试)。
- 429 `RATE_LIMITED`:限流。
