export { HarnessError, isHarnessError } from "./errors";
export {
  BRIEF_FORBIDDEN_KEYS,
  BriefV1Schema,
  BudgetSchema,
  EVIDENCE_KINDS,
  parseBriefV1,
  parseBudget,
  type BriefV1,
  type Budget,
  type EvidenceKind,
} from "./brief";
export { ROLES, MCP_TOOL_NAMES, parseRole, requireRole, type Actor, type Role } from "./rbac";
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
  getAssignment,
  getGoal,
  getRun,
  health,
  listGateInstances,
  listPools,
  policyCheck,
  publishOutbox,
  recordGithubSnapshot,
  assertNoClientStatusWrite,
} from "./services";
