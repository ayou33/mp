import type { ReactNode } from 'react'
import type { IndicatorConfig } from '../indicators/IndicatorController'

interface IndicatorBarProps {
  config: IndicatorConfig
  onChange: (config: IndicatorConfig) => void
}

/** 指标项:左侧三点编辑按钮(点击暂不处理)+ 指标名称开关 */
function IndicatorItem({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <span className="indicator-item">
      <button className={active ? 'indicator-btn active' : 'indicator-btn'} onClick={onClick}>
        {children}
      </button>
      <button className="indicator-dots" title="编辑指标(待实现)" onClick={() => {}}>
        <span className="indicator-dot" />
        <span className="indicator-dot" />
        <span className="indicator-dot" />
      </button>
    </span>
  )
}

/** 顶部指标区:仅指标名称,竖向短线分割 */
export function IndicatorBar({ config, onChange }: IndicatorBarProps) {
  return (
    <div className="indicator-bar">
      <span className="indicator-label">指标</span>
      <IndicatorItem active={config.showMA} onClick={() => onChange({ ...config, showMA: !config.showMA })}>
        均线 MA
      </IndicatorItem>
      <span className="indicator-sep">│</span>
      <IndicatorItem active={config.showBBI} onClick={() => onChange({ ...config, showBBI: !config.showBBI })}>
        BBI
      </IndicatorItem>
      <span className="indicator-sep">│</span>
      <IndicatorItem active={config.showRSI} onClick={() => onChange({ ...config, showRSI: !config.showRSI })}>
        RSI
      </IndicatorItem>
      <span className="indicator-sep">│</span>
      <IndicatorItem active={config.showMACD} onClick={() => onChange({ ...config, showMACD: !config.showMACD })}>
        MACD
      </IndicatorItem>
      <span className="indicator-sep">│</span>
      <IndicatorItem active={config.showKDJ} onClick={() => onChange({ ...config, showKDJ: !config.showKDJ })}>
        KDJ
      </IndicatorItem>
    </div>
  )
}
