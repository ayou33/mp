import { DrawingTool, HIT_THRESHOLD, type LocalPoint, type Point } from './DrawingTool'
import { MeasurePrimitive, type MeasureDataSource, type MeasureDrawing } from './MeasurePrimitive'
import type { DrawingRef, DrawingSource, SerializedDrawing } from './types'

interface DragMeasureAnchor {
  measureIndex: number
  anchorIndex: number
}

/**
 * 测量工具:两点之间画线段 + 价差/涨跌幅/根数标签(自绘 MeasurePrimitive)。
 * 两次点击放置、十字光标预览、锚点拖拽、删除/价格编辑 + 统一序列化回写。
 * 与 FibTool/LineTool 结构对称,新增两点类工具照此复制改造。
 */
export class MeasureTool extends DrawingTool {
  readonly kind = 'measure' as const
  private _primitive: MeasurePrimitive
  private _data: MeasureDataSource = { measures: [], pending: [], preview: null }
  private _nextId = 1
  private _drag: DragMeasureAnchor | null = null
  private _hoverId: number | null = null

  constructor(
    chart: ConstructorParameters<typeof DrawingTool>[1],
    series: ConstructorParameters<typeof DrawingTool>[2],
    container: ConstructorParameters<typeof DrawingTool>[3],
    getBarCount: ConstructorParameters<typeof DrawingTool>[4],
  ) {
    super('measure', chart, series, container, getBarCount)
    this._primitive = new MeasurePrimitive(this._data)
    series.attachPrimitive(this._primitive)
  }

  setEnabled(v: boolean): void {
    this._enabled = v
  }

  clear(): void {
    const d = this._data
    d.measures = []
    d.pending = []
    d.preview = null
    this._primitive.requestUpdate?.()
  }

  clearUser(): void {
    const d = this._data
    d.measures = d.measures.filter((m) => m.source === 'system')
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
    if (ref.kind !== 'measure') return null
    return this._data.measures.find((m) => m.id === ref.id)?.source ?? null
  }

  systemAdd(item: SerializedDrawing): void {
    if (item.kind !== 'measure' || !item.p1 || !item.p2) return
    const d = this._data
    d.measures.push({
      id: this._nextId++,
      p1: { time: item.p1.time, price: item.p1.price },
      p2: { time: item.p2.time, price: item.p2.price },
      source: 'system',
    })
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  hitTestControls(x: number, y: number): DrawingRef | null {
    const measures = this._data.measures
    for (let i = 0; i < measures.length; i++) {
      const anchors = [measures[i].p1, measures[i].p2]
      for (let ai = 0; ai < anchors.length; ai++) {
        const ax = this.chart.timeScale().timeToCoordinate(anchors[ai].time)
        const ay = this.series.priceToCoordinate(anchors[ai].price)
        if (ax !== null && ay !== null && Math.abs(ax - x) <= HIT_THRESHOLD && Math.abs(ay - y) <= HIT_THRESHOLD) {
          return { kind: 'measure', id: measures[i].id, point: ai }
        }
      }
    }
    return null
  }

  /** 命中测量线段 body */
  override hitTest(x: number, y: number): DrawingRef | null {
    const controls = this.hitTestControls(x, y)
    if (controls) return controls
    for (const m of this._data.measures) {
      const x1 = this.chart.timeScale().timeToCoordinate(m.p1.time)
      const y1 = this.series.priceToCoordinate(m.p1.price)
      const x2 = this.chart.timeScale().timeToCoordinate(m.p2.time)
      const y2 = this.series.priceToCoordinate(m.p2.price)
      if (x1 === null || y1 === null || x2 === null || y2 === null) continue
      if (distToSegment(x, y, x1, y1, x2, y2) <= HIT_THRESHOLD) {
        return { kind: 'measure', id: m.id }
      }
    }
    return null
  }

  setHover(ref: DrawingRef | null): void {
    const id = ref?.kind === 'measure' ? ref.id : null
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
      d.measures.push({ id: this._nextId++, p1: d.pending[0], p2: second })
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
    // 拖拽命中不依赖启用状态;system 对象不可拖
    const measures = this._data.measures
    for (let mi = 0; mi < measures.length; mi++) {
      if (measures[mi].source === 'system') continue
      const anchors = [measures[mi].p1, measures[mi].p2]
      for (let ai = 0; ai < anchors.length; ai++) {
        const ax = this.chart.timeScale().timeToCoordinate(anchors[ai].time)
        const ay = this.series.priceToCoordinate(anchors[ai].price)
        if (
          ax !== null &&
          ay !== null &&
          Math.abs(ax - local.x) <= HIT_THRESHOLD &&
          Math.abs(ay - local.y) <= HIT_THRESHOLD
        ) {
          this._drag = { measureIndex: mi, anchorIndex: ai }
          return true
        }
      }
    }
    return false
  }

  onPointerMove(_e: PointerEvent, local: LocalPoint): void {
    const drag = this._drag
    if (!drag) return
    const measure = this._data.measures[drag.measureIndex]
    const anchor = measure ? (drag.anchorIndex === 0 ? measure.p1 : measure.p2) : null
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
    if (ref.kind !== 'measure') return
    this._data.measures = this._data.measures.filter((m) => m.id !== ref.id)
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  getControlPointPrice(ref: DrawingRef): number | null {
    if (ref.kind !== 'measure') return null
    const measure = this._data.measures.find((m) => m.id === ref.id)
    if (!measure) return null
    return (ref.point === 1 ? measure.p2 : measure.p1).price
  }

  setControlPointPrice(ref: DrawingRef, price: number): void {
    if (ref.kind !== 'measure' || !Number.isFinite(price)) return
    const measure = this._data.measures.find((m) => m.id === ref.id)
    // 底层不校验 source:用户权限由 DrawingTools 用户入口统一校验
    if (!measure) return
    if (ref.point === 1) measure.p2.price = price
    else measure.p1.price = price
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  serialize(): SerializedDrawing[] {
    return this._data.measures.map((m: MeasureDrawing) => ({
      id: m.id,
      kind: 'measure',
      p1: { time: String(m.p1.time), price: m.p1.price },
      p2: { time: String(m.p2.time), price: m.p2.price },
      source: m.source === 'system' ? 'system' : undefined,
    }))
  }

  restore(items: SerializedDrawing[]): void {
    const d = this._data
    d.measures = []
    d.pending = []
    d.preview = null
    for (const s of items) {
      if (s.kind !== 'measure' || !s.p1 || !s.p2) continue
      d.measures.push({
        id: s.id,
        p1: { time: s.p1.time, price: s.p1.price },
        p2: { time: s.p2.time, price: s.p2.price },
        source: s.source,
      })
      this._nextId = Math.max(this._nextId, s.id + 1)
    }
    this._primitive.requestUpdate?.()
  }
}

/** 点到线段的最短距离(px) */
function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1)
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}
