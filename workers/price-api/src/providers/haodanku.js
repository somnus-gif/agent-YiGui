// 好单库(haodanku)供应商:apikey 直传,无需签名,个人可免费注册
// 文档:https://www.haodanku.com/Openapi
// 覆盖:淘宝/天猫(supersearch)、拼多多(pdd_goods_search)、京东(jd_goods_search)、抖音(get_trill_data)

const BASE = 'http://v2.api.haodanku.com'

// 好单库要求关键词做两次 urlencode
const enc2 = (s) => encodeURIComponent(encodeURIComponent(s))

async function getJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`好单库请求失败 ${res.status}`)
  const j = await res.json()
  // 好单库成功码:不同接口为 200 或 1
  if (j.code !== 200 && j.code !== 1) throw new Error(j.msg || '好单库无数据')
  return Array.isArray(j.data) ? j.data : []
}

// 淘宝/天猫超级搜索(路径式参数)
export async function searchTaobao(apikey, keyword, limit = 20) {
  const url = `${BASE}/supersearch/apikey/${apikey}/keyword/${enc2(keyword)}/back/${limit}/min_id/1/tb_p/1/sort/0`
  const list = await getJSON(url)
  return list.map((g) => ({
    platform: '淘宝',
    platformId: 'taobao',
    title: g.itemtitle || g.title || '',
    price: Number(g.itemendprice ?? g.price ?? 0),
    originPrice: Number(g.itemprice ?? 0),
    sales: Number(g.itemsale ?? 0),
    shop: g.shopname || (g.shoptype === 'B' ? '天猫' : '淘宝'),
    image: g.itempic || '',
    url: g.itemlink || (g.itemid ? `https://item.taobao.com/item.htm?id=${g.itemid}` : ''),
    source: 'haodanku'
  }))
}

// 拼多多
export async function searchPdd(apikey, keyword, limit = 20) {
  const url = `${BASE}/pdd_goods_search?apikey=${apikey}&keyword=${enc2(keyword)}&limit=${limit}&min_id=1`
  const list = await getJSON(url)
  return list.map((g) => ({
    platform: '拼多多',
    platformId: 'pdd',
    title: g.goodsname || g.goods_title || '',
    price: Number(g.itemendprice ?? g.price ?? 0),
    originPrice: Number(g.itemprice ?? 0),
    sales: Number(g.itemsale ?? 0),
    shop: g.shopname || '拼多多',
    image: g.itempic || '',
    url: g.goods_sign
      ? `https://mobile.yangkeduo.com/goods.html?goods_sign=${g.goods_sign}`
      : `https://mobile.yangkeduo.com/search_result.html?search_key=${encodeURIComponent(keyword)}`,
    source: 'haodanku'
  }))
}

// 京东(接口名以开放平台最新文档为准,若返回空会自动跳过)
export async function searchJd(apikey, keyword, limit = 20) {
  const url = `${BASE}/jd_goods_search?apikey=${apikey}&keyword=${enc2(keyword)}&limit=${limit}`
  const list = await getJSON(url)
  return list.map((g) => ({
    platform: '京东',
    platformId: 'jd',
    title: g.goodsname || g.title || '',
    price: Number(g.itemendprice ?? g.price ?? 0),
    originPrice: Number(g.itemprice ?? 0),
    sales: Number(g.itemsale ?? 0),
    shop: g.shopname || '京东',
    image: g.itempic || '',
    url: g.itemurl || `https://so.m.jd.com/ware/search.action?keyword=${encodeURIComponent(keyword)}`,
    source: 'haodanku'
  }))
}

// 抖音商城:好单库抖货接口为「类目榜单」,不支持关键词搜索,
// 因此这里按关键词在返回结果中做标题匹配过滤,命中率低属正常(降级处理)
export async function searchDouyin(apikey, keyword, limit = 60) {
  try {
    // 穿搭类目:1女装 / 2男装 / 3内衣 / 4美妆 / 5配饰 / 6鞋品
    const cats = [1, 2, 3, 5, 6]
    const results = await Promise.all(
      cats.map(async (catId) => {
        try {
          const url = `${BASE}/get_trill_data?apikey=${apikey}&cat_id=${catId}&back=20&min_id=1`
          return await getJSON(url)
        } catch {
          return []
        }
      })
    )
    const flat = results.flat()
    const kwChars = [...new Set(keyword.replace(/\s+/g, '').split(''))]
    const scored = flat
      .map((g) => {
        const t = g.itemtitle || ''
        const hit = kwChars.filter((c) => t.includes(c)).length
        return { g, score: hit / Math.max(1, kwChars.length) }
      })
      .filter((x) => x.score >= 0.6)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(10, limit))
    return scored.map(({ g }) => ({
      platform: '抖音商城',
      platformId: 'douyin',
      title: g.itemtitle || '',
      price: Number(g.itemendprice ?? g.itemprice ?? 0),
      originPrice: Number(g.itemprice ?? 0),
      sales: Number(g.itemsale ?? 0),
      shop: g.shopname || '抖音商城',
      image: g.itempic || '',
      url: g.itemid ? `https://haohuo.jinritemall.com/views/product/item?id=${g.itemid}` : `https://www.douyin.com/search/${encodeURIComponent(keyword)}?type=goods`,
      source: 'haodanku'
    }))
  } catch {
    return []
  }
}

export async function searchAll(apikey, keyword, limit = 20) {
  const tasks = [
    ['淘宝', searchTaobao(apikey, keyword, limit)],
    ['拼多多', searchPdd(apikey, keyword, limit)],
    ['京东', searchJd(apikey, keyword, limit)],
    ['抖音', searchDouyin(apikey, keyword, limit)]
  ]
  const settled = await Promise.allSettled(tasks.map((t) => t[1]))
  const out = []
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') out.push(...r.value)
    else console.warn(`[haodanku] ${tasks[i][0]} 失败:`, r.reason?.message)
  })
  return out
}
