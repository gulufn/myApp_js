// crypto.js/加密解密模块
const crypto = require('crypto');

class Crypto {
  // 私有静态属性：密钥（生产环境建议从环境变量读）
  static #secret = process.env.APP_SECRET || 'my-secret-key-please-change';

  // 加密算法
  static #CIPHER = 'aes-256-cbc';

  /**
   * 生成 32 字节密钥（sha256 的二进制结果）
   */
  static #getKey() {
    return crypto.createHash('sha256').update(this.#secret).digest();
  }

  /**
   * 加密
   * @param {string} plain 明文
   * @returns {string} base64Url 编码的 token
   */
  static encrypt(plain) {
    const key = this.#getKey();
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(this.#CIPHER, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final()
    ]);

    // IV 拼在密文前，再 base64Url 编码
    return this.#base64UrlEncode(Buffer.concat([iv, encrypted]));
  }

  /**
   * 解密
   * @param {string} token 加密字符串
   * @returns {string|null} 明文，失败返回 null
   */
  static decrypt(token) {
    try {
      const raw = this.#base64UrlDecode(token);
      if (raw.length < 17) return null;

      const iv = raw.subarray(0, 16);
      const cipher = raw.subarray(16);

      const decipher = crypto.createDecipheriv(this.#CIPHER, this.#getKey(), iv);
      let plain = decipher.update(cipher, undefined, 'utf8');
      plain += decipher.final('utf8');

      return plain;
    } catch (e) {
      console.error('[Crypto] 解密失败:', e.message);
      return null;
    }
  }

  // ---------- 私有工具方法 ----------

  static #base64UrlEncode(buf) {
    return buf.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  static #base64UrlDecode(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    return Buffer.from(base64, 'base64');
  }
}

module.exports = Crypto;