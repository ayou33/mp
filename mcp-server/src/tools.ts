import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { BackendClient } from './backend'

const PERIOD = z.enum(['day', 'week', 'month'])
const SHAPE = z.enum(['line', 'area', 'histogram', 'baseline', 'band'])
const SOURCE = z.enum(['system', 'user'])
const FQ = z.enum(['qfq', 'none'])

const KLINE_BAR = z.object({
  time: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
})

const INDICATOR_CALL = z.object({
  id: z.string().optional(),
  params: z
    .array(z.object({ key: z.string(), value: z.union([z.number(), z.array(z.number()), z.string()]) }))
    .optional(),
  formula: z.string().optional(),
  formula2: z.string().optional(),
  shape: SHAPE.optional(),
})

const FORMULA_RECORD = z.object({
  id: z.string().optional(),
  title: z.string(),
  shape: SHAPE,
  formula: z.string(),
  formula2: z.string().optional(),
  baseValue: z.number().optional(),
  color: z.string().optional(),
  outputSpecs: z.record(z.any()).optional(),
})

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
  [key: string]: unknown
}

export interface ToolDef {
  name: string
  description: string
  schema: Record<string, z.ZodType>
  handler: (args: Record<string, unknown>) => Promise<ToolResult>
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const ok = (data: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  ...(isPlainObject(data) ? { structuredContent: data } : {}),
})
const fail = (msg: string): ToolResult => ({ content: [{ type: 'text', text: `错误:${msg}` }], isError: true })

/** 包装后端调用:成功 → ok,失败 → isError */
function wrap(fn: (a: Record<string, unknown>) => Promise<unknown>): (a: Record<string, unknown>) => Promise<ToolResult> {
  return async (a) => {
    try {
      return ok(await fn(a))
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e))
    }
  }
}

const enc = encodeURIComponent

/** 拼接查询串(跳过 undefined / 空串) */
function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

/** 全部 MCP 工具定义(与 api/mcp.md 对齐) */
export function buildToolDefs(backend: BackendClient): ToolDef[] {
  return [
    // ===== 主服务一:自选管理 =====
    {
      name: 'list_watchlist',
      description: '查询自选列表(首次默认三大指数:上证指数/科创综指/创业板指)',
      schema: {},
      handler: wrap(() => backend.get('/watchlist')),
    },
    {
      name: 'add_watchlist',
      description: '加入自选(幂等)',
      schema: { code: z.string().describe('规范化代码或 6 位数字,如 sh600519') },
      handler: wrap((a) => backend.put(`/watchlist/${enc(String(a.code))}`)),
    },
    {
      name: 'remove_watchlist',
      description: '移出自选;同时删除该股全部周期下所有画线对象(system + user)',
      schema: { code: z.string().describe('规范化代码或 6 位数字') },
      handler: wrap(async (a) => {
        await backend.del(`/watchlist/${enc(String(a.code))}`)
        return { ok: true, code: a.code }
      }),
    },
    // ===== 主服务二:画线类型目录 =====
    {
      name: 'list_drawing_types',
      description: '系统支持的画线类型(9 种)+ 操作方法(放置/编辑/清除/归属)',
      schema: {},
      handler: wrap(() => backend.get('/drawings/types')),
    },
    // ===== 主服务三:自选股画线对象(系统类型) =====
    {
      name: 'list_watchlist_drawings',
      description: '聚合查询自选股画线对象;缺省只看 system 系统类型',
      schema: { source: SOURCE.optional().describe('归属过滤,缺省 system') },
      handler: wrap((a) => backend.get(`/watchlist/drawings${qs({ source: a.source })}`)),
    },
    {
      name: 'delete_watchlist_drawings',
      description: '批量删除自选股画线对象;缺省只删 system 系统类型',
      schema: { source: SOURCE.optional().describe('归属过滤,缺省 system') },
      handler: wrap(async (a) => {
        await backend.del(`/watchlist/drawings${qs({ source: a.source })}`)
        return { ok: true }
      }),
    },
    {
      name: 'list_stock_drawings',
      description: '查询单只股票的画线对象',
      schema: {
        stock: z.string().describe('规范化代码'),
        period: PERIOD.optional(),
        source: SOURCE.optional(),
      },
      handler: wrap((a) => backend.get(`/drawings${qs({ stock: a.stock, period: a.period, source: a.source })}`)),
    },
    {
      name: 'delete_stock_drawings',
      description: '删除单只股票的画线对象(按条件批量,可限定 system/user)',
      schema: {
        stock: z.string().describe('规范化代码'),
        period: PERIOD.optional(),
        source: SOURCE.optional(),
      },
      handler: wrap(async (a) => {
        await backend.del(`/drawings${qs({ stock: a.stock, period: a.period, source: a.source })}`)
        return { ok: true }
      }),
    },
    {
      name: 'delete_drawing',
      description: '删除单个画线对象',
      schema: {
        stock: z.string().describe('规范化代码'),
        period: PERIOD,
        id: z.number().int().describe('画线对象 id'),
      },
      handler: wrap(async (a) => {
        await backend.del(`/drawings/${Number(a.id)}${qs({ stock: a.stock, period: a.period })}`)
        return { ok: true }
      }),
    },
    // ===== 辅助:行情 =====
    {
      name: 'search_stock',
      description: '搜索/规范化股票(按代码或名称)',
      schema: { query: z.string().describe('6 位代码、带前缀代码或名称关键词'), limit: z.number().int().min(1).max(50).optional() },
      handler: wrap((a) => backend.get(`/stocks/search${qs({ q: a.query, limit: a.limit })}`)),
    },
    {
      name: 'get_stock',
      description: '股票元信息(名称/市场/类型)',
      schema: { code: z.string().describe('规范化代码或 6 位数字') },
      handler: wrap((a) => backend.get(`/stocks/${enc(String(a.code))}`)),
    },
    {
      name: 'get_kline',
      description: '查询 K 线(前复权优先,支持更早历史分页)',
      schema: {
        code: z.string().describe('规范化代码或 6 位数字'),
        period: PERIOD.optional(),
        fq: FQ.optional(),
        limit: z.number().int().min(1).max(2000).optional(),
        before: z.string().optional().describe('拉取该日期之前的更早数据(YYYY-MM-DD)'),
      },
      handler: wrap((a) => backend.get(`/stocks/${enc(String(a.code))}/kline${qs({ period: a.period, fq: a.fq, limit: a.limit, before: a.before })}`)),
    },
    // ===== 辅助:指标 / 公式 =====
    {
      name: 'calc_indicator',
      description: '计算内置或自定义公式指标(code 或 bars 二选一;bars 传数据时服务端不再拉行情)',
      schema: {
        code: z.string().optional(),
        bars: z.array(KLINE_BAR).optional(),
        indicators: z.array(INDICATOR_CALL),
      },
      handler: wrap((a) => backend.post('/indicators/calc', a)),
    },
    {
      name: 'test_formula',
      description: '公式试运行:与保存一致的编译校验 + 对真实/合成数据求值统计',
      schema: {
        formula: z.string(),
        shape: SHAPE.optional(),
        formula2: z.string().optional(),
        baseValue: z.number().optional(),
        code: z.string().optional(),
        bars: z.array(KLINE_BAR).optional(),
      },
      handler: wrap((a) => backend.post('/formulas/test', a)),
    },
    {
      name: 'list_formulas',
      description: '用户公式列表',
      schema: {},
      handler: wrap(() => backend.get('/formulas')),
    },
    {
      name: 'get_formula',
      description: '单条用户公式',
      schema: { id: z.string() },
      handler: wrap((a) => backend.get(`/formulas/${enc(String(a.id))}`)),
    },
    {
      name: 'save_formula',
      description: '新建(无 id)或更新(有 id)用户公式;服务端编译校验,非法返回 422',
      schema: { record: FORMULA_RECORD },
      handler: wrap((a) => {
        const r = a.record as { id?: string }
        return r.id ? backend.put(`/formulas/${enc(r.id)}`, a.record) : backend.post('/formulas', a.record)
      }),
    },
    {
      name: 'delete_formula',
      description: '删除用户公式(同时注销对应指标定义)',
      schema: { id: z.string() },
      handler: wrap(async (a) => {
        await backend.del(`/formulas/${enc(String(a.id))}`)
        return { ok: true }
      }),
    },
    // ===== 辅助:浏览记录 / 配置 / 设置 / 画线保存 =====
    {
      name: 'get_browse_history',
      description: '最近浏览记录(默认空,去重置顶,上限 30)',
      schema: { limit: z.number().int().min(1).max(100).optional() },
      handler: wrap((a) => backend.get(`/browse-history${qs({ limit: a.limit })}`)),
    },
    {
      name: 'record_browse',
      description: '记录一次浏览(用户主动浏览)',
      schema: { code: z.string().describe('规范化代码或 6 位数字'), name: z.string().optional() },
      handler: wrap((a) => backend.post('/browse-history', a)),
    },
    {
      name: 'get_indicator_config',
      description: '指标配置',
      schema: {},
      handler: wrap(() => backend.get('/indicator-config')),
    },
    {
      name: 'save_indicator_config',
      description: '保存指标配置(全量)',
      schema: { config: z.object({ custom: z.record(z.any()) }) },
      handler: wrap((a) => backend.put('/indicator-config', a.config)),
    },
    {
      name: 'get_settings',
      description: '用户设置(默认周期/红涨绿跌/高低点样式)',
      schema: {},
      handler: wrap(() => backend.get('/settings')),
    },
    {
      name: 'save_settings',
      description: '保存用户设置(全量)',
      schema: {
        settings: z.object({
          defaultPeriod: PERIOD,
          redUp: z.boolean(),
          highLowStyle: z.enum(['leader', 'price-line']),
        }),
      },
      handler: wrap((a) => backend.put('/settings', a.settings)),
    },
    {
      name: 'save_drawings',
      description: '保存股票某周期的画线对象(全量替换)',
      schema: {
        stock: z.string().describe('规范化代码'),
        period: PERIOD,
        items: z.array(z.any()),
      },
      handler: wrap((a) => backend.put('/drawings', a)),
    },
  ]
}

/** 注册全部工具到 MCP server */
export function registerTools(server: McpServer, backend: BackendClient): void {
  for (const t of buildToolDefs(backend)) {
    server.tool(t.name, t.description, t.schema, (args) => t.handler(args as Record<string, unknown>))
  }
}
