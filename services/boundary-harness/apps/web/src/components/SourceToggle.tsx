import type { DataSource } from "../types/gate";

type Props = {
  source: DataSource;
  onChange: (source: DataSource) => void;
};

export function SourceToggle({ source, onChange }: Props) {
  return (
    <div className="source-toggle" role="group" aria-label="Data source">
      <button
        type="button"
        className={source === "mock" ? "is-on" : ""}
        data-testid="source-mock"
        aria-pressed={source === "mock"}
        onClick={() => onChange("mock")}
      >
        Mock
      </button>
      <button
        type="button"
        className={source === "api" ? "is-on" : ""}
        data-testid="source-api"
        aria-pressed={source === "api"}
        onClick={() => onChange("api")}
      >
        API
      </button>
    </div>
  );
}
