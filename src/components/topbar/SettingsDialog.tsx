import { useState } from 'react'
import { USER_FORMULA_RECORDS, type UserFormulaRecord } from '../../indicators/custom'
import type { KlinePeriod } from '../../api/stock'
import type { HighLowMarkStyle } from '../../chart/VisibleRangeMark'

/** 用户设置(全局 + 个人,当前存储本地,后续可能接服务器) */
export interface UserSettings {
  defaultPeriod: KlinePeriod
  redUp: boolean
  /** 可见高/低点标注呈现方式:引线 / 价格线 */
  highLowStyle: HighLowMarkStyle
}

export const DEFAULT_SETTINGS: UserSettings = {
  defaultPeriod: 'day',
  redUp: true,
  highLowStyle: 'leader',
}

const PERIODS: Array<{ key: KlinePeriod; label: string }> = [
  { key: 'day', label: '日' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
]

interface SettingsDialogProps {
  initial: UserSettings
  onSave: (settings: UserSettings) => void
  /** 删除自定义指标(设置弹窗内管理;移除即时生效) */
  onDeleteCustomFormula: (id: string) => void
  onClose: () => void
}

/** 设置弹窗:个人设置 + 全局设置,保存后由调用方持久化到本地 */
export function SettingsDialog({ initial, onSave, onDeleteCustomFormula, onClose }: SettingsDialogProps) {
  const [form, setForm] = useState(initial)
  // 自定义指标列表:从注册表初始化;移除即时生效(弹窗内容闭包不随 App 重渲染刷新,故本地维护列表)
  const [customList, setCustomList] = useState<UserFormulaRecord[]>(() => Array.from(USER_FORMULA_RECORDS.values()))

  /** 移除自定义指标:注销注册表 + 写 config.custom + 持久化(上层),本地列表同步移除 */
  const removeCustom = (id: string) => {
    onDeleteCustomFormula(id)
    setCustomList((list) => list.filter((r) => r.id !== id))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        <div className="text-sm font-semibold text-white">个人设置</div>
        <div className="flex items-center justify-between">
          <span className="text-ink">默认周期</span>
          <div className="inline-flex overflow-hidden rounded-md border border-white/15">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                className={`cursor-pointer border-none bg-transparent px-3.5 py-1.5 text-sm text-muted ${
                  form.defaultPeriod === p.key ? 'bg-accent text-white' : ''
                }`}
                onClick={() => setForm({ ...form, defaultPeriod: p.key })}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="text-sm font-semibold text-white">全局设置</div>
        <label className="flex items-center justify-between">
          <span className="text-ink">红涨绿跌</span>
          <input
            type="checkbox"
            checked={form.redUp}
            onChange={(e) => setForm({ ...form, redUp: e.target.checked })}
          />
        </label>
        <div className="flex items-center justify-between">
          <span className="text-ink">高/低点标注</span>
          <div className="inline-flex overflow-hidden rounded-md border border-white/15">
            <button
              className={`cursor-pointer border-none bg-transparent px-3.5 py-1.5 text-sm text-muted ${
                form.highLowStyle === 'leader' ? 'bg-accent text-white' : ''
              }`}
              onClick={() => setForm({ ...form, highLowStyle: 'leader' })}
            >
              引线
            </button>
            <button
              className={`cursor-pointer border-none bg-transparent px-3.5 py-1.5 text-sm text-muted ${
                form.highLowStyle === 'price-line' ? 'bg-accent text-white' : ''
              }`}
              onClick={() => setForm({ ...form, highLowStyle: 'price-line' })}
            >
              价格线
            </button>
          </div>
        </div>
        <p className="m-0 text-xs text-muted">引线:极值点 + 短引线;价格线:半透明横线(减少干扰)</p>
        <p className="m-0 text-xs text-muted">全局设置后续可能配合接口在服务器存储</p>
      </div>

      {/* 自定义指标管理:列表展示 + 移除;切换激活状态在顶部指标栏,与移除互不影响 */}
      <div className="flex flex-col gap-2.5">
        <div className="text-sm font-semibold text-white">自定义指标</div>
        {customList.length === 0 ? (
          <p className="m-0 text-xs text-muted">暂无自定义指标(顶栏「+自定义指标」添加)</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {customList.map((rec) => (
              <div key={rec.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-ink">{rec.title}</span>
                <button
                  className="cursor-pointer rounded-[4px] border border-border bg-transparent px-2.5 py-1 text-xs text-up hover:bg-white/5"
                  onClick={() => removeCustom(rec.id)}
                >
                  移除
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="m-0 text-xs text-muted">移除后指标栏同步消失;指标栏点击名称仅切换激活状态,不删除</p>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          className="cursor-pointer rounded-[4px] border border-border bg-transparent px-3.5 py-1.5 text-sm text-ink hover:bg-white/5"
          onClick={onClose}
        >
          取消
        </button>
        <button
          className="cursor-pointer rounded-[4px] border border-accent bg-accent px-3.5 py-1.5 text-sm text-white hover:bg-accent-hover"
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
