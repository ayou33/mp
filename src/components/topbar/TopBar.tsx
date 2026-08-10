import type { KlinePeriod } from '../../api/stock'
import type { CustomIndicatorConfigEntry, UserFormulaRecord } from '../../indicators/custom'
import type { IndicatorConfig } from '../../indicators/IndicatorController'
import { IndicatorBar } from '../IndicatorBar'
import { PeriodSwitcher } from './PeriodSwitcher'
import { SettingsButton } from './SettingsButton'
import { StockSearch } from './StockSearch'

interface TopBarProps {
  period: KlinePeriod
  onPeriodChange: (period: KlinePeriod) => void
  indicatorConfig: IndicatorConfig
  onIndicatorConfigChange: (config: IndicatorConfig) => void
  /** 保存用户公式指标 */
  onApplyUserFormula: (rec: UserFormulaRecord, entry: CustomIndicatorConfigEntry) => void
  /** 删除用户公式指标 */
  onDeleteUserFormula: (id: string) => void
  /** 搜索框初始/当前显示代码(换股后同步) */
  searchDefault: string
  /** 股票搜索回调:回车触发(传用户输入,内部做代码规范化) */
  onSearch: (code: string) => void
  onOpenSettings: () => void
}

/** 顶部 bar:左周期切换 / 中指标栏 / 右搜索框+设置,三区域独立组件 */
export function TopBar({
  period,
  onPeriodChange,
  indicatorConfig,
  onIndicatorConfigChange,
  onApplyUserFormula,
  onDeleteUserFormula,
  searchDefault,
  onSearch,
  onOpenSettings,
}: TopBarProps) {
  return (
    <div className="flex items-center gap-4 bg-panel px-4 py-2">
      <PeriodSwitcher period={period} onChange={onPeriodChange} />
      <IndicatorBar
        config={indicatorConfig}
        onChange={onIndicatorConfigChange}
        onApplyUserFormula={onApplyUserFormula}
        onDeleteUserFormula={onDeleteUserFormula}
      />
      <StockSearch defaultValue={searchDefault} onSearch={onSearch} />
      <SettingsButton onClick={onOpenSettings} />
    </div>
  )
}
