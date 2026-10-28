ALTER TABLE "hosts" ADD COLUMN "tts_engine" text DEFAULT 'piper' NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "tts_espeak_voice" text DEFAULT 'en-us' NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "tts_piper_voice" text;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "tts_cloud_provider" text;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "tts_cloud_key" text;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "tts_cloud_region" text;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "tts_cloud_voice" text;