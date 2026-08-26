import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import TopBar from '../components/TopBar'
import EmptyState from '../components/EmptyState'
import { geocode, fetchWeather, describeWeather, clothingSuggestion } from '../utils/weather'

export default function WeatherPage() {
  const { settings, updateSettings } = useApp()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [city, setCity] = useState('')
  const [locOpen, setLocOpen] = useState(false)

  const loc = settings?.weatherLocation

  const load = async (lat, lon) => {
    setLoading(true)
    setErr('')
    try {
      const w = await fetchWeather(lat, lon)
      setData(w)
    } catch (e) {
      setErr(e.message || '查询失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (loc) load(loc.lat, loc.lon)
  }, [loc?.lat, loc?.lon])

  const searchCity = async () => {
    if (!city.trim()) return
    setLoading(true)
    setErr('')
    try {
      const r = await geocode(city.trim())
      await updateSettings({ ...settings, weatherLocation: { name: r.name, lat: r.lat, lon: r.lon } })
      setLocOpen(false)
      setCity('')
    } catch (e) {
      setErr(e.message || '未找到该城市')
    } finally {
      setLoading(false)
    }
  }

  const useGeo = () => {
    if (!navigator.geolocation) {
      setErr('设备不支持定位')
      return
    }
    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        await updateSettings({
          ...settings,
          weatherLocation: { name: '当前位置', lat: latitude, lon: longitude }
        })
        setLocOpen(false)
      },
      () => {
        setErr('定位失败,请手动输入城市')
        setLoading(false)
      },
      { enableHighAccuracy: false, timeout: 8000 }
    )
  }

  const cur = data?.current
  const daily = data?.daily
  const desc = cur ? describeWeather(cur.weather_code) : null

  return (
    <div className="page-enter">
      <TopBar
        title="天气与穿搭"
        right={
          <button onClick={() => setLocOpen(true)} className="text-brand-600 text-sm font-medium">
            切换定位
          </button>
        }
      />

      <div className="px-4 py-4 space-y-4">
        <div className="card p-4 flex items-center gap-3">
          <span className="text-2xl">📍</span>
          <div className="flex-1">
            <p className="text-sm text-slate-400">当前位置</p>
            <p className="font-medium text-slate-800">{loc?.name || '未设置'}</p>
          </div>
          <button onClick={() => setLocOpen(true)} className="btn-ghost py-1.5 px-3 text-xs">
            更换
          </button>
        </div>

        {loading && (
          <div className="text-center text-slate-400 py-10 text-sm">天气查询中…</div>
        )}
        {err && <div className="text-center text-rose-500 py-4 text-sm">{err}</div>}

        {cur && desc && (
          <div className="card p-5 text-center">
            <div className="text-6xl mb-2">{desc.icon}</div>
            <p className="text-sm text-slate-500">{desc.desc}</p>
            <p className="text-5xl font-bold text-slate-900 my-1">
              {Math.round(cur.temperature_2m)}°
            </p>
            <p className="text-sm text-slate-500">
              体感 {Math.round(cur.apparent_temperature)}° · 湿度 {cur.relative_humidity_2m}% · 风速 {Math.round(cur.wind_speed_10m)}km/h
            </p>
            <div className="mt-3 px-3 py-2 rounded-xl bg-brand-50 text-brand-700 text-sm">
              {clothingSuggestion(cur.apparent_temperature)}
            </div>
          </div>
        )}

        {daily && (
          <div className="card p-4">
            <p className="text-sm font-medium text-slate-700 mb-3">未来 7 天</p>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {daily.time.map((t, i) => {
                const d = describeWeather(daily.weather_code[i])
                const date = new Date(t)
                const wd = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]
                return (
                  <div key={t} className="shrink-0 w-16 text-center py-2 rounded-xl bg-slate-50">
                    <p className="text-xs text-slate-400">{i === 0 ? '今天' : `周${wd}`}</p>
                    <p className="text-2xl my-1">{d.icon}</p>
                    <p className="text-xs text-slate-700">{Math.round(daily.temperature_2m_max[i])}°</p>
                    <p className="text-xs text-slate-400">{Math.round(daily.temperature_2m_min[i])}°</p>
                    <p className="text-[10px] text-blue-500 mt-0.5">{daily.precipitation_probability_max?.[i] ?? 0}%</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!loading && !data && !err && (
          <EmptyState icon="🌤️" title="选择城市查看天气" description="点击右上角设置你的城市,获取实时天气与穿搭建议" />
        )}
      </div>

      {locOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setLocOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl p-5 page-enter" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-900 mb-3">切换定位</h3>
            <input
              className="input mb-3"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchCity()}
              placeholder="输入城市名,如:上海、杭州"
            />
            <div className="flex gap-2">
              <button onClick={searchCity} className="btn-primary flex-1">搜索</button>
              <button onClick={useGeo} className="btn-ghost flex-1">📍 定位</button>
            </div>
            <p className="text-xs text-slate-400 mt-3">支持搜索全球城市,或使用设备定位</p>
          </div>
        </div>
      )}
    </div>
  )
}