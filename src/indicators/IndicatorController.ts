import {
  LineSeries,
  LineStyle,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type LineWidth,
  type MouseEventParams,
  type Time,
} from 'lightweight-charts'
import type { IndicatorPoint, KlineBar } from '../types'
import {
  IndicatorAxisPrimitive,
  type IndicatorAxisItem,
  type IndicatorAxisState,
} from './IndicatorAxis'
import {
  SubChartIndicator,
  mergeLineStyle,
  type IndicatorLineStyle,
  type SubChartIndicatorDef,
  type SubChartParams,
} from './SubChartIndicator'
import {
  ATR_DEF,
  CCI_DEF,
  DMI_DEF,
  KDJ_DEF,
  MACD_DEF,
  OBV_DEF,
  RSI_DEF,
  WR_DEF,
} from './subCharts'
import { calcBBI } from './bbi'
import { calcMA } from './ma'
import { calcEMA } from './ema'
import { calcBOLL } from './boll'
import { CustomIndicatorManager } from './custom/CustomIndicatorManager'
import type { CustomIndicatorConfigEntry } from './custom/types'

/** 内置指标 id(主图 + 副图);lineStyles 按此分组 */
export type IndicatorId =
  | 'ma'
  | 'ema'
  | 'boll'
  | 'bbi'
  | 'rsi'
  | 'macd'
  | 'kdj'
  | 'wr'
  | 'cci'
  | 'obv'
  | 'atr'
  | 'dmi'

/** 指标显示配置:主图(MA/EMA/BBI/BOLL)+ 副图(RSI/MACD/KDJ/WR/CCI/OBV/ATR/DMI)开关、参数与各输出线样式 */
export interface IndicatorConfig {
  showMA: boolean
  showEMA: boolean
  showBBI: boolean
  showBOLL: boolean
  showRSI: boolean
  showMACD: boolean
  showKDJ: boolean
  showWR: boolean
  showCCI: boolean
  showOBV: boolean
  showATR: boolean
  showDMI: boolean
  maPeriods: number[]
  emaPeriods: number[]
  bbiPeriods: number[]
  bollPeriod: number
  bollStdDev: number
  rsiPeriod: number
  macdFast: number
  macdSlow: number
  macdSignal: number
  kdjPeriod: number
  kdjKSmooth: number
  kdjDSmooth: number
  wrPeriods: number[]
  cciPeriod: number
  atrPeriod: number
  dmiPeriod: number
  /** 各输出线样式覆盖(未覆盖的线用默认);key:MA/EMA=索引字符串,BOLL=upper/mid/lower,BBI=bbi,副图=组件 key */
  lineStyles: Partial<Record<IndicatorId, Record<string, IndicatorLineStyle>>>
  /** 自定义指标实例配置(id → 启用/挂载位置/参数/线样式/Y 轴);缺省 {} */
  custom: Record<string, CustomIndicatorConfigEntry>
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

/** 主图默认线色(编辑面板未覆盖时使用;editorMeta 的默认色需与此同步) */
export const MA_COLORS = ['#f0b90b', '#2962ff', '#f23645', '#00bcd4']
export const EMA_COLORS = ['#26c6da', '#ce93d8', '#ef9a9a', '#a5d6a7']
export const BOLL_MID_COLOR = '#4fc3f7'
export const BOLL_BAND_COLOR = '#26c6da'
export const BBI_COLOR = '#00bcd4'
const UP_COLOR = '#f23645'
const DOWN_COLOR = '#089981'

/** 副图指标定义注册表:顺序仅作初始激活顺序与新指标注册顺序,pane 实际排列由激活顺序 _subOrder 决定 */
export const SUB_CHART_DEFS: Array<{
  id: string
  def: SubChartIndicatorDef
  enabled: (c: IndicatorConfig) => boolean
}> = [
  { id: 'rsi', def: RSI_DEF, enabled: (c) => c.showRSI },
  { id: 'macd', def: MACD_DEF, enabled: (c) => c.showMACD },
  { id: 'kdj', def: KDJ_DEF, enabled: (c) => c.showKDJ },
  { id: 'wr', def: WR_DEF, enabled: (c) => c.showWR },
  { id: 'cci', def: CCI_DEF, enabled: (c) => c.showCCI },
  { id: 'obv', def: OBV_DEF, enabled: (c) => c.showOBV },
  { id: 'atr', def: ATR_DEF, enabled: (c) => c.showATR },
  { id: 'dmi', def: DMI_DEF, enabled: (c) => c.showDMI },
]

/**
 * 指标控制器(非 React):装配/更新指标 series,并提供十字光标图例。
 * - 主图:MA/EMA/BBI/BOLL 线 + 价格轴最新值标签;左上图例(值随十字线)
 * - 副图:各指标独立 pane,值显示在副图左上角
 * - OHLCV(右上)随十字线,无十字线回退最新值
 */
export class IndicatorController {
  private _chart: IChartApi
  private _config: IndicatorConfig
  private _bars: KlineBar[] = []
  private _main: MainSeriesRef
  private _maSeries: Array<ISeriesApi<'Line'>> = []
  private _emaSeries: Array<ISeriesApi<'Line'>> = []
  /** BOLL 三条线:[上轨, 中轨, 下轨] */
  private _bollSeries: Array<ISeriesApi<'Line'> | null> = [null, null, null]
  private _bbiSeries: ISeriesApi<'Line'> | null = null
  /** 主图每条线对应的轴标签 item(重建时按可见顺序填回 _mainAxisState.items) */
  private _axisItemBySeries = new Map<ISeriesApi<'Line'>, IndicatorAxisItem>()
  private _subCharts: Map<string, SubChartIndicator> = new Map()
  /** 副图激活顺序(自上而下):新启用 append 到末尾,关闭则移除 */
  private _subOrder: string[] = []
  /** 上次副图重建的配置签名(激活顺序+参数+样式),未变则跳过重建 */
  private _lastSubSig: string | null = null
  private _legendCallback: ((legend: ChartLegend) => void) | null = null
  private _mainAxisPrimitive: IndicatorAxisPrimitive
  private _mainAxisState: IndicatorAxisState = { items: [] }
  private _customMgr: CustomIndicatorManager

  constructor(chart: IChartApi, config: IndicatorConfig, main: MainSeriesRef) {
    this._chart = chart
    this._config = { ...config }
    this._main = main
    // 初始激活顺序:按注册顺序取初始已启用的副图
    this._subOrder = SUB_CHART_DEFS.filter((e) => e.enabled(config)).map((e) => e.id)
    this._mainAxisPrimitive = new IndicatorAxisPrimitive(main.candle, this._mainAxisState)
    main.candle.attachPrimitive(this._mainAxisPrimitive)
    this._customMgr = new CustomIndicatorManager(chart)
    this._syncSeries()
    // 先同步副图 pane 基数,再注入自定义配置(避免启动时按默认基数重复重建)
    this._customMgr.setConfig(config.custom ?? {})
    this._chart.subscribeCrosshairMove(this._onCrosshairMove)
  }

  /** 注册图例回调:配置变化与十字光标移动时触发 */
  setLegendCallback(cb: ((legend: ChartLegend) => void) | null): void {
    this._legendCallback = cb
    this._emitLegend()
  }

  setConfig(config: IndicatorConfig): void {
    const prev = this._config
    this._config = { ...config }
    this._updateSubOrder(prev)
    this._syncSeries()
    this._customMgr.setConfig(config.custom ?? {})
    this._recompute()
    this._emitLegend()
  }

  /** 数据变化时重算全部指标与主图轴标签最新值(换股/刷新时调用) */
  update(bars: KlineBar[]): void {
    this._bars = bars
    this._recompute()
    this._customMgr.update(bars)
    this._emitLegend()
  }

  dispose(): void {
    this._chart.unsubscribeCrosshairMove(this._onCrosshairMove)
    this._main.candle.detachPrimitive(this._mainAxisPrimitive)
    this._customMgr.dispose()
    for (const inst of this._subCharts.values()) inst.dispose()
    this._subCharts.clear()
    for (const s of this._maSeries) this._chart.removeSeries(s)
    for (const s of this._emaSeries) this._chart.removeSeries(s)
    for (const s of this._bollSeries) if (s) this._chart.removeSeries(s)
    if (this._bbiSeries) this._chart.removeSeries(this._bbiSeries)
    this._maSeries = []
    this._emaSeries = []
    this._bollSeries = [null, null, null]
    this._bbiSeries = null
    this._axisItemBySeries.clear()
  }

  /** 按配置增删 series:MA/EMA 对齐周期数组;BBI/BOLL 主图线;副图指标按启用集合重建(保证 pane 顺序) */
  private _syncSeries(): void {
    const { showBBI, showBOLL, maPeriods, emaPeriods } = this._config

    // MA(对齐 maPeriods)
    while (this._maSeries.length < maPeriods.length) {
      this._maSeries.push(
        this._chart.addSeries(LineSeries, {
          color: MA_COLORS[this._maSeries.length % MA_COLORS.length],
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        }),
      )
    }
    while (this._maSeries.length > maPeriods.length) this._chart.removeSeries(this._maSeries.pop()!)
    this._maSeries.forEach((s, i) => this._applyMainStyle(s, 'ma', String(i), { color: MA_COLORS[i % MA_COLORS.length] }))

    // EMA(对齐 emaPeriods)
    while (this._emaSeries.length < emaPeriods.length) {
      this._emaSeries.push(
        this._chart.addSeries(LineSeries, {
          color: EMA_COLORS[this._emaSeries.length % EMA_COLORS.length],
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        }),
      )
    }
    while (this._emaSeries.length > emaPeriods.length) this._chart.removeSeries(this._emaSeries.pop()!)
    this._emaSeries.forEach((s, i) => this._applyMainStyle(s, 'ema', String(i), { color: EMA_COLORS[i % EMA_COLORS.length] }))

    // BBI
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
    if (this._bbiSeries) this._applyMainStyle(this._bbiSeries, 'bbi', 'bbi', { color: BBI_COLOR })

    // BOLL 上/中/下三线
    this._bollSeries.forEach((s, i) => {
      if (showBOLL && !s) {
        this._bollSeries[i] = this._chart.addSeries(LineSeries, {
          color: i === 1 ? BOLL_MID_COLOR : BOLL_BAND_COLOR,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        })
      } else if (!showBOLL && s) {
        this._chart.removeSeries(s)
        this._bollSeries[i] = null
      }
    })
    this._bollSeries.forEach((s, i) => {
      if (!s) return
      const key = i === 1 ? 'mid' : i === 0 ? 'upper' : 'lower'
      this._applyMainStyle(s, 'boll', key, { color: i === 1 ? BOLL_MID_COLOR : BOLL_BAND_COLOR })
    })

    // 主图轴标签:按可见顺序(MA → EMA → BOLL 三线 → BBI)重建,供 _recompute 更新最新值
    this._axisItemBySeries.clear()
    const items: IndicatorAxisItem[] = []
    const pushItem = (s: ISeriesApi<'Line'> | null, color: string): void => {
      if (!s) return
      const item: IndicatorAxisItem = { value: null, color }
      this._axisItemBySeries.set(s, item)
      items.push(item)
    }
    this._maSeries.forEach((s, i) => pushItem(s, this._lineStyle('ma', String(i), { color: MA_COLORS[i % MA_COLORS.length] }).color))
    this._emaSeries.forEach((s, i) => pushItem(s, this._lineStyle('ema', String(i), { color: EMA_COLORS[i % EMA_COLORS.length] }).color))
    pushItem(this._bollSeries[0], this._lineStyle('boll', 'upper', { color: BOLL_BAND_COLOR }).color)
    pushItem(this._bollSeries[1], this._lineStyle('boll', 'mid', { color: BOLL_MID_COLOR }).color)
    pushItem(this._bollSeries[2], this._lineStyle('boll', 'lower', { color: BOLL_BAND_COLOR }).color)
    pushItem(this._bbiSeries, this._lineStyle('bbi', 'bbi', { color: BBI_COLOR }).color)
    this._mainAxisState.items = items

    this._syncSubCharts()
  }

  /** 按激活顺序(_subOrder)重建副图 pane:lightweight-charts 不支持重排,顺序/参数/样式变化时销毁全部再重建 */
  private _syncSubCharts(): void {
    const sig = JSON.stringify([this._subOrder, this._subParams(), this._config.lineStyles])
    const currentIds = [...this._subCharts.keys()]
    const sameOrder = this._subOrder.length === currentIds.length && this._subOrder.every((id, i) => id === currentIds[i])
    if (sameOrder && sig === this._lastSubSig) return
    this._lastSubSig = sig

    for (const inst of this._subCharts.values()) inst.dispose()
    this._subCharts.clear()
    const defById = new Map(SUB_CHART_DEFS.map((e) => [e.id, e]))
    const params = this._subParams()
    let pane = 1
    for (const id of this._subOrder) {
      const entry = defById.get(id)
      if (entry) {
        this._subCharts.set(
          id,
          new SubChartIndicator(this._chart, entry.def, pane, params, this._config.lineStyles[id as IndicatorId]),
        )
        pane++
      }
    }

    // 自定义副图紧随内置副图之后(pane 基数 = 内置副图数 + 1)
    this._customMgr.setPaneBase(pane)
  }

  /** 从当前配置派生副图指标参数(编辑面板改动后经 setConfig 重算) */
  private _subParams(): SubChartParams {
    const c = this._config
    return {
      rsiPeriod: c.rsiPeriod,
      macdFast: c.macdFast,
      macdSlow: c.macdSlow,
      macdSignal: c.macdSignal,
      kdjPeriod: c.kdjPeriod,
      kdjKSmooth: c.kdjKSmooth,
      kdjDSmooth: c.kdjDSmooth,
      wrPeriods: c.wrPeriods,
      cciPeriod: c.cciPeriod,
      atrPeriod: c.atrPeriod,
      dmiPeriod: c.dmiPeriod,
    }
  }

  /** 主图某条输出线的有效样式:config 覆盖优先,否则默认 */
  private _lineStyle(
    indicator: IndicatorId,
    lineKey: string,
    fallback: { color: string; width?: LineWidth; style?: LineStyle },
  ): IndicatorLineStyle {
    return mergeLineStyle(this._config.lineStyles[indicator]?.[lineKey], fallback)
  }

  /** 主图单条线:按解析样式刷 series 选项(创建后/每次同步都重刷,以反映 lineStyles 覆盖) */
  private _applyMainStyle(s: ISeriesApi<'Line'>, indicator: IndicatorId, lineKey: string, fallback: { color: string }): void {
    const st = this._lineStyle(indicator, lineKey, fallback)
    s.applyOptions({ color: st.color, lineWidth: st.width, lineStyle: st.style })
  }

  /** 按新旧配置更新副图激活顺序:新启用 append 到末尾(排最下),关闭则移除 */
  private _updateSubOrder(prev: IndicatorConfig): void {
    for (const entry of SUB_CHART_DEFS) {
      const was = entry.enabled(prev)
      const now = entry.enabled(this._config)
      if (now && !was) {
        this._subOrder = this._subOrder.filter((id) => id !== entry.id)
        this._subOrder.push(entry.id)
      } else if (!now && was) {
        this._subOrder = this._subOrder.filter((id) => id !== entry.id)
      }
    }
  }

  private _recompute(): void {
    const { showMA, showEMA, showBBI, showBOLL, maPeriods, emaPeriods, bollPeriod, bollStdDev } = this._config

    // 通用:设置 series 数据并同步主图轴标签最新值
    const setLine = (s: ISeriesApi<'Line'> | null, data: IndicatorPoint[]): void => {
      if (!s) return
      s.setData(data)
      const item = this._axisItemBySeries.get(s)
      if (item) item.value = data.length > 0 ? data[data.length - 1].value : null
    }

    this._maSeries.forEach((s, i) => {
      setLine(s, showMA && maPeriods[i] > 0 ? calcMA(this._bars, maPeriods[i]) : [])
    })
    this._emaSeries.forEach((s, i) => {
      setLine(s, showEMA && emaPeriods[i] > 0 ? calcEMA(this._bars, emaPeriods[i]) : [])
    })
    if (this._bbiSeries) setLine(this._bbiSeries, showBBI ? calcBBI(this._bars, this._config.bbiPeriods) : [])

    const b = showBOLL ? calcBOLL(this._bars, bollPeriod, bollStdDev) : null
    setLine(this._bollSeries[0], b ? b.upper : [])
    setLine(this._bollSeries[1], b ? b.mid : [])
    setLine(this._bollSeries[2], b ? b.lower : [])

    for (const inst of this._subCharts.values()) inst.update(this._bars)
    this._mainAxisPrimitive.requestUpdate?.()
  }

  /** 十字光标移动:更新副图角标,输出 OHLCV(右上)+ 主图指标值(左上) */
  private _onCrosshairMove = (param: MouseEventParams<Time>): void => {
    if (!this._legendCallback) return
    for (const inst of this._subCharts.values()) inst.applyCrosshair(param)
    this._customMgr.applyCrosshair(param)
    this._legendCallback(this._buildLegend(param))
  }

  /** 无十字光标:同样回退显示最新 K 线值 */
  private _emitLegend(): void {
    const empty = { seriesData: new Map() } as MouseEventParams<Time>
    for (const inst of this._subCharts.values()) inst.applyCrosshair(empty)
    this._customMgr.applyCrosshair(empty)
    this._legendCallback?.(this._buildLegend(empty))
  }

  private _buildLegend(param: MouseEventParams<Time>): ChartLegend {
    return {
      ohlcv: this._buildOHLCV(param),
      indicators: this._buildIndicatorEntries(
        (s) => param.seriesData.get(s) as LineData<Time> | undefined,
      ).concat(this._customMgr.legendEntries()),
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

  /** 主图指标(MA/EMA/BOLL/BBI)的左上图例:十字线值优先,否则回退最新值 */
  private _buildIndicatorEntries(
    getData: (s: ISeriesApi<'Line'>) => LineData<Time> | undefined,
  ): IndicatorLegendEntry[] {
    const { showMA, showEMA, showBBI, showBOLL, maPeriods, emaPeriods, bollPeriod, bollStdDev } = this._config
    const entries: IndicatorLegendEntry[] = []
    const pushEntry = (s: ISeriesApi<'Line'> | null, label: string, color: string): void => {
      if (!s) return
      const data = getData(s)
      const fallback = this._axisItemBySeries.get(s)?.value ?? null
      const value = data && 'value' in data ? data.value : fallback
      entries.push({ label, value: value !== null ? value.toFixed(2) : null, color })
    }

    this._maSeries.forEach((s, i) => {
      if (showMA && maPeriods[i])
        pushEntry(s, `MA${maPeriods[i]}`, this._lineStyle('ma', String(i), { color: MA_COLORS[i % MA_COLORS.length] }).color)
    })
    this._emaSeries.forEach((s, i) => {
      if (showEMA && emaPeriods[i])
        pushEntry(s, `EMA${emaPeriods[i]}`, this._lineStyle('ema', String(i), { color: EMA_COLORS[i % EMA_COLORS.length] }).color)
    })
    if (showBOLL)
      pushEntry(this._bollSeries[1], `BOLL(${bollPeriod},${bollStdDev})`, this._lineStyle('boll', 'mid', { color: BOLL_MID_COLOR }).color)
    if (showBBI) pushEntry(this._bbiSeries, 'BBI', this._lineStyle('bbi', 'bbi', { color: BBI_COLOR }).color)
    return entries
  }
}
