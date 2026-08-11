import { useCallback, useEffect, useRef, useState } from 'react'
import HomeIcon from '@iconify-react/material-symbols/home'
import { fetchKline, fetchOlderKline, normalizeCode, PERIOD_LABEL, type KlinePeriod } from './api/stock'
import { DrawToolbar } from './components/DrawToolbar'
import { KLineChart } from './components/KLineChart'
import type { LineType } from './drawing/LinePrimitive'
import { drawingStorageKey } from './drawing/persistence'
import { Sidebar, type SidebarTab } from './components/Sidebar'
import { TopBar } from './components/topbar/TopBar'
import { DEFAULT_SETTINGS, SettingsDialog, type UserSettings } from './components/topbar/SettingsDialog'
import { useModal } from './components/modal/ModalProvider'
import {
  loadUserFormulas,
  registerUserFormula,
  saveUserFormulas,
  unregisterUserFormula,
  USER_FORMULA_RECORDS,
  type CustomIndicatorConfigEntry,
  type UserFormulaRecord,
} from './indicators/custom'
import type {
  ChartLegend,
  IndicatorConfig,
} from './indicators/IndicatorController'
import type { KlineBar } from './types'

const DEFAULT_CODE = 'sh000001' // 大盘:上证指数
const DEFAULT_WATCHLIST = ['sh600519', 'sz000001', 'sz300750']

/** 取 YYYY-MM-DD 的次日(测试模拟行情用;跨月/跨年正确,周末按连续交易日处理) */
function nextDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** 价格保留两位小数(模拟行情 bar 用) */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

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

/** 指标默认配置(含全部参数与空 lineStyles;编辑面板未覆盖的线用渲染层默认色) */
function defaultIndicatorConfig(): IndicatorConfig {
  return {
    showMA: false,
    showEMA: false,
    showBBI: true,
    showBOLL: false,
    showRSI: false,
    showMACD: true,
    showKDJ: true,
    showWR: false,
    showCCI: false,
    showOBV: false,
    showATR: false,
    showDMI: false,
    maPeriods: [5, 10, 20],
    emaPeriods: [5, 10, 20],
    bbiPeriods: [3, 6, 12, 24],
    bollPeriod: 20,
    bollStdDev: 2,
    rsiPeriod: 14,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    kdjPeriod: 9,
    kdjKSmooth: 3,
    kdjDSmooth: 3,
    wrPeriods: [6, 14],
    cciPeriod: 14,
    atrPeriod: 14,
    dmiPeriod: 14,
    lineStyles: {},
    custom: {},
  }
}

/** 读取持久化的指标配置(结构化 JSON,后续可扩展为服务器同步);缺字段回退默认 */
function loadIndicatorConfig(): IndicatorConfig {
  try {
    const raw = localStorage.getItem('mp_indicator_config')
    if (raw) return { ...defaultIndicatorConfig(), ...JSON.parse(raw) }
  } catch {
    /* 忽略损坏数据 */
  }
  return defaultIndicatorConfig()
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
  const [actionEnabled, setActionEnabled] = useState(false)
  const [rectEnabled, setRectEnabled] = useState(false)
  const [measureEnabled, setMeasureEnabled] = useState(false)
  const [fibExtEnabled, setFibExtEnabled] = useState(false)
  const [verticalEnabled, setVerticalEnabled] = useState(false)
  const [textEnabled, setTextEnabled] = useState(false)
  const [clearSignal, setClearSignal] = useState(0)

  /** 复位全部画线模式开关(切新工具/右键取消画线时使用;画线模式互斥) */
  const clearDrawingModes = useCallback(() => {
    setDrawingEnabled(false)
    setFibonacciEnabled(false)
    setLineTool(null)
    setActionEnabled(false)
    setRectEnabled(false)
    setMeasureEnabled(false)
    setFibExtEnabled(false)
    setVerticalEnabled(false)
    setTextEnabled(false)
  }, [])

  const [indicatorConfig, setIndicatorConfig] = useState<IndicatorConfig>(loadIndicatorConfig)
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
  // 指标配置(参数 + 线样式)持久化到 localStorage;结构化 JSON,后续可扩展为服务器同步
  useEffect(() => {
    try {
      localStorage.setItem('mp_indicator_config', JSON.stringify(indicatorConfig))
    } catch {
      /* 忽略存储失败 */
    }
  }, [indicatorConfig])

  // 用户手写公式指标:初始化时从 localStorage 载入并注册(def 进注册表),变更时持久化
  const [userFormulas, setUserFormulas] = useState<UserFormulaRecord[]>(loadUserFormulas)
  useEffect(() => {
    saveUserFormulas()
  }, [userFormulas])

  /** 保存用户公式指标:编译注册公式 + 写 config.custom[id] 实例配置 */
  const applyUserFormula = useCallback((rec: UserFormulaRecord, entry: CustomIndicatorConfigEntry) => {
    registerUserFormula(rec)
    setUserFormulas([...Array.from(USER_FORMULA_RECORDS.values())])
    setIndicatorConfig((c) => ({ ...c, custom: { ...c.custom, [rec.id]: entry } }))
  }, [])

  /** 删除用户公式指标:注销注册表 + 从 config.custom 移除 */
  const deleteUserFormula = useCallback((id: string) => {
    unregisterUserFormula(id)
    setUserFormulas([...Array.from(USER_FORMULA_RECORDS.values())])
    setIndicatorConfig((c) => {
      if (!(id in c.custom)) return c
      const next = { ...c.custom }
      delete next[id]
      return { ...c, custom: next }
    })
  }, [])

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

  /** 测试:模拟行情向上/向下跳动——追加一根次日大幅上涨/下跌的 K 线,驱动触发检测触发操作价格线 */
  const simulateMove = useCallback((dir: 'up' | 'down') => {
    setBars((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      // 新 bar 时间取最新 bar 次日,保证「最新数据时间 > 创建时间」的触发门槛通过
      const time = nextDay(last.time)
      const base = last.close
      const bar: KlineBar =
        dir === 'up'
          ? { time, open: round2(base * 1.02), high: round2(base * 1.15), low: round2(base * 0.99), close: round2(base * 1.12), volume: Math.round(last.volume * 1.5) }
          : { time, open: round2(base * 0.98), high: round2(base * 1.01), low: round2(base * 0.85), close: round2(base * 0.88), volume: Math.round(last.volume * 1.5) }
      return [...prev, bar]
    })
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
    <div className="flex h-full flex-col gap-1.5">
      {error && <div className="rounded-lg bg-up/10 px-4 py-2 text-sm text-up">{error}</div>}

      <TopBar
        period={period}
        onPeriodChange={changePeriod}
        indicatorConfig={indicatorConfig}
        onIndicatorConfigChange={setIndicatorConfig}
        onApplyUserFormula={applyUserFormula}
        onDeleteUserFormula={deleteUserFormula}
        bars={bars}
        searchDefault={code}
        onSearch={search}
        onOpenSettings={openSettings}
      />

      <div className="flex min-h-0 flex-1 gap-1.5">
        <DrawToolbar
          drawingEnabled={drawingEnabled}
          fibonacciEnabled={fibonacciEnabled}
          lineTool={lineTool}
          actionEnabled={actionEnabled}
          rectEnabled={rectEnabled}
          measureEnabled={measureEnabled}
          fibExtEnabled={fibExtEnabled}
          verticalEnabled={verticalEnabled}
          textEnabled={textEnabled}
          onToggleDrawing={() => {
            if (drawingEnabled) setDrawingEnabled(false)
            else {
              clearDrawingModes()
              setDrawingEnabled(true)
            }
          }}
          onToggleFibonacci={() => {
            if (fibonacciEnabled) setFibonacciEnabled(false)
            else {
              clearDrawingModes()
              setFibonacciEnabled(true)
            }
          }}
          onLineTool={(t) => {
            if (lineTool === t) setLineTool(null)
            else {
              clearDrawingModes()
              setLineTool(t)
            }
          }}
          onToggleAction={() => {
            if (actionEnabled) setActionEnabled(false)
            else {
              clearDrawingModes()
              setActionEnabled(true)
            }
          }}
          onToggleRect={() => {
            if (rectEnabled) setRectEnabled(false)
            else {
              clearDrawingModes()
              setRectEnabled(true)
            }
          }}
          onToggleMeasure={() => {
            if (measureEnabled) setMeasureEnabled(false)
            else {
              clearDrawingModes()
              setMeasureEnabled(true)
            }
          }}
          onToggleFibExt={() => {
            if (fibExtEnabled) setFibExtEnabled(false)
            else {
              clearDrawingModes()
              setFibExtEnabled(true)
            }
          }}
          onToggleVertical={() => {
            if (verticalEnabled) setVerticalEnabled(false)
            else {
              clearDrawingModes()
              setVerticalEnabled(true)
            }
          }}
          onToggleText={() => {
            if (textEnabled) setTextEnabled(false)
            else {
              clearDrawingModes()
              setTextEnabled(true)
            }
          }}
          onClear={() => setClearSignal((s) => s + 1)}
          onSimulateUp={() => simulateMove('up')}
          onSimulateDown={() => simulateMove('down')}
        />

        <div className="chart-wrap relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-t-lg bg-panel2">
          <KLineChart
            bars={bars}
            drawingEnabled={drawingEnabled}
            fibonacciEnabled={fibonacciEnabled}
            actionEnabled={actionEnabled}
            rectEnabled={rectEnabled}
            measureEnabled={measureEnabled}
            fibExtEnabled={fibExtEnabled}
            verticalEnabled={verticalEnabled}
            textEnabled={textEnabled}
            clearSignal={clearSignal}
            indicatorConfig={indicatorConfig}
            onIndicatorLegend={setChartLegend}
            onLoadMoreHistory={loadMoreHistory}
            onLatestVisibleChange={setLatestVisible}
            backSignal={backSignal}
            lineTool={lineTool}
            onCancelDrawing={clearDrawingModes}
            highLowStyle={settings.highLowStyle}
            storageKey={drawingStorageKey(code, period)}
          />
          {/* 右上:OHLCV + 代码 + 周期 + 名称(上行);「回到最新」按钮独立(不与其共父级) */}
          <div className="pointer-events-none absolute right-[72px] top-3 z-10 flex flex-col items-end gap-0.5 whitespace-nowrap">
            <div className="flex flex-row items-baseline gap-0.5">
              {chartLegend.ohlcv.map((e) => (
                <span key={e.label} className="whitespace-nowrap text-sm leading-[1.4] tabular-nums" style={{ color: e.color }}>
                  {e.label} {e.value}
                </span>
              ))}
              <span className="text-xs text-muted">
                {code.toUpperCase()} · {PERIOD_LABEL[period]}
              </span>
              <span> </span>
              <span className="text-xl font-semibold text-white">{name || '—'}</span>
            </div>
            {!latestVisible && (
              <button
                className="pointer-events-auto mt-2 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-accent bg-transparent text-xs text-accent hover:bg-accent/10"
                title="回到最新"
                onClick={() => setBackSignal((s) => s + 1)}
              >
                <HomeIcon width="14" height="14" />
              </button>
            )}
          </div>
          {/* 左上:主图指标值区(MA/BBI 标签+值,跟随十字线) */}
          {chartLegend.indicators.length > 0 && (
            <div className="pointer-events-none absolute left-4 top-3 z-10 flex flex-row flex-wrap items-center gap-0.5">
              {chartLegend.indicators.map((e) => (
                <span key={e.label} className="text-xs leading-[1.4]" style={{ color: e.color }}>
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
        />
      </div>
    </div>
  )
}
