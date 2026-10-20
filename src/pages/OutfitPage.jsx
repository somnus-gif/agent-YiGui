import { useState } from 'react'
import { useApp } from '../context/AppContext'
import TopBar from '../components/TopBar'
import EmptyState from '../components/EmptyState'
import ConfirmDialog from '../components/ConfirmDialog'
import { SEASONS, OCCASIONS } from '../utils/constants'

export default function OutfitPage() {
  const { outfits, items, categories, addOutfit, updateOutfit, removeOutfit } = useApp()
  const [view, setView] = useState('list')
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState({ name: '', itemIds: [], season: '四季', occasion: '日常', notes: '' })
  const [filter, setFilter] = useState('all')
  const [confirmId, setConfirmId] = useState(null)

  const itemById = (id) => items.find((i) => i.id === id)

  const startNew = () => {
    setEditing(null)
    setDraft({ name: '', itemIds: [], season: '四季', occasion: '日常', notes: '' })
    setFilter('all')
    setView('edit')
  }
  const startEdit = (o) => {
    setEditing(o)
    setDraft({
      name: o.name,
      itemIds: [...(o.itemIds || [])],
      season: o.season || '四季',
      occasion: o.occasion || '日常',
      notes: o.notes || ''
    })
    setFilter('all')
    setView('edit')
  }
  const toggleItem = (id) => {
    setDraft((d) => {
      const has = d.itemIds.includes(id)
      return { ...d, itemIds: has ? d.itemIds.filter((x) => x !== id) : [...d.itemIds, id] }
    })
  }

  const save = async () => {
    if (!draft.name.trim()) {
      alert('请填写套装名称')
      return
    }
    if (draft.itemIds.length === 0) {
      alert('请至少选择一件衣物')
      return
    }
    if (editing) {
      await updateOutfit({ ...editing, ...draft, name: draft.name.trim() })
    } else {
      await addOutfit(draft)
    }
    setView('list')
  }

  const target = confirmId ? outfits.find((o) => o.id === confirmId) : null
  const filteredItems = filter === 'all' ? items : items.filter((i) => i.categoryId === filter)
  const selectedItems = draft.itemIds.map(itemById).filter(Boolean)

  if (view === 'list') {
    return (
      <div className="page-enter">
        <TopBar
          title="我的搭配"
          right={
            <button onClick={startNew} className="text-brand-600 text-2xl w-9 h-9 flex items-center justify-center">
              ＋
            </button>
          }
        />
        <div className="px-3 py-3">
          {outfits.length === 0 ? (
            <EmptyState
              icon="✨"
              title="还没有保存的搭配"
              description="挑选衣橱里的衣物组合一套搭配,保存下来方便随时回顾"
              action={<button onClick={startNew} className="btn-primary">创建搭配</button>}
            />
          ) : (
            <div className="space-y-3">
              {outfits.map((o) => {
                const its = (o.itemIds || []).map(itemById).filter(Boolean)
                return (
                  <div key={o.id} className="card overflow-hidden">
                    <div className="flex flex-wrap gap-1 p-3 checkerboard min-h-[88px]">
                      {its.length === 0 && <span className="text-xs text-slate-400 self-center px-2">暂无衣物</span>}
                      {its.map((it) => (
                        <div key={it.id} className="w-16 h-16 bg-white rounded-lg overflow-hidden flex items-center justify-center">
                          <img src={it.image} alt={it.name} className="max-w-full max-h-full object-contain p-0.5" />
                        </div>
                      ))}
                    </div>
                    <div className="px-3 py-2.5 flex items-center gap-2 border-t border-slate-100">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">{o.name}</p>
                        <div className="flex gap-1 mt-0.5">
                          <span className="chip bg-emerald-50 text-emerald-600">{o.season}</span>
                          <span className="chip bg-amber-50 text-amber-600">{o.occasion}</span>
                          <span className="chip bg-slate-100 text-slate-500">{its.length}件</span>
                        </div>
                      </div>
                      <button onClick={() => startEdit(o)} className="btn-ghost py-1.5 px-3 text-xs">编辑</button>
                      <button onClick={() => setConfirmId(o.id)} className="btn py-1.5 px-3 text-xs bg-rose-50 text-rose-600">删除</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <button onClick={startNew} className="fixed right-4 bottom-20 w-14 h-14 rounded-full bg-brand-500 text-white text-3xl shadow-lg shadow-brand-500/30 active:scale-90 transition flex items-center justify-center z-20">
          ＋
        </button>

        <ConfirmDialog
          open={!!confirmId}
          onClose={() => setConfirmId(null)}
          onConfirm={() => confirmId && removeOutfit(confirmId)}
          title="删除搭配"
          message={`确定删除「${target?.name}」吗?不影响衣橱里的衣物,可在回收站恢复(保留 30 天)。`}
          confirmText="删除"
        />
      </div>
    )
  }

  return (
    <div className="page-enter">
      <TopBar
        title={editing ? '编辑搭配' : '创建搭配'}
        showBack
        onBack={() => setView('list')}
        right={<button onClick={save} className="text-brand-600 text-sm font-medium">保存</button>}
      />
      <div className="px-4 py-4 space-y-4">
        <div>
          <label className="label">搭配名称</label>
          <input
            className="input"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="例如:周末休闲风"
            maxLength="20"
          />
        </div>

        <div>
          <label className="label">已选 {selectedItems.length} 件</label>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {selectedItems.length === 0 && (
              <span className="text-xs text-slate-400 py-2">从下方选择衣物</span>
            )}
            {selectedItems.map((it) => (
              <button
                key={it.id}
                onClick={() => toggleItem(it.id)}
                className="shrink-0 w-16 h-16 bg-white rounded-lg overflow-hidden border-2 border-rose-400 relative flex items-center justify-center"
              >
                <img src={it.image} alt={it.name} className="max-w-full max-h-full object-contain p-0.5" />
                <span className="absolute top-0 right-0 text-xs bg-rose-500 text-white rounded-bl px-0.5 leading-4">✕</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <button onClick={() => setFilter('all')} className={`chip shrink-0 ${filter === 'all' ? 'bg-brand-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>全部</button>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setFilter(c.id)} className={`chip shrink-0 ${filter === c.id ? 'bg-brand-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>{c.icon} {c.name}</button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {filteredItems.map((it) => {
            const sel = draft.itemIds.includes(it.id)
            return (
              <button
                key={it.id}
                onClick={() => toggleItem(it.id)}
                className={`relative rounded-xl overflow-hidden border-2 transition ${sel ? 'border-brand-500' : 'border-transparent'}`}
              >
                <div className="aspect-square checkerboard flex items-center justify-center">
                  <img src={it.image} alt={it.name} className="max-w-full max-h-full object-contain p-1" />
                </div>
                <p className="text-[11px] text-slate-600 truncate px-1 py-0.5 bg-white">{it.name}</p>
                {sel && (
                  <span className="absolute top-1 right-1 w-5 h-5 bg-brand-500 text-white rounded-full text-xs flex items-center justify-center">✓</span>
                )}
              </button>
            )
          })}
          {filteredItems.length === 0 && (
            <p className="col-span-3 text-center text-slate-400 text-sm py-8">该分类下暂无衣物</p>
          )}
        </div>

        <div>
          <label className="label">季节</label>
          <div className="flex gap-2 flex-wrap">
            {SEASONS.map((s) => (
              <button key={s} onClick={() => setDraft({ ...draft, season: s })} className={`chip ${draft.season === s ? 'bg-emerald-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>{s}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">场合</label>
          <div className="flex gap-2 flex-wrap">
            {OCCASIONS.map((s) => (
              <button key={s} onClick={() => setDraft({ ...draft, occasion: s })} className={`chip ${draft.occasion === s ? 'bg-amber-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>{s}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">备注(可选)</label>
          <textarea className="input min-h-[70px] resize-none" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} maxLength="100" />
        </div>

        <button onClick={save} className="btn-primary w-full">保存搭配</button>
      </div>
    </div>
  )
}