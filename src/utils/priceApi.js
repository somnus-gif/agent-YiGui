// 同页比价接口封装(两种模式自动切换)
//
//  模式 A「Worker 后端」:配置了 VITE_PRICE_API 时走自部署的 Cloudflare Worker
//      - 支持关键词比价 + 图片比价(大淘客图搜),密钥保存在云端
//  模式 B「前端直连」:仅配置 VITE_HDK_APIKEY 时直接调好单库
//      - 好单库接口同时支持 HTTPS 与 CORS(*),因此无需后端即可出价格
//      - 代价:apikey 会出现在前端代码中(个人使用可接受,若介意请走模式 A)
//      - 图片比价依赖大淘客图搜(需要 AppSecret),直连模式不可用

import { searchAll, PLATFORM_GUIDE } from '../../shared/haodankuClient.js'
import { buildResponse } from '../../shared/priceNormalize.js'

// 平台接入状态(供 UI 展示「哪些平台接入了、哪些需要授权」)
export { PLATFORM_GUIDE }

const BASE = (import.meta.env.VITE_PRICE_API || '').replace(/\/$/, '')
const HDK_KEY = import.meta.env.VITE_HDK_APIKEY || ''

export const priceMode = BASE ? 'worker' : (HDK_KEY ? 'direct' : 'none')

export function isPriceApiConfigured() {
  return priceMode !== 'none'
}

async function getJSON(path) {
  const res = await fetch(`${BASE}${path}`)
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || `请求失败(${res.status})`)
  return j
}

/** 关键词同页比价 */
export async function searchByKeyword(kw) {
  if (priceMode === 'worker') return getJSON(`/api/search?kw=${encodeURIComponent(kw)}`)
  if (priceMode === 'direct') {
    const { items, failed } = await searchAll(HDK_KEY, kw)
    return buildResponse(items, kw, { failed })
  }
  throw new Error('未配置比价数据源')
}

/**
 * 图片比价(仅 Worker 模式支持,依赖大淘客图搜)
 * @param {string} imageDataUrl
 */
export async function searchByImage(imageDataUrl) {
  if (priceMode !== 'worker') {
    throw new Error('图片比价需要部署后端(大淘客图搜凭证不能放前端),请按 workers/price-api/README.md 部署后使用;当前可先用关键词搜索')
  }
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
