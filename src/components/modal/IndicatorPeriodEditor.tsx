import { LineStyle } from 'lightweight-charts'
import type { IndicatorLineSpec } from '../../indicators/editorMeta'
import { LineStyleControls, type LineDraft } from './IndicatorLineEditor'

/**
 * 编号周期行编辑:每行 = 左对齐 M 序号 + 周期输入(+ 内嵌该线样式)+ 移除,末尾可新增。
 * withStyle=false(如 BBI,多周期算单条线)不内嵌样式,样式在下方单独编辑。
 */
export function PeriodLineRows({
  label,
  periods,
  lines,
  drafts,
  withStyle = true,
  onPeriods,
  onStyle,
}: {
  label: string
  periods: string[]
  lines: IndicatorLineSpec[]
  drafts: Record<string, LineDraft>
  /** 周期与输出线一一对应时内嵌样式编辑(MA/EMA/WR);否则仅编号行(BBI) */
  withStyle?: boolean
  onPeriods: (values: string[]) => void
  onStyle: (lineKey: string, draft: LineDraft) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted">{label}</span>
      <div className="flex flex-col gap-1">
        {periods.map((v, i) => {
          const line = lines[i]
          return (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                {/* 无法命名的参数/输出线:用 M1/M2... 编号标识(左对齐) */}
                <span className="w-8 text-left text-xs tabular-nums text-muted">M{i + 1}</span>
                <input
                  className="h-7 w-16 rounded-md border-none bg-input px-2.5 text-right text-sm tabular-nums text-ink outline-none focus:ring-1 focus:ring-accent"
                  value={v}
                  inputMode="numeric"
                  onChange={(e) => onPeriods(periods.map((x, j) => (j === i ? e.target.value : x)))}
                />
              </span>
              <span className="flex items-center gap-1.5">
                {withStyle && line && (
                  <LineStyleControls
                    draft={drafts[line.key] ?? { color: line.defaultColor, width: '1', style: LineStyle.Solid }}
                    onChange={(d) => onStyle(line.key, d)}
                  />
                )}
                <button
                  className="cursor-pointer border-none bg-transparent px-1 text-sm text-muted hover:text-white"
                  title="移除该周期"
                  onClick={() => onPeriods(periods.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </span>
            </div>
          )
        })}
      </div>
      <button
        className="w-fit cursor-pointer rounded-md border border-white/15 bg-transparent px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-accent"
        onClick={() => onPeriods([...periods, ''])}
      >
        + 新增
      </button>
    </div>
  )
}
