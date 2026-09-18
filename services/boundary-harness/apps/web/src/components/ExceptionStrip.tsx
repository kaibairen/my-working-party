import type { InboxException } from "../types/gate";

type Props = {
  items: InboxException[];
  onDismiss: (id: string) => void;
};

const LABELS: Record<InboxException["type"], string> = {
  "run.failed": "Run failed",
  "budget.exceeded": "Budget exceeded",
  "freeze.changed": "Freeze",
};

export function ExceptionStrip({ items, onDismiss }: Props) {
  if (items.length === 0) return null;
  return (
    <ul className="exceptions" aria-label="Exceptions">
      {items.map((item) => (
        <li key={item.id} className={`exception exception-${item.type.replace(".", "-")}`}>
          <span className="exception-kind">{LABELS[item.type]}</span>
          <span className="exception-text">{item.text}</span>
          <button type="button" className="text-btn" onClick={() => onDismiss(item.id)}>
            Dismiss
          </button>
        </li>
      ))}
    </ul>
  );
}
