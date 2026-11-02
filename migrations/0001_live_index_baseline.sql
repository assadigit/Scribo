-- 0001_live_index_baseline.sql
-- Baseline for indexes that exist in the LIVE D1 database ("feather") but were
-- not part of 0000_baseline.sql. Found during the 2026-11-02 repo sync by
-- diffing the live schema export against the migration chain.
--
-- SAFETY: every statement uses IF NOT EXISTS, so running this on the live
-- database is a NO-OP (all of these indexes already exist there). It only
-- creates them on fresh local databases. Nothing is dropped and no table
-- data is touched.
--
-- NOTE: the live database enforces the unique token constraint through
-- idx_share_links_token (see below). The differently-named
-- share_links_token_unique from 0000_baseline.sql does NOT exist on live
-- (it was replaced there by idx_share_links_token). The DROP below is
-- IF EXISTS, so on the live database it does nothing; on fresh local
-- databases it removes the redundant duplicate so they match live exactly.
DROP INDEX IF EXISTS `share_links_token_unique`;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_share_links_text_created` ON `share_links` (`text_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_share_links_token` ON `share_links` (`token`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_chapters_text_pos` ON `chapters` (`text_id`,`position`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comments_text_created` ON `comments` (`text_id`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comments_version_created` ON `comments` (`version_id`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_reset_codes_expires` ON `password_reset_codes` (`expires_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_read_sessions_completed` ON `read_sessions` (`completed`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_read_sessions_seen` ON `read_sessions` (`last_seen_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_read_sessions_text_seen` ON `read_sessions` (`text_id`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sessions_expires` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tags_owner` ON `tags` (`owner_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_texts_updated` ON `texts` (`updated_at`);
