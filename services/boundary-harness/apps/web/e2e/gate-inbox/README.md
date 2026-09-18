# Gate Inbox E2E (HarnessQA)

Authoritative list: `GATE_INBOX_PLAYWRIGHT_CDP_v1`.

Forced 🔴 (must stay green):

| ID | Name |
|----|------|
| E2E-01 | `inbox_lists_only_ready` |
| E2E-02 | `inbox_empty_state_quiet` |
| E2E-03 | `inbox_card_shows_predicate_meta` |
| E2E-10 | `decide_pass_uses_version` |
| E2E-11 | `decide_revise_default_same_assignment` |
| E2E-12 | `decide_optimistic_lock_409_refresh` |
| E2E-20 | `card_renders_missing_array` |
| E2E-21 | `missing_empty_still_shows_ready_ok` |
| E2E-30 | `no_mark_done_button` |
| E2E-31 | `chat_done_text_never_creates_card` |
| E2E-32 | `run_succeeded_banner_not_decide` |

```bash
npx playwright test e2e/gate-inbox
```

Mock Domain stub only — no live Cursor, no canvas. Does **not** replace
`tests/ready-anti` / `security-anti` unit suites.
