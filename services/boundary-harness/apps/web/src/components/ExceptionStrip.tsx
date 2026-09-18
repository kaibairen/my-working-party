import type { InboxException } from "../types/gate";

type Props = {
  items: InboxException[];
  onDismiss: (id: string) => void;
};

const LABELS: Record<InboxException["type"], string> = {
  "run.failed": "Run failed",
  "budget.exceeded": "Budget exceeded",
  "freeze.changed": "Freeze",
  "run.succeeded": "Run succeeded",
};

export function ExceptionStrip({ items, onDismiss }: Props) {
  if (items.length === 0) return null;
  return (
    <ul className="exceptions" aria-label="Exceptions" data-testid="exceptions">
      {items.map((item) => (
        <li
          key={item.id}
          className={`exception exception-${item.type.replace(".", "-")}`}
          data-testid={`exception-${item.type}`}
        >
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
