import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import TopBar from '../components/TopBar'
import CutoutCanvas from '../components/CutoutCanvas'
import { SEASONS, STYLES } from '../utils/constants'

function compressImage(file, maxEdge = 1200) {
  return new Promise((resolve, reject) => {
    let settled = false
    let t = null
    const done = (ok, payload) => {
      if (settled) return
      settled = true
      if (t) { clearTimeout(t); t = null }
      if (ok) resolve(payload)
      else reject(payload)
    }
    t = setTimeout(() => done(false, new Error('图片处理超时,请换一张较小的图片重试')), 15000)

    if (!file || !file.size) {
      done(false, new Error('文件为空,请重新选择图片'))
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      done(false, new Error('图片过大(>20MB),请先压缩后再上传'))
      return
    }
    if (!/^image\//i.test(file.type || '') && !/\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name || '')) {
      done(false, new Error('不支持的文件类型,请上传 JPG/PNG/WebP 图片'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => done(false, new Error('读取文件失败,请重试'))
    reader.onload = () => {
      if (settled) return
      const img = new Image()
      let imgSettled = false
      const imgDone = (ok, p) => {
        if (imgSettled || settled) return
        imgSettled = true
        if (!ok) { done(false, p); return }
        try {
          let w = Number(img.naturalWidth) || Number(img.width) || 0
          let h = Number(img.naturalHeight) || Number(img.height) || 0
          if (!w || !h || w <= 0 || h <= 0) throw new Error('图片尺寸无效,请换一张图片')
          if (w > maxEdge || h > maxEdge) {
            const r = maxEdge / Math.max(w, h)
            w = Math.round(w * r)
            h = Math.round(h * r)
          }
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (!ctx) throw new Error('浏览器不支持 Canvas')
          ctx.drawImage(img, 0, 0, w, h)
          const out = canvas.toDataURL('image/jpeg', 0.9)
          if (!out || out.length < 50) throw new Error('压缩后图片为空')
          done(true, out)
        } catch (e) {
          done(false, new Error('处理图片失败:' + (e.message || '未知错误')))
        }
      }

      const it = setTimeout(() => imgDone(false, new Error('图片解析超时,请换一张图片')), 12000)
      img.onerror = () => { clearTimeout(it); imgDone(false, new Error('图片格式错误或已损坏,请换一张')) }
      img.onload = () => { clearTimeout(it); imgDone(true) }
      img.src = reader.result
      if (img.complete && img.naturalWidth && !imgSettled && !settled) {
        clearTimeout(it); imgDone(true)
      }
    }
    try {
      reader.readAsDataURL(file)
    } catch (e) {
      done(false, new Error('读取文件失败:' + (e.message || '未知错误')))
    }
  })
}

export default function UploadPage() {
  const { categories, addItem } = useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [step, setStep] = useState('pick')
  const [error, setError] = useState('')
  const [imageSrc, setImageSrc] = useState(null)
  const [cutout, setCutout] = useState(null)
  const [form, setForm] = useState(() => ({
    name: '',
    categoryId: params.get('cat') || '',
    subCategory: '',
    season: '四季',
    style: '休闲',
    notes: ''
  }))

  useEffect(() => {
    setForm((f) => f.categoryId ? f : { ...f, categoryId: categories[0]?.id || '' })
  }, [categories])

  const onPickFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setStep('loading')
    try {
      const dataUrl = await compressImage(file, 1200)
      setImageSrc(dataUrl)
      setCutout(null)
      setStep('cutout')
    } catch (err) {
      setError(err.message || '图片加载失败,请重试')
      setStep('pick')
    }
  }

  const onCutoutDone = (url) => {
    setCutout(url)
    setStep('form')
  }

  const useOriginal = () => {
    setCutout(imageSrc)
    setStep('form')
  }

  const save = async () => {
    if (!form.name.trim()) {
      alert('请填写衣物名称')
      return
    }
    try {
      const rec = await addItem({
        name: form.name.trim(),
        categoryId: form.categoryId,
        subCategory: form.subCategory,
        season: form.season,
        style: form.style,
        notes: form.notes,
        image: cutout || imageSrc
      })
      navigate(`/item/${rec.id}`, { replace: true })
    } catch (err) {
      setError('保存失败:' + (err.message || '未知错误'))
    }
  }

  const currentCat = categories.find((c) => c.id === form.categoryId)
  const subs = currentCat?.subCategories || []

  return (
    <div className="page-enter">
      <TopBar title="添加衣物" showBack />

      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center gap-1 text-xs">
          {[
            ['pick', '1 选图'],
            ['loading', '2 处理'],
            ['cutout', '3 抠图'],
            ['form', '4 保存']
          ].map(([k, label]) => (
            <div key={k} className="flex items-center gap-1 flex-1">
              <div className={`h-2 flex-1 rounded-full ${step === k ? 'bg-brand-500' : ['pick','loading','cutout','form'].indexOf(step) > ['pick','loading','cutout','form'].indexOf(k) ? 'bg-brand-200' : 'bg-slate-200'}`} />
              <span className={`whitespace-nowrap ${step === k ? 'text-brand-600 font-semibold' : 'text-slate-400'}`}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 py-3">
        {step === 'pick' && (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="text-6xl mb-3">📸</div>
            <p className="text-slate-700 font-medium mb-1">上传一张衣物照片</p>
            <p className="text-xs text-slate-400 mb-5 text-center px-4 leading-relaxed">
              支持 JPG / PNG / WebP，点击下方按钮从相册/相机选图<br />
              上传后 AI 将自动识别衣服主体并去除背景<br />
              可通过「🖌 加选」「🧽 减选」画笔手动微调边缘
            </p>

            <label className="relative inline-flex items-center justify-center h-12 px-8 rounded-2xl bg-brand-500 text-white font-medium shadow-lg shadow-brand-500/30 active:scale-95 transition select-none cursor-pointer">
              <span className="pointer-events-none">📁 选择图片</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={onPickFile}
              />
            </label>

            {error && <p className="text-rose-500 text-sm mt-3 text-center px-4">{error}</p>}
          </div>
        )}

        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-14 h-14 rounded-full border-4 border-slate-200 border-t-brand-500 animate-spin" />
            <p className="text-slate-700 font-medium mt-4">正在处理图片…</p>
            <p className="text-slate-400 text-xs mt-1">大图请稍候，超过 15 秒会自动提示错误</p>
            <button
              onClick={() => { setStep('pick'); setError('') }}
              className="btn-ghost mt-5"
            >取消并返回选图</button>
          </div>
        )}

        {step === 'cutout' && imageSrc && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-slate-700">✨ 智能抠图（参考 vivo 相册）</p>
              <button
                onClick={() => { setImageSrc(null); setCutout(null); setStep('pick') }}
                className="text-xs text-slate-400 active:text-rose-500"
              >换一张图 ↻</button>
            </div>
            <CutoutCanvas
              imageSrc={imageSrc}
              onDone={onCutoutDone}
              onCancel={() => {
                setImageSrc(null)
                setCutout(null)
                setStep('pick')
              }}
            />
            <button onClick={useOriginal} className="btn-ghost w-full mt-3">
              跳过抠图，使用原图 →
            </button>
          </div>
        )}

        {step === 'form' && (
          <div className="space-y-4">
            <div className="card p-4 flex justify-center checkerboard">
              <img src={cutout || imageSrc} alt="预览" className="max-h-64 object-contain" />
            </div>

            <div>
              <label className="label">名称 <span className="text-rose-500">*</span></label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如:白色纯棉T恤"
                maxLength={20}
              />
            </div>

            <div>
              <label className="label">分类</label>
              <select
                className="input"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value, subCategory: '' })}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>

            {subs.length > 0 && (
              <div>
                <label className="label">子分类</label>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setForm({ ...form, subCategory: '' })}
                    className={`chip ${!form.subCategory ? 'bg-brand-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
                  >不选</button>
                  {subs.map((s) => (
                    <button
                      key={s}
                      onClick={() => setForm({ ...form, subCategory: s })}
                      className={`chip ${form.subCategory === s ? 'bg-brand-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
                    >{s}</button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="label">季节</label>
              <div className="flex gap-2 flex-wrap">
                {SEASONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setForm({ ...form, season: s })}
                    className={`chip ${form.season === s ? 'bg-emerald-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
                  >{s}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">风格</label>
              <div className="flex gap-2 flex-wrap">
                {STYLES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setForm({ ...form, style: s })}
                    className={`chip ${form.style === s ? 'bg-violet-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
                  >{s}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">备注(可选)</label>
              <textarea
                className="input min-h-[80px] resize-none"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="品牌、尺码、购入价等"
                maxLength={100}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setStep('cutout')} className="btn-ghost flex-1">← 重新抠图</button>
              <button onClick={save} className="btn-primary flex-1">✓ 保存到衣橱</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}