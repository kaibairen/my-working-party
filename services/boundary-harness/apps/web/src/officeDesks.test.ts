import { describe, expect, it } from "vitest";
import {
  isFreshHeartbeat,
  looksLikePoolSeedName,
  visibleOfficeDesks,
} from "./officeDesks";

const now = Date.parse("2026-09-19T13:00:00.000Z");
const freshAt = "2026-09-19T12:59:30.000Z";
const staleAt = "2026-09-19T12:50:00.000Z";

describe("office desks main list", () => {
  it("desks_no_pool_seed_fake_names", () => {
    expect(looksLikePoolSeedName("交付同事")).toBe(true);
    expect(looksLikePoolSeedName("Cursor 同事")).toBe(true);
    expect(looksLikePoolSeedName("Cursor同事")).toBe(true);
    expect(looksLikePoolSeedName("群组同事")).toBe(true);
    expect(looksLikePoolSeedName("同事")).toBe(true);
    expect(looksLikePoolSeedName("小艾")).toBe(false);

    const shown = visibleOfficeDesks(
      [
        { id: "pool_noop", name: "交付同事", last_heartbeat: null, source: "pool_seed" },
        { id: "pool_cursor", name: "Cursor 同事", last_heartbeat: freshAt, source: "heartbeat" },
        {
          id: "agent:live",
          name: "小艾",
          last_heartbeat: freshAt,
          heartbeat_fresh: true,
          source: "heartbeat",
          presence: "busy",
        },
      ],
      { heartbeat_ttl_seconds: 90 },
      now,
    );
    expect(shown.map((d) => d.name)).toEqual(["小艾"]);
    expect(shown.some((d) => /交付同事|Cursor 同事/.test(String(d.name)))).toBe(false);
  });

  it("desks_list_requires_fresh_heartbeat", () => {
    const shown = visibleOfficeDesks(
      [
        { id: "pool_noop", name: "交付同事", last_heartbeat: null, source: "pool_seed", presence: "busy" },
        {
          id: "agent:stale-flag",
          name: "过期同事",
          last_heartbeat: freshAt,
          heartbeat_fresh: false,
          source: "heartbeat",
          presence: "busy",
        },
        {
          id: "agent:stale-ttl",
          name: "超时同事",
          last_heartbeat: staleAt,
          heartbeat_fresh: true,
          source: "heartbeat",
          ttl_seconds: 90,
          presence: "busy",
        },
        {
          id: "agent:live",
          name: "小艾",
          last_heartbeat: freshAt,
          heartbeat_fresh: true,
          source: "heartbeat",
          presence: "busy",
          status: "在忙",
        },
      ],
      { heartbeat_ttl_seconds: 90 },
      now,
    );
    expect(shown).toHaveLength(1);
    expect(shown[0]?.name).toBe("小艾");
    expect(shown[0]?.presence).toBe("busy");
    expect(isFreshHeartbeat(shown[0]!, now, 90)).toBe(true);
  });
});
