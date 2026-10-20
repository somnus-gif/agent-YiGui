import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import TopBar from '../components/TopBar'
import { aiCutout, MODEL_PRESETS } from '../utils/cutoutAI'
import { SEASONS, STYLES } from '../utils/constants'

/**
 * 批量上传:一次选多张图 → 后台串行 AI 抠图 → 统一填属性 → 批量入库
 * 说明:AI 推理较吃内存,刻意串行执行,避免低端机同时跑多个 ONNX 会话崩溃。
 */

const MAX_EDGE = 900
const MAX_COUNT = 20

function compressImage(file, maxEdge = MAX_EDGE) {
  return new Promise((resolve, reject) => {
    if (!file || !file.size) return reject(new Error('文件为空'))
    if (file.size > 20 * 1024 * 1024) return reject(new Error(`「${file.name}」过大(>20MB)`))
    if (!/^image\//i.test(file.type || '') && !/\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name || '')) {
      return reject(new Error(`「${file.name}」格式不支持`))
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error(`「${file.name}」已损坏`))
      img.onload = () => {
        let w = img.naturalWidth, h = img.naturalHeight
        if (!w || !h) return reject(new Error('图片尺寸无效'))
        if (Math.max(w, h) > maxEdge) {
          const r = maxEdge / Math.max(w, h)
          w = Math.round(w * r); h = Math.round(h * r)
        }
        const cv = document.createElement('canvas')
        cv.width = w; cv.height = h
        const ctx = cv.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, w, h)
        resolve(cv.toDataURL('image/jpeg', 0.9))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

// 把软 alpha 合成回带透明的 PNG dataURL
function applyAlphaToDataUrl(srcDataUrl, alpha, w, h) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onerror = () => reject(new Error('结果合成失败'))
    img.onload = () => {
      const cv = document.createElement('canvas')
      cv.width = w; cv.height = h
      const ctx = cv.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0, w, h)
      const d = ctx.getImageData(0, 0, w, h)
      for (let i = 0; i < alpha.length; i++) d.data[i * 4 + 3] = alpha[i]
      ctx.putImageData(d, 0, 0)
      resolve(cv.toDataURL('image/png'))
    }
    img.src = srcDataUrl
  })
}

function guessName(file) {
  return (file.name || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(img|image|photo|pic|whatsapp|weixin|mmexport|screenshot)\b/gi, '')
    .trim()
    .slice(0, 20)
}

export default function BatchUploadPage() {
  const { categories, addItem } = useApp()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [jobs, setJobs] = useState([])   // {id, name, file, src, status, image, error}
  const [phase, setPhase] = useState('pick') // pick | processing | review
  const [modelSize, setModelSize] = useState('small')
  const [useAI, setUseAI] = useState(true)
  const [progress, setProgress] = useState({ done: 0, total: 0, stage: '' })
  const [common, setCommon] = useState({
    categoryId: categories[0]?.id || '',
    season: '四季',
    style: '休闲'
  })

  const onPick = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    const usable = files.slice(0, MAX_COUNT)
    const initial = usable.map((f, i) => ({
      id: `b-${Date.now()}-${i}`,
      name: guessName(f) || `衣物 ${i + 1}`,
      file: f,
      src: null,
      status: 'wait', // wait | loading | processing | done | error
      image: null,
      error: ''
    }))
    setJobs(initial)
    setPhase('processing')
    setProgress({ done: 0, total: initial.length, stage: '读取图片…' })

    // 串行处理:先压缩,再抠图
    const total = initial.length
    for (let i = 0; i < initial.length; i++) {
      const job = initial[i]
      setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: 'loading' } : j)))
      setProgress({ done: i, total, stage: `处理第 ${i + 1}/${total} 张…` })
      let src
      try {
        src = await compressImage(job.file)
      } catch (err) {
        setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: 'error', error: err.message } : j)))
        continue
      }
      if (!useAI) {
        setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: 'done', src, image: src } : j)))
        continue
      }
      setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: 'processing', src } : j)))
      try {
        const { alpha, width, height } = await aiCutout(src, {
          model: modelSize,
          onProgress: (stage) => setProgress({ done: i, total, stage: `第 ${i + 1}/${total} 张:${stage}` })
        })
        const url = await applyAlphaToDataUrl(src, alpha, width, height)
        setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: 'done', image: url } : j)))
      } catch (err) {
        // AI 失败不阻断批次,回退原图,用户可在衣橱里再单独编辑
        setJobs((prev) => prev.map((j) => (
          j.id === job.id ? { ...j, status: 'done', image: src, error: 'AI 抠图失败,已用原图' } : j
        )))
      }
    }
    setProgress({ done: total, total, stage: '全部处理完成' })
    setPhase('review')
  }

  const updateJob = (id, patch) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)))
  }
  const removeJob = (id) => setJobs((prev) => prev.filter((j) => j.id !== id))

  const applyCommonToAll = () => {
    setJobs((prev) => prev.map((j) => ({ ...j, categoryId: common.categoryId, season: common.season, style: common.style })))
  }

  const selected = jobs.filter((j) => j.status === 'done' && !j.__skip)

  const saveAll = async () => {
    const targets = jobs.filter((j) => j.status === 'done' && !j.__skip)
    if (!targets.length) { alert('没有可保存的衣物'); return }
    for (const j of targets) {
      await addItem({
        name: (j.name || '未命名').trim().slice(0, 20),
        categoryId: j.categoryId || common.categoryId,
        subCategory: '',
        season: j.season || common.season,
        style: j.style || common.style,
        notes: j.notes || '',
        image: j.image || j.src
      })
    }
    navigate('/', { replace: true })
  }

  if (phase === 'pick') {
    return (
      <div className="page-enter">
        <TopBar title="批量添加" showBack />
        <div className="px-4 py-6">
          <div className="flex flex-col items-center justify-center py-8">
            <div className="text-6xl mb-3">📦</div>
            <p className="text-slate-700 font-medium mb-1">一次上传多件衣物</p>
            <p className="text-xs text-slate-400 mb-6 text-center px-4 leading-relaxed">
              最多 {MAX_COUNT} 张,系统会自动压缩并逐张抠图<br />
              完成后可统一设置分类/季节/风格,再批量入库
            </p>

            <label className="relative inline-flex items-center justify-center h-12 px-8 rounded-2xl bg-brand-500 text-white font-medium shadow-lg shadow-brand-500/30 active:scale-95 transition cursor-pointer">
              <span className="pointer-events-none">📁 选择多张图片</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={onPick}
              />
            </label>
          </div>

          <div className="card p-4 mt-2 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800">AI 自动抠图</p>
                <p className="text-xs text-slate-400 mt-0.5">关闭则不抠图,直接保存原图</p>
              </div>
              <button
                onClick={() => setUseAI((v) => !v)}
                className={`w-12 h-7 rounded-full transition relative ${useAI ? 'bg-brand-500' : 'bg-slate-300'}`}
              >
                <span className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${useAI ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
            {useAI && (
              <div>
                <label className="label">模型档位</label>
                <div className="flex gap-2">
                  {Object.entries(MODEL_PRESETS).map(([key, p]) => (
                    <button
                      key={key}
                      onClick={() => setModelSize(key)}
                      className={`flex-1 py-2 px-3 rounded-xl text-xs border transition ${
                        modelSize === key ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      <p className="font-medium">{p.label}</p>
                      <p className="text-slate-400 mt-0.5">{p.size}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'processing') {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
    return (
      <div className="page-enter">
        <TopBar title="批量处理中" showBack />
        <div className="px-4 py-10 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center shadow-lg animate-pulse">
            <span className="text-white text-3xl">✨</span>
          </div>
          <p className="text-slate-700 font-medium mt-4">{progress.stage}</p>
          <div className="w-64 h-2 bg-slate-200 rounded-full mt-4 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-300"
              style={{ width: `${pct}%` }} />
          </div>
          <p className="text-slate-400 text-xs mt-2">{progress.done} / {progress.total}</p>
          <p className="text-slate-400 text-xs mt-6 text-center px-6 leading-relaxed">
            首次使用需下载 AI 模型(约 {MODEL_PRESETS[modelSize].size}),之后每张秒级完成<br />
            请勿关闭页面
          </p>
          <div className="w-full mt-8 space-y-2 max-h-[40vh] overflow-y-auto">
            {jobs.map((j) => (
              <div key={j.id} className="card p-2.5 flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                  {j.src ? <img src={j.src} alt="" className="max-w-full max-h-full object-contain" /> : <span className="text-lg">🖼️</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 truncate">{j.name}</p>
                  <p className="text-xs text-slate-400">
                    {j.status === 'wait' && '排队中'}
                    {j.status === 'loading' && '压缩中…'}
                    {j.status === 'processing' && 'AI 抠图中…'}
                    {j.status === 'done' && (j.error ? `⚠️ ${j.error}` : '✅ 完成')}
                    {j.status === 'error' && `❌ ${j.error}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // review
  return (
    <div className="page-enter">
      <TopBar
        title={`批量确认(${selected.length})`}
        showBack
        right={<button onClick={saveAll} className="text-brand-600 text-sm font-medium">全部保存</button>}
      />
      <div className="px-4 py-3 space-y-3">
        <div className="card p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-slate-700">统一设置(应用到全部)</p>
            <button onClick={applyCommonToAll} className="text-xs text-brand-600 font-medium">应用</button>
          </div>
          <div className="space-y-2">
            <select
              className="input"
              value={common.categoryId}
              onChange={(e) => setCommon({ ...common, categoryId: e.target.value })}
            >
              {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
            <div className="flex gap-2">
              <select className="input flex-1" value={common.season}
                onChange={(e) => setCommon({ ...common, season: e.target.value })}>
                {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="input flex-1" value={common.style}
                onChange={(e) => setCommon({ ...common, style: e.target.value })}>
                {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        {jobs.map((j) => (
          <div key={j.id} className={`card p-3 ${j.__skip ? 'opacity-40' : ''}`}>
            <div className="flex gap-3">
              <div className="w-20 h-20 rounded-xl checkerboard overflow-hidden shrink-0 flex items-center justify-center border border-slate-100">
                {j.image || j.src
                  ? <img src={j.image || j.src} alt={j.name} className="max-w-full max-h-full object-contain p-0.5" />
                  : <span className="text-2xl opacity-30">🧥</span>}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <input
                  className="input"
                  value={j.name}
                  onChange={(e) => updateJob(j.id, { name: e.target.value })}
                  maxLength={20}
                  placeholder="衣物名称"
                />
                <div className="flex gap-2">
                  <select
                    className="input flex-1 text-xs"
                    value={j.categoryId || common.categoryId}
                    onChange={(e) => updateJob(j.id, { categoryId: e.target.value })}
                  >
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
                  <select
                    className="input w-20 text-xs"
                    value={j.season || common.season}
                    onChange={(e) => updateJob(j.id, { season: e.target.value })}
                  >
                    {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select
                    className="input w-20 text-xs"
                    value={j.style || common.style}
                    onChange={(e) => updateJob(j.id, { style: e.target.value })}
                  >
                    {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {j.error && <p className="text-[11px] text-amber-600">⚠️ {j.error}</p>}
              </div>
              <button
                onClick={() => removeJob(j.id)}
                className="text-slate-300 active:text-rose-500 text-lg self-start"
                title="移除"
              >✕</button>
            </div>
          </div>
        ))}

        {jobs.length === 0 && (
          <div className="card p-8 text-center text-slate-400 text-sm">全部已移除,请返回重新选择图片</div>
        )}

        <button onClick={saveAll} className="btn-primary w-full">
          保存 {selected.length} 件到衣橱
        </button>
      </div>
    </div>
  )
}
