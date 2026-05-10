<template>
  <div class="container">
    <h1>Voice Input Demo</h1>
    <p class="subtitle">Multi-Engine Speech Recognition</p>

    <!-- Status -->
    <div class="status">
      <span :class="['dot', statusClass]"></span>
      <span>{{ statusText }}</span>
      <span class="engine-badge" v-if="engineName">{{ engineName }}</span>
    </div>

    <!-- Loading -->
    <div class="loading" v-if="loading">
      <span class="loading-icon">⏳</span>
      {{ loading }}
    </div>

    <!-- Engine Selector -->
    <div class="engine-selector">
      <label>Select Engine:</label>
      <div class="engine-options">
        <button
          v-for="eng in availableEngines"
          :key="eng.id"
          :class="['engine-btn', { active: activeEngine === eng.id, disabled: !eng.configured }]"
          :disabled="!eng.configured"
          @click="selectEngine(eng.id)"
        >
          <span class="eng-name">{{ eng.name }}</span>
          <span class="eng-tag">{{ eng.tag }}</span>
          <span v-if="eng.free" class="free-badge">FREE</span>
          <span v-if="eng.needsConfig && !eng.configured" class="config-badge">NEED CONFIG</span>
        </button>
      </div>
    </div>

    <!-- Language Selector -->
    <div class="lang-row">
      <label>Language:</label>
      <select v-model="lang" :disabled="isRecording">
        <option value="zh-CN">Chinese</option>
        <option value="en-US">English</option>
        <option value="ja-JP">Japanese</option>
        <option value="ko-KR">Korean</option>
      </select>
    </div>

    <!-- Mic Button -->
    <div class="mic-wrap">
      <button
        :class="['mic-btn', { recording: isRecording, supported: isSupported, loading: !!loading }]"
        @click="toggleRecord"
        :disabled="!isSupported || !!loading"
      >
        <span v-if="isRecording" class="mic-icon">⏹</span>
        <span v-else class="mic-icon">🎤</span>
      </button>
      <p class="hint">{{ hintText }}</p>
    </div>

    <!-- Interim Result -->
    <div class="interim-box" v-if="interim">
      <div class="label">Interim:</div>
      <div class="interim">{{ interim }}</div>
    </div>

    <!-- Final Result -->
    <div class="result-box" v-if="transcript">
      <div class="label">Result:</div>
      <div class="text">{{ transcript }}</div>
      <div class="result-actions">
        <button class="action-btn" @click="copyText">Copy</button>
        <button class="action-btn" @click="clearText">Clear</button>
      </div>
    </div>

    <!-- Error -->
    <div class="error" v-if="error">{{ error }}</div>

    <!-- Config Guide -->
    <div class="config-guide">
      <h3>Engine Configuration</h3>
      <div class="config-grid">
        <div class="config-item">
          <strong>Web Speech API</strong>
          <p>No config needed. Uses Google servers.</p>
          <p class="note">⚠️ May be unstable in China</p>
        </div>
        <div class="config-item">
          <strong>Whisper Local</strong>
          <p>No config needed. Runs in browser.</p>
          <p class="note">⚠️ Requires WebGPU support</p>
        </div>
        <div class="config-item">
          <strong>iFlytek</strong>
          <p>Register at xfyun.cn, fill appid/apiKey/apiSecret in config.js</p>
        </div>
        <div class="config-item">
          <strong>Aliyun ASR</strong>
          <p>Register at aliyun.com, fill appkey/accessKeyId/accessKeySecret in config.js</p>
        </div>
        <div class="config-item">
          <strong>Tencent ASR</strong>
          <p>Register at cloud.tencent.com, fill appid/secretId/secretKey in config.js</p>
        </div>
      </div>
    </div>

    <!-- Tech Info -->
    <div class="tech-info">
      <h3>Engine Comparison</h3>
      <table class="compare-table">
        <thead>
          <tr>
            <th>Engine</th>
            <th>Latency</th>
            <th>Accuracy</th>
            <th>Cost</th>
            <th>Network</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Web Speech API</td>
            <td>0.5-1.5s</td>
            <td>85-93%</td>
            <td>Free</td>
            <td>Required</td>
          </tr>
          <tr>
            <td>Whisper tiny</td>
            <td>2-4s (GPU)</td>
            <td>85-88%</td>
            <td>Free</td>
            <td>Not needed</td>
          </tr>
          <tr>
            <td>Whisper base</td>
            <td>4-8s (GPU)</td>
            <td>91-94%</td>
            <td>Free</td>
            <td>Not needed</td>
          </tr>
          <tr>
            <td>iFlytek / Aliyun / Tencent</td>
            <td>0.3-1s</td>
            <td>95-98%</td>
            <td>¥0.5/1K</td>
            <td>Required</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { speechService, ENGINES } from './services/speechService.js'

// Engines
const availableEngines = computed(() => speechService.getAvailableEngines())

// State
const activeEngine = ref('webspeech')
const isSupported = ref(true)
const isRecording = ref(false)
const transcript = ref('')
const interim = ref('')
const error = ref('')
const loading = ref('')
const lang = ref('zh-CN')
const engineName = ref('Web Speech API')

const statusClass = computed(() => {
  if (loading.value) return 'loading'
  if (error.value) return 'error'
  if (isRecording.value) return 'recording'
  return 'idle'
})

const statusText = computed(() => {
  if (loading.value) return 'Loading...'
  if (error.value) return 'Error'
  if (isRecording.value) return 'Recording...'
  return 'Ready'
})

const hintText = computed(() => {
  if (loading.value) return 'Please wait...'
  if (!isSupported.value) return 'Not supported'
  if (isRecording.value) return 'Listening... Click to stop'
  return 'Click mic to start'
})

function selectEngine(eng) {
  if (isRecording.value) return
  activeEngine.value = eng
  engineName.value = availableEngines.value.find(e => e.id === eng)?.name || eng
}

async function toggleRecord() {
  if (isRecording.value) {
    speechService.stop()
    isRecording.value = false
  } else {
    transcript.value = ''
    interim.value = ''
    error.value = ''

    try {
      await speechService.start(activeEngine.value, lang.value)
      isRecording.value = true
    } catch (e) {
      error.value = e.message
    }
  }
}

function copyText() {
  navigator.clipboard.writeText(transcript.value)
}

function clearText() {
  transcript.value = ''
}

// Watch service state
watch(() => speechService.status.value, (newStatus) => {
  if (newStatus === 'recording') {
    isRecording.value = true
  } else {
    isRecording.value = false
  }
})

watch(() => speechService.transcript.value, (val) => {
  transcript.value = val
})

watch(() => speechService.interim.value, (val) => {
  interim.value = val
})

watch(() => speechService.error.value, (val) => {
  error.value = val
})

watch(() => speechService.loading.value, (val) => {
  loading.value = val
})

watch(() => speechService.engine.value, (val) => {
  engineName.value = availableEngines.value.find(e => e.id === val)?.name || val
})

onMounted(() => {
  isSupported.value = speechService.isSupported()
  if (!isSupported.value) {
    error.value = 'Audio not supported. Use Chrome/Edge.'
  }
})
</script>

<style scoped>
.container { max-width: 800px; margin: 0 auto; padding: 20px; }
h1 { margin-bottom: 4px; }
.subtitle { color: #888; margin-bottom: 16px; }

.status { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 16px; }
.dot { width: 12px; height: 12px; border-radius: 50%; background: #666; }
.dot.recording { background: #e74c3c; animation: pulse 1s infinite; }
.dot.error { background: #e74c3c; }
.dot.idle { background: #27ae60; }
.dot.loading { background: #f39c12; animation: blink 1s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.5} }
.engine-badge { font-size: 12px; padding: 2px 8px; background: #16213e; border-radius: 4px; color: #888; }

.loading { background: #2a2a1a; border: 1px solid #f39c12; border-radius: 8px; padding: 12px; margin: 16px 0; color: #f39c12; font-size: 14px; }
.loading-icon { margin-right: 8px; }

.engine-selector { margin-bottom: 20px; }
.engine-selector label { display: block; margin-bottom: 10px; font-size: 14px; color: #888; }
.engine-options { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.engine-btn { padding: 12px 16px; border: 2px solid #333; background: #16213e; color: #ccc; border-radius: 10px; cursor: pointer; font-size: 13px; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 140px; }
.engine-btn:hover:not(:disabled) { border-color: #555; }
.engine-btn.active { border-color: #3498db; background: #1a4a7a; color: #fff; }
.engine-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.eng-name { font-weight: bold; font-size: 14px; }
.eng-tag { font-size: 11px; color: #888; }
.free-badge { background: #27ae60; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-top: 4px; }
.config-badge { background: #e74c3c; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-top: 4px; }

.lang-row { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 20px; }
select { padding: 6px 12px; border-radius: 6px; border: 1px solid #555; background: #16213e; color: #eee; font-size: 14px; }

.mic-wrap { margin: 20px 0; }
.mic-btn { width: 100px; height: 100px; border-radius: 50%; border: 4px solid #333; background: #0f3460; color: #fff; font-size: 40px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; }
.mic-btn.supported { border-color: #27ae60; }
.mic-btn.supported:hover:not(:disabled) { background: #1652a5; transform: scale(1.05); }
.mic-btn.recording { border-color: #e74c3c; background: #c0392b; animation: pulse 1s infinite; }
.mic-btn.loading { border-color: #f39c12; background: #7d6608; }
.mic-btn:disabled { opacity: 0.5; cursor: not-allowed; }
@keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
.hint { margin-top: 8px; font-size: 14px; color: #888; }

.interim-box { background: #1a3a5c; border-radius: 8px; padding: 12px; margin: 12px 0; }
.interim-box .label { font-size: 12px; color: #888; margin-bottom: 4px; }
.interim { color: #5dade2; font-style: italic; }

.result-box { background: #16213e; border-radius: 12px; padding: 16px; margin: 16px 0; text-align: left; }
.result-box .label { font-size: 12px; color: #888; margin-bottom: 8px; }
.result-box .text { font-size: 20px; line-height: 1.6; margin-bottom: 12px; word-break: break-all; }
.result-actions { display: flex; gap: 8px; }
.action-btn { padding: 6px 14px; background: #0f3460; border: none; color: #ccc; border-radius: 6px; cursor: pointer; font-size: 13px; }
.action-btn:hover { background: #1652a5; }

.error { background: #2a1a1a; border: 1px solid #e74c3c; border-radius: 8px; padding: 12px; margin: 16px 0; color: #e74c3c; font-size: 14px; text-align: left; }

.config-guide { margin-top: 30px; padding: 16px; background: #16213e; border-radius: 12px; text-align: left; }
.config-guide h3 { font-size: 16px; margin-bottom: 12px; }
.config-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.config-item { background: #0d1b2a; border-radius: 8px; padding: 12px; font-size: 12px; }
.config-item strong { color: #3498db; margin-bottom: 6px; display: block; }
.config-item p { color: #aaa; margin: 4px 0; }
.config-item .note { color: #f39c12; font-size: 11px; }

.tech-info { margin-top: 20px; padding: 16px; background: #16213e; border-radius: 12px; text-align: left; }
.tech-info h3 { font-size: 16px; margin-bottom: 12px; }
.compare-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.compare-table th, .compare-table td { padding: 10px; text-align: left; border-bottom: 1px solid #333; }
.compare-table th { color: #888; font-weight: normal; }
.compare-table td { color: #ccc; }
</style>