# 微信 iLink Bot API 接口文档

> 本文档描述微信 iLink Bot 平台提供的全部 HTTP 接口。
>
> **文档说明：** 涵盖核心业务接口（getUpdates / sendMessage / getUploadUrl / getConfig / sendTyping）、登录扫码（getBotQRCode / getQRCodeStatus）、生命周期管理（notifyStart / notifyStop）以及 CDN 媒体上传/下载等接口，供二次开发参考。
>
> 最后更新：2026-07-17

---

## 📋 接口总览

| # | 接口名称 | HTTP 方法 | 路径 | 作用 | 官方文档 |
|---|---------|-----------|------|------|----------|
| 1 | getUpdates | POST | `ilink/bot/getupdates` | 长轮询拉取新消息 | ✅ 公开 |
| 2 | sendMessage | POST | `ilink/bot/sendmessage` | 发送消息给用户 | ✅ 公开 |
| 3 | getUploadUrl | POST | `ilink/bot/getuploadurl` | 获取媒体文件上传地址 | ✅ 公开 |
| 4 | getConfig | POST | `ilink/bot/getconfig` | 获取账号配置（含 typing_ticket） | ✅ 公开 |
| 5 | sendTyping | POST | `ilink/bot/sendtyping` | 发送「正在输入」状态 | ✅ 公开 |
| 6 | getBotQRCode | POST | `ilink/bot/get_bot_qrcode` | 获取扫码登录二维码 | ⚙️ 内部 |
| 7 | getQRCodeStatus | GET | `ilink/bot/get_qrcode_status` | 长轮询查询扫码状态 | ⚙️ 内部 |
| 8 | notifyStart | POST | `ilink/bot/msg/notifystart` | 通知服务端频道客户端启动 | ⚙️ 内部 |
| 9 | notifyStop | POST | `ilink/bot/msg/notifystop` | 通知服务端频道客户端停止 | ⚙️ 内部 |
| 10 | CDN Upload | POST | `{cdnBaseUrl}/upload` | 上传加密媒体文件到 CDN | ⚙️ 内部 |
| 11 | CDN Download | GET | `{cdnBaseUrl}/download` | 从 CDN 下载加密媒体文件 | ⚙️ 内部 |

> **说明**：✅ 公开 = 官方 README 文档中明确列出的接口；⚙️ 内部 = 通过源码分析发现的内部实现接口，官方未公开文档但实际使用。

---

## 🌐 基础信息

### 插件兼容性

iLink Bot 插件对宿主版本有要求：

| 插件版本 | OpenClaw 宿主版本 | npm dist-tag | 状态 |
|----------|-------------------|-------------|------|
| 2.x | >=2026.5.12 | `latest` | 活跃 |
| 1.x | >=2026.1.0 <2026.3.22 | `legacy` | 维护中 |

> 插件启动时会检查宿主版本，若运行中的 OpenClaw 版本超出支持范围，插件将拒绝加载。

### 服务地址

| 服务 | Base URL | 说明 |
|------|----------|------|
| iLink Bot API | `https://ilinkai.weixin.qq.com` | 所有业务接口的基础地址（官方固定地址） |
| CDN 服务 | `https://novac2c.cdn.weixin.qq.com/c2c` | 媒体文件上传/下载 |

> **注意**：扫码登录成功后，服务端可能返回新的 `baseurl`，后续业务请求应使用该地址。扫码轮询阶段也可能通过 `scaned_but_redirect` 状态返回 `redirect_host` 进行 IDC 重定向。

### 超时设置

| 接口类型 | 默认超时 | 说明 |
|----------|----------|------|
| 长轮询（getUpdates） | 35,000 ms | 服务端会保持连接直到有消息或超时 |
| 二维码状态轮询 | 35,000 ms | 长轮询模式，超时后返回 `wait` |
| 常规 API（sendMessage, getUploadUrl） | 15,000 ms | |
| 轻量 API（getConfig, sendTyping, notifyStart/Stop） | 10,000 ms | |

---

## 📨 公共请求头

### POST 请求公共头

所有 POST 请求（除登录扫码外）均需携带以下请求头：

| 请求头 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `Content-Type` | string | 是 | 固定 `application/json` |
| `AuthorizationType` | string | 是 | 固定 `ilink_bot_token` |
| `Authorization` | string | 否 | `Bearer {bot_token}`，登录后获取的 Bot Token |
| `X-WECHAT-UIN` | string | 是 | 随机 uint32 → 十进制字符串 → Base64 编码 |
| `iLink-App-Id` | string | 是 | 从 `package.json` 的 `ilink_appid` 字段读取，当前值为 `"bot"` |
| `iLink-App-ClientVersion` | string | 是 | 版本号编码：`major<<16 \| minor<<8 \| patch` |
| `SKRouteTag` | string | 否 | 路由标签，从配置文件读取（可选） |

**`X-WECHAT-UIN` 生成算法：**

```
1. 生成 4 字节随机数
2. 读取为 uint32 大端整数
3. 转为十进制字符串
4. 对字符串进行 Base64 编码
```

**`iLink-App-ClientVersion` 编码规则：**

```
版本号 "1.0.11" → 0x0001000B = 65547
公式: (major & 0xff) << 16 | (minor & 0xff) << 8 | (patch & 0xff)
```

### GET 请求公共头

GET 请求（如二维码状态轮询）仅需基础头：

| 请求头 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `iLink-App-Id` | string | 是 | 同上 |
| `iLink-App-ClientVersion` | string | 是 | 同上 |
| `SKRouteTag` | string | 否 | 同上 |

### BaseInfo 公共请求体字段

每个 POST 请求体中均包含 `base_info` 字段：

```json
{
  "channel_version": "2.4.6",
  "bot_agent": "OpenClaw"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `channel_version` | string | 插件版本号 |
| `bot_agent` | string | 上游应用自声明标识（UA 风格），默认 `"OpenClaw"`，仅用于可观测性，不用于鉴权或路由。格式：`Name/Version`，多个 token 空格分隔，总长度 ≤ 256 字节 |

### 自定义 BotAgent 配置

每条出站请求会带上一个自我声明的 `bot_agent` 字段，类似 HTTP `User-Agent`，用于后台日志归因和监控聚合。**默认值为 `OpenClaw`**，可在 `openclaw.json` 中自定义：

```json
{
  "channels": {
    "openclaw-weixin": {
      "botAgent": "MyBot/1.2.0"
    }
  }
}
```

**格式规范**（UA 风格）：

- 一个或多个 `Name/Version` token，空格分隔
- 每个 token 可选地跟一个 ` (comment)`
- 仅允许 ASCII 字符；总长度 ≤ 256 字节
- 不合规的 token 在清洗时静默丢弃；如果最终为空，回退到 `OpenClaw`

**可直接使用的示例：**

- `MyBot/1.2.0`
- `MyBot/1.2.0 (region=cn;env=prod)`
- `MyBot/1.2.0 LangChain/0.3.5`
- `MyBot/1.2.0-rc.1+build.5`

> **注意**：`bot_agent` 仅用于观测，**不参与鉴权或路由**。当前本插件实例下所有已注册的 agent 共享同一个 `botAgent` 声明。

---

## 📖 接口详情

### 一、官方公开接口

### 1. getUpdates — 长轮询拉取新消息

> 核心消息接收接口。服务端会保持连接直到有新消息或超时，实现长轮询机制。

| 项目 | 内容 |
|------|------|
| **方法** | `POST` |
| **完整路径** | `{baseUrl}/ilink/bot/getupdates` |
| **需要 Token** | 是 |
| **长轮询超时** | 35,000 ms（可被服务端 `longpolling_timeout_ms` 动态调整） |

**请求头：** POST 公共头（含 Authorization）

**请求体：**

```json
{
  "get_updates_buf": "",
  "base_info": {
    "channel_version": "2.4.6",
    "bot_agent": "OpenClaw"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `get_updates_buf` | string | 上一次响应返回的同步游标，首次请求传空字符串 `""` |
| `base_info` | BaseInfo | 公共请求元数据 |

**响应体：**

```json
{
  "ret": 0,
  "errcode": 0,
  "errmsg": "",
  "msgs": [WeixinMessage],
  "get_updates_buf": "base64_encoded_cursor",
  "longpolling_timeout_ms": 35000
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `ret` | number | 返回码，`0` 表示成功 |
| `errcode` | number | 错误码（如 `-14` 表示 token 过期/会话超时） |
| `errmsg` | string | 错误信息 |
| `msgs` | WeixinMessage[] | 新消息列表 |
| `get_updates_buf` | string | 更新后的同步游标，需缓存并在下次请求携带 |
| `longpolling_timeout_ms` | number | 服务端建议的下一次长轮询超时时间（ms） |

> **错误码 `-14`（STALE_TOKEN）**：表示 bot_token 已过期，客户端应暂停该账号的所有请求 1 小时后再重试。

---

### 2. sendMessage — 发送消息给用户

> 向指定用户发送一条消息（文本、图片、语音、视频、文件、工具调用状态等）。

| 项目 | 内容 |
|------|------|
| **方法** | `POST` |
| **完整路径** | `{baseUrl}/ilink/bot/sendmessage` |
| **需要 Token** | 是 |
| **超时** | 15,000 ms |

**请求头：** POST 公共头（含 Authorization）

**请求体：**

```json
{
  "msg": {
    "from_user_id": "",
    "to_user_id": "xxx@im.wechat",
    "client_id": "openclaw-weixin-xxxxx",
    "message_type": 2,
    "message_state": 2,
    "item_list": [
      {
        "type": 1,
        "text_item": { "text": "你好！" }
      }
    ],
    "context_token": "xxx",
    "run_id": "xxx"
  },
  "base_info": {
    "channel_version": "2.4.6",
    "bot_agent": "OpenClaw"
  }
}
```

**WeixinMessage 结构：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `from_user_id` | string | 发送方 ID（Bot 发送时填空字符串） |
| `to_user_id` | string | 接收方微信用户 ID |
| `client_id` | string | 客户端生成的消息唯一标识 |
| `message_type` | number | 消息类型：`1`=USER, `2`=BOT |
| `message_state` | number | 消息状态：`0`=NEW, `1`=GENERATING, `2`=FINISH |
| `item_list` | MessageItem[] | 消息内容项列表 |
| `context_token` | string | 会话上下文 Token（从入站消息中获取，回复时必须传回） |
| `run_id` | string | 运行 ID（用于关联同一轮对话） |
| `session_id` | string | 会话 ID |
| `group_id` | string | 群组 ID |
| `message_id` | number | 消息 ID |
| `create_time_ms` | number | 创建时间（毫秒时间戳） |
| `update_time_ms` | number | 更新时间（毫秒时间戳） |

**MessageItem 结构（type 决定使用哪个子项）：**

| type 值 | 类型常量 | 对应子项字段 | 说明 |
|---------|----------|-------------|------|
| 1 | TEXT | `text_item` | 文本消息 |
| 2 | IMAGE | `image_item` | 图片消息 |
| 3 | VOICE | `voice_item` | 语音消息 |
| 4 | FILE | `file_item` | 文件消息 |
| 5 | VIDEO | `video_item` | 视频消息 |
| 11 | TOOL_CALL_START | `tool_call_start_item` | 工具调用开始 |
| 12 | TOOL_CALL_RESULT | `tool_call_result_item` | 工具调用结果 |

**各子项结构：**

```json
// TextItem (type=1)
{ "text": "消息文本内容" }

// ImageItem (type=2)
{
  "media": {
    "encrypt_query_param": "cdn_download_param",
    "aes_key": "base64_encoded_aes_key",
    "encrypt_type": 1,
    "full_url": "https://..."
  },
  "thumb_media": { /* CDNMedia, 缩略图 */ },
  "aeskey": "hex_string_16bytes",
  "mid_size": 1024,
  "thumb_size": 256,
  "thumb_height": 200,
  "thumb_width": 200,
  "hd_size": 2048
}

// VoiceItem (type=3)
{
  "media": { /* CDNMedia */ },
  "encode_type": 6,      // 1=pcm 2=adpcm 3=feature 4=speex 5=amr 6=silk 7=mp3 8=ogg-speex
  "bits_per_sample": 16,
  "sample_rate": 44100,
  "playtime": 5000,      // 语音长度（毫秒）
  "text": "语音转文字内容"
}

// FileItem (type=4)
{
  "media": { /* CDNMedia */ },
  "file_name": "document.pdf",
  "md5": "file_md5_hex",
  "len": "1048576"       // 文件大小（字符串）
}

// VideoItem (type=5)
{
  "media": { /* CDNMedia */ },
  "video_size": 2048,
  "play_length": 10000,  // 播放时长（毫秒）
  "video_md5": "video_md5_hex",
  "thumb_media": { /* CDNMedia */ },
  "thumb_size": 256,
  "thumb_height": 200,
  "thumb_width": 200
}

// ToolCallStartItem (type=11)
{
  "tool_name": "web_search",
  "tool_call_id": "call_xxx"
}

// ToolCallResultItem (type=12)
{
  "tool_name": "web_search",
  "tool_call_id": "call_xxx",
  "status": "completed"  // completed / failed / blocked / unknown
}
```

**CDNMedia 结构（CDN 媒体引用）：**

> 所有媒体类型（图片/语音/文件/视频）均通过 CDN 传输，使用 AES-128-ECB 加密。

| 字段 | 类型 | 说明 |
|------|------|------|
| `encrypt_query_param` | string | CDN 下载/上传加密参数 |
| `aes_key` | string | Base64 编码的 AES-128 密钥 |
| `encrypt_type` | number | 加密类型：`0`=仅加密 fileid，`1`=打包缩略图/中图信息 |
| `full_url` | string | 完整下载 URL（服务端直接返回，无需客户端拼接） |

**响应体：**

```json
{
  "ret": 0,
  "errmsg": ""
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `ret` | number | 返回码，`0` 表示成功，非 0 表示失败 |
| `errmsg` | string | 错误信息 |

> 当 `ret` 不为 0 时，客户端应抛出异常并记录日志。

---

### 3. getUploadUrl — 获取媒体文件上传地址

> 在上传媒体文件到 CDN 之前，先调用此接口获取上传地址和加密参数。

| 项目 | 内容 |
|------|------|
| **方法** | `POST` |
| **完整路径** | `{baseUrl}/ilink/bot/getuploadurl` |
| **需要 Token** | 是 |
| **超时** | 15,000 ms |

**请求头：** POST 公共头（含 Authorization）

**请求体：**

```json
{
  "filekey": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "media_type": 1,
  "to_user_id": "xxx@im.wechat",
  "rawsize": 102400,
  "rawfilemd5": "md5_hex_of_plaintext",
  "filesize": 102416,
  "thumb_rawsize": 0,
  "thumb_rawfilemd5": "",
  "thumb_filesize": 0,
  "no_need_thumb": true,
  "aeskey": "hex_string_16bytes",
  "base_info": {
    "channel_version": "2.4.6",
    "bot_agent": "OpenClaw"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `filekey` | string | 是 | 客户端生成的文件唯一标识（16 字节随机 hex） |
| `media_type` | number | 是 | 媒体类型：`1`=IMAGE, `2`=VIDEO, `3`=FILE（官方文档列出），`4`=VOICE（源码补充） |
| `to_user_id` | string | 是 | 接收方微信用户 ID |
| `rawsize` | number | 是 | 原文件明文大小（字节） |
| `rawfilemd5` | string | 是 | 原文件明文 MD5 |
| `filesize` | number | 是 | 原文件密文大小（AES-128-ECB 加密后，含 PKCS7 填充） |
| `thumb_rawsize` | number | 否 | 缩略图明文大小（IMAGE/VIDEO 时必填） |
| `thumb_rawfilemd5` | string | 否 | 缩略图明文 MD5（IMAGE/VIDEO 时必填） |
| `thumb_filesize` | number | 否 | 缩略图密文大小（IMAGE/VIDEO 时必填） |
| `no_need_thumb` | boolean | 否 | 不需要缩略图上传 URL，默认 `false` |
| `aeskey` | string | 是 | AES-128 加密密钥（hex 字符串，16 字节） |
| `base_info` | BaseInfo | 是 | 公共请求元数据 |

**响应体：**

```json
{
  "upload_param": "encrypted_upload_param",
  "thumb_upload_param": "",
  "upload_full_url": "https://..."
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `upload_param` | string | 原图上传加密参数（用于拼接 CDN 上传 URL） |
| `thumb_upload_param` | string | 缩略图上传加密参数（无缩略图时为空） |
| `upload_full_url` | string | 完整上传 URL（服务端直接返回，优先使用） |

> 客户端优先使用 `upload_full_url`，为空时回退到 `{cdnBaseUrl}/upload?encrypted_query_param={upload_param}&filekey={filekey}`。

---

### 4. getConfig — 获取账号配置

> 获取指定用户的 Bot 配置信息，主要用于获取 `typing_ticket`（发送输入状态所需的票据）。

| 项目 | 内容 |
|------|------|
| **方法** | `POST` |
| **完整路径** | `{baseUrl}/ilink/bot/getconfig` |
| **需要 Token** | 是 |
| **超时** | 10,000 ms |

**请求头：** POST 公共头（含 Authorization）

**请求体：**

```json
{
  "ilink_user_id": "xxx@im.wechat",
  "context_token": "xxx",
  "base_info": {
    "channel_version": "2.4.6",
    "bot_agent": "OpenClaw"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `ilink_user_id` | string | 是 | 用户微信 ID |
| `context_token` | string | 否 | 会话上下文 Token |
| `base_info` | BaseInfo | 是 | 公共请求元数据 |

**响应体：**

```json
{
  "ret": 0,
  "errmsg": "",
  "typing_ticket": "base64_encoded_ticket"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `ret` | number | 返回码，`0` 表示成功 |
| `errmsg` | string | 错误信息 |
| `typing_ticket` | string | Base64 编码的输入状态票据，用于 sendTyping 接口 |

> 客户端应缓存此配置（默认 TTL 24 小时），失败时使用指数退避重试（最长 1 小时）。

---

### 5. sendTyping — 发送「正在输入」状态

> 向用户发送「正在输入...」状态指示器，增强对话体验。

| 项目 | 内容 |
|------|------|
| **方法** | `POST` |
| **完整路径** | `{baseUrl}/ilink/bot/sendtyping` |
| **需要 Token** | 是 |
| **超时** | 10,000 ms |

**请求头：** POST 公共头（含 Authorization）

**请求体：**

```json
{
  "ilink_user_id": "xxx@im.wechat",
  "typing_ticket": "base64_encoded_ticket",
  "status": 1,
  "base_info": {
    "channel_version": "2.4.6",
    "bot_agent": "OpenClaw"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `ilink_user_id` | string | 是 | 用户微信 ID |
| `typing_ticket` | string | 是 | 从 getConfig 获取的输入状态票据 |
| `status` | number | 否 | `1`=正在输入（默认），`2`=取消输入 |
| `base_info` | BaseInfo | 是 | 公共请求元数据 |

**响应体：**

```json
{
  "ret": 0,
  "errmsg": ""
}
```

---

### 二、内部实现接口

> 以下接口未在官方 README 中公开文档，但通过源码分析确认在实际使用。供二次开发参考。

### 6. getBotQRCode — 获取扫码登录二维码

> 获取微信扫码登录二维码，用于绑定 Bot 账号。

| 项目 | 内容 |
|------|------|
| **方法** | `POST` |
| **完整路径** | `{baseUrl}/ilink/bot/get_bot_qrcode?bot_type={botType}` |
| **需要 Token** | 否 |
| **固定地址** | 是，扫码阶段始终使用官方固定地址 `https://ilinkai.weixin.qq.com` |

**Query 参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `bot_type` | string | Bot 类型，默认 `"3"` |

**请求头：** POST 公共头（无需 Authorization）

**请求体：**

```json
{
  "local_token_list": ["token1", "token2"]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `local_token_list` | string[] | 本地已登录账号的 bot token 列表（最多 10 个），用于服务端识别已绑定账号，避免重复绑定 |

**响应体：**

```json
{
  "qrcode": "xxxxx",
  "qrcode_img_content": "https://..."
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `qrcode` | string | 二维码唯一标识，用于后续状态轮询 |
| `qrcode_img_content` | string | 二维码图片内容/链接，可直接展示给用户扫码 |

---

### 7. getQRCodeStatus — 长轮询查询扫码状态

> 长轮询方式查询二维码扫描状态，服务端会保持连接直到状态变化或超时。

| 项目 | 内容 |
|------|------|
| **方法** | `GET` |
| **完整路径** | `{baseUrl}/ilink/bot/get_qrcode_status?qrcode={qrcode}&verify_code={verifyCode}` |
| **需要 Token** | 否 |
| **长轮询超时** | 35,000 ms |

**Query 参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `qrcode` | string | 是 | getBotQRCode 返回的二维码标识 |
| `verify_code` | string | 否 | 配对验证码（当状态为 `need_verifycode` 时需提交） |

**请求头：** GET 公共头

**响应体：**

```json
{
  "status": "confirmed",
  "bot_token": "xxxxx",
  "ilink_bot_id": "xxx@im.bot",
  "baseurl": "https://ilinkai.weixin.qq.com",
  "ilink_user_id": "xxx@im.wechat",
  "redirect_host": "ilinkai2.weixin.qq.com"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | string | 扫码状态，见下表 |
| `bot_token` | string | Bot Token（仅 `confirmed` 时返回） |
| `ilink_bot_id` | string | Bot 账号 ID（仅 `confirmed` 时返回） |
| `baseurl` | string | 后续 API 请求的基础地址（仅 `confirmed` 时返回） |
| `ilink_user_id` | string | 扫码用户的微信 ID（仅 `confirmed` 时返回） |
| `redirect_host` | string | IDC 重定向主机地址（仅 `scaned_but_redirect` 时返回） |

**状态值说明：**

| 状态 | 说明 |
|------|------|
| `wait` | 等待扫码 |
| `scaned` | 已扫码，正在验证 |
| `confirmed` | 扫码确认成功，返回 bot_token 等凭证 |
| `expired` | 二维码已过期 |
| `scaned_but_redirect` | 已扫码但需要 IDC 重定向，切换到 `redirect_host` 继续轮询 |
| `need_verifycode` | 需要输入配对验证码（手机微信显示的数字） |
| `verify_code_blocked` | 验证码输入错误次数过多，被限制 |
| `binded_redirect` | 该 Bot 已绑定到当前实例，无需重复连接 |

> **配对码登录流程**（v2.3.1+ 支持）：当状态返回 `need_verifycode` 时，需在手机微信上查看显示的数字并作为 `verify_code` 参数提交。多次输入错误会触发 `verify_code_blocked` 状态，需刷新二维码后重试。

---

### 8. notifyStart — 通知频道客户端启动

> 在频道客户端（Gateway）启动时通知服务端，用于服务端进行连接管理。

| 项目 | 内容 |
|------|------|
| **方法** | `POST` |
| **完整路径** | `{baseUrl}/ilink/bot/msg/notifystart` |
| **需要 Token** | 是 |
| **超时** | 10,000 ms |

**请求头：** POST 公共头（含 Authorization）

**请求体：**

```json
{
  "base_info": {
    "channel_version": "2.4.6",
    "bot_agent": "OpenClaw"
  }
}
```

**响应体：**

```json
{
  "ret": 0,
  "errmsg": ""
}
```

> 此接口在启动时调用，失败会被忽略（不影响后续 getUpdates 长轮询）。

---

### 9. notifyStop — 通知频道客户端停止

> 在频道客户端（Gateway）停止时通知服务端，用于优雅关闭连接。

| 项目 | 内容 |
|------|------|
| **方法** | `POST` |
| **完整路径** | `{baseUrl}/ilink/bot/msg/notifystop` |
| **需要 Token** | 是 |
| **超时** | 10,000 ms |

**请求头：** POST 公共头（含 Authorization）

**请求体：**

```json
{
  "base_info": {
    "channel_version": "2.4.6",
    "bot_agent": "OpenClaw"
  }
}
```

**响应体：**

```json
{
  "ret": 0,
  "errmsg": ""
}
```

> 此接口使用独立超时（不使用 Gateway 的 abort signal），确保在长轮询已被中止后仍能完成发送。

---

## 📦 CDN 媒体接口

> CDN 接口用于媒体文件（图片、视频、语音、文件）的上传和下载，所有文件均使用 **AES-128-ECB** 加密。官方 README 描述了上传流程但未将 CDN 上传/下载列为独立 API 接口。

### 10. CDN Upload — 上传加密媒体文件

> 将 AES-128-ECB 加密后的媒体文件上传到微信 CDN。
>
> **官方文档说明**：官方 README 描述此步骤为「PUT upload to the CDN URL」，但实际源码实现使用的是 `POST` 方法。

| 项目 | 内容 |
|------|------|
| **方法** | `POST` |
| **完整路径** | `{upload_full_url}` 或 `{cdnBaseUrl}/upload?encrypted_query_param={uploadParam}&filekey={filekey}` |
| **需要 Token** | 否（CDN 接口不使用 Bot Token） |
| **超时** | 无客户端超时（依赖 OS/TCP 栈） |
| **最大重试** | 3 次（仅服务端错误重试，4xx 立即中止） |

**请求头：**

| 请求头 | 值 | 说明 |
|--------|-----|------|
| `Content-Type` | `application/octet-stream` | 二进制流 |

**请求体：** AES-128-ECB 加密后的二进制数据（`Uint8Array`）

**官方上传流程描述：**

```
1. 计算文件的明文大小、MD5，以及 AES-128-ECB 加密后的密文大小
2. 如果需要缩略图（图片/视频），同样计算缩略图的明文和密文参数
3. 调用 getUploadUrl 获取 upload_param（和 thumb_upload_param）
4. 使用 AES-128-ECB 加密文件内容，上传到 CDN URL
   注意：官方 README 描述为 PUT，源码实现为 POST
5. 同样方式加密并上传缩略图
6. 使用返回的 encrypt_query_param 构造 CDNMedia 引用，
   包含在 MessageItem 中通过 sendMessage 发送
```

**源码实现的上传流程：**

```
1. 读取明文文件
2. 计算 MD5、生成随机 filekey（16 字节 hex）和 aeskey（16 字节随机）
3. 调用 getUploadUrl 获取上传地址
4. 使用 aeskey 对明文进行 AES-128-ECB 加密（PKCS7 填充）
5. POST 加密数据到 CDN
6. 从响应头 x-encrypted-param 获取下载参数
```

**响应：**

| 响应头 | 说明 |
|--------|------|
| `x-encrypted-param` | CDN 下载加密参数，用于后续 sendMessage 中的 `encrypt_query_param` |
| `x-error-message` | 错误信息（仅失败时） |

**HTTP 状态码处理：**

| 状态码 | 处理方式 |
|--------|----------|
| 200 | 成功，从 `x-encrypted-param` 头获取下载参数 |
| 4xx | 客户端错误，立即中止（不重试） |
| 5xx | 服务端错误，重试（最多 3 次） |

---

### 11. CDN Download — 下载加密媒体文件

> 从微信 CDN 下载 AES-128-ECB 加密的媒体文件并解密。

| 项目 | 内容 |
|------|------|
| **方法** | `GET` |
| **完整路径** | `{full_url}` 或 `{cdnBaseUrl}/download?encrypted_query_param={encryptedQueryParam}` |
| **需要 Token** | 否 |
| **超时** | 无客户端超时 |

**请求头：** 无特殊头（普通 GET 请求）

**Query 参数（回退拼接模式）：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `encrypted_query_param` | string | 从消息中的 `media.encrypt_query_param` 获取 |

**响应体：** AES-128-ECB 加密的二进制数据

**下载流程：**

```
1. 从消息的 media 字段获取 encrypt_query_param 和 aes_key
2. 优先使用 full_url，否则拼接 {cdnBaseUrl}/download?encrypted_query_param={param}
3. GET 请求下载加密数据
4. 使用 aes_key 进行 AES-128-ECB 解密
5. 返回明文 Buffer
```

**AES Key 解析规则（`aes_key` 字段）：**

| 编码格式 | 适用场景 | 解析方式 |
|----------|----------|----------|
| Base64(16 字节原始密钥) | 图片消息 | Base64 解码 → 直接使用 16 字节 |
| Base64(32 字符 hex 字符串) | 文件/语音/视频 | Base64 解码 → hex 字符串 → 再 hex 解码为 16 字节 |

---

## 🏢 多账号与上下文隔离

### 多账号支持

每次扫码登录都会创建一个新的账号条目，支持多个微信号同时在线：

```bash
openclaw channels login --channel openclaw-weixin
```

### 多账号上下文隔离

默认情况下，私聊可能共用同一会话桶。**多个微信号同时登录**时，建议按「账号 + 频道 + 对端」隔离：

```bash
openclaw config set session.dmScope per-account-channel-peer
```

---

## 🔄 典型业务流程

### 扫码登录流程

```
1. POST ilink/bot/get_bot_qrcode?bot_type=3
   ← { qrcode, qrcode_img_content }
2. GET  ilink/bot/get_qrcode_status?qrcode={qrcode}  (长轮询)
   ← { status: "wait" }  → 继续轮询
   ← { status: "scaned" } → 继续轮询
   ← { status: "confirmed", bot_token, ilink_bot_id, baseurl, ilink_user_id }
3. 保存 bot_token、baseurl 到本地
```

### 消息收发流程

```
1. POST ilink/bot/msg/notifystart          ← 通知启动
2. POST ilink/bot/getupdates               ← 长轮询拉取消息（循环）
   ← { msgs: [...] }
3. 对每条消息:
   a. POST ilink/bot/getconfig             ← 获取用户配置（typing_ticket）
   b. POST ilink/bot/sendtyping            ← 发送输入状态
   c. 调用 AI Agent 处理消息
   d. POST ilink/bot/sendmessage           ← 发送回复
4. POST ilink/bot/msg/notifystop           ← 通知停止
```

### 媒体发送流程

```
1. 读取文件 → 计算 MD5 → 生成 filekey + aeskey
2. POST ilink/bot/getuploadurl             ← 获取上传地址
   ← { upload_full_url }
3. AES-128-ECB 加密文件
4. POST {upload_full_url}                  ← 上传到 CDN
   ← x-encrypted-param 响应头
5. POST ilink/bot/sendmessage              ← 发送含媒体引用的消息
   请求体 msg.item_list 中包含 image_item / video_item / file_item
```

### 媒体接收流程

```
1. POST ilink/bot/getupdates               ← 收到含媒体的消息
   ← { msgs: [{ item_list: [{ type: 2, image_item: { media: { encrypt_query_param, aes_key } } } ] }] }
2. GET  {cdnBaseUrl}/download?encrypted_query_param={param}  ← 下载加密文件
3. AES-128-ECB 解密 → 得到明文文件
```

---

## ⚠️ 错误处理

### 错误码

| 错误码 | 含义 | 处理方式 |
|--------|------|----------|
| `ret=0` | 成功 | 正常处理 |
| `ret≠0` | 业务错误 | 记录日志，根据 errmsg 处理 |
| `errcode=-14` | Token 过期/会话超时 | 暂停该账号所有请求 1 小时 |

### 网络错误分类

| 类型 | 说明 | 常见原因 |
|------|------|----------|
| `dns` | DNS 解析失败 | 检查 DNS 配置（ENOTFOUND, EAI_AGAIN） |
| `tcp` | TCP 连接失败 | 连接被拒/超时（ECONNREFUSED, ETIMEDOUT） |
| `tls` | TLS 握手失败 | 证书问题（SSL, CERT 错误） |
| `timeout` | 请求超时 | AbortError（客户端超时） |
| `unknown` | 未知错误 | 其他网络错误 |

### 重试策略

| 场景 | 策略 |
|------|------|
| getUpdates 连续失败 3 次 | 退避 30 秒后重试 |
| getUpdates 单次失败 | 延迟 2 秒重试 |
| CDN 上传 5xx 错误 | 最多重试 3 次 |
| CDN 上传 4xx 错误 | 立即中止，不重试 |
| getConfig 失败 | 指数退避重试，最长 1 小时 |

---

## 📜 关键版本变更（API 相关）

以下版本变更直接影响 API 行为，供二次开发参考：

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| 2.4.5 | 2026-06-22 | `sendMessage` 新增响应解析校验，`ret` 非零时抛错；`SESSION_EXPIRED_ERRCODE` 重命名为 `STALE_TOKEN_ERRCODE`；新增网络错误分类 `classifyFetchError` |
| 2.4.4 | 2026-05-22 | 新增工具调用进度消息（`TOOL_CALL_START` / `TOOL_CALL_RESULT`）；`getUpdates` 支持外部 `AbortSignal` 中断长轮询 |
| 2.4.3 | 2026-05-08 | 修复 `iLink-App-Id` / `iLink-App-ClientVersion` 请求头在生产环境为空的问题；`binded_redirect` 状态处理为成功（`alreadyConnected`） |
| 2.4.2 | 2026-05-07 | 移除手动设置 `Content-Length` 头以兼容 Node 24/undici |
| 2.3.1 | 2026-04-28 | 新增 `bot_agent` 请求字段；`fetchQRCode` 携带 `local_token_list`；新增配对码登录流程；新增 `binded_redirect` 处理；新增 `notifyStart`/`notifyStop` 生命周期通知 |
| 2.1.4 | 2026-04-03 | 移除 `get_bot_qrcode` 的客户端超时限制 |
| 2.1.3 | 2026-04-02 | 新增 `StreamingMarkdownFilter`，出站文本支持部分 Markdown |

> 完整变更日志参见插件 CHANGELOG。

---

## 📎 附录

### UploadMediaType 枚举

| 常量 | 值 | 说明 | 官方文档 |
|------|-----|------|----------|
| IMAGE | 1 | 图片 | ✅ |
| VIDEO | 2 | 视频 | ✅ |
| FILE | 3 | 文件 | ✅ |
| VOICE | 4 | 语音 | ⚙️ 源码补充 |

### MessageType 枚举

| 常量 | 值 | 说明 |
|------|-----|------|
| NONE | 0 | 无 |
| USER | 1 | 用户消息 |
| BOT | 2 | Bot 消息 |

### MessageItemType 枚举

| 常量 | 值 | 说明 |
|------|-----|------|
| NONE | 0 | 无 |
| TEXT | 1 | 文本 |
| IMAGE | 2 | 图片 |
| VOICE | 3 | 语音 |
| FILE | 4 | 文件 |
| VIDEO | 5 | 视频 |
| TOOL_CALL_START | 11 | 工具调用开始 |
| TOOL_CALL_RESULT | 12 | 工具调用结果 |

### MessageState 枚举

| 常量 | 值 | 说明 |
|------|-----|------|
| NEW | 0 | 新消息 |
| GENERATING | 1 | 生成中 |
| FINISH | 2 | 完成 |

### TypingStatus 枚举

| 常量 | 值 | 说明 |
|------|-----|------|
| TYPING | 1 | 正在输入 |
| CANCEL | 2 | 取消输入 |

### VoiceItem encode_type 枚举

| 值 | 说明 |
|-----|------|
| 1 | PCM |
| 2 | ADPCM |
| 3 | Feature |
| 4 | Speex |
| 5 | AMR |
| 6 | SILK |
| 7 | MP3 |
| 8 | OGG-Speex |

---

## 🔗 参考资源

| 资源 | 说明 |
|------|------|
| 接口类型定义 | `src/wechat/types.ts` |
| API 客户端实现 | `src/wechat/api.ts` |
