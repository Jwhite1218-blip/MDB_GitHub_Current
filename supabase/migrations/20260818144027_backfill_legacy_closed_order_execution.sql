-- Orders closed before the execution workflow tracked invoices used the old
-- meaning of "Closed": their shipped quantity was the completed quantity.
-- Preserve that intent and give each legacy close a visible audit event.

update public.order_lines as line
set invoiced_qty = line.shipped_qty,
    qty_to_invoice = 0,
    reserved_qty = 0,
    qty_to_ship = 0,
    backorder_qty = 0
where exists (
  select 1
  from public.orders as sales_order
  where sales_order.id = line.order_id
    and sales_order.status = 'Closed'
)
and line.invoiced_qty < line.shipped_qty;

update public.orders
set closed_at = coalesce(closed_at, last_modified_at, created_at)
where status = 'Closed'
  and closed_at is null;

insert into public.order_events (
  event_key,
  order_id,
  event_type,
  summary,
  detail,
  actor_initials,
  actor_name,
  created_at
)
select
  'legacy-closed-' || sales_order.id,
  sales_order.id,
  'Closed',
  'Legacy closed order imported',
  'Closed before execution tracking was added; shipped quantity was carried forward as invoiced.',
  sales_order.last_modified_by_initials,
  sales_order.last_modified_by_name,
  coalesce(sales_order.closed_at, sales_order.last_modified_at, sales_order.created_at)
from public.orders as sales_order
where sales_order.status = 'Closed'
on conflict (event_key) do nothing;
