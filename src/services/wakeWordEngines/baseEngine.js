/**
 * Base Wake Word Engine Interface
 *
 * All wake word engines must implement this interface.
 * Methods:
 *   init(config) - Initialize the engine
 *   start()      - Start listening for wake word
 *   stop()       - Stop listening
 *   release()    - Release all resources
 *   isListening() - Check if currently listening
 *   isInitialized() - Check if initialized
 *
 * Callbacks (set by caller):
 *   onWakeWord  - Called when wake word is detected
 *   onError     - Called on error
 *   onStateChange - Called when listening state changes
 */

export class BaseWakeWordEngine {
  constructor() {
    this.onWakeWord = null
    this.onError = null
    this.onStateChange = null
  }

  async init(config) {
    throw new Error('Not implemented')
  }

  async start() {
    throw new Error('Not implemented')
  }

  stop() {
    throw new Error('Not implemented')
  }

  async release() {
    throw new Error('Not implemented')
  }

  isListening() {
    return false
  }

  isInitialized() {
    return false
  }
}
