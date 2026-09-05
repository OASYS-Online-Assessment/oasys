<?php

use Dompdf\Dompdf;
use MathPHP\NumericalAnalysis\NumericalIntegration\BoolesRule;
use MathPHP\Probability\Distribution\Continuous\Continuous;

use function PHPSTORM_META\type;

/** @phan-file-suppress PhanUnusedGlobalFunctionParameter, PhanUnusedVariable, PhanRedefineFunction, PhanUnusedClosureParameter, PhanTypeArraySuspiciousNullable, PhanSuspiciousWeakTypeComparison, PhanUnusedVariableValueOfForeachWithKey, PhanUnusedPublicNoOverrideMethodParameter */
/** @noinspection SqlResolve */

require_once __DIR__ . "/inc/php/initBackend.php";
// common tests functions include used for tests and results editor
require_once 'inc/php/testsCommonFunctions.php';

//the JSON output will happen, even if a fatal error prevents the script from finishing
register_shutdown_function('outputJSON');
require_once "../inc/php/Crypt.php";
require_once '../inc/php/parser.php';
require_once '../inc/php/helperRoutines.php';
require_once '../inc/php/OasysScoring.php';
require_once __DIR__ . '/inc/php/testJourneyData.php';

//action is a string that defines what action to perform
$action = filter_input(INPUT_POST, 'action');
if (!$action) {
	$action = "";
}

//all data that is returned by this script will be put into $returnData array which is sent back in JSON encoded form
$returnData = array();
$returnData['action'] = $action; //when returning we must specify which action was performed
$returnData['error'] = false; //if there is an error, this will contain a string with the error message

# ----------------------- #
# Authentication Includes #
# ----------------------- #
$pageName = "testresults"; // set to the related 'editor button' string name (e.g., 'items')
$isSubMod = false; // set true if a module page in a subdirectory
$isActionFile = true; // set true if an "xxxActions.php" file
require_once 'inc/php/authCommonFunctions.php'; // required for authentication inclusion


//data is a JSON encoded associative array that contains all the necessary data for the action to be performed
//(the array must be manually JSON encoded before sending to get past max_input_vars limitation)
$data = filter_input(INPUT_POST, 'data');
if ($data) {
	$data = json_decode($data ?? '', true);
}
if (!$data) {
	$data = array();
}

//make a connection to the database and define the log file in which database errors are to be recorded
$db = $app->getDatabaseInstance();

// //call function whose name is given by the $action variable
// //(the name of the function must obviously exactly match the string in $action)
// //an action function will always be given the $data sent by the client, a pointer to the database object and a pointer to the global $returnData array
// $action($data, $db, $returnData);

# ------------------------------------------- #
# Inclusion of item/folder existence checking #
# ------------------------------------------- #
$tableName = (object)['primary' => 'testFolders', 'secondary' => 'tests'];
require_once 'inc/php/objectCommonFunctions.php';

# ------------------------------------------- #
# Inclusion of permission authenticator class #
# ------------------------------------------- #
$permAuth = new permAuth($action, $data, $myAuth);

# ---------------------------------------- #
# Action permission authentication routine #
# ---------------------------------------- #
$contextualResultActions = [
	'fetchReportData', 'fetchTestJourneySummary', 'fetchTestJourneyDetail', 'report_export',
	'fetchTestSubmissionSummary', 'fetchTestSummaryData', 'fetchQAListDetail', 'getTL',
	'fetchQADetail', 'scoringAddComment', 'scoringRemComment', 'setScore',
	'resetAllCorrections', 'closeOutTest', 'refreshManualScoringLease',
	'releaseManualScoringLease', 'hasMSleft', 'fetchPreSelect', 'fetchTestResultOverview',
	'fetchTestResults', 'fetchBehaviourTiming', 'fetchDetailedTestScore',
	'chartStorePrecheck', 'chartStore', 'getChartList', 'loadChart', 'setChartVisibility', 'delChart'
];
$contextualTestId = resultsActionTestId($data);
$letMePass = in_array($action, ['fetchLibrary', 'search'], true) ? true : ((
	in_array($action, $contextualResultActions, true)
	&& $contextualTestId > 0
	&& resultsCanReadTest($contextualTestId, $db)
) ? true : $permAuth->permCheck($data));
if ($letMePass === true) {
	switch ($action) {
		// the following action calls are in the permAuth class, and require redirection to said class
		case 'updatePerm':
		case 'fetchIgPerm':
			$permAuth->$action($data, $db, $permAuth->returnData, $myAuth);
			$returnData = $permAuth->returnData;
			break;

		// standard actions found in this itemActions file
		default:
			// preset the returnData var with anything the authenticator may have alraedy loaded in prior to sending to action
			$returnData = array_merge($returnData, $permAuth->returnData);
			if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
			$action($data, $db, $returnData);
			break;
	}
} else {
	// forward on the fail message from the auth class
	$returnData = $permAuth->returnData;
}

/*
###############
FUNCTIONS START
###############
*/

function resultsActionTestId(array $data): int
{
	foreach (['testId', 'selectedTest', 'test'] as $key) {
		if (isset($data[$key]) && filter_var($data[$key], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) !== false) {
			return (int)$data[$key];
		}
	}
	if ((int)($data['type'] ?? 0) === 4
		&& filter_var($data['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) !== false) {
		return (int)$data['id'];
	}
	return 0;
}

function resultsTestFolderPath(int $folderId, rixPDO &$db, array &$returnData): string
{
	$path = fetchPath($folderId, $returnData, $db);
	return $path === false ? '/' : (pathToString($path) ?? '/');
}

function resultsAccessibleLibraryRows(rixPDO &$db, array &$returnData): array
{
	global $backendState;
	$recordRows = $db->fetchTable(
		"SELECT DISTINCT recorded.testId,
			COALESCE(templateLogin.parent, logins.parent) AS loginParent
		FROM (
			SELECT activity.testId, activity.passwordId,
				COALESCE(activity.loginId, passwords.loginID) AS loginId
			FROM activity
			JOIN passwords ON passwords.id = activity.passwordId
			UNION
			SELECT scoring.testId, scoring.passwordId,
				COALESCE(scoring.loginId, passwords.loginID) AS loginId
			FROM scoring
			JOIN passwords ON passwords.id = scoring.passwordId
		) recorded
		JOIN logins ON logins.id = recorded.loginId
		LEFT JOIN logins templateLogin ON templateLogin.id = logins.parentTemplateId"
	)['data'] ?? [];

	$folderReadCache = [];
	$testAccess = [];
	foreach ($recordRows as $record) {
		$folderId = (int)($record['loginParent'] ?? 0);
		if (!tmCanReadTestTakerFolder($folderId, $db, $folderReadCache)) continue;
		$testId = (int)($record['testId'] ?? 0);
		if ($testId <= 0) continue;
		$testAccess[$testId] = true;
	}

	if ($testAccess === []) return [];

	$testIds = array_keys($testAccess);
	$userId = (int)($backendState->userid ?? 0);
	$tests = [];
	foreach (array_chunk($testIds, 500) as $testIdChunk) {
		$placeholders = implode(',', array_fill(0, count($testIdChunk), '?'));
		$tests = array_merge($tests, $db->fetchTable(
			"SELECT tests.id, tests.parent, tests.name, tests.structure,
				EXISTS(
					SELECT 1 FROM watchList
					WHERE watchList.foreign_id = tests.id
					AND watchList.foreign_table = 4
					AND watchList.user_id = ?
				) AS watchList
			FROM tests
			WHERE tests.id IN ($placeholders)",
			array_merge([$userId], $testIdChunk)
		)['data'] ?? []);
	}
	usort($tests, static fn(array $a, array $b): int =>
		[strtolower((string)$a['name']), (int)$a['id']]
		<=>
		[strtolower((string)$b['name']), (int)$b['id']]
	);

	$rows = [];
	$pathCache = [];
	foreach ($tests as $test) {
		$testId = (int)$test['id'];
		$structure = json_decode($test['structure'] ?? '', true);
		if (!is_array($structure)) $structure = ['type' => 'linear'];
		if (empty($structure['type'])) $structure['type'] = 'linear';
		$parentId = (int)$test['parent'];
		if (!isset($pathCache[$parentId])) {
			$pathCache[$parentId] = resultsTestFolderPath($parentId, $db, $returnData);
		}
		$path = $pathCache[$parentId];
		$rows[] = [
			'id' => 't' . $testId,
			'dbId' => $testId,
			'pid' => 'f1',
			'pathId' => (int)$test['parent'],
			'type' => 'test',
			'name' => (string)$test['name'],
			'label' => (string)$test['name'],
			'sortKey' => mb_strtolower((string)$test['name']) . '_' . $testId,
			'testStructure' => $structure,
			'testType' => (string)$structure['type'],
			'watchList' => (int)$test['watchList'],
			'path' => $path,
			'secondaryLabel' => $path . ' · ID ' . $testId,
			'filterText' => implode(' ', [(string)$test['name'], (string)$testId, $path])
		];
	}
	return $rows;
}

function fetchResultsLibrary($data, rixPDO &$db, &$returnData): void
{
	$rows = resultsAccessibleLibraryRows($db, $returnData);
	$returnData['data'] = [
		'list' => $rows,
		'path' => [['name' => 'Available results', 'id' => 1]],
		'loc' => 1,
		'select' => null,
		'virtualResults' => true
	];
	if (!empty($data['select'])) {
		$select = (string)$data['select'];
		foreach ($rows as $row) {
			if ($row['id'] === $select) {
				$returnData['data']['select'] = $select;
				break;
			}
		}
	}
	$returnData['permList'] = [
		'basePerm' => [
			'newFolder' => false,
			'newItemGroup' => false,
			'newTest' => false,
			'fetchIgPerm' => false
		]
	];
}

function searchResultsLibrary($data, rixPDO &$db, &$returnData): void
{
	if (($data['searchMode'] ?? '') === 'meta') {
		$keyTerm = trim((string)($data['key'] ?? ''));
		$valueTerm = trim((string)($data['value'] ?? ''));
		$exact = !empty($data['exact']);
		$singleOnly = !empty($data['singleOnly']);
		$rows = resultsAccessibleLibraryRows($db, $returnData);
		$infoByTest = [];
		$testIds = array_values(array_unique(array_map(static fn(array $row): int => (int)$row['dbId'], $rows)));
		foreach (array_chunk($testIds, 500) as $testIdChunk) {
			$placeholders = implode(',', array_fill(0, count($testIdChunk), '?'));
			foreach (($db->fetchTable("SELECT id, info FROM tests WHERE id IN ($placeholders)", $testIdChunk)['data'] ?? []) as $test) {
				$infoByTest[(int)$test['id']] = $test['info'];
			}
		}
		$matchedRows = [];
		foreach ($rows as $row) {
			$match = tmMetaInfoMatch($infoByTest[(int)$row['dbId']] ?? null, $keyTerm, $valueTerm, $exact, $singleOnly);
			if ($match === null) continue;
			$row['subresult'] = $match['label'];
			$row['subresultvalue'] = $match['value'];
			$matchedRows[] = $row;
		}
		$returnData['data'] = [
			'list' => $matchedRows,
			'searchString' => tmMetaSearchLabel($keyTerm, $valueTerm, $singleOnly)
		];
		return;
	}
	checkParams($data, ['searchString']);
	$term = mb_strtolower(trim((string)$data['searchString']));
	$rows = resultsAccessibleLibraryRows($db, $returnData);
	if ($term !== '') {
		$rows = array_values(array_filter($rows, static function (array $row) use ($term): bool {
			return mb_strpos(mb_strtolower((string)($row['filterText'] ?? '')), $term) !== false;
		}));
		foreach ($rows as &$row) {
			$testId = (string)($row['dbId'] ?? '');
			if ($testId !== '' && mb_strpos($testId, $term) !== false) {
				$row['subresult'] = 'ID: ';
				$row['subresultvalue'] = $testId;
			}
		}
		unset($row);
	}
	$returnData['data'] = [
		'list' => $rows,
		'searchString' => (string)$data['searchString']
	];
}

function fetchReportData($data, rixPDO &$db, &$returnData): void
{
	checkParams($data, ['testId']);
	global $config, $uiLang, $permAuth, $myAuth;
	$testId = (int)$data['testId'];
	if (!resultsCanReadTest($testId, $db)) {
		$returnData['error'] = $uiLang->translate("Unable to load data.");
		return;
	}
	$settingsDefaults = $config->getDefaults();
	$dateRange = reportNormalizeDateRange([
		'start' => $data['startDate'] ?? null,
		'end' => $data['endDate'] ?? null
	]);
	if ($dateRange === false) {
		$returnData['error'] = $uiLang->translate("The selected report date range is invalid.");
		return;
	}

	# MASTER ITEM TABLE DATA #
	$dateClause = '';
	$answerParams = [$testId];
	if ($dateRange['start'] !== null) {
		$dateClause .= ' AND `tsServer` >= ?';
		$answerParams[] = $dateRange['start'] . ' 00:00:00';
	}
	if ($dateRange['end'] !== null) {
		$dateClause .= ' AND `tsServer` < ?';
		$answerParams[] = (new DateTimeImmutable($dateRange['end']))->modify('+1 day')->format('Y-m-d') . ' 00:00:00';
	}
	$raw_answer_intake = $db->fetchTable(
		"SELECT CONCAT(`itemId`, \"_\", `fieldId`) AS `fi_key`, `loginId`, `passwordId`, `fieldId`, `fieldType`, `itemId`, `value`
		 FROM `answers`
		 WHERE `testId` = ?$dateClause",
		$answerParams
	)['data'] ?? [];
	$accessMap = resultsFetchTestTakerAccessMap($testId, $db);
	$availableDates = [];
	foreach (($db->fetchTable(
		"SELECT DISTINCT `passwordId`, DATE(`tsServer`) AS `answerDate`
		 FROM `answers`
		 WHERE `testId` = ?
		 ORDER BY `answerDate`",
		[$testId]
	)['data'] ?? []) as $dateRow) {
		$passwordAccess = $accessMap[(int)($dateRow['passwordId'] ?? 0)] ?? ['read' => false];
		$answerDate = (string)($dateRow['answerDate'] ?? '');
		if ($passwordAccess['read'] && $answerDate !== '') $availableDates[$answerDate] = true;
	}

// permission filtering
	foreach ($raw_answer_intake as $rai_key => $rai_entry) {
		$passwordAccess = $accessMap[(int)($rai_entry['passwordId'] ?? 0)] ?? ['read' => false];
		if (!$passwordAccess['read']) unset($raw_answer_intake[$rai_key]);
	}

// re-index raw data
	$raw_answer_intake = array_values($raw_answer_intake);

	// If test does not contain ANY recorded answer data, exit with message
	if (empty($raw_answer_intake)) {
		$returnData['error'] = $uiLang->translate("No test data found to process.");
		return;
	}

	# MASTER ANSWER TABLE DATA #
	$test_item_list = array_values(array_unique(array_map('intval', array_column($raw_answer_intake, 'itemId'))));
	$itemRows = [];
	if (count($test_item_list) > 0) {
		$placeholders = implode(',', array_fill(0, count($test_item_list), '?'));
		foreach (($db->fetchTable("SELECT `id`, `blocks`, `fields` FROM `items` WHERE `id` IN ($placeholders)", $test_item_list)['data'] ?? []) as $itemRow) {
			$itemRows[(int)$itemRow['id']] = $itemRow;
		}
	}

	# ----------------------------------------------------- #
	# ITERATE ITEMS TABLE COLUMNS TO DEVELOP BASE STRUCTURE #
	# ----------------------------------------------------- #
	$u_ans_keys = array_unique(array_column($raw_answer_intake, "fi_key"));
	$item_field_values = [];
	$qXcat = [];
	$fType = [];

    # -------------- #
    # ITEM ITERATION #
    # -------------- #

    foreach ($test_item_list as $ti_k => $ti_id) {
		if (!isset($itemRows[$ti_id])) continue;
		$item_block_data = json_decode($itemRows[$ti_id]['blocks'] ?? '', true) ?: [];
		$item_field_data = json_decode($itemRows[$ti_id]['fields'] ?? '', true) ?: [];

		// filter out all unwanted item block types
		foreach ($item_block_data as $k_kbd => $v_ibd) {
			if (in_array($v_ibd['type'] ?? '', ["wysiwyg", "audio", "image", "video", "button"])) {
				unset($item_block_data[$k_kbd]);
			}
		}

		// re-index item block data
		$item_block_data = array_values($item_block_data);


		// filter out all unwanted item field types (no re-indexing necessary, not numerical)
		foreach ($item_field_data as $k_kfd => $v_ifd) {
			if (in_array($v_ifd['type'] ?? '', ["oasysButton", "oasysAudioVideo", "oasysImage"])) {
				unset($item_field_data[$k_kfd]);
			}
		}

		$item_field_keys = array_keys($item_field_data);

        # --------------- #
        # BLOCK ITERATION #
        # --------------- #

        foreach ($item_block_data as $ib_k => $ib_val) {

            // Modern blocks carry their field id explicitly. Legacy blocks may only line up by field position.
            $block_field_id = $ib_val["id"] ?? ($item_field_keys[$ib_k] ?? null);
            if ($block_field_id === null || !isset($item_field_data[$block_field_id])) continue;

            $ib_val["id"] = $block_field_id;
            $if_obj = $item_field_data[$block_field_id]; // extract 'field' column data
            $if_key_name = $ti_id . "_" . $block_field_id; // derive the keyname for item/field/question object
            $block_type = $ib_val["type"] ?? '';

            if (!in_array($block_type, ["choicematrix", "inline_gaps", "inline_textfields", "choice"])) {
                if (!in_array($if_key_name, $u_ans_keys)) continue;
            }

            # --------------- #
            # FIELD ITERATION #
            # --------------- #

            if ($block_type === "advanced") {
                $item_field_values[$if_key_name] = $if_obj['id'];

                # ADVANCED TYPE PROCESSING #

				if (isset($if_obj['values'])) {
					$qXcat[$if_key_name] = [];
					foreach ($if_obj['values'] as $ifValItem) {
						if (gettype($ifValItem) === "string") {
							$decodedValue = ctype_xdigit($ifValItem) && strlen($ifValItem) % 2 === 0 ? hex2bin($ifValItem) : $ifValItem;
							$qXcat[$if_key_name][] = $decodedValue;
                        } elseif (gettype($ifValItem) === "array") {
                            foreach ($ifValItem as $ivi) {
                                if (!isset($qXcat[$if_key_name])) $qXcat[$if_key_name] = [];
                                array_push($qXcat[$if_key_name], $ivi['value']);
                            }
                        }
                    }
                } else {
					$sourceValues = is_array($ib_val['source'] ?? null) ? $ib_val['source'] : [];
					$srcString = $sourceValues['EN'] ?? $sourceValues['DE'] ?? $sourceValues['FR'] ?? reset($sourceValues) ?: '';
                    $labelStr = $srcString;
                    $srcString = explode("\n", $srcString)[0];
                    $srcString = strip_tags($srcString); // strip all HTML tags
                    $srcString = trim(preg_replace('/\s*\[[^)]*\]/', '', $srcString)); // strip all contents within brackets
                    $srcString = trim(html_entity_decode($srcString), " \t\n\r\0\x0B\xC2\xA0"); // remove all HTML entities

					$item_field_values[$if_key_name] = $srcString;

					preg_match_all('/VALUE="(.+?)"/', $labelStr, $catMatches);
					$qXcat[$if_key_name] = $catMatches[1];
				}

				$fType[$if_key_name] = $block_type;
			} elseif (isset($ib_val["question"])) {

                # CHOICEMATRIX HANDLING #

                if ($block_type === "choicematrix") {
                    foreach (($ib_val['rows'] ?? []) as $cmIdx => $cmVal) {
                        $cm_field_key = $block_field_id . "_" . $cmVal["value"];
                        if (!isset($item_field_data[$cm_field_key])) continue;

                        $fType[$if_key_name . "_" . $cmVal["value"]] = $item_field_data[$cm_field_key]["type"];
						$cmLabels = is_array($cmVal['label'] ?? null) ? $cmVal['label'] : [];
						$cmLanguage = $settingsDefaults['defaultLanguage']['value'] ?? array_key_first($cmLabels);
						$item_field_values[$ti_id . "_" . $ib_val["id"] . "_" . $cmVal["value"]] = strip_tags((string)($cmLabels[$cmLanguage] ?? ''));
                        foreach (($ib_val['labels'] ?? []) as $il_k => $il_v) {
							$qXcat[$ti_id . "_" . $ib_val["id"] . "_" . $cmVal["value"]][] = strip_tags((string)($il_v["value"] ?? ''));
                        }
                    }
                    continue;
                }

                # INLINE GAPS HANDLING #

                if ($block_type === "inline_gaps") {
                    $ig_fields = $ib_val["fields"] ?? [];
                    $default_lang = $settingsDefaults["defaultLanguage"]["value"] ?? null;
                    $ig_lang = ($default_lang !== null && isset($ig_fields[$default_lang])) ? $default_lang : key($ig_fields);
                    if ($ig_lang === null || !isset($ig_fields[$ig_lang])) continue;
                    foreach ($ig_fields[$ig_lang] as $igIdx => $igFieldVal) {
                        $ig_field_key = $block_field_id . "_" . $igFieldVal["number"];
                        if (!isset($item_field_data[$ig_field_key])) continue;

                        $fType[$if_key_name . "_" . $igFieldVal["number"]] = $item_field_data[$ig_field_key]["type"];
                        $item_field_values[$ti_id . "_" . $ib_val["id"] . "_" . $igFieldVal["number"]] = strip_tags($igFieldVal["name"]);
                        $qXcat[$ti_id . "_" . $ib_val["id"] . "_" . $igFieldVal["number"]] = array_column($ib_val["answers"] ?? [], "value");
                    }
                    continue;
                }

                # INLINE TEXTFIELD HANDLING (a.k.a., 'choice' interaction) #

                if ($block_type === "inline_textfields") {
                    $ig_fields = $ib_val["fields"] ?? [];
                    $default_lang = $settingsDefaults["defaultLanguage"]["value"] ?? null;
                    $ig_lang = ($default_lang !== null && isset($ig_fields[$default_lang])) ? $default_lang : key($ig_fields);
                    if ($ig_lang === null || !isset($ig_fields[$ig_lang])) continue;
                    foreach ($ig_fields[$ig_lang] as $igIdx => $igFieldVal) {
                        $ig_field_key = $block_field_id . "_" . $igFieldVal["number"];
                        if (!isset($item_field_data[$ig_field_key])) continue;

                        $fType[$if_key_name . "_" . $igFieldVal["number"]] = $item_field_data[$ig_field_key]["type"];
                        $item_field_values[$ti_id . "_" . $ib_val["id"] . "_" . $igFieldVal["number"]] = strip_tags($igFieldVal["name"]);
                        $qXcat[$ti_id . "_" . $ib_val["id"] . "_" . $igFieldVal["number"]] = array_column($ib_val["correction"] ?? [], 0);
                    }
                    continue;
                }

                # CHECK DEFAULT LANGUAGE #

                if (isset($ib_val["question"][$settingsDefaults["defaultLanguage"]["value"]])) {
                    $item_field_values[$if_key_name] = strip_tags($ib_val["question"][$settingsDefaults["defaultLanguage"]["value"]]);
                } else {
					$fallbackQuestion = reset($ib_val["question"]);
					$item_field_values[$if_key_name] = strip_tags(is_string($fallbackQuestion) ? $fallbackQuestion : '');
                }

                // fTypes for non-metafield types can be defined here, whereas the metafield 'fType' must be defined at the field level above
                $fType[$if_key_name] = $block_type;

                # ALL OTHER INTERACTION TYPE HANDLING #

                if (isset($ib_val['labels'])) {
                    $qXcat[$if_key_name] = array_column($ib_val['labels'], "value"); // we're taking the 'value' and not the label text as the x-category string
                } elseif (isset($ib_val['choices'])) {
                    $qXcat[$if_key_name] = array_column($ib_val['choices'], "value"); // we're taking the 'value' and not the label text as the x-category string
                } elseif ($block_type === "slider") {
                    $qXcat[$if_key_name] = [];
                    for ($z = $ib_val["min"]; $z <= $ib_val["max"]; $z = $z + $ib_val['step']) {
                        array_push($qXcat[$if_key_name], $z);
                    }
                } else {
                    $qXcat[$if_key_name] = [];
                }
            } elseif (isset($ib_val['choices'])) {
                $qXcat[$if_key_name] = array_column($ib_val['choices'], "value");
            } else {
                continue;
            }
        }
    }

	// build array of values by fieldId
	$vals_by_field = [];
	foreach ($raw_answer_intake as $v1) {
		$key_str = $v1['itemId'] . "_" . $v1['fieldId'];

		if (!isset($vals_by_field[$key_str])) $vals_by_field[$key_str] = [];

		// populate values over field array (special checkbox array value type)
		if (gettype(json_decode($v1['value'])) === "array") {
			foreach (json_decode($v1['value'] ?? '', true) as $cb_k => $cb_v) {
				array_push($vals_by_field[$key_str], $cb_v);
			}
		} else {
			// populate values over field array (standard non-array value type)
			array_push($vals_by_field[$key_str], $v1['value']);
		}
	}

	$core_stats = ['raw' => []];
	// get mean, median, mode
	foreach ($vals_by_field as $field_name => $field_values) {

		// check for entry sets which are non-numerical so we can skip desc stats routine when required
		if (!empty($field_values)) {
			$notNum = false;
			foreach ($field_values as $f_val) {
				if (!is_numeric($f_val)) {
					$notNum = true;
					break;
				}
			}

			if ($notNum === false) {
				// load calls late to speed up previous processes which may not make it through all checks
				require_once '../inc/math-php/Statistics/Average.php';
				require_once '../inc/math-php/Statistics/Descriptive.php';
				require_once '../inc/math-php/Statistics/RandomVariable.php';

				// list in reverse order for how you want it displayed in frontend
				if (count($field_values) > 3) {
					$core_stats['K'][$field_name] = is_nan(round(MathPHP\Statistics\RandomVariable::kurtosis($field_values), 2)) ? "N/A" : round(MathPHP\Statistics\RandomVariable::kurtosis($field_values), 2);
				} else {
					$core_stats['K'][$field_name] = "N/A";
				}
				//REVIEW: [CHARTING] figure out if we use pop or sample deviation, or if we present the option to choose?
				$core_stats['σ'][$field_name] = round(MathPHP\Statistics\Descriptive::sd($field_values, true), 2);
				$core_stats['range'][$field_name] = MathPHP\Statistics\Descriptive::range($field_values);
				$core_stats['min'][$field_name] = min($field_values);
				$core_stats['max'][$field_name] = max($field_values);
				$core_stats['Mo'][$field_name] = MathPHP\Statistics\Average::mode($field_values);
				$core_stats['x̃'][$field_name] = MathPHP\Statistics\Average::median($field_values);
				$core_stats['μ'][$field_name] = round(MathPHP\Statistics\Average::mean($field_values), 2);
			}
			$core_stats['raw'][$field_name] = $field_values;
		}
	}

    // item index filtering based on raw answer set
    foreach ($item_field_values as $ifd_key => $val) {
        if (!isset($core_stats['raw'][$ifd_key])) {
            unset($item_field_values[$ifd_key]);
        }
    }

    foreach ($qXcat as $qxc_key => $val) {
        if (!isset($core_stats['raw'][$qxc_key])) {
            unset($qXcat[$qxc_key]);
        }
    }

    foreach ($fType as $ft_key => $val) {
        if (!isset($core_stats['raw'][$ft_key])) {
            unset($fType[$ft_key]);
        }
    }

    // obtain each field's value count sum
    $core_stats["N"] = [];
    foreach ($raw_answer_intake as $mainKey) {
		$valueField = json_decode($mainKey['value'] ?? '', true);
		$jsonValid = json_last_error() === JSON_ERROR_NONE;
		if (!isset($core_stats["N"][$mainKey['fi_key']])) $core_stats["N"][$mainKey['fi_key']] = 0;

		if ($jsonValid && is_array($valueField)) {
			$core_stats["N"][$mainKey['fi_key']] += count($valueField);
		} else {
			// Every scalar answer is one observation, including floats, booleans and JSON strings.
			$core_stats["N"][$mainKey['fi_key']] += 1;
		}
	}

	$returnData['data']['items'] = $item_field_values;
	$returnData['data']['core'] = $core_stats;
	$returnData['data']['xcat'] = $qXcat;
	$returnData['data']['fTypes'] = $fType;
	$returnData['data']['availableDates'] = array_keys($availableDates);
}

function fetchTestJourneySummary(array $data, rixPDO &$db, array &$returnData): void
{
	global $uiLang;
	checkParams($data, ['testId']);
	$testId = (int)$data['testId'];

	if (!resultsCanReadTest($testId, $db)) {
		$returnData['error'] = $uiLang->translate("Unable to load data.");
		return;
	}

	$testRow = $db->fetchRow("SELECT id, name, structure, options FROM tests WHERE id = ?", [$testId]);
	if (($testRow['rows'] ?? 0) === 0) {
		$returnData['error'] = $uiLang->translate("The selected test could not be found.");
		return;
	}

	$rows = $db->fetchTable(
		"SELECT
			activity.loginId,
			activity.passwordId,
			activity.testId,
			activity.timeLimit,
			CAST(activity.tsLoginServer AS CHAR) AS tsLoginServer,
			CAST(activity.tsFirstLoginServer AS CHAR) AS tsFirstLoginServer,
			CAST(activity.tsActiveServer AS CHAR) AS tsActiveServer,
			TIMESTAMPDIFF(SECOND, activity.tsActiveServer, NOW()) AS silenceSeconds,
			activity.timeLeft,
			activity.progress,
			activity.currentItem,
			activity.language,
			activity.clientOpen,
			activity.lastPayloadId,
			activity.lastEventId,
			activity.metaData,
			logins.name AS loginName,
			logins.displayName,
			logins.info,
			logins.loginType,
			logins.template AS loginTemplate,
			logins.parentTemplateId,
			parentTemplate.name AS parentTemplateName,
			parentTemplate.displayName AS parentTemplateDisplayName,
			passwords.tag AS passwordTag,
			passwords.label AS passwordLabel,
			passwords.name AS passwordName
		FROM activity
		JOIN logins ON logins.id = activity.loginId
		LEFT JOIN logins parentTemplate ON parentTemplate.id = logins.parentTemplateId
		JOIN passwords ON passwords.id = activity.passwordId
		WHERE activity.testId = ?
		ORDER BY logins.name, passwords.tag, activity.passwordId",
		[$testId]
	)['data'] ?? [];

	$eventStatsByPassword = journeyFetchEventStatsByPassword($testId, $db);
	$lifecycleByPassword = journeyFetchLifecycleByPassword($testId, $db);
	$answerCountsByPassword = journeyFetchAnswerCountsByPassword($testId, $db);
	$testTakers = [];
	foreach ($rows as $row) {
		$passwordId = (int)$row['passwordId'];
		if (!resultsCanReadPassword($passwordId, $db, $testId)) continue;

		$eventStats = $eventStatsByPassword[$passwordId] ?? journeyEmptyEventStats();
		$answerCount = $answerCountsByPassword[$passwordId] ?? 0;

		$testTakers[] = [
			'loginId' => (int)$row['loginId'],
			'passwordId' => $passwordId,
			'testId' => $testId,
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
			'status' => journeyStatusLabel(
				$row['timeLeft'],
				(int)$row['clientOpen'],
				(int)($eventStats['endedCount'] ?? 0) > 0,
				(int)($eventStats['timeUpCount'] ?? 0) > 0,
				is_null($row['silenceSeconds']) ? null : (int)$row['silenceSeconds'],
				$lifecycleByPassword[$passwordId] ?? null,
				is_null($row['timeLimit']) ? null : (int)$row['timeLimit']
			),
			'timeLeft' => journeyFormatSeconds($row['timeLeft']),
			'timeLeftRaw' => is_null($row['timeLeft']) ? null : (int)$row['timeLeft'],
			'progress' => is_null($row['progress']) ? null : round(((float)$row['progress']) * 100, 1),
			'currentItem' => $row['currentItem'],
			'language' => $row['language'],
			'clientOpen' => (int)$row['clientOpen'],
			'tsLoginServer' => $row['tsLoginServer'],
			'tsFirstLoginServer' => $row['tsFirstLoginServer'],
			'tsActiveServer' => $row['tsActiveServer'],
			'lastPayloadId' => is_null($row['lastPayloadId']) ? null : (int)$row['lastPayloadId'],
			'lastEventId' => is_null($row['lastEventId']) ? null : (int)$row['lastEventId'],
			'metaData' => journeyDecodeJson($row['metaData']),
			'info' => journeyDecodeJson($row['info']),
			'eventCount' => (int)$eventStats['eventCount'],
			'answerEventCount' => (int)$eventStats['answerEventCount'],
			'behaviourEventCount' => (int)$eventStats['behaviourEventCount'],
			'navigationCount' => (int)$eventStats['navigationCount'],
			'pageCount' => (int)$eventStats['pageCount'],
			'finalAnswerCount' => $answerCount,
			'firstEvent' => $eventStats['firstEvent'],
			'lastEvent' => $eventStats['lastEvent']
		];
	}

	$returnData['data'] = [
		'test' => [
			'id' => (int)$testRow['data']['id'],
			'name' => $testRow['data']['name'],
			'structure' => journeyDecodeJson($testRow['data']['structure']),
			'options' => journeyDecodeJson($testRow['data']['options']),
			'access' => resultsFetchTestTakerAccessSummary($testId, $db)
		],
		'testTakers' => $testTakers
	];
}

function fetchTestJourneyDetail(array $data, rixPDO &$db, array &$returnData): void
{
	global $uiLang;
	checkParams($data, ['testId', 'passwordId']);
	$testId = (int)$data['testId'];
	$passwordId = (int)$data['passwordId'];

	if (!resultsCanReadTest($testId, $db) || !resultsCanReadPassword($passwordId, $db, $testId)) {
		$returnData['error'] = $uiLang->translate("Unable to load data.");
		return;
	}

	journeyBuildDetailResponse($passwordId, $testId, $db, $returnData);
}

function report_export(array $data, rixPDO &$db, array &$returnData): void
{
	global $uiLang;
	require '../inc/domPDF/vendor/autoload.php';

	// pre-flight check and data extraction
	checkParams($data, ['htmlData', 'testId']);
	$testId = (int)$data['testId'];
	$htmlData = $data['htmlData'];
	if (!resultsCanReadTest($testId, $db)) {
		$returnData['error'] = $uiLang->translate("Unable to load data.");
		return;
	}
	if (!is_array($htmlData) || count($htmlData) === 0 || count($htmlData) > 200) {
		$returnData['error'] = $uiLang->translate("The report contains an invalid number of blocks.");
		return;
	}

	$totalPayloadSize = 0;
	$cleanHtmlData = [];
	foreach ($htmlData as $entry) {
		if (!is_array($entry) || !array_key_exists('group', $entry) || !is_string($entry['value'] ?? null)) {
			$returnData['error'] = $uiLang->translate("The report contains invalid data.");
			return;
		}
		$value = $entry['value'];
		$totalPayloadSize += strlen($value);
		if ($totalPayloadSize > 30 * 1024 * 1024) {
			$returnData['error'] = $uiLang->translate("The report is too large to generate.");
			return;
		}

		if (str_starts_with($value, 'data:image')) {
			if (strlen($value) > 8 * 1024 * 1024 || !preg_match('#^data:image/(?:png|jpeg);base64,[A-Za-z0-9+/=\r\n]+$#', $value)) {
				$returnData['error'] = $uiLang->translate("The report contains an invalid image.");
				return;
			}
			$cleanValue = $value;
		} else {
			$cleanValue = reportSanitizeHtml($value);
		}
		$cleanHtmlData[] = ['group' => (int)$entry['group'], 'value' => $cleanValue];
	}
	$htmlData = $cleanHtmlData;

	$tmpDir = sys_get_temp_dir();
	$openSansRegular = realpath(__DIR__ . '/../inc/fonts/ttf/OpenSans-VariableFont_wdth,wght.ttf');
	$openSansItalic = realpath(__DIR__ . '/../inc/fonts/ttf/OpenSans-Italic-VariableFont_wdth,wght.ttf');
	if ($openSansRegular === false || $openSansItalic === false) {
		$returnData['error'] = $uiLang->translate("The PDF font files could not be loaded.");
		return;
	}

	// initialize domPDF object
	$dompdf = new Dompdf([
		"defaultPaperSize" => "A4",
		"isRemoteEnabled" => false,
		"fontDir" => $tmpDir,
		"fontCache" => $tmpDir,
		"tempDir" => $tmpDir,
		"chroot" => realpath(__DIR__ . '/..')
	]);

	// build HTML for PDF and render

	$html_final = <<<HTML

<html lang="en-US">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<meta name="viewport" content="width=device-width">
<title></title>

<!-- <link href="https://fonts.googleapis.com/css2?family=Open+Sans" rel="stylesheet">  -->

<style>

    @font-face {
        font-family: 'Open Sans';
        font-style: normal;
        font-weight: 400;
        src: url('file://{$openSansRegular}') format('truetype');
    }
    @font-face {
        font-family: 'Open Sans';
        font-style: italic;
        font-weight: 400;
        src: url('file://{$openSansItalic}') format('truetype');
    }
    body, h1, h2, h3, h4, h5, h6, .ot_content { font-family: 'Open Sans', sans-serif; }
    .ot_content { padding: 10px 10px 20px; margin: 0; }
    .rbDateRangeReportBlock {
        display: table;
        width: 100%;
        padding: 0;
        border: 1px solid #b9d9e7;
        border-left: 5px solid #1a86b2;
        border-radius: 6px;
        box-sizing: border-box;
        background: #eef7fb;
        color: #526579;
    }
    .rbDateRangeReportBlock span,
    .rbDateRangeReportBlock strong {
        display: table-cell;
        vertical-align: middle;
        padding: 8px 12px;
    }
    .rbDateRangeReportBlock span {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
    }
    .rbDateRangeReportBlock strong {
        color: #203548;
        font-size: 14px;
        font-weight: 700;
        text-align: right;
    }

</style>

</head>
<body>

HTML;

	foreach (array_unique(array_column($htmlData, "group")) as $grpNum) {

		foreach (array_values($htmlData) as $hVal) {
			if (intval($hVal['group']) === intval($grpNum)) $html_final .= (substr($hVal['value'], 0, 10) === "data:image") ?
				"<div><img style='border:0;padding:0;margin:0;display:block;width:100%;' src='{$hVal['value']}' alt=''></div>" : // base64 image handling
				"<div style='border:0;padding:0;margin:0;display:block;width:100%;'>{$hVal['value']}</div>"; // standard text handling
		}
	}

	$html_final = preg_replace(
		'~<div[^>]*data-id=["\']##OARPT_PAGE_BREAK##["\'][^>]*>.*?</div>~is',
		"<div style='page-break-after: always;'></div>",
		$html_final
	);
	$html_final .= "
</body>
</html>
";

	try {
		$dompdf->loadHtml($html_final);
		$dompdf->render();
		$returnData['pdfData'] = base64_encode($dompdf->output());
	} catch (Throwable $e) {
		$returnData['error'] = $uiLang->translate("The PDF report could not be generated.");
	}
}

function reportSanitizeHtml(string $html): string
{
	$allowedTags = '<div><span><p><br><strong><b><em><i><u><s><h1><h2><h3><h4><h5><h6><ul><ol><li><table><thead><tbody><tr><th><td><blockquote><hr>';
	$html = strip_tags($html, $allowedTags);
	$document = new DOMDocument('1.0', 'UTF-8');
	$previous = libxml_use_internal_errors(true);
	$document->loadHTML('<?xml encoding="utf-8" ?><body>' . $html . '</body>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
	$body = $document->getElementsByTagName('body')->item(0);
	if ($body !== null) {
		foreach ($body->getElementsByTagName('*') as $element) {
			$remove = [];
			foreach ($element->attributes ?? [] as $attribute) {
				$name = strtolower($attribute->name);
				if (
					str_starts_with($name, 'on')
					|| !in_array($name, ['class', 'style', 'data-id'], true)
					|| ($name === 'style' && preg_match('/url\s*\(|expression\s*\(|@import/i', $attribute->value))
				) $remove[] = $attribute->name;
			}
			foreach ($remove as $attributeName) $element->removeAttribute($attributeName);
		}
	}
	$output = '';
	if ($body !== null) foreach ($body->childNodes as $node) $output .= $document->saveHTML($node);
	libxml_clear_errors();
	libxml_use_internal_errors($previous);
	return $output;
}

/*
	############################
	SCORING/CORRECTION FUNCTIONS
	############################
*/

# ------------------------ #
# MANUAL SCORING FUNCTIONS #
# ------------------------ #

function fetchTestSubmissionSummary($data, rixPDO &$db, &$returnData): void
{
	global $uiLang;
	checkParams($data, ['testId']);

	extract($data);
	if (!resultsCanReadTest((int)$testId, $db)) {
		$returnData['error'] = $uiLang->translate("Unable to load data.");
		return;
	}

	/* separate routine for fluid tests (?) */
	$fQuery = $db->fetchValue("SELECT `structure` FROM `tests` WHERE `id` = ?", [$testId])['data'];
	$isForM = in_array(json_decode($fQuery ?? '', true)['type'], ["fluid", "mutation"]);
	$returnData["fluidOrMut"] = $isForM;
	$testTakerAccess = resultsFetchTestTakerAccessSummary((int)$testId, $db);
	$returnData["testTakerAccess"] = $testTakerAccess;

	$scorable = 0;

	if ($isForM === false) {
		$scorable = $db->fetchValue("SELECT
IFNULL(MAX(
IFNULL( GREATEST( JSON_CONTAINS( JSON_EXTRACT( `fields`, '$.*.processing' ), '[\"auto\"]' ), JSON_CONTAINS( JSON_EXTRACT( `fields`, '$.*.processing' ), '[\"manual\"]' )), 0 )), 0) AS scorable
FROM
    items
WHERE
( SELECT JSON_CONTAINS( JSON_EXTRACT( structure, '$.items[*].hiddenID' ), items.id ) FROM tests WHERE tests.id = ? )", [$testId])['data'];

		$itemsMissing = $db->fetchValue(
			"SELECT
		COUNT(*) AS missingPages
	FROM
		(
		SELECT
			t1.id,
			items.id AS page
		FROM
			tests,
			JSON_TABLE ( structure, '$.items[*].hiddenID' COLUMNS ( id INT path '$' ) ) AS t1
			LEFT JOIN items ON t1.id = items.id
		WHERE
			tests.id = ?
		HAVING
		page IS NULL
	) t2",
			[$testId]
		)['data'];
	} else {
		$scorable = $db->fetchValue("SELECT
			IFNULL( MAX( IFNULL( GREATEST( JSON_CONTAINS( JSON_EXTRACT( `fields`, '$.*.processing' ), '[\"auto\"]' ), JSON_CONTAINS( JSON_EXTRACT( `fields`, '$.*.processing' ), '[\"manual\"]' )), 0 )), 0 ) AS scorable
		FROM
			items
		WHERE
			(
			SELECT
				MAX(JSON_CONTAINS( JSON_EXTRACT( structure, '$[*].hiddenID' ), items.id ))
			FROM
				testCache
			WHERE
			testCache.testId = ?
			) = 1", [$testId])['data'];


		$itemsMissing = $db->fetchValue(
			"SELECT
			COUNT(*) AS missingPages
		FROM
			(
			SELECT
				t1.id,
				items.id AS page
			FROM
				testCache,
				JSON_TABLE ( structure, '$[*].hiddenID' COLUMNS ( id INT path '$' ) ) AS t1
				LEFT JOIN items ON t1.id = items.id
			WHERE
				testCache.testId = ?
			HAVING
			page IS NULL
			) t2",
			[$testId]
		)['data'];
	}

	# fast check if a scorable test type or not, and skip scoring class instantiation if not #
	if ($scorable === 0) {
		$returnData = array_merge($returnData, [
			'testId' => $testId,
			'testName' => $db->fetchValue("SELECT `name` FROM `tests` WHERE `id` = ?", [$testId])['data'],
			'hasMan' => false,
			'manualScoringSummary' => resultsFetchManualScoringSummary((int)$testId, $db),
			'scorable' => 0,
			'itemsMissing' => $itemsMissing > 0
		]);

		return;
	}

	try {
		$testScoring = new OasysScoring($testId, $db);
	} catch (Exception $e) {
		$returnData['error'] = $e->getMessage();
		exit;
	}

	/* previously full autoscoring routine would have been here */

	$containsMS = $testScoring->containsMS();
	$manualScoringSummary = resultsFetchManualScoringSummary((int)$testId, $db);

	// A new result has no populated scoringData until the scoring pipeline has run once.
	// Build it for the initial overview so 0/0 is not mistaken for completed scoring.
	if ((int)$containsMS === 1
		&& ($testTakerAccess['readable'] ?? 0) > 0
		&& ($manualScoringSummary['accessibleItemsTotal'] ?? 0) === 0) {
		try {
			$testScoring->populateAnswers();
			$testScoring->getScoreData();
			$testScoring->manscoreProcess();
			$manualScoringSummary = resultsFetchManualScoringSummary((int)$testId, $db);
		} catch (Throwable $e) {
			$returnData['error'] = $e->getMessage();
			return;
		}
	}

	$returnData = array_merge($returnData, [
		'testId' => $testId,
		'testName' => $db->fetchValue("SELECT `name` FROM `tests` WHERE `id` = ?", [$testId])['data'],
		'hasMan' => $containsMS === 0 ? false : (($manualScoringSummary['accessibleItemsNeedScoring'] ?? 0) > 0),
		'manualScoringSummary' => $manualScoringSummary,
		'containsMS' => $containsMS,
		'updateTime' => $testScoring->lastUpdateTime(),
		'scorable' => 1,
		'itemsMissing' => $testScoring->getItemsMissing()
	]);
}

/**
 * Level 2 scoring screen (middle screen)
 */
function fetchTestSummaryData($data, rixPDO &$db, &$returnData): void
{
	global $uiLang, $myAuth;
	checkParams($data, ['testId']);
	extract($data);
	if (!resultsCanReadTest((int)$testId, $db)) {
		$returnData['error'] = $uiLang->translate("Unable to load data.");
		return;
	}

	/* run entire scoring process on test page list call */
	try {
		$testScoring = new OasysScoring($testId, $db);
		$testScoring->populateAnswers();
		$testScoring->getScoreData();
		$testScoring->manscoreProcess();
	} catch (Exception $e) {
		$returnData['error'] = $e->getMessage();
		exit;
	}

	$testName = $db->fetchValue("SELECT `name` FROM `tests` WHERE `id` = ?", [$testId])['data'];

	/* get page & count stats */

	if (!$testScoring->scorable()) {
		$returnData['reloadFolder'] = true;
		$returnData['error'] = $uiLang->translate("This test is not scorable. Returning to the test selection screen.");
		exit;
	}

	$testTakerAccess = resultsFetchTestTakerAccessSummary((int)$testId, $db);
	$manualScoringLease = scoringManualLease((int)$testId, $db, ($testTakerAccess['writable'] ?? 0) > 0);

	try {
		$returnData = array_merge($returnData, [
			'testId' => $testId,
			'testName' => $testName,
			't_scoringSummary' => $testScoring->getTlistSummary($startPos),
			'q_scoringSummary' => $testScoring->getQlistSummary($q_startPos),
			'ttl_count' => $testScoring->get_tt_count(),
			'tpl_count' => $testScoring->get_q_count(),
			'testTakerAccess' => $testTakerAccess,
			'manualScoringLease' => $manualScoringLease
		]);
	} catch (Exception $e) {
		$returnData['reloadFolder'] = true;
		$returnData['error'] = $e->getMessage();
		exit;
	}

	/* permission filtering the test takers based on the scorer's access */
	if (!empty($returnData['t_scoringSummary']) && is_array($returnData['t_scoringSummary'])) {
		$accessMap = resultsFetchTestTakerAccessMap((int)$testId, $db);
		foreach ($returnData['t_scoringSummary'] as $k => $entry) {
			$passwordId = (int)($entry['passwordId'] ?? 0);
			$access = $accessMap[$passwordId] ?? ['read' => false, 'write' => false];

			// first level filter: scorer's access to the login id
			if (!$access['read']) {
				unset($returnData['t_scoringSummary'][$k]);
				continue;
			}
			$returnData['t_scoringSummary'][$k]['canWriteScores'] = $access['write'] && $manualScoringLease['owned'];
			/* second level filter: check scorer access to the itemgroups linked to the test being loaded
									if at least 1 itemgroup is not found to have access for the scorer, then
									there will not exist a loginid/test with accessible itemgroup combination,
									so we blank out the loginid list all together.
			*/
        // $linkedItemGroups = json_decode($db->fetchValue("SELECT `structure` from `tests` where `id` = ?", [$testId])['data'], true)['items'];
        // $itemIds = array_column($linkedItemGroups, 'hiddenID');

        // $hasAnyItemAccess = false;
        // foreach ($itemIds as $itemId) {
        //     $hasItemRead = permPass(intVal($itemId), "itemId", $db);
        //     if ($hasItemRead === true) {
        //         $hasAnyItemAccess = true;
        //         break;
        //     }
        // }

        // if ($hasAnyItemAccess === false) {
        //     $returnData['t_scoringSummary'] = [];
        //     continue;
        // }
		}

		// reindex array after removals
		$returnData['t_scoringSummary'] = array_values($returnData['t_scoringSummary']);
	}

	$returnData['ttl_count'] = (int)($testTakerAccess['readable'] ?? 0);
	if (!empty($returnData['q_scoringSummary']) && is_array($returnData['q_scoringSummary'])) {
		$returnData['q_scoringSummary'] = resultsRestrictQuestionSummary(
			$returnData['q_scoringSummary'],
			(int)$testId,
			$db
		);
	}

	/* permission filtering the content pages based on the scorer's access */
// if (!empty($returnData['q_scoringSummary']) && is_array($returnData['q_scoringSummary'])) {

//     // first level filter: remove itemgroup entries (pages) to which the scorer does not have access
//     foreach ($returnData['q_scoringSummary'] as $k => $entry) {
//         $pageId = $entry['id'] ?? null;
//         $permResPid = permPass(intVal($pageId), "itemId", $db);

//         if ($permResPid !== true) {
//             unset($returnData['q_scoringSummary'][$k]);
//         }
//     }

//     // second level filter: if the test taker list is empty, no test pages can possibly be available to score
//     if (empty($returnData['t_scoringSummary'])) $returnData['q_scoringSummary'] = [];

//     // reindex array after removals
//     $returnData['q_scoringSummary'] = array_values($returnData['q_scoringSummary']);
// }
}

function fetchQAListDetail($data, rixPDO &$db, &$returnData): void
{
	global $uiLang, $permAuth;

	checkParams($data, ['qType']);

	// quickly extract all $data input vars into their respective var names
	extract($data);
	if (!resultsCanReadTest((int)$testId, $db)) {
		$returnData['error'] = $uiLang->translate("Unable to load data.");
		return;
	}
	$testTakerAccess = resultsFetchTestTakerAccessSummary((int)$testId, $db);
	$manualScoringLease = scoringManualLease((int)$testId, $db, ($testTakerAccess['writable'] ?? 0) > 0);
	$returnData['manualScoringLease'] = $manualScoringLease;

	try {
		$testScoring = new OasysScoring($testId, $db);
	} catch (Exception $e) {
		$returnData['error'] = $e->getMessage();
		die();
	}

	$testScoring->populateAnswers();
	$testScoring->getScoreData();
	$testScoring->manscoreProcess();

	$testName = $db->fetchValue("SELECT `name` FROM `tests` WHERE `id` =?", [$testId])['data'];

	/** @var bool $fastSwitch Sent in as _true_ when switching from jsButton2s. */
	$fastSwitch = $data['fSwitch'] ?? false;

	if ($data['qType'] === 't') checkParams($data, ['passwordId']);
	if ($data['qType'] === 'q') checkParams($data, ['testId', 'pageId']);

	# ---------------------------------------------------------- #
	# Switch logic based on question or test-taker request types #
	# ---------------------------------------------------------- #

	switch ($qType) {

		case 'q': // routine for 'question list' view mode
			if (!scoringTestContainsPage((int)$testId, (int)$pageId, $db)) {
				$returnData['error'] = $uiLang->translate("The selected page does not belong to this test's scoring data.");
				return;
			}
			try {
				$returnData = array_merge($returnData, $testScoring->get_q_list_detail($pagePosStart, $testId, $msOnly, $pageId));
			} catch (Exception $e) {
				$returnData['error'] = $e->getMessage();
				exit;
			}

			// re-validate object permissions to counter injection attacks
			$userList = $returnData['userList'];
			$accessMap = resultsFetchTestTakerAccessMap((int)$testId, $db);

			foreach ($userList as $ulKey => $ulEntry) {
				$passwordAccess = $accessMap[(int)$ulEntry['passwordId']] ?? ['read' => false, 'write' => false];
				// treat null as deny — only allow when explicit true
				if (!$passwordAccess['read']) unset($returnData['userList'][$ulKey]);
				else $returnData['userList'][$ulKey]['canWriteScores'] = $passwordAccess['write'] && $manualScoringLease['owned'];
			}

			if (empty($returnData['userList'])) {
				$returnData['error'] = $uiLang->translate("No accessible test takers found.");
				return;
			}

			$passwordId = $returnData['userList'][array_key_first($returnData['userList'])]['passwordId'];

			$returnData['testInfo'] = [
				'passwordId' => $passwordId,
				'testId' => $testId,
				'testName' => $testName,
				'pageId' => $pageId,
				'pageName' => $pageName
			];

			$pwdList = array_map(fn($n) => $n['passwordId'], $returnData['userList']);
			$returnData['passwordList'] = array_values($pwdList);
			$returnData['fastSwitch'] = $fastSwitch;

			break;

		case 't': // routine for 'test taker' view mode
			if (permPass(intVal($passwordId), "passwordId", $db, (int)$testId) !== true) {
				$returnData['error'] = $uiLang->translate("Unable to load data.");
				return;
			}

			try {
				$returnData = array_merge($returnData, $testScoring->get_tt_list_detail($passwordId, $pagePosStart, $msOnly, (($qType === 't') ? false : $pageId)));
			} catch (Exception $e) {
				$returnData['error'] = $e->getMessage();
				exit;
			}

			// filter out pages to which the user does not have view permissions
        // $pageList = array_keys($returnData['scoringAnswerList']);

        // foreach ($pageList as $_z => $pageId_0) {
        //     $hasPageRead = permPass(intVal($pageId_0), "itemId", $db);
        //     if ($hasPageRead !== true) {
        //         unset($returnData['scoringAnswerList'][$pageId_0]);
        //         unset($returnData['markedScores'][$passwordId][$pageId_0]);
        //     }
        // }

			// refresh scoring page count
			$returnData['testPageCount'] = count($returnData['scoringAnswerList']);

			$returnData['fastSwitch'] = $fastSwitch;

			// Get test/pwd combo activity status
			if ($qType === 'q') $data['passwordId'] = $passwordId;

			break;

		default:
			$returnData['error'] = $uiLang->translate("Bad data.");
			exit;
	}

	// get password tag, login, and display name data to add to userInfo object
	$pTag = $db->fetchValue("SELECT `tag` FROM `passwords` WHERE `id` = ?", [$passwordId])['data'];
	extract($db->fetchRow("SELECT `loginId`, `loginName` FROM `view_tt_list` WHERE `testId` = ? AND `passwordId` = ?", [$testId, $passwordId])['data']);
	$displayName = $db->fetchValue("SELECT `displayName` from `logins` WHERE id = ?", [$loginId])['data'];

	$returnData['userInfo'] = [
		'testId' => $testId,
		'testName' => $testName,
		'passwordId' => $passwordId,
		'passwordTag' => $pTag,
		'loginId' => $loginId,
		'loginName' => $loginName,
		'displayName' => $displayName,
		'canWriteScores' => permPassWrite(intVal($passwordId), "passwordId", $db, (int)$testId) && $manualScoringLease['owned']
	];

	// return the page view type
	$returnData['qType'] = $data['qType'];
}

/**
 * Adds test activity timeLeft value to returnData array.
 *
 * @param array $data
 * @param rixPDO $db
 * @param array $returnData
 * @return void
 */
function getTL(array $data, rixPDO &$db, array &$returnData): void
{
	checkParams($data, ['testId', 'passwordId']);
	extract($data);
	global $uiLang;
	if (!resultsCanReadPassword((int)$passwordId, $db, (int)$testId)) {
		$returnData['error'] = $uiLang->translate("Unable to load data.");
		return;
	}

	$curTL = $db->fetchValue("SELECT `timeLeft` FROM `activity` WHERE `testId` = ? AND `passwordId` = ?", [$testId, $passwordId])['data'];

	if ($curTL === 0) {
		$returnData['tl_msg'] = ["#2D8DB6" => $uiLang->translate("This test is in submitted status, and you may begin (or continue) scoring.")];
	} elseif ($curTL > 0) {
		$returnData['tl_msg'] = ["red" => $uiLang->translate("This test has %@ minutes remaining, and has not been submitted!", [$curTL])];
	} elseif ($curTL < 0) {
		$returnData['tl_msg'] = ["red" => $uiLang->translate("This test does not have a time limit, and has not been submitted!")];
	}
}


function fetchQADetail($data, rixPDO &$db, &$returnData): void
{
	checkParams($data, ['passwordId', 'testId', 'pageId', 'pageName']);

	extract($data);
	global $permAuth, $uiLang;
	if (!resultsCanReadTest((int)$testId, $db)) {
		$returnData['reloadFolder'] = true;
		$returnData['error'] = $uiLang->translate("Unable to load data.");
		exit;
	}
	$manualScoringLease = scoringManualLease((int)$testId, $db, permPassWrite(intVal($passwordId), "passwordId", $db, (int)$testId) === true);
	$returnData['manualScoringLease'] = $manualScoringLease;

	$hasLoginRead = permPass(intVal($passwordId), "passwordId", $db, (int)$testId);
// $hasPageRead = permPass(intVal($pageId), "itemId", $db);

	// if data does not match up, boot the user back to the main module page
// if (($hasLoginRead !== true) || ($hasPageRead !== true)) {
if (($hasLoginRead !== true)) {
		$returnData['reloadFolder'] = true;
		$returnData['error'] = $uiLang->translate("Unable to load data.");
		exit;
	}
	if (!scoringContainsPage((int)$passwordId, (int)$testId, (int)$pageId, $db)) {
		$returnData['error'] = $uiLang->translate("The selected page does not belong to this test taker's scoring data.");
		return;
	}

	// if NOT ONLY comment request, add these additional arrays in return
	try {
		$testScoring = new OasysScoring($testId, $db);
	} catch (Exception $e) {
		$returnData['error'] = $e->getMessage();
		die();
	}

	# -------------------------------- #
	# BUILD SCORE ASSIGNMENT STRUCTURE #
	# -------------------------------- #

	try {
		$returnData['assignmentStruct'] = $testScoring->buildAstruct($pageId);
	} catch (Exception $e) {
		$returnData['reloadFolder'] = true;
		$returnData['error'] = $e->getMessage();
		exit;
	}

	# ------------------------------ #
	# BUILD CORRECTION KEY STRUCTURE #
	# ------------------------------ #

	$returnData['corKey'] = $testScoring->buildCorKey($pageId);

	# --------------------------------------------------------------- #
	# Validate given answers list matches contained within items list #
	# --------------------------------------------------------------- #

	$itemData = $testScoring->fetchItemData($pageId, $db);
	$returnData['languages'] = $itemData['languages'];
	$ans = $db->fetchColumn("SELECT `fieldId` FROM `answers` WHERE `testId` = ? AND `itemId` = ? AND `passwordId` = ?", [$testId, $pageId, $passwordId])['data'];
	foreach ($ans as $val) {
		if (!in_array($val, array_keys($itemData['fields']))) {
			$returnData['integFail'] = true;
			break;
		} else {
			$returnData['integFail'] = false;
		}
	}

	# ------------------------------------------------ #
	# REQUIRED RETURN DATA - DETAILED PAGE INFORMATION #
	# ------------------------------------------------ #

	$returnData = array_merge($returnData, $testScoring->getQAslice($testId, $passwordId, $pageId));

	# ------------------------------- #
	# COMMENTS/MARKED SCORE RETRIEVAL #
	# ------------------------------- #

	$gsd = $db->fetchValue("SELECT `givenScoringData` FROM `scoring` WHERE `testId` = ? AND `passwordId` = ?", [$testId, $passwordId])['data'];
	$gsd = json_decode($gsd ?? '', true);

	$sumScore = 0;
	if (isset($gsd[$pageId])) {
		foreach ($gsd[$pageId] as $item => $scoreKey) {
			if ($item === "pageName") continue;
			$sumScore += (float)($scoreKey['score']['scoreValue'] ?? 0);
			$returnData['scoredByInfo'][$item] = $scoreKey['score'] ?? [];
			$returnData['comments'][$item] = $scoreKey['comment'] ?? false;
		}
	}

	if (in_array("auto", array_column($returnData['scoringInfo'], 'itemScoreType'))) {
		$testScoring->populateAnswers();
		$testScoring->getScoreData();

		foreach ($returnData['scoringInfo'] as $itemName => $itemData) {
			if ($itemData['itemScoreType'] === "auto") {
				$returnData['scoredByInfo'][$itemName] = [
					'scoreValue' => $returnData['scoringInfo'][$itemName]["earned"],
					'scoreTime' => "N/A",
					'scoreBy' => "_autoscore_",
					'scoreById' => 0
				];
				$returnData['comments'][$itemName] = false;
			}
			$sumScore = $testScoring->getAggregatedScore($passwordId)[$pageId]['achieved'];
		}
	}

	$returnData['score'] = $sumScore; // this is the score for the page

	# ------------------------- #
	# FETCH TEST ACTIVITY STATE #
	# ------------------------- #
	getTL($data, $db, $returnData);

	# ------------------------------------ #
	# FETCH LIVE/UPDATED TEST TAKER SCORES #
	# ------------------------------------ #

	$sumData = $db->fetchRow("SELECT `loginName`, `finalScore`, `progress`, `lConn` FROM `view_tt_list` WHERE `testId` = ? AND `passwordId` = ?", [$testId, $passwordId])['data'];
	$returnData['liveScore'] = $sumData;
	$returnData['liveScore']['points'] = $db->fetchValue("SELECT `points` FROM `scoring` WHERE `testId` = ? AND `passwordId` = ?", [$testId, $passwordId])['data'];

	# --------------------------------------------------------------- #
	# GET GROUP ID OF PAGE ID; REQUIRED FOR TEST PAGE PREVIEW FUNCTION #
	# ---------------------------------------------------------------- #

	$groupdId = $db->fetchValue("SELECT `groupId` FROM `items` WHERE `id` = ?", [$pageId])['data'];

	# --------------------------------------- #
	# SEND BACK SENT IN VALUES, AND THEN SOME #
	# --------------------------------------- #

	$lInfo = $db->fetchRow("SELECT `loginId`, `loginName` FROM `scoring` WHERE `passwordId` = ? and `testId` = ?", [$passwordId, $testId])['data'];
	$testName = $db->fetchValue("SELECT `name` FROM `tests` WHERE `id` = ?", [$testId])['data'];

	$returnData['pageName'] = $pageName;
	$returnData['pageId'] = $pageId;
	$returnData['groupdId'] = $groupdId;
	$returnData['testId'] = $testId;
	$returnData['passwordId'] = $passwordId;
	$returnData['loginId'] = $lInfo['loginId'];
	$returnData['loginName'] = $lInfo['loginName'];
	$returnData['testName'] = $testName;
	$returnData['canWriteScores'] = permPassWrite(intVal($passwordId), "passwordId", $db, (int)$testId) && $manualScoringLease['owned'];
}

function scoringJsonPathSegment($value): string
{
	return json_encode((string)$value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

/**
 * Acquire or renew the test-wide manual-scoring lease for this backend session.
 * A short named lock makes checking and claiming the lease atomic. The lease is
 * deliberately time limited so a closed browser cannot leave a test locked.
 */
function scoringManualLease(int $testId, rixPDO &$db, bool $acquire = true): array
{
	global $backendState;

	$currentStateId = $backendState->getStateId();
	$now = time();
	$leaseSeconds = 90;
	$result = ['owned' => false, 'owner' => null, 'expiresAt' => null];
	$mutexName = "oasys-ms-lease-$testId";
	$mutex = $db->fetchValue("SELECT GET_LOCK(?, 5)", [$mutexName]);
	if (($mutex['data'] ?? 0) != 1) return ['owned' => false, 'owner' => 'Another user', 'expiresAt' => null];

	try {
		$rows = $db->fetchTable(
			"SELECT `stateId`, JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.manualScoringLease.value')) AS `lease`
			 FROM `stateBackend`
			 WHERE JSON_EXTRACT(`data`, '$.manualScoringLease.value') IS NOT NULL"
		)['data'] ?? [];

		foreach ($rows as $row) {
			$lease = json_decode($row['lease'] ?? '', true);
			if (!is_array($lease) || (int)($lease['testId'] ?? 0) !== $testId || (int)($lease['expiresAt'] ?? 0) <= $now) continue;

			if ((string)$row['stateId'] === $currentStateId) {
				$result = ['owned' => true, 'owner' => (string)($lease['username'] ?? ''), 'expiresAt' => (int)$lease['expiresAt']];
				break;
			}

			$result = ['owned' => false, 'owner' => (string)($lease['username'] ?? 'Another user'), 'expiresAt' => (int)$lease['expiresAt']];
			break;
		}

		if (($result['owned'] || $result['owner'] === null) && $acquire) {
			$lease = [
				'testId' => $testId,
				'username' => (string)($backendState->username ?? 'Unknown user'),
				'userId' => (int)($backendState->userid ?? 0),
				'expiresAt' => $now + $leaseSeconds,
			];
			$backendState->manualScoringLease = $lease;
			$result = ['owned' => true, 'owner' => $lease['username'], 'expiresAt' => $lease['expiresAt']];
		}
	} finally {
		$db->fetchValue("SELECT RELEASE_LOCK(?)", [$mutexName]);
	}

	return $result;
}

function scoringRequireManualLease(int $testId, rixPDO &$db, array &$returnData): bool
{
	global $uiLang;
	$lease = scoringManualLease($testId, $db, true);
	$returnData['manualScoringLease'] = $lease;
	if ($lease['owned']) return true;

	$returnData['error'] = $uiLang->translate(
		'Manual scoring for this test is currently locked by %@. Please wait until that user has finished.',
		[$lease['owner'] ?? $uiLang->translate('another user')]
	);
	return false;
}

function refreshManualScoringLease(array $data, rixPDO &$db, array &$returnData): void
{
	checkParams($data, ['testId']);
	if (!resultsCanReadTest((int)$data['testId'], $db)) return;
	$access = resultsFetchTestTakerAccessSummary((int)$data['testId'], $db);
	$returnData['manualScoringLease'] = scoringManualLease((int)$data['testId'], $db, ($access['writable'] ?? 0) > 0);
}

function releaseManualScoringLease(array $data, rixPDO &$db, array &$returnData): void
{
	global $backendState;
	checkParams($data, ['testId']);
	$current = $backendState->manualScoringLease ?? null;
	if (is_array($current) && (int)($current['testId'] ?? 0) === (int)$data['testId']) unset($backendState->manualScoringLease);
	$returnData['released'] = true;
}

function scoringLockGivenData(int $passwordId, int $testId, rixPDO &$db): ?array
{
	$row = $db->fetchRow(
		"SELECT `givenScoringData` FROM `scoring` WHERE `passwordId` = ? AND `testId` = ? FOR UPDATE",
		[$passwordId, $testId]
	);
	if (!empty($row['error']) || ($row['rows'] ?? 0) !== 1) return null;
	$decoded = json_decode($row['data']['givenScoringData'] ?? '', true);
	return is_array($decoded) ? $decoded : [];
}

function scoringConflictTokenMatches($expected, $current): bool
{
	$expected = ($expected === null || $expected === '') ? null : (string)$expected;
	$current = ($current === null || $current === '') ? null : (string)$current;
	return $expected === $current;
}

function scoringEntryMatches(array $expected, array $current): bool
{
	foreach ($expected as $key => $value) {
		if (!scoringConflictTokenMatches($value, $current[$key] ?? null)) return false;
	}
	return true;
}

function scoringUpdateSucceeded(array $result): bool
{
	return empty($result['error']);
}

function scoringAcquireWriteLock(int $passwordId, int $testId, rixPDO &$db): ?string
{
	$lockName = "oasys-ms-$testId-$passwordId";
	$locked = $db->fetchValue("SELECT GET_LOCK(?, 10)", [$lockName]);
	return (($locked['data'] ?? 0) == 1) ? $lockName : null;
}

function scoringReleaseWriteLock(?string $lockName, rixPDO &$db): void
{
	if ($lockName !== null) $db->fetchValue("SELECT RELEASE_LOCK(?)", [$lockName]);
}

function scoringAcquireTestWriteLocks(int $testId, rixPDO &$db): ?array
{
	$passwordIds = $db->fetchColumn(
		"SELECT `passwordId` FROM `scoring` WHERE `testId` = ? ORDER BY `passwordId`",
		[$testId]
	)['data'] ?? [];
	$locks = [];
	foreach ($passwordIds as $passwordId) {
		$lock = scoringAcquireWriteLock((int)$passwordId, $testId, $db);
		if ($lock === null) {
			foreach ($locks as $heldLock) scoringReleaseWriteLock($heldLock, $db);
			return null;
		}
		$locks[] = $lock;
	}
	return $locks;
}

function scoringReleaseWriteLocks(array $locks, rixPDO &$db): void
{
	foreach ($locks as $lock) scoringReleaseWriteLock($lock, $db);
}

function scoringContainsPage(int $passwordId, int $testId, int $pageId, rixPDO &$db): bool
{
	$pagePath = scoringJsonPathSegment($pageId);
	$result = $db->fetchValue(
		"SELECT JSON_CONTAINS_PATH(`scoringData`, 'one', CONCAT('$.scoringAnswerList.', ?))
		 FROM `scoring` WHERE `passwordId` = ? AND `testId` = ?",
		[$pagePath, $passwordId, $testId]
	);
	if ($result['data'] == 1) return true;

	return scoringDeliveredPageExists($testId, $pageId, $db, $passwordId);
}

function scoringTestContainsPage(int $testId, int $pageId, rixPDO &$db): bool
{
	$pagePath = scoringJsonPathSegment($pageId);
	$result = $db->fetchValue(
		"SELECT EXISTS(
			SELECT 1 FROM `scoring`
			WHERE `testId` = ?
			AND JSON_CONTAINS_PATH(`scoringData`, 'one', CONCAT('$.scoringAnswerList.', ?))
		)",
		[$testId, $pagePath]
	);
	if ($result['data'] == 1) return true;

	return scoringDeliveredPageExists($testId, $pageId, $db);
}

/**
 * Auto-only pages are assembled dynamically by OasysScoring and therefore do
 * not exist in scoringData.scoringAnswerList. Confirm that such a page really
 * belongs to the selected result before allowing the detail request.
 */
function scoringDeliveredPageExists(int $testId, int $pageId, rixPDO &$db, ?int $passwordId = null): bool
{
	if ($testId <= 0 || $pageId <= 0) return false;
	if ($passwordId !== null) {
		$resultExists = $db->fetchValue(
			'SELECT EXISTS(SELECT 1 FROM scoring WHERE testId = ? AND passwordId = ?)',
			[$testId, $passwordId]
		)['data'] ?? 0;
		if ($resultExists != 1) return false;
	}

	$answerSql = 'SELECT EXISTS(SELECT 1 FROM answers WHERE testId = ? AND itemId = ?';
	$answerParams = [$testId, $pageId];
	if ($passwordId !== null) {
		$answerSql .= ' AND passwordId = ?';
		$answerParams[] = $passwordId;
	}
	$answerSql .= ')';
	$answerExists = $db->fetchValue($answerSql, $answerParams)['data'] ?? 0;
	if ($answerExists == 1) return true;

	$testStructureRaw = $db->fetchValue('SELECT structure FROM tests WHERE id = ?', [$testId])['data'] ?? null;
	$testStructure = json_decode($testStructureRaw ?? '', true);
	$testType = is_array($testStructure) ? strtolower((string)($testStructure['type'] ?? '')) : '';
	if ($testType === 'linear') {
		foreach (($testStructure['items'] ?? []) as $entry) {
			if ((int)($entry['hiddenID'] ?? 0) === $pageId) return true;
		}
	}

	$cacheSql = 'SELECT structure FROM testCache WHERE testId = ?';
	$cacheParams = [$testId];
	if ($passwordId !== null) {
		$cacheSql .= ' AND passwordId = ?';
		$cacheParams[] = $passwordId;
	}
	$cacheRows = $db->fetchColumn($cacheSql, $cacheParams)['data'] ?? [];
	foreach ($cacheRows as $cacheRaw) {
		$cacheStructure = json_decode($cacheRaw ?? '', true);
		if (!is_array($cacheStructure)) continue;
		foreach ($cacheStructure as $entry) {
			if ((int)($entry['hiddenID'] ?? 0) === $pageId) return true;
		}
	}

	return false;
}

function scoringItemType(int $passwordId, int $testId, int $pageId, string $itemName, rixPDO &$db): ?string
{
	$pagePath = scoringJsonPathSegment($pageId);
	$itemPath = scoringJsonPathSegment($itemName);
	$result = $db->fetchValue(
		"SELECT JSON_UNQUOTE(JSON_EXTRACT(`scoringData`, CONCAT('$.scoringAnswerList.', ?, '.', ?, '.itemScoreType')))
		 FROM `scoring` WHERE `passwordId` = ? AND `testId` = ?",
		[$pagePath, $itemPath, $passwordId, $testId]
	);
	return is_string($result['data'] ?? null) ? $result['data'] : null;
}

function scoringAddComment($data, rixPDO &$db, &$returnData): void
{
	global $backendState, $uiLang;
	checkParams($data, ['comment', 'pageId', 'passwordId', 'itemName', 'testId']);
	extract($data);
	$expectedComment = [];
	if (array_key_exists('expectedCommentVersion', $data)) $expectedComment['version'] = $data['expectedCommentVersion'];
	$hasConflictToken = count($expectedComment) > 0;
	if (!resultsCanWritePassword((int)$passwordId, $db, $returnData, $uiLang, (int)$testId)) return;
	if (!scoringRequireManualLease((int)$testId, $db, $returnData)) return;
	if (scoringItemType((int)$passwordId, (int)$testId, (int)$pageId, (string)$itemName, $db) !== 'manual') {
		$returnData['error'] = $uiLang->translate("This item is not manually scorable.");
		return;
	}

	$comment = [
		'commentString' => $comment,
		'commentTime' => date('Y-m-d H:i:s'),
		'commentBy' => $backendState->username,
		'commentById' => $backendState->userid,
		'version' => bin2hex(random_bytes(16))
		// 'uid' => bin2hex(random_bytes(8))
	];

	$pagePath = scoringJsonPathSegment($pageId);
	$itemPath = scoringJsonPathSegment($itemName);
	$writeLock = scoringAcquireWriteLock((int)$passwordId, (int)$testId, $db);
	if ($writeLock === null) {
		$returnData['error'] = $uiLang->translate("Another user is currently updating this scoring record. Please try again.");
		return;
	}
	$db->startTransaction();
	$current = scoringLockGivenData((int)$passwordId, (int)$testId, $db);
	$currentComment = $current[$pageId][$itemName]['comment'] ?? [];
	if ($current === null || ($hasConflictToken && !scoringEntryMatches($expectedComment, $currentComment))) {
		$db->rollback();
		scoringReleaseWriteLock($writeLock, $db);
		$returnData['reloadScoringDetail'] = true;
		$returnData['error'] = $uiLang->translate("This comment was changed by another user. The scoring page will now be reloaded.");
		return;
	}

	$db->prepare("UPDATE `scoring` SET `givenScoringData` = JSON_SET(
		COALESCE(NULLIF(`givenScoringData`, ''), '{}'),
		CONCAT('$.', ?, '.', ?, '.comment'), JSON_OBJECT(
			'commentString', ?, 'commentTime', ?, 'commentBy', ?,
			'commentById', CAST(? AS SIGNED), 'version', ?
		)
	) WHERE `passwordId` = ? AND `testId` = ?");
	$updated = $db->executePrepared([
		$pagePath, $itemPath, $comment['commentString'], $comment['commentTime'],
		$comment['commentBy'], $comment['commentById'], $comment['version'],
		$passwordId, $testId
	]);
	if (!scoringUpdateSucceeded($updated)) {
		$db->rollback();
		scoringReleaseWriteLock($writeLock, $db);
		$returnData['error'] = $uiLang->translate("Server was unable to record the comment.");
		return;
	}
	$db->commit();
	scoringReleaseWriteLock($writeLock, $db);

	$returnData['commentData'] = $comment;
}

function scoringRemComment($data, rixPDO &$db, &$returnData): void
{
	global $uiLang;
	checkParams($data, ['itemName', 'pageId', 'testId', 'passwordId']);
	extract($data);
	$expectedComment = [];
	if (array_key_exists('expectedCommentVersion', $data)) $expectedComment['version'] = $data['expectedCommentVersion'];
	$hasConflictToken = count($expectedComment) > 0;
	if (!resultsCanWritePassword((int)$passwordId, $db, $returnData, $uiLang, (int)$testId)) return;
	if (!scoringRequireManualLease((int)$testId, $db, $returnData)) return;
	if (scoringItemType((int)$passwordId, (int)$testId, (int)$pageId, (string)$itemName, $db) !== 'manual') {
		$returnData['error'] = $uiLang->translate("This item is not manually scorable.");
		return;
	}

	$pagePath = scoringJsonPathSegment($pageId);
	$itemPath = scoringJsonPathSegment($itemName);
	$writeLock = scoringAcquireWriteLock((int)$passwordId, (int)$testId, $db);
	if ($writeLock === null) {
		$returnData['error'] = $uiLang->translate("Another user is currently updating this scoring record. Please try again.");
		return;
	}
	$db->startTransaction();
	$current = scoringLockGivenData((int)$passwordId, (int)$testId, $db);
	$currentComment = $current[$pageId][$itemName]['comment'] ?? [];
	if ($current === null || ($hasConflictToken && !scoringEntryMatches($expectedComment, $currentComment))) {
		$db->rollback();
		scoringReleaseWriteLock($writeLock, $db);
		$returnData['reloadScoringDetail'] = true;
		$returnData['error'] = $uiLang->translate("This comment was changed by another user. The scoring page will now be reloaded.");
		return;
	}

	$db->prepare("UPDATE `scoring` SET `givenScoringData` = JSON_REMOVE(
		COALESCE(NULLIF(`givenScoringData`, ''), '{}'), CONCAT('$.', ?, '.', ?, '.comment')
	) WHERE `passwordId` = ? AND `testId` = ?");
	$updated = $db->executePrepared([$pagePath, $itemPath, $passwordId, $testId]);
	if (!scoringUpdateSucceeded($updated)) {
		$db->rollback();
		scoringReleaseWriteLock($writeLock, $db);
		$returnData['error'] = $uiLang->translate("Server was unable to remove the comment.");
		return;
	}
	$db->commit();
	scoringReleaseWriteLock($writeLock, $db);
}

function setScore($data, rixPDO &$db, &$returnData): void
{
	global $uiLang, $backendState;
	checkParams($data, ['testId', 'passwordId', 'pageId', 'itemName', 'score']);
	extract($data);
	$expectedScore = [];
	if (array_key_exists('expectedScoreVersion', $data)) $expectedScore['version'] = $data['expectedScoreVersion'];
	$hasConflictToken = count($expectedScore) > 0;
	if (!is_numeric($score) || !is_finite((float)$score) || (float)$score < 0 || (float)$score > 50 || abs(((float)$score * 2) - round((float)$score * 2)) > 0.000001) {
		$returnData['error'] = $uiLang->translate("The score must be a number between 0 and 50 in steps of 0.5.");
		return;
	}
	$score = (float)$score;

	// pre-set directive to go to parent of test location in case a error occurs requiring a location reload
	$hasPassWrite = permPassWrite($passwordId, "passwordId", $db, (int)$testId);
// $hasItemRead = permPass($pageId, "itemId", $db);

// if ($hasPassRead !== true || $hasItemRead !== true) {
if ($hasPassWrite !== true) {

		$returnData['reloadFolder'] = true;
		$returnData['error'] = $uiLang->translate("You do not have permission to perform the requested function on this or these object(s)");
		exit;
	}
	if (!scoringRequireManualLease((int)$testId, $db, $returnData)) return;

	// hard check that correction is not on an open test
	$testTL = $db->fetchValue("SELECT `timeLeft` FROM `activity` WHERE `testId` = ? AND `passwordId` = ?", [$testId, $passwordId])['data'];
	if ((int)$testTL !== 0) {
		$returnData['error'] = $uiLang->translate("Cannot score an open test!");
		return;
	}

	// Verify the page/item against this exact test taker's generated scoring structure.
	if (scoringItemType((int)$passwordId, (int)$testId, (int)$pageId, (string)$itemName, $db) !== 'manual') {
		$returnData['error'] = $uiLang->translate("This item is not scorable!");
		return;
	}

	$scoreEntry = [
		'scoreValue' => $score,
		'scoreTime' => date('Y-m-d H:i:s'),
		'scoreBy' => $backendState->username,
		'scoreById' => $backendState->userid,
		'version' => bin2hex(random_bytes(16)),
	];

	$writeLock = scoringAcquireWriteLock((int)$passwordId, (int)$testId, $db);
	if ($writeLock === null) {
		$returnData['error'] = $uiLang->translate("Another user is currently updating this scoring record. Please try again.");
		return;
	}
	$db->startTransaction();
	$current = scoringLockGivenData((int)$passwordId, (int)$testId, $db);
	if ($current === null) {
		$returnData['error'] = $uiLang->translate("Server was unable to record score! The test page will now be reloaded. You may try scoring again.");
		$db->rollback();
		scoringReleaseWriteLock($writeLock, $db);
		return;
	}
	if ($hasConflictToken && !scoringEntryMatches($expectedScore, $current[$pageId][$itemName]['score'] ?? [])) {
		$returnData['error'] = $uiLang->translate("This score was changed by another user. The scoring page will now be reloaded.");
		$db->rollback();
		scoringReleaseWriteLock($writeLock, $db);
		return;
	}

	$pagePath = scoringJsonPathSegment($pageId);
	$itemPath = scoringJsonPathSegment($itemName);
	$db->prepare("UPDATE `scoring` SET `givenScoringData` = JSON_SET(
		COALESCE(NULLIF(`givenScoringData`, ''), '{}'),
		CONCAT('$.', ?, '.', ?, '.score'), JSON_OBJECT(
			'scoreValue', CAST(? AS DECIMAL(10,2)), 'scoreTime', ?, 'scoreBy', ?,
			'scoreById', CAST(? AS SIGNED), 'version', ?
		)
	) WHERE `passwordId` = ? AND `testId` = ?");
	$ret = $db->executePrepared([
		$pagePath, $itemPath, $scoreEntry['scoreValue'], $scoreEntry['scoreTime'],
		$scoreEntry['scoreBy'], $scoreEntry['scoreById'], $scoreEntry['version'],
		$passwordId, $testId
	]);

	if (!scoringUpdateSucceeded($ret)) {
		$returnData['error'] = $uiLang->translate("Server was unable to record score! The test page will now be reloaded. You may try scoring again.");
		$db->rollback();
		scoringReleaseWriteLock($writeLock, $db);
		return;
	}

		/* need to send back the original 'touched' value of item being scored so we can keep an accurate count on the UI */

		$jsonEncItemName = json_encode($itemName);
		$returnData['touched'] = intVal($db->fetchValue("SELECT JSON_VALUE(`scoringData`, CONCAT('$.scoringAnswerList.', ?, '.', ?, '.', 'touched')) FROM `scoring` WHERE `testId` = ? AND `passwordId` = ?", [$pageId, $jsonEncItemName, $testId, $passwordId])['data']);

		/* if score recorded, get relevant update values and send back to UI, and mark the entry as touched */

		// mark the scored entry as 'touched' in the main scoringData table
		$touchUpdate = $db->fetchValue(
			"UPDATE `scoring`
            SET `scoringData` = (SELECT JSON_SET(`scoringData`, CONCAT('$.scoringAnswerList.', ?, '.', ?, '.', 'touched'), 1) FROM (SELECT * FROM `scoring`) as `s2` WHERE `testId` = ? AND `passwordId` = ?)
        WHERE `testId` = ? AND `passwordId` = ?",
			[$pageId, $jsonEncItemName, $testId, $passwordId, $testId, $passwordId]
		);

		if (!scoringUpdateSucceeded($touchUpdate)) {
			$returnData['error'] = $uiLang->translate("Server was unable to record score! The test page will now be reloaded. You may try scoring again.");
			$db->rollback();
			scoringReleaseWriteLock($writeLock, $db);
			return;
		};

		$newScoreMaster = json_decode($db->fetchValue("SELECT JSON_EXTRACT(`givenScoringData`, CONCAT('$.', ?)) FROM `scoring` WHERE `passwordId` = ? AND `testId` = ?", [$pageId, $passwordId, $testId])['data'], true);
		$itemNewScoreDetail = $newScoreMaster[$itemName]['score'];

		// validate that new score was recorded (or at the very least, matches) into the DB, else return failure message
		if ((float)($itemNewScoreDetail['scoreValue'] ?? -1) !== $score) {
			$returnData['error'] = $uiLang->translate("Server was unable to record score! The test page will now be reloaded. You may try scoring again.");
			$db->rollback();
			scoringReleaseWriteLock($writeLock, $db);
			return;
		}

		$db->commit();

		// execute scoring and get final score and score sums values

		try {
			$testScoring = new OasysScoring($testId, $db);
		} catch (Exception $e) {
			$returnData['error'] = $e->getMessage();
			scoringReleaseWriteLock($writeLock, $db);
			die();
		}

		$returnData['assignmentStruct'] = $testScoring->buildAstruct($pageId);

		$testScoring->populateAnswers();
		$testScoring->getScoreData();
		$testScoring->manscoreProcess();

		//  final tallies to return to frontend

		// get the official aggregated score for the test page from teh OasysScoring object itself
		$sumScore = $testScoring->getAggregatedScore($passwordId)[$pageId]["achieved"];

		$fsRes = $db->fetchRow("SELECT `finalScore`, `loginName`, `points` FROM `scoring` WHERE `passwordId` = ? AND `testId` = ?", [$passwordId, $testId])['data'];

		$finalScore = $fsRes['finalScore'];
		$testTakerName = $fsRes['loginName'];
		$points = $fsRes['points'];

		$pageName = $db->fetchValue("SELECT `itemName` FROM `view_q_list` WHERE `id` = ?", [$pageId])['data'];

		$returnData['updatedScore'] = $itemNewScoreDetail;
		$returnData['updatedScore']['updatedSumScore'] = $sumScore;
		$returnData['updatedScore']['itemName'] = $itemName;
		$returnData['finalScore'] = $finalScore;
		$returnData['points'] = $points;
		$returnData['pageId'] = $pageId;
		$returnData['pageName'] = $pageName;
		$returnData['loginName'] = $testTakerName;
		$returnData['passwordId'] = $passwordId;

		$returnData['message'] = "Success!";
		scoringReleaseWriteLock($writeLock, $db);
}

function resetAllCorrections(array $data, rixPDO &$db, array &$returnData): void
{
	global $uiLang;
	$fullTestRest = $data['fullTestReq'] ?? false;
	if ($fullTestRest === true) {
		checkParams($data, ['testId', 'conf']);
		extract($data);
	} else {
		checkParams($data, ['testId', 'pId', 'conf']);
		extract($data);
	}

	if ($conf !== true) {
		$returnData['error'] = $uiLang->translate("Confirmation not clicked. Canceling request.");
		return;
	}

	$testId = intVal($testId);
	if ($fullTestRest !== true) $pId = intVal($pId) ?? null;
	$locks = [];
	if ($fullTestRest === true) {
		$access = resultsFetchTestTakerAccessSummary($testId, $db);
		if (($access['total'] ?? 0) === 0 || ($access['writable'] ?? 0) !== ($access['total'] ?? 0)) {
			$returnData['error'] = $uiLang->translate("You do not have write access to all test takers in this test.");
			return;
		}
		if ($db->fetchValue("SELECT COUNT(*) from `scoring` WHERE `testId` = ?", [$testId])['data'] <= 0) {
			$returnData['error'] = $uiLang->translate("Test ID was not found in scoring.") . "<br><br>TEST ID:&nbsp;" . $testId;
			return;
		}
		if (!scoringRequireManualLease($testId, $db, $returnData)) return;
		$locks = scoringAcquireTestWriteLocks($testId, $db);
	} else {
		if (!resultsCanWritePassword((int)$pId, $db, $returnData, $uiLang, (int)$testId)) return;
		if ($db->fetchValue("SELECT COUNT(*) from `scoring` WHERE `testId` = ? AND `passwordId` = ?", [$testId, $pId])['data'] <= 0) {
			$returnData['error'] = $uiLang->translate("Test ID was not found for the password ID in scoring.") . "<br><br>TEST ID:&nbsp;" . $testId . "<br>PASSWORD ID:&nbsp;{$pId}";
			return;
		}
		if (!scoringRequireManualLease($testId, $db, $returnData)) return;
		$lock = scoringAcquireWriteLock((int)$pId, $testId, $db);
		$locks = $lock === null ? null : [$lock];
	}

	if ($locks === null) {
		$returnData['error'] = $uiLang->translate("Another user is currently updating this scoring record. Please try again.");
		return;
	}
	$resetBackup = $db->fetchTable(
		$fullTestRest === true
			? "SELECT `id`, `givenScoringData`, `scoringData` FROM `scoring` WHERE `testId` = ?"
			: "SELECT `id`, `givenScoringData`, `scoringData` FROM `scoring` WHERE `testId` = ? AND `passwordId` = ?",
		$fullTestRest === true ? [$testId] : [$testId, $pId]
	)['data'] ?? [];

	$db->prepare($fullTestRest === true
		? "UPDATE `scoring` SET `givenScoringData` = NULL, `scoringData` = NULL WHERE `testId` = ?"
		: "UPDATE `scoring` SET `givenScoringData` = NULL, `scoringData` = NULL WHERE `testId` = ? AND `passwordId` = ?");
	$resetResult = $db->executePrepared($fullTestRest === true ? [$testId] : [$testId, $pId]);
	if (!scoringUpdateSucceeded($resetResult)) {
		scoringReleaseWriteLocks($locks, $db);
		$returnData['error'] = $uiLang->translate("Server was unable to reset the scoring data.");
		return;
	}

	// update scoring table and columns after correction reset action
	try {
		$testScoring = new OasysScoring($testId, $db);
		$testScoring->populateAnswers();
		$testScoring->getScoreData();
		$testScoring->manscoreProcess();
	} catch (Throwable $e) {
		foreach ($resetBackup as $backupRow) {
			$db->prepare("UPDATE `scoring` SET `givenScoringData` = ?, `scoringData` = ? WHERE `id` = ?");
			$db->executePrepared([$backupRow['givenScoringData'], $backupRow['scoringData'], $backupRow['id']]);
		}
		scoringReleaseWriteLocks($locks, $db);
		$returnData['error'] = $uiLang->translate("The scoring reset failed and the previous scoring data was restored.") . "<br>" . $e->getMessage();
		return;
	}
	scoringReleaseWriteLocks($locks, $db);

	if ($fullTestRest !== true) {
		// get number of mancorr items left to send back to caller to update label(s)
		$msLeft = 0;
		$sd = $db->fetchValue("SELECT `scoringData` FROM `scoring` WHERE `passwordId` = ? AND `testId` = ?", [$pId, $testId])['data'];

		// get remaining manual scoring items left per passwordId
		$sd = json_decode($sd ?? '', true)['scoringAnswerList'] ?? [];

		foreach ($sd as $page => $pageValues) {
			foreach ($pageValues as $pageName => $itemValues) {
				if ($pageName === "pageName") continue;

				if (($itemValues['itemScoreType'] ?? '') === "manual" && (int)($itemValues['touched'] ?? 0) === 0) $msLeft++;
			}
		}
		$returnData['msLeft'] = $msLeft;
	}
}

function closeOutTest($data, rixPDO &$db, &$returnData): void
{
	global $uiLang;
	checkParams($data, ['testId', 'passwordId']);
	extract($data);
	if (!resultsCanWritePassword((int)$passwordId, $db, $returnData, $uiLang, (int)$testId)) return;
	if (!scoringRequireManualLease((int)$testId, $db, $returnData)) return;

	$instructions = [['command' => 'timeUp', 'reason' => 'scoringStarted']];
	$instructions = json_encode($instructions);

	$db->update("activity", ["timeLeft" => 0, "instructions" => $instructions], "`testId` = ? AND `passwordId` = ?", [$testId, $passwordId]);
	getTL($data, $db, $returnData);
}

function hasMSleft(array $data, rixPDO &$db, array &$returnData): void
{
	global $uiLang;
	checkParams($data, ['testId']);
	extract($data);
	if (!resultsCanReadTest((int)$testId, $db)) {
		$returnData['error'] = $uiLang->translate("Unable to load data.");
		return;
	}

	$summary = resultsFetchManualScoringSummary((int)$testId, $db);
	$returnData['hasMSleft'] = ($summary['accessibleItemsNeedScoring'] ?? 0) > 0;
}

function resultsFetchManualScoringSummary(int $testId, rixPDO &$db): array
{
	$rows = $db->fetchTable(
		"SELECT passwordId, scoringData FROM scoring WHERE testId = ?",
		[$testId]
	)['data'] ?? [];

	$summary = [
		'accessibleTakers' => 0,
		'writableTakers' => 0,
		'accessibleTakersNeedScoring' => 0,
		'writableTakersNeedScoring' => 0,
		'accessibleItemsTotal' => 0,
		'writableItemsTotal' => 0,
		'accessibleItemsNeedScoring' => 0,
		'writableItemsNeedScoring' => 0
	];

	$accessMap = resultsFetchTestTakerAccessMap($testId, $db);
	foreach ($rows as $row) {
		$passwordId = (int)($row['passwordId'] ?? 0);
		$access = $accessMap[$passwordId] ?? ['read' => false, 'write' => false];
		if ($passwordId <= 0 || !$access['read']) continue;

		$summary['accessibleTakers']++;
		$canWrite = $access['write'];
		if ($canWrite) $summary['writableTakers']++;

		$manualItems = resultsCountManualScoringItems($row['scoringData'] ?? null);
		$itemsTotal = $manualItems['total'];
		$itemsLeft = $manualItems['left'];

		$summary['accessibleItemsTotal'] += $itemsTotal;
		if ($canWrite) $summary['writableItemsTotal'] += $itemsTotal;
		if ($itemsLeft <= 0) continue;

		$summary['accessibleTakersNeedScoring']++;
		$summary['accessibleItemsNeedScoring'] += $itemsLeft;
		if ($canWrite) {
			$summary['writableTakersNeedScoring']++;
			$summary['writableItemsNeedScoring'] += $itemsLeft;
		}
	}

	return $summary;
}

function resultsRestrictQuestionSummary(array $pages, int $testId, rixPDO &$db): array
{
	$accessMap = resultsFetchTestTakerAccessMap($testId, $db);
	$readablePasswordIds = [];
	foreach ($accessMap as $passwordId => $access) {
		if ($access['read']) $readablePasswordIds[] = (int)$passwordId;
	}

	$leftByPage = [];
	foreach (array_chunk($readablePasswordIds, 500) as $passwordChunk) {
		if ($passwordChunk === []) continue;
		$placeholders = implode(',', array_fill(0, count($passwordChunk), '?'));
		$params = array_merge([$testId], $passwordChunk);
		$rows = $db->fetchTable(
			"SELECT scoringData FROM scoring
			WHERE testId = ? AND passwordId IN ($placeholders)",
			$params
		)['data'] ?? [];
		foreach ($rows as $row) {
			$decoded = json_decode($row['scoringData'] ?? '', true);
			$answerList = is_array($decoded) ? ($decoded['scoringAnswerList'] ?? []) : [];
			if (!is_array($answerList)) continue;
			foreach ($answerList as $pageId => $pageValues) {
				if (!is_array($pageValues)) continue;
				foreach ($pageValues as $fieldName => $fieldValues) {
					if ($fieldName === 'pageName' || !is_array($fieldValues)) continue;
					if (($fieldValues['itemScoreType'] ?? '') === 'manual'
						&& (int)($fieldValues['touched'] ?? 0) === 0) {
						$leftByPage[(int)$pageId] = ($leftByPage[(int)$pageId] ?? 0) + 1;
					}
				}
			}
		}
	}

	foreach ($pages as &$page) {
		$page['msLeftPage'] = $leftByPage[(int)($page['id'] ?? 0)] ?? 0;
	}
	unset($page);
	return $pages;
}

function resultsCountManualScoringItems($scoringData): array
{
	$decoded = json_decode($scoringData ?? '', true);
	$answerList = $decoded['scoringAnswerList'] ?? [];
	if (!is_array($answerList)) return ['total' => 0, 'left' => 0];

	$total = 0;
	$left = 0;
	foreach ($answerList as $pageValues) {
		if (!is_array($pageValues)) continue;
		foreach ($pageValues as $fieldName => $itemValues) {
			if ($fieldName === 'pageName' || !is_array($itemValues)) continue;
			if (($itemValues['itemScoreType'] ?? '') !== 'manual') continue;
			$total++;
			if ((int)($itemValues['touched'] ?? 0) === 0) $left++;
		}
	}
	return ['total' => $total, 'left' => $left];
}

# ------------------------ #
# SCORING HELPER FUNCTIONS #
# ------------------------ #

function resultsOwnsTestFolder(int $folderId, rixPDO &$db): bool
{
	global $myAuth;
	if ($folderId <= 0) return false;
	$row = $db->fetchRow("SELECT `owner` FROM `testFolders` WHERE `id` = ? LIMIT 1", [$folderId]);
	if (!empty($row['error']) || ($row['rows'] ?? 0) === 0) return false;
	return (int)($row['data']['owner'] ?? 0) === (int)$myAuth->userid;
}

function resultsCanReadTest(int $testId, rixPDO &$db): bool
{
	global $myAuth, $permAuth;
	if ($testId <= 0) return false;
	if ($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin()) return true;

	$parent = (int)($db->fetchValue("SELECT `parent` FROM `tests` WHERE `id` = ?", [$testId])['data'] ?? 0);
	if ($parent <= 0) return false;
	if (resultsOwnsTestFolder($parent, $db)) return true;

	$oldSrcRef = $permAuth->srcRef;
	$permAuth->srcRef = 'tests';
	try {
		if ($permAuth->getAccessVal("tests", "fetchLibrary", "itemObject", $parent)) return true;
	} finally {
		$permAuth->srcRef = $oldSrcRef;
	}

	// Results may be viewed in the context of a test taker the current user can
	// access, even when the test itself is stored in an inaccessible test folder.
	$access = tmGetTestResultAccessInfo($testId, $db);
	return (int)($access['accessibleLoginCount'] ?? 0) > 0
		|| count($access['accessiblePasswordIds'] ?? []) > 0;
}

function resultsOwnsLoginFolder(int $folderId, rixPDO &$db): bool
{
	global $myAuth;
	if ($folderId <= 0) return false;
	$row = $db->fetchRow("SELECT `owner` FROM `loginsFolders` WHERE `id` = ? LIMIT 1", [$folderId]);
	if (!empty($row['error']) || ($row['rows'] ?? 0) === 0) return false;
	return (int)($row['data']['owner'] ?? 0) === (int)$myAuth->userid;
}

function resultsFetchLoginAccessParentByLoginId(int $loginId, rixPDO &$db): int
{
	if ($loginId <= 0) return 0;
	$parent = $db->fetchValue(
		"SELECT
			COALESCE(templateLogin.parent, logins.parent) AS parent
		 FROM logins
		 LEFT JOIN logins templateLogin ON templateLogin.id = logins.parentTemplateId
		 WHERE logins.id = ?",
		[$loginId]
	)['data'];

	return (int)($parent ?? 0);
}

function resultsFetchResultLoginIdByPasswordId(int $passwordId, rixPDO &$db, ?int $testId = null): int
{
	if ($passwordId <= 0) return 0;
	if ($testId !== null && $testId > 0) {
		$loginId = (int)($db->fetchValue(
			"SELECT COALESCE(activity.loginId, scoring.loginId, passwords.loginID) AS loginId
			FROM passwords
			LEFT JOIN activity ON activity.passwordId = passwords.id AND activity.testId = ?
			LEFT JOIN scoring ON scoring.passwordId = passwords.id AND scoring.testId = ?
			WHERE passwords.id = ?
			LIMIT 1",
			[$testId, $testId, $passwordId]
		)['data'] ?? 0);
		if ($loginId > 0) return $loginId;
	}
	return (int)($db->fetchValue("SELECT `loginID` FROM `passwords` WHERE `id` = ?", [$passwordId])['data'] ?? 0);
}

function resultsFetchLoginAccessParentByPasswordId(int $passwordId, rixPDO &$db, ?int $testId = null): int
{
	if ($passwordId <= 0) return 0;
	$loginId = resultsFetchResultLoginIdByPasswordId($passwordId, $db, $testId);
	return resultsFetchLoginAccessParentByLoginId($loginId, $db);
}

function resultsCanReadPassword(int $passwordId, rixPDO &$db, ?int $testId = null): bool
{
	if ($passwordId <= 0) return false;
	$parent = resultsFetchLoginAccessParentByPasswordId($passwordId, $db, $testId);
	return resultsCanReadTestTakerFolder((int)$parent, $db);
}

function resultsCanReadTestTakerFolder(int $folderId, rixPDO &$db): bool
{
	return resultsHasLoginFolderCategoryAccess($folderId, $db, 'read');
}

function resultsCanWriteTestTakerFolder(int $folderId, rixPDO &$db): bool
{
	return resultsHasLoginFolderCategoryAccess($folderId, $db, 'write');
}

function resultsHasLoginFolderCategoryAccess(int $folderId, rixPDO &$db, string $need = 'read'): bool
{
	global $myAuth;
	if ($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin()) return true;
	if ($folderId <= 0) return false;
	if (resultsOwnsLoginFolder($folderId, $db)) return true;

	$ugList = $myAuth->usergroup ?? [];
	if (!is_array($ugList) || count($ugList) === 0) return false;

	$ph = implode(',', array_fill(0, count($ugList), '?'));
	$permClause = ($need === 'write')
		? "(
			JSON_EXTRACT(lfa.accessDef, '$.c_items.Write') IN ('true', true)
			OR JSON_EXTRACT(lfa.accessDef, '$.items.deleteItem') IN ('true', true)
			OR JSON_EXTRACT(lfa.accessDef, '$.items.editPassword') IN ('true', true)
			OR JSON_EXTRACT(lfa.accessDef, '$.items.newPassword') IN ('true', true)
			OR JSON_EXTRACT(lfa.accessDef, '$.items.saveOverrides') IN ('true', true)
			OR JSON_EXTRACT(lfa.accessDef, '$.items.bulkEdit') IN ('true', true)
		)"
		: "(
			JSON_EXTRACT(lfa.accessDef, '$.c_items.Read') IN ('true', true)
			OR JSON_EXTRACT(lfa.accessDef, '$.c_items.Write') IN ('true', true)
			OR JSON_EXTRACT(lfa.accessDef, '$.items.fetchLibrary') IN ('true', true)
			OR JSON_EXTRACT(lfa.accessDef, '$.items.fetchItem') IN ('true', true)
			OR JSON_EXTRACT(lfa.accessDef, '$.items.search') IN ('true', true)
			OR JSON_EXTRACT(lfa.accessDef, '$.items.deleteItem') IN ('true', true)
			OR JSON_EXTRACT(lfa.accessDef, '$.items.editPassword') IN ('true', true)
		)";

	$params = [$folderId];
	foreach ($ugList as $ug) $params[] = $ug;

	$res = $db->fetchValue(
		"SELECT EXISTS(
			SELECT 1
			FROM loginsFolderAccess lfa
			WHERE lfa.folderId = ?
			AND lfa.userGroupId IN ($ph)
			AND $permClause
		)",
		$params
	);

	return ($res['data'] === 1 || $res['data'] === true || $res['data'] === "1");
}

function resultsFetchTestTakerAccessMap(int $testId, rixPDO &$db): array
{
	global $myAuth;
	$rows = $db->fetchTable(
		"SELECT DISTINCT
			resultLogins.passwordId,
			resultLogins.loginId,
			COALESCE(templateLogin.parent, logins.parent) AS loginParent
		 FROM (
			SELECT
				resultIds.passwordId,
				COALESCE(resultIds.activityLoginId, resultIds.scoringLoginId, passwords.loginID) AS loginId
			FROM (
				SELECT
					recorded.passwordId,
					MAX(recorded.activityLoginId) AS activityLoginId,
					MAX(recorded.scoringLoginId) AS scoringLoginId
				FROM (
					SELECT activity.passwordId, activity.loginId AS activityLoginId, NULL AS scoringLoginId
					FROM activity
					WHERE activity.testId = ?
					UNION ALL
					SELECT scoring.passwordId, NULL AS activityLoginId, scoring.loginId AS scoringLoginId
					FROM scoring
					WHERE scoring.testId = ?
				) recorded
				GROUP BY recorded.passwordId
			) resultIds
			JOIN passwords ON passwords.id = resultIds.passwordId
		 ) resultLogins
		 LEFT JOIN logins ON logins.id = resultLogins.loginId
		 LEFT JOIN logins templateLogin ON templateLogin.id = logins.parentTemplateId",
		[$testId, $testId]
	)['data'] ?? [];

	$isAdmin = $myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin();
	$accessMap = [];
	$readAccess = [];
	$writeAccess = [];
	foreach ($rows as $row) {
		$parent = (int)($row['loginParent'] ?? 0);
		if ($isAdmin) {
			$read = true;
			$write = true;
		} elseif (!array_key_exists($parent, $readAccess)) {
			$readAccess[$parent] = resultsCanReadTestTakerFolder($parent, $db);
			$writeAccess[$parent] = resultsCanWriteTestTakerFolder($parent, $db);
			$read = $readAccess[$parent];
			$write = $writeAccess[$parent];
		} else {
			$read = $readAccess[$parent];
			$write = $writeAccess[$parent];
		}
		$accessMap[(int)$row['passwordId']] = ['read' => $read, 'write' => $write];
	}
	return $accessMap;
}

function resultsFetchTestTakerAccessSummary(int $testId, rixPDO &$db): array
{
	$accessMap = resultsFetchTestTakerAccessMap($testId, $db);
	$summary = ['total' => count($accessMap), 'readable' => 0, 'writable' => 0];
	foreach ($accessMap as $access) {
		if ($access['read']) $summary['readable']++;
		if ($access['write']) $summary['writable']++;
	}
	return $summary;
}

function resultsCanWritePassword(int $passwordId, rixPDO &$db, array &$returnData, $uiLang, ?int $testId = null): bool
{
	if (permPassWrite($passwordId, "passwordId", $db, $testId) === true) return true;
	$returnData['reloadFolder'] = true;
	$returnData['error'] = $uiLang->translate("You do not have write access to this test taker.");
	return false;
}

function permPass(int $objId, string $permCat, rixPDO &$db, ?int $testId = null): bool
{
	global $myAuth, $permAuth;

	# check if category value is empty or not -- other checks automatic from function param type signatures #
	if (empty($permCat)) {
		throw new Exception("Invalid permission check data", 255);
	}

	# admin/superadmin bypass #
	if ($myAuth->checkSA() || $myAuth->checkAdmin()) return true;

	# parent id value derivation #
	$permTableClause = false;
	switch ($permCat) {
		case 'passwordId':
		case 'loginId':
			$permTableClause = "testTakers";

			// first order when passwordId directly submitted instead of loginId; we overwrite the orig objId with the derived loginId
			if ($permCat === "passwordId") {
				$parent = resultsFetchLoginAccessParentByPasswordId($objId, $db, $testId);
			} else {
				$parent = resultsFetchLoginAccessParentByLoginId($objId, $db);
			}

			return resultsCanReadTestTakerFolder((int)$parent, $db);

		case 'itemId':
			$permTableClause = "items";

			// first order - derive group ID value of item
			$groupItemId = $db->fetchValue("SELECT `groupId` FROM `items` WHERE `id` = ?", [$objId])['data'];
			if (empty($groupItemId) || is_null($groupItemId)) return false;

			// second order - obtain parent id for linked item via itemgroup value
			$parent = $db->fetchValue("SELECT `parent` FROM `itemGroups` WHERE `id` = ?", [$groupItemId])['data'];

			break;
	}

	if ($permTableClause === false) {
		throw new Exception("Invalid permission check data", 254);
	}

	if (empty($parent) || $parent === 1) {
		return false; // no access for home folder or missing parent
	}


	# granular permission check on parent id value #
	$hasAtLeastReadAccess = $permAuth->permCheck(['remCall' => true, 'fid' => intval($parent), 'action' => 'fetchItem'], $permTableClause);
	return $hasAtLeastReadAccess;
}

function permPassWrite(int $objId, string $permCat, rixPDO &$db, ?int $testId = null): bool
{
	global $myAuth;

	if (empty($permCat)) {
		throw new Exception("Invalid permission check data", 255);
	}

	if ($myAuth->checkSA() || $myAuth->checkAdmin()) return true;

	switch ($permCat) {
		case 'passwordId':
			$parent = resultsFetchLoginAccessParentByPasswordId($objId, $db, $testId);
			return resultsCanWriteTestTakerFolder($parent, $db);

		case 'loginId':
			$parent = resultsFetchLoginAccessParentByLoginId($objId, $db);
			return resultsCanWriteTestTakerFolder($parent, $db);

		default:
			throw new Exception("Invalid permission check data", 254);
	}
}

# --------------------------- #
# CHART AND REPORTING ACTIONS #
# --------------------------- #

function chartStorePrecheck(array $data, rixPDO &$db, array &$returnData): void
{
	global $myAuth, $uiLang;
	checkParams($data, ['title', 'testId']);
	$title = trim((string)$data['title']);
	$testId = (int)$data['testId'];
	if (!resultsCanReadTest($testId, $db)) {
		$returnData['error'] = $uiLang->translate("Unable to load data.");
		return;
	}
	if ($title === '') {
		$returnData['error'] = $uiLang->translate("A report name is required.");
		return;
	}

	# duplicate title check #

	$tcheck = $db->fetchRow("SELECT `title`, `ownerId` FROM `charts` WHERE `title` = ? AND `testId` = ?", [$title, $testId])['data'];

	if (!empty($tcheck)) {
		if ((int)$myAuth->userid === (int)$tcheck['ownerId']) {
			$returnData['checkRes'] = 1;
		} else {
			$returnData['error'] = $uiLang->translate("This name is already in use by another user! Please select another name.");
		}
	} else {
		$returnData['checkRes'] = 0;
	}
}

function chartStore(array $data, rixPDO &$db, array &$returnData): void
{
	checkParams($data, ['chartData', 'layoutData', 'owrite', 'title', 'testId', 'vis']);

	global $myAuth, $uiLang;
	$chartData = reportNormalizeChartConfiguration($data['chartData']);
	$layoutData = $data['layoutData'];
	$owrite = $data['owrite'] === true;
	$title = trim((string)$data['title']);
	$testId = (int)$data['testId'];
	$vis = $data['vis'];
	$reportId = isset($data['reportId']) ? (int)$data['reportId'] : 0;
	if (!resultsCanReadTest($testId, $db)) {
		$returnData['error'] = $uiLang->translate("Unable to load data.");
		return;
	}
	if ($title === '' || $chartData === false || !is_array($layoutData)) {
		$returnData['error'] = $uiLang->translate("The report configuration is invalid.");
		return;
	}
	// Presentation settings are stored inside the normalized configuration.
	// Never persist full Plotly layouts because they contain data-derived
	// annotations and statistics.
	$layoutData = [];

	# title length check #
	$titleLength = function_exists('mb_strlen') ? mb_strlen($title, 'UTF-8') : strlen($title);
	if ($titleLength > 30) {
		$returnData['error'] = $uiLang->translate("Name of entry must be 30 characters or fewer!");
		return;
	}

	$vis = intval($vis) === 1 ? 1 : 0;

	$tcheck = $db->fetchRow("SELECT `id`, `title`, `ownerId` FROM `charts` WHERE `title` = ? AND `testId` = ?", [$title, $testId])['data'];

	// A regular Save always targets the loaded report by its immutable ID.
	// The ownership condition prevents a shared report from being overwritten
	// by somebody who merely has permission to view it.
	if ($reportId > 0) {
		$current = $db->fetchRow("SELECT `id`, `title`, `ownerId` FROM `charts` WHERE `id` = ? AND `testId` = ?", [$reportId, $testId])['data'];
		if (empty($current) || (int)$current['ownerId'] !== (int)$myAuth->userid) {
			$returnData['error'] = $uiLang->translate("You may not overwrite another user's report.");
			return;
		}
		if ((string)$current['title'] !== $title) {
			$returnData['error'] = $uiLang->translate("Use Save As to save the report with a different name.");
			return;
		}
	}

	# check for override of overwrite by non-owner #
	if (!empty($tcheck) && $reportId === 0) {
		if (!((int)$myAuth->userid === (int)$tcheck['ownerId'] && $owrite === true)) {
			$returnData['error'] = $uiLang->translate("Name is already in use! You may not overwrite another user's entry.");
			return;
		}
	}

	$chartData = serialize($chartData);
	$layoutData = json_encode($layoutData, JSON_PRETTY_PRINT | JSON_INVALID_UTF8_SUBSTITUTE);
	if ($layoutData === false || strlen($chartData) > 16 * 1024 * 1024 || strlen($layoutData) > 16 * 1024 * 1024) {
		$returnData['error'] = $uiLang->translate("The report configuration is too large or invalid.");
		return;
	}

	if ($reportId > 0) {
		$result = $db->update("charts", ['visibility' => $vis, 'data' => $chartData, 'layoutData' => $layoutData], "`id` = ? AND `testId` = ? AND `ownerId` = ?", [$reportId, $testId, $myAuth->userid]);
	} elseif ($owrite) {
		$result = $db->update("charts", ['visibility' => $vis, 'data' => $chartData, 'layoutData' => $layoutData], "`testId` = ? AND `ownerId` = ? AND `title` = ?", [$testId, $myAuth->userid, $title]);
	} else {
		$result = $db->insert("charts", ['testId' => $testId, 'ownerId' => $myAuth->userid, 'title' => $title, 'visibility' => $vis, 'data' => $chartData, 'layoutData' => $layoutData]);
	}
	if (!empty($result['error'])) {
		$returnData['error'] = $uiLang->translate("The report configuration could not be saved.");
		return;
	}
	$returnData['saved'] = true;
	$returnData['report'] = $db->fetchRow(
		"SELECT `id`, `title`, `ownerId`, `visibility` FROM `charts` WHERE `testId` = ? AND `ownerId` = ? AND `title` = ?",
		[$testId, $myAuth->userid, $title]
	)['data'];
}

function getChartList(array $data, rixPDO &$db, array &$returnData): void
{
	checkParams($data, ['testId']);
	$testId = (int)$data['testId'];
	global $myAuth, $uiLang;
	if (!resultsCanReadTest($testId, $db)) {
		$returnData['error'] = $uiLang->translate("Unable to load data.");
		return;
	}

	// Saved reports are visible to their owner, or to others only when explicitly shared.
	$cList = $db->fetchTable(
		"SELECT c.`id`, c.`title`, c.`ownerId`, c.`visibility`, c.`data`, u.`name` AS `ownerName`,
		        (c.`ownerId` = ?) AS `isOwner`, (c.`ownerId` = ?) AS `canDelete`
		   FROM `charts` c
		   LEFT JOIN `users` u ON u.`id` = c.`ownerId`
		  WHERE c.`testId` = ? AND (c.`visibility` = 1 OR c.`ownerId` = ?)
		  ORDER BY c.`title`, u.`name`",
		[$myAuth->userid, $myAuth->userid, $testId, $myAuth->userid]
	)['data'] ?? [];
	foreach ($cList as &$chart) {
		$stored = @unserialize($chart['data'] ?? '', ['allowed_classes' => false]);
		$normalized = reportNormalizeChartConfiguration($stored);
		$chart['dateRange'] = is_array($normalized) ? $normalized['dateRange'] : ['start' => null, 'end' => null];
		unset($chart['data']);
		if ($myAuth->checkSA()) $chart['canDelete'] = 1;
	}
	$returnData['chartList'] = $cList;
}

function loadChart(array $data, rixPDO &$db, array &$returnData): void
{

	checkParams($data, ['id', 'testId']);
	$id = (int)$data['id'];
	$testId = (int)$data['testId'];
	global $uiLang;
	global $myAuth;

	if (!resultsCanReadTest($testId, $db)) {
		$returnData['error'] = $uiLang->translate("Unable to load data.");
		return;
	}
	$ret = $db->fetchRow("SELECT `data`, `layoutData`, `ownerId`, `visibility`, `testId` FROM `charts` WHERE `id` = ? AND `testId` = ?", [$id, $testId])['data'];
	if (empty($ret)) {
		$returnData['error'] = $uiLang->translate("The selected report configuration could not be found.");
		return;
	}

	if (intval($ret['visibility']) !== 1 && intval($ret['ownerId']) !== intval($myAuth->userid)) {
		$returnData['error'] = $uiLang->translate("You do not have access to this report configuration.");
		return;
	}

	$storedChart = @unserialize($ret['data'], ['allowed_classes' => false]);
	$loadChart = reportNormalizeChartConfiguration($storedChart);
	if ($loadChart === false) {
		$returnData['error'] = $uiLang->translate("The selected report configuration could not be read.");
		return;
	}

	$layoutData = json_decode($ret['layoutData'] ?? '[]', true);
	if (!is_array($layoutData)) {
		$layoutData = [];
	}
	if (empty($loadChart['presentation'])) {
		$loadChart['presentation'] = reportNormalizeChartPresentation($layoutData);
	}

	$returnData['data'] = $loadChart;
	// Full legacy Plotly layouts can contain statistics derived from the
	// report owner's result set. Only the whitelisted presentation values
	// above may be returned to another viewer.
	$returnData['layoutData'] = [];
	$returnData['report'] = [
		'id' => $id,
		'ownerId' => (int)$ret['ownerId'],
		'visibility' => (int)$ret['visibility'],
		'isOwner' => (int)$ret['ownerId'] === (int)$myAuth->userid
	];
}

function setChartVisibility(array $data, rixPDO &$db, array &$returnData): void
{
	checkParams($data, ['id', 'testId', 'vis']);
	global $myAuth, $uiLang;
	$id = (int)$data['id'];
	$testId = (int)$data['testId'];
	$visibility = (int)$data['vis'] === 1 ? 1 : 0;
	if (!resultsCanReadTest($testId, $db)) {
		$returnData['error'] = $uiLang->translate("Unable to load data.");
		return;
	}
	$report = $db->fetchRow("SELECT `ownerId` FROM `charts` WHERE `id` = ? AND `testId` = ?", [$id, $testId])['data'];
	if (empty($report) || (int)$report['ownerId'] !== (int)$myAuth->userid) {
		$returnData['error'] = $uiLang->translate("You may only change access to your own reports.");
		return;
	}
	$result = $db->update("charts", ['visibility' => $visibility], "`id` = ? AND `testId` = ? AND `ownerId` = ?", [$id, $testId, $myAuth->userid]);
	if (!empty($result['error'])) {
		$returnData['error'] = $uiLang->translate("The report access setting could not be saved.");
		return;
	}
	$returnData['saved'] = true;
}

/**
 * Convert legacy reports containing result snapshots, or current client data,
 * to the configuration-only format. No answer data may leave this function.
 */
function reportNormalizeChartConfiguration($chartData)
{
	if (!is_array($chartData)) return false;

	if (($chartData['formatVersion'] ?? null) === 2 && isset($chartData['plots']) && is_array($chartData['plots'])) {
		$plots = $chartData['plots'];
		$presentation = reportNormalizeChartPresentation($chartData['presentation'] ?? []);
		$dateRange = reportNormalizeDateRange($chartData['dateRange'] ?? []);
	} else {
		$plots = [];
		$presentation = [];
		$dateRange = ['start' => null, 'end' => null];
		foreach ($chartData as $plot) {
			if (!is_array($plot)) continue;
			$kind = (string)($plot[3] ?? '');
			$rptIdx = filter_var($plot[4] ?? null, FILTER_VALIDATE_INT);
			if ($rptIdx === false || $rptIdx < 0) continue;

			if (isset($plot[0]) && is_array($plot[0]) && array_key_exists('rawText', $plot[0])) {
				$fieldName = (string)($plot[1]['fieldName'] ?? ('CTXT_' . $rptIdx));
				$plots[] = [
					'kind' => str_starts_with($fieldName, 'PBR_') ? 'pageBreak' : (str_starts_with($fieldName, 'DTR_') ? 'dateRange' : 'text'),
					'rptIdx' => $rptIdx,
					'fieldName' => $fieldName,
					'title' => mb_substr((string)($plot[0]['ft_title'] ?? ''), 0, 500),
					'html' => reportSanitizeHtml((string)($plot[0]['rawText'] ?? '')),
					'config' => is_array($plot[5] ?? null) ? $plot[5] : []
				];
				continue;
			}

			if ($kind === 'single') {
				$fieldName = (string)($plot[1]['fieldName'] ?? '');
				if ($fieldName === '') continue;
				$plots[] = [
					'kind' => 'single',
					'rptIdx' => $rptIdx,
					'fieldName' => mb_substr($fieldName, 0, 255),
					'config' => is_array($plot[5] ?? null) ? $plot[5] : []
				];
				continue;
			}

			if ($kind === 'multi') {
				$fields = [];
				$legacyConfig = is_array($plot[5] ?? null) ? $plot[5] : [];
				foreach ($legacyConfig as $field) {
					if (is_string($field) && $field !== '') $fields[] = mb_substr($field, 0, 255);
				}
				if (count($fields) < 1 && isset($plot[0]) && is_array($plot[0])) {
					foreach (array_keys($plot[0]) as $field) {
						if ($field !== 'cfg' && is_string($field) && $field !== '') $fields[] = mb_substr($field, 0, 255);
					}
				}
				$fields = array_values(array_unique($fields));
				if (count($fields) < 1) continue;
				$plots[] = [
					'kind' => 'multi',
					'rptIdx' => $rptIdx,
					'fields' => array_slice($fields, 0, 1000),
					'config' => is_array($plot[6] ?? null) ? $plot[6] : []
				];
			}
		}
	}

	if (count($plots) > 500) return false;
	$normalized = [];
	foreach ($plots as $plot) {
		if (!is_array($plot)) continue;
		$kind = (string)($plot['kind'] ?? '');
		$rptIdx = filter_var($plot['rptIdx'] ?? null, FILTER_VALIDATE_INT);
		if ($rptIdx === false || $rptIdx < 0 || !in_array($kind, ['single', 'multi', 'text', 'pageBreak', 'dateRange'], true)) continue;

		$entry = ['kind' => $kind, 'rptIdx' => $rptIdx];
		if ($kind === 'single') {
			$fieldName = mb_substr((string)($plot['fieldName'] ?? ''), 0, 255);
			if ($fieldName === '') continue;
			$entry['fieldName'] = $fieldName;
			$entry['config'] = is_array($plot['config'] ?? null) ? $plot['config'] : [];
		} elseif ($kind === 'multi') {
			$fields = array_values(array_unique(array_filter(array_map(
				static fn($field) => mb_substr((string)$field, 0, 255),
				is_array($plot['fields'] ?? null) ? $plot['fields'] : []
			), static fn($field) => $field !== '')));
			if (count($fields) < 1) continue;
			$entry['fields'] = array_slice($fields, 0, 1000);
			$entry['config'] = is_array($plot['config'] ?? null) ? $plot['config'] : [];
		} else {
			$prefix = $kind === 'pageBreak' ? 'PBR_' : ($kind === 'dateRange' ? 'DTR_' : 'CTXT_');
			$entry['fieldName'] = mb_substr((string)($plot['fieldName'] ?? ($prefix . $rptIdx)), 0, 255);
			$entry['title'] = mb_substr((string)($plot['title'] ?? ''), 0, 500);
			$entry['html'] = reportSanitizeHtml((string)($plot['html'] ?? ''));
			$entry['config'] = is_array($plot['config'] ?? null) ? $plot['config'] : [];
		}
		$normalized[] = $entry;
	}

	if ($dateRange === false) $dateRange = ['start' => null, 'end' => null];
	return ['formatVersion' => 2, 'plots' => $normalized, 'presentation' => $presentation, 'dateRange' => $dateRange];
}

function reportNormalizeDateRange($range)
{
	if (!is_array($range)) return ['start' => null, 'end' => null];
	$normalized = ['start' => null, 'end' => null];
	foreach (['start', 'end'] as $key) {
		$value = trim((string)($range[$key] ?? ''));
		if ($value === '') continue;
		$date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
		$errors = DateTimeImmutable::getLastErrors();
		if ($date === false || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0)) || $date->format('Y-m-d') !== $value) {
			return false;
		}
		$normalized[$key] = $value;
	}
	if ($normalized['start'] !== null && $normalized['end'] !== null && $normalized['start'] > $normalized['end']) return false;
	return $normalized;
}

function reportNormalizeChartPresentation($presentation): array
{
	if (!is_array($presentation)) return [];
	$normalized = [];
	foreach (array_slice($presentation, 0, 2000) as $layout) {
		if (!is_array($layout)) continue;
		$rptIdx = filter_var($layout['rptIdx'] ?? null, FILTER_VALIDATE_INT);
		if ($rptIdx === false || $rptIdx < 0) continue;
		$pc = filter_var($layout['pc'] ?? null, FILTER_VALIDATE_INT);
		$width = filter_var($layout['width'] ?? null, FILTER_VALIDATE_FLOAT);
		$titleData = $layout['title'] ?? '';
		$title = is_array($titleData) ? ($titleData['text'] ?? '') : $titleData;
		$subtitleData = is_array($titleData) ? ($titleData['subtitle'] ?? '') : ($layout['subtitle'] ?? '');
		$subtitle = is_array($subtitleData) ? ($subtitleData['text'] ?? '') : $subtitleData;
		$xAxisTitle = is_array($layout['xaxis'] ?? null) ? ($layout['xaxis']['title'] ?? '') : '';
		$yAxisTitle = is_array($layout['yaxis'] ?? null) ? ($layout['yaxis']['title'] ?? '') : '';
		$xTitle = is_array($xAxisTitle) ? ($xAxisTitle['text'] ?? '') : ($layout['xTitle'] ?? $xAxisTitle);
		$yTitle = is_array($yAxisTitle) ? ($yAxisTitle['text'] ?? '') : ($layout['yTitle'] ?? $yAxisTitle);
		$normalized[] = [
			'rptIdx' => $rptIdx,
			'pc' => ($pc === false || $pc < 1) ? null : $pc,
			'width' => ($width === false || $width < 100 || $width > 10000) ? null : $width,
			'title' => mb_substr(strip_tags((string)$title), 0, 1000),
			'subtitle' => mb_substr(strip_tags((string)$subtitle), 0, 1000),
			'xTitle' => mb_substr(strip_tags((string)$xTitle), 0, 1000),
			'yTitle' => mb_substr(strip_tags((string)$yTitle), 0, 1000)
		];
	}
	return $normalized;
}

function delChart(array $data, rixPDO &$db, array &$returnData): void
{
	checkParams($data, ['id', 'testId']);
	$id = (int)$data['id'];
	$testId = (int)$data['testId'];
	global $myAuth, $uiLang;
	if (!resultsCanReadTest($testId, $db)) {
		$returnData['error'] = $uiLang->translate("Unable to load data.");
		return;
	}

	# ----------------------------------------------------------------------- #
	# can only delete charts that the logged in user owns, or is a superadmin #
	# ----------------------------------------------------------------------- #

	# check first for ownership rights to delete targeted entry; if superadmin, this will be bypassed and entry will be deleted #
	$delOwnerId = $db->fetchValue("SELECT `ownerId` FROM `charts` WHERE `id` = ? AND `testId` = ?", [$id, $testId])['data'];
	if ((int)$delOwnerId !== (int)$myAuth->userid && $myAuth->checkSA() === false) {
		$returnData['error'] = $uiLang->translate("Sorry, you may not remove another user's entry!");
		return;
	}

	$result = $db->execute("DELETE FROM `charts` WHERE `id` = ? AND `testId` = ?", [$id, $testId]);
	if (!empty($result['error'])) {
		$returnData['error'] = $uiLang->translate("The report configuration could not be deleted.");
		return;
	}
	$returnData['deleted'] = true;
}
