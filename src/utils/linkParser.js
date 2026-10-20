// 商品链接解析 + 慢慢买比价接入(阶段一:纯前端跳转,无后端无 Key)
//
// 慢慢买(manmanbuy.com)是全网比价平台,两个实测可用的入口:
//  1. 历史价格: https://tool.manmanbuy.com/HistoryLowest.aspx?url=<商品链接编码>
//     展示 180 天价格曲线、全网同款价格、促销真假识别
//  2. 关键词搜索: https://s.manmanbuy.com/pc/search/result?keyword=<关键词>
//     展示各平台同款商品报价列表

// 慢慢买入口
export const MANMANBUY = {
  name: '慢慢买',
  icon: '📊',
  historyUrl(itemUrl) {
    return `https://tool.manmanbuy.com/HistoryLowest.aspx?url=${encodeURIComponent(itemUrl)}`
  },
  searchUrl(kw) {
    return `https://s.manmanbuy.com/pc/search/result?keyword=${encodeURIComponent(kw)}`
  }
}

// 平台识别规则(按域名匹配,与 constants.js 的 SHOPS 对应)
const PLATFORM_RULES = [
  { id: 'taobao', name: '淘宝/天猫', icon: '🛒', test: /(\.|^)(taobao|tmall)\.com/i },
  { id: 'jd', name: '京东', icon: '🐶', test: /(\.|^)(jd)\.com/i },
  { id: 'pdd', name: '拼多多', icon: '🔴', test: /(\.|^)(yangkeduo|pinduoduo)\.com/i },
  { id: 'douyin', name: '抖音商城', icon: '🎵', test: /(\.|^)(douyin|jinritemall|ecombdapi)\.(com|cn)/i }
]

// 判断输入是不是一条 URL
export function looksLikeUrl(text) {
  return /^https?:\/\/\S+$/i.test((text || '').trim())
}

/**
 * 解析粘贴的文本:商品链接 或 纯关键词
 * @param {string} text
 * @returns {{ isLink:boolean, url:string|null, platform:{id,name,icon}|null, manmanbuyUrl:string|null }}
 *  - platform 为 null 表示是链接但识别不出平台(仍可跳慢慢买查价格)
 */
export function parseProductInput(text) {
  const t = (text || '').trim()
  if (!looksLikeUrl(t)) {
    return { isLink: false, url: null, platform: null, manmanbuyUrl: t ? MANMANBUY.searchUrl(t) : null }
  }
  let host = ''
  try {
    host = new URL(t).hostname
  } catch {
    host = t
  }
  const platform = PLATFORM_RULES.find((r) => r.test.test(host)) || null
  return {
    isLink: true,
    url: t,
    platform,
    manmanbuyUrl: MANMANBUY.historyUrl(t)
  }
}
