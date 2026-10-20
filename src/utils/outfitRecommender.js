// 今日穿搭推荐引擎(纯函数,可在 Node 与浏览器运行)
//
// 输入:衣橱 items + 当前天气(体感温度/天气码),输出 3 套 OOTD 方案
// 设计要点:
//  1. 按体感温度分层决定穿搭槽位:天热不上外套、天冷必须有外套、短裤只在热天出现
//  2. 季节过滤:只使用当季或「四季」的衣物
//  3. 风格一致性:同一套内衣物风格统一加分,3 套方案尽量覆盖不同风格
//  4. 当日种子随机:同一天内多次生成结果一致,第二天自动换新
//  5. 缺口提示:缺哪个单品直接告诉你(可跳商城补货)

// 槽位与分类的映射(与 constants.js 的预设分类对应)
export const SLOTS = {
  tops: 'cat-tops',
  bottoms: 'cat-bottoms',
  outerwear: 'cat-outerwear',
  shoes: 'cat-shoes',
  sets: 'cat-sets'
}

// 按月份推季节
export function seasonOfDate(d = new Date()) {
  const m = d.getMonth() + 1
  if (m >= 3 && m <= 5) return '春'
  if (m >= 6 && m <= 8) return '夏'
  if (m >= 9 && m <= 11) return '秋'
  return '冬'
}

// 可复现的伪随机(mulberry32)
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashStr(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * 按体感温度得到穿搭分层
 * @returns {{ tier:string, needOuter:'must'|'prefer'|'none', shorts:boolean, desc:string }}
 */
export function temperatureTier(t) {
  if (t == null || Number.isNaN(t)) return { tier: '未知', needOuter: 'none', shorts: false, desc: '' }
  if (t >= 28) return { tier: '炎热', needOuter: 'none', shorts: true, desc: '炎热天气,透气轻薄为主' }
  if (t >= 24) return { tier: '温暖', needOuter: 'none', shorts: true, desc: '温暖舒适,轻装上阵' }
  if (t >= 18) return { tier: '舒适', needOuter: 'prefer', shorts: false, desc: '温度适宜,可备薄外套' }
  if (t >= 10) return { tier: '微凉', needOuter: 'prefer', shorts: false, desc: '微凉天气,建议加件外套' }
  if (t >= 4) return { tier: '凉', needOuter: 'must', shorts: false, desc: '天凉了,外套安排上' }
  return { tier: '寒冷', needOuter: 'must', shorts: false, desc: '严寒天气,注意保暖' }
}

function seasonOk(item, season) {
  return !item.season || item.season === '四季' || item.season === season
}

// 天气码是否降雨(带伞提示)
function isRainy(code) {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95
}

/**
 * 生成今日穿搭推荐
 * @param {Array} items  衣橱衣物(含 categoryId/season/style)
 * @param {{apparentTemp:number, weatherCode?:number, date?:Date, variant?:number}} ctx 天气上下文
 * @returns {{ outfits:Array, tier, season, rainy, missing:string[] }}
 */
export function recommendOutfits(items, { apparentTemp, weatherCode = 0, date = new Date(), variant = 0 }) {
  const season = seasonOfDate(date)
  const tier = temperatureTier(apparentTemp)
  const rainy = isRainy(weatherCode)
  const active = (items || []).filter((i) => !i.deletedAt)

  // 分槽位:当季可穿衣物
  const pool = {}
  for (const [slot, catId] of Object.entries(SLOTS)) {
    pool[slot] = active.filter((i) => i.categoryId === catId && seasonOk(i, season))
  }

  // 短裤/裙子按温度过滤下装
  pool.bottoms = pool.bottoms.filter((b) => {
    if (tier.shorts) return true // 热天长短裤都行
    // 凉/冷天:短裤不推荐(裙子允许搭配保暖,保留)
    return b.subCategory !== '短裤'
  })

  const rand = mulberry32(hashStr(date.toDateString() + '|' + Math.round(apparentTemp ?? 0) + '|' + variant))
  const shuffle = (arr) => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  // 衣橱中出现的风格(用于方案差异化)
  const styles = [...new Set(active.map((i) => i.style).filter(Boolean))]

  const pickFrom = (arr) => (arr.length ? shuffle(arr)[0] : null)

  const results = []
  const usedTops = new Set()
  const maxCount = 3

  for (let n = 0; n < maxCount; n++) {
    // 第 n 套优先围绕一个风格(第 1 套不限,保证有产出)
    const preferStyle = styles.length >= maxCount ? styles[n % styles.length] : (styles[n] || null)

    // ① 套装方案(连衣裙/连体衣):一步到位
    if (n === maxCount - 1 && pool.sets.length) {
      const set = pickFrom(pool.sets)
      const outfit = { itemIds: [set.id], isSet: true }
      const shoes = pickFrom(pool.shoes)
      if (shoes) outfit.itemIds.push(shoes.id)
      results.push(buildResult(outfit, active, tier, season, rainy, preferStyle))
      continue
    }

    // ② 上+下+鞋(+外套)
    let tops = pool.tops.filter((t) => !usedTops.has(t.id))
    if (!tops.length) tops = pool.tops
    if (preferStyle) {
      const styled = tops.filter((t) => t.style === preferStyle)
      if (styled.length) tops = styled
    }
    const top = pickFrom(tops)

    let bottoms = pool.bottoms
    if (top && top.style) {
      const styled = bottoms.filter((b) => !b.style || b.style === top.style)
      if (styled.length) bottoms = styled
    }
    const bottom = pickFrom(bottoms)

    let shoes = pool.shoes
    if (top && top.style) {
      const styled = shoes.filter((s) => !s.style || s.style === top.style)
      if (styled.length) shoes = styled
    }
    const shoe = pickFrom(shoes)

    let outer = null
    if (tier.needOuter !== 'none' && pool.outerwear.length) {
      let outers = pool.outerwear
      if (top && top.style) {
        const styled = outers.filter((o) => !o.style || o.style === top.style)
        if (styled.length) outers = styled
      }
      outer = pickFrom(outers)
    }

    if (!top && !bottom && !outer) {
      if (n === 0) break // 一件可用衣物都没有
      continue
    }

    if (top) usedTops.add(top.id)
    const itemIds = [top, bottom, shoe, outer].filter(Boolean).map((x) => x.id)
    if (!itemIds.length) continue
    results.push(buildResult({ itemIds }, active, tier, season, rainy, preferStyle))
  }

  // 去重(完全相同的组合只保留一个)
  const seen = new Set()
  const unique = results.filter((r) => {
    const k = [...r.itemIds].sort().join(',')
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  // 缺口分析
  const missing = []
  if (tier.needOuter === 'must' && !pool.outerwear.length) missing.push('外套')
  if (!pool.tops.length) missing.push('上衣')
  if (!pool.bottoms.length) missing.push('下装')
  if (!pool.shoes.length) missing.push('鞋子')

  return { outfits: unique, tier, season, rainy, missing }
}

function buildResult({ itemIds, isSet }, items, tier, season, rainy, preferStyle) {
  const chosen = itemIds.map((id) => items.find((i) => i.id === id)).filter(Boolean)
  const rs = []
  rs.push(tier.desc)
  const stylesUsed = [...new Set(chosen.map((c) => c.style).filter(Boolean))]
  if (stylesUsed.length === 1) rs.push(`${stylesUsed[0]}风格统一`)
  else if (stylesUsed.length > 1) rs.push('混搭风格')
  if (isSet) rs.push('套装一步到位')
  const hasOuter = chosen.some((c) => c.categoryId === SLOTS.outerwear)
  if (tier.needOuter === 'must' && !hasOuter) rs.push('建议添件外套')
  if (rainy) rs.push('有雨,记得带伞☔')

  const names = chosen.map((c) => c.name).join(' + ')
  return {
    itemIds,
    name: isSet ? chosen[0].name : names.slice(0, 30) || '今日穿搭',
    reasons: rs.filter(Boolean),
    count: chosen.length
  }
}
