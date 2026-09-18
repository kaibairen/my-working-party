import { describe, expect, it } from "vitest";
import { evaluateReady, type ReadyContext } from "./index";

const empty: ReadyContext = {
  evidence: [],
  githubSnapshots: [],
  policyEvents: [],
  noopOrOfflineContract: false,
};

describe("safety_only_v1", () => {
  it("is ok when there is no open authority escalation", () => {
    const r = evaluateReady("safety_only_v1", 1, empty, "t");
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("fails while an authority_gate require_gate event is open", () => {
    const r = evaluateReady(
      "safety_only_v1",
      1,
      {
        ...empty,
        policyEvents: [{ decision: "require_gate", track: "authority_gate", closed: false }],
      },
      "t",
    );
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("policy_clearance:no_open_authority_escalation");
  });

  it("ignores advisory_hint events", () => {
    const r = evaluateReady(
      "safety_only_v1",
      1,
      {
        ...empty,
        policyEvents: [{ decision: "redirect_hint", track: "advisory_hint", closed: false }],
      },
      "t",
    );
    expect(r.ok).toBe(true);
  });
});

describe("deliver_ready_v1", () => {
  it("deliver_requires_summary_md", () => {
    const r = evaluateReady(
      "deliver_ready_v1",
      1,
      {
        ...empty,
        evidence: [{ kind: "artifact_uri", uri: "file://out.tgz" }],
        noopOrOfflineContract: true,
      },
      "t",
    );
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("evidence:summary_md");
  });

  it("noop_path_needs_artifact_and_contract", () => {
    const onlySummary = evaluateReady(
      "deliver_ready_v1",
      1,
      { ...empty, evidence: [{ kind: "summary_md", uri: "file://s.md" }] },
      "t",
    );
    expect(onlySummary.ok).toBe(false);
    expect(onlySummary.missing).toEqual(
      expect.arrayContaining(["evidence:artifact_uri", "noop_or_offline_contract"]),
    );

    const noContract = evaluateReady(
      "deliver_ready_v1",
      1,
      {
        ...empty,
        evidence: [
          { kind: "summary_md", uri: "file://s.md" },
          { kind: "artifact_uri", uri: "file://out.tgz" },
        ],
        noopOrOfflineContract: false,
      },
      "t",
    );
    expect(noContract.ok).toBe(false);
    expect(noContract.missing).toContain("noop_or_offline_contract");

    const ok = evaluateReady(
      "deliver_ready_v1",
      1,
      {
        ...empty,
        evidence: [
          { kind: "summary_md", uri: "file://s.md" },
          { kind: "artifact_uri", uri: "file://out.tgz" },
        ],
        noopOrOfflineContract: true,
      },
      "t",
    );
    expect(ok.ok).toBe(true);
    expect(ok.missing).toEqual([]);
  });

  it("accepts github non-draft + checks success instead of noop contract", () => {
    const r = evaluateReady(
      "deliver_ready_v1",
      1,
      {
        ...empty,
        evidence: [{ kind: "summary_md", uri: "file://s.md" }],
        githubSnapshots: [{ is_draft: false, checks_conclusion: "success" }],
      },
      "t",
    );
    expect(r.ok).toBe(true);
  });

  it("run_succeeded_alone_never_ready / AP-07 self-score kinds", () => {
    const r = evaluateReady(
      "deliver_ready_v1",
      1,
      {
        ...empty,
        evidence: [{ kind: "screenshot", uri: "file://chat-done.png" }],
        noopOrOfflineContract: false,
      },
      "t",
    );
    expect(r.ok).toBe(false);
  });

  it("does not treat shadow evidence as live", () => {
    const r = evaluateReady(
      "deliver_ready_v1",
      1,
      {
        ...empty,
        evidence: [
          { kind: "summary_md", uri: "file://s.md", shadow: true },
          { kind: "artifact_uri", uri: "file://out.tgz", shadow: true },
        ],
        noopOrOfflineContract: true,
      },
      "t",
    );
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("evidence:summary_md");
  });
});
