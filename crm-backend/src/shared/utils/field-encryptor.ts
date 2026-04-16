/**
 * FieldEncryptor — Application-Layer Encryption (AES-256-GCM)
 *
 * Encrypts individual sensitive columns (wallet private keys, phone numbers,
 * payment metadata) before they reach the database. The key is never stored
 * in the DB — only in the application environment (or AWS KMS / Vault).
 *
 * Algorithm: AES-256-GCM
 *   - 256-bit key (32 bytes)
 *   - 96-bit IV (12 bytes) — randomly generated per encryption operation
 *   - 128-bit authentication tag — prevents ciphertext tampering
 *
 * Wire format (base64-encoded):
 *   [ 12 bytes IV ][ 16 bytes GCM tag ][ N bytes ciphertext ]
 *
 * Usage:
 *   const enc = new FieldEncryptor(process.env.FIELD_ENCRYPTION_KEY);
 *   const cipher = enc.encrypt(privateKey);   // store this in DB
 *   const plain  = enc.decrypt(cipher);       // read from DB and decrypt
 *
 * Environment variable:
 *   FIELD_ENCRYPTION_KEY — 64 hex characters (32 bytes / 256 bits)
 *   Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * If FIELD_ENCRYPTION_KEY is absent the service logs a warning and operates
 * in passthrough mode (no encryption) — safe for local development,
 * never acceptable in production (env validation will catch this).
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'crypto';
import { Logger } from '@nestjs/common';

const ALGORITHM  = 'aes-256-gcm';
const IV_BYTES   = 12; // 96-bit nonce — GCM standard
const TAG_BYTES  = 16; // 128-bit authentication tag

export class FieldEncryptor {
  private readonly logger = new Logger(FieldEncryptor.name);
  private readonly key: Buffer | null;

  constructor(encryptionKeyHex: string | undefined) {
    if (!encryptionKeyHex || encryptionKeyHex.length !== 64) {
      this.logger.warn(
        'FIELD_ENCRYPTION_KEY is missing or not 64 hex chars — field encryption DISABLED. ' +
        'This is only acceptable in development.',
      );
      this.key = null;
    } else {
      this.key = Buffer.from(encryptionKeyHex, 'hex');
    }
  }

  /**
   * Encrypt plaintext to a base64-encoded ciphertext string.
   * Returns the plaintext unchanged if encryption is disabled.
   */
  encrypt(plaintext: string): string {
    if (!this.key) return plaintext;

    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    // Format: IV(12) || Tag(16) || Ciphertext(N) → base64
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  /**
   * Decrypt a base64-encoded ciphertext string back to plaintext.
   * Returns the input unchanged if encryption is disabled (passthrough mode).
   * Throws if the ciphertext is malformed or has been tampered with.
   */
  decrypt(ciphertext: string): string {
    if (!this.key) return ciphertext;

    let data: Buffer;
    try {
      data = Buffer.from(ciphertext, 'base64');
    } catch {
      throw new Error('FieldEncryptor: invalid base64 ciphertext');
    }

    if (data.length < IV_BYTES + TAG_BYTES + 1) {
      throw new Error('FieldEncryptor: ciphertext too short — likely not encrypted');
    }

    const iv        = data.subarray(0, IV_BYTES);
    const tag       = data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const encrypted = data.subarray(IV_BYTES + TAG_BYTES);

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);

    try {
      return decipher.update(encrypted) + decipher.final('utf8');
    } catch {
      throw new Error('FieldEncryptor: decryption failed — ciphertext may be tampered or key mismatch');
    }
  }

  /** True if encryption is active (key is configured). */
  get isEnabled(): boolean {
    return this.key !== null;
  }
}
