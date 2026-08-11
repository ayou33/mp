# MCP Server 定义

`mcp-server/` 把统一 API 暴露为 MCP 工具,实现上作为 backend-server 的 REST 客户端(统一数据源/鉴权/限流)。工具入参与返回均使用 `v1/common/types.md` 的类型。

**MCP 主要提供以下三类服务**:① 自选管理(删除自选级联删画线);② 画线类型与操作方法目录;③ 自选股画线对象(系统类型)查询/管理。行情/指标/公式等为辅助工具。

## 主服务一:自选管理

| MCP Tool | 说明 | 对应 REST |
| --- | --- | --- |
| `list_watchlist()` | 查询自选(首次默认三大指数:上证指数/科创综指/创业板指) | `GET /api/v1/watchlist` |
| `add_watchlist(code)` | 加入自选(幂等) | `PUT /api/v1/watchlist/{code}` |
| `remove_watchlist(code)` | 移出自选;**同时删除该股全部周期下的所有画线对象(system + user)** | `DELETE /api/v1/watchlist/{code}` |

## 主服务二:画线类型与操作方法

| MCP Tool | 说明 | 对应 REST |
| --- | --- | --- |
| `list_drawing_types()` | 系统支持的画线类型(9 种)+ 操作方法(放置/编辑/清除/归属) | `GET /api/v1/drawings/types` |

## 主服务三:自选股画线对象(系统类型)查询/管理

| MCP Tool | 说明 | 对应 REST |
| --- | --- | --- |
| `list_watchlist_drawings(source?)` | 聚合查询自选股画线对象;**缺省只看 `source=system` 系统类型** | `GET /api/v1/watchlist/drawings` |
| `delete_watchlist_drawings(source?)` | 批量删除自选股画线对象;缺省只删系统类型 | `DELETE /api/v1/watchlist/drawings` |
| `list_stock_drawings(stock, period?, source?)` | 查询单只自选股的画线对象 | `GET /api/v1/drawings?stock=&period=&source=` |
| `delete_stock_drawings(stock, period?, source?)` | 删除单只自选股的画线对象(按条件批量) | `DELETE /api/v1/drawings?stock=&period=&source=` |
| `delete_drawing(stock, period, id)` | 删除单个画线对象 | `DELETE /api/v1/drawings/{id}?stock=&period=` |

> `source` 语义见 `common/types.md`:system = 程序生成、用户不可改删但系统可操作;user = 用户交互创建。查询/删除系统类型是 MCP 的核心能力。

## 辅助工具(行情 / 指标 / 公式)

| MCP Tool | 说明 | 对应 REST |
| --- | --- | --- |
| `search_stock(query)` | 搜索/规范化股票 | `GET /api/v1/stocks/search` |
| `get_stock(code)` | 股票元信息 | `GET /api/v1/stocks/{code}` |
| `get_kline(code, period?, fq?, limit?, before?)` | 查 K 线(含更早历史分页) | `GET /api/v1/stocks/{code}/kline` |
| `calc_indicator(code?, bars?, indicators)` | 计算内置/自定义公式指标 | `POST /api/v1/indicators/calc` |
| `test_formula(formula, shape?, formula2?, code?)` | 公式试运行(编译校验 + 求值统计) | `POST /api/v1/formulas/test` |
| `list_formulas()` / `get_formula(id)` | 公式列表 / 单条 | `GET /api/v1/formulas*` |
| `save_formula(record)` / `delete_formula(id)` | 公式增改 / 删除 | `POST|PUT /api/v1/formulas*` |
| `get_browse_history(limit?)` / `record_browse(code)` | 浏览记录读写 | `GET|POST /api/v1/browse-history` |
| `get_indicator_config()` / `save_indicator_config(config)` | 指标配置读写 | `GET|PUT /api/v1/indicator-config` |
| `get_settings()` / `save_settings(settings)` | 设置读写 | `GET|PUT /api/v1/settings` |

## Resources(可选)

| URI 模板 | 说明 |
| --- | --- |
| `stock://{code}` | 股票元信息 |
| `stock://{code}/kline?period=day` | K 线数据 |
| `watchlist://` | 当前自选 |
| `watchlist://{code}/drawings?source=system` | 自选股系统类型画线对象 |
| `drawing-types://` | 画线类型目录 |

## Prompts(可选)

- `manage-watchlist`:列出自选 → 按需增删(提示:删自选会级联清画线)。
- `analyze-stock`:拉 K 线 + 计算 MA/MACD/KDJ/RSI 汇总,供技术面解读。

## 工具输入 Schema 说明

工具入参的 JSON Schema 由 `v1/common/types.md` 对应类型生成;`code`/`bars` 二选一的约束与 REST 一致(传 `bars` 时服务端不再拉行情)。