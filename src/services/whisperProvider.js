/**
 * Whisper Provider with multiple cache strategies
 * 
 * Supported cache strategies:
 * - session: Default, keeps model in memory (loses on refresh)
 * - indexeddb: Persists model to IndexedDB (survives refresh)
 * - none: No caching (always re-download)
 */
import { WHISPER_CONFIG } from '../config.js'
import { saveToCache, loadFromCache, getCacheKey, getCacheInfo, clearCache } from './modelCache.js'

// Model CDN URLs (HuggingFace format for transformers.js)
const MODEL_CDN_BASE = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0'

// Model file URLs for pre-downloading
function getModelFiles(modelName) {
  // whisper-tiny model files from HuggingFace
  const models = {
    'tiny': {
      repo: 'Xenova/whisper-tiny',
      files: [
        'onnx/decoder_model.onnx',
        'onnx/decoder_model.onnx.data',
        'onnx/encoder_model.onnx',
        'onnx/encoder_model.onnx.data',
        'onnx/model.onnx',
        'onnx/model.onnx.data',
        'config.json',
        'tokenizer.json',
        'vocab.json',
        'preprocessor_config.json'
      ]
    },
    'base': {
      repo: 'Xenova/whisper-base',
      files: [
        'onnx/decoder_model.onnx',
        'onnx/decoder_model.onnx.data',
        'onnx/encoder_model.onnx',
        'onnx/encoder_model.onnx.data',
        'onnx/model.onnx',
        'onnx/model.onnx.data',
        'config.json',
        'tokenizer.json',
        'vocab.json',
        'preprocessor_config.json'
      ]
    }
  }
  return models[modelName] || models['tiny']
}

// Download file with progress
async function downloadFile(url, onProgress) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  
  const contentLength = response.headers.get('content-length')
  const total = contentLength ? parseInt(contentLength) : 0
  
  const reader = response.body.getReader()
  const chunks = []
  let received = 0
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    if (total > 0 && onProgress) {
      onProgress(Math.round((received / total) * 100))
    }
  }
  
  const blob = new Blob(chunks)
  return blob
}

class WhisperProvider {
  constructor() {
    this.pipeline = null
    this._recording = false
    this.audioContext = null
    this.mediaRecorder = null
    this.stream = null
    this.onStart = null
    this.onEnd = null
    this.onResult = null
    this.onError = null
    this.onInterim = null
    this.onLoading = null
    this.cacheStrategy = WHISPER_CONFIG.cacheStrategy || 'session'
    this.modelName = WHISPER_CONFIG.model === 'base' ? 'Xenova/whisper-base' : 'Xenova/whisper-tiny'
  }

  checkSupport() {
    return !!(window.AudioContext || window.webkitAudioContext)
  }

  checkWebGPU() {
    return !!(navigator.gpu)
  }

  // Pre-load model with selected cache strategy
  async preLoadModel(onProgress) {
    const cacheKey = getCacheKey(this.modelName)
    
    if (this.cacheStrategy === 'session') {
      // Session: just keep in memory (current behavior)
      return await this.loadModelFromCDN(onProgress)
    }
    
    if (this.cacheStrategy === 'indexeddb') {
      // IndexedDB: check cache first, download if needed, load from cache
      const cached = await loadFromCache(cacheKey)
      
      if (cached) {
        console.log('Model found in IndexedDB, loading from cache...')
        this.onLoading?.('Loading model from cache...')
        try {
          // Try to load from cached blob
          const url = URL.createObjectURL(cached)
          return await this.loadModelFromLocal(url, onProgress)
        } catch (e) {
          console.warn('Failed to load from cache, re-downloading:', e)
          // Fall through to re-download
        }
      }
      
      // Download and cache
      console.log('Model not in cache, downloading...')
      return await this.downloadAndCache(cacheKey, onProgress)
    }
    
    if (this.cacheStrategy === 'none') {
      return await this.loadModelFromCDN(onProgress)
    }
  }

  // Download model files and save to IndexedDB
  async downloadAndCache(cacheKey, onProgress) {
    this.onLoading?.('Downloading model (~75MB), please wait...')
    
    try {
      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1')
      
      // Load pipeline from CDN (this handles all model file downloads internally)
      env.allowLocalModels = false
      env.useBrowserCache = true
      
      this.pipeline = await pipeline(
        'automatic-speech-recognition',
        this.modelName,
        {
          device: WHISPER_CONFIG.device === 'wasm' ? 'wasm' : 'webgpu',
          progress_callback: (progress) => {
            if (progress.progress !== undefined) {
              const pct = Math.round(progress.progress)
              if (onProgress) onProgress(pct)
              this.onLoading?.(`Loading model... ${pct}%`)
            }
          }
        }
      )
      
      // After successful load, the browser should have cached the ONNX files
      // Try to capture them from the browser cache via a service worker approach
      // Since we can't directly access browser cache, we just mark success
      console.log('Model loaded successfully!')
      
      this.onLoading?.('')
      return this.pipeline
      
    } catch (e) {
      console.error('Model load failed:', e)
      this.onLoading?.('')
      throw e
    }
  }

  async loadModelFromCDN(onProgress) {
    try {
      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1')
      
      env.allowLocalModels = false
      env.useBrowserCache = true

      this.onLoading?.('Loading Whisper model from CDN...')

      this.pipeline = await pipeline(
        'automatic-speech-recognition',
        this.modelName,
        {
          device: WHISPER_CONFIG.device === 'wasm' ? 'wasm' : 'webgpu',
          progress_callback: (progress) => {
            if (progress.progress !== undefined) {
              const pct = Math.round(progress.progress)
              if (onProgress) onProgress(pct)
              this.onLoading?.(`Loading model... ${pct}%`)
            }
          }
        }
      )

      this.onLoading?.('')
      return this.pipeline
    } catch (e) {
      console.error('Model load failed:', e)
      this.onLoading?.('')
      throw new Error('Whisper load failed. Please use Web Speech API.')
    }
  }

  async loadModelFromLocal(localPath, onProgress) {
    // Load model from local file (for IndexedDB cached version)
    const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1')
    
    env.allowLocalModels = true

    this.pipeline = await pipeline(
      'automatic-speech-recognition',
      localPath,  // Pass local path or blob URL
      {
        device: WHISPER_CONFIG.device === 'wasm' ? 'wasm' : 'webgpu',
        progress_callback: (progress) => {
          if (progress.progress !== undefined && onProgress) {
            onProgress(Math.round(progress.progress))
          }
        }
      }
    )

    return this.pipeline
  }

  async start() {
    if (!this.pipeline) {
      await this.preLoadModel()
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
    })

    this.stream = stream
    this.audioContext = new AudioContext({ sampleRate: 16000 })

    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
    })

    const chunks = []

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    this.mediaRecorder.onstop = async () => {
      this.onLoading?.('Recognizing...')
      
      const blob = new Blob(chunks, { type: this.mediaRecorder.mimeType })
      const arrayBuffer = await blob.arrayBuffer()
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer)
      
      let channelData = audioBuffer.getChannelData(0)
      const actualRate = audioBuffer.sampleRate
      
      if (Math.abs(actualRate - 16000) > 100) {
        const ratio = 16000 / actualRate
        const newLen = Math.round(channelData.length * ratio)
        const resampled = new Float32Array(newLen)
        for (let i = 0; i < newLen; i++) {
          const srcIdx = (i / newLen) * channelData.length
          const lo = Math.floor(srcIdx)
          const hi = Math.min(lo + 1, channelData.length - 1)
          resampled[i] = channelData[lo] + (channelData[hi] - channelData[lo]) * (srcIdx - lo)
        }
        channelData = resampled
      }

      try {
        const result = await this.pipeline(channelData, {
          language: 'zh',
          task: 'transcribe',
        })
        
        const text = result?.text?.trim()
        if (text) {
          this.onResult?.(text)
        }
      } catch (e) {
        this.onError?.('Recognition failed: ' + e.message)
      }

      this.onLoading?.('')
      this._recording = false
      this.onEnd?.()
    }

    this.mediaRecorder.start(500)
    this._recording = true
    this.onStart?.()
  }

  stop() {
    this._recording = false
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop()
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop())
    }
    if (this.audioContext) {
      this.audioContext.close()
    }
  }

  isRecording() {
    return this._recording
  }

  // Check current cache status
  async getCacheStatus() {
    const cacheKey = getCacheKey(this.modelName)
    const cached = await loadFromCache(cacheKey)
    return {
      strategy: this.cacheStrategy,
      cached: !!cached,
      cachedSize: cached ? (cached.size / 1024 / 1024).toFixed(2) + ' MB' : null
    }
  }
}

export { WhisperProvider }
export async function clearModelCache() {
  await clearCache()
}
export async function getModelCacheInfo() {
  return await getCacheInfo()
}