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
  createPool,
  decideGate,
  dispatchAssignment,
  fillAssignment,
  getAdminFreeze,
  getAssignment,
  getGoal,
  getRun,
  health,
  listAudit,
  listEventsAfter,
  listGateInstances,
  listGithubSnapshots,
  listOutbox,
  listPools,
  outboxStats,
  policyCheck,
  publishOutbox,
  reconcileCursorRuns,
  recordGithubSnapshot,
  syncCursorAgentRuns,
  workerTick,
  setAdminFreeze,
  setGoalDial,
  assertAdminNotFrozen,
  assertNoClientStatusWrite,
} from "./services";
export { listDesks, DESK_STATUS, humanDeskName, type DeskPresence } from "./desks";
export { listGoals, listOfficeGoals, type FillSlot, type OfficeGoal } from "./office";
export { PolicyCheckResponse, advisoryBlocksDispatch } from "./policy-response";
export { AUTHORITY_ACTIONS, checkPolicy } from "@harness/policy";
