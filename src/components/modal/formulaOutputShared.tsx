import { FORMULA_SHAPE_LABEL, type FormulaShape } from '../../indicators/custom'

/** 弹窗通用输入框样式(与 CustomIndicatorDialog 内联一致) */
export const INPUT_CLS =
  'rounded-md border-none bg-input px-2.5 py-1.5 text-sm text-ink outline-none focus:ring-1 focus:ring-accent'

/** 弹窗公式/下轨文本框样式 */
export const TEXTAREA_CLS =
  'w-full resize-y rounded-md border-none bg-input px-2.5 py-1.5 font-mono text-sm leading-relaxed text-ink outline-none focus:ring-1 focus:ring-accent'

/** 输出形态选项(单输出形态选择 + 多输出每行形态选择共用) */
export const SHAPE_OPTIONS = (Object.entries(FORMULA_SHAPE_LABEL) as Array<[FormulaShape, string]>).map(
  ([value, label]) => ({ value, label }),
)

/** Y 轴选项(每行独立选择;缺省主轴) */
export const SCALE_OPTIONS: Array<{ value: 'right' | 'independent'; label: string }> = [
  { value: 'right', label: '主轴' },
  { value: 'independent', label: '独立轴' },
]

/** 通用分段选择器(输出形态/挂载位置/Y轴共用) */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
  size?: 'sm' | 'md'
}) {
  const btn = (active: boolean): string =>
    `cursor-pointer border-none bg-transparent ${
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1.5 text-sm'
    } ${active ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`
  return (
    <span className="inline-flex overflow-hidden rounded-md border border-white/15">
      {options.map((o) => (
        <button key={o.value} className={btn(value === o.value)} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </span>
  )
}
