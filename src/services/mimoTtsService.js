/**
 * MiMo TTS Service
 *
 * Text-to-speech using Xiaomi MiMo-V2-TTS API.
 * API is OpenAI-compatible, returns base64-encoded audio.
 *
 * Usage:
 *   import { mimoTtsService } from './mimoTtsService.js'
 *   await mimoTtsService.speak('在呢')
 *   mimoTtsService.stop()
 */

import { MIMO_CONFIG } from '../config.js'

class MimoTtsService {
  constructor() {
    this._audioContext = null
    this._source = null
    this._isSpeaking = false
    this._abortController = null
  }

  /**
   * Synthesize text to speech and play it.
   * Returns a Promise that resolves when playback finishes.
   * @param {string} text - Text to speak
   * @returns {Promise<void>}
   */
  async speak(text) {
    if (!MIMO_CONFIG.apiKey) {
      console.warn('[MimoTTS] API key not set, skipping TTS')
      return
    }

    // Stop any current playback
    this.stop()

    this._isSpeaking = true
    this._abortController = new AbortController()

    try {
      console.log(`[MimoTTS] Synthesizing: "${text}"`)

      const response = await fetch(`${MIMO_CONFIG.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'api-key': MIMO_CONFIG.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MIMO_CONFIG.ttsModel,
          messages: [
            { role: 'assistant', content: text },
          ],
          audio: {
            format: MIMO_CONFIG.format,
            voice: MIMO_CONFIG.voice,
          },
        }),
        signal: this._abortController.signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`MiMo API error ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      const audioBase64 = data.choices?.[0]?.message?.audio?.data

      if (!audioBase64) {
        throw new Error('No audio data in response')
      }

      // Decode base64 to ArrayBuffer
      const audioBytes = this._base64ToArrayBuffer(audioBase64)

      // Play audio
      await this._playAudio(audioBytes)

      console.log('[MimoTTS] Playback finished')
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('[MimoTTS] Playback aborted')
      } else {
        console.error('[MimoTTS] Error:', err)
        throw err
      }
    } finally {
      this._isSpeaking = false
      this._abortController = null
    }
  }

  /**
   * Stop current playback.
   */
  stop() {
    if (this._abortController) {
      this._abortController.abort()
      this._abortController = null
    }
    if (this._source) {
      try { this._source.stop() } catch (e) {}
      this._source = null
    }
    if (this._audioContext) {
      this._audioContext.close()
      this._audioContext = null
    }
    this._isSpeaking = false
  }

  /**
   * Check if currently speaking.
   */
  isSpeaking() {
    return this._isSpeaking
  }

  /**
   * Play audio from ArrayBuffer using Web Audio API.
   * Returns a Promise that resolves when playback ends.
   */
  _playAudio(arrayBuffer) {
    return new Promise((resolve, reject) => {
      this._audioContext = new (window.AudioContext || window.webkitAudioContext)()

      this._audioContext.decodeAudioData(
        arrayBuffer,
        (audioBuffer) => {
          if (!this._isSpeaking) {
            resolve()
            return
          }

          this._source = this._audioContext.createBufferSource()
          this._source.buffer = audioBuffer
          this._source.connect(this._audioContext.destination)

          this._source.onended = () => {
            this._source = null
            resolve()
          }

          this._source.start(0)
        },
        (err) => {
          reject(new Error(`Audio decode failed: ${err}`))
        }
      )
    })
  }

  /**
   * Convert base64 string to ArrayBuffer.
   */
  _base64ToArrayBuffer(base64) {
    const binaryString = atob(base64)
    const len = binaryString.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes.buffer
  }
}

export const mimoTtsService = new MimoTtsService()
