# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

TradingView 风格 A 股日 K 看板(React 19 + Vite 8 + TypeScript)。图表基于 **lightweight-charts v5.2**(TradingView 官方开源库),数据来自腾讯免费行情接口。画线/斐波那契工具为**自研**,基于 lightweight-charts 的 primitives API,不走 klinecharts。

## 架构原则(必须严格遵循)

1. **充分但不过度的组件抽象** — 抽象以降低真实复杂度为准,不为抽象而抽象;每个抽象必须有清晰的职责边界。
2. **自顶向下、低层优先** — 新增/修改任何功能时自顶向下考虑:能放在数据层/工具层(`src/api/`、`src/drawing/`)解决的,就不要在 UI 组件里处理;把问题与错误拦截在尽可能低的层次,避免遗漏上抛到更高层。
3. **tsx 组件文件 ≤250 行左右** — 单个 **`.tsx` 组件文件**控制在 250 行左右,超限即拆分,把逻辑下沉到更低的层次。`.ts` 模块(控制器、primitive、工具)不受此限制。

**落地结构**:React 组件(.tsx)只做「渲染 + 事件接线」,不承载绘制/交互逻辑;画线工具的放置/拖拽/清除等逻辑放在 `src/drawing/` 的非 React 控制器(DrawingTools)与 primitive 中。

## 常用命令

```bash
npm install
npm run dev      # 开发服务器,http://localhost:5173
npm run build    # tsc -b && vite build(唯一校验,含 TS 类型检查)
npm run preview  # 预览生产构建
```

无测试框架、无 lint 配置。改代码后用 `npm run build` 验证 TS 编译。

## 数据流:必须走 Vite 代理

腾讯接口(`web.ifzq.gtimg.cn`)的 CORS 头不稳定,浏览器直连会报 NetworkError。因此**浏览器永不直接请求该接口**:

- 前端请求相对路径 `/api/...`(`src/api/stock.ts` 的 `KLINE_API = '/api/appstock/app/fqkline/get'`)
- `vite.config.ts` 把 `/api` 代理到腾讯域名(带 `Referer: https://gu.qq.com/`,rewrite 去掉 `/api` 前缀)

此代理只在 `dev`/`preview` 生效;部署 `dist` 时需要反向代理实现同样的规则。

`src/api/stock.ts` 提供 `normalizeCode()`(6 位代码 → `sh`/`sz`/`bj` 前缀)和 `fetchDailyKline()`(解析腾讯 `qfqday`/`day` 数组,前复权)。

## 图表库版本注意事项

- 全程用 **v5 API**:`chart.addSeries(CandlestickSeries, opts)`、`chart.addSeries(HistogramSeries, opts)`。**不要**用 v4 的 `chart.addCandlestickSeries()`。
- 日线数据格式:`{ time: 'YYYY-MM-DD', open, high, low, close }`。
- 成交量副图用独立隐藏价格轴:`priceScaleId: ''` + `scaleMargins: { top: 0.8, bottom: 0 }`。

## 关键坑(跨文件才能理解)

### 1. 价格轴:autoScale 关闭 + 手动适配(`KLineChart.tsx`)

价格轴 `autoScale` 必须为 `false`:**库的 `_internal_scrollTo` 在 autoScale 开启时直接 return,垂直拖动会失效**。因此配置 `rightPriceScale: { autoScale: false }` 以支持垂直拖动,换股后手动用 `chart.priceScale('right').setVisibleRange({ from, to })` 按新数据高低点(±6% 边距)适配价格区间。

副作用:价格轴不再随时间缩放自动适配可视区间(用户需垂直拖动查看),这是启用垂直拖动的代价。

### 2. 自绘 primitive 的引用语义(`src/drawing/FibonacciPrimitive.ts`)

`FibonacciPrimitive` 构造时捕获数据源对象的引用。**绝不能整体替换该对象**(如 `fibDataRef.current = {...}`)——primitive 会一直渲染旧空对象,画不出来。清空/重置必须**就地变更属性**(`data.fibs = []` 等)。

状态变更后用 `attached()` 注入的 `requestUpdate()` 强制重绘。价格轴百分比标签用 `priceAxisViews()` / `ISeriesPrimitiveAxisView`。

### 3. React StrictMode 双执行

图表创建 effect 在 dev 下执行两次:必须先 `container.replaceChildren()` 再 `createChart`,cleanup 里 `chart.remove()` + 移除事件监听。事件回调用**箭头函数**——`function` 声明会提升,闭包内 `container` 的 null 收窄失效(TS 报错)。

### 4. 拖拽与图表平移冲突

拖动画线锚点/价格线用容器级 `pointerdown`(capture 阶段)+ `preventDefault()`/`stopPropagation()`。`preventDefault` 会抑制兼容鼠标事件,阻止图表同步平移。

## 交互与约定

- A 股惯例**红涨绿跌**:`upColor: '#f23645'`(红)、`downColor: '#089981'`(绿)。
- 时间轴中文:`localization: { locale: 'zh-CN', dateFormat: 'yyyy-MM-dd' }`。
- 顶栏:股票搜索(切换股票)+ 画线/斐波那契开关 + 清除。换股时清空绘图(`clearFibData()`)。
- 全局字体栈 `'DM Sans', ui-sans-serif, sans-serif, system-ui`(`src/index.css`)。DM Sans 需自行加载,否则走兜底。

## 目录要点

- `src/api/stock.ts` — 数据层(腾讯接口 + 代码规范化)
- `src/components/KLineChart.tsx` — 图表壳:创建/销毁、数据更新、模式开关接线
- `src/drawing/DrawingTools.ts` — 画线工具控制器(非 React):价格线与斐波那契的放置/预览/拖拽/清除
- `src/drawing/FibonacciPrimitive.ts` — 自绘斐波那契 primitive(渲染 + 轴标签),新画线工具照此模式扩展
- `src/indicators/` — 指标子系统:`IndicatorController`(装配 MA 主图 + RSI 副图 series、十字光标图例分流 `ChartLegend{ohlcv, indicators}`)、`IndicatorAxis.ts`(指标值价格轴标签 primitive,MA 按值定位、RSI 固定副图轴顶)、`ma.ts`/`rsi.ts` 纯函数。新指标照此扩展
- `src/data/stocks.ts` — 常用 A 股清单与名称映射(自选/浏览用)
- `src/components/` — 布局:App(编排)、KLineChart(图表壳)、IndicatorBar(顶部指标区)、DrawToolbar(左侧画线栏)、Sidebar(右侧自选/浏览)、StockSearch
