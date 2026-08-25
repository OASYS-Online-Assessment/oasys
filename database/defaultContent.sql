/* Default language options */
INSERT IGNORE INTO `languages` (`code`, `name`, `fallback`) VALUES ('DE', 'Deutsch', 'DE');
INSERT IGNORE INTO `languages` (`code`, `name`, `fallback`) VALUES ('EN', 'English', 'EN');
INSERT IGNORE INTO `languages` (`code`, `name`, `fallback`) VALUES ('FR', 'Français', 'FR');
INSERT IGNORE INTO `languages` (`code`, `name`, `fallback`) VALUES ('LU', 'Lëtzebuergesch', 'LU');

/* Default 'Home' folder entries as required for various filesystem-based editors */
INSERT IGNORE INTO
    `itemFolders`(`id`, `name`, `parent`, `options`, `owner`)
VALUES
    (1, 'Home', NULL, NULL, NULL);

INSERT IGNORE INTO
    `loginsFolders`(`id`, `name`, `parent`, `owner`)
VALUES
    (1, 'Home', NULL, NULL);

INSERT IGNORE INTO
    `testFolders`(`id`, `name`, `parent`, `owner`)
VALUES
    (1, 'Home', NULL, NULL);

/* Create the 'superadmin' usergroup */
INSERT INTO `userGroups` (`name`, `accessDef`)
SELECT 'superadmin', NULL
WHERE NOT EXISTS (SELECT 1 FROM `userGroups` WHERE `name` = 'superadmin');

/* Create the 'admin' usergroup with default access to 'users' editor */
INSERT INTO `userGroups` (`name`, `accessDef`)
SELECT 'admin', '{"editorButtons": {"users":true}}'
WHERE NOT EXISTS (SELECT 1 FROM `userGroups` WHERE `name` = 'admin');

/* Create the default account as username 'demo' with password 'password' */
INSERT INTO
    `users`(
        `name`,
        `password`,
        `email`,
        `defLang`,
        `options`,
        `activity`,
        `accessDef`,
        `homeaccess`,
        `status`,
        `bad_logins`,
        `last_bad_pass`,
        `acct_type`,
        `resetData`,
        `dashboard`
    )
SELECT
    'demo',
    '$2y$10$Pb/dzQ5FZxqeyo3kYxBzjOayppFYCsO4gIokNh1PeEXswNfYZ51PG',
    NULL,
    'EN',
    NULL,
    NULL,
    '{"c_items": {"Elevated Administrator": true }, "items": { "adminElevated": true }, "userSettings": { "disableAnimations": false, "defaultLanguage": "EN"}}',
    1,
    1,
    0,
    NULL,
    'LOCAL',
    NULL,
    NULL
WHERE NOT EXISTS (SELECT 1 FROM `users` WHERE `name` = 'demo');

/* Place aforementioned 'demo' account into the 'superadmin' group */
INSERT IGNORE INTO `userGroupAccess` (`userId`, `usergroupId`)
SELECT u.id, g.id
FROM `users` AS u
JOIN `userGroups` AS g ON g.name = 'superadmin'
WHERE u.name = 'demo';

-- ----------------------------
-- Records of systemState
-- ----------------------------
INSERT INTO `systemState` (`sys_section`, `status`)
SELECT 'backend', 0
WHERE NOT EXISTS (SELECT 1 FROM `systemState` WHERE `sys_section` = 'backend');

INSERT INTO `systemState` (`sys_section`, `status`)
SELECT 'frontend', 0
WHERE NOT EXISTS (SELECT 1 FROM `systemState` WHERE `sys_section` = 'frontend');
