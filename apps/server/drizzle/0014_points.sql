ALTER TABLE "commands" ADD COLUMN "cost" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "points" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "points_per_chat" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "points_per_diamond" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "points_per_follow" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "points_per_share" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "points_check" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "viewer_stats" ADD COLUMN "points" integer DEFAULT 0 NOT NULL;