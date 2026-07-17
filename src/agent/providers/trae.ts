/**
 * Trae CLI Provider
 *
 * 专为字节跳动 Trae CLI（traecli）定制。
 * Trae CLI 的流式输出格式与 Claude Code 类似（NDJSON stream-json），
 * 但 prompt 通过命令行参数传入（而非 stdin）。
 *
 * 调用方式:
 *   traecli -p --output-format stream-json --permission-mode bypass_permissions [prompt]
 *   [--resume <sessionId>] [--model <model>] [--config k=v]
 *
 * 输出格式: NDJSON（每行一个 JSON 对象）
 *   {"type":"system","subtype":"init","session_id":"...","model":"...","tools":[...]}
 *   {"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}}
 *   {"type":"result","subtype":"success","session_id":"...","is_error":false,"num_turns":1,"duration_ms":1234}
 *   {"type":"result","subtype":"error_during_execution","is_error":true,"error":"..."}
 *
 * 流式实现:
 *   使用 AsyncQueue 模式（与 ClaudeProvider 相同），
 *   子进程的 NDJSON 事件解析后实时推入队列。
 */

import { type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { logger } from '../../logger.js'
import { safeSpawn } from '../../utils/spawn.js'
import type { AgentConfig, QueryInput, AgentOutput } from '../types.js'
import type { AgentProvider } from '../provider.js'

/** 超时时间（毫秒）：5 分钟（AI 推理可能较慢） */
const TIMEOUT_MS = 300_000

/**
 * 异步队列 — 桥接事件驱动（readline 'line' 事件）和异步迭代（AsyncIterable）
 */
class AsyncQueue<T> {
  private buffer: T[] = []
  private resolveWait: ((value: IteratorResult<T>) => void) | null = null
  private done = false

  push(item: T): void {
    if (this.done) return
    if (this.resolveWait) {
      const resolve = this.resolveWait
      this.resolveWait = null
      resolve({ value: item, done: false })
    } else {
      this.buffer.push(item)
    }
  }

  close(): void {
    this.done = true
    if (this.resolveWait) {
      const resolve = this.resolveWait
      this.resolveWait = null
      resolve({ value: undefined, done: true })
    }
  }

  next(): Promise<IteratorResult<T>> {
    if (this.buffer.length > 0) {
      return Promise.resolve({ value: this.buffer.shift()!, done: false })
    }
    if (this.done) {
      return Promise.resolve({ value: undefined, done: true })
    }
    return new Promise<IteratorResult<T>>((resolve) => {
      this.resolveWait = resolve
    })
  }
}

export class TraeProvider implements AgentProvider {
  private child: ChildProcess | null = null
  private config: AgentConfig
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null

  constructor(config: AgentConfig) {
    this.config = config
  }

  /**
   * 发送查询到 Trae CLI
   *
   * 使用 `traecli -p --output-format stream-json` 命令，prompt 通过命令行参数传入。
   * 输出为 NDJSON 流，每行一个 JSON 事件，通过 AsyncQueue 实现实时流式推送。
   *
   * 内置超时保护：5 分钟无输出则终止进程。
   */
  async *query(input: QueryInput): AsyncIterable<AgentOutput> {
    const command = this.config.cliPath || this.config.command
    // 基础参数：print 模式 + stream-json 输出 + 跳过权限确认
    const args: string[] = [
      '-p',
      '--output-format', 'stream-json',
      '--permission-mode', 'bypass_permissions',
    ]

    // 会话恢复
    if (input.sessionId) {
      args.push('--resume', input.sessionId)
    }

    // 模型参数
    const model = input.model || this.config.model
    if (model) {
      args.push('--config', `model.name=${model}`)
    }

    // prompt 作为最后一个位置参数传入（Trae CLI 不支持 stdin 输入）
    args.push(input.prompt)

    const cwd = input.cwd

    logger.info('Starting Trae CLI query', { command, args: args.slice(0, -1), cwd, hasSessionId: !!input.sessionId, promptLength: input.prompt.length })

    // 异步队列：子进程事件 → 队列 → query() 的 AsyncIterable
    const queue = new AsyncQueue<AgentOutput>()
    let sessionId = ''
    let fullText = ''
    let errorMessage = ''
    let hasStreamedText = false // 是否已通过流式 delta 收到过文本（避免 assistant 事件重复推送）
    let stderrText = ''

    try {
      this.child = safeSpawn(command, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('Failed to spawn Trae CLI', { command, error: msg })
      yield { type: 'error', message: `Failed to spawn ${command}: ${msg}` }
      yield { type: 'done', fullText: '' }
      return
    }

    // 关闭 stdin（Trae CLI 不从 stdin 读取 prompt）
    this.child.stdin!.end()

    // 解析 stdout 的 NDJSON 流
    const rl = createInterface({ input: this.child.stdout! })
    rl.on('line', (line: string) => {
      if (!line.trim()) return
      let obj: any
      try {
        obj = JSON.parse(line)
      } catch {
        logger.debug('Trae stdout non-JSON line', { line: line.slice(0, 200) })
        return
      }

      // 提取 session_id
      if (obj.session_id && !sessionId) {
        sessionId = obj.session_id
        logger.debug('Trae session ID captured', { sessionId })
      }

      switch (obj.type) {
        case 'system': {
          // 初始化事件，包含 session_id、可用工具等
          if (obj.subtype === 'init') {
            logger.debug('Trae init event', { model: obj.model, toolsCount: obj.tools?.length || 0 })
          }
          break
        }
        case 'stream_event': {
          // 流式事件 — 解析 content_block_delta 中的 text_delta
          const evt = obj.event
          if (evt?.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            const delta: string = evt.delta.text
            if (delta) {
              fullText += delta
              hasStreamedText = true // 标记已收到流式文本
              queue.push({ type: 'text', delta })
            }
          } else if (evt?.type === 'message_delta' && evt.delta?.stop_reason) {
            queue.push({ type: 'turn_end', reason: evt.delta.stop_reason })
          }
          break
        }
        case 'assistant': {
          // 非流式的完整 assistant 消息（仅在没有流式输出时作为 fallback 使用）
          if (hasStreamedText) {
            // 已经通过流式 delta 收到过文本，跳过（避免重复推送）
            break
          }
          const content = obj.message?.content
          if (Array.isArray(content)) {
            const text = content
              .filter((b: any) => b.type === 'text')
              .map((b: any) => b.text ?? '')
              .join('')
            if (text) {
              fullText += text
              queue.push({ type: 'text', delta: text })
            }
          }
          break
        }
        case 'result': {
          // 结果事件 — 检查是否为错误
          if (obj.is_error || (obj.subtype && obj.subtype !== 'success')) {
            errorMessage = obj.error || obj.error_message || `Trae CLI error: ${obj.subtype || 'unknown'}`
            queue.push({ type: 'error', message: errorMessage })
          }
          break
        }
        default: {
          logger.debug('Trae unknown event type', { type: obj.type })
        }
      }
    })

    // 收集 stderr 用于诊断
    this.child.stderr?.setEncoding('utf-8')
    this.child.stderr?.on('data', (chunk: string) => {
      stderrText += chunk
    })

    // 子进程结束
    this.child.on('close', (code: number | null) => {
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle)
        this.timeoutHandle = null
      }

      logger.info('Trae CLI process exited', { code, hasOutput: !!fullText, hasError: !!errorMessage, stderrLength: stderrText.length })

      if (code !== 0 && !fullText && !errorMessage) {
        // 如果没有 stdout 输出但有 stderr，使用 stderr 作为错误信息
        const hint = stderrText.trim().split('\n').filter(l => l.includes('ERROR') || l.includes('error') || l.includes('Error')).slice(-5).join('; ')
        errorMessage = hint || `${command} exited with code ${code}`
        queue.push({ type: 'error', message: errorMessage })
      }

      queue.push({
        type: 'done',
        fullText,
        sessionId: sessionId || undefined,
      })
      queue.close()
    })

    this.child.on('error', (err: Error) => {
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle)
        this.timeoutHandle = null
      }
      logger.error('Trae CLI process error', { error: err.message })
      queue.push({ type: 'error', message: err.message })
      queue.close()
    })

    // 超时保护：5 分钟无输出则终止进程
    this.timeoutHandle = setTimeout(() => {
      if (this.child && !this.child?.killed) {
        logger.warn('Trae query timed out, killing process', { timeoutMs: TIMEOUT_MS, sessionId })
        this.child.kill('SIGTERM')
        queue.push({ type: 'error', message: `Trae 响应超时（${TIMEOUT_MS / 1000}秒），已终止进程。` })
        queue.push({ type: 'done', fullText, sessionId: sessionId || undefined })
        queue.close()
      }
    }, TIMEOUT_MS)

    // 从队列拉取，yield 给消费者 — 真正的实时流式
    while (true) {
      const result = await queue.next()
      if (result.done) break
      yield result.value
    }
  }

  /**
   * 终止当前查询
   */
  abort(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle)
      this.timeoutHandle = null
    }
    if (this.child && !this.child.killed) {
      this.child.kill('SIGTERM')
      logger.info('Trae query aborted')
    }
  }

  /**
   * 获取 Trae CLI 版本信息
   */
  async getInfo(): Promise<{ version?: string; models: string[] }> {
    return new Promise((resolve) => {
      const child = safeSpawn(
        this.config.cliPath || this.config.command,
        ['--version'],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      )
      let output = ''
      child.stdout!.on('data', (chunk: string) => { output += chunk })
      child.on('close', () => {
        resolve({ version: output.trim() || undefined, models: [] })
      })
      child.on('error', () => resolve({ models: [] }))
    })
  }
}
