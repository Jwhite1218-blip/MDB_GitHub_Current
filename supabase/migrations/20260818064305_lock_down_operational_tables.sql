-- Defense in depth for the MDB operational tables.
--
-- The public portfolio site never talks to these tables. Authenticated
-- internal access will continue to run through server-side Netlify Functions
-- using the service role. No anon/authenticated Data API access is needed.

alter table public.quotes enable row level security;
alter table public.quote_lines enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.inventory_stock enable row level security;
alter table public.known_customers enable row level security;

revoke all on table public.quotes from anon, authenticated, public;
revoke all on table public.quote_lines from anon, authenticated, public;
revoke all on table public.orders from anon, authenticated, public;
revoke all on table public.order_lines from anon, authenticated, public;
revoke all on table public.inventory_stock from anon, authenticated, public;
revoke all on table public.known_customers from anon, authenticated, public;

revoke all on sequence public.master_no_seq from anon, authenticated, public;
revoke all on sequence public.order_no_seq from anon, authenticated, public;
revoke all on sequence public.quote_lines_id_seq from anon, authenticated, public;
revoke all on sequence public.order_lines_id_seq from anon, authenticated, public;

grant usage on schema public to service_role;
revoke all on table public.quotes from service_role;
revoke all on table public.quote_lines from service_role;
revoke all on table public.orders from service_role;
revoke all on table public.order_lines from service_role;
revoke all on table public.inventory_stock from service_role;
revoke all on table public.known_customers from service_role;
grant select, insert, update on table public.quotes to service_role;
grant select, insert, update, delete on table public.quote_lines to service_role;
grant select, insert, update on table public.orders to service_role;
grant select, insert, update, delete on table public.order_lines to service_role;
grant select, insert, update on table public.inventory_stock to service_role;
grant select on table public.known_customers to service_role;
grant usage, select on sequence public.master_no_seq to service_role;
grant usage, select on sequence public.order_no_seq to service_role;
grant usage, select on sequence public.quote_lines_id_seq to service_role;
grant usage, select on sequence public.order_lines_id_seq to service_role;
