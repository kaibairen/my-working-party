export class HttpError extends Error {
  status: number;
  code: string;
  keys?: string[];

  constructor(status: number, code: string, message?: string, keys?: string[]) {
    super(message ?? code);
    this.status = status;
    this.code = code;
    this.keys = keys;
  }
}

export function errorBody(err: HttpError): { code: string; message: string; keys?: string[] } {
  const body: { code: string; message: string; keys?: string[] } = {
    code: err.code,
    message: err.message,
  };
  if (err.keys?.length) body.keys = err.keys;
  return body;
}

export function fromDomainError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  const e = err as { message?: string; status?: number; keys?: string[]; code?: string };
  if (e?.message === "brief_forbidden_field") {
    return new HttpError(422, "brief_forbidden_field", "Brief contains forbidden fields", e.keys);
  }
  if (e?.message === "brief_additional_property" || e?.message === "brief_invalid") {
    return new HttpError(422, "brief_forbidden_field", e.message, e.keys);
  }
  if (e?.message === "secret_ref_unsupported" || e?.code === "secret_ref_unsupported") {
    return new HttpError(400, "secret_ref_unsupported", "secret_ref must be file: or env:");
  }
  if (e?.message === "freeze_active") {
    return new HttpError(423, "freeze_active", "Freeze enabled; new dispatch rejected");
  }
  if (e?.message === "executor_forbidden" || e?.message === "human_dispatch_forbidden") {
    return new HttpError(e.status ?? 403, e.message, e.message);
  }
  if (e?.message === "deliver_requires_gatedef") {
    return new HttpError(400, "deliver_requires_gatedef", "deliver mode requires at least one GateDef");
  }
  if (e?.message === "explore_must_not_default_deliver_ready") {
    return new HttpError(422, "explore_must_not_default_deliver_ready", "explore must not default to deliver_ready_v1");
  }
  if (typeof e?.status === "number") {
    return new HttpError(e.status, e.code ?? e.message ?? "error", e.message);
  }
  return new HttpError(500, "internal_error", "internal error");
}
