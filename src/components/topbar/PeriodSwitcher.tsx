import type { KlinePeriod } from '../../api/stock'

interface PeriodSwitcherProps {
  period: KlinePeriod
  onChange: (period: KlinePeriod) => void
}

const PERIODS: Array<{ key: KlinePeriod; label: string }> = [
  { key: 'day', label: '日' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
]

/** 周期切换:日 / 周 / 月 */
export function PeriodSwitcher({ period, onChange }: PeriodSwitcherProps) {
  return (
    <div className="period-switcher">
      {PERIODS.map((p) => (
        <button
          key={p.key}
          className={period === p.key ? 'period-btn active' : 'period-btn'}
          onClick={() => onChange(p.key)}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
