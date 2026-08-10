# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 项目概述

TradingView 风格 A 股日 K 看板(React 19 + Vite 8 + TypeScript)。图表基于 **lightweight-charts v5.2**(TradingView 官方开源库),数据来自腾讯免费行情接口。画线/斐波那契工具为**自研**,基于 lightweight-charts 的 primitives API,不走 klinecharts。

## 架构原则(必须严格遵循)

1. **充分但不过度的组件抽象** — 抽象以降低真实复杂度为准,不为抽象而抽象;每个抽象必须有清晰的职责边界。
2. **自顶向下、低层优先** — 新增/修改任何功能时自顶向下考虑:能放在数据层/工具层(`src/api/`、`src/drawing/`)解决的,就不要在 UI 组件里处理;把问题与错误拦截在尽可能低的层次,避免遗漏上抛到更高层。
3. **tsx 组件文件 ≤250 行左右** — 单个 **`.tsx` 组件文件**控制在 250 行左右,超限即拆分,把逻辑下沉到更低的层次。`.ts` 模块(控制器、primitive、工具)不受此限制。
4. **文档同步** — `src/drawing/`、`src/indicators/`、`src/components/` 各自维护独立的 `AGENTS.md`(目录级结构、约定与关键坑)。**修改这些目录的结构或逻辑时,必须同步更新对应的 `AGENTS.md`**;根据更新的内容自行判断是否还需回写根 `AGENTS.md`(仅当改动影响全局约定/跨目录协作时才动根文档,目录内细节留在子文档)。
5. **弹窗统一基础组件** — 系统内**所有弹窗/浮层必须从 `src/components/modal/BaseModal.tsx` 衍生**:全屏弹窗(指标配置/设置/区间统计等)经 `ModalProvider` 渲染,容器内浮层(画线编辑菜单等)用 `placement="float"` 自定位。新增弹窗不得自建面板外壳样式,统一复用 BaseModal(Tailwind utility 面板)。(操作价格线的确认交互已是 primitive 画布实现,不属浮层。)
6. **样式统一 Tailwind utility** — 所有 UI 样式用 **Tailwind utility class 写在 JSX** 上,颜色一律用 `@theme` token(`bg-panel`/`text-ink`/`text-muted`/`text-accent`/`text-up`/`text-down` 等),**不写死 hex、不新增手写组件类**。`src/index.css` 只含 `@import "tailwindcss"` + `@theme` 色板 + `@layer base` 基础样式 + 极少数无法 utility 化的全局钩子/动画(`@keyframes modal-slide-right`、`.drawing-menu .modal-body` 的 float 布局覆盖钩子)。图表库/primitive 的 canvas 颜色是 TS 常量,独立于 CSS,保持不动。

**落地结构**:React 组件(.tsx)只做「渲染 + 事件接线」,不承载绘制/交互逻辑;画线工具的放置/拖拽/清除等逻辑放在 `src/drawing/` 的非 React 控制器(DrawingTools)与 primitive 中。

## 常用命令

**包管理器限定 pnpm**(`package.json` 的 `packageManager` 字段 + `preinstall` 脚本强制,用 npm/yarn 安装会直接报错退出)。

```bash
pnpm install
pnpm dev         # 开发服务器,http://localhost:5173
pnpm build       # tsc -b && vite build(唯一校验,含 TS 类型检查)
pnpm preview     # 预览生产构建
```

无测试框架、无 lint 配置。改代码后用 `pnpm build` 验证 TS 编译。

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

价格轴 `autoScale` 必须为 `false`:**库的 `_internal_scrollTo` 在 autoScale 开启时直接 return,垂直拖动会失效**。因此配置 `candleSeries.priceScale().applyOptions({ autoScale: false })` 以支持垂直拖动,换股/数据更新后用 `chart.priceScale('right').setVisibleRange({ from, to })` 按**当前可见 K 线**(`fitPriceRange(bars, view)`,view 为时间视图设置后的可见逻辑窗口,**非全部加载数据**)的高低点(±6% 边距)适配价格区间——否则可见窗口只占渲染区域一小块,K 线渲染高度达不到下文的 4/5。

渲染区域:主图 K 线 `scaleMargins: { top: 0.16, bottom: 0.20 }`,K 线默认渲染高度 = 0.64 = (整个可用高度 − 成交量最大高度 0.20) 的 4/5;`bottom 0.20` 与成交量副图顶边(`top: 0.8`)恰好对齐、不重叠。改布局时两个 `scaleMargins` 需同步:成交量 `top` 与 K 线 `bottom` 之和为 1 时无缝衔接。

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
- 顶栏:股票搜索(切换股票)+ 画线工具开关 + 清除。换股时清空绘图(`clearFibData()`)。
- **画线模式互斥**:9 种画线工具(价格线/线段·射线·直线/矩形/测量/斐波那契回调·扩展/垂直线/文本标注/操作价格线)同一时刻仅一个激活,开启任一工具自动复位其余(见 App `clearDrawingModes`)。
- 任意画线模式激活时**右键单击退出画线模式**(清理未完成锚点 + 复位模式开关,此时右键不再框选);无激活模式时右键为区间框选。
- 全局字体栈 `'IBM Plex Sans Variable', ui-sans-serif, sans-serif, system-ui`(`src/index.css` 的 `@theme --font-sans`),由 `@fontsource-variable/ibm-plex-sans` 在 `src/main.tsx` 离线加载;中文走系统兜底(思源黑体/微软雅黑)。价格/数值区域用 `tabular-nums` 等宽数字对齐。

## 目录要点

- `src/api/stock.ts` — 数据层(腾讯接口 + 代码规范化)
- `src/chart/` — 图表辅助逻辑(非 React):`candleData.ts`(真假阴阳着色 + `fitPriceRange` 按可见窗口适配价格区间)、`LastPriceLabel.ts`(最新收盘价轴 label,`priceAxisPaneViews()` 自绘,盒左缘 x=0、文本起始 10 与库绘轴 label 左对齐,替代库内置 lastValue label,样式与指标 label 一致,底色随末根 K 线阴阳)、`HistoryLoader.ts`(时间轴视图:右滑追加历史/回到最新)、`VisibleRangeMark.ts` + `VisibleRangeMarkPrimitive.ts`(可见区间最高/最低价标注,引线/价格线双模式,样式由 `UserSettings.highLowStyle` 控制)、`CrosshairGainLabel.ts`(十字线距今涨幅标签,`paneViews()` 在主图 pane 底边自绘,中心对齐十字线并跟随移动,红涨绿跌)
- `src/components/KLineChart.tsx` — 图表壳:创建/销毁、数据更新、模式开关接线
- `src/drawing/` — 自研画线子系统(非 React):`DrawingTools.ts`(总控制器:按 kind 路由事件、右键框选统计/右键取消画线、serializeAll/restoreAll、用户/系统权限入口分流)、`DrawingTool.ts`(抽象基类,含 `canUserModify` 权限判断、`_enabled`/`isEnabled` 激活状态)、分类型工具 `LineTool`/`RectTool`/`MeasureTool`/`FibTool`/`FibExtTool`(三点)/`VerticalLineTool`(无价格)/`TextTool`(弹窗输入)/`PriceLineTool`/`ActionPriceLineTool`(状态机)+ 各自 primitive、`types.ts`(统一存储格式,画线对象分 system/user 归属)、`persistence.ts`(localStorage)。详细约定与扩展步骤见 `src/drawing/AGENTS.md`
- `src/indicators/` — 指标子系统:`IndicatorController`(`IndicatorConfig` 开关/参数/`lineStyles` 每线样式 + 主图默认色常量,装配主图 MA/EMA/BBI/BOLL + 副图 series、十字光标图例分流 `ChartLegend{ohlcv, indicators}`)、`SubChartIndicator.ts`(单个副图指标实例,应用参数与线样式覆盖)、`IndicatorAxis.ts`(指标值价格轴标签 + 副图左上角角标 primitive)、`subCharts.ts`(副图指标定义 RSI/MACD/KDJ/WR/CCI/OBV/ATR/DMI)、`editorMeta.ts`(`INDICATOR_META` 编辑面板元数据:参数 + 输出线)、`ma.ts`/`ema.ts`/`bbi.ts`/`boll.ts`/`rsi.ts`/`macd.ts`/`kdj.ts`/`wr.ts`/`cci.ts`/`obv.ts`/`atr.ts`/`dmi.ts` 纯函数、`custom/`(自定义指标框架:**公式 DSL 弹窗主入口**(`formula.ts` 解析/求值 + `formulaIndicator.ts` + `userFormulas.ts` localStorage 持久化,用户直接输入 `SMA(CLOSE,5)-SMA(CLOSE,20)` 等公式)+ 声明式 `defineIndicator` 工厂 + `CUSTOM_INDICATORS` 注册表 + `CustomIndicatorManager`/`CustomIndicatorInstance` 渲染器 + `lib.ts` 值级函数库,支持 7 种输出形态 line/area/baseline/histogram/candlestick/bar/band 与主图叠加/副图 pane/多 Y 轴)。详细约定与新指标扩展路径见 `src/indicators/AGENTS.md`(自定义指标见 `src/indicators/custom/AGENTS.md`)
- `src/index.css` — 样式唯一入口:Tailwind(`@import "tailwindcss"`)+ `@theme` 深色色板 token(`bg-panel`/`text-ink`/`text-muted`/`text-accent`/`text-up`/`text-down` 等)+ `@layer base` 基础样式;仅保留极少数无法 utility 化的全局钩子/动画(`@keyframes`、float 布局覆盖)
- `src/data/stocks.ts` — 常用 A 股清单与名称映射(自选/浏览用)
- `src/components/` — React 层(渲染 + 事件接线):App(编排)、KLineChart(图表壳)、IndicatorBar(顶部指标区)、DrawToolbar(左侧画线栏)、Sidebar(右侧自选/浏览)、PriceInput(可复用价格输入:滚轮 1/10/100 tick、精确 0.01,画线编辑/文本标注/操作线创建共用)、`topbar/`(TopBar + StockSearch + SettingsDialog,`UserSettings` 持久化到 `mp_settings`)、`modal/`(ModalProvider 全局弹窗系统 + BaseModal 统一弹窗基础外壳,所有弹窗/浮层由此衍生)。详细约定与弹窗/样式坑见 `src/components/AGENTS.md`
