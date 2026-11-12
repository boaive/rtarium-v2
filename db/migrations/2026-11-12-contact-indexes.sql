-- 2026-11-12: two indexes for the contact form's new checks (worker/contact.ts). Run in pgAdmin, as postgres, on the
-- database rtarium, before deploying the new Worker.
--
-- Safe to run twice (IF NOT EXISTS). No new columns, no data changed, no new grants for rtarium_app: an index is used
-- by every query that can use it, whoever runs the query. The tables are small, so each index takes a moment.
--
-- 1. The repeat check (the same enquiry from the same address within 30 minutes is saved once) and the per-address
--    confirmation limit (3 a day) both look enquiries up by lower(email), newest first.
CREATE INDEX IF NOT EXISTS enquiries_email_lower_created_idx
  ON public.enquiries (lower(email), created_at DESC);

-- 2. The hourly confirmation limit (40 an hour in all) counts recent rows of one kind.
CREATE INDEX IF NOT EXISTS email_outbox_kind_created_idx
  ON public.email_outbox (kind, created_at);

-- Check: should list both new indexes next to the existing ones.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename IN ('enquiries', 'email_outbox')
ORDER BY tablename, indexname;
