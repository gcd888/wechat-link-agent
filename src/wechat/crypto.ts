/**
 * 微信 CDN 媒体加解密模块
 *
 * iLink Bot API 的图片/文件/视频等媒体通过 CDN 传输，
 * 使用 AES-128-ECB 模式加密。本模块提供加解密所需的工具函数。
 *
 * 加密流程（上传）:
 *   1. generateAesKey() 生成随机 16 字节密钥
 *   2. encryptAesEcb(plaintext, key) 加密文件内容
 *   3. 上传密文到 CDN
 *
 * 解密流程（下载）:
 *   1. 从 CDN 下载密文
 *   2. decryptAesEcb(ciphertext, key) 解密获取原始内容
 *
 * 参数顺序: (data, key)。
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/** 生成随机 AES 密钥（base64 编码，16 字节） */
export function generateAesKey(): string {
  return randomBytes(16).toString('base64')
}

/** 计算 AES-128-ECB PKCS7 填充后的大小（16 字节对齐，至少追加 1 字节） */
export function aesEcbPaddedSize(plaintextSize: number): number {
  const block = 16
  return Math.ceil((plaintextSize + 1) / block) * block
}

/** AES-128-ECB 加密 (plaintext, key) */
export function encryptAesEcb(plaintext: Buffer, key: Buffer): Buffer {
  const cipher = createCipheriv('aes-128-ecb', key, null)
  return Buffer.concat([cipher.update(plaintext), cipher.final()])
}

/** AES-128-ECB 解密 (ciphertext, key) */
export function decryptAesEcb(ciphertext: Buffer, key: Buffer): Buffer {
  const decipher = createDecipheriv('aes-128-ecb', key, null)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}
