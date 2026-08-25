<?php
register_shutdown_function('outputActivityTrackerJSON');
$filterSettings = false;

require_once __DIR__ . "/inc/php/initBackend.php";
require_once __DIR__ . '/../inc/php/OasysActivity.php';
require_once __DIR__ . '/../inc/php/OasysFrontendState.php';
require_once __DIR__ . '/inc/php/testJourneyData.php';

use Oasys\FrontEnd\OasysFrontendState;

const STATUS_CLOSED  = 0;
const STATUS_ACTIVE  = 1;
const STATUS_TIMEOUT = 2;
const STATUS_ABORTED = 3;
const STATUS_REOPENED = 4;

$data = filter_input(INPUT_POST, 'data');
if ($data) {
    $data = json_decode($data ?? '{}', true);
}
if (!$data) {
    $data = [];
}

$action = filter_input(INPUT_POST, 'action');
if ($action) {
    $action = json_decode($action ?? '{}', true);
}
if (!$action) {
    $action = false;
}

require_once '../inc/php/rixTools.php';
require_once '../inc/php/Crypt.php';
require_once '../inc/php/helperRoutines.php';
require_once '../inc/php/parser.php';
require_once '../inc/php/OasysScoring.php';

// all data that is returned by this script will be put into $returnData array which is sent back in JSON encoded form
$returnData = $data;
$returnData['error'] = false;

# ----------------------- #
# Authentication Includes #
# ----------------------- #
$pageName = "activityTracker";
$isSubMod = false;
$isActionFile = true;
require_once 'inc/php/authCommonFunctions.php';
require_once 'inc/php/activityTrackerPermissions.php';

// make a connection to the database and define the log file in which database errors are to be recorded
$db = $config->getDatabaseInstance();
$results = $db->results();
if ($results['error']) {
    $returnData['error'] = 'mySQL connection error';
    die();
}

if ($action !== false) {
    if (!is_array($action) || !is_string($action['action'] ?? null)) {
        $returnData['error'] = $uiLang->translate("Invalid action request.");
    } else {
        if (oasysRejectUnknownAction(__FILE__, $action['action'], $returnData)) exit;
        switch ($action['action']) {
            case 'reopenTest':
                reopenTest($action, $db, $returnData);
                break;
            case 'closeTest':
                closeTest($action, $db, $returnData);
                break;
            case 'addTime':
                addTime($action, $db, $returnData);
                break;
            case 'resetActivity':
                resetActivity($action, $db, $returnData);
                break;
            case 'fetchJourneySelection':
                fetchActivityJourneySelection($action, $db, $returnData);
                break;
            case 'fetchJourneyDetail':
                fetchActivityJourneyDetail($action, $db, $returnData);
                break;
            default:
                $returnData['error'] = $uiLang->translate("Unknown Activity Tracker action.");
                break;
        }
    }
}

if (!in_array($action['action'] ?? '', ['fetchJourneySelection', 'fetchJourneyDetail'], true)) {
    fetchActivity($data, $db, $returnData);
}

function assertActivityAccess(?int $passwordId, ?int $testId, rixPDO &$db, array &$returnData, string $need = 'read'): bool
{
    global $uiLang;

    if ($passwordId === null || $passwordId <= 0 || $testId === null || $testId <= 0) {
        $returnData['error'] = $uiLang->translate("Missing or invalid activity identifier.");
        return false;
    }

    if (activityTrackerResolveObject($passwordId, $testId, $db) === null) {
        $returnData['error'] = $uiLang->translate("Activity entry not found.");
        return false;
    }

    if (!activityTrackerCanAccessObject($passwordId, $testId, $db, $need)) {
        $returnData['error'] = $uiLang->translate(
            $need === 'write'
                ? "You do not have write permission for this activity."
                : "You do not have permission for this activity."
        );
        return false;
    }

    return true;
}

function fetchActivityJourneyDetail(array $action, rixPDO &$db, array &$returnData): void
{
    $passwordId = isset($action['passwordId']) ? (int)$action['passwordId'] : 0;
    $testId = isset($action['testId']) ? (int)$action['testId'] : 0;
    if (!assertActivityAccess($passwordId, $testId, $db, $returnData)) return;
    journeyBuildDetailResponse($passwordId, $testId, $db, $returnData);
}

function fetchActivityJourneySelection(array $action, rixPDO &$db, array &$returnData): void
{
    global $uiLang;
    $scope = (string)($action['scope'] ?? '');
    $loginId = (int)($action['loginId'] ?? 0);
    $passwordId = (int)($action['passwordId'] ?? 0);
    $testId = (int)($action['testId'] ?? 0);

    $where = '';
    $params = [];
    $assignmentLoginId = 0;
    if ($scope === 'login' && $loginId > 0) {
        if (!activityTrackerCanAccessLogin($loginId, $db)) {
            $returnData['error'] = $uiLang->translate("You do not have permission for this activity.");
            return;
        }
        $where = 'activity.loginId = ?';
        $params = [$loginId];
        $assignmentLoginId = $loginId;
    } elseif ($scope === 'password' && $passwordId > 0) {
        $resolvedLoginId = (int)($db->fetchValue(
            "SELECT COALESCE(activity.loginId, passwords.loginID)
             FROM passwords
             LEFT JOIN activity ON activity.passwordId = passwords.id
             WHERE passwords.id = ? LIMIT 1",
            [$passwordId]
        )['data'] ?? 0);
        if ($resolvedLoginId <= 0 || !activityTrackerCanAccessLogin($resolvedLoginId, $db)) {
            $returnData['error'] = $uiLang->translate("You do not have permission for this activity.");
            return;
        }
        $where = 'activity.passwordId = ?';
        $params = [$passwordId];
        $assignmentLoginId = $resolvedLoginId;
    } elseif ($scope === 'run' && $passwordId > 0 && $testId > 0) {
        if (!assertActivityAccess($passwordId, $testId, $db, $returnData)) return;
        $where = 'activity.passwordId = ? AND activity.testId = ?';
        $params = [$passwordId, $testId];
    } else {
        $returnData['error'] = $uiLang->translate("Missing or invalid activity identifier.");
        return;
    }

    $rows = $db->fetchTable(
        "SELECT
            activity.loginId,
            activity.passwordId,
            activity.testId,
            activity.timeLimit,
            activity.timeLeft,
            activity.progress,
            activity.clientOpen,
            CAST(activity.tsActiveServer AS CHAR) AS tsActiveServer,
            TIMESTAMPDIFF(SECOND, activity.tsActiveServer, NOW()) AS silenceSeconds,
            tests.name AS testName,
            logins.name AS loginName,
            logins.displayName,
            logins.loginType,
            logins.template AS loginTemplate,
            logins.parentTemplateId,
            parentTemplate.name AS parentTemplateName,
            parentTemplate.displayName AS parentTemplateDisplayName,
            passwords.tag AS passwordTag,
            passwords.label AS passwordLabel,
            passwords.name AS passwordName
         FROM activity
         JOIN tests ON tests.id = activity.testId
         JOIN logins ON logins.id = activity.loginId
         LEFT JOIN logins parentTemplate ON parentTemplate.id = logins.parentTemplateId
         JOIN passwords ON passwords.id = activity.passwordId
         WHERE $where
         ORDER BY tests.name, passwords.tag, activity.passwordId",
        $params
    )['data'] ?? [];

    foreach ($rows as &$activityRow) $activityRow['hasActivity'] = true;
    unset($activityRow);

    // Login/password views also include assigned tests which have never been opened.
    if ($scope !== 'run') {
        $passwordWhere = $scope === 'login' ? 'passwords.loginID = ?' : 'passwords.id = ?';
        $passwordParam = $scope === 'login' ? $assignmentLoginId : $passwordId;
        $assignedPasswords = $db->fetchTable(
            "SELECT
                passwords.id AS passwordId,
                passwords.structure,
                passwords.tag AS passwordTag,
                passwords.label AS passwordLabel,
                passwords.name AS passwordName,
                logins.id AS loginId,
                logins.name AS loginName,
                logins.displayName,
                logins.loginType,
                logins.template AS loginTemplate,
                logins.parentTemplateId,
                parentTemplate.name AS parentTemplateName,
                parentTemplate.displayName AS parentTemplateDisplayName
             FROM passwords
             JOIN logins ON logins.id = passwords.loginID
             LEFT JOIN logins parentTemplate ON parentTemplate.id = logins.parentTemplateId
             WHERE $passwordWhere",
            [$passwordParam]
        )['data'] ?? [];

        $existing = [];
        foreach ($rows as $row) $existing[(int)$row['passwordId'] . ':' . (int)$row['testId']] = true;
        $assignments = [];
        $assignedTestIds = [];
        foreach ($assignedPasswords as $passwordRow) {
            $structure = journeyDecodeJson($passwordRow['structure']);
            if (!is_array($structure)) continue;
            foreach ($structure as $testRef) {
                $assignedTestId = (int)($testRef['hiddenID'] ?? 0);
                if ($assignedTestId <= 0) continue;
                $key = (int)$passwordRow['passwordId'] . ':' . $assignedTestId;
                if (isset($existing[$key])) continue;
                $assignments[$key] = [$passwordRow, $assignedTestId];
                $assignedTestIds[$assignedTestId] = true;
            }
        }

        $testNames = [];
        if (count($assignedTestIds) > 0) {
            $ids = array_keys($assignedTestIds);
            $testNames = $db->fetchColumn(
                "SELECT id, name FROM tests WHERE id IN " . $db->variableString(count($ids)),
                $ids,
                'id'
            )['data'] ?? [];
        }

        foreach ($assignments as [$passwordRow, $assignedTestId]) {
            if (!isset($testNames[$assignedTestId])) continue;
            $rows[] = [
                ...$passwordRow,
                'testId' => $assignedTestId,
                'testName' => $testNames[$assignedTestId],
                'hasActivity' => false,
                'timeLimit' => null,
                'timeLeft' => null,
                'progress' => null,
                'clientOpen' => 0,
                'tsActiveServer' => null,
                'silenceSeconds' => null
            ];
        }
    }

    usort($rows, static function(array $a, array $b): int {
        return strcasecmp((string)($a['testName'] ?? ''), (string)($b['testName'] ?? ''))
            ?: ((int)($a['passwordId'] ?? 0) <=> (int)($b['passwordId'] ?? 0));
    });

    $runs = [];
    foreach ($rows as $row) {
        $rowPasswordId = (int)$row['passwordId'];
        $rowTestId = (int)$row['testId'];
        $hasActivity = !empty($row['hasActivity']);
        if ($hasActivity && !activityTrackerCanAccessObject($rowPasswordId, $rowTestId, $db)) continue;
        $events = $hasActivity ? journeyFetchEvents($rowPasswordId, $rowTestId, $db) : [];
        $completion = $hasActivity ? journeyCurrentSessionCompletionFlags($events) : ['ended' => false, 'timeUp' => false, 'lifecycle' => null];
        $runs[] = [
            'loginId' => (int)$row['loginId'],
            'passwordId' => $rowPasswordId,
            'testId' => $rowTestId,
            'testName' => $row['testName'],
            'loginName' => $row['loginName'],
            'displayName' => $row['displayName'],
            'loginType' => $row['loginType'],
            'loginTemplate' => $row['loginTemplate'],
            'parentTemplateId' => is_null($row['parentTemplateId']) ? null : (int)$row['parentTemplateId'],
            'parentTemplateName' => $row['parentTemplateName'],
            'parentTemplateDisplayName' => $row['parentTemplateDisplayName'],
            'passwordTag' => $row['passwordTag'],
            'passwordLabel' => $row['passwordLabel'],
            'passwordName' => journeyDecryptPasswordName($row['passwordName']),
            'hasActivity' => $hasActivity,
            'status' => $hasActivity
                ? journeyStatusLabel(
                    $row['timeLeft'],
                    (int)$row['clientOpen'],
                    $completion['ended'],
                    $completion['timeUp'],
                    is_null($row['silenceSeconds']) ? null : (int)$row['silenceSeconds'],
					$completion['lifecycle'],
					is_null($row['timeLimit']) ? null : (int)$row['timeLimit']
                )
                : 'Not opened / no results',
            'progress' => is_null($row['progress']) ? null : round((float)$row['progress'] * 100, 1),
            'eventCount' => count($events),
            'tsActiveServer' => $row['tsActiveServer']
        ];
    }

    $returnData['data'] = [
        'scope' => $scope,
        'runs' => $runs
    ];
}

/*
 * actions
 */

function fetchActivity($data, &$db, &$returnData): void
{
    global $settings, $myAuth;

    $timeoutLimit = round($settings['retryCount'] * $settings['sendFrequency']);

    checkParams($data, ['selection', 'live']);

    $whereClause = '1';
    $params = [];

    switch ($data['selection']) {
        case 'date':
            if (!isset($data['date'])) {
                $whereClause = "DATE(tsLoginServer)=DATE(NOW())";
                $params = [];
            } else {
                $dateParts = explode('-', (string)$data['date']);
                if (count($dateParts) !== 3 || !checkdate((int)$dateParts[1], (int)$dateParts[2], (int)$dateParts[0])) {
                    $returnData['error'] = 'Invalid activity date.';
                    return;
                }
                $whereClause = "DATE(tsLoginServer)=?";
                $params = [$data['date']];
            }
            break;
        default:
            $returnData['error'] = 'Invalid activity selection.';
            return;
    }

    // Administrative roles can see all; others are filtered without joins that duplicate rows.
    $applyPermFilter = !($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin());

    $ugList = $myAuth->usergroup ?? [];
    if (!is_array($ugList)) $ugList = [];

    $permJoin = '';
    $permWhere = '';
    $permParams = [];
    $loginAccessJoin = "LEFT JOIN logins templateLogin ON templateLogin.id = logins.parentTemplateId";
    $loginAccessParentSql = "CASE
        WHEN logins.parentTemplateId IS NOT NULL THEN templateLogin.parent
        ELSE logins.parent
    END";

    if ($applyPermFilter) {
        if (count($ugList) > 0) {
            $ph = implode(',', array_fill(0, count($ugList), '?'));

            $permJoin = "JOIN loginsFolders lf ON lf.id = $loginAccessParentSql";

            $permWhere = "
                AND (
                    lf.owner = ?
                    OR EXISTS (
                        SELECT 1 FROM loginsFolderAccess lfa
                        WHERE lfa.folderId = lf.id
                        AND lfa.userGroupId IN ($ph)
                        AND (
                            JSON_EXTRACT(lfa.accessDef, '$.c_items.Read') IN ('true', true)
                            OR JSON_EXTRACT(lfa.accessDef, '$.c_items.Write') IN ('true', true)
                            OR JSON_EXTRACT(lfa.accessDef, '$.items.fetchLibrary') IN ('true', true)
                            OR JSON_EXTRACT(lfa.accessDef, '$.items.fetchItem') IN ('true', true)
                            OR JSON_EXTRACT(lfa.accessDef, '$.items.search') IN ('true', true)
                            OR JSON_EXTRACT(lfa.accessDef, '$.items.deleteItem') IN ('true', true)
                            OR JSON_EXTRACT(lfa.accessDef, '$.items.editPassword') IN ('true', true)
                        )
                    )
                )
            ";

            $permParams = array_merge([$myAuth->userid], $ugList);
        } else {
            // no groups -> only owner
            $permJoin = "JOIN loginsFolders lf ON lf.id = $loginAccessParentSql";
            $permWhere = "AND lf.owner = ?";
            $permParams = [$myAuth->userid];
        }
    }

    if (!empty($data['includeMeta'])) {
        $metaKeyQuery = "SELECT DISTINCT logins.info
                  FROM logins
                  $loginAccessJoin
                  $permJoin
                  WHERE logins.info IS NOT NULL
                  AND logins.info <> ''
                  AND logins.parent IS NOT NULL
                  AND logins.template <> 'cloned'
                  $permWhere";
        $metaKeyRows = $db->fetchTable($metaKeyQuery, $permParams)['data'] ?? [];
        $metaKeys = [];
        $metaValues = [];
        $singleTags = [];
        foreach ($metaKeyRows as $row) {
        $info = json_decode($row['info'] ?? '', true);
        if (!is_array($info)) continue;
        foreach ($info as $key => $value) {
            if ($key === '') continue;
            $metaKeys[$key] = true;
            if (is_scalar($value) || $value === null) {
                $value = (string)($value ?? '');
                if ($value === '') {
                    $singleTags[$key] = true;
                } else {
                    if (!isset($metaValues[$key])) $metaValues[$key] = [];
                    $metaValues[$key][$value] = true;
                }
            }
        }
        }
        $metaKeys = array_keys($metaKeys);
        sort($metaKeys);
        $singleTags = array_keys($singleTags);
        sort($singleTags);
        foreach ($metaValues as $key => $values) {
            $metaValues[$key] = array_keys($values);
            sort($metaValues[$key]);
        }
        $returnData['metaSuggestions'] = [
            'keys' => $metaKeys,
            'values' => $metaValues,
            'singleTags' => $singleTags
        ];

        $activityDateRows = $db->fetchTable(
            "SELECT DISTINCT DATE(activity.tsLoginServer) AS activityDate
             FROM activity
             JOIN logins ON activity.loginId = logins.id
             $loginAccessJoin
             $permJoin
             WHERE activity.tsLoginServer IS NOT NULL
             $permWhere
             ORDER BY activityDate",
            $permParams
        )['data'] ?? [];
        $returnData['activityDates'] = array_values(array_filter(array_column($activityDateRows, 'activityDate')));
    }

    $query = "SELECT
                    logins.info,
                    $loginAccessParentSql AS folderId,
                    activity.loginId,
                    logins.`name` as login,
                    logins.displayName,
                    logins.loginType,
                    logins.template AS loginTemplate,
                    logins.parentTemplateId,
                    templateLogin.name AS parentTemplateName,
                    activity.passwordId,
                    passwords.`name` as `password`,
                    passwords.tag as passwordTag,
                    passwords.label as passwordLabel,
                    activity.testId,
                    tests.`name` as test,
                    DATE(tsLoginServer) AS loginDate,
                    TIME(tsLoginServer) AS loginTime,
                    DATE(tsActiveServer) AS contactDate,
                    TIME(tsActiveServer) AS contactTime,
                    TIME_TO_SEC(TIMEDIFF(now(), tsActiveServer)) AS silence,
                    timeLeft,
                    activity.timeLimit,
                    clientOpen,
                    (SELECT b.subType
                       FROM behaviour b
                      WHERE b.passwordId = activity.passwordId
						AND b.testId = activity.testId
						AND b.eventType = 'behaviour'
						AND b.subType IN ('login','endTest','timeUp','navigatedPastEnd','adminCloseTest','scoringStarted','leaveTest','closeWindow','resumeTest','forceLogoff','reopenTest')
					  ORDER BY b.eventId DESC
					  LIMIT 1) AS lifecycle,
                    ROUND(progress*100) as progress
                  FROM
                    activity
                  JOIN logins ON activity.loginId = logins.id
                  $loginAccessJoin
                  $permJoin
                  JOIN passwords ON activity.passwordId = passwords.id
                  JOIN tests ON testID = tests.id
                  WHERE $whereClause
                  $permWhere
                  ORDER BY login, tsLoginServer";

    $finalParams = array_merge($params, $permParams);
    $res = $db->fetchTable($query, $finalParams);
    $logins = $res['data'] ?? [];

    $returnData['data'] = [];
    if (count($logins) === 0) return;

    // Build password map from the visible rows only (avoid a second query)
    $passwords = [];
    foreach ($logins as $row) {
        $enc = $row['password'];
        if (!isset($passwords[$enc])) {
            $passwords[$enc] = Crypt::decryptString($enc);
        }
    }

    /* group data into hierarchy */
    $out = [];
    foreach ($logins as $row) {
        $p = $row;
        unset(
            $p['login'],
            $p['info'],
            $p['loginId'],
            $p['folderId'],
            $p['displayName'],
            $p['loginType'],
            $p['loginTemplate'],
            $p['parentTemplateId'],
            $p['parentTemplateName']
        );

        if (!isset($out[$row['login']])) {
            $out[$row['login']] = [
                'info'    => json_decode($row['info'] ?? ''),
                'loginId' => $row['loginId'],
                'login'   => $row['login'],
                'loginName' => $row['login'],
                'displayName' => $row['displayName'],
                'loginType' => $row['loginType'],
                'loginTemplate' => $row['loginTemplate'],
                'parentTemplateId' => is_null($row['parentTemplateId']) ? null : (int)$row['parentTemplateId'],
                'parentTemplateName' => $row['parentTemplateName']
            ];
        }

        $timeLeft = (int)$p['timeLeft'];
        $silence = (int)$p['silence'];
        $clientOpen = (int)$p['clientOpen'];
        $p['canWrite'] = activityTrackerHasLoginFolderAccess((int)$row['folderId'], $db, 'write');
        if ($timeLeft < 0) {
            $p['timeLeft'] = "∞";
            $p['status'] = STATUS_ACTIVE;
            if ($silence > $timeoutLimit) {
                $p['status'] = ($clientOpen === 0) ? STATUS_ABORTED : STATUS_TIMEOUT;
            }
        } elseif ($timeLeft === 0) {
            $p['timeLeft'] = "00:00";
            $p['status'] = STATUS_CLOSED;
        } else {
            $p['timeLeft'] = str_pad(intdiv($timeLeft, 60), 2, "0", STR_PAD_LEFT)
                . ":" . str_pad($timeLeft % 60, 2, "0", STR_PAD_LEFT);
            $p['status'] = STATUS_ACTIVE;
            if ($silence > $timeoutLimit) {
                $p['status'] = ($clientOpen === 0) ? STATUS_ABORTED : STATUS_TIMEOUT;
            }
        }

		$p['statusLabel'] = journeyStatusLabel(
			$timeLeft,
			$clientOpen,
			$p['lifecycle'] === 'endTest',
			$p['lifecycle'] === 'timeUp',
			$silence,
			$p['lifecycle'],
			is_null($p['timeLimit']) ? null : (int)$p['timeLimit']
		);
		if (in_array($p['statusLabel'], ['Left test', 'Window closed', 'Forced logout'], true)) {
			$p['status'] = STATUS_ABORTED;
		}
		if ($p['statusLabel'] === 'Reopened - waiting for login') $p['status'] = STATUS_REOPENED;

        $p['password'] = $passwords[$row['password']] ?? '';
        $out[$row['login']]['activity'][] = $p;
    }

    ksort($out);
    $returnData['data'] = $out;
}

function reopenTest($action, &$db, &$returnData): void
{
    $passwordId = isset($action['passwordId']) ? (int)$action['passwordId'] : null;
    $testId = isset($action['testId']) ? (int)$action['testId'] : null;

    // actions require WRITE permission
    if (!assertActivityAccess($passwordId, $testId, $db, $returnData, 'write')) return;

    OasysFrontendState::purge($passwordId, $testId);

    $activity = new OasysActivity();
    $res = $activity->reopenTestWithoutTimeLimit($passwordId, $testId, 'activityTracker');
    if ($res['error']) {
        $returnData['error'] = 'The activity could not be reopened.';
    } elseif (($res['rows'] ?? 0) === 0) {
        $returnData['error'] = 'The activity was not changed.';
    }
}

function closeTest($action, &$db, &$returnData): void
{
	global $myAuth;
	$userId = $myAuth->userid;

    $passwordId = isset($action['passwordId']) ? (int)$action['passwordId'] : null;
    $testId = isset($action['testId']) ? (int)$action['testId'] : null;
	$loginId = OasysTestTakers::getLoginForPassword($passwordId);

    // actions require WRITE permission
    if (!assertActivityAccess($passwordId, $testId, $db, $returnData, 'write')) return;


    OasysFrontendState::purge($passwordId, $testId);


    $activity = new OasysActivity();
    $res = $activity->terminateActivity($passwordId, $testId);
    if ($res['error']) {
        $returnData['error'] = 'The activity could not be closed.';
    } elseif (($res['rows'] ?? 0) === 0) {
        $returnData['error'] = 'The activity was not changed.';
    } else {
		OasysBehaviour::write($passwordId, $testId, [
			'timeLeft' => 0,
			'eventType' => 'behaviour',
			'subType' => 'adminCloseTest',
			'data' => [
				'actorUserId' => $userId,
				'source' => 'activityTracker'
			]
		]);
	}
}

function addTime($action, &$db, &$returnData): void
{
    $passwordId = isset($action['passwordId']) ? (int)$action['passwordId'] : null;
    $testId = isset($action['testId']) ? (int)$action['testId'] : null;

    $minutesRequested = filter_var($action['minutes'] ?? null, FILTER_VALIDATE_INT);
    if ($minutesRequested === false || $minutesRequested === 0 || $minutesRequested < -99 || $minutesRequested > 99) {
        $returnData['error'] = 'Time adjustment must be between -99 and 99 minutes and cannot be zero.';
        return;
    }

    // actions require WRITE permission
    if (!assertActivityAccess($passwordId, $testId, $db, $returnData, 'write')) return;

    $seconds = 60 * $minutesRequested;

    $activity = new OasysActivity();
    $res = $activity->addTime($passwordId, $testId, $seconds, 'activityTracker');
    if ($res['error']) {
        $returnData['error'] = 'The activity time could not be changed.';
    } elseif (($res['rows'] ?? 0) === 0) {
        $returnData['error'] = 'The activity was not changed.';
    }
}

function resetActivity($action, &$db, &$returnData): void
{
    $passwordId = isset($action['passwordId']) ? (int)$action['passwordId'] : null;
    $testId = isset($action['testId']) ? (int)$action['testId'] : null;

    // actions require WRITE permission
    if (!assertActivityAccess($passwordId, $testId, $db, $returnData, 'write')) return;

    $activity = new OasysActivity();
    $res = $activity->resetActivity($passwordId, $testId);
    if ($res['error']) {
        $returnData['error'] = 'The activity could not be reset.';
    } elseif (($res['rows'] ?? 0) === 0) {
        $returnData['error'] = 'The activity was not found.';
    } else {
        killState($passwordId, $testId);
    }
}

function killState($passwordId, $testId): void
{
    if ($passwordId === null || $testId === null) {
        return;
    }
    OasysFrontendState::purge($passwordId, $testId);
}

function outputActivityTrackerJSON(): void
{
    global $returnData;

    global $myAuth;
    $returnData['loggedInName'] = $myAuth->username;

    $error = error_get_last();
    $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR];
    if (!empty($error) && in_array($error['type'] ?? null, $fatalTypes, true)) {
        $returnData['fatalError'] = 'The Activity Tracker encountered an internal server error.';
    }

    header('Cache-Control: no-cache, must-revalidate');
    header('Content-type: application/json; charset=UTF-8');
    echo json_encode($returnData);
}
