import { z } from "zod";

/** Backend OpenAPI PolicyCheckResponse (redirect is an object, not a string). */
export const PolicyCheckResponse = z.object({
  decision: z.enum(["allow", "redirect_hint", "require_gate", "deny"]),
  track: z.enum(["authority_gate", "advisory_hint"]),
  reason_code: z.string(),
  redirect: z
    .object({
      hint: z.string(),
      fail_count: z.number().int().nonnegative(),
      threshold: z.number().int().positive(),
    })
    .optional(),
});
export type PolicyCheckResponse = z.infer<typeof PolicyCheckResponse>;

/** advisory_hint MUST NOT create GateInstance or block dispatch */
export function advisoryBlocksDispatch(r: PolicyCheckResponse): boolean {
  return r.track === "authority_gate" && r.decision !== "allow";
}
