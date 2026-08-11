import { useState } from 'react'
import type { ActionType } from '../drawing/DrawingTools'
import { ACTION_COLORS, ACTION_LABELS } from '../drawing/ActionPriceLinePrimitive'
import { PriceInput } from './PriceInput'

interface ActionTypeDialogProps {
  /** 初始目标价(点击处) */
  price: number
  /** 选中操作类型:回传编辑后价格 + 类型 */
  onSelect: (price: number, action: ActionType) => void
  onCancel: () => void
}

const ACTION_ORDER: ActionType[] = ['open', 'add', 'reduce', 'close']

/** 操作价格线创建弹窗内容:可编辑目标价(与编辑面板一致)+ 选择操作类型(开/加/减/清) */
export function ActionTypeDialog({ price, onSelect, onCancel }: ActionTypeDialogProps) {
  const [editedPrice, setEditedPrice] = useState(price)

  return (
    <div>
      {/* 价格行:label 靠左、父级容器控制 input 宽度(w-full 填满)靠右、中间留白 */}
      <div className="mb-2.5 flex items-center justify-between">
        <span className="whitespace-nowrap text-xs text-muted">价格</span>
        <div className="w-20">
          <PriceInput value={editedPrice} onChange={setEditedPrice} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {ACTION_ORDER.map((a) => (
          <button
            key={a}
            className="cursor-pointer rounded-md border bg-transparent py-2.5 text-sm hover:bg-white/10"
            style={{ color: ACTION_COLORS[a], borderColor: ACTION_COLORS[a] }}
            onClick={() => onSelect(editedPrice, a)}
          >
            {ACTION_LABELS[a]}
          </button>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          className="cursor-pointer rounded-[4px] border border-border bg-transparent px-3.5 py-1.5 text-sm text-ink hover:bg-white/5"
          onClick={onCancel}
        >
          取消
        </button>
      </div>
    </div>
  )
}
