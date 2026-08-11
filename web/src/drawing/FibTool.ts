import { DrawingTool, HIT_THRESHOLD, type LocalPoint, type Point } from './DrawingTool'
import { FibonacciPrimitive, type FibDataSource, type FibDrawing } from './FibonacciPrimitive'
import type { DrawingRef, DrawingSource, SerializedDrawing } from './types'

interface DragFibAnchor {
  fibIndex: number
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
 * 斐波那契回调工具:基于自绘 FibonacciPrimitive。
 * 两次点击定义起止锚点、十字光标预览、锚点拖拽、删除/价格编辑 + 统一序列化回写。
 */
export class FibTool extends DrawingTool {
  readonly kind = 'fib' as const
  private _primitive: FibonacciPrimitive
  private _data: FibDataSource = { fibs: [], pending: [], preview: null }
  private _nextId = 1
  private _drag: DragFibAnchor | null = null
  private _hoverId: number | null = null

  constructor(
    chart: ConstructorParameters<typeof DrawingTool>[1],
    series: ConstructorParameters<typeof DrawingTool>[2],
    container: ConstructorParameters<typeof DrawingTool>[3],
    getBarCount: ConstructorParameters<typeof DrawingTool>[4],
  ) {
    super('fib', chart, series, container, getBarCount)
    this._primitive = new FibonacciPrimitive(this._data)
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
    if (ref.kind !== 'fib') return null
    return this._data.fibs.find((f) => f.id === ref.id)?.source ?? null
  }

  systemAdd(item: SerializedDrawing): void {
    if (item.kind !== 'fib' || !item.p1 || !item.p2) return
    const d = this._data
    d.fibs.push({
      id: this._nextId++,
      p1: { time: item.p1.time, price: item.p1.price },
      p2: { time: item.p2.time, price: item.p2.price },
      source: 'system',
    })
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  hitTestControls(x: number, y: number): DrawingRef | null {
    const fibs = this._data.fibs
    for (let i = 0; i < fibs.length; i++) {
      const anchors = [fibs[i].p1, fibs[i].p2]
      for (let ai = 0; ai < anchors.length; ai++) {
        const ax = this.chart.timeScale().timeToCoordinate(anchors[ai].time)
        const ay = this.series.priceToCoordinate(anchors[ai].price)
        if (ax !== null && ay !== null && Math.abs(ax - x) <= HIT_THRESHOLD && Math.abs(ay - y) <= HIT_THRESHOLD) {
          return { kind: 'fib', id: fibs[i].id, point: ai }
        }
      }
    }
    return null
  }

  /** 命中锚点间连线 body */
  override hitTest(x: number, y: number): DrawingRef | null {
    const controls = this.hitTestControls(x, y)
    if (controls) return controls
    for (const fib of this._data.fibs) {
      const x1 = this.chart.timeScale().timeToCoordinate(fib.p1.time)
      const y1 = this.series.priceToCoordinate(fib.p1.price)
      const x2 = this.chart.timeScale().timeToCoordinate(fib.p2.time)
      const y2 = this.series.priceToCoordinate(fib.p2.price)
      if (x1 === null || y1 === null || x2 === null || y2 === null) continue
      if (distToSegment(x, y, x1, y1, x2, y2) <= HIT_THRESHOLD) {
        return { kind: 'fib', id: fib.id }
      }
    }
    return null
  }

  setHover(ref: DrawingRef | null): void {
    const id = ref?.kind === 'fib' ? ref.id : null
    if (id === this._hoverId) return
    this._hoverId = id
    this._data.highlight = id
    this._primitive.requestUpdate?.()
  }

  onClick(pt: Point): boolean {
    if (!this._enabled) return false
    const d = this._data
    if (d.pending.length === 0) {
      d.pending = [pt]
    } else {
      // 用跟随鼠标的预览位置作为终点(若无预览则用点击点)
      const second = d.preview ?? pt
      d.fibs.push({ id: this._nextId++, p1: d.pending[0], p2: second })
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
    const fibs = this._data.fibs
    for (let fi = 0; fi < fibs.length; fi++) {
      // 用户不可拖拽:系统对象(system 归系统程序管,拖拽=修改)
      if (fibs[fi].source === 'system') continue
      const anchors = [fibs[fi].p1, fibs[fi].p2]
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
    const anchor = fib ? (drag.anchorIndex === 0 ? fib.p1 : fib.p2) : null
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
    if (ref.kind !== 'fib') return
    this._data.fibs = this._data.fibs.filter((f) => f.id !== ref.id)
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  getControlPointPrice(ref: DrawingRef): number | null {
    if (ref.kind !== 'fib') return null
    const fib = this._data.fibs.find((f) => f.id === ref.id)
    if (!fib) return null
    return (ref.point === 1 ? fib.p2 : fib.p1).price
  }

  setControlPointPrice(ref: DrawingRef, price: number): void {
    if (ref.kind !== 'fib' || !Number.isFinite(price)) return
    const fib = this._data.fibs.find((f) => f.id === ref.id)
    // 底层不校验 source:用户权限由 DrawingTools 用户入口统一校验
    if (!fib) return
    if (ref.point === 1) fib.p2.price = price
    else fib.p1.price = price
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  serialize(): SerializedDrawing[] {
    return this._data.fibs.map((f: FibDrawing) => ({
      id: f.id,
      kind: 'fib',
      p1: { time: String(f.p1.time), price: f.p1.price },
      p2: { time: String(f.p2.time), price: f.p2.price },
      source: f.source === 'system' ? 'system' : undefined,
    }))
  }

  restore(items: SerializedDrawing[]): void {
    const d = this._data
    d.fibs = []
    d.pending = []
    d.preview = null
    for (const s of items) {
      if (s.kind !== 'fib' || !s.p1 || !s.p2) continue
      d.fibs.push({
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
