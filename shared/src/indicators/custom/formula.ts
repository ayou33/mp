/**
 * 自定义指标公式 DSL(非 React):用户在弹窗中直接输入表达式。
 * 流程:tokenize → 递归下降解析为 AST(parseFormula 校验语法)→ 在 CalcContext 上求值为 NumArr
 * (长度对齐 bars)→ 经 ctx.points() 转为 IndicatorPoint[]。
 *
 * 字段(大小写不敏感):CLOSE / OPEN / HIGH / LOW / VOLUME,支持简写 C / O / H / L / V
 * 值级函数(输入/输出均为 (number|null)[];数字常量自动广播为与 bars 等长的数组):
 *   SMA(v,n) / MA(v,n) / EMA(v,n) / STDDEV(v,n) / SUM(v,n) / HHV(v,n) / LLV(v,n) / WILDER(v,n) / REF(v,n)
 *   ABS(v) / MAX(a,b) / MIN(a,b) / CROSSOVER(a,b) / CROSSUNDER(a,b)
 * 运算符:+ - * / ( ) 、函数嵌套;除零与无效点输出 null(渲染时跳过)。
 * 指标成员引用:KDJ().K/.D/.J、MACD().DIF/.DEA/.MACD、BOLL().MID/.UPPER/.LOWER、DMI().PDI/.MDI/.ADX/.ADXR,
 *   RSI()/CCI()/ATR()/OBV()/BBI() 单输出直接返回;参数缺省按默认补齐(如 KDJ(9) 只给第一参)。
 * 语法错误在 parseFormula 阶段抛出 FormulaError(带出错位置),供弹窗实时校验。
 *
 * 多语句脚本(多输出):每条 `NAME = EXPR`(换行或 `;` 分隔)定义一条输出线;`NAME := EXPR`
 * 定义私有中间变量(只参与计算、可被后续行引用,不渲染)。EXPR 可引用前面已定义的 NAME
 *   DIF = EMA(CLOSE,12) - EMA(CLOSE,26)
 *   DEA = EMA(DIF,9)
 *   MACD = (DIF - DEA) * 2
 * 用 parseFormulaScript 解析、evaluateFormulaScript 求值(返回 输出名 → NumArr)。
 */

import type { NumArr } from './lib'
import type { CalcContext } from './types'
import type { IndicatorPoint } from '../../types'
import { LineStyle, type LineWidth } from '../../types'
import { calcKDJ } from '../kdj'
import { calcMACD } from '../macd'
import { calcBOLL } from '../boll'
import { calcDMI } from '../dmi'
import { calcRSI } from '../rsi'
import { calcCCI } from '../cci'
import { calcOBV } from '../obv'
import { calcATR } from '../atr'
import { BBI_PERIODS, calcBBI } from '../bbi'

/** 公式语法错误:message + 出错字符位置 */
export class FormulaError extends Error {
  readonly pos: number
  constructor(message: string, pos = -1) {
    super(message)
    this.name = 'FormulaError'
    this.pos = pos
  }
}

const FIELD_NAMES = ['close', 'open', 'high', 'low', 'volume'] as const
type FieldName = (typeof FIELD_NAMES)[number]
/** 字段简写别名(C/O/H/L/V → 收盘/开盘/最高/最低/成交量) */
const FIELD_ALIASES: Record<string, FieldName> = { c: 'close', o: 'open', h: 'high', l: 'low', v: 'volume' }

/** 公式值:序列或标量(常量自动广播;脚本变量保留原始标量语义) */
export type FormulaValue = NumArr | number

/** 函数名(小写) → CalcContext 上的实现;MA 是 SMA 的别名 */
const FN_IMPL: Record<string, keyof CalcContext> = {
  sma: 'sma',
  ma: 'sma',
  ema: 'ema',
  stddev: 'stddev',
  sum: 'sum',
  hhv: 'hhv',
  llv: 'llv',
  wilder: 'wilder',
  ref: 'ref',
  refx: 'refx',
  barscount: 'barsCount',
  abs: 'abs',
  max: 'max',
  min: 'min',
  crossover: 'crossOver',
  crossunder: 'crossUnder',
}

/** 各函数参数个数下限/上限 */
const FN_ARITY: Record<string, [number, number]> = {
  sma: [2, 2],
  ma: [2, 2],
  ema: [2, 2],
  stddev: [2, 2],
  sum: [2, 2],
  hhv: [2, 2],
  llv: [2, 2],
  wilder: [2, 2],
  ref: [2, 2],
  refx: [2, 2],
  barscount: [1, 1],
  abs: [1, 1],
  max: [2, 2],
  min: [2, 2],
  crossover: [2, 2],
  crossunder: [2, 2],
  if: [3, 3],
  stickline: [5, 5],
}

/** 首参必须广播为数组的函数(窗口/逐元素序列函数;标量传参无意义) */
const ARRAYIFY_FIRST = new Set(['sma', 'ma', 'ema', 'stddev', 'sum', 'hhv', 'llv', 'wilder', 'ref', 'refx', 'barscount', 'abs'])

/** 内置指标引用:支持 `名称(参数).成员` / `名称().成员` / `名称.成员`(成员大小写不敏感) */
interface IndicatorRef {
  /** 默认参数(缺省按位从左补齐;listParam 时空参用整体默认) */
  defaults: number[]
  /** 输出成员名(小写);单输出指标 members = [自身名] */
  members: string[]
  /** 参数是"周期列表"语义(BBI):给出任意个参数即整体作为列表,空参用 defaults */
  listParam?: boolean
  calc: (ctx: CalcContext, args: number[]) => Record<string, IndicatorPoint[]>
}

const INDICATOR_REFS: Record<string, IndicatorRef> = {
  kdj: {
    defaults: [9, 3, 3],
    members: ['k', 'd', 'j'],
    calc: (ctx, args) => { const r = calcKDJ(ctx.bars, args[0], args[1], args[2]); return { k: r.k, d: r.d, j: r.j } },
  },
  macd: {
    defaults: [12, 26, 9],
    members: ['dif', 'dea', 'macd'],
    calc: (ctx, args) => {
      const r = calcMACD(ctx.bars, args[0], args[1], args[2])
      return { dif: r.dif, dea: r.dea, macd: r.macd }
    },
  },
  boll: {
    defaults: [20, 2],
    members: ['mid', 'upper', 'lower'],
    calc: (ctx, args) => { const r = calcBOLL(ctx.bars, args[0], args[1]); return { mid: r.mid, upper: r.upper, lower: r.lower } },
  },
  dmi: {
    defaults: [14],
    members: ['pdi', 'mdi', 'adx', 'adxr'],
    calc: (ctx, args) => { const r = calcDMI(ctx.bars, args[0]); return { pdi: r.pdi, mdi: r.mdi, adx: r.adx, adxr: r.adxr } },
  },
  rsi: {
    defaults: [14],
    members: ['rsi'],
    calc: (ctx, args) => ({ rsi: calcRSI(ctx.bars, args[0]) }),
  },
  cci: {
    defaults: [14],
    members: ['cci'],
    calc: (ctx, args) => ({ cci: calcCCI(ctx.bars, args[0]) }),
  },
  atr: {
    defaults: [14],
    members: ['atr'],
    calc: (ctx, args) => ({ atr: calcATR(ctx.bars, args[0]) }),
  },
  obv: {
    defaults: [],
    members: ['obv'],
    calc: (ctx) => ({ obv: calcOBV(ctx.bars) }),
  },
  bbi: {
    defaults: BBI_PERIODS,
    members: ['bbi'],
    listParam: true,
    calc: (ctx, args) => ({ bbi: calcBBI(ctx.bars, args) }),
  },
}

/** 解析指标实参:listParam(BBI) 空参用整体默认;否则缺省按位从左补齐 */
function resolveIndicatorArgs(ref: IndicatorRef, args: number[]): number[] {
  if (ref.listParam) return args.length > 0 ? args : [...ref.defaults]
  return args.length >= ref.defaults.length ? args : [...args, ...ref.defaults.slice(args.length)]
}

/** IndicatorPoint[] → 与 bars 等长的 NumArr(按时间定位;null = 无效点) */
function pointsToNumArr(ctx: CalcContext, pts: IndicatorPoint[]): NumArr {
  const out: NumArr = new Array(ctx.bars.length).fill(null)
  if (pts.length === 0) return out
  const idxByTime = new Map<string, number>()
  for (let i = 0; i < ctx.bars.length; i++) idxByTime.set(ctx.bars[i].time, i)
  for (const p of pts) {
    const i = idxByTime.get(p.time)
    if (i !== undefined) out[i] = p.value
  }
  return out
}

/** 文档用的字段/函数清单(弹窗帮助文案) */
export const FORMULA_FIELDS = ['CLOSE(C)', 'OPEN(O)', 'HIGH(H)', 'LOW(L)', 'VOLUME(V)']
export const FORMULA_FUNCS = [
  'SMA', 'MA', 'EMA', 'STDDEV', 'SUM', 'HHV', 'LLV', 'WILDER', 'REF', 'REFX', 'BARSCOUNT',
  'ABS', 'MAX', 'MIN', 'CROSSOVER', 'CROSSUNDER',
  'IF',
]

/** 算术运算符 */
type ArithOp = '+' | '-' | '*' | '/'
/** 比较运算符(TDX 风格,`=` 为相等、`<>` 为不等) */
type CmpOp = '>' | '>=' | '<' | '<=' | '=' | '<>'
/** 逻辑运算符(AND / OR) */
type LogicOp = 'and' | 'or'

/** AST 节点 */
type Node =
  | { type: 'num'; value: number }
  | { type: 'field'; name: FieldName }
  | { type: 'id'; name: string }
  | { type: 'bin'; op: ArithOp | CmpOp | LogicOp; left: Node; right: Node }
  | { type: 'neg'; operand: Node }
  | { type: 'not'; operand: Node }
  | { type: 'call'; name: string; args: Node[] }
  | { type: 'indicator'; name: string; args: Node[]; member: string }

type Token =
  | { type: 'num'; value: number; pos: number }
  | { type: 'id'; name: string; pos: number }
  | { type: 'op'; op: string; pos: number }

const COMPARE_OPS = new Set<CmpOp>(['>', '>=', '<', '<=', '=', '<>'])

function tokenize(source: string): Token[] {
  const toks: Token[] = []
  let i = 0
  const n = source.length
  const isDigit = (c: string): boolean => c >= '0' && c <= '9'
  while (i < n) {
    const c = source[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (isDigit(c) || (c === '.' && i + 1 < n && isDigit(source[i + 1]))) {
      let j = i
      while (j < n && (isDigit(source[j]) || source[j] === '.')) j++
      const raw = source.slice(i, j)
      if (raw.split('.').length > 2) throw new FormulaError('数字格式错误', i)
      const value = Number(raw)
      if (Number.isNaN(value)) throw new FormulaError('数字格式错误', i)
      toks.push({ type: 'num', value, pos: i })
      i = j
      continue
    }
    if (/[\p{L}_]/u.test(c)) {
      let j = i
      while (j < n && /[\p{L}\p{N}_]/u.test(source[j])) j++
      toks.push({ type: 'id', name: source.slice(i, j).toLowerCase(), pos: i })
      i = j
      continue
    }
    if ('+-*/(),.=<>'.includes(c)) {
      // 多字符运算符:>= / <= / <>;'=' 在表达式内为相等比较(顶层赋值在语句切分阶段已剥离)
      let op = c
      const nx = source[i + 1]
      if (c === '>' && nx === '=') {
        op = '>='
        i++
      } else if (c === '<' && nx === '=') {
        op = '<='
        i++
      } else if (c === '<' && nx === '>') {
        op = '<>'
        i++
      }
      toks.push({ type: 'op', op, pos: i })
      i++
      continue
    }
    throw new FormulaError(`无法识别的字符 '${c}'`, i)
  }
  return toks
}

/** 递归下降解析器:优先级 表达式(+/-) > 项(*、/) > 一元(+/-) > 后缀(字面量/字段/函数调用) */
class Parser {
  private pos = 0
  constructor(
    private readonly toks: Token[],
    /** 允许未知名称为变量引用(多语句脚本模式;单表达式模式保持严格) */
    private readonly allowVars = false,
  ) {}

  parse(): Node {
    if (this.toks.length === 0) throw new FormulaError('公式为空')
    const node = this.parseExpr()
    if (this.pos < this.toks.length) {
      const t = this.toks[this.pos]
      const shown = t.type === 'op' ? t.op : t.type === 'id' ? t.name : String(t.value)
      throw new FormulaError(`存在多余内容 '${shown}'`, t.pos)
    }
    return node
  }

  private peek(): Token | undefined {
    return this.toks[this.pos]
  }

  private next(): Token {
    const t = this.toks[this.pos]
    if (!t) throw new FormulaError('公式不完整')
    this.pos++
    return t
  }

  private parseExpr(): Node {
    let left = this.parseAnd()
    for (;;) {
      const t = this.peek()
      if (t?.type === 'id' && t.name === 'or') {
        this.next()
        left = { type: 'bin', op: 'or', left, right: this.parseAnd() }
      } else return left
    }
  }

  private parseAnd(): Node {
    let left = this.parseNot()
    for (;;) {
      const t = this.peek()
      if (t?.type === 'id' && t.name === 'and') {
        this.next()
        left = { type: 'bin', op: 'and', left, right: this.parseNot() }
      } else return left
    }
  }

  private parseNot(): Node {
    const t = this.peek()
    if (t?.type === 'id' && t.name === 'not') {
      this.next()
      return { type: 'not', operand: this.parseNot() }
    }
    return this.parseCompare()
  }

  private parseCompare(): Node {
    const left = this.parseArith()
    const t = this.peek()
    if (t?.type === 'op' && COMPARE_OPS.has(t.op as CmpOp)) {
      this.next()
      return { type: 'bin', op: t.op as CmpOp, left, right: this.parseArith() }
    }
    return left
  }

  /** 算术(+-) */
  private parseArith(): Node {
    let left = this.parseTerm()
    for (;;) {
      const t = this.peek()
      if (t?.type === 'op' && (t.op === '+' || t.op === '-')) {
        this.next()
        left = { type: 'bin', op: t.op, left, right: this.parseTerm() }
      } else return left
    }
  }

  private parseTerm(): Node {
    let left = this.parseUnary()
    for (;;) {
      const t = this.peek()
      if (t?.type === 'op' && (t.op === '*' || t.op === '/')) {
        this.next()
        left = { type: 'bin', op: t.op, left, right: this.parseUnary() }
      } else return left
    }
  }

  private parseUnary(): Node {
    const t = this.peek()
    if (t?.type === 'op' && (t.op === '-' || t.op === '+')) {
      this.next()
      const operand = this.parseUnary()
      return t.op === '-' ? { type: 'neg', operand } : operand
    }
    return this.parsePostfix()
  }

  private parsePostfix(): Node {
    const t = this.next()
    if (t.type === 'num') return { type: 'num', value: t.value }
    if (t.type === 'op' && t.op === '(') {
      // 括号分组
      const inner = this.parseExpr()
      const close = this.next()
      if (close.type !== 'op' || close.op !== ')') throw new FormulaError("期望 ')'", close.pos)
      return inner
    }
    if (t.type === 'id') {
      const nt = this.peek()
      if (nt?.type === 'op' && nt.op === '(') {
        this.next() // consume (
        const args: Node[] = []
        const first = this.peek()
        if (first?.type === 'op' && first.op === ')') {
          this.next() // 空参数:直接吃 )
        } else {
          for (;;) {
            args.push(this.parseExpr())
            const sep = this.next()
            if (sep.type !== 'op') throw new FormulaError('函数参数语法错误', sep.pos)
            if (sep.op === ')') break
            if (sep.op !== ',') throw new FormulaError(`期望 ')' 或 ','`, sep.pos)
          }
        }
        // 指标成员引用:NAME(...).MEMBER
        const dot = this.peek()
        if (dot?.type === 'op' && dot.op === '.') {
          this.next()
          const m = this.next()
          if (m.type !== 'id') throw new FormulaError('成员名错误', m.pos)
          return this.indicatorNode(t.name, args, m.name, t.pos)
        }
        const ref = INDICATOR_REFS[t.name]
        if (ref) {
          if (ref.members.length !== 1) {
            throw new FormulaError(
              `指标 ${t.name.toUpperCase()} 需要成员引用(.${ref.members.map((m) => m.toUpperCase()).join('/')})`,
              t.pos,
            )
          }
          // 单输出指标:NAME() 直接返回该线
          return this.indicatorNode(t.name, args, ref.members[0], t.pos)
        }
        const arity = FN_ARITY[t.name]
        if (!arity) throw new FormulaError(`未知函数 ${t.name.toUpperCase()}`, t.pos)
        if (args.length < arity[0] || args.length > arity[1]) {
          throw new FormulaError(
            `函数 ${t.name.toUpperCase()} 需要 ${arity[0] === arity[1] ? String(arity[0]) : `${arity[0]}~${arity[1]}`} 个参数`,
            t.pos,
          )
        }
        return { type: 'call', name: t.name, args }
      }
      // 指标成员引用:NAME.MEMBER
      if (nt?.type === 'op' && nt.op === '.') {
        this.next()
        const m = this.next()
        if (m.type !== 'id') throw new FormulaError('成员名错误', m.pos)
        return this.indicatorNode(t.name, [], m.name, t.pos)
      }
      if (INDICATOR_REFS[t.name]) {
        throw new FormulaError(`指标 ${t.name.toUpperCase()} 需要 () 或 .成员 引用`, t.pos)
      }
      const fieldName = FIELD_NAMES.includes(t.name as FieldName)
        ? (t.name as FieldName)
        : FIELD_ALIASES[t.name]
      if (!fieldName) {
        if (this.allowVars) return { type: 'id', name: t.name }
        throw new FormulaError(`未知字段 ${t.name.toUpperCase()}`, t.pos)
      }
      return { type: 'field', name: fieldName }
    }
    throw new FormulaError('语法错误', t.pos)
  }

  /** 构造指标成员引用节点(校验指标名与成员合法) */
  private indicatorNode(name: string, args: Node[], member: string, pos: number): Node {
    const ref = INDICATOR_REFS[name]
    if (!ref) throw new FormulaError(`未知指标 ${name.toUpperCase()}`, pos)
    if (!ref.members.includes(member)) {
      throw new FormulaError(
        `指标 ${name.toUpperCase()} 成员必须是 ${ref.members.map((m) => `.${m.toUpperCase()}`).join('/')}`,
        pos,
      )
    }
    return { type: 'indicator', name, args, member }
  }
}

/**
 * 解析公式字符串 → AST;语法/函数名/字段名/参数个数错误在此抛出(带位置)。
 * 弹窗保存前用它实时校验;defineFormulaIndicator 构建 def 时也会编译。
 */
export function parseFormula(source: string): Node {
  return new Parser(tokenize(stripComments(source))).parse()
}

/** 去除 TDX 注释:`{...}` 块注释(支持嵌套)与 `//` 行注释 */
function stripComments(source: string): string {
  let out = ''
  let braceDepth = 0
  let i = 0
  const n = source.length
  while (i < n) {
    const c = source[i]
    if (braceDepth > 0) {
      if (c === '{') braceDepth++
      else if (c === '}') braceDepth--
      i++
      continue
    }
    if (c === '{') {
      braceDepth = 1
      i++
      continue
    }
    if (c === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') i++
      continue
    }
    out += c
    i++
  }
  return out
}

/** 多语句脚本中的一条赋值语句:NAME = EXPR(输出)或 NAME := EXPR(私有变量) */
export interface FormulaStatement {
  /** 名称(小写;'main' = 无名称的单表达式) */
  name: string
  /** output = 渲染为输出线;var = 私有中间变量(只计算不渲染);stick = STICKLINE 竖条裸语句 */
  kind: 'output' | 'var' | 'stick'
  exprText: string
  ast: Node
  /** 行尾样式声明(通达信风格):`NAME = EXPR, COLORRED, DASH, WIDTH2` */
  style?: InlineLineStyle
}

/** 变量名:Unicode 字母/下划线开头,后可接字母/数字/下划线(支持中文名) */
const VAR_NAME_RE = /^[\p{L}_][\p{L}\p{N}_]*$/u
/** 不能用作输出名的保留字:字段名 + 函数名 + 逻辑/条件关键字 */
const RESERVED_NAMES = new Set<string>([
  ...FIELD_NAMES,
  ...Object.keys(FIELD_ALIASES),
  ...Object.keys(FN_ARITY),
  ...Object.keys(INDICATOR_REFS),
  'and',
  'or',
  'not',
  'if',
  'stickline',
])

/** 行尾样式声明解析结果(任一字段可选,缺省用调色板/面板覆盖) */
export interface InlineLineStyle {
  color?: string
  width?: LineWidth
  style?: LineStyle
}

/** 命名线色(与渲染层调色板一致,深色背景友好);如需精确色用 COLORRRGGBB(8 位 COLORRRGGBBAA 带透明度) */
const NAMED_COLORS: Record<string, string> = {
  red: '#f23645',
  green: '#089981',
  blue: '#2962ff',
  yellow: '#f0b90b',
  white: '#ffffff',
  magenta: '#e91e63',
  cyan: '#00bcd4',
  purple: '#9c27b0',
  gray: '#9e9e9e',
}

/** 线型关键字(大小写不敏感;DASHED / DOTTED 为别名) */
const LINE_STYLE_TOKENS: Record<string, LineStyle> = {
  solid: LineStyle.Solid,
  dash: LineStyle.Dashed,
  dashed: LineStyle.Dashed,
  dot: LineStyle.Dotted,
  dotted: LineStyle.Dotted,
}

const WIDTH_RE = /^width([1-4])$/
const WIDTH_ANY_RE = /^width(\d+)$/

/** 解析行尾样式声明(逗号分隔关键字);未知 / 重复关键字抛 FormulaError */
function parseInlineStyles(tail: string, pos: number): InlineLineStyle {
  const out: InlineLineStyle = {}
  for (const raw of tail.split(',')) {
    const tok = raw.trim()
    if (!tok) throw new FormulaError('样式声明不能为空', pos)
    const key = tok.toLowerCase()
    const at = pos + tail.indexOf(raw)
    if (key.startsWith('color')) {
      if (out.color !== undefined) throw new FormulaError(`线色重复声明 '${tok}'`, at)
      const name = key.slice('color'.length)
      if (name.length === 6 && /^[0-9a-f]{6}$/.test(name)) {
        // COLORRRGGBB:按 RGB 顺序(与 CSS 一致),如 COLORFF5500 = #ff5500
        out.color = `#${name}`
      } else if (name.length === 8 && /^[0-9a-f]{8}$/.test(name)) {
        // COLORRRGGBBAA:后两位为 alpha(与 CSS 8 位 hex 一致),如 COLORFF550080 = 50% 透明
        out.color = `#${name}`
      } else {
        const hex = NAMED_COLORS[name]
        if (!hex) throw new FormulaError(`未知颜色 '${tok}'`, at)
        out.color = hex
      }
      continue
    }
    const w = key.match(WIDTH_RE)
    if (w) {
      if (out.width !== undefined) throw new FormulaError(`线宽重复声明 '${tok}'`, at)
      out.width = Number(w[1]) as LineWidth
      continue
    }
    if (WIDTH_ANY_RE.test(key)) throw new FormulaError(`线宽超出范围 1-4:'${tok}'`, at)
    const st = LINE_STYLE_TOKENS[key]
    if (st !== undefined) {
      if (out.style !== undefined) throw new FormulaError(`线型重复声明 '${tok}'`, at)
      out.style = st
      continue
    }
    throw new FormulaError(`未知的样式关键字 '${tok}'`, at)
  }
  return out
}

/** 切分表达式与行尾样式:`expr, COLORRED, DASH` → { expr, tail };以顶层(括号外)第一个逗号为界 */
function splitInlineTail(expr: string): { expr: string; tail: string | null } {
  let depth = 0
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (depth === 0 && c === ',') {
      const left = expr.slice(0, i).trim()
      if (!left) throw new FormulaError('公式为空')
      return { expr: left, tail: expr.slice(i + 1).trim() || null }
    }
  }
  return { expr: expr.trim(), tail: null }
}

/**
 * 解析多语句公式脚本(弹窗主公式):
 * 每条语句 `NAME = EXPR` 或 `NAME:EXPR`(TDX 单冒号输出)(换行或 `;` 分隔)定义一个输出线,
 * `NAME := EXPR` 定义私有中间变量;裸 `STICKLINE(...)` 语句定义竖条输出(自动命名 stickN)。
 * 无赋值符的单表达式 → 单语句 name='main'(走单输出形态路径)。
 * 错误:公式为空 / 无效或重复或保留字输出名 / 赋值后出现非 STICKLINE 裸表达式 / 引用未定义变量。
 */
export function parseFormulaScript(source: string): FormulaStatement[] {
  const lines = stripComments(source)
    .split(/[;\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) throw new FormulaError('公式为空')

  const hasAssign = lines.some((l) => findTopLevelAssign(l) !== null)
  const stmts: FormulaStatement[] = []
  const defined = new Set<string>()
  let stickSeq = 0

  for (const line of lines) {
    const assign = findTopLevelAssign(line)
    if (assign) {
      const name = line.slice(0, assign.idx).trim().toLowerCase()
      const expr = line.slice(assign.idx + (assign.isVar ? 2 : 1)).trim()
      const kind = assign.isVar ? 'var' : 'output'
      if (!VAR_NAME_RE.test(name)) throw new FormulaError(`无效的名称 '${name.toUpperCase()}'`)
      if (RESERVED_NAMES.has(name)) throw new FormulaError(`名称不能是保留字 '${name.toUpperCase()}'`)
      if (defined.has(name)) throw new FormulaError(`名称重复 '${name.toUpperCase()}'`)
      defined.add(name)
      if (!expr) throw new FormulaError('公式为空')
      // 行尾样式声明:`NAME = EXPR, COLORRED, DASH, WIDTH2`(表达式后的顶层逗号即样式段起点)
      const { expr: exprPart, tail } = splitInlineTail(expr)
      // 样式仅输出语句支持;私有变量(:=)不渲染,其上的样式声明静默忽略(不解析、不报错)
      let style: InlineLineStyle | undefined
      if (tail && kind === 'output') {
        style = parseInlineStyles(tail, line.indexOf(expr) + expr.length - tail.length)
      }
      const ast = new Parser(tokenize(exprPart), true).parse()
      if (kind === 'output' && isSticklineNode(ast)) {
        throw new FormulaError('STICKLINE 只能作为独立裸语句(不带 NAME = / :)')
      }
      stmts.push({ name, exprText: expr, ast, kind, style })
    } else {
      // 裸语句:STICKLINE(...) 为竖条输出;无赋值脚本中的单个裸表达式为主输出
      const { expr: exprPart, tail } = splitInlineTail(line)
      let style: InlineLineStyle | undefined
      if (tail) style = parseInlineStyles(tail, exprPart.length + 1)
      const ast = new Parser(tokenize(exprPart), true).parse()
      if (isSticklineNode(ast)) {
        if (ast.args.length !== 5) {
          throw new FormulaError('STICKLINE 需要 5 个参数:条件, 起始价, 结束价, 线宽, 空心标志')
        }
        for (const extra of ast.args.slice(3)) {
          if (extra.type !== 'num') throw new FormulaError('STICKLINE 第 4/5 参数必须是常量数字')
        }
        const stickName = `stick${stickSeq + 1}`
        stickSeq++
        defined.add(stickName)
        stmts.push({ name: stickName, exprText: line, ast, kind: 'stick', style })
      } else {
        if (hasAssign) throw new FormulaError('赋值语句后只能出现 STICKLINE 裸语句')
        stmts.push({ name: 'main', exprText: line, ast, kind: 'output', style })
      }
    }
  }

  // 变量引用必须已定义(forward-ref 报错)
  for (const s of stmts) {
    for (const id of collectIds(s.ast)) {
      if (!defined.has(id)) throw new FormulaError(`未知变量 ${id.toUpperCase()}`)
    }
  }
  return stmts
}

/**
 * 解析单个表达式(允许引用未定义的变量名,供多输出脚本中 band 下轨引用前面行的变量)。
 * 提供 defined 集合时校验引用必须已定义(与 parseFormulaScript 的变量规则一致)。
 * 返回单条 FormulaStatement(name 固定 'main')。
 */
export function parseFormulaExpr(source: string, defined?: Set<string>): FormulaStatement {
  const expr = stripComments(source).trim()
  if (!expr) throw new FormulaError('公式为空')
  const ast = new Parser(tokenize(expr), true).parse()
  if (defined) {
    for (const id of collectIds(ast)) {
      if (!defined.has(id)) throw new FormulaError(`未知变量 ${id.toUpperCase()}`)
    }
  }
  return { name: 'main', exprText: expr, ast, kind: 'output' }
}

/** 判断解析结果是否为 STICKLINE 调用 */
export function isSticklineNode(node: Node): node is { type: 'call'; name: 'stickline'; args: Node[] } {
  return node.type === 'call' && node.name === 'stickline'
}
/** 在字符串中找第 0 层(不在括号内)的赋值符:':='(变量)、'=' 或单冒号(输出);找不到返回 null */
function findTopLevelAssign(s: string): { idx: number; isVar: boolean } | null {
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (depth === 0 && c === ':') {
      // := 私有变量;单冒号 NAME:EXPR 为 TDX 输出写法(等价 NAME = EXPR)
      return { idx: i, isVar: s[i + 1] === '=' }
    } else if (depth === 0 && c === '=') {
      return { idx: i, isVar: false }
    }
  }
  return null
}

/** 收集 AST 中的变量引用名(去重保序) */
function collectIds(node: Node): string[] {
  const out: string[] = []
  const walk = (n: Node): void => {
    switch (n.type) {
      case 'id':
        out.push(n.name)
        break
      case 'bin':
        walk(n.left)
        walk(n.right)
        break
      case 'neg':
        walk(n.operand)
        break
      case 'not':
        walk(n.operand)
        break
      case 'call':
        n.args.forEach(walk)
        break
      case 'indicator':
        n.args.forEach(walk)
        break
    }
  }
  walk(node)
  return out
}

/** 标量 → 与 bars 等长的全常量数组(脚本变量保留原始标量语义,输出/逐元素运算时再广播) */
export function toNumArr(v: FormulaValue, ctx: CalcContext): NumArr {
  if (typeof v === 'number') return new Array(ctx.bars.length).fill(v)
  return v
}

function applyBin(op: ArithOp | CmpOp | LogicOp, a: number, b: number): number {
  switch (op) {
    case '+':
      return a + b
    case '-':
      return a - b
    case '*':
      return a * b
    case '/':
      return b === 0 ? NaN : a / b
    case '>':
      return a > b ? 1 : 0
    case '>=':
      return a >= b ? 1 : 0
    case '<':
      return a < b ? 1 : 0
    case '<=':
      return a <= b ? 1 : 0
    case '=':
      return a === b ? 1 : 0
    case '<>':
      return a !== b ? 1 : 0
    case 'and':
      return a !== 0 && b !== 0 ? 1 : 0
    case 'or':
      return a !== 0 || b !== 0 ? 1 : 0
    default:
      return NaN
  }
}

/** 逐元素二元运算:数组与数组逐项、标量与数组广播;任一无效点 → null;除零 → null */
function binOp(op: ArithOp | CmpOp | LogicOp, a: FormulaValue, b: FormulaValue): FormulaValue {
  if (typeof a === 'number' && typeof b === 'number') {
    const r = applyBin(op, a, b)
    return Number.isNaN(r) ? 0 : r
  }
  const len = Math.max(typeof a === 'number' ? 0 : a.length, typeof b === 'number' ? 0 : b.length)
  const out: NumArr = new Array(len).fill(null)
  for (let i = 0; i < len; i++) {
    const va = typeof a === 'number' ? a : a[i]
    const vb = typeof b === 'number' ? b : b[i]
    if (va === null || vb === null || !Number.isFinite(va) || !Number.isFinite(vb)) continue
    const r = applyBin(op, va, vb)
    if (!Number.isNaN(r)) out[i] = r
  }
  return out
}

export function evaluateNode(node: Node, ctx: CalcContext, vars?: Record<string, FormulaValue>): FormulaValue {
  switch (node.type) {
    case 'num':
      return node.value
    case 'field':
      return ctx[node.name] as NumArr
    case 'id': {
      const v = vars?.[node.name]
      if (v === undefined) throw new FormulaError(`未知变量 ${node.name.toUpperCase()}`)
      return v
    }
    case 'neg': {
      const v = evaluateNode(node.operand, ctx, vars)
      if (typeof v === 'number') return -v
      const out: NumArr = new Array(v.length)
      for (let i = 0; i < v.length; i++) out[i] = v[i] === null ? null : -(v[i] as number)
      return out
    }
    case 'not': {
      const v = evaluateNode(node.operand, ctx, vars)
      if (typeof v === 'number') return v ? 0 : 1
      const out: NumArr = new Array(v.length)
      for (let i = 0; i < v.length; i++) out[i] = v[i] === null ? null : (v[i] ? 0 : 1)
      return out
    }
    case 'bin': {
      const a = evaluateNode(node.left, ctx, vars)
      const b = evaluateNode(node.right, ctx, vars)
      return binOp(node.op, a, b)
    }
    case 'call': {
      if (node.name === 'if') {
        // IF(cond, a, b):逐元素按条件选择;cond 无效(null)→ 输出无效
        const cond = toNumArr(evaluateNode(node.args[0], ctx, vars), ctx)
        const a = toNumArr(evaluateNode(node.args[1], ctx, vars), ctx)
        const b = toNumArr(evaluateNode(node.args[2], ctx, vars), ctx)
        const len = Math.max(cond.length, a.length, b.length)
        const out: NumArr = new Array(len).fill(null)
        for (let i = 0; i < len; i++) {
          const cv = cond[i]
          if (cv === null) continue
          const av = a[i] ?? null
          const bv = b[i] ?? null
          out[i] = cv ? av : bv
        }
        return out
      }
      const impl = FN_IMPL[node.name] as keyof CalcContext
      if (!impl) throw new FormulaError(`未知函数 ${node.name.toUpperCase()}`)
      const args = node.args.map((a) => evaluateNode(a, ctx, vars))
      const fn = ctx[impl] as unknown as (...a: FormulaValue[]) => NumArr
      if (ARRAYIFY_FIRST.has(node.name)) args[0] = toNumArr(args[0], ctx)
      return fn(...args)
    }
    case 'indicator': {
      const ref = INDICATOR_REFS[node.name]
      if (!ref) throw new FormulaError(`未知指标 ${node.name.toUpperCase()}`)
      const argVals: number[] = []
      for (const a of node.args) {
        const v = evaluateNode(a, ctx, vars)
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          throw new FormulaError(`指标 ${node.name.toUpperCase()} 参数必须是数字`)
        }
        argVals.push(v)
      }
      const lines = ref.calc(ctx, resolveIndicatorArgs(ref, argVals))
      const line = lines[node.member]
      if (!line) throw new FormulaError(`指标 ${node.name.toUpperCase()} 无成员 ${node.member.toUpperCase()}`)
      return pointsToNumArr(ctx, line)
    }
  }
}

/** 求值 AST → NumArr(长度 = bars.length;null = 无效点,渲染时跳过);vars 提供脚本变量表 */
export function evaluateFormula(ast: Node, ctx: CalcContext, vars?: Record<string, FormulaValue>): NumArr {
  return toNumArr(evaluateNode(ast, ctx, vars), ctx)
}

/** 依次求值脚本语句,后语句可引用前语句结果;返回 输出名 → 值(标量变量保留数字语义,可作函数参数) */
export function evaluateFormulaScript(stmts: FormulaStatement[], ctx: CalcContext): Record<string, FormulaValue> {
  const vars: Record<string, FormulaValue> = {}
  for (const s of stmts) {
    if (s.kind === 'stick') continue
    vars[s.name] = evaluateNode(s.ast, ctx, vars)
  }
  return vars
}
