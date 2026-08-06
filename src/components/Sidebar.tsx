import AddIcon from '@iconify-react/material-symbols-light/add'
import CloseIcon from '@iconify-react/material-symbols-light/close'
import { POPULAR_STOCKS, stockName } from '../data/stocks'
import { StockSearch } from './StockSearch'

export type SidebarTab = 'watch' | 'browse'

interface SidebarProps {
  tab: SidebarTab
  onTabChange: (tab: SidebarTab) => void
  watchlist: string[]
  onAdd: (code: string) => void
  onRemove: (code: string) => void
  onSelect: (code: string) => void
  /** 顶部搜索框 */
  onSearch: (code: string) => void
  searchDefault: string
}

/** 右侧面板:顶部搜索 + 自选/浏览 可切换 */
export function Sidebar({
  tab,
  onTabChange,
  watchlist,
  onAdd,
  onRemove,
  onSelect,
  onSearch,
  searchDefault,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-search">
        <StockSearch defaultValue={searchDefault} onSearch={onSearch} />
      </div>
      <div className="sidebar-tabs">
        <button className={tab === 'watch' ? 'active' : ''} onClick={() => onTabChange('watch')}>
          自选
        </button>
        <button className={tab === 'browse' ? 'active' : ''} onClick={() => onTabChange('browse')}>
          浏览
        </button>
      </div>
      <div className="sidebar-body">
        {tab === 'watch' ? (
          watchlist.length === 0 ? (
            <div className="sidebar-empty">暂无自选,去「浏览」添加</div>
          ) : (
            watchlist.map((c) => (
              <div key={c} className="sidebar-row">
                <button className="sidebar-row-main" onClick={() => onSelect(c)}>
                  {stockName(c)}
                  <span className="sidebar-code">{c}</span>
                </button>
                <button className="sidebar-row-action" onClick={() => onRemove(c)} title="移出自选">
                  <CloseIcon width="14" height="14" />
                </button>
              </div>
            ))
          )
        ) : (
          POPULAR_STOCKS.map((s) => (
            <div key={s.code} className="sidebar-row">
              <button className="sidebar-row-main" onClick={() => onSelect(s.code)}>
                {s.name}
                <span className="sidebar-code">{s.code}</span>
              </button>
              <button className="sidebar-row-action" onClick={() => onAdd(s.code)} title="加入自选">
                <AddIcon width="14" height="14" />
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
