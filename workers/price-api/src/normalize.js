// 统一商品结构 + 排序/去重/同款分组

export function normalize(list) {
  return list
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
      source: x.source || ''
    }))
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100
}

// 标题相似度(字符集合的 Jaccard),用于同款分组与噪声过滤
export function similarity(a, b) {
  const sa = new Set([...a.replace(/\s/g, '')])
  const sb = new Set([...b.replace(/\s/g, '')])
  let inter = 0
  for (const c of sa) if (sb.has(c)) inter++
  return inter / (sa.size + sb.size - inter || 1)
}

/**
 * 以基准标题(图搜结果/用户输入)为中心,过滤无关商品并排序
 * @returns {{best:Array, others:Array}} best=同款候选(按价格升序), others=相似款
 */
export function rankByRelevance(list, baseTitle, limit = 24) {
  if (!baseTitle) {
    return { best: sortByPrice(list).slice(0, limit), others: [] }
  }
  const scored = list.map((x) => ({ ...x, score: similarity(baseTitle, x.title) }))
  const best = sortByPrice(scored.filter((x) => x.score >= 0.45))
  const others = sortByPrice(scored.filter((x) => x.score < 0.45))
  return { best: best.slice(0, limit), others: others.slice(0, 12) }
}

export function sortByPrice(list) {
  return [...list].sort((a, b) => (a.price || 99999) - (b.price || 99999))
}

// 各平台最低价汇总
export function summarizeByPlatform(list) {
  const m = new Map()
  for (const x of list) {
    const cur = m.get(x.platformId)
    if (!cur || x.price < cur.price) m.set(x.platformId, x)
  }
  return [...m.values()].sort((a, b) => a.price - b.price)
}

// 极简标题关键词提取(用于把图搜标题转成搜索词)
export function toKeyword(title, maxLen = 12) {
  const t = (title || '').replace(/[【】\[\]()（）,.，。!！]|新品|包邮|官方|旗舰店|正品/g, '')
  return t.slice(0, maxLen).trim() || (title || '').slice(0, maxLen)
}
