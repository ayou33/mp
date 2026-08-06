import { useState } from 'react'
import type { KlinePeriod } from '../../api/stock'

/** 用户设置(全局 + 个人,当前存储本地,后续可能接服务器) */
export interface UserSettings {
  defaultPeriod: KlinePeriod
  redUp: boolean
}

export const DEFAULT_SETTINGS: UserSettings = {
  defaultPeriod: 'day',
  redUp: true,
}

const PERIODS: Array<{ key: KlinePeriod; label: string }> = [
  { key: 'day', label: '日' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
]

interface SettingsDialogProps {
  initial: UserSettings
  onSave: (settings: UserSettings) => void
  onClose: () => void
}

/** 设置弹窗:个人设置 + 全局设置,保存后由调用方持久化到本地 */
export function SettingsDialog({ initial, onSave, onClose }: SettingsDialogProps) {
  const [form, setForm] = useState(initial)

  return (
    <div className="settings-dialog">
      <div className="settings-section">
        <div className="settings-section-title">个人设置</div>
        <div className="settings-row">
          <span className="settings-label">默认周期</span>
          <div className="settings-seg">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                className={form.defaultPeriod === p.key ? 'active' : ''}
                onClick={() => setForm({ ...form, defaultPeriod: p.key })}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">全局设置</div>
        <label className="settings-row">
          <span className="settings-label">红涨绿跌</span>
          <input
            type="checkbox"
            checked={form.redUp}
            onChange={(e) => setForm({ ...form, redUp: e.target.checked })}
          />
        </label>
        <p className="settings-hint">全局设置后续可能配合接口在服务器存储</p>
      </div>

      <div className="modal-actions">
        <button className="modal-btn" onClick={onClose}>
          取消
        </button>
        <button
          className="modal-btn modal-btn-primary"
          onClick={() => {
            onSave(form)
            onClose()
          }}
        >
          保存
        </button>
      </div>
    </div>
  )
}
