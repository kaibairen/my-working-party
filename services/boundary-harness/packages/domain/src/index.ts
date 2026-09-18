export { HarnessError, isHarnessError } from "./errors";
export {
  BRIEF_FORBIDDEN_KEYS,
  BriefV1Schema,
  BudgetSchema,
  EVIDENCE_KINDS,
  parseBriefOrThrow,
  parseBriefV1,
  parseBudget,
  type BriefV1,
  type Budget,
  type EvidenceKind,
} from "./brief";
export {
  ROLES,
  DIALS,
  MCP_TOOL_NAMES,
  parseBearer,
  parseRole,
  requireRole,
  requirePoolAccess,
  assertNoPlaintextCredentials,
  assertSecretRef,
  redactPayload,
  signJwt,
  verifyJwt,
  jwtSecret,
  type Actor,
  type Role,
  type Dial,
  type JwtClaims,
} from "./rbac";
export { WEBHOOK_SKEW_SECONDS, signHarnessWebhook, verifyHarnessWebhook } from "./hmac";
export { schema } from "./schema";
export { SCHEMA_SQL, SCHEMA_VERSION } from "./schema-sql";
export { applySchema, closeHarness, createHarness, type Harness, type Db } from "./db";
export {
  attachEvidence,
  createExceptionGrant,
  createGoal,
  decideGate,
  dispatchAssignment,
  fillAssignment,
  getAdminFreeze,
  getAssignment,
  getGoal,
  getRun,
  health,
  listAudit,
  listGateInstances,
  listPools,
  policyCheck,
  publishOutbox,
  recordGithubSnapshot,
  setAdminFreeze,
  setGoalDial,
  assertAdminNotFrozen,
  assertNoClientStatusWrite,
} from "./services";
export { PolicyCheckResponse, advisoryBlocksDispatch } from "./policy-response";
