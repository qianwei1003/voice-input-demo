<template>
  <div class="container">
    <h1>语音控制器测试</h1>
    <p class="subtitle">唤醒词："小方小方" · 纯能力层</p>

    <!-- Status Indicator -->
    <div class="status">
      <div :class="['avatar', stateClass]">
        <div class="avatar-ring"></div>
        <div class="avatar-core">小方</div>
      </div>
      <div class="status-info">
        <span class="state-text">{{ stateText }}</span>
        <div class="badges">
          <span class="mode-badge" v-if="sendMode">{{ sendMode }}</span>
          <span class="engine-badge" v-if="engineName">{{ engineName }}</span>
        </div>
      </div>
    </div>

    <!-- Wake Word Status -->
    <div class="wake-status" v-if="!porcupineEnabled">
      <span class="warn">唤醒词未启用，请在 config.js 中设置 WAKE_WORD_CONFIG.enabled</span>
    </div>

    <!-- Engine Selector -->
    <div class="engine-selector">
      <label>语音识别引擎：</label>
      <div class="engine-options">
        <button
          v-for="eng in availableEngines"
          :key="eng.id"
          :class="['engine-btn', { active: activeEngine === eng.id, disabled: !eng.configured }]"
          :disabled="!eng.configured"
          @click="selectEngine(eng.id)"
        >
          <span class="eng-name">{{ eng.name }}</span>
          <span v-if="eng.free" class="free-badge">免费</span>
          <span v-if="eng.needsConfig && !eng.configured" class="config-badge">需配置</span>
        </button>
      </div>
    </div>

    <!-- Send Mode Toggle -->
    <div class="mode-toggle">
      <label>发送模式：</label>
      <button
        :class="['mode-btn', { active: sendMode === 'auto' }]"
        @click="setMode('auto')"
      >
        自动 (3秒)
      </button>
      <button
        :class="['mode-btn', { active: sendMode === 'confirm' }]"
        @click="setMode('confirm')"
      >
        确认
      </button>
    </div>

    <!-- Language Selector -->
    <div class="lang-row">
      <label>语言：</label>
      <select v-model="lang" :disabled="state !== 'idle'">
        <option value="zh-CN">中文</option>
        <option value="en-US">英文</option>
        <option value="ja-JP">日文</option>
        <option value="ko-KR">韩文</option>
      </select>
    </div>

    <!-- Manual Controls -->
    <div class="controls">
      <button class="ctrl-btn start" @click="manualStart" :disabled="state !== 'idle'">
        开始监听
      </button>
      <button class="ctrl-btn stop" @click="manualStop" :disabled="state === 'idle'">
        停止
      </button>
      <button class="ctrl-btn wake" @click="simulateWake" :disabled="state !== 'idle'">
        模拟唤醒词
      </button>
      <button class="ctrl-btn tts" @click="testTts" :disabled="state !== 'idle'">
        测试TTS
      </button>
      <button class="ctrl-btn simulate" @click="simulateConversation" :disabled="state !== 'idle'">
        模拟对话
      </button>
    </div>

    <!-- Transcript Display -->
    <div class="transcript-box" v-if="transcript || interim">
      <div class="label">识别文本：</div>
      <div class="text">{{ transcript }}<span class="interim">{{ interim }}</span></div>
    </div>

    <!-- Prompt Display -->
    <div class="prompt-box" v-if="currentPrompt">
      <div class="label">提示（TTS就绪）：</div>
      <div class="prompt-text">{{ currentPrompt }}</div>
    </div>

    <!-- Reply Display -->
    <div class="reply-box" v-if="currentReply && state === 'speaking'">
      <div class="label">语音播报：</div>
      <div class="reply-text">{{ currentReply }}</div>
      <div class="waveform">
        <span></span><span></span><span></span><span></span><span></span>
      </div>
    </div>

    <!-- AI Command Display -->
    <div class="command-box" v-if="lastAICommand">
      <div class="label">AI 命令：</div>
      <div class="command-text">{{ lastAICommand }}</div>
    </div>

    <!-- Event Log -->
    <div class="event-log">
      <div class="log-header">
        <span class="label">事件日志：</span>
        <button class="clear-btn" @click="clearLog">清空</button>
      </div>
      <div class="log-entries">
        <div v-for="(entry, i) in eventLog" :key="i" :class="['log-entry', entry.type]">
          <span class="log-time">{{ entry.time }}</span>
          <span class="log-type">[{{ entry.type }}]</span>
          <span class="log-msg">{{ entry.message }}</span>
        </div>
      </div>
    </div>

    <!-- Config Info -->
    <div class="config-info">
      <h3>配置信息</h3>
      <p>当前引擎: <code>{{ WAKE_WORD_CONFIG.engine }}</code></p>
      <p>切换引擎：修改 <code>src/config.js</code> 中 <code>WAKE_WORD_CONFIG.engine</code></p>
      <ul>
        <li><code>'placeholder'</code> - 空格键模拟唤醒（测试用）</li>
        <li><code>'sherpa-kws'</code> - Sherpa-ONNX KWS（需要构建WASM）</li>
        <li><code>'porcupine'</code> - Porcupine（等待审核）</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { speechService, ENGINES } from './services/speechService.js'
import { VoiceController } from './services/voiceController.js'
import { mimoTtsService } from './services/mimoTtsService.js'
import { VOICE_STATE, VOICE_LOCALES } from './services/voiceConfig.js'
import { WAKE_WORD_CONFIG } from './config.js'

// Voice Controller instance
const voiceController = new VoiceController()

// State
const state = ref('idle')
const transcript = ref('')
const interim = ref('')
const sendMode = ref('confirm')
const lang = ref('zh-CN')
const activeEngine = ref('webspeech')
const engineName = ref('Web Speech API')
const currentPrompt = ref('')
const currentReply = ref('')
const lastAICommand = ref('')
const eventLog = ref([])
const porcupineEnabled = ref(WAKE_WORD_CONFIG.enabled)

// Available engines
const availableEngines = computed(() => speechService.getAvailableEngines())

// State display
const stateClass = computed(() => {
  switch (state.value) {
    case 'speaking': return 'speaking'
    case 'listening': return 'recording'
    case 'waiting': return 'waiting'
    case 'confirming': return 'confirming'
    case 'sending': return 'sending'
    default: return 'idle'
  }
})

const stateText = computed(() => {
  switch (state.value) {
    case 'idle': return '空闲（等待唤醒词）'
    case 'speaking': return '语音播报中...'
    case 'listening': return '监听中...'
    case 'waiting': return '等待中（确认模式）'
    case 'confirming': return '确认中...'
    case 'sending': return '发送中...'
    default: return state.value
  }
})

// Logging
function addLog(type, message) {
  const now = new Date()
  const time = now.toLocaleTimeString('zh-CN', { hour12: false })
  eventLog.value.unshift({ type, message, time })
  if (eventLog.value.length > 50) eventLog.value.pop()
}

function clearLog() {
  eventLog.value = []
}

// Engine selection
function selectEngine(eng) {
  if (state.value !== 'idle') return
  activeEngine.value = eng
  engineName.value = availableEngines.value.find((e) => e.id === eng)?.name || eng
}

// Mode toggle
function setMode(mode) {
  sendMode.value = mode
  voiceController.setSendMode(mode)
    addLog('config', `发送模式: ${mode}`)
}

// Manual controls
async function manualStart() {
  try {
    await voiceController.start()
    addLog('control', '手动启动')
  } catch (err) {
    addLog('error', err.message)
  }
}

function manualStop() {
  voiceController.stop()
    addLog('control', '手动停止')
}

function simulateWake() {
  voiceController._onWakeWord()
    addLog('control', '模拟唤醒词触发')
}

// Test TTS directly (no microphone needed)
async function testTts() {
  addLog('tts', '测试 TTS: "在呢"')
  currentReply.value = '在呢'
  state.value = 'speaking'
  try {
    const result = await mimoTtsService.speak('在呢')
    if (result?.ok) {
      addLog('tts', 'TTS 播报成功')
    } else {
      addLog('error', `TTS 未播报: ${result?.reason || '未知原因'}`)
    }
  } catch (err) {
    addLog('error', `TTS 失败: ${err.message}`)
  } finally {
    state.value = 'idle'
    currentReply.value = ''
  }
}

// Simulate full conversation flow (no microphone needed)
async function simulateConversation() {
  addLog('simulate', '模拟对话开始')
  currentReply.value = '在呢'
  state.value = 'speaking'

  try {
    // Step 1: TTS "在呢"
    addLog('tts', '播报: "在呢"')
    const r1 = await mimoTtsService.speak('在呢')
    if (r1?.ok) {
      addLog('tts', '"在呢" 播报成功')
    } else {
      addLog('error', `TTS 失败: ${r1?.reason}`)
    }

    // Step 2: Simulate user speaking (1.5s delay)
    state.value = 'listening'
    addLog('state', '→ listening (模拟)')
    transcript.value = ''
    await new Promise(r => setTimeout(r, 1500))

    const mockText = '明天天气怎么样'
    transcript.value = mockText
    addLog('transcript', `[模拟] ${mockText}`)

    // Step 3: Simulate thinking (1s delay)
    await new Promise(r => setTimeout(r, 1000))

    // Step 4: TTS reply
    const reply = `收到：${mockText}`
    currentReply.value = reply
    state.value = 'speaking'
    addLog('send', `发送: "${mockText}"`)
    addLog('tts', `播报: "${reply}"`)
    const r2 = await mimoTtsService.speak(reply)
    if (r2?.ok) {
      addLog('tts', '回复播报成功')
    } else {
      addLog('error', `TTS 失败: ${r2?.reason}`)
    }

  } catch (err) {
    addLog('error', `模拟对话失败: ${err.message}`)
  } finally {
    state.value = 'idle'
    transcript.value = ''
    currentReply.value = ''
    addLog('simulate', '模拟对话结束')
  }
}

// Setup event listeners
function setupListeners() {
  voiceController.on('wakeWord', () => {
    addLog('wake', '唤醒词检测到！')
    currentPrompt.value = ''
    lastAICommand.value = ''
    currentReply.value = '在呢'
  })

  voiceController.on('stateChange', (newState) => {
    state.value = newState
    addLog('state', `→ ${newState}`)
    if (newState === 'idle') {
      currentReply.value = ''
    }
  })

  voiceController.on('transcript', (text) => {
    transcript.value = text
    addLog('transcript', text)
  })

  voiceController.on('interim', (text) => {
    interim.value = text
  })

  voiceController.on('send', (text) => {
    addLog('send', `发送: "${text}"`)
    currentReply.value = `收到：${text}`
    transcript.value = ''
    interim.value = ''
  })

  voiceController.on('prompt', (msgKey) => {
    const locale = voiceController.locale.value
    const keywords = VOICE_LOCALES[locale]
    const msg = keywords?.[msgKey] || msgKey
    currentPrompt.value = msg
    addLog('prompt', msg)
  })

  voiceController.on('aiCommand', (type) => {
    lastAICommand.value = `AI 命令: ${type}`
    addLog('command', `AI ${type}`)
    transcript.value = ''
    interim.value = ''
  })

  voiceController.on('timeout', () => {
    addLog('timeout', '硬超时，已回到空闲状态')
    transcript.value = ''
    interim.value = ''
    currentPrompt.value = ''
  })

  voiceController.on('error', (err) => {
    addLog('error', String(err))
  })
}

// Lifecycle
onMounted(async () => {
  setupListeners()

  // Set initial engine
  const eng = speechService.engine?.value || 'webspeech'
  activeEngine.value = eng
  engineName.value = availableEngines.value.find((e) => e.id === eng)?.name || eng

  // Set initial send mode
  voiceController.setSendMode(sendMode.value)
  voiceController.setLocale(lang.value)

  // Initialize voice controller
  try {
    await voiceController.init()
    addLog('init', '语音控制器已初始化')
  } catch (err) {
    addLog('error', `初始化失败: ${err.message}`)
  }
})

onUnmounted(() => {
  voiceController.destroy()
})
</script>

<style scoped>
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
h1 { margin-bottom: 4px; }
.subtitle { color: #888; margin-bottom: 16px; font-size: 14px; }

.status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 16px;
  padding: 20px;
  background: #1a1a2e;
  border-radius: 12px;
}
.status-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.badges {
  display: flex;
  gap: 6px;
}

/* Avatar Icon */
.avatar {
  position: relative;
  width: 64px;
  height: 64px;
  flex-shrink: 0;
}
.avatar-core {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: #2a2a3e;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: bold;
  color: #666;
  position: relative;
  z-index: 1;
  transition: all 0.3s;
}
.avatar-ring {
  position: absolute;
  top: -4px;
  left: -4px;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 3px solid transparent;
  transition: all 0.3s;
}

/* Idle */
.avatar.idle .avatar-core {
  background: #2a2a3e;
  color: #666;
}

/* Speaking - green pulse */
.avatar.speaking .avatar-core {
  background: #1a3a2a;
  color: #2ecc71;
  box-shadow: 0 0 20px rgba(46, 204, 113, 0.3);
}
.avatar.speaking .avatar-ring {
  border-color: #2ecc71;
  animation: ring-pulse 1s ease-in-out infinite;
}

/* Listening - red recording */
.avatar.recording .avatar-core {
  background: #3a1a1a;
  color: #e74c3c;
  box-shadow: 0 0 20px rgba(231, 76, 60, 0.3);
}
.avatar.recording .avatar-ring {
  border-color: #e74c3c;
  animation: ring-pulse 1.2s ease-in-out infinite;
}

/* Waiting - orange blink */
.avatar.waiting .avatar-core {
  background: #3a2a1a;
  color: #f39c12;
}
.avatar.waiting .avatar-ring {
  border-color: #f39c12;
  animation: ring-blink 1.5s ease-in-out infinite;
}

/* Confirming - blue */
.avatar.confirming .avatar-core {
  background: #1a2a3a;
  color: #3498db;
}
.avatar.confirming .avatar-ring {
  border-color: #3498db;
  animation: ring-blink 1s ease-in-out infinite;
}

/* Sending - green solid */
.avatar.sending .avatar-core {
  background: #1a3a2a;
  color: #27ae60;
}
.avatar.sending .avatar-ring {
  border-color: #27ae60;
}

@keyframes ring-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.15); opacity: 0.5; }
}
@keyframes ring-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.state-text { font-size: 15px; font-weight: 500; }
.mode-badge, .engine-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #16213e;
  color: #888;
}

.wake-status {
  text-align: center;
  margin-bottom: 16px;
  padding: 8px;
  background: #2a2a1a;
  border: 1px solid #f39c12;
  border-radius: 6px;
}
.warn { color: #f39c12; font-size: 13px; }

.engine-selector { margin-bottom: 16px; }
.engine-selector label { display: block; margin-bottom: 8px; font-size: 13px; color: #888; }
.engine-options { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.engine-btn {
  padding: 8px 12px;
  border: 2px solid #333;
  background: #16213e;
  color: #ccc;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 100px;
}
.engine-btn:hover:not(:disabled) { border-color: #555; }
.engine-btn.active { border-color: #3498db; background: #1a4a7a; color: #fff; }
.engine-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.eng-name { font-weight: bold; font-size: 13px; }
.free-badge { background: #27ae60; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 4px; }
.config-badge { background: #e74c3c; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 4px; }

.mode-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 16px;
}
.mode-toggle label { font-size: 13px; color: #888; }
.mode-btn {
  padding: 8px 16px;
  border: 2px solid #333;
  background: #16213e;
  color: #ccc;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}
.mode-btn.active { border-color: #3498db; background: #1a4a7a; color: #fff; }

.lang-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 16px;
}
.lang-row label { font-size: 13px; color: #888; }
select {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #555;
  background: #16213e;
  color: #eee;
  font-size: 13px;
}

.controls {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-bottom: 20px;
}
.ctrl-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
}
.ctrl-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ctrl-btn.start { background: #27ae60; color: #fff; }
.ctrl-btn.stop { background: #e74c3c; color: #fff; }
.ctrl-btn.wake { background: #3498db; color: #fff; }
.ctrl-btn.tts { background: #9b59b6; color: #fff; }
.ctrl-btn.simulate { background: #e67e22; color: #fff; }

.transcript-box {
  background: #1a3a5c;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
.transcript-box .label { font-size: 12px; color: #888; margin-bottom: 4px; }
.transcript-box .text { font-size: 18px; line-height: 1.5; }
.interim { color: #5dade2; font-style: italic; }

.prompt-box {
  background: #2a2a1a;
  border: 1px solid #f39c12;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
.prompt-box .label { font-size: 12px; color: #f39c12; margin-bottom: 4px; }
.prompt-text { color: #f39c12; font-size: 16px; }

.reply-box {
  background: #1a2a1a;
  border: 1px solid #2ecc71;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
.reply-box .label { font-size: 12px; color: #2ecc71; margin-bottom: 4px; }
.reply-text { color: #2ecc71; font-size: 16px; font-weight: 500; }

/* Audio waveform animation */
.waveform {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-top: 8px;
  height: 24px;
}
.waveform span {
  display: inline-block;
  width: 4px;
  background: #2ecc71;
  border-radius: 2px;
  animation: wave 0.8s ease-in-out infinite;
}
.waveform span:nth-child(1) { height: 8px; animation-delay: 0s; }
.waveform span:nth-child(2) { height: 16px; animation-delay: 0.1s; }
.waveform span:nth-child(3) { height: 24px; animation-delay: 0.2s; }
.waveform span:nth-child(4) { height: 16px; animation-delay: 0.3s; }
.waveform span:nth-child(5) { height: 8px; animation-delay: 0.4s; }
@keyframes wave {
  0%, 100% { transform: scaleY(0.4); }
  50% { transform: scaleY(1); }
}

.command-box {
  background: #1a2a1a;
  border: 1px solid #27ae60;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
.command-box .label { font-size: 12px; color: #27ae60; margin-bottom: 4px; }
.command-text { color: #27ae60; font-size: 16px; font-weight: 500; }

.event-log {
  background: #0d1b2a;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
  max-height: 300px;
  overflow-y: auto;
}
.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.log-header .label { font-size: 12px; color: #888; }
.clear-btn {
  padding: 4px 8px;
  background: #16213e;
  border: none;
  color: #888;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}
.log-entries { font-family: monospace; font-size: 12px; }
.log-entry {
  padding: 3px 0;
  border-bottom: 1px solid #1a2a3e;
  display: flex;
  gap: 8px;
}
.log-time { color: #555; min-width: 80px; }
.log-type { color: #888; min-width: 80px; text-transform: uppercase; }
.log-msg { color: #ccc; flex: 1; }
.log-entry.wake .log-type { color: #e74c3c; }
.log-entry.state .log-type { color: #3498db; }
.log-entry.transcript .log-type { color: #5dade2; }
.log-entry.send .log-type { color: #27ae60; }
.log-entry.prompt .log-type { color: #f39c12; }
.log-entry.command .log-type { color: #9b59b6; }
.log-entry.timeout .log-type { color: #e74c3c; }
.log-entry.error .log-type { color: #e74c3c; }
.log-entry.error .log-msg { color: #e74c3c; }
.log-entry.tts .log-type { color: #9b59b6; }
.log-entry.simulate .log-type { color: #e67e22; }

.config-info {
  background: #16213e;
  border-radius: 8px;
  padding: 16px;
}
.config-info h3 { font-size: 14px; margin-bottom: 10px; }
.config-info ol { padding-left: 20px; font-size: 13px; color: #aaa; }
.config-info li { margin-bottom: 6px; }
.config-info a { color: #3498db; }
.config-info code { background: #0d1b2a; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
</style>
