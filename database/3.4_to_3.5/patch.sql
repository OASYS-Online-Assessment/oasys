SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `stateFrontend`
(
   `stateId` varchar(13) NOT NULL COMMENT 'id from the cookie',
   `instanceId` varchar(13) NOT NULL COMMENT 'id of the window',
   `active` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT 'updated on every use',
   `loginId` int(11) DEFAULT NULL COMMENT 'can be NULL if student id is used or in preview mode',
   `passwordId` int(11) DEFAULT NULL COMMENT 'can be NULL if student id is used or in preview mode',
   `testId` int(11) DEFAULT NULL COMMENT 'can be NULL if student id is used or in preview mode',
   `studentId` int(11) DEFAULT NULL COMMENT 'is NULL if student id feature is not used',
   `preview` varchar(255) DEFAULT NULL COMMENT 'type of preview shown or empty if not a preview',
   `data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'additional data fed to OASYS from external source (e.g. variables to be displayed)' CHECK (json_valid(`data`)),
   PRIMARY KEY (`stateId`, `instanceId`) USING BTREE
) ENGINE = InnoDB
   DEFAULT CHARSET = utf8mb4
   COLLATE = utf8mb4_unicode_520_ci;

ALTER TABLE `items`
    DROP INDEX `items_lockedBy`;
ALTER TABLE `items`
    DROP FOREIGN KEY `items_lockedBy`;
ALTER TABLE `items`
    ADD COLUMN `lock` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL DEFAULT NULL CHECK (json_valid(`lock`)) AFTER `link`;
ALTER TABLE `items`
    DROP COLUMN `lockedBy`;
ALTER TABLE `items`
    DROP COLUMN `lockedTS`;
ALTER TABLE inlTestSessions
    ADD COLUMN oid         INT UNSIGNED       NOT NULL,
    ADD COLUMN sessionType ENUM ('ST', 'ZLO') NOT NULL DEFAULT 'ST',
    ADD UNIQUE KEY unq_oid (oid);

ALTER TABLE `testCache` DROP FOREIGN KEY `testCache_passwordId`;
ALTER TABLE `testCache` DROP FOREIGN KEY `testCache_testId`;
ALTER TABLE `testCache` ADD CONSTRAINT `testCache_activity` FOREIGN KEY (`passwordId`, `testId`) REFERENCES `activity` (`passwordId`, `testId`) ON DELETE CASCADE ON UPDATE CASCADE;

DELETE FROM settings WHERE `option` = 'conceptMapsURL';

/* version incrementation */
INSERT INTO `dbPatchLog`
SET `patch`   = 47,
    `COMMENT` = 'Upgraded database from v043 to v047';
ALTER TABLE `settings`
    COMMENT = 'v047';

SET FOREIGN_KEY_CHECKS = 1;
