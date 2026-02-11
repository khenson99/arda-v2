ALTER TABLE "orders"."purchase_orders"
  ADD COLUMN "payment_terms" text,
  ADD COLUMN "shipping_terms" text;

ALTER TABLE "orders"."purchase_order_lines"
  ADD COLUMN "description" text,
  ADD COLUMN "order_method" varchar(30),
  ADD COLUMN "source_url" text;
