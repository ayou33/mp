import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { BaseModal } from './BaseModal'

export type ModalPlacement = 'center' | 'right'

export interface ModalConfig {
  key: string
  /** 标题 */
  title: string
  /** 弹窗内容;函数形式可接收 close 以自行关闭(如"确定"按钮) */
  content: ReactNode | ((api: { close: () => void }) => ReactNode)
  /** 宽度(px,居中弹窗生效) */
  width?: number
  /** 位置:居中弹窗(默认)或 TradingView 风格右侧面板 */
  placement?: ModalPlacement
  /** 关闭回调(关闭指定弹窗时触发) */
  onClose?: () => void
}

export interface ModalContextValue {
  /** 打开一个弹窗,返回 key(用于后续 close) */
  open: (config: Omit<ModalConfig, 'key'>) => string
  /** 关闭:不传 key 关最上层,传 key 关指定弹窗 */
  close: (key?: string) => void
}

const ModalContext = createContext<ModalContextValue | null>(null)

/**
 * 全局弹窗系统:底层承载系统内所有弹窗逻辑
 * (指标配置、自定义指标、绘图参数调整等)。
 * - 组件通过 useModal() 的 open/close 打开/关闭
 * - 支持多层堆叠(下层半透明遮挡);Esc 或点击遮罩关闭最上层
 */
export function ModalProvider({ children }: { children: ReactNode }) {
  const [modals, setModals] = useState<ModalConfig[]>([])
  const nextKeyRef = useRef(1)

  const open = useCallback((config: Omit<ModalConfig, 'key'>): string => {
    const key = `modal-${nextKeyRef.current++}`
    setModals((list) => [...list, { ...config, key }])
    return key
  }, [])

  const close = useCallback((key?: string) => {
    setModals((list) => {
      if (!key) {
        const top = list[list.length - 1]
        top?.onClose?.()
        return list.slice(0, -1)
      }
      const closing = list.find((m) => m.key === key)
      closing?.onClose?.()
      return list.filter((m) => m.key !== key)
    })
  }, [])

  // Esc 关闭最上层
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setModals((list) => (list.length ? list.slice(0, -1) : list))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const value = useMemo(() => ({ open, close }), [open, close])

  return (
    <ModalContext.Provider value={value}>
      {children}
      <ModalStack modals={modals} onClose={close} />
    </ModalContext.Provider>
  )
}

function ModalStack({ modals, onClose }: { modals: ModalConfig[]; onClose: (key?: string) => void }) {
  return (
    <>
      {modals.map((m, i) => {
        const isTop = i === modals.length - 1
        const placement = m.placement ?? 'center'
        const content = typeof m.content === 'function' ? m.content({ close: () => onClose(m.key) }) : m.content
        return (
          <div
            key={m.key}
            className={`fixed inset-0 flex ${
              placement === 'right' ? 'items-stretch justify-end' : 'items-center justify-center'
            }`}
            style={{ zIndex: 1000 + i }}
          >
            <div className="absolute inset-0 bg-black/50" onClick={() => isTop && onClose(m.key)} />
            <BaseModal title={m.title} onClose={() => onClose(m.key)} placement={placement} width={m.width}>
              {content}
            </BaseModal>
          </div>
        )
      })}
    </>
  )
}

export function useModal(): ModalContextValue {
  const ctx = useContext(ModalContext)
  if (!ctx) throw new Error('useModal 必须在 <ModalProvider> 内使用')
  return ctx
}
