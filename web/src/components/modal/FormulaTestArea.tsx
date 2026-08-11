import PlayIcon from '@iconify-react/material-symbols/play-arrow'
import type { FormulaIndicatorSpec } from '../../indicators/custom'
import type { KlineBar } from '../../types'
import { FormulaTestPanel } from './FormulaTestPanel'
import { useFormulaTest } from './useFormulaTest'

/**
 * 公式测试区(弹窗内):测试按钮 + 结果面板。
 * 与保存共用 assembleFormulaSpec 编译;首次点击后随公式输入实时重跑,保证提交前可确认指标能正常运行。
 */
export function FormulaTestArea({
  buildSpec,
  bars,
  deps,
}: {
  /** 从当前弹窗状态组装公式定义(与保存共用 assembleFormulaSpec;抛错 = 编译未通过) */
  buildSpec: () => FormulaIndicatorSpec
  /** 真实 K 线(缺省用合成样例数据) */
  bars?: KlineBar[]
  /** 公式相关输入(变化时自动重跑测试) */
  deps: unknown[]
}) {
  const { testResult, testFormula } = useFormulaTest(buildSpec, bars, deps)
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-1 self-start rounded-[4px] border border-border bg-transparent px-2.5 py-1 text-xs text-muted hover:bg-white/5 hover:text-ink"
        title="编译并试运行公式,确保提交后指标可正常显示"
        onClick={testFormula}
      >
        <PlayIcon width="13" height="13" />
        测试
      </button>
      <FormulaTestPanel result={testResult} />
    </div>
  )
}
