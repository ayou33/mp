import type { Time } from 'lightweight-charts'
import { DrawingTool, HIT_THRESHOLD, type LocalPoint, type Point } from './DrawingTool'
import { FibExtPrimitive, type FibExtDataSource, type FibExtDrawing } from './FibExtPrimitive'
import type { DrawingRef, DrawingSource, SerializedDrawing } from './types'

interface DragFibExtAnchor {
  fibIndex: number
  anchorIndex: number
}

/**
 * 斐波那契扩展工具:三点 A/B/C(段起点/段终点/回调点),自绘 FibExtPrimitive。
 * 三次点击放置 A→B→C、十字光标预览、锚点拖拽、删除/价格编辑 + 统一序列化回写。
 * 与 FibTool/LineTool 结构对称,仅多一个锚点(3 点放置)。
 */
export class FibExtTool extends DrawingTool {
  readonly kind = 'fib-ext' as const
  private _primitive: FibExtPrimitive
  private _data: FibExtDataSource = { fibs: [], pending: [], preview: null }
  private _nextId = 1
  private _drag: DragFibExtAnchor | null = null
  private _hoverId: number | null = null

  constructor(
    chart: ConstructorParameters<typeof DrawingTool>[1],
    series: ConstructorParameters<typeof DrawingTool>[2],
    container: ConstructorParameters<typeof DrawingTool>[3],
    getBarCount: ConstructorParameters<typeof DrawingTool>[4],
  ) {
    super('fib-ext', chart, series, container, getBarCount)
    this._primitive = new FibExtPrimitive(this._data)
    series.attachPrimitive(this._primitive)
  }

  setEnabled(v: boolean): void {
    this._enabled = v
  }

  clear(): void {
    const d = this._data
    d.fibs = []
    d.pending = []
    d.preview = null
    this._primitive.requestUpdate?.()
  }

  clearUser(): void {
    const d = this._data
    d.fibs = d.fibs.filter((f) => f.source === 'system')
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
    if (ref.kind !== 'fib-ext') return null
    return this._data.fibs.find((f) => f.id === ref.id)?.source ?? null
  }

  systemAdd(item: SerializedDrawing): void {
    if (item.kind !== 'fib-ext' || !item.p1 || !item.p2 || !item.p3) return
    const d = this._data
    d.fibs.push({
      id: this._nextId++,
      p1: { time: item.p1.time, price: item.p1.price },
      p2: { time: item.p2.time, price: item.p2.price },
      p3: { time: item.p3.time, price: item.p3.price },
      source: 'system',
    })
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  hitTestControls(x: number, y: number): DrawingRef | null {
    const fibs = this._data.fibs
    for (let i = 0; i < fibs.length; i++) {
      const anchors = [fibs[i].p1, fibs[i].p2, fibs[i].p3]
      for (let ai = 0; ai < anchors.length; ai++) {
        const ax = this.chart.timeScale().timeToCoordinate(anchors[ai].time)
        const ay = this.series.priceToCoordinate(anchors[ai].price)
        if (ax !== null && ay !== null && Math.abs(ax - x) <= HIT_THRESHOLD && Math.abs(ay - y) <= HIT_THRESHOLD) {
          return { kind: 'fib-ext', id: fibs[i].id, point: ai }
        }
      }
    }
    return null
  }

  /** 命中锚点间连线(折线 A→B→C 任意一段) */
  override hitTest(x: number, y: number): DrawingRef | null {
    const controls = this.hitTestControls(x, y)
    if (controls) return controls
    for (const fib of this._data.fibs) {
      const pts: Array<[Time, number]> = [
        [fib.p1.time, fib.p1.price],
        [fib.p2.time, fib.p2.price],
        [fib.p3.time, fib.p3.price],
      ]
      for (let i = 0; i < pts.length - 1; i++) {
        const x1 = this.chart.timeScale().timeToCoordinate(pts[i][0])
        const y1 = this.series.priceToCoordinate(pts[i][1])
        const x2 = this.chart.timeScale().timeToCoordinate(pts[i + 1][0])
        const y2 = this.series.priceToCoordinate(pts[i + 1][1])
        if (x1 === null || y1 === null || x2 === null || y2 === null) continue
        if (distToSegment(x, y, x1, y1, x2, y2) <= HIT_THRESHOLD) {
          return { kind: 'fib-ext', id: fib.id }
        }
      }
    }
    return null
  }

  setHover(ref: DrawingRef | null): void {
    const id = ref?.kind === 'fib-ext' ? ref.id : null
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
    if (d.pending.length < 2) {
      d.pending.push(pt)
    } else {
      // 用跟随鼠标的预览位置作为第三点(若无预览则用点击点)
      const third = d.preview ?? pt
      d.fibs.push({ id: this._nextId++, p1: d.pending[0], p2: d.pending[1], p3: third })
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
    if (d.pending.length === 1 || d.pending.length === 2) {
      d.preview = pt
      this._primitive.requestUpdate?.()
    }
  }

  onPointerDown(_e: PointerEvent, local: LocalPoint): boolean {
    // 拖拽命中不依赖启用状态;system 对象不可拖
    const fibs = this._data.fibs
    for (let fi = 0; fi < fibs.length; fi++) {
      if (fibs[fi].source === 'system') continue
      const anchors = [fibs[fi].p1, fibs[fi].p2, fibs[fi].p3]
      for (let ai = 0; ai < anchors.length; ai++) {
        const ax = this.chart.timeScale().timeToCoordinate(anchors[ai].time)
        const ay = this.series.priceToCoordinate(anchors[ai].price)
        if (
          ax !== null &&
          ay !== null &&
          Math.abs(ax - local.x) <= HIT_THRESHOLD &&
          Math.abs(ay - local.y) <= HIT_THRESHOLD
        ) {
          this._drag = { fibIndex: fi, anchorIndex: ai }
          return true
        }
      }
    }
    return false
  }

  onPointerMove(_e: PointerEvent, local: LocalPoint): void {
    const drag = this._drag
    if (!drag) return
    const fib = this._data.fibs[drag.fibIndex]
    const anchor = fib ? [fib.p1, fib.p2, fib.p3][drag.anchorIndex] : null
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
    if (ref.kind !== 'fib-ext') return
    this._data.fibs = this._data.fibs.filter((f) => f.id !== ref.id)
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  getControlPointPrice(ref: DrawingRef): number | null {
    if (ref.kind !== 'fib-ext') return null
    const fib = this._data.fibs.find((f) => f.id === ref.id)
    if (!fib) return null
    return [fib.p1, fib.p2, fib.p3][ref.point ?? 0]?.price ?? null
  }

  setControlPointPrice(ref: DrawingRef, price: number): void {
    if (ref.kind !== 'fib-ext' || !Number.isFinite(price)) return
    const fib = this._data.fibs.find((f) => f.id === ref.id)
    // 底层不校验 source:用户权限由 DrawingTools 用户入口统一校验
    if (!fib) return
    const anchor = [fib.p1, fib.p2, fib.p3][ref.point ?? 0]
    if (anchor) anchor.price = price
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  serialize(): SerializedDrawing[] {
    return this._data.fibs.map((f: FibExtDrawing) => ({
      id: f.id,
      kind: 'fib-ext',
      p1: { time: String(f.p1.time), price: f.p1.price },
      p2: { time: String(f.p2.time), price: f.p2.price },
      p3: { time: String(f.p3.time), price: f.p3.price },
      source: f.source === 'system' ? 'system' : undefined,
    }))
  }

  restore(items: SerializedDrawing[]): void {
    const d = this._data
    d.fibs = []
    d.pending = []
    d.preview = null
    for (const s of items) {
      if (s.kind !== 'fib-ext' || !s.p1 || !s.p2 || !s.p3) continue
      d.fibs.push({
        id: s.id,
        p1: { time: s.p1.time, price: s.p1.price },
        p2: { time: s.p2.time, price: s.p2.price },
        p3: { time: s.p3.time, price: s.p3.price },
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
