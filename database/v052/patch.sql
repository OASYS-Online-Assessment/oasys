-- Record when a login row is created. For template-derived logins this is the
-- dataset creation time. Add the column with a NULL default first so existing
-- rows are not incorrectly stamped with the migration time.
ALTER TABLE `logins`
ADD COLUMN IF NOT EXISTS `createdAt` timestamp(3) NULL DEFAULT NULL AFTER `displayName`;

-- For existing template datasets that have activity, the first recorded test
-- login is the closest reliable approximation of their creation time. Empty
-- historical datasets remain NULL because their creation time cannot be
-- recovered from the existing schema.
UPDATE `logins` AS `dataset`
INNER JOIN (
    SELECT
        `loginId`,
        MIN(`tsFirstLoginServer`) AS `firstActivity`
    FROM `activity`
    WHERE `tsFirstLoginServer` IS NOT NULL
    GROUP BY `loginId`
) AS `recordedActivity`
    ON `recordedActivity`.`loginId` = `dataset`.`id`
SET `dataset`.`createdAt` = `recordedActivity`.`firstActivity`
WHERE
    `dataset`.`template` = 'cloned'
    AND `dataset`.`createdAt` IS NULL;

-- New regular logins and template datasets receive their exact creation time.
-- Existing NULL values remain NULL when the column definition is modified.
ALTER TABLE `logins`
MODIFY COLUMN `createdAt` timestamp(3) NULL DEFAULT current_timestamp(3) AFTER `displayName`;

-- Support date-filtered dataset lookup within a template.
CREATE INDEX IF NOT EXISTS `loginsParentTemplateCreatedAt`
ON `logins` (`parentTemplateId`, `createdAt`);

/* version incrementation */

-- Insert patch record only if it does not already exist (idempotent).
INSERT INTO
    `dbPatchLog` (`patch`, `COMMENT`)
SELECT 52, 'Added login and template dataset creation timestamps'
WHERE
    NOT EXISTS (
        SELECT 1
        FROM `dbPatchLog`
        WHERE
            `patch` = 52
    );

-- Update settings version value

ALTER TABLE `settings` COMMENT = 'v052';
