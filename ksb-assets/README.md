# KSB Assets — ICT Asset Management System

A working full-stack ICT asset management system: React + Vite frontend, Express
API, and SQLite for persistence, with JWT authentication and role-based access.

> **What this is:** a real, runnable prototype with persistent data and login.
> **What this is not:** a hardened production deployment. The honest limitations
> are listed at the bottom — read them before presenting this anywhere.

---

## Quick start

You need **Node.js 22 or newer** (the backend uses Node's built-in SQLite).
Check with `node --version`.

```bash
# from the project root (ksb-assets/)
npm run install:all     # installs root + server + client dependencies
npm run seed            # creates the database with demo users + sample assets
npm run dev             # runs API (port 4000) and frontend (port 5173) together
```

Then open **http://localhost:5173**.

**Demo accounts**

| Username | Password   | Role   | Can do                          |
|----------|------------|--------|---------------------------------|
| admin    | admin123   | admin  | everything (add, change status) |
| viewer   | viewer123  | viewer | read-only                       |

To wipe and reseed at any time: `npm run seed`.

---

## What it does

- **Asset register** with search and status filtering.
- **Lifecycle management** — assets move through *In Stock → Assigned → In Repair
  → Retired*. The legal transitions are enforced **on the server**, so the rules
  cannot be bypassed by calling the API directly. Retired is terminal.
- **Audit trail** — every creation and status change is written to a separate
  `audit_log` table with the acting user and a timestamp. Viewable per asset.
- **Straight-line depreciation** — current book value is computed from purchase
  price, purchase date, and useful life.
- **Authentication & roles** — JWT login; admins can modify, viewers are read-only
  (enforced server-side, not just hidden in the UI).

---

## Architecture

```
ksb-assets/
├── server/                 Express API + SQLite
│   ├── db.js               schema, domain rules (transitions, depreciation)
│   ├── index.js            REST endpoints, auth middleware, role checks
│   ├── seed.js             demo data
│   └── ksb.db              the database file (created by `npm run seed`)
└── client/                 React + Vite frontend
    └── src/App.jsx         login + dashboard + drawer + add modal
```

**Database (3 normalised tables):** `users`, `assets`, `audit_log`.
`audit_log` has foreign keys to both `assets` and `users`. Each status change is
written inside a SQL **transaction** so the asset update and its audit record
commit together or not at all (ACID).

**Why the rules live on the server:** the frontend hides illegal actions for UX,
but the *enforcement* is in the API. Hitting `POST /api/assets/:id/transition`
with an illegal target (e.g. reassigning a Retired asset) returns `400`, and a
viewer hitting any write endpoint returns `403`. UI checks are convenience;
server checks are security.

---

## Honest limitations (say these before someone asks)

1. **Node's built-in SQLite is experimental.** It runs with the
   `--experimental-sqlite` flag (already wired into the npm scripts) and prints a
   warning. It is real SQLite and fine for a prototype; for production you would
   pin `better-sqlite3` or move to Postgres. The data layer is isolated in
   `db.js`, so that swap does not touch the API routes or the UI.
2. **JWT secret is hard-coded** in `index.js` so the demo runs with zero setup.
   In production this must come from an environment variable / secret manager.
3. **No HTTPS, rate limiting, or input sanitisation beyond basic validation.**
   Fine on localhost, not for a public deployment.
4. **Depreciation is naive** — flat straight-line, no salvage value, no
   per-category useful-life defaults. Real fixed-asset accounting (and KRA rules)
   is more involved.
5. **No edit/delete of assets, no pagination, no CSV/PDF export, no barcode
   scanning.** These are deliberate scope cuts, not oversights — the next
   features to build.

---

## Note on branding

"KSB" / Kenya Sugar Board branding is used here for demonstration only. This is an
independent prototype and is not an official Kenya Sugar Board system.
