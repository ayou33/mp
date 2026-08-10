import type { CSSProperties, ReactNode, Ref } from 'react'
import CloseIcon from '@iconify-react/material-symbols/close'

export interface BaseModalProps {
  /** 标题(显示在标题栏;不传且无 onClose 则不显示标题栏) */
  title?: string
  /** 关闭回调(标题栏 × 按钮) */
  onClose?: () => void
  /** 定位:全屏层(center/right,由 ModalProvider 的 layer 包裹)或容器内浮层(float) */
  placement?: 'center' | 'right' | 'float'
  /** float 定位(容器内 CSS 坐标) */
  x?: number
  y?: number
  /** 面板宽度(px) */
  width?: number
  /** 面板宽度百分比(相对视口 vw,居中弹窗生效;覆盖 width) */
  widthPct?: number
  /** 面板高度百分比(相对视口 vh,居中/右侧弹窗生效) */
  heightPct?: number
  /** 附加样式类(变体/布局微调) */
  className?: string
  /** React 19:ref 作为普通 prop */
  ref?: Ref<HTMLDivElement>
  children: ReactNode
}

/**
 * 系统内所有弹窗/浮层的统一基础外壳:标题栏 + 内容面板(Tailwind utility 实现)。
 * - 全屏弹窗(center/right):由 ModalProvider 的 layer + backdrop 包裹,本组件只负责 dialog 外壳
 * - 容器内浮层(float):画线编辑菜单、操作线确认浮层等,本组件承担绝对定位(left/top)
 * 遮罩/堆叠/Esc 等全屏层行为由 ModalProvider 管理;新增弹窗必须基于本组件。
 * 尺寸:width 为固定 px;widthPct/heightPct 为相对视口百分比(50 = 窗口 50% 宽/高),覆盖默认宽度。
 */
export function BaseModal({
  title,
  onClose,
  placement = 'center',
  x,
  y,
  width,
  widthPct,
  heightPct,
  className,
  ref,
  children,
}: BaseModalProps) {
  const style: CSSProperties | undefined =
    placement === 'float'
      ? { left: x, top: y, ...(width !== undefined ? { width } : null) }
      : widthPct !== undefined || heightPct !== undefined || width !== undefined
        ? {
            ...(widthPct !== undefined ? { width: `${widthPct}vw` } : width !== undefined ? { width } : null),
            ...(heightPct !== undefined ? { height: `${heightPct}vh` } : null),
          }
        : undefined
  // 注意:center/right 必须带 relative z-10——ModalStack 的遮罩是 absolute(z-auto),
  // CSS 绘制顺序里 absolute 会盖过静态 in-flow 内容,不加定位弹窗会被自己的遮罩盖住。
  const placementClass =
    placement === 'float'
      ? 'absolute z-30 min-w-[168px] rounded-md border border-border shadow-[0_4px_16px_rgba(0,0,0,0.45)]'
      : placement === 'right'
        ? 'relative z-10 h-screen max-h-screen w-[400px] max-w-[90vw] animate-[modal-slide-right_0.18s_ease] shadow-[-8px_0_30px_rgba(0,0,0,0.5)]'
        : `relative z-10 max-h-[80vh] max-w-[90vw] rounded-lg shadow-[0_8px_30px_rgba(0,0,0,0.5)]${
            widthPct === undefined ? ' w-[420px]' : ''
          }`
  return (
    <div
      ref={ref}
      className={`flex flex-col bg-panel2 ${placementClass}${className ? ` ${className}` : ''}`}
      style={style}
    >
      {(title !== undefined || onClose !== undefined) && (
        <div className="modal-header flex items-center justify-between px-5 pb-2 pt-3.5">
          {title !== undefined && <span className="text-sm font-semibold text-white">{title}</span>}
          {onClose !== undefined && (
            <button className="cursor-pointer border-none bg-transparent px-1 text-base text-muted hover:text-white" onClick={onClose} title="关闭">
              <CloseIcon width="16" height="16" />
            </button>
          )}
        </div>
      )}
      {/* modal-body 类保留作 .drawing-menu .modal-body 等 float 覆盖的 CSS 钩子 */}
      <div className="modal-body flex-1 overflow-y-auto px-5 pb-5 pt-2 text-sm">{children}</div>
    </div>
  )
}