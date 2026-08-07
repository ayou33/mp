import { Fragment, useEffect, useRef, type ReactNode } from 'react'
import TuneIcon from '@iconify-react/material-symbols/tune'
import type { IndicatorConfig, IndicatorId } from '../indicators/IndicatorController'
import { IndicatorConfigDialog } from './modal/IndicatorConfigDialog'
import { useModal } from './modal/ModalProvider'

interface IndicatorBarProps {
  config: IndicatorConfig
  onChange: (config: IndicatorConfig) => void
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

/** 指标列表弹窗:点击启用/停用(自定义指标尚未支持,当前列出内置指标) */
function AddIndicatorDialog({
  config,
  onChange,
  onClose,
}: {
  config: IndicatorConfig
  onChange: (config: IndicatorConfig) => void
  onClose: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {INDICATORS.map((m) => {
        const enabled = m.active(config)
        return (
          <button
            key={m.id}
            className={`cursor-pointer rounded-md border border-white/15 bg-transparent px-3 py-2 text-left text-sm text-ink ${
              enabled ? 'border-accent bg-accent/10 text-accent' : ''
            }`}
            onClick={() => onChange(m.toggle(config))}
          >
            {m.title}
          </button>
        )
      })}
      <p className="m-0 text-xs text-muted">选择指标即可添加/移除</p>
      <div className="mt-4 flex justify-end gap-2">
        <button
          className="cursor-pointer rounded-[4px] border border-accent bg-accent px-3.5 py-1.5 text-sm text-white hover:bg-accent-hover"
          onClick={onClose}
        >
          完成
        </button>
      </div>
    </div>
  )
}

/**
 * 顶部指标栏(位于 TopBar 中间):常显全部指标;
 * 内容超宽时**仅指标区横向滚动**,末尾 + 按钮固定不动(留给自定义指标)。
 */
export function IndicatorBar({ config, onChange }: IndicatorBarProps) {
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

  function addIndicator() {
    open({
      title: '添加指标',
      content: (api) => <AddIndicatorDialog config={config} onChange={onChange} onClose={api.close} />,
    })
  }

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
      </div>
      <button
        className="ml-1 cursor-pointer hover:text-white text-sm"
        title="添加自定义指标"
        onClick={addIndicator}
      >
        +自定义指标
      </button>
    </div>
  )
}
