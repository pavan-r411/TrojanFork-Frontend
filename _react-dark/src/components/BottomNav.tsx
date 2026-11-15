import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/', label: 'Today', end: true, path: 'M12 3a9 9 0 1 0 9 9M12 3v9l6.4 6.4' },
  {
    to: '/plan',
    label: 'Meals',
    end: false,
    path: 'M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M17 3c-1.7 1.2-2.5 3.2-2.5 6s.8 4 2.5 4v8',
  },
  {
    to: '/profile',
    label: 'Profile',
    end: true,
    path: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5c1-3.4 4-5 7.5-5s6.5 1.6 7.5 5',
  },
]

/** The three places in the app, in a floating glass bar that is always one tap away. */
export function BottomNav() {
  return (
    <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto mx-auto grid max-w-[340px] grid-cols-3 gap-1 rounded-full border border-paper/10 bg-surface/80 p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.7)] backdrop-blur-xl">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold transition-colors ${
                isActive ? 'bg-paper/10 text-volt' : 'text-ash hover:text-paper'
              }`
            }
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={tab.path} />
            </svg>
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
