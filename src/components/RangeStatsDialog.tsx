import type { RangeStats } from '../drawing/DrawingTools'

interface RangeStatsDialogProps {
  stats: RangeStats
}

const fmt = (n: number, d = 2): string => (Number.isFinite(n) ? n.toFixed(d) : '—')
const sign = (n: number): string => (n > 0 ? '+' : '')

function fmtVolume(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(2)}万手`
  return `${Math.round(v)}手`
}

/** 右键框选的区间统计弹窗 */
export function RangeStatsDialog({ stats }: RangeStatsDialogProps) {
  const up = stats.change >= 0
  const trendClass = up ? 'text-up' : 'text-down'
  const row = 'flex justify-between'
  const key = 'text-muted'
  return (
    <div className="flex min-w-[230px] flex-col gap-2 text-sm tabular-nums">
      <div className={row}>
        <span className={key}>区间</span>
        <span>
          {stats.from} ~ {stats.to}
        </span>
      </div>
      <div className={row}>
        <span className={key}>交易日数</span>
        <span>{stats.bars}</span>
      </div>
      <div className={row}>
        <span className={key}>开盘</span>
        <span>{fmt(stats.open)}</span>
      </div>
      <div className={`${row} ${trendClass}`}>
        <span className={key}>最高</span>
        <span>{fmt(stats.high)}</span>
      </div>
      <div className={`${row} ${trendClass}`}>
        <span className={key}>最低</span>
        <span>{fmt(stats.low)}</span>
      </div>
      <div className={row}>
        <span className={key}>收盘</span>
        <span>{fmt(stats.close)}</span>
      </div>
      <div className={`${row} ${trendClass}`}>
        <span className={key}>涨跌</span>
        <span>
          {sign(stats.change)}
          {fmt(stats.change)}
        </span>
      </div>
      <div className={`${row} ${trendClass}`}>
        <span className={key}>涨跌幅</span>
        <span>
          {sign(stats.changePct)}
          {fmt(stats.changePct)}%
        </span>
      </div>
      <div className={row}>
        <span className={key}>振幅</span>
        <span>{fmt(stats.amplitudePct)}%</span>
      </div>
      <div className={row}>
        <span className={key}>成交量</span>
        <span>{fmtVolume(stats.volume)}</span>
      </div>
    </div>
  )
}
