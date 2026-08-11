# v1 端点索引

Base:`/api/v1`;内容类型 `application/json`;错误结构见 `common/error.md`,类型见 `common/types.md`。

## 行情

| 方法 | 路径 | 文档 |
| --- | --- | --- |
| GET | `/stocks/search?q=` | [`stocks/search.md`](stocks/search.md) |
| GET | `/stocks/{code}` | [`stocks/{code}/index.md`](stocks/{code}/index.md) |
| GET | `/stocks/{code}/kline` | [`stocks/{code}/kline.md`](stocks/{code}/kline.md) |
| POST | `/stocks/kline/batch` | [`stocks/kline/batch.md`](stocks/kline/batch.md) |

## 指标

| 方法 | 路径 | 文档 |
| --- | --- | --- |
| POST | `/indicators/calc` | [`indicators/calc.md`](indicators/calc.md) |

## 自选 / 浏览记录

| 方法 | 路径 | 文档 |
| --- | --- | --- |
| GET | `/watchlist` | [`watchlist/index.md`](watchlist/index.md) |
| PUT | `/watchlist/{code}` | [`watchlist/{code}.md`](watchlist/{code}.md) |
| DELETE | `/watchlist/{code}` | [`watchlist/{code}.md`](watchlist/{code}.md) |
| GET | `/browse-history` | [`browse-history/index.md`](browse-history/index.md) |
| POST | `/browse-history` | [`browse-history/record.md`](browse-history/record.md) |

## 用户公式

| 方法 | 路径 | 文档 |
| --- | --- | --- |
| GET / POST | `/formulas` | [`formulas/index.md`](formulas/index.md) |
| GET / PUT / DELETE | `/formulas/{id}` | [`formulas/{id}/index.md`](formulas/{id}/index.md) |
| POST | `/formulas/test` | [`formulas/test.md`](formulas/test.md) |

## 配置 / 设置 / 画线

| 方法 | 路径 | 文档 |
| --- | --- | --- |
| GET / PUT | `/indicator-config` | [`indicator-config/index.md`](indicator-config/index.md) |
| GET / PUT | `/settings` | [`settings/index.md`](settings/index.md) |
| GET / PUT | `/drawings` | [`drawings/index.md`](drawings/index.md) |
