import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import TopBar from '../components/TopBar'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { exportBackup, parseBackupFile } from '../utils/backup'

// 数据体积估算
function humanSize(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function Row({ icon, title, desc, onClick, danger, value }) {
  return (
    <button onClick={onClick} className="card p-4 w-full flex items-center gap-3 text-left active:scale-[0.99] transition">
      <span className="text-2xl shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${danger ? 'text-rose-600' : 'text-slate-800'}`}>{title}</p>
        {desc && <p className="text-xs text-slate-400 mt-0.5 leading-snug">{desc}</p>}
      </div>
      {value != null && <span className="text-xs text-slate-400 shrink-0">{value}</span>}
      <span className="text-slate-300 text-sm shrink-0">›</span>
    </button>
  )
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const { items, outfits, categories, trash, exportSnapshot, importSnapshot, wipeAll } = useApp()
  const fileRef = useRef(null)
  const [importMode, setImportMode] = useState(null) // 'merge' | 'replace' | null
  const [pendingFile, setPendingFile] = useState(null)
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState('')
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [wipeStep2, setWipeStep2] = useState(false)

  const notify = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const doExport = async () => {
    try {
      setBusy('正在生成备份…')
      const snap = await exportSnapshot()
      const r = await exportBackup(snap)
      notify(`已导出 ${r.count} 条数据(${r.sizeMB}MB)`)
    } catch (e) {
      notify('导出失败:' + (e.message || '未知错误'))
    } finally {
      setBusy('')
    }
  }

  const onPickFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const data = await parseBackupFile(file)
      setPendingFile(data)
      setImportMode('merge')
    } catch (err) {
      notify(err.message || '文件读取失败')
    }
  }

  const doImport = async () => {
    if (!pendingFile || !importMode) return
    try {
      setBusy('正在导入…')
      const stats = await importSnapshot(pendingFile, importMode)
      notify(`导入完成:衣物 ${stats.items} · 搭配 ${stats.outfits} · 分类 ${stats.categories}`)
      setPendingFile(null)
      setImportMode(null)
    } catch (e) {
      notify('导入失败:' + (e.message || '未知错误'))
    } finally {
      setBusy('')
    }
  }

  // 统计
  const imgBytes = items.reduce((s, i) => s + (i.image?.length || 0), 0)
  const catCount = new Set(items.map((i) => i.categoryId).filter(Boolean)).size

  const statCards = [
    { label: '衣物', value: items.length, icon: '👕' },
    { label: '搭配', value: outfits.length, icon: '✨' },
    { label: '分类', value: `${categories.length}`, icon: '🗂️' },
    { label: '回收站', value: trash.length, icon: '🗑️' }
  ]

  return (
    <div className="page-enter">
      <TopBar title="我的" />

      <div className="px-3 py-3 space-y-3">
        {/* 统计 */}
        <div className="grid grid-cols-4 gap-2">
          {statCards.map((s) => (
            <div key={s.label} className="card p-3 text-center">
              <p className="text-xl">{s.icon}</p>
              <p className="text-lg font-semibold text-slate-800 leading-tight mt-0.5">{s.value}</p>
              <p className="text-[11px] text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="card p-3">
          <p className="text-xs text-slate-400 mb-2">存储概况(本地 IndexedDB)</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            <span>图片体积约 <strong>{humanSize(imgBytes)}</strong></span>
            <span>已用分类 <strong>{catCount}/{categories.length}</strong></span>
            <span>数据仅存本机,不上传服务器</span>
          </div>
        </div>

        <p className="text-xs font-medium text-slate-500 px-1 pt-1">数据管理</p>

        <Row
          icon="💾"
          title="导出备份"
          desc="把全部衣物/搭配/分类导出为 JSON 文件,换设备或清理浏览器前务必先导出"
          onClick={doExport}
        />

        <Row
          icon="📥"
          title="导入备份"
          desc="选择之前导出的 JSON 文件,支持合并或覆盖"
          onClick={() => fileRef.current?.click()}
        />
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={onPickFile}
        />

        <Row
          icon="🗑️"
          title="回收站"
          desc="删除的衣物与搭配保留 30 天"
          value={trash.length > 0 ? `${trash.length} 条` : null}
          onClick={() => navigate('/trash')}
        />

        <p className="text-xs font-medium text-slate-500 px-1 pt-1">通用</p>

        <Row
          icon="🗂️"
          title="分类管理"
          desc="新增自定义分类、编辑子分类"
          onClick={() => navigate('/category')}
        />

        <Row
          icon="⚠️"
          title="清空全部数据"
          desc="删除所有衣物与搭配(保留分类),操作前请先导出备份"
          danger
          onClick={() => { setWipeStep2(false); setConfirmWipe(true) }}
        />

        <div className="text-center text-[11px] text-slate-300 pt-4 pb-2">
          智能衣橱 agent-YiGui · 数据完全本地化
        </div>
      </div>

      {/* 导入模式选择 */}
      <Modal
        open={!!pendingFile}
        onClose={() => { setPendingFile(null); setImportMode(null) }}
        title="选择导入方式"
        footer={
          <div className="flex gap-2">
            <button
              onClick={() => { setPendingFile(null); setImportMode(null) }}
              className="btn-ghost flex-1"
            >取消</button>
            <button onClick={doImport} className="btn-primary flex-1">开始导入</button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3">
            备份文件:衣物 {pendingFile?.items?.length || 0} 件 · 搭配 {pendingFile?.outfits?.length || 0} 套 · 分类 {pendingFile?.categories?.length || 0} 个
            {pendingFile?.exportedAt && <> · 导出于 {new Date(pendingFile.exportedAt).toLocaleString()}</>}
          </p>
          <button
            onClick={() => setImportMode('merge')}
            className={`w-full p-3 rounded-xl border text-left transition ${
              importMode === 'merge' ? 'border-brand-400 bg-brand-50' : 'border-slate-200 bg-white'
            }`}
          >
            <p className="text-sm font-medium text-slate-800">合并导入(推荐)</p>
            <p className="text-xs text-slate-400 mt-0.5">保留现有数据,备份里的条目覆盖同 ID 记录</p>
          </button>
          <button
            onClick={() => setImportMode('replace')}
            className={`w-full p-3 rounded-xl border text-left transition ${
              importMode === 'replace' ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white'
            }`}
          >
            <p className="text-sm font-medium text-rose-600">覆盖导入</p>
            <p className="text-xs text-slate-400 mt-0.5">清空当前所有数据,完全以备份文件为准</p>
          </button>
        </div>
      </Modal>

      {/* 清空数据:二次确认 */}
      <ConfirmDialog
        open={confirmWipe && !wipeStep2}
        onClose={() => setConfirmWipe(false)}
        onConfirm={() => setWipeStep2(true)}
        title="清空全部数据"
        message={`将删除 ${items.length} 件衣物、${outfits.length} 套搭配(分类保留)。建议先「导出备份」。确定继续吗?`}
        confirmText="继续"
      />
      <ConfirmDialog
        open={confirmWipe && wipeStep2}
        onClose={() => { setConfirmWipe(false); setWipeStep2(false) }}
        onConfirm={async () => {
          await wipeAll()
          setConfirmWipe(false)
          notify('已清空全部衣物与搭配')
        }}
        title="最后确认"
        message="此操作不可撤销,且无法从回收站恢复。确定清空吗?"
        confirmText="确认清空"
      />

      {(busy || toast) && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-50 px-4 py-2 rounded-full bg-slate-800 text-white text-xs shadow-lg max-w-[90vw] truncate">
          {busy || toast}
        </div>
      )}
    </div>
  )
}
