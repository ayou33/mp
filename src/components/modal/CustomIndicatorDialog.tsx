import { useMemo, useState } from 'react'
import HelpOutlineIcon from '@iconify-react/material-symbols/help-outline'
import {
  USER_FORMULA_RECORDS,
  newUserFormulaId,
  parseFormulaScript,
  type CustomIndicatorConfigEntry,
  type CustomPane,
  type FormulaShape,
  type UserFormulaRecord,
} from '../../indicators/custom'
import type { IndicatorConfig } from '../../indicators/IndicatorController'
import type { LineDraft } from './IndicatorLineEditor'
import { defaultFormulaDraft, FormulaHelp, FormulaOutputSection, SegmentedControl } from './FormulaOutputLines'
import { FormulaHelpPanel } from './FormulaHelpPanel'
import {
  buildFormulaCommit,
  initLineBase,
  initLineDrafts,
  initLineLabels,
  initLineLower,
  initLineScales,
  initLineShapes,
  initLineVisible,
  PANE_OPTIONS,
  SHAPE_OPTIONS,
  TEXTAREA_CLS,
} from './formulaDialogMeta'

interface CustomIndicatorDialogProps {
  /** 编辑已有公式指标 id;缺省 = 新建 */
  id?: string
  config: IndicatorConfig
  /** 保存(新建或更新):写公式记录 + 实例配置 */
  onApply: (rec: UserFormulaRecord, entry: CustomIndicatorConfigEntry) => void
  /** 删除(仅编辑模式) */
  onDelete?: () => void
  onDone: () => void
}

/**
 * 自定义指标公式编辑弹窗:用户手写公式定义指标(而非选择内置)。
 * 支持多输出脚本:每行 `NAME = EXPR`(可引用前面行)→ 每行一条输出,可独立选形态(band 需下轨/baseline 可设基准值);单表达式 → 单输出按形态渲染。
 * 新建/编辑复用;保存时校验公式语法 → 写公式记录(持久化)+ config.custom[id] 实例配置(rev 自增触发重建)。
 */
export function CustomIndicatorDialog({ id, config, onApply, onDelete, onDone }: CustomIndicatorDialogProps) {
  const existing = id ? USER_FORMULA_RECORDS.get(id) : undefined
  const entry = id ? config.custom[id] : undefined
  const [newId] = useState(() => newUserFormulaId())
  const recId = id ?? newId

  const [title, setTitle] = useState(existing?.title ?? '')
  const [shape, setShape] = useState<FormulaShape>(existing?.shape ?? 'line')
  const [formula, setFormula] = useState(existing?.formula ?? '')
  const [formula2, setFormula2] = useState(existing?.formula2 ?? '')
  const [baseValue, setBaseValue] = useState(existing?.baseValue !== undefined ? String(existing.baseValue) : '')
  const [pane, setPane] = useState<CustomPane>(entry?.pane ?? 'overlay')
  const [lineDrafts, setLineDrafts] = useState<Record<string, LineDraft>>(() => initLineDrafts(existing, entry))
  /** 多输出脚本:每条输出的形态(缺省 line) */
  const [lineShapes, setLineShapes] = useState<Record<string, FormulaShape>>(() => initLineShapes(existing))
  /** 多输出脚本:band 输出的下轨公式 */
  const [lineLower, setLineLower] = useState<Record<string, string>>(() => initLineLower(existing))
  /** 多输出脚本:baseline 输出的基准值 */
  const [lineBase, setLineBase] = useState<Record<string, string>>(() => initLineBase(existing))
  /** 多输出脚本:每条输出的 显示名/Y轴(主轴/独立轴)/可见性(缺省:名称大写/主轴/显示) */
  const [lineLabels, setLineLabels] = useState<Record<string, string>>(() => initLineLabels(existing))
  const [lineScales, setLineScales] = useState<Record<string, 'right' | 'independent'>>(() => initLineScales(existing, entry))
  const [lineVisible, setLineVisible] = useState<Record<string, boolean>>(() => initLineVisible(existing))
  const [error, setError] = useState<string | null>(null)
  /** 公式特性说明悬浮面板开关 */
  const [helpOpen, setHelpOpen] = useState(false)

  /** 实时解析主公式:null = 空/语法错误;scriptMode = 多输出脚本(任一赋值语句) */
  const parsed = useMemo(() => {
    if (!formula.trim()) return null
    try {
      return parseFormulaScript(formula)
    } catch {
      return null
    }
  }, [formula])
  const scriptMode = parsed !== null && (parsed.length > 1 || parsed[0].name !== 'main')
  // 私有变量(NAME := EXPR)参与计算但不渲染,不进入输出配置列表
  const lineNames = scriptMode && parsed ? parsed.filter((s) => s.kind !== 'var').map((s) => s.name) : ['main']

  const setDraft = (name: string, draft: LineDraft) => setLineDrafts((p) => ({ ...p, [name]: draft }))
  const setLineShape = (name: string, v: FormulaShape) => setLineShapes((p) => ({ ...p, [name]: v }))
  const setLower = (name: string, v: string) => setLineLower((p) => ({ ...p, [name]: v }))
  const setBase = (name: string, v: string) => setLineBase((p) => ({ ...p, [name]: v }))
  const setLineLabel = (name: string, v: string) => setLineLabels((p) => ({ ...p, [name]: v }))
  const setLineScale = (name: string, v: 'right' | 'independent') => setLineScales((p) => ({ ...p, [name]: v }))
  const setLineVis = (name: string, v: boolean) => setLineVisible((p) => ({ ...p, [name]: v }))

  const commit = () => {
    try {
      const { rec, entryNext } = buildFormulaCommit({
        recId,
        title,
        shape,
        formula,
        formula2,
        baseValue,
        pane,
        scriptMode,
        lineNames,
        lineDrafts,
        lineShapes,
        lineLower,
        lineBase,
        lineLabels,
        lineScales,
        lineVisible,
        entry,
        existing,
      })
      onApply(rec, entryNext)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const inputCls =
    'rounded-md border-none bg-input px-2.5 py-1.5 text-sm text-ink outline-none focus:ring-1 focus:ring-accent'

  return (
    <div className="flex min-h-full flex-col gap-2.5">
      {/* 名称 */}
      <label className="flex items-center justify-between gap-2">
        <span className="whitespace-nowrap text-muted">名称</span>
        <input
          className={`w-52 ${inputCls}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="如:双均线差"
          spellCheck={false}
        />
      </label>

      {/* 输出形态(多输出脚本时固定为多线,隐藏形态选择) */}
      {!scriptMode && (
        <div className="flex items-center justify-between gap-2">
          <span className="whitespace-nowrap text-muted">输出形态</span>
          <SegmentedControl value={shape} options={SHAPE_OPTIONS} onChange={setShape} />
        </div>
      )}

      {/* 主公式 / 上轨公式;脚本模式下每行 NAME = EXPR 定义一条输出线 */}
      <div className="flex min-h-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-1 text-muted">
          {scriptMode ? '公式脚本(每行 NAME = 表达式)' : shape === 'band' ? '上轨公式' : '公式'}
          <button type="button" className={`inline-flex cursor-pointer items-center border-none bg-transparent p-0 text-muted hover:text-accent ${helpOpen ? 'text-accent' : ''}`} title="公式特性说明" onClick={() => setHelpOpen((v) => !v)}><HelpOutlineIcon width="14" height="14" /></button>
        </span>
        <textarea
          className={`min-h-24 flex-1 ${TEXTAREA_CLS}`}
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          placeholder={scriptMode ? 'DIF = EMA(CLOSE,12) - EMA(CLOSE,26)\nDEA = EMA(DIF,9)' : 'SMA(CLOSE,5) - SMA(CLOSE,20)'}
          spellCheck={false}
        />
      </div>

      {/* band 下轨公式(仅单输出区间形态);与主输入区 flex-1 五五等分竖向空间 */}
      {!scriptMode && shape === 'band' && (
        <div className="flex min-h-0 flex-1 flex-col gap-1">
          <span className="text-muted">下轨公式</span>
          <textarea
            className={`min-h-14 flex-1 ${TEXTAREA_CLS}`}
            value={formula2}
            onChange={(e) => setFormula2(e.target.value)}
            placeholder="SMA(CLOSE,20) - STDDEV(CLOSE,20)*2"
            spellCheck={false}
          />
        </div>
      )}

      {/* baseline 基准值(仅单输出基线形态) */}
      {!scriptMode && shape === 'baseline' && (
        <label className="flex items-center justify-between gap-2">
          <span className="whitespace-nowrap text-muted">基准值</span>
          <input
            className={`w-24 text-right tabular-nums ${inputCls}`}
            value={baseValue}
            onChange={(e) => setBaseValue(e.target.value)}
            placeholder="0"
            inputMode="decimal"
          />
        </label>
      )}

      <FormulaHelp scriptMode={scriptMode} shape={shape} />

      {/* 挂载位置 */}
      <div className="flex items-center justify-between gap-2">
        <span className="whitespace-nowrap text-muted">挂载位置</span>
        <SegmentedControl value={pane} options={PANE_OPTIONS} onChange={setPane} />
      </div>

      {/* 输出线样式 + Y 轴分配 */}
      <FormulaOutputSection
        scriptMode={scriptMode}
        lineNames={lineNames}
        lineDrafts={lineDrafts}
        onDraft={setDraft}
        lineShapes={lineShapes}
        onShape={setLineShape}
        lineLower={lineLower}
        onLower={setLower}
        lineBase={lineBase}
        onBase={setBase}
        lineLabels={lineLabels}
        onLabel={setLineLabel}
        lineScales={lineScales}
        onScale={setLineScale}
        lineVisible={lineVisible}
        onVisible={setLineVis}
        mainDraft={lineDrafts['main'] ?? defaultFormulaDraft('main', 0, existing?.color)}
      />

      {/* 校验错误 */}
      {error && <p className="m-0 text-xs text-down">{error}</p>}

      {/* 底部:删除(仅编辑模式)+ 取消/确定 */}
      <div className="mt-3 flex items-center justify-between gap-2">
        {id && onDelete ? (
          <button
            className="cursor-pointer rounded-[4px] border border-border bg-transparent px-3.5 py-1.5 text-sm text-down hover:bg-white/5"
            onClick={() => {
              onDelete()
              onDone()
            }}
          >
            删除
          </button>
        ) : (
          <span />
        )}
        <span className="flex gap-2">
          <button
            className="cursor-pointer rounded-[4px] border border-border bg-transparent px-3.5 py-1.5 text-sm text-ink hover:bg-white/5"
            onClick={onDone}
          >
            取消
          </button>
          <button
            className="cursor-pointer rounded-[4px] border border-accent bg-accent px-3.5 py-1.5 text-sm text-white hover:bg-accent-hover"
            onClick={commit}
          >
            确定
          </button>
        </span>
      </div>
      <FormulaHelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
