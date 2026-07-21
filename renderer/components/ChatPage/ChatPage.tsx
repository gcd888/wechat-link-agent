/**
 * 聊天页面组件（第三栏）
 *
 * 功能:
 *   - 消息列表渲染（支持用户/Agent/系统三种角色）
 *   - 流式输出实时展示（打字光标动画）
 *   - 消息发送（Enter 发送 / Shift+Enter 换行）
 *   - 清空对话历史
 *   - 微信来源消息标记（绿色"微信"标签）
 *   - ClawBot 只读模式（查看微信对话记录）
 *   - 会话级工作空间选择（首条消息前可切换，之后锁定只读）
 *   - 文件上传
 *   - 语音输入（语音转文字）
 *
 * 数据通过 useChatStore 管理，IPC 事件由 initClawBotListeners 监听。
 */
import React, { useState, useRef, useEffect, useMemo } from 'react'
import { MessageSquare, Trash2, Plus, FolderKanban, Paperclip, Mic, Pencil, Copy, Check, BookOpen, FileText } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useT, useTranslation, pickLangField } from '../../i18n/i18n.js'
import { useChatStore } from '../../stores/chat-store.js'
import { useAgentStore } from '../../stores/agent-store.js'

/** 单条消息气泡组件 */
function MessageBubble({ message, markdownMode }: { message: { role: string; content: string; isStreaming?: boolean; source?: string; agentName?: string }; markdownMode: boolean }) {
  const t = useT()
  /** 复制成功后的短暂反馈状态 */
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  // 优先使用消息中保存的 Agent 名称，其次回退到通用 'Agent'
  const senderLabel = isUser
    ? (message.source === 'wechat' ? t('chat.weChatUser', '微信用户') : t('common.user', '我'))
    : isSystem ? t('common.system', '系统') : (message.agentName || 'Agent')

  /** 复制消息内容到剪贴板，并显示 2 秒的「已复制」反馈 */
  const handleCopy = () => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : isSystem ? 'center' : 'flex-start', marginBottom: '8px' }}>
      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px', marginLeft: isUser ? '0' : '12px', marginRight: isUser ? '12px' : '0', display: 'flex', alignItems: 'center', gap: '4px' }}>
        {senderLabel}
        {message.source === 'wechat' && <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(7, 193, 96, 0.15)', color: '#07c160' }}>微信</span>}
      </div>
      <div className={`message-bubble ${message.role}${markdownMode && !isUser ? ' markdown-mode' : ''}`}>
        {markdownMode && !isUser ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        ) : (
          <>
            {message.content}
            {message.isStreaming && <span style={{ display: 'inline-block', width: '6px', height: '14px', background: 'var(--color-text)', marginLeft: '2px', animation: 'blink 1s infinite', verticalAlign: 'middle' }} />}
          </>
        )}
      </div>
      {/* 复制按钮：点击复制消息全文，流式输出时不显示 */}
      {!message.isStreaming && (
        <span
          onClick={handleCopy}
          style={{
            cursor: 'pointer',
            color: copied ? 'var(--color-success)' : 'var(--color-text-muted)',
            opacity: 0.4,
            marginTop: '2px',
            marginLeft: isUser ? '0' : '12px',
            marginRight: isUser ? '12px' : '0',
            display: 'flex',
            alignItems: 'center',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.4')}
          title={t('common.copy', '复制')}
        >
          {copied ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={2} />}
        </span>
      )}
    </div>
  )
}

/** 聊天页面主组件 */
export function ChatPage() {
  const t = useT()
  const { i18n } = useTranslation()
  const [inputText, setInputText] = useState('')
  /** Markdown 预览模式（默认开启，用户可切换为纯文本） */
  const [markdownPreview, setMarkdownPreview] = useState(true)
  const messages = useChatStore((s) => s.messages)
  const isProcessing = useChatStore((s) => s.isProcessing)
  const processingAgentName = useChatStore((s) => s.processingAgentName)
  const sendError = useChatStore((s) => s.sendError)
  const send = useChatStore((s) => s.send)
  const sendClawBot = useChatStore((s) => s.sendClawBot)
  const clear = useChatStore((s) => s.clear)
  const currentSessionId = useChatStore((s) => s.currentSessionId)
  const sessions = useChatStore((s) => s.sessions)
  const createNewSession = useChatStore((s) => s.createNewSession)
  const currentAgent = useAgentStore((s) => s.currentAgent)
  const isClawBotMode = useAgentStore((s) => s.isClawBotMode)
  // 判断当前 Agent 是否正在处理消息（仅阻塞当前 Agent，不影响其他 Agent 发送）
  const isCurrentAgentProcessing = isProcessing && processingAgentName === currentAgent?.name
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const plusMenuRef = useRef<HTMLDivElement>(null)

  // ── 斜杠命令 ──
  const [slashCommands, setSlashCommands] = useState<AgentCommand[]>([])
  const [selectedCmdIndex, setSelectedCmdIndex] = useState(0)
  const [showSlashList, setShowSlashList] = useState(false)

  // ── 系统默认工作空间 ──
  const [defaultWorkspace, setDefaultWorkspace] = useState("");

  // 从配置加载系统默认工作空间路径
  useEffect(() => {
    window.electronAPI.config.get().then((c) => {
      setDefaultWorkspace(c.workingDirectory || '');
    }).catch(() => {});
  }, []);

  // ── 文件上传 ──
  const [selectedFiles, setSelectedFiles] = useState<Array<{ path: string; name: string }>>([])
  const [showPlusMenu, setShowPlusMenu] = useState(false)

  // ── 语音输入 ──
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  const supportsVoice = !!SpeechRecognition
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    if (!currentAgent?.command) { setSlashCommands([]); return }
    window.electronAPI.agent.getCommands(currentAgent.command).then(setSlashCommands).catch(() => setSlashCommands([]))
  }, [currentAgent?.command])

  const displayCommands = useMemo(() => {
    const result: Array<{ display: string; actualSlash: string; matchText: string; descriptionEn: string; descriptionZh: string; descriptionTw: string; source?: string }> = []
    for (const cmd of slashCommands) {
      result.push({ display: cmd.slash, actualSlash: cmd.slash, matchText: cmd.slash, descriptionEn: cmd.descriptionEn, descriptionZh: cmd.descriptionZh, descriptionTw: cmd.descriptionTw, source: cmd.source })
      if (cmd.alias) {
        for (const alias of cmd.alias.split(',').map((a) => a.trim()).filter(Boolean)) {
          result.push({ display: `${cmd.slash} (${alias})`, actualSlash: cmd.slash, matchText: `/${alias}`, descriptionEn: cmd.descriptionEn, descriptionZh: cmd.descriptionZh, descriptionTw: cmd.descriptionTw, source: cmd.source })
        }
      }
    }
    return result
  }, [slashCommands])

  const filteredCommands = useMemo(() => {
    if (!inputText.startsWith('/') || inputText.includes(' ')) return []
    return displayCommands.filter((cmd) => cmd.matchText.startsWith(inputText))
  }, [inputText, displayCommands])

  useEffect(() => { setShowSlashList(filteredCommands.length > 0) }, [filteredCommands])
  useEffect(() => { setSelectedCmdIndex(0) }, [filteredCommands])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // 点击外部关闭 + 菜单
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) setShowPlusMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── 发送消息 ──
  const handleSend = async () => {
    const text = inputText.trim()
    if (!text || isCurrentAgentProcessing) return
    setInputText('')
    setShowSlashList(false)
    const files = selectedFiles.length > 0 ? selectedFiles : undefined
    setSelectedFiles([])
    if (isClawBotMode) { await sendClawBot(text) } else { await send(text, files) }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSlashList) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedCmdIndex((i) => Math.min(i + 1, filteredCommands.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedCmdIndex((i) => Math.max(i - 1, 0)); return }
      if (e.key === 'Escape') { e.preventDefault(); setShowSlashList(false); return }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (filteredCommands.length > 0) { setInputText(filteredCommands[selectedCmdIndex].actualSlash + ' '); setShowSlashList(false); inputRef.current?.focus(); return }
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleClear = async () => { if (currentAgent && !isClawBotMode) await clear(currentAgent.name) }
  const handleNewSession = async () => { if (!isClawBotMode && currentAgent) await createNewSession() }

  // ── 文件 ──
  const handleSelectFiles = async () => {
    if (!window.electronAPI.dialog) return
    const paths = await window.electronAPI.dialog.openFiles()
    if (paths.length > 0) {
      setSelectedFiles((prev) => [...prev, ...paths.map((p: string) => ({ path: p, name: p.split(/[/\\]/).pop() || p }))])
    }
    setShowPlusMenu(false)
  }
  const handleRemoveFile = (index: number) => setSelectedFiles((prev) => prev.filter((_, i) => i !== index))

  // ── 工作空间 ──
  const handleSelectWorkspace = async () => {
    if (!window.electronAPI.dialog || !currentSessionId) return
    const dir = await window.electronAPI.dialog.pickDirectory()
    if (dir) {
      await window.electronAPI.session.updateCwd(currentSessionId, dir)
      if (currentAgent?.id) {
        const sessions = await window.electronAPI.session.list(currentAgent.id)
        useChatStore.setState({ sessions })
      }
    }
  }

  // ── 语音 ──
  const handleVoiceToggle = () => {
    if (!SpeechRecognition) return
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return }
    const recognition = new SpeechRecognition()
    recognition.lang = 'zh-CN'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onresult = (event: any) => { setInputText((prev) => prev + event.results[0][0].transcript); setIsListening(false) }
    recognition.onerror = () => setIsListening(false)
    recognition.onend = () => setIsListening(false)
    recognition.start()
    recognitionRef.current = recognition
    setIsListening(true)
  }

  // ── 当前会话信息 ──
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const sessionCwd = currentSession?.cwd;
  const hasSentMessage = messages.length > 0;
  // 工作空间可切换条件：有会话且尚未发送过消息（首条消息前才允许修改）
  const canChangeWorkspace = !!currentSessionId && !hasSentMessage;
  const effectiveWorkspace = sessionCwd || defaultWorkspace;
  // 提取路径最后一级文件夹名称（兼容 Windows \ 和 Unix / 路径分隔符）
  const workspaceLabel = effectiveWorkspace ? effectiveWorkspace.split(/[/\\]/).filter(Boolean).pop() || effectiveWorkspace : '';

  // ── 头信息 ──
  const headerTitle = isClawBotMode ? t('chat.clawbot', '微信 ClawBot') : (currentAgent?.name || t('chat.noAgentSelected', '未选择 Agent'))
  const headerStatus = isClawBotMode ? 'online' : (currentAgent?.status || 'offline')
  const headerSub = isClawBotMode ? t('chat.readOnlySubtitle', '只读模式 · 微信对话记录') : (currentSession?.title || currentAgent?.command || '')
  const canSend = !isClawBotMode && !!currentAgent

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── 头部 ── */}
      <div className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isClawBotMode ? (
            <img src="./assets/icons/clawbot.png" alt={t('chat.clawbotAlt', 'ClawBot')} width={20} height={20} style={{ borderRadius: '4px', objectFit: 'contain' }} />
          ) : (
            <div className={`status-dot ${headerStatus}`} />
          )}
          <span className="title">{headerTitle}</span>
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', padding: '2px 6px', background: 'var(--color-bg-hover)', borderRadius: '4px' }}>{headerSub}</span>
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {/* Markdown / 纯文本 模式切换（仅图标，鼠标悬停显示文字提示） */}
          <button
            onClick={() => setMarkdownPreview((v) => !v)}
            title={markdownPreview ? t('chat.plainText', '纯文本') : t('chat.markdownPreview', 'Markdown 预览')}
            style={{
              padding: '6px 10px',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              transition: 'all var(--duration-fast) var(--ease-spring)',
            }}
          >
            {markdownPreview ? <FileText size={14} strokeWidth={1.5} /> : <BookOpen size={14} strokeWidth={1.5} />}
          </button>
        </div>
      </div>

      {/* ── 消息区 ── */}
      <div className="message-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <MessageSquare size={32} strokeWidth={1.5} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: '16px', fontWeight: 500 }}>{t('chat.emptyTitle', '开始对话')}</div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', textAlign: 'center', maxWidth: '400px', lineHeight: '1.6' }}>
              {isClawBotMode ? t('chat.noWeChatMessages', '暂无微信对话记录，微信消息将自动同步到这里') : currentAgent ? t('chat.emptyHint', '当前使用 {{agent}}，发送消息即可开始对话', { agent: currentAgent.name }) : t('chat.startChatting', '请先选择 Agent')}
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => <MessageBubble key={msg.id || idx} message={msg} markdownMode={markdownPreview} />)
        )}
        {sendError && <div style={{ padding: '10px 14px', background: 'var(--color-error)', color: '#fff', borderRadius: '12px', fontSize: '13px', marginTop: '8px', whiteSpace: 'pre-wrap', lineHeight: 1.6, boxShadow: 'var(--shadow-sm)' }}>{t('chat.sendFailed', '发送失败')}: {sendError}</div>}
        <div ref={messagesEndRef} />
      </div>

      {/* ── 输入区 ── */}
      {isClawBotMode ? (
        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--color-border)', background: 'var(--material-toolbar)', backdropFilter: 'var(--material-toolbar-blur)', WebkitBackdropFilter: 'var(--material-toolbar-blur)', textAlign: 'center', fontSize: '12px', color: 'var(--color-text-muted)' }}>
          {t('chat.readOnlyMode', '🔒 只读模式 — 此处仅查看微信对话记录，如需对话请在微信中发送消息')}
        </div>
      ) : (
        <div style={{ padding: '8px 20px 12px', borderTop: '1px solid var(--color-border)', background: 'var(--material-toolbar)', backdropFilter: 'var(--material-toolbar-blur)', WebkitBackdropFilter: 'var(--material-toolbar-blur)', position: 'relative' }}>
          {/* 斜杠命令提示列表 */}
          {showSlashList && (
            <div style={{ position: 'absolute', bottom: '100%', left: '20px', right: '20px', maxHeight: '260px', overflowY: 'auto', background: 'var(--material-popover)', backdropFilter: 'var(--material-popover-blur)', WebkitBackdropFilter: 'var(--material-popover-blur)', border: '1px solid var(--color-border)', borderRadius: '12px', boxShadow: 'var(--shadow-lg)', zIndex: 100 }}>
              <div style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>{t('chat.commands', '可用命令')}</div>
              {filteredCommands.map((cmd, idx) => (
                <div key={cmd.display} onClick={() => { setInputText(cmd.actualSlash + ' '); setShowSlashList(false); inputRef.current?.focus() }} onMouseEnter={() => setSelectedCmdIndex(idx)}
                  style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', background: idx === selectedCmdIndex ? 'var(--color-bg-hover)' : 'transparent' }}>
                  <code style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>{cmd.display}</code>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {pickLangField(i18n.language, cmd.descriptionZh, cmd.descriptionTw, cmd.descriptionEn)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 文件芯片（输入框上方） */}
          {selectedFiles.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
              {selectedFiles.map((f, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', fontSize: '12px', background: 'var(--color-bg-hover)', borderRadius: '4px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <Paperclip size={10} strokeWidth={2} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                  <span onClick={() => handleRemoveFile(i)} style={{ cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '14px', lineHeight: 1 }}>×</span>
                </span>
              ))}
            </div>
          )}

          {/* 输入行 */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {/* + 号按钮（弹出功能菜单） */}
            <div ref={plusMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
              <span onClick={() => setShowPlusMenu((v) => !v)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', color: 'var(--color-text-muted)', flexShrink: 0, transition: 'background 0.12s', background: showPlusMenu ? 'var(--color-bg-hover)' : 'transparent' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-hover)'}
                onMouseLeave={(e) => { if (!showPlusMenu) e.currentTarget.style.background = 'transparent' }}
                title={t('chat.moreActions', '更多操作')}>
                <Plus size={18} strokeWidth={2} />
              </span>
              {/* 弹出菜单 */}
              {showPlusMenu && (
                <div style={{ position: 'absolute', bottom: '100%', left: '0', marginBottom: '4px', background: 'var(--material-popover)', backdropFilter: 'var(--material-popover-blur)', WebkitBackdropFilter: 'var(--material-popover-blur)', border: '1px solid var(--color-border)', borderRadius: '12px', boxShadow: 'var(--shadow-lg)', zIndex: 200, minWidth: '140px', padding: '6px', overflow: 'hidden' }}>
                  <div onClick={handleSelectFiles} style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', borderRadius: '6px', color: 'var(--color-text)', whiteSpace: 'nowrap' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                    <Paperclip size={15} strokeWidth={1.5} /> {t('chat.uploadFile', '上传文件')}
                  </div>
                </div>
              )}
            </div>

            <textarea ref={inputRef} className="chat-input" value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={handleKeyDown}
              placeholder={currentAgent ? t('chat.inputPlaceholder', '给 {{agent}} 发消息...', { agent: currentAgent.name }) : t('chat.noAgent', '请先选择 Agent')}
              disabled={isCurrentAgentProcessing || !canSend || isListening} rows={1} style={{ flex: 1 }} />

            {/* 语音按钮（发送按钮前） */}
            {supportsVoice && (
              <span onClick={handleVoiceToggle}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '12px', height: '32px', borderRadius: '6px', cursor: 'pointer', color: isListening ? 'var(--color-primary)' : 'var(--color-text-muted)', background: isListening ? 'var(--color-primary-alpha-15, rgba(99,102,241,0.12))' : 'transparent', flexShrink: 0, transition: 'all 0.12s' }}
                onMouseEnter={(e) => { if (!isListening) e.currentTarget.style.background = 'var(--color-bg-hover)' }}
                onMouseLeave={(e) => { if (!isListening) e.currentTarget.style.background = 'transparent' }}
                title={isListening ? t('chat.listening', '录音中...') : t('chat.voiceInput', '语音输入')}>
                <Mic size={17} strokeWidth={2} />
              </span>
            )}

            <button onClick={handleSend} disabled={isCurrentAgentProcessing || !inputText.trim() || !canSend}
              style={{ padding: '8px 18px', borderRadius: '10px', border: 'none', background: inputText.trim() && canSend ? 'var(--color-primary)' : 'var(--color-bg-hover)', color: inputText.trim() && canSend ? '#fff' : 'var(--color-text-muted)', cursor: inputText.trim() && canSend ? 'pointer' : 'not-allowed', fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap', transition: 'transform 0.08s var(--ease-out-soft)', boxShadow: inputText.trim() && canSend ? '0 2px 8px rgba(0, 122, 255, 0.2)' : 'none' }}>
              {isCurrentAgentProcessing ? t('chat.processing', '处理中...') : t('chat.send', '发送')}
            </button>
          </div>

          {/* 工作空间 + 快捷键提示 */}
          <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', fontSize: '11px', color: 'var(--color-text-muted)' }}>
            {/* 工作空间选择（首条消息前可切换，之后锁定只读） */}
            <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
              {t('chat.currentWorkspace', '当前工作空间：')}
            </span>
            {/* canChange: 是否可切换工作空间（有会话且未发送过消息） */}
            {canChangeWorkspace ? (
              <button
                onClick={handleSelectWorkspace}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  padding: '2px 8px', marginLeft: '2px', borderRadius: '4px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-hover)',
                  color: 'var(--color-primary)',
                  cursor: 'pointer',
                  fontSize: '11px', fontWeight: 500,
                  maxWidth: '240px',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-primary-alpha-15, rgba(99,102,241,0.12))'; e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-bg-hover)'; e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                title={`${t('chat.clickToChangeWorkspace', '点击切换工作空间')}\n${effectiveWorkspace || t('chat.defaultWorkspace', '系统默认工作空间')}`}
              >
                <FolderKanban size={11} strokeWidth={2} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {workspaceLabel || t('chat.defaultWorkspace', '系统默认工作空间')}
                </span>
                <Pencil size={9} strokeWidth={2} style={{ flexShrink: 0, opacity: 0.5 }} />
              </button>
            ) : (
              /* 已发送消息后：锁定只读，不可点击 */
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  padding: '2px 8px', marginLeft: '2px', borderRadius: '4px',
                  maxWidth: '240px',
                  opacity: 0.6,
                }}
                title={effectiveWorkspace || t('chat.defaultWorkspace', '系统默认工作空间')}
              >
                <FolderKanban size={11} strokeWidth={2} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {workspaceLabel || t('chat.defaultWorkspace', '系统默认工作空间')}
                </span>
              </span>
            )}

            {/* 快捷键提示（靠右） */}
            <span style={{ marginLeft: '34px', textAlign: 'right', flex: '1', paddingRight: '94px' }}>
              <span>{t('chat.enterToSend', 'Enter 发送')}</span>
                <span style={{ margin: '0 4px' }}> </span>
              <span>{t('chat.shiftEnter', 'Shift+Enter 换行')}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
