import {
  evalDeliverReadyV1,
  evalSafetyOnlyV1,
  type ReadyResult,
} from "@boundary-harness/domain";
import { appendOutbox, nowIso, type Db } from "./db.js";

type EvidenceRow = { kind: string };
type SnapshotRow = { is_draft: number | null; checks_conclusion: string | null };

export function evalGoalReady(db: Db, goalId: string, assignmentId?: string, runId?: string): ReadyResult {
  const evidence = db
    .prepare(
      `SELECT kind FROM evidence_items
       WHERE goal_id = ? OR assignment_id = ? OR run_id = ?`,
    )
    .all(goalId, assignmentId ?? null, runId ?? null) as EvidenceRow[];

  const snap = db
    .prepare(
      `SELECT is_draft, checks_conclusion FROM github_snapshots
       WHERE goal_id = ? ORDER BY observed_at DESC LIMIT 1`,
    )
    .get(goalId) as SnapshotRow | undefined;

  const run = runId
    ? (db.prepare("SELECT adapter, status FROM runs WHERE id = ?").get(runId) as
        | { adapter: string; status: string }
        | undefined)
    : undefined;

  const github =
    snap == null
      ? null
      : { is_draft: snap.is_draft === 1, checks_conclusion: snap.checks_conclusion ?? "" };

  const noopContractOk = run?.adapter === "noop" && evidence.some((e) => e.kind === "artifact_uri");

  return evalDeliverReadyV1({
    evidence,
    github,
    noopContractOk,
    runSucceeded: run?.status === "succeeded",
  });
}

export function maybeAdvanceGates(db: Db, goalId: string, assignmentId?: string, runId?: string): ReadyResult {
  const result = evalGoalReady(db, goalId, assignmentId, runId);
  const openEscalation = db
    .prepare(
      `SELECT id FROM policy_events
       WHERE goal_id = ? AND track = 'authority_gate' AND decision IN ('require_gate','deny')
       LIMIT 1`,
    )
    .get(goalId) as { id: string } | undefined;
  const safety = evalSafetyOnlyV1({ openAuthorityEscalation: Boolean(openEscalation) });

  const instances = db
    .prepare(
      `SELECT gi.id, gi.status, gi.version, gd.predicate_id
       FROM gate_instances gi
       JOIN gate_defs gd ON gd.id = gi.gate_def_id
       WHERE gi.goal_id = ? AND gi.status IN ('pending','ready')`,
    )
    .all(goalId) as { id: string; status: string; version: number; predicate_id: string }[];

  for (const gi of instances) {
    const pred = gi.predicate_id === "safety_only_v1" ? safety : result;
    if (!pred.ok) {
      db.prepare("UPDATE gate_instances SET ready_result_json = ? WHERE id = ?").run(
        JSON.stringify(pred),
        gi.id,
      );
      continue;
    }
    if (gi.status === "pending") {
      db.prepare(
        "UPDATE gate_instances SET status='ready', ready_at=?, ready_result_json=?, version=version+1 WHERE id=? AND status='pending'",
      ).run(nowIso(), JSON.stringify(pred), gi.id);
      appendOutbox(db, "gate.ready", { gate_instance_id: gi.id, goal_id: goalId, missing: pred.missing });
    }
  }
  return result;
}
