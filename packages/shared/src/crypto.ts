import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { EncryptedData } from "./types.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * @param plainText The plaintext to encrypt
 * @param secretKeyHex 64-character hex string (32 bytes)
 */
export function encryptSecret(
  plainText: string,
  secretKeyHex: string,
): EncryptedData {
  if (!secretKeyHex || secretKeyHex.length !== 64) {
    throw new Error(
      "Encryption key must be a 32-byte hex string (64 characters)",
    );
  }
  const key = Buffer.from(secretKeyHex, "hex");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: 16 });

  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  return {
    encryptedValue: encrypted,
    iv: iv.toString("hex"),
    authTag,
  };
}

/**
 * Decrypts an encrypted payload using AES-256-GCM.
 * @param data Object containing encryptedValue, iv, and authTag (all in hex)
 * @param secretKeyHex 64-character hex string (32 bytes)
 */
export function decryptSecret(
  data: EncryptedData,
  secretKeyHex: string,
): string {
  if (!secretKeyHex || secretKeyHex.length !== 64) {
    throw new Error(
      "Encryption key must be a 32-byte hex string (64 characters)",
    );
  }
  const key = Buffer.from(secretKeyHex, "hex");
  const iv = Buffer.from(data.iv, "hex");
  const authTag = Buffer.from(data.authTag, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(data.encryptedValue, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Encrypts a string and serializes into format `iv:authTag:encryptedValue`
 */
export function encryptString(plainText: string, secretKeyHex: string): string {
  const enc = encryptSecret(plainText, secretKeyHex);
  return `${enc.iv}:${enc.authTag}:${enc.encryptedValue}`;
}

/**
 * Decrypts a serialized string in format `iv:authTag:encryptedValue`
 */
export function decryptString(
  serialized: string,
  secretKeyHex: string,
): string {
  const parts = serialized.split(":");
  if (parts.length !== 3) {
    throw new Error(
      "Invalid serialized encrypted string format. Expected iv:authTag:encryptedValue",
    );
  }
  const [iv, authTag, encryptedValue] = parts;
  return decryptSecret({ iv, authTag, encryptedValue }, secretKeyHex);
}
