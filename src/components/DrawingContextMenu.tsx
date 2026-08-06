import { useState, type ChangeEvent, type KeyboardEvent, type Ref } from 'react'
import type { DrawingKind, DrawingRef } from '../drawing/DrawingTools'

const KIND_LABEL: Record<DrawingKind, string> = {
  line: '画线',
  fib: '斐波那契',
  'price-line': '价格线',
}

interface DrawingContextMenuProps {
  x: number
  y: number
  drawingRef: DrawingRef
  isReadonly: boolean
  /** 当前控制点价格(输入框初始值) */
  price: number | null
  onPriceChange: (price: number) => void
  onDelete: () => void
  onToggleReadonly: () => void
  /** React 19 下 ref 作为普通 prop 传入,用于外部判断点击是否在菜单外 */
  ref?: Ref<HTMLDivElement>
}

/** 画线对象左键菜单:价格输入 + 只读开关 + 单个删除 */
export function DrawingContextMenu({
  x,
  y,
  drawingRef,
  isReadonly,
  price,
  onPriceChange,
  onDelete,
  onToggleReadonly,
  ref,
}: DrawingContextMenuProps) {
  const [text, setText] = useState(price !== null ? String(price) : '')

  function commit(): void {
    const n = Number(text)
    if (Number.isFinite(n) && n > 0) onPriceChange(n)
    else setText(price !== null ? String(price) : '')
  }

  return (
    <div ref={ref} className="drawing-menu" style={{ left: x, top: y }}>
      <div className="drawing-menu-price">
        <span className="drawing-menu-price-label">价格</span>
        <input
          className="drawing-menu-price-input"
          value={text}
          disabled={isReadonly}
          spellCheck={false}
          inputMode="decimal"
          onChange={(e: ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') commit()
          }}
          onBlur={commit}
        />
      </div>
      <div className="drawing-menu-title">{KIND_LABEL[drawingRef.kind]}</div>
      <button className="drawing-menu-item" onClick={onToggleReadonly}>
        {isReadonly ? '设为可编辑' : '设为只读'}
      </button>
      <button className="drawing-menu-item danger" onClick={onDelete}>
        删除
      </button>
    </div>
  )
}
