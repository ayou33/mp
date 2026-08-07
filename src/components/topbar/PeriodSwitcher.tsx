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
    <div className="inline-flex overflow-hidden rounded-md border border-white/15">
      {PERIODS.map((p) => (
        <button
          key={p.key}
          className={`cursor-pointer border-none bg-transparent px-3.5 py-1.5 text-sm text-muted hover:text-ink ${
            period === p.key ? 'bg-accent text-white' : ''
          }`}
          onClick={() => onChange(p.key)}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
