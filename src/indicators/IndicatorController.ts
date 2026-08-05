import {
  LineSeries,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type MouseEventParams,
  type Time,
} from 'lightweight-charts'
import type { KlineBar } from '../types'
import {
  IndicatorAxisPrimitive,
  type IndicatorAxisItem,
  type IndicatorAxisState,
} from './IndicatorAxis'
import { SubChartIndicator, type SubChartIndicatorDef } from './SubChartIndicator'
import { KDJ_DEF, MACD_DEF, RSI_DEF } from './subCharts'
import { calcBBI } from './bbi'
import { calcMA } from './ma'

/** 指标显示配置:MA/BBI 主图开关 + 周期列表,RSI/MACD/KDJ 副图开关 */
export interface IndicatorConfig {
  showMA: boolean
  showBBI: boolean
  showRSI: boolean
  showMACD: boolean
  showKDJ: boolean
  maPeriods: number[]
}

/** 图例条目(label 常显,value 跟随十字线) */
export interface IndicatorLegendEntry {
  label: string
  value: string | null
  color: string
}

/** 图例分两路:ohlcv 显示在右上,indicators(主图指标值)显示在左上 */
export interface ChartLegend {
  ohlcv: IndicatorLegendEntry[]
  indicators: IndicatorLegendEntry[]
}

/** 主图 series 引用,十字光标图例需要读取 OHLCV */
export interface MainSeriesRef {
  candle: ISeriesApi<'Candlestick'>
  volume: ISeriesApi<'Histogram'>
}

const MA_COLORS = ['#f0b90b', '#2962ff', '#f23645', '#00bcd4']
const BBI_COLOR = '#00bcd4'
const UP_COLOR = '#f23645'
const DOWN_COLOR = '#089981'

/** 副图指标固定顺序(决定 pane 从上到下的排列) */
const SUB_CHART_ORDER: Array<{
  id: string
  def: SubChartIndicatorDef
  enabled: (c: IndicatorConfig) => boolean
}> = [
  { id: 'rsi', def: RSI_DEF, enabled: (c) => c.showRSI },
  { id: 'macd', def: MACD_DEF, enabled: (c) => c.showMACD },
  { id: 'kdj', def: KDJ_DEF, enabled: (c) => c.showKDJ },
]

/**
 * 指标控制器(非 React):装配/更新指标 series,并提供十字光标图例。
 * - 主图:MA 线 + 价格轴最新值标签;左上图例(值随十字线)
 * - 副图:RSI/MACD/KDJ 各自独立 pane,值显示在副图左上角
 * - OHLCV(右上)随十字线,无十字线回退最新值
 */
export class IndicatorController {
  private _chart: IChartApi
  private _config: IndicatorConfig
  private _bars: KlineBar[] = []
  private _main: MainSeriesRef
  private _maSeries: Array<ISeriesApi<'Line'>> = []
  private _bbiSeries: ISeriesApi<'Line'> | null = null
  private _bbiAxisItem: IndicatorAxisItem | null = null
  private _subCharts: Map<string, SubChartIndicator> = new Map()
  private _legendCallback: ((legend: ChartLegend) => void) | null = null
  private _mainAxisPrimitive: IndicatorAxisPrimitive
  private _mainAxisState: IndicatorAxisState = { items: [] }

  constructor(chart: IChartApi, config: IndicatorConfig, main: MainSeriesRef) {
    this._chart = chart
    this._config = { ...config }
    this._main = main
    this._mainAxisPrimitive = new IndicatorAxisPrimitive(main.candle, this._mainAxisState)
    main.candle.attachPrimitive(this._mainAxisPrimitive)
    this._syncSeries()
    this._chart.subscribeCrosshairMove(this._onCrosshairMove)
  }

  /** 注册图例回调:配置变化与十字光标移动时触发 */
  setLegendCallback(cb: ((legend: ChartLegend) => void) | null): void {
    this._legendCallback = cb
    this._emitLegend()
  }

  setConfig(config: IndicatorConfig): void {
    this._config = { ...config }
    this._syncSeries()
    this._recompute()
    this._emitLegend()
  }

  /** 数据变化时重算全部指标与主图轴标签最新值(换股/刷新时调用) */
  update(bars: KlineBar[]): void {
    this._bars = bars
    this._recompute()
    this._emitLegend()
  }

  dispose(): void {
    this._chart.unsubscribeCrosshairMove(this._onCrosshairMove)
    this._main.candle.detachPrimitive(this._mainAxisPrimitive)
    for (const inst of this._subCharts.values()) inst.dispose()
    this._subCharts.clear()
    for (const s of this._maSeries) this._chart.removeSeries(s)
    this._maSeries = []
    if (this._bbiSeries) {
      this._chart.removeSeries(this._bbiSeries)
      this._bbiSeries = null
    }
  }

  /** 按配置增删 series:MA 对齐 maPeriods;BBI 主图线;副图指标按启用集合重建(保证 pane 顺序) */
  private _syncSeries(): void {
    const { showBBI, maPeriods } = this._config

    // 主图轴标签状态(MA + BBI)
    const items: IndicatorAxisItem[] = maPeriods.map((_, i) => ({
      value: null,
      color: MA_COLORS[i % MA_COLORS.length],
    }))
    if (showBBI) {
      this._bbiAxisItem = { value: null, color: BBI_COLOR }
      items.push(this._bbiAxisItem)
    } else {
      this._bbiAxisItem = null
    }
    this._mainAxisState.items = items

    while (this._maSeries.length < maPeriods.length) {
      const i = this._maSeries.length
      this._maSeries.push(
        this._chart.addSeries(LineSeries, {
          color: MA_COLORS[i % MA_COLORS.length],
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        }),
      )
    }
    while (this._maSeries.length > maPeriods.length) {
      this._chart.removeSeries(this._maSeries.pop()!)
    }

    if (showBBI && !this._bbiSeries) {
      this._bbiSeries = this._chart.addSeries(LineSeries, {
        color: BBI_COLOR,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      })
    } else if (!showBBI && this._bbiSeries) {
      this._chart.removeSeries(this._bbiSeries)
      this._bbiSeries = null
    }

    this._syncSubCharts()
  }

  private _syncSubCharts(): void {
    const enabledIds = SUB_CHART_ORDER.filter((e) => e.enabled(this._config)).map((e) => e.id)
    const currentIds = [...this._subCharts.keys()]
    const same = enabledIds.length === currentIds.length && enabledIds.every((id, i) => id === currentIds[i])
    if (same) return

    for (const inst of this._subCharts.values()) inst.dispose()
    this._subCharts.clear()
    let pane = 1
    for (const entry of SUB_CHART_ORDER) {
      if (entry.enabled(this._config)) {
        this._subCharts.set(entry.id, new SubChartIndicator(this._chart, entry.def, pane))
        pane++
      }
    }
  }

  private _recompute(): void {
    const { showMA, showBBI, maPeriods } = this._config
    this._maSeries.forEach((s, i) => {
      const period = maPeriods[i]
      const data = showMA && period > 0 ? calcMA(this._bars, period) : []
      s.setData(data)
      // 主图轴标签显示最新值(不跟随十字线)
      const item = this._mainAxisState.items[i]
      if (item) item.value = data.length > 0 ? data[data.length - 1].value : null
    })
    if (this._bbiSeries) {
      const data = showBBI ? calcBBI(this._bars) : []
      this._bbiSeries.setData(data)
      if (this._bbiAxisItem) this._bbiAxisItem.value = data.length > 0 ? data[data.length - 1].value : null
    }
    for (const inst of this._subCharts.values()) inst.update(this._bars)
    this._mainAxisPrimitive.requestUpdate?.()
  }

  /** 十字光标移动:更新副图角标,输出 OHLCV(右上)+ 主图指标值(左上) */
  private _onCrosshairMove = (param: MouseEventParams<Time>): void => {
    if (!this._legendCallback) return
    for (const inst of this._subCharts.values()) inst.applyCrosshair(param)
    this._legendCallback(this._buildLegend(param))
  }

  /** 无十字光标:同样回退显示最新 K 线值 */
  private _emitLegend(): void {
    const empty = { seriesData: new Map() } as MouseEventParams<Time>
    for (const inst of this._subCharts.values()) inst.applyCrosshair(empty)
    this._legendCallback?.(this._buildLegend(empty))
  }

  private _buildLegend(param: MouseEventParams<Time>): ChartLegend {
    return {
      ohlcv: this._buildOHLCV(param),
      indicators: this._buildIndicatorEntries(
        (s) => param.seriesData.get(s) as LineData<Time> | undefined,
      ),
    }
  }

  private _buildOHLCV(param: MouseEventParams<Time>): IndicatorLegendEntry[] {
    const candle = this._main.candle
    const cross = (() => {
      const c = param.seriesData.get(candle) as CandlestickData<Time> | undefined
      return c && 'open' in c ? c : null
    })()
    const latest = this._bars[this._bars.length - 1]
    const open = cross ? cross.open : latest?.open
    const high = cross ? cross.high : latest?.high
    const low = cross ? cross.low : latest?.low
    const close = cross ? cross.close : latest?.close
    if (open === undefined) return []

    // 昨收:当前 bar 的前一根(十字线按时间定位,否则取最新一根的前一根)
    let prevClose: number | undefined
    if (cross) {
      const idx = this._bars.findIndex((b) => b.time === cross.time)
      if (idx > 0) prevClose = this._bars[idx - 1].close
    } else if (this._bars.length > 1) {
      prevClose = this._bars[this._bars.length - 2].close
    }

    // 当日 K 线颜色:按开收阴阳(阳红阴绿),整个 OHLCV/涨跌区块统一用它
    const dayColor = (close as number) >= open ? UP_COLOR : DOWN_COLOR
    const entries: IndicatorLegendEntry[] = []

    // 涨跌值 + 涨幅(较昨收)
    if (prevClose !== undefined && prevClose > 0) {
      const change = (close as number) - prevClose
      const pct = (change / prevClose) * 100
      entries.push(
        { label: '', value: `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% ${change >= 0 ? '+' : ''}${change.toFixed(2)}`, color: dayColor },
      )
    }

    entries.push(
      { label: '开:', value: open.toFixed(2), color: dayColor },
      { label: '高:', value: (high as number).toFixed(2), color: dayColor },
      { label: '低:', value: (low as number).toFixed(2), color: dayColor },
      { label: '收:', value: (close as number).toFixed(2), color: dayColor },
    )
    const volume = this._main.volume
    if (volume) {
      const v = param.seriesData.get(volume) as HistogramData<Time> | undefined
      const vol = v && 'value' in v ? v.value : latest?.volume
      if (vol !== undefined) {
        entries.push({ label: '量:', value: Math.round(vol).toLocaleString('zh-CN'), color: dayColor })
      }
    }
    return entries
  }

  /** 主图指标(MA/BBI)的左上图例:十字线值优先,否则回退最新值 */
  private _buildIndicatorEntries(
    getData: (s: ISeriesApi<'Line'>) => LineData<Time> | undefined,
  ): IndicatorLegendEntry[] {
    const { showMA, showBBI, maPeriods } = this._config
    const entries: IndicatorLegendEntry[] = []
    this._maSeries.forEach((s, i) => {
      if (!showMA || !maPeriods[i]) return
      const data = getData(s)
      const fallback = this._mainAxisState.items[i]?.value ?? null
      const value = data && 'value' in data ? data.value : fallback
      entries.push({
        label: `MA${maPeriods[i]}`,
        value: value !== null ? value.toFixed(2) : null,
        color: MA_COLORS[i % MA_COLORS.length],
      })
    })
    if (showBBI && this._bbiSeries) {
      const data = getData(this._bbiSeries)
      const fallback = this._bbiAxisItem?.value ?? null
      const value = data && 'value' in data ? data.value : fallback
      entries.push({
        label: 'BBI',
        value: value !== null ? value.toFixed(2) : null,
        color: BBI_COLOR,
      })
    }
    return entries
  }
}
