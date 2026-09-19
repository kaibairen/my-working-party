import { describe, expect, it } from "vitest";
import {
  DEFAULT_DESK_TTL_SECONDS,
  heartbeatLabelZh,
  isHeartbeatStale,
  paintDeskPresence,
  pollIntervalMs,
} from "./deskPresence";

const now = Date.parse("2026-09-19T13:00:00.000Z");

describe("desk presence TTL paint", () => {
  it("keeps work-derived busy when there is no heartbeat", () => {
    const painted = paintDeskPresence({
      presence: "busy",
      last_seen_at: null,
      heartbeat_fresh: false,
      ttl_seconds: 90,
      nowMs: now,
    });
    expect(isHeartbeatStale({ presence: "busy", last_seen_at: null, heartbeat_fresh: false })).toBe(false);
    expect(painted.presence).toBe("busy");
    expect(painted.status).toBe("在忙");
    expect(painted.stale).toBe(false);
  });

  it("never paints busy when heartbeat_fresh is false and last_seen exists", () => {
    const painted = paintDeskPresence({
      presence: "busy",
      last_seen_at: "2026-09-19T12:58:00.000Z",
      heartbeat_fresh: false,
      ttl_seconds: 90,
      nowMs: now,
    });
    expect(painted.presence).not.toBe("busy");
    expect(painted.presence).toBe("idle");
    expect(painted.status).toBe("空闲");
    expect(painted.stale).toBe(true);
    expect(painted.heartbeat_fresh).toBe(false);
  });

  it("never paints busy when last_seen is older than ttl even if API says busy", () => {
    const painted = paintDeskPresence({
      presence: "busy",
      last_seen_at: "2026-09-19T12:50:00.000Z",
      last_heartbeat: "2026-09-19T12:50:00.000Z",
      heartbeat_fresh: true,
      ttl_seconds: 90,
      nowMs: now,
    });
    expect(painted.presence).not.toBe("busy");
    expect(["waiting_evidence", "idle"]).toContain(painted.presence);
  });

  it("prefers API presence after TTL when it is already waiting_evidence", () => {
    const painted = paintDeskPresence({
      presence: "waiting_evidence",
      last_seen_at: "2026-09-19T12:50:00.000Z",
      heartbeat_fresh: false,
      ttl_seconds: 90,
      nowMs: now,
    });
    expect(painted.presence).toBe("waiting_evidence");
    expect(painted.status).toBe("等证据");
  });

  it("reads last_heartbeat as an alias of last_seen_at", () => {
    const painted = paintDeskPresence({
      presence: "idle",
      last_heartbeat: "2026-09-19T12:59:30.000Z",
      ttl_seconds: 90,
      nowMs: now,
    });
    expect(painted.last_seen_at).toBe("2026-09-19T12:59:30.000Z");
    expect(painted.heartbeat_fresh).toBe(true);
    expect(painted.presence).toBe("idle");
  });

  it("polls no slower than ttl", () => {
    expect(pollIntervalMs(90)).toBe(90_000);
    expect(pollIntervalMs(30)).toBe(30_000);
    expect(pollIntervalMs(null)).toBe(DEFAULT_DESK_TTL_SECONDS * 1000);
  });

  it("uses Chinese heartbeat labels", () => {
    expect(heartbeatLabelZh({ last_seen_at: null, heartbeat_fresh: false, stale: false, relative: "" })).toBe(
      "尚无心跳",
    );
    expect(
      heartbeatLabelZh({ last_seen_at: "t", heartbeat_fresh: true, stale: false, relative: "刚刚" }),
    ).toBe("心跳新鲜 · 刚刚");
    expect(
      heartbeatLabelZh({ last_seen_at: "t", heartbeat_fresh: false, stale: true, relative: "3 分钟前" }),
    ).toBe("心跳过期 · 3 分钟前");
  });
});
