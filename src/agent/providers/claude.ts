/**
 * Claude Code Provider
 *
 * 第一梯队 Provider，专为 Claude Code CLI 定制。
 * 专注于 Claude Code CLI 的 NDJSON 流式输出解析。
 *
 * 调用方式:
 *   claude -p - --output-format stream-json --verbose --include-partial-messages
 *   --dangerously-skip-permissions [--resume <sessionId>] [--model <model>]
 *
 * 输出格式: NDJSON stream-json
 *   每行一个 JSON 对象，包含 type / event / result 等字段
 *
 * 流式实现:
 *   使用 async queue 模式，子进程的 NDJSON 事件解析后实时推入队列，
 *   query() 的 AsyncIterable 从队列拉取，实现真正的实时流式输出。
 */

import { type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { logger } from '../../logger.js'
import { safeSpawn } from '../../utils/spawn.js'
import type { AgentConfig, QueryInput, AgentOutput } from '../types.js'
import type { AgentProvider } from '../provider.js'

/** NDJSON 流解析器状态 */
interface StreamParserState {
  sessionId: string
  textParts: string[]
  errorMessage?: string
  /** 是否已通过流式 delta 收到过文本（用于避免 assistant 事件重复推送） */
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

  /** 推入一个元素，唤醒等待的消费者 */
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

  /** 标记队列结束，唤醒所有等待的消费者 */
  close(): void {
    this.done = true
    if (this.resolveWait) {
      const resolve = this.resolveWait
      this.resolveWait = null
      resolve({ value: undefined, done: true })
    }
  }

  /** 拉取下一个元素，无数据时阻塞等待 */
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

  /** 是否已结束 */
  get isClosed(): boolean {
    return this.done
  }
}

export class ClaudeProvider implements AgentProvider {
  private child: ChildProcess | null = null
  private config: AgentConfig

  constructor(config: AgentConfig) {
    this.config = config
  }

  /**
   * 发送查询到 Claude Code CLI，返回流式输出
   * 通过 AsyncIterable 逐块返回 text delta，实现真正的实时流式
   */
  async *query(input: QueryInput): AsyncIterable<AgentOutput> {
    const args: string[] = [
      '-p', '-',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--dangerously-skip-permissions',
    ]
    if (input.sessionId) args.push('--resume', input.sessionId)
    if (input.model) args.push('--model', input.model)

    // 处理图片：保存到临时文件
    const tempImagePaths = this.saveImagesTemp(input.images)
    let prompt = input.prompt
    if (tempImagePaths.length > 0) {
      const imageLines = tempImagePaths.map((p) => `\n![image](file://${p})`).join('')
      prompt += imageLines
    }

    // 解析器状态
    const parserState: StreamParserState = {
      sessionId: '',
      textParts: [],
      hasStreamedText: false,
    }

    // 异步队列：子进程事件 → 队列 → query() 的 AsyncIterable
    const queue = new AsyncQueue<AgentOutput>()

    const command = this.config.cliPath || this.config.command
    const cwd = input.cwd

    logger.info('Starting Claude CLI query', { command, args, cwd })

    try {
      this.child = safeSpawn(command, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      })
    } catch (err) {
      this.cleanupTempFiles(tempImagePaths)
      yield { type: 'error', message: `Failed to spawn ${command}: ${err instanceof Error ? err.message : String(err)}` }
      yield { type: 'done', fullText: '' }
      return
    }

    // 写入 prompt 到 stdin 并关闭
    this.child.stdin!.write(prompt)
    this.child.stdin!.end()

    // 解析 stdout 的 NDJSON 流
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
              parserState.hasStreamedText = true // 标记已收到流式文本
              // 实时推入队列，消费者立即收到
              queue.push({ type: 'text', delta })
            }
          } else if (evt?.type === 'message_delta' && evt.delta?.stop_reason) {
            queue.push({ type: 'turn_end', reason: evt.delta.stop_reason })
          }
          break
        }
        case 'assistant': {
          // 非流式的完整 assistant 消息（仅在没有流式输出时作为 fallback 使用）
          if (parserState.hasStreamedText) {
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
              parserState.textParts.push(text)
              // 没有流式输出过，这里补推一次
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

    // 子进程结束时推送 done 事件并关闭队列
    this.child.on('close', (code: number | null) => {
      this.cleanupTempFiles(tempImagePaths)
      const fullText = parserState.textParts.join('').trim()

      if (code !== 0 && code !== null && !fullText && !parserState.errorMessage) {
        parserState.errorMessage = `${command} exited with code ${code}`
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

    this.child.on('error', (err: Error) => {
      this.cleanupTempFiles(tempImagePaths)
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
    if (this.child && !this.child.killed) {
      this.child.kill('SIGTERM')
      logger.info('Claude query aborted')
    }
  }

  /**
   * 获取 Claude Code 版本信息
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
          models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
        })
      })
      child.on('error', () => resolve({ models: [] }))
    })
  }

  /**
   * 保存图片到临时目录
   */
  private saveImagesTemp(images?: QueryInput['images']): string[] {
    if (!images?.length) return []
    const tempDir = join(tmpdir(), 'wechat-link-agent')
    mkdirSync(tempDir, { recursive: true })
    return images.map((img) => {
      const ext = img.source.media_type.split('/')[1] || 'png'
      const fileName = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const filePath = join(tempDir, fileName)
      writeFileSync(filePath, Buffer.from(img.source.data, 'base64'))
      return filePath
    })
  }

  /**
   * 清理临时文件
   */
  private cleanupTempFiles(paths: string[]): void {
    for (const p of paths) {
      try { unlinkSync(p) } catch { /* ignore */ }
    }
  }
}
