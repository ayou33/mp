/**
 * @mp/shared 公共导出:契约类型 + 股票工具 + 画线目录 + 内置指标 + 公式 DSL 引擎。
 * 被 backend-server(以及未来的 mcp-server / web)共用。
 */
export * from './types'
export * from './stocks'
export * from './drawing-types'
export { BUILTIN_INDICATORS, calcBuiltinIndicator, type BuiltinIndicatorDef, type BuiltinParamSpec } from './indicators'
export * from './indicators/custom'
