/**
 * 消息分块工具
 *
 * 微信消息有长度限制（约 4000 字符），超长文本需要分块发送。
 * 本模块实现卡片感知的分块策略:
 *   1. 优先在段落边界（双换行）分块，保持 markdown 格式完整
 *   2. 单个段落超长时，在安全位置（换行/句号/空格）分块
 *   3. 确保每块不超过 maxLen 字符
 */

/** 默认最大消息长度（微信限制） */
export const MAX_MESSAGE_LENGTH = 4000

/** 在段落边界（双换行）分割文本 */
function parseBlocks(text: string): string[] {
  return text.split(/\n\n+/).filter(block => block.length > 0)
}

/** 找到安全的分块点，避免破坏 markdown 格式 */
function findSafeSplitPoint(text: string, maxLen: number): number {
  // 优先在换行处分割（保持列表项、段落完整）
  let idx = text.lastIndexOf('\n', maxLen)
  if (idx >= maxLen * 0.3) return idx

  // 尝试在句号/问号/感叹号处分割
  const sentenceEnd = /[。！？.!?]$/
  for (let i = maxLen; i >= maxLen * 0.5; i--) {
    if (sentenceEnd.test(text.slice(i - 1, i))) return i
  }

  // 尝试在空格处分割（不截断单词）
  idx = text.lastIndexOf(' ', maxLen)
  if (idx >= maxLen * 0.3) return idx

  // 最后兜底：硬切
  return maxLen
}

/** 将单个超长段落按安全边界分割 */
function splitByNewline(text: string, maxLen: number): string[] {
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining)
      break
    }
    const splitIdx = findSafeSplitPoint(remaining, maxLen)
    chunks.push(remaining.slice(0, splitIdx))
    remaining = remaining.slice(splitIdx).replace(/^\n+/, '')
  }
  return chunks
}

/**
 * 卡片感知的消息分块器
 * 在段落边界（双换行）分块以保持卡片完整，
 * 单个超长段落退回到按行分割。
 *
 * @param text - 待分块的文本
 * @param maxLen - 每块最大长度，默认 4000
 * @returns 分块后的文本数组
 */
export function splitMessage(text: string, maxLen: number = MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= maxLen) return [text]
  const blocks = parseBlocks(text)
  const chunks: string[] = []
  let current = ''

  for (const block of blocks) {
    // 当前块能否放入当前 chunk？
    if (current.length === 0) {
      if (block.length <= maxLen) {
        current = block
      } else {
        chunks.push(...splitByNewline(block, maxLen))
      }
    } else if (current.length + 2 + block.length <= maxLen) {
      current += '\n\n' + block
    } else {
      // 当前 chunk 已满，开始新 chunk
      chunks.push(current)
      if (block.length <= maxLen) {
        current = block
      } else {
        chunks.push(...splitByNewline(block, maxLen))
        current = ''
      }
    }
  }
  if (current) chunks.push(current)
  return chunks
}
