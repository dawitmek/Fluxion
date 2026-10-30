CREATE TABLE "overlay_screens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token" text NOT NULL,
	"main" boolean DEFAULT false NOT NULL,
	"position" serial NOT NULL,
	"alerts" boolean DEFAULT true NOT NULL,
	"feed" boolean DEFAULT true NOT NULL,
	"leaderboard" boolean DEFAULT true NOT NULL,
	"mode" boolean DEFAULT true NOT NULL,
	"audio" boolean DEFAULT true NOT NULL,
	"alert_position" text DEFAULT 'middle' NOT NULL,
	"scale" integer DEFAULT 100 NOT NULL,
	CONSTRAINT "overlay_screens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "screen_id" uuid;--> statement-breakpoint
ALTER TABLE "overlay_screens" ADD CONSTRAINT "overlay_screens_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "overlay_screens_host_idx" ON "overlay_screens" USING btree ("host_id");--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_screen_id_overlay_screens_id_fk" FOREIGN KEY ("screen_id") REFERENCES "public"."overlay_screens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Every host's existing overlay address becomes their main screen.
INSERT INTO "overlay_screens" ("host_id", "name", "token", "main") SELECT "id", 'Main', "overlay_token", true FROM "hosts";
