-- ==========================================
-- 微连 (WeChat Link Agent) 数据库 Schema (DDL)
-- ==========================================



-- #################################################聊天模块START###################################
CREATE TABLE IF NOT EXISTS sessions (
-- ── 对话会话表 ──────────────────────────────────────────────────────────
-- 每个 Agent 可以有多个会话，关联 agents.id
  id             INTEGER PRIMARY KEY AUTOINCREMENT,  -- 自增主键
  agent_id       INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,  -- 所属 Agent ID
  title          TEXT DEFAULT '',                     -- 会话标题
  cwd            TEXT DEFAULT NULL,                  -- 会话级工作目录（首条消息前设置）
  sdk_session_id TEXT,                                -- Agent CLI 侧的 session_id
  created_at     TEXT DEFAULT (datetime('now','localtime')),  -- 创建时间
  updated_at     TEXT DEFAULT (datetime('now','localtime'))   -- 最后活动时间
);

CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);

CREATE TABLE IF NOT EXISTS messages (
-- ── 消息记录表 ──────────────────────────────────────────────────────────
-- 存储所有聊天消息，支持桌面和微信双来源
  id         INTEGER PRIMARY KEY AUTOINCREMENT,    -- 自增主键
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,  -- 所属会话 ID
  agent_name TEXT NOT NULL DEFAULT '',               -- Agent 名称（冗余，方便检索）
  role       TEXT NOT NULL CHECK(role IN ('user','assistant','system')),  -- 消息角色
  content    TEXT NOT NULL,                          -- 消息内容
  source     TEXT DEFAULT 'desktop' CHECK(source IN ('desktop','wechat')),  -- 来源
  timestamp  INTEGER NOT NULL                        -- 消息时间戳（Unix 毫秒）
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_agent ON messages(agent_name);
CREATE INDEX IF NOT EXISTS idx_messages_time ON messages(timestamp);

CREATE TABLE IF NOT EXISTS agent_commands (
-- ── Agent 斜杠命令表 ──────────────────────────────────────────────────────
-- 每个 Agent CLI 支持的斜杠命令（如 Claude Code 的 /init、/clear 等）
-- 按 agent_command（对应 agent_registry.command）关联，支持多语言
-- source 字段区分命令来源:
--   builtin  = CLI 内置命令（种子数据，INSERT OR IGNORE）
--   skill    = 用户级技能 (~/.claude/skills/*/SKILL.md)
--   plugin   = 插件提供的技能或命令 (installed_plugins.json → cache 目录)
-- 每次启动时先删除 source != 'builtin' 的记录，再重新扫描插入
  id            INTEGER PRIMARY KEY AUTOINCREMENT,  -- 自增主键
  agent_command TEXT NOT NULL,                       -- 对应 agent_registry.command，如 "claude"
  slash         TEXT NOT NULL,                       -- 斜杠命令，如 "/init"
  description_en TEXT DEFAULT '',                    -- 英文描述
  description_zh TEXT DEFAULT '',                    -- 中文描述（简体）
  description_tw TEXT DEFAULT '',                    -- 中文描述（繁体）
  source        TEXT DEFAULT 'builtin',              -- 来源: builtin | skill | plugin
  alias         TEXT DEFAULT '',                     -- 命令别名（逗号分隔），如 "new,reset" 表示 /clear 也可通过 /new、/reset 触发
  sort_order    INTEGER DEFAULT 0,                   -- 排序权重
  UNIQUE(agent_command, slash)                       -- 防止同一 Agent 的相同命令重复插入
);

CREATE INDEX IF NOT EXISTS idx_agent_commands_agent ON agent_commands(agent_command);
CREATE INDEX IF NOT EXISTS idx_agent_commands_source ON agent_commands(source);

-- ###################聊天模块END####################################













-- ###################Agent管理模块START####################################
CREATE TABLE IF NOT EXISTS agent_registry (
-- ── Agent 注册表 ─────────────────────────────────────────────────────────
-- 所有支持的 Agent CLI 工具的定义信息，由种子数据一次性写入。
-- 前端"可用 Agent 推荐"列表从此表读取。
-- 新增 Agent 支持只需在此 INSERT 一条记录。
  id            INTEGER PRIMARY KEY AUTOINCREMENT,  -- 自增主键
  command       TEXT NOT NULL UNIQUE,                -- CLI 命令，如 "claude"
  name          TEXT NOT NULL,                        -- 显示名称，如 "Claude Code"
  provider_type TEXT DEFAULT 'generic',                -- Provider 类型: claude|opencode|codebuddy|codex|mimo|trae|generic
  icon          TEXT DEFAULT '',                       -- SVG 图标文件名，如 "claude.svg"
  default_args  TEXT DEFAULT '',                       -- 建议启动参数
  default_model TEXT DEFAULT '',                       -- 建议默认模型
  vendor_en     TEXT DEFAULT '',                       -- 所属厂商（英文），如 "Anthropic"、"Google"
  vendor_zh     TEXT DEFAULT '',                       -- 所属厂商（中文简体），如 "Anthropic"、"谷歌"
  vendor_tw     TEXT DEFAULT '',                       -- 所属厂商（中文繁体），如 "Anthropic"、"谷歌"
  platforms     TEXT DEFAULT '',                       -- 支持平台，逗号分隔: win32,darwin,linux
  flag          TEXT DEFAULT '',                       -- 标签，逗号分隔，如 "企业用户,个人不可用"
  status        INTEGER DEFAULT 1,                     -- 启用状态: 0=关闭(不显示) 1=开启
  sort_order    INTEGER DEFAULT 0                     -- 排序权重（越小越靠前）
);

CREATE TABLE IF NOT EXISTS agent_install_commands (
-- ── Agent 安装命令（按平台） ──────────────────────────────────────────────
-- 每个 Agent 在不同平台的安装命令各不相同。
-- 平台取值：win32 | darwin | linux
-- 支持全平台通用的 Agent 只需一条记录，反之可只注册部分平台。
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,  -- 自增主键
  agent_command      TEXT NOT NULL,                -- 对应 agent_registry.command
  platform           TEXT NOT NULL,                -- win32 | darwin | linux
  install_hint       TEXT DEFAULT '',               -- 安装提示，如 "npm i -g @anthropic-ai/claude-code@latest"
  install_command    TEXT DEFAULT '',              -- 一键安装命令
  uninstall_command  TEXT DEFAULT '',              -- 一键卸载命令，如 "npm uninstall -g @anthropic-ai/claude-code"
  UNIQUE(agent_command, platform)
);

CREATE TABLE IF NOT EXISTS agents (
-- ── 已安装 Agent 表 ─────────────────────────────────────────────────────
-- 存储启动时自动扫描发现的已安装 Agent CLI。
-- 与 agent_registry 通过 command 字段关联（JOIN）读取 name/icon/provider_type/vendor_* 等元信息。
-- 本表只存储运行时数据和用户自定义配置，不冗余 registry 中已有的字段。
  id            INTEGER PRIMARY KEY,     -- 对应 agent_registry.id（稳定标识符，确保 session 外键不漂移）
  command       TEXT NOT NULL UNIQUE,     -- 关联 agent_registry.command
  cli_path      TEXT DEFAULT '',          -- CLI 可执行文件全路径（扫描 PATH 获得）
  args          TEXT DEFAULT '',          -- 用户自定义启动参数（为空时回退到 agent_registry.default_args）
  cwd           TEXT DEFAULT '',          -- 用户自定义工作目录
  model         TEXT DEFAULT '',          -- 用户自定义模型（为空时回退到 agent_registry.default_model）
  enabled       INTEGER DEFAULT 1,        -- 是否启用: 1=启用, 0=禁用
  is_default    INTEGER DEFAULT 0,        -- 是否为默认 Agent
  llm_provider_id INTEGER DEFAULT NULL,   -- 关联的 LLM 供应商 ID（llm_providers.id），NULL 表示未绑定
  model_config  TEXT DEFAULT '',          -- 模型配置 JSON（含 model/temperature/max_tokens）
  created_at    TEXT DEFAULT (datetime('now','localtime')),  -- 首次发现时间
  updated_at    TEXT DEFAULT (datetime('now','localtime'))   -- 最后更新时间
);

-- ###################Agent管理模块END####################################








-- ###################工具箱模块START####################################
CREATE TABLE IF NOT EXISTS provider_templates (
-- ── 供应商模板表 ───────────────────────────────────────────────────────
-- 预置常见 LLM 供应商的模板数据，用户新增供应商时可搜索选择模板，
-- 点击后自动填入名称、Logo、官网、Base URI 等信息。
  id              INTEGER PRIMARY KEY AUTOINCREMENT,   -- 自增主键
  name            TEXT NOT NULL,                        -- 供应商名称，如 "OpenAI"、"Anthropic"
  logo_url        TEXT DEFAULT '',                       -- Logo 图片地址
  website         TEXT DEFAULT '',                       -- 供应商官网
  description     TEXT DEFAULT '',                       -- 供应商简要描述
  -- base_uri 列表（JSON 数组，每项含 protocol 和 url）
  base_uris       TEXT DEFAULT '[]',                    -- JSON 格式的 base URI 列表
  sort_order      INTEGER DEFAULT 0                      -- 排序权重（越小越靠前）
);

CREATE TABLE IF NOT EXISTS llm_providers (
-- ── LLM 供应商表（工具箱） ─────────────────────────────────────────────
-- 存储用户自定义的 LLM 模型供应商信息，API Key 以 AES-256-GCM 加密存储。
-- 加密密钥由用户主密码通过 PBKDF2 派生，仅存内存。
  id              INTEGER PRIMARY KEY AUTOINCREMENT,   -- 自增主键
  name            TEXT NOT NULL,                        -- 供应商名称，如 "OpenAI"、"Anthropic"
  description     TEXT DEFAULT '',                       -- 供应商描述
  website         TEXT DEFAULT '',                       -- 供应商官网
  -- base_uri 列表（JSON 数组，每项含 protocol 和 url）
  -- protocol: "openai" | "anthropic" | "gemini"
  -- url: 对应的 API 基础地址
  base_uris       TEXT DEFAULT '[]',                    -- JSON 格式的 base URI 列表
  -- API Key 加密存储（AES-256-GCM）
  api_key_encrypted TEXT DEFAULT '',                     -- 加密后的 API Key（Base64）
  api_key_iv        TEXT DEFAULT '',                     -- 初始化向量（Base64）
  api_key_tag       TEXT DEFAULT '',                     -- 认证标签（Base64）
  logo_url        TEXT DEFAULT '',                       -- 供应商 Logo 图片地址（用户输入的 URL）
  created_at      TEXT DEFAULT (datetime('now','localtime')),  -- 创建时间
  updated_at      TEXT DEFAULT (datetime('now','localtime'))   -- 最后更新时间
);

CREATE TABLE IF NOT EXISTS llm_models (
-- ── LLM 模型表（工具箱） ───────────────────────────────────────────────
-- 每个供应商下可配置多个模型，存储显示名称和实际请求模型名。
  id              INTEGER PRIMARY KEY AUTOINCREMENT,   -- 自增主键
  provider_id     INTEGER NOT NULL REFERENCES llm_providers(id) ON DELETE CASCADE,  -- 所属供应商
  display_name    TEXT NOT NULL,                        -- 显示名称，如 "GPT-4o"
  model_name      TEXT NOT NULL,                        -- 实际请求模型名，如 "gpt-4o-2024-08-06"
  created_at      TEXT DEFAULT (datetime('now','localtime'))  -- 创建时间
);

CREATE INDEX IF NOT EXISTS idx_llm_models_provider ON llm_models(provider_id);
-- ###################工具箱模块END####################################


















-- ###################商城模块START####################################
CREATE TABLE IF NOT EXISTS store_categories (
-- ── 商城分类表 ─────────────────────────────────────────────────────────
-- 存储商城商品的分组名称（支持中英文），由种子数据初始化
  category_key TEXT PRIMARY KEY,                      -- 分类标识，如 "api"、"agent"、"subscription"
  name_zh      TEXT NOT NULL,                         -- 中文名称（简体），如 "API 服务"
  name_tw      TEXT NOT NULL,                         -- 中文名称（繁体），如 "API 服務"
  name_en      TEXT NOT NULL,                         -- 英文名称，如 "API Services"
  icon         TEXT DEFAULT ''                        -- 图标名称，如 "Plug", "Bot", "Star"
);

CREATE TABLE IF NOT EXISTS store_items (
-- ── 商城项目表 ──────────────────────────────────────────────────────────
-- 商城页面展示数据，由种子数据初始化
  id          INTEGER PRIMARY KEY AUTOINCREMENT,  -- 自增主键
  name        TEXT NOT NULL,                      -- 项目名称
  category    TEXT NOT NULL,                      -- 对应 store_categories.category_key
  provider    TEXT,                               -- 供应商/提供方名称
  description TEXT,                               -- 项目描述
  link        TEXT NOT NULL,                      -- 项目链接（官网或注册地址）
  logo_url    TEXT,                               -- Logo 图片地址
  sort_order  INTEGER DEFAULT 0,                  -- 排序权重（越小越靠前）
  enabled     INTEGER DEFAULT 1,                  -- 是否启用: 1=启用, 0=禁用
  is_partner  INTEGER DEFAULT 0,                  -- 是否为合作伙伴: 1=是, 0=否
  commission  TEXT,                               -- 佣金/返利信息
  tag         TEXT DEFAULT '官方',                 -- 标签：官方 / 第三方 / 中转站 等
  icon        TEXT DEFAULT '',                    -- 图标文件名，如 "claude.svg"
  created_at  TEXT DEFAULT (datetime('now','localtime'))  -- 创建时间
);
-- ###################商城模块END####################################














-- ###################设置模块START####################################
CREATE TABLE IF NOT EXISTS app_config (
-- ── 应用配置表 ─────────────────────────────────────────────────────────
-- key-value 存储，替代 config.json 文件。
-- 值统一用 TEXT 存储，由应用层做类型转换（如 bool 'true'/'false'）。
  key   TEXT PRIMARY KEY,  -- 配置键名
  name  TEXT DEFAULT '',   -- 配置项显示名称（中文）
  value TEXT DEFAULT ''    -- 配置值（TEXT 存储，应用层做类型转换）
);

CREATE TABLE IF NOT EXISTS accounts (
-- ── 微信账号绑定表 ──────────────────────────────────────────────────────
-- 存储微信 iLink Bot API 的认证凭证
  id         TEXT PRIMARY KEY,                              -- 微信 account_id
  bot_token  TEXT NOT NULL,                                 -- iLink Bot API 访问令牌（safeStorage 加密存储，ENC1: 前缀标识密文）
  user_id    TEXT,                                           -- 微信用户标识
  base_url   TEXT,                                           -- API 基础地址
  created_at TEXT DEFAULT (datetime('now','localtime'))      -- 绑定时间
);

CREATE TABLE IF NOT EXISTS sync_config (
-- ── WebDAV 同步配置表 ─────────────────────────────────────────────────
  id           INTEGER PRIMARY KEY AUTOINCREMENT,  -- 自增主键
  sync_type    TEXT NOT NULL DEFAULT 'webdav',     -- 同步类型，如 "webdav"
  enabled      INTEGER DEFAULT 0,                  -- 是否启用同步: 1=启用, 0=禁用
  base_url     TEXT,                               -- WebDAV 服务器地址
  username     TEXT,                               -- WebDAV 用户名
  password     TEXT,                               -- WebDAV 密码（safeStorage 加密存储，ENC1: 前缀标识密文）
  remote_root  TEXT DEFAULT 'wechat-link-agent-sync',  -- 远程同步根目录
  profile      TEXT DEFAULT 'default',             -- 同步配置档案名
  auto_sync    INTEGER DEFAULT 0,                  -- 是否自动同步: 1=是, 0=否
  auto_sync_interval INTEGER DEFAULT 30,             -- 自动同步间隔（分钟）: 5/10/15/30/60
  last_sync_at INTEGER,                            -- 最后同步时间戳（Unix 毫秒）
  last_error   TEXT,                               -- 最后一次同步错误信息
  created_at   TEXT DEFAULT (datetime('now','localtime')),  -- 创建时间
  updated_at   TEXT DEFAULT (datetime('now','localtime'))   -- 最后更新时间
);

-- ###################设置模块END####################################
















