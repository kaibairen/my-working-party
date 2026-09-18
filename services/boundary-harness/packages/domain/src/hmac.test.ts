import { describe, expect, it } from "vitest";
import { isHarnessError } from "./errors";
import { signHarnessWebhook, verifyHarnessWebhook, WEBHOOK_SKEW_SECONDS } from "./hmac";

describe("webhook HMAC-SHA256", () => {
  const secret = "unit-hook-secret";
  const raw = '{"ok":true}';

  it("verifies sha256=<hex> over {timestamp}.{raw_body}", () => {
    const ts = "1700000000";
    const signature = signHarnessWebhook(secret, ts, raw);
    expect(signature).toMatch(/^sha256=[0-9a-f]+$/);
    expect(() =>
      verifyHarnessWebhook({
        secret,
        signature,
        timestamp: ts,
        rawBody: raw,
        nowSeconds: 1700000000,
      }),
    ).not.toThrow();
  });

  it("rejects skew beyond ±300s as webhook_skew", () => {
    const ts = "1700000000";
    const signature = signHarnessWebhook(secret, ts, raw);
    try {
      verifyHarnessWebhook({
        secret,
        signature,
        timestamp: ts,
        rawBody: raw,
        nowSeconds: 1700000000 + WEBHOOK_SKEW_SECONDS + 1,
      });
      throw new Error("expected skew");
    } catch (err) {
      expect(isHarnessError(err)).toBe(true);
      if (isHarnessError(err)) {
        expect(err.code).toBe("webhook_skew");
        expect(err.status).toBe(401);
      }
    }
  });

  it("rejects bad signature as webhook_bad_signature", () => {
    try {
      verifyHarnessWebhook({
        secret,
        signature: "sha256=deadbeef",
        timestamp: "1700000000",
        rawBody: raw,
        nowSeconds: 1700000000,
      });
      throw new Error("expected bad signature");
    } catch (err) {
      expect(isHarnessError(err)).toBe(true);
      if (isHarnessError(err)) {
        expect(err.code).toBe("webhook_bad_signature");
        expect(err.status).toBe(401);
      }
    }
  });
});
