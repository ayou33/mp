# MCP Server 定义

`mcp-server/` 把统一 API 暴露为 MCP 工具,实现上作为 backend-server 的 REST 客户端(统一数据源/鉴权/限流)。工具入参与返回均使用 `v1/common/types.md` 的类型。

## 工具清单

| MCP Tool | 说明 | 对应 REST 端点 |
| --- | --- | --- |
| `search_stock(query)` | 搜索/规范化股票 | `GET /api/v1/stocks/search` |
| `get_stock(code)` | 股票元信息 | `GET /api/v1/stocks/{code}` |
| `get_kline(code, period?, fq?, limit?, before?)` | 查 K 线(含更早历史分页) | `GET /api/v1/stocks/{code}/kline` |
| `calc_indicator(code?, bars?, indicators)` | 计算内置/自定义公式指标 | `POST /api/v1/indicators/calc` |
| `test_formula(formula, shape?, formula2?, code?)` | 公式试运行(编译校验 + 求值统计) | `POST /api/v1/formulas/test` |
| `list_watchlist()` | 自选列表 | `GET /api/v1/watchlist` |
| `add_watchlist(code)` | 加入自选 | `PUT /api/v1/watchlist/{code}` |
| `remove_watchlist(code)` | 移出自选 | `DELETE /api/v1/watchlist/{code}` |
| `list_browse_history(limit?)` | 最近浏览 | `GET /api/v1/browse-history` |
| `record_browse(code, name?)` | 记录一次浏览 | `POST /api/v1/browse-history` |
| `list_formulas()` / `get_formula(id)` | 公式列表 / 单条 | `GET /api/v1/formulas` / `GET /api/v1/formulas/{id}` |
| `save_formula(record)` / `delete_formula(id)` | 新建/更新 / 删除公式 | `POST|PUT /api/v1/formulas*` / `DELETE /api/v1/formulas/{id}` |
| `get_indicator_config()` / `save_indicator_config(config)` | 指标配置读写 | `GET|PUT /api/v1/indicator-config` |
| `get_settings()` / `save_settings(settings)` | 设置读写 | `GET|PUT /api/v1/settings` |
| `get_drawings(stock, period)` / `save_drawings(stock, period, items)` | 画线读写 | `GET|PUT /api/v1/drawings` |

## Resources(可选)

| URI 模板 | 说明 |
| --- | --- |
| `stock://{code}` | 股票元信息 |
| `stock://{code}/kline?period=day` | K 线数据 |
| `watchlist://` | 当前自选 |
| `formulas://` | 用户公式列表 |

## Prompts(可选)

- `analyze-stock`:给定代码,拉 K 线 + 计算 MA/MACD/KDJ/RSI 汇总,供技术面解读。

## 工具输入 Schema 说明

工具入参的 JSON Schema 由 `v1/common/types.md` 对应类型生成;`code`/`bars` 二选一的约束与 REST 一致(传 `bars` 时服务端不再拉行情)。
