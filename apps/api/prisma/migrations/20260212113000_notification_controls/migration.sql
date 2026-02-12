ALTER TABLE "user_preferences"
  ADD COLUMN "notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "max_notifications_per_hour" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "quiet_hours_start" INTEGER,
  ADD COLUMN "quiet_hours_end" INTEGER,
  ADD COLUMN "time_zone" TEXT NOT NULL DEFAULT 'UTC';

ALTER TABLE "notification_events"
  ADD COLUMN "external_message_id" TEXT,
  ADD COLUMN "decision" TEXT;

CREATE INDEX "idx_notification_events_external_message_id"
  ON "notification_events"("external_message_id");
