import { useEffect, useState } from 'react'
import type { IndicatorConfig } from '../../indicators/IndicatorController'

export type IndicatorId = 'ma' | 'bbi' | 'rsi' | 'macd' | 'kdj'

/** 各指标固定参数(暂不可编辑) */
const FIXED_PARAMS: Record<Exclude<IndicatorId, 'ma'>, Array<[string, string]>> = {
  bbi: [['周期', '3, 6, 12, 24']],
  rsi: [['周期', '14']],
  macd: [['快线', '12'], ['慢线', '26'], ['信号', '9']],
  kdj: [['周期', '9'], ['K 平滑', '3'], ['D 平滑', '3']],
}

interface IndicatorConfigDialogProps {
  indicator: IndicatorId
  config: IndicatorConfig
  onChange: (config: IndicatorConfig) => void
  /** 关闭当前弹窗(由弹窗系统注入) */
  onDone: () => void
}

/** 指标配置弹窗内容:MA 周期可编辑,其余展示固定参数 */
export function IndicatorConfigDialog({ indicator, config, onChange, onDone }: IndicatorConfigDialogProps) {
  if (indicator === 'ma') return <MaPeriodsEditor config={config} onChange={onChange} onDone={onDone} />

  return (
    <div className="indicator-params">
      <p className="indicator-params-note">当前参数(暂不可编辑)</p>
      {FIXED_PARAMS[indicator].map(([k, v]) => (
        <div key={k} className="indicator-params-row">
          <span className="indicator-params-key">{k}</span>
          <span className="indicator-params-value">{v}</span>
        </div>
      ))}
      <div className="modal-actions">
        <button className="modal-btn modal-btn-primary" onClick={onDone}>
          确定
        </button>
      </div>
    </div>
  )
}

/** 均线周期编辑:仅点"确定"才生效 */
function MaPeriodsEditor({
  config,
  onChange,
  onDone,
}: {
  config: IndicatorConfig
  onChange: (c: IndicatorConfig) => void
  onDone: () => void
}) {
  const [text, setText] = useState(config.maPeriods.join(','))

  useEffect(() => {
    setText(config.maPeriods.join(','))
  }, [config.maPeriods])

  function apply() {
    const nums = text
      .split(/[,，\s]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0)
    if (nums.length > 0) onChange({ ...config, maPeriods: nums })
    onDone()
  }

  return (
    <div className="indicator-params">
      <label className="indicator-params-label">均线周期(逗号分隔)</label>
      <input
        className="indicator-params-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply()
        }}
        autoFocus
      />
      <p className="indicator-params-hint">示例:5, 10, 20</p>
      <div className="modal-actions">
        <button className="modal-btn" onClick={onDone}>
          取消
        </button>
        <button className="modal-btn modal-btn-primary" onClick={apply}>
          确定
        </button>
      </div>
    </div>
  )
}
