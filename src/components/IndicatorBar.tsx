import { Fragment, useEffect, useRef, type ReactNode } from 'react'
import TuneIcon from '@iconify-react/material-symbols/tune'
import {
  USER_FORMULA_RECORDS,
  type CustomIndicatorConfigEntry,
  type UserFormulaRecord,
} from '../indicators/custom'
import type { IndicatorConfig, IndicatorId } from '../indicators/IndicatorController'
import { CustomIndicatorDialog } from './modal/CustomIndicatorDialog'
import { IndicatorConfigDialog } from './modal/IndicatorConfigDialog'
import { useModal } from './modal/ModalProvider'

interface IndicatorBarProps {
  config: IndicatorConfig
  onChange: (config: IndicatorConfig) => void
  /** 保存用户公式指标(新建或更新):注册公式 + 写实例配置 */
  onApplyUserFormula: (rec: UserFormulaRecord, entry: CustomIndicatorConfigEntry) => void
  /** 删除用户公式指标 */
  onDeleteUserFormula: (id: string) => void
}

/** 指标元数据:id + 名称 + 启用状态读取 + 开关(单一数据源,顶栏/添加弹窗共用) */
interface IndicatorMeta {
  id: IndicatorId
  title: string
  active: (c: IndicatorConfig) => boolean
  toggle: (c: IndicatorConfig) => IndicatorConfig
}

const INDICATORS: IndicatorMeta[] = [
  { id: 'ma', title: '均线 MA', active: (c) => c.showMA, toggle: (c) => ({ ...c, showMA: !c.showMA }) },
  { id: 'ema', title: 'EMA', active: (c) => c.showEMA, toggle: (c) => ({ ...c, showEMA: !c.showEMA }) },
  { id: 'boll', title: 'BOLL', active: (c) => c.showBOLL, toggle: (c) => ({ ...c, showBOLL: !c.showBOLL }) },
  { id: 'bbi', title: 'BBI', active: (c) => c.showBBI, toggle: (c) => ({ ...c, showBBI: !c.showBBI }) },
  { id: 'rsi', title: 'RSI', active: (c) => c.showRSI, toggle: (c) => ({ ...c, showRSI: !c.showRSI }) },
  { id: 'macd', title: 'MACD', active: (c) => c.showMACD, toggle: (c) => ({ ...c, showMACD: !c.showMACD }) },
  { id: 'kdj', title: 'KDJ', active: (c) => c.showKDJ, toggle: (c) => ({ ...c, showKDJ: !c.showKDJ }) },
  { id: 'wr', title: 'WR', active: (c) => c.showWR, toggle: (c) => ({ ...c, showWR: !c.showWR }) },
  { id: 'cci', title: 'CCI', active: (c) => c.showCCI, toggle: (c) => ({ ...c, showCCI: !c.showCCI }) },
  { id: 'obv', title: 'OBV', active: (c) => c.showOBV, toggle: (c) => ({ ...c, showOBV: !c.showOBV }) },
  { id: 'atr', title: 'ATR', active: (c) => c.showATR, toggle: (c) => ({ ...c, showATR: !c.showATR }) },
  { id: 'dmi', title: 'DMI', active: (c) => c.showDMI, toggle: (c) => ({ ...c, showDMI: !c.showDMI }) },
]

function titleOf(id: IndicatorId): string {
  return INDICATORS.find((m) => m.id === id)?.title ?? id
}

/** 指标项:名称开关 + tune 编辑按钮(打开配置弹窗);激活时文字主题蓝 + 底部短 bar 指示 */
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
    <span className="flex flex-none flex-col items-center gap-[3px] whitespace-nowrap">
      <span className="inline-flex items-center gap-1.5">
        <button
          className={`cursor-pointer border-none bg-transparent p-0 text-sm text-muted hover:text-ink ${active ? 'text-accent' : ''}`}
          onClick={onClick}
        >
          {children}
        </button>
        <button
          className="inline-flex cursor-pointer items-center border-none bg-transparent p-0.5 text-muted hover:text-ink"
          title="编辑指标"
          onClick={onEdit}
        >
          <TuneIcon width="14" height="14" />
        </button>
      </span>
      {/* 激活指示:底部主题蓝短 bar(未激活用 invisible 占位,保持各项行高一致) */}
      <span className={`h-0.5 w-4 rounded-full ${active ? 'bg-accent' : 'invisible'}`} />
    </span>
  )
}

/**
 * 顶部指标栏(位于 TopBar 中间):常显全部内置指标;
 * 自定义指标为「手写公式」,由末尾 +自定义指标 打开公式编辑弹窗创建;
 * 内容超宽时**仅指标区横向滚动**,末尾 + 按钮固定不动(留给自定义指标)。
 */
export function IndicatorBar({ config, onChange, onApplyUserFormula, onDeleteUserFormula }: IndicatorBarProps) {
  const { open } = useModal()
  const scrollRef = useRef<HTMLDivElement>(null)

  // 鼠标滚轮 → 横向平滑滚动:wheel 事件累加目标位置,rAF 缓动逼近(不逐帧跳变)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let target = el.scrollLeft
    let raf = 0
    const step = (): void => {
      const diff = target - el.scrollLeft
      if (Math.abs(diff) < 0.5) {
        el.scrollLeft = target
        raf = 0
        return
      }
      el.scrollLeft += diff * 0.15
      raf = requestAnimationFrame(step)
    }
    const onWheel = (e: WheelEvent): void => {
      if (el.scrollWidth <= el.clientWidth + 1) return
      e.preventDefault()
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1
      const max = el.scrollWidth - el.clientWidth
      target = Math.max(0, Math.min(max, target + (e.deltaY + e.deltaX) * scale))
      if (!raf) raf = requestAnimationFrame(step)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  function editIndicator(id: IndicatorId) {
    open({
      title: `${titleOf(id)} 配置`,
      content: (api) => (
        <IndicatorConfigDialog indicator={id} config={config} onChange={onChange} onDone={api.close} />
      ),
    })
  }

  /** 新建自定义指标:打开公式编辑弹窗(无 id = 新建模式) */
  function addCustom() {
    open({
      title: '自定义指标',
      widthPct: 50,
      heightPct: 80,
      content: (api) => (
        <CustomIndicatorDialog config={config} onApply={onApplyUserFormula} onDone={api.close} />
      ),
    })
  }

  /** 编辑已有公式指标(弹窗带删除按钮) */
  function editCustom(id: string) {
    const rec = USER_FORMULA_RECORDS.get(id)
    if (!rec) return
    open({
      title: `${rec.title} 配置`,
      widthPct: 50,
      heightPct: 80,
      content: (api) => (
        <CustomIndicatorDialog
          id={id}
          config={config}
          onApply={onApplyUserFormula}
          onDelete={() => onDeleteUserFormula(id)}
          onDone={api.close}
        />
      ),
    })
  }

  function toggleCustom(id: string) {
    const entry = config.custom[id]
    if (!entry) return
    onChange({
      ...config,
      custom: { ...config.custom, [id]: { ...entry, enabled: !entry.enabled } },
    })
  }

  // 只列出「用户手写公式」指标(demos.ts 内置示例不参与顶栏展示)
  const customItems = Array.from(USER_FORMULA_RECORDS.values()).filter((rec) => config.custom[rec.id]?.enabled)

  return (
    <div className="flex min-w-0 flex-1 items-center">
      {/* 滚动区:容纳全部指标;隐藏滚动条 + 滚轮横向滚动;flex-none 的 + 按钮固定在右侧不参与滚动 */}
      <div
        ref={scrollRef}
        className="flex min-w-0 flex-1 items-center gap-3.5 overflow-x-auto text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {INDICATORS.map((m, i) => (
          <Fragment key={m.id}>
            {i > 0 && <span className="text-[#4c525e]">│</span>}
            <IndicatorItem
              active={m.active(config)}
              onClick={() => onChange(m.toggle(config))}
              onEdit={() => editIndicator(m.id)}
            >
              {m.title}
            </IndicatorItem>
          </Fragment>
        ))}
        {/* 已启用的用户公式指标:追加在末尾,开关 + tune 编辑 */}
        {customItems.length > 0 && (
          <>
            <span className="text-[#4c525e]">│</span>
            {customItems.map((rec, i) => (
              <Fragment key={rec.id}>
                {i > 0 && <span className="text-[#4c525e]">│</span>}
                <IndicatorItem active onClick={() => toggleCustom(rec.id)} onEdit={() => editCustom(rec.id)}>
                  {rec.title}
                </IndicatorItem>
              </Fragment>
            ))}
          </>
        )}
      </div>
      <button
        className="ml-1 cursor-pointer text-sm hover:text-white"
        title="新增自定义指标(手写公式)"
        onClick={addCustom}
      >
        +自定义指标
      </button>
    </div>
  )
}
