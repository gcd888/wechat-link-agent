# AI 提示词 — 微连产品海报

> 本文件用于指导 AI 图像生成工具（如 Midjourney / DALL·E / Stable Diffusion / 通义万相）生成微连产品发布海报。
> 提示词已基于参考海报风格（浅色背景 + 深蓝/紫色点缀 + 大量留白 + 上重下轻布局）进行编写。
> 复制下方提示词到对应工具中使用，可按需调整参数。

---

## 一、参考海报风格分析

参考海报 `产品海报.png` 的像素级分析结果：

| 维度 | 分析结果 |
|------|----------|
| 尺寸 | 3840×2160（4K，16:9） |
| 背景风格 | 浅色/白色为主（白色占比 ~80%，平均色 rgb(239,242,247)） |
| 主标题区 | 位于顶部 10-20% 区域，深蓝色文字 rgb(3,27,97)，暗像素占比 11.4% |
| 中段内容区 | 20-65% 区域，大量留白，仅有少量浅色辅助元素（暗像素 <1.2%） |
| 底部区域 | 80-100%，有少量彩色点缀元素（彩色占比 7.4%） |
| 核心配色 | 深蓝 `#031B61`（标题文字）、紫色 `#8B5ACC`（强调色）、浅蓝 `#8FC3FF`（辅助色）、白色 `#FFFFFF`（背景） |
| 整体风格 | 极简留白、上重下轻、专业克制、面向开发者 |

---

## 二、产品信息摘要

供 AI 上下文参考的关键信息：

| 项目 | 内容 |
|------|------|
| 产品名称 | 微连 (WeChat Link Agent) |
| Slogan | 微信即遥控，万物皆可连 |
| 产品定位 | 微信万能 Agent 遥控器 — 在微信里切换和调用电脑上的各种 AI Agent CLI |
| 目标用户 | 开发者 / 程序员 / 技术爱好者 |
| 技术栈 | Electron 33 + React 18 + TypeScript 5.7 |
| 支持平台 | Windows / macOS / Linux |
| 版本号 | v0.1.0 |
| 字体 | 系统无衬线字体（-apple-system / Segoe UI / Roboto） |

---

## 三、提示词

### 3.1 中文版（适用于通义万相 / 智谱清言等国产工具）

```
请生成一张科技产品发布海报，要求如下：

【整体风格】
浅色背景、极简留白风格，参考现代科技产品（如 Notion、Linear、Vercel）的发布会海报。整体上重下轻，上方集中展示标题和核心视觉元素，中下方大面积留白，底部放置品牌信息。风格干净、克制、专业，面向开发者群体。

【背景】
纯白色到极浅灰蓝渐变背景（#FFFFFF → #F5F7FB），干净无纹理，营造开阔感和高级感。不要深色背景，不要网格线，不要粒子效果。

【上方区域 — 标题与核心视觉（占画面上方 10-25%）】
- 左上角放置产品 Logo 图标（一个简洁的微信气泡 + 终端窗口融合图标，线性风格，紫色 #8B5ACC 描边）
- Logo 右侧大标题："微连"（深蓝色 #031B61，超大号无衬线粗体字）
- 标题下方副标题："WeChat Link Agent"（浅灰色 #666666，中号字）
- 副标题下方一行简介："微信万能 Agent 遥控器"（灰色 #888888，小号字）

【中段区域 — 产品亮点（占画面 25-60%）】
以三个简洁的圆角卡片（白底 + 浅灰边框 + 微阴影）横向排列，每个卡片内有一个线性图标 + 标题 + 一句话描述：
1. 📱 图标 + "微信即遥控" + "在微信中远程操控 AI Agent"
2. 🔗 图标 + "万物皆可连" + "支持 Claude Code / OpenCode / CodeBuddy"
3. ⚡ 图标 + "一键切换" + "多 Agent 并行调度，无缝切换"

卡片风格：白底、8px 圆角、1px 浅灰边框 (#E0E0E0)、极淡阴影。图标使用紫色 #8B5ACC 和深蓝 #031B61 双色线性风格。

【下方区域 — Slogan 与品牌信息（占画面 60-100%）】
- 中下方居中放置 Slogan："微信即遥控，万物皆可连"（深蓝色 #031B61，大号粗体字）
- Slogan 下方小字："让每个开发者的微信都成为 AI 编程助手的远程控制台"（浅灰色 #888888，中号字）
- 底部最下方一行：左侧 "v0.1.0"，右侧 "Windows · macOS · Linux"（灰色 #AAAAAA，小号字）

【配色方案】
- 背景：白色 #FFFFFF / 极浅灰蓝 #F5F7FB
- 标题文字：深蓝 #031B61
- 强调色：紫色 #8B5ACC
- 辅助色：浅蓝 #8FC3FF
- 正文文字：深灰 #333333
- 次要文字：中灰 #666666 / 浅灰 #888888
- 边框：浅灰 #E0E0E0

【风格要求】
- 扁平化设计，8px 圆角元素
- 线性图标风格，无填充
- 无过度阴影和渐变
- 大量留白，元素间距宽松
- 无人物、无 3D 渲染、无照片素材
- 整体气质：简洁、现代、专业、高级

【尺寸】
16:9 横版，4K 分辨率（3840×2160）。
```

### 3.2 英文版（适用于 Midjourney / DALL·E / Stable Diffusion）

```
A clean, minimalist product launch poster for "微连 (WeChat Link Agent)", a developer tool that turns WeChat into a remote controller for AI coding agents.

Overall style: light background, lots of white space, top-heavy layout with title and key visuals in the upper portion, generous whitespace in the middle and bottom. Inspired by modern tech product launch posters (Notion, Linear, Vercel style). Clean, restrained, professional, developer-oriented.

Background: pure white to very light gray-blue gradient (#FFFFFF → #F5F7FB), clean, no textures, no grid lines, no particle effects.

Upper section (top 10-25% of poster):
- Top-left: a minimalist line-icon logo combining a WeChat chat bubble with a terminal window, outlined in purple (#8B5ACC)
- Right of logo: large title "微连" in dark blue (#031B61), extra-large bold sans-serif
- Below title: "WeChat Link Agent" in medium gray (#666666)
- Below subtitle: "Universal Agent Remote Controller" in light gray (#888888)

Middle section (25-60%):
Three clean rounded cards arranged horizontally (white background, light gray border #E0E0E0, subtle shadow). Each card contains a line icon + title + short description:
1. Phone icon + "WeChat as Remote" + "Control AI agents from WeChat"
2. Link icon + "Connect Everything" + "Claude Code / OpenCode / CodeBuddy"
3. Lightning icon + "One-Click Switch" + "Multi-agent parallel scheduling"
Card style: white bg, 8px rounded corners, 1px border, minimal shadow. Icons in purple (#8B5ACC) and dark blue (#031B61) line style.

Lower section (60-100%):
- Center: Slogan "微信即遥控，万物皆可连" in dark blue (#031B61), large bold
- Below slogan: "Turn every developer's WeChat into an AI coding remote control" in light gray (#888888)
- Bottom row: left "v0.1.0", right "Windows · macOS · Linux" in small gray (#AAAAAA)

Color palette: white background, dark blue (#031B61) titles, purple (#8B5ACC) accent, light blue (#8FC3FF) secondary, gray text tones.
Style: flat design, 8px rounded corners, line icons, no heavy shadows, generous whitespace, no people, no 3D, no photos.

Aspect ratio: 16:9, 4K resolution.
```

### 3.3 Midjourney 精简版（直接粘贴使用）

```
Minimalist product launch poster, white background with subtle gray-blue gradient, top-left line-icon logo of WeChat bubble fused with terminal window in purple, large dark blue title text, three clean white rounded cards with line icons in middle section, slogan text at bottom, lots of white space, flat design, 8px rounded corners, purple #8B5ACC and dark blue #031B61 accents, clean modern professional developer aesthetic, no people no 3D no photos --ar 16:9 --style raw --v 6
```

---

## 四、参数调整建议

| 参数 | 建议 | 说明 |
|------|------|------|
| 尺寸比例 | `16:9` 或 `3840×2160px` | 与参考海报一致的 4K 尺寸 |
| 风格强度 | `--style raw`（Midjourney） | 减少过度艺术化，保持极简留白风格 |
| 负面提示词 | `no dark background, no 3D render, no photorealistic, no people, no neon, no particle effects` | 确保浅色干净风格 |
| 迭代次数 | 3-5 次 | 首次生成后微调描述，逐步优化布局 |
| 文字处理 | AI 生图工具对文字渲染较弱 | 建议生成无文字版本，后期用 Figma / PS 叠加文字 |

> ⚠️ **文字提示**：当前 AI 图像生成工具对中文文字渲染效果较差，建议生成纯视觉背景版本，然后在 Figma / Photoshop / Canva 中手动叠加文字内容。上方提示词中的文字描述可作为设计稿参考。

---

## 五、输出文件命名规范

生成的图片文件请按以下规范命名，并放置于 `docs/06-marketing/` 目录：

```
docs/06-marketing/poster-v{版本号}.png           # 如 poster-v0.1.0.png
docs/06-marketing/poster-v{版本号}-bg.png        # 纯背景版（无文字），供后期叠加
docs/06-marketing/poster-v{版本号}@2x.png        # 高清 2x 版本
```

---

## 六、使用场景

| 场景 | 建议尺寸 | 说明 |
|------|----------|------|
| GitHub README Banner | 1200×630px | README.md 顶部展示 |
| 微信公众号头图 | 900×383px | 推文封面 |
| 社交媒体分享 | 1200×630px | Twitter / 微博 / 小红书 |
| Product Hunt | 1270×760px | 产品发布页头图 |
| 发布会投影 / 大屏展示 | 3840×2160px | 4K 原始尺寸直接使用 |
| Electron 应用启动闪屏 | 512×512px | 应用内 splash screen |
