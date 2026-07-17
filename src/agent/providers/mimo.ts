/**
 * MiMo Code Provider
 *
 * 专为小米 MiMo Code CLI 定制。
 * MiMo Code 基于 Claude Code 架构，但 NDJSON 输出格式不同。
 *
 * 调用方式:
 *   mimo run --format json --dangerously-skip-permissions [--session <sessionId>] [--model <model>]
 *   prompt 通过 stdin 传入
 *
 * 输出格式: NDJSON（每行一个 JSON 对象）
 *   {"type":"step_start","sessionID":"ses_...","part":{"type":"step-start"}}
 *   {"type":"text","sessionID":"ses_...","part":{"type":"text","text":"回复内容"}}
 *   {"type":"step_finish","sessionID":"ses_...","part":{"reason":"stop"}}
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

export class MimoProvider implements AgentProvider {
  private child: ChildProcess | null = null
  private config: AgentConfig
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null

  constructor(config: AgentConfig) {
    this.config = config
  }

  /**
   * 发送查询到 MiMo Code CLI
   *
   * 使用 `mimo run --format json` 命令，prompt 通过 stdin 传入。
   * 输出为 NDJSON 流，每行一个 JSON 事件，通过 AsyncQueue 实现实时流式推送。
   *
   * 内置超时保护：5 分钟无输出则终止进程。
   */
  async *query(input: QueryInput): AsyncIterable<AgentOutput> {
    const command = this.config.cliPath || this.config.command
    const args: string[] = ['run', '--format', 'json', '--dangerously-skip-permissions']

    // 会话恢复
    if (input.sessionId) {
      args.push('--session', input.sessionId)
    }

    // 模型参数
    const model = input.model || this.config.model
    if (model) {
      args.push('--model', model)
    }

    const cwd = input.cwd

    logger.info('Starting MiMo CLI query', { command, args, cwd, hasSessionId: !!input.sessionId })

    // 异步队列：子进程事件 → 队列 → query() 的 AsyncIterable
    const queue = new AsyncQueue<AgentOutput>()
    let sessionId = ''
    let fullText = ''
    let errorMessage = ''
    let stderrText = ''

    try {
      this.child = safeSpawn(command, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('Failed to spawn MiMo CLI', { command, error: msg })
      yield { type: 'error', message: `Failed to spawn ${command}: ${msg}` }
      yield { type: 'done', fullText: '' }
      return
    }

    // 写入 prompt 到 stdin 并关闭
    this.child.stdin!.write(input.prompt)
    this.child.stdin!.end()
    logger.debug('Prompt written to MiMo stdin', { promptLength: input.prompt.length })

    // 解析 stdout 的 NDJSON 流
    const rl = createInterface({ input: this.child.stdout! })
    rl.on('line', (line: string) => {
      if (!line.trim()) return
      let obj: any
      try {
        obj = JSON.parse(line)
      } catch {
        logger.debug('MiMo stdout non-JSON line', { line: line.slice(0, 200) })
        return
      }

      // 提取 sessionID（所有事件都携带）
      if (obj.sessionID && !sessionId) {
        sessionId = obj.sessionID
        logger.debug('MiMo session ID captured', { sessionId })
      }

      switch (obj.type) {
        case 'step_start': {
          // 步骤开始，无需处理
          break
        }
        case 'text': {
          // 文本输出 — 提取 part.text 字段
          const text = obj.part?.text
          if (text) {
            fullText += text
            queue.push({ type: 'text', delta: text })
          }
          break
        }
        case 'step_finish': {
          // 步骤结束 — 检查是否异常
          const reason = obj.part?.reason
          if (reason && reason !== 'stop') {
            logger.warn('MiMo step finished with non-stop reason', { reason })
          }
          break
        }
        case 'error': {
          // 错误事件
          const errMsg = obj.error?.message || obj.error?.name || obj.message || 'Unknown MiMo error'
          errorMessage = errMsg
          queue.push({ type: 'error', message: errMsg })
          break
        }
        default: {
          logger.debug('MiMo unknown event type', { type: obj.type })
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

      logger.info('MiMo CLI process exited', { code, hasOutput: !!fullText, hasError: !!errorMessage, stderrLength: stderrText.length })

      if (code !== 0 && !fullText && !errorMessage) {
        // 如果没有 stdout 输出但有 stderr，使用 stderr 作为错误信息
        const hint = stderrText.trim().split('\n').filter(l => l.startsWith('[') || l.includes('ERROR') || l.includes('error')).slice(-5).join('; ')
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
      logger.error('MiMo CLI process error', { error: err.message })
      queue.push({ type: 'error', message: err.message })
      queue.close()
    })

    // 超时保护：5 分钟无输出则终止进程
    this.timeoutHandle = setTimeout(() => {
      if (this.child && !this.child?.killed) {
        logger.warn('MiMo query timed out, killing process', { timeoutMs: TIMEOUT_MS, sessionId })
        this.child.kill('SIGTERM')
        queue.push({ type: 'error', message: `MiMo 响应超时（${TIMEOUT_MS / 1000}秒），已终止进程。` })
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
      logger.info('MiMo query aborted')
    }
  }

  /**
   * 获取 MiMo Code 版本信息
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
