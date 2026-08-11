/**
 * 公式指标工厂(非 React):把用户公式编译为 CustomIndicatorDef。
 * 形态子集:line / area / histogram / baseline / band。
 * 构建时 parseFormula 校验并缓存 AST;calc 时在 CalcContext 上求值 → ctx.points。
 * 多输出脚本模式支持每条输出独立选形态(经 outputSpecs),band 下轨可引用脚本变量。
 * `NAME := EXPR` 定义私有中间变量(只计算不渲染,可被后续行/下轨引用)。
 */

import { defineIndicator } from './defineIndicator'
import type { LineStyle, LineWidth } from '../../types'
import {
  evaluateFormula,
  evaluateNode,
  evaluateFormulaScript,
  FormulaError,
  isSticklineNode,
  parseFormula,
  parseFormulaExpr,
  parseFormulaScript,
  toNumArr,
  type FormulaStatement,
} from './formula'
import type { CustomCandlePoint, CustomIndicatorDef, CustomOutput, CustomOutputMeta, CustomScale } from './types'

/** 公式指标输出形态(弹窗可选,对应渲染器支持的形态子集) */
export type FormulaShape = 'line' | 'area' | 'histogram' | 'baseline' | 'band'

/** 形态 → 中文标签(弹窗按钮) */
export const FORMULA_SHAPE_LABEL: Record<FormulaShape, string> = {
  line: '折线',
  area: '面积',
  histogram: '柱状',
  baseline: '基线',
  band: '区间',
}

/** 多输出脚本中单条输出的配置(缺省 shape: 'line' 保持旧行为) */
export interface FormulaOutputSpec {
  shape: FormulaShape
  /** band 下轨公式(可引用前面行的脚本变量) */
  lower?: string
  /** baseline 基准值 */
  baseValue?: number
  /** 显示名(缺省 = 名称大写) */
  label?: string
  /** Y 轴分配(缺省主轴) */
  scale?: CustomScale
  /** 是否显示(缺省 true) */
  visible?: boolean
  /** 行尾声明的线色(面板可覆盖;缺省用调色板) */
  color?: string
  /** 行尾声明的线宽(1-4;仅折线/基线形态生效) */
  width?: LineWidth
  /** 行尾声明的线型(仅折线/基线形态生效) */
  style?: LineStyle
}

export interface FormulaIndicatorSpec {
  id: string
  title: string
  shape: FormulaShape
  /** 主表达式;band 时为上轨 */
  formula: string
  /** band 下轨表达式(单输出模式) */
  formula2?: string
  /** baseline 的 0 轴基准值(单输出模式) */
  baseValue?: number
  /** 默认线色(编辑面板可覆盖) */
  color?: string
  /** 多输出脚本模式:每条输出的形态与附加配置(key = 脚本输出名;缺省全部 line) */
  outputSpecs?: Record<string, FormulaOutputSpec>
}

const DEFAULT_COLOR = '#f0b90b'

/** 多输出脚本各线的默认调色板(按语句顺序取色;用户可在编辑面板按线覆盖) */
export const FORMULA_PALETTE = ['#f0b90b', '#2962ff', '#e91e63', '#00bcd4', '#9c27b0', '#8bc34a']

/** 脚本模式的单条输出配置:缺省 line(兼容无 outputSpecs 的旧记录) */
function specOf(outputSpecs: FormulaIndicatorSpec['outputSpecs'], name: string): FormulaOutputSpec {
  return outputSpecs?.[name] ?? { shape: 'line' }
}

/**
 * 由用户公式构建 CustomIndicatorDef:
 * 构建时解析公式为 AST(校验语法);calc 时求值 → ctx.points()。
 * - 多语句脚本(任一条含 `NAME = EXPR` 或 `NAME := EXPR`,换行/分号分隔)→ `=` 语句为输出、`:=` 语句为私有变量(只计算不渲染)。输出形态由 outputSpecs 决定
 *   (缺省 line;band 需提供 lower 下轨,可引用前面变量;baseline 可提供 baseValue)。
 * - 单表达式(无 `=`)→ 单输出 key 'main',按 shape 渲染 line/area/histogram/baseline/band。
 */
export function defineFormulaIndicator(spec: FormulaIndicatorSpec): CustomIndicatorDef {
  const stmts = parseFormulaScript(spec.formula)
  const isScript = stmts.length > 1 || stmts[0].name !== 'main'

  if (isScript) {
    // 私有变量(NAME := EXPR)只计算不渲染;公共输出 / STICKLINE 竖条至少一条
    const outputStmts = stmts.filter((s) => s.kind === 'output')
    const stickStmts = stmts.filter((s) => s.kind === 'stick')
    if (outputStmts.length === 0 && stickStmts.length === 0) {
      throw new FormulaError('脚本至少需要一条输出(使用 := 定义的名称是私有变量,不渲染)')
    }
    // 脚本变量集合含私有变量:band 下轨 / 后续输出均可引用(引用未定义变量在构建期报错)
    const defined = new Set(stmts.map((s) => s.name))
    const lowerAsts = new Map<string, FormulaStatement>()
    for (const s of outputStmts) {
      const os = specOf(spec.outputSpecs, s.name)
      if (os.shape === 'band' && os.lower?.trim()) {
        lowerAsts.set(s.name, parseFormulaExpr(os.lower, defined))
      }
    }

    const outputs: CustomOutputMeta[] = [
      ...outputStmts.map((s, i) => {
        const os = specOf(spec.outputSpecs, s.name)
        const meta: CustomOutputMeta = {
          key: s.name,
          label: os.label ?? s.name.toUpperCase(),
          type: os.shape,
          color: os.color ?? FORMULA_PALETTE[i % FORMULA_PALETTE.length],
          width: os.width,
          style: os.style,
          scale: os.scale,
          visible: os.visible,
        }
        return meta
      }),
      // STICKLINE 裸语句 → bar 竖条输出(open/close = 起始/结束价;面板不可编辑,样式走行尾声明)
      ...stickStmts.map((s, i) => {
        const meta: CustomOutputMeta = {
          key: s.name,
          label: s.name.toUpperCase(),
          type: 'bar',
          color: s.style?.color ?? FORMULA_PALETTE[i % FORMULA_PALETTE.length],
        }
        return meta
      }),
    ]
    const calc: CustomIndicatorDef['calc'] = (ctx): CustomOutput[] => {
      // 全部语句(含私有)顺序求值,私有变量进入 vars 供后续引用
      const vars = evaluateFormulaScript(stmts, ctx)
      const out: CustomOutput[] = []
      for (const s of outputStmts) {
        const os = specOf(spec.outputSpecs, s.name)
        const lineColor = os.color ?? FORMULA_PALETTE[outputStmts.indexOf(s) % FORMULA_PALETTE.length]
        const data = ctx.points(toNumArr(vars[s.name], ctx))
        switch (os.shape) {
          case 'area':
            out.push({ type: 'area', key: s.name, label: s.name.toUpperCase(), color: lineColor, data })
            break
          case 'histogram':
            out.push({ type: 'histogram', key: s.name, label: s.name.toUpperCase(), color: lineColor, data })
            break
          case 'baseline':
            out.push({ type: 'baseline', key: s.name, label: s.name.toUpperCase(), baseValue: os.baseValue ?? 0, data })
            break
          case 'band': {
            const lower = lowerAsts.get(s.name)
            out.push({
              type: 'band',
              key: s.name,
              label: s.name.toUpperCase(),
              upperColor: lineColor,
              lowerColor: lineColor,
              opacity: 0.15,
              upper: data,
              lower: lower ? ctx.points(evaluateFormula(lower.ast, ctx, vars)) : data,
            })
            break
          }
          default:
            out.push({ type: 'line', key: s.name, label: s.name.toUpperCase(), color: lineColor, data })
        }
      }
      // STICKLINE(cond, p1, p2, width, empty):cond 为真处绘制 p1→p2 竖条
      for (const s of stickStmts) {
        if (!isSticklineNode(s.ast)) continue
        const cond = toNumArr(evaluateNode(s.ast.args[0], ctx, vars), ctx)
        const from = toNumArr(evaluateNode(s.ast.args[1], ctx, vars), ctx)
        const to = toNumArr(evaluateNode(s.ast.args[2], ctx, vars), ctx)
        const color = s.style?.color ?? FORMULA_PALETTE[stickStmts.indexOf(s) % FORMULA_PALETTE.length]
        const data: CustomCandlePoint[] = []
        for (let i = 0; i < ctx.bars.length; i++) {
          const c = cond[i]
          const f = from[i]
          const t = to[i]
          if (c === null || c === 0 || f === null || t === null) continue
          data.push({ time: ctx.bars[i].time, open: f, close: t, high: Math.max(f, t), low: Math.min(f, t) })
        }
        out.push({ type: 'bar', key: s.name, label: s.name.toUpperCase(), color, data })
      }
      return out
    }
    return defineIndicator({
      id: spec.id,
      title: spec.title,
      description: `公式脚本:\n${stmts
        .map((s) => (s.kind === 'stick' ? s.exprText : `${s.name} = ${s.exprText}`))
        .join('\n')}`,
      defaultPane: 'overlay',
      outputs,
      calc,
    })
  }

  // 单表达式路径
  const upperAst = stmts[0].ast
  const lowerAst = spec.shape === 'band' ? parseFormula(spec.formula2 ?? '') : null
  const mainOs = specOf(spec.outputSpecs, 'main')
  const color = mainOs.color ?? spec.color ?? DEFAULT_COLOR

  const calc: CustomIndicatorDef['calc'] = (ctx): CustomOutput[] => {
    const upper = ctx.points(evaluateFormula(upperAst, ctx))
    if (spec.shape === 'band' && lowerAst) {
      return [
        {
          type: 'band',
          key: 'main',
          label: spec.title,
          upperColor: color,
          lowerColor: color,
          opacity: 0.15,
          upper,
          lower: ctx.points(evaluateFormula(lowerAst, ctx)),
        },
      ]
    }
    switch (spec.shape) {
      case 'line':
        return [{ type: 'line', key: 'main', label: spec.title, color, data: upper }]
      case 'area':
        return [{ type: 'area', key: 'main', label: spec.title, color, data: upper }]
      case 'histogram':
        return [{ type: 'histogram', key: 'main', label: spec.title, color, data: upper }]
      case 'baseline':
        return [{ type: 'baseline', key: 'main', label: spec.title, baseValue: spec.baseValue ?? 0, data: upper }]
    }
    return []
  }

  return defineIndicator({
    id: spec.id,
    title: spec.title,
    description: `公式:${spec.formula}${spec.shape === 'band' ? `  下轨:${spec.formula2 ?? ''}` : ''}`,
    defaultPane: 'overlay',
    outputs: [{ key: 'main', label: spec.title, type: spec.shape, color, width: mainOs.width, style: mainOs.style }],
    calc,
  })
}
