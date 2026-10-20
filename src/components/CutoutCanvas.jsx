import { useEffect, useRef, useState, useCallback } from 'react'
import { aiCutout, compositeAlpha, MODEL_PRESETS } from '../utils/cutoutAI'

const MAX_SIZE = 1000
const LOAD_TIMEOUT = 10000
const AUTO_TOLERANCE = 28 // 本地兜底算法:auto 模式使用固定容差

/**
 * 抠图画布(双引擎)
 *
 *  引擎 A「AI 抠图」: @imgly/background-removal(ISNet ONNX,浏览器本地推理)
 *    - 输出 0~255 软 alpha,发丝/毛绒/半透明边缘自然过渡
 *    - 首次需下载模型(small≈43MB / medium≈88MB),之后浏览器缓存秒开
 *    - 失败自动降级到引擎 B,不影响使用
 *
 *  引擎 B「快速去背」: 纯本地 flood fill(原实现)
 *    - 只适合纯色背景,零下载、百毫秒级,适合弱网或低端机
 *
 *  两种引擎都可以继续用「加选/减选」画笔微调,最终导出带透明通道的 PNG。
 */

// ---- 算法工具(引擎 B) ----

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

// 膨胀,填补边缘小缝隙
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

// 画笔涂抹:将圆形区域内的像素加入或移除
function paintCircle(arr, w, h, cx, cy, radius, add) {
  const r = Math.ceil(radius)
  const r2 = r * r
  const x0 = Math.max(0, cx - r), x1 = Math.min(w - 1, cx + r)
  const y0 = Math.max(0, cy - r), y1 = Math.min(h - 1, cy + r)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy
      if (dx * dx + dy * dy <= r2) arr[y * w + x] = add ? 1 : 0
    }
  }
}

function paintLine(arr, w, h, x0, y0, x1, y1, radius, add) {
  const dx = x1 - x0, dy = y1 - y0
  const dist = Math.hypot(dx, dy)
  const step = Math.max(1, radius / 3)
  const steps = Math.max(1, Math.ceil(dist / step))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    paintCircle(arr, w, h, Math.round(x0 + dx * t), Math.round(y0 + dy * t), radius, add)
  }
}

export default function CutoutCanvas({ imageSrc, onDone, onCancel }) {
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const sourceRef = useRef(null)
  const ctxRef = useRef(null)
  const alphaRef = useRef(null)      // 当前显示用的 0~255 软 alpha
  const aiAlphaRef = useRef(null)    // 引擎原始结果(可能尺寸不同)
  const aiSizeRef = useRef(null)
  const paintAddRef = useRef(null)   // 手动「加选」层
  const paintEraseRef = useRef(null) // 手动「减选」层
  const engineRef = useRef('ai')     // 'ai' | 'local'
  const historyRef = useRef([])
  const redoStackRef = useRef([])
  const cursorRef = useRef(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef(null)
  const aiTokenRef = useRef(0)
  const bootedRef = useRef(false)

  const [tool, setTool] = useState('add')
  const [brush, setBrush] = useState(40)
  const [loading, setLoading] = useState(true)
  const [aiThinking, setAiThinking] = useState(false)
  const [aiProgress, setAiProgress] = useState(0)
  const [aiStage, setAiStage] = useState('')
  const [error, setError] = useState('')
  const [hint, setHint] = useState('正在加载图片…')
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [engine, setEngine] = useState('ai')
  const [modelSize, setModelSize] = useState('small')
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [edgeFeather, setEdgeFeather] = useState(true)

  // ---- 渲染 ----

  const drawHalo = useCallback((alpha, w, h) => {
    const overlay = overlayRef.current
    if (!overlay) return
    overlay.width = w; overlay.height = h
    const octx = overlay.getContext('2d')
    if (!octx) return
    octx.clearRect(0, 0, w, h)
    const hard = new Uint8Array(w * h)
    for (let i = 0; i < hard.length; i++) hard[i] = alpha[i] >= 128 ? 1 : 0
    const edge = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (!hard[i]) continue
        if ((x > 0 && !hard[i - 1]) || (x < w - 1 && !hard[i + 1]) ||
            (y > 0 && !hard[i - w]) || (y < h - 1 && !hard[i + w])) edge[i] = 1
      }
    }
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

  const applyAlpha = useCallback((alpha) => {
    const ctx = ctxRef.current
    const src = sourceRef.current
    const canvas = canvasRef.current
    if (!ctx || !src || !canvas || !alpha) return
    const w = canvas.width, h = canvas.height
    const img = ctx.getImageData(0, 0, w, h)
    const srcData = src.getContext('2d').getImageData(0, 0, w, h).data
    const d = img.data
    for (let i = 0; i < alpha.length; i++) {
      d[i * 4] = srcData[i * 4]
      d[i * 4 + 1] = srcData[i * 4 + 1]
      d[i * 4 + 2] = srcData[i * 4 + 2]
      d[i * 4 + 3] = alpha[i]
    }
    ctx.putImageData(img, 0, 0)
    drawHalo(alpha, w, h)
    alphaRef.current = alpha
  }, [drawHalo])

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

  const ensurePaintLayers = (w, h) => {
    if (!paintAddRef.current || paintAddRef.current.length !== w * h) {
      paintAddRef.current = new Uint8Array(w * h)
      paintEraseRef.current = new Uint8Array(w * h)
    }
  }

  const snapshotNow = () => ({
    alpha: alphaRef.current ? new Uint8ClampedArray(alphaRef.current) : null,
    add: paintAddRef.current ? new Uint8Array(paintAddRef.current) : null,
    erase: paintEraseRef.current ? new Uint8Array(paintEraseRef.current) : null
  })

  const saveHistory = useCallback(() => {
    if (!alphaRef.current) return
    historyRef.current.push(snapshotNow())
    if (historyRef.current.length > 30) historyRef.current.shift()
    redoStackRef.current = []
    setCanUndo(true); setCanRedo(false)
  }, [])

  const restoreSnapshot = (snap) => {
    if (!snap) return
    if (snap.add) paintAddRef.current = snap.add
    if (snap.erase) paintEraseRef.current = snap.erase
    if (snap.alpha) applyAlpha(snap.alpha)
  }

  const undo = () => {
    if (historyRef.current.length === 0) return
    redoStackRef.current.push(snapshotNow())
    restoreSnapshot(historyRef.current.pop())
    setCanUndo(historyRef.current.length > 0)
    setCanRedo(true)
  }
  const redo = () => {
    if (redoStackRef.current.length === 0) return
    historyRef.current.push(snapshotNow())
    restoreSnapshot(redoStackRef.current.pop())
    setCanUndo(true)
    setCanRedo(redoStackRef.current.length > 0)
  }

  // 清除手动修饰,回到当前引擎的初始结果
  const reset = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    saveHistory()
    const w = canvas.width, h = canvas.height
    paintAddRef.current = new Uint8Array(w * h)
    paintEraseRef.current = new Uint8Array(w * h)
    if (aiAlphaRef.current && aiSizeRef.current) {
      const a = compositeAlpha(aiAlphaRef.current, aiSizeRef.current.w, aiSizeRef.current.h, w, h, null, null)
      applyAlpha(a)
    } else {
      applyAlpha(new Uint8ClampedArray(w * h).fill(255))
    }
    setHint('🔄 已清除手动修饰')
  }

  // ---- 引擎 A:AI 抠图 ----
  const runAI = useCallback(async (sizeKey) => {
    const canvas = canvasRef.current
    if (!canvas || !imageSrc) return
    const w = canvas.width, h = canvas.height
    if (w <= 0 || h <= 0) return
    const token = ++aiTokenRef.current
    engineRef.current = 'ai'
    setEngine('ai')
    setAiThinking(true)
    setAiProgress(0)
    setAiStage('准备中…')
    const preset = MODEL_PRESETS[sizeKey] || MODEL_PRESETS.small
    setHint(`🤖 AI 抠图(${preset.label})处理中…`)
    try {
      const { alpha, width, height } = await aiCutout(imageSrc, {
        model: sizeKey,
        onProgress: (stage, ratio) => {
          if (token !== aiTokenRef.current) return
          setAiStage(stage)
          setAiProgress(ratio)
        }
      })
      if (token !== aiTokenRef.current) return
      aiAlphaRef.current = alpha
      aiSizeRef.current = { w: width, h: height }
      const scaled = compositeAlpha(alpha, width, height, w, h, null, null)
      paintAddRef.current = new Uint8Array(w * h)
      paintEraseRef.current = new Uint8Array(w * h)
      historyRef.current = []; redoStackRef.current = []
      setCanUndo(false); setCanRedo(false)
      applyAlpha(scaled)
      let keep = 0
      for (let i = 0; i < scaled.length; i++) if (scaled[i] >= 128) keep++
      const ratio = keep / scaled.length
      if (ratio > 0.95) setHint('⚠️ AI 几乎保留了整张图,可点「快速去背」或用「减选」擦除背景')
      else if (ratio < 0.05) setHint('⚠️ AI 保留区域过小,建议用「加选」画笔补充主体')
      else setHint(`✅ AI 抠图完成(主体 ${Math.round(ratio * 100)}%),可画笔微调边缘`)
    } catch (e) {
      if (token !== aiTokenRef.current) return
      console.warn('[Cutout] AI 抠图失败,降级到本地算法:', e)
      runLocal()
    } finally {
      if (token === aiTokenRef.current) {
        setAiThinking(false)
        setAiProgress(0)
        setAiStage('')
      }
    }
  }, [imageSrc, applyAlpha])

  // ---- 引擎 B:本地 flood fill ----
  const runLocal = useCallback(() => {
    const ctx = ctxRef.current
    const canvas = canvasRef.current
    if (!ctx || !canvas) return
    const w = canvas.width, h = canvas.height
    engineRef.current = 'local'
    setEngine('local')
    setAiThinking(false)
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
      const alpha = new Uint8ClampedArray(w * h)
      let subjectCount = 0
      for (let i = 0; i < bgMask.length; i++) {
        const v = bgMask[i] ? 0 : 255
        alpha[i] = v
        if (v) subjectCount++
      }
      aiAlphaRef.current = alpha
      aiSizeRef.current = { w, h }
      paintAddRef.current = new Uint8Array(w * h)
      paintEraseRef.current = new Uint8Array(w * h)
      historyRef.current = []; redoStackRef.current = []
      setCanUndo(false); setCanRedo(false)
      applyAlpha(alpha)
      const ratio = subjectCount / alpha.length
      if (ratio > 0.92) setHint('⚠️ 背景识别偏少,建议调小画笔后用「减选」手动涂抹多余区域')
      else if (ratio < 0.08) setHint('⚠️ 主体识别偏少,建议用「加选」画笔涂抹补充主体')
      else setHint(`✅ 快速去背完成(主体 ${Math.round(ratio * 100)}%),可画笔微调边缘`)
    } catch (e) {
      setHint('❌ 处理失败:' + (e.message || '未知错误'))
      applyAlpha(new Uint8ClampedArray(w * h).fill(255))
    }
  }, [applyAlpha])

  const invert = () => {
    const canvas = canvasRef.current
    if (!canvas || !alphaRef.current) return
    saveHistory()
    const inv = new Uint8ClampedArray(alphaRef.current.length)
    for (let i = 0; i < inv.length; i++) inv[i] = 255 - alphaRef.current[i]
    applyAlpha(inv)
    setHint('🔄 已反选')
  }

  // ---- 画笔 ----
  const applyPaint = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const w = canvas.width, h = canvas.height
    ensurePaintLayers(w, h)
    let base
    if (aiAlphaRef.current && aiSizeRef.current) {
      base = compositeAlpha(aiAlphaRef.current, aiSizeRef.current.w, aiSizeRef.current.h, w, h, null, null)
    } else {
      base = new Uint8ClampedArray(w * h).fill(255)
    }
    const add = paintAddRef.current, erase = paintEraseRef.current
    for (let i = 0; i < base.length; i++) {
      if (erase[i]) base[i] = 0
      else if (add[i]) base[i] = 255
    }
    applyAlpha(base)
  }

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
    const w = canvas.width, h = canvas.height
    ensurePaintLayers(w, h)
    const r = (brush / 2) * (canvas.width / p.rect.width)
    const target = tool === 'add' ? paintAddRef.current : paintEraseRef.current
    const other = tool === 'add' ? paintEraseRef.current : paintAddRef.current
    paintCircle(target, w, h, p.x, p.y, r, true)
    paintCircle(other, w, h, p.x, p.y, r, false)
    applyPaint()
    showCursor(p)
  }

  const onMove = (e) => {
    const p = getPos(e); if (!p) return
    showCursor(p)
    if (!drawingRef.current) return
    try { e.preventDefault() } catch (_) {}
    const last = lastPointRef.current; if (!last) { lastPointRef.current = p; return }
    const canvas = canvasRef.current
    if (canvas && paintAddRef.current) {
      const w = canvas.width, h = canvas.height
      const r = (brush / 2) * (canvas.width / p.rect.width)
      const target = tool === 'add' ? paintAddRef.current : paintEraseRef.current
      const other = tool === 'add' ? paintEraseRef.current : paintAddRef.current
      paintLine(target, w, h, last.x, last.y, p.x, p.y, r, true)
      paintLine(other, w, h, last.x, last.y, p.x, p.y, r, false)
      applyPaint()
    }
    lastPointRef.current = p
  }

  const onUp = (e) => {
    drawingRef.current = false; lastPointRef.current = null
    const canvas = canvasRef.current
    if (canvas?.releasePointerCapture && e.pointerId != null) { try { canvas.releasePointerCapture(e.pointerId) } catch (_) {} }
  }
  const onLeave = (e) => { hideCursor(); if (drawingRef.current) onUp(e) }

  // ---- 导出 ----
  const buildExportAlpha = () => {
    const canvas = canvasRef.current
    const w = canvas.width, h = canvas.height
    let alpha = alphaRef.current ? new Uint8ClampedArray(alphaRef.current) : new Uint8ClampedArray(w * h).fill(255)
    if (!edgeFeather) return alpha
    // 边缘羽化:0/255 硬边掺入邻域过渡,贴到任意背景都不生硬
    const src = alpha
    const out = new Uint8ClampedArray(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (src[i] > 0 && src[i] < 255) { out[i] = src[i]; continue }
        let sum = 0, cnt = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
            const v = src[ny * w + nx]
            if ((v === 0) !== (src[i] === 0)) { sum += v; cnt++ }
          }
        }
        out[i] = cnt > 0 ? Math.round((src[i] * 2 + sum / cnt) / 3) : src[i]
      }
    }
    return out
  }

  const done = () => {
    const canvas = canvasRef.current
    if (!canvas) { alert('画布未就绪'); return }
    const w = canvas.width, h = canvas.height
    try {
      const alpha = buildExportAlpha()
      const out = document.createElement('canvas')
      out.width = w; out.height = h
      const octx = out.getContext('2d')
      const srcData = sourceRef.current.getContext('2d').getImageData(0, 0, w, h).data
      const img = octx.createImageData(w, h)
      const d = img.data
      for (let i = 0; i < alpha.length; i++) {
        d[i * 4] = srcData[i * 4]
        d[i * 4 + 1] = srcData[i * 4 + 1]
        d[i * 4 + 2] = srcData[i * 4 + 2]
        d[i * 4 + 3] = alpha[i]
      }
      octx.putImageData(img, 0, 0)
      const url = out.toDataURL('image/png')
      if (!url || url.length < 50) throw new Error('导出图片为空')
      onDone?.(url)
    } catch (e) {
      alert('导出失败:' + (e.message || '未知错误'))
    }
  }

  // ---- 加载图片 ----
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
        const sCtx = src.getContext('2d', { willReadFrequently: true }); if (!sCtx) throw new Error('备份画布失败')
        sCtx.drawImage(img, 0, 0, w, h)
        sourceRef.current = src
        alphaRef.current = new Uint8ClampedArray(w * h).fill(255)
        paintAddRef.current = new Uint8Array(w * h)
        paintEraseRef.current = new Uint8Array(w * h)
        aiAlphaRef.current = null
        aiSizeRef.current = null
        historyRef.current = []; redoStackRef.current = []
        bootedRef.current = false
        setCanUndo(false); setCanRedo(false)
        setError(''); setLoading(false)
      } catch (err) {
        if (cancelled) return
        setError(err.message || '图片加载失败'); setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [imageSrc])

  // 图片就绪后自动跑一次 AI(仅首次,避免切档位时重复触发)
  useEffect(() => {
    if (loading || error || bootedRef.current) return
    bootedRef.current = true
    const t = setTimeout(() => runAI(modelSize), 150)
    return () => clearTimeout(t)
  }, [loading, error, modelSize, runAI])

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
      {/* 引擎切换 + 模型档位 */}
      <div className="flex items-center gap-2 px-1 py-2">
        <button
          onClick={() => runAI(modelSize)}
          disabled={loading || aiThinking}
          className={`h-8 px-3 rounded-full text-xs font-medium transition flex items-center gap-1 ${
            engine === 'ai' ? 'bg-gradient-to-r from-blue-500 to-violet-500 text-white shadow' : 'bg-white text-slate-600 border border-slate-200'
          } disabled:opacity-50`}
        >
          ✨ AI 抠图
        </button>
        <button
          onClick={runLocal}
          disabled={loading || aiThinking}
          className={`h-8 px-3 rounded-full text-xs font-medium transition ${
            engine === 'local' ? 'bg-slate-800 text-white shadow' : 'bg-white text-slate-600 border border-slate-200'
          } disabled:opacity-50`}
        >
          ⚡ 快速去背
        </button>
        <div className="flex-1" />
        <div className="relative">
          <button
            onClick={() => setShowModelMenu((v) => !v)}
            disabled={loading || aiThinking}
            className="h-8 px-2.5 rounded-full bg-white border border-slate-200 text-xs text-slate-600 flex items-center gap-1 disabled:opacity-40"
          >
            {MODEL_PRESETS[modelSize].label} ▾
          </button>
          {showModelMenu && (
            <div className="absolute right-0 top-9 z-40 w-52 bg-white rounded-xl shadow-lg border border-slate-100 p-1.5">
              {Object.entries(MODEL_PRESETS).map(([key, p]) => (
                <button
                  key={key}
                  onClick={() => {
                    setModelSize(key)
                    setShowModelMenu(false)
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs ${
                    modelSize === key ? 'bg-blue-50 text-blue-700' : 'text-slate-600 active:bg-slate-50'
                  }`}
                >
                  <span className="font-medium">{p.label}</span>
                  {p.size && <span className="text-slate-400 ml-1">{p.size}</span>}
                  <p className="text-slate-400 mt-0.5 leading-snug">{p.desc}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-1 pb-2">
        <p className="text-xs text-slate-600 truncate flex-1">{hint}</p>
        <button onClick={invert} disabled={loading || aiThinking}
          className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 text-sm flex items-center justify-center disabled:opacity-40 active:bg-slate-200 ml-2 shrink-0"
          title="反选">🔄</button>
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
          <div className="absolute inset-0 bg-blue-50/70 backdrop-blur-sm flex flex-col items-center justify-center z-10 px-6">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center shadow-lg shadow-blue-500/40 animate-pulse">
              <span className="text-white text-2xl">✨</span>
            </div>
            <p className="text-blue-700 text-sm mt-3 font-medium text-center">{aiStage || 'AI 正在识别主体…'}</p>
            {aiProgress > 0 && (
              <div className="w-48 h-1.5 bg-blue-100 rounded-full mt-3 overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.round(aiProgress * 100)}%` }} />
              </div>
            )}
            <p className="text-blue-500/80 text-xs mt-2 text-center">
              首次使用需下载模型并缓存在本机,之后秒开
            </p>
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
            title="清除手动修饰">
            🗑
          </button>
          <button
            onClick={() => setEdgeFeather((v) => !v)}
            className={`shrink-0 h-10 px-3 rounded-full text-xs font-medium border transition ${
              edgeFeather ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-slate-500 border-slate-200'
            }`}
            title="导出时让边缘保留过渡像素,贴到任意背景更自然"
          >
            {edgeFeather ? '✓ 边缘羽化' : '边缘羽化'}
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
