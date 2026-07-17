# UI 设计规范文档 - 微连

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档名称 | UI 设计规范文档 |
| 项目名称 | 微连 (WeChat Link Agent) |
| 版本号 | v1.0 |
| 创建日期 | 2025-01-10 |

---

## 1. 设计原则

### 1.1 核心理念

- **简洁高效**：三栏布局，信息层级清晰
- **深色优先**：默认深色主题，保护开发者视力
- **响应式**：面板宽度可拖拽调整
- **国际化**：支持多语言动态切换

### 1.2 视觉风格

- **扁平化设计**：无过度阴影和渐变
- **圆角统一**：标准圆角 8px
- **图标风格**：Lucide React 线性图标
- **字体**：系统默认无衬线字体

---

## 2. 色彩系统

### 2.1 深色主题

| 用途 | CSS 变量 | 色值 |
|------|----------|------|
| 应用背景 | `--color-bg-app` | `#141414` |
| 导航背景 | `--color-bg-nav` | `#111111` |
| 面板背景 | `--color-bg-panel` | `#1a1a1a` |
| 内容背景 | `--color-bg-content` | `#141414` |
| 卡片背景 | `--color-bg-card` | `#1a1a1a` |
| 悬停背景 | `--color-bg-hover` | `#2a2a2a` |
| 激活背景 | `--color-bg-active` | `#1a3a5c` |
| 边框 | `--color-border` | `#2d2d2d` |
| 主色 | `--color-primary` | `#4a9eff` |
| 文本主 | `--color-text` | `#e0e0e0` |
| 文本次 | `--color-text-secondary` | `#888888` |
| 文本弱化 | `--color-text-muted` | `#555555` |

### 2.2 浅色主题

| 用途 | CSS 变量 | 色值 |
|------|----------|------|
| 应用背景 | `--color-bg-app` | `#f5f5f5` |
| 导航背景 | `--color-bg-nav` | `#e8e8e8` |
| 面板背景 | `--color-bg-panel` | `#ffffff` |
| 内容背景 | `--color-bg-content` | `#f5f5f5` |
| 卡片背景 | `--color-bg-card` | `#ffffff` |
| 悬停背景 | `--color-bg-hover` | `#eaeaea` |
| 激活背景 | `--color-bg-active` | `#d0e4ff` |
| 边框 | `--color-border` | `#d9d9d9` |
| 主色 | `--color-primary` | `#1677ff` |
| 文本主 | `--color-text` | `#1f1f1f` |
| 文本次 | `--color-text-secondary` | `#666666` |
| 文本弱化 | `--color-text-muted` | `#999999` |

### 2.3 语义色

| 用途 | CSS 变量 | 色值 |
|------|----------|------|
| 成功 | `--color-success` | `#22c55e` |
| 警告 | `--color-warning` | `#f59e0b` |
| 错误 | `--color-error` | `#ef4444` |
| 主色（信息） | `--color-primary` | `#4a9eff` |

---

## 3. 字体排版

### 3.1 字体栈

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
```

### 3.2 字号规范

| 用途 | 大小 | 行高 | 字重 |
|------|------|------|------|
| 页面标题 | 24px | 32px | 600 |
| 区域标题 | 18px | 28px | 600 |
| 正文 | 14px | 22px | 400 |
| 辅助文字 | 12px | 18px | 400 |
| 代码 | 13px | 20px | 400 |

### 3.3 字重

| 字重 | 值 | 用途 |
|------|-----|------|
| Regular | 400 | 正文、辅助文字 |
| Medium | 500 | 按钮、标签 |
| SemiBold | 600 | 标题 |

---

## 4. 间距规范

### 4.1 基础间距单位

```css
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 16px;
--spacing-lg: 24px;
--spacing-xl: 32px;
```

### 4.2 组件内间距

- 按钮：`padding: 8px 16px`
- 输入框：`padding: 8px 12px`
- 卡片：`padding: 16px`
- 模态框：`padding: 24px`

### 4.3 布局间距

- 栏之间：`border-left: 1px solid var(--color-border)`
- 列表项：`margin-bottom: 8px`
- 表单字段：`margin-bottom: 16px`

---

## 5. 组件规范

### 5.1 按钮

```css
/* 主按钮 */
.button-primary {
  background: var(--color-primary);
  color: white;
  border-radius: 6px;
  padding: 8px 16px;
  font-weight: 500;
  transition: background 0.2s;
}

.button-primary:hover {
  opacity: 0.85;
}

/* 次要按钮 */
.button-secondary {
  background: transparent;
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 8px 16px;
}

/* 危险按钮 */
.button-danger {
  background: var(--color-error);
  color: white;
  border-radius: 6px;
  padding: 8px 16px;
}
```

### 5.2 输入框

```css
.input {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 8px 12px;
  color: var(--color-text);
  font-size: 14px;
}

.input:focus {
  outline: none;
  border-color: var(--color-primary);
}
```

### 5.3 卡片

```css
.card {
  background: var(--color-bg-panel);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 16px;
}
```

### 5.4 标签

```css
.tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.tag-primary {
  background: rgba(59, 130, 246, 0.2);
  color: #60A5FA;
}

.tag-success {
  background: rgba(34, 197, 94, 0.2);
  color: #4ADE80;
}

.tag-warning {
  background: rgba(245, 158, 11, 0.2);
  color: #FBBF24;
}

.tag-error {
  background: rgba(239, 68, 68, 0.2);
  color: #F87171;
}
```

---

## 6. 布局规范

### 6.1 三栏布局

```
┌─────────────────────────────────────────────────────┐
│  Nav Bar (60px)    List Panel (200-500px)   Content │
├─────────────────────────────────────────────────────┤
│  - Chat (聊天)       - 会话列表                      │
│  - Agent (助手)      - Agent 列表                     │
│  - Store (商城)      - 分类列表                      │
│  - Settings (设置)   - 设置项列表                    │
└─────────────────────────────────────────────────────┘
```

### 6.2 面板宽度

- **导航栏**：固定 60px
- **列表面板**：可拖拽，范围 200px - 500px，默认 280px
- **内容区域**：flex: 1，自动填充剩余空间

### 6.3 响应式处理

- 最小窗口：800px × 500px
- 窗口调整时，仅内容区域自适应，导航栏和列表面板宽度不变

---

## 7. 动画规范

### 7.1 过渡时长

```css
--transition-fast: 150ms;
--transition-normal: 250ms;
--transition-slow: 350ms;
```

### 7.2 缓动函数

```css
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
```

### 7.3 常用动画

- **悬停**：`transition: all 0.2s var(--ease-in-out)`
- **模态框**：`transition: opacity 0.25s, transform 0.25s`
- **页面切换**：`transition: opacity 0.15s`

---

## 8. 图标规范

### 8.1 图标库

使用 Lucide React 图标库，风格统一为线性图标。

### 8.2 图标尺寸

| 用途 | 尺寸 |
|------|------|
| 导航栏图标 | 24px |
| 按钮图标 | 16px |
| 列表图标 | 18px |
| 状态图标 | 14px |

### 8.3 图标颜色

- 默认：`var(--color-text-secondary)`
- 激活：`var(--color-primary)`
| 禁用：`var(--color-text-muted)`

---

## 9. 响应式断点

由于是桌面应用，主要针对以下分辨率优化：

| 分辨率 | 说明 |
|--------|------|
| 1920 × 1080 | 标准桌面 |
| 1366 × 768 | 笔记本默认 |
| 2560 × 1440 | 高分屏 |

---

## 10. 无障碍设计

- 所有交互元素支持键盘导航（Tab 键）
- 焦点状态清晰可见（outline 样式）
- 颜色对比度符合 WCAG AA 标准
- 支持系统缩放（DPI 设置）

---

*本规范遵循 Radix UI 组件库的设计理念，具体实现参考 renderer/styles/global.css*