import { useNavigate } from 'react-router-dom'

// 衣物卡片(抠图后图片为透明背景,用棋盘格或纯色背景展示)
export default function ItemCard({ item, bg = 'checker' }) {
  const navigate = useNavigate()
  const bgClass =
    bg === 'checker'
      ? 'checkerboard'
      : bg === 'white'
      ? 'bg-white'
      : 'bg-slate-50'

  return (
    <button
      onClick={() => navigate(`/item/${item.id}`)}
      className="card overflow-hidden active:scale-[0.98] transition"
    >
      <div className={`aspect-square ${bgClass} flex items-center justify-center`}>
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            className="max-w-full max-h-full object-contain p-1"
          />
        ) : (
          <span className="text-3xl opacity-30">🧥</span>
        )}
      </div>
      <div className="px-2.5 py-2">
        <p className="text-sm text-slate-800 truncate">{item.name}</p>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          {item.season && <span className="chip bg-emerald-50 text-emerald-600">{item.season}</span>}
          {item.style && <span className="chip bg-violet-50 text-violet-600">{item.style}</span>}
        </div>
      </div>
    </button>
  )
}