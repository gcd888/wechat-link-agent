/**
 * 微信端命令路由
 *
 * 解析用户从微信发送的命令，路由到对应的处理器。
 * 命令以 "/" 开头，如 /wlh /wla /wlc 等。
 * 非命令消息直接作为普通 prompt 传递给当前 Agent。
 *
 * 所有回复文本通过 t() 从 i18n 翻译数据读取，不硬编码。
 */

import type { AgentMessage } from '../agent/types.js'
import { t } from '../i18n/index.js'

/** 命令处理上下文 */
export interface CommandContext {
  /** 用户消息文本 */
  text: string
  /** 当前 Agent 名称 */
  currentAgentName: string
  /** 所有 Agent 名称列表 */
  agentNames: string[]
  /** 所有 Agent 启动命令列表（如 'claude'、'opencode'） */
  agentCommands: string[]
  /** 切换 Agent */
  switchAgent: (name: string) => Promise<boolean>
  /** 向用户回复消息 */
  reply: (text: string) => Promise<void>
  /** 向当前 Agent 发送 prompt */
  sendToAgent: (prompt: string) => Promise<void>
  /** 清理会话 */
  clearSession: () => Promise<void>
  /** 获取历史消息 */
  getHistory: (limit?: number) => Promise<AgentMessage[]>
  /** 加载 Agent 列表 */
  loadAgents: () => Promise<void>
  /** 获取版本号 */
  getVersion: () => string
  /** 切换模型 */
  switchModel?: (modelName: string) => Promise<boolean>
  /** 切换工作目录 */
  switchCwd?: (path: string) => Promise<boolean>
  /** 获取当前模型 */
  getCurrentModel?: () => string
  /** 获取当前工作目录 */
  getCurrentCwd?: () => string
  /** 终止当前 Agent 正在执行的任务 */
  abortAgent?: () => boolean
  /** 向所有已安装 Agent 并行发送 prompt，返回汇总结果文本 */
  sendToAllAgents?: (prompt: string) => Promise<string>
  /** 多 Agent 调度：按 command 指定不同 Agent 和不同 prompt，并行/串行查询，分批/汇总返回 */
  sendToMultiAgents?: (
    tasks: Array<{ command: string; prompt: string; order?: number }>,
    mode?: 'merge' | 'split',
  ) => Promise<string>
}

/** 命令处理结果 */
export interface CommandResult {
  handled: boolean
  reply?: string
}

/** 命令处理器类型 */
type CommandHandler = (ctx: CommandContext) => Promise<CommandResult | void>

/** 命令注册表：description 存储的是 i18n key，运行时通过 t() 翻译 */
const commands = new Map<string, { handler: CommandHandler; descKey: string }>()

/**
 * 注册命令
 * @param name    命令名（如 'wlh'）
 * @param descKey 描述的 i18n key（如 'bot.cmd.wlh.desc'）
 * @param handler 处理器
 */
export function registerCommand(
  name: string,
  descKey: string,
  handler: CommandHandler,
): void {
  commands.set(name.toLowerCase(), { handler, descKey })
}

/**
 * 处理用户消息
 * 如果是命令则路由到对应处理器，否则返回未处理
 *
 * 支持的格式:
 *   1. /wlh /wla /wlc 等内置命令
 *   2. /<command> <prompt>  切换到指定 Agent 并发送（如 /claude 帮我写代码）
 *   3. /<command> <prompt> /<command> <prompt>  多 Agent 调度（自动识别多个 /command）
 *   4. /m /<command> <prompt> /<command> <prompt>  多 Agent 调度，汇总返回（默认）
 *   5. /s /<command> <prompt> /<command> <prompt>  多 Agent 调度，分批返回
 *   6. /<command>:<N> <prompt>  带序号，串行执行（支持中文 ／英文 :）
 *   7. 普通文本 → 发给当前 Agent
 *
 * 组合示例:
 *   /s /claude:1 讲个笑话 /codebuddy:2 讲个故事  → 串行执行，分批返回
 *   /m /claude:1 讲个笑话 /codebuddy:2 讲个故事  → 串行执行，汇总返回
 *   /s /claude 讲个笑话 /codebuddy 讲个故事      → 并行执行，分批返回
 *   /claude 讲个笑话 /codebuddy 讲个故事          → 并行执行，汇总返回（默认）
 */
export async function routeCommand(ctx: CommandContext): Promise<CommandResult> {
  let text = ctx.text.trim()

  // 非命令消息
  if (!text.startsWith('/')) {
    return { handled: false }
  }

  // ── 模式前缀检测（/s、/split、/m、/merge） ──
  // 必须在 Agent 命令匹配之前处理，避免 /s 被误认为 Agent 命令
  let mode: 'merge' | 'split' = 'merge'
  const modeMatch = text.match(/^\/(s(?:plit)?|m(?:erge)?)(?:\s+|(?=\/))/i)
  if (modeMatch) {
    const prefix = modeMatch[1].toLowerCase()
    if (prefix === 's' || prefix === 'split') {
      mode = 'split'
    }
    // 剥离前缀（保留后跟的 / 或空格后的内容）
    text = text.slice(modeMatch[0].length).trim()
  }

  // ── 多 Agent 调度检测 ──
  // 从文本中找出所有已注册 Agent 命令（如 /claude、/codebuddy），
  // 支持 command:N 序号语法（如 /claude:1），用于串行执行。
  // 按命令出现位置切分文本并分发到不同 Agent 处理。
  // 例如: "/claude:1 讲个笑话 /codebuddy:2 讲个故事" 自动拆分为两个任务。
  if (ctx.agentCommands.length > 0) {
    // 按名称长度降序排序，避免短命令名被长命令名前缀匹配（如 /code 先于 /codebuddy）
    const sortedCommands = [...ctx.agentCommands].sort((a, b) => b.length - a.length)
    const escaped = sortedCommands.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    // 支持 command:N 序号语法（中英文冒号）
    const cmdPattern = new RegExp('\\/(' + escaped.join('|') + ')(?:[：:](\\d+))?(?=[\\s/]|$)', 'g')

    const matches: Array<{ index: number; command: string; order?: number }> = []
    let m: RegExpExecArray | null
    while ((m = cmdPattern.exec(text)) !== null) {
      matches.push({ index: m.index, command: m[1], order: m[2] ? parseInt(m[2], 10) : undefined })
    }

    if (matches.length > 1) {
      // 多个命令 → 多 Agent 调度
      const tasks: Array<{ command: string; prompt: string; order?: number }> = []
      for (let i = 0; i < matches.length; i++) {
        const { index, command, order } = matches[i]
        const promptStart = index + 1 + command.length + (order !== undefined ? String(order).length + 1 : 0)
        // +1 for '/' + command.length + optional ':N' + 1 for the colon
        // Actually: `/${command}` = 1 + command.length, then `:${order}` = 1 + String(order).length
        const promptEnd = i + 1 < matches.length ? matches[i + 1].index : text.length
        const prompt = text.slice(promptStart, promptEnd).trim()
        if (!prompt) {
          return { handled: true, reply: t('bot.errors.needPrompt', '⚠️ /{{cmd}} 后面需要输入内容', { cmd: command }) }
        }
        tasks.push({ command, prompt, order })
      }

      if (ctx.sendToMultiAgents) {
        const result = await ctx.sendToMultiAgents(tasks, mode)
        return { handled: true, reply: result }
      }
      return { handled: true, reply: t('bot.errors.multiAgentUnavailable', '⚠️ 多 Agent 调度功能不可用') }
    }
  }

  // ── 单条命令处理 ──
  const parts = text.slice(1).split(/\s+/)
  const cmdName = parts[0].toLowerCase()
  const cmdArgs = parts.slice(1).join(' ')

  // 查找内置命令
  const cmd = commands.get(cmdName)
  if (!cmd) {
    // 尝试作为 Agent 启动命令查找
    const matchedIdx = ctx.agentCommands.findIndex(
      (command) => command.toLowerCase() === cmdName
    )
    if (matchedIdx >= 0) {
      const agentName = ctx.agentNames[matchedIdx]
      // /<command> <prompt> 切换并发送
      await ctx.switchAgent(cmdName)
      if (cmdArgs) {
        await ctx.sendToAgent(cmdArgs)
      }
      return {
        handled: true,
        reply: t('bot.agent.switched', '已切换到 {{name}}', { name: agentName }) + (cmdArgs ? t('bot.agent.processing', '，正在处理您的请求...') : ''),
      }
    }
    return {
      handled: false,
      reply: t('bot.errors.unknownCommand', '未知命令 /{{cmd}}。输入 /wlh 查看可用命令。', { cmd: cmdName }),
    }
  }

  // 执行命令
  try {
    const result = await cmd.handler({ ...ctx, text: cmdArgs })
    if (result) return result
    return { handled: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { handled: true, reply: t('bot.errors.commandError', '命令执行出错: {{msg}}', { msg }) }
  }
}

// ── 注册内置命令 ──────────────────────────────────────────

registerCommand('wlh', 'bot.cmd.wlh.desc', async (ctx) => {
  // 运行时翻译命令描述
  const cmdList = Array.from(commands.entries())
    .map(([name, cmd]) => `/${name} - ${t(cmd.descKey, cmd.descKey)}`)
    .join('\n')

  const agentList = ctx.agentNames.length > 0
    ? `\n\n📋 ${t('bot.help.installedAgents', '已安装 Agent:')}\n${ctx.agentNames.map((name, i) => {
        const cmd = ctx.agentCommands[i] || name
        return `  · ${name} (/${cmd})`
      }).join('\n')}`
    : `\n\n⚠️ ${t('bot.help.noAgents', '未检测到已安装的 Agent')}`

  return {
    handled: true,
    reply: `${t('bot.help.title', '🔍 微连 (WeChat Link Agent) v{{version}}', { version: ctx.getVersion() })}\n\n${t('bot.help.availableCommands', '可用命令:')}\n${cmdList}${agentList}\n\n${t('bot.help.tips', '提示:')}\n  · ${t('bot.help.tip1', '输入 /<命令> <内容> 可切换 Agent 并发送')}\n  · ${t('bot.help.tip2', '多 Agent: /<命令1> 内容1 /<命令2> 内容2  (默认汇总)')}\n  · ${t('bot.help.tip3', '分批: /s /<命令1> 内容1 /<命令2> 内容2')}\n  · ${t('bot.help.tip4', '串行: /<命令1>:1 内容1 /<命令2>:2 内容2')}`,
  }
})

registerCommand('wla', 'bot.cmd.wla.desc', async (ctx) => {
  await ctx.loadAgents()
  const statusLines = ctx.agentNames.map((name, i) => {
    const cmd = ctx.agentCommands[i] || name
    const isCurrent = name === ctx.currentAgentName
    return `${isCurrent ? '👉' : '  '} ${name} (/${cmd})${isCurrent ? ` (${t('bot.wla.current', '(当前)')})` : ''}`
  })

  return {
    handled: true,
    reply: `${t('bot.wla.title', '🤖 Agent 列表:')}\n${statusLines.join('\n')}\n\n${t('bot.wla.switchHint', '使用 /<命令> 切换')}`,
  }
})

registerCommand('wlc', 'bot.cmd.wlc.desc', async (ctx) => {
  await ctx.clearSession()
  return { handled: true, reply: t('bot.wlc.cleared', '🗑 已清除当前对话历史') }
})

registerCommand('stop', 'bot.cmd.stop.desc', async (ctx) => {
  // 调用 abortAgent 实际终止正在执行的 Agent 子进程
  if (ctx.abortAgent) {
    const ok = ctx.abortAgent()
    return {
      handled: true,
      reply: ok ? t('bot.stop.stopped', '⏹ 已终止当前任务') : t('bot.stop.noTask', '⚠️ 当前没有正在执行的任务'),
    }
  }
  return { handled: true, reply: t('bot.stop.unavailable', '⚠️ 终止功能不可用') }
})

registerCommand('all', 'bot.cmd.all.desc', async (ctx) => {
  const prompt = ctx.text.trim()
  if (!prompt) {
    return { handled: true, reply: t('bot.all.needPrompt', '⚠️ 请输入要发送的内容，如：/all 帮我审查这段代码') }
  }
  if (!ctx.sendToAllAgents) {
    return { handled: true, reply: t('bot.all.unavailable', '⚠️ 此功能不可用') }
  }
  // 调用 sendToAllAgents 并行查询所有 Agent，返回汇总结果
  const result = await ctx.sendToAllAgents(prompt)
  return { handled: true, reply: result }
})

registerCommand('wls', 'bot.cmd.wls.desc', async (ctx) => {
  const current = ctx.currentAgentName || t('bot.wls.noAgent', '未选择')
  const history = await ctx.getHistory(5)
  const msgCount = history.length

  return {
    handled: true,
    reply: `${t('bot.wls.title', '📊 当前状态')}\n\n🤖 ${t('bot.wls.currentAgent', '当前 Agent: {{name}}', { name: current })}\n💬 ${t('bot.wls.recentMessages', '最近消息数: {{count}}', { count: String(msgCount) })}\n📱 ${t('bot.wls.wechatConnected', '微信: 已连接')}\n⚡ ${t('bot.wls.version', '版本: v{{version}}', { version: ctx.getVersion() })}`,
  }
})

registerCommand('history', 'bot.cmd.history.desc', async (ctx) => {
  const limit = parseInt(ctx.text || '10', 10) || 10
  const messages = await ctx.getHistory(limit)

  if (messages.length === 0) {
    return { handled: true, reply: t('bot.history.empty', '📭 暂无对话历史') }
  }

  const lines = messages.map((msg) => {
    const prefix = msg.role === 'user' ? '🧑' : '🤖'
    const content = msg.content.length > 100
      ? msg.content.slice(0, 100) + '...'
      : msg.content
    return `${prefix} ${content}`
  })

  return {
    handled: true,
    reply: `${t('bot.history.title', '📜 最近 {{count}} 条消息:', { count: String(messages.length) })}\n\n${lines.join('\n\n')}`,
  }
})

registerCommand('version', 'bot.cmd.version.desc', async (ctx) => {
  return {
    handled: true,
    reply: t('bot.version.reply', '微连 v{{version}}\n\nWeChat Link Agent\n让你的微信遥控电脑上的 AI Agent', { version: ctx.getVersion() }),
  }
})

registerCommand('model', 'bot.cmd.model.desc', async (ctx) => {
  const modelName = ctx.text.trim()
  if (!modelName) {
    const current = ctx.getCurrentModel?.() || t('bot.model.notSet', '未设置')
    return { handled: true, reply: t('bot.model.current', '当前模型: {{name}}', { name: current }) }
  }
  if (ctx.switchModel) {
    const ok = await ctx.switchModel(modelName)
    return {
      handled: true,
      reply: ok ? t('bot.model.switched', '✅ 模型已切换为 {{name}}', { name: modelName }) : t('bot.model.failed', '❌ 切换模型失败'),
    }
  }
  return { handled: true, reply: t('bot.model.unsupported', '⚠️ 当前 Agent 不支持切换模型') }
})

registerCommand('cwd', 'bot.cmd.cwd.desc', async (ctx) => {
  const dir = ctx.text.trim()
  if (!dir) {
    const current = ctx.getCurrentCwd?.() || t('bot.cwd.notSet', '未设置')
    return { handled: true, reply: t('bot.cwd.current', '当前工作目录: {{dir}}', { dir: current }) }
  }
  if (ctx.switchCwd) {
    const ok = await ctx.switchCwd(dir)
    return {
      handled: true,
      reply: ok ? t('bot.cwd.switched', '✅ 工作目录已切换为 {{dir}}', { dir }) : t('bot.cwd.failed', '❌ 目录不存在或无法访问'),
    }
  }
  return { handled: true, reply: t('bot.cwd.unsupported', '⚠️ 无法切换工作目录') }
})
