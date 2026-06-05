// db.js — built-in SQLite (node:sqlite) + schema + domain rules
// ------------------------------------------------------------
// Uses Node's built-in SQLite (no native compilation, no deps).
// Schema is normalised: users, assets, audit_log are separate
// tables; audit_log has FKs to assets(id) and users(id). Every
// status change is written inside a TRANSACTION so the asset
// update and its audit record commit together (ACID) — directly
// relevant to RCS_432 Database Administration.

import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.NODE_ENV === "production"
  ? "/var/data/ksb.db"
  : path.join(__dirname, "ksb.db");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'viewer',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS assets (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    category      TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'In Stock',
    price         INTEGER NOT NULL DEFAULT 0,
    useful_life   INTEGER NOT NULL DEFAULT 4,
    purchase_date TEXT,
    assigned_to   TEXT DEFAULT '',
    dept          TEXT DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id  TEXT NOT NULL,
    user_id   INTEGER,
    action    TEXT NOT NULL,
    detail    TEXT NOT NULL,
    at        TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(id)
  );
`);

export const STATES = ["In Stock", "Assigned", "In Repair", "Retired"];
export const TRANSITIONS = {
  "In Stock": ["Assigned", "In Repair", "Retired"],
  "Assigned": ["In Stock", "In Repair", "Retired"],
  "In Repair": ["In Stock", "Assigned", "Retired"],
  "Retired": [],
};
export const CATEGORIES = ["Laptop", "Desktop", "Server", "Network", "Printer", "Mobile", "Peripheral"];

export function bookValue(price, purchaseDate, usefulLife = 4) {
  if (!price || !purchaseDate) return price || 0;
  const years = (Date.now() - new Date(purchaseDate).getTime()) / (365.25 * 864e5);
  const annual = price / usefulLife;
  return Math.max(0, Math.round(price - annual * years));
}

export function nextAssetId() {
  const row = db.prepare(
    "SELECT id FROM assets WHERE id LIKE 'KSB-%' ORDER BY CAST(SUBSTR(id,5) AS INTEGER) DESC LIMIT 1"
  ).get();
  const n = row ? parseInt(String(row.id).slice(4), 10) : 100;
  return `KSB-${n + 1}`;
}

export default db;
