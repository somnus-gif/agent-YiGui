import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import TopBar from '../components/TopBar'
import { SHOPS } from '../utils/constants'
import { parseProductInput, MANMANBUY } from '../utils/linkParser'

const HOT_WORDS = ['连衣裙', 'T恤', '阔腿裤', '防晒衣', '运动鞋', '包包', '牛仔裤', '衬衫', '外套', '半身裙', '西装', '凉鞋']

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {}
  return false
}

function ShopCard({ shop, kw }) {
  const url = kw ? shop.searchUrl(kw) : shop.homeUrl
  const [copied, setCoped] = useState(false)
  const [blocked, setBlocked] = useState(false)

  const openBlank = (e) => {
    e?.stopPropagation?.()
    setBlocked(false)
    try {
      const w = window.open(url, '_blank', 'noopener,noreferrer')
      if (!w) {
        setBlocked(true)
        setTimeout(() => setBlocked(false), 2500)
      }
    } catch {
      setBlocked(true)
      setTimeout(() => setBlocked(false), 2500)
    }
  }

  const doCopy = async (e) => {
    e?.stopPropagation?.()
    const ok = await copyText(url)
    if (ok) {
      setCoped(true)
      setTimeout(() => setCoped(false), 1500)
    }
  }

  const bg = shop.id === 'taobao'
    ? 'linear-gradient(135deg,#f97316,#fb923c)'
    : shop.id === 'pdd'
    ? 'linear-gradient(135deg,#ef4444,#f43f5e)'
    : shop.id === 'douyin'
    ? 'linear-gradient(135deg,#334155,#0f172a)'
    : 'linear-gradient(135deg,#ef4444,#e11d48)'

  return (
    <a
      href={url}
      target="_top"
      rel="noopener noreferrer"
      className="card p-4 flex flex-col gap-2 active:scale-[0.97] transition relative overflow-hidden block"
      style={{ backgroundImage: bg }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-3xl pointer-events-none select-none">{shop.icon}</span>
          <span className="font-semibold text-white text-lg drop-shadow pointer-events-none select-none">{shop.name}</span>
        </div>
        <div className="flex gap-1" onClick={(e) => e.preventDefault()}>
          <button
            onClick={doCopy}
            title="复制链接"
            className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 text-white/90 text-xs flex items-center justify-center"
          >{copied ? '✓' : '🔗'}</button>
          <button
            onClick={openBlank}
            title="新窗口打开"
            className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 text-white/90 text-xs flex items-center justify-center"
          >↗</button>
        </div>
      </div>
      <p className="text-white/90 text-xs truncate pointer-events-none select-none">
        {kw ? `🔍「${kw}」搜索结果` : '直达商城首页'}
      </p>
      {blocked && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-xs p-2 text-center rounded-2xl">
          弹窗被拦截<br />请点 ↗ 按钮新窗口打开
        </div>
      )}
    </a>
  )
}

// 慢慢买比价卡片(历史价格/全网搜索)
function ManmanbuyCard({ url, title, subtitle, big }) {
  const open = (e) => {
    e?.preventDefault?.()
    try {
      const w = window.open(url, '_blank', 'noopener,noreferrer')
      if (!w) window.location.href = url
    } catch {
      window.location.href = url
    }
  }
  if (big) {
    return (
      <button
        onClick={open}
        className="w-full card p-4 flex items-center gap-3 active:scale-[0.98] transition text-left"
        style={{ backgroundImage: 'linear-gradient(135deg,#0d9488,#14b8a6)' }}
      >
        <span className="text-3xl">📊</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white">{title}</p>
          <p className="text-white/85 text-xs mt-0.5 leading-snug">{subtitle}</p>
        </div>
        <span className="text-white/90 text-lg">→</span>
      </button>
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="card p-4 flex flex-col gap-2 active:scale-[0.97] transition relative overflow-hidden block"
      style={{ backgroundImage: 'linear-gradient(135deg,#0d9488,#14b8a6)' }}
    >
      <div className="flex items-center gap-2">
        <span className="text-3xl pointer-events-none select-none">📊</span>
        <span className="font-semibold text-white text-lg drop-shadow pointer-events-none select-none">慢慢买比价</span>
      </div>
      <p className="text-white/90 text-xs truncate pointer-events-none select-none">{subtitle}</p>
    </a>
  )
}

export default function ShopPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [mode, setMode] = useState('single')
  const [keyword, setKeyword] = useState('')
  const [compareKw, setCompareKw] = useState('')
  const [tip, setTip] = useState('')

  // 链接比价模式
  const [pasteText, setPasteText] = useState('')
  const [linkKw, setLinkKw] = useState('')
  const [pasteLock, setPasteLock] = useState(false) // 锁定解析结果,避免边打字边跳变

  // ?q= 预填关键词(衣橱「全网搜同款」入口)
  useEffect(() => {
    const q = searchParams.get('q')
    if (q) {
      setKeyword(q)
      setCompareKw(q)
      setLinkKw(q)
      setMode('single')
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const kw = keyword.trim()
  const compareKeyword = compareKw.trim()

  const parsed = pasteLock ? parseProductInput(pasteText) : null
  const linkKeyword = linkKw.trim()

  const openAll = () => {
    if (!compareKeyword) {
      setTip('请先输入要比价的商品关键词')
      setTimeout(() => setTip(''), 2000)
      return
    }
    let blockedCount = 0
    const opened = []
    for (let i = 0; i < SHOPS.length; i++) {
      const s = SHOPS[i]
      const u = s.searchUrl(compareKeyword)
      try {
        const w = window.open(u, '_blank', 'noopener,noreferrer')
        if (!w) {
          blockedCount++
        } else {
          opened.push(s.name)
        }
      } catch {
        blockedCount++
      }
    }
    if (blockedCount > 0) {
      setTip(`浏览器拦截了 ${blockedCount} 个弹窗(共${SHOPS.length}个),请先在浏览器弹窗权限设置中允许本站,或点击下方各商城卡片右上角 ↗ 按钮逐个打开。已打开:${opened.join('/') || '无'}`)
    } else if (opened.length === SHOPS.length) {
      setTip(`已打开 ${opened.join('/')} 的搜索页,请切换浏览器标签对比价格`)
      setTimeout(() => setTip(''), 3500)
    } else {
      setTip(`已打开:${opened.join('/')},请在下方卡片单独打开剩余商城`)
    }
  }

  return (
    <div className="page-enter pb-20">
      <TopBar title="🛍️ 商城比价" />

      <div className="px-4 pt-4 space-y-4">
        <div className="card p-1 flex gap-1">
          <button
            onClick={() => setMode('single')}
            className={`flex-1 h-9 rounded-xl text-sm font-medium transition ${mode === 'single' ? 'bg-brand-500 text-white shadow' : 'text-slate-600'}`}
          >🛒 单商城搜索</button>
          <button
            onClick={() => setMode('link')}
            className={`flex-1 h-9 rounded-xl text-sm font-medium transition ${mode === 'link' ? 'bg-brand-500 text-white shadow' : 'text-slate-600'}`}
          >🔗 链接比价</button>
          <button
            onClick={() => setMode('compare')}
            className={`flex-1 h-9 rounded-xl text-sm font-medium transition ${mode === 'compare' ? 'bg-brand-500 text-white shadow' : 'text-slate-600'}`}
          >⚖️ 比价助手</button>
        </div>

        {mode === 'link' && (
          <>
            <div className="card p-4">
              <p className="text-sm font-medium text-slate-700 mb-1">🔗 粘贴商品链接</p>
              <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                复制淘宝/京东/拼多多/抖音的商品链接粘进来,一键查看<strong className="text-teal-600">180 天价格走势</strong>与全网同款报价,识破「先涨后降」
              </p>
              <div className="flex gap-2">
                <input
                  value={pasteText}
                  onChange={(e) => {
                    setPasteText(e.target.value)
                    setPasteLock(false)
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') setPasteLock(true) }}
                  placeholder="粘贴商品链接,如:https://item.jd.com/xxx.html"
                  className="flex-1 h-10 px-3 rounded-xl bg-slate-100 text-sm outline-none focus:bg-slate-200"
                />
                <button
                  onClick={() => setPasteLock(true)}
                  className="h-10 px-4 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 text-white text-sm font-medium active:scale-95 whitespace-nowrap"
                >解析比价</button>
              </div>

              {parsed && parsed.isLink && (
                <div className="mt-3 px-3 py-2 rounded-xl bg-slate-100 text-xs text-slate-600 flex items-center gap-2">
                  <span>来源:</span>
                  <span className="chip bg-white text-slate-700 border border-slate-200">
                    {parsed.platform ? `${parsed.platform.icon} ${parsed.platform.name}` : '🌐 其他平台'}
                  </span>
                  <span className="text-slate-400 truncate flex-1">{parsed.url?.slice(0, 40)}…</span>
                </div>
              )}
              {parsed && !parsed.isLink && pasteText.trim() && (
                <div className="mt-3 px-3 py-2 rounded-xl bg-slate-100 text-xs text-slate-600">
                  检测到的是<strong>关键词</strong>而非链接,已为你切换为全网关键词比价(下方直接点慢慢买)
                </div>
              )}
            </div>

            {/* 慢慢买:链接→历史价格 / 关键词→全网搜索 */}
            {pasteText.trim() && (
              <ManmanbuyCard
                big
                url={parsed?.manmanbuyUrl || MANMANBUY.searchUrl(pasteText.trim())}
                title={parsed?.isLink ? '查看 180 天价格走势' : '全网比价'}
                subtitle={
                  parsed?.isLink
                    ? '价格曲线 · 全网同款报价 · 促销真假识别 · 历史最低价'
                    : `「${pasteText.trim()}」全网报价列表,多平台横向对比`
                }
              />
            )}

            {/* 跨平台搜同款 */}
            {(parsed?.isLink || linkKeyword) && (
              <div className="card p-4">
                <p className="text-sm font-medium text-slate-700 mb-1">🛒 其他平台搜同款</p>
                {parsed?.isLink && (
                  <p className="text-xs text-slate-400 mb-2">
                    {parsed.platform ? `当前来自${parsed.platform.name},` : ''}想查其他平台价格,输入商品名搜索:
                  </p>
                )}
                <div className="flex gap-2">
                  <input
                    value={linkKw}
                    onChange={(e) => setLinkKw(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setLinkKw(e.target.value.trim()) }}
                    placeholder="输入商品名,如:优衣库白色T恤"
                    className="flex-1 h-10 px-3 rounded-xl bg-slate-100 text-sm outline-none focus:bg-slate-200"
                  />
                </div>
                {linkKeyword && (
                  <>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      {SHOPS.filter((s) => s.id !== parsed?.platform?.id).map((s) => (
                        <ShopCard key={s.id} shop={s} kw={linkKeyword} />
                      ))}
                    </div>
                    <div className="mt-3">
                      <ManmanbuyCard
                        url={MANMANBUY.searchUrl(linkKeyword)}
                        subtitle={`「${linkKeyword}」全网报价列表,多平台横向对比`}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="text-center text-xs text-slate-400 pt-1 leading-relaxed">
              💡 支持淘宝/天猫/京东/拼多多/抖音商品链接<br />价格数据来自慢慢买比价网,历史价格以页面展示为准
            </div>
          </>
        )}

        {mode === 'single' && (
          <>
            <div className="card p-3">
              <div className="flex gap-2">
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setKeyword(keyword.trim()) }}
                  placeholder="输入商品关键词,如:白色T恤"
                  className="flex-1 h-10 px-3 rounded-xl bg-slate-100 text-sm outline-none focus:bg-slate-200"
                />
                <button
                  onClick={() => setKeyword(keyword.trim())}
                  className="h-10 px-4 rounded-xl bg-brand-500 text-white text-sm font-medium active:scale-95"
                >搜索</button>
              </div>
              <div className="mt-3">
                <p className="text-xs text-slate-400 mb-2">🔥 热门搜索</p>
                <div className="flex gap-2 flex-wrap">
                  {HOT_WORDS.map((w) => (
                    <button
                      key={w}
                      onClick={() => setKeyword(w)}
                      className="chip bg-slate-100 text-slate-600 active:bg-brand-100 active:text-brand-600"
                    >{w}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {SHOPS.map((s) => (
                <ShopCard key={s.id} shop={s} kw={kw} />
              ))}
            </div>

            <div className="text-center text-xs text-slate-400 pt-2">
              💡 点击卡片直达商城,右上角 ↗ 可新窗口打开,🔗 可复制链接
            </div>
          </>
        )}

        {mode === 'compare' && (
          <>
            <div className="card p-4">
              <p className="text-sm font-medium text-slate-700 mb-2">⚖️ 同屏多商城比价</p>
              <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                ① 点「一键比价」尝试<strong className="text-brand-600">同时打开 4 个商城</strong>，最方便。<br />
                ② 若浏览器弹窗被拦（地址栏右侧有「弹窗被拦截」图标），请点下方<strong className="text-rose-500">彩色卡片逐个打开</strong>，每张卡片独立一次点击，不会被拦截。
              </p>
              <div className="flex gap-2">
                <input
                  value={compareKw}
                  onChange={(e) => setCompareKw(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') openAll() }}
                  placeholder="输入要比价的商品,如:优衣库T恤"
                  className="flex-1 h-10 px-3 rounded-xl bg-slate-100 text-sm outline-none focus:bg-slate-200"
                />
                <button
                  onClick={openAll}
                  className="h-10 px-5 rounded-xl bg-gradient-to-r from-brand-500 to-violet-500 text-white text-sm font-medium shadow active:scale-95 whitespace-nowrap"
                >一键比价</button>
              </div>
              <div className="mt-3">
                <p className="text-xs text-slate-400 mb-2">热门词(点一下即用)</p>
                <div className="flex gap-2 flex-wrap">
                  {HOT_WORDS.slice(0, 6).map((w) => (
                    <button
                      key={w}
                      onClick={() => setCompareKw(w)}
                      className="chip bg-slate-100 text-slate-600 active:bg-brand-100 active:text-brand-600"
                    >{w}</button>
                  ))}
                </div>
              </div>
              {tip && (
                <p className="mt-3 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">{tip}</p>
              )}
            </div>

            <div className="space-y-2">
              {compareKeyword ? (
                <>
                  <p className="text-xs text-slate-500 px-1">
                    <span className="text-rose-500 font-semibold">② 逐个打开兜底</span>（批量被拦时点这里）：每次点击都是独立手势，不会被拦截
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {SHOPS.map((s) => (
                      <ShopCard key={s.id} shop={s} kw={compareKeyword} />
                    ))}
                  </div>
                  <div className="card p-3 mt-2">
                    <p className="text-xs text-slate-500 mb-2">🚀 一行快捷(点击一个开一个)</p>
                    <div className="flex gap-2 flex-wrap">
                      {SHOPS.map((s) => (
                        <a
                          key={s.id}
                          href={s.searchUrl(compareKeyword)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`h-9 px-3 rounded-xl text-white text-xs font-medium flex items-center gap-1 active:scale-95 shadow-sm`}
                          style={{ background: s.id === 'taobao' ? 'linear-gradient(135deg,#f97316,#fb923c)' : s.id === 'pdd' ? 'linear-gradient(135deg,#ef4444,#f43f5e)' : s.id === 'douyin' ? 'linear-gradient(135deg,#334155,#0f172a)' : 'linear-gradient(135deg,#ef4444,#e11d48)' }}
                        >
                          <span>{s.icon}</span><span>{s.name}</span><span>↗</span>
                        </a>
                      ))}
                      <a
                        href={MANMANBUY.searchUrl(compareKeyword)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-9 px-3 rounded-xl text-white text-xs font-medium flex items-center gap-1 active:scale-95 shadow-sm"
                        style={{ background: 'linear-gradient(135deg,#0d9488,#14b8a6)' }}
                      >
                        <span>📊</span><span>慢慢买</span><span>↗</span>
                      </a>
                    </div>
                  </div>
                </>
              ) : (
                <div className="card p-5 text-center text-slate-400 text-xs">
                  👆 先在上方输入要比价的商品关键词（如「连衣裙」），立即出现 4 个商城入口
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="h-6" />
    </div>
  )
}