// seed.js — demo users + sample assets. Safe to re-run.
import bcrypt from "bcryptjs";
import db, { nextAssetId } from "./db.js";

db.exec("DELETE FROM audit_log; DELETE FROM assets; DELETE FROM users;");

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
console.log("Seeded: 2 users (admin/admin123, viewer/viewer123) and", sample.length, "assets.");
