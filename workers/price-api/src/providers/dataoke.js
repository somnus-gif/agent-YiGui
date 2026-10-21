// 大淘客(dataoke)供应商:覆盖淘宝/天猫/京东/拼多多/抖音/唯品会,并提供「图片搜商品」
// 文档:https://www.dataoke.com/pmc
// 签名规则(经典版):参数按 ASCII 升序拼接成 a=1&b=2,尾部拼 &key=appSecret,MD5 后转大写
// 备用新验签:signRan = MD5("appKey=xx&timer=xx&nonce=xx&key=secret") 大写

const BASE = 'https://openapi.dataoke.com'
const BASE_V2 = 'https://openapiv2.dataoke.com'

async function md5Upper(str) {
  // Cloudflare Workers 的 crypto.subtle 支持 MD5(非标准扩展);
  // 若目标运行时不支持则直接报错——签名算法不能降级替换
  const buf = await crypto.subtle.digest('MD5', new TextEncoder().encode(str))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function buildSign(params, appSecret) {
  const keys = Object.keys(params).filter((k) => params[k] !== '' && params[k] != null).sort()
  const str = keys.map((k) => `${k}=${params[k]}`).join('&')
  return md5Upper(`${str}&key=${appSecret}`)
}

// 大淘客搜索(淘宝/天猫为主)
export async function searchGoods(appKey, appSecret, keyword, pageSize = 20) {
  const params = {
    appKey,
    version: 'v1.2.3',
    keyWords: keyword,
    pageSize: String(pageSize),
    pageId: '1'
  }
  const sign = await buildSign(params, appSecret)
  const qs = new URLSearchParams({ ...params, sign }).toString()
  const res = await fetch(`${BASE}/api/goods/get-goods-list?${qs}`)
  const j = await res.json()
  const list = j?.data?.list || []
  return list.map((g) => ({
    platform: g.shopType === 1 ? '天猫' : '淘宝',
    platformId: g.shopType === 1 ? 'tmall' : 'taobao',
    title: g.title || g.dtitle || '',
    price: Number(g.actualPrice ?? 0),
    originPrice: Number(g.originalPrice ?? 0),
    sales: Number(g.monthSales ?? 0),
    shop: g.shopName || (g.shopType === 1 ? '天猫' : '淘宝'),
    image: g.mainPic || g.img || '',
    url: g.itemLink || (g.goodsId ? `https://item.taobao.com/item.htm?id=${g.goodsId}` : ''),
    source: 'dataoke'
  }))
}

/**
 * 图片搜商品
 * @param {string} imageBase64 纯 base64(不含 data:image 前缀),≤1024KB
 * @returns {Promise<{keyword:string, items:Array}>}
 */
export async function searchByImage(appKey, appSecret, imageBase64) {
  const params = { appKey, version: 'v1.0.0' }
  const sign = await buildSign(params, appSecret)
  const body = new FormData()
  body.append('img_base64', imageBase64)
  const res = await fetch(`${BASE_V2}/open-api/goods/search-by-image?${new URLSearchParams({ ...params, sign })}`, {
    method: 'POST',
    body
  })
  const j = await res.json()
  const list = Array.isArray(j?.data) ? j.data : (j?.data?.list || [])
  const items = list.map((g) => ({
    platform: g.shopType === 1 ? '天猫' : '淘宝',
    platformId: g.shopType === 1 ? 'tmall' : 'taobao',
    title: g.title || g.dtitle || '',
    price: Number(g.actualPrice ?? 0),
    originPrice: Number(g.originalPrice ?? 0),
    sales: Number(g.monthSales ?? 0),
    shop: g.shopType === 1 ? '天猫' : '淘宝',
    image: g.mainPic || g.img || '',
    url: g.itemLink || (g.goodsId ? `https://item.taobao.com/item.htm?id=${g.goodsId}` : ''),
    source: 'dataoke-image'
  }))
  // 用第一条结果的标题作为后续关键词比价的中枢词
  return { keyword: items[0]?.title || '', items }
}
