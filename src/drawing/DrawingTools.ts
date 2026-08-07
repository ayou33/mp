import { MismatchDirection, type IChartApi, type ISeriesApi, type MouseEventParams, type Time } from 'lightweight-charts'
import { DrawingTool } from './DrawingTool'
import { LineTool } from './LineTool'
import { FibTool } from './FibTool'
import { PriceLineTool } from './PriceLineTool'
import type { LineType, SerializedDrawing } from './types'
import type { KlineBar } from '../types'

// re-export 统一类型(兼容既有导入)
export type { DrawingKind, DrawingRef, LineType, SerializedDrawing, AnchorPoint } from './types'
export { HIT_THRESHOLD } from './DrawingTool'

/** 右键框选区间统计 */
export interface RangeStats {
  from: string
  to: string
  /** 交易日数 */
  bars: number
  open: number
  high: number
  low: number
  close: number
  change: number
  changePct: number
  amplitudePct: number
  /** 成交量(手) */
  volume: number
}

interface DrawingToolsOptions {
  /** 当前 K 线数量,拖锚点吸附时间时用于钳制索引 */
  getBarCount: () => number
  /** 当前全部 K 线(框选统计用) */
  getBars: () => KlineBar[]
  /** 左键点击画线控制点时请求弹出菜单(ref + 容器内坐标) */
  onRequestMenu?: (ref: import('./types').DrawingRef, x: number, y: number) => void
  /** 右键框选进行中:更新选区矩形(容器内坐标);传 null 表示清除 */
  onRangePreview?: (rect: { x: number; y: number; width: number; height: number } | null) => void
  /** 右键框选松开:弹出区间统计 */
  onRangeSelect?: (stats: RangeStats) => void
  /** 画线数据变更(放置/拖拽/删除/编辑后触发,供上层持久化) */
  onChange?: () => void
}

/**
 * 画线工具总控制器(非 React):按 kind 优先级路由事件到各类型工具,
 * 承载右键框选/区间统计与统一数据存取(serializeAll/restoreAll)。
 * 各画线类型的放置/预览/拖拽/命中逻辑已拆分到 LineTool/FibTool/PriceLineTool。
 */
export class DrawingTools {
  private _chart: IChartApi
  private _series: ISeriesApi<'Candlestick'>
  private _container: HTMLElement
  /** 图表区域公共祖先(含覆盖层),右键框选时用于整区禁用浏览器原生菜单 */
  private _chartWrap: HTMLElement
  private _getBarCount: () => number
  private _getBars: () => KlineBar[]
  private _options: DrawingToolsOptions
  private _cleanups: Array<() => void> = []

  /** 各类型工具;优先级即数组顺序(line -> fib -> price-line) */
  private _tools: DrawingTool[]
  private _lineTool: LineTool
  private _fibTool: FibTool
  private _priceTool: PriceLineTool

  /** 右键框选起点(容器内坐标);非 null 表示框选进行中 */
  private _rangeStart: { x: number; y: number } | null = null
  /** 框选松开后浏览器会补发一次 contextmenu(可能落在刚弹出的弹窗上),用该标志吞掉它 */
  private _suppressContextMenu = false
  private _moved = false
  /** 是否正处于工具拖拽中(pointerdown 被某工具消费),期间不做悬停高亮 */
  private _dragging = false
  private _downClient: { x: number; y: number } | null = null
  private _lastPointer: { x: number; y: number } | null = null
  /** 按下时命中的控制点(用于 pointerup 区分「点击弹菜单」与「拖拽编辑」) */
  private _anchorPress: import('./types').DrawingRef | null = null

  constructor(
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    container: HTMLElement,
    options: DrawingToolsOptions,
  ) {
    this._chart = chart
    this._series = series
    this._container = container
    this._chartWrap = container.closest('.chart-wrap') ?? container
    this._getBarCount = options.getBarCount
    this._getBars = options.getBars
    this._options = options

    this._lineTool = new LineTool(chart, series, container, options.getBarCount)
    this._fibTool = new FibTool(chart, series, container, options.getBarCount)
    this._priceTool = new PriceLineTool(chart, series, container, options.getBarCount)
    this._tools = [this._lineTool, this._fibTool, this._priceTool]
    for (const tool of this._tools) tool.onChange = options.onChange

    this._subscribe()
  }

  // ---- 模式开关(委托给对应工具) ----

  setDrawingEnabled(v: boolean): void {
    this._priceTool.setEnabled(v)
  }

  setFibEnabled(v: boolean): void {
    this._fibTool.setEnabled(v)
  }

  setLineEnabled(type: LineType | null): void {
    this._lineTool.setEnabled(type)
  }

  // ---- 画线操作(统一按 kind 路由) ----

  /** 清除所有画线对象 */
  clearAll(): void {
    for (const tool of this._tools) tool.clear()
  }

  /** 命中测试:返回鼠标位置(x, y 为容器内 CSS 坐标)上的最上层画线对象 */
  hitTest(x: number, y: number): import('./types').DrawingRef | null {
    for (const tool of this._tools) {
      const hit = tool.hitTest(x, y)
      if (hit) return hit
    }
    return null
  }

  deleteDrawing(ref: import('./types').DrawingRef): void {
    this._toolOf(ref.kind)?.delete(ref)
  }

  setReadonly(ref: import('./types').DrawingRef, v: boolean): void {
    this._toolOf(ref.kind)?.setReadonly(ref, v)
  }

  isReadonly(ref: import('./types').DrawingRef): boolean {
    return this._toolOf(ref.kind)?.isReadonly(ref) ?? false
  }

  getControlPointPrice(ref: import('./types').DrawingRef): number | null {
    return this._toolOf(ref.kind)?.getControlPointPrice(ref) ?? null
  }

  setControlPointPrice(ref: import('./types').DrawingRef, price: number): void {
    this._toolOf(ref.kind)?.setControlPointPrice(ref, price)
  }

  // ---- 统一数据接口:存储与回写 ----

  /** 导出全部画线对象(统一存储格式,可 JSON 序列化持久化) */
  serializeAll(): SerializedDrawing[] {
    return this._tools.flatMap((tool) => tool.serialize())
  }

  /** 从统一存储格式回写重建全部画线对象(先清空再按 kind 分发) */
  restoreAll(items: SerializedDrawing[]): void {
    this.clearAll()
    for (const tool of this._tools) {
      tool.restore(items.filter((s) => s.kind === tool.kind))
    }
  }

  /** 数据层 API:读取当前全部 K 线 */
  getBars(): KlineBar[] {
    return this._getBars()
  }

  dispose(): void {
    for (const fn of this._cleanups) fn()
    this._cleanups = []
    for (const tool of this._tools) tool.dispose?.()
  }

  private _toolOf(kind: import('./types').DrawingKind): DrawingTool | undefined {
    return this._tools.find((t) => t.kind === kind)
  }

  private _subscribe(): void {
    this._chart.subscribeClick(this._onClick)
    this._chart.subscribeCrosshairMove(this._onCrosshairMove)

    const el = this._container
    el.addEventListener('pointerdown', this._onPointerDown, { capture: true })
    el.addEventListener('pointermove', this._onPointerMove)
    el.addEventListener('pointerup', this._onPointerUp)
    window.addEventListener('pointerup', this._onPointerUp)
    const onMouseLeave = (): void => {
      this._setHover(null)
    }
    el.addEventListener('mouseleave', onMouseLeave)
    // 图表区域(含覆盖层)右键用于框选,禁用浏览器原生菜单。
    // contextmenu 可能落在 canvas、覆盖层 SPAN(容器兄弟节点)或刚弹出的统计弹窗上,
    // 故在 document 层用「框选进行中 / 框选后标志 / 目标在图表区」三条件判断。
    const onContextMenu = (e: MouseEvent): void => {
      const t = e.target
      const inChart = t instanceof Node && this._chartWrap.contains(t)
      if (this._rangeStart || this._suppressContextMenu || inChart) {
        e.preventDefault()
      }
      this._suppressContextMenu = false
    }
    document.addEventListener('contextmenu', onContextMenu)

    this._cleanups.push(() => {
      this._chart.unsubscribeClick(this._onClick)
      this._chart.unsubscribeCrosshairMove(this._onCrosshairMove)
      el.removeEventListener('pointerdown', this._onPointerDown)
      el.removeEventListener('pointermove', this._onPointerMove)
      el.removeEventListener('pointerup', this._onPointerUp)
      window.removeEventListener('pointerup', this._onPointerUp)
      el.removeEventListener('mouseleave', onMouseLeave)
      document.removeEventListener('contextmenu', onContextMenu)
    })
  }

  /** 点击:按类型优先级路由放置锚点/价格线 */
  private _onClick = (param: MouseEventParams<Time>): void => {
    const pt = this._pointFromParams(param)
    if (!pt) return
    for (const tool of this._tools) {
      if (tool.onClick?.(pt)) return
    }
  }

  /** 十字光标移动:路由给工具(放置第 2 个锚点前预览跟随鼠标) */
  private _onCrosshairMove = (param: MouseEventParams<Time>): void => {
    const pt = this._pointFromParams(param)
    if (!pt) return
    for (const tool of this._tools) tool.onCrosshairMove?.(pt)
  }

  private _onPointerDown = (e: PointerEvent): void => {
    this._suppressContextMenu = false
    // 右键:启动区间框选(框选统计周期)
    if (e.button === 2) {
      const { x, y } = this._toLocal(e)
      this._rangeStart = { x, y }
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (e.button !== 0) return
    const { x, y } = this._toLocal(e)
    this._moved = false
    this._dragging = false
    this._downClient = { x: e.clientX, y: e.clientY }
    this._lastPointer = { x, y }
    // 记录按下的控制点(无论是否 readonly),供 pointerup 判定左键菜单
    this._anchorPress = this._hitControlPoint(x, y)

    // 路由到工具:命中可拖拽对象时返回 true,阻止图表平移
    for (const tool of this._tools) {
      if (tool.onPointerDown?.(e, { x, y })) {
        this._dragging = true
        e.preventDefault()
        e.stopPropagation()
        return
      }
    }
  }

  private _onPointerMove = (e: PointerEvent): void => {
    const { x, y } = this._toLocal(e)
    // 右键框选进行中:更新选区矩形
    if (this._rangeStart) {
      this._options.onRangePreview?.({
        x: Math.min(this._rangeStart.x, x),
        y: Math.min(this._rangeStart.y, y),
        width: Math.abs(x - this._rangeStart.x),
        height: Math.abs(y - this._rangeStart.y),
      })
      e.preventDefault()
      return
    }
    this._lastPointer = { x, y }
    if (this._downClient !== null) {
      const dist = Math.abs(e.clientX - this._downClient.x) + Math.abs(e.clientY - this._downClient.y)
      if (dist > 5) this._moved = true
    }

    // 路由拖拽(各工具只处理自己激活的 drag)
    for (const tool of this._tools) tool.onPointerMove?.(e, { x, y })
    // 未拖拽:悬停高亮控制点
    if (!this._dragging) {
      this._setHover(this.hitTest(x, y))
    }
  }

  private _onPointerUp = (e: PointerEvent): void => {
    const { x, y } = this._toLocal(e)
    // 右键框选松开:计算区间统计并弹出
    if (this._rangeStart) {
      const start = this._rangeStart
      this._rangeStart = null
      this._options.onRangePreview?.(null)
      // 松开后浏览器会补发 contextmenu,可能落在刚弹出的弹窗上,吞掉它
      this._suppressContextMenu = true
      // 横向拖动足够距离才算框选(避免误触)
      if (Math.abs(x - start.x) >= 20) {
        const stats = this._computeRangeStats(start.x, x)
        if (stats) this._options.onRangeSelect?.(stats)
      }
      return
    }
    if (this._moved) {
      // 拖动结束:抑制后续一次 click,避免误放新画线
      this._lineTool.suppressNextClick()
      this._priceTool.suppressNextClick()
    }
    // 左键点击控制点(未拖拽) -> 弹出菜单;即使画线工具激活也弹,便于随时调整/删除
    if (this._anchorPress && !this._moved && this._lastPointer) {
      this._openMenu(this._anchorPress, this._lastPointer.x, this._lastPointer.y)
    }
    this._anchorPress = null
    this._dragging = false
    this._moved = false
    this._downClient = null
    for (const tool of this._tools) tool.onPointerUp?.(e, { x, y })
  }

  /** 只命中控制点(锚点/整条价格线),用于左键菜单判定 */
  private _hitControlPoint(x: number, y: number): import('./types').DrawingRef | null {
    for (const tool of this._tools) {
      const hit = tool.hitTestControls(x, y)
      if (hit) return hit
    }
    return null
  }

  /** 更新悬停高亮(委托给各工具;工具内部仅在对象变化时触发重绘) */
  private _setHover(hit: import('./types').DrawingRef | null): void {
    for (const tool of this._tools) tool.setHover?.(hit)
  }

  /** 打开控制点菜单(委托给 React 层) */
  private _openMenu(ref: import('./types').DrawingRef, x: number, y: number): void {
    this._options.onRequestMenu?.(ref, x, y)
  }

  /** 计算框选 x 区间内的统计(时间吸附到最近 K 线) */
  private _computeRangeStats(x1: number, x2: number): RangeStats | null {
    const bars = this._getBars() ?? []
    if (bars.length === 0) return null
    const lo = Math.min(x1, x2)
    const hi = Math.max(x1, x2)
    const logicalA = this._chart.timeScale().coordinateToLogical(lo)
    const logicalB = this._chart.timeScale().coordinateToLogical(hi)
    if (logicalA === null || logicalB === null) return null

    const total = bars.length
    let from = Math.max(0, Math.min(Math.round(logicalA), total - 1))
    let to = Math.max(0, Math.min(Math.round(logicalB), total - 1))
    if (from > to) {
      const tmp = from
      from = to
      to = tmp
    }
    const sel = bars.slice(from, to + 1)
    if (sel.length === 0) return null

    const first = sel[0]
    const last = sel[sel.length - 1]
    const open = first.open
    const close = last.close
    const change = close - open
    const high = Math.max(...sel.map((b) => b.high))
    const low = Math.min(...sel.map((b) => b.low))
    const volume = sel.reduce((sum, b) => sum + b.volume, 0)

    return {
      from: first.time,
      to: last.time,
      bars: sel.length,
      open,
      high,
      low,
      close,
      change,
      changePct: open !== 0 ? (change / open) * 100 : 0,
      amplitudePct: open !== 0 ? ((high - low) / open) * 100 : 0,
      volume,
    }
  }

  /** 从点击/十字光标事件中取 { time, price } */
  private _pointFromParams(param: MouseEventParams<Time>): { time: Time; price: number } | null {
    if (!param.point) return null
    const price = this._series.coordinateToPrice(param.point.y)
    if (price === null) return null

    // 点击落在无 K 线的区域(默认视图右侧预留的空白区)时 param.time 为 undefined,
    // 此时按逻辑坐标吸附到最近的 K 线时间,保证锚点始终放得下、画得出
    let time = param.time
    if (time === undefined) {
      const logical = this._chart.timeScale().coordinateToLogical(param.point.x)
      const total = this._getBarCount()
      if (logical !== null && total > 0) {
        const idx = Math.max(0, Math.min(Math.round(logical), total - 1))
        const bar = this._series.dataByIndex(idx, MismatchDirection.NearestRight)
        if (bar && bar.time !== undefined) time = bar.time
      }
    }
    if (time === undefined) return null
    return { time, price }
  }

  private _toLocal(e: PointerEvent): { x: number; y: number } {
    const rect = this._container.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
}
