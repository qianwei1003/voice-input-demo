/**
 * Wake Word Engine Factory
 *
 * Selects and creates the appropriate wake word engine based on config.
 *
 * Available engines:
 *   'placeholder'  - Manual trigger (Space key or simulateWake()), no real detection
 *   'sherpa-kws'   - Sherpa-ONNX KWS via WebAssembly (needs WASM files + model)
 *   'porcupine'    - Porcupine by Picovoice (needs AccessKey + model, awaiting approval)
 */

import { PlaceholderEngine } from './placeholderEngine.js'
import { SherpaKwsEngine } from './sherpaKwsEngine.js'

const ENGINE_MAP = {
  'placeholder': PlaceholderEngine,
  'sherpa-kws': SherpaKwsEngine,
  // 'porcupine': PorcupineEngine,  // TODO: Add when approved
}

/**
 * Create a wake word engine instance.
 * @param {string} engineId - Engine identifier from ENGINE_MAP
 * @returns {BaseWakeWordEngine}
 */
export function createWakeWordEngine(engineId) {
  const EngineClass = ENGINE_MAP[engineId]

  if (!EngineClass) {
    console.warn(`[WakeWordFactory] Unknown engine "${engineId}", falling back to placeholder`)
    return new PlaceholderEngine()
  }

  return new EngineClass()
}

/**
 * Get list of available engine IDs.
 * @returns {string[]}
 */
export function getAvailableEngines() {
  return Object.keys(ENGINE_MAP)
}
