import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import TopBar from '../components/TopBar'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { SEASONS, STYLES, SHOPS } from '../utils/constants'

export default function ItemDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { items, categories, updateItem, removeItem } = useApp()
  const item = items.find((i) => i.id === id)
  const [editing, setEditing] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [form, setForm] = useState(null)

  const cat = item ? categories.find((c) => c.id === item.categoryId) : null

  if (!item) {
    return (
      <div className="page-enter">
        <TopBar title="衣物详情" showBack />
        <p className="text-center text-slate-400 mt-10">未找到该衣物</p>
      </div>
    )
  }

  const openEdit = () => {
    setForm({
      name: item.name,
      categoryId: item.categoryId,
      subCategory: item.subCategory || '',
      season: item.season || '四季',
      style: item.style || '休闲',
      notes: item.notes || ''
    })
    setEditing(true)
  }

  const save = async () => {
    if (!form.name.trim()) return
    await updateItem({ ...item, ...form, name: form.name.trim() })
    setEditing(false)
  }

  const subs = categories.find((c) => c.id === form?.categoryId)?.subCategories || []

  return (
    <div className="page-enter">
      <TopBar
        title="衣物详情"
        showBack
        right={
          <button onClick={openEdit} className="text-brand-600 text-sm font-medium">
            编辑
          </button>
        }
      />

      <div className="px-4 py-4 space-y-4">
        <div className="card checkerboard flex items-center justify-center p-4 min-h-[280px]">
          <img src={item.image} alt={item.name} className="max-h-72 object-contain" />
        </div>

        <div>
          <h2 className="text-xl font-semibold text-slate-900">{item.name}</h2>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {cat && <span className="chip bg-slate-100 text-slate-600">{cat.icon} {cat.name}</span>}
            {item.subCategory && <span className="chip bg-slate-100 text-slate-600">{item.subCategory}</span>}
            {item.season && <span className="chip bg-emerald-50 text-emerald-600">{item.season}</span>}
            {item.style && <span className="chip bg-violet-50 text-violet-600">{item.style}</span>}
          </div>
        </div>

        {item.notes && (
          <div className="card p-3">
            <p className="text-xs text-slate-400 mb-1">备注</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{item.notes}</p>
          </div>
        )}

        {/* 商城搜索 */}
        <div className="card p-4">
          <p className="text-xs text-slate-400 mb-2">去商城找同款</p>
          <div className="grid grid-cols-4 gap-2">
            {SHOPS.map((s) => {
              const url = s.searchUrl(item.name)
              const bg = s.id === 'taobao'
                ? 'linear-gradient(135deg,#f97316,#fb923c)'
                : s.id === 'pdd'
                ? 'linear-gradient(135deg,#ef4444,#f43f5e)'
                : s.id === 'douyin'
                ? 'linear-gradient(135deg,#334155,#0f172a)'
                : 'linear-gradient(135deg,#ef4444,#e11d48)'
              return (
                <a
                  key={s.id}
                  href={url}
                  target="_top"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1 py-3 rounded-xl text-white active:scale-95 transition shadow block"
                  style={{ backgroundImage: bg }}
                >
                  <span className="text-2xl select-none pointer-events-none">{s.icon}</span>
                  <span className="text-[11px] font-medium select-none pointer-events-none">{s.name}</span>
                </a>
              )
            })}
          </div>
        </div>

        <button
          onClick={() => setConfirmOpen(true)}
          className="btn-danger w-full"
        >
          🗑 删除该衣物
        </button>
      </div>

      {/* 编辑 Modal */}
      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="编辑衣物"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="btn-ghost flex-1">取消</button>
            <button onClick={save} className="btn-primary flex-1">保存</button>
          </div>
        }
      >
        {form && (
          <div className="space-y-4">
            <div>
              <label className="label">名称</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength="20" />
            </div>
            <div>
              <label className="label">分类</label>
              <select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value, subCategory: '' })}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
            {subs.length > 0 && (
              <div>
                <label className="label">子分类</label>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setForm({ ...form, subCategory: '' })} className={`chip ${!form.subCategory ? 'bg-brand-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>不选</button>
                  {subs.map((s) => (
                    <button key={s} onClick={() => setForm({ ...form, subCategory: s })} className={`chip ${form.subCategory === s ? 'bg-brand-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>{s}</button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="label">季节</label>
              <div className="flex gap-2 flex-wrap">
                {SEASONS.map((s) => (
                  <button key={s} onClick={() => setForm({ ...form, season: s })} className={`chip ${form.season === s ? 'bg-emerald-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>{s}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">风格</label>
              <div className="flex gap-2 flex-wrap">
                {STYLES.map((s) => (
                  <button key={s} onClick={() => setForm({ ...form, style: s })} className={`chip ${form.style === s ? 'bg-violet-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>{s}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">备注</label>
              <textarea className="input min-h-[80px] resize-none" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength="100" />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={async () => {
          await removeItem(item.id)
          navigate('/', { replace: true })
        }}
        title="删除衣物"
        message={`确定删除「${item.name}」吗?此操作不可撤销。`}
        confirmText="删除"
      />
    </div>
  )
}