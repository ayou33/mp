import AddIcon from '@iconify-react/material-symbols/add'
import CloseIcon from '@iconify-react/material-symbols/close'
import { POPULAR_STOCKS, stockName } from '../data/stocks'

export type SidebarTab = 'watch' | 'browse'

interface SidebarProps {
  tab: SidebarTab
  onTabChange: (tab: SidebarTab) => void
  watchlist: string[]
  onAdd: (code: string) => void
  onRemove: (code: string) => void
  onSelect: (code: string) => void
}

/** 右侧面板:顶部搜索 + 自选/浏览 可切换 */
export function Sidebar({
  tab,
  onTabChange,
  watchlist,
  onAdd,
  onRemove,
  onSelect,
}: SidebarProps) {
  const tabBtn = (active: boolean) =>
    `flex-1 cursor-pointer border-b-2 border-transparent bg-transparent py-2.25 text-sm text-muted ${
      active ? 'border-b-accent text-white' : ''
    }`
  return (
    <aside className="flex w-[260px] min-h-0 flex-none flex-col rounded-l-lg bg-panel">
      <div className="flex border-b border-white/15">
        <button className={tabBtn(tab === 'watch')} onClick={() => onTabChange('watch')}>
          自选
        </button>
        <button className={tabBtn(tab === 'browse')} onClick={() => onTabChange('browse')}>
          浏览
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'watch' ? (
          watchlist.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-muted">暂无自选,去「浏览」添加</div>
          ) : (
            watchlist.map((c) => (
              <div key={c} className="flex items-center gap-1.5 p-2.5 hover:bg-white/5">
                <button
                  className="flex-1 cursor-pointer border-none bg-transparent px-0 py-0.5 text-left text-sm text-ink"
                  onClick={() => onSelect(c)}
                >
                  {stockName(c)}
                  <span className="ml-1.5 text-xs text-muted">{c}</span>
                </button>
                <button
                  className="cursor-pointer border-none bg-transparent px-1 py-0.5 text-sm text-muted hover:text-white"
                  onClick={() => onRemove(c)}
                  title="移出自选"
                >
                  <CloseIcon width="14" height="14" />
                </button>
              </div>
            ))
          )
        ) : (
          POPULAR_STOCKS.map((s) => (
            <div key={s.code} className="flex items-center gap-1.5 p-2.5 hover:bg-white/5">
              <button
                className="flex-1 cursor-pointer border-none bg-transparent px-0 py-0.5 text-left text-sm text-ink"
                onClick={() => onSelect(s.code)}
              >
                {s.name}
                <span className="ml-1.5 text-xs text-muted">{s.code}</span>
              </button>
              <button
                className="cursor-pointer border-none bg-transparent px-1 py-0.5 text-sm text-muted hover:text-white"
                onClick={() => onAdd(s.code)}
                title="加入自选"
              >
                <AddIcon width="14" height="14" />
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
