import type { ApiErrorBody } from '@mp/shared'

/** 业务错误:statusCode + 业务 code(对齐 api/v1/common/error.md) */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const badRequest = (message: string, details?: unknown): ApiError => new ApiError(400, 'BAD_REQUEST', message, details)
export const notFound = (message: string): ApiError => new ApiError(404, 'NOT_FOUND', message)
export const conflict = (message: string): ApiError => new ApiError(409, 'CONFLICT', message)
export const validation = (message: string, details?: unknown): ApiError => new ApiError(422, 'VALIDATION_ERROR', message, details)
export const rateLimited = (message: string): ApiError => new ApiError(429, 'RATE_LIMITED', message)
export const upstream = (message: string): ApiError => new ApiError(502, 'UPSTREAM_ERROR', message)

/** 把任意异常转成统一错误响应体(内部错误兜底 500) */
export function toErrorBody(err: unknown): { statusCode: number; body: ApiErrorBody } {
  if (err instanceof ApiError) {
    return { statusCode: err.statusCode, body: { error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } } }
  }
  const msg = err instanceof Error ? err.message : String(err)
  return { statusCode: 500, body: { error: { code: 'INTERNAL', message: msg } } }
}
