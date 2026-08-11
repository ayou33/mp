# src/drawing

自研画线子系统(不走 klinecharts):线段/射线/直线 + 矩形 + 测量 + 斐波那契回调/扩展 + 垂直线 + 文本标注 + 水平价格线 + 操作价格线(带状态机的生命周期对象),基于 lightweight-charts v5 primitives API。非 React,纯控制器 + primitive,React 层只做渲染与事件接线。

## 分层结构(自顶向下)

```
DrawingTools.ts 总控制器(非 React):按 kind 优先级路由事件、右键框选统计、右键取消画线、统一存取
   │
   ├─ DrawingTool.ts 抽象基类:统一事件钩子 + 序列化接口 + 锚点吸附辅助 + _enabled/isEnabled
   │     ├─ LineTool.ts       线段/射线/直线(自绘 LinePrimitive)
   │     ├─ RectTool.ts       矩形(自绘 RectPrimitive,两对角锚点)
   │     ├─ MeasureTool.ts    测量(自绘 MeasurePrimitive,两点 + 价差/涨跌幅/根数标签)
   │     ├─ FibTool.ts        斐波那契回调(自绘 FibonacciPrimitive)
   │     ├─ FibExtTool.ts     斐波那契扩展(自绘 FibExtPrimitive,三点 A/B/C)
   │     ├─ VerticalLineTool.ts 垂直线(自绘 VerticalLinePrimitive,单时间点,无价格)
   │     ├─ TextTool.ts       文本标注(自绘 TextPrimitive,单点 + React 弹窗输入)
   │     ├─ PriceLineTool.ts  水平价格线(库自带 createPriceLine)
   │     └─ ActionPriceLineTool.ts 操作价格线(自绘,状态机+触发检测+呼吸动画)
   │
   ├─ types.ts 统一类型:kind / LineType / AnchorPoint / SerializedDrawing / DrawingRef
   └─ persistence.ts localStorage 持久化(drawingStorageKey / loadDrawings / saveDrawings)
```

**数据流向**:工具持有数据源对象(如 `LineDataSource`),primitive 构造时捕获其引用并在每次渲染读取;放置/拖拽/删除时**就地变更**数据源 + `requestUpdate()`,primitive 自动重绘。

## 关键坑(跨文件才能理解)

### 1. 数据源引用语义:就地变更,绝不整体替换

primitive 构造时捕获数据源对象引用(`this._data`)。**绝不能整体替换该对象**(`d = { lines: [] }` 或 `this._data = {...}`)——primitive 一直渲染旧对象。清空/重置必须就地改属性(`d.lines = []`、`d.pending = []`、`d.preview = null`)。详见根 AGENTS.md 关键坑 2。`clear()`/`restore()` 都遵循此模式。

### 2. 事件路由:容器级 pointerdown(capture)+ 优先级

`DrawingTools` 在容器上挂 **capture 阶段**的 `pointerdown`,命中可拖拽对象时 `preventDefault()` + `stopPropagation()`,阻止图表同步平移(见根 AGENTS.md 关键坑 4)。点击/十字光标按 `_tools` 数组顺序(line → fib → price-line)路由,`onClick` 返回 true 表示已消费。**新增画线类型需**:继承 `DrawingTool` + 加入 `_tools` + 在 `DrawingTools` 提供对应开关方法。

### 3. 拖拽与「点击弹菜单」的区分

`pointerdown` 记录命中控制点(`_anchorPress`),`pointerup` 时若未移动(>5px)判定为点击 → 弹菜单;拖拽结束抑制下一次 click(`suppressNextClick`/`consumeSuppressedClick`),避免拖动松手误放新画线。改这两条路径要同时照顾 `DrawingTools._onPointerUp` 与各工具的 `onClick` 消费逻辑。

### 4. 放置锚点跨重渲染存活:`setEnabled` 幂等

React 组件每次渲染都会调 `setEnabled`,**不能无条件清空 pending**——否则两次点击之间一次重渲染就把第一个锚点丢了(画不出线)。仅当启用状态/类型**真正变化**时才丢弃未完成锚点(`changed` 判断)。`LineTool.setEnabled` 是唯一有这层处理的,改它或加新工具要沿用该模式。

### 5. 空白区点击:时间吸附(`_pointFromParams`)

点击落在无 K 线区(默认视图右侧预留空白)时 `param.time` 为 undefined,需用 `timeScale().coordinateToLogical` → 钳制索引 → `dataByIndex(idx, MismatchDirection.NearestRight)` 吸附到最近 K 线时间,保证锚点放得下。拖拽锚点同理(`DrawingTool.moveAnchor`)。吸附失败(返回 null)则该次点击不产生画线。

### 6. 右键框选与浏览器菜单的对抗

右键按下启动框选(`_rangeStart`),拖动更新选区矩形,松开后横向距离 ≥20px 才计算区间统计。浏览器原生菜单在 document 层拦截:框选进行中 / 框选后标志(`_suppressContextMenu`,吞掉松开后补发的 contextmenu,可能落在统计弹窗上)/ 目标在 `.chart-wrap` 内,三条件任一即 `preventDefault`。改弹窗 DOM 结构时注意 `_chartWrap` 的 `closest('.chart-wrap')` 判定。

**画线模式激活时右键语义被覆盖**:`_onPointerDown` 先经 `_tools.some(t => t.isEnabled())` 判断是否有画线工具激活,是则右键用于「取消画线」——`_cancelDrawing()` 清理未完成锚点(`LineTool/FibTool.cancelPending`)+ `onRequestCancelDrawing` 回调 React 复位模式开关,**不启动框选**;无工具激活时右键才是区间框选。工具激活状态统一存于基类 `_enabled`(`DrawingTool.isEnabled()`),新增工具继承即自动纳入该判断。

### 7. 持久化:统一 `SerializedDrawing` 格式

`serializeAll()` 导出统一格式(可 JSON 化),`restoreAll()` 先 `clearAll()` 再按 kind 分发回写。序列化时 `time` 转字符串(`String(l.time)`),回写时 `_nextId` 需推进到 `max(id)+1` 防止 id 冲突。`persistence.ts` 的 key 模式 `mp_drawings:<code>:<period>`(与 mp_settings 同模式)。**换股/切周期必须换 key**——旧股票的画线别画到新股票上。

### 8. 操作价格线:状态机、呼吸定时器与触发检测

- **状态机**:`armed`(按操作类型配色)→ `triggered`(到达目标价,待确认)→ `executed`/`violated`(终态,仍可删除)。
- **触发方向** `direction`:创建/拖拽改价时按「目标价 vs 最新收盘价」确定(目标在上 → `up`,用 `high >= price` 判定;在下 → `down`,用 `low <= price`),high/low 覆盖跳空。
- **`createdAt`**(创建时最新 bar 时间)保证「未来第一次到达」跨刷新语义:`checkTriggers` 以 **最新数据时间 > createdAt** 为触发门槛(行情确实更新——未更新时刷新/恢复不误触刚创建的对象),门槛通过后 **自 createdAt 含起扫描**(同一根 K 线、即创建所在的那根 bar 也能触发);缺失退化只看最新 K 线。
- **触发检测挂载点**:`KLineChart` 数据 `[bars, storageKey]` effect 中 `tools.checkTriggers(bars)`,覆盖恢复/换股/加载更多。
- **呼吸动画**:工具在存在 `triggered` 时用 `setInterval`(33ms)调 `requestUpdate` 驱动 primitive 内 `performance.now()` 算 alpha。**定时器只调 requestUpdate,绝不碰 `_data`**,与「就地变更」坑(关键坑 1)不冲突。所有状态变化点调 `_syncBreathing()` 启停。
- **确认交互(全画布)**:triggered+user 对象由 primitive 画布绘制**确认条**——`[已执行(绿底 ✓icon)] [未执行(红底 ✕icon)]` 依次排列,**无间隔、无圆角、仅背景区分**,垂直中线与价格线重合,**右缘贴 pane 边缘紧贴价格轴的类型 label**(类型 label 仍由价格轴 `ActionAxisView` 显示,`visible()` 恒 true,只显示操作类型文字)。勾/叉为画布描边 icon 路径(非文字字形)。点击路由:`ActionPriceLineTool.onPointerDown` 先命中 `hitTestConfirm`(几何与绘制共用 `CONFIRM_BTN` 常量)并消费按下(设 `_pressHit` 阻止误开创建框、阻止图表平移),`DrawingTools._onPointerUp` 再命中测试确认 → `confirmAction`(校验 `canUserModify` 后 `setStatus`),不弹左键菜单。**确认条在价格线上下(条高区间内)均可点击**,不限于控制点命中阈值。确认后确认条消失,确认状态由线条样式区分(executed 白细线 / violated 红虚线+填充);**轴 label 为纯文本不渲染 icon 路径,故不带 ✓/✕**(确认条上的勾叉 icon 才是画布绘制)。确认条布局常量 `CONFIRM_BTN` 导出自 `ActionPriceLinePrimitive`,改几何时绘制与命中测试两侧需同步;**条高需与库 primitive 轴 label 绘制盒高一致**(默认 `layout.fontSize=12` 时轴 label 盒高 = 12 + 上下额外内边距 2.5+2 各乘比例 = 21px,故 `CONFIRM_BTN.height=21`;改图表 layout 字号需同步);**垂直定位用 `axisLabelBox()`**(镜像库 `PriceAxisViewRenderer` 的舍入:yMid 四舍五入 + 盒高奇偶对齐),绘制与 `hitTestConfirm` 两侧共用,保证与库绘轴 label 像素级对齐(否则精确居中会差 ~1px)。
- **几何锁定**:非 armed 状态不可拖拽/改价(`onPointerDown` 仅 armed+user 启动 drag;`setControlPointPrice` 仅 armed 生效;菜单 `canEdit` 控制输入框)。

## 交互与约定

- 颜色:线段统一 `#4fc3f7`(`LINE_COLOR`)、斐波那契 `#b685f0`(`FIB_COLOR`)、价格线 `#f0b90b`。
- 命中阈值统一 `HIT_THRESHOLD = 8`(px,从 `DrawingTool` 导出)。
- 锚点时间吸附到最近 K 线,价格跟随鼠标坐标;system 对象不可拖拽/改价,但关闭工具后仍可拖拽调整(命中不依赖启用状态)。
- **取消画线**:任意画线模式激活时右键单击 → 退出画线模式(清理未完成锚点 + 复位所有模式开关),此时右键不再框选;无激活模式时右键才是区间框选。
- 归属标记存于各数据对象(`source?`),控制点菜单(React 层弹出)通过 `DrawingRef{ kind, id, point? }` 定位操作对象。
- 悬停高亮:`setHover` 只在高亮 id 变化时触发重绘;primitive 用 `highlight` 画白色外圈圆环。价格线通过 `applyOptions({ lineWidth })` 加粗。

### 系统 / 用户权限模型

**一句话定义**:用户主动通过界面交互生成的画线对象 = **user** 类型;由程序生成、无用户交互的画线对象 = **system** 类型。

画线对象分 user/system 两类,由「谁创建」决定、创建后不可转换,`SerializedDrawing.source` 持久化,旧数据缺省视为 user。用户放置(点击/拖拽/菜单)创建的都是 user;系统对象只经 `systemCreate` 创建。

- **系统程序**:拥有完全权限,可创建/更新/删除**所有类型**对象。
- **用户**:只能修改/删除 user 类型对象;可与**所有类型交互**(悬停高亮、点击弹菜单查看)。拖拽锚点/价格线视为**修改**,用户不可拖拽 system 对象。操作线的「确认执行」属交互,但仅限 user 对象(system 操作线由系统管理,`confirmAction` 有 `canUserModify` 守卫)。交互规则后续细化。
- 权限落点(改权限时三处都要同步):
  1. **用户修改入口统一在 `DrawingTools`**:`deleteDrawing`/`setControlPointPrice` 先校验 `tool.canUserModify(ref)`(= 非 system),不通过直接忽略。
  2. **系统入口**(`systemDelete`/`systemSetControlPointPrice`/`systemCreate`/`systemClearAll`)不受限;各工具底层 `setControlPointPrice` **不校验** source(用户权限在 DrawingTools 入口统一校验)。
  3. **拖拽**在各工具 `onPointerDown` 直接跳过 `source === 'system'`。
  4. **清除**:`clearAll()`(用户「清除」按钮)只清 user 对象;换股重置用 `systemClearAll()`(清全部,系统对象随新股票重算)。`restoreAll()` 内部系统级清空。

## 文件要点

- `DrawingTools.ts` — 总控制器:`DrawingToolsOptions` 依赖注入(getBarCount/getBars/onRequestMenu/onRangePreview/onRangeSelect/onRequestCreateAction/onRequestCreateText/onRequestCancelDrawing/onChange)、模式开关(setXxxEnabled 委托各工具)、`serializeAll`/`restoreAll`、右键框选区间统计(`RangeStats`)、右键取消画线(`_cancelDrawing` + `onRequestCancelDrawing`)、事件订阅与清理;权限入口分流——用户入口 `deleteDrawing`/`setControlPointPrice`(校验 `canUserModify`)、系统入口 `systemDelete`/`systemSetControlPointPrice`/`systemCreate`/`systemClearAll`。`DrawingKind` 等类型在此 re-export 兼容旧导入。
- `DrawingTool.ts` — 抽象基类:kind 标注、抽象数据接口(clear/clearUser/hitTest*/serialize/restore/delete/getControlPointPrice/getSource/systemAdd...)、可选事件钩子(onClick/onCrosshairMove/onPointer*)、`canUserModify()`(用户视角:非 system)、`_enabled` + `isEnabled()`(激活状态,各 `setEnabled` 维护;右键取消画线据此判断)、`moveAnchor` 吸附辅助、`HIT_THRESHOLD`。`_getBarCount` 为 protected,子类可自行吸附时间。
- `types.ts` — 统一类型:`DrawingKind = 'line' | 'fib' | 'price-line' | 'action-line' | 'rect' | 'text' | 'vertical-line' | 'fib-ext' | 'measure'`、`LineType`、`ActionType/ActionStatus/ActionDirection`、`SerializedDrawing`(按 kind 分布字段:line 含 lineType+p1+p2;rect/measure p1+p2;fib-ext 含 p3;text 含 text+p1;vertical-line 含 time;action-line 含 price/action/status/direction/createdAt)、`DrawingRef`(含 `point` 下标定位锚点)。
- `LineTool.ts` / `FibTool.ts` — 自绘工具的对称实现:构造时 `attachPrimitive`、两次点击放置、十字光标预览、锚点拖拽吸附、删除/价格编辑、`distToSegment` body 命中。逻辑几乎对称,新两点类工具照此复制改造。
- `RectTool.ts` / `MeasureTool.ts` — 两点类工具,照 FibTool 复制改造:Rect 两对角锚点(命中为矩形内部),Measure 两点 + primitive 渲染期实时算价差/涨跌幅/根数。两者均有 `cancelPending`(右键取消画线清理)。
- `FibExtTool.ts` — **首个三点类工具**(A/B/C):`pending` 支持 3 个锚点(`onClick` 满 2 个后第 3 点收尾,用 preview 或点击点),`onCrosshairMove` 在 pending 1/2 时更新预览;拖拽/价格编辑按 `point 0/1/2` 定位三锚点。
- `VerticalLineTool.ts` — 单时间点贯穿竖线:**无价格概念**(`getControlPointPrice` 返回 null、`setControlPointPrice` 空实现),菜单不显示价格输入(React 层 `NO_PRICE_KINDS` 控制);横向拖拽用 `_snapTime`(coord→logical→dataByIndex 吸附)。
- `TextTool.ts` — 单点文本:激活模式点击 → `onRequestCreateText(pt, submit)` 回调 React 弹窗输入文本与价格,确认后 `addLabel(pt, text, price)` 创建(价格用面板编辑值,缺省取点击处)。
- `PriceLineTool.ts` — 价格线基于库自带 `createPriceLine`(非自绘),`_items` 存 `{ id, line, price }`,`setHover` 用 `applyOptions({ lineWidth })` 加粗,无 primitive。
- `PriceLineTool.ts` — 价格线基于库自带 `createPriceLine`(非自绘),`_items` 存 `{ id, line, price }`,`setHover` 用 `applyOptions({ lineWidth })` 加粗,无 primitive。
- `ActionPriceLineTool.ts` — 操作价格线工具:`addAction`/`setStatus`/`checkTriggers`(最新时间 > createdAt 门槛后自 createdAt 含起扫描 high/low,同一根 bar 也能触发)、画布确认条命中测试 `hitTestConfirm`(几何与 primitive 共用 `CONFIRM_BTN`)、拖拽(armed+user,结束重算方向)、呼吸定时器 `_syncBreathing`、`_pressHit` 防误开创建框、serialize/restore(含 action/status/direction/createdAt)。
- `ActionPriceLinePrimitive.ts` — 自绘操作价格线 primitive:`ACTION_COLORS`(开红/加黄/减蓝/清绿)、armed 实线 / triggered 呼吸 / executed 白细线 / violated 渐变填充(direction up 填充顶部、down 填充底部)、triggered+user 右侧画布**确认条**([已执行绿底✓icon] [未执行红底✕icon],无间隔无圆角仅背景区分,垂直中线与价格线重合,右缘贴 pane 边缘紧贴价格轴 label,布局常量 `CONFIRM_BTN`)、价格轴操作类型标签(`priceAxisViews` + `ISeriesPrimitiveAxisView`,按 `id:status` 签名重建,纯文本只显示操作类型,无 ✓/✕ 字形)。
- `LinePrimitive.ts` — 自绘线段/射线/直线 primitive + `lineEndpoints()`(按 type 算延伸端点,射线/直线延伸到 pane 边界)。
- `FibonacciPrimitive.ts` — 自绘斐波那契 primitive:`FIB_LEVELS` 回调水平线(0/0.236/0.382/0.5/0.618/0.786/1,虚线、0/1 实线)、锚点竖虚线、价格轴百分比标签(`priceAxisViews()` + `ISeriesPrimitiveAxisView`,按集合结构签名重建)。
- `RectPrimitive.ts` — 矩形 primitive:半透明填充 + 描边 + 对角锚点圆点;`RECT_COLOR = '#00bcd4'`。
- `MeasurePrimitive.ts` — 测量 primitive:线段 + 中点标签框,渲染期用 `buildMeasureLabel`(logical 差值算根数)实时拼「价差 (涨跌幅) · N根」。
- `FibExtPrimitive.ts` — 斐波那契扩展 primitive:`FIB_EXT_LEVELS`(0/0.236/0.382/0.5/0.618/0.786/1/1.618/2.618/4.236),价位 = C + (B-A)×ratio,画水平虚线 + 右侧比例标签 + A→B→C 折线。
- `VerticalLinePrimitive.ts` — 垂直线 primitive:贯穿竖线(虚线) + 顶部小三角标记,悬停提亮;`VERTICAL_LINE_COLOR = '#d1d4dc'`。
- `TextPrimitive.ts` — 文本 primitive:锚点右侧标签框(半透明底 + 细描边 + 文本),canvas `measureText` 定宽;`TEXT_COLOR = '#d1d4dc'`。
- `persistence.ts` — localStorage 存取,损坏/缺失返回空数组,空数组等价清除 key。
