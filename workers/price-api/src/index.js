// 衣橱同款比价 API(Cloudflare Worker)
//
// 接口:
//   GET  /api/health                  健康检查
//   GET  /api/search?kw=连衣裙         关键词全网比价(同页返回各平台价格)
//   POST /api/image-search            图片比价,body:{image:"<base64>"}(不含 data: 前缀)
//
// 数据源:好单库(必填 apikey,免签)+ 大淘客(可选,提供图搜与补充商品)

import * as hdk from './providers/haodanku.js'
import * as dtk from './providers/dataoke.js'
import { normalize, buildResponse, toKeyword } from './normalize.js'

const CACHE_TTL = 600 // 10 分钟

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS }
  })
}

async function withCache(request, fn) {
  const cache = caches.default
  const key = new Request(request.url, { method: 'GET' })
  const hit = await cache.match(key)
  if (hit) {
    const r = hit.clone()
    return new Response(r.body, { headers: { ...Object.fromEntries(r.headers), 'X-Cache': 'HIT', ...CORS } })
  }
  const data = await fn()
  const res = json({ ...data, cached: false })
  const toCache = res.clone()
  const h = new Headers(toCache.headers)
  h.set('Cache-Control', `public, max-age=${CACHE_TTL}`)
  try {
    await cache.put(key, new Response(toCache.body, { headers: h, status: 200 }))
  } catch {}
  return res
}

async function handleSearch(kw, env) {
  if (!kw) return json({ error: '缺少关键词 kw' }, 400)
  const jobs = []
  const failed = []
  if (env.HDK_APIKEY) {
    jobs.push(
      hdk.searchAll(env.HDK_APIKEY, kw).catch((e) => ({ items: [], failed: [{ name: '好单库', message: e?.message }] }))
    )
  }
  if (env.DTK_APPKEY && env.DTK_SECRET) {
    jobs.push(dtk.searchGoods(env.DTK_APPKEY, env.DTK_SECRET, kw).catch(() => []))
  }
  const settled = await Promise.all(jobs)
  const items = []
  for (const s of settled) {
    if (Array.isArray(s)) items.push(...s)
    else {
      items.push(...(s.items || []))
      failed.push(...(s.failed || []))
    }
  }
  return buildResponse(items, kw, { failed })
}

async function handleImageSearch(imageBase64, env) {
  if (!imageBase64) return json({ error: '缺少图片 image(base64)' }, 400)
  if (!env.DTK_APPKEY || !env.DTK_SECRET) {
    return json({ error: '未配置大淘客凭证(DTK_APPKEY/DTK_SECRET),图搜不可用;请先配置,或改用关键词比价' }, 503)
  }
  const { keyword, items } = await dtk.searchByImage(env.DTK_APPKEY, env.DTK_SECRET, imageBase64)
  // 图搜拿到标题后,再用关键词去各平台比价,得到真正的全网价格
  const searchKw = toKeyword(keyword, 16)
  let comparison = { best: [], others: [], byPlatform: [], platforms: [], total: 0 }
  if (searchKw) comparison = await handleSearch(searchKw, env)
  const dtkItems = normalize(items)
  return {
    keyword: searchKw,
    recognizedTitle: keyword,
    imageItems: dtkItems,
    ...comparison,
    updatedAt: Date.now()
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })
    const url = new URL(request.url)
    const path = url.pathname

    try {
      if (path === '/api/health') {
        return json({
          ok: true,
          providers: {
            haodanku: !!env.HDK_APIKEY,
            dataoke: !!(env.DTK_APPKEY && env.DTK_SECRET)
          }
        })
      }
      if (path === '/api/search') {
        const kw = url.searchParams.get('kw') || ''
        return await withCache(request, () => handleSearch(kw.trim(), env))
      }
      if (path === '/api/image-search' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}))
        return json(await handleImageSearch((body.image || '').replace(/^data:image\/\w+;base64,/, ''), env))
      }
      return json({ error: '未知接口', path }, 404)
    } catch (e) {
      return json({ error: e?.message || '服务异常' }, 500)
    }
  }
}
