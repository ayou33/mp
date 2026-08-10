import type { FormulaShape } from '../../indicators/custom'
import { IndicatorLineEditor, type LineDraft } from './IndicatorLineEditor'
import { INPUT_CLS, SCALE_OPTIONS, SHAPE_OPTIONS, SegmentedControl, TEXTAREA_CLS } from './formulaOutputShared'

/**
 * 多输出脚本中单条输出的编辑行:输出名 + 形态选择 + 显示名/Y轴/显示开关 + (band 下轨 / baseline 基准值)+ 线样式。
 * 每行独立选择形态/轴/可见性,脚本模式不再固定为折线。
 */
export function FormulaOutputLineRow({
  name,
  shape,
  onShape,
  lower,
  onLower,
  base,
  onBase,
  draft,
  onDraft,
  label,
  onLabel,
  scale,
  onScale,
  visible,
  onVisible,
}: {
  name: string
  shape: FormulaShape
  onShape: (v: FormulaShape) => void
  lower: string
  onLower: (v: string) => void
  base: string
  onBase: (v: string) => void
  draft: LineDraft
  onDraft: (d: LineDraft) => void
  label: string
  onLabel: (v: string) => void
  scale: 'right' | 'independent'
  onScale: (v: 'right' | 'independent') => void
  visible: boolean
  onVisible: (v: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-white/10 px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-ink">{name.toUpperCase()}</span>
        <SegmentedControl size="sm" value={shape} options={SHAPE_OPTIONS} onChange={onShape} />
      </div>
      {/* 显示名 */}
      <label className="flex items-center justify-between gap-2">
        <span className="whitespace-nowrap text-xs text-muted">显示名</span>
        <input
          className={`w-36 text-right ${INPUT_CLS}`}
          value={label}
          onChange={(e) => onLabel(e.target.value)}
          placeholder={name.toUpperCase()}
          spellCheck={false}
        />
      </label>
      {/* Y轴 + 显示开关 */}
      <div className="flex items-center justify-between gap-2">
        <span className="whitespace-nowrap text-xs text-muted">Y轴</span>
        <SegmentedControl size="sm" value={scale} options={SCALE_OPTIONS} onChange={onScale} />
        <button
          type="button"
          className={`cursor-pointer rounded border px-2 py-0.5 text-xs ${
            visible ? 'border-accent bg-accent text-white' : 'border-border bg-transparent text-muted hover:text-ink'
          }`}
          onClick={() => onVisible(!visible)}
        >
          {visible ? '显示中' : '已隐藏'}
        </button>
      </div>
      {shape === 'band' && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted">下轨公式(可引用上面变量)</span>
          <textarea
            className={`h-14 ${TEXTAREA_CLS}`}
            value={lower}
            onChange={(e) => onLower(e.target.value)}
            placeholder="SMA(CLOSE,20) - STDDEV(CLOSE,20)*2"
            spellCheck={false}
          />
        </div>
      )}
      {shape === 'baseline' && (
        <label className="flex items-center justify-between gap-2">
          <span className="whitespace-nowrap text-xs text-muted">基准值</span>
          <input
            className={`w-24 text-right tabular-nums ${INPUT_CLS}`}
            value={base}
            onChange={(e) => onBase(e.target.value)}
            placeholder="0"
            inputMode="decimal"
          />
        </label>
      )}
      <IndicatorLineEditor label="样式" draft={draft} onChange={onDraft} />
    </div>
  )
}