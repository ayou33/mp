# src/components

React 层(布局 + 弹窗 + 图表壳),只做「渲染 + 事件接线」,不承载绘制/交互逻辑。画线/指标等业务逻辑下沉到 `src/drawing/`、`src/indicators/` 的非 React 控制器与 primitive。

## 分层结构(自顶向下)

```
App.tsx 编排:股票/周期/设置/自选状态、9 种画线模式互斥、指标配置、错误横幅、ModalProvider 装配、移动端浮层(mobilePanel)与底部操作栏
  ├─ topbar/TopBar.tsx 顶栏:PeriodSwitcher + IndicatorBar + StockSearch + SettingsButton
  │     ├─ PeriodSwitcher 周期切换(日/周/月)
  │     ├─ StockSearch    股票搜索(回车触发,规范化在 src/api/stock.ts)
  │     └─ SettingsDialog 设置弹窗(UserSettings 持久化 mp_settings)
  ├─ IndicatorBar.tsx 指标栏:常显全部指标、激活蓝字+底部短bar、滚轮平滑横向滚动、+自定义指标(用户公式全部追加末尾,点击切换激活,移除在设置弹窗)
  ├─ DrawToolbar.tsx 左侧画线工具栏(9 种工具互斥开关 + 清除 + 底部「模拟」测试按钮)
  ├─ KLineChart.tsx 图表壳:createChart、数据更新、模式开关接线、非 React 控制器装配
  │     ├─ 图表浮层:DrawingContextMenu(画线左键菜单)/ range-select-overlay(操作线确认按钮为画布实现,见 drawing/AGENTS.md)
  │     └─ 经 ModalProvider 打开的弹窗内容:RangeStatsDialog / ActionTypeDialog / TextInputDialog
  ├─ Sidebar.tsx 右侧自选/浏览(自选持久化 mp_watchlist)
  ├─ mobile/MobileActionBar.tsx 移动端底部操作栏(仅 <lg 显示):指标/画线/自选 浮层开关
  └─ modal/ 全局弹窗体系
        ├─ ModalProvider.tsx 弹窗状态:open/close、多层堆叠(遮罩 z-index 1000+i)、Esc/点遮罩关闭
        └─ BaseModal.tsx 统一外壳:placement center/right(经 ModalProvider layer)/ float(容器内自定位)
              └─ 弹窗内容组件:IndicatorConfigDialog(+ IndicatorLineEditor / IndicatorPeriodEditor)
                                     / CustomIndicatorDialog(公式编辑,+ FormulaOutputLines / formulaDialogMeta)
```

**数据流**:React 状态(画线模式/指标配置/股票)通过 props 下传,`KLineChart` 在**渲染期**把模式开关同步到非 React 控制器(`toolsRef.current?.setXxxEnabled(...)`、`indicators.setConfig(...)`);控制器经回调把坐标/图例/数据变更抛回 React 层显示。

## 关键坑(跨文件才能理解)

### 1. 弹窗必须从 BaseModal 衍生,分两种形态(根 AGENTS.md 规则 5)

- **全屏弹窗(center/right)**:经 `ModalProvider.open({ title, content })`。`content` 是函数时可接收 `{ close }` 自行关闭(如「确定」按钮);它只是**面板内容**,外壳由 ModalStack 包 BaseModal。`ActionTypeDialog`/`TextInputDialog`/`RangeStatsDialog`/`IndicatorConfigDialog`/`SettingsDialog` 都是纯内容组件,**不自建面板外壳**。尺寸:`width`(px)或 `widthPct`/`heightPct`(视口百分比,如自定义指标弹窗默认 50/50)。
- **容器内浮层(float)**:直接 `<BaseModal placement="float" x={x} y={y}>`,坐标是**容器内 CSS px**。`DrawingContextMenu` 用这种(操作线确认按钮已是画布实现,无 React 浮层)。
- 新增弹窗不得自建面板外壳样式,一律复用 BaseModal。

### 2. center/right 弹窗必须带 `relative z-10`,否则被自己的遮罩盖住

ModalStack 的结构是 `fixed inset-0 z-[1000+i]` 包裹「`absolute` 遮罩 + BaseModal」。CSS 绘制顺序里 `absolute`(z-auto)会盖过**静态 in-flow** 的弹窗。因此 `BaseModal` 的 center/right `placementClass` **内置了 `relative z-10`**——改 BaseModal 样式时不要去掉,否则所有弹窗面板会跑到遮罩下面(已踩过)。

### 3. 弹窗内容组件保持纯渲染,tsx ≤250 行

弹窗内容/面板组件只做渲染,不做业务。超 250 行即拆分(如 `IndicatorConfigDialog` 拆出 `IndicatorLineEditor`/`IndicatorPeriodEditor`),逻辑继续下沉到 `src/indicators/` 或 `src/drawing/`。

### 4. 样式统一 Tailwind utility + @theme token(根 AGENTS.md 规则 6)

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

### 9. 小屏(<lg)响应式折叠布局

小屏默认只显示绘图区域:指标栏 / 画线栏 / 自选栏通通收起,由底部 `mobile/MobileActionBar`(仅 `lg:hidden` 显示)展开对应浮层。约定:
- **DrawToolbar / Sidebar 用「单实例包装」**:外层 div 在 `hidden lg:flex`(收起)与 `absolute ... z-30 flex lg:static lg:z-auto`(展开)间切换,桌面端恒为 inline 常驻。**不要**把 `hidden` 与 `flex` 同时加到同一元素(Tailwind display 生成顺序不可控)。
- **IndicatorBar 是双实例**:TopBar 内 `hidden min-w-0 flex-1 lg:flex`(桌面常驻),App 内移动端浮层另渲染一份(顶部条覆盖图表),同一 props。
- 浮层背景 `absolute inset-0 z-20 bg-black/40 lg:hidden` 点击关闭;面板 `z-30` 在其上;行容器需 `relative`。
- 断点统一 `lg`(1024px);新增移动端控件一律 `lg:hidden`,桌面增强一律 `hidden lg:*`。

## 交互与约定

- 顶部指标栏:常显全部指标,点击名称开关,激活项文字 `text-accent` + 底部短 bar `bg-accent`;内容超宽时隐藏滚动条、**鼠标滚轮横向平滑滚动**(rAF 缓动,仅横向可滚动时接管,不挡页面纵向滚动);末尾「+自定义指标」固定不动;用户公式指标全部追加在末尾(含未激活,激活态 = `config.custom[id].enabled`),点击名称仅切换激活,移除在设置弹窗。
- 画线工具栏激活态:`bg-{color}/20 text-{color}`(价格线/线段=黄、矩形/测量=青、斐波那契=紫、垂直线=ink、文本/操作线=accent)。
- 布局:左侧 DrawToolbar + 中间 `.chart-wrap`(含 KLineChart 与图表浮层)+ 右侧 Sidebar;顶栏三区。**小屏(<lg)响应式折叠**:指标栏/画线栏/自选栏默认收起,只显示绘图区域;底部 `mobile/MobileActionBar` 展开对应浮层(DrawToolbar 左浮层 / Sidebar 右浮层 / IndicatorBar 顶部条),点击背景关闭;桌面端(lg+)布局不变。
- 图表顶部信息区(左上主图指标值 / 右上 OHLCV+代码周期+名称+回到最新):单一 flex 容器(`left-4 right-[72px]`)内左块指标值 + 右块 `ml-auto`,两侧**永不重叠**;小屏 OHLC `flex-wrap` 自动换行(`text-xs`)、指标区限宽 `max-w-[48%]` 让出右侧空间,桌面端还原单行。
- 自选/浏览数据来自 `src/data/stocks.ts`,自选列表持久化 `mp_watchlist`,设置持久化 `mp_settings`。

## 文件要点

- `App.tsx` — 编排:股票/周期/自选/设置状态、`indicatorConfig` 默认值、9 种画线模式互斥(`clearDrawingModes`,开启任一工具复位其余)、错误横幅、TopBar/DrawToolbar/KLineChart/Sidebar 装配、ModalProvider 包裹;移动端浮层:`mobilePanel` 状态 + DrawToolbar/Sidebar 单实例响应式包装 + IndicatorBar 顶部浮层 + 背景关闭 + 底部 `MobileActionBar`。
- `mobile/MobileActionBar.tsx` — 移动端底部操作栏(仅 `lg:hidden` 显示):指标/画线/自选 三个开关按钮,点击展开/收起对应浮层面板(`MobilePanel` 类型)。
- `topbar/TopBar.tsx` — 顶栏三区布局(左周期 / 中指标栏 / 右搜索+设置)。
- `topbar/StockSearch.tsx` — 股票搜索输入(回车触发,代码规范化交给 `src/api/stock.ts` 的 `normalizeCode`)。
- `topbar/PeriodSwitcher.tsx` — 日/周/月周期切换。
- `topbar/SettingsButton.tsx` + `SettingsDialog.tsx` — 设置弹窗:`UserSettings`(默认周期/红涨绿跌/高低点标注样式),保存后由 App 持久化 `mp_settings`;另含「自定义指标」管理区:列出全部用户公式(从 `USER_FORMULA_RECORDS` 初始化,本地 state 维护即时移除,因弹窗内容闭包不随 App 重渲染刷新),每行「移除」按钮调 `onDeleteCustomFormula`。
- `IndicatorBar.tsx` — 指标栏:12 个指标元数据(单一数据源 `INDICATORS`,顶栏与添加弹窗共用)、常显全部、激活蓝字+底部短 bar、滚动区隐藏滚动条 + 滚轮平滑横向滚动、+自定义指标;用户公式指标全部追加末尾(含未激活),激活态 = `config.custom[id].enabled`,点击切换,编辑弹窗可删。
- `DrawToolbar.tsx` — 左侧画线工具栏:9 种工具互斥开关 + 清除 + 底部「模拟」区两个测试按钮(向上/向下跳动,`onSimulateUp`/`onSimulateDown` → App `simulateMove` 追加次日大涨/大跌 K 线驱动操作线触发);`act(color)` 辅助生成激活态类。
- `KLineChart.tsx` — 图表壳:createChart(StrictMode 兼容)、Candlestick/Volume series、`DrawingTools`/`IndicatorController`/`HistoryLoader`/`VisibleRangeMark`/`CrosshairGainLabel` 装配、模式开关渲染期同步、右键框选/区间统计/操作线/文本标注弹窗接线、画线持久化(storageKey)、图表浮层渲染。操作线确认交互已下沉 drawing 层(画布按钮),无 React 确认浮层。
- `Sidebar.tsx` — 右侧自选/浏览列表(自选可移除、浏览可加入),数据来自 `src/data/stocks.ts`。
- `PriceInput.tsx` — 可复用价格输入:受控、滚轮 1/10/100 tick、精确 0.01、`w-full` 填父级;画线编辑/文本标注/操作线创建共用。
- `modal/ModalProvider.tsx` — 全局弹窗系统:`open`/`close`(可指定 key)、多层堆叠(`z-index 1000+i`、下层半透明)、Esc/点遮罩关最上层;`content` 函数形式注入 `{ close }`;`ModalConfig` 支持 `widthPct`/`heightPct` 视口百分比尺寸。
- `modal/BaseModal.tsx` — 统一弹窗外壳:`placement center`(居中)/`right`(右侧滑入)/`float`(容器内 `absolute` 自定位);center/right **内置 `relative z-10`**(防被遮罩盖住,见关键坑 2);`modal-body` 类保留作 float 布局覆盖钩子;`widthPct`/`heightPct` 按 `vw`/`vh` 百分比设宽高(50/50 = 窗口一半),`widthPct` 存在时去掉默认 `w-[420px]`。
- `modal/IndicatorConfigDialog.tsx` — 指标参数编辑:数字参数 + 周期行 + 每输出线样式(线色/线宽/线型),草稿态确定后一次性写回 `IndicatorConfig.lineStyles`。
- `modal/IndicatorLineEditor.tsx` — 线样式控件:`LineStyleControls`(色板 + 线宽输入 clamp 1-4 + 实/虚/点线按钮组 + 内联预览)、`clampLineWidth`。
- `modal/CustomIndicatorDialog.tsx` — 自定义公式指标弹窗(顶栏 `+自定义指标`):手写公式定义指标;单表达式走形态选择(line/area/histogram/baseline/band);多输出脚本(任一 `NAME = EXPR`)每行一条输出,可独立选形态(折线/面积/柱状/基线/区间,band 需下轨、baseline 可设基准值;`NAME := EXPR` 为私有中间变量,只计算不渲染;字段支持简写 C/O/H/L/V);每行还可配 显示名 / Y轴(主轴/独立轴)/ 显示开关(隐藏仍参与计算);挂载位置(主图/副图)+ 每线样式;保存写 `mp_custom_formulas`(含 outputSpecs)+ `config.custom[id]`(rev 自增);弹窗根 `min-h-full` + 主公式 textarea `flex-1` 自适应撑开竖向空白;band 单输出形态下主/下轨输入区各 `flex-1` 五五等分;"公式"标签旁问号图标(help-outline)切换左侧通高说明面板;「测试」按钮(FormulaTestArea)与保存共用 `assembleFormulaSpec` 编译校验,并对当前 K 线(无数据用合成样例)求值统计,保证提交后指标可正常运作。
- `modal/FormulaOutputLines.tsx` — 公式多输出 UI 组装:`FormulaOutputLines`(每 NAME 一行 `FormulaOutputLineRow`)、`FormulaOutputSection`(多输出逐行配置,无全局 Y 轴)、`FormulaHelp`(字段/函数/脚本语法帮助);转发导出共享常量/控件。
- `modal/FormulaOutputLineRow.tsx` — 单条输出编辑行:形态选择 + 显示名/Y轴/显示开关 + band 下轨/baseline 基准值 + 线样式。
- `modal/formulaOutputShared.tsx` — 公式弹窗共享 UI:`SegmentedControl`(通用分段选择)、`SHAPE_OPTIONS`/`SCALE_OPTIONS`、`INPUT_CLS`/`TEXTAREA_CLS`。
- `modal/formulaDialogMeta.ts` — 公式弹窗纯逻辑(非组件):`assembleFormulaSpec`(校验公式并组装 `FormulaIndicatorSpec`,保存与测试共用,失败抛 Error;不校验名称)/`buildFormulaCommit`(校验名称 + 构造记录/实例配置,失败抛 Error;新指标默认 `enabled: false` 不激活,编辑保留原激活态;脚本模式构造 `outputSpecs` 并校验 band 下轨/基线基准值/至少一条输出(含 STICKLINE);样式一律来自行尾声明,保存时清空 `lineStyles` 面板覆盖)`、`initLineShapes`/`initLineLower`/`initLineBase`/`initLineLabels`/`initLineScales`/`initLineVisible`/`formulaLineNames`(编辑模式恢复草稿;formulaLineNames 过滤 `:=` 私有变量与 STICKLINE 竖条)、`PANE_OPTIONS`;`SHAPE_OPTIONS`/`SCALE_OPTIONS`/`TEXTAREA_CLS`/`INPUT_CLS` 从 `FormulaOutputLines` 转发。
- `modal/FormulaTestArea.tsx` — 公式测试区(弹窗内):「测试」按钮(play-arrow)+ 结果面板;`buildSpec` 回调从弹窗状态组装公式定义,首次点击后随输入实时重跑;`bars` 为当前 K 线,缺省用合成样例。
- `modal/FormulaTestPanel.tsx` — 公式测试结果面板:通过/未通过 + 编译/运行错误 + 每输出 有效点数/min/max/最新值 + 无数据警告。
- `modal/useFormulaTest.ts` — 公式测试 hook(非 tsx):维护测试结果状态,首次请求后随 `deps` 变化自动重跑。
- `modal/FormulaHelpPanel.tsx` — 公式特性说明悬浮面板(问号图标触发,`BaseModal placement="float"` 在弹窗左侧通高悬浮):字段 / 函数 / 指标成员引用(KDJ().K、MACD().DIF、BOLL().MID、RSI() 等)/ 运算符 / 输出形态 / 多输出脚本(含 `NAME := EXPR` 私有变量、字段简写 C/O/H/L/V)/ 挂载与轴 + 综合示例;纯内容组件不自建外壳。
- `modal/IndicatorPeriodEditor.tsx` — 周期行编辑:`PeriodLineRows`(M1/M2 编号 + 周期输入,可内嵌线样式 `withStyle`、移除/新增);`withStyle=false`(BBI)仅编号行。
- `DrawingContextMenu.tsx` — 画线对象左键菜单(float):`PriceInput` 改价(`NO_PRICE_KINDS` 如垂直线隐藏价格行)+ 删除;`isSystem`/`canEdit` 控制禁用。
- `ActionTypeDialog.tsx` / `TextInputDialog.tsx` — 操作价格线/文本标注创建弹窗内容:`PriceInput` 编辑价格 + 确认(经 ModalProvider 外壳)。
- `RangeStatsDialog.tsx` — 右键框选区间统计弹窗内容(区间/交易日数/OHLC/涨跌/涨跌幅/振幅/成交量,涨跌用 up/down 色)。
