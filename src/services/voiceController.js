/**
 * Voice Controller
 *
 * Core state machine that orchestrates wake word detection, speech recognition,
 * and the complete voice interaction flow.
 *
 * Flow: idle → listening → waiting → confirming → sending
 *
 * Events emitted:
 * - wakeWord: wake word detected
 * - stateChange(newState): state changed
 * - transcript(text): final ASR result
 * - interim(text): interim ASR result
 * - send(text): ready to send to AI
 * - prompt(messageKey): needs voice playback (consumer handles TTS)
 * - aiCommand(type): show/hide/clear AI dialog
 * - timeout(): hard timeout, back to idle
 * - error(err): error occurred
 */

import { ref } from 'vue'
import { WakeWordService } from './wakeWordService.js'
import { speechService } from './speechService.js'
import {
  matchEndKeyword,
  stripEndKeyword,
  matchConfirmKeyword,
  matchAICommand,
  getLocaleKeywords,
} from './keywordMatcher.js'
import {
  SEND_MODE,
  VOICE_TIMERS,
  VOICE_STATE,
  AI_COMMAND_TYPE,
  VOICE_LOCALES,
  DEFAULT_LOCALE,
  CONFIRM_ANSWER_MAX_LENGTH,
} from './voiceConfig.js'
import { WAKE_WORD_CONFIG } from '../config.js'

class VoiceController {
  constructor() {
    // Services
    this.wakeWordService = new WakeWordService()

    // Reactive state
    this.state = ref(VOICE_STATE.IDLE)
    this.transcript = ref('')
    this.interim = ref('')
    this.sendMode = ref(SEND_MODE.CONFIRM)
    this.locale = ref(DEFAULT_LOCALE)

    // Internal
    this._silenceTimer = null
    this._hardTimeoutTimer = null
    this._isInitialized = false
    this._pendingSendText = ''

    // Event listeners
    this._listeners = {
      wakeWord: [],
      stateChange: [],
      transcript: [],
      interim: [],
      send: [],
      prompt: [],
      aiCommand: [],
      timeout: [],
      error: [],
    }

    // Bind methods
    this._onWakeWord = this._onWakeWord.bind(this)
    this._onASRResult = this._onASRResult.bind(this)
    this._onASRInterim = this._onASRInterim.bind(this)
    this._onASRError = this._onASRError.bind(this)
    this._onASREnd = this._onASREnd.bind(this)
  }

  // ============ Event System ============

  on(event, callback) {
    if (this._listeners[event]) {
      this._listeners[event].push(callback)
    }
    return () => this.off(event, callback)
  }

  off(event, callback) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter((cb) => cb !== callback)
    }
  }

  _emit(event, ...args) {
    const callbacks = this._listeners[event] || []
    for (const cb of callbacks) {
      try {
        cb(...args)
      } catch (err) {
        console.error(`[VoiceController] Event callback error (${event}):`, err)
      }
    }
  }

  // ============ Configuration ============

  setSendMode(mode) {
    if (Object.values(SEND_MODE).includes(mode)) {
      this.sendMode.value = mode
    }
  }

  setLocale(locale) {
    if (VOICE_LOCALES[locale]) {
      this.locale.value = locale
    }
  }

  // ============ Initialization ============

  async init() {
    if (this._isInitialized) return

    try {
      // Initialize wake word service (pluggable engine based on config)
      if (WAKE_WORD_CONFIG.enabled) {
        await this.wakeWordService.init()

        this.wakeWordService.onWakeWord = this._onWakeWord
        this.wakeWordService.onError = (err) => this._emit('error', err)

        console.log('[VoiceController] Wake word service initialized')
      } else {
        console.warn('[VoiceController] Wake word not enabled. Set WAKE_WORD_CONFIG.enabled in config.js')
      }

      // Setup ASR callbacks
      speechService.onResult = this._onASRResult
      speechService.onInterim = this._onASRInterim
      speechService.onError = this._onASRError
      speechService.onEnd = this._onASREnd

      this._isInitialized = true
      console.log('[VoiceController] Initialized')
    } catch (error) {
      console.error('[VoiceController] Init failed:', error)
      this._emit('error', error)
      throw error
    }
  }

  // ============ Lifecycle ============

  async start() {
    if (!this._isInitialized) {
      await this.init()
    }

    if (this.wakeWordService.isInitialized()) {
      await this.wakeWordService.start()
    }

    this._setState(VOICE_STATE.IDLE)
    console.log('[VoiceController] Started, waiting for wake word')
  }

  stop() {
    this._clearAllTimers()
    this.wakeWordService.stop()
    speechService.stop()
    this._setState(VOICE_STATE.IDLE)
    console.log('[VoiceController] Stopped')
  }

  async destroy() {
    this.stop()
    await this.wakeWordService.release()
    this._isInitialized = false
    console.log('[VoiceController] Destroyed')
  }

  // ============ State Machine ============

  _setState(newState) {
    const oldState = this.state.value
    if (oldState === newState) return
    this.state.value = newState
    console.log(`[VoiceController] State: ${oldState} → ${newState}`)
    this._emit('stateChange', newState)
  }

  _clearAllTimers() {
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer)
      this._silenceTimer = null
    }
    if (this._hardTimeoutTimer) {
      clearTimeout(this._hardTimeoutTimer)
      this._hardTimeoutTimer = null
    }
  }

  // ============ Wake Word Handler ============

  _onWakeWord() {
    console.log('[VoiceController] Wake word detected!')
    this._emit('wakeWord')
    this._startListening()
  }

  // ============ Listening Phase ============

  async _startListening() {
    this._clearAllTimers()
    this.transcript.value = ''
    this.interim.value = ''
    this._pendingSendText = ''

    this._setState(VOICE_STATE.LISTENING)

    // Start hard timeout timer
    this._hardTimeoutTimer = setTimeout(() => {
      console.log('[VoiceController] Hard timeout reached')
      this._handleTimeout()
    }, VOICE_TIMERS.HARD_TIMEOUT)

    // Start ASR
    try {
      const engine = speechService.engine?.value || 'webspeech'
      const lang = this.locale.value
      await speechService.start(engine, lang)
    } catch (error) {
      console.error('[VoiceController] ASR start failed:', error)
      this._emit('error', error)
      this._backToIdle()
    }
  }

  // ============ ASR Handlers ============

  _onASRResult(text) {
    if (this.state.value !== VOICE_STATE.LISTENING && this.state.value !== VOICE_STATE.WAITING && this.state.value !== VOICE_STATE.CONFIRMING) {
      return
    }

    // Append to transcript
    if (this.transcript.value) {
      this.transcript.value += text
    } else {
      this.transcript.value = text
    }

    this.interim.value = ''
    this._emit('transcript', this.transcript.value)

    // Check for AI commands (only in listening state, short text)
    if (this.state.value === VOICE_STATE.LISTENING) {
      const aiCommandResult = this._checkAICommand(this.transcript.value)
      if (aiCommandResult.matched) {
        this._handleAICommand(aiCommandResult.type)
        return
      }
    }

    // Reset silence timer on new speech
    this._resetSilenceTimer()
  }

  _onASRInterim(text) {
    if (this.state.value !== VOICE_STATE.LISTENING && this.state.value !== VOICE_STATE.WAITING && this.state.value !== VOICE_STATE.CONFIRMING) {
      return
    }
    this.interim.value = text
    this._emit('interim', text)
  }

  _onASRError(err) {
    console.error('[VoiceController] ASR error:', err)
    this._emit('error', err)
  }

  _onASREnd() {
    // ASR ended (e.g., browser stopped it)
    // Only handle if we were actively listening (not if already sending)
    if (this.state.value === VOICE_STATE.SENDING) return
    if (this.state.value === VOICE_STATE.LISTENING || this.state.value === VOICE_STATE.WAITING || this.state.value === VOICE_STATE.CONFIRMING) {
      console.log('[VoiceController] ASR ended unexpectedly')
      // If we have transcript, trigger send; otherwise go idle
      if (this.transcript.value.trim()) {
        this._triggerSend(this.transcript.value)
      } else {
        this._backToIdle()
      }
    }
  }

  // ============ Silence Timer ============

  _resetSilenceTimer() {
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer)
      this._silenceTimer = null
    }

    if (this.state.value === VOICE_STATE.LISTENING) {
      this._silenceTimer = setTimeout(() => {
        this._handleFirstSilence()
      }, VOICE_TIMERS.FIRST_SILENCE)
    } else if (this.state.value === VOICE_STATE.WAITING) {
      this._silenceTimer = setTimeout(() => {
        this._handleExtendedSilence()
      }, VOICE_TIMERS.EXTENDED_SILENCE - VOICE_TIMERS.FIRST_SILENCE)
    }
  }

  // ============ Silence Handlers ============

  _handleFirstSilence() {
    const text = this.transcript.value.trim()

    if (!text) {
      // No speech at all after 3s, go idle
      this._backToIdle()
      return
    }

    if (this.sendMode.value === SEND_MODE.AUTO) {
      // Auto mode: send immediately
      this._triggerSend(text)
    } else {
      // Confirm mode: check end keywords
      const localeKeywords = getLocaleKeywords(this.locale.value)
      if (matchEndKeyword(text, localeKeywords.END)) {
        const cleanedText = stripEndKeyword(text, localeKeywords.END)
        this._triggerSend(cleanedText || text)
      } else {
        // Continue waiting
        this._setState(VOICE_STATE.WAITING)
        this._resetSilenceTimer()
      }
    }
  }

  _handleExtendedSilence() {
    const text = this.transcript.value.trim()

    if (!text) {
      this._backToIdle()
      return
    }

    // 5s silence: prompt user
    this._setState(VOICE_STATE.CONFIRMING)
    this._emit('prompt', 'PROMPT_MORE')

    // Start a timer for confirm response
    this._silenceTimer = setTimeout(() => {
      // If no response after prompt, timeout
      if (this.state.value === VOICE_STATE.CONFIRMING) {
        this._handleTimeout()
      }
    }, VOICE_TIMERS.HARD_TIMEOUT)
  }

  // ============ Confirm Handler ============

  handleConfirmResponse(text) {
    if (this.state.value !== VOICE_STATE.CONFIRMING) return

    const cleaned = text.trim()
    const localeKeywords = getLocaleKeywords(this.locale.value)

    // Check if answer is short enough for confirm matching
    if (cleaned.length <= CONFIRM_ANSWER_MAX_LENGTH) {
      // Match YES keywords (send immediately)
      if (matchConfirmKeyword(cleaned, localeKeywords.YES)) {
        this._triggerSend(this.transcript.value)
        return
      }

      // Match CONTINUE keywords (keep listening)
      if (matchConfirmKeyword(cleaned, localeKeywords.CONTINUE)) {
        this._emit('prompt', 'PROMPT_CONTINUE')
        this._setState(VOICE_STATE.LISTENING)
        this._resetSilenceTimer()
        return
      }
    }

    // No match: apologize and re-listen
    this._emit('prompt', 'PROMPT_REPEAT')

    // Wait for next response
    this._silenceTimer = setTimeout(() => {
      if (this.state.value === VOICE_STATE.CONFIRMING) {
        this._handleTimeout()
      }
    }, VOICE_TIMERS.HARD_TIMEOUT)
  }

  // ============ AI Command Check ============

  _checkAICommand(text) {
    const localeKeywords = getLocaleKeywords(this.locale.value)
    return matchAICommand(text, localeKeywords)
  }

  _handleAICommand(type) {
    console.log(`[VoiceController] AI command: ${type}`)
    this._emit('aiCommand', type)

    // Clear transcript since command was handled
    this.transcript.value = ''
    this.interim.value = ''

    // Stop ASR and go idle
    speechService.stop()
    this._clearAllTimers()
    this._setState(VOICE_STATE.IDLE)

    // Restart wake word listening
    if (this.wakeWordService.isInitialized()) {
      this.wakeWordService.start().catch((err) => {
        console.error('[VoiceController] Wake word restart failed:', err)
      })
    }
  }

  // ============ Send ============

  _triggerSend(text) {
    if (!text || !text.trim()) {
      this._backToIdle()
      return
    }

    this._clearAllTimers()
    // Clear transcript BEFORE stopping ASR to prevent re-entrancy
    // (stop() may fire onEnd synchronously, which checks transcript)
    this.transcript.value = ''
    this.interim.value = ''
    speechService.stop()
    this._setState(VOICE_STATE.SENDING)

    console.log(`[VoiceController] Sending: "${text}"`)
    this._emit('send', text)

    // Go idle after send
    this._backToIdle()
  }

  // ============ Timeout ============

  _handleTimeout() {
    console.log('[VoiceController] Timeout')
    this._emit('timeout')
    speechService.stop()
    this._clearAllTimers()
    this._backToIdle()
  }

  // ============ Reset ============

  _backToIdle() {
    this._clearAllTimers()
    this.transcript.value = ''
    this.interim.value = ''
    this._pendingSendText = ''
    this._setState(VOICE_STATE.IDLE)

    // Restart wake word listening
    if (this.wakeWordService.isInitialized() && this.wakeWordService.isListening()) {
      // Already listening, no need to restart
    } else if (this.wakeWordService.isInitialized()) {
      this.wakeWordService.start().catch((err) => {
        console.error('[VoiceController] Wake word restart failed:', err)
      })
    }
  }
}

export { VoiceController }
export default new VoiceController()
