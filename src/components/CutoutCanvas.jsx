import { useEffect, useRef, useState, useCallback } from 'react'

const MAX_SIZE = 1000
const LOAD_TIMEOUT = 10000
const AUTO_TOLERANCE = 28 // vivo 风格:AI 自动识别使用固定容差,用户不需要调

/**
 * vivo 相册抠图还原版
 * 交互流程(vivo OriginOS 相册):
 *   1. 图片加载完 → 自动触发 AI 识别(显示「AI 识别中…」遮罩)
 *   2. 识别完成 → 背景透明(棋盘格),主体边缘蓝色光晕标记
 *   3. 底部横向工具栏:加选🖌 / 减选🧽 / 反选🔄 / 撤销↩ / 重置🔄
 *   4. 涂抹时画笔是半透明彩色圆形跟随手指(加选=绿,减选=红)
 *   5. 无容差滑块(vivo 用户不调容差,AI 自动判断)
 *   6. 右下角「✓ 保存抠图」按钮导出 PNG
 */

// ---- 算法工具 ----

function colorDist2(data, i, r0, g0, b0, a0) {
  const idx = i * 4
  const dr = data[idx] - r0, dg = data[idx + 1] - g0, db = data[idx + 2] - b0, da = data[idx + 3] - a0
  return dr * dr + dg * dg + db * db + da * da
}

// 扫描线 floodfill:从种子点按容差扩展相似色,返回 Uint8Array 选中 mask(1=选中)
function scanlineFloodFill(data, w, h, startX, startY, tolerance) {
  const matched = new Uint8Array(w * h)
  const visited = new Uint8Array(w * h)
  const idx0 = (startY * w + startX) * 4
  const r0 = data[idx0], g0 = data[idx0 + 1], b0 = data[idx0 + 2], a0 = data[idx0 + 3]
  const tol2 = tolerance * tolerance * 4
  const stack = [[startX, startY]]
  while (stack.length) {
    const [x, y] = stack.pop()
    let curX = x
    while (curX >= 0 && !visited[y * w + curX] && colorDist2(data, y * w + curX, r0, g0, b0, a0) <= tol2) curX--
    curX++
    let spanUp = false, spanDown = false
    while (curX < w && !visited[y * w + curX] && colorDist2(data, y * w + curX, r0, g0, b0, a0) <= tol2) {
      const i = y * w + curX
      visited[i] = 1; matched[i] = 1
      if (y > 0) {
        const upI = (y - 1) * w + curX
        if (!visited[upI] && colorDist2(data, upI, r0, g0, b0, a0) <= tol2) {
          if (!spanUp) { stack.push([curX, y - 1]); spanUp = true }
        } else spanUp = false
      }
      if (y < h - 1) {
        const dnI = (y + 1) * w + curX
        if (!visited[dnI] && colorDist2(data, dnI, r0, g0, b0, a0) <= tol2) {
          if (!spanDown) { stack.push([curX, y + 1]); spanDown = true }
        } else spanDown = false
      }
      curX++
    }
  }
  return matched
}

function multiSeedFloodFill(data, w, h, seeds, tolerance) {
  const total = new Uint8Array(w * h)
  for (const [sx, sy] of seeds) {
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue
    const m = scanlineFloodFill(data, w, h, sx, sy, tolerance)
    for (let i = 0; i < total.length; i++) if (m[i]) total[i] = 1
  }
  return total
}

// 对 mask 做一次简单腐蚀(1px),去除孤立噪点
function erodeMask(mask, w, h) {
  const out = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (mask[i] && mask[i - 1] && mask[i + 1] && mask[i - w] && mask[i + w]) out[i] = 1
    }
  }
  return out
}

// 对 mask 做 2px 膨胀,填补边缘小缝隙
function dilateMask(morphIn, w, h, passes = 2) {
  let cur = morphIn.slice()
  for (let p = 0; p < passes; p++) {
    const next = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (cur[i]) { next[i] = 1; continue }
        if ((x > 0 && cur[i - 1]) || (x < w - 1 && cur[i + 1]) ||
            (y > 0 && cur[i - w]) || (y < h - 1 && cur[i + w])) next[i] = 1
      }
    }
    cur = next
  }
  return cur
}

// 边缘像素:主体非透明像素中,四邻有透明的
function computeEdge(mask, w, h) {
  const edge = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (mask[i]) {
        if ((x > 0 && !mask[i - 1]) || (x < w - 1 && !mask[i + 1]) ||
            (y > 0 && !mask[i - w]) || (y < h - 1 && !mask[i + w])) {
          edge[i] = 1
        }
      }
    }
  }
  return edge
}

// 画笔涂抹:将圆形区域内的像素加入或移除 mask
function paintCircle(mask, w, h, cx, cy, radius, add) {
  const r = Math.ceil(radius)
  const r2 = r * r
  const x0 = Math.max(0, cx - r), x1 = Math.min(w - 1, cx + r)
  const y0 = Math.max(0, cy - r), y1 = Math.min(h - 1, cy + r)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy
      if (dx * dx + dy * dy <= r2) mask[y * w + x] = add ? 1 : 0
    }
  }
}

function paintLine(mask, w, h, x0, y0, x1, y1, radius, add) {
  const dx = x1 - x0, dy = y1 - y0
  const dist = Math.hypot(dx, dy)
  const step = Math.max(1, radius / 3)
  const steps = Math.max(1, Math.ceil(dist / step))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    paintCircle(mask, w, h, Math.round(x0 + dx * t), Math.round(y0 + dy * t), radius, add)
  }
}

export default function CutoutCanvas({ imageSrc, onDone, onCancel }) {
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const previewRef = useRef(null)
  const sourceRef = useRef(null)
  const ctxRef = useRef(null)
  const maskRef = useRef(null)
  const historyRef = useRef([])
  const redoStackRef = useRef([])
  const cursorRef = useRef(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef(null)
  const rafRef = useRef(null)
  const [tool, setTool] = useState('add')
  const [brush, setBrush] = useState(40)
  const [loading, setLoading] = useState(true)
  const [aiThinking, setAiThinking] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('正在加载图片…')
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [autoDone, setAutoDone] = useState(false)

  const applyMask = useCallback((mask) => {
    const ctx = ctxRef.current
    const src = sourceRef.current
    const canvas = canvasRef.current
    if (!ctx || !src || !canvas || !mask) return
    const w = canvas.width, h = canvas.height
    ctx.save()
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(src, 0, 0)
    ctx.globalCompositeOperation = 'destination-out'
    const img = ctx.getImageData(0, 0, w, h)
    const d = img.data
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) d[i * 4 + 3] = 0
    }
    ctx.putImageData(img, 0, 0)
    ctx.restore()
    drawBlueHalo(mask, w, h)
    maskRef.current = mask
  }, [])

  const drawBlueHalo = useCallback((mask, w, h) => {
    const overlay = overlayRef.current
    if (!overlay) return
    overlay.width = w; overlay.height = h
    const octx = overlay.getContext('2d')
    if (!octx) return
    octx.clearRect(0, 0, w, h)
    const edge = computeEdge(mask, w, h)
    const wide = dilateMask(edge, w, h, 3)
    const img = octx.createImageData(w, h)
    const d = img.data
    for (let i = 0; i < wide.length; i++) {
      if (wide[i]) {
        if (edge[i]) {
          d[i * 4] = 96; d[i * 4 + 1] = 165; d[i * 4 + 2] = 250; d[i * 4 + 3] = 220
        } else {
          d[i * 4] = 59; d[i * 4 + 1] = 130; d[i * 4 + 2] = 246; d[i * 4 + 3] = 100
        }
      }
    }
    octx.putImageData(img, 0, 0)
  }, [])

  const showCursor = (p) => {
    const el = cursorRef.current
    const canvas = canvasRef.current
    if (!el || !canvas || !p) { if (el) el.style.opacity = '0'; return }
    const scale = p.rect.width > 0 ? canvas.width / p.rect.width : 1
    const displayR = Math.max(10, Math.min(60, (brush / 2) / scale))
    el.style.opacity = '0.7'
    el.style.left = p.dx + 'px'
    el.style.top = p.dy + 'px'
    el.style.width = displayR * 2 + 'px'
    el.style.height = displayR * 2 + 'px'
    el.style.borderRadius = '50%'
    el.style.borderColor = tool === 'add' ? '#10b981' : '#f43f5e'
    el.style.backgroundColor = tool === 'add' ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)'
    el.style.borderWidth = '2px'
  }
  const hideCursor = () => { if (cursorRef.current) cursorRef.current.style.opacity = '0' }

  const saveHistory = useCallback(() => {
    if (!maskRef.current) return
    historyRef.current.push(new Uint8Array(maskRef.current))
    if (historyRef.current.length > 30) historyRef.current.shift()
    redoStackRef.current = []
    setCanUndo(true); setCanRedo(false)
  }, [])

  const undo = () => {
    if (historyRef.current.length === 0) return
    const cur = maskRef.current
    if (cur) redoStackRef.current.push(new Uint8Array(cur))
    const prev = historyRef.current.pop()
    applyMask(prev)
    setCanUndo(historyRef.current.length > 0)
    setCanRedo(true)
  }
  const redo = () => {
    if (redoStackRef.current.length === 0) return
    const cur = maskRef.current
    if (cur) historyRef.current.push(new Uint8Array(cur))
    const next = redoStackRef.current.pop()
    applyMask(next)
    setCanUndo(true)
    setCanRedo(redoStackRef.current.length > 0)
  }

  const reset = () => {
    const src = sourceRef.current
    const canvas = canvasRef.current
    const ctx = ctxRef.current
    if (!src || !canvas || !ctx) return
    saveHistory()
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(src, 0, 0)
    const full = new Uint8Array(canvas.width * canvas.height).fill(1)
    maskRef.current = full
    if (overlayRef.current) {
      const octx = overlayRef.current.getContext('2d')
      if (octx) octx.clearRect(0, 0, overlayRef.width, overlayRef.height)
    }
    setHint('🔄 已重置,可重新使用 AI 识别或手动涂抹')
  }

  const runAI = useCallback(() => {
    const ctx = ctxRef.current
    const canvas = canvasRef.current
    if (!ctx || !canvas) return
    const w = canvas.width, h = canvas.height
    if (w <= 0 || h <= 0) return
    setAiThinking(true)
    setHint('🤖 AI 正在识别主体…')
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      try {
        const src = sourceRef.current
        if (!src) throw new Error('原图丢失')
        const srcCtx = src.getContext('2d')
        if (!srcCtx) throw new Error('无法读取原图')
        const img = srcCtx.getImageData(0, 0, w, h)
        const margin = 4
        const seeds = [
          [margin, margin], [w - 1 - margin, margin], [margin, h - 1 - margin], [w - 1 - margin, h - 1 - margin],
          [Math.floor(w / 2), margin], [Math.floor(w / 2), h - 1 - margin],
          [margin, Math.floor(h / 2)], [w - 1 - margin, Math.floor(h / 2)]
        ]
        let bgMask = multiSeedFloodFill(img.data, w, h, seeds, AUTO_TOLERANCE)
        bgMask = erodeMask(bgMask, w, h)
        bgMask = dilateMask(bgMask, w, h, 2)
        const subjectMask = new Uint8Array(w * h)
        let subjectCount = 0
        for (let i = 0; i < bgMask.length; i++) {
          subjectMask[i] = bgMask[i] ? 0 : 1
          if (subjectMask[i]) subjectCount++
        }
        const ratio = subjectCount / subjectMask.length
        if (ratio > 0.92) {
          setHint('⚠️ 背景识别偏少,建议调小画笔后用「减选」手动涂抹多余区域')
        } else if (ratio < 0.08) {
          setHint('⚠️ 主体识别偏少,建议用「加选」画笔涂抹补充主体')
        } else {
          setHint(`✅ AI 已识别主体(占图 ${Math.round(ratio * 100)}%),可画笔微调边缘`)
        }
        saveHistory()
        applyMask(subjectMask)
        setAutoDone(true)
      } catch (e) {
        setHint('❌ AI 识别失败:' + (e.message || '未知错误'))
        const full = new Uint8Array(w * h).fill(1)
        applyMask(full)
      } finally {
        setAiThinking(false)
      }
    })
  }, [applyMask, saveHistory])

  const invert = () => {
    const canvas = canvasRef.current
    if (!canvas || !maskRef.current) return
    saveHistory()
    const w = canvas.width, h = canvas.height
    const inv = new Uint8Array(w * h)
    for (let i = 0; i < maskRef.current.length; i++) inv[i] = maskRef.current[i] ? 0 : 1
    applyMask(inv)
    setHint('🔄 已反选')
  }

  const reAI = () => {
    const src = sourceRef.current
    const canvas = canvasRef.current
    const ctx = ctxRef.current
    if (!src || !canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(src, 0, 0)
    historyRef.current = []
    redoStackRef.current = []
    setCanUndo(false); setCanRedo(false)
    runAI()
  }

  useEffect(() => {
    let cancelled = false, timeoutId = null
    const loadImage = (src) => new Promise((resolve, reject) => {
      const img = new Image()
      let settled = false
      const finish = (ok, p) => { if (settled) return; settled = true; if (timeoutId) { clearTimeout(timeoutId); timeoutId = null } if (cancelled) return; ok ? resolve(p) : reject(p) }
      img.onload = () => finish(true, img)
      img.onerror = () => finish(false, new Error('图片格式错误或已损坏'))
      timeoutId = setTimeout(() => finish(false, new Error('图片加载超时,请重试')), LOAD_TIMEOUT)
      img.src = src
      if (img.complete && img.naturalWidth && !settled) finish(true, img)
    })
    ;(async () => {
      if (!imageSrc) { setError('没有图片源'); setLoading(false); return }
      const canvas = canvasRef.current
      if (!canvas) { setError('画布未初始化'); setLoading(false); return }
      try {
        const img = await loadImage(imageSrc)
        if (cancelled) return
        let w = Number(img.naturalWidth) || Number(img.width) || 0
        let h = Number(img.naturalHeight) || Number(img.height) || 0
        if (!w || !h) throw new Error('图片尺寸无效')
        if (Math.max(w, h) > MAX_SIZE) {
          const r = MAX_SIZE / Math.max(w, h); w = Math.round(w * r); h = Math.round(h * r)
        }
        canvas.width = w; canvas.height = h
        if (overlayRef.current) { overlayRef.current.width = w; overlayRef.current.height = h }
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) throw new Error('浏览器不支持 Canvas')
        ctx.clearRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h)
        ctxRef.current = ctx
        const src = document.createElement('canvas'); src.width = w; src.height = h
        const sCtx = src.getContext('2d'); if (!sCtx) throw new Error('备份画布失败')
        sCtx.drawImage(img, 0, 0, w, h)
        sourceRef.current = src
        maskRef.current = new Uint8Array(w * h).fill(1)
        historyRef.current = []; redoStackRef.current = []
        setCanUndo(false); setCanRedo(false)
        setError(''); setLoading(false)
        setTimeout(() => { if (!cancelled) runAI() }, 200)
      } catch (err) {
        if (cancelled) return
        setError(err.message || '图片加载失败'); setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [imageSrc, runAI])

  const getPos = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (!rect) return null
    const cx = e.clientX ?? 0, cy = e.clientY ?? 0
    const ws = rect.width > 0 ? canvas.width / rect.width : 1
    const hs = rect.height > 0 ? canvas.height / rect.height : 1
    return {
      x: Math.floor((cx - rect.left) * ws),
      y: Math.floor((cy - rect.top) * hs),
      dx: cx - rect.left, dy: cy - rect.top, rect
    }
  }

  const onDown = (e) => {
    if (loading || aiThinking) return
    try { e.preventDefault() } catch (_) {}
    const canvas = canvasRef.current
    if (canvas?.setPointerCapture && e.pointerId != null) { try { canvas.setPointerCapture(e.pointerId) } catch (_) {} }
    const p = getPos(e); if (!p) return
    saveHistory()
    drawingRef.current = true; lastPointRef.current = p
    const mask = maskRef.current
    if (mask && canvas) {
      const r = (brush / 2) * (canvas.width / p.rect.width)
      paintCircle(mask, canvas.width, canvas.height, p.x, p.y, r, tool === 'add')
      applyMask(mask)
    }
    showCursor(p)
  }

  const onMove = (e) => {
    const p = getPos(e); if (!p) return
    showCursor(p)
    if (!drawingRef.current) return
    try { e.preventDefault() } catch (_) {}
    const last = lastPointRef.current; if (!last) { lastPointRef.current = p; return }
    const canvas = canvasRef.current; const mask = maskRef.current
    if (canvas && mask) {
      const r = (brush / 2) * (canvas.width / p.rect.width)
      paintLine(mask, canvas.width, canvas.height, last.x, last.y, p.x, p.y, r, tool === 'add')
      applyMask(mask)
    }
    lastPointRef.current = p
  }

  const onUp = (e) => {
    drawingRef.current = false; lastPointRef.current = null
    const canvas = canvasRef.current
    if (canvas?.releasePointerCapture && e.pointerId != null) { try { canvas.releasePointerCapture(e.pointerId) } catch (_) {} }
  }
  const onLeave = (e) => { hideCursor(); if (drawingRef.current) onUp(e) }

  const done = () => {
    const canvas = canvasRef.current
    if (!canvas) { alert('画布未就绪'); return }
    try {
      if (overlayRef.current) {
        const octx = overlayRef.current.getContext('2d')
        if (octx) octx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height)
      }
      const url = canvas.toDataURL('image/png')
      if (!url || url.length < 50) throw new Error('导出图片为空')
      onDone?.(url)
    } catch (e) {
      alert('导出失败:' + (e.message || '未知错误'))
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center min-h-[260px]">
        <div className="text-5xl mb-3">⚠️</div>
        <p className="text-rose-600 font-medium mb-1">抠图准备失败</p>
        <p className="text-slate-500 text-sm mb-4">{error}</p>
        {onCancel && <button onClick={onCancel} className="btn-ghost">返回重选</button>}
      </div>
    )
  }

  const tools = [
    { id: 'add', label: '🖌 加选', tip: '涂抹补充漏选的主体' },
    { id: 'sub', label: '🧽 减选', tip: '涂抹擦除多余的背景' }
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-1 py-2">
        <p className="text-xs text-slate-600 truncate flex-1">{hint}</p>
        <div className="flex gap-1 ml-2 shrink-0">
          <button onClick={reAI} disabled={loading || aiThinking}
            className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 text-sm flex items-center justify-center disabled:opacity-40 active:bg-blue-100"
            title="重新 AI 识别">✨</button>
          <button onClick={invert} disabled={loading || aiThinking}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 text-sm flex items-center justify-center disabled:opacity-40 active:bg-slate-200"
            title="反选">🔄</button>
        </div>
      </div>

      <div className="relative checkerboard rounded-2xl overflow-hidden border border-slate-200 min-h-[260px] max-h-[62vh] flex justify-center bg-slate-50">
        <div className="relative inline-block">
          <canvas
            ref={canvasRef}
            className={`block max-w-full max-h-[62vh] w-auto h-auto select-none ${loading ? 'opacity-0' : 'opacity-100'}`}
            style={{ touchAction: 'none', cursor: loading ? 'default' : 'none', transition: 'opacity 0.25s' }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onLeave}
            onPointerCancel={onUp}
          />
          <canvas ref={overlayRef} className="pointer-events-none absolute top-0 left-0 w-full h-full" />
          <div ref={cursorRef} className="pointer-events-none absolute rounded-full border-2"
            style={{
              opacity: 0, transform: 'translate(-50%,-50%)',
              transition: 'opacity 0.12s, width 0.08s, height 0.08s',
              mixBlendMode: 'normal'
            }}
          />
        </div>

        {loading && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
            <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-blue-500 animate-spin" />
            <p className="text-slate-500 text-sm mt-4">图片准备中…</p>
          </div>
        )}
        {aiThinking && !loading && (
          <div className="absolute inset-0 bg-blue-50/60 backdrop-blur-sm flex flex-col items-center justify-center z-10">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center shadow-lg shadow-blue-500/40 animate-pulse">
              <span className="text-white text-2xl">✨</span>
            </div>
            <p className="text-blue-700 text-sm mt-3 font-medium">AI 正在识别主体…</p>
            <p className="text-blue-500/80 text-xs mt-1">发丝级抠图,请稍候</p>
          </div>
        )}
      </div>

      {!loading && (
        <div className="flex items-center gap-3 px-1 mt-3">
          <span className="text-xs text-slate-400 shrink-0">小</span>
          <input type="range" min="12" max="120" value={brush}
            onChange={(e) => setBrush(Number(e.target.value))}
            className="flex-1 accent-blue-500 h-1"
          />
          <span className="text-xs text-slate-400 shrink-0">大</span>
          <span className="text-xs text-slate-500 w-10 text-right shrink-0">{brush}px</span>
        </div>
      )}

      {!loading && (
        <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1 -mx-1 px-1">
          {tools.map((t) => (
            <button key={t.id}
              onClick={() => { setTool(t.id); setHint(t.tip) }}
              className={`shrink-0 h-10 px-4 rounded-full text-sm font-medium transition ${tool === t.id
                ? (t.id === 'add' ? 'bg-emerald-500 text-white shadow shadow-emerald-500/30' : 'bg-rose-500 text-white shadow shadow-rose-500/30')
                : 'bg-white text-slate-600 border border-slate-200'}`}
            >{t.label}</button>
          ))}
          <div className="w-px h-6 bg-slate-200 shrink-0 mx-1" />
          <button onClick={undo} disabled={!canUndo || aiThinking}
            className="shrink-0 h-10 w-10 rounded-full bg-white border border-slate-200 text-slate-600 text-sm flex items-center justify-center disabled:opacity-40 active:bg-slate-50">
            ↩
          </button>
          <button onClick={redo} disabled={!canRedo || aiThinking}
            className="shrink-0 h-10 w-10 rounded-full bg-white border border-slate-200 text-slate-600 text-sm flex items-center justify-center disabled:opacity-40 active:bg-slate-50">
            ↪
          </button>
          <button onClick={reset} disabled={aiThinking}
            className="shrink-0 h-10 w-10 rounded-full bg-white border border-slate-200 text-slate-600 text-sm flex items-center justify-center active:bg-slate-50"
            title="重置">
            🗑
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-slate-100">
        {onCancel && (
          <button onClick={onCancel} disabled={loading}
            className="h-11 px-5 rounded-full text-slate-600 text-sm font-medium bg-slate-100 active:bg-slate-200 disabled:opacity-40">
            取消
          </button>
        )}
        <button onClick={done} disabled={loading || aiThinking}
          className="flex-1 h-11 rounded-full bg-gradient-to-r from-blue-500 to-violet-500 text-white text-sm font-semibold shadow-lg shadow-blue-500/30 active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-1">
          <span>✓</span><span>保存抠图</span>
        </button>
      </div>
    </div>
  )
}