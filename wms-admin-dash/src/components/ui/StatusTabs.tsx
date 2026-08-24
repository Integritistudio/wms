type StatusTab = {
  id: string
  label: string
  count?: number
}

type StatusTabsProps = {
  tabs: StatusTab[]
  activeId: string
  onChange: (id: string) => void
}

export default function StatusTabs({ tabs, activeId, onChange }: StatusTabsProps) {
  return (
    <div className="status-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeId === tab.id}
          className={`status-tab${activeId === tab.id ? ' is-active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count !== undefined ? <span className="status-tab-count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  )
}
