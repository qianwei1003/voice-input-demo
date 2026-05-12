/**
 * 语音识别服务配置
 *
 * 使用方式：
 * 1. Web Speech API - 无需配置，直接可用（国外推荐）
 * 2. Whisper 本地 - 无需配置，首次下载模型（免费、本地）
 * 3. iFlytek 讯飞 - 需要 appid/apiKey/apiSecret
 * 4. 阿里云 ASR - 需要 appkey/apiKey/apiSecret
 * 5. 腾讯云 ASR - 需要 appid/secretId/secretKey
 *
 * 配置路径：打开此文件，填入对应值即可
 */

// ============ 唤醒词配置 ============
// 可插拔引擎架构，改 engine 值即可切换方案
export const WAKE_WORD_CONFIG = {
  enabled: true,  // 设为 true 启用

  // 引擎选择（改这里就行）
  // 'placeholder'  - 用按钮/空格键模拟唤醒（测试用）
  // 'sherpa-kws'   - Sherpa-ONNX KWS WASM（需要构建WASM文件+模型）
  // 'porcupine'    - Porcupine（需要AccessKey，等待审核）
  engine: 'sherpa-kws',

  wakeWord: '小方小方',

  // 引擎特定配置（根据上面选的 engine 填对应的）
  engineConfig: {
    // --- sherpa-kws 配置 ---
    baseUrl: '/sherpa-kws',
    // 模型文件从 Web 服务器加载
    modelPath: '/sherpa-kws/sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01',
    keywordsScore: 1.0,
    keywordsThreshold: 0.25,

    // --- porcupine 配置（待审核通过后启用）---
    // accessKey: 'YOUR_ACCESS_KEY',
    // keywordPath: '/porcupine/xiaofang.ppn',
    // modelPath: '/porcupine/porcupine_params_zh.pv',
  },
}

// ============ 默认引擎 ============
export const DEFAULT_ENGINE = 'webspeech'  // 可选: webspeech | whisper | iflytek | aliyun | tencent

// ============ Web Speech API ============
export const WEBSPEECH_CONFIG = {
  // 无需配置，浏览器自带
  // 国内使用 Google 服务器可能不稳定
  supported: true,
}

// ============ Whisper 本地 ============
export const WHISPER_CONFIG = {
  // 模型选择: 'tiny' (更快, ~75MB) | 'base' (更准, ~142MB)
  model: 'tiny',
  
  // 设备选择: 'webgpu' (快) | 'wasm' (慢但通用)
  device: 'webgpu',
  
  // 缓存策略:
  // - 'session': 默认，模型保持在内存，刷新后需重新加载（开发模式）
  // - 'indexeddb': 模型持久化到 IndexedDB，首次下载后秒开（推荐开发用）
  // - 'none': 不缓存，每次都重新下载
  cacheStrategy: 'indexeddb',
}

// ============ iFlytek 讯飞 ============
// 注册地址: https://ai.xfyun.cn
// 免费额度: 每天 500 次
export const IFLYTEK_CONFIG = {
  enabled: false,  // 设为 true 启用
  appid: '',
  apiKey: '',
  apiSecret: '',
  // 服务地址
  wsUrl: 'wss://rtasr.xfyun.cn/v2/ws',
}

// ============ 阿里云 ASR ============
// 注册地址: https://help.aliyun.com/document_detail/xxxxx.html
// 免费额度: 每月 5000 次
export const ALIYUN_CONFIG = {
  enabled: false,  // 设为 true 启用
  appkey: '',      // 你的 appkey
  accessKeyId: '',
  accessKeySecret: '',
  // 服务地址
  url: 'https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/asr',
}

// ============ 腾讯云 ASR ============
// 注册地址: https://cloud.tencent.com/product/asr
// 免费额度: 每月 5000 次
export const TENCENT_CONFIG = {
  enabled: false,  // 设为 true 启用
  appid: '',       // 你的 appid
  secretId: '',
  secretKey: '',
  // 服务地址
  url: 'wss://asr.tencentcloudapi.com/asr/v2',
}

// ============ 引擎列表定义 ============
export const ENGINES = {
  webspeech: {
    id: 'webspeech',
    name: 'Web Speech API',
    tag: '免费 · 浏览器自带 · Google 服务器',
    free: true,
    needsConfig: false,
    description: '无需配置，但国内可能不稳定',
  },
  whisper: {
    id: 'whisper',
    name: 'Whisper 本地',
    tag: '免费 · 无需网络 · 模型运行在本地',
    free: true,
    needsConfig: false,
    description: '完全本地运行，需要显卡支持 WebGPU',
  },
  iflytek: {
    id: 'iflytek',
    name: '讯飞',
    tag: '国内服务器 · 需要配置 API',
    free: false,
    needsConfig: true,
    description: '国内延迟低，准确率高',
  },
  aliyun: {
    id: 'aliyun',
    name: '阿里云 ASR',
    tag: '全球节点 · 高准确率 · 企业级',
    free: false,
    needsConfig: true,
    description: '准确率 96%+，有全球节点',
  },
  tencent: {
    id: 'tencent',
    name: '腾讯云 ASR',
    tag: '国内服务器 · 微信生态',
    free: false,
    needsConfig: true,
    description: '和微信生态集成方便',
  },
}

// ============ 引擎启用检测 ============
export function isEngineAvailable(engineId) {
  switch (engineId) {
    case 'webspeech':
      return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
    
    case 'whisper':
      // Whisper 需要 WebGPU 或 AudioContext 支持
      return !!(window.AudioContext || window.webkitAudioContext)
    
    case 'iflytek':
      return IFLYTEK_CONFIG.enabled && 
             IFLYTEK_CONFIG.appid && 
             IFLYTEK_CONFIG.apiKey
    
    case 'aliyun':
      return ALIYUN_CONFIG.enabled && 
             ALIYUN_CONFIG.appkey && 
             ALIYUN_CONFIG.accessKeyId
    
    case 'tencent':
      return TENCENT_CONFIG.enabled && 
             TENCENT_CONFIG.appid && 
             TENCENT_CONFIG.secretId
    
    default:
      return false
  }
}

// ============ 获取可用的引擎列表 ============
export function getAvailableEngines() {
  return Object.values(ENGINES).filter(eng => isEngineAvailable(eng.id))
}