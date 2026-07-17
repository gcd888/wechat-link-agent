/**
 * 跨平台 spawn 工具
 *
 * Windows 上 npm 全局包的包装脚本（.cmd 文件）无法被 spawn 直接执行，
 * 需要 shell: true。但 shell: true 不会自动转义参数，需要手动处理。
 */

import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'

/**
 * 在 Windows 上为 shell: true 模式转义参数
 * 将参数用双引号包裹，并转义内部双引号
 */
function escapeShellArg(arg: string): string {
  // 已经是安全格式的不处理
  if (/^[a-zA-Z0-9_@%+=:/.-]+$/.test(arg)) {
    return arg
  }
  // 用双引号包裹，转义内部双引号
  return `"${arg.replace(/"/g, '\\"')}"`
}

/**
 * 跨平台安全的 spawn
 * 在 Windows 上自动添加 shell: true，以支持 npm 全局包的 .cmd 包装脚本
 * 并正确处理参数转义
 */
export function safeSpawn(
  command: string,
  args: string[],
  options: SpawnOptions = {},
): ChildProcess {
  const isWin = process.platform === 'win32'

  if (isWin) {
    // Windows 上需要 shell: true 才能执行 .cmd 文件
    // 但 shell: true 模式下参数不会被自动转义，需要手动处理
    const escapedArgs = args.map(escapeShellArg)
    return spawn(command, escapedArgs, {
      ...options,
      shell: true,
    })
  }

  return spawn(command, args, options)
}

/**
 * 在 Windows 上优先选择 .cmd 文件
 * `where` 命令可能返回多个路径，第一个可能是无扩展名的 sh 脚本
 */
export function preferCmdOnWindows(paths: string[]): string {
  if (process.platform !== 'win32') return paths[0]
  // 优先选择 .cmd 文件
  const cmdFile = paths.find((p) => p.toLowerCase().endsWith('.cmd'))
  return cmdFile || paths[0]
}
