import type { ErrorBody } from "../types/gate";

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body?: ErrorBody;

  constructor(status: number, body?: ErrorBody, fallback?: string) {
    super(body?.message ?? fallback ?? `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.code;
    this.body = body;
  }

  get isOptimisticLock(): boolean {
    return this.status === 409 && this.code === "optimistic_lock";
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
