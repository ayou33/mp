import { useCallback, useEffect, useRef, useState } from 'react'
import HomeIcon from '@iconify-react/material-symbols-light/home'
import { fetchKline, fetchOlderKline, normalizeCode, PERIOD_LABEL, type KlinePeriod } from './api/stock'
import { DrawToolbar } from './components/DrawToolbar'
import { KLineChart } from './components/KLineChart'
import type { LineType } from './drawing/LinePrimitive'
import { Sidebar, type SidebarTab } from './components/Sidebar'
import { TopBar } from './components/topbar/TopBar'
import { DEFAULT_SETTINGS, SettingsDialog, type UserSettings } from './components/topbar/SettingsDialog'
import { useModal } from './components/modal/ModalProvider'
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

function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem('mp_settings')
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    /* 忽略损坏数据 */
  }
  return DEFAULT_SETTINGS
}

export default function App() {
  const [code, setCode] = useState(DEFAULT_CODE)
  const [name, setName] = useState('上证指数')
  const [bars, setBars] = useState<KlineBar[]>([])
  const [, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [drawingEnabled, setDrawingEnabled] = useState(false)
  const [fibonacciEnabled, setFibonacciEnabled] = useState(false)
  const [lineTool, setLineTool] = useState<LineType | null>(null)
  const [clearSignal, setClearSignal] = useState(0)

  const [indicatorConfig, setIndicatorConfig] = useState<IndicatorConfig>({
    showMA: false,
    showBBI: true,
    showRSI: false,
    showMACD: true,
    showKDJ: true,
    maPeriods: [5, 10, 20],
  })
  const [chartLegend, setChartLegend] = useState<ChartLegend>({ ohlcv: [], indicators: [] })
  const [latestVisible, setLatestVisible] = useState(true)
  const [backSignal, setBackSignal] = useState(0)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('watch')
  const [watchlist, setWatchlist] = useState<string[]>(loadWatchlist)

  const [settings, setSettings] = useState<UserSettings>(loadSettings)
  const [period, setPeriod] = useState<KlinePeriod>(settings.defaultPeriod)

  // 设置/自选持久化到 localStorage(后续可接服务器)
  useEffect(() => {
    try {
      localStorage.setItem('mp_settings', JSON.stringify(settings))
    } catch {
      /* 忽略存储失败 */
    }
  }, [settings])
  useEffect(() => {
    try {
      localStorage.setItem('mp_watchlist', JSON.stringify(watchlist))
    } catch {
      /* 忽略存储失败 */
    }
  }, [watchlist])

  const codeRef = useRef(code)
  codeRef.current = code
  const barsRef = useRef(bars)
  barsRef.current = bars
  const periodRef = useRef(period)
  periodRef.current = period

  const search = useCallback(async (input: string, p?: KlinePeriod) => {
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
      const data = await fetchKline(normalized, p ?? periodRef.current)
      setCode(data.code)
      setName(data.name)
      setBars(data.bars)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败,请重试')
    } finally {
      setLoading(false)
    }
  }, [])

  // 切换周期:更新状态并按当前代码重新加载
  const changePeriod = useCallback(
    (p: KlinePeriod) => {
      setPeriod(p)
      void search(codeRef.current, p)
    },
    [search],
  )

  // 首次挂载加载默认股票(用 ref 防止 StrictMode 下重复请求)
  const initedRef = useRef(false)
  useEffect(() => {
    if (initedRef.current) return
    initedRef.current = true
    void search(DEFAULT_CODE, settings.defaultPeriod)
  }, [search, settings.defaultPeriod])

  // 右滑追加历史:取最早日期之前的更早 K 线,去重后前置到数据开头
  const loadingMoreRef = useRef(false)
  const loadMoreHistory = useCallback(async () => {
    if (loadingMoreRef.current) return
    const current = barsRef.current
    if (current.length === 0) return
    loadingMoreRef.current = true
    try {
      const older = await fetchOlderKline(codeRef.current, periodRef.current, current[0].time)
      const existing = new Set(current.map((b) => b.time))
      const fresh = older.filter((b) => !existing.has(b.time))
      if (fresh.length > 0) setBars((prev) => [...fresh, ...prev])
    } catch {
      /* 追加失败静默忽略 */
    } finally {
      loadingMoreRef.current = false
    }
  }, [])

  // 全局设置弹窗
  const { open } = useModal()
  const openSettings = useCallback(() => {
    open({
      title: '设置',
      content: (api) => (
        <SettingsDialog initial={settings} onSave={setSettings} onClose={api.close} />
      ),
    })
  }, [open, settings])

  function addToWatchlist(c: string) {
    setWatchlist((list) => (list.includes(c) ? list : [...list, c]))
  }

  function removeFromWatchlist(c: string) {
    setWatchlist((list) => list.filter((x) => x !== c))
  }

  return (
    <div className="app">
      {error && <div className="error-banner">{error}</div>}

      <TopBar
        period={period}
        onPeriodChange={changePeriod}
        indicatorConfig={indicatorConfig}
        onIndicatorConfigChange={setIndicatorConfig}
        onOpenSettings={openSettings}
      />

      <div className="main-area">
        <DrawToolbar
          drawingEnabled={drawingEnabled}
          fibonacciEnabled={fibonacciEnabled}
          lineTool={lineTool}
          onToggleDrawing={() => setDrawingEnabled((v) => !v)}
          onToggleFibonacci={() => setFibonacciEnabled((v) => !v)}
          onLineTool={setLineTool}
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
            onLoadMoreHistory={loadMoreHistory}
            onLatestVisibleChange={setLatestVisible}
            backSignal={backSignal}
            lineTool={lineTool}
          />
          {/* 右上:OHLCV + 代码 + 周期 + 名称;名称下方"回到最新"按钮 */}
          <div className="chart-overlay chart-overlay-tr">
            {chartLegend.ohlcv.map((e) => (
              <span key={e.label} className="chart-overlay-ohlcv" style={{ color: e.color }}>
                {e.label} {e.value}
              </span>
            ))}
            <span className="chart-overlay-code">
              {code.toUpperCase()} · {PERIOD_LABEL[period]}
            </span>
            <span className="chart-overlay-name-col">
              <span className="chart-overlay-name">{name || '—'}</span>
              {!latestVisible && (
                <button className="back-latest" title="回到最新" onClick={() => setBackSignal((s) => s + 1)}>
                  <HomeIcon width="14" height="14" />
                </button>
              )}
            </span>
          </div>
          {/* 左上:主图指标值区(MA/BBI 标签+值,跟随十字线) */}
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
