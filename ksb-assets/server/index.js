// index.js — Express API (built-in SQLite)
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { fileURLToPath } from "url";
import path from "path";
import db, { TRANSITIONS, CATEGORIES, STATES, bookValue, nextAssetId } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "ksb-dev-secret-change-me";

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Invalid token" }); }
}
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin role required" });
  next();
}

function shape(a) {
  return {
    id: a.id, name: a.name, category: a.category, status: a.status,
    price: a.price, usefulLife: a.useful_life, date: a.purchase_date,
    assignedTo: a.assigned_to, dept: a.dept,
    bookValue: a.status === "Retired" ? 0 : bookValue(a.price, a.purchase_date, a.useful_life),
  };
}
const getAsset = (id) => db.prepare("SELECT * FROM assets WHERE id = ?").get(id);

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: "Invalid credentials" });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "8h" });
  res.json({ token, user: { username: user.username, role: user.role } });
});

app.get("/api/meta", (_req, res) =>
  res.json({ states: STATES, categories: CATEGORIES, transitions: TRANSITIONS }));

app.get("/api/assets", auth, (_req, res) => {
  const rows = db.prepare("SELECT * FROM assets ORDER BY created_at DESC").all();
  res.json(rows.map(shape));
});

app.get("/api/assets/:id", auth, (req, res) => {
  const a = getAsset(req.params.id);
  if (!a) return res.status(404).json({ error: "Not found" });
  const history = db.prepare(
    `SELECT al.action, al.detail, al.at, u.username
     FROM audit_log al LEFT JOIN users u ON u.id = al.user_id
     WHERE al.asset_id = ? ORDER BY al.id DESC`
  ).all(req.params.id);
  res.json({ ...shape(a), history });
});

app.post("/api/assets", auth, requireAdmin, (req, res) => {
  const { name, category, price, date, dept, usefulLife } = req.body;
  if (!name || !category) return res.status(400).json({ error: "name and category required" });
  const id = nextAssetId();
  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO assets (id, name, category, status, price, useful_life, purchase_date, dept)
       VALUES (?, ?, ?, 'In Stock', ?, ?, ?, ?)`
    ).run(id, name, category, Number(price) || 0, Number(usefulLife) || 4, date || null, dept || "");
    db.prepare(`INSERT INTO audit_log (asset_id, user_id, action, detail) VALUES (?, ?, 'CREATED', ?)`)
      .run(id, req.user.id, "Registered (In Stock)");
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); return res.status(500).json({ error: String(e) }); }
  res.status(201).json(shape(getAsset(id)));
});

app.post("/api/assets/:id/transition", auth, requireAdmin, (req, res) => {
  const { to, assignedTo } = req.body;
  const a = getAsset(req.params.id);
  if (!a) return res.status(404).json({ error: "Not found" });
  const allowed = TRANSITIONS[a.status] || [];
  if (!allowed.includes(to))
    return res.status(400).json({ error: `Illegal transition: ${a.status} \u2192 ${to}` });
  if (to === "Assigned" && !(assignedTo || "").trim())
    return res.status(400).json({ error: "assignedTo required when assigning" });

  const newHolder = to === "Assigned" ? assignedTo.trim() : to === "In Stock" ? "" : a.assigned_to;
  const detail = to === "Assigned" ? `Assigned to ${assignedTo.trim()}` : `${a.status} \u2192 ${to}`;
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE assets SET status = ?, assigned_to = ? WHERE id = ?").run(to, newHolder, a.id);
    db.prepare(`INSERT INTO audit_log (asset_id, user_id, action, detail) VALUES (?, ?, 'STATUS', ?)`)
      .run(a.id, req.user.id, detail);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); return res.status(500).json({ error: String(e) }); }
  res.json(shape(getAsset(a.id)));
});

app.patch("/api/assets/:id", auth, requireAdmin, (req, res) => {
  const a = getAsset(req.params.id);
  if (!a) return res.status(404).json({ error: "Not found" });
  const { name, category, price, date, dept, usefulLife } = req.body;
  if (!name?.trim() || !category?.trim()) return res.status(400).json({ error: "name and category required" });
  db.exec("BEGIN");
  try {
    db.prepare(
      `UPDATE assets SET name=?, category=?, price=?, purchase_date=?, dept=?, useful_life=? WHERE id=?`
    ).run(name.trim(), category.trim(), Number(price) || 0, date || null, dept || "", Number(usefulLife) || 4, a.id);
    db.prepare("INSERT INTO audit_log (asset_id, user_id, action, detail) VALUES (?, ?, 'EDITED', ?)")
      .run(a.id, req.user.id, `Details updated`);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); return res.status(500).json({ error: String(e) }); }
  res.json(shape(getAsset(a.id)));
});

app.delete("/api/assets/:id", auth, requireAdmin, (req, res) => {
  const a = getAsset(req.params.id);
  if (!a) return res.status(404).json({ error: "Not found" });
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM audit_log WHERE asset_id = ?").run(req.params.id);
    db.prepare("DELETE FROM assets WHERE id = ?").run(req.params.id);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); return res.status(500).json({ error: String(e) }); }
  res.json({ deleted: req.params.id });
});

app.post("/api/assets/:id/reassign", auth, requireAdmin, (req, res) => {
  const { assignedTo } = req.body;
  const a = getAsset(req.params.id);
  if (!a) return res.status(404).json({ error: "Not found" });
  if (a.status !== "Assigned") return res.status(400).json({ error: "Asset is not currently assigned" });
  if (!(assignedTo || "").trim()) return res.status(400).json({ error: "assignedTo required" });
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE assets SET assigned_to = ? WHERE id = ?").run(assignedTo.trim(), a.id);
    db.prepare("INSERT INTO audit_log (asset_id, user_id, action, detail) VALUES (?, ?, 'REASSIGNED', ?)").run(a.id, req.user.id, `Reassigned to ${assignedTo.trim()}`);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); return res.status(500).json({ error: String(e) }); }
  res.json(shape(getAsset(a.id)));
});

if (process.env.NODE_ENV === "production") {
  const dist = path.join(__dirname, "../client/dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

// Auto-seed demo data when the database is empty (first deploy)
function seedIfEmpty() {
  const count = db.prepare("SELECT COUNT(*) as n FROM users").get().n;
  if (count > 0) return;
  const users = [["admin", "admin123", "admin"], ["viewer", "viewer123", "viewer"]];
  const insUser = db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)");
  for (const [u, p, r] of users) insUser.run(u, bcrypt.hashSync(p, 10), r);
  const adminId = db.prepare("SELECT id FROM users WHERE username='admin'").get().id;
  const sample = [
    ["Dell Latitude 5501", "Laptop", "Assigned", 95000, "2023-03-12", "J. Mwangi", "Finance"],
    ["HP ProLiant DL380", "Server", "In Stock", 410000, "2024-01-20", "", "ICT"],
    ["Cisco Catalyst 2960", "Network", "Assigned", 78000, "2022-08-01", "ICT Rack A", "ICT"],
    ["Dell Precision 7530", "Laptop", "In Repair", 130000, "2021-11-05", "A. Otieno", "Research"],
    ["HP LaserJet Pro", "Printer", "Assigned", 32000, "2023-06-18", "Registry", "Admin"],
    ["Lenovo ThinkCentre", "Desktop", "Retired", 60000, "2019-02-10", "", "Records"],
  ];
  const insAsset = db.prepare(
    `INSERT INTO assets (id, name, category, status, price, useful_life, purchase_date, assigned_to, dept)
     VALUES (?, ?, ?, ?, ?, 4, ?, ?, ?)`);
  const insLog = db.prepare(`INSERT INTO audit_log (asset_id, user_id, action, detail) VALUES (?, ?, ?, ?)`);
  for (const [name, cat, status, price, date, holder, dept] of sample) {
    const id = nextAssetId();
    insAsset.run(id, name, cat, status, price, date, holder, dept);
    insLog.run(id, adminId, "CREATED", `Registered (${status})`);
  }
  console.log("Auto-seeded demo users and assets.");
}
seedIfEmpty();

app.listen(PORT, () => console.log(`KSB Assets API running on http://localhost:${PORT}`));
