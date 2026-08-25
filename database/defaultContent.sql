/* Default language options */
INSERT INTO `languages` (`code`, `name`, `fallback`) VALUES ('DE', 'Deutsch', 'DE');
INSERT INTO `languages` (`code`, `name`, `fallback`) VALUES ('EN', 'English', 'EN');
INSERT INTO `languages` (`code`, `name`, `fallback`) VALUES ('FR', 'Français', 'FR');
INSERT INTO `languages` (`code`, `name`, `fallback`) VALUES ('LU', 'Lëtzebuergesch', 'LU');

/* Default 'Home' folder entries as required for various filesystem-based editors */
INSERT INTO
    `itemFolders`(`id`, `name`, `parent`, `options`, `owner`)
VALUES
    (NULL, 'Home', NULL, NULL, NULL);

INSERT INTO
    `loginsFolders`(`id`, `name`, `parent`, `owner`)
VALUES
    (NULL, 'Home', NULL, NULL);

INSERT INTO
    `testFolders`(`id`, `name`, `parent`, `owner`)
VALUES
    (NULL, 'Home', NULL, NULL);

/* Create the 'superadmin' usergroup */
INSERT INTO
    `userGroups`
VALUES
    (NULL, 'superadmin', NULL);

/* Create the 'admin' usergroup with default access to 'users' editor */
INSERT INTO
    `userGroups`
VALUES
    (
        NULL,
        'admin',
        '{"editorButtons": {"users":true}}'
    );

/* Create the default account as username 'demo' with password 'password' */
INSERT INTO
    `users`(
        `name`,
        `password`,
        `email`,
        `defLang`,
        `options`,
        `lastLogin`,
        `accessDef`,
        `homeaccess`,
        `status`,
        `bad_logins`,
        `last_bad_pass`,
        `acct_type`
    )
VALUES
    (
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
        'LOCAL'
    );

/* Place aforementioned 'demo' account into the 'superadmin' group */
INSERT INTO
    userGroupAccess
VALUES
    (
        NULL,
        (
            SELECT
                id
            FROM
                users
            WHERE
                name = 'demo'
        ),
        (
            SELECT
                id
            FROM
                userGroups
            WHERE
                name = 'superadmin'
        )
    );

-- ----------------------------
-- Records of systemState
-- ----------------------------
INSERT INTO
    `systemState`
VALUES
    ('backend', 0);

INSERT INTO
    `systemState`
VALUES
    ('frontend', 0);