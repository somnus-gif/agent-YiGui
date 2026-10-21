import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import WardrobePage from './pages/WardrobePage'
import UploadPage from './pages/UploadPage'
import BatchUploadPage from './pages/BatchUploadPage'
import CategoryPage from './pages/CategoryPage'
import ItemDetailPage from './pages/ItemDetailPage'
import OutfitPage from './pages/OutfitPage'
import WeatherPage from './pages/WeatherPage'
import ShopPage from './pages/ShopPage'
import SettingsPage from './pages/SettingsPage'
import TrashPage from './pages/TrashPage'
import StatsPage from './pages/StatsPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<WardrobePage />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="batch" element={<BatchUploadPage />} />
        <Route path="category" element={<CategoryPage />} />
        <Route path="item/:id" element={<ItemDetailPage />} />
        <Route path="outfit" element={<OutfitPage />} />
        <Route path="weather" element={<WeatherPage />} />
        <Route path="shop" element={<ShopPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="trash" element={<TrashPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}