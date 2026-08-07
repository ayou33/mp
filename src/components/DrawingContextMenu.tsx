import type { Ref } from 'react'
import type { DrawingKind, DrawingRef } from '../drawing/DrawingTools'
import { BaseModal } from './modal/BaseModal'
import { PriceInput } from './PriceInput'

const KIND_LABEL: Record<DrawingKind, string> = {
  line: '画线',
  fib: '斐波那契',
  'price-line': '价格线',
  'action-line': '操作价格线',
  rect: '矩形',
  text: '文本',
  'vertical-line': '垂直线',
  'fib-ext': '斐波那契扩展',
  measure: '测量',
}

/** 无价格概念的画线种类:菜单不显示价格输入框(仅删除) */
const NO_PRICE_KINDS: DrawingKind[] = ['vertical-line']

interface DrawingContextMenuProps {
  x: number
  y: number
  drawingRef: DrawingRef
  /** 是否系统画线对象:用户不可修改/删除,仅可查看 */
  isSystem: boolean
  /** 是否允许编辑价格(操作价格线非 armed 状态锁定几何) */
  canEdit: boolean
  /** 当前控制点价格(输入框初始值) */
  price: number | null
  onPriceChange: (price: number) => void
  onDelete: () => void
  /** React 19 下 ref 作为普通 prop 传入,用于外部判断点击是否在菜单外 */
  ref?: Ref<HTMLDivElement>
}

/** 画线对象左键菜单:价格输入 + 单个删除(系统对象/锁几何对象修改操作禁用) */
export function DrawingContextMenu({
  x,
  y,
  drawingRef,
  isSystem,
  canEdit,
  price,
  onPriceChange,
  onDelete,
  ref,
}: DrawingContextMenuProps) {
  return (
    <BaseModal
      ref={ref}
      placement="float"
      x={x}
      y={y}
      className="drawing-menu"
      title={`${KIND_LABEL[drawingRef.kind]}${isSystem ? ' · 系统画线' : ''}`}
    >
      {!NO_PRICE_KINDS.includes(drawingRef.kind) && (
        <div className="flex items-center justify-between gap-1.5 px-1.5 pb-2 pt-1.5">
          <span className="whitespace-nowrap pl-1 text-left text-xs text-muted">价格</span>
          <div className="w-20">
            <PriceInput value={price ?? 0} onChange={onPriceChange} disabled={isSystem || !canEdit} />
          </div>
        </div>
      )}
      <button
        className="block w-full cursor-pointer rounded-[4px] border-none bg-transparent px-2.5 py-1.75 text-left text-sm text-up hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        onClick={onDelete}
        disabled={isSystem}
      >
        删除
      </button>
    </BaseModal>
  )
}
