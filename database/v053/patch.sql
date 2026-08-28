-- Remove the deprecated session storage table.
DROP TABLE IF EXISTS `sessions`;

/* version incrementation */

-- Insert patch record only if it does not already exist (idempotent).
INSERT INTO
    `dbPatchLog` (`patch`, `COMMENT`)
SELECT 53, 'Removed deprecated sessions table'
WHERE
    NOT EXISTS (
        SELECT 1
        FROM `dbPatchLog`
        WHERE
            `patch` = 53
    );

-- Update settings version value

ALTER TABLE `settings` COMMENT = 'v053';
