# Icon Finder Skill

从 iconfont.cn 等图标网站查找并下载 AI Agent 对应的官方 SVG logo。
保存到 `renderer/assets/icons/` 目录，并更新 Lucide 图标映射。

## 工作流程

当用户要求查找或更新 Agent 图标时：

1. **搜索图标** — 在 iconfont.cn 搜索 Agent 名称（如 "DeepSeek"、"Claude"）
2. **下载 SVG** — 将 SVG 文件保存到 `renderer/assets/icons/{agent-command}.svg`
3. **更新映射** — 修改 `renderer/components/ListPanel/ListPanel.tsx` 中的 `AGENT_ICONS`，将路径指向本地 SVG 文件：
   ```typescript
   import { ReactComponent as ClaudeIcon } from '../assets/icons/claude.svg'
   ```
   或通过动态加载方式引入
4. **备选方案** — 如果 iconfont.cn 找不到合适的图标，尝试：
   - 从 Agent 官网直接获取 SVG（通常在网站 `<link rel="icon">` 或 logo 资源中）
   - 从 GitHub 仓库获取
   - 使用 devicon.dev 等开发图标库

## SVG 文件命名规范

```
renderer/assets/icons/
├── claude.svg      # Claude Code
├── opencode.svg    # OpenCode
├── codebuddy.svg   # CodeBuddy
├── gemini.svg      # Gemini CLI
├── codex.svg       # Codex CLI
├── openclaw.svg    # OpenClaw
├── hermes.svg      # Hermes
├── trae.svg        # Trae
├── kimi.svg        # Kimi Code
├── qwen.svg        # Qwen Code
├── mmx.svg         # mmx-cli
├── deep.svg        # Deep Code
└── mimo.svg        # MiMo Code
```

## iconfont.cn 搜索格式

```
https://www.iconfont.cn/search/index?searchType=icon&q={关键词}
```

## 已知来源

| Agent | 来源 | URL |
|-------|------|-----|
| Claude Code | Anthropic 官网 | https://docs.anthropic.com |
| DeepSeek | DeepSeek 官网 | https://platform.deepseek.com/ |
| Gemini | Google AI | https://ai.google.dev/ |
| Kimi | Moonshot AI | https://kimi.moonshot.cn/ |
| Qwen | 阿里云 | https://tongyi.aliyun.com/ |
