/**
 * 会话管理器
 *
 * 管理每个 Agent 的对话会话。每个 Agent 可以有多个会话，
 * 每个会话包含多条消息。支持 Agent CLI 的 --resume 续接功能。
 *
 * 数据存储在 SQLite 的 sessions 和 messages 表中。
 */

import { getDb, saveDb } from './database/db.js'
import { logger } from './logger.js'

/** 会话状态 */
export interface Session {
  id: number
  agentId: number
  title: string
  cwd?: string              // 会话级工作目录
  sdkSessionId?: string    // Agent CLI 侧的 session_id，用于 --resume
  createdAt: string
  updatedAt: string
}

/** 消息 */
export interface Message {
  id?: number
  sessionId: number
  agentName: string
  role: 'user' | 'assistant' | 'system'
  content: string
  source: 'desktop' | 'wechat'
  timestamp: number
}

/** 会话预览信息（用于列表展示） */
export interface SessionPreview {
  id: number
  agentId: number
  title: string
  cwd?: string              // 会话级工作目录
  sdkSessionId?: string
  createdAt: string
  updatedAt: string
  /** 消息总数 */
  messageCount: number
  /** 最后一条消息摘要（截断 50 字符） */
  lastMessage?: string
  /** 最后一条消息时间戳（毫秒） */
  lastMessageTime?: number
}

class SessionManager {
  /** 会话缓存（加速频繁访问） */
  private sessionCache: Map<string, number> = new Map()  // key: "agentId:sessionId"

  /**
   * 获取 Agent 的当前会话
   * 如果不存在则创建新会话
   */
  async getOrCreateSession(agentId: number, agentName: string, cwd?: string): Promise<Session> {
    const db = await getDb()

    // 查找最新的会话
    const results = db.exec(
      `SELECT * FROM sessions WHERE agent_id = ? ORDER BY updated_at DESC LIMIT 1`,
      [agentId],
    )

    if (results[0]?.values.length) {
      return this.rowToSession(results[0].values[0], results[0].columns)
    }

    // 创建新会话
    db.run(
      `INSERT INTO sessions (agent_id, title, cwd) VALUES (?, ?, ?)`,
      [agentId, `对话 ${new Date().toLocaleString('zh-CN')}`, cwd || null],
    )
    saveDb()

    // 使用 MAX(id) 获取自增 ID，比 last_insert_rowid() 更可靠
    const idResult = db.exec('SELECT MAX(id) FROM sessions')
    const id = Number(idResult[0]?.values[0]?.[0]) || 0
    if (!id) {
      logger.error('Failed to get session ID after INSERT', { agentId })
      throw new Error('Failed to create session')
    }
    const session: Session = {
      id,
      agentId,
      title: `对话 ${new Date().toLocaleString('zh-CN')}`,
      cwd: cwd || undefined,
      createdAt: new Date().toLocaleString('zh-CN'),
      updatedAt: new Date().toLocaleString('zh-CN'),
    }

    logger.info('Created new session', { agentId, sessionId: id })
    return session
  }

  /**
   * 添加消息到会话
   */
  async addMessage(
    sessionId: number,
    agentName: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    source: 'desktop' | 'wechat' = 'desktop',
  ): Promise<number> {
    const db = await getDb()
    const timestamp = Date.now()

    db.run(
      `INSERT INTO messages (session_id, agent_name, role, content, source, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sessionId, agentName, role, content, source, timestamp],
    )

    // 更新会话时间戳
    db.run(
      `UPDATE sessions SET updated_at = datetime('now','localtime') WHERE id = ?`,
      [sessionId],
    )

    saveDb()

    // 使用 MAX(id) 获取自增 ID
    const msgIdResult = db.exec('SELECT MAX(id) FROM messages')
    const msgId = Number(msgIdResult[0]?.values[0]?.[0]) || 0
    return msgId
  }

  /**
   * 获取会话的消息历史
   */
  async getMessages(sessionId: number, limit: number = 50): Promise<Message[]> {
    const db = await getDb()
    const results = db.exec(
      `SELECT id, session_id, agent_name, role, content, source, timestamp
       FROM messages WHERE session_id = ?
       ORDER BY timestamp ASC LIMIT ?`,
      [sessionId, limit],
    )

    if (!results[0]) return []
    return results[0].values.map((row: any) => ({
      id: Number(row[0]),
      sessionId: Number(row[1]),
      agentName: String(row[2]),
      role: String(row[3]) as 'user' | 'assistant' | 'system',
      content: String(row[4]),
      source: String(row[5]) as 'desktop' | 'wechat',
      timestamp: Number(row[6]),
    }))
  }

  /**
   * 清空会话消息
   */
  async clearMessages(sessionId: number): Promise<void> {
    const db = await getDb()
    db.run('DELETE FROM messages WHERE session_id = ?', [sessionId])
    saveDb()
    logger.info('Session messages cleared', { sessionId })
  }

  /**
   * 获取 Agent 的所有会话
   */
  async getSessions(agentId: number): Promise<Session[]> {
    const db = await getDb()
    const results = db.exec(
      `SELECT * FROM sessions WHERE agent_id = ? ORDER BY updated_at DESC`,
      [agentId],
    )

    if (!results[0]) return []
    return results[0].values.map((row: any) => this.rowToSession(row, results[0].columns))
  }

  /**
   * 显式创建新会话
   * 与 getOrCreateSession 不同，此方法总是创建新会话
   */
  async createSession(agentId: number, agentName: string, title?: string, cwd?: string): Promise<Session> {
    const db = await getDb()
    const sessionTitle = title || `对话 ${new Date().toLocaleString('zh-CN')}`

    db.run(
      `INSERT INTO sessions (agent_id, title, cwd) VALUES (?, ?, ?)`,
      [agentId, sessionTitle, cwd || null],
    )
    saveDb()

    // 使用 MAX(id) 获取自增 ID
    const idResult = db.exec('SELECT MAX(id) FROM sessions')
    const id = Number(idResult[0]?.values[0]?.[0]) || 0
    if (!id) {
      logger.error('Failed to get session ID on explicit create', { agentId })
      throw new Error('Failed to create session')
    }
    const session: Session = {
      id,
      agentId,
      title: sessionTitle,
      cwd: cwd || undefined,
      createdAt: new Date().toLocaleString('zh-CN'),
      updatedAt: new Date().toLocaleString('zh-CN'),
    }

    logger.info('Created new session (explicit)', { agentId, sessionId: id })
    return session
  }

  /**
   * 获取 Agent 的所有会话（带预览信息：消息数、最后消息摘要）
   * 用于前端会话列表展示
   */
  async getSessionsWithPreview(agentId: number): Promise<SessionPreview[]> {
    const db = await getDb()
    // 一次查询获取会话 + 消息数 + 最后消息摘要 + 最后消息时间
    const results = db.exec(
      `SELECT
         s.id, s.agent_id, s.title, s.cwd, s.sdk_session_id,
         s.created_at, s.updated_at,
         COUNT(m.id) AS msg_count,
         (SELECT m2.content FROM messages m2
          WHERE m2.session_id = s.id
          ORDER BY m2.timestamp DESC LIMIT 1) AS last_msg,
         (SELECT m3.timestamp FROM messages m3
          WHERE m3.session_id = s.id
          ORDER BY m3.timestamp DESC LIMIT 1) AS last_msg_time
       FROM sessions s
       LEFT JOIN messages m ON m.session_id = s.id
       WHERE s.agent_id = ?
       GROUP BY s.id
       ORDER BY s.updated_at DESC`,
      [agentId],
    )

    if (!results[0]) return []
    return results[0].values.map((row: any) => {
      const lastMsg = row[8] ? String(row[8]) : undefined
      return {
        id: Number(row[0]),
        agentId: Number(row[1]),
        title: String(row[2] || ''),
        cwd: row[3] ? String(row[3]) : undefined,
        sdkSessionId: row[4] ? String(row[4]) : undefined,
        createdAt: String(row[5] || ''),
        updatedAt: String(row[6] || ''),
        messageCount: Number(row[7] || 0),
        // 截断最后消息摘要为 50 字符
        lastMessage: lastMsg ? (lastMsg.length > 50 ? lastMsg.slice(0, 50) + '...' : lastMsg) : undefined,
        lastMessageTime: row[9] ? Number(row[9]) : undefined,
      }
    })
  }

  /**
   * 删除会话（消息表已有 ON DELETE CASCADE，自动级联删除）
   */
  async deleteSession(sessionId: number): Promise<void> {
    const db = await getDb()
    db.run('DELETE FROM sessions WHERE id = ?', [sessionId])
    saveDb()
    logger.info('Session deleted', { sessionId })
  }

  /**
   * 重命名会话
   */
  async renameSession(sessionId: number, title: string): Promise<void> {
    const db = await getDb()
    db.run('UPDATE sessions SET title = ? WHERE id = ?', [title, sessionId])
    saveDb()
    logger.info('Session renamed', { sessionId, title })
  }

  /**
   * 根据首条用户消息自动更新会话标题
   * 如果会话标题仍为默认值（"对话 xxx"），则用首条用户消息前 30 字符替换
   */
  async autoUpdateTitle(sessionId: number): Promise<void> {
    const db = await getDb()
    // 获取当前会话标题
    const sessionResult = db.exec('SELECT title FROM sessions WHERE id = ?', [sessionId])
    if (!sessionResult[0]?.values.length) return
    const currentTitle = String(sessionResult[0].values[0][0] || '')
    // 仅当标题是默认值（以"对话 "开头）时才自动更新
    if (!currentTitle.startsWith('对话 ')) return

    // 获取该会话的第一条用户消息
    const msgResult = db.exec(
      `SELECT content FROM messages WHERE session_id = ? AND role = 'user'
       ORDER BY timestamp ASC LIMIT 1`,
      [sessionId],
    )
    if (!msgResult[0]?.values.length) return
    const firstMsg = String(msgResult[0].values[0][0] || '')
    const newTitle = firstMsg.length > 30 ? firstMsg.slice(0, 30) + '...' : firstMsg
    if (newTitle) {
      db.run('UPDATE sessions SET title = ? WHERE id = ?', [newTitle, sessionId])
      saveDb()
    }
  }

  /**
   * 更新会话的工作目录
   */
  async updateSessionCwd(sessionId: number, cwd: string): Promise<void> {
    const db = await getDb()
    db.run('UPDATE sessions SET cwd = ? WHERE id = ?', [cwd, sessionId])
    saveDb()
    logger.info('Session cwd updated', { sessionId, cwd })
  }

  /**
   * 获取会话的工作目录
   */
  async getSessionCwd(sessionId: number): Promise<string | null> {
    const db = await getDb()
    const result = db.exec('SELECT cwd FROM sessions WHERE id = ?', [sessionId])
    if (!result[0]?.values[0]) return null
    const val = result[0].values[0][0]
    return val ? String(val) : null
  }

  /**
   * 更新会话的 SDK Session ID
   */
  async updateSdkSessionId(sessionId: number, sdkSessionId: string): Promise<void> {
    const db = await getDb()
    db.run('UPDATE sessions SET sdk_session_id = ? WHERE id = ?', [sdkSessionId, sessionId])
    saveDb()
  }

  /**
   * 将数据库行转为 Session 对象
   */
  private rowToSession(row: unknown[], columns: string[]): Session {
    const col = (name: string) => {
      const idx = columns.indexOf(name)
      return idx >= 0 ? row[idx] : null
    }
    return {
      id: Number(col('id')),
      agentId: Number(col('agent_id')),
      title: String(col('title') || ''),
      cwd: col('cwd') ? String(col('cwd')) : undefined,
      sdkSessionId: col('sdk_session_id') ? String(col('sdk_session_id')) : undefined,
      createdAt: String(col('created_at') || ''),
      updatedAt: String(col('updated_at') || ''),
    }
  }

  /**
   * 获取所有微信来源的消息（供 ClawBot 聊天视图使用）
   * 跨 Agent / 会话，按时间排序
   */
  async getWeChatMessages(limit: number = 100): Promise<Message[]> {
    const db = await getDb()
    const results = db.exec(
      `SELECT id, session_id, agent_name, role, content, source, timestamp
       FROM messages WHERE source = 'wechat'
       ORDER BY timestamp ASC LIMIT ?`,
      [limit],
    )

    if (!results[0]) return []
    return results[0].values.map((row: any) => ({
      id: Number(row[0]),
      sessionId: Number(row[1]),
      agentName: String(row[2]),
      role: String(row[3]) as 'user' | 'assistant' | 'system',
      content: String(row[4]),
      source: String(row[5]) as 'desktop' | 'wechat',
      timestamp: Number(row[6]),
    }))
  }

  /**
   * 搜索消息
   */
  async searchMessages(keyword: string, limit: number = 20): Promise<Message[]> {
    const db = await getDb()
    const results = db.exec(
      `SELECT id, session_id, agent_name, role, content, source, timestamp
       FROM messages WHERE content LIKE '%' || ? || '%'
       ORDER BY timestamp DESC LIMIT ?`,
      [keyword, limit],
    )

    if (!results[0]) return []
    return results[0].values.map((row: any) => ({
      id: Number(row[0]),
      sessionId: Number(row[1]),
      agentName: String(row[2]),
      role: String(row[3]) as 'user' | 'assistant' | 'system',
      content: String(row[4]),
      source: String(row[5]) as 'desktop' | 'wechat',
      timestamp: Number(row[6]),
    }))
  }

  /**
   * 获取消息统计信息
   * 返回消息总数和按 Agent 分组的消息数
   */
  async getStats(): Promise<{ total: number; byAgent: Record<string, number> }> {
    const db = await getDb()

    // 查询消息总数
    const totalResult = db.exec('SELECT COUNT(*) FROM messages')
    const total = Number(totalResult[0]?.values[0]?.[0]) || 0

    // 按 Agent 分组统计消息数
    const byAgentResult = db.exec(
      `SELECT agent_name, COUNT(*) FROM messages GROUP BY agent_name`,
    )
    const byAgent: Record<string, number> = {}
    if (byAgentResult[0]) {
      for (const row of byAgentResult[0].values) {
        const name = String(row[0] || '未知')
        byAgent[name] = Number(row[1])
      }
    }

    return { total, byAgent }
  }
}

export const sessionManager = new SessionManager()
