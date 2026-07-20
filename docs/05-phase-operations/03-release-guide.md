# 上线发布手册 - 微连

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档名称 | 上线发布手册 |
| 项目名称 | 微连 (WeChat Link Agent) |
| 版本号 | v1.0 |
| 创建日期 | 2026-07-01 |

---

## 1. 发布流程概览

```
开发完成 → 测试验证 → 构建打包 → 签名公证 → 发布部署 → 用户通知
```

---

## 2. 发布前检查清单

### 2.1 代码检查

- [ ] 所有单元测试通过
- [ ] E2E 测试通过
- [ ] 代码覆盖率 ≥ 80%
- [ ] 无 ESLint 警告
- [ ] 无 TypeScript 类型错误
- [ ] 依赖无安全漏洞

```bash
# 运行检查
npm run typecheck
npm test
npm run lint
npm audit
```

### 2.2 功能验证

- [ ] Agent 扫描正常
- [ ] 消息发送和接收正常
- [ ] 微信连接正常
- [ ] 数据持久化正常
- [ ] 加密解密正常
- [ ] WebDAV 同步正常

### 2.3 文档检查

- [ ] 版本号更新（`package.json`）
- [ ] CHANGELOG.md 更新
- [ ] 用户手册更新
- [ ] README 更新

### 2.4 资源检查

- [ ] 图标资源完整
- [ ] 启动图片正确
- [ ] 许可文件（LICENSE）包含

---

## 3. 版本号管理

### 3.1 语义化版本

遵循 [Semantic Versioning](https://semver.org/) 规范：

```
主版本号.次版本号.修订号 (MAJOR.MINOR.PATCH)

例如：0.1.0
- MAJOR: 不兼容的 API 变更
- MINOR: 向后兼容的功能新增
- PATCH: 向后兼容的问题修复
```

### 3.2 版本号更新

```bash
# 自动更新版本号（使用 npm version）
npm version patch   # 0.1.0 → 0.1.1
npm version minor   # 0.1.0 → 0.2.0
npm version major   # 0.1.0 → 1.0.0

# 手动更新（package.json）
"version": "0.1.0"
```

### 3.3 更新 CHANGELOG.md

```markdown
## [0.1.0] - 2026-07-15

### 新增
- 支持 Claude Code、OpenCode、CodeBuddy
- 微信扫码登录
- 会话管理功能
- WebDAV 数据同步

### 修复
- 修复 Agent 切换后状态不更新的问题

### 变更
- 优化应用启动速度
```

---

## 4. 构建打包

### 4.1 准备工作

```bash
# 1. 清理旧文件
rm -rf dist release

# 2. 安装依赖
npm install --legacy-peer-deps

# 3. 运行测试
npm test

# 4. 类型检查
npm run typecheck
```

### 4.2 构建生产版本

```bash
# 构建前端资源
npm run build

# 输出目录：dist/
```

### 4.3 打包应用

```bash
# 打包所有平台
npm run prod

# 输出目录：release/
# - 微连-Setup-0.1.0-win.exe
# - 微连-0.1.0.dmg
# - 微连-0.1.0.AppImage
```

### 4.4 单平台打包

```bash
# Windows
npm run build && electron-builder --win

# macOS
npm run build && electron-builder --mac

# Linux
npm run build && electron-builder --linux
```

### 4.5 打包配置

文件：`electron-builder.yml`

```yaml
appId: com.wechatlinkagent.app
productName: WLA
directories:
  output: release
  buildResources: build

files:
  - dist/**/*
  - node_modules/**/*

win:
  target:
    - nsis
    - portable

mac:
  target:
    - dmg
    - zip

linux:
  target:
    - AppImage
    - deb
```

---

## 5. 代码签名与公证

### 5.1 Windows 签名

**前提条件**：

- 拥有代码签名证书（如 DigiCert）
- Windows SDK 安装完成

**签名步骤**：

```bash
# 方法一：使用 electron-builder 配置自动签名
# electron-builder.yml
win:
  signingHashAlgorithms:
    - sha256
  certificateFile: path/to/cert.pfx
  certificatePassword: your-password

# 方法二：手动签名
signtool sign /f cert.pfx /p password /tr http://timestamp.digicert.com release/*.exe
```

**Windows 公证**（可选）：

```bash
# 上传到 Microsoft SmartScreen
# 需要 Azure 账户
```

### 5.2 macOS 签名

**前提条件**：

- Apple Developer 账户
- 证书和描述文件已配置

**签名步骤**：

```bash
# 方法一：使用 electron-builder 配置
# electron-builder.yml
mac:
  identity: "Developer ID Application: Your Name (TEAM_ID)"
  provisioningProfile: path/to/profile.provisionprofile
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist

# 方法二：手动签名
codesign --deep --force --verify --verbose --sign "Developer ID Application: Your Name" release/*.dmg
```

**macOS 公证**（必需）：

```bash
# 公证应用
xcrun notarytool submit release/*.dmg --apple-id "your@email.com" --password "app-specific-password" --team-id "TEAM_ID" --wait

# 装订票据
xcrun stapler staple release/*.dmg
```

### 5.3 Linux 签名

Linux 不强制要求签名，但可以 GPG 签名：

```bash
# 生成 GPG 密钥
gpg --gen-key

# 签名
gpg --detach-sign --armor release/*.AppImage

# 验证
gpg --verify release/*.AppImage.asc
```

---

## 6. 发布部署

### 6.1 GitHub Release

**步骤**：

1. 推送代码到 GitHub
2. 创建新 Release

```bash
# 推送标签
git tag -a v0.1.0 -m "Release 0.1.0"
git push origin v0.1.0
```

3. 在 GitHub 网页创建 Release：
   - 标题：`v0.1.0`
   - 描述：复制 CHANGELOG 内容
   - 上传构建文件：
     - `微连-Setup-0.1.0-win.exe`
     - `微连-0.1.0.dmg`
     - `微连-0.1.0.AppImage`

### 6.2 自动更新配置

配置应用内自动更新：

```typescript
// src/main/auto-updater.ts
import { autoUpdater } from 'electron-updater'

export function setupAutoUpdater() {
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'gcd888',
    repo: 'wechat-link-agent'
  })

  autoUpdater.checkForUpdatesAndNotify()
}
```

### 6.3 CDN 加速（可选）

将构建文件上传到 CDN：

```bash
# 上传到阿里云 OSS
ossutil cp release/*.exe oss://wechat-link-agent/releases/

# 上传到 GitHub Pages
gh release upload v0.1.0 release/*.exe --clobber
```

---

## 7. 应用商店上架（可选）

### 7.1 Microsoft Store

**前提条件**：

- Microsoft 开发者账户（$19/年）
- 应用已签名

**上架步骤**：

1. 登录 [Partner Center](https://partner.microsoft.com/dashboard)
2. 创建新应用
3. 上传 `微连-Setup-0.1.0-win.exe`
4. 填写应用信息：
   - 名称：微连
   - 描述：应用介绍
   - 截图：至少 4 张（1920×1080）
   - 图标：PNG 格式
5. 提交审核（约 3-5 天）

### 7.2 Mac App Store

**前提条件**：

- Apple Developer 账户（$99/年）
- 应用已签名和公证

**上架步骤**：

1. 使用 Xcode 打包
2. 上传到 App Store Connect
3. 填写应用信息
4. 提交审核（约 1-2 周）

### 7.3 Snap Store (Linux)

```bash
# 打包 Snap
electron-builder --linux snap

# 发布到 Snap Store
snapcraft push release/*.snap
```

---

## 8. 用户通知

### 8.1 发布公告模板

```markdown
## 🎉 微连 v0.1.0 发布！

### 新增功能

- ✨ 支持 Claude Code、OpenCode、CodeBuddy
- 🤖 微信扫码登录，远程操控 AI
- 💬 多会话管理，消息历史保存
- ☁️ WebDAV 数据同步，多设备一致

### 下载链接

- **Windows**: [下载 EXE](https://github.com/gcd888/wechat-link-agent/releases/download/v0.1.0/微连-Setup-0.1.0-win.exe)
- **macOS**: [下载 DMG](https://github.com/gcd888/wechat-link-agent/releases/download/v0.1.0/微连-0.1.0.dmg)
- **Linux**: [下载 AppImage](https://github.com/gcd888/wechat-link-agent/releases/download/v0.1.0/微连-0.1.0.AppImage)

### 升级说明

自动更新功能已启用，应用会在启动时自动检查更新。

### 反馈渠道

如有问题，请在 [GitHub Issues](https://github.com/gcd888/wechat-link-agent/issues) 反馈。

---

查看完整更新日志：[CHANGELOG.md](https://github.com/gcd888/wechat-link-agent/blob/master/CHANGELOG.md)
```

### 8.2 通知渠道

- GitHub Release
- 官网公告
- 微信群
- 邮件列表（可选）

---

## 9. 发布后监控

### 9.1 监控指标

| 指标 | 目标值 | 监控工具 |
|------|--------|----------|
| 下载量 | - | GitHub Release 统计 |
| 崩溃率 | < 0.1% | Sentry / Crashlytics |
| 活跃用户 | - | 应用内统计 |
| 问题反馈 | - | GitHub Issues |

### 9.2 日志收集

```typescript
// 集成 Sentry
import * as Sentry from '@sentry/electron'

Sentry.init({
  dsn: 'your-sentry-dsn',
  environment: process.env.NODE_ENV
})
```

### 9.3 紧急回滚

**回滚流程**：

1. 立即删除 GitHub Release
2. 发布旧版本标记为最新
3. 通知用户降级
4. 修复问题后重新发布

---

## 10. 热修复流程

### 10.1 何时使用热修复

- 严重崩溃问题
- 数据丢失风险
- 安全漏洞

### 10.2 热修复步骤

```bash
# 1. 创建热修复分支
git checkout -b hotfix/v0.1.1

# 2. 修复问题
# ... 修改代码 ...

# 3. 更新版本号
npm version patch  # 0.1.0 → 0.1.1

# 4. 测试验证
npm test

# 5. 打包发布
npm run prod

# 6. 合并到主分支
git checkout master
git merge hotfix/v0.1.1

# 7. 推送发布
git tag -a v0.1.1 -m "Hotfix 0.1.1"
git push origin master
git push origin refs/tags/v0.1.1
```

---

## 11. 常见问题

### 11.1 打包失败

**问题**：`Error: Cannot find module 'xxx'`

**解决**：

```bash
# 清理缓存
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps

# 检查依赖
npm ls
```

### 11.2 签名失败

**问题**：`Error: Code signing failed`

**解决**：

- 检查证书是否过期
- 检查证书密码是否正确
- 检查 `electron-builder.yml` 配置

### 11.3 公证失败

**问题**：`Error: Notarization failed`

**解决**：

- 检查 Apple ID 和密码
- 检查 App-Specific Password
- 检查 Team ID 是否正确

---

## 12. 发布清单模板

```markdown
## [版本号] 发布清单

### 代码
- [ ] 版本号更新
- [ ] CHANGELOG 更新
- [ ] 所有测试通过
- [ ] 代码审查完成

### 构建
- [ ] 前端资源构建完成
- [ ] 所有平台打包完成
- [ ] 代码签名完成
- [ ] 公证完成（macOS）

### 发布
- [ ] GitHub Release 创建
- [ ] 构建文件上传
- [ ] 自动更新配置完成
- [ ] 应用商店提交（可选）

### 通知
- [ ] 发布公告编写
- [ ] 官网更新
- [ ] 社区通知
- [ ] 用户通知

### 监控
- [ ] 下载量监控
- [ ] 崩溃率监控
- [ ] 问题反馈收集
```

---

*请确保所有检查项都完成后再发布*