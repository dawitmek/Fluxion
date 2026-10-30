ALTER TABLE "viewer_stats" ADD COLUMN "streamer" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Stats so far go to the account each host has set now (lowercase, no @), the one they most likely earned them on.
UPDATE "viewer_stats" SET "streamer" = lower(regexp_replace(coalesce(h."tiktok_username", ''), '^@', '')) FROM "hosts" h WHERE h."id" = "viewer_stats"."host_id";--> statement-breakpoint
ALTER TABLE "viewer_stats" DROP CONSTRAINT "viewer_stats_host_id_viewer_id_pk";--> statement-breakpoint
ALTER TABLE "viewer_stats" ADD CONSTRAINT "viewer_stats_host_id_streamer_viewer_id_pk" PRIMARY KEY("host_id","streamer","viewer_id");
