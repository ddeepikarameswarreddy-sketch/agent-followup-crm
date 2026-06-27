-- Agent Follow-up CRM PostgreSQL schema
-- You can run this manually in pgAdmin Query Tool if you do not want automatic table creation.

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

-- Backend validation blocks duplicate date + slot for all scheduled lead statuses.
-- This database index is kept as an extra safeguard for active booking statuses.
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_booking_slot
ON leads(next_followup_date, preferred_slot)
WHERE preferred_slot IS NOT NULL
  AND preferred_slot <> ''
  AND status IN ('Site Visit', 'Booking', 'Payment');


-- If an older version created alerts.due_at as TIMESTAMPTZ, run this once to prevent timezone date shifting:
-- ALTER TABLE alerts ALTER COLUMN due_at TYPE DATE USING due_at::date;
