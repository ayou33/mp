import { MismatchDirection, type Time } from 'lightweight-charts'
import { DrawingTool, HIT_THRESHOLD, type LocalPoint, type Point } from './DrawingTool'
import { VerticalLinePrimitive, type VerticalLineDataSource, type VerticalLineItem } from './VerticalLinePrimitive'
import type { DrawingRef, DrawingSource, SerializedDrawing } from './types'

/**
 * 垂直线工具:单点(时间)放置的贯穿竖线,标记关键日期/事件(自绘 VerticalLinePrimitive)。
 * 无价格概念,拖拽仅横向移动时间;左键菜单无价格输入,仅删除。
 */
export class VerticalLineTool extends DrawingTool {
  readonly kind = 'vertical-line' as const
  private _primitive: VerticalLinePrimitive
  private _data: VerticalLineDataSource = { items: [] }
  private _nextId = 1
  private _drag: VerticalLineItem | null = null
  private _hoverId: number | null = null

  constructor(
    chart: ConstructorParameters<typeof DrawingTool>[1],
    series: ConstructorParameters<typeof DrawingTool>[2],
    container: ConstructorParameters<typeof DrawingTool>[3],
    getBarCount: ConstructorParameters<typeof DrawingTool>[4],
  ) {
    super('vertical-line', chart, series, container, getBarCount)
    this._primitive = new VerticalLinePrimitive(this._data)
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
    if (ref.kind !== 'vertical-line') return null
    return this._data.items.find((i) => i.id === ref.id)?.source ?? null
  }

  systemAdd(item: SerializedDrawing): void {
    if (item.kind !== 'vertical-line' || !item.time) return
    this._data.items.push({ id: this._nextId++, time: item.time, source: 'system' })
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  /** 命中:靠近竖线 x 坐标即命中(整条线作为控制点) */
  hitTestControls(x: number, _y: number): DrawingRef | null {
    for (const item of this._data.items) {
      const ax = this.chart.timeScale().timeToCoordinate(item.time)
      if (ax !== null && Math.abs(ax - x) <= HIT_THRESHOLD) {
        return { kind: 'vertical-line', id: item.id }
      }
    }
    return null
  }

  setHover(ref: DrawingRef | null): void {
    const id = ref?.kind === 'vertical-line' ? ref.id : null
    if (id === this._hoverId) return
    this._hoverId = id
    this._data.highlight = id
    this._primitive.requestUpdate?.()
  }

  onClick(pt: Point): boolean {
    if (!this._enabled) return false
    // 拖动结束后的那次 click 不重复画线
    if (this.consumeSuppressedClick()) return true
    this._data.items.push({ id: this._nextId++, time: pt.time })
    this._primitive.requestUpdate?.()
    this.notifyChange()
    return true
  }

  onPointerDown(_e: PointerEvent, local: LocalPoint): boolean {
    // 拖拽命中不依赖启用状态;system 对象不可拖
    for (const item of this._data.items) {
      if (item.source === 'system') continue
      const ax = this.chart.timeScale().timeToCoordinate(item.time)
      if (ax !== null && Math.abs(ax - local.x) <= HIT_THRESHOLD) {
        this._drag = item
        return true
      }
    }
    return false
  }

  onPointerMove(_e: PointerEvent, local: LocalPoint): void {
    if (!this._drag) return
    const time = this._snapTime(local.x)
    if (time !== null) {
      this._drag.time = time
      this._primitive.requestUpdate?.()
    }
  }

  onPointerUp(): void {
    if (this._drag) {
      this._drag = null
      this.notifyChange()
    }
  }

  delete(ref: DrawingRef): void {
    if (ref.kind !== 'vertical-line') return
    this._data.items = this._data.items.filter((i) => i.id !== ref.id)
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  /** 无价格概念,菜单不显示价格输入 */
  getControlPointPrice(_ref: DrawingRef): number | null {
    return null
  }

  setControlPointPrice(_ref: DrawingRef, _price: number): void {
    /* 无价格概念,忽略 */
  }

  serialize(): SerializedDrawing[] {
    return this._data.items.map((i) => ({
      id: i.id,
      kind: 'vertical-line',
      time: String(i.time),
      source: i.source === 'system' ? 'system' : undefined,
    }))
  }

  restore(items: SerializedDrawing[]): void {
    this._data.items = []
    for (const s of items) {
      if (s.kind !== 'vertical-line' || !s.time) continue
      this._data.items.push({ id: s.id, time: s.time, source: s.source })
      this._nextId = Math.max(this._nextId, s.id + 1)
    }
    this._primitive.requestUpdate?.()
  }

  /** 横向拖拽:时间吸附到最近 K 线(仿 DrawingTool.moveAnchor 的时间吸附,无价格维度) */
  private _snapTime(x: number): Time | null {
    const logical = this.chart.timeScale().coordinateToLogical(x)
    const total = this._getBarCount()
    if (logical !== null && total > 0) {
      const idx = Math.max(0, Math.min(Math.round(logical), total - 1))
      const bar = this.series.dataByIndex(idx, MismatchDirection.NearestRight)
      if (bar && bar.time !== undefined) return bar.time
    }
    return null
  }
}
