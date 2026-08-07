import { LineStyle, type LineWidth } from 'lightweight-charts'

/** 线样式草稿:width 存原始输入文本,确定时 clamp 到 1-4 */
export interface LineDraft {
  color: string
  width: string
  style: LineStyle
}

const LINE_STYLES: LineStyle[] = [LineStyle.Solid, LineStyle.Dashed, LineStyle.Dotted]

/** 线宽输入解析并钳制到 lightweight-charts 支持范围 1-4(空/非法 → 1) */
export function clampLineWidth(v: string): LineWidth {
  const n = Number.parseInt(v, 10)
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(4, Math.round(n))) as LineWidth
}

/** 线型小预览:实线 / 虚线 / 点线,按当前按钮文字色渲染 */
function LineStylePreview({ style }: { style: LineStyle }) {
  const dash = style === LineStyle.Dashed ? '6 4' : style === LineStyle.Dotted ? '1 3' : undefined
  return (
    <svg width="26" height="8" viewBox="0 0 26 8" aria-hidden="true">
      <line
        x1="1"
        y1="4"
        x2="25"
        y2="4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap={style === LineStyle.Dotted ? 'round' : 'butt'}
        strokeDasharray={dash}
      />
    </svg>
  )
}

const STYLE_TITLE: Partial<Record<LineStyle, string>> = {
  [LineStyle.Solid]: '实线',
  [LineStyle.Dashed]: '虚线',
  [LineStyle.Dotted]: '点线',
}

/** 线样式控件组:线色 + 线宽(输入,默认 1)+ 线型(button group,按钮内显示对应线型);独立行与周期行内嵌共用 */
export function LineStyleControls({
  draft,
  onChange,
}: {
  draft: LineDraft
  onChange: (draft: LineDraft) => void
}) {
  return (
    <span className="flex items-center gap-1.5">
      <input
        type="color"
        value={draft.color}
        onChange={(e) => onChange({ ...draft, color: e.target.value })}
        className="h-7 w-8 cursor-pointer rounded border border-white/15 bg-transparent p-0"
        title="线色"
      />
      <input
        value={draft.width}
        inputMode="numeric"
        onChange={(e) => onChange({ ...draft, width: e.target.value })}
        className="h-7 w-10 rounded-md border-none bg-input px-1.5 text-center text-xs tabular-nums text-ink outline-none focus:ring-1 focus:ring-accent"
        title="线宽(1-4)"
      />
      <span className="inline-flex overflow-hidden rounded-md border border-white/15">
        {LINE_STYLES.map((s) => (
          <button
            key={s}
            className={`h-7 cursor-pointer border-none bg-transparent px-2 text-muted ${
              s === draft.style ? 'bg-accent text-white' : 'hover:text-ink'
            }`}
            title={STYLE_TITLE[s]}
            onClick={() => onChange({ ...draft, style: s })}
          >
            <LineStylePreview style={s} />
          </button>
        ))}
      </span>
    </span>
  )
}

/** 单条输出线的样式编辑(带标签) */
export function IndicatorLineEditor({
  label,
  draft,
  onChange,
}: {
  label: string
  draft: LineDraft
  onChange: (draft: LineDraft) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="whitespace-nowrap text-muted">{label}</span>
      <LineStyleControls draft={draft} onChange={onChange} />
    </div>
  )
}
