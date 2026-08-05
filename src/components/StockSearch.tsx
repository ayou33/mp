import { useState, type FormEvent } from 'react'

interface StockSearchProps {
  defaultValue: string
  onSearch: (code: string) => void
}

/** 股票搜索输入框:无按钮,回车触发搜索 */
export function StockSearch({ defaultValue, onSearch }: StockSearchProps) {
  const [value, setValue] = useState(defaultValue)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const code = value.trim()
    if (code) onSearch(code)
  }

  return (
    <form className="stock-search" onSubmit={handleSubmit}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="输入股票代码,如 600519 / sh600519 / 000001"
        spellCheck={false}
        autoComplete="off"
      />
    </form>
  )
}
