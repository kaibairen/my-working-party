import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  BRIEF_FORBIDDEN_KEYS,
  closeHarness,
  createHarness,
  DEFAULT_DELIVER_GATE_TEMPLATE,
  evaluateReady,
  requiredEvidenceKinds,
  RESEARCH_READY_V1,
  STAGE_KEY_DELIVER,
  STAGE_KEY_RESEARCH,
  type Harness,
} from "@harness/domain";
import { createApp } from "../../src/app";
import { startApiServer } from "../../src/server";

const headers = (role: string, actor = role) => ({
  "content-type": "application/json",
  "x-harness-role": role,
  "x-harness-actor": actor,
  "x-harness-entry": "mcp",
});

async function json(app: ReturnType<typeof createApp>, path: string, init?: RequestInit) {
  const res = await app.request(path, init);
  const text = await res.text();
  let body: Record<string, any> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { text };
  }
  return { res, body };
}

function errCode(body: Record<string, any>): string {
  return String(body.code ?? body.error?.code ?? "");
}

const emptyReady = {
  evidence: [],
  githubSnapshots: [],
  policyEvents: [],
  noopOrOfflineContract: false,
  runFinished: false,
};

describe("P1 domain dogfood fixes", () => {
  let harness: Harness | undefined;
  afterEach(() => {
    if (harness) closeHarness(harness);
    harness = undefined;
  });

  function setup() {
    harness = createHarness({ databasePath: ":memory:" });
    return { harness, app: createApp(harness) };
  }

  it("pool_cursor_fill_not_400", async () => {
    const { app } = setup();
    const product = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({ title: "周报交付验收", intent: "写一份能读的周报" }),
    });
    expect(product.res.status).toBe(201);

    const filled = await json(app, `/v1/goals/${product.body.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_cursor",
        brief: { outcome: "写一份能读的周报", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
      }),
    });
    expect(filled.res.status).not.toBe(400);
    expect(filled.res.status).toBe(201);
    expect(filled.body.pool_id).toBe("pool_cursor");
    expect(filled.body.brief.evidence_shape).toEqual(expect.arrayContaining(["summary_md", "artifact_uri"]));

    const orphan = createHarness({ databasePath: ":memory:" });
    try {
      orphan.sqlite.prepare("DELETE FROM pools WHERE id = 'pool_cursor'").run();
      const orphanApp = createApp(orphan);
      const restaged = await json(orphanApp, "/v1/goals", {
        method: "POST",
        headers: headers("coordinator", "c1"),
        body: JSON.stringify({ title: "Cursor 池补种", mode: "deliver", coordinator_ref: "c1" }),
      });
      const reseeded = await json(orphanApp, `/v1/goals/${restaged.body.id}/assignments`, {
        method: "POST",
        headers: headers("coordinator", "c1"),
        body: JSON.stringify({
          pool_id: "pool_cursor",
          brief: { outcome: "补种后也能填", constraints: [], evidence_shape: ["summary_md"] },
        }),
      });
      expect(reseeded.res.status).not.toBe(400);
      expect(reseeded.res.status).toBe(201);
      expect(reseeded.body.pool_id).toBe("pool_cursor");
    } finally {
      closeHarness(orphan);
    }

    const invalid = await json(app, `/v1/goals/${product.body.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_cursor",
        brief: { outcome: "坏 brief", constraints: [], evidence_shape: ["summary_md"], steps: ["nope"] },
      }),
    });
    expect(invalid.res.status).not.toBe(400);
    expect(invalid.res.status).toBe(422);
    expect(invalid.body.code ?? invalid.body.error?.code).toBe("brief_forbidden_field");
  });

  it("product_goal_default_stage_gates", async () => {
    const { app } = setup();
    expect(DEFAULT_DELIVER_GATE_TEMPLATE).toBe("research_then_deliver_v1");

    const dm = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({ title: "产品交付", intent: "先调研再交" }),
    });
    expect(dm.res.status).toBe(201);
    expect(dm.body.mode).toBe("deliver");
    expect(dm.body.gate_template_id).toBe("research_then_deliver_v1");
    expect(dm.body.gate_defs).not.toEqual([]);
    expect(dm.body.gate_defs.length).toBeGreaterThan(0);
    expect(dm.body.gate_defs.map((d: { stage_key: string; predicate_id: string }) => [d.stage_key, d.predicate_id]))
      .toEqual([
        [STAGE_KEY_RESEARCH, "research_ready_v1"],
        [STAGE_KEY_DELIVER, "deliver_ready_v1"],
      ]);
    expect(dm.body.gate_defs[0].predicate_version).toBe(1);
    expect(BRIEF_FORBIDDEN_KEYS).toEqual(expect.arrayContaining(["steps", "script", "playbook"]));
    const researchDef = dm.body.gate_defs.find((d: { stage_key: string }) => d.stage_key === STAGE_KEY_RESEARCH);
    const deliverDef = dm.body.gate_defs.find((d: { stage_key: string }) => d.stage_key === STAGE_KEY_DELIVER);
    expect(researchDef?.id).toBeTruthy();
    expect(deliverDef?.id).toBeTruthy();

    expect(requiredEvidenceKinds("research_ready_v1", 1)).toEqual(["report_md"]);
    expect(RESEARCH_READY_V1.all).toEqual([{ type: "evidence_present", kinds: ["report_md"] }]);
    expect(evaluateReady("research_ready_v1", 1, {
      ...emptyReady,
      evidence: [{ kind: "report_md", uri: "file://research.md" }],
    }, "t").ok).toBe(true);
    expect(evaluateReady("research_ready_v1", 1, {
      ...emptyReady,
      evidence: [{ kind: "screenshot", uri: "file://oral.png" }],
    }, "t").ok).toBe(false);
    expect(evaluateReady("research_ready_v1", 1, {
      ...emptyReady,
      evidence: [{ kind: "summary_md", uri: "file://summary.md" }],
    }, "t").ok).toBe(false);
    expect(evaluateReady("deliver_ready_v1", 1, {
      ...emptyReady,
      evidence: [{ kind: "report_md", uri: "file://research.md" }],
      noopOrOfflineContract: true,
      runFinished: true,
    }, "t").ok).toBe(false);

    const coord = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ title: "协调者交付", mode: "deliver", coordinator_ref: "c1" }),
    });
    expect(coord.body.gate_template_id).toBe("research_then_deliver_v1");
    expect(coord.body.gate_defs).toHaveLength(2);

    const slots = await json(app, `/v1/goals/${dm.body.id}/assignments`, {
      headers: headers("decision_maker", "you"),
    });
    expect(slots.body.stage_strip.ready).toBe(true);
    expect(slots.body.stage_strip.stages.map((s: { stage_key: string; state: string }) => [s.stage_key, s.state]))
      .toEqual([["research", "current"], ["deliver", "locked"]]);
    const open = slots.body.slots.filter((s: { stage_locked?: boolean }) => !s.stage_locked);
    expect(open).toHaveLength(1);
    expect(open[0].empty).toBe(true);
    expect(open[0].stage_key).toBe("research");
    expect(open[0].stage_locked).not.toBe(true);
    expect(slots.body.slots.some((s: { stage_locked?: boolean; stage_key?: string }) => s.stage_locked && s.stage_key === "deliver")).toBe(true);
    const lockedDeliver = slots.body.slots.find((s: { stage_locked?: boolean; stage_key?: string }) => s.stage_locked && s.stage_key === "deliver");
    expect(lockedDeliver.unlock_after_gate_def_id).toBe(researchDef.id);

    const hint = await json(app, "/v1/policy/check", {
      method: "POST",
      headers: headers("executor", "e1"),
      body: JSON.stringify({ action: "change_path", track: "advisory_hint", goal_id: dm.body.id }),
    });
    expect(hint.body.track).toBe("advisory_hint");
    expect(hint.body.creates_gate).toBe(false);
    expect(hint.body.decision).not.toBe("require_gate");
    const afterHint = await json(app, `/v1/gates?goal_id=${dm.body.id}`, {
      headers: headers("decision_maker", "you"),
    });
    expect(afterHint.body.gates).toEqual([]);

    const researchAsg = await json(app, `/v1/goals/${dm.body.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "调研纪要", constraints: [], evidence_shape: ["report_md"] },
      }),
    });
    expect(researchAsg.res.status).toBe(201);
    const researchRun = await json(app, `/v1/assignments/${researchAsg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "research-lock-1" }),
    });
    expect(researchRun.res.status).toBe(201);

    const verbal = await json(app, "/v1/policy/check", {
      method: "POST",
      headers: headers("executor", "e1"),
      body: JSON.stringify({
        action: "chat_done",
        track: "advisory_hint",
        goal_id: dm.body.id,
        context: { text: "done", verbal: true, oral: true },
      }),
    });
    expect(verbal.body.track).toBe("advisory_hint");
    expect(verbal.body.creates_gate).toBe(false);
    expect(verbal.body.decision).toBe("redirect_hint");

    const dial = await json(app, `/v1/goals/${dm.body.id}/dial`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ dial: "guided" }),
    });
    expect(dial.res.status).toBe(200);
    expect(dial.body.dial).toBe("guided");

    await json(app, `/v1/runs/${researchRun.body.id}/evidence`, {
      method: "POST",
      headers: headers("executor", "e1"),
      body: JSON.stringify({ items: [{ kind: "screenshot", uri: "file://oral-done.png" }] }),
    });
    const shotReady = await json(app, `/v1/gates?status=ready&goal_id=${dm.body.id}`, {
      headers: headers("decision_maker", "you"),
    });
    expect(shotReady.body.gates).toEqual([]);

    const verbalNeverUnlock = await json(app, `/v1/goals/${dm.body.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "交付", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
        unlock_after_gate_def_id: researchDef.id,
      }),
    });
    expect(verbalNeverUnlock.res.status).toBe(423);
    expect(errCode(verbalNeverUnlock.body)).toBe("stage_locked");

    await json(app, `/v1/runs/${researchRun.body.id}/evidence`, {
      method: "POST",
      headers: headers("executor", "e1"),
      body: JSON.stringify({ items: [{ kind: "report_md", uri: "file://research.md" }] }),
    });
    const researchReady = await json(app, `/v1/gates?status=ready&goal_id=${dm.body.id}`, {
      headers: headers("decision_maker", "you"),
    });
    expect(researchReady.body.gates).toHaveLength(1);
    expect(researchReady.body.gates[0].predicate_id).toBe("research_ready_v1");
    expect(researchReady.body.gates.some((g: { predicate_id: string }) => g.predicate_id === "deliver_ready_v1")).toBe(false);

    const readyNotPass = await json(app, `/v1/goals/${dm.body.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "交付", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
        unlock_after_gate_def_id: researchDef.id,
      }),
    });
    expect(readyNotPass.res.status).toBe(423);
    expect(errCode(readyNotPass.body)).toBe("stage_locked");

    const decided = await json(app, `/v1/gates/${researchReady.body.gates[0].id}/decide`, {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({ decision: "pass", version: researchReady.body.gates[0].version }),
    });
    expect(decided.res.status).toBe(200);

    const afterPassReady = await json(app, `/v1/gates?status=ready&goal_id=${dm.body.id}`, {
      headers: headers("decision_maker", "you"),
    });
    expect(afterPassReady.body.gates).toEqual([]);

    const unlocked = await json(app, `/v1/goals/${dm.body.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "交付", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
        unlock_after_gate_def_id: researchDef.id,
      }),
    });
    expect(unlocked.res.status).toBe(201);
    expect(unlocked.body.unlock_after_gate_def_id).toBe(researchDef.id);

    const afterUnlockSlots = await json(app, `/v1/goals/${dm.body.id}/assignments`, {
      headers: headers("decision_maker", "you"),
    });
    expect(afterUnlockSlots.body.stage_strip.stages.map((s: { stage_key: string; state: string }) => [s.stage_key, s.state]))
      .toEqual([["research", "done"], ["deliver", "current"]]);
    expect(afterUnlockSlots.body.stage_strip.stages.find((s: { stage_key: string }) => s.stage_key === "deliver")?.gate_status)
      .not.toBe("pass");

    const explicit = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        title: "单交付门",
        mode: "deliver",
        coordinator_ref: "c1",
        gate_template_id: "deliver_ready_v1",
      }),
    });
    expect(explicit.body.gate_defs).toHaveLength(1);
    expect(explicit.body.gate_defs[0].predicate_id).toBe("deliver_ready_v1");

    const explore = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ title: "探索", mode: "explore", coordinator_ref: "c1" }),
    });
    expect(explore.body.gate_defs).toEqual([]);
    expect(explore.body.gate_template_id).toBeNull();

    const stuffed = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({ title: "坏目标", steps: ["先调研再写报告"] }),
    });
    expect(stuffed.res.status).toBe(422);
    expect(stuffed.body.code ?? stuffed.body.error?.code).toBe("brief_forbidden_field");

    const playbook = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({ title: "技能塞剧本", playbook: "先调研再交", script: "research.md" }),
    });
    expect(playbook.res.status).toBe(422);
    expect(playbook.body.code ?? playbook.body.error?.code).toBe("brief_forbidden_field");

    const stuffedFill = await json(app, `/v1/goals/${explore.body.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: {
          outcome: "调研剧本",
          constraints: [],
          evidence_shape: ["report_md"],
          playbook: "先开调研技能",
          steps: ["写报告"],
        },
      }),
    });
    expect(stuffedFill.res.status).toBe(422);
    expect(errCode(stuffedFill.body)).toBe("brief_forbidden_field");
  });

  it("api_8080_bind_no_blip", async () => {
    const started = await startApiServer({
      port: 0,
      hostname: "127.0.0.1",
      databasePath: ":memory:",
      mode: "api",
    });
    try {
      const t0 = Date.now();
      const first = await fetch(`http://127.0.0.1:${started.port}/health`);
      expect(first.status).toBe(200);
      expect(Date.now() - t0).toBeLessThan(200);
      const firstBody = (await first.json()) as { ok?: boolean };
      expect(firstBody.ok).toBe(true);

      await started.harness;
      const hz = await fetch(`http://127.0.0.1:${started.port}/healthz`);
      expect(hz.status).toBe(200);

      const h = await started.harness;
      h.bus.on("goal.status_changed", () => {
        throw new Error("bus listener must not kill bind");
      });
      const app = createApp(h);
      const goal = await json(app, "/v1/goals", {
        method: "POST",
        headers: headers("coordinator", "c1"),
        body: JSON.stringify({ title: "绑定不掉线", mode: "deliver", coordinator_ref: "c1" }),
      });
      const filled = await json(app, `/v1/goals/${goal.body.id}/assignments`, {
        method: "POST",
        headers: headers("coordinator", "c1"),
        body: JSON.stringify({
          pool_id: "pool_cursor",
          assignee_bot_id: "bot-bound",
          brief: { outcome: "bind", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
        }),
      });
      expect(filled.res.status).toBe(201);
      const bound = await json(app, `/v1/assignments/${filled.body.id}/bind`, {
        method: "POST",
        headers: headers("coordinator", "c1"),
        body: JSON.stringify({ assignee_bot_id: "bot-rebind" }),
      });
      expect(bound.res.status).toBe(200);
      expect((await fetch(`http://127.0.0.1:${started.port}/health`)).status).toBe(200);

      await expect(startApiServer({ port: started.port, hostname: "127.0.0.1", databasePath: ":memory:" }))
        .rejects.toMatchObject({ code: "EADDRINUSE" });
    } finally {
      await started.close();
    }

    const here = dirname(fileURLToPath(import.meta.url));
    const waitPath = join(here, "../../../../deploy/wait-api-healthy.sh");
    const wait = readFileSync(waitPath, "utf8");
    expect(wait).toContain("api_8080_bind_no_blip");
    expect(wait).toMatch(/NO_BLIP_SECS/);
    expect(wait).toMatch(/\/healthz/);
    expect(wait).toMatch(/BASE/);
    expect(wait).toMatch(/TIMEOUT_SECS/);
    expect(wait).toMatch(/exit 2/);
    expect(statSync(waitPath).mode & 0o111).toBeTruthy();

    const compose = readFileSync(join(here, "../../../../docker-compose.yml"), "utf8");
    expect(compose).toContain("api_8080_bind_no_blip");
    expect(compose).toMatch(/wget[^\\n]*\/health \|\| wget[^\\n]*\/healthz/);
    expect(compose).toMatch(/interval:\s*2s/);
    expect(compose).toMatch(/timeout:\s*2s/);
    expect(compose).toMatch(/retries:\s*15/);
    expect(compose).toMatch(/start_period:\s*15s/);

    const m0 = readFileSync(join(here, "../../../../deploy/docker-compose.m0.yml"), "utf8");
    expect(m0).toContain("api_8080_bind_no_blip");
    expect(m0).toContain("wait-api-healthy");

    const ci = readFileSync(join(here, "../../../../../../.github/workflows/harness-m0.yml"), "utf8");
    expect(ci).toContain("compose-smoke");
    expect(ci).toContain("wait-api-healthy.sh");
    expect(ci).toMatch(/NO_BLIP_SECS:\s*"5"/);
    expect(ci).toMatch(/healthy/);

    const indexSrc = readFileSync(join(here, "../../src/index.ts"), "utf8");
    expect(indexSrc).toContain("startApiServer({ exitOnBusy: true })");
    expect(indexSrc).toContain("logEaddrInUse");
    expect(indexSrc).toContain("wait-api-healthy");
    expect(indexSrc).toMatch(/EADDRINUSE/);
    expect(indexSrc).toMatch(/process\.exit\(2\)/);
    expect(indexSrc).not.toMatch(/createHarness\s*\(/);

    const serverSrc = readFileSync(join(here, "../../src/server.ts"), "utf8");
    const serveAt = serverSrc.indexOf("serve(");
    const migrateAt = serverSrc.indexOf("createHarness({");
    expect(serveAt).toBeGreaterThan(-1);
    expect(migrateAt).toBeGreaterThan(serveAt);
  });
});
