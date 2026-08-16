-- Run this once against the already-live database (SQL Editor). Safe to
-- re-run -- every statement is idempotent.

alter table orders
  add column if not exists weight_lbs numeric not null default 0,
  add column if not exists length_in numeric not null default 0,
  add column if not exists width_in numeric not null default 0,
  add column if not exists height_in numeric not null default 0;

alter table quote_lines
  add column if not exists category text not null default '';

alter table order_lines
  add column if not exists category text not null default '';

create index if not exists order_lines_category_idx on order_lines (category);
