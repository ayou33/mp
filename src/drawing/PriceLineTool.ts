import { LineStyle, type IChartApi, type IPriceLine, type ISeriesApi } from 'lightweight-charts'
import { DrawingTool, HIT_THRESHOLD, type LocalPoint, type Point } from './DrawingTool'
import type { DrawingRef, DrawingSource, SerializedDrawing } from './types'

const PRICE_LINE_COLOR = '#f0b90b'

interface PriceLineItem {
  id: number
  line: IPriceLine
  price: number
  /** 归属(缺省 'user'):system 对象用户不可修改/删除 */
  source?: DrawingSource
}

/**
 * 价格线工具:水平价格线基于 lightweight-charts 自带 createPriceLine。
 * 放置(点击)/拖拽/删除/价格编辑 + 统一序列化回写。
 */
export class PriceLineTool extends DrawingTool {
  readonly kind = 'price-line' as const
  private _items: PriceLineItem[] = []
  private _nextId = 1
  private _drag: PriceLineItem | null = null
  private _hoverId: number | null = null

  constructor(
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    container: HTMLElement,
    getBarCount: () => number,
  ) {
    super('price-line', chart, series, container, getBarCount)
  }

  setEnabled(v: boolean): void {
    this._enabled = v
  }

  clear(): void {
    for (const item of this._items) this.series.removePriceLine(item.line)
    this._items = []
  }

  clearUser(): void {
    const kept = this._items.filter((i) => i.source === 'system')
    for (const item of this._items) {
      if (item.source !== 'system') this.series.removePriceLine(item.line)
    }
    this._items = kept
  }

  getSource(ref: DrawingRef): DrawingSource | null {
    if (ref.kind !== 'price-line') return null
    return this._items.find((p) => p.id === ref.id)?.source ?? null
  }

  systemAdd(item: SerializedDrawing): void {
    if (item.kind !== 'price-line') return
    const price = item.price
    if (price === undefined || !Number.isFinite(price)) return
    const line = this.series.createPriceLine({
      price,
      color: PRICE_LINE_COLOR,
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
    })
    this._items.push({ id: this._nextId++, line, price, source: 'system' })
    this.notifyChange()
  }

  dispose(): void {
    this.clear()
  }

  /** 在指定价位放置一条价格线 */
  add(price: number): void {
    const line = this.series.createPriceLine({
      price,
      color: PRICE_LINE_COLOR,
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
    })
    this._items.push({ id: this._nextId++, line, price })
  }

  hitTestControls(_x: number, y: number): DrawingRef | null {
    for (const item of this._items) {
      const cy = this.series.priceToCoordinate(item.price)
      if (cy !== null && Math.abs(cy - y) <= HIT_THRESHOLD) {
        return { kind: 'price-line', id: item.id }
      }
    }
    return null
  }

  setHover(ref: DrawingRef | null): void {
    const id = ref?.kind === 'price-line' ? ref.id : null
    if (id === this._hoverId) return
    const old = this._items.find((p) => p.id === this._hoverId)
    if (old) old.line.applyOptions({ lineWidth: 1 })
    this._hoverId = id
    const next = this._items.find((p) => p.id === id)
    if (next) next.line.applyOptions({ lineWidth: 2 })
  }

  onClick(pt: Point): boolean {
    if (!this._enabled) return false
    // 拖动结束后的那次 click 不重复画线
    if (this.consumeSuppressedClick()) return true
    this.add(pt.price)
    this.notifyChange()
    return true
  }

  onPointerDown(_e: PointerEvent, local: LocalPoint): boolean {
    // 拖拽命中不依赖启用状态:关闭工具后仍可调整已画价格线
    for (const item of this._items) {
      // 用户不可拖拽:系统对象(system 归系统程序管,拖拽=修改)
      if (item.source === 'system') continue
      const cy = this.series.priceToCoordinate(item.price)
      if (cy !== null && Math.abs(cy - local.y) <= HIT_THRESHOLD) {
        this._drag = item
        return true
      }
    }
    return false
  }

  onPointerMove(_e: PointerEvent, local: LocalPoint): void {
    const pl = this._drag
    if (!pl) return
    const price = this.series.coordinateToPrice(local.y)
    if (price !== null) {
      pl.price = price
      pl.line.applyOptions({ price })
    }
  }

  onPointerUp(): void {
    if (this._drag) {
      this._drag = null
      this.notifyChange()
    }
  }

  delete(ref: DrawingRef): void {
    if (ref.kind !== 'price-line') return
    const idx = this._items.findIndex((p) => p.id === ref.id)
    if (idx >= 0) {
      this.series.removePriceLine(this._items[idx].line)
      this._items.splice(idx, 1)
      this.notifyChange()
    }
  }

  getControlPointPrice(ref: DrawingRef): number | null {
    if (ref.kind !== 'price-line') return null
    return this._items.find((p) => p.id === ref.id)?.price ?? null
  }

  setControlPointPrice(ref: DrawingRef, price: number): void {
    if (ref.kind !== 'price-line' || !Number.isFinite(price)) return
    const item = this._items.find((p) => p.id === ref.id)
    // 底层不校验 source:用户权限由 DrawingTools 用户入口统一校验
    if (!item) return
    item.price = price
    item.line.applyOptions({ price })
    this.notifyChange()
  }

  serialize(): SerializedDrawing[] {
    return this._items.map((p) => ({
      id: p.id,
      kind: 'price-line',
      price: p.price,
      source: p.source === 'system' ? 'system' : undefined,
    }))
  }

  restore(items: SerializedDrawing[]): void {
    this.clear()
    for (const d of items) {
      if (d.kind !== 'price-line') continue
      const price = d.price
      if (price === undefined || !Number.isFinite(price)) continue
      this.add(price)
      const item = this._items[this._items.length - 1]
      item.id = d.id
      item.source = d.source
      this._nextId = Math.max(this._nextId, d.id + 1)
    }
  }
}
