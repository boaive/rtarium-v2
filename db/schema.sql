-- RTARIUM contact form: the LIVE database as it stood on 12 Nov 2026 (database rtarium, schema public), as the owner
-- gave it. A reference, and the starting point for a new or local database: the live database already has all of it,
-- so never run this file there. Changes since are in db/migrations/, run in order (in pgAdmin, as postgres).
--
-- The Worker connects (through Hyperdrive) as rtarium_app, which already exists on the live database with exactly:
--   CONNECT on database rtarium; USAGE on schema public;
--   SELECT, INSERT on enquiries; SELECT, INSERT, UPDATE on email_outbox.
-- That is all the Worker needs: it never deletes, never changes an enquiry, never creates anything.

create table if not exists enquiries (
  id         uuid primary key default gen_random_uuid(),
  ref        text not null unique,
  name       varchar(120) not null,
  email      varchar(200) not null,
  phone      varchar(40),
  company    varchar(160),
  interest   varchar(60) not null,
  message    varchar(4000) not null,
  created_at timestamptz not null default now()
);

create table if not exists email_outbox (
  id                  uuid primary key default gen_random_uuid(),
  enquiry_id          uuid not null references enquiries (id),
  kind                text not null check (kind in ('client_notification', 'visitor_confirmation')),
  status              text not null default 'pending' check (status in ('pending', 'queued', 'sent', 'failed')),
  attempts            integer not null default 0,
  last_error          text,
  provider_message_id text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  sent_at             timestamptz,
  unique (enquiry_id, kind)
);

-- the 5-minute re-queue and the hourly check (worker/mailer.ts) read this one
create index if not exists email_outbox_pending_idx on email_outbox (status, created_at)
  where status in ('pending', 'queued', 'failed');
