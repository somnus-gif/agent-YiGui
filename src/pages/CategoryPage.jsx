import { useState } from 'react'
import { useApp } from '../context/AppContext'
import TopBar from '../components/TopBar'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { uid } from '../utils/constants'

const EMOJI_OPTIONS = ['👕', '👖', '🧥', '👗', '🖼️', '🩲', '💍', '💄', '👟', '🧦', '🧢', '🕶️', '🧣', '🧤', '🎒', '⌚', '🩰', '🩱', '👔', '👘', '🧷', '✨']

export default function CategoryPage() {
  const { categories, items, addCategory, updateCategory, removeCategory } = useApp()
  const [editing, setEditing] = useState(null)
  const [confirmId, setConfirmId] = useState(null)
  const [draft, setDraft] = useState({ name: '', icon: '✨', subCategories: [] })
  const [subInput, setSubInput] = useState('')

  const countOf = (id) => items.filter((i) => i.categoryId === id).length

  const openNew = () => {
    setDraft({ name: '', icon: '✨', subCategories: [] })
    setEditing({ __new: true })
  }
  const openEdit = (cat) => {
    setDraft({ ...cat, subCategories: [...(cat.subCategories || [])] })
    setEditing(cat)
  }
  const closeEdit = () => setEditing(null)

  const save = async () => {
    if (!draft.name.trim()) return
    if (editing?.__new) {
      await addCategory({
        id: uid('cat'),
        name: draft.name.trim(),
        icon: draft.icon,
        type: 'custom',
        subCategories: draft.subCategories
      })
    } else {
      await updateCategory({ ...editing, name: draft.name.trim(), icon: draft.icon, subCategories: draft.subCategories })
    }
    closeEdit()
  }

  const addSub = () => {
    const v = subInput.trim()
    if (v && !draft.subCategories.includes(v)) {
      setDraft({ ...draft, subCategories: [...draft.subCategories, v] })
    }
    setSubInput('')
  }

  const target = confirmId ? categories.find((c) => c.id === confirmId) : null

  return (
    <div className="page-enter">
      <TopBar
        title="分类管理"
        right={
          <button onClick={openNew} className="w-9 h-9 flex items-center justify-center text-brand-600 text-2xl">
            ＋
          </button>
        }
      />
      <div className="px-3 py-3 space-y-2">
        {categories.map((c) => (
          <div key={c.id} className="card p-3 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-slate-50 flex items-center justify-center text-2xl">
              {c.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-slate-800">{c.name}</p>
                <span className="chip bg-slate-100 text-slate-500">
                  {c.type === 'preset' ? '预设' : '自定义'}
                </span>
              </div>
              {c.subCategories?.length > 0 && (
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  子分类:{c.subCategories.join('、')}
                </p>
              )}
              <p className="text-xs text-slate-400 mt-0.5">{countOf(c.id)} 件衣物</p>
            </div>
            <div className="flex gap-1">
              <button onClick={() => openEdit(c)} className="btn-ghost py-1.5 px-3 text-xs">
                编辑
              </button>
              <button
                onClick={() => setConfirmId(c.id)}
                className="btn py-1.5 px-3 text-xs bg-rose-50 text-rose-600"
              >
                删除
              </button>
            </div>
          </div>
        ))}
        <button onClick={openNew} className="btn-ghost w-full py-3 mt-2">
          ＋ 新增自定义分类
        </button>
      </div>

      <Modal
        open={!!editing}
        onClose={closeEdit}
        title={editing?.__new ? '新增分类' : '编辑分类'}
        footer={
          <div className="flex gap-2">
            <button onClick={closeEdit} className="btn-ghost flex-1">取消</button>
            <button onClick={save} className="btn-primary flex-1">保存</button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">分类名称</label>
            <input
              className="input"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="例如:帽子"
              maxLength="10"
            />
          </div>
          <div>
            <label className="label">图标</label>
            <div className="grid grid-cols-8 gap-2">
              {EMOJI_OPTIONS.map((em) => (
                <button
                  key={em}
                  onClick={() => setDraft({ ...draft, icon: em })}
                  className={`text-2xl rounded-lg py-1.5 ${draft.icon === em ? 'bg-brand-100 ring-2 ring-brand-400' : 'bg-slate-50'}`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">子分类(可选,如:长裤/短裤/裙子)</label>
            <div className="flex gap-2 mb-2">
              <input
                className="input flex-1"
                value={subInput}
                onChange={(e) => setSubInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSub())}
                placeholder="输入子分类后回车"
                maxLength="10"
              />
              <button onClick={addSub} className="btn-ghost">添加</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {draft.subCategories.map((s) => (
                <span key={s} className="chip bg-brand-50 text-brand-700">
                  {s}
                  <button onClick={() => setDraft({ ...draft, subCategories: draft.subCategories.filter((x) => x !== s) })} className="ml-1">
                    ✕
                  </button>
                </span>
              ))}
              {draft.subCategories.length === 0 && (
                <span className="text-xs text-slate-400">暂无子分类</span>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmId) removeCategory(confirmId)
        }}
        title="删除分类"
        message={`确定删除「${target?.name}」吗?该分类下的 ${target ? countOf(target.id) : 0} 件衣物将变为「未分类」,但不会被删除。`}
        confirmText="删除"
      />
    </div>
  )
}