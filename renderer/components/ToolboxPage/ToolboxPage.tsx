/**
 * 工具箱页面组件（第三栏）
 *
 * 功能:
 *   - 展示 LLM 供应商详情表单（名称/描述/官网/baseUri/API Key/模型列表）
 *   - 默认查看模式（只读），防止用户误操作导致数据出错
 *   - 通过右键菜单「修改」进入编辑模式，或点击「新增」进入新增模式
 *   - API Key 加密存储（需先在设置-安全设置中设置密码）
 *   - 模型测试按钮（发送简单请求验证连接）
 *
 * 供应商数据通过 IPC 从主进程获取，API Key 加解密在主进程完成。
 */
import { useState, useEffect, useRef } from 'react'
import { Wrench, Plus, Trash2, Save, Zap, ExternalLink, Lock, Eye, EyeOff, Unlock, X, Search, Image } from 'lucide-react'
import { useT } from '../../i18n/i18n.js'
import { useUIStore } from '../../stores/ui-store.js'
import { Modal } from '../shared/Modal.js'

/** API 协议选项 */
const API_PROTOCOLS = [
  { value: 'openai', label: 'OpenAI API' },
  { value: 'anthropic', label: 'Anthropic Messages API' },
  { value: 'gemini', label: 'Gemini API' },
]

/** 工具箱页面主组件 */
export function ToolboxPage() {
  const t = useT()
  const selectedItem = useUIStore((s) => s.selectedItem)
  const setSelectedItem = useUIStore((s) => s.setSelectedItem)
  const toolboxEditMode = useUIStore((s) => s.toolboxEditMode)
  const setToolboxEditMode = useUIStore((s) => s.setToolboxEditMode)

  // 判断当前是否可编辑：新增模式 或 编辑模式
  const isNew = selectedItem === '__new__'
  const isEditable = isNew || toolboxEditMode

  // 表单状态
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [website, setWebsite] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [baseUris, setBaseUris] = useState<Array<{ protocol: string; url: string }>>([{ protocol: 'openai', url: '' }])
  const [apiKey, setApiKey] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [models, setModels] = useState<Array<{ displayName: string; modelName: string }>>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<number | null>(null) // 正在测试的模型索引
  const [showApiKey, setShowApiKey] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [hasMasterPwd, setHasMasterPwd] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 模板搜索下拉框状态
  const [templateSearch, setTemplateSearch] = useState('') // 搜索关键词
  const [templateResults, setTemplateResults] = useState<ProviderTemplate[]>([]) // 搜索结果
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false) // 是否显示下拉
  const [templateSearchLoading, setTemplateSearchLoading] = useState(false)
  const templateDropdownRef = useRef<HTMLDivElement>(null) // 下拉框 ref，用于点击外部关闭

  // 解锁弹窗状态
  const [showUnlockDialog, setShowUnlockDialog] = useState(false)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [unlockTrustDevice, setUnlockTrustDevice] = useState(false) // 解锁时是否记住密码
  const [unlockError, setUnlockError] = useState<string | null>(null)

  // 检查密码状态（是否已设置主密码 + 是否已解锁）
  useEffect(() => {
    Promise.all([
      window.electronAPI.masterPassword.has(),
      window.electronAPI.masterPassword.isUnlocked(),
    ]).then(([has, unlocked]) => {
      setHasMasterPwd(has)
      setIsUnlocked(unlocked)
    })
  }, [selectedItem])

  // 加载供应商详情
  useEffect(() => {
    if (selectedItem === '__new__') {
      // 新增模式：重置表单
      setName('')
      setDescription('')
      setWebsite('')
      setLogoUrl('')
      setBaseUris([{ protocol: 'openai', url: '' }])
      setApiKey('')
      setHasApiKey(false)
      setModels([])
      setShowApiKey(false)
      return
    }
    if (!selectedItem) return

    const id = parseInt(selectedItem)
    if (isNaN(id)) return

    setLoading(true)
    window.electronAPI.provider.get(id).then((detail) => {
      if (detail) {
        setName(detail.name)
        setDescription(detail.description)
        setWebsite(detail.website)
        setLogoUrl(detail.logoUrl || '')
        setBaseUris(detail.baseUris.length > 0 ? detail.baseUris : [{ protocol: 'openai', url: '' }])
        setApiKey(detail.apiKey)
        setHasApiKey(detail.hasApiKey)
        setModels(detail.models.map((m) => ({ displayName: m.displayName, modelName: m.modelName })))
        setShowApiKey(false)
      }
    }).catch(() => {
      // ignore
    }).finally(() => {
      setLoading(false)
    })
  }, [selectedItem])

  // 添加 Base URI 行
  const addBaseUri = () => {
    setBaseUris([...baseUris, { protocol: 'openai', url: '' }])
  }

  // 删除 Base URI 行
  const removeBaseUri = (index: number) => {
    setBaseUris(baseUris.filter((_, i) => i !== index))
  }

  // 更新 Base URI 行
  const updateBaseUri = (index: number, field: 'protocol' | 'url', value: string) => {
    setBaseUris(baseUris.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  // 添加模型
  const addModel = () => {
    setModels([...models, { displayName: '', modelName: '' }])
  }

  // 删除模型
  const removeModel = (index: number) => {
    setModels(models.filter((_, i) => i !== index))
  }

  // 更新模型
  const updateModel = (index: number, field: 'displayName' | 'modelName', value: string) => {
    setModels(models.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  // 保存供应商
  const handleSave = async () => {
    if (!name.trim()) {
      setSaveMessage({ type: 'error', text: t('toolbox.errorNameRequired', '请输入供应商名称') })
      return
    }

    setSaving(true)
    setSaveMessage(null)

    try {
      // 过滤掉空的 baseUri 和模型
      const filteredBaseUris = baseUris.filter((b) => b.url.trim())
      const filteredModels = models.filter((m) => m.displayName.trim() && m.modelName.trim())

      const data = {
        name: name.trim(),
        description: description.trim(),
        website: website.trim(),
        logoUrl: logoUrl.trim(),
        baseUris: filteredBaseUris,
        apiKey: apiKey, // 空字符串表示不修改或清除
        models: filteredModels,
      }

      let result
      let savedId: number | null = null
      if (isNew) {
        result = await window.electronAPI.provider.create(data)
        if (result.success && result.id) {
          savedId = result.id
          // 新增成功后切换到查看模式
          setSelectedItem(String(result.id))
        }
      } else {
        const id = parseInt(selectedItem!)
        savedId = id
        result = await window.electronAPI.provider.update(id, data)
      }

      if (result.success) {
        setSaveMessage({ type: 'success', text: t('toolbox.saveSuccess', '保存成功') })
        // 保存成功后退出编辑模式
        setToolboxEditMode(false)
        // 完整重新加载供应商详情（包含模型列表），确保表单与服务端数据一致
        if (savedId !== null) {
          try {
            const detail = await window.electronAPI.provider.get(savedId)
            if (detail) {
              setName(detail.name)
              setDescription(detail.description)
              setWebsite(detail.website)
              setLogoUrl(detail.logoUrl || '')
              setBaseUris(detail.baseUris.length > 0 ? detail.baseUris : [{ protocol: 'openai', url: '' }])
              setApiKey(detail.apiKey)
              setHasApiKey(detail.hasApiKey)
              setModels(detail.models.map((m) => ({ displayName: m.displayName, modelName: m.modelName })))
              setShowApiKey(false)
            }
          } catch {
            // 重新加载失败时静默忽略，本地表单数据仍然保留
          }
        }
      } else {
        setSaveMessage({ type: 'error', text: result.error || t('toolbox.saveFailed', '保存失败') })
      }
    } catch (err: any) {
      setSaveMessage({ type: 'error', text: err.message || String(err) })
    } finally {
      setSaving(false)
    }
  }

  /** 取消编辑：回到查看模式（编辑模式）或返回列表（新增模式） */
  const handleCancel = () => {
    if (isNew) {
      // 新增模式：直接返回，清空选中项
      setSelectedItem(null)
    } else {
      // 编辑模式：退回查看模式，重新加载原始数据
      setToolboxEditMode(false)
      setSaveMessage(null)
      // 重新加载供应商详情以丢弃本地修改
      if (selectedItem) {
        const id = parseInt(selectedItem)
        if (!isNaN(id)) {
          window.electronAPI.provider.get(id).then((detail) => {
            if (detail) {
              setName(detail.name)
              setDescription(detail.description)
              setWebsite(detail.website)
              setLogoUrl(detail.logoUrl || '')
              setBaseUris(detail.baseUris.length > 0 ? detail.baseUris : [{ protocol: 'openai', url: '' }])
              setApiKey(detail.apiKey)
              setHasApiKey(detail.hasApiKey)
              setModels(detail.models.map((m) => ({ displayName: m.displayName, modelName: m.modelName })))
              setShowApiKey(false)
            }
          }).catch(() => {
            // ignore
          })
        }
      }
    }
  }

  // 测试模型连接
  const handleTest = async (index: number) => {
    const model = models[index]
    if (!model?.modelName.trim()) {
      setSaveMessage({ type: 'error', text: t('toolbox.errorModelNameRequired', '请输入模型名称') })
      return
    }

    // 找到第一个有 URL 的 baseUri
    const baseUri = baseUris.find((b) => b.url.trim())
    if (!baseUri) {
      setSaveMessage({ type: 'error', text: t('toolbox.errorBaseUrlRequired', '请先填写 Base URL') })
      return
    }

    const testApiKey = apiKey || ''
    if (!testApiKey) {
      setSaveMessage({ type: 'error', text: t('toolbox.errorApiKeyRequired', '请先填写 API Key') })
      return
    }

    setTesting(index)
    setSaveMessage(null)

    try {
      const result = await window.electronAPI.provider.test({
        protocol: baseUri.protocol,
        baseUrl: baseUri.url,
        apiKey: testApiKey,
        modelName: model.modelName,
      })

      if (result.success) {
        setSaveMessage({ type: 'success', text: t('toolbox.testSuccess', '测试成功') + (result.message ? `: ${result.message}` : '') })
      } else {
        setSaveMessage({ type: 'error', text: t('toolbox.testFailed', '测试失败') + (result.error ? `: ${result.error}` : '') })
      }
    } catch (err: any) {
      setSaveMessage({ type: 'error', text: err.message || String(err) })
    } finally {
      setTesting(null)
    }
  }

  /** 点击眼睛图标的处理：已解锁时直接切换显示/隐藏；未解锁且 API Key 已加密存储时弹出解锁弹窗 */
  const handleEyeClick = () => {
    // 已解锁或没有已存储的 API Key → 直接切换显示/隐藏
    if (isUnlocked || !hasApiKey) {
      setShowApiKey(!showApiKey)
      return
    }
    // API Key 存在但未解锁（主密码加密）→ 弹出解锁弹窗
    if (hasMasterPwd) {
      setShowUnlockDialog(true)
      setUnlockPassword('')
      setUnlockError(null)
    } else {
      // 未设置主密码，直接切换
      setShowApiKey(!showApiKey)
    }
  }

  /** 解锁操作：验证密码 → 刷新状态 → 重新加载供应商详情（获取解密后的 API Key） */
  const handleUnlock = async () => {
    if (!unlockPassword.trim()) {
      setUnlockError('请输入密码')
      return
    }
    const success = await window.electronAPI.masterPassword.unlock(unlockPassword, unlockTrustDevice)
    if (success) {
      setIsUnlocked(true)
      setShowUnlockDialog(false)
      setUnlockPassword('')
      setUnlockTrustDevice(false)
      setUnlockError(null)
      // 重新加载供应商详情，获取解密后的 API Key
      if (selectedItem && selectedItem !== '__new__') {
        const id = parseInt(selectedItem)
        if (!isNaN(id)) {
          try {
            const detail = await window.electronAPI.provider.get(id)
            if (detail) {
              setApiKey(detail.apiKey)
              setHasApiKey(detail.hasApiKey)
            }
          } catch {
            // 静默忽略
          }
        }
      }
      setShowApiKey(true)
    } else {
      setUnlockError('密码不正确')
    }
  }

  // 点击外部关闭模板下拉框
  useEffect(() => {
    if (!showTemplateDropdown) return
    const handler = (e: MouseEvent) => {
      if (templateDropdownRef.current && !templateDropdownRef.current.contains(e.target as Node)) {
        setShowTemplateDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showTemplateDropdown])

  // 搜索模板（防抖：输入后 300ms 触发搜索）
  useEffect(() => {
    if (!isEditable || !showTemplateDropdown) return
    const timer = setTimeout(() => {
      setTemplateSearchLoading(true)
      window.electronAPI.providerTemplate.search(templateSearch).then((results) => {
        setTemplateResults(results)
      }).catch(() => {
        setTemplateResults([])
      }).finally(() => {
        setTemplateSearchLoading(false)
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [templateSearch, showTemplateDropdown, isEditable])

  /** 选择模板：自动填入表单字段 */
  const handleSelectTemplate = (template: ProviderTemplate) => {
    setName(template.name)
    setLogoUrl(template.logoUrl)
    setWebsite(template.website)
    setDescription(template.description)
    setBaseUris(template.baseUris.length > 0 ? template.baseUris : [{ protocol: 'openai', url: '' }])
    setShowTemplateDropdown(false)
    setTemplateSearch('')
  }

  // 未选择供应商时显示空状态
  if (!selectedItem) {
    return (
      <div className="empty-state">
        <Wrench size={48} strokeWidth={1.5} style={{ opacity: 0.3, marginBottom: '12px' }} />
        <div style={{ fontSize: '16px', fontWeight: 500 }}>{t('toolbox.title', '工具箱')}</div>
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', textAlign: 'center', maxWidth: '400px', lineHeight: '1.6' }}>
          {t('toolbox.selectProvider', '请从左侧选择一个供应商，或点击「新增」添加')}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="empty-state">
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{t('common.loading', '加载中...')}</div>
      </div>
    )
  }

  // 输入框通用样式
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    borderRadius: '4px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-input)',
    color: 'var(--color-text)',
    fontSize: '13px',
    outline: 'none',
  }

  // 只读输入框样式（查看模式使用）
  const readOnlyInputStyle: React.CSSProperties = {
    ...inputStyle,
    background: 'var(--color-bg-hover, rgba(0,0,0,0.03))',
    color: 'var(--color-text-secondary)',
    cursor: 'default',
  }

  // 标签样式
  const labelStyle: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    marginBottom: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 顶部标题栏 */}
      <div className="chat-header" style={{ flexShrink: 0 }}>
        <Wrench size={18} strokeWidth={1.5} style={{ marginRight: '4px' }} />
        <span className="title">{isNew ? t('toolbox.newProvider', '新增供应商') : name}</span>
        {/* 模式标签 */}
        {!isNew && (
          <span style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '4px',
            marginLeft: '8px',
            background: toolboxEditMode ? 'var(--color-primary-bg, rgba(59,130,246,0.1))' : 'var(--color-bg-hover)',
            color: toolboxEditMode ? 'var(--color-primary)' : 'var(--color-text-muted)',
            fontWeight: 500,
          }}>
            {toolboxEditMode ? t('toolbox.editMode', '编辑模式') : t('toolbox.viewMode', '查看模式')}
          </span>
        )}
      </div>

      {/* 可滚动表单区域 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {/* 未解锁且 API Key 已加密存储时显示提示 */}
        {!isUnlocked && hasApiKey && !apiKey && hasMasterPwd && (
          <div style={{
            padding: '10px 12px',
            marginBottom: '16px',
            borderRadius: '6px',
            background: 'var(--color-warning-bg, rgba(245,158,11,0.1))',
            border: '1px solid var(--color-warning-border, rgba(245,158,11,0.3))',
            fontSize: '12px',
            color: 'var(--color-warning-text, #92400e)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <Lock size={14} strokeWidth={1.5} />
            <span>API Key 已加密存储，点击右侧眼睛图标输入密码解锁后查看</span>
          </div>
        )}

        {/* 1. 供应商名称（含模板搜索下拉框） */}
        <div style={{ marginBottom: '16px', position: 'relative' }} ref={templateDropdownRef}>
          <div style={labelStyle}>
            {t('toolbox.providerName', '供应商名称')} {isEditable && <span style={{ color: 'var(--color-error)' }}>*</span>}
            {isEditable && (
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 400, marginLeft: '4px' }}>
                ({t('toolbox.searchTemplateHint', '输入名称可搜索模板快速填入')})
              </span>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                // 编辑模式下输入时显示模板搜索下拉
                if (isEditable) {
                  setTemplateSearch(e.target.value)
                  setShowTemplateDropdown(true)
                }
              }}
              onFocus={() => {
                // 编辑模式下聚焦时显示模板列表（首次展示全部模板）
                if (isEditable) {
                  setTemplateSearch('')
                  setShowTemplateDropdown(true)
                }
              }}
              placeholder={isEditable ? t('toolbox.providerNamePlaceholder', '如 OpenAI、Anthropic') : ''}
              style={isEditable ? inputStyle : readOnlyInputStyle}
              readOnly={!isEditable}
            />
            {/* 编辑模式下显示搜索图标 */}
            {isEditable && (
              <Search size={14} strokeWidth={1.5} style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-muted)',
                pointerEvents: 'none',
              }} />
            )}
          </div>
          {/* 模板搜索下拉框 */}
          {isEditable && showTemplateDropdown && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '4px',
              maxHeight: '240px',
              overflowY: 'auto',
              borderRadius: '6px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-panel)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 100,
            }}>
              {templateSearchLoading ? (
                <div style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  {t('common.loading', '加载中...')}
                </div>
              ) : templateResults.length === 0 ? (
                <div style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  {t('toolbox.noTemplateFound', '未找到匹配的模板')}
                </div>
              ) : (
                templateResults.map((tpl) => (
                  <div
                    key={tpl.id}
                    onClick={() => handleSelectTemplate(tpl)}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      borderBottom: '1px solid var(--color-border-light, rgba(0,0,0,0.05))',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-hover)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    {/* 模板 Logo */}
                    {tpl.logoUrl ? (
                      <img src={tpl.logoUrl} alt={tpl.name} width={20} height={20}
                        style={{ objectFit: 'contain', flexShrink: 0, borderRadius: '3px' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <span style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Image size={16} strokeWidth={1.5} style={{ color: 'var(--color-text-muted)' }} />
                      </span>
                    )}
                    {/* 名称和描述 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tpl.name}
                      </div>
                      {tpl.description && (
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {tpl.description}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* 1.5 Logo 链接地址 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={labelStyle}>{t('toolbox.logoUrl', 'Logo 链接地址')}</div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              type="text"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder={isEditable ? t('toolbox.logoUrlPlaceholder', '输入 Logo 图片地址，如 https://...') : ''}
              style={isEditable ? inputStyle : readOnlyInputStyle}
              readOnly={!isEditable}
            />
            {/* Logo 预览 */}
            {logoUrl && (
              <div style={{ width: '32px', height: '32px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                <img src={logoUrl} alt="logo" width={24} height={24}
                  style={{ objectFit: 'contain' }}
                  onError={(e) => {
                    const img = e.target as HTMLImageElement
                    img.style.display = 'none'
                    const parent = img.parentElement
                    if (parent) {
                      parent.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>'
                    }
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* 2. 描述 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={labelStyle}>{t('toolbox.description', '描述')}</div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={isEditable ? t('toolbox.descriptionPlaceholder', '供应商简要描述') : ''}
            style={{ ...(isEditable ? inputStyle : readOnlyInputStyle), minHeight: '60px', resize: 'vertical' }}
            readOnly={!isEditable}
          />
        </div>

        {/* 3. 供应商官网 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={labelStyle}>{t('toolbox.website', '供应商官网')}</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder={isEditable ? 'https://example.com' : ''}
              style={isEditable ? inputStyle : readOnlyInputStyle}
              readOnly={!isEditable}
            />
            {website && (
              <button
                onClick={() => window.electronAPI.app.openExternal(website)}
                title={t('toolbox.openWebsite', '打开官网')}
                style={{
                  padding: '6px 10px',
                  borderRadius: '4px',
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <ExternalLink size={14} strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>

        {/* 4. Base URI 列表 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={labelStyle}>{t('toolbox.baseUris', 'Base URI')}</div>
          {baseUris.map((item, index) => (
            <div key={index} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
              {/* API 协议选择 */}
              <select
                value={item.protocol}
                onChange={(e) => updateBaseUri(index, 'protocol', e.target.value)}
                style={{
                  ...(isEditable ? inputStyle : readOnlyInputStyle),
                  width: '180px',
                  flexShrink: 0,
                  cursor: isEditable ? 'pointer' : 'default',
                }}
                disabled={!isEditable}
              >
                {API_PROTOCOLS.map((proto) => (
                  <option key={proto.value} value={proto.value}>{proto.label}</option>
                ))}
              </select>
              {/* URL 输入 */}
              <input
                type="text"
                value={item.url}
                onChange={(e) => updateBaseUri(index, 'url', e.target.value)}
                placeholder={isEditable ? 'https://api.openai.com' : ''}
                style={isEditable ? inputStyle : readOnlyInputStyle}
                readOnly={!isEditable}
              />
              {/* 删除按钮（仅编辑模式显示） */}
              {isEditable && baseUris.length > 1 && (
                <button
                  onClick={() => removeBaseUri(index)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--color-border)',
                    background: 'transparent',
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
              )}
            </div>
          ))}
          {/* 添加 Base URI 按钮（仅编辑模式显示） */}
          {isEditable && (
            <button
              onClick={addBaseUri}
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                border: '1px dashed var(--color-border)',
                background: 'transparent',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                fontSize: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Plus size={12} strokeWidth={1.5} />
              {t('toolbox.addBaseUri', '添加 Base URI')}
            </button>
          )}
        </div>

        {/* 5. API Key */}
        <div style={{ marginBottom: '16px' }}>
          <div style={labelStyle}>
            {t('toolbox.apiKey', 'API Key')}
            {hasApiKey && !apiKey && (
              <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginLeft: '4px' }}>
                ({t('toolbox.apiKeyConfigured', '已配置')})
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isEditable
                ? (hasApiKey ? t('toolbox.apiKeyPlaceholderEdit', '已加密存储，输入新值替换') : t('toolbox.apiKeyPlaceholder', '输入 API Key'))
                : ''
              }
              style={isEditable ? inputStyle : readOnlyInputStyle}
              readOnly={!isEditable}
              disabled={!isUnlocked && isEditable}
            />
            {/* 显示/隐藏 API Key：未解锁且 API Key 为主密码加密时弹出解锁弹窗 */}
            <button
              onClick={handleEyeClick}
              style={{
                padding: '6px 8px',
                borderRadius: '4px',
                border: '1px solid var(--color-border)',
                background: 'transparent',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {showApiKey ? <EyeOff size={14} strokeWidth={1.5} /> : <Eye size={14} strokeWidth={1.5} />}
            </button>
          </div>
          {/* 解锁弹窗：点击眼睛图标且 API Key 为主密码加密未解锁时显示 */}
          {showUnlockDialog && (
            <Modal
              title="输入密码解锁"
              icon={<Unlock size={18} />}
              onClose={() => { setShowUnlockDialog(false); setUnlockPassword(''); setUnlockTrustDevice(false); setUnlockError(null) }}
              buttons={[
                { label: t('common.cancel', '取消'), onClick: () => { setShowUnlockDialog(false); setUnlockPassword(''); setUnlockTrustDevice(false); setUnlockError(null) } },
                {
                  label: '解锁',
                  onClick: handleUnlock,
                  primary: true,
                },
              ]}
              width={400}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  API Key 已使用主密码加密存储，输入密码解锁后即可查看明文。
                </div>
                <input
                  type="password"
                  value={unlockPassword}
                  onChange={(e) => { setUnlockPassword(e.target.value); setUnlockError(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock() }}
                  placeholder="输入主密码"
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-input)',
                    color: 'var(--color-text)',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
                {unlockError && (
                  <div style={{ fontSize: '12px', color: 'var(--color-error)' }}>{unlockError}</div>
                )}
                {/* 记住密码勾选框 */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={unlockTrustDevice} onChange={(e) => setUnlockTrustDevice(e.target.checked)} />
                  {t('security.trustDevice', '信任此设备（重启后免输入密码）')}
                </label>
              </div>
            </Modal>
          )}
        </div>

        {/* 6. 模型列表 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={labelStyle}>{t('toolbox.models', '模型列表')}</div>
          {models.length === 0 && (
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px' }}>
              {isEditable ? t('toolbox.noModels', '暂无模型，点击下方添加') : t('toolbox.noModels', '暂无模型')}
            </div>
          )}
          {models.map((model, index) => (
            <div key={index} style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
              {/* 显示名称 */}
              <input
                type="text"
                value={model.displayName}
                onChange={(e) => updateModel(index, 'displayName', e.target.value)}
                placeholder={isEditable ? t('toolbox.modelDisplayName', '显示名称，如 GPT-4o') : ''}
                style={{ ...(isEditable ? inputStyle : readOnlyInputStyle), flex: '0 0 40%' }}
                readOnly={!isEditable}
              />
              {/* 实际模型名 */}
              <input
                type="text"
                value={model.modelName}
                onChange={(e) => updateModel(index, 'modelName', e.target.value)}
                placeholder={isEditable ? t('toolbox.modelName', '实际模型名，如 gpt-4o-2024-08-06') : ''}
                style={{ ...(isEditable ? inputStyle : readOnlyInputStyle), flex: 1 }}
                readOnly={!isEditable}
              />
              {/* 测试按钮（编辑模式可用） */}
              <button
                onClick={() => handleTest(index)}
                disabled={testing === index}
                title={t('toolbox.testConnection', '测试连接')}
                style={{
                  padding: '6px 8px',
                  borderRadius: '4px',
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: 'var(--color-primary)',
                  cursor: testing === index ? 'wait' : 'pointer',
                  flexShrink: 0,
                  opacity: testing === index ? 0.5 : 1,
                }}
              >
                <Zap size={14} strokeWidth={1.5} />
              </button>
              {/* 删除按钮（仅编辑模式显示） */}
              {isEditable && (
                <button
                  onClick={() => removeModel(index)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--color-border)',
                    background: 'transparent',
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
              )}
            </div>
          ))}
          {/* 添加模型按钮（仅编辑模式显示） */}
          {isEditable && (
            <button
              onClick={addModel}
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                border: '1px dashed var(--color-border)',
                background: 'transparent',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                fontSize: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Plus size={12} strokeWidth={1.5} />
              {t('toolbox.addModel', '添加模型')}
            </button>
          )}
        </div>

        {/* 消息提示 */}
        {saveMessage && (
          <div style={{
            padding: '8px 12px',
            marginBottom: '12px',
            borderRadius: '4px',
            fontSize: '12px',
            background: saveMessage.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            color: saveMessage.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
          }}>
            {saveMessage.text}
          </div>
        )}
      </div>

      {/* 底部操作栏：仅编辑/新增模式显示保存和取消按钮 */}
      {isEditable && (
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--color-border)',
          background: 'var(--color-bg-panel)',
          display: 'flex',
          gap: '8px',
          flexShrink: 0,
        }}>
          {/* 取消按钮 */}
          <button
            onClick={handleCancel}
            style={{
              padding: '6px 14px',
              borderRadius: '4px',
              border: '1px solid var(--color-border)',
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              fontSize: '13px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <X size={14} strokeWidth={1.5} />
            {t('toolbox.cancelEdit', '取消')}
          </button>
          {/* 保存按钮 */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              marginLeft: 'auto',
              padding: '6px 20px',
              borderRadius: '4px',
              border: 'none',
              background: 'var(--color-primary)',
              color: '#fff',
              cursor: saving ? 'wait' : 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              opacity: saving ? 0.5 : 1,
            }}
          >
            <Save size={14} strokeWidth={1.5} />
            {saving ? t('common.saving', '保存中...') : t('common.save', '保存')}
          </button>
        </div>
      )}
    </div>
  )
}
