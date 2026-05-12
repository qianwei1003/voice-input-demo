/**
 * Keyword Matcher
 *
 * Matches user speech against predefined keywords for:
 * - End keywords (triggers immediate send in confirm mode)
 * - Confirmation answers (yes/no for "anything else?" prompt)
 * - AI commands (show/hide/clear AI dialog)
 *
 * Includes a placeholder interface for future LLM-based intent classification.
 */

import { VOICE_LOCALES, DEFAULT_LOCALE, AI_COMMAND_MAX_LENGTH, CONFIRM_ANSWER_MAX_LENGTH } from './voiceConfig.js'

/**
 * Strip trailing punctuation from text for keyword matching.
 * Removes common punctuation in all supported languages.
 */
function stripTrailingPunctuation(text) {
  return text.replace(/[。！？.!?\s]+$/g, '').trim()
}

/**
 * Check if text ends with any keyword in the list.
 * Strips trailing punctuation before matching.
 * @param {string} text - The text to check
 * @param {string[]} keywords - Keywords to match against
 * @returns {boolean}
 */
function matchEndKeyword(text, keywords) {
  const cleaned = stripTrailingPunctuation(text)
  return keywords.some((kw) => cleaned.endsWith(kw))
}

/**
 * Strip the matched end keyword from text.
 * Returns the text without the trailing keyword.
 * @param {string} text - Original text
 * @param {string[]} keywords - Keywords to strip
 * @returns {string}
 */
function stripEndKeyword(text, keywords) {
  const cleaned = stripTrailingPunctuation(text)
  for (const kw of keywords) {
    if (cleaned.endsWith(kw)) {
      return cleaned.slice(0, -kw.length).trim()
    }
  }
  return cleaned
}

/**
 * Check if text matches any keyword in the list (exact or contains).
 * For confirm answers: text should be short (<= CONFIRM_ANSWER_MAX_LENGTH chars).
 * @param {string} text - The text to check
 * @param {string[]} keywords - Keywords to match against
 * @returns {boolean}
 */
function matchConfirmKeyword(text, keywords) {
  const cleaned = stripTrailingPunctuation(text)
  if (cleaned.length > CONFIRM_ANSWER_MAX_LENGTH) return false
  return keywords.some((kw) => cleaned.includes(kw))
}

/**
 * Check if text matches an AI command.
 * Text must be <= AI_COMMAND_MAX_LENGTH characters.
 * Matches from the START of the text.
 * @param {string} text - The text to check
 * @param {object} localeKeywords - Keywords for current locale (has SHOW_AI, HIDE_AI, CLEAR)
 * @returns {{ matched: boolean, type: string|null }}
 */
function matchAICommand(text, localeKeywords) {
  const cleaned = text.trim()
  if (cleaned.length > AI_COMMAND_MAX_LENGTH) {
    return { matched: false, type: null }
  }

  for (const kw of localeKeywords.SHOW_AI) {
    if (cleaned.startsWith(kw)) {
      return { matched: true, type: 'show' }
    }
  }
  for (const kw of localeKeywords.HIDE_AI) {
    if (cleaned.startsWith(kw)) {
      return { matched: true, type: 'hide' }
    }
  }
  for (const kw of localeKeywords.CLEAR) {
    if (cleaned.startsWith(kw)) {
      return { matched: true, type: 'clear' }
    }
  }

  return { matched: false, type: null }
}

/**
 * LLM Intent Classification Interface (Placeholder)
 *
 * This function is reserved for future LLM-based intent classification.
 * Currently falls back to keyword matching.
 *
 * @param {string} text - The text to classify
 * @param {string} intent - The intent to check ('yes' | 'no' | 'continue')
 * @param {object} options - Options including locale, apiKey, etc.
 * @returns {Promise<boolean>}
 */
async function classifyIntentWithLLM(text, intent, options = {}) {
  // TODO: Implement LLM-based intent classification
  // Example implementation:
  //   const response = await fetch(LLM_API_URL, {
  //     method: 'POST',
  //     headers: { 'Authorization': `Bearer ${options.apiKey}` },
  //     body: JSON.stringify({
  //       prompt: `判断以下回答是否表示"${intent}"意图，只回复YES或NO：${text}`,
  //     }),
  //   })
  //   const result = await response.json()
  //   return result.answer === 'YES'

  console.warn('LLM intent classification not implemented, falling back to keyword matching')
  return null
}

/**
 * Get keywords for a specific locale.
 * Falls back to DEFAULT_LOCALE if locale not found.
 * @param {string} locale - Locale code (e.g., 'zh-CN')
 * @returns {object}
 */
function getLocaleKeywords(locale) {
  return VOICE_LOCALES[locale] || VOICE_LOCALES[DEFAULT_LOCALE]
}

export {
  stripTrailingPunctuation,
  matchEndKeyword,
  stripEndKeyword,
  matchConfirmKeyword,
  matchAICommand,
  classifyIntentWithLLM,
  getLocaleKeywords,
}
