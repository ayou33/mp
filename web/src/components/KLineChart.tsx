import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
} from 'lightweight-charts'
import { DrawingTools, type DrawingRef, type RangeStats } from '../drawing/DrawingTools'
import { loadDrawings, saveDrawings } from '../drawing/persistence'
import type { LineType } from '../drawing/LinePrimitive'
import { DrawingContextMenu } from './DrawingContextMenu'
import { RangeStatsDialog } from './RangeStatsDialog'
import { ActionTypeDialog } from './ActionTypeDialog'
import { TextInputDialog } from './TextInputDialog'
import { useModal } from './modal/ModalProvider'
import { HistoryLoader, defaultViewRange } from '../chart/HistoryLoader'
import { buildCandleData, fitPriceRange } from '../chart/candleData'
import { LastPriceLabelPrimitive } from '../chart/LastPriceLabel'
import { VisibleRangeMark, type HighLowMarkStyle } from '../chart/VisibleRangeMark'
import { CrosshairGainLabel } from '../chart/CrosshairGainLabel'
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
const BORDER_COLOR = 'rgba(197, 203, 206, 0.2)'
const BG_COLOR = '#131722'
const TEXT_COLOR = '#d1d4dc'

interface KLineChartProps {
  bars: KlineBar[]
  /** 画线模式:开启后点击图表即在点击价位放置一条水平价格线 */
  drawingEnabled: boolean
  /** 斐波那契模式:开启后点击两次定义起止锚点,生成回调水平线 */
  fibonacciEnabled: boolean
  /** 操作价格线模式:开启后点击图表选择操作类型并生成 */
  actionEnabled: boolean
  /** 矩形模式:开启后点击两次定义对角 */
  rectEnabled: boolean
  /** 测量模式:开启后点击两点显示价差/涨跌幅/根数 */
  measureEnabled: boolean
  /** 斐波那契扩展模式:开启后点击三次定义 A/B/C */
  fibExtEnabled: boolean
  /** 垂直线模式:开启后点击图表放置贯穿竖线 */
  verticalEnabled: boolean
  /** 文本标注模式:开启后点击图表输入文本 */
  textEnabled: boolean
  /** 每次自增,触发一次清除所有价格线与斐波那契 */
  clearSignal: number
  /** 指标显示配置(MA/RSI 开关与周期) */
  indicatorConfig: IndicatorConfig
  /** 十字光标下的图例变化(指标框架回调):ohlcv 右上、主图指标值左上 */
  onIndicatorLegend?: (legend: ChartLegend) => void
  /** 右滑到最左侧时触发追加历史数据 */
  onLoadMoreHistory?: () => void
  /** 最新 K 线是否在屏内变化(驱动"回到最新"按钮显隐) */
  onLatestVisibleChange?: (visible: boolean) => void
  /** 每次自增,触发一次回到默认视图(3/4 位置) */
  backSignal?: number
  /** 当前激活的画线工具(线段/射线/直线),null 表示未激活 */
  lineTool?: LineType | null
  /** 画线模式激活时右键「取消画线」:复位各画线模式开关(状态由上层 App 持有) */
  onCancelDrawing?: () => void
  /** 画线数据持久化 key(如 `${code}:${period}`);提供则换股/换周期时存取绘图,缺省不持久化 */
  storageKey?: string
  /** 可见高/低点标注呈现方式(引线 / 价格线);缺省引线 */
  highLowStyle?: HighLowMarkStyle
}

/** 图表壳:只负责创建/销毁图表、数据更新与模式开关接线,绘制交互逻辑在 DrawingTools */
export function KLineChart({
  bars,
  drawingEnabled,
  fibonacciEnabled,
  actionEnabled,
  rectEnabled,
  measureEnabled,
  fibExtEnabled,
  verticalEnabled,
  textEnabled,
  clearSignal,
  indicatorConfig,
  onIndicatorLegend,
  onLoadMoreHistory,
  onLatestVisibleChange,
  backSignal,
  lineTool,
  onCancelDrawing,
  storageKey,
  highLowStyle,
}: KLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const toolsRef = useRef<DrawingTools | null>(null)
  const indicatorsRef = useRef<IndicatorController | null>(null)
  const historyLoaderRef = useRef<HistoryLoader | null>(null)
  const visibleRangeMarkRef = useRef<VisibleRangeMark | null>(null)
  const crosshairGainRef = useRef<CrosshairGainLabel | null>(null)
  // 画线对象左键菜单状态(坐标相对容器;isSystem/canEdit/price 供菜单项禁用与价格输入框)
  const [menu, setMenu] = useState<{
    x: number
    y: number
    ref: DrawingRef
    isSystem: boolean
    canEdit: boolean
    price: number | null
  } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // 右键框选:选区矩形覆盖层 + 松开弹出区间统计弹窗
  const { open: openModal } = useModal()
  const [rangePreview, setRangePreview] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const openRangeStats = useCallback(
    (stats: RangeStats) => {
      openModal({
        title: '区间统计',
        content: () => <RangeStatsDialog stats={stats} />,
      })
    },
    [openModal],
  )

  const barsRef = useRef<KlineBar[]>(bars)
  barsRef.current = bars
  /** 当前持久化 key(实时同步 prop,供 onChange 保存使用) */
  const storageKeyRef = useRef<string | undefined>(storageKey)
  storageKeyRef.current = storageKey
  /** 画线持久化跟踪:最近一次应用的 storageKey + 工具实例(换股/换周期时存取) */
  const persistRef = useRef<{ key: string | null; tools: DrawingTools | null }>({ key: null, tools: null })
  const onLoadMoreRef = useRef(onLoadMoreHistory)
  onLoadMoreRef.current = onLoadMoreHistory
  const onLatestVisibleRef = useRef(onLatestVisibleChange)
  onLatestVisibleRef.current = onLatestVisibleChange
  const onCancelDrawingRef = useRef(onCancelDrawing)
  onCancelDrawingRef.current = onCancelDrawing

  // 模式开关实时同步到控制器(控制器非 React,由组件在渲染期推动)
  toolsRef.current?.setDrawingEnabled(drawingEnabled)
  toolsRef.current?.setFibEnabled(fibonacciEnabled)
  toolsRef.current?.setLineEnabled(lineTool ?? null)
  toolsRef.current?.setRectEnabled(rectEnabled)
  toolsRef.current?.setMeasureEnabled(measureEnabled)
  toolsRef.current?.setFibExtEnabled(fibExtEnabled)
  toolsRef.current?.setVerticalEnabled(verticalEnabled)
  toolsRef.current?.setTextEnabled(textEnabled)
  toolsRef.current?.setActionEnabled(actionEnabled)

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
        panes: { separatorColor: BORDER_COLOR, separatorHoverColor: 'rgba(197, 203, 206, 0.35)' },
      },
      localization: { locale: 'zh-CN', dateFormat: 'yyyy-MM-dd' }, // 中文时间轴
      // 移除横纵网格线与主副图价格/时间轴边框
      grid: { vertLines: { color: 'transparent' }, horzLines: { color: 'transparent' } },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: { pressedMouseMove: true }, // 鼠标拖动平移(含垂直)
      handleScale: { axisPressedMouseMove: { price: true } }, // 价格轴可拖动
      timeScale: { timeVisible: false, borderColor: 'transparent' },
      rightPriceScale: { borderColor: 'transparent' },
    })

    // K 线主图(红涨绿跌;真假阴阳由逐点颜色控制:真→空心、假→实心)
    // lastValueVisible:false 隐藏库内置右对齐的最新价 label,由自绘 LastPriceLabelPrimitive 左对齐替代
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR, downColor: DOWN_COLOR, borderVisible: true,
      borderUpColor: UP_COLOR, borderDownColor: DOWN_COLOR, wickUpColor: UP_COLOR, wickDownColor: DOWN_COLOR,
      lastValueVisible: false,
    })
    // 最新价轴 label:自绘、左对齐贴图表右缘,与指标值 label 同位置同样式
    candleSeries.attachPrimitive(new LastPriceLabelPrimitive(candleSeries, UP_COLOR, DOWN_COLOR))
    // 主图价格轴固定以支持垂直拖动;副图(autoScale)不受影响
    // 默认渲染高度 = (整个可用高度 - 成交量最大高度) 的 4/5:
    //   成交量占底部 20%(top 0.8),K 线渲染区间 [0.16, 0.80] 高度 = 0.64 = 0.80 × 4/5,
    //   bottom 0.20 与成交量顶边(0.80)对齐,K 线最低价不侵入成交量区域
    candleSeries.priceScale().applyOptions({
      autoScale: false,
      scaleMargins: { top: 0.16, bottom: 0.20 },
    })

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
      getBars: () => barsRef.current,
      // 左键点击控制点 -> 弹出菜单(价格编辑/删除);坐标钳制避免溢出容器
      onRequestMenu: (ref, x, y) => {
        const t = toolsRef.current
        if (!t) return
        const mx = Math.max(0, Math.min(x, container.clientWidth - 150))
        const my = Math.max(0, Math.min(y, container.clientHeight - 96))
        const isSystem = t.getSource(ref) === 'system'
        // 操作价格线:非 armed 状态锁定几何(只能确认执行),价格输入框禁用
        const canEdit = !isSystem && (ref.kind !== 'action-line' || t.getActionStatus(ref) === 'armed')
        setMenu({ x: mx, y: my, ref, isSystem, canEdit, price: t.getControlPointPrice(ref) })
      },
      // 操作价格线:激活模式点击图表 -> 弹窗选操作类型后创建(价格可在面板编辑)
      onRequestCreateAction: (price) => {
        openModal({
          title: '操作价格线',
          content: (api) => (
            <ActionTypeDialog
              price={price}
              onSelect={(editedPrice, action) => {
                toolsRef.current?.createAction(editedPrice, action)
                api.close()
              }}
              onCancel={() => api.close()}
            />
          ),
        })
      },
      // 文本标注:激活模式点击图表 -> 弹窗输入文本与价格,确认后回填创建标注
      onRequestCreateText: (pt, submit) => {
        openModal({
          title: '文本标注',
          content: (api) => (
            <TextInputDialog
              price={pt.price}
              onSubmit={(text, editedPrice) => {
                submit(text, editedPrice)
                api.close()
              }}
              onCancel={() => api.close()}
            />
          ),
        })
      },
      // 右键框选:拖动实时更新选区矩形;松开弹出区间统计
      onRangePreview: (rect) => setRangePreview(rect),
      onRangeSelect: (stats) => openRangeStats(stats),
      // 画线模式激活时右键「取消画线」:复位各画线模式开关(状态由 App 持有)
      onRequestCancelDrawing: () => onCancelDrawingRef.current?.(),
      // 画线数据变更 -> 实时保存到当前 storageKey(若已接入持久化)
      onChange: () => {
        const key = storageKeyRef.current
        const tools = toolsRef.current
        if (key && tools) saveDrawings(key, tools.serializeAll())
      },
    })
    tools.setDrawingEnabled(drawingEnabled)
    tools.setFibEnabled(fibonacciEnabled)
    tools.setLineEnabled(lineTool ?? null)
    tools.setRectEnabled(rectEnabled)
    tools.setMeasureEnabled(measureEnabled)
    tools.setFibExtEnabled(fibExtEnabled)
    tools.setVerticalEnabled(verticalEnabled)
    tools.setTextEnabled(textEnabled)

    // 指标控制器:MA 主图叠加 + RSI 副图 + 十字光标图例(OHLCV 读自主图 series)
    const indicators = new IndicatorController(chart, indicatorConfig, {
      candle: candleSeries,
      volume: volumeSeries,
    })
    indicatorsRef.current = indicators

    // 时间轴视图控制器:右滑追加历史 + 最新可见检测/回到最新
    const historyLoader = new HistoryLoader(
      chart,
      () => onLoadMoreRef.current?.(),
      () => barsRef.current.length,
      (v) => onLatestVisibleRef.current?.(v),
    )
    historyLoaderRef.current = historyLoader

    // 可见区间最高/最低价标注:监听时间轴可见范围,按设置样式(引线/价格线)呈现
    const visibleRangeMark = new VisibleRangeMark(chart, candleSeries, () => barsRef.current, highLowStyle)
    visibleRangeMarkRef.current = visibleRangeMark

    // 距今涨幅标签:十字线所指 K 线 → 最新收盘价的涨幅,以时间轴标签形式显示(红涨绿跌)
    const crosshairGain = new CrosshairGainLabel(chart, candleSeries, () => barsRef.current)
    crosshairGainRef.current = crosshairGain

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
      historyLoader.dispose()
      visibleRangeMark.dispose()
      crosshairGain.dispose()
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      volumeRef.current = null
      toolsRef.current = null
      indicatorsRef.current = null
      historyLoaderRef.current = null
      visibleRangeMarkRef.current = null
      crosshairGainRef.current = null
    }
  }, [])

  // 菜单打开时:点击菜单外 / Escape 关闭
  useEffect(() => {
    if (!menu) return
    const onPointerDown = (e: PointerEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null)
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menu])

  // 数据变化 -> 更新图表并自适应可视范围;同时清空换股后失效的绘图
  useEffect(() => {
    const candle = candleRef.current
    const volume = volumeRef.current
    const chart = chartRef.current
    const tools = toolsRef.current
    const indicators = indicatorsRef.current
    if (!candle || !volume || !chart || !tools || !indicators) return

    // 真假阴阳着色(提取到 chart/candleData.ts)
    candle.setData(buildCandleData(bars, UP_COLOR, DOWN_COLOR))

    volume.setData(
      bars.map((b) => ({
        time: b.time,
        value: b.volume,
        color: b.close >= b.open ? VOLUME_UP : VOLUME_DOWN,
      })),
    )

    // 最新价格虚线颜色随最后一根 K 线阴阳(空心 color=transparent 会连累价格线透明,故显式设置)
    const lastBar = bars[bars.length - 1]
    if (lastBar) {
      candle.applyOptions({ priceLineColor: lastBar.close >= lastBar.open ? UP_COLOR : DOWN_COLOR })
    }

    // 指标重算(MA/RSI)
    indicators.update(bars)

    // 距今涨幅:按最近一次十字线位置基于新数据重算(换股后十字线所指 K 线不在了会隐藏)
    crosshairGainRef.current?.update()

    // 画线持久化:
    // - 未接入 storageKey:保持原有行为,换股后清空绘图
    // - 接入 storageKey:仅当 key(股票/周期)或工具实例变化时,先保存旧 key 绘图,
    //   再清空,最后回写新 key 绘图;load-more 追加历史(bars 变、key 不变)不清绘图
    if (storageKey === undefined) {
      tools.systemClearAll()
    } else {
      const prev = persistRef.current
      if (prev.key !== storageKey || prev.tools !== tools) {
        if (prev.key && prev.tools && prev.key !== storageKey) {
          saveDrawings(prev.key, prev.tools.serializeAll())
        }
        // 换股/切周期:重置所有画线(含系统对象,由程序按新股票重算)
        tools.systemClearAll()
        const saved = loadDrawings(storageKey)
        if (saved.length > 0) tools.restoreAll(saved)
        persistRef.current = { key: storageKey, tools }
      }
    }

    // 操作价格线:数据更新/恢复/换股/加载更多后重评触发
    tools.checkTriggers(bars)

    // 时间视图:右滑追加历史时保持原窗口(平移 prepend 数),否则默认视图(最后 1/4 + 右侧预留 1/4)
    const view = historyLoaderRef.current?.resolveRange(bars.length) ?? defaultViewRange(bars.length)
    chart.timeScale().setVisibleLogicalRange(view)

    // 价格轴固定(autoScale 关闭)以支持垂直拖动;按当前可见 K 线(而非全部加载数据)适配价格区间
    const range = fitPriceRange(bars, view)
    if (range) chart.priceScale('right').setVisibleRange(range)
  }, [bars, storageKey])

  // 指标配置变化 -> 同步到控制器(增删 series、切换显示)
  useEffect(() => {
    indicatorsRef.current?.setConfig(indicatorConfig)
  }, [indicatorConfig])

  // 高/低点呈现方式变化 -> 同步到可见区间标注控制器
  useEffect(() => {
    visibleRangeMarkRef.current?.setStyle(highLowStyle)
  }, [highLowStyle])

  // 回到最新信号 -> 恢复默认视图(3/4 位置)
  useEffect(() => {
    if (backSignal === 0) return
    historyLoaderRef.current?.backToLatest()
  }, [backSignal])

  // 图例回调 -> 注册到控制器(十字光标驱动)
  useEffect(() => {
    indicatorsRef.current?.setLegendCallback(onIndicatorLegend ?? null)
  }, [onIndicatorLegend])

  // 手动清除所有价格线与斐波那契
  useEffect(() => {
    if (clearSignal === 0) return
    const tools = toolsRef.current
    if (!tools) return
    // 用户「清除」:只清用户画线对象,保留 system 对象;清除后重新持久化剩余对象
    tools.clearAll()
    if (persistRef.current.key) saveDrawings(persistRef.current.key, tools.serializeAll())
  }, [clearSignal])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      {rangePreview && (
        <div
          className="pointer-events-none absolute z-[15] border border-accent/60 bg-accent/10"
          style={{
            left: rangePreview.x,
            top: rangePreview.y,
            width: rangePreview.width,
            height: rangePreview.height,
          }}
        />
      )}
      {menu && (
        <DrawingContextMenu
          ref={menuRef}
          x={menu.x}
          y={menu.y}
          drawingRef={menu.ref}
          isSystem={menu.isSystem}
          canEdit={menu.canEdit}
          price={menu.price}
          onPriceChange={(price) => {
            toolsRef.current?.setControlPointPrice(menu.ref, price)
            setMenu((m) => (m ? { ...m, price } : null))
          }}
          onDelete={() => {
            toolsRef.current?.deleteDrawing(menu.ref)
            setMenu(null)
          }}
        />
      )}
    </div>
  )
}
