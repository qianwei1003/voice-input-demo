/**
 * Placeholder Wake Word Engine
 *
 * Used for testing the voice control flow without a real wake word engine.
 * Simulates wake word detection via manual trigger or keyboard shortcut.
 *
 * Config:
 *   wakeWord: string - The wake word label (for display)
 */

import { BaseWakeWordEngine } from './baseEngine.js'

export class PlaceholderEngine extends BaseWakeWordEngine {
  constructor() {
    super()
    this._isInitialized = false
    this._isListening = false
    this._wakeWord = '小方小方'
  }

  async init(config = {}) {
    this._wakeWord = config.wakeWord || '小方小方'
    this._isInitialized = true
    console.log(`[PlaceholderEngine] Initialized (wake word: "${this._wakeWord}")`)
    console.log('[PlaceholderEngine] Use simulateWake() or press Space to trigger')
  }

  async start() {
    if (!this._isInitialized) {
      throw new Error('PlaceholderEngine not initialized')
    }
    this._isListening = true
    this.onStateChange?.(true)
    console.log('[PlaceholderEngine] Listening (simulated)')

    this._keyHandler = (e) => {
      if (e.code === 'Space' && this._isListening) {
        const tag = e.target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return
        e.preventDefault()
        this.simulateWake()
      }
    }
    document.addEventListener('keydown', this._keyHandler)
  }

  stop() {
    this._isListening = false
    this.onStateChange?.(false)
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler)
      this._keyHandler = null
    }
    console.log('[PlaceholderEngine] Stopped')
  }

  async release() {
    this.stop()
    this._isInitialized = false
    console.log('[PlaceholderEngine] Released')
  }

  simulateWake() {
    console.log(`[PlaceholderEngine] Wake word simulated: "${this._wakeWord}"`)
    this.onWakeWord?.()
  }

  isListening() {
    return this._isListening
  }

  isInitialized() {
    return this._isInitialized
  }
}
