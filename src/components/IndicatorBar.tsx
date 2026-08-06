import type { ReactNode } from 'react'
import AddIcon from '@iconify-react/material-symbols-light/add'
import TuneIcon from '@iconify-react/material-symbols-light/tune'
import type { IndicatorConfig } from '../indicators/IndicatorController'
import { IndicatorConfigDialog, type IndicatorId } from './modal/IndicatorConfigDialog'
import { useModal } from './modal/ModalProvider'

interface IndicatorBarProps {
  config: IndicatorConfig
  onChange: (config: IndicatorConfig) => void
}

const TITLES: Record<IndicatorId, string> = {
  ma: '均线 MA',
  bbi: 'BBI',
  rsi: 'RSI',
  macd: 'MACD',
  kdj: 'KDJ',
}

/** 指标项:名称开关 + tune 编辑按钮(打开配置弹窗) */
function IndicatorItem({
  active,
  onClick,
  onEdit,
  children,
}: {
  active: boolean
  onClick: () => void
  onEdit: () => void
  children: ReactNode
}) {
  return (
    <span className="indicator-item">
      <button className={active ? 'indicator-btn active' : 'indicator-btn'} onClick={onClick}>
        {children}
      </button>
      <button className="indicator-edit" title="编辑指标" onClick={onEdit}>
        <TuneIcon width="14" height="14" />
      </button>
    </span>
  )
}

/** 指标列表弹窗:点击启用/停用(新增指标占位,后续详细实现) */
function AddIndicatorDialog({
  config,
  onChange,
  onClose,
}: {
  config: IndicatorConfig
  onChange: (config: IndicatorConfig) => void
  onClose: () => void
}) {
  const rows: Array<{ id: IndicatorId; key: 'showMA' | 'showBBI' | 'showRSI' | 'showMACD' | 'showKDJ'; enabled: boolean }> = [
    { id: 'ma', key: 'showMA', enabled: config.showMA },
    { id: 'bbi', key: 'showBBI', enabled: config.showBBI },
    { id: 'rsi', key: 'showRSI', enabled: config.showRSI },
    { id: 'macd', key: 'showMACD', enabled: config.showMACD },
    { id: 'kdj', key: 'showKDJ', enabled: config.showKDJ },
  ]
  return (
    <div className="add-indicator">
      {rows.map((r) => (
        <button
          key={r.id}
          className={r.enabled ? 'add-indicator-row active' : 'add-indicator-row'}
          onClick={() => onChange({ ...config, [r.key]: !r.enabled })}
        >
          {TITLES[r.id]}
        </button>
      ))}
      <p className="settings-hint">选择指标即可添加/移除</p>
      <div className="modal-actions">
        <button className="modal-btn modal-btn-primary" onClick={onClose}>
          完成
        </button>
      </div>
    </div>
  )
}

/** 顶部指标栏(位于 TopBar 中间):名称开关 + 编辑按钮 + 末尾加号新增指标 */
export function IndicatorBar({ config, onChange }: IndicatorBarProps) {
  const { open } = useModal()

  function editIndicator(id: IndicatorId) {
    open({
      title: `${TITLES[id]} 配置`,
      content: (api) => (
        <IndicatorConfigDialog
          indicator={id}
          config={config}
          onChange={onChange}
          onDone={api.close}
        />
      ),
    })
  }

  function addIndicator() {
    open({
      title: '添加指标',
      content: (api) => (
        <AddIndicatorDialog config={config} onChange={onChange} onClose={api.close} />
      ),
    })
  }

  return (
    <div className="indicator-bar">
      <IndicatorItem active={config.showMA} onClick={() => onChange({ ...config, showMA: !config.showMA })} onEdit={() => editIndicator('ma')}>
        均线 MA
      </IndicatorItem>
      <span className="indicator-sep">│</span>
      <IndicatorItem active={config.showBBI} onClick={() => onChange({ ...config, showBBI: !config.showBBI })} onEdit={() => editIndicator('bbi')}>
        BBI
      </IndicatorItem>
      <span className="indicator-sep">│</span>
      <IndicatorItem active={config.showRSI} onClick={() => onChange({ ...config, showRSI: !config.showRSI })} onEdit={() => editIndicator('rsi')}>
        RSI
      </IndicatorItem>
      <span className="indicator-sep">│</span>
      <IndicatorItem active={config.showMACD} onClick={() => onChange({ ...config, showMACD: !config.showMACD })} onEdit={() => editIndicator('macd')}>
        MACD
      </IndicatorItem>
      <span className="indicator-sep">│</span>
      <IndicatorItem active={config.showKDJ} onClick={() => onChange({ ...config, showKDJ: !config.showKDJ })} onEdit={() => editIndicator('kdj')}>
        KDJ
      </IndicatorItem>
      <button className="indicator-add" title="添加指标" onClick={addIndicator}>
        <AddIcon width="16" height="16" />
      </button>
    </div>
  )
}
