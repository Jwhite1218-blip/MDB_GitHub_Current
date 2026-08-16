-- Run this once against the already-live database (SQL Editor) to add the
-- GP-matching fields introduced after the first schema.sql run. Safe to
-- re-run -- every statement is idempotent.

create sequence if not exists master_no_seq start 80000;

alter table quotes
  add column if not exists master_no bigint not null default nextval('master_no_seq'),
  add column if not exists ship_to_contact text not null default '',
  add column if not exists ship_to_address text not null default '',
  add column if not exists req_ship_date date,
  add column if not exists misc numeric not null default 0,
  add column if not exists trade_discount numeric not null default 0;

alter table quote_lines
  add column if not exists uom text not null default 'EA';

grant usage, select on all sequences in schema public to service_role;
