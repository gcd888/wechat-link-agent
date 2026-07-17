/**
 * CodeBuddy Provider
 *
 * 第一梯队 Provider，专为 CodeBuddy CLI 定制。
 * CodeBuddy 是腾讯出品的 AI 编程助手 CLI 工具。
 *
 * 调用方式:
 *   codebuddy --print --output-format stream-json --include-partial-messages
 *   [--resume <sessionId>] [--model <model>] < prompt
 *
 * 输出格式（--output-format）:
 *   text         — 纯文本（默认），整块返回，无流式效果
 *   json         — 完整 JSON 数组，含 reasoning/usage 等元信息
 *   stream-json  — NDJSON 流，每行一个 JSON 事件，支持实时流式输出
 *                  （配合 --include-partial-messages 可获取逐 token 文本 delta）
 *
 * 当前实现使用 stream-json + include-partial-messages 实现真正的实时流式输出。
 *
 * 重要：内置超时保护（3 分钟），防止 CLI 进入交互式 TUI 模式导致进程挂起。
 */
import { type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { logger } from '../../logger.js'
import { safeSpawn } from '../../utils/spawn.js'
import type { AgentConfig, QueryInput, AgentOutput } from '../types.js'
import type { AgentProvider } from '../provider.js'

/** 超时时间（毫秒）：3 分钟 */
const TIMEOUT_MS = 180_000

/** NDJSON 流解析器状态 */
interface StreamParserState {
  sessionId: string
  textParts: string[]
  errorMessage?: string
  hasStreamedText: boolean
}

/**
 * 异步队列 — 用于桥接事件驱动（readline 'line' 事件）和异步迭代（AsyncIterable）
 * push() 写入，next() 读取（无数据时阻塞等待）
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

  get isClosed(): boolean {
    return this.done
  }
}

export class CodeBuddyProvider implements AgentProvider {
  private child: ChildProcess | null = null
  private config: AgentConfig
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null

  constructor(config: AgentConfig) {
    this.config = config
  }

  /**
   * 发送查询到 CodeBuddy CLI，返回流式输出
   *
   * 使用 --output-format stream-json --include-partial-messages 实现真正的实时流式输出。
   * 通过 AsyncQueue 桥接事件驱动（readline 'line' 事件）和异步迭代（AsyncIterable）。
   *
   * CodeBuddy 支持的输出格式:
   *   text         — 纯文本（默认），整块返回，无流式效果
   *   json         — 完整 JSON 数组，含 reasoning/usage 等元信息
   *   stream-json  — NDJSON 流，每行一个 JSON 事件，支持实时流式输出
   *                  （配合 --include-partial-messages 可获取逐 token 文本 delta）
   *
   * 内置超时保护：如果进程在 TIMEOUT_MS 内未退出，
   * 自动 kill 进程并返回超时错误（防止交互式 TUI 模式导致永久挂起）
   */
  async *query(input: QueryInput): AsyncIterable<AgentOutput> {
    const command = this.config.cliPath || this.config.command
    const args: string[] = [
      '--print',
      '--output-format', 'stream-json',
      '--include-partial-messages',
      // 跳过权限检查，允许非交互模式下自动执行文件写入和 Bash 命令
      // 等同于 Claude Code 的 --dangerously-skip-permissions
      '--dangerously-skip-permissions',
    ]
    if (input.sessionId) args.push('--resume', input.sessionId)
    if (input.model) args.push('--model', input.model)

    const parserState: StreamParserState = {
      sessionId: '',
      textParts: [],
      hasStreamedText: false,
    }

    const queue = new AsyncQueue<AgentOutput>()

    logger.info('Starting CodeBuddy query', { command, args, cwd: input.cwd })

    try {
      this.child = safeSpawn(command, args, {
        cwd: input.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      yield { type: 'error', message: `Failed to spawn ${command}: ${msg}` }
      yield { type: 'done', fullText: '' }
      return
    }

    let stderrText = ''
    let timedOut = false

    this.child.stderr!.setEncoding('utf-8')
    this.child.stderr!.on('data', (chunk: string) => {
      stderrText += chunk
    })

    this.child.stdin!.write(input.prompt)
    this.child.stdin!.end()

    this.timeoutHandle = setTimeout(() => {
      if (this.child && !this.child.killed) {
        timedOut = true
        logger.warn('CodeBuddy query timed out, killing process', {
          command,
          timeoutMs: TIMEOUT_MS,
          hasStderr: !!stderrText,
        })
        this.child.kill('SIGTERM')
      }
    }, TIMEOUT_MS)

    const rl = createInterface({ input: this.child.stdout! })
    rl.on('line', (line: string) => {
      if (!line.trim()) return
      let obj: any
      try { obj = JSON.parse(line) } catch { return }

      switch (obj.type) {
        case 'system': {
          if (obj.subtype === 'init' && obj.session_id) {
            parserState.sessionId = obj.session_id
          }
          break
        }
        case 'stream_event': {
          const evt = obj.event
          if (evt?.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            const delta: string = evt.delta.text
            if (delta) {
              parserState.textParts.push(delta)
              parserState.hasStreamedText = true
              queue.push({ type: 'text', delta })
            }
          } else if (evt?.type === 'message_delta' && evt.delta?.stop_reason) {
            queue.push({ type: 'turn_end', reason: evt.delta.stop_reason })
          }
          break
        }
        case 'assistant': {
          if (parserState.hasStreamedText) break
          const content = obj.message?.content
          if (Array.isArray(content)) {
            const text = content
              .filter((b: any) => b.type === 'text')
              .map((b: any) => b.text ?? '')
              .join('')
            if (text) {
              parserState.textParts.push(text)
              queue.push({ type: 'text', delta: text })
            }
          }
          break
        }
        case 'result': {
          if (obj.subtype === 'error' || (obj.errors && obj.errors.length > 0)) {
            const errors = obj.errors ?? [obj.error_message ?? 'Unknown error']
            parserState.errorMessage = Array.isArray(errors) ? errors.join('; ') : String(errors)
          }
          break
        }
      }
    })

    this.child.on('close', (code: number | null) => {
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle)
        this.timeoutHandle = null
      }

      const fullText = parserState.textParts.join('').trim()

      if (timedOut) {
        queue.push({
          type: 'error',
          message: `${command} 响应超时（${TIMEOUT_MS / 1000}秒未退出），已终止进程。该 CLI 可能不支持 stdin 非交互模式，请检查 Agent 参数配置。`,
        })
      } else if (!fullText && stderrText.trim()) {
        queue.push({ type: 'error', message: stderrText.trim() })
      } else if (code !== 0 && code !== null && !fullText && !parserState.errorMessage) {
        const errorMsg = stderrText.trim() || `${command} exited with code ${code}`
        parserState.errorMessage = errorMsg
      }

      if (parserState.errorMessage) {
        queue.push({ type: 'error', message: parserState.errorMessage })
      }

      queue.push({
        type: 'done',
        fullText,
        sessionId: parserState.sessionId || undefined,
      })
      queue.close()
    })

    this.child.on('error', () => {
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle)
        this.timeoutHandle = null
      }
      queue.push({ type: 'error', message: `${command} process error` })
      queue.close()
    })

    while (true) {
      const result = await queue.next()
      if (result.done) break
      yield result.value
    }
  }

  abort(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle)
      this.timeoutHandle = null
    }
    if (this.child && !this.child.killed) {
      this.child.kill('SIGTERM')
      logger.info('CodeBuddy query aborted')
    }
  }

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
