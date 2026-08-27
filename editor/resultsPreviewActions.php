<!DOCTYPE html>

<?Php
	# ----------------------- #
	# Authentication Includes #
	# ----------------------- #
	$pageName = "activityTracker"; // set to the related 'editor button' string name (e.g., 'items')
	$isSubMod = false; // set true if a module page in a subdirectory
	$isActionFile = false; // set true if an "xxxActions.php" file
    require_once __DIR__ . "/inc/php/initBackend.php";
	require_once 'inc/php/authCommonFunctions.php'; // required for authentication inclusion
	require_once 'inc/php/activityTrackerPermissions.php';
?>

<html lang="en">
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <title></title>
    <link rel="stylesheet" href="inc/css/resultsPreview.css" type="text/css"/>
</head>
<body>

<?php

	register_shutdown_function('outputError');

	require_once 'inc/php/initBackend.php';
	require_once '../inc/php/rixTools.php';
	require_once '../inc/php/OasysCredentials.php';

	$loginId = filter_input(INPUT_GET, 'loginId', FILTER_VALIDATE_INT) ?: null;
	$testId = filter_input(INPUT_GET, 'testId', FILTER_VALIDATE_INT) ?: null;
	$passwordId = filter_input(INPUT_GET, 'passwordId', FILTER_VALIDATE_INT) ?: null;

	//if neither loginId nor passwordId is set, then we can't proceed
	if (empty($loginId) && empty($passwordId)) {
		echo "<p>Either loginId or passwordId must be given</p>";
		exit;
	}

	$credentials = new OasysCredentials();

	//if loginId is not set, then we need to get it from the passwordId
	if (empty($loginId)) {
		$loginId = $credentials->getLoginIdFromPasswordId($passwordId);
	}

	$allowed = !empty($passwordId) && !empty($testId)
		? activityTrackerCanAccessObject((int)$passwordId, (int)$testId, $db)
		: activityTrackerCanAccessLogin((int)$loginId, $db);
	if (!$allowed) {
		http_response_code(403);
		echo '<p>You do not have permission to view this activity.</p>';
		exit;
	}

	$loginName = $credentials->getLoginNameFromLoginId($loginId);

	//fill in missing information
	$testIds = [];
	$sections = [];
	if (empty($testId) && !empty($passwordId)) {
		$testIds = [];
		$res = $credentials->getTestIdsFromPasswordId($passwordId);
		$testIds = $res['testIds'];
		foreach ($res['testIds'] as $testId) {
			$sections[] = ['passwordId' => $passwordId, 'tag' => $res['tag'], 'testId' => $testId, 'testName' => '', 'loginId' => $loginId, 'loginName' => $loginName];
		}
	} elseif (empty($testId) && !empty($loginId)) {
		$passwords = $credentials->getPasswordsFromLoginId($loginId); //id, tag, testIds in each row
		$testIds = [];
		foreach ($passwords as $password) {
			foreach ($password['testIds'] as $testId) {
				$testIds[] = $testId;
				$sections[] = ['passwordId' => $password['id'], 'tag' => $password['tag'], 'testId' => $testId, 'testName' => '', 'loginId' => $loginId, 'loginName' => $loginName];
			}
		}
		//make testIds unique
		$testIds = array_values(array_unique($testIds));
	} elseif (!empty($testId)) {
		$testIds = [$testId];
		if (empty($passwordId)) {
			$passwords = $credentials->getPasswordsFromLoginId($loginId);
			//extract password ids from the result
			$passwordIds = array_column($passwords, 'id');
			$res = $credentials->filterPasswordsByTestId($passwordIds, $testId);
			foreach ($res as $password) {
				$sections[] = ['passwordId' => $password['id'], 'tag' => $password['tag'], 'testId' => $testId, 'testName' => '', 'loginId' => $loginId, 'loginName' => $loginName];
			}
		} else {
			$sections[] = ['passwordId' => $passwordId, 'tag' => '', 'testId' => $testId, 'testName' => '', 'loginId' => $loginId, 'loginName' => $loginName];
		}
	}

	if (count($testIds) === 0) {
		echo '<p>No activity data is available.</p>';
		exit;
	}
	$query = "SELECT id, name FROM tests WHERE id IN " . $db->variableString(count($testIds));
	$res = $db->fetchColumn($query, $testIds, 'id');
	$testNames = $res['data'];

	//fill in the test names
	foreach ($sections as $key => $section) {
		$sections[$key]['testName'] = $testNames[$section['testId']] ?? '';
	}

	$sectionCounter = 0;

	foreach ($sections as $section) {
		$query = <<<SQL
            SELECT tsClient,
                tsServer,
                SEC_TO_TIME(timeLeft) as timeLeft,
                eventId,
                itemId, 
                REGEXP_SUBSTR(JSON_SEARCH(structure, 'one', itemId, NULL, '$.items[*].hiddenID'),'[0-9]+') as itemNumber, 
                `language`,
                eventType,
                subType,
                `data` 
            FROM behaviour 
            JOIN tests ON testId = tests.id 
            WHERE loginId = ? AND testId = ? AND passwordId = ? 
            ORDER BY tsClient
        SQL;

		$res = $db->fetchTable($query, [$section['loginId'], $section['testId'], $section['passwordId']]);

		if ($sectionCounter++ === 0) {
			tag('h1', 'Login: ' . $section['loginName']);
		} else {
			echo "<hr>";
		}
		if (!empty($section['tag'])) {
			tag('h2', 'Test: ' . $section['testName'] . ' – Tag: ' . $section['tag']);
		} else {
			tag('h2', 'Test: ' . $section['testName']);
		}
		echo "<table>";
		outputData($res['data'] ?? []);
		echo "</table>";
	}

	function outputData($data): void
	{
		startRow();
		tag("th", "event");
		tag('th', "date");
		tag('th', "time (client)");
		tag('th', "time (server)");
		tag("th", "time left");
		tag("th", "item number");
		tag("th", "item id");
		tag("th", "language");
		tag("th", "type");
		tag("th", "details");
		endRow();

		$prevClientTime = "";
		$prevServerTime = "";
		$prevDate = "";
		$prevTimeLeft = "";
		$prevItemId = "";
		$prevItemNumber = "";
		$prevLanguage = "";


		foreach ($data as $row) {
			try {
				$dtc = new DateTime($row['tsClient']);
				$dts = new DateTime($row['tsServer']);
			} catch (Throwable $error) {
				continue;
			}
			$date = $dtc->format("Y-m-d");
			$clientTime = $dtc->format("H:i:s");
			$serverTime = $dts->format("H:i:s");

			startRow();
			td($row['eventId']);
			outputIfChanged($date, $prevDate);
			outputIfChanged($clientTime, $prevClientTime);
			outputIfChanged($serverTime, $prevServerTime);
			outputIfChanged($row['timeLeft'], $prevTimeLeft);
			outputIfChanged($row['itemNumber'], $prevItemNumber);
			outputIfChanged($row['itemId'], $prevItemId);
			outputIfChanged($row['language'], $prevLanguage);
			td($row['subType']);
			formatData($row['eventType'], $row['subType'], json_decode($row['data'] ?? '', true));
			endRow();
		}
	}

	function formatData($type, $subType, $data): void
	{
		if ($type == 'behaviour') {
			switch ($subType) {
				case 'login':
					$firstLine = true;
					foreach ((array)$data as $k => $v) {
						if (!$firstLine) newRow(9);
						td(is_scalar($v) || $v === null ? (string)$v : json_encode($v));
						$firstLine = false;
					}
					break;
				case 'navigation':
					td(($data['previousItem'] ?? '') . ' ➠ ' . ($data['currentItem'] ?? ''));
					break;
				default:
					td(json_encode($data));
			}
		} elseif ($type == 'answer') {
			td(($data['fieldId'] ?? '') . ': ' . (is_scalar($data['value'] ?? null) ? (string)$data['value'] : json_encode($data['value'] ?? null)));
		} else {
			td(json_encode($data));
		}
	}

	function outputIfChanged($current, &$prev): void
	{
		if ($prev !== $current) {
			td($current);
		} else {
			td();
		}
		$prev = $current;
	}

	function tag($name, $contents = '', $open = true, $close = true, $attributes = []): void
	{
		if ($open) {
			if (is_array($attributes) && count($attributes) > 0) {
				echo "<$name ";
				foreach ($attributes as $k => $v) {
					echo htmlspecialchars((string)$k, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
					echo '="';
					echo htmlspecialchars((string)$v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
					echo '"';
					echo " ";
				}
				echo ">";
			} else {
				echo "<$name>";
			}
		}
		echo htmlspecialchars((string)$contents, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
		if ($close) echo "</$name>";
	}

	function startRow(): void
	{
		tag("tr", '', true, false);
	}

	function endRow(): void
	{
		tag("tr", '', false);
	}

	function newRow($blankCellCount = 0): void
	{
		endRow();
		startRow();
		if (is_int($blankCellCount) && $blankCellCount > 0) {
			echo("<td colspan='$blankCellCount'></td>");
		}
	}

	function td($contents = "", $colspan = 1): void
	{
		if ($colspan > 1) {
			tag("td", $contents, true, true, ['colspan' => $colspan]);
		} else {
			tag("td", $contents);
		}
	}

	function outputError(): void
	{
		$error = error_get_last();
		$fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR];
		if (!empty($error) && in_array($error['type'] ?? null, $fatalTypes, true)) {
			echo '<p>The activity preview encountered an internal server error.</p>';
		}
	}

?>


</body>
</html>
