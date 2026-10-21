// 免授权的「同页全网比价」:内嵌慢慢买搜索结果
//
// 为什么用慢慢买:
//  - 它本身就是聚合比价站,一页里同时给出京东/天猫/淘宝/拼多多的价格
//  - 服务端渲染 + width=device-width,无需登录,iframe 里能正常显示
//  - 实测返回 200 且无 X-Frame-Options / frame-busting,可直接内嵌
//  - 零授权、零后端、零 API Key
//
// 淘宝/拼多多/京东/抖音/1688 自身都有风控或强制登录,
// 内嵌会显示空白或登录墙,因此只提供「新窗口打开」兜底。

import { useState } from 'react'

// 内嵌源:只有慢慢买实测可用
const EMBED = {
  all: {
    name: '全网',
    url: (kw) => `https://s.manmanbuy.com/m/search/result?keyword=${encodeURIComponent(kw)}`
  }
}

// 不支持内嵌的平台(风控/登录墙),提供新窗口直达
const EXTERNAL = [
  { name: '淘宝', url: (kw) => `https://s.m.taobao.com/h5?q=${encodeURIComponent(kw)}` },
  { name: '拼多多', url: (kw) => `https://mobile.yangkeduo.com/search_result.html?search_key=${encodeURIComponent(kw)}` },
  { name: '京东', url: (kw) => `https://so.m.jd.com/ware/search.action?keyword=${encodeURIComponent(kw)}` },
  { name: '抖音', url: (kw) => `https://www.douyin.com/search/${encodeURIComponent(kw)}?type=goods` },
  { name: '1688', url: (kw) => `https://m.1688.com/offer_search/${encodeURIComponent(`{"keywords":"${kw}"}`)}.html` }
]

export default function EmbedCompare({ keyword }) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const kw = (keyword || '').trim()
  if (!kw) return null

  const src = EMBED.all.url(kw)

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-700">🌐 全网比价 · 免授权</p>
          <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
            内嵌慢慢买,一页同时看京东 / 天猫 / 淘宝 / 拼多多价格,不用申请任何账号
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-xs px-3 py-1.5 rounded-full bg-teal-50 text-teal-700 active:scale-95 transition"
        >
          {open ? '收起' : '点开加载'}
        </button>
      </div>

      {open && (
        <>
          <div className="mt-3 rounded-xl overflow-hidden border border-slate-100 bg-slate-50 relative">
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">
                加载中…
              </div>
            )}
            <iframe
              src={src}
              title="慢慢买全网比价"
              className="w-full h-[68vh] border-0 block"
              loading="lazy"
              referrerPolicy="no-referrer"
              onLoad={() => setLoaded(true)}
            />
          </div>

          <p className="text-[10px] text-slate-400 mt-2 leading-snug">
            若页面空白,说明被对方风控拦截,可{' '}
            <a className="text-teal-600 underline" href={src} target="_blank" rel="noopener noreferrer">
              新窗口打开 ↗
            </a>
          </p>

          <div className="mt-2.5 pt-2.5 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 mb-1.5">
              淘宝 / 拼多多 / 京东 / 抖音 / 1688 需登录或风控,不支持内嵌,只能新窗口查看:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {EXTERNAL.map((p) => (
                <a
                  key={p.name}
                  href={p.url(kw)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="chip bg-slate-50 text-slate-500 border border-slate-100 active:bg-slate-100"
                >
                  {p.name} ↗
                </a>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
