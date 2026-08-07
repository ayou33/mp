import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'

interface PriceInputProps {
  /** 当前价格(外部受控值;提交后经 onChange 回传) */
  value: number
  /** 提交编辑后的价格(精确到 1 tick 0.01) */
  onChange: (price: number) => void
  /** 禁用 */
  disabled?: boolean
  /** 自动聚焦 */
  autoFocus?: boolean
  /** 附加 className */
  className?: string
}

/**
 * 可复用价格输入框:与画线编辑面板一致——价格精确到 1 tick(0.01)、右对齐、
 * `bg-input` 背景、滚轮调价(默认 1 tick / Ctrl 10 倍 / Shift 100 倍)。
 * 宽度由父级容器控制(input 固定 `w-full` 填满父级,不自行撑开)。
 */
export function PriceInput({ value, onChange, disabled, autoFocus, className }: PriceInputProps) {
  const [text, setText] = useState(value.toFixed(2))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setText(value.toFixed(2))
  }, [value])

  // 滚轮调价:默认 1 tick(0.01),按住 Ctrl 10 倍(0.1),按住 Shift 100 倍(1)
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const step = e.ctrlKey ? 0.1 : e.shiftKey ? 1 : 0.01
      const dir = e.deltaY > 0 ? -1 : 1
      setText((prev) => {
        const base = Number(prev)
        if (!Number.isFinite(base) || base <= 0) return prev
        const next = Math.max(0.01, base + dir * step)
        return next.toFixed(2)
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  function commit(): void {
    const n = Number(text)
    if (Number.isFinite(n) && n > 0) onChange(Math.round(n * 100) / 100)
    else setText(value.toFixed(2))
  }

  return (
    <input
      ref={inputRef}
      className={`w-full rounded-[4px] border-none bg-input px-2 py-1.25 text-right text-sm tabular-nums text-ink outline-none disabled:opacity-55 ${
        className ?? ''
      }`}
      value={text}
      disabled={disabled}
      autoFocus={autoFocus}
      spellCheck={false}
      inputMode="decimal"
      onChange={(e: ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') commit()
      }}
      onBlur={commit}
    />
  )
}
