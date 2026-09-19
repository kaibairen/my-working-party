/** Canonical Backend brief/policy patterns (M0). HTTP + MCP share parseBriefOrThrow. */
export {
  BRIEF_FORBIDDEN_KEYS,
  BriefV1Schema as BriefV1,
  EvidenceKind,
  parseBriefOrThrow,
  parseBriefV1,
  type BriefV1 as BriefV1Type,
  type EvidenceKind as EvidenceKindType,
} from "./brief";
export { PolicyCheckResponse, advisoryBlocksDispatch, type PolicyCheckResponse as PolicyCheckResponseType } from "./policy-response";
