import { useCallback, useEffect, useRef, useState } from 'react'
import { runFormulaTest, type FormulaTestResult } from '../../indicators/custom'
import type { FormulaIndicatorSpec } from '../../indicators/custom'
import type { KlineBar } from '../../types'

/**
 * 公式测试 hook(非 tsx):维护测试结果状态。
 * 首次点击「测试」后,formula/shape/outputSpecs 等输入变化会自动重跑,结果始终与当前输入一致。
 */
export function useFormulaTest(
  /** 从当前弹窗状态组装公式定义(与保存共用 assembleFormulaSpec;抛错即编译未通过) */
  buildSpec: () => FormulaIndicatorSpec,
  /** 真实 K 线(缺省用合成样例) */
  bars: KlineBar[] | undefined,
  /** 公式相关输入(变化时自动重跑) */
  deps: unknown[],
): { testResult: FormulaTestResult | null; testFormula: () => void } {
  const [testResult, setTestResult] = useState<FormulaTestResult | null>(null)
  const [requested, setRequested] = useState(false)
  const buildRef = useRef(buildSpec)
  buildRef.current = buildSpec

  useEffect(() => {
    if (!requested) return
    try {
      setTestResult(runFormulaTest({ ...buildRef.current(), bars }))
    } catch (e) {
      setTestResult({
        ok: false,
        compileError: e instanceof Error ? e.message : String(e),
        dataSource: '',
        outputs: [],
        emptyKeys: [],
      })
    }
  }, [...deps, bars, requested])

  const testFormula = useCallback(() => setRequested(true), [])
  return { testResult, testFormula }
}
