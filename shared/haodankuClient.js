// 好单库(haodanku)客户端:浏览器与 Worker 共用
// 之所以能共用:该接口同时支持 HTTPS 与 CORS(Access-Control-Allow-Origin: *),
// 因此前端可直连,无需自建后端代理(个人使用场景下接受 apikey 暴露在前端)
//
// 注意:拼多多/京东接口要求在好单库后台授权对应的多多进宝/京东联盟账号,
// 抖音需联系客服开通权限;未授权时接口会返回错误码,这里静默跳过。

const BASE = 'https://v2.api.haodanku.com'

// 好单库要求关键词做两次 urlencode
export const enc2 = (s) => encodeURIComponent(encodeURIComponent(s))

async function getJSON(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }
  })
  if (!res.ok) throw new Error(`好单库请求失败 ${res.status}`)
  const j = await res.json()
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
    url: g.itemlink || (g.itemid?.startsWith?.('http') ? g.itemid : `https://item.taobao.com/item.htm?id=${g.itemid}`),
    source: 'haodanku'
  }))
}

// 拼多多(需后台授权多多进宝账号)
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

// 京东(需后台授权京东联盟账号)
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

/**
 * 抖音:好单库只开放「带货商品榜」(get_trill_data),没有关键词搜索接口
 * (实测 keyword 参数会被忽略)。因此只能翻榜单再按关键词覆盖度过滤,
 * 命中即为「同款参考价」,未命中则不上报为有效价格——宁缺勿错。
 */
export async function searchDouyin(apikey, keyword, limit = 10) {
  // back 仅允许 1/2/5/10/20;min_id 为分页游标
  const pages = await Promise.all(
    [1, 2, 3, 4].map(async (minId) => {
      try {
        return await getJSON(`${BASE}/get_trill_data?apikey=${apikey}&cat_id=0&back=20&min_id=${minId}`)
      } catch {
        return []
      }
    })
  )
  const flat = pages.flat()
  const kwChars = [...new Set(keyword.replace(/\s+/g, '').split(''))]
  return flat
    .map((g) => {
      const t = g.itemtitle || ''
      const hit = kwChars.filter((c) => t.includes(c)).length
      return { g, score: hit / Math.max(1, kwChars.length) }
    })
    .filter((x) => x.score >= 0.75)
    .sort((a, b) => b.score - a.score || Number(a.g.itemendprice) - Number(b.g.itemendprice))
    .slice(0, limit)
    .map(({ g }) => ({
      platform: '抖音商城',
      platformId: 'douyin',
      title: g.itemtitle || '',
      price: Number(g.itemendprice ?? g.itemprice ?? 0),
      originPrice: Number(g.itemprice ?? 0),
      sales: Number(g.itemsale ?? 0),
      shop: g.shopname || '抖音商城',
      image: g.itempic || '',
      url: g.itemid
        ? `https://haohuo.jinritemall.com/views/product/item?id=${g.itemid}`
        : `https://www.douyin.com/search/${encodeURIComponent(keyword)}?type=goods`,
      source: 'haodanku-rank',
      approx: true // 榜单命中,非精确同款
    }))
}

// 未开通平台的自助引导(好单库后台授权中心)
export const AUTH_CENTER = 'https://publish.haodanku.com/Promotioncenter/auth'

// 平台接入状态说明:前端据实展示,不假装能出价
export const PLATFORM_GUIDE = {
  taobao: { name: '淘宝/天猫', status: 'ok', tip: '默认已开通' },
  pdd: {
    name: '拼多多',
    status: 'need-auth',
    tip: '去多多进宝(jinbao.pinduoduo.com)建推广位拿 PID,再回好单库授权页绑定',
    fix: `${AUTH_CENTER}?platform=3`
  },
  jd: {
    name: '京东',
    status: 'need-auth',
    tip: '去京东联盟(union.jd.com)拿联盟ID + 授权Key,再回好单库授权页绑定',
    fix: AUTH_CENTER
  },
  douyin: {
    name: '抖音商城',
    status: 'partial',
    tip: '好单库未开放抖音关键词搜索,仅在带货榜单命中时给出参考价;完整搜索需联系好单库客服开通'
  },
  1688: {
    name: '1688',
    status: 'unsupported',
    tip: '1688 无面向个人的免费开放商品接口,暂不接入'
  }
}

// 并行查询全部平台,单平台失败不影响其他
export async function searchAll(apikey, keyword, limit = 20) {
  const tasks = [
    ['淘宝', () => searchTaobao(apikey, keyword, limit)],
    ['拼多多', () => searchPdd(apikey, keyword, limit)],
    ['京东', () => searchJd(apikey, keyword, limit)],
    ['抖音', () => searchDouyin(apikey, keyword)]
  ]
  const out = []
  const failed = []
  await Promise.all(
    tasks.map(async ([name, fn]) => {
      try {
        const list = await fn()
        if (!list.length) {
          // 抖音走榜单兜底,空结果属于「未命中」而非接口报错
          failed.push({
            name,
            message: name === '抖音' ? PLATFORM_GUIDE.douyin.tip : '暂无数据',
            kind: 'empty'
          })
          return
        }
        out.push(...list)
      } catch (e) {
        failed.push({ name, message: e?.message || '失败', kind: 'error' })
      }
    })
  )
  return { items: out, failed }
}
