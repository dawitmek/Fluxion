CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"name" text NOT NULL,
	"metric" text NOT NULL,
	"target" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" serial NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "goal_id" uuid;--> statement-breakpoint
ALTER TABLE "overlay_screens" ADD COLUMN "widgets" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goals_host_idx" ON "goals" USING btree ("host_id");--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;