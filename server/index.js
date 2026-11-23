import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import pg from "pg";

const { Pool } = pg;
const scrypt = promisify(scryptCallback);
const ROOT = new URL("../", import.meta.url);
const PROJECT_DIR = fileURLToPath(ROOT);
const DIST_DIR = resolve(PROJECT_DIR, "dist");
try {
  const env = readFileSync(new URL(".env.local", ROOT), "utf8");
  for (const line of env.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
} catch {}

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const AUTH_SECRET = process.env.AUTH_SECRET?.trim();
const IS_PRODUCTION = process.env.NODE_ENV === "production";
if (!DATABASE_URL) throw new Error("Missing DATABASE_URL in .env.local");
if (!AUTH_SECRET || AUTH_SECRET.length < 32) throw new Error("AUTH_SECRET in .env.local must be at least 32 characters.");
if (IS_PRODUCTION && !existsSync(resolve(DIST_DIR, "index.html"))) throw new Error("Production frontend is missing. Run npm run build before starting the service.");

const pool = new Pool({ connectionString: DATABASE_URL, max: 5, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 });
let conditionTableReady = null;
let conditionTableCheckedAt = 0;
async function hasConditionTable() {
  if (conditionTableReady !== null && Date.now() - conditionTableCheckedAt < 30_000) return conditionTableReady;
  const result = await pool.query("SELECT to_regclass('public.rider_box_condition_reports') IS NOT NULL AS ready");
  conditionTableReady = result.rows[0]?.ready === true;
  conditionTableCheckedAt = Date.now();
  return conditionTableReady;
}
const PORT = Number(process.env.PORT || process.env.API_PORT || 3001);
const HOST = process.env.HOST || (IS_PRODUCTION ? "0.0.0.0" : "127.0.0.1");
const COOKIE = "saylani_rider_session";
const SESSION_SECONDS = 8 * 60 * 60;
const STAGES = ["assigned", "departed", "arrived", "counting", "submitted"];
const STAGE_INDEX = Object.fromEntries(STAGES.map((stage, index) => [stage, index]));
const STAGE_LABEL = { assigned: "Assigned", departed: "On the way", arrived: "Arrived", counting: "Counting cash", submitted: "Submitted" };
const defaultOrigins = IS_PRODUCTION ? [process.env.RENDER_EXTERNAL_URL || ""] : ["http://127.0.0.1:5173", "http://localhost:5173"];
const allowedOrigins = new Set((process.env.WEB_ORIGINS || defaultOrigins.filter(Boolean).join(",")).split(",").map((value) => value.trim().replace(/\/$/, "")).filter(Boolean));
if (IS_PRODUCTION && allowedOrigins.size === 0) throw new Error("Set WEB_ORIGINS to the public app origin in production.");
const TRUST_PROXY = process.env.TRUST_PROXY === "true";
const loginAttempts = new Map();
const MIME_TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json" };

function send(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "DENY", ...(IS_PRODUCTION ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}), ...extraHeaders });
  res.end(JSON.stringify(body));
}

function serveFrontend(req, res, url) {
  let requestedPath;
  try { requestedPath = decodeURIComponent(url.pathname); }
  catch { return send(res, 400, { error: "Invalid path." }); }
  const relativePath = requestedPath.replace(/^[/\\]+/, "");
  let filePath = resolve(DIST_DIR, relativePath || "index.html");
  if (filePath !== DIST_DIR && !filePath.startsWith(DIST_DIR + sep)) return send(res, 403, { error: "Path is not allowed." });
  try {
    if (statSync(filePath).isDirectory()) filePath = resolve(filePath, "index.html");
    if (!statSync(filePath).isFile()) throw new Error("Not a file");
  } catch {
    filePath = resolve(DIST_DIR, "index.html");
    if (!existsSync(filePath)) return send(res, 503, { error: "Production frontend is not built." });
  }
  const headers = {
    "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream",
    "Cache-Control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    ...(IS_PRODUCTION ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}),
  };
  res.writeHead(200, headers);
  if (req.method === "HEAD") return res.end();
  createReadStream(filePath).on("error", () => res.destroy()).pipe(res);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16_384) throw Object.assign(new Error("Request body is too large."), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("Provide a valid JSON request."), { status: 400 }); }
}

function requestOriginAllowed(req) {
  const origin = req.headers.origin;
  return typeof origin === "string" && allowedOrigins.has(origin.replace(/\/$/, ""));
}

function cookieValue(req, name) {
  for (const part of (req.headers.cookie || "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return "";
}

function signature(payload) {
  return createHmac("sha256", AUTH_SECRET).update(payload).digest("base64url");
}

function createSession(user) {
  const payload = Buffer.from(JSON.stringify({ ...user, expiresAt: Math.floor(Date.now() / 1000) + SESSION_SECONDS })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

function verifySession(token) {
  if (!token) return null;
  const [payload, supplied, ...extra] = token.split(".");
  if (!payload || !supplied || extra.length) return null;
  const expected = Buffer.from(signature(payload), "base64url");
  const actual = Buffer.from(supplied, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data.userId !== "string" || data.role !== "rider" || typeof data.expiresAt !== "number" || data.expiresAt <= Date.now() / 1000) return null;
    return data;
  } catch { return null; }
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`);
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

async function verifyPassword(password, encodedHash) {
  const [encodedSalt, encodedKey, ...extra] = String(encodedHash || "").split(".");
  const salt = Buffer.from(encodedSalt || "", "base64url");
  const expected = Buffer.from(encodedKey || "", "base64url");
  if (extra.length || salt.length !== 16 || expected.length !== 64) return false;
  const actual = Buffer.from(await scrypt(password, salt, 64, { maxmem: 128 * 1024 * 1024 }));
  return timingSafeEqual(actual, expected);
}

async function findLogin(email) {
  const result = await pool.query(`
    SELECT member.team_id, member.full_name, member.email, member.phone, member.city_id,
      member.password_hash, role.role_key
    FROM team_members member
    JOIN roles role ON role.role_id = member.role_id
    WHERE lower(member.email) = $1 AND member.identity_type = 'login_account'
      AND member.account_status = 'active' AND member.deleted_at IS NULL
    LIMIT 1
  `, [email]);
  return result.rows[0] || null;
}

async function activeRider(session) {
  const result = await pool.query(`
    SELECT rider.rider_id, member.team_id, member.full_name, member.email, member.phone,
      member.city_id, city.city_name, rider.assigned_zone, rider.employment_status,
      (SELECT count(*)::int FROM donation_boxes box WHERE box.assigned_rider_id = rider.rider_id AND box.box_status = 'Active') AS active_boxes
    FROM team_members member
    JOIN roles role ON role.role_id = member.role_id
    JOIN riders rider ON rider.team_id = member.team_id
    LEFT JOIN cities city ON city.city_id = member.city_id
    WHERE member.team_id = $1 AND role.role_key = 'rider'
      AND member.identity_type = 'login_account' AND member.account_status = 'active'
      AND member.deleted_at IS NULL AND rider.employment_status = 'Active'
    LIMIT 1
  `, [session.userId]);
  return result.rows[0] || null;
}

function eventLog(events) {
  if (!Array.isArray(events)) return [];
  return events.map((event) => {
    const label = STAGE_LABEL[event.stage] || event.note || event.event || "Updated";
    const stamp = event.at ? new Date(event.at).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
    return [event.note ? `${label}: ${event.note}` : label, stamp];
  });
}

async function readState(rider) {
  const conditionReady = await hasConditionTable();
  const conditionSelect = conditionReady
    ? "box_condition.condition_status AS box_condition_status, box_condition.condition_note AS box_condition_note"
    : "NULL::varchar AS box_condition_status, NULL::text AS box_condition_note";
  const conditionJoin = conditionReady ? `LEFT JOIN LATERAL (
        SELECT report.condition_status, report.condition_note
        FROM rider_box_condition_reports report WHERE report.task_id = task.task_id LIMIT 1
      ) box_condition ON true` : "";
  const [taskRows, collectionRows, fieldRows, notificationRows, summaryRows] = await Promise.all([
    pool.query(`
      SELECT task.task_id, to_char(task.task_date, 'YYYY-MM-DD') AS task_date, task.task_type,
        task.task_status, task.workflow_stage, task.workflow_events::text, task.notes,
        box.box_id, box.area, box.location_type, box.location_description, box.box_status,
        city.city_name, partner.partner_name, ${conditionSelect}, submitted.collection_id,
        submitted.collection_amount_pkr::float8 AS amount, submitted.collection_status
      FROM rider_tasks task
      JOIN donation_boxes box ON box.box_id = task.box_id
      JOIN cities city ON city.city_id = box.city_id
      LEFT JOIN partners partner ON partner.partner_id = box.partner_id
      ${conditionJoin}
      LEFT JOIN LATERAL (
        SELECT collection.collection_id, collection.collection_amount_pkr, collection.collection_status
        FROM collections collection
        WHERE collection.rider_task_id = task.task_id AND collection.rider_id = task.rider_id
          AND collection.collection_status <> 'Voided'
        ORDER BY collection.collection_date DESC, collection.collection_id DESC LIMIT 1
      ) submitted ON true
      WHERE task.rider_id = $1 ORDER BY task.task_date DESC, task.task_id
    `, [rider.rider_id]),
    pool.query(`
      SELECT collection_id, to_char(collection_date, 'YYYY-MM-DD') AS collection_date,
        box_id, collection_amount_pkr::float8 AS amount, collection_status
      FROM collections WHERE collection_status <> 'Voided' AND rider_id = $1
      ORDER BY collection_date DESC, collection_id DESC LIMIT 100
    `, [rider.rider_id]),
    pool.query(`
      SELECT field_collection_id, to_char(collection_date, 'YYYY-MM-DD') AS collection_date,
        box_id, area, total_cash_counted_pkr::float8 AS amount
      FROM field_collection_logs WHERE collection_status IS DISTINCT FROM 'Voided' AND rider_id = $1
      ORDER BY collection_date DESC, field_collection_id DESC LIMIT 100
    `, [rider.rider_id]),
    pool.query(`
      SELECT task.task_id, to_char(task.notification_created_at AT TIME ZONE 'Asia/Karachi', 'DD Mon HH24:MI') AS created_label
      FROM rider_tasks task WHERE task.rider_id = $1 AND task.notification_read_at IS NULL
        AND task.notification_created_at IS NOT NULL AND task.task_status NOT IN ('Completed', 'Cancelled')
      ORDER BY task.notification_created_at DESC LIMIT 50
    `, [rider.rider_id]),
    pool.query(`
      SELECT count(*)::int AS task_count,
        count(*) FILTER (WHERE task_status = 'Completed')::int AS completed_tasks,
        count(*) FILTER (WHERE task_status IN ('Assigned', 'In Progress'))::int AS open_tasks,
        (SELECT count(*)::int FROM collections WHERE collection_status <> 'Voided' AND rider_id = $1) AS collection_count,
        (SELECT COALESCE(sum(collection_amount_pkr), 0)::float8 FROM collections WHERE collection_status <> 'Voided' AND rider_id = $1) AS collection_total
      FROM rider_tasks WHERE rider_id = $1
    `, [rider.rider_id]),
  ]);
  const tasks = taskRows.rows.map((row) => {
    let workflow = [];
    try { workflow = JSON.parse(row.workflow_events || "[]"); } catch {}
    const statusNote = row.collection_status === "Pending Verification" ? "Pending Verification" : row.collection_status || "";
    const loc = [row.area, row.location_description].filter(Boolean).join(" · ");
    return {
      id: row.task_id, date: row.task_date, type: row.task_type, box: row.box_id, loc,
      city: row.city_name, status: row.task_status, stage: STAGE_INDEX[row.workflow_stage] ?? (row.workflow_stage === "completed" ? 3 : 0),
      boxCondition: row.box_condition_status || null, boxConditionNote: row.box_condition_note || "",
      amt: row.amount == null ? null : Number(row.amount), note: statusNote || row.notes || "",
      log: eventLog(workflow),
    };
  });
  const cols = collectionRows.rows.map((row) => ({ id: row.collection_id, amt: Number(row.amount || 0), box: row.box_id, city: rider.city_name || "", date: row.collection_date, status: row.collection_status }));
  const logs = fieldRows.rows.map((row) => ({ id: row.field_collection_id, date: row.collection_date, box: row.box_id, city: rider.city_name || "", area: row.area, amt: Number(row.amount || 0) }));
  const notifs = notificationRows.rows.map((row) => ({ id: row.task_id, text: `New task ${row.task_id} assigned to you`, time: row.created_label, read: false }));
  const summary = summaryRows.rows[0] || {};
  return {
    session: true,
    features: { boxConditionReports: conditionReady },
    profile: { rider_id: rider.rider_id, team_id: rider.team_id, full_name: rider.full_name, email: rider.email, phone: rider.phone, city_name: rider.city_name, assigned_zone: rider.assigned_zone, employment_status: rider.employment_status },
    summary: { taskCount: Number(summary.task_count || 0), completedTasks: Number(summary.completed_tasks || 0), openTasks: Number(summary.open_tasks || 0), activeBoxes: Number(rider.active_boxes || 0), collectionCount: Number(summary.collection_count || 0), collectionTotal: Number(summary.collection_total || 0) },
    tasks, cols, logs, notifs,
  };
}

async function getSession(req) {
  const session = verifySession(cookieValue(req, COOKIE));
  if (!session) return null;
  return await activeRider(session);
}

async function requireRider(req, res) {
  const rider = await getSession(req);
  if (!rider) {
    clearSessionCookie(res);
    send(res, 401, { error: "Sign in with an active rider account." });
    return null;
  }
  return rider;
}

async function writeAudit(client, entityType, entityId, action, rider, before, after) {
  await client.query(`
    INSERT INTO activity_audit_log (audit_id, entity_type, entity_id, action, actor_team_id, before_data, after_data)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
  `, [randomBytes(16).toString("hex"), entityType, entityId, action, rider.team_id, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]);
}

function getRateLimit(ip) {
  const now = Date.now();
  const previous = loginAttempts.get(ip);
  if (!previous || now - previous.startedAt > 60_000) return { startedAt: now, count: 1 };
  return { ...previous, count: previous.count + 1 };
}

async function handle(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  if (url.pathname.startsWith("/api/") && req.method !== "OPTIONS") {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method) && !requestOriginAllowed(req)) return send(res, 403, { error: "Request origin is not allowed." });
  }
  if (IS_PRODUCTION && ["GET", "HEAD"].includes(req.method) && !url.pathname.startsWith("/api/")) return serveFrontend(req, res, url);
  if (req.method === "OPTIONS") return send(res, 204, {});

  if (req.method === "GET" && url.pathname === "/api/health") {
    await pool.query("SELECT 1");
    return send(res, 200, { status: "connected" });
  }
  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const forwardedFor = TRUST_PROXY && typeof req.headers["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"].split(",")[0].trim() : "";
    const ip = forwardedFor || req.socket.remoteAddress || "unknown";
    const attempts = getRateLimit(ip);
    loginAttempts.set(ip, attempts);
    if (attempts.count > 10) return send(res, 429, { error: "Too many sign-in attempts. Wait a minute and try again." });
    const body = await readJson(req);
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.email !== "string" || body.email.length > 254 || typeof body.password !== "string" || body.password.length > 1024) return send(res, 400, { error: "Enter a valid email and password." });
    const email = body.email.trim().toLowerCase();
    const account = await findLogin(email);
    const valid = await verifyPassword(body.password, account?.password_hash || "c2FkcWEtZHVtbXktc2FsdA.cccwb47eD-Jfib7iVv2GQLJ72fpTk3TXpI_ciOydLV_3_7IEyybJPMU_cXwGF9-vS6EM-vyYdIomCLzNOOJf0g");
    if (!account || !valid) return send(res, 401, { error: "The email or password is incorrect." });
    if (account.role_key !== "rider") return send(res, 403, { error: "This app is for Rider accounts. Use the manager dashboard for branch or city accounts." });
    const rider = await activeRider({ userId: account.team_id });
    if (!rider) return send(res, 403, { error: "This Rider account is inactive or has no active rider profile." });
    loginAttempts.delete(ip);
    setSessionCookie(res, createSession({ userId: rider.team_id, email: rider.email, role: "rider" }));
    return send(res, 200, await readState(rider));
  }
  if (req.method === "GET" && url.pathname === "/api/state") {
    const rider = await getSession(req);
    return send(res, 200, rider ? await readState(rider) : { session: false });
  }
  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    clearSessionCookie(res);
    return send(res, 200, { session: false });
  }

  const rider = await requireRider(req, res);
  if (!rider) return;

  if (req.method === "POST" && url.pathname === "/api/notifications/read-all") {
    await pool.query("UPDATE rider_tasks SET notification_read_at = CURRENT_TIMESTAMP WHERE rider_id = $1 AND notification_read_at IS NULL", [rider.rider_id]);
    return send(res, 200, await readState(rider));
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/([A-Za-z0-9_-]+)\/(progress|condition|submit|skip|complete)$/);
  if (req.method === "POST" && taskMatch) {
    const [, taskId, action] = taskMatch;
    if (action === "condition" && !(await hasConditionTable())) return send(res, 503, { error: "Box condition reporting needs the database migration. Apply ops/create-box-condition-table.sql first." });
    const body = await readJson(req);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (!body || typeof body !== "object" || Array.isArray(body)) { await client.query("ROLLBACK"); return send(res, 400, { error: "Provide the task update details." }); }
      const selected = await client.query(`
        SELECT task.task_id, task.task_type, task.task_status, task.workflow_stage, task.box_id,
          task.rider_id, box.city_id, box.partner_id, box.box_status
        FROM rider_tasks task JOIN riders profile ON profile.rider_id = task.rider_id
        JOIN donation_boxes box ON box.box_id = task.box_id
        WHERE task.task_id = $1 AND profile.team_id = $2 AND profile.employment_status = 'Active'
        FOR UPDATE OF task, box
      `, [taskId, rider.team_id]);
      const task = selected.rows[0];
      if (!task) { await client.query("ROLLBACK"); return send(res, 404, { error: "This task is not assigned to your rider account." }); }
      if (task.task_status === "Cancelled" || (task.task_status === "Completed" && action !== "condition")) { await client.query("ROLLBACK"); return send(res, 409, { error: "This task is already closed." }); }

      if (action === "condition") {
        const conditionStatus = typeof body.conditionStatus === "string" ? body.conditionStatus : "";
        const conditionNote = typeof body.conditionNote === "string" ? body.conditionNote.trim().slice(0, 500) : "";
        if (!["Fresh", "Damaged"].includes(conditionStatus) || (conditionStatus === "Damaged" && !conditionNote)) {
          await client.query("ROLLBACK"); return send(res, 400, { error: "Choose Fresh or Damaged. Add a short note when the box is damaged." });
        }
        const existing = await client.query("SELECT report_id, condition_status, condition_note FROM rider_box_condition_reports WHERE task_id = $1", [taskId]);
        const saved = await client.query(`
          INSERT INTO rider_box_condition_reports (box_id, rider_id, task_id, reported_by_team_id, condition_status, condition_note)
          VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''))
          ON CONFLICT (task_id) DO UPDATE SET
            box_id = EXCLUDED.box_id, rider_id = EXCLUDED.rider_id,
            reported_by_team_id = EXCLUDED.reported_by_team_id,
            condition_status = EXCLUDED.condition_status, condition_note = EXCLUDED.condition_note,
            reported_at = CURRENT_TIMESTAMP
          RETURNING report_id
        `, [task.box_id, task.rider_id, taskId, rider.team_id, conditionStatus, conditionNote]);
        await writeAudit(client, "box_condition_report", saved.rows[0].report_id, existing.rowCount ? "condition_updated" : "condition_reported",
          rider, existing.rows[0] ? { condition: existing.rows[0].condition_status, note: existing.rows[0].condition_note } : null,
          { taskId, boxId: task.box_id, condition: conditionStatus, note: conditionNote || null });
      }

      if (action === "progress") {
        const targetIndex = Number(body.stage);
        const target = STAGES[targetIndex];
        const isCollection = task.task_type === "Scheduled Collection";
        const expected = { assigned: "departed", departed: "arrived", ...(isCollection ? { arrived: "counting" } : {}) }[task.workflow_stage];
        const resumeCurrentStage = task.task_status === "Skipped" && target === task.workflow_stage;
        if (!target || (!resumeCurrentStage && target !== expected) || (!isCollection && target === "counting") || !["Assigned", "In Progress", "Skipped"].includes(task.task_status)) {
          await client.query("ROLLBACK"); return send(res, 409, { error: "Task steps must be completed in order. Refresh and try again." });
        }
        if (task.task_status === "Skipped") await client.query("UPDATE rider_tasks SET task_status = 'In Progress' WHERE task_id = $1", [taskId]);
        const event = { stage: target, status: "In Progress", at: new Date().toISOString(), event: "status_changed", from: task.task_status, to: "In Progress", actor_team_id: rider.team_id };
        if (resumeCurrentStage) {
          await client.query(`UPDATE rider_tasks SET task_status = 'In Progress', workflow_events = COALESCE(workflow_events, '[]'::jsonb) || $2::jsonb WHERE task_id = $1`, [taskId, JSON.stringify([event])]);
        } else {
          await client.query(`UPDATE rider_tasks SET task_status = 'In Progress', workflow_stage = $2,
            workflow_events = COALESCE(workflow_events, '[]'::jsonb) || $3::jsonb WHERE task_id = $1`, [taskId, target, JSON.stringify([event])]);
        }
        await writeAudit(client, "rider_task", taskId, "status_updated", rider, { status: task.task_status, stage: task.workflow_stage }, { status: "In Progress", stage: target });
      }

      if (action === "skip") {
        const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
        if (!reason) { await client.query("ROLLBACK"); return send(res, 400, { error: "Add a reason before skipping this task." }); }
        const event = { stage: task.workflow_stage, at: new Date().toISOString(), note: reason, event: "status_changed", from: task.task_status, to: "Skipped", actor_team_id: rider.team_id };
        await client.query(`UPDATE rider_tasks SET task_status = 'Skipped', notes = CONCAT_WS(E'\\n', NULLIF(notes,''), 'Rider update: ' || $2),
          workflow_events = COALESCE(workflow_events, '[]'::jsonb) || $3::jsonb WHERE task_id = $1`, [taskId, reason, JSON.stringify([event])]);
        await writeAudit(client, "rider_task", taskId, "status_updated", rider, { status: task.task_status, stage: task.workflow_stage }, { status: "Skipped", stage: task.workflow_stage, reason });
      }

      if (action === "complete") {
        if (task.task_type === "Scheduled Collection") { await client.query("ROLLBACK"); return send(res, 400, { error: "Collection tasks must be submitted with a cash count." }); }
        if (task.workflow_stage !== "arrived") { await client.query("ROLLBACK"); return send(res, 409, { error: "Mark the task as arrived before completing the visit." }); }
        const note = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
        const event = { stage: "completed", at: new Date().toISOString(), note, event: "visit_completed", actor_team_id: rider.team_id };
        await client.query(`UPDATE rider_tasks SET task_status = 'Completed', workflow_stage = 'completed',
          notes = CASE WHEN $2::text = '' THEN notes ELSE CONCAT_WS(E'\\n', NULLIF(notes,''), 'Rider update: ' || $2::text) END,
          completed_at = CURRENT_TIMESTAMP, completion_time = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi')::time,
          workflow_events = COALESCE(workflow_events, '[]'::jsonb) || $3::jsonb WHERE task_id = $1`, [taskId, note, JSON.stringify([event])]);
        await writeAudit(client, "rider_task", taskId, "visit_completed", rider, { status: task.task_status }, { status: "Completed", note });
      }

      if (action === "submit") {
        if (task.task_type !== "Scheduled Collection" || task.task_status !== "In Progress" || task.workflow_stage !== "counting" || task.box_status !== "Active") {
          await client.query("ROLLBACK"); return send(res, 409, { error: "Only an active collection task at the cash-count step can be submitted." });
        }
        const allowed = { coin_1: 1, coin_2: 2, coin_5: 5, coin_10: 10, note_10: 10, note_20: 20, note_50: 50, note_100: 100, note_500: 500, note_1000: 1000, note_5000: 5000 };
        const counts = body.counts;
        if (!counts || typeof counts !== "object" || Array.isArray(counts) || Object.keys(counts).some((key) => !(key in allowed))) {
          await client.query("ROLLBACK"); return send(res, 400, { error: "Enter a valid count for each coin and note." });
        }
        let total = 0, notes = 0, coins = 0;
        for (const [key, value] of Object.entries(allowed)) {
          const count = counts[key] ?? 0;
          if (!Number.isSafeInteger(count) || count < 0 || count > 100_000_000) { await client.query("ROLLBACK"); return send(res, 400, { error: "Counts must be whole nonnegative numbers." }); }
          const amount = count * value;
          total += amount;
          if (key.startsWith("coin_")) coins += amount; else notes += amount;
        }
        if (!Number.isSafeInteger(total) || total <= 0 || total > 100_000_000) { await client.query("ROLLBACK"); return send(res, 400, { error: "Cash total must be from PKR 1 to PKR 100,000,000." }); }
        const savedCounts = Object.fromEntries(Object.keys(allowed).map((key) => [key, counts[key] ?? 0]));
        const collectionId = `COL-${randomBytes(8).toString("hex").toUpperCase()}`;
        const fieldId = `FLD-${randomBytes(8).toString("hex").toUpperCase()}`;
        const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
        await client.query(`INSERT INTO collections (
          collection_id, box_id, rider_id, city_id, partner_id, collection_date, collection_time,
          collection_amount_pkr, collection_status, recorded_by_team_id, notes, is_demo_record,
          cash_breakdown, rider_task_id, cash_notes_pkr, cash_coins_pkr, other_cash_pkr,
          cash_total_counted_pkr, counted_by_team_id, cash_handover_status, deposit_status
        ) VALUES ($1,$2,$3,$4,$5,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi')::date,
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi')::time,$6,'Pending Verification',$7,$8,FALSE,
          $9::jsonb,$10,$11,$12,0,$6,$7,'Pending','Pending')`,
        [collectionId, task.box_id, task.rider_id, task.city_id, task.partner_id, total, rider.team_id, note || null, JSON.stringify(savedCounts), taskId, notes, coins]);
        await client.query(`INSERT INTO field_collection_logs (
          field_collection_id, collection_date, collection_time, box_id, city_id, rider_id, task_id,
          box_status_at_visit, cash_notes_pkr, cash_coins_pkr, other_cash_pkr, total_cash_counted_pkr,
          counted_by_team_id, collection_status, cash_handover_status, deposit_status, remarks,
          created_at, is_demo_record, area, location_type, full_location_description, partner_id
        ) SELECT $1,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi')::date,
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi')::time,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,
          'Pending Verification','Pending','Pending',$11,CURRENT_TIMESTAMP,FALSE,box.area,
          box.location_type,box.location_description,box.partner_id
          FROM donation_boxes box WHERE box.box_id=$2`,
        [fieldId, task.box_id, task.city_id, task.rider_id, taskId, task.box_status, notes, coins, total, rider.team_id, note || null]);
        const event = { stage: "submitted", at: new Date().toISOString(), collection_id: collectionId, event: "collection_submitted", from: task.task_status, to: "Completed", actor_team_id: rider.team_id };
        await client.query(`UPDATE rider_tasks SET task_status='Completed', workflow_stage='submitted',
          workflow_events=COALESCE(workflow_events,'[]'::jsonb)||$2::jsonb, completed_at=CURRENT_TIMESTAMP,
          completion_time=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi')::time WHERE task_id=$1`, [taskId, JSON.stringify([event])]);
        await writeAudit(client, "collection", collectionId, "submitted", rider, null, { taskId, boxId: task.box_id, amount: total, status: "Pending Verification" });
      }

      await client.query("COMMIT");
      return send(res, 200, await readState(rider));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error?.code === "23514") return send(res, 409, { error: "The database blocked this update because the task or cash-count steps are incomplete." });
      console.error("Rider API action failed.", error);
      return send(res, 503, { error: "The update could not be saved. Refresh and try again." });
    } finally { client.release(); }
  }

  return send(res, 404, { error: "API route not found." });
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error("Rider API request failed.", error);
    if (!res.headersSent) send(res, error.status || 503, { error: error.status ? error.message : "The database request failed." });
    else res.destroy();
  });
});

server.listen(PORT, HOST, () => console.log(`Rider app listening on ${HOST}:${PORT} (${IS_PRODUCTION ? "production" : "development"})`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => pool.end(() => process.exit(0))));
