import { NavLink, Outlet } from 'react-router-dom'

const TABS = [
  { to: '/', label: '衣橱', icon: '👗', end: true },
  { to: '/outfit', label: '搭配', icon: '✨' },
  { to: '/weather', label: '天气', icon: '🌤️' },
  { to: '/shop', label: '商城', icon: '🛍️' }
]

export default function Layout() {
  return (
    <div className="min-h-full flex flex-col bg-slate-100">
      <main className="flex-1 pb-16 max-w-md mx-auto w-full">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-100 max-w-md mx-auto">
        <div className="grid grid-cols-4">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-2 text-xs gap-0.5 transition ${
                  isActive ? 'text-brand-600' : 'text-slate-400'
                }`
              }
            >
              <span className="text-xl leading-none">{t.icon}</span>
              <span>{t.label}</span>
            </NavLink>
          ))}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]"></div>
      </nav>
    </div>
  )
}