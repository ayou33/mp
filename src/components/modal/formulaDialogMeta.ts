import {
  parseFormula,
  parseFormulaExpr,
  parseFormulaScript,
  type CustomIndicatorConfigEntry,
  type CustomPane,
  type CustomScale,
  type InlineLineStyle,
  type FormulaOutputSpec,
  type FormulaShape,
  type FormulaStatement,
  type UserFormulaRecord,
} from '../../indicators/custom'

export { INPUT_CLS, SHAPE_OPTIONS, TEXTAREA_CLS } from './FormulaOutputLines'

export const PANE_OPTIONS: Array<{ value: CustomPane; label: string }> = [
  { value: 'overlay', label: '主图叠加' },
  { value: 'sub', label: '副图' },
]

/** 尽力解析公式中的输出名(解析失败返回空数组,UI 按单表达式渲染) */
export function formulaLineNames(source: string): string[] {
  if (!source.trim()) return []
  try {
    // 仅输出语句参与配置 UI(私有变量与 STICKLINE 竖条除外)
    return parseFormulaScript(source).filter((s) => s.kind === 'output').map((s) => s.name)
  } catch {
    return []
  }
}

/** 编辑模式的初始形态草稿:按既有 outputSpecs 读取(旧记录无 outputSpecs → 空) */
export function initLineShapes(existing: UserFormulaRecord | undefined): Record<string, FormulaShape> {
  const out: Record<string, FormulaShape> = {}
  for (const [n, spec] of Object.entries(existing?.outputSpecs ?? {})) out[n] = spec.shape
  return out
}

/** 编辑模式的初始 band 下轨草稿 */
export function initLineLower(existing: UserFormulaRecord | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [n, spec] of Object.entries(existing?.outputSpecs ?? {})) {
    if (spec.shape === 'band' && spec.lower) out[n] = spec.lower
  }
  return out
}

/** 编辑模式的初始 baseline 基准值草稿 */
export function initLineBase(existing: UserFormulaRecord | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [n, spec] of Object.entries(existing?.outputSpecs ?? {})) {
    if (spec.shape === 'baseline' && spec.baseValue !== undefined) out[n] = String(spec.baseValue)
  }
  return out
}

/** 编辑模式的初始显示名草稿(缺省 = 名称大写,只记录非空) */
export function initLineLabels(existing: UserFormulaRecord | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [n, spec] of Object.entries(existing?.outputSpecs ?? {})) if (spec.label) out[n] = spec.label
  return out
}

/** 编辑模式的初始 Y 轴草稿(主轴/独立轴;优先 outputSpecs.scale,回退 entry.scales) */
export function initLineScales(
  existing: UserFormulaRecord | undefined,
  entry: CustomIndicatorConfigEntry | undefined,
): Record<string, 'right' | 'independent'> {
  const out: Record<string, 'right' | 'independent'> = {}
  for (const n of formulaLineNames(existing?.formula ?? '')) {
    const fromSpec = existing?.outputSpecs?.[n]?.scale?.kind
    if (fromSpec === 'independent' || fromSpec === 'right') out[n] = fromSpec
    else if (entry?.scales?.[n]?.kind === 'independent') out[n] = 'independent'
  }
  return out
}

/** 编辑模式的初始可见性草稿(缺省 true,只记录 false) */
export function initLineVisible(existing: UserFormulaRecord | undefined): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const [n, spec] of Object.entries(existing?.outputSpecs ?? {})) if (spec.visible === false) out[n] = false
  return out
}

export interface FormulaCommitArgs {
  recId: string
  title: string
  shape: FormulaShape
  formula: string
  formula2: string
  baseValue: string
  pane: CustomPane
  scriptMode: boolean
  lineNames: string[]
  /** 多输出脚本:每条输出的形态(缺省 line) */
  lineShapes: Record<string, FormulaShape>
  /** 多输出脚本:band 输出的下轨公式 */
  lineLower: Record<string, string>
  /** 多输出脚本:baseline 输出的基准值 */
  lineBase: Record<string, string>
  /** 多输出脚本:每条输出的显示名(缺省 = 名称大写) */
  lineLabels: Record<string, string>
  /** 多输出脚本:每条输出的 Y 轴(主轴/独立轴) */
  lineScales: Record<string, 'right' | 'independent'>
  /** 多输出脚本:每条输出的可见性(缺省 true) */
  lineVisible: Record<string, boolean>
  entry?: CustomIndicatorConfigEntry
}

/** 校验并构造公式记录 + 实例配置;任何校验失败抛 Error(message) */
export function buildFormulaCommit(a: FormulaCommitArgs): { rec: UserFormulaRecord; entryNext: CustomIndicatorConfigEntry } {
  if (!a.title.trim()) throw new Error('请输入指标名称')
  if (!a.formula.trim()) throw new Error('请输入公式')
  let allStmts: FormulaStatement[] = []
  try {
    allStmts = parseFormulaScript(a.formula)
  } catch (e) {
    throw new Error(`公式错误:${e instanceof Error ? e.message : String(e)}`)
  }
  const hasStick = allStmts.some((s) => s.kind === 'stick')
  if (a.scriptMode && a.lineNames.length === 0 && !hasStick) {
    throw new Error('脚本至少需要一条输出(使用 := 定义的名称是私有变量,不渲染)')
  }
  // 行尾样式声明(输出语句;私有变量上的样式声明在 parseFormulaScript 中被静默忽略)
  const inlineByKey = new Map<string, InlineLineStyle | undefined>()
  for (const s of allStmts) if (s.kind !== 'var') inlineByKey.set(s.name, s.style)
  if (!a.scriptMode && a.shape === 'band') {
    if (!a.formula2.trim()) throw new Error('区间形态需要输入下轨公式')
    try {
      parseFormula(a.formula2)
    } catch (e) {
      throw new Error(`下轨公式错误:${e instanceof Error ? e.message : String(e)}`)
    }
  }
  let base: number | undefined
  if (!a.scriptMode && a.shape === 'baseline') {
    base = a.baseValue.trim() === '' ? 0 : Number(a.baseValue)
    if (!Number.isFinite(base)) throw new Error('基准值必须是数字')
  }

  // 多输出脚本:每条输出的形态 + band 下轨(可引用前面变量)/baseline 基准值
  let outputSpecs: Record<string, FormulaOutputSpec> | undefined
  if (a.scriptMode) {
    const scaleId = `${a.recId}_scale`
    outputSpecs = {}
    const defined = new Set(allStmts.map((s) => s.name))
    for (const n of a.lineNames) {
      const shape = a.lineShapes[n] ?? 'line'
      const spec: FormulaOutputSpec = { shape }
      const label = (a.lineLabels[n] ?? '').trim()
      if (label) spec.label = label
      if ((a.lineScales[n] ?? 'right') === 'independent') spec.scale = { kind: 'independent', id: scaleId }
      if (a.lineVisible[n] === false) spec.visible = false
      if (shape === 'band') {
        const lower = (a.lineLower[n] ?? '').trim()
        if (!lower) throw new Error(`输出 ${n.toUpperCase()} 的区间形态需要下轨公式`)
        try {
          parseFormulaExpr(lower, defined)
        } catch (e) {
          throw new Error(`输出 ${n.toUpperCase()} 下轨公式错误:${e instanceof Error ? e.message : String(e)}`)
        }
        spec.lower = lower
      }
      if (shape === 'baseline') {
        const raw = (a.lineBase[n] ?? '').trim()
        if (raw !== '') {
          const b = Number(raw)
          if (!Number.isFinite(b)) throw new Error(`输出 ${n.toUpperCase()} 的基准值必须是数字`)
          spec.baseValue = b
        }
      }
      const st = inlineByKey.get(n)
      if (st?.color) spec.color = st.color
      if (st?.width !== undefined) spec.width = st.width
      if (st?.style !== undefined) spec.style = st.style
      outputSpecs[n] = spec
    }
  } else {
    // 单表达式:行尾样式存入 outputSpecs.main(编辑回显 + def 默认色源)
    const st = inlineByKey.get('main')
    if (st?.color || st?.width !== undefined || st?.style !== undefined) {
      outputSpecs = {
        main: {
          shape: a.shape,
          ...(st.color ? { color: st.color } : {}),
          ...(st.width !== undefined ? { width: st.width } : {}),
          ...(st.style !== undefined ? { style: st.style } : {}),
        },
      }
    }
  }

  const scales: Record<string, CustomScale> = {}
  a.lineNames.forEach((n) => {
    scales[n] = (a.lineScales[n] ?? 'right') === 'right' ? { kind: 'right' } : { kind: 'independent', id: `${a.recId}_scale` }
  })
  const firstColor = a.lineNames.length > 0 ? inlineByKey.get(a.lineNames[0])?.color : undefined
  const rec: UserFormulaRecord = {
    id: a.recId,
    title: a.title.trim(),
    shape: a.scriptMode ? 'line' : a.shape,
    formula: a.formula.trim(),
    ...(!a.scriptMode && a.shape === 'band' ? { formula2: a.formula2.trim() } : {}),
    ...(!a.scriptMode && a.shape === 'baseline' ? { baseValue: base } : {}),
    ...(firstColor ? { color: firstColor } : {}),
    ...(outputSpecs ? { outputSpecs } : {}),
  }
  const entryNext: CustomIndicatorConfigEntry = {
    enabled: a.entry?.enabled ?? true,
    pane: a.pane,
    params: {},
    // 样式唯一来源是行尾声明:清空历史面板覆盖,避免隐藏覆盖残留
    lineStyles: {},
    scales,
    rev: (a.entry?.rev ?? 0) + 1,
  }
  return { rec, entryNext }
}
