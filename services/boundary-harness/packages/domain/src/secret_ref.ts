const SECRET_REF_RE = /^(file:\/|env:)[A-Za-z0-9._/:-]+$/;

export function isSecretRef(ref: string): boolean {
  return typeof ref === "string" && SECRET_REF_RE.test(ref);
}

export function assertSecretRef(ref: unknown): string {
  if (typeof ref !== "string" || !isSecretRef(ref)) {
    const err = new Error("secret_ref_unsupported") as Error & { status: number; code: string };
    err.status = 400;
    err.code = "secret_ref_unsupported";
    throw err;
  }
  return ref;
}
