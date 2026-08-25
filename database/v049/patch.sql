SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for stateBackend
-- ----------------------------
DROP TABLE IF EXISTS `stateBackend`;
CREATE TABLE `stateBackend` (
                                `stateId` varchar(20) NOT NULL COMMENT 'id from the cookie',
                                `active` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT 'updated on every use',
                                `data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'additional data fed to OASYS from external source (e.g. variables to be displayed)' CHECK (json_valid(`data`)),
                                PRIMARY KEY (`stateId`) USING BTREE,
                                FULLTEXT KEY `stateId` (`stateId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

SET FOREIGN_KEY_CHECKS = 1;

/* version incrementation */

-- Insert patch record only if it does not already exist (idempotent).
INSERT INTO
    `dbPatchLog` (`patch`, `COMMENT`)
SELECT 49, 'Added stateBackend table'
WHERE
    NOT EXISTS (
        SELECT 1
        FROM `dbPatchLog`
        WHERE
            `patch` = 49
    );

-- Update settings version value

ALTER TABLE `settings` COMMENT = 'v049';