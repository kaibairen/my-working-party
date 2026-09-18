# Control Plane as HARNESS — Research Brief / 研究简报
**Goal:** Control Plane = HARNESS (not workflow jail) for Grok-Bot-like autonomous agents  
**Audience:** Product Design Doc / PRD fold-in  
**Date:** 2026-09-18 (Asia/Shanghai)

---

## 0. One-line thesis / 一句话论点

| EN | 中文 |
|---|---|
| A control plane should **constrain boundaries** (permissions, evidence, budgets, durable SoT) while **preserving agent autonomy inside** the box — a harness, not a flowchart jail. | 控制面应约束**边界**（权限、证据、预算、持久 SoT），同时在盒子内**保留智能体自主性**——是 harness，不是流程图监狱。 |

**Recommended product name / positioning one-liner**

> **EN:** *Boundary Harness* — the control plane that keeps Grok-Bot-class agents free inside the fence.  
> **中文：** *Boundary Harness（边界线束）* —— 让 Grok-Bot 级智能体在围栏内保持自由的控制面。  
> **Alt:** *Agent Fence / Runtime Harness / Autonomy Guardrail Plane*

---

## 1. Source index / 来源索引（concrete URLs）

### 1.1 Official — Anthropic harness
| Doc | URL | Steal |
|---|---|---|
| Effective harnesses for long-running agents (2025-11-26) | https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents | Initializer + coding agent; feature_list JSON; progress.txt; git as SoT; one feature/session; clean-state handoff |
| Harness design for long-running apps (2026-03-24) | https://www.anthropic.com/engineering/harness-design-long-running-apps | Planner / generator / evaluator; separate judge; strip scaffolding when models improve; sprint→contract then simplify |
| Harnessing Claude's Intelligence (3 patterns) | https://claude.com/blog/harnessing-claudes-intelligence | Lean on model; ask what you can **stop** doing; set boundaries carefully (security/UX/observability tools) |
| Multi-agent research system (token econ) | https://www.anthropic.com/engineering/multi-agent-research-system | Agents ~**4×** chat tokens; multi-agent ~**15×**; token spend ≈80% BrowseComp variance |
| cwc-long-running-agents (OSS primitives) | https://github.com/anthropics/cwc-long-running-agents | Hooks, evaluator, default-fail contracts — ingredients not turnkey |

### 1.2 Official — Cursor
| Doc | URL | Steal |
|---|---|---|
| Run Modes / Auto-review | https://cursor.com/docs/agent/security/run-modes | Allowlist → sandbox → classifier; **boundary not workflow**; Cloud Agents ≠ Run Modes |
| Auto-review changelog | https://cursor.com/changelog/auto-review | Classifier subagent: allow / alternate path / ask user |
| Projects | https://cursor.com/docs/agent/projects | Coordinator ≠ coder; shared Project memory; subscriptions (Slack/schedule/PR) |
| Projects launch | https://cursor.com/changelog/projects | Parallel Cloud Agents; durable shared context files |
| Cloud Agents | https://cursor.com/docs/cloud-agent | Isolated VM autonomy; no per-action local approval |
| Cloud Agents API | https://cursor.com/docs/cloud-agent/api/endpoints | Durable agent + runs; follow-ups; usage; artifacts; plan/agent mode |

### 1.3 Official — Grok Bot / xAI
| Doc | URL | Steal |
|---|---|---|
| Designing Grok Bot | https://x.ai/news/designing-grok-bot | **Bot roster ≠ chat history**; presence; Bot’s computer; Routines; disappearing UI; don’t make user the dispatcher |
| Introducing Grok Bot | https://x.ai/news/introducing-grok-bot | Always-on teammates; finish E2E; return only for approval |
| Docs overview | https://docs.x.ai/grok-bot/overview | Persistent VM; no workflow builder; Bot↔Bot coordination; context compounds |
| Computer & apps | https://docs.x.ai/grok-bot/computer-and-apps | Shared account computer; `/workspace` durable files |

### 1.4 OSS control planes
| Project | URL | Role |
|---|---|---|
| Loop-Control-Plane | https://github.com/BankNatchapol/Loop-Control-Plane | Operator console + kanban + **explicit approval gates**; auto-run off by default |
| builderz-labs/mission-control | https://github.com/builderz-labs/mission-control | Fleet ops: dispatch, spend, Aegis review — **above** runtime loops |
| CAPHTECH/state_gate | https://github.com/CAPHTECH/state_gate | Evidence-submission state machine; truth outside agent memory |
| graphed-orchestrator | https://github.com/graphed-org/graphed-orchestrator | Deterministic referee (not LLM); gates from git/CI evidence; L0/L1/L2 pause |
| Temporal HITL | https://docs.temporal.io/guides/reliable-document-approvals | Durable wait, SLA timers, escalation, audit — **not** step scripting of agent cognition |
| evidence-first-orchestrator | https://github.com/ax0s-io/evidence-first-orchestrator | Caps (workers/writers/nodes); cannot lie about outcome; normalize-downgrade |
| agents-control-tower | https://github.com/ofershap/agents-control-tower | Thin ops UI over Cloud Agents API — observe/command, don’t jail |

### 1.5 Token economics / delegation
| Doc | URL | Key number / pattern |
|---|---|---|
| Anthropic multi-agent research | https://www.anthropic.com/engineering/multi-agent-research-system | **4×** single-agent vs chat; **15×** multi-agent vs chat |
| Delegation Is Token Economics | https://github.com/ramparte/agent-building-playbook/blob/534aa66d/patterns/delegation-token-economics.md | Delegate iff briefing+child+ingest < inline + context opportunity cost |
| Nadir commentary | https://getnadir.com/blog/multi-agent-orchestration-15x-token-cost/ | Route before you fan out |

---

## 2. Principles to KEEP from Grok Bot positioning  
### 必须保留的 Grok Bot 定位原则

| # | EN | 中文 | Citation |
|---|---|---|---|
| P1 | **Primary object = Bot (teammate), not chat thread** | 主对象是 Bot（队友），不是会话线程 | designing-grok-bot |
| P2 | **Own computer + durable artifacts**; chat is interface, not SoT | 自有电脑 + 持久产物；聊天是界面，不是事实源 | docs overview; computer-and-apps |
| P3 | **No workflow builder required to start** — message → grant access | 起步不需要工作流搭建器 | overview; introducing |
| P4 | **Return only for approval / judgment**, not for every step | 只为审批/判断回来，不为每一步回来 | introducing; designing |
| P5 | **Routines / event-driven work** — agency without user prompt | Routines / 事件驱动——无需用户提示即可开工 | designing-grok-bot |
| P6 | **Bot↔Bot coordination**; user is not the router | Bot 间协调；用户不是总调度 | designing; overview |
| P7 | **Capabilities shared, memory/role context local** | 能力可共享，记忆/角色上下文归角色 | designing-grok-bot |
| P8 | **Disappearing interface** — every UI must earn its keep for delegation | 界面做减法——每个控件必须服务于委派 | designing-grok-bot |
| P9 | **Presence > micromanagement** — glance, don’t operate | 在场感 > 微观操控——瞥一眼，别上手开 | designing-grok-bot |
| P10 | **Structured artifacts / cards over chat-as-board** | 结构化产物/卡片，而非把聊天当看板 | designing (“shape of information”) |

---

## 3. What harness SHOULD constrain vs MUST NOT  
### 边界该约束 vs 自主性内禁止约束

### 3.1 SHOULD constrain（边界 / Boundary）— harness 职责

| Layer | EN | 中文 | Pattern source |
|---|---|---|---|
| **Permissions** | Tool/network/path allow·block; irreversible actions need typed tools or approval | 工具/网络/路径；不可逆动作需类型化工具或审批 | Cursor Auto-review; Anthropic “set boundaries carefully” |
| **Sandbox** | Where shell runs; filesystem & network reach | 命令跑在哪；文件系统与网络可达性 | Cursor run-modes |
| **Evidence / SoT** | Progress, git, feature lists, job dirs — **not** chat transcript as truth | 进度、git、特性表、job 目录——聊天记录不是真相 | Anthropic harness; state_gate; EFO; graphed |
| **Budgets** | Token / concurrency / writer / node / wall-clock caps | Token / 并发 / writer / 节点 / 时长上限 | Anthropic 4×/15×; EFO caps; delegation economics |
| **Completion contracts** | Done = evidence + gates (tests, CI SHA, evaluator) | 完成 = 证据 + 门禁 | Anthropic evaluator; graphed DONE; EFO normalize |
| **HITL wait points** | Durable approval, SLA, escalate — sparse, consequential | 持久审批、SLA、升级——稀疏且后果性 | Temporal HITL |
| **Observability** | Trace runs, usage, artifacts; control tower | 运行/用量/产物可观测 | Cloud Agents API; mission-control; control-tower |
| **Escalation ladder** | Fresh context → stronger model → human pause | 清上下文 → 更强模型 → 人类暂停 | graphed L0/L1/L2 |

### 3.2 MUST NOT constrain（自主性内 / Autonomy inside）— 禁止变成 jail

| Anti-pattern | EN | 中文 | Why |
|---|---|---|---|
| **Step scripts** | Hardcoding every tool sequence as BPMN | 把每一步工具调用写成 BPMN | Kills emergence; Anthropic: research is path-dependent |
| **Chat-as-SoT** | State only in transcript / sidebar history | 状态只存在会话/历史侧栏 | Grok Bot redesign; Anthropic externalize state |
| **Forced multi-agent for everything** | Always fan-out | 凡事都多 Agent | 15× cost; bad for sequential coding |
| **Self-grading only** | Generator marks its own “done” | 只靠生成者自评完成 | Anthropic self-eval bias |
| **User-as-dispatcher** | Dashboards/boards that re-centralize routing | 看板把用户变回总调度 | designing-grok-bot explicitly rejected |
| **Stale scaffolding** | Keep context-resets / sprint cages after model upgrade | 模型升级后仍保留过时脚手架 | “ask what you can stop doing” |
| **Prompt-only governance** | Caps as polite requests | 仅用提示词做限额 | EFO: enforce in adapter, not prompt |
| **Micromanage computer UI** | Force user to watch every click | 强迫用户盯每一帧 | Grok Bot “their computer, not yours” |

**Boundary test / 边界测试句：**  
> If removing this control would let the agent **hurt systems or invent success**, keep it.  
> If removing it would only change **how** the agent explores inside a safe box, delete it.  
> 去掉后若智能体能**伤害系统或伪造成功**→保留；若只改变安全盒内**探索方式**→删除。

---

## 4. Reference matrix — project | steal | avoid  
### 参考矩阵

| Project | Steal 偷什么 | Avoid 避开什么 |
|---|---|---|
| **Anthropic effective harness** | Initializer; feature JSON; progress.txt; git commits; one-feature sessions; e2e browser verify | Treating harness as fixed forever; one-shotting; chat compaction as sole memory |
| **Anthropic long-running apps** | Separate evaluator; planner expands 1–4 sentence → spec; re-simplify on model upgrade | Over-expensive fixed sprint cages when model can solo; self-praise loops |
| **Harnessing intelligence** | Bash/editor-native tools; progressive skills; promote irreversible actions to typed tools; prune dead scaffolding | Assuming every tool result must re-enter context; handcrafted mega-prompts for all tasks |
| **Anthropic multi-agent research** | Scale effort to complexity; teach delegation; parallel only when independent; measure tokens | Fan-out on sequential/coding tasks; vague subagent briefs; 50-subagent thrash |
| **Cursor Auto-review** | Classifier as **boundary**; allowlist + sandbox + escalate; agent may try alternate path | Treating classifier as absolute security boundary (docs say it isn’t); Run Everything by default |
| **Cursor Projects** | Coordinator plans/delegates; shared Project memory files; event subscriptions | Making coordinator write all code; Privacy Legacy conflict; Enterprise gaps as product core |
| **Cursor Cloud Agents API** | Durable agent + runs; usage endpoint; artifacts; plan vs agent mode | Equating API lifecycle with cognitive workflow jail |
| **Grok Bot design** | Bot roster; presence; Routines; Bot computer; disappearing UI; Chief-of-Staff pattern | Chat-history IA; user-as-dispatcher boards; exposing every infra knobs |
| **Loop-Control-Plane** | Explicit human gates; risk labels; auto-run off default | Turning kanban into mandatory step jail for all agent cognition |
| **mission-control** | Fleet spend/presence/Aegis quality gate above runtimes | Absorbing agent reasoning into the plane (it correctly sits *above* loops) |
| **state_gate** | Evidence submission; truth outside memory; revision/idempotency | Over-DSL that turns exploration into rigid state soup for creative work |
| **graphed-orchestrator** | Deterministic referee; CI SHA gates; integrity scan; L2 human-only pause | LLM-as-orchestrator for irreversible process decisions |
| **Temporal HITL** | Durable wait/SLA/audit for **human judgment** | Encoding agent think-loops as Temporal activities (wrong abstraction) |
| **evidence-first-orchestrator** | Hard caps; writer lane; cannot claim success without evidence; normalize-downgrade | Unbounded fan-out; trust model self-report |
| **agents-control-tower** | Observe/launch/follow-up/stop — thin tower | Becoming the place that scripts agent steps |
| **delegation-token-economics** | Explicit inequality for spawn vs inline; cheaper child models | Over-delegation of tiny tasks; under-delegation until context rot |

---

## 5. Design tension (core) / 核心张力

| Pole A — Autonomy / Emergence | Pole B — Anti-chaos / Anti-chat-SoT |
|---|---|
| Path-dependent exploration; Bot invents approach | External durable SoT (files, git, job evidence) |
| Parallel subagents when breadth pays 15× | Budget + concurrency caps; route before fan-out |
| Message-first, no workflow builder | Sparse HITL on irreversible / high-risk |
| Model improves → **remove** scaffolding | Keep security/UX/observability boundaries |
| Presence & Routines | Escalation ladder + evidence-gated “done” |

**Product stance / 产品立场：**  
Harness = **fence + evidence + budget + sparse HITL**.  
Not = **workflow DAG that owns the agent’s brain**.

---

## 6. Token economics (fold into PRD) / Token 经济

| Fact | Source |
|---|---|
| Single agent ≈ **4×** chat tokens | Anthropic multi-agent research |
| Multi-agent ≈ **15×** chat tokens | same |
| Token usage ≈ **80%** of BrowseComp variance | same |
| Delegate when `(brief + child + ingest) < (inline + context opportunity cost)` | ramparté playbook |
| Prefer cheaper/faster models for subagents; reserve strong model for plan/synth | Anthropic; playbook |
| Cap fan-out; scale effort to query complexity | Anthropic prompting principles |

**PRD implication:** Control plane must expose **budget policy** (per Bot / Project / Routine), not only “max agents.” Over-constrain autonomy → still burn tokens via thrash/retry; under-constrain → 15× bill without value.

---

## 7. Risks if we over-constrain / 过度约束的风险

| Risk | EN | 中文 |
|---|---|---|
| R1 | **Emergence death** — agent becomes brittle script; loses Grok Bot “teammate” feel | 涌现死亡——变成脆弱脚本，丢掉队友感 |
| R2 | **Chat regression** — users retreat to micromanaging steps in chat | 回退到聊天微观操控 |
| R3 | **Scaffold tax** — stale gates/sprints inflate cost without quality (Anthropic stripped them on Opus upgrades) | 脚手架税——过时门禁涨成本不涨质量 |
| R4 | **Token thrash** — over-orchestration + retries can exceed honest 15× without 90% lift | Token 空转——过度编排+重试超过诚实的 15× |
| R5 | **User-as-dispatcher** — boards/approvals on every card recreate the jail Grok Bot removed | 用户变回总调度 |
| R6 | **False safety** — prompt-only “gates” that agents ignore; success theater | 虚假安全——提示词门禁可被忽略 |
| R7 | **Model lag** — harness optimized for weaker model blocks stronger model’s native long-horizon skill | 模型滞后——为弱模型设计的 harness 卡住强模型 |
| R8 | **Competitive miss** — products that feel like Zapier-for-agents lose to Bot roster + computer | 竞争失位——像 Zapier 的 Agent 输给 Bot 名册+电脑 |

---

## 8. PRD-ready recommendations / 可直接写入 PRD 的建议

1. **Name the plane “Harness / Boundary,” never “Workflow Engine.”**  
2. **SoT hierarchy:** Workspace files + git + evidence job dir ≫ Project memory ≫ Bot memory ≫ chat. Chat is UX, not ledger.  
3. **Default control set:** Auto-review-class permission boundary + sandbox + spend/concurrency budgets + evidence-gated done + sparse Temporal-style HITL.  
4. **Default free set:** Tool order, exploration path, when to spawn subagents (within budget), how to structure intermediate work.  
5. **Re-simplify policy:** Every model bump → delete one harness component; measure.  
6. **Economics UI:** Show estimated 1×/4×/15× class before fan-out; require value justification for multi-agent Routines.  
7. **Steal thin tower (control-tower/mission-control), not thick BPM (kanban-as-jail).**  
8. **Keep Grok Bot P1–P10** as non-negotiable UX invariants for any control-plane surface.

---

## 9. Positioning one-liner (final)

**EN:** *Boundary Harness — fence the blast radius, not the intelligence.*  
**中文：** *Boundary Harness —— 约束爆炸半径，不约束智能本身。*

