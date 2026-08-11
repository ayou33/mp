import { DrawingTool, HIT_THRESHOLD, type LocalPoint, type Point } from './DrawingTool'
import { TextPrimitive, type TextDataSource, type TextItem } from './TextPrimitive'
import type { DrawingRef, DrawingSource, SerializedDrawing } from './types'

/**
 * 文本标注工具:单点放置的文字标签(自绘 TextPrimitive)。
 * 激活模式点击图表 → 经 onRequestCreateText 回调 React 层弹窗输入文本,确认后创建标注。
 * 锚点可拖拽(时间+价格),左键菜单价格输入可微调纵向位置。
 */
export class TextTool extends DrawingTool {
  readonly kind = 'text' as const
  private _primitive: TextPrimitive
  private _data: TextDataSource = { items: [] }
  private _nextId = 1
  private _drag: TextItem | null = null
  private _hoverId: number | null = null

  /** 激活模式点击图表时请求 React 层弹窗输入文本与价格(由 DrawingTools options 注入) */
  onRequestCreateText: ((pt: Point, submit: (text: string, price: number) => void) => void) | null = null

  constructor(
    chart: ConstructorParameters<typeof DrawingTool>[1],
    series: ConstructorParameters<typeof DrawingTool>[2],
    container: ConstructorParameters<typeof DrawingTool>[3],
    getBarCount: ConstructorParameters<typeof DrawingTool>[4],
    onRequestCreateText: (pt: Point, submit: (text: string, price: number) => void) => void,
  ) {
    super('text', chart, series, container, getBarCount)
    this.onRequestCreateText = onRequestCreateText
    this._primitive = new TextPrimitive(this._data)
    series.attachPrimitive(this._primitive)
  }

  setEnabled(v: boolean): void {
    this._enabled = v
  }

  clear(): void {
    this._data.items = []
    this._primitive.requestUpdate?.()
  }

  clearUser(): void {
    this._data.items = this._data.items.filter((i) => i.source === 'system')
    this._primitive.requestUpdate?.()
  }

  getSource(ref: DrawingRef): DrawingSource | null {
    if (ref.kind !== 'text') return null
    return this._data.items.find((i) => i.id === ref.id)?.source ?? null
  }

  systemAdd(item: SerializedDrawing): void {
    if (item.kind !== 'text' || !item.p1) return
    this._data.items.push({
      id: this._nextId++,
      time: item.p1.time,
      price: item.p1.price,
      text: item.text ?? '',
      source: 'system',
    })
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  hitTestControls(x: number, y: number): DrawingRef | null {
    for (const item of this._data.items) {
      const ax = this.chart.timeScale().timeToCoordinate(item.time)
      const ay = this.series.priceToCoordinate(item.price)
      if (ax !== null && ay !== null && Math.abs(ax - x) <= HIT_THRESHOLD && Math.abs(ay - y) <= HIT_THRESHOLD) {
        return { kind: 'text', id: item.id }
      }
    }
    return null
  }

  setHover(ref: DrawingRef | null): void {
    const id = ref?.kind === 'text' ? ref.id : null
    if (id === this._hoverId) return
    this._hoverId = id
    this._data.highlight = id
    this._primitive.requestUpdate?.()
  }

  onClick(pt: Point): boolean {
    if (!this._enabled) return false
    // 拖动结束后的那次 click 不重复弹输入框
    if (this.consumeSuppressedClick()) return true
    this.onRequestCreateText?.(pt, (text, price) => this.addLabel(pt, text, price))
    return true
  }

  /** 创建文本标注(React 弹窗确认后经 submit 回填文本与编辑后价格) */
  addLabel(pt: Point, text: string, price?: number): void {
    const t = text.trim()
    if (!t) return
    this._data.items.push({ id: this._nextId++, time: pt.time, price: price ?? pt.price, text: t })
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  onCrosshairMove(_pt: Point): void {
    /* 单点工具,无预览 */
  }

  onPointerDown(_e: PointerEvent, local: LocalPoint): boolean {
    // 拖拽命中不依赖启用状态;system 对象不可拖
    for (const item of this._data.items) {
      if (item.source === 'system') continue
      const ax = this.chart.timeScale().timeToCoordinate(item.time)
      const ay = this.series.priceToCoordinate(item.price)
      if (ax !== null && ay !== null && Math.abs(ax - local.x) <= HIT_THRESHOLD && Math.abs(ay - local.y) <= HIT_THRESHOLD) {
        this._drag = item
        return true
      }
    }
    return false
  }

  onPointerMove(_e: PointerEvent, local: LocalPoint): void {
    if (!this._drag) return
    this.moveAnchor(this._drag, local.x, local.y)
    this._primitive.requestUpdate?.()
  }

  onPointerUp(): void {
    if (this._drag) {
      this._drag = null
      this.notifyChange()
    }
  }

  delete(ref: DrawingRef): void {
    if (ref.kind !== 'text') return
    this._data.items = this._data.items.filter((i) => i.id !== ref.id)
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  getControlPointPrice(ref: DrawingRef): number | null {
    if (ref.kind !== 'text') return null
    return this._data.items.find((i) => i.id === ref.id)?.price ?? null
  }

  setControlPointPrice(ref: DrawingRef, price: number): void {
    if (ref.kind !== 'text' || !Number.isFinite(price)) return
    const item = this._data.items.find((i) => i.id === ref.id)
    // 底层不校验 source:用户权限由 DrawingTools 用户入口统一校验
    if (!item) return
    item.price = price
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  serialize(): SerializedDrawing[] {
    return this._data.items.map((i) => ({
      id: i.id,
      kind: 'text',
      p1: { time: String(i.time), price: i.price },
      text: i.text,
      source: i.source === 'system' ? 'system' : undefined,
    }))
  }

  restore(items: SerializedDrawing[]): void {
    this._data.items = []
    for (const s of items) {
      if (s.kind !== 'text' || !s.p1) continue
      this._data.items.push({ id: s.id, time: s.p1.time, price: s.p1.price, text: s.text ?? '', source: s.source })
      this._nextId = Math.max(this._nextId, s.id + 1)
    }
    this._primitive.requestUpdate?.()
  }
}
