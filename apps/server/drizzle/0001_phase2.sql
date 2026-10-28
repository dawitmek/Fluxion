CREATE TABLE "gift_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"gift_name" text NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "gift_triggers_host_id_gift_name_unique" UNIQUE("host_id","gift_name")
);
--> statement-breakpoint
CREATE TABLE "viewer_stats" (
	"host_id" uuid NOT NULL,
	"viewer_id" text NOT NULL,
	"commands" integer DEFAULT 0 NOT NULL,
	"gifts" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "viewer_stats_host_id_viewer_id_pk" PRIMARY KEY("host_id","viewer_id")
);
--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "mode" text DEFAULT 'anarchy' NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "vote_window_ms" integer DEFAULT 3000 NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "turn_ms" integer DEFAULT 30000 NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "gift_boosts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "gift_triggers" ADD CONSTRAINT "gift_triggers_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_triggers" ADD CONSTRAINT "gift_triggers_command_id_commands_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."commands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewer_stats" ADD CONSTRAINT "viewer_stats_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;