# 环境部署与配置文档 - 微连

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档名称 | 环境部署与配置文档 |
| 项目名称 | 微连 (WeChat Link Agent) |
| 版本号 | v1.0 |
| 创建日期 | 2025-01-10 |

---

## 1. 开发环境要求

### 1.1 操作系统

- **Windows**: Windows 10 或更高版本
- **macOS**: macOS 12 (Monterey) 或更高版本
- **Linux**: Ubuntu 20.04 LTS 或更高版本（或其他主流发行版）

### 1.2 必需软件

| 软件 | 版本要求 | 用途 |
|------|----------|------|
| Node.js | v18.x 或 v20.x | 运行时环境 |
| npm | 9.x 或更高 | 包管理器 |
| Git | 最新版 | 版本控制 |

### 1.3 可选软件

| 软件 | 用途 |
|------|------|
| pnpm | 更快的包管理器（可选） |
| Yarn | 替代 npm（可选） |

---

## 2. 项目初始化

### 2.1 克隆仓库

```bash
git clone https://github.com/your-org/wechat-link-agent.git
cd wechat-link-agent
```

### 2.2 安装依赖

```bash
# 使用 npm
npm install

# 或使用 pnpm（推荐，更快）
pnpm install

# 或使用 Yarn
yarn install
```

### 2.3 验证安装

```bash
# 检查 Node.js 版本
node --version  # 应显示 v18.x 或 v20.x

# 检查 npm 版本
npm --version   # 应显示 9.x 或更高

# 运行类型检查
npm run typecheck

# 运行开发服务器
npm run dev
```

---

## 3. 开发命令

### 3.1 常用命令

```bash
# 启动开发服务器（热重载）
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview

# 打包并生成安装包
npm run prod

# 类型检查
npm run typecheck

# 运行测试
npm test
```

### 3.2 命令说明

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Electron 开发模式，支持热重载 |
| `npm run build` | 构建前端资源到 `dist/` 目录 |
| `npm run prod` | 构建并使用 electron-builder 打包 |
| `npm run typecheck` | 运行 TypeScript 类型检查（不输出文件） |

---

## 4. 环境变量配置

### 4.1 环境变量文件

创建 `.env` 文件（可选）：

```env
# 应用配置
NODE_ENV=development

# 日志级别
LOG_LEVEL=debug

# 微信 Bot API 配置（如需要）
WECHAT_API_URL=https://api.example.com
```

### 4.2 在代码中读取

```typescript
// 读取环境变量
const logLevel = process.env.LOG_LEVEL || 'info';

// 使用默认值
const apiUrl = process.env.WECHAT_API_URL || 'https://default.api.com';
```

---

## 5. 数据库配置

### 5.1 默认位置

数据库文件默认存储在：

- **Windows**: `C:\Users\{用户名}\.wechat-link-agent\wla.db`
- **macOS**: `/Users/{用户名}/.wechat-link-agent/wla.db`
- **Linux**: `/home/{用户名}/.wechat-link-agent/wla.db`

### 5.2 自定义位置

通过应用设置修改工作目录，数据库会同步移动。

### 5.3 数据初始化

首次启动时自动执行：

1. `src/database/schema.sql` - 创建表结构
2. `src/database/seed.sql` - 插入种子数据

---

## 6. Agent CLI 安装

### 6.1 手动安装 Claude Code

```bash
# macOS / Linux
npm install -g @anthropic-ai/claude-code

# Windows（需要管理员权限）
npm install -g @anthropic-ai/claude-code

# 登录
claude auth login
```

### 6.2 手动安装 OpenCode

```bash
# macOS
brew install openai/openai-code/openai-code

# Linux
curl -fsSL https://raw.githubusercontent.com/openai/openai-code/main/install.sh | sh

# Windows
winget install OpenAI.OpenAICode
```

### 6.3 应用内安装

应用会自动检测系统环境，提供一键安装引导：

1. 打开 **Agent 管理页面**
2. 点击 **安装 Agent** 按钮
3. 选择平台并执行安装命令
4. 安装完成后点击 **重新扫描**

---

## 7. 构建与打包

### 7.1 开发构建

```bash
# 仅构建前端资源
npm run build

# 输出目录
dist/
├── assets/
│   ├── index-xxx.js
│   └── index-xxx.css
└── index.html
```

### 7.2 生产打包

```bash
# 打包所有平台
npm run prod

# 输出目录
release/
├── 微连-Setup-0.1.0-win.exe          # Windows 安装包
├── 微连-0.1.0.dmg                    # macOS DMG
├── 微连-0.1.0.AppImage               # Linux AppImage
└── builder-effective-config.yaml     # 打包配置
```

### 7.3 单平台打包

```bash
# 仅 Windows
npm run build && electron-builder --win

# 仅 macOS
npm run build && electron-builder --mac

# 仅 Linux
npm run build && electron-builder --linux
```

---

## 8. 代码质量检查

### 8.1 类型检查

```bash
npm run typecheck
```

检查内容：
- TypeScript 类型错误
- 未使用的变量
- 类型断言安全性

### 8.2 ESLint 检查

```bash
npx eslint . --ext .ts,.tsx
```

检查内容：
- 代码风格规范
- 潜在错误
- 最佳实践违规

### 8.3 Prettier 格式化

```bash
# 格式化所有文件
npx prettier --write "**/*.{ts,tsx,js,jsx,json,css,md}"

# 检查格式
npx prettier --check "**/*.{ts,tsx,js,jsx,json,css,md}"
```

---

## 9. 调试技巧

### 9.1 主进程调试

打开 Chrome DevTools：

```typescript
// src/main/index.ts
mainWindow.webContents.openDevTools()
```

或在启动时使用环境变量：

```bash
npm run dev
# 在窗口中按 Ctrl+Shift+I (Windows/Linux) 或 Cmd+Option+I (macOS)
```

### 9.2 渲染进程调试

在浏览器中打开 DevTools：

1. 启动应用后，按 `Ctrl+Shift+I` (Windows/Linux) 或 `Cmd+Option+I` (macOS)
2. 打开 Console 面板查看日志
3. 使用 Sources 面板调试 React 组件

### 9.3 日志查看

应用日志存储在：

- **Windows**: `C:\Users\{用户名}\.wechat-link-agent\logs\`
- **macOS**: `/Users/{用户名}/.wechat-link-agent/logs/`
- **Linux**: `/home/{用户名}/.wechat-link-agent/logs/`

日志文件命名：`app-YYYY-MM-DD.log`

---

## 10. 常见问题

### 10.1 依赖安装失败

```bash
# 清除缓存
npm cache clean --force

# 删除 node_modules 后重新安装
rm -rf node_modules package-lock.json
npm install
```

### 10.2 构建失败

```bash
# 清除构建缓存
rm -rf dist release

# 重新构建
npm run build
```

### 10.3 TypeScript 类型错误

```bash
# 重新生成类型定义
npx tsc --noEmit

# 清除 .d.ts 缓存
rm -rf node_modules/.cache
```

### 10.4 端口被占用

```bash
# 查找占用端口的进程（Windows）
netstat -ano | findstr :3000

# 杀死进程
taskkill /PID {进程ID} /F

# macOS/Linux
lsof -i :3000
kill -9 {PID}
```

---

## 11. 生产环境配置

### 11.1 环境变量

生产环境建议设置：

```env
NODE_ENV=production
LOG_LEVEL=info
```

### 11.2 性能优化

- 启用代码分割（Vite 自动处理）
- 压缩资源（electron-builder 自动处理）
- 启用增量构建（Vite HMR）

### 11.3 安全配置

- 移除 `devDependencies` 依赖
- 设置 CSP（Content Security Policy）
- 禁用 DevTools（生产环境）

```typescript
// 生产环境禁用 DevTools
if (process.env.NODE_ENV === 'production') {
  mainWindow.webContents.on('devtools-opened', () => {
    mainWindow.webContents.closeDevTools()
  })
}
```

---

## 12. CI/CD 配置（可选）

### 12.1 GitHub Actions 示例

```yaml
# .github/workflows/build.yml
name: Build

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: macos-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install

      - name: Type check
        run: npm run typecheck

      - name: Build
        run: npm run build

      - name: Package
        run: npm run prod
```

---

*如有问题请查看 [GitHub Issues](https://github.com/your-org/wechat-link-agent/issues)*