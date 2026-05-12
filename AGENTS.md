# Voice Input Demo - 项目上下文

## 项目概述

一个基于 Vue 3 + WebAssembly 的语音输入演示项目，实现了完整的语音交互流程：
**唤醒词检测 → 语音识别 → 关键词匹配 → 发送/确认**

当前状态：核心功能已完成，页面已中文化，sherpa-kws 唤醒引擎已可用。

## 技术栈

- **前端框架：** Vue 3 (Composition API, `<script setup>`)
- **构建工具：** Vite 5
- **唤醒词引擎：** Sherpa-ONNX KWS (WebAssembly)
- **语音识别引擎：** Web Speech API / Whisper 本地 / 讯飞 / 阿里云 / 腾讯云（可插拔）
- **语音合成 TTS：** MiMo-V2-TTS（小米 MiMo 平台，OpenAI 兼容 API）
- **运行环境：** 浏览器（Chrome 推荐），需要麦克风

## 目录结构

```
voice-input-demo/
├── public/
│   ├── sherpa-kws/                    # Sherpa-ONNX WASM + 模型文件
│   │   ├── sherpa-onnx-wasm-kws-main.wasm
│   │   ├── sherpa-onnx-wasm-kws-main.js
│   │   ├── sherpa-onnx-wasm-kws-main.data
│   │   ├── sherpa-onnx-kws.js         # KWS JS wrapper (暴露 createKws 全局函数)
│   │   └── sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01/
│   │       ├── encoder-epoch-12-avg-2-chunk-16-left-64.onnx
│   │       ├── decoder-epoch-12-avg-2-chunk-16-left-64.onnx
│   │       ├── joiner-epoch-12-avg-2-chunk-16-left-64.onnx
│   │       ├── tokens.txt
│   │       └── keywords.txt           # 唤醒词定义 (x iǎo f āng x iǎo f āng @小方小方)
│   └── sw.js                          # Service Worker
├── src/
│   ├── App.vue                        # 主页面（已中文化）
│   ├── config.js                      # 全局配置（唤醒词、ASR 引擎、API 密钥）
│   ├── main.js                        # 入口
│   └── services/
│       ├── voiceController.js         # 核心状态机（idle→listening→waiting→confirming→sending）
│       ├── voiceConfig.js             # 状态定义、定时器常量、多语言关键词
│       ├── speechService.js           # ASR 引擎抽象层（可插拔）
│       ├── mimoTtsService.js          # MiMo TTS 语音合成（调用 MiMo API 播报）
│       ├── wakeWordService.js         # 唤醒词服务（引擎工厂）
│       ├── keywordMatcher.js          # 关键词匹配（结束词、确认词、AI 命令）
│       ├── whisperProvider.js         # Whisper 本地 ASR
│       ├── cloudProviders.js          # 讯飞/阿里云/腾讯云 ASR
│       ├── modelCache.js              # 模型缓存策略
│       └── wakeWordEngines/
│           ├── baseEngine.js          # 引擎基类接口
│           ├── index.js               # 引擎工厂（注册表）
│           ├── placeholderEngine.js   # 测试用引擎（空格键/按钮模拟唤醒）
│           └── sherpaKwsEngine.js     # Sherpa-ONNX KWS 引擎（真实唤醒）
├── vite.config.js                     # Vite 配置（含 COOP/COEP 头，WASM 需要）
├── package.json
└── AGENTS.md                          # 本文件
```

## 核心架构

### 状态机流程

```
idle → listening → waiting → confirming → sending → idle
 ↑                                                    |
 └────────────────────────────────────────────────────┘
```

- **idle：** 等待唤醒词
- **speaking：** TTS 语音播报中
- **listening：** 正在录音，实时识别
- **waiting：** 录音暂停，等待确认（确认模式下 3 秒无语音触发）
- **confirming：** 提示用户确认/补充
- **sending：** 文本已发送

### 唤醒词引擎（可插拔）

| 引擎 | 配置值 | 状态 | 说明 |
|------|--------|------|------|
| PlaceholderEngine | `'placeholder'` | ✅ 可用 | 空格键/按钮模拟，测试用 |
| SherpaKwsEngine | `'sherpa-kws'` | ✅ 可用 | 真实唤醒，WASM 运行在浏览器 |
| PorcupineEngine | `'porcupine'` | 🚧 未实现 | 等待 Picovoice 审核 |

切换引擎：修改 `src/config.js` 中 `WAKE_WORD_CONFIG.engine`。

### ASR 引擎（可插拔）

| 引擎 | 配置值 | 免费 | 说明 |
|------|--------|------|------|
| Web Speech API | `'webspeech'` | ✅ | 浏览器自带，国内可能不稳定 |
| Whisper 本地 | `'whisper'` | ✅ | WASM 运行在本地，需要 WebGPU |
| 讯飞 | `'iflytek'` | 每天 500 次 | 需要 API 密钥 |
| 阿里云 | `'aliyun'` | 每月 5000 次 | 需要 API 密钥 |
| 腾讯云 | `'tencent'` | 每月 5000 次 | 需要 API 密钥 |

### 发送模式

- **自动模式 (auto)：** 3 秒静音后自动发送
- **确认模式 (confirm)：** 3 秒静音后进入等待，用户说"说完了"/"发送"触发发送，说"有"/"继续补充"继续录入

### 多语言支持

关键词定义在 `src/services/voiceConfig.js` 的 `VOICE_LOCALES` 中，支持：
- `zh-CN`（中文）
- `en-US`（英文）
- `ja-JP`（日文）
- `ko-KR`（韩文）

## 已完成的功能

- [x] 核心状态机（VoiceController）
- [x] 唤醒词引擎架构（可插拔）
- [x] Sherpa-ONNX KWS 引擎集成（WASM）
- [x] ASR 引擎架构（可插拔）
- [x] Web Speech API 引擎
- [x] Whisper 本地引擎
- [x] 讯飞/阿里云/腾讯云引擎（代码完成，需 API 密钥）
- [x] 多语言关键词匹配（结束词、确认词、AI 命令）
- [x] 自动/确认两种发送模式
- [x] 页面 UI 中文化
- [x] MiMo TTS 语音播报（唤醒回复"在呢"，发送回复"收到：xxx"）
- [x] 小方图标动画（idle/speaking/listening/waiting 状态）
- [x] 事件日志系统
- [x] 空格键模拟唤醒（测试用）
- [x] Vite COOP/COEP 头配置（WASM 需要）

## 待开发 / 已知问题

- [ ] Porcupine 引擎（等待 Picovoice 审核）
- [ ] AI 对话集成（send 事件已 emit，消费者未实现）
- [ ] Service Worker 离线支持
- [ ] 移动端适配

## 关键配置文件

### `src/config.js`

```js
WAKE_WORD_CONFIG = {
  enabled: true,
  engine: 'sherpa-kws',       // 切换唤醒引擎
  wakeWord: '小方小方',
  engineConfig: {
    baseUrl: '/sherpa-kws',
    modelPath: '/sherpa-kws/sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01',
    keywordsScore: 1.0,
    keywordsThreshold: 0.25,  // 唤醒灵敏度，越低越灵敏
  }
}

MIMO_CONFIG = {
  apiKey: import.meta.env.VITE_MIMO_API_KEY,  // .env 文件配置
  baseUrl: 'https://api.xiaomimimo.com/v1',   // 或 token-plan-cn.xiaomimimo.com/v1
  ttsModel: 'mimo-v2-tts',
  voice: 'mimo_default',
  format: 'wav',
}
```

### `vite.config.js`

```js
headers: {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}
```

这两个头是 WASM 使用 SharedArrayBuffer 必需的。

## 事件系统

VoiceController 通过 `on(event, callback)` 暴露事件：

| 事件 | 参数 | 说明 |
|------|------|------|
| `wakeWord` | - | 唤醒词检测到 |
| `stateChange` | `newState` | 状态变化 |
| `transcript` | `text` | 最终识别结果 |
| `interim` | `text` | 临时识别结果 |
| `send` | `text` | 文本已发送（消费者应接入 AI） |
| `prompt` | `messageKey` | 需要语音播报（消费者应接入 TTS） |
| `aiCommand` | `type` | AI 命令（show/hide/clear） |
| `timeout` | - | 硬超时 |
| `error` | `err` | 错误 |

## 测试流程

1. `npm install` → `npm run dev`
2. Chrome 打开 `http://localhost:5173`
3. 页面加载后应显示"语音控制器已初始化"
4. 点"开始监听" → 允许麦克风权限
5. 对麦克风说"小方小方" → 唤醒成功，TTS 播报"在呢"，图标变绿色脉冲
6. 说话 → 识别文本区显示文字
7. 停顿 3 秒 → 根据发送模式自动发送或进入确认
8. 发送后 TTS 播报"收到：xxx"

**无麦克风测试：** 点"测试TTS"或"模拟对话"按钮

## 注意事项

- **浏览器：** 推荐 Chrome，Web Speech API 和 getUserMedia 支持最好
- **HTTPS：** 生产环境需要 HTTPS 才能使用麦克风（localhost 免除）
- **WASM 文件：** `public/sherpa-kws/` 下约 40MB，已随代码提交
- **唤醒词：** 定义在 `public/sherpa-kws/.../keywords.txt`，使用 ppinyin 拼音格式
