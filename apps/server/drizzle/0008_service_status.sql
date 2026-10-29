CREATE TABLE "service_status" (
	"name" text PRIMARY KEY NOT NULL,
	"ok" boolean NOT NULL,
	"detail" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
