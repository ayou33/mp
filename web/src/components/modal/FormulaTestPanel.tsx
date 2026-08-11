import type { FormulaTestResult } from '../../indicators/custom'

/** 数值显示:按量级选精度,保持可读 */
function fmt(v: number | null): string {
  if (v === null) return '—'
  const a = Math.abs(v)
  if (a !== 0 && (a >= 10000 || a < 0.01)) return v.toExponential(2)
  return a >= 100 ? v.toFixed(1) : v.toFixed(2)
}

/** 公式测试结果面板:通过/未通过 + 编译/运行错误 + 每输出统计 + 无数据警告 */
export function FormulaTestPanel({ result }: { result: FormulaTestResult | null }) {
  if (!result) return null
  const { ok, compileError, evalError, dataSource, outputs, emptyKeys } = result
  const allEmpty = outputs.length > 0 && outputs.every((o) => o.valid === 0)
  return (
    <div className="flex max-h-44 flex-col gap-1 overflow-y-auto rounded-md border border-white/10 bg-input/40 px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className={ok ? 'text-down' : 'text-up'}>{ok ? '✓ 测试通过' : '✗ 测试未通过'}</span>
        <span className="text-muted">{dataSource}</span>
      </div>
      {compileError && <p className="m-0 whitespace-pre-wrap text-up">编译错误:{compileError}</p>}
      {evalError && <p className="m-0 whitespace-pre-wrap text-up">运行错误:{evalError}</p>}
      {!ok && !compileError && !evalError && allEmpty && (
        <p className="m-0 text-up">所有输出均无有效数据点(预热期过长或公式恒为无效值)</p>
      )}
      {outputs.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {outputs.map((o) => (
            <div
              key={o.key}
              className={`flex items-center justify-between gap-2 font-mono ${o.valid === 0 ? 'text-muted' : 'text-ink'}`}
            >
              <span className="truncate">
                {o.label}
                <span className="text-muted">({o.shape})</span>
              </span>
              <span className="flex flex-none gap-3 tabular-nums text-muted">
                <span>
                  有效 {o.valid}/{o.total}
                </span>
                <span>最小 {fmt(o.min)}</span>
                <span>最大 {fmt(o.max)}</span>
                <span>最新 {fmt(o.last)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {emptyKeys.length > 0 && (
        <p className="m-0 text-muted">警告:{emptyKeys.map((k) => k.toUpperCase()).join(' / ')} 无有效数据点(渲染为空)</p>
      )}
    </div>
  )
}
