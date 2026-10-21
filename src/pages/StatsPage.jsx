import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import TopBar from '../components/TopBar'
import Modal from '../components/Modal'

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const todayStr = () => new Date().toLocaleDateString('sv-SE')

export default function StatsPage() {
  const navigate = useNavigate()
  const { items, categories, wearLogs, logWear, removeWearLog } = useApp()

  const [viewDate, setViewDate] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState(todayStr())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [picked, setPicked] = useState([])

  const itemById = (id) => items.find((i) => i.id === id)

  // ---- 日历网格 ----
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }

  const logsByDate = useMemo(() => {
    const m = new Map()
    for (const l of wearLogs) {
      if (!m.has(l.date)) m.set(l.date, [])
      m.get(l.date).push(l)
    }
    return m
  }, [wearLogs])

  // ---- 统计 ----
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const monthLogs = wearLogs.filter((l) => l.date?.startsWith(monthPrefix))
  const monthWornDays = new Set(monthLogs.map((l) => l.date)).size
  const monthWornCount = monthLogs.reduce((s, l) => s + (l.itemIds?.length || 0), 0)

  const wearCountByItem = useMemo(() => {
    const m = new Map()
    for (const l of wearLogs) {
      for (const id of l.itemIds || []) m.set(id, (m.get(id) || 0) + 1)
    }
    return m
  }, [wearLogs])

  const wornItems = [...wearCountByItem.keys()].filter((id) => itemById(id)).length
  const utilization = items.length ? Math.round((wornItems / items.length) * 100) : 0
  const topWorn = [...wearCountByItem.entries()]
    .map(([id, c]) => ({ item: itemById(id), count: c }))
    .filter((x) => x.item)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
  const neverWorn = items.filter((i) => !wearCountByItem.has(i.id))

  const shiftMonth = (delta) => {
    setViewDate(new Date(year, month + delta, 1))
  }

  const dayLogs = logsByDate.get(selectedDay) || []

  const saveTodayLog = async () => {
    if (picked.length === 0) return
    await logWear({ itemIds: picked })
    setPicked([])
    setPickerOpen(false)
    setSelectedDay(todayStr())
    const now = new Date()
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1))
  }

  const catStat = useMemo(() => {
    return categories
      .map((c) => {
        const its = items.filter((i) => i.categoryId === c.id)
        const worn = its.filter((i) => wearCountByItem.has(i.id)).length
        return { cat: c, total: its.length, worn, pct: its.length ? Math.round((worn / its.length) * 100) : 0 }
      })
      .filter((x) => x.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [categories, items, wearCountByItem])

  return (
    <div className="page-enter pb-10">
      <TopBar
        title="统计与日历"
        showBack
        onBack={() => navigate('/')}
        right={
          <button onClick={() => setPickerOpen(true)} className="text-brand-600 text-sm font-medium">
            ＋ 记今天
          </button>
        }
      />

      <div className="px-4 py-4 space-y-4">
        {/* 统计卡 */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: '衣物', value: items.length, icon: '👕' },
            { label: '本月穿着天数', value: monthWornDays, icon: '📅' },
            { label: '本月穿着件次', value: monthWornCount, icon: '🔁' },
            { label: '衣橱利用率', value: `${utilization}%`, icon: '💡' }
          ].map((s) => (
            <div key={s.label} className="card p-2.5 text-center">
              <p className="text-lg leading-6">{s.icon}</p>
              <p className="text-base font-bold text-slate-900 leading-6">{s.value}</p>
              <p className="text-[10px] text-slate-400 leading-4">{s.label}</p>
            </div>
          ))}
        </div>

        {/* 月历 */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => shiftMonth(-1)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 active:bg-slate-200">‹</button>
            <p className="text-sm font-semibold text-slate-800">{year}年{month + 1}月</p>
            <button onClick={() => shiftMonth(1)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 active:bg-slate-200">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEK_LABELS.map((w) => (
              <p key={w} className="text-center text-[10px] text-slate-400">{w}</p>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={`e${i}`} />
              const logs = logsByDate.get(d) || []
              const has = logs.length > 0
              const isToday = d === todayStr()
              const isSel = d === selectedDay
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDay(d)}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 transition ${
                    isSel ? 'bg-brand-500 text-white' : has ? 'bg-brand-50 text-brand-700' : 'text-slate-600 active:bg-slate-100'
                  }`}
                >
                  <span className={`text-xs leading-4 ${isToday && !isSel ? 'font-bold text-rose-500' : ''}`}>
                    {+d.slice(8)}
                  </span>
                  {has && (
                    <span className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-brand-500'}`} />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* 选中日的记录 */}
        <div className="card p-4">
          <p className="text-sm font-medium text-slate-700 mb-2">
            {selectedDay === todayStr() ? '今天' : selectedDay.slice(5).replace('-', '月') + '日'} 穿了什么
          </p>
          {dayLogs.length === 0 ? (
            <div className="text-center py-3">
              <p className="text-xs text-slate-400 mb-2">还没有记录</p>
              {selectedDay === todayStr() && (
                <button onClick={() => setPickerOpen(true)} className="btn-primary py-2 px-4 text-xs">＋ 记录今天穿了什么</button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {dayLogs.map((l) => (
                <div key={l.id} className="rounded-xl border border-slate-100 p-2.5 bg-slate-50/50">
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    {(l.itemIds || []).map(itemById).filter(Boolean).map((it) => (
                      <button
                        key={it.id}
                        onClick={() => navigate(`/item/${it.id}`)}
                        className="shrink-0 w-14 h-14 bg-white rounded-lg overflow-hidden flex items-center justify-center border border-slate-100"
                      >
                        <img src={it.image} alt={it.name} className="max-w-full max-h-full object-contain p-0.5" />
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[10px] text-slate-400">{(l.itemIds || []).length} 件{l.note ? ` · ${l.note}` : ''}</p>
                    <button onClick={() => removeWearLog(l.id)} className="text-[10px] text-rose-500">删除</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 最常穿 TOP */}
        {topWorn.length > 0 && (
          <div className="card p-4">
            <p className="text-sm font-medium text-slate-700 mb-3">🏆 最常穿 TOP{topWorn.length}</p>
            <div className="space-y-2">
              {topWorn.map((x, i) => (
                <button
                  key={x.item.id}
                  onClick={() => navigate(`/item/${x.item.id}`)}
                  className="w-full flex items-center gap-2.5 active:opacity-70"
                >
                  <span className={`w-5 text-xs font-bold ${i === 0 ? 'text-amber-500' : 'text-slate-400'}`}>{i + 1}</span>
                  <div className="w-9 h-9 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                    <img src={x.item.image} alt={x.item.name} className="max-w-full max-h-full object-contain p-0.5" />
                  </div>
                  <p className="text-xs text-slate-700 truncate flex-1 text-left">{x.item.name}</p>
                  <span className="chip bg-brand-50 text-brand-600 shrink-0">{x.count} 次</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 分类利用率 */}
        {catStat.length > 0 && (
          <div className="card p-4">
            <p className="text-sm font-medium text-slate-700 mb-3">📂 分类穿着率</p>
            <div className="space-y-2.5">
              {catStat.map((x) => (
                <div key={x.cat.id}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-slate-600">{x.cat.icon} {x.cat.name}</p>
                    <p className="text-[10px] text-slate-400">{x.worn}/{x.total} 件穿过</p>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-brand-400 to-brand-500 rounded-full" style={{ width: `${x.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 从未穿着 */}
        {neverWorn.length > 0 && (
          <div className="card p-4">
            <p className="text-sm font-medium text-slate-700 mb-1">😴 从未穿过的衣物({neverWorn.length} 件)</p>
            <p className="text-xs text-slate-400 mb-2 leading-relaxed">这些衣物还没穿过,考虑搭配起来,或者断舍离</p>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {neverWorn.map((it) => (
                <button
                  key={it.id}
                  onClick={() => navigate(`/item/${it.id}`)}
                  className="shrink-0 w-14 h-14 bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center border border-slate-100"
                >
                  <img src={it.image} alt={it.name} title={it.name} className="max-w-full max-h-full object-contain p-0.5" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 记录今天:选择衣物 */}
      <Modal
        open={pickerOpen}
        onClose={() => { setPickerOpen(false); setPicked([]) }}
        title={`记录今天穿了什么${picked.length ? `(${picked.length}件)` : ''}`}
        footer={
          <div className="flex gap-2">
            <button onClick={() => { setPickerOpen(false); setPicked([]) }} className="btn-ghost flex-1">取消</button>
            <button onClick={saveTodayLog} disabled={picked.length === 0} className="btn-primary flex-1 disabled:opacity-40">保存记录</button>
          </div>
        }
      >
        {items.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">衣橱是空的,先去添加衣物</p>
        ) : (
          <div className="grid grid-cols-4 gap-2 max-h-[50vh] overflow-y-auto">
            {items.map((it) => {
              const sel = picked.includes(it.id)
              return (
                <button
                  key={it.id}
                  onClick={() => setPicked((p) => (sel ? p.filter((x) => x !== it.id) : [...p, it.id]))}
                  className={`relative rounded-xl overflow-hidden border-2 transition ${sel ? 'border-brand-500' : 'border-transparent'}`}
                >
                  <div className="aspect-square bg-slate-100 flex items-center justify-center">
                    <img src={it.image} alt={it.name} className="max-w-full max-h-full object-contain p-1" />
                  </div>
                  {sel && (
                    <span className="absolute top-1 right-1 w-5 h-5 bg-brand-500 text-white rounded-full text-xs flex items-center justify-center">✓</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </Modal>
    </div>
  )
}
