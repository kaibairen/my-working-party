# my-working-party

grokbot 工作 画布 规划 状态

## 当前产品方案 / Current product scheme

正在研讨：**Boundary Harness（边界线束 / Agent Delivery Harness）** —— 控制面是 harness（护栏），不是 jail（监工）；约束爆炸半径，不约束智能本身。对齐 Grok Bot 的持久自主队友定位。

Under discussion: **Boundary Harness** — control plane as a harness, not a jail; fence the blast radius, not the intelligence. Aligns with Grok Bot autonomy.

Canonical docs only (do not implement from older `*_DRAFT.md` or v0.1.x product titles):

- [docs/product/BOUNDARY_HARNESS_PRD_AUTHORITATIVE_v1.md](docs/product/BOUNDARY_HARNESS_PRD_AUTHORITATIVE_v1.md)（**AUTHORITATIVE**）
- [docs/product/APPENDIX_READY_PREDICATES_AND_GATE_ANTI_PATTERNS_v1.md](docs/product/APPENDIX_READY_PREDICATES_AND_GATE_ANTI_PATTERNS_v1.md)
- [docs/product/APPENDIX_RBAC_ACTION_MATRIX_v1.md](docs/product/APPENDIX_RBAC_ACTION_MATRIX_v1.md)
- [docs/engineering/BOUNDARY_HARNESS_TECH_IMPL_v1.md](docs/engineering/BOUNDARY_HARNESS_TECH_IMPL_v1.md)
- [docs/engineering/BOUNDARY_HARNESS_ENGINEERING.md](docs/engineering/BOUNDARY_HARNESS_ENGINEERING.md)（supporting — historical engineering plan）
- [docs/product/research/control-plane-as-harness-brief.md](docs/product/research/control-plane-as-harness-brief.md)（supporting — research）

## Implementation preview

- [services/boundary-harness/apps/web](services/boundary-harness/apps/web) — M2-preview **Gate Inbox** (decision-maker HITL; mock by default)
