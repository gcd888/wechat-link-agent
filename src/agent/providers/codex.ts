/**
 * Codex Provider（OpenAI Codex CLI 专用）
 *
 * Codex CLI 的默认模式是交互式 TUI，需要 TTY 终端。
 * 当通过 stdin 管道调用时会报错 "Error: stdin is not a terminal"。
 *
 * 本 Provider 使用 `codex exec` 子命令实现非交互式调用：
 *   codex exec - --json --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox
 *   [-m <model>]
 *
 * 会话恢复：
 *   codex exec resume <sessionId> - --json --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox
 *
 * JSONL 输出格式（每行一个 JSON 事件）：
 *   {"type":"thread.started","thread_id":"019f..."}
 *   {"type":"turn.started"}
 *   {"type":"item.completed","item":{"id":"item_0","type":"error","message":"..."}}
 *   {"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"回复文本"}}
 *   {"type":"turn.completed","usage":{"input_tokens":10117,"output_tokens":54}}
 *
 * 流式实现：
 *   使用 AsyncQueue 模式（与 ClaudeProvider / OpenCodeProvider 相同），
 *   子进程的 JSONL 事件解析后实时推入队列。
 */

import { type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { logger } from '../../logger.js'
import { safeSpawn } from '../../utils/spawn.js'
import type { AgentConfig, QueryInput, AgentOutput } from '../types.js'
import type { AgentProvider } from '../provider.js'

/** 超时时间（毫秒）：3 分钟 */
const TIMEOUT_MS = 180_000

/**
 * 异步队列 — 桥接事件驱动（readline 'line' 事件）和异步迭代（AsyncIterable）
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
}

export class CodexProvider implements AgentProvider {
  private child: ChildProcess | null = null
  private config: AgentConfig
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null

  constructor(config: AgentConfig) {
    this.config = config
  }

  /**
   * 发送查询到 Codex CLI，返回流式输出
   *
   * 使用 `codex exec` 子命令实现非交互式调用：
   * - `-` 表示从 stdin 读取 prompt
   * - `--json` 输出 JSONL 事件流
   * - `--skip-git-repo-check` 允许在非 Git 仓库中运行
   * - `--dangerously-bypass-approvals-and-sandbox` 跳过审批和沙箱（非交互模式必需）
   *
   * 通过 AsyncQueue 桥接事件驱动和异步迭代，实现实时流式输出。
   */
  async *query(input: QueryInput): AsyncIterable<AgentOutput> {
    const command = this.config.cliPath || this.config.command
    const args: string[] = ['exec']

    // 会话恢复：codex exec resume <sessionId>
    if (input.sessionId) {
      args.push('resume', input.sessionId)
    }

    // 使用 `-` 表示从 stdin 读取 prompt
    args.push('-')

    // JSONL 流式输出
    args.push('--json')

    // 允许在非 Git 仓库中运行
    args.push('--skip-git-repo-check')

    // 跳过审批和沙箱（非交互模式必需，等同于 Claude Code 的 --dangerously-skip-permissions）
    args.push('--dangerously-bypass-approvals-and-sandbox')

    // 模型参数
    const model = input.model || this.config.model
    if (model) {
      args.push('--model', model)
    }

    // 解析器状态
    let sessionId = ''
    let fullText = ''
    let errorMessage = ''
    let timedOut = false

    const queue = new AsyncQueue<AgentOutput>()

    logger.info('Starting Codex query', { command, args, cwd: input.cwd })

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

    // 收集 stderr 用于诊断
    let stderrText = ''
    this.child.stderr!.setEncoding('utf-8')
    this.child.stderr!.on('data', (chunk: string) => {
      stderrText += chunk
    })

    // 写入 prompt 到 stdin 并关闭
    this.child.stdin!.write(input.prompt)
    this.child.stdin!.end()
    logger.debug('Codex prompt written to stdin', { command, promptLength: input.prompt.length })

    // 解析 stdout 的 JSONL 流
    const rl = createInterface({ input: this.child.stdout! })
    rl.on('line', (line: string) => {
      if (!line.trim()) return
      let obj: any
      try {
        obj = JSON.parse(line)
      } catch {
        return // 跳过无法解析的行
      }

      switch (obj.type) {
        // 会话开始，提取 thread_id 作为 sessionId
        case 'thread.started': {
          if (obj.thread_id) {
            sessionId = obj.thread_id
          }
          break
        }
        // 回合开始，无需处理
        case 'turn.started': {
          break
        }
        // 回合结束，标记完成
        case 'turn.completed': {
          break
        }
        // 项完成事件（包含消息、错误、工具调用等）
        case 'item.completed': {
          const item = obj.item
          if (!item) break

          switch (item.type) {
            // Agent 文本消息
            case 'agent_message': {
              const text: string = item.text || ''
              if (text) {
                fullText += text
                queue.push({ type: 'text', delta: text })
              }
              break
            }
            // 错误项
            case 'error': {
              const msg: string = item.message || 'Unknown Codex error'
              errorMessage = msg
              queue.push({ type: 'error', message: msg })
              break
            }
            // 工具调用、命令执行等其他项类型，记录日志但不输出到用户界面
            case 'tool_call':
            case 'command_execution':
            case 'reasoning':
            case 'file_change': {
              logger.debug('Codex item completed', { itemType: item.type, itemId: item.id })
              break
            }
            default: {
              logger.debug('Codex unknown item type', { itemType: item.type })
            }
          }
          break
        }
        // 其他未知事件类型
        default: {
          logger.debug('Codex unknown event type', { type: obj.type })
        }
      }
    })

    // 超时保护：3 分钟无输出则终止进程
    this.timeoutHandle = setTimeout(() => {
      if (this.child && !this.child.killed) {
        timedOut = true
        logger.warn('Codex query timed out, killing process', {
          command,
          timeoutMs: TIMEOUT_MS,
        })
        this.child.kill('SIGTERM')
      }
    }, TIMEOUT_MS)

    // 子进程结束
    this.child.on('close', (code: number | null) => {
      // 清除超时定时器
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle)
        this.timeoutHandle = null
      }

      if (timedOut) {
        queue.push({
          type: 'error',
          message: `${command} 响应超时（${TIMEOUT_MS / 1000}秒未退出），已终止进程。`,
        })
      } else if (code !== 0 && code !== null && !fullText && !errorMessage) {
        // 非超时、非零退出码且无输出 → 使用 stderr 作为错误信息
        const hint = stderrText.trim()
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

    // 子进程错误
    this.child.on('error', (err: Error) => {
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle)
        this.timeoutHandle = null
      }
      queue.push({ type: 'error', message: err.message })
      queue.close()
    })

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
      logger.info('Codex query aborted')
    }
  }

  /**
   * 获取 Codex CLI 版本信息
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
        resolve({
          version: output.trim() || undefined,
          models: [],
        })
      })
      child.on('error', () => resolve({ models: [] }))
    })
  }
}
