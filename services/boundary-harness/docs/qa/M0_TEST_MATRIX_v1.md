# Boundary Harness M0 Test Matrix v1

Canonical copy also lives at repo-root [`docs/qa/M0_TEST_MATRIX_v1.md`](../../../docs/qa/M0_TEST_MATRIX_v1.md).

See that file for A5 ready-anti and S1–S8 security-anti case names. Vitest files:

- `apps/api/src/ready-anti.test.ts`
- `apps/api/tests/ready-anti/fill-shape.test.ts` (`fill_shape_missing_kinds_422`, `fill_shape_superset_ok`)
- `apps/api/src/security-anti.test.ts`
- `packages/ready/src/ready.test.ts`
- `packages/policy/src/policy.test.ts`
- `packages/domain/src/brief.test.ts`
