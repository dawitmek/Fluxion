CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"name" text NOT NULL,
	"game_process" text,
	"mode" text DEFAULT 'anarchy' NOT NULL,
	"vote_window_ms" integer DEFAULT 3000 NOT NULL,
	"turn_ms" integer DEFAULT 30000 NOT NULL,
	"gift_boosts" boolean DEFAULT true NOT NULL,
	CONSTRAINT "profiles_host_id_name_unique" UNIQUE("host_id","name")
);
--> statement-breakpoint
ALTER TABLE "commands" DROP CONSTRAINT "commands_host_id_keyword_unique";--> statement-breakpoint
ALTER TABLE "gift_triggers" DROP CONSTRAINT "gift_triggers_host_id_gift_name_unique";--> statement-breakpoint
ALTER TABLE "commands" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
ALTER TABLE "commands" ADD COLUMN "min_level" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "gift_triggers" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "active_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "progression" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "level_gating" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "viewer_stats" ADD COLUMN "xp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Hand-written data migration: each existing host gets a "Default" profile holding its current setup.
INSERT INTO "profiles" ("host_id", "name", "mode", "vote_window_ms", "turn_ms", "gift_boosts")
  SELECT "id", 'Default', "mode", "vote_window_ms", "turn_ms", "gift_boosts" FROM "hosts";--> statement-breakpoint
UPDATE "hosts" SET "active_profile_id" = "profiles"."id" FROM "profiles" WHERE "profiles"."host_id" = "hosts"."id";--> statement-breakpoint
UPDATE "commands" SET "profile_id" = "hosts"."active_profile_id" FROM "hosts" WHERE "hosts"."id" = "commands"."host_id";--> statement-breakpoint
UPDATE "gift_triggers" SET "profile_id" = "hosts"."active_profile_id" FROM "hosts" WHERE "hosts"."id" = "gift_triggers"."host_id";--> statement-breakpoint
UPDATE "viewer_stats" SET "xp" = "commands" + "gifts";--> statement-breakpoint
ALTER TABLE "commands" ALTER COLUMN "profile_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "gift_triggers" ALTER COLUMN "profile_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commands" ADD CONSTRAINT "commands_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_triggers" ADD CONSTRAINT "gift_triggers_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosts" ADD CONSTRAINT "hosts_active_profile_id_profiles_id_fk" FOREIGN KEY ("active_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commands" ADD CONSTRAINT "commands_profile_id_keyword_unique" UNIQUE("profile_id","keyword");--> statement-breakpoint
ALTER TABLE "gift_triggers" ADD CONSTRAINT "gift_triggers_profile_id_gift_name_unique" UNIQUE("profile_id","gift_name");