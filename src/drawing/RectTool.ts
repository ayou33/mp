import { DrawingTool, HIT_THRESHOLD, type LocalPoint, type Point } from './DrawingTool'
import { RectPrimitive, type RectDataSource, type RectDrawing } from './RectPrimitive'
import type { DrawingRef, DrawingSource, SerializedDrawing } from './types'

interface DragRectAnchor {
  rectIndex: number
  anchorIndex: number
}

/**
 * 矩形工具:两对角锚点框选支撑/压力区间(自绘 RectPrimitive)。
 * 两次点击放置对角、十字光标预览、锚点拖拽、删除/价格编辑 + 统一序列化回写。
 * 与 FibTool/LineTool 结构对称,新增两点类工具照此复制改造。
 */
export class RectTool extends DrawingTool {
  readonly kind = 'rect' as const
  private _primitive: RectPrimitive
  private _data: RectDataSource = { rects: [], pending: [], preview: null }
  private _nextId = 1
  private _drag: DragRectAnchor | null = null
  private _hoverId: number | null = null

  constructor(
    chart: ConstructorParameters<typeof DrawingTool>[1],
    series: ConstructorParameters<typeof DrawingTool>[2],
    container: ConstructorParameters<typeof DrawingTool>[3],
    getBarCount: ConstructorParameters<typeof DrawingTool>[4],
  ) {
    super('rect', chart, series, container, getBarCount)
    this._primitive = new RectPrimitive(this._data)
    series.attachPrimitive(this._primitive)
  }

  setEnabled(v: boolean): void {
    this._enabled = v
  }

  clear(): void {
    const d = this._data
    d.rects = []
    d.pending = []
    d.preview = null
    this._primitive.requestUpdate?.()
  }

  clearUser(): void {
    const d = this._data
    d.rects = d.rects.filter((r) => r.source === 'system')
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
    if (ref.kind !== 'rect') return null
    return this._data.rects.find((r) => r.id === ref.id)?.source ?? null
  }

  systemAdd(item: SerializedDrawing): void {
    if (item.kind !== 'rect' || !item.p1 || !item.p2) return
    const d = this._data
    d.rects.push({
      id: this._nextId++,
      p1: { time: item.p1.time, price: item.p1.price },
      p2: { time: item.p2.time, price: item.p2.price },
      source: 'system',
    })
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  hitTestControls(x: number, y: number): DrawingRef | null {
    const rects = this._data.rects
    for (let i = 0; i < rects.length; i++) {
      const anchors = [rects[i].p1, rects[i].p2]
      for (let ai = 0; ai < anchors.length; ai++) {
        const ax = this.chart.timeScale().timeToCoordinate(anchors[ai].time)
        const ay = this.series.priceToCoordinate(anchors[ai].price)
        if (ax !== null && ay !== null && Math.abs(ax - x) <= HIT_THRESHOLD && Math.abs(ay - y) <= HIT_THRESHOLD) {
          return { kind: 'rect', id: rects[i].id, point: ai }
        }
      }
    }
    return null
  }

  /** 命中矩形内部(含描边) */
  override hitTest(x: number, y: number): DrawingRef | null {
    const controls = this.hitTestControls(x, y)
    if (controls) return controls
    for (const r of this._data.rects) {
      const x1 = this.chart.timeScale().timeToCoordinate(r.p1.time)
      const y1 = this.series.priceToCoordinate(r.p1.price)
      const x2 = this.chart.timeScale().timeToCoordinate(r.p2.time)
      const y2 = this.series.priceToCoordinate(r.p2.price)
      if (x1 === null || y1 === null || x2 === null || y2 === null) continue
      if (
        x >= Math.min(x1, x2) &&
        x <= Math.max(x1, x2) &&
        y >= Math.min(y1, y2) &&
        y <= Math.max(y1, y2)
      ) {
        return { kind: 'rect', id: r.id }
      }
    }
    return null
  }

  setHover(ref: DrawingRef | null): void {
    const id = ref?.kind === 'rect' ? ref.id : null
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
      const second = d.preview ?? pt
      d.rects.push({ id: this._nextId++, p1: d.pending[0], p2: second })
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
    const rects = this._data.rects
    for (let ri = 0; ri < rects.length; ri++) {
      if (rects[ri].source === 'system') continue
      const anchors = [rects[ri].p1, rects[ri].p2]
      for (let ai = 0; ai < anchors.length; ai++) {
        const ax = this.chart.timeScale().timeToCoordinate(anchors[ai].time)
        const ay = this.series.priceToCoordinate(anchors[ai].price)
        if (
          ax !== null &&
          ay !== null &&
          Math.abs(ax - local.x) <= HIT_THRESHOLD &&
          Math.abs(ay - local.y) <= HIT_THRESHOLD
        ) {
          this._drag = { rectIndex: ri, anchorIndex: ai }
          return true
        }
      }
    }
    return false
  }

  onPointerMove(_e: PointerEvent, local: LocalPoint): void {
    const drag = this._drag
    if (!drag) return
    const rect = this._data.rects[drag.rectIndex]
    const anchor = rect ? (drag.anchorIndex === 0 ? rect.p1 : rect.p2) : null
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
    if (ref.kind !== 'rect') return
    this._data.rects = this._data.rects.filter((r) => r.id !== ref.id)
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  getControlPointPrice(ref: DrawingRef): number | null {
    if (ref.kind !== 'rect') return null
    const rect = this._data.rects.find((r) => r.id === ref.id)
    if (!rect) return null
    return (ref.point === 1 ? rect.p2 : rect.p1).price
  }

  setControlPointPrice(ref: DrawingRef, price: number): void {
    if (ref.kind !== 'rect' || !Number.isFinite(price)) return
    const rect = this._data.rects.find((r) => r.id === ref.id)
    // 底层不校验 source:用户权限由 DrawingTools 用户入口统一校验
    if (!rect) return
    if (ref.point === 1) rect.p2.price = price
    else rect.p1.price = price
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  serialize(): SerializedDrawing[] {
    return this._data.rects.map((r: RectDrawing) => ({
      id: r.id,
      kind: 'rect',
      p1: { time: String(r.p1.time), price: r.p1.price },
      p2: { time: String(r.p2.time), price: r.p2.price },
      source: r.source === 'system' ? 'system' : undefined,
    }))
  }

  restore(items: SerializedDrawing[]): void {
    const d = this._data
    d.rects = []
    d.pending = []
    d.preview = null
    for (const s of items) {
      if (s.kind !== 'rect' || !s.p1 || !s.p2) continue
      d.rects.push({
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
