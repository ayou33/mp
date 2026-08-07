import { DrawingTool, HIT_THRESHOLD, type LocalPoint, type Point } from './DrawingTool'
import { LinePrimitive, lineEndpoints, type LineDataSource, type LineDrawing, type LineType } from './LinePrimitive'
import type { DrawingRef, DrawingSource, SerializedDrawing } from './types'

interface DragLineAnchor {
  lineIndex: number
  anchorIndex: number
}

/** 点到线段的最短距离(px) */
function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1)
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

/**
 * 线段/射线/直线工具:基于自绘 LinePrimitive。
 * 两次点击放置锚点、十字光标预览、锚点拖拽吸附时间、删除/价格编辑 + 统一序列化回写。
 */
export class LineTool extends DrawingTool {
  readonly kind = 'line' as const
  private _primitive: LinePrimitive
  private _data: LineDataSource = { lines: [], pending: [], preview: null }
  private _nextId = 1
  private _type: LineType = 'segment'
  private _drag: DragLineAnchor | null = null
  private _hoverId: number | null = null

  constructor(
    chart: ConstructorParameters<typeof DrawingTool>[1],
    series: ConstructorParameters<typeof DrawingTool>[2],
    container: ConstructorParameters<typeof DrawingTool>[3],
    getBarCount: ConstructorParameters<typeof DrawingTool>[4],
  ) {
    super('line', chart, series, container, getBarCount)
    this._primitive = new LinePrimitive(this._data)
    series.attachPrimitive(this._primitive)
  }

  /** 切换画线工具(线段/射线/直线);null 关闭。
   *  幂等:组件每次渲染都会调用,不能无条件清空 pending,
   *  否则两次锚点点击之间的一次重渲染就会把第一个锚点丢掉(画不出线)。
   *  仅在工具真正变化(启用/关闭/切换)时才丢弃未完成锚点。 */
  setEnabled(type: LineType | null): void {
    const changed = (type !== null) !== this._enabled || (type !== null && type !== this._type)
    this._enabled = type !== null
    if (type) this._type = type
    if (changed) {
      const d = this._data
      d.pending = []
      d.preview = null
      this._primitive.requestUpdate?.()
    }
  }

  clear(): void {
    const d = this._data
    d.lines = []
    d.pending = []
    d.preview = null
    this._primitive.requestUpdate?.()
  }

  clearUser(): void {
    const d = this._data
    d.lines = d.lines.filter((l) => l.source === 'system')
    d.pending = []
    d.preview = null
    this._primitive.requestUpdate?.()
  }

  /** 取消进行中的放置(清除未完成锚点与预览),供右键取消画线模式时清理 */
  cancelPending(): void {
    const d = this._data
    d.pending = []
    d.preview = null
    this._primitive.requestUpdate?.()
  }

  getSource(ref: DrawingRef): DrawingSource | null {
    if (ref.kind !== 'line') return null
    return this._data.lines.find((l) => l.id === ref.id)?.source ?? null
  }

  systemAdd(item: SerializedDrawing): void {
    if (item.kind !== 'line' || !item.p1 || !item.p2) return
    const d = this._data
    d.lines.push({
      id: this._nextId++,
      type: item.lineType ?? 'segment',
      p1: { time: item.p1.time, price: item.p1.price },
      p2: { time: item.p2.time, price: item.p2.price },
      source: 'system',
    })
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  hitTestControls(x: number, y: number): DrawingRef | null {
    const lines = this._data.lines
    for (let i = 0; i < lines.length; i++) {
      const anchors = [lines[i].p1, lines[i].p2]
      for (let ai = 0; ai < anchors.length; ai++) {
        const ax = this.chart.timeScale().timeToCoordinate(anchors[ai].time)
        const ay = this.series.priceToCoordinate(anchors[ai].price)
        if (ax !== null && ay !== null && Math.abs(ax - x) <= HIT_THRESHOLD && Math.abs(ay - y) <= HIT_THRESHOLD) {
          return { kind: 'line', id: lines[i].id, point: ai }
        }
      }
    }
    return null
  }

  /** 命中画线 body(线段取有限段,射线/直线按延伸后的实际端点命中) */
  override hitTest(x: number, y: number): DrawingRef | null {
    const controls = this.hitTestControls(x, y)
    if (controls) return controls
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    for (const line of this._data.lines) {
      const x1 = this.chart.timeScale().timeToCoordinate(line.p1.time)
      const y1 = this.series.priceToCoordinate(line.p1.price)
      const x2 = this.chart.timeScale().timeToCoordinate(line.p2.time)
      const y2 = this.series.priceToCoordinate(line.p2.price)
      if (x1 === null || y1 === null || x2 === null || y2 === null) continue
      const { sx, sy, ex, ey } = lineEndpoints(line.type, x1, y1, x2, y2, w, h)
      if (sx !== null && distToSegment(x, y, sx, sy, ex, ey) <= HIT_THRESHOLD) {
        return { kind: 'line', id: line.id }
      }
    }
    return null
  }

  setHover(ref: DrawingRef | null): void {
    const id = ref?.kind === 'line' ? ref.id : null
    if (id === this._hoverId) return
    this._hoverId = id
    this._data.highlight = id
    this._primitive.requestUpdate?.()
  }

  onClick(pt: Point): boolean {
    if (!this._enabled) return false
    // 拖动结束后的那次 click 不重复画线
    if (this.consumeSuppressedClick()) return true
    const d = this._data
    if (d.pending.length === 0) {
      d.pending = [pt]
    } else {
      // 用跟随鼠标的预览位置作为终点(若无预览则用点击点)
      const second = d.preview ?? pt
      d.lines.push({ id: this._nextId++, type: this._type, p1: d.pending[0], p2: second })
      d.pending = []
      d.preview = null
      this.notifyChange()
    }
    this._primitive.requestUpdate?.()
    return true
  }

  onCrosshairMove(pt: Point): void {
    if (!this._enabled) return
    const d = this._data
    if (d.pending.length === 1) {
      d.preview = pt
      this._primitive.requestUpdate?.()
    }
  }

  onPointerDown(_e: PointerEvent, local: LocalPoint): boolean {
    // 拖拽命中不依赖启用状态:关闭工具后仍可调整已画锚点;system 对象不可拖
    const lines = this._data.lines
    for (let li = 0; li < lines.length; li++) {
      // 用户不可拖拽:系统对象(system 归系统程序管,拖拽=修改)
      if (lines[li].source === 'system') continue
      const anchors = [lines[li].p1, lines[li].p2]
      for (let ai = 0; ai < anchors.length; ai++) {
        const ax = this.chart.timeScale().timeToCoordinate(anchors[ai].time)
        const ay = this.series.priceToCoordinate(anchors[ai].price)
        if (
          ax !== null &&
          ay !== null &&
          Math.abs(ax - local.x) <= HIT_THRESHOLD &&
          Math.abs(ay - local.y) <= HIT_THRESHOLD
        ) {
          this._drag = { lineIndex: li, anchorIndex: ai }
          return true
        }
      }
    }
    return false
  }

  onPointerMove(_e: PointerEvent, local: LocalPoint): void {
    const drag = this._drag
    if (!drag) return
    const line = this._data.lines[drag.lineIndex]
    const anchor = line ? (drag.anchorIndex === 0 ? line.p1 : line.p2) : null
    if (!anchor) {
      this._drag = null
      return
    }
    this.moveAnchor(anchor, local.x, local.y)
    this._primitive.requestUpdate?.()
  }

  onPointerUp(): void {
    if (this._drag) {
      this._drag = null
      this.notifyChange()
    }
  }

  delete(ref: DrawingRef): void {
    if (ref.kind !== 'line') return
    this._data.lines = this._data.lines.filter((l) => l.id !== ref.id)
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  getControlPointPrice(ref: DrawingRef): number | null {
    if (ref.kind !== 'line') return null
    const line = this._data.lines.find((l) => l.id === ref.id)
    if (!line) return null
    return (ref.point === 1 ? line.p2 : line.p1).price
  }

  setControlPointPrice(ref: DrawingRef, price: number): void {
    if (ref.kind !== 'line' || !Number.isFinite(price)) return
    const line = this._data.lines.find((l) => l.id === ref.id)
    // 底层不校验 source:用户权限由 DrawingTools 用户入口统一校验
    if (!line) return
    if (ref.point === 1) line.p2.price = price
    else line.p1.price = price
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  serialize(): SerializedDrawing[] {
    return this._data.lines.map((l: LineDrawing) => ({
      id: l.id,
      kind: 'line',
      lineType: l.type,
      p1: { time: String(l.p1.time), price: l.p1.price },
      p2: { time: String(l.p2.time), price: l.p2.price },
      source: l.source === 'system' ? 'system' : undefined,
    }))
  }

  restore(items: SerializedDrawing[]): void {
    const d = this._data
    d.lines = []
    d.pending = []
    d.preview = null
    for (const s of items) {
      if (s.kind !== 'line' || !s.p1 || !s.p2) continue
      d.lines.push({
        id: s.id,
        type: s.lineType ?? 'segment',
        p1: { time: s.p1.time, price: s.p1.price },
        p2: { time: s.p2.time, price: s.p2.price },
        source: s.source,
      })
      this._nextId = Math.max(this._nextId, s.id + 1)
    }
    this._primitive.requestUpdate?.()
  }
}
