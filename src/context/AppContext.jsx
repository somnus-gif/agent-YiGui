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
  saveSettings as dbSaveSettings
} from '../db/database'
import { uid } from '../utils/constants'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [ready, setReady] = useState(false)
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [outfits, setOutfits] = useState([])
  const [settings, setSettings] = useState(null)

  const [error, setError] = useState(null)

  const loadAll = useCallback(async () => {
    console.log('[AppContext] loadAll 开始，并行加载所有数据...')
    const [it, ca, ou, se] = await Promise.all([
      getAllItems(),
      getAllCategories(),
      getAllOutfits(),
      getSettings()
    ])
    console.log('[AppContext] 数据加载完成:', {
      items: it.length,
      categories: ca.length,
      outfits: ou.length,
      hasSettings: !!se
    })
    setItems(it)
    setCategories(ca)
    setOutfits(ou)
    setSettings(se)
    console.log('[AppContext] 状态设置完成')
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

  const removeItem = useCallback(async (id) => {
    await dbDeleteItem(id)
    setItems((prev) => prev.filter((x) => x.id !== id))
  }, [])

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
    await dbDeleteOutfit(id)
    setOutfits((prev) => prev.filter((x) => x.id !== id))
  }, [])

  // ===== settings =====
  const updateSettings = useCallback(async (s) => {
    const record = await dbSaveSettings(s)
    setSettings(record)
    return record
  }, [])

  const value = {
    ready,
    error,
    items,
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
    updateSettings,
    reload: loadAll
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}