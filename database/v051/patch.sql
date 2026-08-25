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

/* version incrementation */

-- Insert patch record only if it does not already exist (idempotent).
INSERT INTO
    `dbPatchLog` (`patch`, `COMMENT`)
SELECT 51, 'Changed sendFrequency unit from milliseconds to seconds'
WHERE
    NOT EXISTS (
        SELECT 1
        FROM `dbPatchLog`
        WHERE
            `patch` = 51
    );

-- Update settings version value

ALTER TABLE `settings` COMMENT = 'v051';
