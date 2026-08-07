import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { PriceInput } from './PriceInput'

interface TextInputDialogProps {
  /** 初始价格(点击处锚点价格) */
  price: number
  /** 确认输入(非空文本 + 编辑后价格) */
  onSubmit: (text: string, price: number) => void
  onCancel: () => void
}

/** 文本标注创建弹窗内容:输入文本 + 可编辑价格(与编辑面板一致)+ 确定/取消(经 ModalProvider 外壳渲染) */
export function TextInputDialog({ price, onSubmit, onCancel }: TextInputDialogProps) {
  const [text, setText] = useState('')
  const [editedPrice, setEditedPrice] = useState(price)
  const inputRef = useRef<HTMLInputElement>(null)

  // 打开即聚焦文本输入(Esc 由 ModalProvider 全局处理关闭)
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function submit(): void {
    const t = text.trim()
    if (t) onSubmit(t, editedPrice)
  }

  return (
    <div className="flex flex-col gap-2.5">
      <input
        ref={inputRef}
        className="w-full rounded-[4px] border-none bg-input px-2.5 py-2 text-sm text-ink outline-none placeholder:text-muted"
        placeholder="输入标注文本,回车确认"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') submit()
        }}
        spellCheck={false}
        maxLength={60}
      />
      {/* 价格行:label 靠左、父级容器控制 input 宽度(w-full 填满)靠右、中间留白 */}
      <div className="flex items-center justify-between">
        <span className="whitespace-nowrap text-xs text-muted">价格</span>
        <div className="w-20">
          <PriceInput value={editedPrice} onChange={setEditedPrice} />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          className="cursor-pointer rounded-[4px] border border-border bg-transparent px-3.5 py-1.5 text-sm text-ink hover:bg-white/5"
          onClick={onCancel}
        >
          取消
        </button>
        <button
          className="cursor-pointer rounded-[4px] border-none bg-accent px-3.5 py-1.5 text-sm text-white hover:bg-accent-hover"
          onClick={submit}
        >
          确定
        </button>
      </div>
    </div>
  )
}
