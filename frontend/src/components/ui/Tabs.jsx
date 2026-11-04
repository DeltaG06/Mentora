export function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div className={`-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0 ${className}`}>
      <div className="flex min-w-max gap-4" role="tablist">
        {tabs.map((tab) => {
          const active = tab.value === value
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.value)}
              className={`-mb-px flex h-11 items-center gap-1.5 border-b-2 text-base font-medium ${
                active ? 'border-accent-700 text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-800'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count !== null && (
                <span className={active ? 'text-neutral-700' : 'text-neutral-400'}>({tab.count})</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
