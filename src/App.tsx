import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchDailyKline, normalizeCode } from './api/stock'
import { DrawToolbar } from './components/DrawToolbar'
import { IndicatorBar } from './components/IndicatorBar'
import { KLineChart } from './components/KLineChart'
import { Sidebar, type SidebarTab } from './components/Sidebar'
import type {
  ChartLegend,
  IndicatorConfig,
} from './indicators/IndicatorController'
import type { KlineBar } from './types'

const DEFAULT_CODE = 'sh000001' // 大盘:上证指数
const DEFAULT_WATCHLIST = ['sh600519', 'sz000001', 'sz300750']

function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem('mp_watchlist')
    if (raw) return JSON.parse(raw)
  } catch {
    /* 忽略损坏数据 */
  }
  return DEFAULT_WATCHLIST
}

export default function App() {
  const [code, setCode] = useState(DEFAULT_CODE)
  const [name, setName] = useState('上证指数')
  const [bars, setBars] = useState<KlineBar[]>([])
  const [, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [drawingEnabled, setDrawingEnabled] = useState(false)
  const [fibonacciEnabled, setFibonacciEnabled] = useState(false)
  const [clearSignal, setClearSignal] = useState(0)

  const [indicatorConfig, setIndicatorConfig] = useState<IndicatorConfig>({
    showMA: true,
    showBBI: false,
    showRSI: true,
    showMACD: false,
    showKDJ: false,
    maPeriods: [5, 10, 20],
  })
  const [chartLegend, setChartLegend] = useState<ChartLegend>({ ohlcv: [], indicators: [] })
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('watch')
  const [watchlist, setWatchlist] = useState<string[]>(loadWatchlist)

  // 自选持久化到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem('mp_watchlist', JSON.stringify(watchlist))
    } catch {
      /* 忽略存储失败 */
    }
  }, [watchlist])

  const search = useCallback(async (input: string) => {
    let normalized: string
    try {
      normalized = normalizeCode(input)
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法识别的代码')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const data = await fetchDailyKline(normalized)
      setCode(data.code)
      setName(data.name)
      setBars(data.bars)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败,请重试')
    } finally {
      setLoading(false)
    }
  }, [])

  // 首次挂载加载默认股票(用 ref 防止 StrictMode 下重复请求)
  const initedRef = useRef(false)
  useEffect(() => {
    if (initedRef.current) return
    initedRef.current = true
    void search(DEFAULT_CODE)
  }, [search])

  function addToWatchlist(c: string) {
    setWatchlist((list) => (list.includes(c) ? list : [...list, c]))
  }

  function removeFromWatchlist(c: string) {
    setWatchlist((list) => list.filter((x) => x !== c))
  }

  return (
    <div className="app">
      {error && <div className="error-banner">{error}</div>}

      <IndicatorBar config={indicatorConfig} onChange={setIndicatorConfig} />

      <div className="main-area">
        <DrawToolbar
          drawingEnabled={drawingEnabled}
          fibonacciEnabled={fibonacciEnabled}
          onToggleDrawing={() => setDrawingEnabled((v) => !v)}
          onToggleFibonacci={() => setFibonacciEnabled((v) => !v)}
          onClear={() => setClearSignal((s) => s + 1)}
        />

        <div className="chart-wrap">
          <KLineChart
            bars={bars}
            drawingEnabled={drawingEnabled}
            fibonacciEnabled={fibonacciEnabled}
            clearSignal={clearSignal}
            indicatorConfig={indicatorConfig}
            onIndicatorLegend={setChartLegend}
          />
          {/* 右上:十字线时在股票信息左侧追加 OHLCV;单行避开价格轴,左右反转(代码在前,名称在后) */}
          <div className="chart-overlay chart-overlay-tr">
            {chartLegend.ohlcv.map((e) => (
              <span key={e.label} className="chart-overlay-ohlcv" style={{ color: e.color }}>
                {e.label} {e.value}
              </span>
            ))}
            <span className="chart-overlay-code">{code.toUpperCase()} · 日线 · 前复权</span>
            <span className="chart-overlay-name">{name || '—'}</span>
          </div>
          {/* 左上:主图指标值区(MA 标签+值,跟随十字线;值同时显示在主图价格轴上) */}
          {chartLegend.indicators.length > 0 && (
            <div className="chart-overlay chart-overlay-tl">
              {chartLegend.indicators.map((e) => (
                <span key={e.label} className="chart-overlay-indicator" style={{ color: e.color }}>
                  {e.label}
                  {e.value !== null && ` ${e.value}`}
                </span>
              ))}
            </div>
          )}
        </div>

        <Sidebar
          tab={sidebarTab}
          onTabChange={setSidebarTab}
          watchlist={watchlist}
          onAdd={addToWatchlist}
          onRemove={removeFromWatchlist}
          onSelect={search}
          onSearch={search}
          searchDefault={DEFAULT_CODE}
        />
      </div>
    </div>
  )
}
