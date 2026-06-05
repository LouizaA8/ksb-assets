import { createClient } from "@libsql/client";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const db = createClient(
  process.env.TURSO_DATABASE_URL
    ? { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN || "" }
    : { url: `file:${path.join(__dirname, "ksb.db")}` }
);

await db.executeMultiple(`
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
    at        TEXT NOT NULL DEFAULT (datetime('now'))
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

export async function nextAssetId() {
  const result = await db.execute(
    "SELECT id FROM assets WHERE id LIKE 'KSB-%' ORDER BY CAST(SUBSTR(id,5) AS INTEGER) DESC LIMIT 1"
  );
  const row = result.rows[0];
  const n = row ? parseInt(String(row.id).slice(4), 10) : 100;
  return `KSB-${n + 1}`;
}

export default db;
