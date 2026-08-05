import {
  LineStyle,
  MismatchDirection,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from 'lightweight-charts'
import { FibonacciPrimitive, type FibDataSource } from './FibonacciPrimitive'

const PRICE_LINE_COLOR = '#f0b90b'
/** 命中判定:鼠标距目标的最大像素距离 */
const HIT_THRESHOLD = 8

interface PriceLineItem {
  id: number
  line: IPriceLine
  price: number
}

interface DragAnchor {
  fibIndex: number
  anchorIndex: number
}

interface DrawingToolsOptions {
  /** 当前 K 线数量,拖锚点吸附时间时用于钳制索引 */
  getBarCount: () => number
}

/**
 * 画线工具控制器(非 React):承载价格线 + 斐波那契的放置/预览/拖拽/清除。
 * 挂在图表事件上,把交互逻辑从组件层下沉到这里。
 */
export class DrawingTools {
  private _chart: IChartApi
  private _series: ISeriesApi<'Candlestick'>
  private _container: HTMLElement
  private _getBarCount: () => number
  private _fibPrimitive: FibonacciPrimitive
  private _fibData: FibDataSource = { fibs: [], pending: [], preview: null }
  private _priceLines: PriceLineItem[] = []
  private _nextId = 1
  private _dragPriceLine: PriceLineItem | null = null
  private _dragAnchor: DragAnchor | null = null
  private _suppressClick = false
  private _drawingEnabled = false
  private _fibEnabled = false
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
    this._getBarCount = options.getBarCount
    this._fibPrimitive = new FibonacciPrimitive(this._fibData)
    series.attachPrimitive(this._fibPrimitive)
    this._subscribe()
  }

  setDrawingEnabled(v: boolean): void {
    this._drawingEnabled = v
  }

  setFibEnabled(v: boolean): void {
    this._fibEnabled = v
  }

  /** 清除所有价格线与斐波那契。注意就地变更 fibData,不能整体换对象(见 CLAUDE.md 关键坑 2) */
  clearAll(): void {
    for (const item of this._priceLines) this._series.removePriceLine(item.line)
    this._priceLines = []
    const d = this._fibData
    d.fibs = []
    d.pending = []
    d.preview = null
    this._fibPrimitive.requestUpdate?.()
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

    this._cleanups.push(() => {
      this._chart.unsubscribeClick(this._onClick)
      this._chart.unsubscribeCrosshairMove(this._onCrosshairMove)
      el.removeEventListener('pointerdown', this._onPointerDown)
      el.removeEventListener('pointermove', this._onPointerMove)
      el.removeEventListener('pointerup', this._onPointerUp)
      window.removeEventListener('pointerup', this._onPointerUp)
    })
  }

  /** 点击:斐波那契放置锚点;画线模式放置价格线 */
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
        d.fibs.push([d.pending[0], second])
        d.pending = []
        d.preview = null
      }
      this._fibPrimitive.requestUpdate?.()
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

  /** 十字光标移动:放置第 2 个锚点前预览跟随鼠标 */
  private _onCrosshairMove = (param: MouseEventParams<Time>): void => {
    if (!this._fibEnabled) return
    const d = this._fibData
    if (d.pending.length !== 1) return
    const pt = this._pointFromParams(param)
    if (!pt) return
    d.preview = pt
    this._fibPrimitive.requestUpdate?.()
  }

  private _onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return
    const { x, y } = this._toLocal(e)

    // 先命中斐波那契锚点
    const data = this._fibData
    for (let fi = 0; fi < data.fibs.length; fi++) {
      const fib = data.fibs[fi]
      for (let ai = 0; ai < fib.length; ai++) {
        const ax = this._chart.timeScale().timeToCoordinate(fib[ai].time)
        const ay = this._series.priceToCoordinate(fib[ai].price)
        if (ax !== null && ay !== null && Math.abs(ax - x) <= HIT_THRESHOLD && Math.abs(ay - y) <= HIT_THRESHOLD) {
          this._dragAnchor = { fibIndex: fi, anchorIndex: ai }
          e.preventDefault()
          e.stopPropagation()
          return
        }
      }
    }

    // 再命中价格线
    for (const item of this._priceLines) {
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

    // 拖动斐波那契锚点:时间吸附到最近 K 线,价格跟随鼠标
    const drag = this._dragAnchor
    if (drag) {
      const fib = this._fibData.fibs[drag.fibIndex]
      const anchor = fib?.[drag.anchorIndex]
      if (!anchor) {
        this._dragAnchor = null
        return
      }
      const logical = this._chart.timeScale().coordinateToLogical(x)
      const total = this._getBarCount()
      if (logical !== null && total > 0) {
        const idx = Math.max(0, Math.min(Math.round(logical), total - 1))
        const bar = this._series.dataByIndex(idx, MismatchDirection.NearestRight)
        if (bar && bar.time !== undefined) anchor.time = bar.time
      }
      const price = this._series.coordinateToPrice(y)
      if (price !== null) anchor.price = price
      this._fibPrimitive.requestUpdate?.()
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
  }

  private _onPointerUp = (): void => {
    if (this._dragPriceLine !== null) this._suppressClick = true
    this._dragPriceLine = null
    this._dragAnchor = null
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
    if (!param.point || param.time === undefined) return null
    const price = this._series.coordinateToPrice(param.point.y)
    if (price === null) return null
    return { time: param.time, price }
  }

  private _toLocal(e: PointerEvent): { x: number; y: number } {
    const rect = this._container.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
}
