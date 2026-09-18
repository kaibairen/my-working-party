import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "./errors.js";

const SKEW_SECONDS = 300;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function signWebhook(secret: string, timestamp: string | number, rawBody: string): string {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `sha256=${digest}`;
}

export function verifyWebhook(
  secret: string,
  rawBody: string,
  signature: string | undefined,
  timestamp: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): void {
  if (!timestamp || !/^\d+$/.test(timestamp)) {
    throw new HttpError(401, "webhook_skew", "Missing or invalid X-Harness-Timestamp");
  }
  const ts = Number(timestamp);
  if (Math.abs(nowSeconds - ts) > SKEW_SECONDS) {
    throw new HttpError(401, "webhook_skew", "Webhook timestamp outside ±300s window");
  }
  if (!signature || !/^sha256=[0-9a-f]+$/.test(signature)) {
    throw new HttpError(401, "webhook_bad_signature", "Missing or invalid X-Harness-Signature");
  }
  const expected = signWebhook(secret, timestamp, rawBody);
  if (!safeEqual(signature, expected)) {
    throw new HttpError(401, "webhook_bad_signature", "Webhook signature mismatch");
  }
}
