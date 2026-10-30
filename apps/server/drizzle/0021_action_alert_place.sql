ALTER TABLE "actions" ADD COLUMN "alert_x" real;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "alert_y" real;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "alert_scale" integer DEFAULT 100 NOT NULL;