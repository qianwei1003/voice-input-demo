/**
 * IndexedDB-based model cache for Whisper
 * Persists model files in browser storage to avoid re-downloading on refresh
 */
const DB_NAME = 'whisper_cache'
const DB_VERSION = 1
const STORE_NAME = 'models'

// Open or create IndexedDB
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => reject(request.error)
    
    request.onsuccess = () => resolve(request.result)
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
  })
}

// Save blob to IndexedDB
export async function saveToCache(key, blob) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.put({ key, blob, timestamp: Date.now() })
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// Load blob from IndexedDB
export async function loadFromCache(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(key)
    request.onsuccess = () => resolve(request.result?.blob || null)
    request.onerror = () => reject(request.error)
  })
}

// Check if cache exists
export async function hasCache(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(key)
    request.onsuccess = () => resolve(!!request.result)
    request.onerror = () => reject(request.error)
  })
}

// Clear all cached models
export async function clearCache() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.clear()
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// Get cache size info
export async function getCacheInfo() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()
    request.onsuccess = () => {
      const items = request.result || []
      const totalSize = items.reduce((sum, item) => sum + (item.blob?.size || 0), 0)
      resolve({
        count: items.length,
        size: totalSize,
        sizeMB: (totalSize / 1024 / 1024).toFixed(2) + ' MB'
      })
    }
    request.onerror = () => reject(request.error)
  })
}

// Get stored cache key for a model
export function getCacheKey(modelName) {
  return `whisper_${modelName}`
}