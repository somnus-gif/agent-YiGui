import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import TopBar from '../components/TopBar'
import ItemCard from '../components/ItemCard'
import EmptyState from '../components/EmptyState'
import { SEASONS, STYLES } from '../utils/constants'

export default function WardrobePage() {
  const { ready, error, items, categories, reload } = useApp()
  const navigate = useNavigate()
  const [categoryId, setCategoryId] = useState('all')
  const [season, setSeason] = useState('all')
  const [style, setStyle] = useState('all')
  const [showFilter, setShowFilter] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)

  const filtered = useMemo(() => {
    return items
      .filter((i) => categoryId === 'all' || i.categoryId === categoryId)
      .filter((i) => season === 'all' || i.season === season)
      .filter((i) => style === 'all' || i.style === style)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  }, [items, categoryId, season, style])

  const catName = (id) => categories.find((c) => c.id === id)?.name || '未分类'

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-6">
        <div className="text-red-500 text-sm mb-2">❌ 初始化失败</div>
        <div className="text-slate-500 text-xs mb-4 break-all">{error}</div>
        <button onClick={reload} className="btn-primary text-sm">重试</button>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">加载中…</div>
    )
  }

  return (
    <div className="page-enter">
      <TopBar
        title="我的衣橱"
        right={
          <button
            onClick={() => navigate('/settings')}
            className="w-9 h-9 flex items-center justify-center text-slate-600 text-lg"
            aria-label="设置"
          >
            ⚙️
          </button>
        }
      />

      <div className="px-3 pt-3">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
          <button
            onClick={() => setCategoryId('all')}
            className={`chip shrink-0 ${
              categoryId === 'all' ? 'bg-brand-500 text-white' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            全部
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryId(c.id)}
              className={`chip shrink-0 ${
                categoryId === c.id ? 'bg-brand-500 text-white' : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              {c.icon} {c.name}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between py-2">
          <p className="text-xs text-slate-400">
            共 {filtered.length} 件{categoryId !== 'all' ? ` · ${catName(categoryId)}` : ''}
          </p>
          <button
            onClick={() => setShowFilter((v) => !v)}
            className="text-xs text-slate-500 flex items-center gap-1"
          >
            筛选 {showFilter ? '▲' : '▼'}
          </button>
        </div>

        {showFilter && (
          <div className="space-y-2 pb-2 page-enter">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              <span className="text-xs text-slate-400 py-1 pr-1">季节</span>
              <button
                onClick={() => setSeason('all')}
                className={`chip shrink-0 ${season === 'all' ? 'bg-emerald-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
              >
                全部
              </button>
              {SEASONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSeason(s)}
                  className={`chip shrink-0 ${season === s ? 'bg-emerald-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              <span className="text-xs text-slate-400 py-1 pr-1">风格</span>
              <button
                onClick={() => setStyle('all')}
                className={`chip shrink-0 ${style === 'all' ? 'bg-violet-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
              >
                全部
              </button>
              {STYLES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStyle(s)}
                  className={`chip shrink-0 ${style === s ? 'bg-violet-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-3 pb-4">
        {filtered.length === 0 ? (
          <EmptyState
            icon="👗"
            title="衣橱还空空的"
            description="点击右下角按钮,上传一张衣物照片开始抠图整理吧"
            action={
              <button onClick={() => navigate('/upload')} className="btn-primary">
                ＋ 添加衣物
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      {/* 添加衣物:支持单张(抠图微调)与批量(AI 自动抠图) */}
      {addMenuOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setAddMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute right-4 bottom-36 w-56 bg-white rounded-2xl shadow-xl overflow-hidden page-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setAddMenuOpen(false); navigate('/upload') }}
              className="w-full px-4 py-3.5 flex items-center gap-3 active:bg-slate-50 text-left"
            >
              <span className="text-2xl">✂️</span>
              <div>
                <p className="text-sm font-medium text-slate-800">单张添加</p>
                <p className="text-xs text-slate-400">抠图后可手动微调边缘</p>
              </div>
            </button>
            <div className="h-px bg-slate-100 mx-4" />
            <button
              onClick={() => { setAddMenuOpen(false); navigate('/batch') }}
              className="w-full px-4 py-3.5 flex items-center gap-3 active:bg-slate-50 text-left"
            >
              <span className="text-2xl">📦</span>
              <div>
                <p className="text-sm font-medium text-slate-800">批量添加</p>
                <p className="text-xs text-slate-400">最多 20 张,AI 自动抠图</p>
              </div>
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setAddMenuOpen((v) => !v)}
        className="fixed right-4 bottom-20 w-14 h-14 rounded-full bg-brand-500 text-white text-3xl shadow-lg shadow-brand-500/30 active:scale-90 transition flex items-center justify-center z-50"
        aria-label="添加衣物"
      >
        {addMenuOpen ? '✕' : '＋'}
      </button>
    </div>
  )
}