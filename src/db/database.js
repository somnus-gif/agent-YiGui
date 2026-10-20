// IndexedDB 本地数据层(带内存降级方案)
import { openDB } from 'idb'
import { DEFAULT_CATEGORIES } from '../utils/constants.js'

const DB_NAME = 'wardrobe-db'
const DB_VERSION = 2 // v2: 新增 deletedAt 索引,支持回收站软删除
const DB_OPEN_TIMEOUT = 3000

// ========== 内存存储(降级方案) ==========
class MemoryTransaction {
  constructor(memdb, storeNames) {
    this.memdb = memdb
    this.storeNames = Array.isArray(storeNames) ? storeNames : [storeNames]
    this.done = Promise.resolve()
  }
  get store() {
    const self = this
    const storeName = this.storeNames[0]
    return {
      put: async (val) => { self.memdb.stores[storeName].set(val.id, val) },
      get: async (key) => self.memdb.stores[storeName].get(key),
      getAll: async () => Array.from(self.memdb.stores[storeName].values())
    }
  }
}

class MemoryDB {
  constructor() {
    this.stores = {
      items: new Map(),
      categories: new Map(),
      outfits: new Map(),
      settings: new Map()
    }
    console.warn('[MemoryDB] 使用内存存储模式(数据不会持久化)')
  }
  async getAll(store) { return Array.from(this.stores[store].values()) }
  async get(store, key) { return this.stores[store].get(key) }
  async put(store, value) { this.stores[store].set(value.id, value); return value }
  async delete(store, key) { this.stores[store].delete(key) }
  async getAllFromIndex(store, indexName, key) {
    return Array.from(this.stores[store].values()).filter(v => v[indexName] === key)
  }
  async clear(store) { this.stores[store]?.clear?.() }
  transaction(storeNames, mode) {
    return new MemoryTransaction(this, storeNames)
  }
  close() {}
}

// ========== 带超时的openDB ==========
function openDBWithTimeout(name, version, options, timeout) {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        reject(new Error('数据库打开超时'))
      }
    }, timeout)
    
    openDB(name, version, options).then(
      (db) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve(db)
        }
      },
      (err) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          reject(err)
        }
      }
    )
  })
}

let dbPromise = null
let dbInstance = null
let useMemoryFallback = false

async function initDBInternal() {
  console.log('[DB] 开始打开数据库...')
  try {
    if (typeof window !== 'undefined' && !window.indexedDB) {
      throw new Error('浏览器不支持IndexedDB')
    }
    const db = await openDBWithTimeout(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, tx) {
        console.log('[DB] 数据库升级:', oldVersion, '→', newVersion)
        if (!db.objectStoreNames.contains('items')) {
          const items = db.createObjectStore('items', { keyPath: 'id' })
          items.createIndex('categoryId', 'categoryId')
          items.createIndex('season', 'season')
          items.createIndex('style', 'style')
        }
        if (!db.objectStoreNames.contains('categories')) {
          db.createObjectStore('categories', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('outfits')) {
          const outfits = db.createObjectStore('outfits', { keyPath: 'id' })
          outfits.createIndex('season', 'season')
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' })
        }
        // v1 → v2: 回收站软删除字段索引(旧数据没有该字段,IndexedDB 会自动跳过)
        if (oldVersion > 0 && oldVersion < 2 && tx) {
          const ensureIndex = (storeName, indexName) => {
            const store = tx.objectStore(storeName)
            if (!store.indexNames.contains(indexName)) store.createIndex(indexName, indexName)
          }
          ensureIndex('items', 'deletedAt')
          ensureIndex('outfits', 'deletedAt')
        }
        console.log('[DB] 数据库结构就绪')
      }
    }, DB_OPEN_TIMEOUT)
    console.log('[DB] IndexedDB打开成功!')
    return db
  } catch (e) {
    console.warn('[DB] IndexedDB不可用，降级到内存存储:', e.message)
    useMemoryFallback = true
    return new MemoryDB()
  }
}

export function getDB() {
  if (dbInstance) {
    return Promise.resolve(dbInstance)
  }
  if (!dbPromise) {
    dbPromise = initDBInternal().then(db => {
      dbInstance = db
      return db
    })
  }
  return dbPromise
}

// 初始化默认数据
export async function initDB() {
  console.log('[DB] initDB 开始')
  const db = await getDB()
  console.log('[DB] 数据库已就绪，检查初始数据...')
  
  const cats = await db.getAll('categories')
  console.log('[DB] 现有分类:', cats.length)
  if (cats.length === 0) {
    console.log('[DB] 写入默认分类...')
    if (useMemoryFallback) {
      for (const c of DEFAULT_CATEGORIES) {
        await db.put('categories', c)
      }
    } else {
      const tx = db.transaction('categories', 'readwrite')
      for (const c of DEFAULT_CATEGORIES) {
        await tx.store.put(c)
      }
      await tx.done
    }
    console.log('[DB] 默认分类写入完成')
  }
  
  const settings = await db.get('settings', 'main')
  if (!settings) {
    console.log('[DB] 写入默认设置...')
    await db.put('settings', {
      id: 'main',
      weatherLocation: { name: '北京', lat: 39.9042, lon: 116.4074 },
      theme: 'light'
    })
    console.log('[DB] 默认设置写入完成')
  }
  
  console.log('[DB] initDB 全部完成!')
  return db
}

// ============ items ============
export async function getAllItems() { return (await getDB()).getAll('items') }
export async function getItem(id) { return (await getDB()).get('items', id) }
export async function saveItem(item) {
  const db = await getDB()
  const now = Date.now()
  const record = { ...item, updatedAt: now, createdAt: item.createdAt || now }
  await db.put('items', record)
  return record
}
export async function deleteItem(id) { return (await getDB()).delete('items', id) }
export async function getItemsByCategory(categoryId) { return (await getDB()).getAllFromIndex('items', 'categoryId', categoryId) }

// ============ categories ============
export async function getAllCategories() { return (await getDB()).getAll('categories') }
export async function saveCategory(cat) { await (await getDB()).put('categories', cat); return cat }
export async function deleteCategory(id) { return (await getDB()).delete('categories', id) }

// ============ outfits ============
export async function getAllOutfits() { return (await getDB()).getAll('outfits') }
export async function getOutfit(id) { return (await getDB()).get('outfits', id) }
export async function saveOutfit(outfit) {
  const db = await getDB()
  const now = Date.now()
  const record = { ...outfit, updatedAt: now, createdAt: outfit.createdAt || now }
  await db.put('outfits', record)
  return record
}
export async function deleteOutfit(id) { return (await getDB()).delete('outfits', id) }

// ============ settings ============
export async function getSettings() { return (await getDB()).get('settings', 'main') }
export async function saveSettings(settings) {
  const db = await getDB()
  const record = { ...settings, id: 'main' }
  await db.put('settings', record)
  return record
}

// ============ 批量操作(供导入/清空使用) ============
export async function putMany(store, records) {
  const db = await getDB()
  const now = Date.now()
  for (const r of records) {
    await db.put(store, { ...r, updatedAt: r.updatedAt || now, createdAt: r.createdAt || now })
  }
  return records.length
}

export async function clearStore(store) {
  const db = await getDB()
  if (useMemoryFallback) {
    db.stores[store]?.clear?.()
    return
  }
  await db.clear(store)
}

// 清空全部业务数据(保留分类与设置的初始态由调用方决定)
export async function clearAllData({ keepCategories = true } = {}) {
  await clearStore('items')
  await clearStore('outfits')
  if (!keepCategories) await clearStore('categories')
}