import assert from "node:assert/strict";
import test from "node:test";
import { decryptToken, encryptToken, hashOAuthState } from "../src/modules/integrations/google-crypto.js";

test("Google OAuth secrets are encrypted with authenticated encryption", () => {
  process.env.INTEGRATION_ENCRYPTION_KEY = "test-only-integration-encryption-key-32-characters";
  const secret = "refresh-token-do-not-store-in-plain-text";
  const encrypted = encryptToken(secret);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptToken(encrypted), secret);
  const [iv, tag, ciphertext] = encrypted.split(".");
  const tampered = [
    iv,
    tag,
    Buffer.from(ciphertext, "base64url")
      .map((byte, index) => (index === 0 ? byte ^ 1 : byte))
      .toString("base64url"),
  ].join(".");
  assert.throws(() => decryptToken(tampered));
});

test("OAuth state is stored as a stable one-way digest", () => {
  const state = "unpredictable-oauth-state";
  assert.equal(hashOAuthState(state).length, 64);
  assert.equal(hashOAuthState(state), hashOAuthState(state));
  assert.notEqual(hashOAuthState(state), state);
});
