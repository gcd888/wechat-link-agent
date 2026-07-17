-- ============================================================================
-- 微连 (WeChat Link Agent) 种子数据 (DML)
-- 通过 INSERT OR IGNORE 确保重复执行安全
-- 顺序和分类与 schema.sql (DDL) 保持一致
-- ============================================================================



-- #################################################聊天模块START###################################

-- ── Agent 斜杠命令（内置） ─────────────────────────────────────────────────
-- 对应 DDL tables: sessions, messages (无种子数据), agent_commands
-- 仅插入 CLI 内置命令（source = 'builtin'），使用 INSERT OR IGNORE 确保幂等。
-- 第三方技能/插件命令（source = 'skill' | 'plugin'）由启动时动态扫描写入，
-- 每次启动先删除非 builtin 记录再重新扫描插入。
-- 先清理旧的内置命令数据，防止重复（旧版表无 UNIQUE 约束，每次 seed 执行都会产生重复行）
DELETE FROM agent_commands WHERE source = 'builtin';
INSERT OR IGNORE INTO agent_commands (agent_command, slash, description_en, description_zh, description_tw, source, alias, sort_order) VALUES
  ('claude', '/init',                   'Initialize a new CLAUDE.md file with codebase documentation', '初始化新的 CLAUDE.md 文件，包含代码库文档', '初始化新的 CLAUDE.md 檔案，包含程式碼庫文件', 'builtin', '', 1),
  ('claude', '/add-dir',                'Add a new working directory', '添加新的工作目录', '添加新的工作目錄', 'builtin', '', 2),
  ('claude', '/agents',                 'Ask Claude to create/manage subagents, or edit .claude/agents/', '让 Claude 创建/管理子代理，或编辑 .claude/agents/', '讓 Claude 建立/管理子代理，或編輯 .claude/agents/', 'builtin', '', 3),
  ('claude', '/background',             'Send this session to the background and free the terminal', '将此会话发送到后台并释放终端', '將此對話發送到後台並釋放終端', 'builtin', '', 4),
  ('claude', '/branch',                 'Create a branch of the current conversation at this point', '在当前位置创建对话分支', '在當前位置建立對話分支', 'builtin', '', 5),
  ('claude', '/btw',                    'Ask a quick side question without interrupting the main conversation', '在不打断主对话的情况下提问', '在不打斷主對話的情況下提問', 'builtin', '', 6),
  ('claude', '/cd',                     'Move this session to a new working directory', '将会话移动到新的工作目录', '將對話移動到新的工作目錄', 'builtin', '', 7),
  ('claude', '/clear',                  'Start a new session with empty context; previous session stays on disk (resumable with /resume)', '开始新会话（空上下文），旧会话保留可恢复', '開始新對話（空上下文），舊對話保留可恢復', 'builtin', 'new,reset', 8),
  ('claude', '/color',                  'Set the prompt bar color for this session', '设置此会话的提示栏颜色', '設置此對話的提示欄顏色', 'builtin', '', 9),
  ('claude', '/compact',                'Free up context by summarizing the conversation so far', '通过总结对话来释放上下文', '通過總結對話來釋放上下文', 'builtin', '', 10),
  ('claude', '/config',                 'Open settings', '打开设置', '打開設置', 'builtin', '', 11),
  ('claude', '/context',                'Visualize current context usage as a colored grid', '以彩色网格可视化当前上下文使用量', '以彩色網格視覺化當前上下文使用量', 'builtin', '', 12),
  ('claude', '/copy',                   'Copy Claude''s last response to clipboard (or /copy N for the Nth-latest)', '复制 Claude 最后一条回复到剪贴板（或 /copy N 取倒数第 N 条）', '複製 Claude 最後一條回覆到剪貼簿（或 /copy N 取倒數第 N 條）', 'builtin', '', 13),
  ('claude', '/design',                 'Grant or revoke Claude agent access to your Design projects', '授予或撤销 Claude 对 Design 项目的访问权限', '授予或撤銷 Claude 對 Design 項目的存取權限', 'builtin', '', 14),
  ('claude', '/design-login',           'Authorize design-system access for /design-sync with your claude.ai account', '授权 design-system 访问以使用 /design-sync', '授權 design-system 存取以使用 /design-sync', 'builtin', '', 15),
  ('claude', '/diff',                   'View uncommitted changes and per-turn diffs', '查看未提交的更改和每轮差异', '查看未提交的變更和每輪差異', 'builtin', '', 16),
  ('claude', '/doctor',                 'Diagnose and verify your Claude Code installation and settings', '诊断并验证 Claude Code 安装和设置', '診斷並驗證 Claude Code 安裝和設置', 'builtin', '', 17),
  ('claude', '/effort',                 'Set effort level for model usage', '设置模型使用的努力级别', '設置模型使用的努力級別', 'builtin', '', 18),
  ('claude', '/exit',                   'Exit the CLI', '退出 CLI', '退出 CLI', 'builtin', 'quit', 19),
  ('claude', '/export',                 'Export the current conversation to a file or clipboard', '将当前对话导出到文件或剪贴板', '將當前對話匯出到檔案或剪貼簿', 'builtin', '', 20),
  ('claude', '/fast',                   'Toggle fast mode', '切换快速模式', '切換快速模式', 'builtin', '', 21),
  ('claude', '/feedback',               'Submit feedback, report a bug, or share your conversation', '提交反馈、报告问题或分享对话', '提交反饋、報告問題或分享對話', 'builtin', '', 22),
  ('claude', '/fetch:fetch',            'Fetch a URL and extract its contents as markdown (MCP)', '获取 URL 并提取内容为 Markdown（MCP）', '獲取 URL 並提取內容為 Markdown（MCP）', 'builtin', '', 23),
  ('claude', '/fewer-permission-prompts','Scan transcripts for common read-only Bash and MCP tool calls, then add a prioritized allowlist', '扫描转录中常见的只读 Bash 和 MCP 工具调用，添加优先允许列表', '掃描轉錄中常見的唯讀 Bash 和 MCP 工具調用，添加優先允許列表', 'builtin', '', 24),
  ('claude', '/focus',                  'Toggle focus view: just your prompt, summary, and response', '切换专注视图：仅显示提示、摘要和响应', '切換專注視圖：僅顯示提示、摘要和回應', 'builtin', '', 25),
  ('claude', '/fork',                   'Spawn a background agent that inherits the full conversation', '生成继承完整对话的后台代理', '生成繼承完整對話的後台代理', 'builtin', '', 26),
  ('claude', '/goal',                   'Set a goal Claude checks before stopping', '设置 Claude 在停止前检查的目标', '設置 Claude 在停止前檢查的目標', 'builtin', '', 27),
  ('claude', '/help',                   'Show help and available commands', '显示帮助和可用命令', '顯示說明和可用命令', 'builtin', '', 28),
  ('claude', '/hooks',                  'View hook configurations for tool events', '查看工具事件的钩子配置', '查看工具事件的鉤子配置', 'builtin', '', 29),
  ('claude', '/ide',                    'Manage IDE integrations and show status', '管理 IDE 集成并显示状态', '管理 IDE 整合並顯示狀態', 'builtin', '', 30),
  ('claude', '/insights',               'Generate a report analyzing your Claude Code sessions', '生成分析 Claude Code 会话的报告', '生成分析 Claude Code 對話的報告', 'builtin', '', 31),
  ('claude', '/keybindings',            'Open your keyboard shortcuts file', '打开键盘快捷键文件', '打開鍵盤快捷鍵檔案', 'builtin', '', 32),
  ('claude', '/loop',                   'Run a prompt or slash command on a recurring interval', '按固定间隔运行提示或斜杠命令', '按固定間隔執行提示或斜杠命令', 'builtin', '', 33),
  ('claude', '/login',                  'Sign in with your Anthropic account', '使用 Anthropic 账户登录', '使用 Anthropic 帳戶登入', 'builtin', '', 34),
  ('claude', '/logout',                 'Sign out from your Anthropic account', '退出 Anthropic 账户', '退出 Anthropic 帳戶', 'builtin', '', 35),
  ('claude', '/mcp',                    'Manage MCP servers', '管理 MCP 服务器', '管理 MCP 伺服器', 'builtin', '', 36),
  ('claude', '/model',                  'Set the AI model for Claude Code', '设置 Claude Code 的 AI 模型', '設置 Claude Code 的 AI 模型', 'builtin', '', 37),
  ('claude', '/memory',                 'Open a memory file in your editor', '在编辑器中打开内存文件', '在編輯器中打開記憶體檔案', 'builtin', '', 38),
  ('claude', '/mobile',                 'Show QR code to download the Claude mobile app', '显示二维码下载 Claude 移动应用', '顯示二維碼下載 Claude 行動應用', 'builtin', '', 39),
  ('claude', '/permissions',            'Manage allow and deny tool permission rules', '管理允许和拒绝的工具权限规则', '管理允許和拒絕的工具權限規則', 'builtin', '', 40),
  ('claude', '/plan',                   'Enable plan mode or view the current session plan', '启用计划模式或查看当前会话计划', '啟用計劃模式或查看當前對話計劃', 'builtin', '', 41),
  ('claude', '/plugin',                 'Manage Claude Code plugins', '管理 Claude Code 插件', '管理 Claude Code 插件', 'builtin', 'plugins', 42),
  ('claude', '/powerup',                'Discover Claude Code features through quick interactive lessons', '通过快速互动课程发现 Claude Code 功能', '通過快速互動課程發現 Claude Code 功能', 'builtin', '', 43),
  ('claude', '/recap',                  'Generate a one-line session recap now', '立即生成一行会话摘要', '立即生成一行對話摘要', 'builtin', '', 44),
  ('claude', '/reload-plugins',         'Activate pending plugin changes in the current session', '在当前会话中激活待处理的插件更改', '在當前對話中啟用待處理的插件變更', 'builtin', '', 45),
  ('claude', '/reload-skills',          'Pick up skills added or changed on disk during this session', '加载本次会话期间添加或更改的技能', '載入本次對話期間添加或變更的技能', 'builtin', '', 46),
  ('claude', '/release-notes',          'View release notes', '查看发行说明', '查看發行說明', 'builtin', '', 47),
  ('claude', '/rename',                 'Rename the current conversation', '重命名当前对话', '重新命名當前對話', 'builtin', 'name', 48),
  ('claude', '/resume',                 'Resume a previous conversation', '恢复之前的对话', '恢復之前的對話', 'builtin', '', 49),
  ('claude', '/rewind',                 'Restore the code and/or conversation to a previous point', '将代码和/或对话恢复到之前的某个点', '將程式碼和/或對話恢復到之前的某個點', 'builtin', '', 50),
  ('claude', '/review',                 'Review a GitHub pull request; for your working diff use /code-review', '审查 GitHub PR；对于工作区差异使用 /code-review', '審查 GitHub PR；對於工作區差異使用 /code-review', 'builtin', '', 51),
  ('claude', '/run',                    'Launch and drive this project''s app to see a change working', '启动并驱动项目应用以查看更改效果', '啟動並驅動專案應用以查看變更效果', 'builtin', '', 52),
  ('claude', '/run-skill-generator',    'Author or improve the run-<unit> skill — a per-project skill for building, launching, and driving this project''s app', '编写或改进 run-<unit> 技能 — 用于构建、启动和驱动项目应用', '編寫或改進 run-<unit> 技能 — 用於構建、啟動和驅動專案應用', 'builtin', '', 53),
  ('claude', '/security-review',        'Complete a security review of the pending changes on the current branch', '对当前分支的待处理更改完成安全审查', '對當前分支的待處理變更完成安全審查', 'builtin', '', 54),
  ('claude', '/simplify',               'Review the changed code for reuse, simplification, efficiency, and altitude cleanups, then apply the fixes', '审查已更改代码的复用、简化、效率和抽象层级清理，并应用修复', '審查已變更程式碼的復用、簡化、效率和抽象層級清理，並套用修復', 'builtin', '', 55),
  ('claude', '/skills',                 'List available skills', '列出可用技能', '列出可用技能', 'builtin', '', 56),
  ('claude', '/status',                 'Show Claude Code status including version, model, account, API connectivity, and tool statuses', '显示 Claude Code 状态，包括版本、模型、账户、API 连接和工具状态', '顯示 Claude Code 狀態，包括版本、模型、帳戶、API 連接和工具狀態', 'builtin', '', 57),
  ('claude', '/statusline',             'Set up Claude Code''s status line UI', '设置 Claude Code 的状态栏 UI', '設置 Claude Code 的狀態欄 UI', 'builtin', '', 58),
  ('claude', '/stickers',               'Order Claude Code stickers', '订购 Claude Code 贴纸', '訂購 Claude Code 貼紙', 'builtin', '', 59),
  ('claude', '/tasks',                  'View and manage everything running in the background', '查看和管理后台运行的所有任务', '查看和管理後台執行的所有任務', 'builtin', '', 60),
  ('claude', '/team-onboarding',        'Help teammates ramp on Claude Code with a guide from your usage', '帮助团队成员通过你的使用指南上手 Claude Code', '幫助團隊成員通過你的使用指南上手 Claude Code', 'builtin', '', 61),
  ('claude', '/terminal-setup',         'Install Shift+Enter key binding for newlines', '安装 Shift+Enter 换行键绑定', '安裝 Shift+Enter 換行鍵綁定', 'builtin', '', 62),
  ('claude', '/theme',                  'Change the theme', '更改主题', '更改主題', 'builtin', '', 63),
  ('claude', '/tui',                    'Set the terminal UI renderer (default | fullscreen)', '设置终端 UI 渲染器（默认 | 全屏）', '設置終端 UI 渲染器（預設 | 全螢幕）', 'builtin', '', 64),
  ('claude', '/update-config',          'Use this skill to configure the Claude Code harness via settings.json', '通过 settings.json 配置 Claude Code 运行时', '通過 settings.json 配置 Claude Code 執行時', 'builtin', '', 65),
  ('claude', '/usage',                  'Show session cost, plan usage, and activity stats', '显示会话费用、计划使用量和活动统计', '顯示對話費用、計劃使用量和活動統計', 'builtin', '', 66),
  ('claude', '/verify',                 'Verify that a code change actually does what it''s supposed to by exercising it end-to-end', '通过端到端执行验证代码更改是否达到预期效果', '通過端到端執行驗證程式碼變更是否達到預期效果', 'builtin', '', 67),
  ('claude', '/workflows',              'Browse running and completed workflows', '浏览运行中和已完成的工作流', '瀏覽執行中和已完成的工作流', 'builtin', '', 68);

-- ── Codex 斜杠命令（内置） ──────────────────────────────────────────────────
INSERT OR IGNORE INTO agent_commands (agent_command, slash, description_en, description_zh, description_tw, source, alias, sort_order) VALUES
  ('codex', '/agent',                'Switch the active agent thread', '切换活跃的代理线程', '切換活躍的代理線程', 'builtin', 'subagents', 1),
  ('codex', '/app',                  'Continue this session in Codex Desktop', '在 Codex Desktop 中继续此会话', '在 Codex Desktop 中繼續此對話', 'builtin', '', 2),
  ('codex', '/approve',              'Approve one retry of a recent auto-review denial', '批准最近一次自动审查拒绝的重试', '批准最近一次自動審查拒絕的重試', 'builtin', '', 3),
  ('codex', '/archive',              'Archive this session and exit', '归档此会话并退出', '歸檔此對話並退出', 'builtin', '', 4),
  ('codex', '/btw',                  'Start a side conversation in an ephemeral fork', '在临时分支中开始侧边对话', '在臨時分支中開始側邊對話', 'builtin', 'side', 5),
  ('codex', '/clear',                'Clear the terminal and start a new chat', '清除终端并开始新对话', '清除終端並開始新對話', 'builtin', '', 6),
  ('codex', '/compact',              'Summarize conversation to prevent hitting the context limit', '总结对话以防止达到上下文限制', '總結對話以防止達到上下文限制', 'builtin', '', 7),
  ('codex', '/copy',                 'Copy last response as markdown', '复制最后一条回复为 Markdown', '複製最後一條回覆為 Markdown', 'builtin', '', 8),
  ('codex', '/delete',               'Permanently delete this session and exit', '永久删除此会话并退出', '永久刪除此對話並退出', 'builtin', '', 9),
  ('codex', '/diff',                 'Show git diff (including untracked files)', '显示 git diff（包括未跟踪文件）', '顯示 git diff（包括未追蹤檔案）', 'builtin', '', 10),
  ('codex', '/exit',                 'Exit Codex', '退出 Codex', '退出 Codex', 'builtin', 'quit', 11),
  ('codex', '/experimental',         'Toggle experimental features', '切换实验性功能', '切換實驗性功能', 'builtin', '', 12),
  ('codex', '/feedback',             'Send logs to maintainers', '向维护者发送日志', '向維護者發送日誌', 'builtin', '', 13),
  ('codex', '/fork',                 'Fork the current chat', '分支当前对话', '分支當前對話', 'builtin', '', 14),
  ('codex', '/goal',                 'Set or view the goal for a long-running task', '设置或查看长时间运行任务的目标', '設置或查看長時間執行任務的目標', 'builtin', '', 15),
  ('codex', '/hooks',                'View and manage lifecycle hooks', '查看和管理生命周期钩子', '查看和管理生命週期鉤子', 'builtin', '', 16),
  ('codex', '/ide',                  'Include current selection, open files, and other context from your IDE', '包含当前选择、打开的文件和 IDE 中的其他上下文', '包含當前選擇、打開的檔案和 IDE 中的其他上下文', 'builtin', '', 17),
  ('codex', '/import',               'Import setup, this project, and recent chats from Claude Code', '从 Claude Code 导入设置、项目和最近的对话', '從 Claude Code 匯入設定、專案和最近的對話', 'builtin', '', 18),
  ('codex', '/init',                 'Create an AGENTS.md file with instructions for Codex', '创建 AGENTS.md 文件，包含 Codex 的指令', '建立 AGENTS.md 檔案，包含 Codex 的指令', 'builtin', '', 19),
  ('codex', '/keymap',               'Remap TUI shortcuts', '重新映射 TUI 快捷键', '重新映射 TUI 快捷鍵', 'builtin', '', 20),
  ('codex', '/logout',               'Log out of Codex', '退出 Codex 登录', '退出 Codex 登入', 'builtin', '', 21),
  ('codex', '/memories',             'Configure memory use and generation', '配置记忆使用和生成', '配置記憶使用和生成', 'builtin', '', 22),
  ('codex', '/mention',              'Mention a file', '提及文件', '提及檔案', 'builtin', '', 23),
  ('codex', '/mcp',                  'List configured MCP tools; use /mcp verbose for details', '列出已配置的 MCP 工具；使用 /mcp verbose 查看详情', '列出已配置的 MCP 工具；使用 /mcp verbose 查看詳情', 'builtin', '', 24),
  ('codex', '/model',                'Choose what model and reasoning effort to use', '选择使用的模型和推理强度', '選擇使用的模型和推理強度', 'builtin', '', 25),
  ('codex', '/new',                  'Start a new chat during a conversation', '在对话中开始新对话', '在對話中開始新對話', 'builtin', '', 26),
  ('codex', '/permissions',          'Choose what Codex is allowed to do', '选择 Codex 允许执行的操作', '選擇 Codex 允許執行的操作', 'builtin', '', 27),
  ('codex', '/personality',          'Choose a communication style for Codex', '选择 Codex 的沟通风格', '選擇 Codex 的溝通風格', 'builtin', '', 28),
  ('codex', '/pets',                 'Choose or hide the terminal pet', '选择或隐藏终端宠物', '選擇或隱藏終端寵物', 'builtin', '', 29),
  ('codex', '/plan',                 'Switch to Plan mode', '切换到计划模式', '切換到計劃模式', 'builtin', '', 30),
  ('codex', '/plugins',              'Browse plugins', '浏览插件', '瀏覽插件', 'builtin', '', 31),
  ('codex', '/ps',                   'List background terminals', '列出后台终端', '列出後台終端', 'builtin', '', 32),
  ('codex', '/raw',                  'Toggle raw scrollback mode for copy-friendly terminal selection', '切换原始回滚模式，便于终端选择复制', '切換原始回滾模式，便於終端選擇複製', 'builtin', '', 33),
  ('codex', '/rename',               'Rename the current thread', '重命名当前线程', '重新命名當前線程', 'builtin', '', 34),
  ('codex', '/resume',               'Resume a saved chat', '恢复已保存的对话', '恢復已儲存的對話', 'builtin', '', 35),
  ('codex', '/review',               'Review my current changes and find issues', '审查当前更改并查找问题', '審查當前變更並查找問題', 'builtin', '', 36),
  ('codex', '/sandbox-add-read-dir', 'Let sandbox read a directory: /sandbox-add-read-dir <absolute_path>', '允许沙箱读取目录：/sandbox-add-read-dir <绝对路径>', '允許沙箱讀取目錄：/sandbox-add-read-dir <絕對路徑>', 'builtin', '', 37),
  ('codex', '/skills',               'Use skills to improve how Codex performs specific tasks', '使用技能来提升 Codex 执行特定任务的方式', '使用技能來提升 Codex 執行特定任務的方式', 'builtin', '', 38),
  ('codex', '/status',               'Show current session configuration and token usage', '显示当前会话配置和令牌使用量', '顯示當前對話配置和令牌使用量', 'builtin', '', 39),
  ('codex', '/statusline',           'Configure which items appear in the status line', '配置状态栏中显示的项目', '配置狀態欄中顯示的項目', 'builtin', '', 40),
  ('codex', '/stop',                 'Stop all background terminals', '停止所有后台终端', '停止所有後台終端', 'builtin', '', 41),
  ('codex', '/vim',                  'Toggle Vim mode for the composer', '切换编辑器的 Vim 模式', '切換編輯器的 Vim 模式', 'builtin', '', 42);

-- ── MiMo 斜杠命令（内置） ───────────────────────────────────────────────────
INSERT OR IGNORE INTO agent_commands (agent_command, slash, description_en, description_zh, description_tw, source, alias, sort_order) VALUES
  ('mimo', '/agents',           'Switch agent', '切换智能体', '切換智能體', 'builtin', '', 1),
  ('mimo', '/background',       'Toggle background image', '切换背景图片', '切換背景圖片', 'builtin', '', 2),
  ('mimo', '/clear',            'Start a new session', '新建会话', '新建對話', 'builtin', 'new', 3),
  ('mimo', '/connect',          'Connect to provider', '连接服务商', '連接服務商', 'builtin', '', 4),
  ('mimo', '/continue',         'Switch session', '切换会话', '切換對話', 'builtin', 'resume,sessions', 5),
  ('mimo', '/dark',             'Switch to dark mode', '切换到深色模式', '切換到深色模式', 'builtin', '', 6),
  ('mimo', '/deep-research',    'Deep multi-source, fact-checked research report', '深度多来源、事实核查的研究报告', '深度多來源、事實核查的研究報告', 'builtin', '', 7),
  ('mimo', '/distill',          'Extract repeated workflows and package as skills, sub-agents, or commands', '提取重复流程，打包为技能、子智能体或命令', '提取重複流程，打包為技能、子智能體或命令', 'builtin', '', 8),
  ('mimo', '/doc',              'Open usage documentation', '打开使用文档', '打開使用文檔', 'builtin', 'docs', 9),
  ('mimo', '/dream',            'Manually integrate project memory from memory files and traces', '从 memory 文件与轨迹手动整合项目记忆', '從 memory 檔案與軌跡手動整合專案記憶', 'builtin', '', 10),
  ('mimo', '/editor',           'Open editor', '打开编辑器', '打開編輯器', 'builtin', '', 11),
  ('mimo', '/exit',             'Exit the application', '退出应用', '退出應用', 'builtin', 'quit,q', 12),
  ('mimo', '/fetch:fetch:mcp',  'Fetch a URL and extract web content as Markdown', '抓取URL并将网页内容提取为Markdown', '抓取URL並將網頁內容提取為Markdown', 'builtin', '', 13),
  ('mimo', '/goal',             'Set task termination goal; use /goal clear to clear the goal', '设置任务终止目标；/goal clear 清空目标', '設置任務終止目標；/goal clear 清空目標', 'builtin', '', 14),
  ('mimo', '/help',             'Show help', '查看帮助', '查看說明', 'builtin', '', 15),
  ('mimo', '/init',             'Guided AGENTS.md configuration setup', '引导式 AGENTS.md 配置设置', '引導式 AGENTS.md 配置設定', 'builtin', '', 16),
  ('mimo', '/lang',             'Change interface display language', '更改界面显示语言', '更改介面顯示語言', 'builtin', 'language', 17),
  ('mimo', '/light',            'Switch to light mode', '切换到浅色模式', '切換到淺色模式', 'builtin', '', 18),
  ('mimo', '/login',            'Log in to account', '登录账号', '登入帳號', 'builtin', '', 19),
  ('mimo', '/logout',           'Log out of account', '账号登出', '帳號登出', 'builtin', '', 20),
  ('mimo', '/logo',             'Toggle logo style', '切换Logo样式', '切換Logo樣式', 'builtin', '', 21),
  ('mimo', '/loops',            'View scheduled tasks; use cancel <id> to cancel a task', '查看定时任务；cancel <id> 取消指定任务', '查看定時任務；cancel <id> 取消指定任務', 'builtin', '', 22),
  ('mimo', '/mcps',             'Switch MCP services', '切换MCP服务', '切換MCP服務', 'builtin', '', 23),
  ('mimo', '/models',           'Switch AI model', '切换AI模型', '切換AI模型', 'builtin', '', 24),
  ('mimo', '/never-ask',        'Toggle auto-decision, skip popup prompts (except permission requests)', '开关自动决策，跳过弹窗提问（权限请求除外）', '開關自動決策，跳過彈窗提問（權限請求除外）', 'builtin', '', 25),
  ('mimo', '/review',           'Review Git changes (commit/branch/pr, default uncommitted changes)', '审查Git变更（commit/branch/pr，默认未提交变更）', '審查Git變更（commit/branch/pr，預設未提交變更）', 'builtin', '', 26),
  ('mimo', '/revoke-consent',   'Revoke free model usage agreement', '撤销免费模型使用协议', '撤銷免費模型使用協議', 'builtin', '', 27),
  ('mimo', '/skills',           'List available skills', '查看技能列表', '查看技能列表', 'builtin', '', 28),
  ('mimo', '/status',           'Show application running status', '查看程序运行状态', '查看程式執行狀態', 'builtin', '', 29),
  ('mimo', '/themes',           'Switch theme', '切换主题', '切換主題', 'builtin', '', 30),
  ('mimo', '/variants',         'Switch model variant', '切换模型变体', '切換模型變體', 'builtin', '', 31),
  ('mimo', '/voice',            'Toggle voice input', '开关语音输入', '開關語音輸入', 'builtin', '', 32),
  ('mimo', '/voice-control',    'Toggle quick ASR voice control', '开关快速ASR语音控制', '開關快速ASR語音控制', 'builtin', '', 33),
  ('mimo', '/voice-send',       'Toggle voice send', '开关语音发送', '開關語音發送', 'builtin', '', 34),
  ('mimo', '/worktree',         'Git worktree management', 'Git工作树管理', 'Git工作樹管理', 'builtin', 'wt', 35),
  ('mimo', '/workflows',        'Configure workflows', '配置工作流', '配置工作流', 'builtin', '', 36);

-- ── CodeBuddy 斜杠命令（内置） ────────────────────────────────────────────────
-- 注意：仅插入 CLI 内置命令（source = 'builtin'）。
-- 技能/插件命令（如 /brainstorming、/docx、/pdf、/pptx、/xlsx、/webapp-testing、
-- /playwright-cli、/frontend-skill、/deep-research，以及所有 (project) 标记的命令）
-- 由启动时动态扫描 ~/.claude/skills 和已安装插件目录写入，不在此处手动插入。
INSERT OR IGNORE INTO agent_commands (agent_command, slash, description_en, description_zh, description_tw, source, alias, sort_order) VALUES
  ('codebuddy', '/add-dir',              'Add a new working directory (arguments: <path>)', '添加新的工作目录（参数: <路径>）', '添加新的工作目錄（參數: <路徑>）', 'builtin', '', 1),
  ('codebuddy', '/agents',               'Manage agent configurations', '管理智能体配置', '管理智能體配置', 'builtin', '', 2),
  ('codebuddy', '/branch',               'Create a branch of the current conversation at this point (arguments: [name])', '在当前位置创建对话分支（参数: [名称]）', '在當前位置建立對話分支（參數: [名稱]）', 'builtin', 'fork', 3),
  ('codebuddy', '/btw',                  'Ask a quick side question without interrupting the main Agent work (arguments: <question>)', '在不打断主 Agent 工作的情况下快速提问（参数: <问题>）', '在不打斷主 Agent 工作的情況下快速提問（參數: <問題>）', 'builtin', '', 4),
  ('codebuddy', '/code-review',          'Review the current diff for correctness bugs and quality cleanups. Pass --fix to apply findings, --comment to post as PR comments', '审查当前差异的正确性缺陷和质量清理。传 --fix 应用修复，--comment 发布为 PR 评论', '審查當前差異的正確性缺陷和質量清理。傳 --fix 套用修復，--comment 發布為 PR 評論', 'builtin', '', 5),
  ('codebuddy', '/commit',               'Create a git commit', '创建 git 提交', '建立 git 提交', 'builtin', '', 6),
  ('codebuddy', '/commit-push-pr',       'Commit, push, and open a PR', '提交、推送并创建 PR', '提交、推送並建立 PR', 'builtin', '', 7),
  ('codebuddy', '/compact',              'Clear conversation history but keep a summary in context. Optional: /compact [instructions for summarization]', '清除对话历史但保留摘要。可选: /compact [摘要指令]', '清除對話歷史但保留摘要。可選: /compact [摘要指令]', 'builtin', '', 8),
  ('codebuddy', '/config',               'Manage settings. Subcommands: "list" to show current settings, "get <key>" to read a value, "set <key> <value>" to change a value', '管理设置。子命令: "list" 显示当前设置，"get <key>" 读取值，"set <key> <value>" 修改值', '管理設定。子命令: "list" 顯示當前設定，"get <key>" 讀取值，"set <key> <value>" 修改值', 'builtin', '', 9),
  ('codebuddy', '/context',              'Calculate and display context token distribution', '计算并显示上下文令牌分布', '計算並顯示上下文令牌分佈', 'builtin', '', 10),
  ('codebuddy', '/copy',                 'Copy the last response to clipboard (arguments: [N])', '复制最后一条回复到剪贴板（参数: [N]）', '複製最後一條回覆到剪貼簿（參數: [N]）', 'builtin', '', 11),
  ('codebuddy', '/cost',                 'Show the total cost and duration of the current session', '显示当前会话的总费用和持续时间', '顯示當前對話的總費用和持續時間', 'builtin', '', 12),
  ('codebuddy', '/debug',                'Enable debug logging and help diagnose session issues (arguments: [issue description])', '启用调试日志并帮助诊断会话问题（参数: [问题描述]）', '啟用除錯日誌並幫助診斷對話問題（參數: [問題描述]）', 'builtin', '', 13),
  ('codebuddy', '/doctor',               'Diagnose and verify your CodeBuddy installation and settings', '诊断并验证 CodeBuddy 安装和设置', '診斷並驗證 CodeBuddy 安裝和設定', 'builtin', '', 14),
  ('codebuddy', '/effort',               'Set the model effort level (low, medium, high, xhigh, max, ultracode) (arguments: [low | medium | high | xhigh | max | ultracode])', '设置模型努力级别（low, medium, high, xhigh, max, ultracode）（参数: [low | medium | high | xhigh | max | ultracode]）', '設置模型努力級別（low, medium, high, xhigh, max, ultracode）（參數: [low | medium | high | xhigh | max | ultracode]）', 'builtin', '', 15),
  ('codebuddy', '/exit',                 'Exit the CodeBuddy', '退出 CodeBuddy', '退出 CodeBuddy', 'builtin', '', 16),
  ('codebuddy', '/export',               'Export the current conversation to a file or clipboard', '将当前对话导出到文件或剪贴板', '將當前對話匯出到檔案或剪貼簿', 'builtin', '', 17),
  ('codebuddy', '/feedback',             'Open the issue feedback page to report bugs or suggest features', '打开问题反馈页面以报告问题或建议功能', '打開問題反饋頁面以報告問題或建議功能', 'builtin', '', 18),
  ('codebuddy', '/gateway',              'Manage the remote control gateway. Subcommands: "status" to show current status, "stop" to stop the gateway, "token" to regenerate access token', '管理远程控制网关。子命令: "status" 显示当前状态，"stop" 停止网关，"token" 重新生成访问令牌', '管理遠端控制閘道。子命令: "status" 顯示當前狀態，"stop" 停止閘道，"token" 重新生成存取令牌', 'builtin', '', 19),
  ('codebuddy', '/goal',                 'Keep working until a condition is met. Use "/goal clear" to stop early. Example: /goal all tests pass (arguments: <condition> | clear)', '持续工作直到满足条件。使用 "/goal clear" 提前停止。示例: /goal all tests pass（参数: <条件> | clear）', '持續工作直到滿足條件。使用 "/goal clear" 提前停止。範例: /goal all tests pass（參數: <條件> | clear）', 'builtin', '', 20),
  ('codebuddy', '/help',                 'Show help and available commands', '显示帮助和可用命令', '顯示說明和可用命令', 'builtin', '', 21),
  ('codebuddy', '/hooks',                'Manage hook configurations for tool events', '管理工具事件的钩子配置', '管理工具事件的鉤子配置', 'builtin', '', 22),
  ('codebuddy', '/ide',                  'Manage IDE integrations and show status', '管理 IDE 集成并显示状态', '管理 IDE 整合並顯示狀態', 'builtin', '', 23),
  ('codebuddy', '/init',                 'Initialize CodeBuddy configuration by analyzing your codebase', '通过分析代码库初始化 CodeBuddy 配置', '通過分析程式碼庫初始化 CodeBuddy 配置', 'builtin', '', 24),
  ('codebuddy', '/insights',             'Generate AI-powered insights about your CodeBuddy Code usage patterns and activity', '生成关于 CodeBuddy Code 使用模式和活动的 AI 洞察', '生成關於 CodeBuddy Code 使用模式和活動的 AI 洞察', 'builtin', '', 25),
  ('codebuddy', '/install-github-app',   'Set up GitHub Actions for a repository', '为仓库设置 GitHub Actions', '為倉庫設定 GitHub Actions', 'builtin', '', 26),
  ('codebuddy', '/keybindings',          'Open keybindings configuration', '打开快捷键配置', '打開快捷鍵配置', 'builtin', '', 27),
  ('codebuddy', '/loop',                 'Run a prompt or slash command on a recurring interval (e.g. /loop 5m /foo, defaults to 10m)', '按固定间隔运行提示或斜杠命令（如 /loop 5m /foo，默认 10m）', '按固定間隔執行提示或斜杠命令（如 /loop 5m /foo，預設 10m）', 'builtin', '', 28),
  ('codebuddy', '/login',                'Switch Tencent Cloud CodeBuddy accounts', '切换腾讯云 CodeBuddy 账号', '切換騰訊雲 CodeBuddy 帳號', 'builtin', '', 29),
  ('codebuddy', '/logout',               'Sign out from your Tencent Cloud CodeBuddy account', '退出腾讯云 CodeBuddy 账号', '退出騰訊雲 CodeBuddy 帳號', 'builtin', '', 30),
  ('codebuddy', '/mcp',                  'Manage MCP servers', '管理 MCP 服务器', '管理 MCP 伺服器', 'builtin', '', 31),
  ('codebuddy', '/memory',               'Edit CodeBuddy memory files', '编辑 CodeBuddy 记忆文件', '編輯 CodeBuddy 記憶檔案', 'builtin', '', 32),
  ('codebuddy', '/migrate-installer',    'Migrate from global npm installation to local installation', '从全局 npm 安装迁移到本地安装', '從全域 npm 安裝遷移到本地安裝', 'builtin', '', 33),
  ('codebuddy', '/model',                'Set or list AI models. Use "list" to show available models with current selection, or specify a model id to switch', '设置或列出 AI 模型。使用 "list" 显示可用模型和当前选择，或指定模型 ID 切换', '設置或列出 AI 模型。使用 "list" 顯示可用模型和當前選擇，或指定模型 ID 切換', 'builtin', '', 34),
  ('codebuddy', '/model:image-to-video', 'Set or list image-to-video models. Use "list" to show available models, or specify a model id to switch', '设置或列出图生视频模型。使用 "list" 显示可用模型，或指定模型 ID 切换', '設置或列出圖生視頻模型。使用 "list" 顯示可用模型，或指定模型 ID 切換', 'builtin', '', 35),
  ('codebuddy', '/model:text-to-image',  'Set or list text-to-image models. Use "list" to show available models, or specify a model id to switch', '设置或列出文生图模型。使用 "list" 显示可用模型，或指定模型 ID 切换', '設置或列出文生圖模型。使用 "list" 顯示可用模型，或指定模型 ID 切換', 'builtin', '', 36),
  ('codebuddy', '/model:text-to-video',  'Set or list text-to-video models. Use "list" to show available models, or specify a model id to switch', '设置或列出文生视频模型。使用 "list" 显示可用模型，或指定模型 ID 切换', '設置或列出文生視頻模型。使用 "list" 顯示可用模型，或指定模型 ID 切換', 'builtin', '', 37),
  ('codebuddy', '/output-style',         'Set the output style directly or from a selection menu', '直接或从选择菜单设置输出风格', '直接或從選擇選單設置輸出風格', 'builtin', '', 38),
  ('codebuddy', '/permissions',          'Manage allow & deny tool permission rules', '管理允许和拒绝的工具权限规则', '管理允許和拒絕的工具權限規則', 'builtin', '', 39),
  ('codebuddy', '/plan',                 'Preview the current plan file content', '预览当前计划文件内容', '預覽當前計劃檔案內容', 'builtin', '', 40),
  ('codebuddy', '/plugin',               'Manage CodeBuddy Code plugins', '管理 CodeBuddy Code 插件', '管理 CodeBuddy Code 插件', 'builtin', '', 41),
  ('codebuddy', '/plugin-validate',      'Validate a plugin directory structure and manifest (arguments: [path])', '验证插件目录结构和清单（参数: [路径]）', '驗證插件目錄結構和清單（參數: [路徑]）', 'builtin', '', 42),
  ('codebuddy', '/pr-comments',          'Get comments from a GitHub pull request', '获取 GitHub PR 的评论', '獲取 GitHub PR 的評論', 'builtin', '', 43),
  ('codebuddy', '/release-notes',        'View release notes', '查看发行说明', '查看發行說明', 'builtin', '', 44),
  ('codebuddy', '/reload-plugins',       'Reload all plugins, skills, agents, hooks, and MCP/LSP servers without restarting', '无需重启即可重新加载所有插件、技能、智能体、钩子和 MCP/LSP 服务器', '無需重啟即可重新載入所有插件、技能、智能體、鉤子和 MCP/LSP 伺服器', 'builtin', '', 45),
  ('codebuddy', '/remote-control',       'Manage remote control long connection clients (start, stop, status, list)', '管理远程控制长连接客户端（启动、停止、状态、列表）', '管理遠端控制長連接客戶端（啟動、停止、狀態、列表）', 'builtin', '', 46),
  ('codebuddy', '/rename',               'Rename the current conversation. Requires a name argument (e.g., /rename my-session) (arguments: <name>)', '重命名当前对话。需要名称参数（如 /rename my-session）（参数: <名称>）', '重新命名當前對話。需要名稱參數（如 /rename my-session）（參數: <名稱>）', 'builtin', '', 47),
  ('codebuddy', '/resume',               'List or resume sessions. Use "list" to show all sessions with ids, or specify a session id to resume (e.g., /resume <session-id>)', '列出或恢复会话。使用 "list" 显示所有会话 ID，或指定会话 ID 恢复（如 /resume <session-id>）', '列出或恢復對話。使用 "list" 顯示所有對話 ID，或指定對話 ID 恢復（如 /resume <session-id>）', 'builtin', '', 48),
  ('codebuddy', '/review',               'Review a pull request', '审查 Pull Request', '審查 Pull Request', 'builtin', '', 49),
  ('codebuddy', '/rewind',               'Restore the code and/or conversation to a previous point (Beta)', '将代码和/或对话恢复到之前的某个点（Beta）', '將程式碼和/或對話恢復到之前的某個點（Beta）', 'builtin', '', 50),
  ('codebuddy', '/sandbox',              'Configure and manage sandbox security settings', '配置和管理沙箱安全设置', '配置和管理沙箱安全設定', 'builtin', '', 51),
  ('codebuddy', '/security-review',      'Complete a security review of the pending changes on the current branch', '对当前分支的待处理更改完成安全审查', '對當前分支的待處理變更完成安全審查', 'builtin', '', 52),
  ('codebuddy', '/simplify',             'Clean up the changed code without changing behavior — reuse, simplification, efficiency, and altitude cleanups', '在不改变行为的前提下清理已更改代码 — 复用、简化、效率和抽象层级清理', '在不改變行為的前提下清理已變更程式碼 — 復用、簡化、效率和抽象層級清理', 'builtin', '', 53),
  ('codebuddy', '/skills',               'List available skills', '列出可用技能', '列出可用技能', 'builtin', '', 54),
  ('codebuddy', '/status',               'Show CodeBuddy status including version, model, account, API connectivity, and tool statuses', '显示 CodeBuddy 状态，包括版本、模型、账号、API 连接和工具状态', '顯示 CodeBuddy 狀態，包括版本、模型、帳號、API 連接和工具狀態', 'builtin', '', 55),
  ('codebuddy', '/statusline',           'Set up CodeBuddy Code''s status line UI', '设置 CodeBuddy Code 的状态栏 UI', '設置 CodeBuddy Code 的狀態欄 UI', 'builtin', '', 56),
  ('codebuddy', '/stats',                'Show your CodeBuddy Code usage statistics and activity', '显示 CodeBuddy Code 使用统计和活动', '顯示 CodeBuddy Code 使用統計和活動', 'builtin', '', 57),
  ('codebuddy', '/tasks',                'List and manage background tasks', '列出和管理后台任务', '列出和管理後台任務', 'builtin', '', 58),
  ('codebuddy', '/terminal-setup',       'Configure terminal key binding for newlines (Shift+Enter or Option+Enter)', '配置终端换行键绑定（Shift+Enter 或 Option+Enter）', '配置終端換行鍵綁定（Shift+Enter 或 Option+Enter）', 'builtin', '', 59),
  ('codebuddy', '/theme',                'Config CodeBuddy Code Theme', '配置 CodeBuddy Code 主题', '配置 CodeBuddy Code 主題', 'builtin', '', 60),
  ('codebuddy', '/todos',                'Display the current session''s todo list', '显示当前会话的待办列表', '顯示當前對話的待辦列表', 'builtin', '', 61),
  ('codebuddy', '/upgrade',              'Open upgrade page in browser', '在浏览器中打开升级页面', '在瀏覽器中打開升級頁面', 'builtin', '', 62),
  ('codebuddy', '/verify',               'Verify code changes work as expected by running the app and tests (arguments: [description])', '通过运行应用和测试验证代码更改是否达到预期效果（参数: [描述]）', '通過執行應用和測試驗證程式碼變更是否達到預期效果（參數: [描述]）', 'builtin', '', 63),
  ('codebuddy', '/vim',                  'Toggle between Vim and Normal editing modes', '在 Vim 和普通编辑模式之间切换', '在 Vim 和普通編輯模式之間切換', 'builtin', '', 64),
  ('codebuddy', '/workflows',            'List running and saved Dynamic Workflows', '列出运行中和已保存的动态工作流', '列出執行中和已儲存的動態工作流', 'builtin', '', 65);

-- ###################聊天模块END####################################



-- ###################Agent管理模块START####################################
-- 对应 DDL tables: agent_registry, agent_install_commands, agents (无种子数据)

-- ── Agent 注册表 ──────────────────────────────────────────────────────────
-- 所有已知 Agent CLI 工具的元信息，前端"可用 Agent 推荐"列表从此表读取。
-- 注意：agent_registry 是静态定义数据，agents（已安装）由启动时 PATH 扫描动态填充。
-- 使用 DELETE + INSERT 确保 DML 每次执行都是最新值（开发阶段，删库重建不需要迁移）
DELETE FROM agent_registry;
INSERT INTO agent_registry (command, name, provider_type, icon, default_args, default_model, vendor_en, vendor_zh, vendor_tw, platforms, flag, status, sort_order)
VALUES
  ('claude',   'Claude Code', 'claude',   'claude.svg',         '-p - --output-format stream-json', '', 'Anthropic',     'Anthropic',     'Anthropic',     'win32,darwin,linux', '', 1, 1),
  -- OpenCode 不指定默认模型，让 OpenCode 自身配置决定使用哪个模型
  ('opencode', 'OpenCode',    'opencode', 'opencode.svg',       '', '', 'SST',           'SST',           'SST',           'win32,darwin,linux', '', 1, 2),
  ('codebuddy','CodeBuddy',   'codebuddy','codebuddy.svg',      '', '', 'Tencent',       '腾讯',           '騰訊',           'win32,darwin', '', 1, 3),
  ('gemini',   'Gemini',      'generic',  'gemini.svg',         '', '', 'Google',        '谷歌',           '谷歌',           'win32,darwin,linux', '', 1, 4),
  ('codex',    'Codex',       'codex',    'codex.svg',          '', '', 'OpenAI',        'OpenAI',         'OpenAI',         'win32,darwin,linux', '', 1, 5),
  ('openclaw', 'OpenClaw',    'generic',  'openclaw.svg',       '', '', 'OpenClaw',      'OpenClaw',       'OpenClaw',       'win32,darwin,linux', '', 0, 6),
  ('hermes',   'Hermes',      'generic',  'hermes.svg',         '', '', 'Nous Research', 'Nous Research', 'Nous Research', 'win32', '', 0, 7),
  ('traecli',     'Trae',        'trae',     'trae.svg',           '', '', 'ByteDance',     '字节跳动',       '字節跳動',       'win32,darwin,linux', '企业用户,个人不可用', 1, 8),
  ('kimi',     'Kimi',        'generic',  'kimi.svg',           '', '', 'Moonshot AI',   '月之暗面',       '月之暗面',       'win32,darwin', '', 1, 9),
  ('qwen',     'Qwen',        'generic',  'qwen.svg',           '-y', '', 'Alibaba',       '阿里巴巴',       '阿里巴巴',       'win32,darwin,linux', '', 1, 10),
  ('mmx',      'MiniMax',     'generic',  'mmx.svg',            '', '', 'MiniMax',       'MiniMax',       'MiniMax',       'win32,darwin,linux', '', 1, 11),
  -- MiMo 使用专用 MimoProvider，通过 `mimo run --format json` 调用，参数由 provider 内部构建
  ('mimo',     'MiMo',        'mimo',     'xiaomimimimo.svg',   '', '', 'Xiaomi',        '小米',           '小米',           'win32,darwin,linux', '', 1, 12);

-- ── Agent 安装命令（按平台） ──────────────────────────────────────────────
-- 每个 Agent 在不同平台的安装命令。
-- 全平台通用 npm 包的 Agent 仅在 win32 行记录（逻辑由扫描器处理自动跨平台）；
-- 不同平台命令不同的则分别记录。
INSERT OR IGNORE INTO agent_install_commands (agent_command, platform, install_hint, install_command, uninstall_command)
VALUES
  -- Claude Code
  ('claude', 'win32',  'npm i -g @anthropic-ai/claude-code@latest',        'npm i -g @anthropic-ai/claude-code@latest',        'npm uninstall -g @anthropic-ai/claude-code'),
  ('claude', 'darwin', 'npm i -g @anthropic-ai/claude-code@latest',        'npm i -g @anthropic-ai/claude-code@latest',        'npm uninstall -g @anthropic-ai/claude-code'),
  ('claude', 'linux',  'npm i -g @anthropic-ai/claude-code@latest',        'npm i -g @anthropic-ai/claude-code@latest',        'npm uninstall -g @anthropic-ai/claude-code'),
  -- OpenCode
  ('opencode', 'win32',  'npm i -g opencode-ai@latest',                    'npm i -g opencode-ai@latest',                    'npm uninstall -g opencode-ai'),
  ('opencode', 'darwin', 'npm i -g opencode-ai@latest',                    'npm i -g opencode-ai@latest',                    'npm uninstall -g opencode-ai'),
  ('opencode', 'linux',  'npm i -g opencode-ai@latest',                    'npm i -g opencode-ai@latest',                    'npm uninstall -g opencode-ai'),
  -- CodeBuddy
  ('codebuddy', 'win32',  'npm i -g @tencent-ai/codebuddy-code@latest',   'npm i -g @tencent-ai/codebuddy-code@latest',   'npm uninstall -g @tencent-ai/codebuddy-code'),
  ('codebuddy', 'darwin', 'npm i -g @tencent-ai/codebuddy-code@latest',   'npm i -g @tencent-ai/codebuddy-code@latest',   'npm uninstall -g @tencent-ai/codebuddy-code'),
  -- Gemini
  ('gemini', 'win32',  'npm i -g @google/gemini-cli@latest',              'npm i -g @google/gemini-cli@latest',              'npm uninstall -g @google/gemini-cli'),
  ('gemini', 'darwin', 'npm i -g @google/gemini-cli@latest',              'npm i -g @google/gemini-cli@latest',              'npm uninstall -g @google/gemini-cli'),
  ('gemini', 'linux',  'npm i -g @google/gemini-cli@latest',              'npm i -g @google/gemini-cli@latest',              'npm uninstall -g @google/gemini-cli'),
  -- Codex
  ('codex', 'win32',  'npm i -g @openai/codex@latest',                    'npm i -g @openai/codex@latest',                    'npm uninstall -g @openai/codex'),
  ('codex', 'darwin', 'npm i -g @openai/codex@latest',                    'npm i -g @openai/codex@latest',                    'npm uninstall -g @openai/codex'),
  ('codex', 'linux',  'npm i -g @openai/codex@latest',                    'npm i -g @openai/codex@latest',                    'npm uninstall -g @openai/codex'),
  -- OpenClaw
  ('openclaw', 'win32',  'npm i -g openclaw@latest',                      'npm i -g openclaw@latest',                      'npm uninstall -g openclaw'),
  ('openclaw', 'darwin', 'npm i -g openclaw@latest',                      'npm i -g openclaw@latest',                      'npm uninstall -g openclaw'),
  ('openclaw', 'linux',  'npm i -g openclaw@latest',                      'npm i -g openclaw@latest',                      'npm uninstall -g openclaw'),
  -- Hermes（仅 Windows）
  ('hermes', 'win32', 'PowerShell: irm ... | iex',                        'powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand aQByAG0AIABoAHQAdABwAHMAOgAvAC8AcgBhAHcALgBnAGkAdABoAHUAYgB1AHMAZQByAGMAbwBuAHQAZQBuAHQALgBjAG8AbQAvAE4AbwB1AHMAUgBlAHMAZQBhAHIAYwBoAC8AaABlAHIAbQBlAHMALQBhAGcAZQBuAHQALwBtAGEAaQBuAC8AcwBjAHIAaQBwAHQAcwAvAGkAbgBzAHQAYQBsAGwALgBwAHMAMQAgAHwAIABpAGUAeAA=', ''),
  -- Trae（各平台命令不同，CLI 名为 traecli）
  ('traecli', 'win32',  'PowerShell: irm https://trae.cn/trae-cli/install.ps1 | iex',  'powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://trae.cn/trae-cli/install.ps1 | iex"', ''),
  ('traecli', 'darwin', 'sh -c "$(curl -L https://trae.cn/trae-cli/install.sh)" && export PATH=~/.local/bin:$PATH',  'sh -c "$(curl -L https://trae.cn/trae-cli/install.sh)" && export PATH=~/.local/bin:$PATH', ''),
  ('traecli', 'linux',  'sh -c "$(curl -L https://trae.cn/trae-cli/install.sh)" && export PATH=~/.local/bin:$PATH',  'sh -c "$(curl -L https://trae.cn/trae-cli/install.sh)" && export PATH=~/.local/bin:$PATH', ''),
  -- Kimi
  ('kimi', 'win32',  'npm i -g @moonshot-ai/kimi-code@latest',            'npm i -g @moonshot-ai/kimi-code@latest',            'npm uninstall -g @moonshot-ai/kimi-code'),
  ('kimi', 'darwin', 'npm i -g @moonshot-ai/kimi-code@latest',            'npm i -g @moonshot-ai/kimi-code@latest',            'npm uninstall -g @moonshot-ai/kimi-code'),
  -- Qwen
  ('qwen', 'win32',  'npm i -g @qwen-code/qwen-code@latest',              'npm i -g @qwen-code/qwen-code@latest',              'npm uninstall -g @qwen-code/qwen-code'),
  ('qwen', 'darwin', 'npm i -g @qwen-code/qwen-code@latest',              'npm i -g @qwen-code/qwen-code@latest',              'npm uninstall -g @qwen-code/qwen-code'),
  ('qwen', 'linux',  'npm i -g @qwen-code/qwen-code@latest',              'npm i -g @qwen-code/qwen-code@latest',              'npm uninstall -g @qwen-code/qwen-code'),
  -- MiniMax
  ('mmx', 'win32',   'npm i -g mmx-cli@latest',                           'npm i -g mmx-cli@latest',                           'npm uninstall -g mmx-cli'),
  ('mmx', 'darwin',  'npm i -g mmx-cli@latest',                           'npm i -g mmx-cli@latest',                           'npm uninstall -g mmx-cli'),
  ('mmx', 'linux',   'npm i -g mmx-cli@latest',                           'npm i -g mmx-cli@latest',                           'npm uninstall -g mmx-cli'),
  -- MiMo
  ('mimo', 'win32',  'npm i -g mimo-code@latest',                         'npm i -g mimo-code@latest',                         'npm uninstall -g mimo-code'),
  ('mimo', 'darwin', 'npm i -g mimo-code@latest',                         'npm i -g mimo-code@latest',                         'npm uninstall -g mimo-code'),
  ('mimo', 'linux',  'npm i -g mimo-code@latest',                         'npm i -g mimo-code@latest',                         'npm uninstall -g mimo-code');

-- ###################Agent管理模块END####################################



-- ###################工具箱模块START####################################
-- 对应 DDL tables: provider_templates, llm_providers (无种子数据), llm_models (无种子数据)

-- ── 供应商模板数据 ──────────────────────────────────────────────────────
-- 预置常见 LLM 供应商模板，用户新增供应商时可搜索选择，点击后自动填入信息。
-- 先清理旧数据再插入防止重复
DELETE FROM provider_templates;
INSERT OR IGNORE INTO provider_templates (name, logo_url, website, description, base_uris, sort_order)
VALUES
  -- OpenAI
  ('OpenAI', 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/openai.svg', 'https://platform.openai.com', 'OpenAI 官方 API，提供 GPT-4o、o1 等模型', '[{"protocol":"openai","url":"https://api.openai.com"}]', 1),
  -- Anthropic
  ('Anthropic', 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/anthropic.svg', 'https://www.anthropic.com', 'Anthropic 官方 API，提供 Claude 系列模型', '[{"protocol":"anthropic","url":"https://api.anthropic.com"}]', 2),
  -- Google Gemini
  ('Google Gemini', 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/google.svg', 'https://ai.google.dev', 'Google AI 官方 API，提供 Gemini 系列模型', '[{"protocol":"gemini","url":"https://generativelanguage.googleapis.com"}]', 3),
  -- 智谱 GLM
  ('智谱 BigModel', 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/zhipu.svg', 'https://www.bigmodel.cn', '智谱 AI 开放平台，提供 GLM-4 等模型', '[{"protocol":"openai","url":"https://open.bigmodel.cn/api/paas/v4"}]', 4),
  -- 月之暗面 Kimi
  ('Moonshot Kimi', 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/moonshot.svg', 'https://platform.moonshot.cn', '月之暗面 AI 开放平台，提供 Moonshot 系列模型', '[{"protocol":"openai","url":"https://api.moonshot.cn"}]', 5),
  -- 阿里通义千问
  ('阿里 DashScope', 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/alibabacloud.svg', 'https://dashscope.aliyun.com', '阿里云 DashScope，提供 Qwen 系列模型', '[{"protocol":"openai","url":"https://dashscope.aliyuncs.com/compatible-mode/v1"}]', 6),
  -- DeepSeek
  ('DeepSeek', 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/deepseek.svg', 'https://www.deepseek.com', 'DeepSeek 官方 API，提供 DeepSeek-V3、DeepSeek-R1 等模型', '[{"protocol":"openai","url":"https://api.deepseek.com"}]', 7),
  -- 硅基流动
  ('SiliconFlow', 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/siliconflow.svg', 'https://cloud.siliconflow.cn', '硅基流动云平台，聚合多种开源模型', '[{"protocol":"openai","url":"https://api.siliconflow.cn"}]', 8),
  -- 百度千帆
  ('百度千帆', 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/baidu.svg', 'https://qianfan.cloud.baidu.com', '百度智能云千帆平台，提供 ERNIE 系列模型', '[{"protocol":"openai","url":"https://qianfan.baidubce.com/v2"}]', 9),
  -- 腾讯混元
  ('腾讯混元', 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/tencentqq.svg', 'https://cloud.tencent.com/product/hunyuan', '腾讯混元大模型 API', '[{"protocol":"openai","url":"https://api.hunyuan.cloud.tencent.com/v1"}]', 10),
  -- xAI Grok
  ('xAI Grok', 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/x.svg', 'https://x.ai', 'xAI 官方 API，提供 Grok 系列模型', '[{"protocol":"openai","url":"https://api.x.ai"}]', 11),
  -- OpenRouter
  ('OpenRouter', 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/openrouter.svg', 'https://openrouter.ai', 'OpenRouter 聚合 API，一个接口访问多种模型', '[{"protocol":"openai","url":"https://openrouter.ai/api"}]', 12);

-- ###################工具箱模块END####################################



-- ###################商城模块START####################################
-- 对应 DDL tables: store_categories, store_items

-- ── 商城分类数据 ──────────────────────────────────────────────────────
-- 先清理旧数据再插入防止重复
DELETE FROM store_categories;
INSERT OR IGNORE INTO store_categories (category_key, name_zh, name_tw, name_en, icon)
VALUES
  ('api',        'API 服务',    'API 服務',    'API Services',    'Plug'),
  ('aggregate',  '聚合API服务', '聚合API服務', 'Aggregated APIs', 'Boxes'),
  ('agent',      'Agent 工具',  'Agent 工具',  'Agent Tools',     'Bot');

-- ── 商城初始数据 ───────────────────────────────────────────────────────
-- 先清理旧数据再插入防止重复（store_items 是静态种子数据，无用户数据需要保留）
DELETE FROM store_items;
INSERT OR IGNORE INTO store_items (name, category, provider, description, link, sort_order, is_partner, commission, tag, icon)
VALUES
  ('小米 MiMo',           'api',       'Xiaomi MiMo', '小米旗下 AI 模型服务平台，MiMo Code CLI 工具官方支持',         'https://platform.xiaomimimo.com?ref=HNAG5P', 1, 0, NULL, '官方', 'xiaomimimimo.svg'),
  ('智谱 BigModel',       'api',       '智谱AI',      '智谱 AI 开放平台，提供 GLM 系列大模型 API 服务',               'https://www.bigmodel.cn/invite?icode=%2BQBmEqjcEyCbfuUJEh2Kbf2gad6AKpjZefIo3dVEQyA%3D', 2, 0, NULL, '官方', 'zhipu.svg'),
  ('硅基流动 SiliconFlow', 'aggregate', 'SiliconFlow', 'SiliconFlow 官方大模型云服务平台，提供高速推理与 GPU 算力',   'https://cloud.siliconflow.cn/i/C0AptdrO', 1, 0, NULL, '官方', 'siliconflow.svg'),
  ('魔塔社区 ModelScope', 'aggregate', 'ModelScope',  '阿里达摩院开源模型社区，提供海量开源模型与数据集',             'https://www.modelscope.cn/register?inviteCode=gcd888&invitorName=guanchengdong', 2, 0, NULL, '官方', 'modelscope-color.svg'),
  ('字节跳动 Trae',       'agent',     'Trae',        'AI 驱动的 IDE 工具，提供智能编码与项目管理能力',               'https://www.trae.cn/dashboard#subscription', 1, 0, NULL, '官方', 'trae.svg'),
  ('腾讯 CodeBuddy',      'agent',     'CodeBuddy',   '腾讯 AI 编程助手 CLI 工具，提供智能代码补全与对话能力',         'https://www.workbuddy.cn/pricing/', 2, 0, NULL, '官方', 'codebuddy.svg');

-- ###################商城模块END####################################



-- ###################设置模块START####################################
-- 对应 DDL tables: app_config, accounts (无种子数据), sync_config (无种子数据)

-- ── 应用配置 ──────────────────────────────────────────────────────────────
-- 默认配置值，替代 config.json 文件。
-- 值统一用 TEXT 存储，由应用层做类型转换。
INSERT OR IGNORE INTO app_config (key, name, value) VALUES
  ('theme',             '主题',       'system'),
  ('language',          '语言',       'zh-CN'),
  ('workingDirectory',  '工作目录',   ''),
  ('systemPrompt',      '系统提示词', ''),
  ('launchOnStartup',   '开机自启',   'false'),
  ('minimizeToTray',    '后台运行',   'true');

-- ###################设置模块END####################################
