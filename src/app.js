import { createClient } from "@supabase/supabase-js";
import {
  filingStatuses,
  roles,
  normalizeCode,
  paymentState,
  balance,
  escapeHtml as h,
} from "./domain.js";
import { makeDemo } from "./demo.js";
import { defaultConfig } from "./public-config.js";
import "./style.css";
const app = document.querySelector("#app"),
  modal = document.querySelector("#modal");
const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  money:
    '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>',
  chart: '<path d="M3 3v18h18M7 14v3M12 9v8M17 5v12"/>',
  settings:
    '<path d="m9 3-1 3-3 1v4l3 1 1 3h4l1-3 3-1V7l-3-1-1-3Z"/><circle cx="11" cy="9" r="2"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.file}</svg>`;
let sb,
  session,
  demo = false,
  data,
  role,
  view = "dashboard",
  selected = null,
  tab = "Overview",
  search = "",
  filterYear = 2026,
  filterStatus = "",
  showArchive = false,
  page = 0,
  secretTimer,
  loadSequence = 0;
const money = (n) =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(Number(n || 0));
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const date = (s) =>
  s
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Karachi",
      }).format(new Date(s))
    : "—";
const staff = () => ["admin", "officer"].includes(role),
  bill = () => ["admin", "officer", "billing"].includes(role);
const paid = (y) =>
  data.payments
    .filter((p) => p.year_id === y.id && !p.voided)
    .reduce((s, p) => s + Number(p.amount), 0);
const client = (id) => data.clients.find((c) => c.id === id);
const badge = (s) =>
  `<span class="tag ${["Filed", "Paid", "Active"].includes(s) ? "green" : ["Due", "Unpaid", "Documents pending"].includes(s) ? "amber" : ["In progress", "Part paid"].includes(s) ? "blue" : s === "On hold" ? "wine" : "gray"}">${h(s)}</span>`;
const empty = (text) => `<div class="empty">${h(text)}</div>`;
const button = (label, action, extra = "", css = "") =>
  `<button class="${css}" data-action="${action}" ${extra}>${label}</button>`;
const selectOptions = (values, value) =>
  values
    .map(
      (s) =>
        `<option ${String(value) === String(s) ? "selected" : ""}>${h(s)}</option>`,
    )
    .join("");
function toast(text, error = false) {
  const el = document.querySelector("#toast");
  el.textContent = text;
  el.style.background = error ? "#8e2c45" : "#273d32";
  el.classList.add("visible");
  setTimeout(() => el.classList.remove("visible"), 5000);
}
function clearSecret() {
  clearTimeout(secretTimer);
  const el = document.querySelector("#revealed");
  if (el) el.innerHTML = "";
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearSecret();
});
window.addEventListener("pagehide", clearSecret);
function connect() {
  const cfg = JSON.parse(localStorage.getItem("brandex-tax-config") || "{}");
  const url = cfg.url || import.meta.env.VITE_SUPABASE_URL || defaultConfig.url,
    key =
      cfg.key ||
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      defaultConfig.key;
  if (!url || !key) return false;
  sb = createClient(url, key, {
    auth: {
      storage: sessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "brandex-tax-session",
    },
  });
  return true;
}
function authScreen(error = "") {
  app.innerHTML = `<div class="auth-page"><aside class="auth-art"><div class="brand">BRANDEX</div><div class="brand-sub">IP LAW · TAX SERVICES</div><h1>Every client.<br>Every tax year.<br>One clear record.</h1><p>A dedicated workspace for NTN records, return filing, service charges and client follow-ups.</p><p style="margin-top:60px;font-size:11px">PRIVATE STAFF WORKSPACE &nbsp; / &nbsp; CLIENT CODE FIRST</p></aside><main class="auth-form"><div class="eyebrow">TAX & NTN MANAGEMENT</div><h1>${sb ? "Welcome back" : "Connect your workspace"}</h1><p class="subtitle">${sb ? "Sign in with your authorized staff account." : "Enter your new Supabase project URL and publishable key. The installation guide includes the database setup."}</p><form id="auth">${sb ? '<label>Email address<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label>' : '<label>Supabase project URL<input name="url" type="url" placeholder="https://your-project.supabase.co" required></label><label>Publishable key<input name="key" placeholder="sb_publishable_… or legacy anon key" required></label>'}<div class="error">${h(error)}</div><button class="primary">${sb ? "Sign in" : "Connect workspace"}</button></form><div class="actions" style="margin-top:20px">${button("Explore sample workspace", "demo", "", "quiet")}${sb ? button("Change connection", "disconnect", "", "quiet") : ""}</div><p class="subtitle" style="font-size:11px;margin-top:25px">NTN PDFs and FBR credentials are available only to authorized tax staff. Sample mode contains fictional records.</p></main></div>`;
  if (sb)
    document
      .querySelector(".auth-form .actions")
      .insertAdjacentHTML(
        "afterbegin",
        button("Create staff account", "register", "", "quiet"),
      );
  document.querySelector("#auth").onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const submit = e.target.querySelector("button");
    submit.disabled = true;
    try {
      if (!sb) {
        const url = new URL(f.url);
        if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co"))
          throw Error("Use the HTTPS URL from your Supabase project settings.");
        if (!f.key.startsWith("sb_publishable_") && !f.key.startsWith("eyJ"))
          throw Error(
            "Use a publishable or legacy anon key. Never enter a secret/service-role key.",
          );
        if (f.key.startsWith("eyJ")) {
          const payload = JSON.parse(
            atob(f.key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
          );
          if (payload.role !== "anon")
            throw Error("Only the public anon key is allowed.");
        }
        localStorage.setItem("brandex-tax-config", JSON.stringify(f));
        connect();
        authScreen();
      } else {
        const { data: d, error } = await sb.auth.signInWithPassword(f);
        if (error) throw error;
        session = d.session;
        await load();
      }
    } catch (err) {
      authScreen(err.message);
    }
  };
}
async function rows(table) {
  let all = [];
  for (let from = 0; ; from += 1000) {
    const { data: part, error } = await sb
      .from(table)
      .select("*")
      .order(
        table === "tax_settings"
          ? "id"
          : table === "tax_labels"
            ? "name"
            : table === "tax_members"
              ? "user_id"
              : "id",
      )
      .range(from, from + 999);
    if (error) throw error;
    all.push(...part);
    if (part.length < 1000) break;
  }
  return all;
}
async function load() {
  const seq = ++loadSequence;
  clearSecret();
  if (demo) {
    render();
    return;
  }
  app.innerHTML = '<div class="spin">Loading your secure workspace…</div>';
  try {
    const { data: m, error } = await sb
      .from("tax_members")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error) throw error;
    role = m?.active ? m.role : null;
    if (!role) {
      app.innerHTML = `<div class="pending card"><div class="eyebrow">STAFF ACCESS</div><h1>Access is awaiting setup</h1><p class="subtitle">Your account is signed in, but has no active Tax/NTN role. An administrator must grant access.</p><p class="subtitle">Your user ID: <span class="monospace">${h(session.user.id)}</span></p><div class="actions" style="margin-top:24px">${button("Check access again", "reload", "", "primary")}${button("Activate owner access", "owner-setup")}${button("Sign out", "logout")}</div></div>`;
      return;
    }
    const tables = [
      "tax_clients",
      "tax_years",
      "tax_payments",
      "tax_notes",
      "tax_labels",
      "tax_settings",
    ];
    const results = await Promise.all(tables.map(rows));
    if (seq !== loadSequence) return;
    data = Object.fromEntries(
      ["clients", "years", "payments", "notes", "labels", "settings"].map(
        (key, i) => [key, key === "settings" ? results[i][0] : results[i]],
      ),
    );
    data.audit = [];
    data.documents = [];
    data.members = [];
    render();
  } catch (err) {
    app.innerHTML = `<div class="pending card"><h1>Workspace setup is incomplete</h1><p class="subtitle">${h(err.message)}</p><p class="subtitle">Apply the Tax/NTN migration to your new Supabase project, then grant your staff account a tax role.</p><div class="actions" style="margin-top:20px">${button("Retry", "reload", "", "primary")}${button("Sign out", "logout")}${button("Change connection", "disconnect")}</div></div>`;
  }
}
async function command(action, payload) {
  if (!demo) {
    const { data: result, error } = await sb.rpc("tax_command", {
      p_action: action,
      p_data: payload,
    });
    if (error) throw error;
    return result;
  }
  let result = {},
    cid = payload.client_id;
  const c = client(cid);
  switch (action) {
    case "client_create": {
      const code = normalizeCode(payload.code);
      if (data.clients.some((c) => c.code === code))
        throw Error("Client Code already exists");
      result = {
        ...payload,
        code,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        archived: false,
      };
      data.clients.push(result);
      cid = result.id;
      break;
    }
    case "client_update":
      Object.assign(c, payload);
      break;
    case "archive":
      c.archived = payload.archived;
      break;
    case "year_save": {
      let y = data.years.find(
        (y) => y.client_id === cid && y.tax_year === Number(payload.tax_year),
      );
      if (y && paid(y) > Number(payload.service_charge))
        throw Error("Charge cannot be below payments received");
      if (payload.filing_status === "Filed" && !payload.filed_at)
        throw Error("Filed date required");
      if (y) Object.assign(y, payload);
      else
        data.years.push({
          ...payload,
          id: crypto.randomUUID(),
          tax_year: Number(payload.tax_year),
        });
      break;
    }
    case "payment": {
      const y = data.years.find((y) => y.id === payload.year_id),
        c = client(y.client_id);
      if (Number(payload.amount) > balance(y.service_charge, paid(y)))
        throw Error("Payment exceeds outstanding balance");
      result = {
        ...payload,
        id: crypto.randomUUID(),
        receipt_no: data.payments.length + 1,
        voided: false,
        snapshot: {
          client_code: c.code,
          client_name: c.name,
          tax_year: y.tax_year,
          charge: y.service_charge,
          paid_before: paid(y),
          firm: { ...data.settings },
        },
      };
      data.payments.push(result);
      cid = c.id;
      break;
    }
    case "payment_void":
      data.payments.find((p) => p.id === payload.payment_id).voided = true;
      break;
    case "note":
      data.notes.push({
        ...payload,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        created_by: "demo-admin",
      });
      break;
    case "label":
      data.labels.push(payload);
      break;
    case "settings":
      Object.assign(data.settings, payload);
      break;
    case "member":
      throw Error("Staff changes require a connected Supabase workspace");
    default:
      throw Error(
        "Secure credentials and private documents require the installed Supabase backend",
      );
  }
  data.audit.unshift({
    id: Date.now(),
    client_id: cid,
    action,
    actor_id: "demo-admin",
    details: {},
    created_at: new Date().toISOString(),
  });
  return result;
}
function heading(
  title,
  sub,
  actions = "",
  eyebrow = "YOUR TAX WORKSPACE",
  rich = false,
) {
  return `<div class="heading"><div><div class="eyebrow">${eyebrow}</div>${rich ? title : `<h1>${title}</h1>`}<p class="subtitle">${sub}</p></div><div class="heading-actions">${actions}</div></div>`;
}
function metrics() {
  const active = data.clients.filter((c) => !c.archived),
    years = data.years.filter(
      (y) =>
        client(y.client_id) &&
        !client(y.client_id).archived &&
        y.tax_year === Number(filterYear),
    );
  const outstanding = years.reduce(
    (s, y) => s + balance(y.service_charge, paid(y)),
    0,
  );
  return `<div class="metrics">${[
    [active.length, "Total clients", "Permanent records", "users"],
    [
      years.filter((y) => y.filing_status === "Filed").length,
      "Returns filed",
      `Tax year ${filterYear}`,
      "file",
    ],
    [
      years.filter((y) => y.filing_status !== "Filed").length,
      "Pending returns",
      "Need a next action",
      "calendar",
    ],
    [
      money(outstanding),
      "Outstanding charges",
      `Tax year ${filterYear}`,
      "money",
    ],
  ]
    .map(
      ([value, label, note, i]) =>
        `<div class="metric"><div class="metric-top"><span>${label}</span><div class="metric-icon">${icon(i)}</div></div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></div>`,
    )
    .join("")}</div>`;
}
function yearSelector() {
  const years = [
    ...new Set([2026, 2025, 2024, ...data.years.map((y) => y.tax_year)]),
  ].sort((a, b) => b - a);
  return `<select id="year-filter" aria-label="Tax year">${selectOptions(years, filterYear)}</select>`;
}
function clientsTable() {
  const q = search.toLowerCase().replace(/[ -]/g, "");
  const list = data.clients
    .filter(
      (c) =>
        c.archived === showArchive &&
        [c.code, c.name, c.cnic, c.ntn].some((v) =>
          String(v).toLowerCase().replace(/[ -]/g, "").includes(q),
        ),
    )
    .filter(
      (c) =>
        !filterStatus ||
        data.years.some(
          (y) =>
            y.client_id === c.id &&
            y.tax_year === Number(filterYear) &&
            y.filing_status === filterStatus,
        ),
    );
  const start = page * 15,
    chunk = list.slice(start, start + 15);
  return `<div class="card"><div class="card-head"><div><h2>${showArchive ? "Archived clients" : "Client records"}</h2><p>Client Code stays permanent. Each tax year has its own workflow.</p></div>${button(showArchive ? "Active clients" : "View archive", "archive-filter", "", "quiet")}</div><div class="toolbar"><div class="search">${icon("search")}<input id="search" value="${h(search)}" placeholder="Search Client Code, name, CNIC or NTN" aria-label="Search clients"></div>${yearSelector()}<select id="status-filter" aria-label="Filing status"><option value="">All filing statuses</option>${selectOptions(filingStatuses, filterStatus)}</select></div>${
    chunk.length
      ? `<div class="table-scroll"><table><thead><tr><th>Client Code</th><th>Client</th><th>Tax year</th><th>Filing status</th><th>Payment</th><th>Outstanding</th><th></th></tr></thead><tbody>${chunk
          .map((c) => {
            const y = data.years.find(
              (y) => y.client_id === c.id && y.tax_year === Number(filterYear),
            );
            return `<tr><td><span class="code">${h(c.code)}</span></td><td><span class="client-name">${h(c.name)}</span><span class="secondary">${c.labels.map(h).join(" · ") || h(c.client_type)}</span></td><td>${filterYear}</td><td>${y ? badge(y.filing_status) : badge("Not started")}</td><td>${y ? badge(paymentState(y.service_charge, paid(y))) : "—"}</td><td>${y ? money(balance(y.service_charge, paid(y))) : "—"}</td><td>${button("Open →", "client", `data-id="${h(c.id)}"`, "quiet")}</td></tr>`;
          })
          .join("")}</tbody></table></div>`
      : empty(
          search
            ? "No matching clients."
            : "No client records yet. Add a client to begin.",
        )
  }<div class="table-foot"><span>${list.length ? `${start + 1}–${Math.min(start + 15, list.length)} of ${list.length}` : "0"} clients</span><div>${button("←", "prev", page === 0 ? "disabled" : "", "quiet")}${button("→", "next", start + 15 >= list.length ? "disabled" : "", "quiet")}</div></div></div>`;
}
function dashboard() {
  const ys = data.years.filter(
    (y) => y.tax_year === Number(filterYear) && !client(y.client_id)?.archived,
  );
  return (
    heading(
      "A clear view of every tax year.",
      "Manage your clients, track returns, and keep service charges in order.",
      staff() ? button("+ Add client", "client-add", "", "primary") : "",
    ) +
    metrics() +
    clientsTable() +
    `<div class="two-col"><div class="card"><div class="card-head"><h2>Filing progress · ${filterYear}</h2></div><div class="pad">${filingStatuses
      .map((s) => {
        const n = ys.filter((y) => y.filing_status === s).length;
        return `<div class="bar-row"><span>${h(s)}</span><div class="bar"><i style="width:${ys.length ? (n / ys.length) * 100 : 0}%"></i></div><span>${n}</span></div>`;
      })
      .join(
        "",
      )}</div></div><div class="card"><div class="card-head"><h2>Next actions</h2>${button("View workflow →", "nav", `data-view="years"`, "quiet")}</div><div class="pad">${
      ys
        .filter((y) => y.filing_status !== "Filed")
        .slice(0, 4)
        .map(
          (y) =>
            `<div class="activity"><span class="activity-dot"></span><div><p><strong>${h(client(y.client_id)?.code)}</strong> · ${h(y.filing_status)}</p><small>${h(client(y.client_id)?.name)} · ${y.due_date ? "Due " + date(y.due_date) : "Set a due date"}</small></div>${button("Open", "client", `data-id="${y.client_id}"`, "quiet")}</div>`,
        )
        .join("") || empty("No pending returns for this year.")
    }</div></div></div>`
  );
}
function workflow() {
  const ys = data.years.filter(
    (y) =>
      y.tax_year === Number(filterYear) &&
      !client(y.client_id)?.archived &&
      (!filterStatus || y.filing_status === filterStatus),
  );
  return (
    heading(
      "Tax-year workflow",
      "Track return filing independently from charges and payment collection.",
    ) +
    metrics() +
    `<div class="card"><div class="toolbar">${yearSelector()}<select id="status-filter" aria-label="Filing status"><option value="">All filing statuses</option>${selectOptions(filingStatuses, filterStatus)}</select></div>${yearTable(ys)}</div>`
  );
}
function yearTable(ys, includeClient = true) {
  return ys.length
    ? `<div class="table-scroll"><table><thead><tr>${includeClient ? "<th>Client</th>" : ""}<th>Tax year</th><th>Filing</th><th>Due / filed date</th><th>Charge</th><th>Received</th><th>Payment</th><th>Actions</th></tr></thead><tbody>${ys.map((y) => `<tr>${includeClient ? `<td><span class="code">${h(client(y.client_id)?.code)}</span><span class="secondary">${h(client(y.client_id)?.name)}</span></td>` : ""}<td>${y.tax_year}</td><td>${badge(y.filing_status)}</td><td>${date(y.filing_status === "Filed" ? y.filed_at : y.due_date)}</td><td>${money(y.service_charge)}</td><td>${money(paid(y))}</td><td>${badge(paymentState(y.service_charge, paid(y)))}</td><td><div class="actions">${staff() ? button("Edit", "year-edit", `data-id="${y.id}"`, "quiet") : ""}${bill() && balance(y.service_charge, paid(y)) > 0 ? button("Receive", "payment-add", `data-id="${y.id}"`, "quiet") : ""}${button("Acknowledgement", "ack", `data-id="${y.id}"`, "quiet")}${includeClient ? button("Open →", "client", `data-id="${y.client_id}"`, "quiet") : ""}</div></td></tr>`).join("")}</tbody></table></div>`
    : empty("No tax-year records. Open a client and add a year.");
}
function paymentsView() {
  const ys = data.years.filter(
    (y) => y.tax_year === Number(filterYear) && !client(y.client_id)?.archived,
  );
  return (
    heading(
      "Charges & payments",
      "Record receipts against a specific tax year. Filing status stays independent.",
    ) +
    `<div class="card"><div class="card-head"><h2>Service charges</h2>${yearSelector()}</div>${yearTable(ys)}</div><div class="card"><div class="card-head"><h2>Payment history</h2></div>${paymentsTable(data.payments.filter((p) => ys.some((y) => y.id === p.year_id)))}</div>`
  );
}
function paymentsTable(ps) {
  return ps.length
    ? `<div class="table-scroll"><table><thead><tr><th>Receipt</th><th>Client / year</th><th>Date</th><th>Amount</th><th>Method</th><th>Status</th><th></th></tr></thead><tbody>${[
        ...ps,
      ]
        .sort((a, b) => Number(b.receipt_no) - Number(a.receipt_no))
        .map(
          (p) =>
            `<tr><td class="code">TX-${String(p.receipt_no).padStart(6, "0")}</td><td>${h(p.snapshot.client_code)} · ${p.snapshot.tax_year}</td><td>${date(p.paid_on)}</td><td>${money(p.amount)}</td><td>${h(p.method)}</td><td>${badge(p.voided ? "Void" : "Received")}</td><td>${button("Receipt", "receipt", `data-id="${p.id}"`, "quiet")}${role === "admin" && !p.voided ? button("Void", "payment-void", `data-id="${p.id}"`, "quiet danger") : ""}</td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : empty("No payments recorded.");
}
function details() {
  const c = client(selected);
  if (!c) {
    selected = null;
    view = "clients";
    return clientsTable();
  }
  const tabs = [
    "Overview",
    "Tax years",
    "Charges & payments",
    "Notes",
    ...(staff() ? ["Credentials", "Documents", "Activity"] : []),
  ];
  const ys = data.years
    .filter((y) => y.client_id === c.id)
    .sort((a, b) => b.tax_year - a.tax_year);
  let body = "";
  if (tab === "Overview") {
    const fields = [
      ["Client Code", c.code],
      ["Client type", c.client_type],
      ["FBR status", c.fbr_status],
      ["CNIC", c.cnic || "—"],
      ["NTN", c.ntn || "—"],
      ["Mobile", c.mobile || "—"],
      ["Email", c.email || "—"],
      ["Created", date(c.created_at)],
      ["Labels", c.labels.join(", ") || "—"],
    ];
    body = `<div class="card pad"><div class="subheading"><h2>Permanent client record</h2>${staff() && !c.archived ? button("Edit record", "client-edit", "", "quiet") : ""}</div><div class="detail-grid">${fields.map(([k, v]) => `<div class="datum"><span>${k}</span>${h(v)}</div>`).join("")}</div><div class="datum" style="margin-top:28px"><span>Google Drive folder</span>${driveLink(c.drive_url)}</div><div class="datum" style="margin-top:28px"><span>General notes</span><div style="white-space:pre-wrap">${h(c.general_notes) || "—"}</div></div></div><div class="card"><div class="card-head"><h2>Tax-year overview</h2>${staff() && !c.archived ? button("+ Add year", "year-add", "", "quiet") : ""}</div>${yearTable(ys, false)}</div>`;
  } else if (tab === "Tax years")
    body = `<div class="card"><div class="card-head"><h2>Tax returns</h2>${staff() && !c.archived ? button("+ Add tax year", "year-add", "", "primary") : ""}</div>${yearTable(ys, false)}</div>`;
  else if (tab === "Charges & payments")
    body = `<div class="card"><div class="card-head"><h2>Charges by year</h2></div>${yearTable(ys, false)}</div><div class="card"><div class="card-head"><h2>Receipts</h2></div>${paymentsTable(data.payments.filter((p) => ys.some((y) => y.id === p.year_id)))}</div>`;
  else if (tab === "Notes")
    body = `<div class="card pad"><div class="subheading"><h2>Internal notes</h2>${staff() && !c.archived ? button("+ Add note", "note-add", "", "primary") : ""}</div>${
      data.notes
        .filter((n) => n.client_id === c.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(
          (n) =>
            `<div class="note"><p>${h(n.body)}</p><small>${date(n.created_at)} · ${h(n.created_by?.slice(0, 8) || "Staff")}</small></div>`,
        )
        .join("") || empty("No notes yet.")
    }</div>`;
  else if (tab === "Credentials")
    body = `<div class="notice">FBR credentials are stored in encrypted Supabase Vault secrets. Every reveal and copy requires a purpose and is audited. Revealed values clear after 30 seconds or when you leave this tab.</div><div class="card pad"><div class="subheading"><h2>FBR / IRIS credentials</h2>${!c.archived ? button("Update credentials", "credential-edit", "", "primary") : ""}</div><div id="credential-meta" class="subtitle">Loading credential metadata…</div><div class="credential-box" style="margin-top:20px"><span>IRIS password & PIN &nbsp; ••••••••</span>${!c.archived ? button("Reveal", "credential-reveal") : ""}</div><div id="revealed" style="margin-top:16px"></div></div>`;
  else if (tab === "Documents")
    body = `<div class="notice">Internal storage and retrieval only. These files are excluded from client listings, reports and receipts. Download links expire after 60 seconds. Download a copy to send through your usual client channel.</div><div class="card pad"><div id="documents" class="two-col">Loading private document records…</div></div>`;
  else if (tab === "Activity")
    body = `<div class="card pad"><h2>Activity history</h2><div id="activity">Loading activity…</div></div>`;
  return (
    heading(
      `<div class="profile"><div class="avatar">${h(c.name.slice(0, 2))}</div><div><span class="code">${h(c.code)}</span><h1 style="font-size:25px;margin-top:4px">${h(c.name)}</h1></div></div>`,
      `${c.archived ? "Archived client" : "Permanent client record"} · ${ys.length} tax-year records`,
      `${button("← Clients", "nav", 'data-view="clients"')}${staff() ? button(c.archived ? "Restore client" : "Archive", "archive", `data-id="${c.id}"`) : ""}`,
      "CLIENT DETAIL",
      true,
    ) +
    `<div class="tabs">${tabs.map((t) => button(h(t), "tab", `data-tab="${t}"`, tab === t ? "active" : "")).join("")}</div>` +
    body
  );
}
function driveLink(value) {
  if (!value) return "No folder linked";
  let url = value;
  if (/^[A-Za-z0-9_-]{10,}$/.test(value))
    url = "https://drive.google.com/drive/folders/" + value;
  try {
    const u = new URL(url);
    if (
      u.protocol === "https:" &&
      u.hostname === "drive.google.com" &&
      u.pathname.startsWith("/drive/")
    )
      return `<a href="${h(u.href)}" target="_blank" rel="noopener noreferrer">Open linked Drive folder ↗</a>`;
  } catch {}
  return h(value);
}
function reports() {
  const ys = data.years.filter(
    (y) => y.tax_year === Number(filterYear) && !client(y.client_id)?.archived,
  );
  return (
    heading(
      "Reports & follow-ups",
      "A tax-year summary of filing progress, service charges and balances.",
      button("Export CSV", "export", "", "primary"),
    ) +
    metrics() +
    `<div class="card"><div class="card-head"><h2>Tax-year report</h2>${yearSelector()}</div>${yearTable(ys)}</div><div class="notice">CSV reports include Client Code, name, year, filing status, charge, received and outstanding. Credentials, CNIC, NTN and private documents are excluded.</div>`
  );
}
function settings() {
  if (role !== "admin")
    return (
      heading(
        "Workspace settings",
        "Your administrator manages staff roles, labels and receipt branding.",
      ) +
      `<div class="card pad"><h2>Role: ${h(role)}</h2><p class="subtitle">${staff() ? "Tax officers can manage clients, filings, credentials and documents." : role === "billing" ? "Billing staff can record payments and print receipts." : "Viewers can read client records and reports."}</p></div>`
    );
  return (
    heading(
      "Workspace settings",
      "Manage staff access, reusable labels and receipt details.",
    ) +
    `<div class="two-col"><div class="card pad"><div class="subheading"><h2>Receipt branding</h2>${button("Edit", "settings-edit", "", "quiet")}</div><p class="subtitle"><strong>${h(data.settings.firm_name)}</strong><br>${h(data.settings.address) || "Set your firm address"}<br>${h(data.settings.phone) || "Set your phone number"}<br>Currency: PKR</p></div><div class="card pad"><div class="subheading"><h2>Client labels</h2>${button("+ Add label", "label-add", "", "quiet")}</div>${data.labels.map((l) => `<span class="tag" style="border-left:3px solid ${/^#[0-9a-f]{6}$/i.test(l.color) ? l.color : "#76283c"}">${h(l.name)}</span>`).join("")}</div></div><div class="card"><div class="card-head"><div><h2>Staff roles</h2><p>Existing Supabase Auth accounts only. No self-registration or automatic access.</p></div>${button("+ Grant / update access", "member-add", "", "primary")}</div><div id="members" class="pad">Loading members…</div></div><div class="notice">Admin: all tax functions and access management. Officer: clients, filing, payments, credentials and documents. Billing: client records, payments and receipts. Viewer: read-only client records and reports. Trademark roles are separate.</div>`
  );
}
function receipt(p, year) {
  const ack = !p,
    c = year ? client(year.client_id) : null,
    s = ack
      ? {
          client_code: c.code,
          client_name: c.name,
          tax_year: year.tax_year,
          charge: year.service_charge,
          firm: data.settings,
        }
      : p.snapshot,
    firm = s.firm || data.settings;
  return `<div class="no-print">${heading(ack ? "Service acknowledgement" : "Payment receipt", "Print or save as PDF. Only receipt fields are included.", button("Print / Save PDF", "print", "", "primary") + button("Back", "back"))}</div><article class="receipt"><div class="brand">${h(firm.firm_name)}</div><p class="subtitle">${h(firm.address)}${firm.phone ? "<br>" + h(firm.phone) : ""}</p><div class="rule"></div><div class="eyebrow">TAX SERVICES</div><h1>${ack ? "Service charge acknowledgement" : "Payment receipt"}${p?.voided ? " · VOID" : ""}</h1><p class="subtitle">${ack ? "Service charge record; this is not proof of payment." : `Receipt TX-${String(p.receipt_no).padStart(6, "0")}`}</p>${[
    ["Client Code", s.client_code],
    ["Client name", s.client_name],
    ["Tax year", s.tax_year],
    ["Service", "NTN / Income tax return services"],
    ["Service charge", money(s.charge)],
    ...(ack
      ? [
          ["Filing status", year.filing_status],
          ["Received to date", money(paid(year))],
          ["Outstanding", money(balance(year.service_charge, paid(year)))],
        ]
      : [
          ["Payment date", date(p.paid_on)],
          ["Payment method", p.method],
          ["Reference", p.reference || "—"],
          ["Received before this receipt", money(s.paid_before)],
        ]),
  ]
    .map(
      ([k, v]) =>
        `<div class="receipt-row"><span>${k}</span><strong>${h(v)}</strong></div>`,
    )
    .join(
      "",
    )}<div class="receipt-total"><span>${ack ? "Amount charged" : "Amount received"}</span><span>${money(ack ? s.charge : p.amount)}</span></div>${p?.voided ? `<p class="error">Voided payment: ${h(p.void_reason || "Cancelled by administrator")}</p>` : ""}<p class="subtitle" style="margin-top:35px">${ack ? "Payment collection is tracked separately from return filing." : "This receipt acknowledges payment for professional services. Filing status is recorded separately."}</p><div class="receipt-row" style="margin-top:55px;border:0"><span>Authorized signature: __________________</span><span>Client signature: __________________</span></div></article>`;
}
let printPayment, printYear;
function render() {
  clearSecret();
  const nav = [
    ["dashboard", "Dashboard", "grid"],
    ["clients", "Clients", "users"],
    ["years", "Tax years", "calendar"],
    ["payments", "Charges & payments", "money"],
    ["reports", "Reports", "chart"],
    ["settings", "Settings", "settings"],
  ];
  const title = selected
    ? "Client detail"
    : nav.find((n) => n[0] === view)?.[1] || "Receipt";
  let body = selected
    ? details()
    : view === "dashboard"
      ? dashboard()
      : view === "clients"
        ? heading(
            "Client records",
            "One permanent record for every client. Client Code is the starting point.",
            staff() ? button("+ Add client", "client-add", "", "primary") : "",
          ) + clientsTable()
        : view === "years"
          ? workflow()
          : view === "payments"
            ? paymentsView()
            : view === "reports"
              ? reports()
              : view === "settings"
                ? settings()
                : receipt(printPayment, printYear);
  app.innerHTML = `<div class="shell"><aside class="sidebar"><div class="brand">BRANDEX</div><div class="brand-sub">TAX & NTN MANAGER</div><div class="section-label">WORKSPACE</div><nav class="nav">${nav.map(([id, label, i]) => button(icon(i) + label, "nav", `data-view="${id}"`, view === id ? "active" : "")).join("")}</nav><div class="sidebar-bottom"><strong>${demo ? "Sample workspace" : "Private staff workspace"}</strong>${h(role)} access · Asia/Karachi<br><span style="display:block;margin-top:12px">Client Code first. Every year connected.</span></div></aside><main class="main"><header class="topbar"><div class="actions">${button("☰", "menu", "", "mobile-menu")}<div class="breadcrumb">Workspace <strong>/ &nbsp; ${h(title)}</strong></div></div><div class="user"><span class="user-email">${h(demo ? "Demo Administrator" : session?.user.email)}</span><span class="avatar">${h(role?.slice(0, 2).toUpperCase())}</span>${button(demo ? "Exit demo" : "Sign out", "logout", "", "quiet")}</div></header>${demo ? '<div class="demo-banner">SAMPLE WORKSPACE · Fictional records. Changes last only for this preview. Credentials and document operations require Supabase.</div>' : ""}<div class="content">${body}</div></main></div>`;
  const q = document.querySelector("#search");
  if (q)
    q.addEventListener("input", () => {
      search = q.value;
      page = 0;
      const pos = q.selectionStart;
      render();
      const next = document.querySelector("#search");
      next.focus();
      next.setSelectionRange(pos, pos);
    });
  document.querySelector("#year-filter")?.addEventListener("change", (e) => {
    filterYear = Number(e.target.value);
    page = 0;
    render();
  });
  document.querySelector("#status-filter")?.addEventListener("change", (e) => {
    filterStatus = e.target.value;
    page = 0;
    render();
  });
  if (selected && ["Credentials", "Documents", "Activity"].includes(tab))
    void loadTab();
  if (view === "settings" && role === "admin") void loadMembers();
}
async function loadTab() {
  const current = selected,
    which = tab;
  try {
    if (which === "Credentials") {
      let meta = demo
        ? { exists: false }
        : await command("credential_meta", { client_id: current });
      if (selected !== current || tab !== which) return;
      document.querySelector("#credential-meta").innerHTML = meta.exists
        ? `Saved securely · updated ${date(meta.updated_at)} · last verified ${date(meta.verified_at)}<br>Registered mobile: ${h(meta.registered_mobile) || "—"} · email: ${h(meta.registered_email) || "—"}`
        : "No credentials saved yet.";
    } else if (which === "Documents") {
      let docs = [];
      if (!demo) {
        const { data: ds, error } = await sb
          .from("tax_documents")
          .select("id,kind,original_name,size_bytes,created_at")
          .eq("client_id", current)
          .order("created_at", { ascending: false });
        if (error) throw error;
        docs = ds;
      }
      if (selected !== current || tab !== which) return;
      data.documents = docs;
      document.querySelector("#documents").innerHTML = ["ntn", "certificate"]
        .map(
          (kind) =>
            `<div class="doc-card"><div class="doc-icon">${icon("file")}</div><h2>${kind === "ntn" ? "NTN document" : "NTN Certificate"}</h2><p>PDF only · up to 10 MB<br>Private, internal retrieval.</p>${!client(current).archived ? button("+ Upload PDF", "document-upload", `data-kind="${kind}"`) : ""}${
              docs
                .filter((d) => d.kind === kind)
                .map(
                  (d) =>
                    `<div class="note"><p>${h(d.original_name)}</p><small>${date(d.created_at)} · ${Math.round(d.size_bytes / 1024)} KB</small><div style="margin-top:10px">${button("Download to send", "document-download", `data-id="${d.id}"`, "quiet")}</div></div>`,
                )
                .join("") || "<p>No file stored.</p>"
            }</div>`,
        )
        .join("");
    } else {
      let audit = demo
        ? data.audit.filter((a) => a.client_id === current)
        : null;
      if (!demo) {
        const { data: as, error } = await sb
          .from("tax_audit")
          .select("*")
          .eq("client_id", current)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        audit = as;
      }
      if (selected !== current || tab !== which) return;
      document.querySelector("#activity").innerHTML =
        audit
          .map(
            (a) =>
              `<div class="activity"><span class="activity-dot"></span><div><p>${h(a.action.replaceAll("_", " "))}</p><small>${date(a.created_at)} · staff ${h(a.actor_id?.slice(0, 8) || "System")}${a.details?.reason ? " · " + h(a.details.reason) : ""}</small></div></div>`,
          )
          .join("") || empty("No activity yet.");
    }
  } catch (err) {
    toast(err.message, true);
  }
}
async function loadMembers() {
  try {
    const members = demo ? data.members : await rows("tax_members");
    if (view !== "settings") return;
    document.querySelector("#members").innerHTML = members.length
      ? `<table><thead><tr><th>User ID</th><th>Role</th><th>Access</th></tr></thead><tbody>${members.map((m) => `<tr><td class="monospace">${h(m.user_id)}</td><td>${h(m.role)}</td><td>${badge(m.active ? "Active" : "Inactive")}</td></tr>`).join("")}</tbody></table>`
      : empty("No tax staff members.");
  } catch (err) {
    toast(err.message, true);
  }
}
function field(label, name, value = "", type = "text", attrs = "") {
  return `<label>${label}<input name="${name}" type="${type}" value="${h(value)}" ${attrs}></label>`;
}
function pick(label, name, values, value) {
  return `<label>${label}<select name="${name}">${selectOptions(values, value)}</select></label>`;
}
function area(label, name, value = "", attrs = "") {
  return `<label class="full">${label}<textarea name="${name}" ${attrs}>${h(value)}</textarea></label>`;
}
function openForm(title, fields, onSave, submit = "Save") {
  clearSecret();
  modal.innerHTML = `<h2>${title}</h2><form><div class="form-grid">${fields}</div><div class="error" id="form-error" style="margin-top:14px"></div><div class="actions">${button("Cancel", "modal-close")}<button class="primary" type="submit">${submit}</button></div></form>`;
  modal.querySelector('[data-action="modal-close"]').type = "button";
  modal.showModal();
  modal.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await onSave(Object.fromEntries(new FormData(e.target)));
      modal.close();
      modal.innerHTML = "";
      toast("Saved successfully");
      if (view !== "receipt") await load();
    } catch (err) {
      modal.querySelector("#form-error").textContent = err.message;
      btn.disabled = false;
    }
  };
}
function clientForm(c) {
  openForm(
    c ? "Edit client record" : "Add permanent client record",
    field(
      "Client Code",
      "code",
      c?.code || "",
      "text",
      c ? "readonly" : 'required placeholder="X-881"',
    ) +
      field(
        "Client name",
        "name",
        c?.name || "",
        "text",
        'required maxlength="200"',
      ) +
      field("CNIC", "cnic", c?.cnic || "") +
      field("NTN", "ntn", c?.ntn || "") +
      field("Mobile", "mobile", c?.mobile || "") +
      field("Email", "email", c?.email || "", "email") +
      pick(
        "Client type",
        "client_type",
        ["Individual", "AOP", "Company"],
        c?.client_type || "Individual",
      ) +
      pick(
        "FBR status",
        "fbr_status",
        ["Active", "Inactive", "Unknown"],
        c?.fbr_status || "Unknown",
      ) +
      `<div class="full">${field("Drive folder URL or folder ID", "drive_url", c?.drive_url || "", "text", 'placeholder="https://drive.google.com/drive/folders/…"')}</div>` +
      field(
        "Labels · comma separated",
        "labels",
        c?.labels.join(", ") || "",
        "text",
        'list="label-options"',
      ) +
      `<datalist id="label-options">${data.labels.map((l) => `<option value="${h(l.name)}">`).join("")}</datalist>` +
      area("General notes", "general_notes", c?.general_notes || ""),
    async (f) => {
      f.code = normalizeCode(f.code);
      f.labels = [
        ...new Set(
          f.labels
            .split(",")
            .map((l) => l.trim())
            .filter(Boolean),
        ),
      ];
      const r = await command(c ? "client_update" : "client_create", {
        ...f,
        ...(c ? { client_id: c.id } : {}),
      });
      if (!c) {
        selected = r.id;
        tab = "Overview";
        view = "clients";
      }
    },
  );
}
function yearForm(y) {
  const cid = y?.client_id || selected;
  openForm(
    y ? "Update tax year" : "Add tax year",
    field(
      "Tax year",
      "tax_year",
      y?.tax_year || filterYear,
      "number",
      `required min="2000" max="2100" ${y ? "readonly" : ""}`,
    ) +
      pick(
        "Filing status",
        "filing_status",
        filingStatuses,
        y?.filing_status || "Due",
      ) +
      field("Due date", "due_date", y?.due_date || "", "date") +
      field(
        "Filed date · required for Filed",
        "filed_at",
        y?.filed_at || "",
        "date",
      ) +
      field("Filing reference", "filing_reference", y?.filing_reference || "") +
      field(
        "Service charge (PKR)",
        "service_charge",
        y?.service_charge || 0,
        "number",
        'required min="0" step="0.01"',
      ) +
      area("Tax-year notes", "notes", y?.notes || ""),
    async (f) => {
      f.tax_year = Number(f.tax_year);
      if (
        !y &&
        data.years.some(
          (yr) => yr.client_id === cid && yr.tax_year === f.tax_year,
        )
      )
        throw Error("This tax year already exists; edit the existing record.");
      if (f.filing_status === "Filed" && !f.filed_at)
        throw Error("Add a filed date before marking Filed.");
      await command("year_save", { ...f, client_id: cid });
    },
  );
}
function paymentForm(y) {
  const idempotency = crypto.randomUUID();
  openForm(
    `Receive payment · ${h(client(y.client_id).code)} / ${y.tax_year}`,
    `<div class="notice full">Charge ${money(y.service_charge)} · received ${money(paid(y))} · outstanding ${money(balance(y.service_charge, paid(y)))}</div>` +
      field(
        "Amount received (PKR)",
        "amount",
        "",
        "number",
        `required min="0.01" step="0.01" max="${balance(y.service_charge, paid(y))}"`,
      ) +
      field("Payment date", "paid_on", today(), "date", "required") +
      pick("Method", "method", ["Cash", "Bank", "Online", "Cheque"], "Cash") +
      field("Transaction reference", "reference"),
    async (f) => {
      await command("payment", {
        ...f,
        year_id: y.id,
        idempotency_key: idempotency,
      });
    },
    "Record payment",
  );
}
function purposeForm(title, callback, submit = "Continue") {
  openForm(
    title,
    area(
      "Purpose / reason · recorded in activity history",
      "reason",
      "",
      'required minlength="5" maxlength="500"',
    ),
    callback,
    submit,
  );
}
async function reveal(reason, copy = false) {
  const r = await command("credential_reveal", {
    client_id: selected,
    reason: (copy ? "Copy: " : "Reveal: ") + reason,
  });
  if (copy) {
    await navigator.clipboard.writeText(
      `Password: ${r.password}\nPIN: ${r.pin}`,
    );
    return;
  }
  const el = document.querySelector("#revealed");
  if (!el) return;
  el.innerHTML = `<div class="credential-box"><span>Password</span><input readonly aria-label="Revealed IRIS password" value="${h(r.password)}"></div><div class="credential-box" style="margin-top:8px"><span>PIN</span><input readonly aria-label="Revealed PIN" value="${h(r.pin)}"></div><div class="actions" style="margin-top:12px">${button("Copy password & PIN", "credential-copy")}${button("Hide now", "credential-hide")}</div><p class="subtitle">Automatically hidden after 30 seconds.</p>`;
  secretTimer = setTimeout(clearSecret, 30000);
}
async function fileRequest(payload) {
  if (demo)
    throw Error(
      "Private document operations require the installed Supabase backend",
    );
  const { data: d, error } = await sb.functions.invoke("tax-documents", {
    body: payload,
  });
  if (error)
    throw Error(
      "Document endpoint unavailable or access denied. Check the Edge Function installation.",
    );
  if (d.error) throw Error(d.error);
  return d;
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const a = b.dataset.action;
  try {
    switch (a) {
      case "register":
        registerForm();
        break;
      case "owner-setup":
        openForm(
          "Activate first owner account",
          area("One-time owner setup code", "code", "", "required") +
            '<div class="notice full">The code is in your OWNER-SETUP.txt handoff file. It works once, only before any active administrator exists.</div>',
          async (f) => {
            const { error } = await sb.rpc("tax_claim_owner", {
              p_code: f.code.trim(),
            });
            if (error) throw error;
          },
        );
        break;
      case "demo":
        demo = true;
        role = "admin";
        data = makeDemo();
        view = "dashboard";
        selected = null;
        render();
        break;
      case "disconnect":
        if (sb) await sb.auth.signOut();
        localStorage.removeItem("brandex-tax-config");
        session = null;
        sb = null;
        demo = false;
        authScreen();
        break;
      case "logout":
        clearSecret();
        if (sb && !demo) await sb.auth.signOut();
        demo = false;
        selected = null;
        session = null;
        authScreen();
        break;
      case "reload":
        await load();
        break;
      case "menu":
        document.querySelector(".sidebar").classList.toggle("open");
        break;
      case "nav":
        selected = null;
        view = b.dataset.view;
        page = 0;
        search = "";
        filterStatus = "";
        render();
        break;
      case "client":
        selected = b.dataset.id;
        view = "clients";
        tab = "Overview";
        render();
        break;
      case "tab":
        tab = b.dataset.tab;
        render();
        break;
      case "prev":
        page = Math.max(0, page - 1);
        render();
        break;
      case "next":
        page++;
        render();
        break;
      case "archive-filter":
        showArchive = !showArchive;
        page = 0;
        render();
        break;
      case "client-add":
        clientForm();
        break;
      case "client-edit":
        clientForm(client(selected));
        break;
      case "year-add":
        yearForm();
        break;
      case "year-edit":
        yearForm(data.years.find((y) => y.id === b.dataset.id));
        break;
      case "payment-add":
        paymentForm(data.years.find((y) => y.id === b.dataset.id));
        break;
      case "archive": {
        const c = client(b.dataset.id);
        purposeForm(
          c.archived ? "Restore client" : "Archive client",
          async (f) => {
            await command("archive", {
              client_id: c.id,
              archived: !c.archived,
              reason: f.reason,
            });
          },
        );
        break;
      }
      case "payment-void":
        purposeForm(
          "Void payment · original receipt remains in history",
          async (f) => {
            await command("payment_void", {
              payment_id: b.dataset.id,
              reason: f.reason,
            });
          },
        );
        break;
      case "note-add":
        openForm(
          "Add internal note",
          area("Note", "body", "", 'required maxlength="10000"'),
          async (f) => {
            await command("note", { ...f, client_id: selected });
          },
        );
        break;
      case "credential-edit": {
        const meta = demo
          ? {}
          : await command("credential_meta", { client_id: selected });
        openForm(
          "Update FBR / IRIS credentials",
          `<div class="notice full">The password and PIN are encrypted in Supabase Vault. Existing credentials are never pre-filled into this form.</div>` +
            field(
              "IRIS password",
              "password",
              "",
              "password",
              'required autocomplete="new-password" maxlength="500"',
            ) +
            field(
              "PIN",
              "pin",
              "",
              "password",
              'required autocomplete="off" maxlength="100"',
            ) +
            field(
              "Registered mobile",
              "registered_mobile",
              meta.registered_mobile || "",
            ) +
            field(
              "Registered email",
              "registered_email",
              meta.registered_email || "",
              "email",
            ) +
            field(
              "Last verified date",
              "verified_at",
              meta.verified_at || "",
              "date",
            ),
          async (f) => {
            await command("credential_save", { ...f, client_id: selected });
          },
        );
        break;
      }
      case "credential-reveal":
      case "credential-copy": {
        const copy = a === "credential-copy";
        clearSecret();
        modal.innerHTML = `<h2>${copy ? "Copy" : "Reveal"} FBR credentials</h2><form><label>Purpose · recorded in activity history<textarea name="reason" required minlength="5" maxlength="500"></textarea></label><p class="error" id="form-error"></p><div class="actions">${button("Cancel", "modal-close")}<button type="submit" class="primary">${copy ? "Copy credentials" : "Reveal for 30 seconds"}</button></div></form>`;
        modal.querySelector('[data-action="modal-close"]').type = "button";
        modal.showModal();
        modal.querySelector("form").onsubmit = async (ev) => {
          ev.preventDefault();
          const reason = new FormData(ev.target).get("reason");
          try {
            await reveal(reason, copy);
            modal.close();
            modal.innerHTML = "";
            toast(
              copy
                ? "Copied. Clipboard contents remain until replaced."
                : "Credentials revealed for 30 seconds",
            );
          } catch (err) {
            modal.querySelector("#form-error").textContent = err.message;
          }
        };
        break;
      }
      case "credential-hide":
        clearSecret();
        break;
      case "document-upload":
        openForm(
          "Store private PDF",
          `<div class="notice full">${b.dataset.kind === "ntn" ? "NTN document" : "NTN Certificate"} · no public preview or public link.</div><label class="full">PDF file<input name="file" type="file" accept="application/pdf,.pdf" required></label>`,
          async (f) => {
            const file = f.file;
            if (file.size > 10485760) throw Error("Maximum PDF size is 10 MB");
            const bytes = new Uint8Array(await file.arrayBuffer());
            if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
              throw Error("Select a valid PDF file");
            let binary = "";
            for (let i = 0; i < bytes.length; i += 8192)
              binary += String.fromCharCode(...bytes.slice(i, i + 8192));
            await fileRequest({
              action: "upload",
              client_id: selected,
              kind: b.dataset.kind,
              name: file.name,
              base64: btoa(binary),
            });
          },
          "Upload securely",
        );
        break;
      case "document-download":
        purposeForm(
          "Download private PDF",
          async (f) => {
            const d = await fileRequest({
              action: "download",
              document_id: b.dataset.id,
              reason: f.reason,
            });
            const a = document.createElement("a");
            a.href = d.url;
            a.rel = "noopener noreferrer";
            a.download = "";
            a.click();
          },
          "Download",
        );
        break;
      case "label-add":
        openForm(
          "Add reusable label",
          field("Label name", "name", "", "text", 'required maxlength="50"') +
            field("Color", "color", "#76283c", "color"),
          async (f) => {
            await command("label", f);
          },
        );
        break;
      case "settings-edit":
        openForm(
          "Receipt branding",
          field(
            "Firm name",
            "firm_name",
            data.settings.firm_name,
            "text",
            "required",
          ) +
            field("Phone", "phone", data.settings.phone) +
            area("Firm address", "address", data.settings.address),
          async (f) => {
            await command("settings", f);
          },
        );
        break;
      case "member-add":
        openForm(
          "Grant / update tax module access",
          `<div class="notice full">Create or invite staff in Supabase Auth first. Paste their user UUID below. This grants Tax/NTN access only.</div>` +
            field(
              "Auth user UUID",
              "user_id",
              "",
              "text",
              'required pattern="[0-9a-fA-F-]{36}"',
            ) +
            pick("Role", "role", roles, "viewer") +
            pick("Active access", "active", ["true", "false"], "true"),
          async (f) => {
            await command("member", { ...f, active: f.active === "true" });
          },
        );
        break;
      case "receipt":
        printPayment = data.payments.find((p) => p.id === b.dataset.id);
        printYear = null;
        selected = null;
        view = "receipt";
        render();
        break;
      case "ack":
        printYear = data.years.find((y) => y.id === b.dataset.id);
        printPayment = null;
        selected = null;
        view = "receipt";
        render();
        break;
      case "print":
        window.print();
        break;
      case "back":
        view = "payments";
        render();
        break;
      case "export":
        exportReport();
        break;
      case "modal-close":
        modal.close();
        modal.innerHTML = "";
        break;
    }
  } catch (err) {
    toast(err.message, true);
  }
});
function exportReport() {
  const lines = [
    [
      "Client Code",
      "Client name",
      "Tax year",
      "Filing status",
      "Charge PKR",
      "Received PKR",
      "Outstanding PKR",
      "Payment status",
    ],
  ];
  for (const y of data.years.filter(
    (y) => y.tax_year === Number(filterYear) && !client(y.client_id)?.archived,
  )) {
    const c = client(y.client_id);
    lines.push([
      c.code,
      c.name,
      y.tax_year,
      y.filing_status,
      y.service_charge,
      paid(y),
      balance(y.service_charge, paid(y)),
      paymentState(y.service_charge, paid(y)),
    ]);
  }
  const csv = lines
    .map((l) =>
      l
        .map((v) => {
          let s = String(v ?? "");
          if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
          return '"' + s.replaceAll('"', '""') + '"';
        })
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = `Brandex-tax-${filterYear}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function registerForm() {
  modal.innerHTML =
    '<h2>Create staff account</h2><p class="subtitle">Register your own login. Access is granted separately by the administrator. The first owner can activate access with the one-time setup code.</p><form style="margin-top:20px"><div class="form-grid">' +
    field(
      "Email address",
      "email",
      "",
      "email",
      'required autocomplete="username"',
    ) +
    field(
      "Choose password",
      "password",
      "",
      "password",
      'required minlength="12" autocomplete="new-password"',
    ) +
    '</div><p class="error" id="form-error"></p><div class="actions">' +
    button("Cancel", "modal-close") +
    '<button type="submit" class="primary">Create account</button></div></form>';
  modal.querySelector('[data-action="modal-close"]').type = "button";
  modal.showModal();
  modal.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      const { data: d, error } = await sb.auth.signUp({
        ...f,
        options: { emailRedirectTo: location.origin },
      });
      if (error) throw error;
      modal.close();
      modal.innerHTML = "";
      if (d.session) {
        session = d.session;
        await load();
      } else {
        authScreen();
        toast(
          "Check your email to confirm your account, then return here to sign in.",
        );
      }
    } catch (err) {
      modal.querySelector("#form-error").textContent = err.message;
      btn.disabled = false;
    }
  };
}
async function start() {
  try {
    if (connect()) {
      const { data: d } = await sb.auth.getSession();
      if (d.session) {
        session = d.session;
        await load();
      } else authScreen();
    } else authScreen();
  } catch (err) {
    authScreen(err.message);
  }
}
void start();
modal.addEventListener("cancel", () => {
  modal.innerHTML = "";
  clearSecret();
});
