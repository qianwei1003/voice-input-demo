/**
 * Speech Recognition Service
 * 
 * Engines:
 * - webspeech: Web Speech API (free, no config)
 * - whisper: Whisper Local (free, no config, needs WebGPU)
 * - iflytek: iFlytek (cloud, needs API config)
 * - aliyun: Aliyun ASR (cloud, needs API config)
 * - tencent: Tencent ASR (cloud, needs API config)
 * 
 * Whisper Cache Strategies (set in config.js):
 * - 'session': Keep in memory (default, loses on refresh in dev mode)
 * - 'indexeddb': Persist to IndexedDB (survives refresh, recommended for dev)
 * - 'none': No caching (always re-download)
 */
import { ref } from 'vue'
import { ENGINES, DEFAULT_ENGINE, WHISPER_CONFIG, isEngineAvailable } from '../config.js'
import { WhisperProvider } from './whisperProvider.js'
import { iFlytekProvider, AliyunProvider, TencentProvider } from './cloudProviders.js'

// ============ Web Speech API Provider ============
class WebSpeechProvider {
  constructor() {
    this.recognition = null
    this._recording = false
    this.onStart = null
    this.onEnd = null
    this.onResult = null
    this.onInterim = null
    this.onError = null
  }

  checkSupport() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  }

  start(lang = 'zh-CN') {
    return new Promise((resolve, reject) => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition
      if (!SR) {
        reject(new Error('Browser does not support Web Speech API'))
        return
      }

      if (this.recognition) {
        try { this.recognition.abort() } catch (e) {}
      }

      this.recognition = new SR()
      this.recognition.continuous = true
      this.recognition.interimResults = true
      this.recognition.lang = lang

      this.recognition.onstart = () => {
        this._recording = true
        this.onStart?.()
        resolve()
      }

      this.recognition.onresult = (event) => {
        let final = ''
        let interim = ''
        for (let i = 0; i < event.results.length; i++) {
          const t = event.results[i][0].transcript
          if (event.results[i].isFinal) final += t
          else interim += t
        }
        if (final) this.onResult?.(final)
        if (interim) this.onInterim?.(interim)
      }

      this.recognition.onerror = (event) => {
        this.onError?.(event.error)
      }

      this.recognition.onend = () => {
        this._recording = false
        this.onEnd?.()
      }

      try {
        this.recognition.start()
      } catch (e) {
        reject(e)
      }
    })
  }

  stop() {
    if (this.recognition) {
      try { this.recognition.abort() } catch (e) {}
    }
  }

  isRecording() {
    return this._recording
  }
}

// ============ Main Service ============
class SpeechService {
  constructor() {
    // 本地引擎
    this.webSpeechProvider = new WebSpeechProvider()
    this.whisperProvider = new WhisperProvider()
    
    // 云端引擎
    this.iFlytekProvider = new iFlytekProvider()
    this.aliyunProvider = new AliyunProvider()
    this.tencentProvider = new TencentProvider()
    
    // 状态
    this.status = ref('idle')
    this.transcript = ref('')
    this.interim = ref('')
    this.error = ref('')
    this.loading = ref('')
    this.engine = ref(DEFAULT_ENGINE)
    this.currentProvider = null
    this.engines = ENGINES
    
    // Whisper 配置信息
    this.whisperCacheStrategy = WHISPER_CONFIG.cacheStrategy || 'session'
    this.whisperModel = WHISPER_CONFIG.model || 'tiny'
  }

  isSupported() {
    return this.webSpeechProvider.checkSupport()
  }

  // 获取所有可用的引擎
  getAvailableEngines() {
    return Object.values(ENGINES).map(eng => ({
      ...eng,
      available: isEngineAvailable(eng.id),
      configured: eng.id === 'webspeech' || eng.id === 'whisper' || isEngineAvailable(eng.id)
    }))
  }

  // 检查引擎是否已配置
  isEngineConfigured(engineId) {
    return isEngineAvailable(engineId)
  }

  // 获取 Whisper 缓存状态
  async getWhisperCacheStatus() {
    return await this.whisperProvider.getCacheStatus()
  }

  async start(engine = DEFAULT_ENGINE, lang = 'zh-CN') {
    this.error.value = ''
    this.transcript.value = ''
    this.interim.value = ''
    this.loading.value = ''

    let provider
    switch (engine) {
      case 'webspeech':
        provider = this.webSpeechProvider
        break
      case 'whisper':
        provider = this.whisperProvider
        break
      case 'iflytek':
        provider = this.iFlytekProvider
        break
      case 'aliyun':
        provider = this.aliyunProvider
        break
      case 'tencent':
        provider = this.tencentProvider
        break
      default:
        this.error.value = `Unknown engine: ${engine}`
        return
    }

    this.currentProvider = provider
    this.engine.value = engine

    // 设置回调
    provider.onLoading = (msg) => { this.loading.value = msg }
    provider.onStart = () => { this.status.value = 'recording' }
    provider.onEnd = () => { 
      if (this.status.value !== 'error') this.status.value = 'idle' 
    }
    provider.onResult = (text) => { this.transcript.value += text }
    provider.onInterim = (text) => { this.interim.value = text }
    provider.onError = (err) => { 
      this.error.value = String(err)
      this.status.value = 'error'
    }

    try {
      await provider.start(lang)
    } catch (e) {
      this.error.value = e.message
      this.status.value = 'error'
    }
  }

  stop() {
    if (this.currentProvider) {
      this.currentProvider.stop()
    }
  }

  isRecording() {
    return this.currentProvider?.isRecording() || false
  }
}

export const speechService = new SpeechService()
export { ENGINES, DEFAULT_ENGINE, WHISPER_CONFIG, isEngineAvailable }