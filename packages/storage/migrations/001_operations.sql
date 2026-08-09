-- PostgreSQL production schema. Every tenant-bound table is protected by RLS.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  timezone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'dispatcher', 'technician', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  location text NOT NULL,
  criticality text NOT NULL CHECK (criticality IN ('safety', 'production', 'customer', 'standard')),
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE technicians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  daily_capacity_minutes integer NOT NULL CHECK (daily_capacity_minutes BETWEEN 60 AND 1440),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

CREATE TABLE maintenance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  frequency_days integer NOT NULL CHECK (frequency_days BETWEEN 1 AND 730),
  priority text NOT NULL CHECK (priority IN ('critical', 'high', 'normal', 'low')),
  required_skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  estimated_minutes integer NOT NULL CHECK (estimated_minutes BETWEEN 15 AND 1440),
  active boolean NOT NULL DEFAULT true,
  last_generated_for date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id),
  maintenance_plan_id uuid REFERENCES maintenance_plans(id),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  priority text NOT NULL CHECK (priority IN ('critical', 'high', 'normal', 'low')),
  required_skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  estimated_minutes integer NOT NULL CHECK (estimated_minutes BETWEEN 15 AND 1440),
  due_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'scheduled', 'in_progress', 'blocked', 'completed', 'cancelled')),
  risk text NOT NULL CHECK (risk IN ('on_track', 'at_risk', 'overdue')),
  assigned_technician_id uuid REFERENCES technicians(id),
  blocked_reason text,
  completed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_orders_dispatch_idx ON work_orders(organization_id, status, due_at);
CREATE INDEX work_orders_technician_idx ON work_orders(organization_id, assigned_technician_id, status);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_timeline_idx ON audit_events(organization_id, entity_id, occurred_at);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  topic text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX outbox_unpublished_idx ON outbox_events(organization_id, occurred_at) WHERE published_at IS NULL;

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_memberships ON memberships USING (organization_id = current_setting('app.organization_id', true)::uuid);
CREATE POLICY tenant_assets ON assets USING (organization_id = current_setting('app.organization_id', true)::uuid);
CREATE POLICY tenant_technicians ON technicians USING (organization_id = current_setting('app.organization_id', true)::uuid);
CREATE POLICY tenant_plans ON maintenance_plans USING (organization_id = current_setting('app.organization_id', true)::uuid);
CREATE POLICY tenant_work_orders ON work_orders USING (organization_id = current_setting('app.organization_id', true)::uuid);
CREATE POLICY tenant_audit ON audit_events USING (organization_id = current_setting('app.organization_id', true)::uuid);
CREATE POLICY tenant_outbox ON outbox_events USING (organization_id = current_setting('app.organization_id', true)::uuid);
