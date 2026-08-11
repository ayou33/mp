# stocks — 股票与行情

`/api/v1/stocks` 资源树:

```
stocks/
  README.md
  search.md          GET  /stocks/search
  kline/
    batch.md         POST /stocks/kline/batch
  {code}/
    index.md         GET  /stocks/{code}
    kline.md         GET  /stocks/{code}/kline
```

- `{code}` 为规范化代码:小写 `sh/sz/bj` + 6 位(如 `sh600519`),或由服务端 `normalizeCode` 处理原始输入(6 位数字自动加前缀)。
- 行情数据源:腾讯接口,由 backend-server 代理(缓存/限流/重试),前端与 MCP 不直连。
- 常用指数:`sh000001` 上证指数、`sh000680` 科创综指、`sz399006` 创业板指。
