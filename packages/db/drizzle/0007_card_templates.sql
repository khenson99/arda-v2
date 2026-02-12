CREATE TABLE "kanban"."card_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" varchar(120) NOT NULL,
  "format" varchar(50) NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "definition" jsonb NOT NULL,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "card_templates_tenant_fmt_status_idx"
  ON "kanban"."card_templates" USING btree ("tenant_id", "format", "status");

CREATE INDEX "card_templates_tenant_default_idx"
  ON "kanban"."card_templates" USING btree ("tenant_id", "format", "is_default");

CREATE UNIQUE INDEX "card_templates_default_active_unique_idx"
  ON "kanban"."card_templates" USING btree ("tenant_id", "format")
  WHERE "is_default" = true AND "status" = 'active';
