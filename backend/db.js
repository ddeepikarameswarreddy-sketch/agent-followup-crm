const { Pool } = require("pg");
const crypto = require("crypto");

const sslConfig = process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false;

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: sslConfig
    }
  : {
      host: process.env.PGHOST || "localhost",
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || "agent_followup_crm",
      user: process.env.PGUSER || "postgres",
      password: process.env.PGPASSWORD || "postgres",
      ssl: sslConfig
    };

const pool = new Pool(poolConfig);

let databaseReady = false;

function createId() {
  return crypto.randomUUID();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 10);
}

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toDateOnly(value) {
  if (!value) return null;

  // PostgreSQL TIMESTAMPTZ values arrive in Node as Date objects.
  // Using toISOString() can shift the date one day back in India time
  // (example: 2026-06-25 becomes 2026-06-24T18:30:00Z).
  // Local getters preserve the date selected by the agent on the laptop.
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }

  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
  }

  return text.slice(0, 10);
}

function publicAgent(agent) {
  return {
    id: agent.id,
    name: agent.name,
    email: agent.email,
    role: agent.role || "agent",
    createdAt: toIso(agent.created_at || agent.createdAt)
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const passwordHash = crypto.pbkdf2Sync(String(password), salt, 10000, 64, "sha512").toString("hex");
  return { passwordSalt: salt, passwordHash };
}

function verifyPassword(password, agent) {
  if (!agent || !agent.password_salt || !agent.password_hash) return false;
  const candidate = hashPassword(password, agent.password_salt).passwordHash;
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(agent.password_hash, "hex"));
}

async function initDatabase() {
  await pool.query("SELECT 1");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS agents (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'agent',
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY,
      agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS buyers (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS enquiries (
      id UUID PRIMARY KEY,
      buyer_id UUID REFERENCES buyers(id) ON DELETE CASCADE,
      source TEXT NOT NULL DEFAULT 'Agent Entry',
      budget TEXT,
      area TEXT,
      timeline TEXT,
      enquiry_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS leads (
      id UUID PRIMARY KEY,
      buyer_id UUID REFERENCES buyers(id) ON DELETE SET NULL,
      enquiry_id UUID REFERENCES enquiries(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      budget TEXT,
      area TEXT,
      timeline TEXT,
      source TEXT NOT NULL DEFAULT 'Agent Entry',
      status TEXT NOT NULL DEFAULT 'New',
      interest_level TEXT NOT NULL DEFAULT 'Medium',
      preferred_package_id TEXT,
      next_followup_date DATE,
      preferred_slot TEXT,
      notes TEXT,
      lead_score INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'Medium',
      recommendation JSONB NOT NULL DEFAULT '{}'::jsonb,
      process_result JSONB,
      payment JSONB NOT NULL DEFAULT '{"status":"Pending"}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS followup_history (
      id UUID PRIMARY KEY,
      lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      status TEXT,
      note TEXT,
      action_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS documents (
      id UUID PRIMARY KEY,
      lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
      document_type TEXT DEFAULT 'General',
      title TEXT NOT NULL,
      url TEXT,
      status TEXT DEFAULT 'Pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id UUID PRIMARY KEY,
      lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
      channel TEXT NOT NULL DEFAULT 'WhatsApp/Email Preview',
      type TEXT NOT NULL DEFAULT 'followup',
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      due_at DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY,
      lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
      payment_status TEXT NOT NULL DEFAULT 'Pending',
      amount_paid NUMERIC DEFAULT 0,
      payment_mode TEXT,
      receipt_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);


  // Keep alert due dates as DATE so reminder dates do not shift because of timezone.
  await pool.query(`
    ALTER TABLE alerts
    ALTER COLUMN due_at TYPE DATE USING due_at::date;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS unique_active_booking_slot
    ON leads(next_followup_date, preferred_slot)
    WHERE preferred_slot IS NOT NULL
      AND preferred_slot <> ''
      AND status IN ('Site Visit', 'Booking', 'Payment');
  `);

  databaseReady = true;
  return true;
}

async function upsertBuyer(client, { name, phone, email }) {
  const buyerId = createId();
  const result = await client.query(
    `INSERT INTO buyers (id, name, phone, email)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (phone) DO UPDATE SET
       name = EXCLUDED.name,
       email = COALESCE(NULLIF(EXCLUDED.email, ''), buyers.email),
       updated_at = NOW()
     RETURNING id`,
    [buyerId, String(name || "").trim(), cleanPhone(phone), String(email || "").trim()]
  );
  return result.rows[0].id;
}

function normalizeLead(row, history = [], documents = [], alerts = [], payments = []) {
  if (!row) return null;
  return {
    id: row.id,
    buyerId: row.buyer_id,
    enquiryId: row.enquiry_id,
    name: row.name,
    phone: row.phone,
    email: row.email || "",
    budget: row.budget || "",
    area: row.area || "",
    timeline: row.timeline || "",
    source: row.source || "Agent Entry",
    status: row.status || "New",
    interestLevel: row.interest_level || "Medium",
    preferredPackageId: row.preferred_package_id || "",
    nextFollowUpDate: toDateOnly(row.next_followup_date),
    preferredSlot: row.preferred_slot || "",
    notes: row.notes || "",
    recommendation: row.recommendation || null,
    leadScore: row.lead_score || 0,
    priority: row.priority || "Medium",
    processResult: row.process_result || null,
    payment: row.payment || { status: "Pending" },
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    history,
    documents,
    alerts,
    payments
  };
}

function normalizeHistory(row) {
  return {
    id: row.id,
    action: row.action,
    status: row.status,
    note: row.note,
    date: toIso(row.action_date)
  };
}

function normalizeDocument(row) {
  return {
    id: row.id,
    documentType: row.document_type,
    title: row.title,
    url: row.url || "",
    status: row.status || "Pending",
    createdAt: toIso(row.created_at)
  };
}

function normalizeAlert(row) {
  return {
    id: row.id,
    channel: row.channel,
    type: row.type,
    message: row.message,
    status: row.status,
    dueAt: toDateOnly(row.due_at),
    createdAt: toIso(row.created_at)
  };
}

function normalizeAlertWithLead(row) {
  return {
    ...normalizeAlert(row),
    leadId: row.lead_id,
    leadName: row.lead_name || row.name || "",
    leadPhone: row.lead_phone || row.phone || "",
    leadEmail: row.lead_email || row.email || "",
    leadStatus: row.lead_status || row.status || "",
    leadNextFollowUpDate: toDateOnly(row.lead_next_followup_date),
    leadPreferredSlot: row.lead_preferred_slot || ""
  };
}

function normalizePayment(row) {
  return {
    id: row.id,
    paymentStatus: row.payment_status,
    amountPaid: row.amount_paid === null ? "" : String(row.amount_paid),
    paymentMode: row.payment_mode || "",
    receiptNote: row.receipt_note || "",
    createdAt: toIso(row.created_at)
  };
}

async function insertHistoryRows(client, leadId, history = []) {
  for (const item of history) {
    await client.query(
      `INSERT INTO followup_history (id, lead_id, action, status, note, action_date)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        item.id || createId(),
        leadId,
        item.action || "Activity",
        item.status || "",
        item.note || "",
        item.date || item.actionDate || new Date().toISOString()
      ]
    );
  }
}

async function addLead(leadData) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const buyerId = await upsertBuyer(client, leadData);
    const enquiryId = createId();
    await client.query(
      `INSERT INTO enquiries (id, buyer_id, source, budget, area, timeline, enquiry_note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [enquiryId, buyerId, leadData.source || "Agent Entry", leadData.budget || "", leadData.area || "", leadData.timeline || "", leadData.notes || ""]
    );

    const leadId = createId();
    await client.query(
      `INSERT INTO leads (
        id, buyer_id, enquiry_id, name, phone, email, budget, area, timeline, source, status,
        interest_level, preferred_package_id, next_followup_date, preferred_slot, notes,
        lead_score, priority, recommendation, payment, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
      )`,
      [
        leadId,
        buyerId,
        enquiryId,
        leadData.name,
        cleanPhone(leadData.phone),
        leadData.email || "",
        leadData.budget || "",
        leadData.area || "",
        leadData.timeline || "",
        leadData.source || "Agent Entry",
        leadData.status || "New",
        leadData.interestLevel || "Medium",
        leadData.preferredPackageId || "",
        toDateOnly(leadData.nextFollowUpDate),
        leadData.preferredSlot || "",
        leadData.notes || "",
        leadData.leadScore || 0,
        leadData.priority || "Medium",
        JSON.stringify(leadData.recommendation || {}),
        JSON.stringify(leadData.payment || { status: "Pending" }),
        leadData.createdAt || new Date().toISOString(),
        leadData.updatedAt || new Date().toISOString()
      ]
    );

    await insertHistoryRows(client, leadId, leadData.history || []);

    if (leadData.documentTitle || leadData.documentUrl) {
      await client.query(
        `INSERT INTO documents (id, lead_id, document_type, title, url, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [createId(), leadId, leadData.documentType || "Customer Document", leadData.documentTitle || "Customer document", leadData.documentUrl || "", "Pending"]
      );
    }

    await client.query("COMMIT");
    return leadId;
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      const conflict = new Error("Slot conflict: this date and slot is already booked by another active lead.");
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function getLeads() {
  const result = await pool.query(`SELECT * FROM leads ORDER BY created_at DESC`);
  return result.rows.map((row) => normalizeLead(row));
}

async function getLeadById(id) {
  const leadResult = await pool.query(`SELECT * FROM leads WHERE id = $1`, [id]);
  if (!leadResult.rows.length) return null;

  const [historyResult, documentResult, alertResult, paymentResult] = await Promise.all([
    pool.query(`SELECT * FROM followup_history WHERE lead_id = $1 ORDER BY action_date ASC`, [id]),
    pool.query(`SELECT * FROM documents WHERE lead_id = $1 ORDER BY created_at DESC`, [id]),
    pool.query(`SELECT * FROM alerts WHERE lead_id = $1 ORDER BY created_at DESC`, [id]),
    pool.query(`SELECT * FROM payments WHERE lead_id = $1 ORDER BY created_at DESC`, [id])
  ]);

  return normalizeLead(
    leadResult.rows[0],
    historyResult.rows.map(normalizeHistory),
    documentResult.rows.map(normalizeDocument),
    alertResult.rows.map(normalizeAlert),
    paymentResult.rows.map(normalizePayment)
  );
}

async function updateLead(id, updates = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const leadCheck = await client.query(`SELECT * FROM leads WHERE id = $1`, [id]);
    if (!leadCheck.rows.length) {
      await client.query("ROLLBACK");
      return false;
    }

    if (updates.name || updates.phone || updates.email) {
      const current = leadCheck.rows[0];
      const buyerId = await upsertBuyer(client, {
        name: updates.name || current.name,
        phone: updates.phone || current.phone,
        email: updates.email !== undefined ? updates.email : current.email
      });
      updates.buyerId = buyerId;
    }

    const columnMap = {
      buyerId: "buyer_id",
      enquiryId: "enquiry_id",
      name: "name",
      phone: "phone",
      email: "email",
      budget: "budget",
      area: "area",
      timeline: "timeline",
      source: "source",
      status: "status",
      interestLevel: "interest_level",
      preferredPackageId: "preferred_package_id",
      nextFollowUpDate: "next_followup_date",
      preferredSlot: "preferred_slot",
      notes: "notes",
      recommendation: "recommendation",
      leadScore: "lead_score",
      priority: "priority",
      processResult: "process_result",
      payment: "payment",
      updatedAt: "updated_at"
    };

    const sets = [];
    const values = [];
    for (const [key, column] of Object.entries(columnMap)) {
      if (updates[key] !== undefined) {
        let value = updates[key];
        if (key === "phone") value = cleanPhone(value);
        if (key === "nextFollowUpDate") value = toDateOnly(value);
        if (["recommendation", "processResult", "payment"].includes(key)) value = JSON.stringify(value || {});
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      }
    }

    if (!updates.updatedAt) {
      values.push(new Date().toISOString());
      sets.push(`updated_at = $${values.length}`);
    }

    if (sets.length) {
      values.push(id);
      await client.query(`UPDATE leads SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
    }

    if (Array.isArray(updates.history)) {
      await client.query(`DELETE FROM followup_history WHERE lead_id = $1`, [id]);
      await insertHistoryRows(client, id, updates.history);
    }

    if (updates.payment) {
      const payment = updates.payment;
      await client.query(
        `INSERT INTO payments (id, lead_id, payment_status, amount_paid, payment_mode, receipt_note)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [createId(), id, payment.status || "Pending", Number(payment.amountPaid || 0), payment.mode || "", payment.receiptNote || ""]
      );
    }

    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      const conflict = new Error("Slot conflict: this date and slot is already booked by another active lead.");
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function addHistory(leadId, item) {
  await pool.query(
    `INSERT INTO followup_history (id, lead_id, action, status, note, action_date)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [createId(), leadId, item.action || "Activity", item.status || "", item.note || "", item.date || new Date().toISOString()]
  );
}

async function createDocument(leadId, document = {}) {
  const result = await pool.query(
    `INSERT INTO documents (id, lead_id, document_type, title, url, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [createId(), leadId, document.documentType || "General", document.title || "Customer document", document.url || "", document.status || "Pending"]
  );
  return normalizeDocument(result.rows[0]);
}

async function createAlert(leadId, alert = {}) {
  const result = await pool.query(
    `INSERT INTO alerts (id, lead_id, channel, type, message, status, due_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      createId(),
      leadId,
      alert.channel || "WhatsApp/Email Preview",
      alert.type || "followup",
      alert.message || "",
      alert.status || "Pending",
      toDateOnly(alert.dueAt) || null
    ]
  );
  return normalizeAlert(result.rows[0]);
}


async function updateAlertStatus(alertId, status) {
  const result = await pool.query(
    `UPDATE alerts SET status = $2 WHERE id = $1 RETURNING *`,
    [alertId, status || "Pending"]
  );
  return result.rows[0] ? normalizeAlert(result.rows[0]) : null;
}

async function deleteLeadById(id) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const leadResult = await client.query(
      `DELETE FROM leads WHERE id = $1 RETURNING id, buyer_id, enquiry_id, name`,
      [id]
    );

    if (!leadResult.rows.length) {
      await client.query("ROLLBACK");
      return null;
    }

    const deletedLead = leadResult.rows[0];

    if (deletedLead.enquiry_id) {
      await client.query(
        `DELETE FROM enquiries e
         WHERE e.id = $1
           AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.enquiry_id = e.id)`,
        [deletedLead.enquiry_id]
      );
    }

    if (deletedLead.buyer_id) {
      await client.query(
        `DELETE FROM buyers b
         WHERE b.id = $1
           AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.buyer_id = b.id)
           AND NOT EXISTS (SELECT 1 FROM enquiries e WHERE e.buyer_id = b.id)`,
        [deletedLead.buyer_id]
      );
    }

    await client.query("COMMIT");
    return { id: deletedLead.id, name: deletedLead.name };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function deleteAlertById(alertId) {
  const result = await pool.query(
    `DELETE FROM alerts WHERE id = $1 RETURNING *`,
    [alertId]
  );
  return result.rows[0] ? normalizeAlert(result.rows[0]) : null;
}

async function deleteAlerts(options = {}) {
  const values = [];
  const where = [];

  if (options.leadId) {
    values.push(options.leadId);
    where.push(`lead_id = $${values.length}`);
  }

  if (options.status) {
    values.push(options.status);
    where.push(`status = $${values.length}`);
  }

  if (options.type) {
    values.push(options.type);
    where.push(`type = $${values.length}`);
  }

  if (options.dueBefore) {
    values.push(toDateOnly(options.dueBefore));
    where.push(`due_at IS NOT NULL AND due_at::date <= $${values.length}::date`);
  }

  const query = `DELETE FROM alerts ${where.length ? `WHERE ${where.join(" AND ")}` : ""} RETURNING *`;
  const result = await pool.query(query, values);
  return result.rows.map(normalizeAlert);
}

async function getAlertById(alertId) {
  const result = await pool.query(
    `SELECT
       a.*,
       l.name AS lead_name,
       l.phone AS lead_phone,
       l.email AS lead_email,
       l.status AS lead_status,
       l.next_followup_date AS lead_next_followup_date,
       l.preferred_slot AS lead_preferred_slot
     FROM alerts a
     LEFT JOIN leads l ON l.id = a.lead_id
     WHERE a.id = $1
     LIMIT 1`,
    [alertId]
  );
  return result.rows[0] ? normalizeAlertWithLead(result.rows[0]) : null;
}

async function getAlerts(options = {}) {
  const values = [];
  const where = [];

  if (options.status) {
    values.push(options.status);
    where.push(`a.status = $${values.length}`);
  }

  if (options.type) {
    values.push(options.type);
    where.push(`a.type = $${values.length}`);
  }

  if (options.date) {
    values.push(toDateOnly(options.date));
    where.push(`a.due_at::date = $${values.length}::date`);
  }

  const query = `
    SELECT
      a.*,
      l.name AS lead_name,
      l.phone AS lead_phone,
      l.email AS lead_email,
      l.status AS lead_status,
      l.next_followup_date AS lead_next_followup_date,
      l.preferred_slot AS lead_preferred_slot
    FROM alerts a
    LEFT JOIN leads l ON l.id = a.lead_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY COALESCE(a.due_at::timestamptz, a.created_at) ASC, a.created_at DESC
    LIMIT 100
  `;

  const result = await pool.query(query, values);
  return result.rows.map(normalizeAlertWithLead);
}

async function getDueAlerts(date = toDateOnly(new Date())) {
  const result = await pool.query(
    `SELECT
       a.*,
       l.name AS lead_name,
       l.phone AS lead_phone,
       l.email AS lead_email,
       l.status AS lead_status,
       l.next_followup_date AS lead_next_followup_date,
       l.preferred_slot AS lead_preferred_slot
     FROM alerts a
     LEFT JOIN leads l ON l.id = a.lead_id
     WHERE a.due_at IS NOT NULL
       AND a.due_at::date <= $1::date
       AND a.status IN ('Pending', 'Automated', 'Previewed', 'Agent Reminder', 'Email Sent', 'No Customer Email')
     ORDER BY a.due_at ASC, a.created_at DESC
     LIMIT 100`,
    [toDateOnly(date)]
  );
  return result.rows.map(normalizeAlertWithLead);
}

async function findAgentByEmail(email) {
  const result = await pool.query(`SELECT * FROM agents WHERE email = $1 LIMIT 1`, [normalizeEmail(email)]);
  return result.rows[0] || null;
}

async function registerAgent({ name, email, password }) {
  const normalized = normalizeEmail(email);
  const existing = await findAgentByEmail(normalized);
  if (existing) {
    const error = new Error("This Gmail is already registered. Please login.");
    error.statusCode = 409;
    throw error;
  }

  const securePassword = hashPassword(password);
  const result = await pool.query(
    `INSERT INTO agents (id, name, email, role, password_salt, password_hash)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [createId(), String(name || "Sales Agent").trim(), normalized, "agent", securePassword.passwordSalt, securePassword.passwordHash]
  );
  return publicAgent(result.rows[0]);
}

async function authenticateAgent({ email, password }) {
  const agent = await findAgentByEmail(email);
  if (!agent || !verifyPassword(password, agent)) {
    const error = new Error("Invalid Gmail or password. Register first if you are a new agent.");
    error.statusCode = 401;
    throw error;
  }
  return publicAgent(agent);
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

async function createPasswordResetToken(email) {
  const agent = await findAgentByEmail(email);
  if (!agent) {
    const error = new Error("No account found with this Gmail address.");
    error.statusCode = 404;
    throw error;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await pool.query(
    `INSERT INTO password_reset_tokens (id, agent_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [createId(), agent.id, tokenHash, expiresAt]
  );

  return { agent: publicAgent(agent), token: rawToken, expiresAt: expiresAt.toISOString() };
}

async function resetAgentPassword({ token, password }) {
  const tokenHash = hashResetToken(token);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT prt.*, a.email, a.name, a.role, a.created_at AS agent_created_at
       FROM password_reset_tokens prt
       JOIN agents a ON a.id = prt.agent_id
       WHERE prt.token_hash = $1
       LIMIT 1`,
      [tokenHash]
    );

    const row = result.rows[0];
    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
      const error = new Error("Reset link is invalid or expired. Please request a new link.");
      error.statusCode = 400;
      throw error;
    }

    const securePassword = hashPassword(password);
    const updated = await client.query(
      `UPDATE agents
       SET password_salt = $1, password_hash = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [securePassword.passwordSalt, securePassword.passwordHash, row.agent_id]
    );

    await client.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [row.id]);
    await client.query("COMMIT");
    return publicAgent(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function isDatabaseReady() {
  return databaseReady;
}

function getDatabaseInfo() {
  return {
    type: "PostgreSQL",
    host: process.env.DATABASE_URL ? "DATABASE_URL" : (process.env.PGHOST || "localhost"),
    port: process.env.DATABASE_URL ? "from DATABASE_URL" : Number(process.env.PGPORT || 5432),
    database: process.env.DATABASE_URL ? "from DATABASE_URL" : (process.env.PGDATABASE || "agent_followup_crm"),
    ready: databaseReady
  };
}

module.exports = {
  pool,
  initDatabase,
  isDatabaseReady,
  getDatabaseInfo,
  addLead,
  getLeads,
  getLeadById,
  updateLead,
  deleteLeadById,
  addHistory,
  createDocument,
  createAlert,
  updateAlertStatus,
  deleteAlertById,
  deleteAlerts,
  getAlertById,
  getAlerts,
  getDueAlerts,
  registerAgent,
  authenticateAgent,
  createPasswordResetToken,
  resetAgentPassword
};
