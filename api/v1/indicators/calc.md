# POST /api/v1/indicators/calc

计算一批指标(内置指标或用户公式),数据来自 `code`(服务端拉 K 线)或 `bars`(客户端传入)二选一。

## 请求

`IndicatorCalcRequest`(见 `common/types.md`):

```json
{
  "code": "sh600519",
  "period": "day",
  "indicators": [
    { "id": "macd", "params": [{ "key": "fast", "value": 12 }, { "key": "slow", "value": 26 }, { "key": "signal", "value": 9 }] },
    { "formula": "SMA(CLOSE,5) - SMA(CLOSE,20)", "shape": "line" },
    { "formula": "DIF := EMA(CLOSE,12) - EMA(CLOSE,26)\nDEA = EMA(DIF,9)\nHIST = (DIF - DEA) * 2", "shape": "line" }
  ]
}
```

| 字段 | 说明 |
| --- | --- |
| `code` / `bars` | 二选一;`bars` 存在时优先,服务端不再拉行情 |
| `indicators[].id` | 内置指标 id(`ma/ema/bbi/boll/rsi/macd/kdj/wr/cci/obv/atr/dmi`)或用户公式 id |
| `indicators[].formula` | 公式 DSL(单表达式或多输出脚本),与 web `src/indicators/custom/formula.ts` 同语义 |
| `indicators[].params` | 内置指标参数 |

## 响应 200

`IndicatorCalcResponse`:

```json
{
  "code": "sh600519",
  "barsCount": 320,
  "outputs": {
    "macd": [
      { "key": "dif", "label": "DIF", "type": "line", "data": [{ "time": "2026-08-10", "value": 1.23 }] },
      { "key": "dea", "label": "DEA", "type": "line", "data": [{ "time": "2026-08-10", "value": 1.01 }] },
      { "key": "macd", "label": "MACD", "type": "histogram", "data": [{ "time": "2026-08-10", "value": 0.44 }] }
    ],
    "main": [ { "key": "main", "label": "MAIN", "type": "line", "data": [{ "time": "2026-08-10", "value": 1432.1 }] } ]
  }
}
```

输出 key:内置指标按各自输出线(`macd` → dif/dea/macd);公式单表达式 → `main`,脚本 → 各输出语句名。

## 错误

- 400 `BAD_REQUEST`:`code` 与 `bars` 都未传,或 indicators 为空。
- 422 `VALIDATION_ERROR`:内置指标参数非法 / 公式编译失败(带 `details.message`)。
- 404 `NOT_FOUND`:`code` 拉取失败。
