# Boundary Harness

Independent control-plane service (Goal / Assignment / GateInstance / Run).
Docs live in `my-working-party`; this tree is the implementation.

## Layout

```text
apps/web/          M2-preview Gate Inbox (decision-maker HITL)
openapi/           Domain API M0 fragment (request/response SoT)
```

## Decision-maker path

The only default HITL is **Gate Inbox**. Canvas, Roster, and run timelines are
projections — not required to dispatch (`canvas_not_required_for_dispatch`).

See [apps/web/README.md](apps/web/README.md) to run the preview.
