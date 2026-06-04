import React, { useState, useEffect, useMemo, useCallback } from "react";
import ksbLogo from "./ksb-logo.png";

//  API helper 
const api = {
  token: null,
  async call(path, opts = {}) {
    const res = await fetch("/api" + path, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(api.token ? { Authorization: "Bearer " + api.token } : {}),
        ...(opts.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  },
};

const ksh = (n) => "KSh " + (n || 0).toLocaleString("en-KE");
const STATE_COLOR = {
  "In Stock": "#3a7bd5", Assigned: "#2f8f3e", "In Repair": "#c79413", Retired: "#8a8a8a",
};

export default function App() {
  const [session, setSession] = useState(null); // { token, user }

  if (!session) return <Login onLogin={(s) => { api.token = s.token; setSession(s); }} />;
  return <Dashboard session={session} onLogout={() => { api.token = null; setSession(null); }} />;
}

function Monogram() {
  return <img src={ksbLogo} alt="KSB" className="monogram" />;
}

function Login({ onLogin }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(""); setBusy(true);
    try {
      const res = await api.call("/login", { method: "POST", body: JSON.stringify({ username: u, password: p }) });
      onLogin(res);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand-row">
          <Monogram />
          <div>
            <div className="brand-name">KSB Assets</div>
            <div className="brand-sub">ICT Asset Management</div>
          </div>
        </div>
        <div className="tagline">More Sugar For Prosperity</div>

        <label className="fld">Username</label>
        <input className="txt" value={u} onChange={(e) => setU(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        <label className="fld">Password</label>
        <input className="txt" type="password" value={p} onChange={(e) => setP(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />

        {err && <div className="err">{err}</div>}
        <button className="btn-primary" disabled={busy || !u || !p} onClick={submit}>
          {busy ? "Signing in\u2026" : "Sign In"}
        </button>
        <div className="hint">
          Demo accounts<br />
          admin / admin123 &nbsp;&middot;&nbsp; viewer / viewer123
        </div>
      </div>
    </div>
  );
}

function Dashboard({ session, onLogout }) {
  const isAdmin = session.user.role === "admin";
  const [assets, setAssets] = useState([]);
  const [meta, setMeta] = useState({ states: [], categories: [], transitions: {} });
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [a, m] = await Promise.all([api.call("/assets"), api.call("/meta")]);
      setAssets(a); setMeta(m);
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => assets.filter((a) => {
    const q = !query || [a.name, a.id, a.assignedTo, a.dept].join(" ").toLowerCase().includes(query.toLowerCase());
    const f = filter === "All" || a.status === filter;
    return q && f;
  }), [assets, query, filter]);

  const stats = useMemo(() => {
    const by = (s) => assets.filter((a) => a.status === s).length;
    const value = assets.filter((a) => a.status !== "Retired").reduce((s, a) => s + a.bookValue, 0);
    return { total: assets.length, assigned: by("Assigned"), repair: by("In Repair"), value };
  }, [assets]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-row">
          <Monogram />
          <div>
            <div className="brand-name">KSB Assets</div>
            <div className="brand-sub">ICT Asset Management</div>
          </div>
        </div>

        <div className="nav-label">OVERVIEW</div>
        {["All", ...meta.states].map((s) => (
          <button key={s} className={"nav-item" + (filter === s ? " active" : "")} onClick={() => setFilter(s)}>
            <span>{s}</span>
            <span className="nav-count">{s === "All" ? assets.length : assets.filter((a) => a.status === s).length}</span>
          </button>
        ))}

        <div className="side-foot">
          <div className="who">
            {session.user.username}
            <span className="role-pill">{session.user.role}</span>
          </div>
          <button className="logout" onClick={onLogout}>Sign out</button>
        </div>
      </aside>

      <main className="main">
        <div className="head">
          <div>
            <div className="h1">Asset Register</div>
            <div className="sub">More Sugar For Prosperity</div>
          </div>
          <button className="add-btn" disabled={!isAdmin} onClick={() => setShowAdd(true)}
            title={isAdmin ? "" : "Viewers cannot add assets"}>
            + Register Asset
          </button>
        </div>

        {error && <div className="err">{error}</div>}

        <div className="stats">
          <Stat lab="Total Assets" val={stats.total} c="#2f8f3e" />
          <Stat lab="Assigned" val={stats.assigned} c={STATE_COLOR.Assigned} />
          <Stat lab="In Repair" val={stats.repair} c={STATE_COLOR["In Repair"]} />
          <Stat lab="Book Value (active)" val={ksh(stats.value)} c="#5fbf6e" small />
        </div>

        <input className="search" placeholder="Search by name, ID, holder, department\u2026"
          value={query} onChange={(e) => setQuery(e.target.value)} />

        <div className="table-wrap">
          <table>
            <thead>
              <tr>{["ID", "Asset", "Category", "Status", "Holder / Location", "Book Value", ""].map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id}>
                  <td className="mono" style={{ color: "#1f5e2a" }}>{a.id}</td>
                  <td style={{ fontWeight: 600 }}>{a.name}</td>
                  <td>{a.category}</td>
                  <td><Badge status={a.status} /></td>
                  <td>{a.assignedTo || <span style={{ color: "#bbb" }}>&mdash;</span>}<div className="dept">{a.dept}</div></td>
                  <td>{a.status === "Retired" ? <span style={{ color: "#bbb" }}>&mdash;</span> : ksh(a.bookValue)}</td>
                  <td><button className="manage" onClick={() => setSelected(a.id)}>Manage</button></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", color: "#999", padding: 40 }}>No assets match.</td></tr>}
            </tbody>
          </table>
        </div>
      </main>

      {selected && (
        <Drawer id={selected} isAdmin={isAdmin} meta={meta}
          onClose={() => setSelected(null)}
          onChanged={() => { load(); }} />
      )}
      {showAdd && (
        <AddModal meta={meta}
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); load(); }} />
      )}
    </div>
  );
}

function Stat({ lab, val, c, small }) {
  return (
    <div className="stat">
      <div className="bar" style={{ background: c }} />
      <div className="lab">{lab}</div>
      <div className="val" style={{ fontSize: small ? 19 : 28 }}>{val}</div>
    </div>
  );
}

function Badge({ status }) {
  const c = STATE_COLOR[status];
  return <span className="badge" style={{ background: c + "18", color: c, border: `1px solid ${c}44` }}>{status}</span>;
}

function Drawer({ id, isAdmin, meta, onClose, onChanged }) {
  const [asset, setAsset] = useState(null);
  const [who, setWho] = useState("");
  const [newHolder, setNewHolder] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setAsset(await api.call("/assets/" + id)); } catch (e) { setErr(e.message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!asset) return null;
  const opts = meta.transitions[asset.status] || [];

  async function transition(to) {
    setErr("");
    try {
      await api.call(`/assets/${id}/transition`, { method: "POST", body: JSON.stringify({ to, assignedTo: who }) });
      setWho("");
      await load(); onChanged();
    } catch (e) { setErr(e.message); }
  }

  async function reassign() {
    setErr(""); setBusy(true);
    try {
      await api.call(`/assets/${id}/reassign`, { method: "POST", body: JSON.stringify({ assignedTo: newHolder }) });
      setNewHolder("");
      await load(); onChanged();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function deleteAsset() {
    if (!window.confirm(`Delete ${asset.name} (${asset.id}) permanently? This cannot be undone.`)) return;
    try {
      await api.call(`/assets/${id}`, { method: "DELETE" });
      onChanged(); onClose();
    } catch (e) { setErr(e.message); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>&times;</button>
        <div className="mono" style={{ color: "#1f5e2a", fontSize: 13 }}>{asset.id}</div>
        <div className="drawer-title">{asset.name}</div>
        <Badge status={asset.status} />

        <div className="kv">
          <KV k="Category" v={asset.category} />
          <KV k="Department" v={asset.dept || "\u2014"} />
          <KV k="Holder / Location" v={asset.assignedTo || "\u2014"} />
          <KV k="Purchase Price" v={ksh(asset.price)} />
          <KV k="Purchased" v={asset.date || "\u2014"} />
          <KV k="Useful Life" v={asset.usefulLife + " yrs"} />
          <KV k="Current Book Value" v={asset.status === "Retired" ? "\u2014" : ksh(asset.bookValue)} />
        </div>

        {err && <div className="err">{err}</div>}

        {!isAdmin ? (
          <div className="readonly-note">You are signed in as a viewer. Status changes require an admin account.</div>
        ) : (
          <>
            {asset.status === "Assigned" && (
              <div className="action-box">
                <div className="nav-label" style={{ margin: "0 0 8px" }}>REASSIGN</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="search" style={{ flex: 1, marginBottom: 0 }} placeholder="New holder / location"
                    value={newHolder} onChange={(e) => setNewHolder(e.target.value)} />
                  <button className="trans-btn"
                    style={{ borderColor: STATE_COLOR.Assigned, color: STATE_COLOR.Assigned }}
                    disabled={!newHolder.trim() || busy}
                    onClick={reassign}>
                    Reassign
                  </button>
                </div>
              </div>
            )}

            {opts.length > 0 ? (
              <div className="action-box">
                <div className="nav-label" style={{ margin: "0 0 8px" }}>CHANGE STATUS</div>
                {opts.includes("Assigned") && (
                  <input className="search" style={{ marginBottom: 8 }} placeholder="Assign to (name / location)"
                    value={who} onChange={(e) => setWho(e.target.value)} />
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {opts.map((s) => (
                    <button key={s} className="trans-btn"
                      style={{ borderColor: STATE_COLOR[s], color: STATE_COLOR[s] }}
                      disabled={s === "Assigned" && !who.trim()}
                      onClick={() => transition(s)}>
                      &rarr; {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="readonly-note">This asset is retired. No further transitions are allowed.</div>
            )}

            <button onClick={deleteAsset}
              style={{ marginTop: 16, width: "100%", padding: "8px 0", background: "#fff", border: "1px solid #e53e3e", color: "#e53e3e", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
              Delete Asset
            </button>
          </>
        )}

        <div className="nav-label">AUDIT TRAIL</div>
        <div className="timeline">
          {asset.history?.map((h, i) => (
            <div className="hist" key={i}>
              <div className="dot" />
              <div>
                <div className="d1">{h.detail}</div>
                <div className="d2">{h.action} &middot; {h.username || "system"} &middot; {h.at}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KV({ k, v }) {
  return <div className="kv-row"><span>{k}</span><span>{v}</span></div>;
}

function AddModal({ meta, onClose, onAdded }) {
  const [f, setF] = useState({ name: "", category: meta.categories[0] || "Laptop", price: "", date: "", dept: "", usefulLife: 4 });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const valid = f.name.trim() && f.price && f.date;

  async function submit() {
    setErr("");
    try { await api.call("/assets", { method: "POST", body: JSON.stringify(f) }); onAdded(); }
    catch (e) { setErr(e.message); }
  }

  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>&times;</button>
        <div className="drawer-title">Register New Asset</div>
        <label className="fld">Asset name *</label>
        <input className="txt" value={f.name} onChange={set("name")} />
        <label className="fld">Category</label>
        <select className="txt" value={f.category} onChange={set("category")}>
          {meta.categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="fld">Purchase price (KSh) *</label>
        <input className="txt" type="number" value={f.price} onChange={set("price")} />
        <label className="fld">Purchase date *</label>
        <input className="txt" type="date" value={f.date} onChange={set("date")} />
        <label className="fld">Department</label>
        <input className="txt" value={f.dept} onChange={set("dept")} />
        {err && <div className="err">{err}</div>}
        <button className="btn-primary" disabled={!valid} onClick={submit}>Register Asset</button>
        <div className="hint">New assets enter as &ldquo;In Stock&rdquo;.</div>
      </div>
    </div>
  );
}
