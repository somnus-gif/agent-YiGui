// 价格数据归一化与同款排序(浏览器与 Worker 共用)

export function normalize(list) {
  return (list || [])
    .filter((x) => x && x.title && (x.price > 0 || x.originPrice > 0))
    .map((x) => ({
      platform: x.platform,
      platformId: x.platformId,
      title: String(x.title).slice(0, 120),
      price: round2(x.price || x.originPrice),
      originPrice: round2(x.originPrice || 0),
      sales: Number(x.sales || 0),
      shop: x.shop || x.platform,
      image: x.image || '',
      url: x.url || '',
      source: x.source || '',
      approx: !!x.approx
    }))
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100
}

// 标题相似度(字符集 Jaccard)
export function similarity(a, b) {
  const sa = new Set([...(a || '').replace(/\s/g, '')])
  const sb = new Set([...(b || '').replace(/\s/g, '')])
  let inter = 0
  for (const c of sa) if (sb.has(c)) inter++
  return inter / (sa.size + sb.size - inter || 1)
}

export function sortByPrice(list) {
  return [...list].sort((a, b) => (a.price || 99999) - (b.price || 99999))
}

/**
 * 关键词覆盖度:基准词里的字有多少出现在商品标题中(忽略大小写/空格)
 * 例:"白色T恤" vs "森马纯棉白色t恤男女同款" → 4/4 = 1.0
 * 用覆盖率而非 Jaccard:否则长标题会因出现大量无关字而被误判为不相关
 */
export function coverage(keyword, title) {
  const k = [...new Set((keyword || '').replace(/\s/g, '').toLowerCase())]
  if (!k.length) return 0
  const t = (title || '').replace(/\s/g, '').toLowerCase()
  let hit = 0
  for (const c of k) if (t.includes(c)) hit++
  return hit / k.length
}

/**
 * 以基准词为中心拆分为「同款候选」与「相似款」
 */
export function rankByRelevance(list, baseTitle, limit = 24) {
  if (!baseTitle) return { best: sortByPrice(list).slice(0, limit), others: [] }
  const scored = list.map((x) => ({ ...x, score: coverage(baseTitle, x.title) }))
  const best = sortByPrice(scored.filter((x) => x.score >= 0.75))
  const others = sortByPrice(scored.filter((x) => x.score < 0.75))
  return { best: best.slice(0, limit), others: others.slice(0, 12) }
}

// 各平台最低价
export function summarizeByPlatform(list) {
  const m = new Map()
  for (const x of list) {
    const cur = m.get(x.platformId)
    if (!cur || x.price < cur.price) m.set(x.platformId, x)
  }
  return [...m.values()].sort((a, b) => a.price - b.price)
}

// 图搜标题 → 搜索关键词
export function toKeyword(title, maxLen = 12) {
  const t = (title || '').replace(/[【】\[\]()（）,.，。!！]|新品|包邮|官方|旗舰店|正品/g, '')
  return t.slice(0, maxLen).trim() || (title || '').slice(0, maxLen)
}

/** 把各平台原始结果整理成前端直接可用的响应 */
export function buildResponse(items, keyword, { failed = [] } = {}) {
  const all = normalize(items)
  const { best, others } = rankByRelevance(all, keyword)
  const pool = best.length ? best : all
  return {
    keyword,
    total: all.length,
    byPlatform: summarizeByPlatform(pool),
    best,
    others,
    platforms: [...new Set(all.map((x) => x.platform))],
    failed,
    updatedAt: Date.now()
  }
}
