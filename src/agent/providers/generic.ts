/**
 * Generic Provider（通用兜底方案）
 *
 * 适用于尚未定制 Provider 的 Agent CLI 工具。
 * 通过标准的 stdin/stdout 子进程模式调用：
 *   1. 将 prompt 写入 stdin
 *   2. 收集 stdout 输出
 *   3. 一次性返回（无流式）
 *
 * 支持的 Agent: Gemini CLI、Codex CLI、OpenClaw、Hermes、
 *               Trae、Kimi Code、Qwen Code、MiMo Code 等第二梯队 Agent
 *
 * 重要：内置超时保护（3 分钟），防止 CLI 进入交互式 TUI 模式导致进程挂起。
 */

import { type ChildProcess } from 'node:child_process'
import { logger } from '../../logger.js'
import { safeSpawn } from '../../utils/spawn.js'
import type { AgentConfig, QueryInput, AgentOutput } from '../types.js'
import type { AgentProvider } from '../provider.js'

/** 超时时间（毫秒）：3 分钟 */
const TIMEOUT_MS = 180_000

export class GenericProvider implements AgentProvider {
  private child: ChildProcess | null = null
  private config: AgentConfig
  /** 超时定时器引用，用于在进程正常结束时清除 */
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null

  constructor(config: AgentConfig) {
    this.config = config
  }

  /**
   * 通用的 CLI 调用方案
   * stdin 输入 prompt，stdout 收集输出
   *
   * 内置超时保护：如果进程在 TIMEOUT_MS 内未退出，
   * 自动 kill 进程并返回超时错误（防止交互式 TUI 模式导致永久挂起）
   */
  async *query(input: QueryInput): AsyncIterable<AgentOutput> {
    const command = this.config.cliPath || this.config.command
    let args = this.config.args ? this.config.args.split(' ') : []

    // Qwen 特殊处理：确保 -y (YOLO mode) 和抑制警告
    // -y 让 Qwen 在非交互模式下自动批准文件写入等工具操作
    // QWEN_CODE_SUPPRESS_YOLO_WARNING 抑制 YOLO 警告到 stderr（不污染用户响应）
    const env: NodeJS.ProcessEnv = { ...process.env }
    if (command.includes('qwen')) {
      // 确保 -y 存在（无论数据库中是否配置）
      if (!args.includes('-y') && !args.includes('--yolo')) {
        args.push('-y')
      }
      env.QWEN_CODE_SUPPRESS_YOLO_WARNING = '1'
    }

    logger.info('Starting Generic CLI query', { command, args, cwd: input.cwd })

    try {
      this.child = safeSpawn(command, args, {
        cwd: input.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      yield { type: 'error', message: `Failed to spawn ${command}: ${msg}` }
      yield { type: 'done', fullText: '' }
      return
    }

    let fullText = ''
    let stderrText = ''
    let timedOut = false

    // 收集 stdout
    this.child.stdout!.setEncoding('utf-8')
    this.child.stdout!.on('data', (chunk: string) => {
      fullText += chunk
    })

    // 收集 stderr（仅用于错误诊断）
    this.child.stderr!.setEncoding('utf-8')
    this.child.stderr!.on('data', (chunk: string) => {
      stderrText += chunk
    })

    // 写入 prompt
    this.child.stdin!.write(input.prompt)
    this.child.stdin!.end()
    logger.debug('Generic prompt written to stdin', { command, promptLength: input.prompt.length })

    // 超时保护：超时后 kill 进程，防止交互式 CLI 永久挂起
    this.timeoutHandle = setTimeout(() => {
      if (this.child && !this.child.killed) {
        timedOut = true
        logger.warn('Generic CLI query timed out, killing process', {
          command,
          timeoutMs: TIMEOUT_MS,
          hasStdout: !!fullText,
          hasStderr: !!stderrText,
        })
        this.child.kill('SIGTERM')
      }
    }, TIMEOUT_MS)

    // 等待进程结束
    const exitCode = await new Promise<number | null>((resolve) => {
      this.child!.on('close', resolve)
      this.child!.on('error', (err) => {
        logger.error('CLI process error', { command, error: err.message })
        resolve(null)
      })
    })

    // 清除超时定时器（进程已正常结束）
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle)
      this.timeoutHandle = null
    }

    logger.info('Generic CLI process exited', { command, exitCode, stdoutLength: fullText.length, stderrLength: stderrText.length, timedOut })

    // 超时处理：进程被 kill 导致退出
    if (timedOut) {
      yield {
        type: 'error',
        message: `${command} 响应超时（${TIMEOUT_MS / 1000}秒未退出），已终止进程。该 CLI 可能不支持 stdin 非交互模式，请检查 Agent 参数配置。`,
      }
      yield { type: 'done', fullText }
      return
    }

    if (!fullText && stderrText.trim()) {
      // stdout 为空但有 stderr 输出（如未认证、未授权等提示）
      // 注意：某些 CLI 在未认证时仍以 exit code 0 退出，需额外检查 stderr
      logger.warn('Generic CLI: stdout empty, stderr has content', { command, stderrPreview: stderrText.trim().slice(0, 500) })
      yield { type: 'error', message: stderrText.trim() }
    } else if (exitCode !== 0 && !fullText) {
      const errorMsg = stderrText.trim() || `${command} exited with code ${exitCode}`
      logger.error('Generic CLI failed', { command, exitCode, errorMsg: errorMsg.slice(0, 500) })
      yield { type: 'error', message: errorMsg }
    } else if (fullText) {
      // 分批 yield 模拟流式输出
      const chunkSize = 200
      for (let i = 0; i < fullText.length; i += chunkSize) {
        yield { type: 'text', delta: fullText.slice(i, i + chunkSize) }
      }
    }

    yield { type: 'done', fullText }
  }

  /**
   * 终止当前查询
   */
  abort(): void {
    // 清除超时定时器
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle)
      this.timeoutHandle = null
    }
    if (this.child && !this.child.killed) {
      this.child.kill('SIGTERM')
      logger.info('Generic CLI query aborted')
    }
  }

  /**
   * 获取 CLI 工具版本
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
