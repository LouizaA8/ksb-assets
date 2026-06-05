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

async function getAsset(id) {
  const result = await db.execute({ sql: "SELECT * FROM assets WHERE id = ?", args: [id] });
  return result.rows[0] || null;
}

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await db.execute({ sql: "SELECT * FROM users WHERE username = ?", args: [username] });
    const user = result.rows[0];
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "8h" });
    res.json({ token, user: { username: user.username, role: user.role } });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get("/api/meta", (_req, res) =>
  res.json({ states: STATES, categories: CATEGORIES, transitions: TRANSITIONS }));

app.get("/api/assets", auth, async (_req, res) => {
  try {
    const result = await db.execute("SELECT * FROM assets ORDER BY created_at DESC");
    res.json(result.rows.map(shape));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get("/api/assets/:id", auth, async (req, res) => {
  try {
    const a = await getAsset(req.params.id);
    if (!a) return res.status(404).json({ error: "Not found" });
    const hist = await db.execute({
      sql: `SELECT al.action, al.detail, al.at, u.username
            FROM audit_log al LEFT JOIN users u ON u.id = al.user_id
            WHERE al.asset_id = ? ORDER BY al.id DESC`,
      args: [req.params.id],
    });
    res.json({ ...shape(a), history: hist.rows });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post("/api/assets", auth, requireAdmin, async (req, res) => {
  const { name, category, price, date, dept, usefulLife } = req.body;
  if (!name || !category) return res.status(400).json({ error: "name and category required" });
  try {
    const id = await nextAssetId();
    await db.batch([
      { sql: `INSERT INTO assets (id, name, category, status, price, useful_life, purchase_date, dept) VALUES (?, ?, ?, 'In Stock', ?, ?, ?, ?)`, args: [id, name, category, Number(price) || 0, Number(usefulLife) || 4, date || null, dept || ""] },
      { sql: `INSERT INTO audit_log (asset_id, user_id, action, detail) VALUES (?, ?, 'CREATED', ?)`, args: [id, req.user.id, "Registered (In Stock)"] },
    ], "write");
    res.status(201).json(shape(await getAsset(id)));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post("/api/assets/:id/transition", auth, requireAdmin, async (req, res) => {
  const { to, assignedTo } = req.body;
  try {
    const a = await getAsset(req.params.id);
    if (!a) return res.status(404).json({ error: "Not found" });
    const allowed = TRANSITIONS[a.status] || [];
    if (!allowed.includes(to)) return res.status(400).json({ error: `Illegal transition: ${a.status} → ${to}` });
    if (to === "Assigned" && !(assignedTo || "").trim()) return res.status(400).json({ error: "assignedTo required when assigning" });
    const newHolder = to === "Assigned" ? assignedTo.trim() : to === "In Stock" ? "" : a.assigned_to;
    const detail = to === "Assigned" ? `Assigned to ${assignedTo.trim()}` : `${a.status} → ${to}`;
    await db.batch([
      { sql: "UPDATE assets SET status = ?, assigned_to = ? WHERE id = ?", args: [to, newHolder, a.id] },
      { sql: `INSERT INTO audit_log (asset_id, user_id, action, detail) VALUES (?, ?, 'STATUS', ?)`, args: [a.id, req.user.id, detail] },
    ], "write");
    res.json(shape(await getAsset(a.id)));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.patch("/api/assets/:id", auth, requireAdmin, async (req, res) => {
  const { name, category, price, date, dept, usefulLife } = req.body;
  if (!name?.trim() || !category?.trim()) return res.status(400).json({ error: "name and category required" });
  try {
    const a = await getAsset(req.params.id);
    if (!a) return res.status(404).json({ error: "Not found" });
    await db.batch([
      { sql: `UPDATE assets SET name=?, category=?, price=?, purchase_date=?, dept=?, useful_life=? WHERE id=?`, args: [name.trim(), category.trim(), Number(price) || 0, date || null, dept || "", Number(usefulLife) || 4, a.id] },
      { sql: `INSERT INTO audit_log (asset_id, user_id, action, detail) VALUES (?, ?, 'EDITED', ?)`, args: [a.id, req.user.id, "Details updated"] },
    ], "write");
    res.json(shape(await getAsset(a.id)));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.delete("/api/assets/:id", auth, requireAdmin, async (req, res) => {
  try {
    const a = await getAsset(req.params.id);
    if (!a) return res.status(404).json({ error: "Not found" });
    await db.batch([
      { sql: "DELETE FROM audit_log WHERE asset_id = ?", args: [req.params.id] },
      { sql: "DELETE FROM assets WHERE id = ?", args: [req.params.id] },
    ], "write");
    res.json({ deleted: req.params.id });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post("/api/assets/:id/reassign", auth, requireAdmin, async (req, res) => {
  const { assignedTo } = req.body;
  try {
    const a = await getAsset(req.params.id);
    if (!a) return res.status(404).json({ error: "Not found" });
    if (a.status !== "Assigned") return res.status(400).json({ error: "Asset is not currently assigned" });
    if (!(assignedTo || "").trim()) return res.status(400).json({ error: "assignedTo required" });
    await db.batch([
      { sql: "UPDATE assets SET assigned_to = ? WHERE id = ?", args: [assignedTo.trim(), a.id] },
      { sql: `INSERT INTO audit_log (asset_id, user_id, action, detail) VALUES (?, ?, 'REASSIGNED', ?)`, args: [a.id, req.user.id, `Reassigned to ${assignedTo.trim()}`] },
    ], "write");
    res.json(shape(await getAsset(a.id)));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post("/api/admin/wipe-assets", auth, requireAdmin, async (req, res) => {
  try {
    await db.batch([
      { sql: "DELETE FROM audit_log", args: [] },
      { sql: "DELETE FROM assets", args: [] },
    ], "write");
    res.json({ ok: true, message: "All assets wiped" });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

if (process.env.NODE_ENV === "production") {
  const dist = path.join(__dirname, "../client/dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

async function seedIfEmpty() {
  const result = await db.execute("SELECT COUNT(*) as n FROM users");
  if (Number(result.rows[0].n) > 0) return;
  await db.batch(
    [["admin", "admin123", "admin"], ["viewer", "viewer123", "viewer"]].map(([u, p, r]) => ({
      sql: "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
      args: [u, bcrypt.hashSync(p, 10), r],
    })),
    "write"
  );
  console.log("Created default admin and viewer accounts.");
}
await seedIfEmpty();

app.listen(PORT, () => console.log(`KSB Assets API running on http://localhost:${PORT}`));
