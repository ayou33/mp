/**
 * 用户公式指标注册表(非 React):持久化用户手写的公式记录(localStorage mp_custom_formulas),
 * 注册时经 defineFormulaIndicator 编译为 CustomIndicatorDef 写入 CUSTOM_INDICATORS。
 * 展示顺序 = USER_FORMULA_RECORDS 插入顺序。
 */

import { defineFormulaIndicator, CUSTOM_INDICATORS, type CustomIndicatorDef, type FormulaOutputSpec, type FormulaShape } from '@mp/shared'

/** 用户公式指标记录(持久化;注册时编译为 CustomIndicatorDef) */
export interface UserFormulaRecord {
  id: string
  title: string
  shape: FormulaShape
  formula: string
  /** band 下轨表达式 */
  formula2?: string
  /** baseline 基准值 */
  baseValue?: number
  /** 线色 */
  color?: string
  /** 多输出脚本模式:每条输出的形态与附加配置(key = 脚本输出名;缺省全部 line) */
  outputSpecs?: Record<string, FormulaOutputSpec>
}

const STORAGE_KEY = 'mp_custom_formulas'

/** 已注册的用户公式记录(顺序 = 展示顺序) */
export const USER_FORMULA_RECORDS = new Map<string, UserFormulaRecord>()

/** 生成新指标 id(时间戳 base36 + 随机后缀) */
export function newUserFormulaId(): string {
  return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** 注册(或覆盖)一个用户公式指标:编译公式写入注册表;公式非法时抛 FormulaError */
export function registerUserFormula(rec: UserFormulaRecord): CustomIndicatorDef {
  const def = defineFormulaIndicator({
    id: rec.id,
    title: rec.title,
    shape: rec.shape,
    formula: rec.formula,
    formula2: rec.formula2,
    baseValue: rec.baseValue,
    color: rec.color,
    outputSpecs: rec.outputSpecs,
  })
  USER_FORMULA_RECORDS.set(rec.id, rec)
  CUSTOM_INDICATORS.set(rec.id, def)
  return def
}

/** 注销一个用户公式指标(从两个注册表移除) */
export function unregisterUserFormula(id: string): void {
  USER_FORMULA_RECORDS.delete(id)
  CUSTOM_INDICATORS.delete(id)
}

/** 从 localStorage 载入全部用户公式并注册;损坏/编译失败的单条跳过 */
export function loadUserFormulas(): UserFormulaRecord[] {
  const list: UserFormulaRecord[] = []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as UserFormulaRecord[]
      if (Array.isArray(parsed)) {
        for (const rec of parsed) {
          if (!rec?.id || !rec?.formula) continue
          try {
            registerUserFormula(rec)
            list.push(rec)
          } catch {
            /* 跳过编译失败的公式 */
          }
        }
      }
    }
  } catch {
    /* 忽略损坏数据 */
  }
  return list
}

/** 持久化全部用户公式记录 */
export function saveUserFormulas(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...USER_FORMULA_RECORDS.values()]))
  } catch {
    /* 忽略存储失败 */
  }
}
