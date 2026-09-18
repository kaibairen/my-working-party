import assert from "node:assert/strict";
import { test } from "node:test";
import { signWebhook, verifyWebhook } from "../src/hmac.js";

test("webhook_sign_roundtrip", () => {
  const secret = "abc";
  const ts = "1700000000";
  const body = "{\"a\":1}";
  const sig = signWebhook(secret, ts, body);
  assert.match(sig, /^sha256=[0-9a-f]+$/);
  verifyWebhook(secret, body, sig, ts, 1700000000);
});
