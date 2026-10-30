ALTER TABLE "actions" ADD COLUMN "alert_style" jsonb;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "ui_theme" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "ui_theme_style" text DEFAULT 'full' NOT NULL;