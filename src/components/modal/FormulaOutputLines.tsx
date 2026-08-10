import {
  FORMULA_FIELDS,
  FORMULA_FUNCS,
  type FormulaShape,
} from '../../indicators/custom'
import { IndicatorLineEditor, type LineDraft } from './IndicatorLineEditor'
import { FormulaOutputLineRow } from './FormulaOutputLineRow'
import { defaultFormulaDraft } from './formulaOutputShared'

// 共享常量/控件转发导出(formulaDialogMeta / CustomIndicatorDialog 继续从此入口取)
export {
  INPUT_CLS,
  TEXTAREA_CLS,
  SHAPE_OPTIONS,
  SCALE_OPTIONS,
  SegmentedControl,
  defaultFormulaDraft,
} from './formulaOutputShared'

/**
 * 多输出公式脚本的输出配置列表:每行一个输出,可独立选形态/显示名/Y轴/可见性 + 调色/线宽/线型。
 * 线名展示为大写;drafts/shapes 等缺省某线时用默认值兜底(旧记录无形态 → line)。
 */
export function FormulaOutputLines({
  names,
  drafts,
  onDraft,
  shapes,
  onShape,
  lowers,
  onLower,
  bases,
  onBase,
  labels,
  onLabel,
  scales,
  onScale,
  visibles,
  onVisible,
}: {
  names: string[]
  drafts: Record<string, LineDraft>
  onDraft: (name: string, draft: LineDraft) => void
  shapes: Record<string, FormulaShape>
  onShape: (name: string, shape: FormulaShape) => void
  lowers: Record<string, string>
  onLower: (name: string, lower: string) => void
  bases: Record<string, string>
  onBase: (name: string, base: string) => void
  labels: Record<string, string>
  onLabel: (name: string, label: string) => void
  scales: Record<string, 'right' | 'independent'>
  onScale: (name: string, scale: 'right' | 'independent') => void
  visibles: Record<string, boolean>
  onVisible: (name: string, visible: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {names.map((n, i) => (
        <FormulaOutputLineRow
          key={n}
          name={n}
          shape={shapes[n] ?? 'line'}
          onShape={(v) => onShape(n, v)}
          lower={lowers[n] ?? ''}
          onLower={(v) => onLower(n, v)}
          base={bases[n] ?? ''}
          onBase={(v) => onBase(n, v)}
          draft={drafts[n] ?? defaultFormulaDraft(n, i)}
          onDraft={(d) => onDraft(n, d)}
          label={labels[n] ?? ''}
          onLabel={(v) => onLabel(n, v)}
          scale={scales[n] ?? 'right'}
          onScale={(v) => onScale(n, v)}
          visible={visibles[n] ?? true}
          onVisible={(v) => onVisible(n, v)}
        />
      ))}
    </div>
  )
}

/** 输出配置区:多输出脚本每行独立形态/显示名/Y轴/可见性 + 样式;单输出一条主线 */
export function FormulaOutputSection({
  scriptMode,
  lineNames,
  lineDrafts,
  onDraft,
  lineShapes,
  onShape,
  lineLower,
  onLower,
  lineBase,
  onBase,
  lineLabels,
  onLabel,
  lineScales,
  onScale,
  lineVisible,
  onVisible,
  mainDraft,
}: {
  scriptMode: boolean
  lineNames: string[]
  lineDrafts: Record<string, LineDraft>
  onDraft: (name: string, draft: LineDraft) => void
  lineShapes: Record<string, FormulaShape>
  onShape: (name: string, shape: FormulaShape) => void
  lineLower: Record<string, string>
  onLower: (name: string, lower: string) => void
  lineBase: Record<string, string>
  onBase: (name: string, base: string) => void
  lineLabels: Record<string, string>
  onLabel: (name: string, label: string) => void
  lineScales: Record<string, 'right' | 'independent'>
  onScale: (name: string, scale: 'right' | 'independent') => void
  lineVisible: Record<string, boolean>
  onVisible: (name: string, visible: boolean) => void
  mainDraft: LineDraft
}) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-white/5 pb-2">
      {scriptMode ? (
        <FormulaOutputLines
          names={lineNames}
          drafts={lineDrafts}
          onDraft={onDraft}
          shapes={lineShapes}
          onShape={onShape}
          lowers={lineLower}
          onLower={onLower}
          bases={lineBase}
          onBase={onBase}
          labels={lineLabels}
          onLabel={onLabel}
          scales={lineScales}
          onScale={onScale}
          visibles={lineVisible}
          onVisible={onVisible}
        />
      ) : (
        <IndicatorLineEditor label="主输出" draft={mainDraft} onChange={(d) => onDraft('main', d)} />
      )}
    </div>
  )
}

/** 字段/函数/语法帮助文本 */
export function FormulaHelp({ scriptMode, shape }: { scriptMode: boolean; shape: FormulaShape }) {
  return (
    <p className="m-0 text-xs leading-relaxed text-muted">
      字段:{FORMULA_FIELDS.join(' / ')};函数:{FORMULA_FUNCS.join(' / ')};运算符 + - * / ( )
      {scriptMode ? (
        <>
          <br />
          多输出脚本:每行 <span className="font-mono">NAME = EXPR</span>(输出)或 <span className="font-mono">NAME := EXPR</span>(私有变量,不渲染);NAME 可大写引用前面行的结果;每行可
          独立选择输出形态(例:<span className="font-mono">DIF = EMA(CLOSE,12) - EMA(CLOSE,26)</span>,再把
          DIF 行设为柱状/区间等;中间值用 <span className="font-mono">MID := SMA(C,20)</span> 引用)
        </>
      ) : (
        <>
          <br />
          例:
          {shape === 'band' ? (
            <span className="font-mono">SMA(CLOSE,20) + STDDEV(CLOSE,20)*2</span>
          ) : (
            <span className="font-mono">EMA(EMA(CLOSE,12) - EMA(CLOSE,26),9)</span>
          )}
        </>
      )}
    </p>
  )
}