import { readFileSync } from "node:fs";
import { assertSecretRef } from "@boundary-harness/domain";

/** Resolve a secret_ref for internal use. NEVER return this value in HTTP responses. */
export function resolveSecretRef(ref: string): string {
  const ok = assertSecretRef(ref);
  if (ok.startsWith("env:")) {
    const name = ok.slice("env:".length);
    return process.env[name] ?? "";
  }
  return readFileSync(ok.slice("file:".length), "utf8");
}

export function publicSecretRef(ref: string): string {
  return assertSecretRef(ref);
}
