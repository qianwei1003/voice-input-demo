/**
 * Sherpa-ONNX KWS Wake Word Engine
 */

import { BaseWakeWordEngine } from './baseEngine.js'

export class SherpaKwsEngine extends BaseWakeWordEngine {
  constructor() {
    super()
    this._isInitialized = false
    this._isListening = false
    this._kws = null
    this._stream = null
    this._audioContext = null
    this._processor = null
    this._source = null
    this._mediaStream = null
  }

  async init(config = {}) {
    try {
      const baseUrl = config.baseUrl || '/sherpa-kws'
      const modelDir = config.modelPath || '/sherpa-kws/sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01'

      // Create promise for runtime ready
      const runtimeReady = new Promise((resolve) => {
        window.Module = {
          locateFile: (name) => `${baseUrl}/${name}`,
          onRuntimeInitialized: () => {
            console.log('[SherpaKwsEngine] WASM runtime initialized')
            resolve()
          },
        }
      })

      // Load Emscripten JS
      await this._loadScript(`${baseUrl}/sherpa-onnx-wasm-kws-main.js`)
      await runtimeReady

      // Load sherpa-onnx KWS wrapper
      await this._loadScript(`${baseUrl}/sherpa-onnx-kws.js`)

      if (typeof window.createKws === 'undefined') {
        throw new Error('createKws not found')
      }

      // Wait for FS to be available
      // In Emscripten, FS is a global variable, not Module.FS
      const M = window.Module
      let retries = 0
      while (!window.FS && !M.FS && retries < 50) {
        await new Promise((r) => setTimeout(r, 100))
        retries++
      }
      // Prefer Module.FS if available, fallback to global FS
      const FS = M.FS || window.FS
      if (!FS) {
        throw new Error('Emscripten FS not available after 5 seconds')
      }
      // Expose FS on Module for convenience
      if (!M.FS) M.FS = FS
      console.log('[SherpaKwsEngine] FS ready')

      // Manually load model files into virtual filesystem
      const filesToLoad = [
        { src: `${modelDir}/encoder-epoch-12-avg-2-chunk-16-left-64.onnx`, dst: '/encoder-epoch-12-avg-2-chunk-16-left-64.onnx' },
        { src: `${modelDir}/decoder-epoch-12-avg-2-chunk-16-left-64.onnx`, dst: '/decoder-epoch-12-avg-2-chunk-16-left-64.onnx' },
        { src: `${modelDir}/joiner-epoch-12-avg-2-chunk-16-left-64.onnx`, dst: '/joiner-epoch-12-avg-2-chunk-16-left-64.onnx' },
        { src: `${modelDir}/tokens.txt`, dst: '/tokens.txt' },
        { src: `${modelDir}/keywords.txt`, dst: '/keywords.txt' },
      ]

      console.log('[SherpaKwsEngine] Loading model files into virtual FS...')
      for (const { src, dst } of filesToLoad) {
        try {
          const resp = await fetch(src)
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
          const buf = await resp.arrayBuffer()
          FS.writeFile(dst, new Uint8Array(buf))
          console.log(`[SherpaKwsEngine] ${dst}: loaded (${buf.byteLength} bytes)`)
        } catch (e) {
          console.error(`[SherpaKwsEngine] Failed to load ${src}:`, e)
          throw e
        }
      }

      // Read keywords
      const keywords = FS.readFile('/keywords.txt', { encoding: 'utf8' })
      console.log('[SherpaKwsEngine] Keywords:', keywords.trim())

      // Create KWS
      const kwsConfig = {
        featConfig: { samplingRate: 16000, featureDim: 80 },
        modelConfig: {
          transducer: {
            encoder: '/encoder-epoch-12-avg-2-chunk-16-left-64.onnx',
            decoder: '/decoder-epoch-12-avg-2-chunk-16-left-64.onnx',
            joiner: '/joiner-epoch-12-avg-2-chunk-16-left-64.onnx',
          },
          tokens: '/tokens.txt',
          provider: 'cpu',
          modelType: '',
          numThreads: 1,
          debug: 0,
          modelingUnit: 'ppinyin',
          bpeVocab: '',
        },
        maxActivePaths: 4,
        numTrailingBlanks: 1,
        keywordsScore: config.keywordsScore || 1.0,
        keywordsThreshold: config.keywordsThreshold || 0.25,
        keywords: keywords,
      }

      this._kws = window.createKws(M, kwsConfig)
      this._isInitialized = true
      console.log('[SherpaKwsEngine] Initialized')
    } catch (error) {
      console.error('[SherpaKwsEngine] Init failed:', error)
      throw error
    }
  }

  _loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = url
      script.onload = resolve
      script.onerror = () => reject(new Error(`Failed to load ${url}`))
      document.head.appendChild(script)
    })
  }

  async start() {
    if (!this._isInitialized) throw new Error('Not initialized')
    if (this._isListening) return

    try {
      this._mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
    } catch (err) {
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error('未找到麦克风设备，请确认已连接麦克风并允许浏览器访问')
      }
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风')
      }
      throw new Error(`麦克风访问失败: ${err.message}`)
    }

    this._audioContext = new AudioContext({ sampleRate: 16000 })
    this._source = this._audioContext.createMediaStreamSource(this._mediaStream)
    this._processor = this._audioContext.createScriptProcessor(4096, 1, 1)
    this._stream = this._kws.createStream()

    this._processor.onaudioprocess = (e) => {
      if (!this._isListening) return
      const samples = new Float32Array(e.inputBuffer.getChannelData(0))
      this._stream.acceptWaveform(16000, samples)
      while (this._kws.isReady(this._stream)) {
        this._kws.decode(this._stream)
        const result = this._kws.getResult(this._stream)
        if (result.keyword && result.keyword.length > 0) {
          console.log(`[SherpaKwsEngine] Keyword detected: "${result.keyword}"`)
          this.onWakeWord?.()
          this._kws.reset(this._stream)
        }
      }
    }

    this._source.connect(this._processor)
    this._processor.connect(this._audioContext.destination)
    this._isListening = true
    this.onStateChange?.(true)
    console.log('[SherpaKwsEngine] Started listening')
  }

  stop() {
    if (!this._isListening) return
    this._isListening = false
    this._processor?.disconnect()
    this._source?.disconnect()
    this._mediaStream?.getTracks().forEach((t) => t.stop())
    this._audioContext?.close()
    this._stream?.free()
    this._processor = this._source = this._mediaStream = this._audioContext = this._stream = null
    this.onStateChange?.(false)
    console.log('[SherpaKwsEngine] Stopped')
  }

  async release() {
    this.stop()
    this._kws?.free()
    this._kws = null
    this._isInitialized = false
  }

  isListening() { return this._isListening }
  isInitialized() { return this._isInitialized }
}
