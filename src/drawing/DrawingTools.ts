import {
  LineStyle,
  MismatchDirection,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from 'lightweight-charts'
import { FibonacciPrimitive, type FibDataSource, type FibDrawing } from './FibonacciPrimitive'
import { LinePrimitive, lineEndpoints, type LineDataSource, type LineDrawing, type LineType } from './LinePrimitive'
import type { KlineBar } from '../types'

const PRICE_LINE_COLOR = '#f0b90b'
/** 命中判定:鼠标距目标的最大像素距离 */
const HIT_THRESHOLD = 8

/** 画线对象种类 */
export type DrawingKind = 'line' | 'fib' | 'price-line'
/** 画线对象引用(菜单/删除/只读/价格编辑操作入口) */
export interface DrawingRef {
  kind: DrawingKind
  id: number
  /** 被点中的控制点下标(0/1),供价格输入框定位;价格线无此字段 */
  point?: number
}

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

interface PriceLineItem {
  id: number
  line: IPriceLine
  price: number
  readonly?: boolean
}

/** 点到线段的最短距离(px) */
function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1)
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

interface DragAnchor {
  fibIndex: number
  anchorIndex: number
}

interface DrawingToolsOptions {
  /** 当前 K 线数量,拖锚点吸附时间时用于钳制索引 */
  getBarCount: () => number
  /** 当前全部 K 线(框选统计用) */
  getBars: () => KlineBar[]
  /** 左键点击画线控制点时请求弹出菜单(ref + 容器内坐标) */
  onRequestMenu?: (ref: DrawingRef, x: number, y: number) => void
  /** 右键框选进行中:更新选区矩形(容器内坐标);传 null 表示清除 */
  onRangePreview?: (rect: { x: number; y: number; width: number; height: number } | null) => void
  /** 右键框选松开:弹出区间统计 */
  onRangeSelect?: (stats: RangeStats) => void
}

/**
 * 画线工具控制器(非 React):承载价格线 + 斐波那契的放置/预览/拖拽/清除。
 * 挂在图表事件上,把交互逻辑从组件层下沉到这里。
 */
export class DrawingTools {
  private _chart: IChartApi
  private _series: ISeriesApi<'Candlestick'>
  private _container: HTMLElement
  /** 图表区域公共祖先(含覆盖层),右键框选时用于整区禁用浏览器原生菜单 */
  private _chartWrap: HTMLElement
  private _getBarCount: () => number
  private _getBars: () => KlineBar[]
  private _fibPrimitive: FibonacciPrimitive
  private _fibData: FibDataSource = { fibs: [], pending: [], preview: null }
  private _linePrimitive: LinePrimitive
  private _lineData: LineDataSource = { lines: [], pending: [], preview: null }
  private _priceLines: PriceLineItem[] = []
  private _nextId = 1
  private _nextLineId = 1
  private _dragPriceLine: PriceLineItem | null = null
  private _dragAnchor: DragAnchor | null = null
  private _dragLineAnchor: { lineIndex: number; anchorIndex: number } | null = null
  /** 按下时命中的控制点(用于 pointerup 区分「点击弹菜单」与「拖拽编辑」) */
  private _anchorPress: DrawingRef | null = null
  /** 右键框选起点(容器内坐标);非 null 表示框选进行中 */
  private _rangeStart: { x: number; y: number } | null = null
  /** 框选松开后浏览器会补发一次 contextmenu(可能落在刚弹出的弹窗上),用该标志吞掉它 */
  private _suppressContextMenu = false
  private _suppressClick = false
  private _drawingEnabled = false
  private _fibEnabled = false
  private _lineEnabled = false
  private _lineType: LineType = 'segment'
  private _moved = false
  private _downClient: { x: number; y: number } | null = null
  private _lastPointer: { x: number; y: number } | null = null
  private _hoverLineId: number | null = null
  private _hoverFibId: number | null = null
  private _hoverPriceId: number | null = null
  private _options: DrawingToolsOptions
  private _cleanups: Array<() => void> = []

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
    this._fibPrimitive = new FibonacciPrimitive(this._fibData)
    series.attachPrimitive(this._fibPrimitive)
    this._linePrimitive = new LinePrimitive(this._lineData)
    series.attachPrimitive(this._linePrimitive)
    this._subscribe()
  }

  setDrawingEnabled(v: boolean): void {
    this._drawingEnabled = v
  }

  setFibEnabled(v: boolean): void {
    this._fibEnabled = v
  }

  /** 切换画线工具(线段/射线/直线);传 null 关闭。
   *  注意幂等:组件每次渲染都会调用本方法,不能无条件清空 pending,
   *  否则两次锚点点击之间的一次重渲染就会把第一个锚点丢掉(画不出线)。
   *  仅在工具真正变化(启用/关闭/切换)时才丢弃未完成锚点。 */
  setLineEnabled(type: LineType | null): void {
    const changed =
      (type !== null) !== this._lineEnabled || (type !== null && type !== this._lineType)
    this._lineEnabled = type !== null
    if (type) this._lineType = type
    if (changed) {
      const d = this._lineData
      d.pending = []
      d.preview = null
      this._linePrimitive.requestUpdate?.()
    }
  }

  /** 清除所有价格线/斐波那契/画线。注意就地变更数据对象(见 CLAUDE.md 关键坑 2) */
  clearAll(): void {
    for (const item of this._priceLines) this._series.removePriceLine(item.line)
    this._priceLines = []
    const d = this._fibData
    d.fibs = []
    d.pending = []
    d.preview = null
    const ld = this._lineData
    ld.lines = []
    ld.pending = []
    ld.preview = null
    this._fibPrimitive.requestUpdate?.()
    this._linePrimitive.requestUpdate?.()
  }

  /**
   * 命中测试:返回鼠标位置(x, y 为容器内 CSS 坐标)上的最上层画线对象。
   * 控制点优先,再命中 body;readonly 对象也可命中(否则无法取消只读/删除)。
   * 供悬停高亮与左键菜单定位使用。
   */
  hitTest(x: number, y: number): DrawingRef | null {
    return this._hitControlPoint(x, y) ?? this._hitBody(x, y)
  }

  /** 命中控制点(线段/射线/直线与斐波那契锚点、价格线整条);返回含控制点下标的引用 */
  private _hitControlPoint(x: number, y: number): DrawingRef | null {
    const lines = this._lineData.lines
    for (let i = 0; i < lines.length; i++) {
      const anchors = [lines[i].p1, lines[i].p2]
      for (let ai = 0; ai < anchors.length; ai++) {
        const ax = this._chart.timeScale().timeToCoordinate(anchors[ai].time)
        const ay = this._series.priceToCoordinate(anchors[ai].price)
        if (ax !== null && ay !== null && Math.abs(ax - x) <= HIT_THRESHOLD && Math.abs(ay - y) <= HIT_THRESHOLD) {
          return { kind: 'line', id: lines[i].id, point: ai }
        }
      }
    }

    const fibs = this._fibData.fibs
    for (let i = 0; i < fibs.length; i++) {
      const anchors = [fibs[i].p1, fibs[i].p2]
      for (let ai = 0; ai < anchors.length; ai++) {
        const ax = this._chart.timeScale().timeToCoordinate(anchors[ai].time)
        const ay = this._series.priceToCoordinate(anchors[ai].price)
        if (ax !== null && ay !== null && Math.abs(ax - x) <= HIT_THRESHOLD && Math.abs(ay - y) <= HIT_THRESHOLD) {
          return { kind: 'fib', id: fibs[i].id, point: ai }
        }
      }
    }

    for (const item of this._priceLines) {
      const cy = this._series.priceToCoordinate(item.price)
      if (cy !== null && Math.abs(cy - y) <= HIT_THRESHOLD) {
        return { kind: 'price-line', id: item.id }
      }
    }

    return null
  }

  /** 命中画线 body(线段取有限段,射线/直线按延伸后的实际端点命中) */
  private _hitBody(x: number, y: number): DrawingRef | null {
    const w = this._container.clientWidth
    const h = this._container.clientHeight

    for (const line of this._lineData.lines) {
      const x1 = this._chart.timeScale().timeToCoordinate(line.p1.time)
      const y1 = this._series.priceToCoordinate(line.p1.price)
      const x2 = this._chart.timeScale().timeToCoordinate(line.p2.time)
      const y2 = this._series.priceToCoordinate(line.p2.price)
      if (x1 === null || y1 === null || x2 === null || y2 === null) continue
      const { sx, sy, ex, ey } = lineEndpoints(line.type, x1, y1, x2, y2, w, h)
      if (sx !== null && distToSegment(x, y, sx, sy, ex, ey) <= HIT_THRESHOLD) {
        return { kind: 'line', id: line.id }
      }
    }

    for (const fib of this._fibData.fibs) {
      const x1 = this._chart.timeScale().timeToCoordinate(fib.p1.time)
      const y1 = this._series.priceToCoordinate(fib.p1.price)
      const x2 = this._chart.timeScale().timeToCoordinate(fib.p2.time)
      const y2 = this._series.priceToCoordinate(fib.p2.price)
      if (x1 === null || y1 === null || x2 === null || y2 === null) continue
      if (distToSegment(x, y, x1, y1, x2, y2) <= HIT_THRESHOLD) {
        return { kind: 'fib', id: fib.id }
      }
    }

    return null
  }

  /** 打开控制点菜单(委托给 React 层) */
  private _openMenu(ref: DrawingRef, x: number, y: number): void {
    this._options.onRequestMenu?.(ref, x, y)
  }

  /** 更新悬停高亮(控制点放大高亮 + 价格线加粗);仅在对象变化时触发重绘 */
  private _setHover(hit: DrawingRef | null): void {
    const lineId = hit?.kind === 'line' ? hit.id : null
    const fibId = hit?.kind === 'fib' ? hit.id : null
    const priceId = hit?.kind === 'price-line' ? hit.id : null

    if (lineId !== this._hoverLineId) {
      this._hoverLineId = lineId
      this._lineData.highlight = lineId
      this._linePrimitive.requestUpdate?.()
    }
    if (fibId !== this._hoverFibId) {
      this._hoverFibId = fibId
      this._fibData.highlight = fibId
      this._fibPrimitive.requestUpdate?.()
    }
    if (priceId !== this._hoverPriceId) {
      const old = this._priceLines.find((p) => p.id === this._hoverPriceId)
      if (old) old.line.applyOptions({ lineWidth: 1 })
      this._hoverPriceId = priceId
      const next = this._priceLines.find((p) => p.id === priceId)
      if (next) next.line.applyOptions({ lineWidth: 2 })
    }
  }

  /** 单个删除画线对象 */
  deleteDrawing(ref: DrawingRef): void {
    if (ref.kind === 'line') {
      this._lineData.lines = this._lineData.lines.filter((l) => l.id !== ref.id)
      this._linePrimitive.requestUpdate?.()
    } else if (ref.kind === 'fib') {
      this._fibData.fibs = this._fibData.fibs.filter((f) => f.id !== ref.id)
      this._fibPrimitive.requestUpdate?.()
    } else if (ref.kind === 'price-line') {
      const idx = this._priceLines.findIndex((p) => p.id === ref.id)
      if (idx >= 0) {
        this._series.removePriceLine(this._priceLines[idx].line)
        this._priceLines.splice(idx, 1)
      }
    }
  }

  /** 设置画线对象只读标记(参数控制入口之一) */
  setReadonly(ref: DrawingRef, v: boolean): void {
    if (ref.kind === 'line') {
      const line = this._lineData.lines.find((l) => l.id === ref.id)
      if (line) line.readonly = v
      this._linePrimitive.requestUpdate?.()
    } else if (ref.kind === 'fib') {
      const fib = this._fibData.fibs.find((f) => f.id === ref.id)
      if (fib) fib.readonly = v
      this._fibPrimitive.requestUpdate?.()
    } else if (ref.kind === 'price-line') {
      const item = this._priceLines.find((p) => p.id === ref.id)
      if (item) item.readonly = v
    }
  }

  /** 查询画线对象是否只读 */
  isReadonly(ref: DrawingRef): boolean {
    if (ref.kind === 'line') return this._lineData.lines.find((l) => l.id === ref.id)?.readonly === true
    if (ref.kind === 'fib') return this._fibData.fibs.find((f) => f.id === ref.id)?.readonly === true
    const item = this._priceLines.find((p) => p.id === ref.id)
    return item?.readonly === true
  }

  /** 外部修改控制点(anchor/price)/readonly 后调用,触发重绘(参数控制入口) */
  update(): void {
    this._fibPrimitive.requestUpdate?.()
    this._linePrimitive.requestUpdate?.()
  }

  /** 数据层 API:读取全部线段/射线/直线(控制点可直接读写) */
  getLines(): LineDrawing[] {
    return this._lineData.lines
  }

  /** 数据层 API:读取全部斐波那契(控制点可直接读写) */
  getFibs(): FibDrawing[] {
    return this._fibData.fibs
  }

  /** 数据层 API:读取全部价格线 */
  getPriceLines(): Array<{ id: number; price: number; readonly?: boolean }> {
    return this._priceLines.map((p) => ({ id: p.id, price: p.price, readonly: p.readonly }))
  }

  /** 数据层 API:读取当前全部 K 线 */
  getBars(): KlineBar[] {
    return this._getBars()
  }

  /** 数据层 API:读取控制点当前价格(菜单价格输入框显示用) */
  getControlPointPrice(ref: DrawingRef): number | null {
    if (ref.kind === 'line') {
      const line = this._lineData.lines.find((l) => l.id === ref.id)
      if (!line) return null
      return (ref.point === 1 ? line.p2 : line.p1).price
    }
    if (ref.kind === 'fib') {
      const fib = this._fibData.fibs.find((f) => f.id === ref.id)
      if (!fib) return null
      return (ref.point === 1 ? fib.p2 : fib.p1).price
    }
    const item = this._priceLines.find((p) => p.id === ref.id)
    return item?.price ?? null
  }

  /** 数据层 API:设置控制点价格(菜单输入框提交;readonly 对象不可改) */
  setControlPointPrice(ref: DrawingRef, price: number): void {
    if (!Number.isFinite(price)) return
    if (ref.kind === 'line') {
      const line = this._lineData.lines.find((l) => l.id === ref.id)
      if (!line || line.readonly) return
      if (ref.point === 1) line.p2.price = price
      else line.p1.price = price
      this._linePrimitive.requestUpdate?.()
    } else if (ref.kind === 'fib') {
      const fib = this._fibData.fibs.find((f) => f.id === ref.id)
      if (!fib || fib.readonly) return
      if (ref.point === 1) fib.p2.price = price
      else fib.p1.price = price
      this._fibPrimitive.requestUpdate?.()
    } else {
      const item = this._priceLines.find((p) => p.id === ref.id)
      if (!item || item.readonly) return
      item.price = price
      item.line.applyOptions({ price })
    }
  }

  dispose(): void {
    for (const fn of this._cleanups) fn()
    this._cleanups = []
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
      if (this._hoverLineId !== null || this._hoverFibId !== null || this._hoverPriceId !== null) {
        this._setHover(null)
      }
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

  /** 点击:斐波那契/画线放置锚点;画线模式放置价格线;正常模式点击控制点弹菜单 */
  /** 点击:斐波那契/画线放置锚点;画线模式放置价格线。
   *  注意:点击已有控制点不会走到这里——_onPointerDown 的 preventDefault 会拦截图表的 click 事件,
   *  控制点左键菜单改由 _onPointerUp 检测(见 _anchorPress)。 */
  private _onClick = (param: MouseEventParams<Time>): void => {
    const pt = this._pointFromParams(param)
    if (!pt) return

    if (this._fibEnabled) {
      const d = this._fibData
      if (d.pending.length === 0) {
        d.pending = [pt]
      } else {
        // 用跟随鼠标的预览位置作为终点(若无预览则用点击点)
        const second = d.preview ?? pt
        d.fibs.push({ id: this._nextId++, p1: d.pending[0], p2: second })
        d.pending = []
        d.preview = null
      }
      this._fibPrimitive.requestUpdate?.()
      return
    }

    if (this._lineEnabled) {
      // 拖动结束后的那次 click 不重复画线
      if (this._suppressClick) {
        this._suppressClick = false
        return
      }
      const d = this._lineData
      if (d.pending.length === 0) {
        d.pending = [pt]
      } else {
        const second = d.preview ?? pt
        d.lines.push({ id: this._nextLineId++, type: this._lineType, p1: d.pending[0], p2: second })
        d.pending = []
        d.preview = null
      }
      this._linePrimitive.requestUpdate?.()
      return
    }

    if (this._drawingEnabled) {
      // 拖动结束后的那次 click 不重复画线
      if (this._suppressClick) {
        this._suppressClick = false
        return
      }
      this._addPriceLine(pt.price)
    }
  }

  /** 十字光标移动:斐波那契/画线放置第 2 个锚点前预览跟随鼠标 */
  private _onCrosshairMove = (param: MouseEventParams<Time>): void => {
    if (this._fibEnabled) {
      const d = this._fibData
      if (d.pending.length === 1) {
        const pt = this._pointFromParams(param)
        if (pt) {
          d.preview = pt
          this._fibPrimitive.requestUpdate?.()
        }
      }
    }
    if (this._lineEnabled) {
      const d = this._lineData
      if (d.pending.length === 1) {
        const pt = this._pointFromParams(param)
        if (pt) {
          d.preview = pt
          this._linePrimitive.requestUpdate?.()
        }
      }
    }
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
    this._suppressClick = false
    this._moved = false
    this._downClient = { x: e.clientX, y: e.clientY }
    this._lastPointer = { x, y }
    // 记录按下的控制点(无论是否 readonly),供 pointerup 判定左键菜单
    this._anchorPress = this._hitControlPoint(x, y)

    // 先命中斐波那契锚点(readonly 不可拖拽)
    const data = this._fibData
    for (let fi = 0; fi < data.fibs.length; fi++) {
      const fib = data.fibs[fi]
      if (fib.readonly) continue
      const anchors = [fib.p1, fib.p2]
      for (let ai = 0; ai < anchors.length; ai++) {
        const ax = this._chart.timeScale().timeToCoordinate(anchors[ai].time)
        const ay = this._series.priceToCoordinate(anchors[ai].price)
        if (ax !== null && ay !== null && Math.abs(ax - x) <= HIT_THRESHOLD && Math.abs(ay - y) <= HIT_THRESHOLD) {
          this._dragAnchor = { fibIndex: fi, anchorIndex: ai }
          e.preventDefault()
          e.stopPropagation()
          return
        }
      }
    }

    // 再命中画线锚点(readonly 不可拖拽)
    const lines = this._lineData.lines
    for (let li = 0; li < lines.length; li++) {
      if (lines[li].readonly) continue
      const anchors = [lines[li].p1, lines[li].p2]
      for (let ai = 0; ai < anchors.length; ai++) {
        const ax = this._chart.timeScale().timeToCoordinate(anchors[ai].time)
        const ay = this._series.priceToCoordinate(anchors[ai].price)
        if (ax !== null && ay !== null && Math.abs(ax - x) <= HIT_THRESHOLD && Math.abs(ay - y) <= HIT_THRESHOLD) {
          this._dragLineAnchor = { lineIndex: li, anchorIndex: ai }
          e.preventDefault()
          e.stopPropagation()
          return
        }
      }
    }

    // 再命中价格线(readonly 不可拖拽)
    for (const item of this._priceLines) {
      if (item.readonly) continue
      const cy = this._series.priceToCoordinate(item.price)
      if (cy !== null && Math.abs(cy - y) <= HIT_THRESHOLD) {
        this._dragPriceLine = item
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

    // 拖动斐波那契锚点
    const drag = this._dragAnchor
    if (drag) {
      const fib = this._fibData.fibs[drag.fibIndex]
      const anchor = fib ? (drag.anchorIndex === 0 ? fib.p1 : fib.p2) : null
      if (!anchor) {
        this._dragAnchor = null
        return
      }
      this._moveAnchor(anchor, x, y)
      this._fibPrimitive.requestUpdate?.()
      return
    }

    // 拖动画线锚点
    const lineDrag = this._dragLineAnchor
    if (lineDrag) {
      const line = this._lineData.lines[lineDrag.lineIndex]
      const anchor = line ? (lineDrag.anchorIndex === 0 ? line.p1 : line.p2) : null
      if (!anchor) {
        this._dragLineAnchor = null
        return
      }
      this._moveAnchor(anchor, x, y)
      this._linePrimitive.requestUpdate?.()
      return
    }

    // 拖动价格线
    const pl = this._dragPriceLine
    if (pl) {
      const price = this._series.coordinateToPrice(y)
      if (price !== null) {
        pl.price = price
        pl.line.applyOptions({ price })
      }
    }

    // 未拖拽(上面各拖拽分支已 return):悬停高亮控制点
    this._setHover(this.hitTest(x, y))
  }

  private _onPointerUp = (e: PointerEvent): void => {
    // 右键框选松开:计算区间统计并弹出
    if (this._rangeStart) {
      const start = this._rangeStart
      this._rangeStart = null
      this._options.onRangePreview?.(null)
      // 松开后浏览器会补发 contextmenu,可能落在刚弹出的弹窗上,吞掉它
      this._suppressContextMenu = true
      const { x } = this._toLocal(e)
      // 横向拖动足够距离才算框选(避免误触)
      if (Math.abs(x - start.x) >= 20) {
        const stats = this._computeRangeStats(start.x, x)
        if (stats) this._options.onRangeSelect?.(stats)
      }
      return
    }
    if (this._moved) this._suppressClick = true
    // 左键点击控制点(未拖拽) -> 弹出菜单;即使画线工具激活也弹,便于随时调整/删除
    if (this._anchorPress && !this._moved && this._lastPointer) {
      this._openMenu(this._anchorPress, this._lastPointer.x, this._lastPointer.y)
    }
    this._anchorPress = null
    this._dragPriceLine = null
    this._dragAnchor = null
    this._dragLineAnchor = null
    this._moved = false
    this._downClient = null
  }

  /** 计算框选 x 区间内的统计(时间吸附到最近 K 线) */
  private _computeRangeStats(x1: number, x2: number): RangeStats | null {
    const bars = this._options.getBars?.() ?? []
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

  /** 拖动锚点:时间吸附到最近 K 线,价格跟随鼠标 */
  private _moveAnchor(anchor: { time: Time; price: number }, x: number, y: number): void {
    const logical = this._chart.timeScale().coordinateToLogical(x)
    const total = this._getBarCount()
    if (logical !== null && total > 0) {
      const idx = Math.max(0, Math.min(Math.round(logical), total - 1))
      const bar = this._series.dataByIndex(idx, MismatchDirection.NearestRight)
      if (bar && bar.time !== undefined) anchor.time = bar.time
    }
    const price = this._series.coordinateToPrice(y)
    if (price !== null) anchor.price = price
  }

  private _addPriceLine(price: number): void {
    const line = this._series.createPriceLine({
      price,
      color: PRICE_LINE_COLOR,
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
    })
    this._priceLines.push({ id: this._nextId++, line, price })
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
