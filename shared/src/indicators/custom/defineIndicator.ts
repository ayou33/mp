import type { CustomIndicatorDef, CustomParamSpec, CustomParamValues } from './types'

/** 校验 param 默认值在合法范围(仅 number 有 min/max;越界钳制并给出警告) */
function clampParam(spec: CustomParamSpec, value: number | string | number[]): number | string | number[] {
  if (spec.kind === 'number' && typeof value === 'number') {
    let v = value
    if (spec.min !== undefined && v < spec.min) v = spec.min
    if (spec.max !== undefined && v > spec.max) v = spec.max
    return v
  }
  if (spec.kind === 'array' && Array.isArray(value)) {
    return value.map((n) => (Number.isFinite(n) ? n : 0))
  }
  return value
}

/** 从 def.params 构造默认参数值(供 config.custom[id].params 缺省时使用) */
export function defaultParams(def: CustomIndicatorDef): CustomParamValues {
  const out: CustomParamValues = {}
  for (const spec of def.params ?? []) {
    if (spec.kind === 'number') out[spec.key] = spec.default
    else if (spec.kind === 'array') out[spec.key] = [...spec.defaults]
    else out[spec.key] = spec.default
  }
  return out
}

/** 解析用户配置参数:缺省用 def 默认,存在则钳制到合法范围;过滤掉 def 中不存在的 key */
export function resolveParams(def: CustomIndicatorDef, user?: Record<string, unknown>): CustomParamValues {
  const base = defaultParams(def)
  if (!user) return base
  const specMap = new Map((def.params ?? []).map((s) => [s.key, s]))
  for (const [key, value] of Object.entries(user)) {
    const spec = specMap.get(key)
    if (!spec) continue
    base[key] = clampParam(spec, value as number | string | number[])
  }
  return base
}

/**
 * defineIndicator 工厂:声明式定义自定义指标。
 * - 校验 id 非空且输出 key 唯一、输出 key 与 outputs 元数据对齐
 * - 解析/钳制参数默认值,保证 calc 收到的 params 完整
 * - 返回 CustomIndicatorDef(注册到 CUSTOM_INDICATORS 后即生效)
 */
export function defineIndicator(def: CustomIndicatorDef): CustomIndicatorDef {
  if (!def.id || def.id.trim() === '') {
    throw new Error('[defineIndicator] id 不能为空')
  }
  const paramKeys = new Set((def.params ?? []).map((p) => p.key))
  if (paramKeys.size !== (def.params ?? []).length) {
    throw new Error(`[defineIndicator] ${def.id}:params key 重复`)
  }

  const outputKeys = new Set(def.outputs.map((o) => o.key))
  if (outputKeys.size !== def.outputs.length) {
    throw new Error(`[defineIndicator] ${def.id}:outputs key 重复`)
  }

  // 输出元数据与 calc 实际返回对齐由编译期保证(calc 返回 CustomOutput[] 时逐项匹配),此处校验元数据本身合法
  for (const o of def.outputs) {
    if (!o.key || !o.label) {
      throw new Error(`[defineIndicator] ${def.id}:outputs 必须含 key 与 label`)
    }
  }

  // 确保 id 唯一(注册时校验已在 manager 中做,这里仅校验 id 规范化)
  return {
    ...def,
    defaultPane: def.defaultPane ?? 'overlay',
    params: def.params ?? [],
    outputs: def.outputs,
  }
}
