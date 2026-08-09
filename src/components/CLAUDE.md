# src/components

React 层(布局 + 弹窗 + 图表壳),只做「渲染 + 事件接线」,不承载绘制/交互逻辑。画线/指标等业务逻辑下沉到 `src/drawing/`、`src/indicators/` 的非 React 控制器与 primitive。

## 分层结构(自顶向下)

```
App.tsx 编排:股票/周期/设置/自选状态、9 种画线模式互斥、指标配置、错误横幅、ModalProvider 装配
  ├─ topbar/TopBar.tsx 顶栏:PeriodSwitcher + IndicatorBar + StockSearch + SettingsButton
  │     ├─ PeriodSwitcher 周期切换(日/周/月)
  │     ├─ StockSearch    股票搜索(回车触发,规范化在 src/api/stock.ts)
  │     └─ SettingsDialog 设置弹窗(UserSettings 持久化 mp_settings)
  ├─ IndicatorBar.tsx 指标栏:常显全部指标、激活蓝字+底部短bar、滚轮平滑横向滚动、+自定义指标
  ├─ DrawToolbar.tsx 左侧画线工具栏(9 种工具互斥开关 + 清除 + 底部「模拟」测试按钮)
  ├─ KLineChart.tsx 图表壳:createChart、数据更新、模式开关接线、非 React 控制器装配
  │     ├─ 图表浮层:DrawingContextMenu(画线左键菜单)/ range-select-overlay(操作线确认按钮为画布实现,见 drawing/CLAUDE.md)
  │     └─ 经 ModalProvider 打开的弹窗内容:RangeStatsDialog / ActionTypeDialog / TextInputDialog
  ├─ Sidebar.tsx 右侧自选/浏览(自选持久化 mp_watchlist)
  └─ modal/ 全局弹窗体系
        ├─ ModalProvider.tsx 弹窗状态:open/close、多层堆叠(遮罩 z-index 1000+i)、Esc/点遮罩关闭
        └─ BaseModal.tsx 统一外壳:placement center/right(经 ModalProvider layer)/ float(容器内自定位)
              └─ 弹窗内容组件:IndicatorConfigDialog(+ IndicatorLineEditor / IndicatorPeriodEditor)
```

**数据流**:React 状态(画线模式/指标配置/股票)通过 props 下传,`KLineChart` 在**渲染期**把模式开关同步到非 React 控制器(`toolsRef.current?.setXxxEnabled(...)`、`indicators.setConfig(...)`);控制器经回调把坐标/图例/数据变更抛回 React 层显示。

## 关键坑(跨文件才能理解)

### 1. 弹窗必须从 BaseModal 衍生,分两种形态(根 CLAUDE.md 规则 5)

- **全屏弹窗(center/right)**:经 `ModalProvider.open({ title, content })`。`content` 是函数时可接收 `{ close }` 自行关闭(如「确定」按钮);它只是**面板内容**,外壳由 ModalStack 包 BaseModal。`ActionTypeDialog`/`TextInputDialog`/`RangeStatsDialog`/`IndicatorConfigDialog`/`SettingsDialog` 都是纯内容组件,**不自建面板外壳**。
- **容器内浮层(float)**:直接 `<BaseModal placement="float" x={x} y={y}>`,坐标是**容器内 CSS px**。`DrawingContextMenu` 用这种(操作线确认按钮已是画布实现,无 React 浮层)。
- 新增弹窗不得自建面板外壳样式,一律复用 BaseModal。

### 2. center/right 弹窗必须带 `relative z-10`,否则被自己的遮罩盖住

ModalStack 的结构是 `fixed inset-0 z-[1000+i]` 包裹「`absolute` 遮罩 + BaseModal」。CSS 绘制顺序里 `absolute`(z-auto)会盖过**静态 in-flow** 的弹窗。因此 `BaseModal` 的 center/right `placementClass` **内置了 `relative z-10`**——改 BaseModal 样式时不要去掉,否则所有弹窗面板会跑到遮罩下面(已踩过)。

### 3. 弹窗内容组件保持纯渲染,tsx ≤250 行

弹窗内容/面板组件只做渲染,不做业务。超 250 行即拆分(如 `IndicatorConfigDialog` 拆出 `IndicatorLineEditor`/`IndicatorPeriodEditor`),逻辑继续下沉到 `src/indicators/` 或 `src/drawing/`。

### 4. 样式统一 Tailwind utility + @theme token(根 CLAUDE.md 规则 6)

- 所有 UI 样式用 Tailwind utility 写在 JSX,颜色用 `bg-panel`/`text-ink`/`text-muted`/`text-accent`/`text-up`/`text-down`/`bg-input`/`bg-yellow`/`bg-cyan`/`bg-purple` 等 token,**不写死 hex、不新增手写组件类**。
- 极少数无法 utility 化的全局钩子放 `src/index.css`(如 `.drawing-menu .modal-body` 的 float 布局覆盖)。新增这类钩子要克制。
- 隐藏滚动条但保持可滚:用 Tailwind 任意属性 `[scrollbar-width:none] [&::-webkit-scrollbar]:hidden`,不要为此写 CSS 类。

### 5. KLineChart 是图表壳,不是业务容器

- 图表创建 effect 只跑一次:StrictMode 下会执行两次,须先 `container.replaceChildren()` 再 `createChart`,cleanup 里 `chart.remove()` + 移除监听 + `tools.dispose()` 等。
- 模式开关在**渲染期**同步(`toolsRef.current?.setDrawingEnabled(drawingEnabled)` 等),不要在 effect 里做——渲染期保证每次 props 变化都推给控制器。
- 画线/指标的交互逻辑都在 `src/drawing/`/`src/indicators/`,KLineChart 只负责创建、装配、把回调接线到 React 状态(菜单坐标、区间统计等)。

### 6. 可复用输入组件:`PriceInput`

`PriceInput`(受控 `value`+`onChange`;滚轮 1/10/100 tick、精确 0.01;`w-full` 填父级)被画线编辑菜单、文本标注、操作线创建共用。**新增需要价格输入的地方直接复用**,别重复实现滚轮调价。宽度由父级容器(`w-20` 等)控制。

### 7. 图表浮层坐标:容器内 CSS px + 钳制

`DrawingContextMenu` 的 float 坐标相对 `.kline-chart` 容器:菜单坐标由 `onRequestMenu(ref, x, y)` 传入并在 KLineChart 里钳制到容器范围。(操作线确认按钮是画布实现,坐标由 primitive 渲染、命中由 drawing 层处理,不涉及 React 浮层。)

### 8. 图标:iconify material-symbols 常规字重

图标统一 `@iconify-react/material-symbols/xxx`(常规字重,非 light)。直接 import 组件用,如 `import AddIcon from '@iconify-react/material-symbols/add'`。

## 交互与约定

- 顶部指标栏:常显全部指标,点击名称开关,激活项文字 `text-accent` + 底部短 bar `bg-accent`;内容超宽时隐藏滚动条、**鼠标滚轮横向平滑滚动**(rAF 缓动,仅横向可滚动时接管,不挡页面纵向滚动);末尾「+自定义指标」固定不动(自定义指标后端尚未实现,当前列出内置指标)。
- 画线工具栏激活态:`bg-{color}/20 text-{color}`(价格线/线段=黄、矩形/测量=青、斐波那契=紫、垂直线=ink、文本/操作线=accent)。
- 布局:左侧 DrawToolbar + 中间 `.chart-wrap`(含 KLineChart 与图表浮层)+ 右侧 Sidebar;顶栏三区。
- 自选/浏览数据来自 `src/data/stocks.ts`,自选列表持久化 `mp_watchlist`,设置持久化 `mp_settings`。

## 文件要点

- `App.tsx` — 编排:股票/周期/自选/设置状态、`indicatorConfig` 默认值、9 种画线模式互斥(`clearDrawingModes`,开启任一工具复位其余)、错误横幅、TopBar/DrawToolbar/KLineChart/Sidebar 装配、ModalProvider 包裹。
- `topbar/TopBar.tsx` — 顶栏三区布局(左周期 / 中指标栏 / 右搜索+设置)。
- `topbar/StockSearch.tsx` — 股票搜索输入(回车触发,代码规范化交给 `src/api/stock.ts` 的 `normalizeCode`)。
- `topbar/PeriodSwitcher.tsx` — 日/周/月周期切换。
- `topbar/SettingsButton.tsx` + `SettingsDialog.tsx` — 设置弹窗:`UserSettings`(默认周期/红涨绿跌/高低点标注样式),保存后由 App 持久化 `mp_settings`。
- `IndicatorBar.tsx` — 指标栏:12 个指标元数据(单一数据源 `INDICATORS`,顶栏与添加弹窗共用)、常显全部、激活蓝字+底部短 bar、滚动区隐藏滚动条 + 滚轮平滑横向滚动、+自定义指标。
- `DrawToolbar.tsx` — 左侧画线工具栏:9 种工具互斥开关 + 清除 + 底部「模拟」区两个测试按钮(向上/向下跳动,`onSimulateUp`/`onSimulateDown` → App `simulateMove` 追加次日大涨/大跌 K 线驱动操作线触发);`act(color)` 辅助生成激活态类。
- `KLineChart.tsx` — 图表壳:createChart(StrictMode 兼容)、Candlestick/Volume series、`DrawingTools`/`IndicatorController`/`HistoryLoader`/`VisibleRangeMark`/`CrosshairGainLabel` 装配、模式开关渲染期同步、右键框选/区间统计/操作线/文本标注弹窗接线、画线持久化(storageKey)、图表浮层渲染。操作线确认交互已下沉 drawing 层(画布按钮),无 React 确认浮层。
- `Sidebar.tsx` — 右侧自选/浏览列表(自选可移除、浏览可加入),数据来自 `src/data/stocks.ts`。
- `PriceInput.tsx` — 可复用价格输入:受控、滚轮 1/10/100 tick、精确 0.01、`w-full` 填父级;画线编辑/文本标注/操作线创建共用。
- `modal/ModalProvider.tsx` — 全局弹窗系统:`open`/`close`(可指定 key)、多层堆叠(`z-index 1000+i`、下层半透明)、Esc/点遮罩关最上层;`content` 函数形式注入 `{ close }`。
- `modal/BaseModal.tsx` — 统一弹窗外壳:`placement center`(居中)/`right`(右侧滑入)/`float`(容器内 `absolute` 自定位);center/right **内置 `relative z-10`**(防被遮罩盖住,见关键坑 2);`modal-body` 类保留作 float 布局覆盖钩子。
- `modal/IndicatorConfigDialog.tsx` — 指标参数编辑:数字参数 + 周期行 + 每输出线样式(线色/线宽/线型),草稿态确定后一次性写回 `IndicatorConfig.lineStyles`。
- `modal/IndicatorLineEditor.tsx` — 线样式控件:`LineStyleControls`(色板 + 线宽输入 clamp 1-4 + 实/虚/点线按钮组 + 内联预览)、`clampLineWidth`。
- `modal/IndicatorPeriodEditor.tsx` — 周期行编辑:`PeriodLineRows`(M1/M2 编号 + 周期输入,可内嵌线样式 `withStyle`、移除/新增);`withStyle=false`(BBI)仅编号行。
- `DrawingContextMenu.tsx` — 画线对象左键菜单(float):`PriceInput` 改价(`NO_PRICE_KINDS` 如垂直线隐藏价格行)+ 删除;`isSystem`/`canEdit` 控制禁用。
- `ActionTypeDialog.tsx` / `TextInputDialog.tsx` — 操作价格线/文本标注创建弹窗内容:`PriceInput` 编辑价格 + 确认(经 ModalProvider 外壳)。
- `RangeStatsDialog.tsx` — 右键框选区间统计弹窗内容(区间/交易日数/OHLC/涨跌/涨跌幅/振幅/成交量,涨跌用 up/down 色)。
