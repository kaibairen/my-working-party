export class HarnessError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "HarnessError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isHarnessError(err: unknown): err is HarnessError {
  return err instanceof HarnessError;
}
