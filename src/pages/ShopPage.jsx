import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import TopBar from '../components/TopBar'
import { SHOPS } from '../utils/constants'
import { parseProductInput, MANMANBUY } from '../utils/linkParser'
import { useApp } from '../context/AppContext'
import { searchByKeyword, searchByImage, isPriceApiConfigured, priceMode, PLATFORM_GUIDE } from '../utils/priceApi'
import { prepImageForSearch } from '../utils/imagePrep'
import EmbedCompare from '../components/EmbedCompare'

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
  const { items } = useApp()
  const [searchParams, setSearchParams] = useSearchParams()
  const [mode, setMode] = useState('single')
  const [keyword, setKeyword] = useState('')
  const [tip, setTip] = useState('')

  // 链接比价模式
  const [pasteText, setPasteText] = useState('')
  const [linkKw, setLinkKw] = useState('')
  const [pasteLock, setPasteLock] = useState(false) // 锁定解析结果,避免边打字边跳变

  // 同页比价模式
  const [cmpKw, setCmpKw] = useState('')
  const [cmpLoading, setCmpLoading] = useState(false)
  const [cmpErr, setCmpErr] = useState('')
  const [cmpResult, setCmpResult] = useState(null) // {keyword,best,byPlatform,others,...}
  const [cmpFrom, setCmpFrom] = useState('') // 'image' | 'kw'
  const [wardrobeOpen, setWardrobeOpen] = useState(false)

  const apiReady = isPriceApiConfigured()

  // ?q= 预填关键词(衣橱「全网比价」入口);?item=<id> 直接对该衣物图搜
  useEffect(() => {
    const q = searchParams.get('q')
    const itemId = searchParams.get('item')
    if (q) {
      setKeyword(q)
      setCmpKw(q)
      setMode('single')
      setSearchParams({}, { replace: true })
    } else if (itemId) {
      const it = items.find((x) => x.id === itemId)
      setSearchParams({}, { replace: true })
      if (it) {
        setMode('compare')
        runImageSearch(it.image)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const kw = keyword.trim()

  const parsed = pasteLock ? parseProductInput(pasteText) : null
  const linkKeyword = linkKw.trim()

  // ---- 同页比价 ----
  const runKeywordSearch = async (text) => {
    const t = (text ?? cmpKw).trim()
    if (!t) return
    if (!apiReady) { setCmpErr('NOT_CONFIGURED'); return }
    setCmpLoading(true); setCmpErr(''); setCmpResult(null); setCmpFrom('kw')
    try {
      const r = await searchByKeyword(t)
      setCmpResult(r)
      if (!r.best?.length && !r.byPlatform?.length) setCmpErr('EMPTY')
    } catch (e) {
      setCmpErr(e.message || '比价失败')
    } finally {
      setCmpLoading(false)
    }
  }

  const runImageSearch = async (imageSrc) => {
    if (!apiReady) { setCmpErr('NOT_CONFIGURED'); setMode('compare'); return }
    if (priceMode !== 'worker') {
      // 图搜依赖大淘客 AppSecret,不能放前端 → 直连模式下引导改用关键词
      setMode('compare')
      setCmpErr('IMAGE_NEEDS_BACKEND')
      setCmpLoading(false)
      return
    }
    setMode('compare')
    setCmpLoading(true); setCmpErr(''); setCmpResult(null); setCmpFrom('image')
    try {
      const dataUrl = await prepImageForSearch(imageSrc)
      const r = await searchByImage(dataUrl)
      setCmpResult(r)
      if (r.keyword) setCmpKw(r.keyword)
      if (!r.best?.length && !r.imageItems?.length) setCmpErr('EMPTY')
    } catch (e) {
      setCmpErr(e.message || '图片比价失败')
    } finally {
      setCmpLoading(false)
    }
  }

  const onUploadImage = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => runImageSearch(reader.result)
    reader.readAsDataURL(f)
    e.target.value = ''
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
          >🆚 同页比价</button>
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
              <p className="text-sm font-medium text-slate-700 mb-1">🆚 同页比价</p>
              <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                输入关键词或直接用<strong className="text-brand-600">衣橱图片</strong>搜同款,各平台价格在<strong>本页直接对比</strong>,无需开多个商城
              </p>
              <div className="flex gap-2">
                <input
                  value={cmpKw}
                  onChange={(e) => setCmpKw(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') runKeywordSearch() }}
                  placeholder="输入商品关键词,如:优衣库白色T恤"
                  className="flex-1 h-10 px-3 rounded-xl bg-slate-100 text-sm outline-none focus:bg-slate-200"
                />
                <button
                  onClick={() => runKeywordSearch()}
                  disabled={cmpLoading}
                  className="h-10 px-5 rounded-xl bg-gradient-to-r from-brand-500 to-violet-500 text-white text-sm font-medium shadow active:scale-95 whitespace-nowrap disabled:opacity-50"
                >{cmpLoading ? '比价中…' : '搜价格'}</button>
              </div>
              <div className="flex gap-2 mt-2.5">
                <button
                  onClick={() => { if (items.length) setWardrobeOpen(true); else setTip('衣橱是空的,先去添加衣物') }}
                  className="flex-1 h-9 rounded-xl bg-slate-100 text-slate-600 text-xs font-medium active:bg-slate-200"
                >📷 用衣橱图片搜同款</button>
                <label className="flex-1 h-9 rounded-xl bg-slate-100 text-slate-600 text-xs font-medium active:bg-slate-200 flex items-center justify-center cursor-pointer">
                  📤 上传图片搜索
                  <input type="file" accept="image/*" className="hidden" onChange={onUploadImage} />
                </label>
              </div>
              <div className="mt-2.5">
                <div className="flex gap-2 flex-wrap">
                  {HOT_WORDS.slice(0, 6).map((w) => (
                    <button
                      key={w}
                      onClick={() => { setCmpKw(w); runKeywordSearch(w) }}
                      className="chip bg-slate-100 text-slate-600 active:bg-brand-100 active:text-brand-600"
                    >{w}</button>
                  ))}
                </div>
              </div>
              {tip && (
                <p className="mt-3 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">{tip}</p>
              )}
            </div>

            {/* 未配置后端 */}
            {!apiReady && !cmpLoading && (
              <div className="card p-4 text-xs text-slate-500 leading-relaxed">
                <p className="text-slate-700 font-medium mb-1">⚙️ 同页比价需要部署比价后端</p>
                按仓库内 <code className="bg-slate-100 px-1 rounded">workers/price-api/README.md</code> 的步骤:申请好单库/大淘客密钥(个人免费)→ 部署 Cloudflare Worker → 在前端 <code className="bg-slate-100 px-1 rounded">.env</code> 配置 <code className="bg-slate-100 px-1 rounded">VITE_PRICE_API</code>。<br />
                <span className="text-slate-400">未部署前,可用下方「链接比价」模式(跳慢慢买看全网价格)。</span>
              </div>
            )}

            {/* 加载中 */}
            {cmpLoading && (
              <div className="card p-6 text-center">
                <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-brand-400 to-violet-500 animate-pulse flex items-center justify-center text-white text-lg">🔍</div>
                <p className="text-sm text-slate-600 mt-3 font-medium">{cmpFrom === 'image' ? '正在识别图片并全网比价…' : '正在各平台查询价格…'}</p>
                <p className="text-xs text-slate-400 mt-1">好单库 + 大淘客,首次约需 2~5 秒</p>
              </div>
            )}

            {/* 错误/空结果 */}
            {!cmpLoading && cmpErr && (
              <div className="card p-4 text-xs leading-relaxed">
                {cmpErr === 'NOT_CONFIGURED' ? (
                  <p className="text-slate-500">未配置比价数据源:在 <code className="bg-slate-100 px-1 rounded">.env</code> 填 <code className="bg-slate-100 px-1 rounded">VITE_HDK_APIKEY</code>(直连好单库)或 <code className="bg-slate-100 px-1 rounded">VITE_PRICE_API</code>(Worker 后端)。</p>
                ) : cmpErr === 'IMAGE_NEEDS_BACKEND' ? (
                  <div>
                    <p className="text-slate-600 mb-1">图片比价需要部署后端(图搜凭证不能放前端)。</p>
                    <p className="text-slate-400">当前可先输入关键词比价;要解锁图搜,按 <code className="bg-slate-100 px-1 rounded">workers/price-api/README.md</code> 部署 Worker 后配置 VITE_PRICE_API。</p>
                  </div>
                ) : cmpErr === 'EMPTY' ? (
                  <div>
                    <p className="text-slate-600 mb-1">😮 没搜到同款——淘客数据只覆盖有佣金的推广商品,小众款式可能搜不到。</p>
                    <p className="text-slate-400">可以换个更通用的关键词(如「白色T恤」),或{' '}
                      <a className="text-teal-600 underline" href={MANMANBUY.searchUrl(cmpKw || '连衣裙')} target="_blank" rel="noopener noreferrer">去慢慢买搜全网报价 ↗</a>
                    </p>
                  </div>
                ) : (
                  <p className="text-rose-500">比价失败:{cmpErr}</p>
                )}
              </div>
            )}

            {/* 结果:各平台最低价 + 同款列表 */}
            {cmpResult && !cmpLoading && (
              <>
                <div className="card p-4">
                  <p className="text-sm font-medium text-slate-700 mb-0.5">💰 各平台最低价</p>
                  <p className="text-[10px] text-slate-400 mb-2.5">
                    {cmpFrom === 'image' && '📷 图片识别: '}
                    「{cmpResult.keyword || cmpResult.recognizedTitle || cmpKw}」 · 共 {cmpResult.total || 0} 条结果 · 价格以平台页面为准
                  </p>
                  {(cmpResult.failed || []).length > 0 && (
                    <div className="mb-2.5 px-2.5 py-2 rounded-lg bg-amber-50 text-amber-700 text-[10px] leading-snug space-y-1">
                      {cmpResult.failed.map((f, i) => {
                        const g =
                          Object.values(PLATFORM_GUIDE).find((x) => x.name === f.name) ||
                          Object.values(PLATFORM_GUIDE).find((x) => x.name.startsWith(f.name))
                        return (
                          <p key={i}>
                            ⚠️ <b>{f.name}</b>:{g?.tip || f.message}
                            {g?.fix && (
                              <>
                                {' '}
                                <a
                                  className="underline text-teal-700"
                                  href={g.fix}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  去授权 ↗
                                </a>
                              </>
                            )}
                          </p>
                        )
                      })}
                      <p className="text-amber-600/70">1688:{PLATFORM_GUIDE[1688].tip}</p>
                    </div>
                  )}
                  {(cmpResult.byPlatform || []).length > 0 ? (
                    <div className="flex gap-2 flex-wrap">
                      {cmpResult.byPlatform.map((x, i) => (
                        <a
                          key={x.platformId + i}
                          href={x.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`px-3 py-2 rounded-xl text-white flex flex-col items-start active:scale-95 transition shadow-sm ${
                            i === 0 ? 'ring-2 ring-amber-300' : ''
                          }`}
                          style={{
                            background:
                              x.platformId === 'taobao' || x.platformId === 'tmall' ? 'linear-gradient(135deg,#f97316,#fb923c)'
                              : x.platformId === 'pdd' ? 'linear-gradient(135deg,#ef4444,#f43f5e)'
                              : x.platformId === 'jd' ? 'linear-gradient(135deg,#ef4444,#e11d48)'
                              : x.platformId === 'douyin' ? 'linear-gradient(135deg,#334155,#0f172a)'
                              : 'linear-gradient(135deg,#0d9488,#14b8a6)'
                          }}
                        >
                          <span className="text-[10px] text-white/85">{x.platform} {i === 0 && '· 最低'}</span>
                          <span className="text-sm font-bold">¥{x.price}</span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">暂无汇总数据</p>
                  )}
                </div>

                {(cmpResult.best || []).length > 0 && (
                  <div className="card p-4">
                    <p className="text-sm font-medium text-slate-700 mb-2.5">🛒 同款候选(按价格从低到高)</p>
                    <div className="space-y-2">
                      {cmpResult.best.map((g, i) => (
                        <a
                          key={g.url + i}
                          href={g.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2.5 p-2 rounded-xl border border-slate-100 active:bg-slate-50 transition"
                        >
                          <div className="w-14 h-14 rounded-lg bg-white border border-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                            {g.image ? <img src={g.image} alt={g.title} className="max-w-full max-h-full object-contain p-0.5" loading="lazy" /> : <span className="text-slate-300 text-xs">无图</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-700 line-clamp-2 leading-snug">{g.title}</p>
                            <div className="flex gap-1 mt-1 flex-wrap">
                              <span className="chip bg-slate-100 text-slate-500">{g.platform}</span>
                              {g.approx && <span className="chip bg-amber-50 text-amber-600 border border-amber-100">榜单参考</span>}
                              {g.shop && <span className="chip bg-slate-50 text-slate-400 border border-slate-100">{g.shop}</span>}
                              {g.sales > 0 && <span className="chip bg-slate-50 text-slate-400 border border-slate-100">月售{g.sales >= 10000 ? `${(g.sales / 10000).toFixed(1)}万` : g.sales}</span>}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {g.originPrice > g.price && <p className="text-[10px] text-slate-400 line-through">¥{g.originPrice}</p>}
                            <p className={`text-sm font-bold ${i === 0 ? 'text-rose-500' : 'text-slate-800'}`}>¥{g.price}</p>
                            {i === 0 && <p className="text-[9px] text-amber-500 font-bold">全网最低</p>}
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {(cmpResult.others || []).length > 0 && (
                  <details className="card p-4">
                    <summary className="text-xs text-slate-500 cursor-pointer select-none">相似款 {cmpResult.others.length} 条(点开查看)</summary>
                    <div className="space-y-2 mt-2.5">
                      {cmpResult.others.map((g, i) => (
                        <a
                          key={g.url + i}
                          href={g.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2.5 p-2 rounded-xl border border-slate-100 active:bg-slate-50"
                        >
                          <div className="w-12 h-12 rounded-lg bg-white border border-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                            {g.image && <img src={g.image} alt={g.title} className="max-w-full max-h-full object-contain p-0.5" loading="lazy" />}
                          </div>
                          <p className="flex-1 min-w-0 text-xs text-slate-500 line-clamp-1">{g.title}</p>
                          <p className="text-xs font-medium text-slate-700 shrink-0">¥{g.price}</p>
                        </a>
                      ))}
                    </div>
                  </details>
                )}
              </>
            )}

            {/* 免授权兜底:内嵌慢慢买,一页看全网价格 */}
            {!cmpLoading && (cmpResult?.keyword || cmpKw) && (
              <EmbedCompare keyword={cmpResult?.keyword || cmpKw} />
            )}
          </>
        )}
      </div>

      {/* 衣橱选图:图搜同款 */}
      {wardrobeOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setWardrobeOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl p-5 max-h-[75vh] overflow-y-auto page-enter" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-900 mb-1">选一件衣物搜同款</h3>
            <p className="text-xs text-slate-400 mb-3">用衣橱里的衣物图片,自动识别并对比各平台价格(图片会自动合成白底以提升识别率)</p>
            {items.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">衣橱是空的,先去添加衣物</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {items.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => { setWardrobeOpen(false); runImageSearch(it.image) }}
                    className="rounded-xl overflow-hidden border border-slate-100 bg-slate-50 active:scale-95 transition"
                  >
                    <div className="aspect-square flex items-center justify-center checkerboard">
                      <img src={it.image} alt={it.name} className="max-w-full max-h-full object-contain p-1" />
                    </div>
                    <p className="text-[10px] text-slate-500 truncate px-1 py-0.5 bg-white">{it.name}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="h-6" />
    </div>
  )
}