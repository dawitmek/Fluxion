CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"profile_id" uuid,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" serial NOT NULL,
	"trigger" text NOT NULL,
	"gift_name" text,
	"min_diamonds" integer,
	"like_step" integer,
	"command" text,
	"audience" text DEFAULT 'everyone' NOT NULL,
	"audience_viewer" text,
	"cooldown_ms" integer DEFAULT 0 NOT NULL,
	"viewer_cooldown_ms" integer DEFAULT 0 NOT NULL,
	"random" boolean DEFAULT false NOT NULL,
	"text" text,
	"sound" text,
	"sound_media_id" uuid,
	"media_id" uuid,
	"speak" boolean DEFAULT false NOT NULL,
	"duration_ms" integer DEFAULT 5000 NOT NULL,
	"key_command_id" uuid,
	"repeat_with_count" boolean DEFAULT false NOT NULL,
	"points" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_sound_media_id_media_id_fk" FOREIGN KEY ("sound_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_key_command_id_commands_id_fk" FOREIGN KEY ("key_command_id") REFERENCES "public"."commands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actions_host_idx" ON "actions" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "media_host_idx" ON "media" USING btree ("host_id");--> statement-breakpoint
-- Alerts become actions that apply with every profile.
INSERT INTO "actions" ("host_id", "name", "enabled", "trigger", "gift_name", "like_step", "text", "sound", "speak")
SELECT "host_id",
  CASE "event" WHEN 'follow' THEN 'Follow alert' WHEN 'share' THEN 'Share alert' WHEN 'likes' THEN 'Likes alert'
    ELSE coalesce('Gift alert: ' || "gift_name", 'Gift alert') END,
  "enabled", "event", "gift_name", "like_step", "template", "sound", "speak"
FROM "alert_rules" ORDER BY "host_id", "event";--> statement-breakpoint
-- Gift triggers become key-press actions in their profile, pressing once per gift in a streak.
INSERT INTO "actions" ("host_id", "profile_id", "name", "trigger", "gift_name", "key_command_id", "repeat_with_count")
SELECT t."host_id", t."profile_id", t."gift_name" || ' presses ' || c."keyword", 'gift', t."gift_name", t."command_id", true
FROM "gift_triggers" t JOIN "commands" c ON c."id" = t."command_id";
