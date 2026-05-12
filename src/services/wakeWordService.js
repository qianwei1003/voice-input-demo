/**
 * Wake Word Service
 *
 * Unified interface for wake word detection.
 * Uses a pluggable engine architecture - the actual engine is selected via config.
 *
 * Config (in config.js WAKE_WORD_CONFIG):
 *   engine: 'placeholder' | 'sherpa-kws' | 'porcupine'
 *   wakeWord: string
 *   engineConfig: object (engine-specific config)
 */

import { createWakeWordEngine } from './wakeWordEngines/index.js'
import { WAKE_WORD_CONFIG } from '../config.js'

class WakeWordService {
  constructor() {
    this._engine = null
    this._isInitialized = false

    // Callbacks
    this.onWakeWord = null
    this.onError = null
    this.onStateChange = null
  }

  /**
   * Initialize the wake word service.
   * Creates the appropriate engine based on WAKE_WORD_CONFIG.
   */
  async init() {
    const engineId = WAKE_WORD_CONFIG.engine || 'placeholder'
    const engineConfig = WAKE_WORD_CONFIG.engineConfig || {}

    console.log(`[WakeWordService] Initializing engine: ${engineId}`)

    this._engine = createWakeWordEngine(engineId)

    // Wire up callbacks
    this._engine.onWakeWord = () => this.onWakeWord?.()
    this._engine.onError = (err) => this.onError?.(err)
    this._engine.onStateChange = (state) => this.onStateChange?.(state)

    await this._engine.init({
      wakeWord: WAKE_WORD_CONFIG.wakeWord || '小方小方',
      ...engineConfig,
    })

    this._isInitialized = true
    console.log(`[WakeWordService] Ready (engine: ${engineId})`)
  }

  async start() {
    if (!this._isInitialized) {
      throw new Error('WakeWordService not initialized')
    }
    await this._engine.start()
  }

  stop() {
    this._engine?.stop()
  }

  async release() {
    if (this._engine) {
      await this._engine.release()
      this._engine = null
    }
    this._isInitialized = false
  }

  isListening() {
    return this._engine?.isListening() || false
  }

  isInitialized() {
    return this._isInitialized
  }

  /**
   * Simulate wake word detection (only works with placeholder engine).
   */
  simulateWake() {
    if (this._engine?.simulateWake) {
      this._engine.simulateWake()
    } else {
      console.warn('[WakeWordService] simulateWake() only available with placeholder engine')
    }
  }
}

export { WakeWordService }
