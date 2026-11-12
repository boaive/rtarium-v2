-- RTARIUM contact form: the two tables the Worker (worker/) reads and writes, with their rules and indexes.
--
-- Safe to run more than once, and safe on the live database: everything is "if not exists", so on a database that
-- already has these tables it only adds what is missing (the indexes). It never changes or deletes data.
--
--   psql "postgres://ADMIN_USER@HOST:5432/DBNAME?sslmode=require" -f db/schema.sql
--
-- PostgreSQL 13 or newer (gen_random_uuid() is built in). The limits below match src/content/enquiry.ts: the Worker
-- checks them first, and the database refuses anything that slips past.

create table if not exists enquiries (
  id         uuid primary key default gen_random_uuid(),
  ref        text not null unique check (ref ~ '^RT-[0-9]{8}-[0-9]{4}-[A-Z0-9]{4}$'),
  name       text not null check (char_length(name) between 1 and 120),
  email      text not null check (char_length(email) between 3 and 200),
  phone      text check (char_length(phone) <= 40),
  company    text check (char_length(company) <= 160),
  interest   text not null check (char_length(interest) between 1 and 60),
  message    text not null check (char_length(message) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists email_outbox (
  id                  uuid primary key default gen_random_uuid(),
  enquiry_id          uuid not null references enquiries (id) on delete cascade,
  kind                text not null check (kind in ('client_notification', 'visitor_confirmation')),
  status              text not null default 'pending' check (status in ('pending', 'queued', 'sent', 'failed')),
  attempts            integer not null default 0 check (attempts >= 0),
  last_error          text,
  provider_message_id text,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (enquiry_id, kind)
);

-- the repeat check and the per-address confirmation limit (worker/contact.ts)
create index if not exists enquiries_email_created on enquiries (lower(email), created_at desc);
-- the hourly confirmation limit (worker/contact.ts)
create index if not exists email_outbox_kind_created on email_outbox (kind, created_at);
-- the 5-minute and hourly checks (worker/mailer.ts): only rows still waiting are indexed
create index if not exists email_outbox_waiting on email_outbox (updated_at) where status in ('pending', 'queued');
