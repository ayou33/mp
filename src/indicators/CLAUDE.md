# src/indicators

指标子系统:主图 MA/EMA/BBI/BOLL + 副图 RSI/MACD/KDJ/WR/CCI/OBV/ATR/DMI。基于 lightweight-charts v5 的 series 与 primitives API 装配,纯函数计算指标值。各指标参数与输出线样式(线色/线宽/线型)通过编辑面板调整(`IndicatorConfig` + `lineStyles`),由 App 持久化到 localStorage。

## 分层结构(严格自顶向下)

```
KlineBar[] (数据层)
   │  calcMA / calcEMA / calcBBI / calcBOLL / calcRSI / calcMACD / calcKDJ /
   │  calcWR / calcCCI / calcOBV / calcATR / calcDMI   ← 纯函数,只算值,输出 IndicatorPoint[]
   ▼
subCharts.ts (SubChartIndicatorDef 定义:组件集合 + calc(bars, params))
   │  SubChartIndicator 装配 series(应用 lineStyles)、轴标签、角标、十字光标
   │  editorMeta.ts (INDICATOR_META:各指标参数 + 输出线编辑元数据,驱动编辑面板)
   ▼
IndicatorController 统一调度:主图 MA/EMA/BBI/BOLL + 副图按激活顺序重建 + 十字光标图例
   │
   ▼
IndicatorAxis.ts 价格轴标签 primitive + 副图左上角角标 primitive
```

新指标扩展路径:**纯函数(`ma.ts` 风格)→ `subCharts.ts` 定义(RSI_DEF 风格)→ `SUB_CHART_DEFS` 注册**;若要支持参数/线样式编辑,同步在 `editorMeta.ts` 的 `INDICATOR_META` 补参数与输出线描述。React 组件只调 `IndicatorController.setConfig/update`。

## 关键坑(跨文件才能理解)

### 1. 就地变更状态对象,绝不整体替换(`IndicatorAxis.ts` / `SubChartIndicator.ts`)

primitive 构造时捕获 `IndicatorAxisState` / `PaneLabelState` / `FibDataSource` 等状态对象的**引用**。更新必须就地改属性(`state.items = ...`、`item.value = ...`),**绝不能整体替换该对象**(`state = {...}`)——primitive 会一直渲染旧空对象。改动后用 `attached()` 注入的 `requestUpdate?.()` 强制重绘。

### 2. 主图与副图 autoScale 策略不同

- **主图** autoScale 必须 `false`(垂直拖动手势,见根 CLAUDE.md 关键坑 1),价格区间由上层手动适配。
- **副图**(`SubChartIndicator` 构造里)显式 `autoScale: true` + `scaleMargins { top: 0.12, bottom: 0.12 }`,自适应自身数据区间。不要给副图关 autoScale。

### 3. 副图 pane 排列:按激活先后,靠重建保证(`IndicatorController.ts`)

副图 pane 从上到下按**激活先后**排列:先启用的在上、后启用的在下,**不固定位置**。`IndicatorController` 用 `_subOrder: string[]` 维护激活顺序——`setConfig` 时对比新旧配置(`_updateSubOrder`):新启用者 append 到末尾、关闭者移除;构造函数按注册顺序取初始已启用的副图。改副图位置 = 先关再开(重新启用会排到最下)。

lightweight-charts **不支持重排 pane**,开关变化时 `_syncSubCharts` 仍**销毁全部副图再按 `_subOrder` 顺序重建**,这是唯一稳定保证顺序的方式。`dispose()` 与换股重配都会走这条路径。

### 4. 副图组件绘制顺序:histogram 先建

`SubChartIndicator` 构造时把 histogram 组件排在前面先 `addSeries`——lightweight-charts **后添加的 series 绘制在上层**,柱状图需置于线条之下。修改 `subCharts.ts` 里 MACD 组件顺序时要留意这层排序逻辑(构造里按 type 重新排序,与定义顺序无关)。

### 5. 十字光标图例:值跟随十字线,无十字线回退最新值

`IndicatorController._onCrosshairMove` 更新副图角标并输出 OHLCV(右上)+ 主图指标值(左上);`_emitLegend` 用空 `MouseEventParams` 回退显示最新 K 线值。新增图例项必须同时实现「十字线值优先、最新值兜底」两条路径,否则十字线移出图表区后数值消失。

### 6. OHLCV 颜色与昨收计算

- 当日 K 线颜色按**开收阴阳**(阳红阴绿),整个 OHLCV/涨跌区块统一用 `dayColor = close >= open ? UP : DOWN`。
- 昨收取「当前 bar 的前一根」:十字线按时间 `findIndex` 定位;无十字线取最新一根的前一根。prevClose 为 0 时跳过涨跌区块。

### 7. 副图 pane 高度:用拉伸系数而非像素(`SubChartIndicator.ts`)

lightweight-charts v5 各 pane 默认拉伸系数(stretch factor)均为 1,即主图与每个副图**等高**(默认开 MACD+KDJ 时主图仅占 1/3)。为降低副图默认高度,`SubChartIndicator` 构造时调 `this._anchor.getPane().setStretchFactor(SUB_CHART_STRETCH)`(常量 `0.5`,副图约主图一半高)。改动要点:

- **每次构造都要设置**:`_syncSubCharts` 开关变化时销毁全部副图再重建,pane 随空被移除、新建后拉伸系数重置为 1,不能只在首次设置。
- 拉伸系数是**比例**而非像素,随容器尺寸自适应;若需改副图高度只调 `SUB_CHART_STRETCH` 常量即可。

### 8. 指标参数与输出线样式:config 驱动,默认色多处需同步

`IndicatorConfig` 新增各指标参数字段(`rsiPeriod`/`macdFast`/`wrPeriods` 等)+ `lineStyles: Partial<Record<IndicatorId, Record<string, IndicatorLineStyle>>>` 每线样式覆盖。编辑面板(`IndicatorConfigDialog` 由 `INDICATOR_META` 驱动)改动后经 `setConfig` 全量重算。

- **副图**:`_subParams()` 从 config 派生 `SubChartParams`,随构造传入 `SubChartIndicator`;`calc(bars, params)` 读参数(缺省用 def 默认)。线样式 `mergeLineStyle(styles?.[componentKey], { color: c.color })` 解析——histogram 组件仅 color 生效(无 lineWidth/lineStyle)。
- **主图**:`_lineStyle()`/`_applyMainStyle()` 解析 MA/EMA/BBI/BOLL 样式(config 覆盖优先,否则常量默认),series `applyOptions` 与轴标签/图例色共用。
- **`_syncSubCharts` 重建条件** = 激活顺序相同 **且** `JSON.stringify([_subOrder, _subParams(), lineStyles])` 签名相同;改参数/线样式会触发副图重建。
- 默认线色**三处需同步**:`IndicatorController` 的 `MA_COLORS`/`EMA_COLORS`/`BOLL_*`/`BBI_COLOR`、`subCharts.ts` 组件 `color`、`editorMeta.ts` 的 `defaultColor`。
- 内联周期行(MA/EMA/WR)每行左侧用 **`M1/M2...`** 编号标识——「周期 + 该线样式」同行时线无法命名,统一用 M 序号作标签。

## 数据流与约定

- 指标计算全部是纯函数,输入 `KlineBar[]`,输出 `IndicatorPoint[]`(`{ time, value }`);MACD 柱额外带每点 `color`(`MacdBarPoint`,正红负绿半透明,与成交量柱同风格)。
- `IndicatorPoint`/`KlineBar` 定义在 `src/types`(上层共享)。
- 指标线均关闭价格线/末值标签(`priceLineVisible: false, lastValueVisible: false`),值标签由 primitive 自绘。
- 颜色:A 股**红涨绿跌**。MA 五色循环 `['#f0b90b', '#2962ff', '#f23645', '#00bcd4']`;EMA 四色 `['#26c6da', '#ce93d8', '#ef9a9a', '#a5d6a7']`;BOLL 中轨 `#4fc3f7`/上下轨 `#26c6da`;BBI 青 `#00bcd4`;RSI 紫 `#b685f0`;MACD DIF 金/DEA 蓝/MACD 柱红绿;KDJ K 金/D 蓝/J 紫;WR WR6 青/WR14 紫;CCI 金;OBV 浅蓝;ATR 橙;DMI PDI 红/MDI 绿/ADX 金/ADXR 紫。改色同步改 `IndicatorController` 里的 `MA_COLORS`/`EMA_COLORS`/`BOLL_*`、`subCharts.ts` 对应常量与 `editorMeta.ts` 的 `defaultColor`。
- 输出线样式:`IndicatorConfig.lineStyles[indicatorId][lineKey]`(lineKey:MA/EMA=索引字符串、BOLL=upper/mid/lower、BBI=bbi、副图=组件 key),未覆盖的线用默认。整个 `IndicatorConfig` 以结构化 JSON 持久化到 `mp_indicator_config`(后续可扩展服务器同步)。
- 周期越界的指标输出空数组(如 `calcMA` 在 `bars.length < period` 时返回 `[]`),上层 `setData([])` 即隐线,无需特判。

## 文件要点

- `IndicatorController.ts` — 指标总控制器(非 React):`IndicatorConfig` 开关/参数/`lineStyles`、`IndicatorId`、主图默认线色常量、`ChartLegend` 图例(ohlcv/indicators 双路)、主图 MA/EMA/BBI/BOLL 装配(`_lineStyle`/`_applyMainStyle` 应用样式覆盖,轴标签按可见顺序经 `_axisItemBySeries` 重建)、副图按激活顺序 `_subOrder` + 参数/样式签名重建(`_subParams`)、十字光标图例。主图轴标签状态 `_mainAxisState` 就地更新。
- `IndicatorAxis.ts` — 两个自绘 primitive:`IndicatorAxisPrimitive`(主图价格轴指标值标签,多值按 y 排序、`resolveNonOverlap` 防重叠、方标签盒左缘 x=0、文本起始 10 与库绘轴 label 左对齐)与 `PaneLabelPrimitive`(副图左上角角标,分段着色)。共享 `IndicatorAxisState`/`PaneLabelState`。
- `SubChartIndicator.ts` — 单个副图指标实例:组件 series(独立 pane)、价格轴同色标签、左上角标、十字光标/最新值。定义 `IndicatorLineStyle`/`SubChartParams`/`mergeLineStyle`;构造接收 params + 每线样式覆盖,series 选项与轴标签/角标色用解析后有效色。被控制器按开关创建/销毁。
- `subCharts.ts` — 副图指标定义(`RSI_DEF`/`MACD_DEF`/`KDJ_DEF`/`WR_DEF`/`CCI_DEF`/`OBV_DEF`/`ATR_DEF`/`DMI_DEF`),`calc(bars, params)` 读参数缺省用默认周期,只声明组件集合与 calc,不含渲染逻辑。新副图指标在此扩展。
- `editorMeta.ts` — 编辑面板元数据:`INDICATOR_META`(各指标可编辑参数 + 输出线描述;MA/EMA/WR 用 `inlineLines: true` 让「周期 + 该线样式(颜色/线宽/线型)」同行编辑、线随周期动态;BBI 的 array 参数与输出线非一一对应,编号行(`M1/M2...`,左对齐)不内嵌样式,单条 BBI 线样式在下方单独编辑),默认线色取自 `IndicatorController`/`subCharts.ts` 常量。
- `ma.ts` / `ema.ts` / `bbi.ts` / `boll.ts` / `rsi.ts` / `macd.ts` / `kdj.ts` / `wr.ts` / `cci.ts` / `obv.ts` / `atr.ts` / `dmi.ts` — 纯函数计算,各带公式与起始索引注释(MA 从第 period 根;EMA 自第一根、初值取首收;BOLL 输出 {mid/upper/lower};RSI 用 Wilder 平滑;MACD 从第一根;KDJ 初值 50 从第一根;WR 区间 [-100,0];OBV 累计量;ATR 用 Wilder 平滑;DMI 输出 {pdi/mdi/adx/adxr})。
