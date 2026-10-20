import { useState } from 'react'
import { useApp, TRASH_TTL } from '../context/AppContext'
import TopBar from '../components/TopBar'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'

// 相对时间
function timeAgo(ts) {
  const diff = Date.now() - ts
  const day = 24 * 60 * 60 * 1000
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < day) return `${Math.floor(diff / 3600000)} 小时前`
  return `${Math.floor(diff / day)} 天前`
}

// 剩余保留天数
function daysLeft(ts) {
  const left = TRASH_TTL - (Date.now() - ts)
  return Math.max(0, Math.ceil(left / (24 * 60 * 60 * 1000)))
}

export default function TrashPage() {
  const { trash, items, restore, purge, emptyTrash } = useApp()
  const [confirmPurge, setConfirmPurge] = useState(null) // 单条 id
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [toast, setToast] = useState('')

  const notify = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2000)
  }

  const target = confirmPurge ? trash.find((x) => x.id === confirmPurge) : null

  return (
    <div className="page-enter">
      <TopBar
        title={`回收站(${trash.length})`}
        showBack
        right={
          trash.length > 0 ? (
            <button
              onClick={() => setConfirmEmpty(true)}
              className="text-rose-500 text-sm font-medium"
            >清空</button>
          ) : null
        }
      />

      <div className="px-3 py-3">
        {trash.length === 0 ? (
          <EmptyState
            icon="🗑️"
            title="回收站是空的"
            description="删除的衣物和搭配会在这里保留 30 天,期间可随时恢复"
          />
        ) : (
          <>
            <p className="text-xs text-slate-400 px-1 pb-2">
              删除的条目保留 30 天,到期自动清理
            </p>
            <div className="space-y-3">
              {trash.map((x) => {
                const isOutfit = Array.isArray(x.itemIds)
                return (
                  <div key={x.id} className="card overflow-hidden">
                    <div className="flex gap-3 p-3">
                      <div className="w-16 h-16 rounded-xl checkerboard overflow-hidden shrink-0 flex items-center justify-center bg-slate-50">
                        {isOutfit ? (
                          <div className="w-full h-full flex items-center justify-center flex-wrap gap-0.5 p-1 overflow-hidden">
                            {(x.itemIds || []).slice(0, 4).map((iid) => {
                              const it = items.find((i) => i.id === iid)
                              return it?.image ? (
                                <img key={iid} src={it.image} alt="" className="w-7 h-7 object-contain" />
                              ) : (
                                <span key={iid} className="text-xs">👕</span>
                              )
                            })}
                            {(x.itemIds || []).length === 0 && <span className="text-xs opacity-40">空</span>}
                          </div>
                        ) : x.image ? (
                          <img src={x.image} alt={x.name} className="max-w-full max-h-full object-contain p-0.5" />
                        ) : (
                          <span className="text-2xl opacity-30">🧥</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-slate-800 truncate">{x.name || '未命名'}</p>
                          <span className="chip bg-slate-100 text-slate-500 shrink-0">{isOutfit ? '搭配' : '衣物'}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          删除于 {timeAgo(x.deletedAt || Date.now())} · {daysLeft(x.deletedAt || Date.now())} 天后自动清理
                        </p>
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => { restore(x.id); notify('已恢复') }}
                            className="btn-primary py-1.5 px-3 text-xs"
                          >↩ 恢复</button>
                          <button
                            onClick={() => setConfirmPurge(x.id)}
                            className="btn py-1.5 px-3 text-xs bg-rose-50 text-rose-600"
                          >彻底删除</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-50 px-4 py-2 rounded-full bg-slate-800 text-white text-xs shadow-lg">
          {toast}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmPurge}
        onClose={() => setConfirmPurge(null)}
        onConfirm={() => confirmPurge && purge(confirmPurge)}
        title="彻底删除"
        message={`确定永久删除「${target?.name}」吗?此操作不可撤销。`}
        confirmText="永久删除"
      />

      <ConfirmDialog
        open={confirmEmpty}
        onClose={() => setConfirmEmpty(false)}
        onConfirm={emptyTrash}
        title="清空回收站"
        message={`回收站共 ${trash.length} 条,全部永久删除后无法恢复。确定继续吗?`}
        confirmText="全部删除"
      />
    </div>
  )
}
