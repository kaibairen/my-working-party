import { describe, expect, it } from "vitest";
import { groupDesks, isTrustedDesk, UNGROUPED_LABEL } from "./deskGroups";

const live = (name: string, extra: Record<string, string | null> = {}) => ({
  name,
  source: "heartbeat",
  last_heartbeat: "2026-09-19T05:00:00.000Z",
  ...extra,
});

describe("desk grouping projection", () => {
  it("drops pool seeds and fake colleague names", () => {
    expect(isTrustedDesk({ name: "交付同事", source: "pool_seed", last_heartbeat: null })).toBe(false);
    expect(isTrustedDesk({ name: "Cursor 同事", source: "heartbeat", last_heartbeat: null })).toBe(false);
    expect(isTrustedDesk(live("交付同事", { pool_id: "pool_noop" }))).toBe(false);
    expect(groupDesks([
      { name: "交付同事", source: "pool_seed", last_heartbeat: null, pool_id: "pool_noop" },
      { name: "Cursor 同事", source: "pool_seed", last_heartbeat: null, pool_id: "pool_cursor" },
    ])).toEqual([]);
  });

  it("groups live heartbeats by group / pool_id, else 未分组", () => {
    const grouped = groupDesks([
      live("Bot A", { pool_id: "pool_noop" }),
      live("Bot B", { pool_id: "pool_noop" }),
      live("Bot C", { pool_id: "pool_cursor" }),
      live("Bot D"),
      live("Bot E", { group: "调研组" }),
    ]);
    expect(grouped.map((g) => [g.label, g.desks.map((d) => d.name)])).toEqual([
      ["交付组", ["Bot A", "Bot B"]],
      ["调研组", ["Bot C", "Bot E"]],
      [UNGROUPED_LABEL, ["Bot D"]],
    ]);
  });
});
