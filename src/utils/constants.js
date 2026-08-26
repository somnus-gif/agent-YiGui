// 默认分类与常量定义

// 默认分类(用户可增删改)
// type: 'preset' 预设 | 'custom' 自定义
// subCategories: 子分类(可选)
export const DEFAULT_CATEGORIES = [
  { id: 'cat-tops', name: '上衣', icon: '👕', type: 'preset', subCategories: [] },
  {
    id: 'cat-bottoms',
    name: '下装',
    icon: '👖',
    type: 'preset',
    subCategories: ['长裤', '短裤', '裙子']
  },
  { id: 'cat-outerwear', name: '外套', icon: '🧥', type: 'preset', subCategories: [] },
  { id: 'cat-sets', name: '套装', icon: '👗', type: 'preset', subCategories: [] },
  { id: 'cat-backgrounds', name: '背景', icon: '🖼️', type: 'preset', subCategories: [] },
  { id: 'cat-underwear', name: '内衣', icon: '🩲', type: 'preset', subCategories: [] },
  { id: 'cat-accessories', name: '饰品', icon: '💍', type: 'preset', subCategories: [] },
  { id: 'cat-makeup', name: '妆容', icon: '💄', type: 'preset', subCategories: [] },
  { id: 'cat-shoes', name: '鞋子', icon: '👟', type: 'preset', subCategories: [] },
  { id: 'cat-socks', name: '袜子', icon: '🧦', type: 'preset', subCategories: [] }
]

// 季节
export const SEASONS = ['春', '夏', '秋', '冬', '四季']

// 风格
export const STYLES = ['休闲', '商务', '运动', '正式', '街头', '复古', '甜美', '极简', '优雅']

// 场合(套装用)
export const OCCASIONS = ['日常', '通勤', '约会', '聚会', '旅行', '运动', '正式场合', '度假']

// 商城配置(统一使用移动端H5地址,避免PC端反爬拦截和跳转体验差)
export const SHOPS = [
  {
    id: 'taobao',
    name: '淘宝',
    icon: '🛒',
    color: 'from-orange-400 to-orange-500',
    homeUrl: 'https://www.taobao.com/',
    searchUrl: (kw) => `https://s.taobao.com/search?q=${encodeURIComponent(kw)}`
  },
  {
    id: 'pdd',
    name: '拼多多',
    icon: '🔴',
    color: 'from-red-400 to-red-500',
    homeUrl: 'https://mobile.yangkeduo.com/',
    searchUrl: (kw) => `https://mobile.yangkeduo.com/search_result.html?search_key=${encodeURIComponent(kw)}`
  },
  {
    id: 'douyin',
    name: '抖音商城',
    icon: '🎵',
    color: 'from-slate-700 to-slate-900',
    homeUrl: 'https://www.douyin.com/',
    searchUrl: (kw) => `https://www.douyin.com/search/${encodeURIComponent(kw)}?type=goods`
  },
  {
    id: 'jd',
    name: '京东',
    icon: '🐶',
    color: 'from-red-500 to-rose-600',
    homeUrl: 'https://m.jd.com/',
    searchUrl: (kw) => `https://so.m.jd.com/ware/search.action?keyword=${encodeURIComponent(kw)}`
  }
]

// 生成唯一 id
export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}