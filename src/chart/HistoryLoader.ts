import type { IChartApi, LogicalRange } from 'lightweight-charts'

/** 默认时间视图:显示最后 1/4 数据 + 右侧预留约 1/4 宽度(最后一根在 75% 处) */
export function defaultViewRange(n: number): { from: number; to: number } {
  const display = Math.max(10, Math.round(n / 4))
  return { from: Math.max(0, n - 1 - display), to: n - 1 + display / 3 }
}

/**
 * 时间轴视图控制器:
 * - 右滑追加历史:监测可见区间到达最左侧,触发加载更多,数据前置后保持窗口位置
 * - 回到最新:监测最新 K 线是否在屏内,暴露 backToLatest() 恢复默认视图(3/4 位置)
 */
export class HistoryLoader {
  private _chart: IChartApi
  private _onNeedMore: () => void
  private _getBarCount: () => number
  private _onLatestVisible: ((visible: boolean) => void) | null = null
  private _latestVisible = true
  private _preserve: { from: number; to: number; oldLength: number } | null = null

  constructor(
    chart: IChartApi,
    onNeedMore: () => void,
    getBarCount: () => number,
    onLatestVisible?: (visible: boolean) => void,
  ) {
    this._chart = chart
    this._onNeedMore = onNeedMore
    this._getBarCount = getBarCount
    this._onLatestVisible = onLatestVisible ?? null
    this._chart.timeScale().subscribeVisibleLogicalRangeChange(this._onRangeChange)
  }

  private _onRangeChange = (range: LogicalRange | null): void => {
    if (range && range.from <= 1) {
      this._preserve = { from: range.from, to: range.to, oldLength: this._getBarCount() }
      this._onNeedMore()
    }
    // 最新 K 线是否在屏内(to 覆盖到最后一根索引)
    const visible = range ? range.to >= this._getBarCount() - 1 : true
    if (visible !== this._latestVisible) {
      this._latestVisible = visible
      this._onLatestVisible?.(visible)
    }
  }

  /** 恢复到默认视图(最后一根在 75% 处) */
  backToLatest(): void {
    const view = defaultViewRange(this._getBarCount())
    this._chart.timeScale().setVisibleLogicalRange(view)
  }

  /** 数据更新后解析要应用的时间范围:追加历史时保持原窗口,否则默认视图 */
  resolveRange(newLength: number): { from: number; to: number } {
    if (this._preserve && newLength > this._preserve.oldLength) {
      const shift = newLength - this._preserve.oldLength
      const r = { from: this._preserve.from + shift, to: this._preserve.to + shift }
      this._preserve = null
      return r
    }
    return defaultViewRange(newLength)
  }

  dispose(): void {
    this._chart.timeScale().unsubscribeVisibleLogicalRangeChange(this._onRangeChange)
  }
}
