import { useNavigate } from 'react-router-dom'

// 顶部导航栏
export default function TopBar({ title, showBack, right, onBack }) {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-100">
      <div className="flex items-center h-14 px-3">
        <div className="w-10">
          {showBack && (
            <button
              onClick={() => (onBack ? onBack() : navigate(-1))}
              className="w-10 h-10 -ml-2 flex items-center justify-center text-slate-700 text-xl"
              aria-label="返回"
            >
              ‹
            </button>
          )}
        </div>
        <h1 className="flex-1 text-center font-semibold text-slate-900 truncate px-2">{title}</h1>
        <div className="w-10 flex justify-end">{right}</div>
      </div>
    </header>
  )
}