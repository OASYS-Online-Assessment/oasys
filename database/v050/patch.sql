-- Add info storage for item groups.
ALTER TABLE `itemGroups`
ADD COLUMN IF NOT EXISTS `info` longtext DEFAULT NULL AFTER `options`;

-- Link cloned anonymous logins back to their source template.
ALTER TABLE `logins`
ADD COLUMN IF NOT EXISTS `parentTemplateId` int(11) DEFAULT NULL AFTER `loginType`;

CREATE INDEX IF NOT EXISTS `loginsParentTemplateId` ON `logins` (`parentTemplateId`);

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

/* version incrementation */

-- Insert patch record only if it does not already exist (idempotent).
INSERT INTO
    `dbPatchLog` (`patch`, `COMMENT`)
SELECT 50, 'Added item group info and linked cloned logins to templates'
WHERE
    NOT EXISTS (
        SELECT 1
        FROM `dbPatchLog`
        WHERE
            `patch` = 50
    );

-- Update settings version value

ALTER TABLE `settings` COMMENT = 'v050';
