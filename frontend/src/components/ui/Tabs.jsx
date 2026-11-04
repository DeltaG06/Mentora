export function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div className={`-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 ${className}`}>
      <div className="flex min-w-max gap-1 border-b border-slate-200" role="tablist">
        {tabs.map((tab) => {
          const active = tab.value === value
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.value)}
              className={`-mb-px flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors ${
                active
                  ? 'border-brand-700 text-brand-800'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count !== null && (
                <span
                  className={`rounded-full px-1.5 py-px text-xs tabular-nums ${
                    active ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
