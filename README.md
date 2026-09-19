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

## Dogfood / Grok Bot 约束验证

Dogfood 模式：在本仓 `services/boundary-harness` 上开发 / 使用 / 修。

**核心目标：** 用 Harness MCP（Dial / Ready / Gate）约束 Grok Bot。Cursor Cloud Agents 只是执行池之一，不是替代。

SOP：[docs/product/dogfood/GROKBOT_CONSTRAINT_VERIFY_AND_DOGFOOD_v1.md](docs/product/dogfood/GROKBOT_CONSTRAINT_VERIFY_AND_DOGFOOD_v1.md)
