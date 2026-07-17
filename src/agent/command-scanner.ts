/**
 * Agent 命令扫描器
 *
 * 扫描 Claude Code 的用户级技能和已安装插件目录，自动发现第三方斜杠命令。
 *
 * 扫描位置:
 *   1. ~/.claude/skills/{name}/SKILL.md                         -> source = 'skill'
 *   2. {pluginInstallPath}/skills/{name}/SKILL.md               -> source = 'plugin' (如 superpowers)
 *   3. {pluginInstallPath}/.claude/skills/{name}/SKILL.md       -> source = 'plugin' (如 ui-ux-pro-max)
 *   4. {pluginInstallPath}/commands/{name}.md                   -> source = 'plugin'
 *   5. ~/.claude/commands/{name}.md                              -> source = 'skill' (用户自定义命令)
 *
 * 每次启动时先删除 source != 'builtin' 的记录，再重新扫描插入。
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { logger } from '../logger.js'

/** 扫描到的单条命令 */
export interface ScannedCommand {
  slash: string
  descriptionEn: string
  descriptionZh: string
  descriptionTw: string
  source: 'skill' | 'plugin'
}

/**
 * 从 SKILL.md 或 command .md 文件的 YAML frontmatter 中提取 description 字段
 * frontmatter 格式:
 *   ---
 *   name: xxx
 *   description: xxx
 *   ---
 */
function parseFrontmatter(content: string): { name?: string; description?: string } {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) return {}

  const fm = fmMatch[1]
  const nameMatch = fm.match(/^name:\s*(.+)$/m)
  const descMatch = fm.match(/^description:\s*(.+)$/m)

  return {
    name: nameMatch?.[1]?.trim() || undefined,
    description: descMatch?.[1]?.trim() || undefined,
  }
}

/**
 * 扫描单个目录下的 SKILL.md 文件
 * @param skillsDir skills 目录路径
 * @param source 来源标记 ('skill' | 'plugin')
 * @returns 扫描到的命令列表
 */
function scanSkillsDir(skillsDir: string, source: 'skill' | 'plugin'): ScannedCommand[] {
  const commands: ScannedCommand[] = []
  if (!existsSync(skillsDir)) return commands

  let entries: string[]
  try {
    entries = readdirSync(skillsDir)
  } catch {
    return commands
  }

  for (const entry of entries) {
    const skillPath = join(skillsDir, entry, 'SKILL.md')
    if (!existsSync(skillPath)) continue

    try {
      const content = readFileSync(skillPath, 'utf-8')
      const { name, description } = parseFrontmatter(content)
      if (!name || !description) continue

      commands.push({
        slash: `/${name}`,
        descriptionEn: description,
        descriptionZh: '', // 第三方技能没有中文翻译，前端 fallback 到英文
        descriptionTw: '',
        source,
      })
    } catch {
      // 读取失败则跳过
    }
  }

  return commands
}

/**
 * 扫描单个目录下的 command .md 文件（插件 commands 目录）
 * @param commandsDir commands 目录路径
 * @returns 扫描到的命令列表
 */
function scanCommandsDir(commandsDir: string): ScannedCommand[] {
  const commands: ScannedCommand[] = []
  if (!existsSync(commandsDir)) return commands

  let entries: string[]
  try {
    entries = readdirSync(commandsDir)
  } catch {
    return commands
  }

  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue
    const cmdPath = join(commandsDir, entry)
    try {
      const content = readFileSync(cmdPath, 'utf-8')
      const { description } = parseFrontmatter(content)
      // 文件名去掉 .md 后缀即为命令名
      const cmdName = entry.replace(/\.md$/, '')
      commands.push({
        slash: `/${cmdName}`,
        descriptionEn: description || '',
        descriptionZh: '',
        descriptionTw: '',
        source: 'plugin',
      })
    } catch {
      // 读取失败则跳过
    }
  }

  return commands
}

/**
 * 从 installed_plugins.json 读取已安装插件的缓存路径列表
 * 返回每个插件的实际安装目录（installPath）
 */
function getInstalledPluginPaths(): string[] {
  const pluginsJsonPath = join(homedir(), '.claude', 'plugins', 'installed_plugins.json')
  if (!existsSync(pluginsJsonPath)) return []

  try {
    const raw = readFileSync(pluginsJsonPath, 'utf-8')
    const data = JSON.parse(raw)
    const paths: string[] = []

    if (data.plugins && typeof data.plugins === 'object') {
      for (const key of Object.keys(data.plugins)) {
        const entries = data.plugins[key]
        if (Array.isArray(entries)) {
          for (const entry of entries) {
            if (entry.installPath) {
              paths.push(entry.installPath)
            }
          }
        }
      }
    }

    return paths
  } catch {
    return []
  }
}

/**
 * 扫描所有第三方命令（用户技能 + 插件技能 + 插件命令）
 * 去重后返回
 */
export function scanCommands(): ScannedCommand[] {
  const claudeDir = join(homedir(), '.claude')
  const allCommands: ScannedCommand[] = []
  const seen = new Set<string>()

  const addUnique = (cmds: ScannedCommand[]) => {
    for (const cmd of cmds) {
      if (!seen.has(cmd.slash)) {
        seen.add(cmd.slash)
        allCommands.push(cmd)
      }
    }
  }

  // 1. 扫描用户级技能 ~/.claude/skills/*/SKILL.md
  addUnique(scanSkillsDir(join(claudeDir, 'skills'), 'skill'))

  // 2. 扫描用户自定义命令 ~/.claude/commands/*.md
  addUnique(scanCommandsDir(join(claudeDir, 'commands')).map((c) => ({
    ...c,
    source: 'skill' as const, // 用户自定义命令归类为 skill
  })))

  // 3. 扫描已安装插件
  const pluginPaths = getInstalledPluginPaths()
  for (const pluginPath of pluginPaths) {
    if (!existsSync(pluginPath)) continue

    // 插件技能: <installPath>/skills/*/SKILL.md (如 superpowers)
    addUnique(scanSkillsDir(join(pluginPath, 'skills'), 'plugin'))

    // 插件技能: <installPath>/.claude/skills/*/SKILL.md (如 ui-ux-pro-max)
    addUnique(scanSkillsDir(join(pluginPath, '.claude', 'skills'), 'plugin'))

    // 插件命令: <installPath>/commands/*.md
    addUnique(scanCommandsDir(join(pluginPath, 'commands')))
  }

  logger.info('Command scan completed', {
    total: allCommands.length,
    skills: allCommands.filter((c) => c.source === 'skill').length,
    plugins: allCommands.filter((c) => c.source === 'plugin').length,
  })

  return allCommands
}
