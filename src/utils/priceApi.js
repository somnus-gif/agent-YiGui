// 同页比价 API 封装(后端:workers/price-api,Cloudflare Worker)
// 部署方式见 workers/price-api/README.md;前端在 .env 配置 VITE_PRICE_API

const BASE = (import.meta.env.VITE_PRICE_API || '').replace(/\/$/, '')

export function isPriceApiConfigured() {
  return !!BASE
}

async function getJSON(path) {
  const res = await fetch(`${BASE}${path}`)
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || `请求失败(${res.status})`)
  return j
}

/** 关键词同页比价 */
export function searchByKeyword(kw) {
  return getJSON(`/api/search?kw=${encodeURIComponent(kw)}`)
}

/**
 * 图片比价
 * @param {string} imageDataUrl dataURL(内部会转纯 base64)
 */
export async function searchByImage(imageDataUrl) {
  const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '')
  const res = await fetch(`${BASE}/api/image-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64 })
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || `请求失败(${res.status})`)
  return j
}
