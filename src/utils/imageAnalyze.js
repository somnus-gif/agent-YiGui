// 本地图像分析:从图片里提取主色调,用于「图片比价」自动拼搜索词
//
// 为什么不用 CLIP 之类的识别模型:
//  - 模型动辄 90MB,移动端首次加载太重,且需要能访问 HuggingFace
//  - 找同款时最关键的属性其实就是「颜色 + 品类」,品类在衣橱里本来就有
//  - 这里用 canvas 做真实像素统计,零依赖、零下载、几十毫秒完成
//
// 抠过图的衣物背景是透明的(alpha=0),会自动被排除,所以提取到的是衣服本身的颜色。

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}

/**
 * RGB → 色相(h 0-360) / 彩度(c 0-1) / 明度(l 0-1)
 * 用彩度而不是 HSL 饱和度:饱和度对浅色会虚高(米白也能算出 s=1),
 * 服装颜色基本靠「彩度 + 明度」就能区分开。
 */
function rgbToHcl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  const c = max - min
  if (c === 0) return [0, 0, l]
  let h
  if (max === r) h = ((g - b) / c + (g < b ? 6 : 0))
  else if (max === g) h = (b - r) / c + 2
  else h = (r - g) / c + 4
  return [h * 60, c, l]
}

// 服装语境下的中文颜色名:优先叫得出名字的颜色,而不是死板的色环名
export function colorName(r, g, b) {
  const [h, c, l] = rgbToHcl(r, g, b)

  // 无彩色:白 / 灰 / 黑(阈值压到 0.07,免得米白被当成纯白)
  if (c < 0.07) {
    if (l > 0.86) return '白色'
    if (l > 0.66) return '浅灰'
    if (l > 0.4) return '灰色'
    if (l > 0.18) return '深灰'
    return '黑色'
  }

  // 低彩度暖色 = 米白 / 杏 / 卡其 / 驼 / 棕 这一整挂
  if (h >= 10 && h < 75 && c < 0.5) {
    if (l > 0.8) return c < 0.15 ? '米色' : '杏色'
    if (l > 0.5) return '卡其色'
    if (l > 0.28) return '驼色'
    return '棕色'
  }
  // 高彩度暖色 = 橙 / 焦糖
  if (h >= 15 && h < 45 && c >= 0.5) return l < 0.45 ? '焦糖色' : '橙色'

  if (h < 15 || h >= 345) {
    if (l > 0.72 && c < 0.5) return '粉色'
    if (l < 0.36 && c > 0.35) return '酒红'
    return '红色'
  }
  if (h < 70) return '黄色'
  if (h < 160) return l < 0.35 ? '墨绿' : '绿色'
  if (h < 195) return '青色'
  if (h < 250) return l < 0.32 ? '藏青色' : '蓝色'
  if (h < 290) return '紫色'
  if (h < 330) return l < 0.4 ? '紫色' : '玫红色'
  return l > 0.7 ? '粉色' : '玫红色'
}

function toHex(r, g, b) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}

/**
 * 提取图片主色调
 * @param {string} src 图片 dataURL / objectURL
 * @param {object} opts
 * @returns {Promise<{main:string, palette:{name:string,hex:string,ratio:number}[], brightness:number}>}
 */
export async function analyzeImage(src, { maxSide = 100, topN = 3 } = {}) {
  const img = await loadImage(src)
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  if (!w || !h) throw new Error('图片尺寸异常')

  const scale = Math.min(1, maxSide / Math.max(w, h))
  const cw = Math.max(1, Math.round(w * scale))
  const ch = Math.max(1, Math.round(h * scale))

  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, cw, ch)
  const { data } = ctx.getImageData(0, 0, cw, ch)

  // 量化到 32 级后做直方图,取占比最高的若干簇
  const bins = new Map()
  let valid = 0
  let lumSum = 0
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a < 128) continue // 透明背景(抠图后)跳过
    const r = data[i], g = data[i + 1], b = data[i + 2]
    valid++
    lumSum += (0.299 * r + 0.587 * g + 0.114 * b)
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    const cur = bins.get(key)
    if (cur) { cur.n++; cur.r += r; cur.g += g; cur.b += b }
    else bins.set(key, { n: 1, r, g, b })
  }
  if (!valid) throw new Error('图片没有可分析的像素')

  const clusters = [...bins.values()]
    .filter((c) => c.n / valid >= 0.03) // 噪点簇丢掉
    .sort((a, b) => b.n - a.n)
    .slice(0, topN)
    .map((c) => {
      const r = Math.round(c.r / c.n), g = Math.round(c.g / c.n), b = Math.round(c.b / c.n)
      return { name: colorName(r, g, b), hex: toHex(r, g, b), ratio: c.n / valid }
    })

  const main = clusters[0]?.name || '彩色'
  return {
    main,
    palette: clusters,
    brightness: lumSum / valid / 255
  }
}

// 电商搜索友好的品类名(比衣橱分类更适合拿去搜同款)
export const SHOP_CATEGORIES = [
  'T恤', '衬衫', '卫衣', '毛衣', '外套', '羽绒服', '西装',
  '连衣裙', '半身裙', '牛仔裤', '阔腿裤', '短裤',
  '运动鞋', '包包', '内衣', '袜子', '饰品'
]

// 衣橱分类 → 电商搜索词
export const CATEGORY_TO_SHOP = {
  上衣: '上衣',
  下装: '裤子',
  外套: '外套',
  套装: '套装',
  鞋子: '鞋',
  袜子: '袜子',
  饰品: '饰品',
  内衣: '内衣',
  妆容: '化妆品',
  背景: ''
}

/** 把「颜色 + 品类」拼成搜索词 */
export function buildSearchKeyword(color, category) {
  const c = (color || '').trim()
  const g = (category || '').trim()
  if (c && g) return `${c}${g}`
  return c || g || ''
}
