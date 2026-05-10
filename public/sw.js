/**
 * Service Worker for caching Whisper model files
 * 
 * This intercepts all requests to the transformers.js CDN
 * and caches them in the Service Worker cache (CacheStorage API)
 * 
 * After first download, subsequent page loads will serve from cache
 * without needing to re-download
 */

const CACHE_NAME = 'whisper-model-cache-v1'
const CDN_ORIGIN = 'https://cdn.jsdelivr.net'

// Model files to cache
const MODEL_FILES = [
  // Main model files - these are the key ONNX files
  '/npm/@huggingface/transformers@2.17.1/src/transformers.js',
  '/npm/@huggingface/transformers@2.17.1/src/utils/tensor.js',
  '/npm/@huggingface/transformers@2.17.1/src/utils/hub.js',
  '/npm/@xenova/transformers@2.17.1/src/transformers.js',
  '/npm/@xenova/transformers@2.17.1/onnxruntime-webORT.wasm',
  '/npm/@xenova/transformers@2.17.1/transformers.js',
]

// Model weights patterns (these are large, worth caching)
const MODEL_PATTERNS = [
  /\/onnx\/(encoder|decoder|model)_model\.onnx/,
  /\.onnx\.data$/,
  /\.onnx$/,
]

// Install event - cache CDN origin
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...')
  // Don't wait for caching to complete
  self.skipWaiting()
})

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...')
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('whisper-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    }).then(() => {
      console.log('[SW] Service Worker activated')
      return self.clients.claim()
    })
  )
})

// Fetch event - intercept and cache
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  
  // Only cache jsDelivr CDN requests
  if (!url.href.startsWith(CDN_ORIGIN)) {
    return
  }
  
  // Check if this is a model-related request
  const isModelRequest = MODEL_PATTERNS.some(pattern => 
    pattern.test(url.pathname)
  )
  
  // For ONNX model files and transformers.js, cache them
  if (url.pathname.includes('@huggingface/transformers') ||
      url.pathname.includes('@xenova/transformers') ||
      url.pathname.includes('onnx') ||
      isModelRequest) {
    
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        // Try to find in cache first
        const cachedResponse = await cache.match(event.request)
        if (cachedResponse) {
          console.log('[SW] Cache hit for:', url.pathname.substring(url.pathname.lastIndexOf('/') + 1))
          return cachedResponse
        }
        
        // Not in cache, fetch from network
        console.log('[SW] Cache miss, downloading:', url.pathname.substring(url.pathname.lastIndexOf('/') + 1))
        const networkResponse = await fetch(event.request)
        
        // Only cache successful responses
        if (networkResponse.ok) {
          // Clone and cache
          cache.put(event.request, networkResponse.clone())
          console.log('[SW] Cached:', url.pathname.substring(url.pathname.lastIndexOf('/') + 1))
        }
        
        return networkResponse
      })
    )
  }
})

// Message handler for cache management
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting()
  }
  
  if (event.data === 'getCacheStatus') {
    caches.open(CACHE_NAME).then(cache => {
      cache.keys().then(keys => {
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'cacheStatus',
              keys: keys.map(k => k.url)
            })
          })
        })
      })
    })
  }
  
  if (event.data === 'clearCache') {
    caches.delete(CACHE_NAME).then(() => {
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'cacheCleared' })
        })
      })
    })
  }
})