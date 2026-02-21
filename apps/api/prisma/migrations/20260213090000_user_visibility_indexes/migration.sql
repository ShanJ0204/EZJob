CREATE INDEX "idx_match_results_user_created_at"
    ON "match_results"("user_id", "created_at" DESC);

CREATE INDEX "idx_notification_events_user_decision_created"
    ON "notification_events"("user_id", "decision", "created_at" DESC);

CREATE INDEX "idx_application_attempts_user_attempted_at"
    ON "application_attempts"("user_id", "attempted_at" DESC);
