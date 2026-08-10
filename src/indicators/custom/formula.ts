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

/** 公式值:序列或标量(常量自动广播) */
type FormulaValue = NumArr | number

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
  abs: [1, 1],
  max: [2, 2],
  min: [2, 2],
  crossover: [2, 2],
  crossunder: [2, 2],
}

/** 首参必须广播为数组的函数(窗口/逐元素序列函数;标量传参无意义) */
const ARRAYIFY_FIRST = new Set(['sma', 'ma', 'ema', 'stddev', 'sum', 'hhv', 'llv', 'wilder', 'ref', 'abs'])

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
  'SMA', 'MA', 'EMA', 'STDDEV', 'SUM', 'HHV', 'LLV', 'WILDER', 'REF',
  'ABS', 'MAX', 'MIN', 'CROSSOVER', 'CROSSUNDER',
]

/** AST 节点 */
type Node =
  | { type: 'num'; value: number }
  | { type: 'field'; name: FieldName }
  | { type: 'id'; name: string }
  | { type: 'bin'; op: '+' | '-' | '*' | '/'; left: Node; right: Node }
  | { type: 'neg'; operand: Node }
  | { type: 'call'; name: string; args: Node[] }
  | { type: 'indicator'; name: string; args: Node[]; member: string }

type Token =
  | { type: 'num'; value: number; pos: number }
  | { type: 'id'; name: string; pos: number }
  | { type: 'op'; op: string; pos: number }

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
    if (/[A-Za-z_]/.test(c)) {
      let j = i
      while (j < n && /[A-Za-z0-9_]/.test(source[j])) j++
      toks.push({ type: 'id', name: source.slice(i, j).toLowerCase(), pos: i })
      i = j
      continue
    }
    if ('+-*/(),.'.includes(c)) {
      toks.push({ type: 'op', op: c, pos: i })
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
  return new Parser(tokenize(source)).parse()
}

/** 多语句脚本中的一条赋值语句:NAME = EXPR(输出)或 NAME := EXPR(私有变量) */
export interface FormulaStatement {
  /** 名称(小写;'main' = 无名称的单表达式) */
  name: string
  /** output = 渲染为输出线;var = 私有中间变量(只计算不渲染) */
  kind: 'output' | 'var'
  exprText: string
  ast: Node
}

const VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
/** 不能用作输出名的保留字:字段名 + 函数名 */
const RESERVED_NAMES = new Set<string>([...FIELD_NAMES, ...Object.keys(FIELD_ALIASES), ...Object.keys(FN_ARITY), ...Object.keys(INDICATOR_REFS)])

/**
 * 解析多语句公式脚本(弹窗主公式):
 * 每条语句 `NAME = EXPR`(换行或 `;` 分隔)定义一个输出线,EXPR 可引用此前定义的 NAME 变量。
 * 无 `=` 的单表达式 → 单语句 name='main'(走单输出形态路径)。
 * 错误:公式为空 / 无效或重复或保留字输出名 / 赋值后出现裸表达式 / 引用未定义变量。
 */
export function parseFormulaScript(source: string): FormulaStatement[] {
  const lines = source
    .split(/[;\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) throw new FormulaError('公式为空')

  const hasAssign = lines.some((l) => findTopLevelAssign(l) !== null)
  const stmts: FormulaStatement[] = []
  const defined = new Set<string>()

  for (const line of lines) {
    const assign = findTopLevelAssign(line)
    let name: string
    let expr: string
    let kind: 'output' | 'var'
    if (assign) {
      name = line.slice(0, assign.idx).trim().toLowerCase()
      expr = line.slice(assign.idx + (assign.isVar ? 2 : 1)).trim()
      kind = assign.isVar ? 'var' : 'output'
      if (!VAR_NAME_RE.test(name)) throw new FormulaError(`无效的名称 '${name.toUpperCase()}'`)
      if (RESERVED_NAMES.has(name)) throw new FormulaError(`名称不能是保留字 '${name.toUpperCase()}'`)
      if (defined.has(name)) throw new FormulaError(`名称重复 '${name.toUpperCase()}'`)
      defined.add(name)
    } else {
      if (hasAssign) throw new FormulaError('赋值语句后不能出现无名称表达式')
      name = 'main'
      expr = line
      kind = 'output'
    }
    if (!expr) throw new FormulaError('公式为空')
    const ast = new Parser(tokenize(expr), true).parse()
    stmts.push({ name, exprText: expr, ast, kind })
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
  const expr = source.trim()
  if (!expr) throw new FormulaError('公式为空')
  const ast = new Parser(tokenize(expr), true).parse()
  if (defined) {
    for (const id of collectIds(ast)) {
      if (!defined.has(id)) throw new FormulaError(`未知变量 ${id.toUpperCase()}`)
    }
  }
  return { name: 'main', exprText: expr, ast, kind: 'output' }
}
/** 在字符串中找第 0 层(不在括号内)的赋值符:':='(变量)或 '='(输出);找不到返回 null */
function findTopLevelAssign(s: string): { idx: number; isVar: boolean } | null {
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (depth === 0 && c === ':') {
      if (s[i + 1] === '=') return { idx: i, isVar: true }
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

/** 标量 → 与 bars 等长的全常量数组 */
function toNumArr(v: FormulaValue, ctx: CalcContext): NumArr {
  if (typeof v === 'number') return new Array(ctx.bars.length).fill(v)
  return v
}

function applyBin(op: string, a: number, b: number): number {
  switch (op) {
    case '+':
      return a + b
    case '-':
      return a - b
    case '*':
      return a * b
    case '/':
      return b === 0 ? NaN : a / b
    default:
      return NaN
  }
}

/** 逐元素二元运算:数组与数组逐项、标量与数组广播;任一无效点 → null;除零 → null */
function binOp(op: string, a: FormulaValue, b: FormulaValue): FormulaValue {
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

function evalNode(node: Node, ctx: CalcContext, vars?: Record<string, NumArr>): FormulaValue {
  switch (node.type) {
    case 'num':
      return node.value
    case 'field':
      return ctx[node.name] as NumArr
    case 'id': {
      const v = vars?.[node.name]
      if (!v) throw new FormulaError(`未知变量 ${node.name.toUpperCase()}`)
      return v
    }
    case 'neg': {
      const v = evalNode(node.operand, ctx, vars)
      if (typeof v === 'number') return -v
      const out: NumArr = new Array(v.length)
      for (let i = 0; i < v.length; i++) out[i] = v[i] === null ? null : -(v[i] as number)
      return out
    }
    case 'bin': {
      const a = evalNode(node.left, ctx, vars)
      const b = evalNode(node.right, ctx, vars)
      return binOp(node.op, a, b)
    }
    case 'call': {
      const args = node.args.map((a) => evalNode(a, ctx, vars))
      const impl = FN_IMPL[node.name] as keyof CalcContext
      const fn = ctx[impl] as unknown as (...a: FormulaValue[]) => NumArr
      if (ARRAYIFY_FIRST.has(node.name)) args[0] = toNumArr(args[0], ctx)
      return fn(...args)
    }
    case 'indicator': {
      const ref = INDICATOR_REFS[node.name]
      if (!ref) throw new FormulaError(`未知指标 ${node.name.toUpperCase()}`)
      const argVals: number[] = []
      for (const a of node.args) {
        const v = evalNode(a, ctx, vars)
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
export function evaluateFormula(ast: Node, ctx: CalcContext, vars?: Record<string, NumArr>): NumArr {
  return toNumArr(evalNode(ast, ctx, vars), ctx)
}

/** 依次求值脚本语句,后语句可引用前语句结果;返回 输出名 → NumArr */
export function evaluateFormulaScript(stmts: FormulaStatement[], ctx: CalcContext): Record<string, NumArr> {
  const vars: Record<string, NumArr> = {}
  for (const s of stmts) {
    vars[s.name] = toNumArr(evalNode(s.ast, ctx, vars), ctx)
  }
  return vars
}
