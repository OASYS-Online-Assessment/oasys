SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Add JSON storage for user activity and dashboard data, and remove the
-- legacy last-login column.
ALTER TABLE `users`
ADD COLUMN IF NOT EXISTS `activity` JSON NULL AFTER `options`;

ALTER TABLE `users`
ADD COLUMN IF NOT EXISTS `dashboard` JSON NULL;

ALTER TABLE `users`
DROP COLUMN IF EXISTS `lastLogin`;

-- Add the backend state table required by atomic backend sessions.
DROP TABLE IF EXISTS `stateBackend`;
CREATE TABLE `stateBackend` (
    `stateId` varchar(20) NOT NULL COMMENT 'id from the cookie',
    `active` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT 'updated on every use',
    `data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'additional data fed to OASYS from external source (e.g. variables to be displayed)' CHECK (json_valid(`data`)),
    PRIMARY KEY (`stateId`) USING BTREE,
    FULLTEXT KEY `stateId` (`stateId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- Add info storage for item groups.
ALTER TABLE `itemGroups`
ADD COLUMN IF NOT EXISTS `info` longtext DEFAULT NULL AFTER `options`;

-- Link cloned anonymous logins back to their source template.
ALTER TABLE `logins`
ADD COLUMN IF NOT EXISTS `parentTemplateId` int(11) DEFAULT NULL AFTER `loginType`;

CREATE INDEX IF NOT EXISTS `loginsParentTemplateId`
ON `logins` (`parentTemplateId`);

-- Clones are named from their template plus a trailing "_00000001" counter.
-- Move matched clones out of the folder tree and link them to the template.
UPDATE `logins` AS `cloned`
JOIN `logins` AS `template`
    ON `template`.`template` = 'template'
    AND `template`.`name` = REGEXP_REPLACE(`cloned`.`name`, '_[0-9]{8}$', '')
SET
    `cloned`.`parent` = NULL,
    `cloned`.`parentTemplateId` = `template`.`id`
WHERE
    `cloned`.`template` = 'cloned'
    AND `cloned`.`name` REGEXP '_[0-9]{8}$';

-- If no matching template exists, keep the login visible as a regular testee.
UPDATE `logins` AS `cloned`
LEFT JOIN `logins` AS `template`
    ON `template`.`template` = 'template'
    AND `template`.`name` = REGEXP_REPLACE(`cloned`.`name`, '_[0-9]{8}$', '')
SET
    `cloned`.`template` = 'testee',
    `cloned`.`parentTemplateId` = NULL
WHERE
    `cloned`.`template` = 'cloned'
    AND `cloned`.`parentTemplateId` IS NULL
    AND (
        `cloned`.`name` NOT REGEXP '_[0-9]{8}$'
        OR `template`.`id` IS NULL
    );

-- Convert any stored sendFrequency override from milliseconds to seconds and
-- constrain it to the new 5-second through 5-minute range. Values already in
-- that range are left unchanged, making this idempotent.
UPDATE `settings`
SET `value` = LEAST(
    300,
    GREATEST(
        5,
        CASE
            WHEN CAST(`value` AS UNSIGNED) > 300
                THEN ROUND(CAST(`value` AS UNSIGNED) / 1000)
            ELSE CAST(`value` AS UNSIGNED)
        END
    )
)
WHERE `option` = 'sendFrequency'
  AND `encryption` = 0;

-- Record when a login row is created. Add the column with a NULL default first
-- so existing rows are not incorrectly stamped with the migration time.
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

-- Remove the deprecated session storage table.
DROP TABLE IF EXISTS `sessions`;

/* version incrementation */
INSERT INTO `dbPatchLog` (`patch`, `COMMENT`)
SELECT 53, 'Upgraded database from v047 to v053'
WHERE NOT EXISTS (
    SELECT 1
    FROM `dbPatchLog`
    WHERE `patch` = 53
);

ALTER TABLE `settings`
COMMENT = 'v053';

SET FOREIGN_KEY_CHECKS = 1;
