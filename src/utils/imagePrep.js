// 图片比价前的预处理:
//  1. 衣橱图是抠图后的透明 PNG,直接传给图搜 API 会大幅降低识别率 → 合成白底
//  2. 压缩到最长边 800px、JPEG 质量 0.85,保证 base64 ≤ 1MB(接口限制)
export function prepImageForSearch(src, maxSide = 800, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
        const w = Math.max(1, Math.round(img.naturalWidth * scale))
        const h = Math.max(1, Math.round(img.naturalHeight * scale))
        const cv = document.createElement('canvas')
        cv.width = w
        cv.height = h
        const ctx = cv.getContext('2d')
        // 白底填充(透明区域变白)
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        resolve(cv.toDataURL('image/jpeg', quality))
      } catch (e) {
        reject(new Error('图片处理失败:' + (e?.message || e)))
      }
    }
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}
