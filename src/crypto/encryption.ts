/**
 * API Key 加密模块
 *
 * 使用主密码 + PBKDF2 派生密钥，AES-256-GCM 对称加密。
 *
 * 核心流程:
 *   1. 用户设置主密码 → PBKDF2(password, salt, 100000) → 256 位密钥（仅存内存）
 *   2. 保存 API Key 时 → AES-256-GCM 加密 → 密文+IV+Tag 存入数据库
 *   3. 查看 API Key 时 → 输入主密码 → 解密 → 明文展示
 *   4. 勾选「信任此设备」→ 使用 Electron safeStorage 缓存派生密钥，重启免输入
 *
 * 安全特性:
 *   - 主密码不落盘（仅在内存中派生密钥）
 *   - Salt 随机生成，存入 app_config 表
 *   - 验证令牌用于校验主密码是否正确（不泄露密码本身）
 *   - 设备信任使用操作系统级加密（Electron safeStorage）
 */

import { safeStorage } from 'electron'
import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from 'node:crypto'
import { getConfig, setConfig } from '../database/db.js'
import { logger } from '../logger.js'

/** PBKDF2 迭代次数（越高越安全，但越慢） */
const PBKDF2_ITERATIONS = 100000
/** 派生密钥长度（256 位 = 32 字节） */
const KEY_LENGTH = 32
/** PBKDF2 使用的盐长度 */
const SALT_LENGTH = 32
/** 验证令牌的明文（用于校验主密码正确性） */
const VERIFY_PLAINTEXT = 'WLA_VERIFICATION_TOKEN'
/** AES-256-GCM 的 IV 长度 */
const IV_LENGTH = 12
/** AES-256-GCM 的认证标签长度 */
const TAG_LENGTH = 16

/** app_config 中的键名 */
const CONFIG_SALT = 'master_password_salt'
const CONFIG_VERIFY = 'master_password_verify_encrypted'
const CONFIG_VERIFY_IV = 'master_password_verify_iv'
const CONFIG_VERIFY_TAG = 'master_password_verify_tag'
const CONFIG_DEVICE_TRUST = 'master_password_device_trust'

/** 内存中缓存的派生密钥（应用重启后清空） */
let cachedDerivedKey: Buffer | null = null

/**
 * 从主密码派生加密密钥
 * 使用 PBKDF2 + 随机 Salt，生成 256 位密钥
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256')
}

/**
 * 使用 AES-256-GCM 加密明文
 * @returns { ciphertext, iv, tag } 均为 Base64 字符串
 */
function encrypt(plaintext: string, key: Buffer): { ciphertext: string; iv: string; tag: string } {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  }
}

/**
 * 使用 AES-256-GCM 解密密文
 * @returns 明文字符串，解密失败抛出异常
 */
function decrypt(ciphertext: string, iv: string, tag: string, key: Buffer): string {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  const decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()])
  return decrypted.toString('utf8')
}

// ── 主密码管理 ──────────────────────────────────────────────────────

/**
 * 检查是否已设置主密码
 */
export function hasMasterPassword(): boolean {
  return !!getConfig(CONFIG_SALT) && !!getConfig(CONFIG_VERIFY)
}

/**
 * 设置主密码
 * 生成随机 Salt → 派生密钥 → 加密验证令牌 → 存入数据库
 * 若勾选「信任此设备」，用 safeStorage 加密派生密钥后缓存
 */
export function setMasterPassword(password: string, trustDevice: boolean): boolean {
  try {
    const salt = randomBytes(SALT_LENGTH)
    const derivedKey = deriveKey(password, salt)

    // 加密验证令牌（用于后续校验主密码是否正确）
    const verifyResult = encrypt(VERIFY_PLAINTEXT, derivedKey)

    // 存入数据库
    setConfig(CONFIG_SALT, salt.toString('base64'))
    setConfig(CONFIG_VERIFY, verifyResult.ciphertext)
    setConfig(CONFIG_VERIFY_IV, verifyResult.iv)
    setConfig(CONFIG_VERIFY_TAG, verifyResult.tag)

    // 缓存派生密钥到内存
    cachedDerivedKey = derivedKey

    // 信任此设备：用 safeStorage 加密派生密钥后存入数据库
    if (trustDevice && safeStorage.isEncryptionAvailable()) {
      const encryptedKey = safeStorage.encryptString(derivedKey.toString('base64'))
      setConfig(CONFIG_DEVICE_TRUST, encryptedKey.toString('base64'))
    } else {
      setConfig(CONFIG_DEVICE_TRUST, '')
    }

    logger.info('Master password set successfully', { trustDevice })
    return true
  } catch (err) {
    logger.error('Failed to set master password', { error: String(err) })
    return false
  }
}

/**
 * 尝试用主密码解锁（验证密码正确性）
 * 解锁成功后，派生密钥缓存在内存中，后续加解密直接使用
 * @param password 主密码
 * @param trustDevice 是否信任此设备（true=保存设备信任缓存，false=清除缓存，undefined=不改变现有状态）
 */
export function unlockWithPassword(password: string, trustDevice?: boolean): boolean {
  try {
    const saltBase64 = getConfig(CONFIG_SALT)
    const verifyEncrypted = getConfig(CONFIG_VERIFY)
    const verifyIv = getConfig(CONFIG_VERIFY_IV)
    const verifyTag = getConfig(CONFIG_VERIFY_TAG)

    if (!saltBase64 || !verifyEncrypted || !verifyIv || !verifyTag) {
      return false
    }

    const salt = Buffer.from(saltBase64, 'base64')
    const derivedKey = deriveKey(password, salt)

    // 尝试解密验证令牌，成功则说明密码正确
    const decrypted = decrypt(verifyEncrypted, verifyIv, verifyTag, derivedKey)
    if (decrypted !== VERIFY_PLAINTEXT) {
      return false
    }

    // 缓存派生密钥
    cachedDerivedKey = derivedKey

    // 根据用户选择更新设备信任缓存
    if (trustDevice === true && safeStorage.isEncryptionAvailable()) {
      // 勾选「记住密码」：用 safeStorage 加密派生密钥后存入数据库
      const encryptedKey = safeStorage.encryptString(derivedKey.toString('base64'))
      setConfig(CONFIG_DEVICE_TRUST, encryptedKey.toString('base64'))
      logger.info('Device trust enabled on unlock')
    } else if (trustDevice === false) {
      // 取消勾选「记住密码」：清除设备信任缓存
      setConfig(CONFIG_DEVICE_TRUST, '')
      logger.info('Device trust disabled on unlock')
    }

    logger.info('Master password unlocked successfully')
    return true
  } catch {
    return false
  }
}

/**
 * 尝试从设备信任缓存中恢复派生密钥（应用启动时自动调用）
 * 如果用户之前勾选了「信任此设备」，safeStorage 可以解密缓存的密钥
 */
export function tryRestoreFromDeviceTrust(): boolean {
  try {
    const deviceTrustData = getConfig(CONFIG_DEVICE_TRUST)
    if (!deviceTrustData || !safeStorage.isEncryptionAvailable()) {
      return false
    }

    const encryptedBuffer = Buffer.from(deviceTrustData, 'base64')
    const decryptedKeyBase64 = safeStorage.decryptString(encryptedBuffer)
    cachedDerivedKey = Buffer.from(decryptedKeyBase64, 'base64')

    // 验证缓存的密钥是否有效
    const verifyEncrypted = getConfig(CONFIG_VERIFY)
    const verifyIv = getConfig(CONFIG_VERIFY_IV)
    const verifyTag = getConfig(CONFIG_VERIFY_TAG)
    if (verifyEncrypted && verifyIv && verifyTag) {
      const decrypted = decrypt(verifyEncrypted, verifyIv, verifyTag, cachedDerivedKey)
      if (decrypted !== VERIFY_PLAINTEXT) {
        // 密钥无效（可能设备更换，safeStorage 密钥不同）
        cachedDerivedKey = null
        return false
      }
    }

    logger.info('Master password restored from device trust')
    return true
  } catch (err) {
    logger.warn('Failed to restore from device trust', { error: String(err) })
    return false
  }
}

/**
 * 检查当前是否已解锁（派生密钥在内存中）
 */
export function isUnlocked(): boolean {
  return cachedDerivedKey !== null
}

/**
 * 锁定（清除内存中的派生密钥）
 */
export function lock(): void {
  cachedDerivedKey = null
}

/**
 * 更改主密码
 * 需要先解锁，然后用新密码重新加密所有已有的 API Key
 */
export function changeMasterPassword(oldPassword: string, newPassword: string, trustDevice: boolean): { success: boolean; error?: string } {
  try {
    // 验证旧密码
    if (!unlockWithPassword(oldPassword)) {
      return { success: false, error: '旧密码不正确' }
    }

    // 读取所有供应商的 API Key，用旧密钥解密
    const { getDb, saveDb } = require('../database/db.js')
    const db = getDb()
    const providers = db.exec('SELECT id, api_key_encrypted, api_key_iv, api_key_tag FROM llm_providers WHERE api_key_encrypted != ""')

    // 设置新密码
    setMasterPassword(newPassword, trustDevice)

    // 重新加密所有 API Key
    if (providers[0] && cachedDerivedKey) {
      for (const row of providers[0].values) {
        const providerId = row[0]
        const enc = row[1]
        const iv = row[2]
        const tag = row[3]
        if (enc && iv && tag) {
          try {
            const plaintext = decrypt(enc, iv, tag, deriveKey(oldPassword, Buffer.from(getConfig(CONFIG_SALT)!, 'base64')))
            const newResult = encrypt(plaintext, cachedDerivedKey)
            // 使用参数化查询，避免 SQL 注入风险
            db.run(
              'UPDATE llm_providers SET api_key_encrypted = ?, api_key_iv = ?, api_key_tag = ? WHERE id = ?',
              [newResult.ciphertext, newResult.iv, newResult.tag, providerId]
            )
          } catch {
            // 跳过解密失败的条目
          }
        }
      }
      saveDb()
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * 清除主密码和所有设备信任数据（重置）
 */
export function clearMasterPassword(): void {
  cachedDerivedKey = null
  setConfig(CONFIG_SALT, '')
  setConfig(CONFIG_VERIFY, '')
  setConfig(CONFIG_VERIFY_IV, '')
  setConfig(CONFIG_VERIFY_TAG, '')
  setConfig(CONFIG_DEVICE_TRUST, '')
}

// ── API Key 加解密 ──────────────────────────────────────────────────

/**
 * 加密 API Key
 * 要求已解锁（内存中有派生密钥）
 * @returns { ciphertext, iv, tag } 均为 Base64 字符串
 */
export function encryptApiKey(plaintext: string): { ciphertext: string; iv: string; tag: string } {
  if (!cachedDerivedKey) {
    throw new Error('尚未解锁主密码，无法加密 API Key')
  }
  return encrypt(plaintext, cachedDerivedKey)
}

/**
 * 解密 API Key
 * 要求已解锁（内存中有派生密钥）
 * @returns 明文 API Key
 */
export function decryptApiKey(ciphertext: string, iv: string, tag: string): string {
  if (!cachedDerivedKey) {
    throw new Error('尚未解锁主密码，无法解密 API Key')
  }
  return decrypt(ciphertext, iv, tag, cachedDerivedKey)
}

// ── 透明敏感字段加解密（safeStorage）──────────────────────────────────
//
// 适用于不需要用户交互即可加解密的敏感字段（如 bot_token、WebDAV password）。
// 使用 Electron safeStorage 进行 OS 级加密：
//   - Windows: DPAPI
//   - macOS: Keychain
//   - Linux: libsecret
//
// 加密后的值以 "ENC1:" 前缀 + Base64 编码存储。
// 开发阶段删库重建，无旧明文数据需兼容，所有密文必须带前缀。
//
// 与主密码加密（API Key）的区别：
//   - 主密码加密需要用户输入密码才能解密，适合用户主动管理的敏感数据
//   - safeStorage 透明加密无需用户交互，适合应用启动时需要自动恢复的凭证

/** 加密值前缀，所有存入数据库的敏感字段密文必须携带此前缀 */
const SECRET_ENC_PREFIX = 'ENC1:'

/**
 * 使用 safeStorage 透明加密敏感字段
 *
 * 加密后的格式: "ENC1:" + Base64(safeStorage 加密后的 Buffer)
 * 若 safeStorage 不可用（如 Linux 未安装 libsecret），降级为明文存储并记录警告。
 *
 * @param plaintext 明文值
 * @returns 加密后的字符串（带 ENC1: 前缀），或明文（降级时）
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return plaintext

  // safeStorage 不可用时降级为明文（保证功能可用，但安全性降低）
  if (!safeStorage.isEncryptionAvailable()) {
    logger.warn('safeStorage unavailable, secret stored as plaintext (degraded security)')
    return plaintext
  }

  try {
    const encrypted = safeStorage.encryptString(plaintext)
    return SECRET_ENC_PREFIX + encrypted.toString('base64')
  } catch (err) {
    logger.error('encryptSecret failed, falling back to plaintext', { error: String(err) })
    return plaintext
  }
}

/**
 * 使用 safeStorage 透明解密敏感字段
 *
 * 仅识别 "ENC1:" 前缀的密文进行解密；无前缀的值视为异常并返回空串。
 *
 * @param stored 数据库中存储的密文（必须带 ENC1: 前缀）
 * @returns 解密后的明文
 */
export function decryptSecret(stored: string): string {
  if (!stored) return stored

  // 无前缀 → 异常数据（开发阶段删库重建，不应出现明文落库）
  if (!stored.startsWith(SECRET_ENC_PREFIX)) {
    logger.error('decryptSecret: value without ENC1: prefix detected, possible plaintext leak')
    return ''
  }

  // safeStorage 不可用时无法解密
  if (!safeStorage.isEncryptionAvailable()) {
    logger.error('safeStorage unavailable, cannot decrypt secret')
    return ''
  }

  try {
    const encryptedBuffer = Buffer.from(stored.slice(SECRET_ENC_PREFIX.length), 'base64')
    return safeStorage.decryptString(encryptedBuffer)
  } catch (err) {
    logger.error('decryptSecret failed', { error: String(err) })
    return ''
  }
}
