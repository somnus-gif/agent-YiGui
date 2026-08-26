// 天气查询工具(基于 Open-Meteo 免费开放 API,无需 key)

// WMO weather_code 到中文描述与 emoji 的映射
const WMO_CODE_MAP = {
  0: { desc: '晴', icon: '☀️' },
  1: { desc: '多云', icon: '🌤️' },
  2: { desc: '多云', icon: '⛅' },
  3: { desc: '阴', icon: '☁️' },
  45: { desc: '雾', icon: '🌫️' },
  48: { desc: '雾凇', icon: '🌫️' },
  51: { desc: '小雨', icon: '🌦️' },
  53: { desc: '小雨', icon: '🌦️' },
  55: { desc: '中雨', icon: '🌧️' },
  56: { desc: '冻雨', icon: '🌧️' },
  57: { desc: '冻雨', icon: '🌧️' },
  61: { desc: '小雨', icon: '🌦️' },
  63: { desc: '中雨', icon: '🌧️' },
  65: { desc: '大雨', icon: '🌧️' },
  66: { desc: '冻雨', icon: '🌧️' },
  67: { desc: '冻雨', icon: '🌧️' },
  71: { desc: '小雪', icon: '🌨️' },
  73: { desc: '小雪', icon: '🌨️' },
  75: { desc: '大雪', icon: '❄️' },
  77: { desc: '霰', icon: '🌨️' },
  80: { desc: '阵雨', icon: '🌦️' },
  81: { desc: '中阵雨', icon: '🌧️' },
  82: { desc: '强阵雨', icon: '⛈️' },
  85: { desc: '阵雪', icon: '🌨️' },
  86: { desc: '强阵雪', icon: '❄️' },
  95: { desc: '雷暴', icon: '⛈️' },
  96: { desc: '雷暴冰雹', icon: '⛈️' },
  99: { desc: '强雷暴', icon: '⛈️' }
}

export function describeWeather(code) {
  return WMO_CODE_MAP[code] || { desc: '未知', icon: '🤔' }
}

// 根据城市名查询经纬度(中文)
export async function geocode(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    city
  )}&count=1&language=zh&format=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error('城市查询失败')
  const data = await res.json()
  if (!data.results || data.results.length === 0) {
    throw new Error('未找到该城市')
  }
  const r = data.results[0]
  return {
    name: r.name,
    lat: r.latitude,
    lon: r.longitude,
    country: r.country,
    admin1: r.admin1
  }
}

// 查询天气(当前 + 7 天预报)
export async function fetchWeather(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=auto&forecast_days=7`
  const res = await fetch(url)
  if (!res.ok) throw new Error('天气查询失败')
  return res.json()
}

// 穿衣建议(根据体感温度)
export function clothingSuggestion(apparentTemp) {
  if (apparentTemp == null) return ''
  if (apparentTemp <= 0) return '🧣严寒:羽绒服+保暖内衣+围巾手套'
  if (apparentTemp <= 5) return '🧥寒冷:厚外套+毛衣+秋裤'
  if (apparentTemp <= 10) return '🧥凉:外套+夹克+薄毛衣'
  if (apparentTemp <= 15) return '🧥微凉:风衣/夹克+长袖'
  if (apparentTemp <= 20) return '👕舒适:长袖衬衫+薄外套'
  if (apparentTemp <= 25) return '👕温暖:短袖+薄长裤'
  if (apparentTemp <= 30) return '🩱热:短袖短裤'
  return '☀️炎热:透气短袖,注意防晒'
}