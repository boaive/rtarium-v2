-- A database user for the Worker that can do what the contact form needs and nothing else: read and add enquiries,
-- read, add and update their email jobs. It cannot delete anything, change a table, see other tables or create any.
-- If the Worker's credentials ever leak, this is all they allow.
--
-- Run once as the RDS admin user, after db/schema.sql, choosing a long random password:
--
--   psql "postgres://ADMIN_USER@HOST:5432/DBNAME?sslmode=require" -v app_password='LONG-RANDOM-PASSWORD' -f db/app-role.sql
--
-- Then point Hyperdrive at this user instead of the admin user:
--
--   npx wrangler hyperdrive update aaa3c9e47fa34cc0840a428cd1199bb0 --origin-user rtarium_app --origin-password 'LONG-RANDOM-PASSWORD'

\set ON_ERROR_STOP on

create role rtarium_app login password :'app_password' connection limit 20;

-- connect to this database only, and use the public schema without creating anything in it
select format('grant connect on database %I to rtarium_app', current_database()) \gexec
grant usage on schema public to rtarium_app;
revoke create on schema public from public;

grant select, insert on enquiries to rtarium_app;
grant select, insert, update on email_outbox to rtarium_app;
