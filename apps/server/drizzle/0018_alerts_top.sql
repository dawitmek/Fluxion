ALTER TABLE "overlay_screens" ALTER COLUMN "alert_position" SET DEFAULT 'top';--> statement-breakpoint
-- Top is where alerts always appeared; screens made before this get it too.
UPDATE "overlay_screens" SET "alert_position" = 'top';
