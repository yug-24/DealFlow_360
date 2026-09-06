# DealFlow360 — Local Setup

Stack: Node.js + Express, MongoDB + Mongoose, Socket.IO, React (Vite).
See `Architecture.md`, `Rules.md`, `Phases.md`, `design.md`, `PRD.md` for the spec this implements.

## Prerequisites
- Node.js 18+
- MongoDB running **as a replica set** (required for multi-document
  transactions used by scoring recompute + approval routing + audit logging).

### Start MongoDB as a single-node replica set (local dev)
```bash
mkdir -p ./data/db
mongod --dbpath ./data/db --replSet rs0 --port 27017 &
mongosh --eval "rs.initiate()"
```
(If you don't have MongoDB installed locally, the easiest path is Docker:
`docker run -d -p 27017:27017 --name dealflow-mongo mongo --replSet rs0`,
then run the `rs.initiate()` command once against it via `mongosh` or
`docker exec -it dealflow-mongo mongosh --eval "rs.initiate()"`.)

## Backend
```bash
cd backend
cp .env.example .env
npm install
npm run seed        # master data + 5 demo scenarios (score, fulfillment, billing, stalled, anomaly)
npm run dev          # nodemon, http://localhost:4000
```
Health check: `GET http://localhost:4000/api/health`

Optional: set `ANTHROPIC_API_KEY` in `.env` to enable live LLM calls for the
Phase 7 Explanation/Resolution Agent. Without it, both fall back to
deterministic templates/candidates automatically — nothing breaks.

## Frontend
```bash
cd frontend
npm install
npm run dev         # http://localhost:5173
```
Demo logins (password `password123` for all):
- Internal: `rep@dealflow360.dev`, `manager@dealflow360.dev`, `finance@dealflow360.dev`, `admin@dealflow360.dev`
- Customer portal: `portal@acmecorp.dev`

## Running backend tests
```bash
cd backend
npm test        # node's built-in test runner, no Mongo required — 11 tests
```

## Current status: all 8 phases from Phases.md implemented

**Phase 0 (skeleton) and Phase 1 (deterministic scoring engine)** were
delivered as a separate, already-working codebase and are unchanged here
except for two additive fixes needed to support later phases (see
`CHANGES.md` for the exact diff and reasoning):
- `FulfillmentSplit.allocations.warehouseId` is no longer `required` — a
  backorder row (Rules.md §5) has no warehouse yet.
- `Quotation` gained `promisedShipDate` / `currentProjectedShipDate` fields
  for Phase 6's delivery-slippage rule (Rules.md §9).

**Phase 2 — Quotation Builder + Approval Routing**
`src/modules/approval/index.js`: routing decision (Rules.md §3) and the
re-entry rule (§4). Every line mutation (`POST /quotations`,
`PATCH /quotations/:id/lines`) recomputes the score and re-routes in one
step, then broadcasts `score_updated`. Rep discount anomaly checks
(Phase 6's detector) run inline on every discount entered.

**Phase 3 — Warehouse Fulfillment Allocation**
`src/modules/fulfillment/index.js`: the greedy allocator from Rules.md §5,
using `StockLevel`'s `qtyReserved` + optimistic concurrency to avoid
oversell, with a consolidation pass and manual override.

**Phase 4 — Hybrid Billing & Subscriptions**
`src/modules/billing/index.js`: one-time invoices generated at
confirmation, `SubscriptionPlan` + `BillingSchedule` for recurring lines,
and the exact day-fraction proration formula from Rules.md §6.

**Phase 5 — Customer Portal + Real-Time Sync**
`src/routes/index.js` portal endpoints + `src/realtime.js`: counter-offers
recompute and re-enter approval per the Rules.md §4 rule; the portal view
never exposes the internal numeric score (design.md §4.5/§6).

**Phase 6 — Deal Health Dashboard**
`src/modules/dashboard/`: stalled-deal query (§8), rep discount anomaly
z-score via Welford's online algorithm (§7), delivery-slippage check (§9).

**Phase 7 — Explanation & Resolution Agent**
`src/modules/explanation/` and `src/modules/resolution/`: LLM layer
strictly read-only over validated `ScoreSnapshot`s (Architecture.md §7),
with every number in generated text/candidates cross-checked against the
real breakdown before being shown (Rules.md §10 — the LLM Boundary Rule).
Works with or without `ANTHROPIC_API_KEY` configured.

**Frontend**: all 12 Rep Workspace / Customer Portal screens are wired to
live data — Dashboard, Quotations (builder), Approvals, Fulfillment,
Subscriptions, Invoices, Deal Health, Products (read-only admin config),
My Quotation, Profile. `Reports` and `Messages` remain intentional
placeholders — both are explicitly out of MVP scope per `Phases.md`'s cut
priority and `PRD.md`'s non-goals, respectively.

## What wasn't verified end-to-end
MongoDB isn't installable in the sandbox this was built in (no package,
and network egress is restricted to code-package registries) — so nothing
requiring a live database (the actual `npm run seed` run, real API
requests, real Socket.IO round-trips) could be exercised here. What *was*
verified: all 11 `node --test` unit tests pass (6 original + 5 new,
covering the greedy allocator, the LLM boundary rule, and the fallback
explanation template), every backend file passes `node --check`, a dry
`require()` of the full route tree caught one real bug before you'd hit it
(see `CHANGES.md`), and the frontend builds cleanly via `vite build` with
zero lint errors. Run `npm run seed` first against a real replica set —
its console output states the expected value next to each scenario's
actual result, so any mismatch will be obvious immediately.
