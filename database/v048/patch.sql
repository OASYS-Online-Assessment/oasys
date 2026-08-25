-- Ensure `activity` JSON column exists and is positioned after `options`.
-- This uses MariaDB's concise, idempotent syntax supported in 11.8.2+.
ALTER TABLE `users`
ADD COLUMN IF NOT EXISTS `activity` JSON NULL AFTER `options`;

-- Create new table 'dashboard' of type JSON if it does not exist already
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `dashboard` JSON NULL;

-- Remove legacy `lastLogin` column if it still exists (idempotent).
ALTER TABLE `users` DROP COLUMN IF EXISTS `lastLogin`;

/* version incrementation */

-- Insert patch record only if it does not already exist (idempotent).
INSERT INTO
    `dbPatchLog` (`patch`, `COMMENT`)
SELECT 48, 'Upgraded database to v048'
WHERE
    NOT EXISTS (
        SELECT 1
        FROM `dbPatchLog`
        WHERE
            `patch` = 48
    );

-- Update settings version value

ALTER TABLE `settings` COMMENT = 'v048';