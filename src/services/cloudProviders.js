/**
 * Cloud Speech Recognition Providers
 * 
 * 支持:
 * - iFlytek (讯飞)
 * - Aliyun (阿里云)
 * - Tencent (腾讯云)
 */

import { IFLYTEK_CONFIG, ALIYUN_CONFIG, TENCENT_CONFIG } from '../config.js'

// ============ 通用工具 ============
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

// ============ 讯飞 ASR ============
class iFlytekProvider {
  constructor() {
    this.ws = null
    this._recording = false
    this.onStart = null
    this.onEnd = null
    this.onResult = null
    this.onInterim = null
    this.onError = null
    this.onLoading = null
    this.audioContext = null
    this.mediaRecorder = null
    this.pcmChunks = []
  }

  checkSupport() {
    return !!(window.AudioContext || window.webkitAudioContext)
  }

  start(lang = 'zh-CN') {
    return new Promise((resolve, reject) => {
      if (!IFLYTEK_CONFIG.appid || !IFLYTEK_CONFIG.apiKey) {
        reject(new Error('iFlytek API not configured. Please set appid and apiKey in config.js'))
        return
      }

      this._startWebSocket(lang).then(() => {
        resolve()
      }).catch(err => {
        reject(err)
      })
    })
  }

  async _startWebSocket(lang) {
    const appid = IFLYTEK_CONFIG.appid
    const apiKey = IFLYTEK_CONFIG.apiKey
    
    // 生成讯飞认证参数
    const ts = Math.floor(Date.now() / 1000)
    const signStr = appid + ts
    // 注意：实际需要用 apiSecret 生成正确的签名
    // 这里使用简化版本，实际生产请参考讯飞官方文档
    
    const params = new URLSearchParams({
      appid,
      ts,
      // vad: enabled
      vad: 'enabled',
      // sample rate
      sr: '16000',
      // format
      format: 'audio/L16;rate=16000',
    })
    
    const wsUrl = IFLYTEK_CONFIG.wsUrl + '?' + params.toString()
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl)
        
        this.ws.onopen = () => {
          console.log('iFlytek WebSocket connected')
          this._recording = true
          this.onStart?.()
          
          // 开始录音
          this._startRecording()
          resolve()
        }
        
        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            console.log('iFlytek response:', data)
            
            if (data.code !== 0) {
              this.onError?.(`iFlytek error: ${data.code} - ${data.message}`)
              return
            }
            
            if (data.result && data.result.candidates) {
              const text = data.result.candidates.map(c => c.text).join('')
              if (data.result.status === 2) {
                // 最终结果
                this.onResult?.(text)
              } else {
                // 中间结果
                this.onInterim?.(text)
              }
            }
          } catch (e) {
            console.error('iFlytek parse error:', e)
          }
        }
        
        this.ws.onerror = (err) => {
          console.error('iFlytek WebSocket error:', err)
          reject(new Error('WebSocket connection failed'))
        }
        
        this.ws.onclose = () => {
          console.log('iFlytek WebSocket closed')
          this._recording = false
          this.onEnd?.()
        }
        
      } catch (e) {
        reject(e)
      }
    })
  }

  async _startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      })
      
      this.audioContext = new AudioContext({ sampleRate: 16000 })
      const source = this.audioContext.createMediaStreamSource(stream)
      
      // 创建 ScriptProcessor 用于采集 PCM
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1)
      
      processor.onaudioprocess = (e) => {
        if (!this._recording || !this.ws || this.ws.readyState !== WebSocket.OPEN) return
        
        const inputData = e.inputBuffer.getChannelData(0)
        // 转换为 Int16 PCM
        const pcmData = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]))
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
        }
        
        // 发送音频数据
        const base64 = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)))
        this.ws.send(base64)
      }
      
      source.connect(processor)
      processor.connect(this.audioContext.destination)
      
      this.processor = processor
      this.source = source
      this.stream = stream
      
    } catch (e) {
      console.error('Recording error:', e)
      this.onError?.('Failed to start recording: ' + e.message)
    }
  }

  stop() {
    this._recording = false
    
    if (this.processor) {
      this.processor.disconnect()
      this.processor = null
    }
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop())
    }
    if (this.audioContext) {
      this.audioContext.close()
    }
    
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  isRecording() {
    return this._recording
  }
}

// ============ 阿里云 ASR ============
class AliyunProvider {
  constructor() {
    this.ws = null
    this._recording = false
    this.onStart = null
    this.onEnd = null
    this.onResult = null
    this.onInterim = null
    this.onError = null
    this.onLoading = null
    this.audioContext = null
    this.processor = null
    this.source = null
    this.stream = null
  }

  checkSupport() {
    return !!(window.AudioContext || window.webkitAudioContext)
  }

  start(lang = 'zh-CN') {
    return new Promise((resolve, reject) => {
      if (!ALIYUN_CONFIG.appkey || !ALIYUN_CONFIG.accessKeyId) {
        reject(new Error('Aliyun ASR not configured. Please set appkey and accessKeyId in config.js'))
        return
      }
      
      this._startWebSocket(lang).then(() => {
        resolve()
      }).catch(err => {
        reject(err)
      })
    })
  }

  async _getToken() {
    // 实际生产中需要通过服务端获取 Token，避免暴露 AccessKeySecret
    // 这里简化处理，实际请参考阿里云文档
    const token = 'generated_token_' + Date.now()
    return token
  }

  async _startWebSocket(lang) {
    const token = await this._getToken()
    
    const url = ALIYUN_CONFIG.url + '?appkey=' + ALIYUN_CONFIG.appkey + '&token=' + token
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url)
        
        this.ws.onopen = () => {
          console.log('Aliyun WebSocket connected')
          this._recording = true
          this.onStart?.()
          this._startRecording()
          resolve()
        }
        
        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            console.log('Aliyun response:', data)
            
            if (data.code !== 20000000 && data.code !== undefined) {
              this.onError?.(`Aliyun error: ${data.code}`)
              return
            }
            
            if (data.result) {
              const text = typeof data.result === 'string' 
                ? data.result 
                : (data.result.text || data.result.content || '')
              
              if (data.is_final) {
                this.onResult?.(text)
              } else if (text) {
                this.onInterim?.(text)
              }
            }
          } catch (e) {
            console.error('Aliyun parse error:', e)
          }
        }
        
        this.ws.onerror = (err) => {
          console.error('Aliyun WebSocket error:', err)
          reject(new Error('WebSocket connection failed'))
        }
        
        this.ws.onclose = () => {
          console.log('Aliyun WebSocket closed')
          this._recording = false
          this.onEnd?.()
        }
        
      } catch (e) {
        reject(e)
      }
    })
  }

  async _startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      })
      
      this.audioContext = new AudioContext({ sampleRate: 16000 })
      const source = this.audioContext.createMediaStreamSource(stream)
      
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1)
      
      this.processor.onaudioprocess = (e) => {
        if (!this._recording || !this.ws || this.ws.readyState !== WebSocket.OPEN) return
        
        const inputData = e.inputBuffer.getChannelData(0)
        // 转换为 PCM
        const pcmData = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-32768, Math.min(32767, Math.floor(inputData[i] * 32767)))
        }
        
        // 发送二进制数据
        const buffer = pcmData.buffer
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(buffer)
        }
      }
      
      source.connect(this.processor)
      this.processor.connect(this.audioContext.destination)
      
      this.source = source
      this.stream = stream
      
    } catch (e) {
      console.error('Aliyun recording error:', e)
      this.onError?.('Failed to start recording: ' + e.message)
    }
  }

  stop() {
    this._recording = false
    
    if (this.processor) {
      this.processor.disconnect()
      this.processor = null
    }
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop())
    }
    if (this.audioContext) {
      this.audioContext.close()
    }
    
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  isRecording() {
    return this._recording
  }
}

// ============ 腾讯云 ASR ============
class TencentProvider {
  constructor() {
    this.ws = null
    this._recording = false
    this.onStart = null
    this.onEnd = null
    this.onResult = null
    this.onInterim = null
    this.onError = null
    this.onLoading = null
    this.audioContext = null
    this.processor = null
    this.source = null
    this.stream = null
    this.requestId = ''
  }

  checkSupport() {
    return !!(window.AudioContext || window.webkitAudioContext)
  }

  start(lang = 'zh-CN') {
    return new Promise((resolve, reject) => {
      if (!TENCENT_CONFIG.appid || !TENCENT_CONFIG.secretId) {
        reject(new Error('Tencent ASR not configured. Please set appid and secretId in config.js'))
        return
      }
      
      this.requestId = generateId()
      this._startWebSocket(lang).then(() => {
        resolve()
      }).catch(err => {
        reject(err)
      })
    })
  }

  async _getSignature() {
    // 实际生产中需要在服务端生成签名，避免暴露 SecretKey
    const signature = 'tencent_signature_' + Date.now()
    return signature
  }

  async _startWebSocket(lang) {
    const signature = await this._getSignature()
    const queryParams = new URLSearchParams({
      appid: TENCENT_CONFIG.appid,
      secretid: TENCENT_CONFIG.secretId,
      signature: signature,
      requestid: this.requestId,
    })
    
    const url = TENCENT_CONFIG.url + '?' + queryParams.toString()
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url)
        
        this.ws.onopen = () => {
          console.log('Tencent WebSocket connected')
          this._recording = true
          this.onStart?.()
          this._startRecording()
          resolve()
        }
        
        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            console.log('Tencent response:', data)
            
            if (data.code !== 0 && data.code !== undefined) {
              this.onError?.(`Tencent error: ${data.code} - ${data.message}`)
              return
            }
            
            if (data.result) {
              const text = data.result.text || ''
              if (data.result.status === 2) {
                this.onResult?.(text)
              } else {
                this.onInterim?.(text)
              }
            }
          } catch (e) {
            console.error('Tencent parse error:', e)
          }
        }
        
        this.ws.onerror = (err) => {
          console.error('Tencent WebSocket error:', err)
          reject(new Error('WebSocket connection failed'))
        }
        
        this.ws.onclose = () => {
          console.log('Tencent WebSocket closed')
          this._recording = false
          this.onEnd?.()
        }
        
      } catch (e) {
        reject(e)
      }
    })
  }

  async _startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      })
      
      this.audioContext = new AudioContext({ sampleRate: 16000 })
      const source = this.audioContext.createMediaStreamSource(stream)
      
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1)
      
      this.processor.onaudioprocess = (e) => {
        if (!this._recording || !this.ws || this.ws.readyState !== WebSocket.OPEN) return
        
        const inputData = e.inputBuffer.getChannelData(0)
        // 转换为 PCM
        const pcmData = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-32768, Math.min(32767, Math.floor(inputData[i] * 32767)))
        }
        
        const buffer = pcmData.buffer
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(buffer)
        }
      }
      
      source.connect(this.processor)
      this.processor.connect(this.audioContext.destination)
      
      this.source = source
      this.stream = stream
      
    } catch (e) {
      console.error('Tencent recording error:', e)
      this.onError?.('Failed to start recording: ' + e.message)
    }
  }

  stop() {
    this._recording = false
    
    if (this.processor) {
      this.processor.disconnect()
      this.processor = null
    }
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop())
    }
    if (this.audioContext) {
      this.audioContext.close()
    }
    
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  isRecording() {
    return this._recording
  }
}

// ============ 导出 ============
export { iFlytekProvider, AliyunProvider, TencentProvider }