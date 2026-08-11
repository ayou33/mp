import { useEffect, useState, type FormEvent } from 'react'

interface StockSearchProps {
  defaultValue: string
  onSearch: (code: string) => void
}

/** 股票搜索输入框(顶栏设置按钮左侧):无按钮,回车触发搜索;当前代码变化时同步显示 */
export function StockSearch({ defaultValue, onSearch }: StockSearchProps) {
  const [value, setValue] = useState(defaultValue)

  // 换股(侧栏选择/搜索)后输入框跟随显示当前代码
  useEffect(() => {
    setValue(defaultValue)
  }, [defaultValue])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const code = value.trim()
    if (code) onSearch(code)
  }

  return (
    <form className="ml-auto" onSubmit={handleSubmit}>
      <input
        className="h-8 w-24 rounded border-none bg-input px-3 text-sm text-ink uppercase outline-none lg:w-44"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="代码 如 600519"
        spellCheck={false}
        autoComplete="off"
      />
    </form>
  )
}
