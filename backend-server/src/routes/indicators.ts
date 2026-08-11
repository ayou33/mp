import type { FastifyInstance } from 'fastify'
import {
  BUILTIN_INDICATORS,
  calcBuiltinIndicator,
  createCalcContext,
  defineFormulaIndicator,
  type IndicatorCall,
  type IndicatorCalcRequest,
  type IndicatorOutput,
  type IndicatorPoint,
  type KlineBar,
  type KlinePeriod,
} from '@mp/shared'
import type { Ctx } from '../app'
import { getFormula } from '../db'
import { badRequest, validation } from '../errors'

/** 公式路径:用 DSL 引擎编译并求值,把 CustomOutput 映射为 API IndicatorOutput */
function formulaToOutputs(call: IndicatorCall, bars: KlineBar[]): IndicatorOutput[] {
  const def = defineFormulaIndicator({
    id: `calc_${call.id ?? 'f'}`,
    title: call.id ?? 'formula',
    shape: call.shape ?? 'line',
    formula: call.formula ?? '',
    formula2: call.formula2,
  })
  const outputs = def.calc(createCalcContext(bars), {})
  return outputs.map((o) => {
    if (o.type === 'band') {
      const b = o as { key: string; label: string; upper: IndicatorPoint[]; lower: IndicatorPoint[] }
      return { key: o.key, label: o.label, type: 'band' as const, data: b.upper, lower: b.lower }
    }
    return { key: o.key, label: o.label, type: o.type, data: (o as { data: IndicatorOutput['data'] }).data }
  })
}

export function registerIndicatorRoutes(app: FastifyInstance, ctx: Ctx): void {
  /** POST /api/v1/indicators/calc */
  app.post('/calc', async (req) => {
    const body = req.body as IndicatorCalcRequest | null
    if (!body || !Array.isArray(body.indicators) || body.indicators.length === 0) {
      throw badRequest('indicators 不能为空')
    }
    const hasBars = Array.isArray(body.bars) && body.bars.length > 0
    if (!body.code && !hasBars) throw badRequest('code 与 bars 至少传一个')

    let bars: KlineBar[]
    let code: string | undefined
    if (hasBars) {
      bars = body.bars as KlineBar[]
    } else {
      const period: KlinePeriod = body.period ?? 'day'
      const k = await ctx.tencent.getKline(body.code as string, period, 320)
      code = k.code
      bars = k.bars
    }

    const outputs: Record<string, IndicatorOutput[]> = {}
    const used = new Set<string>()
    body.indicators.forEach((call, i) => {
      let list: IndicatorOutput[]
      if (call.formula) {
        list = formulaToOutputs(call, bars)
      } else if (call.id && BUILTIN_INDICATORS[call.id]) {
        list = calcBuiltinIndicator(call.id, bars, call.params ?? [])
      } else if (call.id) {
        const rec = getFormula(ctx.db, call.id)
        if (!rec) throw validation(`未知指标或公式:${call.id.toUpperCase()}`)
        list = formulaToOutputs({ ...call, formula: rec.formula, formula2: rec.formula2, shape: rec.shape }, bars)
      } else {
        throw badRequest('每个指标需提供 id 或 formula')
      }
      let key = call.id ?? 'main'
      if (used.has(key)) key = `${key}_${i + 1}`
      used.add(key)
      outputs[key] = list
    })

    return { code, barsCount: bars.length, outputs }
  })
}
