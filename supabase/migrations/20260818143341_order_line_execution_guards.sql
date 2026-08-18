-- Reject impossible fulfillment states even if a malformed request bypasses
-- the browser. These guards deliberately allow partial shipment/invoicing.

alter table public.order_lines
  add constraint order_lines_shipped_within_ordered_check
    check (shipped_qty >= 0 and shipped_qty <= quantity),
  add constraint order_lines_reserved_within_remaining_check
    check (reserved_qty >= 0 and reserved_qty + shipped_qty <= quantity),
  add constraint order_lines_to_ship_within_reserved_check
    check (qty_to_ship >= 0 and qty_to_ship <= reserved_qty),
  add constraint order_lines_invoiced_within_shipped_check
    check (invoiced_qty >= 0 and invoiced_qty <= shipped_qty),
  add constraint order_lines_to_invoice_within_shipped_check
    check (qty_to_invoice >= 0 and qty_to_invoice + invoiced_qty <= shipped_qty),
  add constraint order_lines_backorder_within_remaining_check
    check (backorder_qty >= 0 and backorder_qty <= quantity - shipped_qty);
