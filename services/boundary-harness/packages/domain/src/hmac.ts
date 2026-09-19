import { createHmac, timingSafeEqual } from "node:crypto";
import { HarnessError } from "./errors";

/** Frozen clock skew for inbound webhook HMAC (TechLead M0_SECURITY_FREEZE_v1). */
export const WEBHOOK_SKEW_SECONDS = 300;

export function signHarnessWebhook(secret: string, timestamp: string | number, rawBody: string): string {
  const ts = String(timestamp);
  const hex = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  return `sha256=${hex}`;
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, "hex");
    const right = Buffer.from(b, "hex");
    if (left.length === 0 || left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

/**
 * Verify inbound webhook HMAC-SHA256.
 * Signature: `X-Harness-Signature: sha256=<hex>`
 * Timestamp: `X-Harness-Timestamp: <unix_seconds>`
 * Payload: `{timestamp}.{raw_body}`
 * Never logs WEBHOOK_SIGNING_SECRET.
 */
export function verifyHarnessWebhook(input: {
  secret?: string;
  signature?: string;
  timestamp?: string;
  rawBody: string;
  nowSeconds?: number;
}): void {
  const secret = input.secret ?? process.env.WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    throw new HarnessError(
      "webhook_bad_signature",
      "inbound hook rejected: WEBHOOK_SIGNING_SECRET missing or signature invalid",
      401,
    );
  }

  const tsRaw = input.timestamp?.trim() ?? "";
  if (!/^\d+$/.test(tsRaw)) {
    throw new HarnessError("webhook_skew", "X-Harness-Timestamp missing or not unix seconds", 401);
  }
  const ts = Number(tsRaw);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > WEBHOOK_SKEW_SECONDS) {
    throw new HarnessError("webhook_skew", "X-Harness-Timestamp outside ±300s", 401);
  }

  const sig = input.signature?.trim() ?? "";
  const match = /^sha256=([0-9a-f]+)$/i.exec(sig);
  if (!match) {
    throw new HarnessError(
      "webhook_bad_signature",
      "X-Harness-Signature must be sha256=<hex>",
      401,
    );
  }

  const expected = createHmac("sha256", secret).update(`${tsRaw}.${input.rawBody}`).digest("hex");
  if (!safeEqualHex(match[1], expected)) {
    throw new HarnessError("webhook_bad_signature", "HMAC-SHA256 mismatch", 401);
  }
}
