import type { FastifyInstance } from 'fastify'
import {
  defineFormulaIndicator,
  runFormulaTest,
  type FormulaRecord,
  type FormulaTestRequest,
  type FormulaTestResult,
  type KlineBar,
  type KlinePeriod,
  type IndicatorShape,
} from '@mp/shared'
import type { Ctx } from '../app'
import { deleteFormula, getFormula, insertFormula, listFormulas, updateFormula } from '../db'
import { badRequest, notFound, validation } from '../errors'

/** 与保存一致的编译校验(非法抛 422) */
function assertFormulaCompiles(rec: { title: string; shape: IndicatorShape; formula: string; formula2?: string; baseValue?: number }): void {
  try {
    defineFormulaIndicator({
      id: '_validate',
      title: rec.title,
      shape: rec.shape,
      formula: rec.formula,
      ...(rec.formula2 ? { formula2: rec.formula2 } : {}),
      ...(rec.baseValue !== undefined ? { baseValue: rec.baseValue } : {}),
    })
  } catch (e) {
    throw validation(`公式错误:${e instanceof Error ? e.message : String(e)}`)
  }
}

function newFormulaId(): string {
  return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function registerFormulaRoutes(app: FastifyInstance, ctx: Ctx): void {
  /** GET /api/v1/formulas */
  app.get('/', async () => listFormulas(ctx.db))

  /** POST /api/v1/formulas */
  app.post('/', async (req, reply) => {
    const body = req.body as Partial<FormulaRecord> | null
    if (!body?.title?.trim()) throw badRequest('请输入指标名称')
    if (!body.formula?.trim()) throw badRequest('请输入公式')
    const shape = (body.shape ?? 'line') as IndicatorShape
    assertFormulaCompiles({ title: body.title, shape, formula: body.formula, formula2: body.formula2, baseValue: body.baseValue })
    const rec = insertFormula(ctx.db, {
      id: newFormulaId(),
      title: body.title.trim(),
      shape,
      formula: body.formula.trim(),
      formula2: body.formula2,
      baseValue: body.baseValue,
      color: body.color,
      outputSpecs: body.outputSpecs,
    })
    return reply.code(201).send(rec)
  })

  /** GET /api/v1/formulas/{id} */
  app.get('/:id', async (req) => {
    const { id } = req.params as { id: string }
    const rec = getFormula(ctx.db, id)
    if (!rec) throw notFound(`公式不存在:${id}`)
    return rec
  })

  /** PUT /api/v1/formulas/{id} */
  app.put('/:id', async (req) => {
    const { id } = req.params as { id: string }
    if (!getFormula(ctx.db, id)) throw notFound(`公式不存在:${id}`)
    const body = req.body as Partial<FormulaRecord> | null
    if (!body || Object.keys(body).length === 0) throw badRequest('无可更新字段')
    const nextFormula = body.formula ?? (getFormula(ctx.db, id) as FormulaRecord).formula
    const nextShape = (body.shape ?? (getFormula(ctx.db, id) as FormulaRecord).shape) as IndicatorShape
    if (!nextFormula.trim()) throw badRequest('公式不能为空')
    assertFormulaCompiles({ title: body.title ?? 'x', shape: nextShape, formula: nextFormula, formula2: body.formula2, baseValue: body.baseValue })
    return updateFormula(ctx.db, id, {
      title: body.title,
      shape: nextShape,
      formula: body.formula,
      formula2: body.formula2,
      baseValue: body.baseValue,
      color: body.color,
      outputSpecs: body.outputSpecs,
    })
  })

  /** DELETE /api/v1/formulas/{id} */
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!deleteFormula(ctx.db, id)) throw notFound(`公式不存在:${id}`)
    return reply.code(204).send()
  })

  /** POST /api/v1/formulas/test */
  app.post('/test', async (req) => {
    const body = req.body as FormulaTestRequest | null
    if (!body?.formula?.trim()) throw badRequest('缺少 formula')
    let bars: KlineBar[] | undefined
    if (Array.isArray(body.bars) && body.bars.length > 0) bars = body.bars
    else if (body.code) {
      const period: KlinePeriod = 'day'
      const k = await ctx.tencent.getKline(body.code, period, 320)
      bars = k.bars
    }
    const result: FormulaTestResult = runFormulaTest({
      id: 'test',
      title: 'test',
      shape: body.shape ?? 'line',
      formula: body.formula,
      ...(body.formula2 ? { formula2: body.formula2 } : {}),
      ...(body.baseValue !== undefined ? { baseValue: body.baseValue } : {}),
      ...(body.outputSpecs ? { outputSpecs: body.outputSpecs } : {}),
      ...(bars ? { bars } : {}),
    })
    return result
  })
}
