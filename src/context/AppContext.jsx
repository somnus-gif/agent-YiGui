import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import {
  initDB,
  getAllItems,
  saveItem as dbSaveItem,
  deleteItem as dbDeleteItem,
  getAllCategories,
  saveCategory as dbSaveCategory,
  deleteCategory as dbDeleteCategory,
  getAllOutfits,
  saveOutfit as dbSaveOutfit,
  deleteOutfit as dbDeleteOutfit,
  getSettings,
  saveSettings as dbSaveSettings,
  putMany,
  clearAllData
} from '../db/database'
import { uid } from '../utils/constants'

const AppContext = createContext(null)

// 回收站保留时长(毫秒):超过后自动清理,避免图片 base64 长期占空间
export const TRASH_TTL = 30 * 24 * 60 * 60 * 1000

const isAlive = (x) => !x.deletedAt
const isTrashed = (x) => !!x.deletedAt

export function AppProvider({ children }) {
  const [ready, setReady] = useState(false)
  const [items, setItems] = useState([])         // 仅未删除的衣物
  const [trash, setTrash] = useState([])         // 回收站(衣物 + 搭配混合)
  const [categories, setCategories] = useState([])
  const [outfits, setOutfits] = useState([])     // 仅未删除的搭配
  const [settings, setSettings] = useState(null)

  const [error, setError] = useState(null)

  const loadAll = useCallback(async () => {
    const [it, ca, ou, se] = await Promise.all([
      getAllItems(),
      getAllCategories(),
      getAllOutfits(),
      getSettings()
    ])
    // 自动清理过期回收站条目
    const now = Date.now()
    const expired = [...it, ...ou].filter((x) => x.deletedAt && now - x.deletedAt > TRASH_TTL)
    if (expired.length) {
      await Promise.all(expired.map((x) =>
        (it.includes(x) ? dbDeleteItem : dbDeleteOutfit)(x.id)
      ))
    }
    const expiredIds = new Set(expired.map((x) => x.id))
    const alive = (arr) => arr.filter((x) => !expiredIds.has(x.id))

    setItems(alive(it).filter(isAlive).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)))
    setOutfits(alive(ou).filter(isAlive).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)))
    setTrash(
      alive([...it, ...ou])
        .filter(isTrashed)
        .sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0))
    )
    setCategories(ca)
    setSettings(se)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        console.log('[AppContext] 开始初始化...')
        console.log('[AppContext] 调用 initDB...')
        await initDB()
        if (cancelled) {
          console.log('[AppContext] 组件已卸载，取消后续操作')
          return
        }
        console.log('[AppContext] initDB 成功，开始 loadAll...')
        await loadAll()
        if (cancelled) {
          console.log('[AppContext] 组件已卸载，取消后续操作')
          return
        }
        console.log('[AppContext] loadAll 成功，设置 ready=true')
        setReady(true)
      } catch (e) {
        console.error('[AppContext] 初始化失败:', e)
        console.error('[AppContext] 错误堆栈:', e.stack)
        if (!cancelled) setError(e.message || String(e))
      }
    })()
    return () => {
      console.log('[AppContext] 清理函数执行')
      cancelled = true
    }
  }, [loadAll])

  // ===== items =====
  const addItem = useCallback(async (item) => {
    const record = await dbSaveItem({ ...item, id: item.id || uid('item') })
    setItems((prev) => [...prev, record])
    return record
  }, [])

  const updateItem = useCallback(async (item) => {
    const record = await dbSaveItem(item)
    setItems((prev) => prev.map((x) => (x.id === record.id ? record : x)))
    return record
  }, [])

  // 软删除:移入回收站,可在 30 天内恢复
  const removeItem = useCallback(async (id) => {
    const target = items.find((x) => x.id === id)
    if (!target) return
    const record = await dbSaveItem({ ...target, deletedAt: Date.now() })
    setItems((prev) => prev.filter((x) => x.id !== id))
    setTrash((prev) => [record, ...prev.filter((x) => x.id !== id)])
  }, [items])

  // ===== categories =====
  const addCategory = useCallback(async (cat) => {
    const record = await dbSaveCategory({ ...cat, id: cat.id || uid('cat') })
    setCategories((prev) => [...prev, record])
    return record
  }, [])

  const updateCategory = useCallback(async (cat) => {
    const record = await dbSaveCategory(cat)
    setCategories((prev) => prev.map((x) => (x.id === record.id ? record : x)))
    return record
  }, [])

  const removeCategory = useCallback(async (id) => {
    await dbDeleteCategory(id)
    setCategories((prev) => prev.filter((x) => x.id !== id))
  }, [])

  // ===== outfits =====
  const addOutfit = useCallback(async (outfit) => {
    const record = await dbSaveOutfit({ ...outfit, id: outfit.id || uid('outfit') })
    setOutfits((prev) => [...prev, record])
    return record
  }, [])

  const updateOutfit = useCallback(async (outfit) => {
    const record = await dbSaveOutfit(outfit)
    setOutfits((prev) => prev.map((x) => (x.id === record.id ? record : x)))
    return record
  }, [])

  const removeOutfit = useCallback(async (id) => {
    const target = outfits.find((x) => x.id === id)
    if (!target) return
    const record = await dbSaveOutfit({ ...target, deletedAt: Date.now() })
    setOutfits((prev) => prev.filter((x) => x.id !== id))
    setTrash((prev) => [record, ...prev.filter((x) => x.id !== id)])
  }, [outfits])

  // ===== 回收站 =====
  // 判断条目原属哪个 store:搭配有 itemIds 字段,衣物没有
  const kindOf = (x) => (Array.isArray(x.itemIds) ? 'outfit' : 'item')

  const restore = useCallback(async (id) => {
    const target = trash.find((x) => x.id === id)
    if (!target) return
    const { deletedAt, ...rest } = target
    if (kindOf(target) === 'outfit') {
      const record = await dbSaveOutfit(rest)
      setOutfits((prev) => [record, ...prev.filter((x) => x.id !== id)])
    } else {
      const record = await dbSaveItem(rest)
      setItems((prev) => [record, ...prev.filter((x) => x.id !== id)])
    }
    setTrash((prev) => prev.filter((x) => x.id !== id))
  }, [trash])

  const purge = useCallback(async (id) => {
    await dbDeleteItem(id)
    await dbDeleteOutfit(id)
    setTrash((prev) => prev.filter((x) => x.id !== id))
  }, [])

  const emptyTrash = useCallback(async () => {
    await Promise.all(trash.map((x) => (kindOf(x) === 'outfit' ? dbDeleteOutfit(x.id) : dbDeleteItem(x.id))))
    setTrash([])
  }, [trash])

  // ===== settings =====
  const updateSettings = useCallback(async (s) => {
    const record = await dbSaveSettings(s)
    setSettings(record)
    return record
  }, [])

  // ===== 备份恢复(供设置页调用) =====
  const exportSnapshot = useCallback(async () => ({
    items: await getAllItems(),
    categories: await getAllCategories(),
    outfits: await getAllOutfits(),
    settings: (await getSettings()) || null
  }), [])

  // mode: 'merge' 保留现有数据并补充新条目 | 'replace' 清空后写入
  const importSnapshot = useCallback(async (data, mode = 'merge') => {
    if (mode === 'replace') await clearAllData({ keepCategories: false })
    const stats = { items: 0, categories: 0, outfits: 0 }
    if (Array.isArray(data.categories) && data.categories.length) {
      await putMany('categories', data.categories)
      stats.categories = data.categories.length
    }
    if (Array.isArray(data.items) && data.items.length) {
      await putMany('items', data.items)
      stats.items = data.items.length
    }
    if (Array.isArray(data.outfits) && data.outfits.length) {
      await putMany('outfits', data.outfits)
      stats.outfits = data.outfits.length
    }
    if (data.settings) await dbSaveSettings(data.settings)
    await loadAll()
    return stats
  }, [loadAll])

  const wipeAll = useCallback(async () => {
    await clearAllData({ keepCategories: true })
    setItems([])
    setOutfits([])
    setTrash([])
  }, [])

  const value = {
    ready,
    error,
    items,
    trash,
    categories,
    outfits,
    settings,
    addItem,
    updateItem,
    removeItem,
    addCategory,
    updateCategory,
    removeCategory,
    addOutfit,
    updateOutfit,
    removeOutfit,
    restore,
    purge,
    emptyTrash,
    updateSettings,
    exportSnapshot,
    importSnapshot,
    wipeAll,
    reload: loadAll
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}