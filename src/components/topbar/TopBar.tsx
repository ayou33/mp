import type { KlinePeriod } from '../../api/stock'
import type { IndicatorConfig } from '../../indicators/IndicatorController'
import { IndicatorBar } from '../IndicatorBar'
import { PeriodSwitcher } from './PeriodSwitcher'
import { SettingsButton } from './SettingsButton'

interface TopBarProps {
  period: KlinePeriod
  onPeriodChange: (period: KlinePeriod) => void
  indicatorConfig: IndicatorConfig
  onIndicatorConfigChange: (config: IndicatorConfig) => void
  onOpenSettings: () => void
}

/** 顶部 bar:左周期切换 / 中指标栏 / 右全局设置,三区域独立组件 */
export function TopBar({
  period,
  onPeriodChange,
  indicatorConfig,
  onIndicatorConfigChange,
  onOpenSettings,
}: TopBarProps) {
  return (
    <div className="topbar">
      <PeriodSwitcher period={period} onChange={onPeriodChange} />
      <IndicatorBar config={indicatorConfig} onChange={onIndicatorConfigChange} />
      <SettingsButton onClick={onOpenSettings} />
    </div>
  )
}
