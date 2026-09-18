import { useState } from "react";
import { extractMissing, formatReadyAt } from "../lib/missing";
import type { Decision, GateInstance } from "../types/gate";

type Props = {
  gate: GateInstance;
  busy: boolean;
  lockNotice?: string;
  mockMode: boolean;
  onDecide: (gate: GateInstance, decision: Decision, extra: { note?: string; structural_change: boolean }) => void;
  onArmConflict?: (id: string) => void;
};

export function GateCard({
  gate,
  busy,
  lockNotice,
  mockMode,
  onDecide,
  onArmConflict,
}: Props) {
  const [note, setNote] = useState("");
  const [structural, setStructural] = useState(false);
  const missing = extractMissing(gate);

  const submit = (decision: Decision) => {
    onDecide(gate, decision, {
      note: note.trim() || undefined,
      structural_change: structural,
    });
  };

  return (
    <article
      className="gate-card"
      data-testid="gate-card"
      data-gate-id={gate.id}
      data-version={gate.version}
    >
      <header className="gate-card-head">
        <div className="gate-meta-row">
          <span className="pill pill-ready" data-testid="gate-status">ready</span>
          {gate.goal_mode ? <span className="pill">{gate.goal_mode}</span> : null}
          <span className="mono muted" data-testid="gate-version">v{gate.version}</span>
        </div>
        <h2 className="gate-title">{gate.goal_title ?? "Ready gate"}</h2>
        <p className="gate-id mono" title="GateInstance.id" data-testid="gate-id">
          {gate.id}
        </p>
      </header>

      <dl className="gate-facts">
        <div>
          <dt>Predicate</dt>
          <dd className="mono" data-testid="predicate-meta">
            <span data-testid="predicate-id">{gate.predicate_id}</span>
            <span className="muted"> · </span>
            <span data-testid="predicate-version">{gate.predicate_version}</span>
          </dd>
        </div>
        <div>
          <dt>Ready at</dt>
          <dd title={gate.ready_at} data-testid="ready-at">{formatReadyAt(gate.ready_at)}</dd>
        </div>
        {gate.assignment_id ? (
          <div>
            <dt>Assignment</dt>
            <dd className="mono">{gate.assignment_id}</dd>
          </div>
        ) : null}
      </dl>

      <section className="missing-block" aria-label="ready_result_json.missing" data-testid="missing-block">
        <h3>Missing</h3>
        {missing.length === 0 ? (
          <p className="missing-none" data-testid="missing-none">None. Predicate satisfied.</p>
        ) : (
          <ul className="missing-list">
            {missing.map((item) => (
              <li key={item} data-testid="missing-item">{item}</li>
            ))}
          </ul>
        )}
      </section>

      {lockNotice ? (
        <p className="lock-banner" role="status" data-testid="lock-banner">
          {lockNotice}
        </p>
      ) : null}

      <label className="note-label">
        Note <span className="muted">(optional)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Reason stays on the decision, not in chat."
        />
      </label>

      <label className="struct-label">
        <input
          type="checkbox"
          data-testid="structural-change"
          checked={structural}
          onChange={(e) => setStructural(e.target.checked)}
        />
        Structural change <span className="muted">— new Assignment (default is same Assignment, new Run)</span>
      </label>

      <div className="actions">
        <button type="button" className="btn pass" data-testid="decide-pass" disabled={busy} onClick={() => submit("pass")}>
          Pass
        </button>
        <button type="button" className="btn revise" data-testid="decide-revise" disabled={busy} onClick={() => submit("revise")}>
          Revise
        </button>
        <button type="button" className="btn defer" data-testid="decide-defer" disabled={busy} onClick={() => submit("defer")}>
          Defer
        </button>
      </div>

      {mockMode && onArmConflict ? (
        <p className="mock-tools">
          <button
            type="button"
            className="text-btn"
            data-testid="arm-409"
            onClick={() => onArmConflict(gate.id)}
          >
            Arm 409 (next decide refreshes; no overwrite retry)
          </button>
        </p>
      ) : null}
    </article>
  );
}
