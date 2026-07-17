/**
 * OpenCode Provider
 *
 * 专为 OpenCode CLI 定制。
 *
 * 调用方式:
 *   opencode run [message..] --format json [--model <model>] [--session <sessionId>]
 *
 * OpenCode 1.17.x NDJSON 输出格式（每行一个 JSON 对象）:
 *   {"type":"step_start","timestamp":...,"sessionID":"ses_...","part":{"type":"step-start",...}}
 *   {"type":"text","timestamp":...,"sessionID":"ses_...","part":{"type":"text","text":"回复文本","time":{...}}}
 *   {"type":"tool_use","timestamp":...,"sessionID":"ses_...","part":{"type":"tool","tool":"write","state":{"status":"completed","input":{...},"output":"..."},...}}
 *   {"type":"step_finish","timestamp":...,"sessionID":"ses_...","part":{"type":"step-finish","reason":"stop|tool-calls","tokens":{...}}}
 *   {"type":"error","timestamp":...,"sessionID":"ses_...","error":{"name":"...","data":{"message":"..."}}}
 *
 * 兼容旧版 message/finish 格式（已废弃但保留解析能力）。
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

export class OpenCodeProvider implements AgentProvider {
  private child: ChildProcess | null = null
  private config: AgentConfig

  constructor(config: AgentConfig) {
    this.config = config
  }

  /**
   * 发送查询到 OpenCode CLI
   * 使用 `opencode run` 命令，prompt 作为位置参数传递
   * 通过 --format json 获取 NDJSON 流式输出
   */
  async *query(input: QueryInput): AsyncIterable<AgentOutput> {
    const command = this.config.cliPath || this.config.command
    const args: string[] = ['run']

    // 模型参数
    const model = input.model || this.config.model
    if (model) {
      args.push('--model', model)
    }

    // 会话恢复
    if (input.sessionId) {
      args.push('--session', input.sessionId)
    }

    // JSON 流式输出
    args.push('--format', 'json')

    // prompt 作为位置参数
    args.push(input.prompt)

    // 工作目录
    const cwd = input.cwd || undefined

    logger.info('Starting OpenCode query', { command, args: args.filter(a => a !== input.prompt), cwd })

    const queue = new AsyncQueue<AgentOutput>()
    let sessionId = ''
    let fullText = ''
    let errorMessage = ''

    try {
      this.child = safeSpawn(command, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      })
      // 立即关闭 stdin 发送 EOF 信号
      // OpenCode 的 run 命令通过位置参数接收 prompt，不依赖 stdin
      // 但如果 stdin 是未关闭的管道，OpenCode 会等待 stdin 输入导致无限阻塞
      this.child.stdin?.end()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      yield { type: 'error', message: `Failed to spawn ${command}: ${msg}` }
      yield { type: 'done', fullText: '' }
      return
    }

    // 解析 stdout 的 NDJSON 流
    const rl = createInterface({ input: this.child.stdout! })
    rl.on('line', (line: string) => {
      if (!line.trim()) return
      let obj: any
      try { obj = JSON.parse(line) } catch { return }

      // 提取 sessionID
      if (obj.sessionID && !sessionId) {
        sessionId = obj.sessionID
      }

      switch (obj.type) {
        // ── OpenCode 1.17.x 新格式 ──────────────────────────────
        case 'text': {
          // 文本输出，实际内容在 part.text 中
          const text = obj.part?.text
          if (text) {
            fullText += text
            queue.push({ type: 'text', delta: text })
          }
          break
        }
        case 'tool_use': {
          // 工具调用事件，可记录日志但不输出到用户界面
          const toolName = obj.part?.tool || 'unknown'
          const toolStatus = obj.part?.state?.status || ''
          logger.debug('OpenCode tool call', { tool: toolName, status: toolStatus })
          break
        }
        case 'step_start': {
          // 步骤开始，无需处理
          break
        }
        case 'step_finish': {
          // 步骤结束，reason 可能是 "stop" 或 "tool-calls"
          break
        }
        // ── 兼容旧版格式（已废弃但保留解析能力）──────────────────
        case 'message': {
          // 旧版 assistant 消息，文本在 message.content[].text
          const content = obj.message?.content
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                fullText += block.text
                queue.push({ type: 'text', delta: block.text })
              }
            }
          }
          break
        }
        case 'finish': {
          // 旧版会话结束标记
          break
        }
        case 'error': {
          const errMsg = obj.error?.data?.message || obj.error?.name || 'Unknown error'
          errorMessage = errMsg
          queue.push({ type: 'error', message: errMsg })
          break
        }
      }
    })

    // 收集 stderr 用于诊断
    let stderrText = ''
    this.child.stderr?.setEncoding('utf-8')
    this.child.stderr?.on('data', (chunk: string) => {
      stderrText += chunk
    })

    // 子进程结束
    this.child.on('close', (code: number | null) => {
      clearTimeout(timeoutHandle)
      if (code !== 0 && !fullText && !errorMessage) {
        // 如果没有 stdout 输出但有 stderr，使用 stderr 作为错误信息
        const hint = stderrText.trim().split('\n').filter(l => l.startsWith('[') || l.includes('ERROR')).slice(-3).join('; ')
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
      clearTimeout(timeoutHandle)
      queue.push({ type: 'error', message: err.message })
      queue.close()
    })

    // 超时保护：3 分钟无输出则终止进程
    const TIMEOUT_MS = 180_000
    const timeoutHandle = setTimeout(() => {
      if (!this.child?.killed) {
        logger.warn('OpenCode query timed out, killing process', { timeoutMs: TIMEOUT_MS })
        this.child?.kill('SIGTERM')
        queue.push({ type: 'error', message: 'OpenCode 响应超时（3分钟无输出），已终止进程。这可能是 OpenCode 内部错误导致。' })
        queue.push({ type: 'done', fullText, sessionId: sessionId || undefined })
        queue.close()
      }
    }, TIMEOUT_MS)

    // 从队列拉取，yield 给消费者
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
    if (this.child && !this.child.killed) {
      this.child.kill('SIGTERM')
      logger.info('OpenCode query aborted')
    }
  }

  /**
   * 获取 OpenCode 版本信息
   */
  async getInfo(): Promise<{ version?: string; models: string[] }> {
    return new Promise((resolve) => {
      this.child = safeSpawn(
        this.config.cliPath || this.config.command,
        ['--version'],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      )
      let output = ''
      this.child.stdout!.on('data', (chunk: string) => { output += chunk })
      this.child.on('close', () => {
        resolve({
          version: output.trim() || undefined,
          models: [],
        })
      })
      this.child.on('error', () => resolve({ models: [] }))
    })
  }
}
