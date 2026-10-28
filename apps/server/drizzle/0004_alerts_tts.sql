CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"event" text NOT NULL,
	"gift_name" text,
	"like_step" integer,
	"template" text NOT NULL,
	"sound" text,
	"speak" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "tts_mode" text DEFAULT 'prefix' NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "tts_prefix" text DEFAULT '!tts' NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "tts_max_length" integer DEFAULT 150 NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "tts_cooldown_ms" integer DEFAULT 15000 NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "tts_min_level" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "tts_blocked_words" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "tts_voice" text;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Hand-written: existing hosts get the same starter alerts as new signups (see DEFAULT_ALERTS in src/alerts/defaults.ts).
INSERT INTO "alert_rules" ("host_id", "event", "like_step", "template", "sound")
  SELECT "id", v.event, v.like_step, v.template, v.sound FROM "hosts", (VALUES
    ('follow', NULL::integer, '{viewer} followed!', 'chime'),
    ('share', NULL::integer, '{viewer} shared the stream!', 'whoosh'),
    ('gift', NULL::integer, '{viewer} sent {count}× {gift}!', 'coin'),
    ('likes', 1000, '{total} likes! Thanks {viewer}', 'pop')
  ) AS v(event, like_step, template, sound);
