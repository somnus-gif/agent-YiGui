// 图片比价 → 确认搜索词
//
// 图片进来后自动提取主色,品类给一排芯片点选(衣橱来源会预填该衣物的分类),
// 拼成「白色T恤」这种电商友好的搜索词,用户可以直接改,再拿去比价。

import { useState, useEffect } from 'react'
import { analyzeImage, SHOP_CATEGORIES, CATEGORY_TO_SHOP, buildSearchKeyword } from '../utils/imageAnalyze'

export default function ImageKeywordPicker({ imageSrc, item, onConfirm, onClose }) {
  const [analyzing, setAnalyzing] = useState(true)
  const [colors, setColors] = useState([])     // [{name,hex}]
  const [color, setColor] = useState('')
  const [category, setCategory] = useState('')
  const [keyword, setKeyword] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const a = await analyzeImage(imageSrc)
        if (!alive) return
        setColors(a.palette)
        setColor(a.main)
      } catch (e) {
        if (alive) setErr(e.message || '颜色识别失败')
      } finally {
        if (alive) setAnalyzing(false)
      }
    })()
    return () => { alive = false }
  }, [imageSrc])

  // 品类:衣橱来源用衣物分类,否则留空让用户点
  useEffect(() => {
    if (!item) return
    const mapped = CATEGORY_TO_SHOP[item.category] ?? ''
    if (mapped) setCategory(mapped)
    else if (item.name) setCategory(item.name.slice(0, 6))
  }, [item])

  // 颜色或品类变化时自动重拼搜索词(用户手改过就不覆盖)
  useEffect(() => {
    if (analyzing) return
    setKeyword(buildSearchKeyword(color, category))
  }, [color, category, analyzing])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full sm:max-w-md bg-white rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto page-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-slate-900 mb-0.5">📷 图片比价</h3>
        <p className="text-xs text-slate-400 mb-3">颜色已从图片自动提取,品类点一下即可,搜索词可以改</p>

        <div className="flex gap-3 mb-4">
          <div className="w-24 h-24 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 checkerboard">
            <img src={imageSrc} alt="待比价" className="max-w-full max-h-full object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-slate-400 mb-1">识别到的颜色</p>
            {analyzing ? (
              <p className="text-xs text-slate-400">分析中…</p>
            ) : err ? (
              <p className="text-xs text-amber-600">{err},可手动输入</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {colors.map((c) => (
                  <button
                    key={c.name + c.hex}
                    onClick={() => setColor(c.name)}
                    className={`chip border flex items-center gap-1 active:scale-95 transition ${
                      color === c.name
                        ? 'bg-teal-50 text-teal-700 border-teal-200'
                        : 'bg-slate-50 text-slate-500 border-slate-100'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full border border-black/10" style={{ background: c.hex }} />
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            {item?.name && <p className="text-[10px] text-slate-400 mt-2 truncate">来自衣橱:{item.name}</p>}
          </div>
        </div>

        <p className="text-[10px] text-slate-400 mb-1.5">品类</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {SHOP_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`chip border active:scale-95 transition ${
                category === c
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-slate-50 text-slate-500 border-slate-100'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <p className="text-[10px] text-slate-400 mb-1.5">搜索词(可直接修改)</p>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="例如:白色T恤"
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-teal-400 mb-4"
        />

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-sm active:scale-95 transition"
          >
            取消
          </button>
          <button
            onClick={() => keyword.trim() && onConfirm(keyword.trim())}
            disabled={!keyword.trim()}
            className="flex-[2] py-2.5 rounded-xl bg-teal-600 text-white text-sm font-medium active:scale-95 transition disabled:opacity-40"
          >
            开始比价
          </button>
        </div>
      </div>
    </div>
  )
}
