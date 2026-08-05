import { useEffect, useRef } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
} from 'lightweight-charts'
import { DrawingTools } from '../drawing/DrawingTools'
import {
  IndicatorController,
  type ChartLegend,
  type IndicatorConfig,
} from '../indicators/IndicatorController'
import type { KlineBar } from '../types'

// A 股惯例:红涨绿跌
const UP_COLOR = '#f23645' // 涨 -> 红
const DOWN_COLOR = '#089981' // 跌 -> 绿
const VOLUME_UP = 'rgba(242, 54, 69, 0.35)'
const VOLUME_DOWN = 'rgba(8, 153, 129, 0.35)'
const GRID_COLOR = 'rgba(197, 203, 206, 0.06)'
const BORDER_COLOR = 'rgba(197, 203, 206, 0.2)'
const BG_COLOR = '#131722'
const TEXT_COLOR = '#d1d4dc'

interface KLineChartProps {
  bars: KlineBar[]
  /** 画线模式:开启后点击图表即在点击价位放置一条水平价格线 */
  drawingEnabled: boolean
  /** 斐波那契模式:开启后点击两次定义起止锚点,生成回调水平线 */
  fibonacciEnabled: boolean
  /** 每次自增,触发一次清除所有价格线与斐波那契 */
  clearSignal: number
  /** 指标显示配置(MA/RSI 开关与周期) */
  indicatorConfig: IndicatorConfig
  /** 十字光标下的图例变化(指标框架回调):ohlcv 右上、主图指标值左上 */
  onIndicatorLegend?: (legend: ChartLegend) => void
}

/** 图表壳:只负责创建/销毁图表、数据更新与模式开关接线,绘制交互逻辑在 DrawingTools */
export function KLineChart({
  bars,
  drawingEnabled,
  fibonacciEnabled,
  clearSignal,
  indicatorConfig,
  onIndicatorLegend,
}: KLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const toolsRef = useRef<DrawingTools | null>(null)
  const indicatorsRef = useRef<IndicatorController | null>(null)

  const barsRef = useRef<KlineBar[]>(bars)
  barsRef.current = bars

  // 模式开关实时同步到控制器(控制器非 React,由组件在渲染期推动)
  toolsRef.current?.setDrawingEnabled(drawingEnabled)
  toolsRef.current?.setFibEnabled(fibonacciEnabled)

  // 创建图表(仅一次,与 React 状态生命周期解耦)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // React StrictMode 下 effect 会执行两次,先清空容器避免重复挂载报错
    container.replaceChildren()

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: BG_COLOR },
        textColor: TEXT_COLOR,
        panes: {
          separatorColor: BORDER_COLOR,
          separatorHoverColor: 'rgba(197, 203, 206, 0.35)',
        },
      },
      localization: {
        locale: 'zh-CN', // 时间轴刻度用中文(默认跟随浏览器语言)
        dateFormat: 'yyyy-MM-dd', // 十字光标日期,避免 "05 8月 '26" 混杂
      },
      grid: {
        vertLines: { color: GRID_COLOR },
        horzLines: { color: GRID_COLOR },
      },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: {
        pressedMouseMove: true, // 鼠标按住拖动平移(含垂直方向)
      },
      handleScale: {
        axisPressedMouseMove: {
          price: true, // 价格轴可拖动(垂直方向滚动价格区间)
        },
      },
      timeScale: {
        timeVisible: false,
        borderColor: BORDER_COLOR,
      },
      rightPriceScale: {
        borderColor: BORDER_COLOR,
      },
    })

    // K 线主图(红涨绿跌;真假阴阳由逐点颜色控制:真→空心、假→实心)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderVisible: true,
      borderUpColor: UP_COLOR,
      borderDownColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
    })
    // 主图价格轴固定以支持垂直拖动;副图(autoScale)不受影响
    candleSeries.priceScale().applyOptions({ autoScale: false })

    // 成交量副图(绑定隐藏的独立价格轴,固定在图表下 20% 区域)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      lastValueVisible: false,
      priceLineVisible: false,
    })
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    })

    // 画线工具控制器:放置/预览/拖拽/清除全部下沉到 drawing 层
    const tools = new DrawingTools(chart, candleSeries, container, {
      getBarCount: () => barsRef.current.length,
    })
    tools.setDrawingEnabled(drawingEnabled)
    tools.setFibEnabled(fibonacciEnabled)

    // 指标控制器:MA 主图叠加 + RSI 副图 + 十字光标图例(OHLCV 读自主图 series)
    const indicators = new IndicatorController(chart, indicatorConfig, {
      candle: candleSeries,
      volume: volumeSeries,
    })
    indicatorsRef.current = indicators

    // 容器尺寸变化时同步图表尺寸
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement
        chart.applyOptions({ width: el.clientWidth, height: el.clientHeight })
      }
    })
    resizeObserver.observe(container)

    chartRef.current = chart
    candleRef.current = candleSeries
    volumeRef.current = volumeSeries
    toolsRef.current = tools

    return () => {
      resizeObserver.disconnect()
      tools.dispose()
      indicators.dispose()
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      volumeRef.current = null
      toolsRef.current = null
      indicatorsRef.current = null
    }
  }, [])

  // 数据变化 -> 更新图表并自适应可视范围;同时清空换股后失效的绘图
  useEffect(() => {
    const candle = candleRef.current
    const volume = volumeRef.current
    const chart = chartRef.current
    const tools = toolsRef.current
    const indicators = indicatorsRef.current
    if (!candle || !volume || !chart || !tools || !indicators) return

    // 真假阴阳:颜色按开收(阳红阴绿),空心按较昨收真假(真→空心、假→实心)
    candle.setData(
      bars.map((b, i) => {
        const prevClose = i > 0 ? bars[i - 1].close : b.open
        const isUp = b.close >= b.open
        const isReal = b.close >= prevClose
        const bodyColor = isUp ? UP_COLOR : DOWN_COLOR
        return { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, color: isReal ? 'transparent' : bodyColor, borderColor: bodyColor, wickColor: bodyColor }
      }),
    )

    volume.setData(
      bars.map((b) => ({
        time: b.time,
        value: b.volume,
        color: b.close >= b.open ? VOLUME_UP : VOLUME_DOWN,
      })),
    )

    // 指标重算(MA/RSI)
    indicators.update(bars)

    // 换股后旧绘图的时间锚点在新数据中可能不存在,清空以保持干净
    tools.clearAll()

    // 价格轴固定(autoScale 关闭)以支持垂直拖动;换股后手动适配新数据价格区间
    const prices = bars.flatMap((b) => [b.high, b.low])
    if (prices.length > 0) {
      const min = Math.min(...prices)
      const max = Math.max(...prices)
      const pad = (max - min) * 0.06 || 1
      chart.priceScale('right').setVisibleRange({ from: min - pad, to: max + pad })
    }

    // 默认视图:只显示最后 1/4 的加载数据,右侧预留约 1/4 宽度(最后一根 K 线落在 75% 处)
    const n = bars.length
    const display = Math.max(10, Math.round(n / 4))
    const from = Math.max(0, n - 1 - display)
    const to = n - 1 + display / 3
    chart.timeScale().setVisibleLogicalRange({ from, to })
  }, [bars])

  // 指标配置变化 -> 同步到控制器(增删 series、切换显示)
  useEffect(() => {
    indicatorsRef.current?.setConfig(indicatorConfig)
  }, [indicatorConfig])

  // 图例回调 -> 注册到控制器(十字光标驱动)
  useEffect(() => {
    indicatorsRef.current?.setLegendCallback(onIndicatorLegend ?? null)
  }, [onIndicatorLegend])

  // 手动清除所有价格线与斐波那契
  useEffect(() => {
    if (clearSignal === 0) return
    toolsRef.current?.clearAll()
  }, [clearSignal])

  return <div ref={containerRef} className="kline-chart" />
}
