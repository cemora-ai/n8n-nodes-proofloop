# n8n-nodes-proofloop · IGNITION 1.5.0

Community node **source package** for [PROOFLOOP](https://proofloop.tech) by Cemora AI. Package ownership: npm `cemcop`; source: [cemora-ai/n8n-nodes-proofloop](https://github.com/cemora-ai/n8n-nodes-proofloop).

**Release status:** Repository-ready candidate. It has **not** been published to npm, tested in a real n8n instance, verified, approved, or endorsed by n8n. Unit tests do not replace an integration test. Do not treat the budget gate as a universal remote kill-switch.

## Install (only after npm publication and real n8n testing)

1. In PROOFLOOP open **Integrations** and create an `events:write` API key; note your agent ID.
2. In n8n navigate to **Settings → Community nodes** and install `n8n-nodes-proofloop` once it is publicly published to npm.
3. Create **PROOFLOOP API** credentials: Worker HTTPS base URL and the integration key.
4. Create an hourly budget policy and enable **Enforce gate** in PROOFLOOP. Put **Reserve Estimated Cost** immediately *before* each costly action. Supply a **unique opaque `actionKey` per external operation**, e.g. an execution UUID combined with the item index, and an honest USD estimate. Leave **Continue On Fail disabled**.
5. Only on an **allowed** reservation, run the costly action. Put **Settle Reserved Cost** after it, using `reservationId` from the reservation result and a *measured* actual cost. For a confirmed no-op, use `not_executed` with explicit confirmation. Never mark a timed-out or unknown-result action as not executed. Report a measured execution event separately with **Record Agent Event**.

## PROOFLOOP reserve → run → settle

1. **Reserve Estimated Cost:** API `POST /api/v1/guardian/reserve` with `{ "automationId": "aut_...", "actionKey": "execution-123-step-4", "estimatedCostUsd": 0.05 }`. The reply contains `allowed` and, on success, `reservationId`.
2. **AI agent / model step:** place only after the successful reservation. A failed or declined reservation throws, even with the node's Continue On Fail setting.
3. **Settle Reserved Cost:** API `POST /api/v1/guardian/settle` with `{ "automationId": "aut_...", "reservationId": "gbr_...", "outcome": "completed", "actualCostUsd": 0.04 }`.
4. **Error path:** a request already sent to a provider may have executed even when its response timed out. Do not settle it as `not_executed` without verifying the provider-side result. The reserved estimate remains charged against the rolling budget until its one-hour window ends; it is not a universal remote kill-switch.

**Strictness:** No enabled enforcement policy, unpriced source events in the last 60 minutes, reused action keys, and insufficient remaining budget all fail closed. Reservations are inserted using one conditional SQLite statement to avoid double-admission under concurrency. Measured telemetry plus reservations are counted conservatively; if the same cost is recorded twice, spending can temporarily appear higher than actual. A denial is *not* proof of money saved.

The guard stops **future downstream n8n steps** when the budget will be exceeded by the estimated next step. It cannot cancel a currently running tool call or remotely deactivate an n8n workflow. If the network check fails, the node throws by default; do not enable Continue On Fail for budget enforcement.

PII redaction runs locally inside n8n before sending fields. It masks emails, Turkish mobile numbers, mathematically valid Turkish identity numbers, checksum-valid IBANs and Luhn-valid cards, plus sensitive field names. False negatives are possible for unusual formats and customer names; never add raw customer payloads, secrets or sensitive documents to the telemetry fields. The server independently re-sanitizes event bodies.

**Security boundary:** A budget gate is enforced only when placed before the expensive n8n action. It checks an opt-in policy for an existing PROOFLOOP automation ID, uses a scoped API key and fails closed on an API error or unrecognized server response. Keep n8n's global **Continue On Fail** and downstream error routing disabled for this check. Test against a real n8n instance before using it as a production control; there is no network-level kill of a running request.

## Publication checklist

- [ ] Confirm trademark permissions, npm account ownership (`cemcop`), and npm package-name availability (`n8n-nodes-proofloop`).
- [ ] Run `npm test` and `npm pack --dry-run` to inspect the package contents.
- [ ] Migrate this JavaScript prototype into n8n's current TypeScript `n8n-node` scaffold, then pass `npm run lint`, `npm run build`, and `npm run dev` according to the current [verification guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines.md).
- [ ] In a real, supported n8n instance, test credential creation, event delivery, missing/invalid credentials, denial, network failure, cost reservation and settlement, multiple items, and disabled Continue On Fail on gates. Confirm the server API contract at `https://proofloop.tech` before live use.
- [ ] Configure a GitHub Actions npm publishing workflow **with provenance**; this is required for n8n Creator Portal verification. Avoid publishing directly from a Mac.
- [ ] Publish only after owner approval and successful real-world verification. Apply through [n8n Creator Portal](https://creators.n8n.io/nodes) afterward; n8n decides whether to verify it.

The included `.github/workflows/checks.yml` only executes unit tests and package checks. **It does not publish to npm.** No authentication tokens or API keys belong in this public repository.
