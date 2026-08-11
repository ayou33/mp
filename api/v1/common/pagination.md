# 分页约定

## K 线(游标分页)

- `GET /stocks/{code}/kline?limit=320&before={date}`
- 返回 `KlineResponse.bars`(时间降序,最新在前)与 `nextBefore`:
  - 首次请求不传 `before`,返回最近 `limit` 根。
  - 追加更早历史:`before = 当前 bars[0].time 的上一交易日`(服务端容错:传 `bars[0].time` 亦可,返回**不含当天**的更早数据)。
  - `nextBefore === null` 表示已到数据起点。

## 列表(自选/浏览/公式等)

- `?limit=`(缺省 30,上限 100);按服务端排序(自选=加入序,浏览=最近优先)。
- 数据量小,不做 offset/游标;需要时再扩展 `cursor`。

## 样例

```http
GET /api/v1/stocks/sh600519/kline?period=day&fq=qfq&limit=320
```
```json
{
  "code": "sh600519", "name": "贵州茅台", "period": "day", "fq": "qfq",
  "bars": [ { "time": "2026-08-10", "open": 1450.0, "high": 1480.5, "low": 1445.0, "close": 1472.3, "volume": 3200000 } ],
  "nextBefore": "2026-08-07"
}
```
