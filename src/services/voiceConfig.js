/**
 * Voice Control Configuration
 *
 * Multi-language keyword sets, timer constants, and mode definitions
 * for the voice interaction state machine.
 */

// ============ Send Modes ============
export const SEND_MODE = {
  AUTO: 'auto',
  CONFIRM: 'confirm',
}

// ============ Timer Constants (ms) ============
export const VOICE_TIMERS = {
  FIRST_SILENCE: 3000,
  EXTENDED_SILENCE: 5000,
  HARD_TIMEOUT: 10000,
}

// ============ State Definitions ============
export const VOICE_STATE = {
  IDLE: 'idle',
  SPEAKING: 'speaking',
  LISTENING: 'listening',
  WAITING: 'waiting',
  CONFIRMING: 'confirming',
  SENDING: 'sending',
}

// ============ AI Command Types ============
export const AI_COMMAND_TYPE = {
  SHOW: 'show',
  HIDE: 'hide',
  CLEAR: 'clear',
}

// ============ Multi-Language Keywords ============
export const VOICE_LOCALES = {
  'zh-CN': {
    END: ['说完了', '立即发送', '立即查询', '立即执行', '结束', '完成', '发送'],
    YES: ['无', '否', '没有', '不用', '发送'],
    CONTINUE: ['有', '补充', '继续补充', '需要补充'],
    SHOW_AI: ['显示AI', '打开AI', '弹出AI', '查看AI'],
    HIDE_AI: ['隐藏AI', '关闭AI'],
    CLEAR: ['清空', '重新输入', '重新录入'],
    PROMPT_MORE: '请问还有补充问题吗？',
    PROMPT_CONTINUE: '请继续说出补充问题。',
    PROMPT_REPEAT: '对不起，没听清，请重说。',
  },
  'en-US': {
    END: ['done', 'send now', 'execute', 'finish', 'complete', 'send'],
    YES: ['no', 'nope', 'nothing', 'send'],
    CONTINUE: ['yes', 'more', 'add more', 'continue'],
    SHOW_AI: ['show AI', 'open AI', 'display AI'],
    HIDE_AI: ['hide AI', 'close AI'],
    CLEAR: ['clear', 'reset', 'start over'],
    PROMPT_MORE: 'Anything else to add?',
    PROMPT_CONTINUE: 'Please continue.',
    PROMPT_REPEAT: "Sorry, didn't catch that. Please repeat.",
  },
  'ja-JP': {
    END: ['送信', '終わり', '完了', '実行'],
    YES: ['いいえ', 'なし', '送信'],
    CONTINUE: ['はい', '追加', '続ける'],
    SHOW_AI: ['AIを表示', 'AIを開く'],
    HIDE_AI: ['AIを隠す', 'AIを閉じる'],
    CLEAR: ['クリア', 'リセット', '再入力'],
    PROMPT_MORE: '追加はありますか？',
    PROMPT_CONTINUE: '続けてください。',
    PROMPT_REPEAT: 'すみません、聞き取れませんでした。もう一度お願いします。',
  },
  'ko-KR': {
    END: ['보내기', '끝', '완료', '실행'],
    YES: ['아니요', '없음', '보내기'],
    CONTINUE: ['네', '추가', '계속'],
    SHOW_AI: ['AI 표시', 'AI 열기'],
    HIDE_AI: ['AI 숨기기', 'AI 닫기'],
    CLEAR: ['지우기', '초기화', '다시 입력'],
    PROMPT_MORE: '추가 질문이 있으신가요?',
    PROMPT_CONTINUE: '계속 말씀해 주세요.',
    PROMPT_REPEAT: '죄송합니다. 다시 말씀해 주세요.',
  },
}

// ============ Default Locale ============
export const DEFAULT_LOCALE = 'zh-CN'

// ============ AI Command Max Length ============
export const AI_COMMAND_MAX_LENGTH = 7

// ============ Confirm Answer Max Word Count ============
export const CONFIRM_ANSWER_MAX_LENGTH = 4
