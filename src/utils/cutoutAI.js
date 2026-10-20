// AI 抠图引擎(浏览器本地推理,无需服务端/API Key)
// 基于 @imgly/background-removal(ISNet ONNX 模型)+ onnxruntime-web
//
// 设计要点:
//  1. 模型已内置在 public/ai-cutout/(约 43MB),首次加载从本站读取并由浏览器缓存,之后秒开
//  2. 模型按最长边缩放到 1024 内推理,输出的是 0~255 的软 alpha(发丝/毛边自然过渡)
//  3. 提供进度回调,便于 UI 显示「下载模型 / 推理中」阶段
//  4. 任何失败都向上抛出,由调用方降级到纯本地算法,保证功能不中断

// 模型与 onnxruntime wasm 已随应用打包到 public/ai-cutout/(isnet_quint8 量化模型,约 43MB),
// 首次加载从本站读取,不依赖任何外部 CDN——离线、内网、弱网环境都能用。
// 若以后需要换 CDN,把该值改为 'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/'
// (注意:版本号必须与 @imgly/background-removal 的 JS 包版本一致,否则找不到对应模型分片)
// 库内部用 new URL('resources.json', publicPath) 拼接地址,base 必须是绝对 URL
const DEFAULT_PUBLIC_PATH =
  typeof location !== 'undefined'
    ? new URL('/ai-cutout/', location.origin).href
    : '/ai-cutout/'

// 模型档位:当前仅内置 isnet_quint8(本地量化模型)。官方还有 isnet_fp16(88MB)/isnet(168MB),
// 体积太大不适合随应用分发;量化模型对衣物、人像主体的边缘质量已经足够。
export const MODEL_PRESETS = {
  small: { id: 'isnet_quint8', label: '本地模型', size: '', desc: '内置 AI 模型,无需联网下载' }
}

let modulePromise = null
function loadModule() {
  if (!modulePromise) {
    modulePromise = import('@imgly/background-removal')
  }
  return modulePromise
}

// 把 dataURL / objectURL / File 统一转成 Blob,减少一次解码
export async function toBlob(src) {
  if (src instanceof Blob) return src
  if (typeof src === 'string' && src.startsWith('data:')) {
    const res = await fetch(src)
    return await res.blob()
  }
  const res = await fetch(src)
  return await res.blob()
}

/**
 * 调用 AI 抠图,返回 { alpha: Uint8ClampedArray, width, height, blobUrl }
 * alpha 与传入图片同尺寸,R=G=B=0,A=原始置信度(0=背景 255=主体)
 *
 * @param {string|Blob} src           图片源
 * @param {object} opts
 * @param {'small'|'medium'} opts.model
 * @param {(stage:string, ratio:number)=>void} opts.onProgress
 * @param {boolean} opts.useGpu
 */
export async function aiCutout(src, opts = {}) {
  const { model = 'small', onProgress, useGpu = false } = opts
  const preset = MODEL_PRESETS[model] || MODEL_PRESETS.small

  onProgress?.('准备图片…', 0)
  const blob = await toBlob(src)

  const { default: removeBackground } = await loadModule()

  onProgress?.('加载内置 AI 模型…', 0)

  const outBlob = await removeBackground(blob, {
    publicPath: DEFAULT_PUBLIC_PATH,
    device: useGpu ? 'gpu' : 'cpu',
    model: preset.id,
    output: { format: 'image/png', type: 'foreground' },
    progress: (key, current, total) => {
      if (!total) return
      const ratio = Math.min(0.99, current / total)
      // key 形如 "fetch:/models/small" 或 "compute:inference"
      if (key.startsWith('fetch')) {
        onProgress?.(`加载模型资源 ${Math.round(ratio * 100)}%`, ratio)
      } else {
        onProgress?.('AI 推理中…', ratio)
      }
    }
  })

  onProgress?.('提取透明通道…', 0.95)

  // 把抠好的 PNG 画到 canvas 读 alpha,得到与 UI 同一坐标系的 mask
  const url = URL.createObjectURL(outBlob)
  const img = await new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('AI 结果解码失败'))
    i.src = url
  })
  const w = img.naturalWidth
  const h = img.naturalHeight
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, w, h).data
  const alpha = new Uint8ClampedArray(w * h)
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]
  URL.revokeObjectURL(url)

  onProgress?.('完成', 1)
  return { alpha, width: w, height: h }
}

/**
 * 把 AI 的软 alpha 转换到目标画布尺寸(双线性采样),并与手动涂抹 mask 合成
 *  - softAlpha: 0~255 的软透明度(来自 AI)
 *  - paintMask: Uint8Array 0/1 的手动涂抹层(null 表示未编辑)
 *    1 = 手动加选(强制可见)  0 = 无干预,沿用 AI 结果
 *  - paintErase: Uint8Array 0/1 的手动擦除层(1 = 强制透明)
 */
export function compositeAlpha(softAlpha, sw, sh, targetW, targetH, paintMask, paintErase) {
  const out = new Uint8ClampedArray(targetW * targetH)
  const sx = sw / targetW
  const sy = sh / targetH
  for (let y = 0; y < targetH; y++) {
    const fy = Math.min(sh - 1, y * sy)
    const y0 = Math.floor(fy)
    const y1 = Math.min(sh - 1, y0 + 1)
    const wy = fy - y0
    for (let x = 0; x < targetW; x++) {
      const fx = Math.min(sw - 1, x * sx)
      const x0 = Math.floor(fx)
      const x1 = Math.min(sw - 1, x0 + 1)
      const wx = fx - x0
      const a00 = softAlpha[y0 * sw + x0]
      const a10 = softAlpha[y0 * sw + x1]
      const a01 = softAlpha[y1 * sw + x0]
      const a11 = softAlpha[y1 * sw + x1]
      const a =
        a00 * (1 - wx) * (1 - wy) + a10 * wx * (1 - wy) + a01 * (1 - wx) * wy + a11 * wx * wy
      const i = y * targetW + x
      let v = a
      if (paintErase && paintErase[i]) v = 0
      else if (paintMask && paintMask[i]) v = 255
      out[i] = v
    }
  }
  return out
}
