<?php

/** Shared object-level permission helpers for Activity Tracker and its log preview. */

function activityTrackerHasLoginFolderAccess(int $folderId, rixPDO &$db, string $need = 'read'): bool
{
    global $myAuth;
    if ($folderId <= 0) return false;
    if ($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin()) return true;

    static $cache = [];
    $cacheKey = $need . ':' . $folderId;
    if (array_key_exists($cacheKey, $cache)) return $cache[$cacheKey];

    $owner = (int)($db->fetchValue("SELECT `owner` FROM `loginsFolders` WHERE `id` = ?", [$folderId])['data'] ?? 0);
    if ($owner === (int)$myAuth->userid) return $cache[$cacheKey] = true;

    $groups = is_array($myAuth->usergroup ?? null) ? $myAuth->usergroup : [];
    if (count($groups) === 0) return $cache[$cacheKey] = false;
    $placeholders = implode(',', array_fill(0, count($groups), '?'));
    $permissionClause = $need === 'write'
        ? "(
            JSON_EXTRACT(accessDef, '$.c_items.Write') IN ('true', true)
            OR JSON_EXTRACT(accessDef, '$.items.deleteItem') IN ('true', true)
            OR JSON_EXTRACT(accessDef, '$.items.editPassword') IN ('true', true)
            OR JSON_EXTRACT(accessDef, '$.items.newPassword') IN ('true', true)
            OR JSON_EXTRACT(accessDef, '$.items.saveOverrides') IN ('true', true)
            OR JSON_EXTRACT(accessDef, '$.items.bulkEdit') IN ('true', true)
        )"
        : "(
            JSON_EXTRACT(accessDef, '$.c_items.Read') IN ('true', true)
            OR JSON_EXTRACT(accessDef, '$.c_items.Write') IN ('true', true)
            OR JSON_EXTRACT(accessDef, '$.items.fetchLibrary') IN ('true', true)
            OR JSON_EXTRACT(accessDef, '$.items.fetchItem') IN ('true', true)
            OR JSON_EXTRACT(accessDef, '$.items.search') IN ('true', true)
            OR JSON_EXTRACT(accessDef, '$.items.deleteItem') IN ('true', true)
            OR JSON_EXTRACT(accessDef, '$.items.editPassword') IN ('true', true)
        )";
    $params = [$folderId, ...$groups];
    $allowed = $db->fetchValue(
        "SELECT EXISTS(
            SELECT 1 FROM `loginsFolderAccess`
            WHERE `folderId` = ? AND `userGroupId` IN ($placeholders) AND $permissionClause
        )",
        $params
    );
    return $cache[$cacheKey] = in_array($allowed['data'] ?? null, [1, '1', true], true);
}

function activityTrackerResolveObject(int $passwordId, int $testId, rixPDO &$db): ?array
{
    if ($passwordId <= 0 || $testId <= 0) return null;
    $row = $db->fetchRow(
        "SELECT activity.loginId, activity.passwordId, activity.testId,
                COALESCE(templateLogin.parent, logins.parent) AS folderId
         FROM activity
         JOIN logins ON activity.loginId = logins.id
         LEFT JOIN logins templateLogin ON templateLogin.id = logins.parentTemplateId
         WHERE activity.passwordId = ? AND activity.testId = ? LIMIT 1",
        [$passwordId, $testId]
    );
    return ($row['rows'] ?? 0) > 0 ? $row['data'] : null;
}

function activityTrackerResolveLoginFolder(int $loginId, rixPDO &$db): int
{
    if ($loginId <= 0) return 0;
    return (int)($db->fetchValue(
        "SELECT COALESCE(templateLogin.parent, logins.parent)
         FROM logins
         LEFT JOIN logins templateLogin ON templateLogin.id = logins.parentTemplateId
         WHERE logins.id = ? LIMIT 1",
        [$loginId]
    )['data'] ?? 0);
}

function activityTrackerCanAccessLogin(int $loginId, rixPDO &$db, string $need = 'read'): bool
{
    return activityTrackerHasLoginFolderAccess(activityTrackerResolveLoginFolder($loginId, $db), $db, $need);
}

function activityTrackerCanAccessObject(int $passwordId, int $testId, rixPDO &$db, string $need = 'read'): bool
{
    $object = activityTrackerResolveObject($passwordId, $testId, $db);
    if ($object === null) return false;
    return activityTrackerHasLoginFolderAccess((int)$object['folderId'], $db, $need);
}
