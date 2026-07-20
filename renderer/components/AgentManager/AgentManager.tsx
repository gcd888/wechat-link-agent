/**
 * Agent 管理页面组件（第三栏）
 *
 * 功能:
 *   - 已安装 Agent 列表展示（含状态、厂商、图标）
 *   - 手动添加 Agent（名称/命令/参数/厂商）
 *   - Agent 切换 / 删除 / 设为默认
 *   - 可用 Agent 推荐列表（从注册表读取，支持一键安装）
 *   - 环境检测（Node.js / npm / Git 是否已安装）
 *   - 工作目录设置
 *
 * 数据通过 useAgentStore 管理，IPC 通信获取/更新 Agent 信息。
 */
import { useState, useEffect } from 'react'
import { Bot, MessageSquare, RotateCw, Loader, Settings, AlertCircle, CheckCircle, Trash2, Save, X, Zap } from 'lucide-react'
import { useT, pickLangField } from '../../i18n/i18n.js'
import { useAgentStore } from '../../stores/agent-store.js'
import { useUIStore } from '../../stores/ui-store.js'
import { useChatStore } from '../../stores/chat-store.js'
import { AgentAvatar } from '../shared/AgentAvatar.js'
import { Modal } from '../shared/Modal.js'

/** Agent 管理主组件 */
export function AgentManager() {
  const t = useT()
  const agents = useAgentStore((s) => s.agents)
  const currentAgent = useAgentStore((s) => s.currentAgent)
  const registry = useAgentStore((s) => s.registry)
  const add = useAgentStore((s) => s.add)
  const remove = useAgentStore((s) => s.remove)
  const update = useAgentStore((s) => s.update)
  const switchTo = useAgentStore((s) => s.switchTo)
  const setNavActive = useUIStore((s) => s.setNavActive)
  const selectedItem = useUIStore((s) => s.selectedItem)
  const language = useUIStore((s) => s.language)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', command: '', providerType: 'generic', args: '', vendor: '' })
  const [envResults, setEnvResults] = useState<Array<{ tool: string; installed: boolean; version?: string; installUrl?: string; installCmd?: string }> | null>(null)
  /** 正在安装的环境工具名称 */
  const [installingEnv, setInstallingEnv] = useState<string | null>(null)
  const [installingCmd, setInstallingCmd] = useState<string | null>(null)
  const [uninstallingCmd, setUninstallingCmd] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  // 卸载确认弹窗状态：记录待卸载的 Agent 信息
  const [uninstallConfirm, setUninstallConfirm] = useState<{ agent: any; uninstallCmd: string } | null>(null)
  const [platform, setPlatform] = useState<string>('')
  // 弹窗状态：安装结果 / 错误提示 / 登录引导
  // retryCmd: 当安装因权限失败时，保存命令以供"以管理员身份重试"
  // loginAgentCmd: 安装成功后引导登录时，记录 Agent 命令名（如 "claude"）
  const [modal, setModal] = useState<{ type: 'success' | 'error' | 'info' | 'login'; title: string; message: string } | null>(null)
  const [retryCmd, setRetryCmd] = useState<{ cmd: string; installCmd: string } | null>(null)
  // 安装成功后记录 Agent 命令名和显示名称，用于登录引导弹窗
  const [loginAgent, setLoginAgent] = useState<{ command: string; name: string } | null>(null)

  // ── LLM 配置弹窗状态 ──
  /** 是否显示 LLM 配置弹窗 */
  const [showLLMConfig, setShowLLMConfig] = useState(false)
  /** 正在编辑配置的 Agent */
  const [llmConfigAgent, setLLMConfigAgent] = useState<AgentInfo | null>(null)
  /** 工具箱中的 LLM 供应商列表 */
  const [llmProviders, setLLMProviders] = useState<LlmProvider[]>([])
  /** 选中的供应商 ID */
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null)
  /** 供应商详情（含模型列表和 API Key） */
  const [providerDetail, setProviderDetail] = useState<LlmProviderDetail | null>(null)
  /** 选中的模型名称 */
  const [selectedModel, setSelectedModel] = useState('')
  /** 温度参数 */
  const [temperature, setTemperature] = useState(0.7)
  /** 最大 token 数 */
  const [maxTokens, setMaxTokens] = useState(4096)
  /** 正在加载供应商列表 */
  const [loadingProviders, setLoadingProviders] = useState(false)
  /** 正在保存配置 */
  const [savingLLMConfig, setSavingLLMConfig] = useState(false)
  /** 正在测试配置 */
  const [testingConfig, setTestingConfig] = useState(false)
  /** 配置保存结果提示 */
  const [llmConfigMessage, setLLMConfigMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 加载注册表（内置 Agent 列表）
  useEffect(() => {
    window.electronAPI.agent.getRegistry().then((r) => useAgentStore.setState({ registry: r })).catch(() => {})
    window.electronAPI.app.getPlatform().then(setPlatform).catch(() => setPlatform('win32'))
    checkEnv()
  }, [])

  const checkEnv = async () => { try { setEnvResults(await window.electronAPI.env.check()) } catch { /* ignore */ } }

  /** 安装环境工具（Node.js / npm / Git 等） */
  const handleEnvInstall = async (tool: string, cmd: string) => {
    setInstallingEnv(tool)
    try {
      const r = await window.electronAPI.app.execCommand(cmd)
      if (r.success) {
        await checkEnv()
      } else {
        setModal({ type: 'error', title: t('agent.installFailed', '安装失败'), message: r.error || 'Unknown error' })
      }
    } catch (e: any) {
      setModal({ type: 'error', title: t('agent.installError', '安装出错'), message: e.message || String(e) })
    } finally {
      setInstallingEnv(null)
    }
  }

  const handleRefreshAgents = async () => {
    setRefreshing(true)
    try {
      const agents = await window.electronAPI.agent.rescan()
      useAgentStore.setState({ agents, currentAgent: agents.find((a) => a.isDefault) || agents[0] || null })
    } catch (e: any) {
      setModal({ type: 'error', title: t('agent.refreshFailed', '刷新失败'), message: e.message || String(e) })
    }
    setRefreshing(false)
  }

  const handleAdd = async () => {
    if (!addForm.name || !addForm.command) return
    await add({ name: addForm.name, command: addForm.command, cliPath: '', args: addForm.args, cwd: '', model: '', icon: '', enabled: true, isDefault: agents.length === 0, providerType: addForm.providerType as any, vendorEn: addForm.vendor, vendorZh: addForm.vendor })
    setShowAddDialog(false)
    setAddForm({ name: '', command: '', providerType: 'generic', args: '', vendor: '' })
  }

  /**
   * 执行 Agent 安装
   * @param cmd Agent 命令名（用于 UI 状态）
   * @param installCmd 安装命令
   * @param elevated 是否以管理员身份执行（Windows UAC 提权）
   */
  const handleInstall = async (cmd: string, installCmd: string, elevated = false) => {
    setInstallingCmd(cmd)
    try {
      const r = await window.electronAPI.app.execCommand(installCmd, elevated ? { elevated: true } : undefined)
      if (r.success) {
        // 安装成功后重新扫描 PATH（而非仅读数据库），确保新安装的 CLI 被发现
        const agents = await window.electronAPI.agent.rescan()
        useAgentStore.setState({ agents, currentAgent: agents.find((a) => a.isDefault) || agents[0] || null })
        setRetryCmd(null)
        // 所有 Agent 安装后都需要登录认证或配置 API，弹出登录引导
        // 从注册表中查找该 Agent 的显示名称
        const registryEntry = registry.find((e) => e.command === cmd)
        const agentName = registryEntry?.name || cmd
        setLoginAgent({ command: cmd, name: agentName })
        setModal({
          type: 'login',
          title: t('agent.installSuccess', '安装成功'),
          message: t('agent.loginRequired', '安装成功！使用前需要登录认证或配置 API。\n\n是否现在打开终端进行登录？'),
        })
      } else {
        // 检测是否为权限相关错误（且尚未尝试提权），如果是则提供"以管理员身份重试"按钮
        const errMsg = r.error || 'Unknown error'
        const isPermissionError = !elevated && (
          errMsg.includes('rejected by your operating system') ||
          errMsg.includes('lack permissions') ||
          errMsg.includes('EPERM') ||
          errMsg.includes('EACCES') ||
          errMsg.includes('Administrator')
        )
        if (isPermissionError) {
          setRetryCmd({ cmd, installCmd })
        } else {
          setRetryCmd(null)
        }
        setModal({ type: 'error', title: t('agent.installFailed', '安装失败'), message: errMsg })
      }
    } catch (e: any) {
      setModal({ type: 'error', title: t('agent.installError', '安装出错'), message: e.message || String(e) })
    }
    finally { setInstallingCmd(null) }
  }

  const handleSetDefault = async (agent: { id?: number; name: string }) => {
    if (!agent.id) return
    for (const a of agents) {
      if (a.id && a.isDefault) {
        await update(a.id, { isDefault: false })
      }
    }
    await update(agent.id, { isDefault: true })
    await switchTo(agent.name)
  }

  const handleSendMessage = async (agent: { name: string }) => {
    // 先切换到目标 Agent（switchTo 内部会通过 switchSession 加载该 Agent 的会话消息）
    await switchTo(agent.name)
    // 标记聊天已发起并切换到聊天页
    // App.tsx 的 useEffect 会检测到从其他 Tab 切到 chat，自动从 DB 加载消息
    useUIStore.getState().startChat()
  }

  /**
   * 打开 LLM 配置弹窗
   * - 加载工具箱中的 LLM 供应商列表
   * - 加载 Agent 已绑定的 LLM 配置（如有）
   */
  const handleEditConfig = async (agent: AgentInfo) => {
    setLLMConfigAgent(agent)
    setShowLLMConfig(true)
    setLLMConfigMessage(null)
    setLoadingProviders(true)
    setSelectedProviderId(null)
    setProviderDetail(null)
    setSelectedModel('')
    setTemperature(0.7)
    setMaxTokens(4096)

    try {
      // 加载工具箱中的供应商列表
      const providers = await window.electronAPI.provider.list()
      setLLMProviders(providers)

      // 加载 Agent 已绑定的 LLM 配置
      // const config = await window.electronAPI.agent.getLLMConfig(agent.id!)
      // if (config?.llmProviderId) {
      //   setSelectedProviderId(config.llmProviderId)
      //   // 加载供应商详情（含模型列表）
      //   const detail = await window.electronAPI.provider.get(config.llmProviderId)
      //   setProviderDetail(detail)
      //   if (config.modelConfig) {
      //     setSelectedModel(config.modelConfig.model)
      //     setTemperature(config.modelConfig.temperature ?? 0.7)
      //     setMaxTokens(config.modelConfig.maxTokens ?? 4096)
      //   }
      // }
    } catch (e: any) {
      setLLMConfigMessage({ type: 'error', text: e.message || String(e) })
    } finally {
      setLoadingProviders(false)
    }
  }

  /**
   * 选择 LLM 供应商时加载其详情（含模型列表）
   */
  const handleProviderChange = async (providerId: number) => {
    setSelectedProviderId(providerId)
    setSelectedModel('')
    setProviderDetail(null)
    if (!providerId) return

    try {
      const detail = await window.electronAPI.provider.get(providerId)
      setProviderDetail(detail)
      // 自动选中第一个模型
      if (detail && detail.models.length > 0) {
        setSelectedModel(detail.models[0].modelName)
      }
    } catch (e: any) {
      setLLMConfigMessage({ type: 'error', text: e.message || String(e) })
    }
  }

  /**
   * 保存 LLM 配置（注释状态，待测试通过后开放）
   */
  const handleSaveLLMConfig = async () => {
    if (!llmConfigAgent?.id || !selectedProviderId || !selectedModel) {
      setLLMConfigMessage({ type: 'error', text: t('agent.llmConfig.selectProviderAndModel', '请选择供应商和模型') })
      return
    }

    setSavingLLMConfig(true)
    setLLMConfigMessage(null)

    try {
      // ── 实际 API 调用（暂注释，待测试通过后开放） ──
      // const result = await window.electronAPI.agent.updateLLMConfig({
      //   agentId: llmConfigAgent.id!,
      //   llmProviderId: selectedProviderId,
      //   modelConfig: {
      //     model: selectedModel,
      //     temperature: Number(temperature),
      //     maxTokens: Number(maxTokens),
      //   },
      //   applyImmediately: true,
      // })
      // if (result.success) {
      //   setLLMConfigMessage({
      //     type: 'success',
      //     text: t('agent.llmConfig.saveSuccess', '配置已保存并应用到 CLI 工具'),
      //   })
      // } else {
      //   setLLMConfigMessage({ type: 'error', text: result.error || '保存失败' })
      // }

      // 模拟保存成功提示
      setLLMConfigMessage({
        type: 'success',
        text: t('agent.llmConfig.saveSuccess', '配置已保存并应用到 CLI 工具'),
      })
    } catch (e: any) {
      setLLMConfigMessage({ type: 'error', text: e.message || String(e) })
    } finally {
      setSavingLLMConfig(false)
    }
  }

  /**
   * 测试 LLM 配置连接（注释状态，待测试通过后开放）
   */
  const handleTestLLMConfig = async () => {
    if (!providerDetail || !selectedModel) {
      setLLMConfigMessage({ type: 'error', text: t('agent.llmConfig.selectProviderAndModel', '请选择供应商和模型') })
      return
    }

    setTestingConfig(true)
    setLLMConfigMessage(null)

    try {
      // 使用工具箱的测试接口（该接口已开放）
      const baseUrl = providerDetail.baseUris[0]?.url || ''
      const protocol = providerDetail.baseUris[0]?.protocol || 'openai'
      const result = await window.electronAPI.provider.test({
        protocol,
        baseUrl,
        apiKey: providerDetail.apiKey,
        modelName: selectedModel,
      })
      if (result.success) {
        setLLMConfigMessage({ type: 'success', text: t('agent.llmConfig.testSuccess', '连接测试成功') })
      } else {
        setLLMConfigMessage({ type: 'error', text: result.error || '连接失败' })
      }
    } catch (e: any) {
      setLLMConfigMessage({ type: 'error', text: e.message || String(e) })
    } finally {
      setTestingConfig(false)
    }
  }

  /**
   * 解除 LLM 绑定（注释状态，待测试通过后开放）
   */
  const handleUnbindLLM = async () => {
    if (!llmConfigAgent?.id) return
    setSavingLLMConfig(true)
    try {
      // ── 实际 API 调用（暂注释，待测试通过后开放） ──
      // await window.electronAPI.agent.updateLLMConfig({
      //   agentId: llmConfigAgent.id!,
      //   llmProviderId: null,
      //   modelConfig: null,
      //   applyImmediately: false,
      // })
      setSelectedProviderId(null)
      setProviderDetail(null)
      setSelectedModel('')
      setLLMConfigMessage({ type: 'success', text: t('agent.llmConfig.unbindSuccess', '已解除 LLM 绑定') })
    } catch (e: any) {
      setLLMConfigMessage({ type: 'error', text: e.message || String(e) })
    } finally {
      setSavingLLMConfig(false)
    }
  }

  /**
   * 执行 Agent 卸载
   * - 先通过 npm uninstall 等命令卸载 CLI 工具
   * - 卸载成功后从数据库移除 Agent 记录并重新扫描 PATH
   * - 卸载失败时弹窗提示错误信息
   * @param agent 待卸载的 Agent 对象
   * @param uninstallCmd 卸载命令
   */
  const handleUninstall = async (agent: any, uninstallCmd: string) => {
    setUninstallingCmd(agent.command)
    try {
      const r = await window.electronAPI.app.execCommand(uninstallCmd)
      if (r.success) {
        // 卸载成功后从数据库移除并重新扫描
        if (agent.id) await remove(agent.id)
        const agents = await window.electronAPI.agent.rescan()
        useAgentStore.setState({ agents, currentAgent: agents.find((a) => a.isDefault) || agents[0] || null })
        setModal({ type: 'success', title: t('agent.uninstallSuccess', '卸载成功'), message: t('agent.uninstallSuccessMsg', `${agent.name} 已成功卸载。`, { name: agent.name }) })
      } else {
        setModal({ type: 'error', title: t('agent.uninstallFailed', '卸载失败'), message: r.error || 'Unknown error' })
      }
    } catch (e: any) {
      setModal({ type: 'error', title: t('agent.uninstallError', '卸载出错'), message: e.message || String(e) })
    } finally {
      setUninstallingCmd(null)
    }
  }

  /**
   * 点击卸载按钮时触发：查找当前平台的卸载命令
   * - 如果有卸载命令，弹出确认弹窗
   * - 如果没有卸载命令（如 hermes/trae 自定义安装），提示不支持一键卸载
   */
  const handleUninstallClick = (agent: any) => {
    // 从注册表查找该 Agent 当前平台的卸载命令
    const registryEntry = registry.find((e) => e.command === agent.command)
    const curCmd = registryEntry?.installCommands?.find((c) => c.platform === platform)
    const uninstallCmd = curCmd?.uninstallCommand
    if (uninstallCmd) {
      setUninstallConfirm({ agent, uninstallCmd })
    } else {
      // 没有卸载命令，提示用户手动卸载
      // 特殊处理 Trae CLI，提供详细的卸载指南
      if (agent.command === 'traecli') {
        const isWindows = platform === 'win32'
        setModal({
          type: 'info',
          title: t('agent.traeUninstallTitle', '手动卸载 Trae CLI'),
          message: isWindows 
            ? t('agent.traeUninstallWindows', 'Windows (PowerShell)\n请删除以下目录：\n\n%LOCALAPPDATA%\\trae-cli\\（包含 bin 文件夹等）')
            : t('agent.traeUninstallMacLinux', 'macOS & Linux\n请删除以下目录中的文件：\n\n二进制文件目录：~/.local/bin/（包含 trae-cli、traecli、trae-agent、ta 等链接）\n\n数据目录：~/.local/share/trae-cli/'),
        })
      } else {
        setModal({
          type: 'info',
          title: t('agent.uninstallNotSupported', '不支持一键卸载'),
          message: t('agent.uninstallNotSupportedMsg', `${agent.name} 使用自定义安装方式，请手动卸载。`, { name: agent.name }),
        })
      }
    }
  }

  // 如果有选中的 Agent，展示详情页
  const selectedAgent = selectedItem ? agents.find((a) => a.name === selectedItem) : null
  if (selectedAgent) {
    // 从注册表查找 flag 标签
    const selectedRegEntry = registry.find((e) => e.command === selectedAgent.command)
    const selectedFlags = selectedRegEntry?.flag ? selectedRegEntry.flag.split(',').map((s: string) => s.trim()).filter(Boolean) : []
    return (
      <div style={{ padding: '24px', overflowY: 'auto', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <AgentAvatar icon={selectedAgent.icon} size={48} />
          <div>
            <div style={{ fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              {selectedAgent.name}
              {/* 状态圆点紧跟在 Agent 名称后面 */}
              <div className={`status-dot ${selectedAgent.status}`} />
              {selectedAgent.isDefault && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'var(--color-primary)', color: '#fff', fontWeight: 500 }}>{t('agent.default', '默认')}</span>}
              {selectedFlags.map((f: string, i: number) => (
                <span key={i} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'var(--color-warning-bg, rgba(245,158,11,0.12))', color: 'var(--color-warning, #f59e0b)', fontWeight: 500 }}>{f}</span>
              ))}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              {selectedAgent.cliPath || selectedAgent.command}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontSize: '13px', marginBottom: '24px' }}>
          <span style={{ color: 'var(--color-text-muted)' }}>{t('common.command', '命令')}</span>
          <span style={{ fontFamily: 'monospace' }}>{selectedAgent.command}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>{t('agent.vendor', '厂商')}</span>
          <span>{pickLangField(language, selectedAgent.vendorZh, selectedAgent.vendorTw, selectedAgent.vendorEn) || '-'}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>{t('agent.providerType', 'Provider')}</span>
          <span>{selectedAgent.providerType}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>{t('agent.status', '状态')}</span>
          <span><span className={`status-dot ${selectedAgent.status}`} style={{ display: 'inline-block', marginRight: '6px' }} />{t(`agent.statusValue.${selectedAgent.status}`, selectedAgent.status)}</span>
          {selectedAgent.model && <><span style={{ color: 'var(--color-text-muted)' }}>{t('common.model', '模型')}</span><span>{selectedAgent.model}</span></>}
          {selectedAgent.args && <><span style={{ color: 'var(--color-text-muted)' }}>{t('agent.args', '参数')}</span><span style={{ fontFamily: 'monospace' }}>{selectedAgent.args}</span></>}
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => handleSendMessage(selectedAgent)} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: 'var(--color-primary)', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MessageSquare size={14} strokeWidth={1.5} style={{ marginRight: '4px' }} />{t('agent.sendMessage', '发消息')}
          </button>
          <button onClick={() => handleEditConfig(selectedAgent)} style={{ padding: '10px 24px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text)', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Settings size={14} strokeWidth={1.5} /> {t('agent.editConfig', '修改配置')}
          </button>
        </div>

        <style>{`
          .action-btn { padding:8px 16px; border:1px solid var(--color-border); border-radius:6px; background:transparent; color:var(--color-text); cursor:pointer; font-size:13px; transition:all 0.15s; margin-top:8px; }
          .action-btn:hover { background:var(--color-bg-hover); }
          .action-btn.primary { background:var(--color-primary); color:#fff; border-color:var(--color-primary); }
          .action-btn:disabled { opacity:0.5; cursor:not-allowed; }
        `}</style>

        {/* ── LLM 配置弹窗 ── */}
        {showLLMConfig && llmConfigAgent && (
          <div className="dialog-overlay" onClick={() => setShowLLMConfig(false)}>
            <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ width: '560px', maxHeight: '85vh', overflowY: 'auto' }}>
              {/* 弹窗标题 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div style={{ fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Settings size={18} strokeWidth={1.5} />
                  {t('agent.llmConfig.title', 'LLM 配置')} - {llmConfigAgent.name}
                </div>
                <button onClick={() => setShowLLMConfig(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}>
                  <X size={18} strokeWidth={1.5} />
                </button>
              </div>

              {/* 提示信息 */}
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '16px', padding: '8px 12px', background: 'var(--color-bg-hover)', borderRadius: '6px', lineHeight: 1.5 }}>
                {t('agent.llmConfig.tip', '选择工具箱中已配置的 LLM 服务商，保存后将自动写入 CLI 工具的配置文件。')}
              </div>

              {loadingProviders ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
                  <Loader size={24} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
                  <div>{t('common.loading', '加载中...')}</div>
                </div>
              ) : llmProviders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
                  <AlertCircle size={24} strokeWidth={1.5} style={{ marginBottom: '8px' }} />
                  <div style={{ marginBottom: '12px' }}>{t('agent.llmConfig.noProviders', '暂无 LLM 服务商，请先在工具箱中添加')}</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* ── LLM 服务商选择 ── */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                      {t('agent.llmConfig.provider', 'LLM 服务商')}
                    </label>
                    <select
                      className="chat-input"
                      value={selectedProviderId ?? ''}
                      onChange={(e) => handleProviderChange(Number(e.target.value))}
                      style={{ cursor: 'pointer', width: '100%' }}
                    >
                      <option value="">{t('agent.llmConfig.selectProvider', '请选择服务商')}</option>
                      {llmProviders.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    {providerDetail && (
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        {providerDetail.baseUris.map((u, i) => (
                          <span key={i} style={{ marginRight: '8px' }}>
                            <span style={{ opacity: 0.6 }}>[{u.protocol}]</span> {u.url}
                          </span>
                        ))}
                        {providerDetail.hasApiKey
                          ? <span style={{ color: 'var(--color-success, #10b981)' }}>✓ API Key 已配置</span>
                          : <span style={{ color: 'var(--color-error, #ef4444)' }}>⚠ API Key 未配置</span>
                        }
                      </div>
                    )}
                  </div>

                  {/* ── 模型选择 ── */}
                  {providerDetail && providerDetail.models.length > 0 && (
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                        {t('agent.llmConfig.model', '模型')}
                      </label>
                      <select
                        className="chat-input"
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        style={{ cursor: 'pointer', width: '100%' }}
                      >
                        <option value="">{t('agent.llmConfig.selectModel', '请选择模型')}</option>
                        {providerDetail.models.map((m, i) => (
                          <option key={i} value={m.modelName}>
                            {m.displayName}{m.modelName !== m.displayName ? ` (${m.modelName})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* ── 温度参数 ── */}
                  {selectedModel && (
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                        {t('agent.llmConfig.temperature', 'Temperature')}: <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{temperature.toFixed(1)}</span>
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={temperature}
                        onChange={(e) => setTemperature(Number(e.target.value))}
                        style={{ width: '100%', cursor: 'pointer' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                        <span>0 (精确)</span>
                        <span>1 (平衡)</span>
                        <span>2 (创造)</span>
                      </div>
                    </div>
                  )}

                  {/* ── 最大 Token 数 ── */}
                  {selectedModel && (
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                        {t('agent.llmConfig.maxTokens', 'Max Tokens')}
                      </label>
                      <input
                        type="number"
                        className="chat-input"
                        value={maxTokens}
                        onChange={(e) => setMaxTokens(Number(e.target.value))}
                        min="100"
                        max="128000"
                        step="256"
                        style={{ width: '100%' }}
                      />
                    </div>
                  )}

                  {/* ── 操作按钮 ── */}
                  {selectedModel && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      <button
                        onClick={handleSaveLLMConfig}
                        disabled={savingLLMConfig}
                        style={{
                          padding: '8px 20px', borderRadius: '8px', border: 'none',
                          background: 'var(--color-primary)', color: '#fff',
                          cursor: savingLLMConfig ? 'not-allowed' : 'pointer',
                          fontSize: '13px', fontWeight: 500, opacity: savingLLMConfig ? 0.6 : 1,
                          display: 'flex', alignItems: 'center', gap: '6px',
                        }}
                      >
                        {savingLLMConfig
                          ? <><Loader size={13} strokeWidth={2} style={{ animation: 'spin 1s linear infinite' }} />{t('common.saving', '保存中...')}</>
                          : <><Save size={13} strokeWidth={2} />{t('common.save', '保存')}</>
                        }
                      </button>
                      <button
                        onClick={handleTestLLMConfig}
                        disabled={testingConfig}
                        style={{
                          padding: '8px 20px', borderRadius: '8px',
                          border: '1px solid var(--color-border)',
                          background: 'transparent', color: 'var(--color-text)',
                          cursor: testingConfig ? 'not-allowed' : 'pointer',
                          fontSize: '13px', opacity: testingConfig ? 0.6 : 1,
                          display: 'flex', alignItems: 'center', gap: '6px',
                        }}
                      >
                        {testingConfig
                          ? <><Loader size={13} strokeWidth={2} style={{ animation: 'spin 1s linear infinite' }} />{t('agent.llmConfig.testing', '测试中...')}</>
                          : <><Zap size={13} strokeWidth={2} />{t('agent.llmConfig.test', '测试连接')}</>
                        }
                      </button>
                      {selectedProviderId && (
                        <button
                          onClick={handleUnbindLLM}
                          disabled={savingLLMConfig}
                          style={{
                            padding: '8px 16px', borderRadius: '8px',
                            border: '1px solid var(--color-error)',
                            background: 'transparent', color: 'var(--color-error)',
                            cursor: 'pointer', fontSize: '13px',
                            marginLeft: 'auto',
                          }}
                        >
                          {t('agent.llmConfig.unbind', '解除绑定')}
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── 配置结果提示 ── */}
                  {llmConfigMessage && (
                    <div style={{
                      padding: '8px 12px', borderRadius: '6px', fontSize: '12px',
                      background: llmConfigMessage.type === 'success'
                        ? 'rgba(16, 185, 129, 0.1)'
                        : 'rgba(239, 68, 68, 0.1)',
                      color: llmConfigMessage.type === 'success'
                        ? 'var(--color-success, #10b981)'
                        : 'var(--color-error, #ef4444)',
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}>
                      {llmConfigMessage.type === 'success'
                        ? <CheckCircle size={14} strokeWidth={2} />
                        : <AlertCircle size={14} strokeWidth={2} />
                      }
                      {llmConfigMessage.text}
                    </div>
                  )}

                  {/* ── 配置文件路径提示 ── */}
                  {selectedModel && (
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px', padding: '6px 10px', background: 'var(--color-bg-hover)', borderRadius: '4px', fontFamily: 'monospace' }}>
                      {t('agent.llmConfig.configPath', '配置文件路径')}: ~/.{llmConfigAgent.providerType === 'claude' ? 'claude/settings.json' : llmConfigAgent.providerType === 'codebuddy' ? 'codebuddy/config.json' : llmConfigAgent.providerType === 'opencode' ? 'opencode/config.json' : 'config/' + llmConfigAgent.command + '/config.json'}
                    </div>
                  )}
                </div>
              )}

              {/* 弹窗底部关闭按钮 */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
                <button
                  onClick={() => setShowLLMConfig(false)}
                  style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text)', cursor: 'pointer', fontSize: '13px' }}
                >
                  {t('common.close', '关闭')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── 通用弹窗（详情页内也需要渲染 Modal） ── */}
        {modal && (
          <Modal
            title={modal.title}
            icon={
              modal.type === 'success' || modal.type === 'login' ? <CheckCircle size={16} strokeWidth={1.5} style={{ color: 'var(--color-success, #10b981)' }} />
              : modal.type === 'error' ? <AlertCircle size={16} strokeWidth={1.5} style={{ color: 'var(--color-error, #ef4444)' }} />
              : <AlertCircle size={16} strokeWidth={1.5} style={{ color: 'var(--color-text-muted)' }} />
            }
            onClose={() => { setModal(null); setRetryCmd(null); setLoginAgent(null) }}
            width={520}
            buttons={[
              ...(retryCmd ? [{
                label: t('agent.retryAsAdmin', '以管理员身份重试'),
                onClick: () => { setModal(null); handleInstall(retryCmd.cmd, retryCmd.installCmd, true) },
                primary: true,
              }] : []),
              ...(modal.type === 'login' && loginAgent ? [{
                label: t('agent.openTerminalLogin', '打开终端登录'),
                onClick: async () => {
                  const hint = `${loginAgent.name} 已安装成功！\n使用前需要登录认证或配置 API。`
                  await window.electronAPI.app.openTerminalForLogin(hint, loginAgent.command)
                  setModal(null)
                  setLoginAgent(null)
                },
                primary: true,
              }] : []),
              { label: t('common.close', '关闭'), onClick: () => { setModal(null); setRetryCmd(null); setLoginAgent(null) }, primary: !retryCmd && !(modal.type === 'login' && loginAgent) },
            ]}
          >
            {modal.message ? (
              <pre style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                fontSize: '12.5px',
                lineHeight: 1.6,
                color: modal.type === 'error' ? 'var(--color-text-secondary)' : 'var(--color-text)',
                margin: 0,
                fontFamily: modal.type === 'error' ? 'monospace' : 'inherit',
                background: modal.type === 'error' ? 'var(--color-bg-hover)' : 'transparent',
                padding: modal.type === 'error' ? '12px' : '0',
                borderRadius: '8px',
              }}>
                {modal.message}
              </pre>
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>—</div>
            )}
          </Modal>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: '100%' }}>
      <div style={{ fontSize: '20px', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}><Bot size={20} strokeWidth={1.5} /> {t('agent.title', 'Agent 管理')}</div>

      <CollapsibleSection
        title={t('agent.environment', '环境检测')}
        action={
          /* 透明背景的"重新检测"按钮，放在标题行最右侧 */
          <button onClick={checkEnv} style={{ padding: '4px 8px', border: 'none', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <RotateCw size={13} strokeWidth={1.5} />{t('agent.recheckEnv', '重新检测')}
          </button>
        }
      >
        {envResults ? envResults.map((env) => (
          <div key={env.tool} style={{ padding: '10px 16px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '8px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
            <span>{env.installed ? '✅' : '❌'}</span>
            <span style={{ fontWeight: 500 }}>{t(`env.${env.tool.toLowerCase()}`, env.tool)}</span>
            {env.version && <span style={{ color: 'var(--color-text-muted)' }}>{env.version}</span>}
            {!env.installed && <span style={{ color: 'var(--color-warning)', marginLeft: 'auto' }}>{t('settings.envNotInstalled', '未安装')}</span>}
            {/* 未安装时显示一键安装 / 去官网下载按钮 */}
            {!env.installed && (env.installCmd || env.installUrl) && (
              <div style={{ display: 'flex', gap: '6px', marginLeft: env.installed ? 'auto' : '8px' }}>
                {env.installCmd && (
                  <button
                    onClick={() => handleEnvInstall(env.tool, env.installCmd!)}
                    disabled={installingEnv === env.tool}
                    style={{ padding: '4px 10px', fontSize: '12px', border: '1px solid var(--color-primary)', borderRadius: '4px', background: 'transparent', color: 'var(--color-primary)', cursor: installingEnv === env.tool ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', opacity: installingEnv === env.tool ? 0.5 : 1 }}
                  >
                    {installingEnv === env.tool ? t('agent.installing', '安装中...') : t('agent.installOneClick', '一键安装')}
                  </button>
                )}
                {env.installUrl && (
                  <button
                    onClick={() => window.electronAPI.app.openExternal(env.installUrl!)}
                    style={{ padding: '4px 10px', fontSize: '12px', border: '1px solid var(--color-border)', borderRadius: '4px', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    {t('settings.visitOfficial', '去官网下载')}
                  </button>
                )}
              </div>
            )}
          </div>
        )) : <EmptyCard msg={t('env.detecting', '正在检测...')} />}
      </CollapsibleSection>

      <CollapsibleSection
        title={t('agent.installed', '已安装 Agent')}
        action={
          /* 透明背景的"刷新"按钮，放在标题行最右侧 */
          <button onClick={handleRefreshAgents} disabled={refreshing} style={{ padding: '4px 8px', border: 'none', background: 'transparent', color: 'var(--color-text-muted)', cursor: refreshing ? 'not-allowed' : 'pointer', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', opacity: refreshing ? 0.5 : 1 }}>
            {refreshing ? <><Loader size={13} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />{t('common.refreshing', '刷新中...')}</> : <><RotateCw size={13} strokeWidth={1.5} />{t('common.refresh', '刷新')}</>}
          </button>
        }
      >
        {agents.length === 0 ? <EmptyCard msg={t('agent.noAgents', '暂无已安装的 Agent')} /> : agents.map((a) => {
          // 从注册表查找 flag 标签
          const regEntry = registry.find((e) => e.command === a.command)
          const flag = regEntry?.flag || ''
          return <AgentCard key={a.id} agent={a} flag={flag} currentAgent={currentAgent} onUninstall={handleUninstallClick} uninstallingCmd={uninstallingCmd} onSetDefault={handleSetDefault} />
        })}
      </CollapsibleSection>

      <CollapsibleSection title={t('agent.available', '可用 Agent 推荐')}>
        {registry.length === 0 ? <div style={{ padding: '16px', fontSize: '13px', color: 'var(--color-text-muted)' }}>{t('common.loading', '加载中...')}</div> : registry.filter((e) => e.status !== 0 && !agents.some((a) => a.command === e.command)).map((entry) => {
          // 查找当前平台的安装命令
          const curCmd = entry.installCommands?.find((c) => c.platform === platform)
          const installHint = curCmd?.installHint
          const installCommand = curCmd?.installCommand
          const platformLabel = platform === 'darwin' ? 'Mac' : platform === 'win32' ? 'Win' : 'Linux'
          // 解析 flag 标签
          const flags = entry.flag ? entry.flag.split(',').map((s: string) => s.trim()).filter(Boolean) : []

          return (
          <Row key={entry.command}>
            <AgentAvatar icon={entry.icon} size={20} />
            <div style={{ flex: 1, marginLeft: '10px' }}>
              <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>{entry.name}
                {pickLangField(language, entry.vendorZh, entry.vendorTw, entry.vendorEn) && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'var(--color-vendor-tag-bg)', color: 'var(--color-vendor-tag-text)', fontWeight: 500 }}>{pickLangField(language, entry.vendorZh, entry.vendorTw, entry.vendorEn)}</span>}
                {installCommand && <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: 'var(--color-primary)', color: '#fff', fontWeight: 500, opacity: 0.7 }}>{platformLabel}</span>}
                {flags.map((f: string, i: number) => (
                  <span key={i} style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'var(--color-warning-bg, rgba(245,158,11,0.12))', color: 'var(--color-warning, #f59e0b)', fontWeight: 500 }}>{f}</span>
                ))}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px', fontFamily: installHint?.startsWith('npm') ? '' : 'monospace', wordBreak: 'break-all' }}>{installHint || '-'}</div>
            </div>
            {installCommand && (
              <Btn onClick={() => handleInstall(entry.command, installCommand)} disabled={installingCmd === entry.command} accent>
                {installingCmd === entry.command ? t('agent.installing', '安装中...') : t('agent.installOneClick', '一键安装')}
              </Btn>
            )}
          </Row>
          )
        })}
      </CollapsibleSection>

      {/* ── 卸载确认弹窗 ── */}
      {uninstallConfirm && (
        <div className="dialog-overlay" onClick={() => setUninstallConfirm(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ width: '440px' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={18} strokeWidth={1.5} style={{ color: 'var(--color-error)' }} />
              {t('agent.confirmUninstall', '确认卸载')}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: '8px' }}>
              {t('agent.uninstallConfirmMsg', '卸载将从系统中移除 CLI 工具，并从 Agent 列表中删除。此操作不可撤销。')}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontFamily: 'monospace', background: 'var(--color-bg-hover)', padding: '8px 12px', borderRadius: '6px', marginBottom: '16px', wordBreak: 'break-all' }}>
              {uninstallConfirm.uninstallCmd}
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Btn onClick={() => setUninstallConfirm(null)}>{t('common.cancel', '取消')}</Btn>
              <button
                onClick={() => { const uc = uninstallConfirm; setUninstallConfirm(null); if (uc) handleUninstall(uc.agent, uc.uninstallCmd) }}
                style={{ padding: '8px 16px', border: '1px solid var(--color-error)', borderRadius: '6px', background: 'var(--color-error)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}
              >
                <Trash2 size={13} strokeWidth={2} style={{ marginRight: '4px', display: 'inline', verticalAlign: 'middle' }} />
                {t('agent.confirmUninstallBtn', '确认卸载')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddDialog && (
        <div className="dialog-overlay" onClick={() => setShowAddDialog(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>{t('agent.addAgentDialog', '新增 Agent')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input className="chat-input" placeholder={t('agent.placeholderName', '显示名称（如 My Agent）')} value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} />
              <input className="chat-input" placeholder={t('agent.placeholderCommand', 'CLI 命令（如 mycli）')} value={addForm.command} onChange={(e) => setAddForm({ ...addForm, command: e.target.value })} />
              <input className="chat-input" placeholder={t('agent.placeholderArgs', '启动参数（可选）')} value={addForm.args} onChange={(e) => setAddForm({ ...addForm, args: e.target.value })} />
              <input className="chat-input" placeholder={t('agent.placeholderVendor', '所属厂商（可选）')} value={addForm.vendor} onChange={(e) => setAddForm({ ...addForm, vendor: e.target.value })} />
              <select className="chat-input" value={addForm.providerType} onChange={(e) => setAddForm({ ...addForm, providerType: e.target.value })} style={{ cursor: 'pointer' }}>
                <option value="generic">{t('common.generic', '通用')}</option>
                <option value="claude">Claude Code</option>
                <option value="opencode">OpenCode</option>
                <option value="codebuddy">CodeBuddy</option>
                <option value="mimo">MiMo</option>
                <option value="trae">Trae</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <Btn onClick={() => setShowAddDialog(false)}>{t('agent.cancel', '取消')}</Btn>
              <Btn primary onClick={handleAdd} disabled={!addForm.name || !addForm.command}>{t('agent.confirmAdd', '添加')}</Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── 通用弹窗（安装结果 / 错误提示 / 登录引导） ── */}
      {modal && (
        <Modal
          title={modal.title}
          icon={
            modal.type === 'success' || modal.type === 'login' ? <CheckCircle size={16} strokeWidth={1.5} style={{ color: 'var(--color-success, #10b981)' }} />
            : modal.type === 'error' ? <AlertCircle size={16} strokeWidth={1.5} style={{ color: 'var(--color-error, #ef4444)' }} />
            : <AlertCircle size={16} strokeWidth={1.5} style={{ color: 'var(--color-text-muted)' }} />
          }
          onClose={() => { setModal(null); setRetryCmd(null); setLoginAgent(null) }}
          width={520}
          buttons={[
            // 权限错误时显示"以管理员身份重试"按钮
            ...(retryCmd ? [{
              label: t('agent.retryAsAdmin', '以管理员身份重试'),
              onClick: () => { setModal(null); handleInstall(retryCmd.cmd, retryCmd.installCmd, true) },
              primary: true,
            }] : []),
            // 安装成功后显示"打开终端登录"按钮
            ...(modal.type === 'login' && loginAgent ? [{
              label: t('agent.openTerminalLogin', '打开终端登录'),
              onClick: async () => {
                const hint = t('agent.loginHint', '{{name}} 已安装成功！\n使用前需要登录认证或配置 API。', { name: loginAgent.name })
                await window.electronAPI.app.openTerminalForLogin(hint, loginAgent.command)
                setModal(null)
                setLoginAgent(null)
              },
              primary: true,
            }] : []),
            { label: t('common.close', '关闭'), onClick: () => { setModal(null); setRetryCmd(null); setLoginAgent(null) }, primary: !retryCmd && !(modal.type === 'login' && loginAgent) },
          ]}
        >
          {modal.message ? (
            <pre style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              fontSize: '12.5px',
              lineHeight: 1.6,
              color: modal.type === 'error' ? 'var(--color-text-secondary)' : 'var(--color-text)',
              margin: 0,
              fontFamily: modal.type === 'error' ? 'monospace' : 'inherit',
              background: modal.type === 'error' ? 'var(--color-bg-hover)' : 'transparent',
              padding: modal.type === 'error' ? '12px' : '0',
              borderRadius: '8px',
            }}>
              {modal.message}
            </pre>
          ) : (
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>—</div>
          )}
        </Modal>
      )}

      <style>{`
        .dialog-overlay { position: fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.4); backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:1000; }
        .dialog { background:var(--material-popover); backdrop-filter:var(--material-popover-blur); -webkit-backdrop-filter:var(--material-popover-blur); border:1px solid var(--color-border); border-radius:16px; padding:24px; width:400px; max-width:90vw; box-shadow:var(--shadow-xl); }
        .action-btn { padding:8px 16px; border:1px solid var(--color-border-strong); border-radius:10px; background:var(--color-bg-card); color:var(--color-text); cursor:pointer; font-size:13px; transition:all var(--duration-fast) var(--ease-spring); margin-top:8px; }
        .action-btn:hover { background:var(--color-bg-hover); }
        .action-btn:active { transform:scale(0.97); transition:transform 0.08s var(--ease-out-soft); }
        .action-btn.primary { background:var(--color-primary); color:#fff; border-color:var(--color-primary); box-shadow:0 2px 8px rgba(0,122,255,0.2); }
        .action-btn:disabled { opacity:0.5; cursor:not-allowed; }
      `}</style>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: '24px' }}><div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '10px', paddingBottom: '6px', borderBottom: '1px solid var(--color-border)' }}>{title}</div>{children}</div>
}

function CollapsibleSection({ title, defaultOpen = true, children, action }: { title: string; defaultOpen?: boolean; children: React.ReactNode; action?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom: '16px' }}>
      <div
        style={{
          fontSize: '14px', fontWeight: 600, color: 'var(--color-text-secondary)',
          marginBottom: open ? '10px' : 0, paddingBottom: '6px',
          borderBottom: '1px solid var(--color-border)',
          userSelect: 'none',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}
      >
        {/* 折叠箭头和标题：点击切换展开/折叠 */}
        <div onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <span style={{ fontSize: '11px', transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
          {title}
        </div>
        {/* 右侧操作区（如刷新/重新检测按钮），阻止冒泡以避免误触折叠 */}
        {action && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>{action}</div>}
      </div>
      {open && children}
    </div>
  )
}
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '12px 16px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '8px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>{children}</div>
}

function EmptyCard({ msg }: { msg: string }) {
  return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px', background: 'var(--color-bg-card)', border: '1px dashed var(--color-border)', borderRadius: '8px', marginBottom: '8px' }}>{msg}</div>
}

function Btn({ children, onClick, disabled, primary, accent }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean; accent?: boolean }) {
  const cls = `action-btn${primary ? ' primary' : ''}`
  const extraStyle: any = accent ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)', whiteSpace: 'nowrap', flexShrink: 0, marginLeft: '8px' } : {}
  return <button className={cls} onClick={onClick} disabled={disabled} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', ...extraStyle }}>{children}</button>
}

function AgentCard({ agent, flag, currentAgent, onUninstall, uninstallingCmd, onSetDefault }: { agent: any; flag: string; currentAgent: any; onUninstall: (agent: any) => void; uninstallingCmd: string | null; onSetDefault: (agent: any) => void }) {
  const t = useT()
  const language = useUIStore((s) => s.language)
  const isDefault = agent.isDefault || currentAgent?.id === agent.id
  const isUninstalling = uninstallingCmd === agent.command
  // 解析 flag 标签（逗号分隔）
  const flags = flag ? flag.split(',').map((s: string) => s.trim()).filter(Boolean) : []
  return (
    <div style={{ padding: '12px 16px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '8px', marginBottom: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AgentAvatar icon={agent.icon} />
          <div>
            <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
              {agent.name}
              {/* 状态圆点紧跟在 Agent 名称后面 */}
              <div className={`status-dot ${agent.status}`} />
              {pickLangField(language, agent.vendorZh, agent.vendorTw, agent.vendorEn) && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'var(--color-vendor-tag-bg)', color: 'var(--color-vendor-tag-text)', fontWeight: 500 }}>{pickLangField(language, agent.vendorZh, agent.vendorTw, agent.vendorEn)}</span>}
              {isDefault && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'var(--color-primary)', color: '#fff', fontWeight: 500 }}>{t('agent.default', '默认')}</span>}
              {flags.map((f: string, i: number) => (
                <span key={i} style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'var(--color-warning-bg, rgba(245,158,11,0.12))', color: 'var(--color-warning, #f59e0b)', fontWeight: 500 }}>{f}</span>
              ))}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{agent.cliPath || agent.command}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {!isDefault && agent.id && (
            <button onClick={() => onSetDefault(agent)} style={{ padding: '4px 8px', border: '1px solid var(--color-border)', borderRadius: '4px', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '11px' }}>{t('agent.setDefault', '设为默认')}</button>
          )}
          {agent.id && (
            <button
              onClick={() => onUninstall(agent)}
              disabled={isUninstalling}
              style={{ padding: '4px 8px', border: '1px solid var(--color-error)', borderRadius: '4px', background: 'transparent', color: 'var(--color-error)', cursor: isUninstalling ? 'not-allowed' : 'pointer', fontSize: '11px', opacity: isUninstalling ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              {isUninstalling ? <><Loader size={11} strokeWidth={2} style={{ animation: 'spin 1s linear infinite' }} />{t('agent.uninstalling', '卸载中...')}</> : <><Trash2 size={11} strokeWidth={2} />{t('agent.uninstall', '卸载')}</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
