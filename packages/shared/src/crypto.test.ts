import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "./crypto.js";

describe("AES-256-GCM Encryption / Decryption", () => {
  const validKey =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  it("should encrypt and decrypt plaintext successfully", () => {
    const secret = "my_super_secret_database_password_!@#$%^&*()";
    const encrypted = encryptSecret(secret, validKey);

    expect(encrypted.encryptedValue).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();
    expect(encrypted.encryptedValue).not.toBe(secret);

    const decrypted = decryptSecret(encrypted, validKey);
    expect(decrypted).toBe(secret);
  });

  it("should produce different ciphertext and IV for identical input (semantic security)", () => {
    const text = "repeat_token";
    const enc1 = encryptSecret(text, validKey);
    const enc2 = encryptSecret(text, validKey);

    expect(enc1.iv).not.toBe(enc2.iv);
    expect(enc1.encryptedValue).not.toBe(enc2.encryptedValue);

    expect(decryptSecret(enc1, validKey)).toBe(text);
    expect(decryptSecret(enc2, validKey)).toBe(text);
  });

  it("should throw an error if the encryption key length is invalid", () => {
    const invalidKey = "too_short_key";
    expect(() => encryptSecret("secret", invalidKey)).toThrow(
      "Encryption key must be a 32-byte hex string (64 characters)",
    );
    expect(() =>
      decryptSecret({ encryptedValue: "a", iv: "b", authTag: "c" }, invalidKey),
    ).toThrow("Encryption key must be a 32-byte hex string (64 characters)");
  });

  it("should throw an error if ciphertext or auth tag is tampered with", () => {
    const secret = "secure_data";
    const encrypted = encryptSecret(secret, validKey);

    // Tamper with the ciphertext
    const tamperedCiphertext = {
      ...encrypted,
      encryptedValue:
        encrypted.encryptedValue.slice(0, -2) +
        (encrypted.encryptedValue.endsWith("a") ? "b" : "a"),
    };

    expect(() => decryptSecret(tamperedCiphertext, validKey)).toThrow();

    // Tamper with the auth tag
    const tamperedTag = {
      ...encrypted,
      authTag:
        encrypted.authTag.slice(0, -2) +
        (encrypted.authTag.endsWith("0") ? "1" : "0"),
    };

    expect(() => decryptSecret(tamperedTag, validKey)).toThrow();
  });
});
