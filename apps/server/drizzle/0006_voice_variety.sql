ALTER TABLE "hosts" ADD COLUMN "tts_piper_speaker" integer;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "tts_effect" text DEFAULT 'none' NOT NULL;