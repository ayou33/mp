import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts'
import type { IndicatorPoint } from '../../types'
import { hexToRgba } from './lib'

/** 区间填充的状态(就地更新:primitive 捕获此对象引用,只能改属性,不能整体替换) */
export interface BandState {
  upper: IndicatorPoint[]
  lower: IndicatorPoint[]
  /** 上轨线色(填充 = 该色 × opacity) */
  upperColor: string
  /** 下轨线色 */
  lowerColor: string
  opacity: number
}

/**
 * 区间填充 primitive:附着在 band 上轨 series 上,把上/下轨之间的区域绘制为半透明填充。
 * x 坐标经 chart.timeScale().timeToCoordinate,上/下轨 y 坐标分别经各自 series.priceToCoordinate。
 * 要求上下轨共享同一价格轴(scale 分配相同),且 series 的 lastValueVisible/priceLineVisible 关闭。
 * 状态对象就地更新(坑 1:绝不整体替换 primitive 捕获的对象引用)。
 */
export class BandPrimitive implements ISeriesPrimitive<Time> {
  private _view: BandPaneView

  requestUpdate: (() => void) | null = null

  constructor(
    chart: IChartApi,
    upperSeries: ISeriesApi<'Line'>,
    lowerSeries: ISeriesApi<'Line'>,
    state: BandState,
  ) {
    this._view = new BandPaneView(chart, upperSeries, lowerSeries, state)
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this.requestUpdate = param.requestUpdate
  }

  detached(): void {
    this.requestUpdate = null
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._view]
  }
}

class BandPaneView implements IPrimitivePaneView {
  private _renderer: BandPaneRenderer

  constructor(
    chart: IChartApi,
    upper: ISeriesApi<'Line'>,
    lower: ISeriesApi<'Line'>,
    state: BandState,
  ) {
    this._renderer = new BandPaneRenderer(chart, upper, lower, state)
  }

  zOrder(): 'bottom' {
    return 'bottom'
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer
  }
}

class BandPaneRenderer implements IPrimitivePaneRenderer {
  constructor(
    private _chart: IChartApi,
    private _upper: ISeriesApi<'Line'>,
    private _lower: ISeriesApi<'Line'>,
    private _state: BandState,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    const { _upper: upper, _lower: lower, _state: state, _chart: chart } = this
    if (state.upper.length === 0 || state.lower.length === 0) return

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const hrp = scope.horizontalPixelRatio
      const vrp = scope.verticalPixelRatio

      // 上下轨须共享同一价格轴,否则无法构成面积(坐标对必须落在同一条竖直线上)
      if (upper.options().priceScaleId !== lower.options().priceScaleId) return

      const timeScale = chart.timeScale()
      const xs: number[] = []
      const yUps: number[] = []
      const yLos: number[] = []
      const n = Math.min(state.upper.length, state.lower.length)
      for (let i = 0; i < n; i++) {
        const up = state.upper[i]
        const lo = state.lower[i]
        if (!up || !lo || up.time !== lo.time) continue
        const x = timeScale.timeToCoordinate(up.time as Time)
        const yUp = upper.priceToCoordinate(up.value)
        const yLo = lower.priceToCoordinate(lo.value)
        if (x === null || yUp === null || yLo === null) continue
        xs.push(x)
        yUps.push(yUp)
        yLos.push(yLo)
      }
      if (xs.length < 2) return

      // 填充多边形:上部按序 + 下部倒序
      ctx.beginPath()
      ctx.moveTo(xs[0] * hrp, yUps[0] * vrp)
      for (let i = 1; i < xs.length; i++) ctx.lineTo(xs[i] * hrp, yUps[i] * vrp)
      for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(xs[i] * hrp, yLos[i] * vrp)
      ctx.closePath()
      ctx.fillStyle = hexToRgba(state.upperColor, state.opacity)
      ctx.fill()

      // 上下轨描边
      ctx.lineWidth = 1 * vrp
      ctx.strokeStyle = state.upperColor
      ctx.beginPath()
      for (let i = 0; i < xs.length; i++) {
        const x = xs[i] * hrp
        const y = yUps[i] * vrp
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()

      ctx.strokeStyle = state.lowerColor
      ctx.beginPath()
      for (let i = 0; i < xs.length; i++) {
        const x = xs[i] * hrp
        const y = yLos[i] * vrp
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    })
  }
}
