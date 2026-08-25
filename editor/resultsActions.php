<?php

use Dompdf\Dompdf;
use MathPHP\NumericalAnalysis\NumericalIntegration\BoolesRule;
use MathPHP\Probability\Distribution\Continuous\Continuous;

use function PHPSTORM_META\type;

/** @phan-file-suppress PhanUnusedGlobalFunctionParameter, PhanUnusedVariable, PhanRedefineFunction, PhanUnusedClosureParameter, PhanTypeArraySuspiciousNullable, PhanSuspiciousWeakTypeComparison, PhanUnusedVariableValueOfForeachWithKey, PhanUnusedPublicNoOverrideMethodParameter */
/** @noinspection SqlResolve */

// common tests functions include used for tests and results editor
require_once 'inc/php/testsCommonFunctions.php';

//the JSON output will happen, even if a fatal error prevents the script from finishing
register_shutdown_function('outputJSON');
require_once "../inc/php/Crypt.php";
require_once 'inc/php/database.php'; //contains the database connection credentials
require_once '../inc/php/rixPDO.php'; //wrapper around PDO functions (c.f. docs folder for manual)
require_once '../inc/php/parser.php';
require_once '../inc/php/helperRoutines.php';
require_once '../inc/php/OasysScoring.php';
require_once '../inc/php/settingsCommonFunctions.php';

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
$db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, '../logs/resultsManager_errors.txt', 1, $returnData, 'error');

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
$letMePass = $permAuth->permCheck($data);
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

function fetchReportData($data, rixPDO &$db, &$returnData): void
{
    checkParams($data, ['testId']);
    global $settingsDefaults, $uiLang;

    # MASTER ITEM TABLE DATA #
    $raw_answer_intake = $db->fetchTable("SELECT CONCAT(`itemId`, \"_\", `fieldId`) AS `fi_key`, `fieldId`, `fieldType`, `itemId`, `value` FROM `answers` WHERE `testId` = ?", [$data['testId']])['data'];

    // If test does not contain ANY recorded answer data, exit with message
    if (empty($raw_answer_intake)) {
        $returnData['error'] = $uiLang->translate("No test data found to process.");
        return;
    }

    # MASTER ANSWER TABLE DATA #
    $test_item_list = $db->fetchColumn("SELECT DISTINCT `itemId` FROM `answers` WHERE `testId` = ?", [$data['testId']])['data'];

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
        $raw_page_intake[$ti_id] = $db->fetchRow("SELECT `blocks`, `fields` FROM `items` WHERE `id` = ?", [$ti_id])['data'];
        $item_block_data = json_decode($raw_page_intake[$ti_id]['blocks'], true);
        $item_field_data = json_decode($raw_page_intake[$ti_id]['fields'], true);

        // filter out all unwanted item block types
        foreach ($item_block_data as $k_kbd => $v_ibd) {
            if (in_array($v_ibd['type'], ["wysiwyg", "audio", "image", "video", "button"])) {
                unset($item_block_data[$k_kbd]);
            }
        }

        // re-index item block data
        $item_block_data = array_values($item_block_data);


        // filter out all unwanted item field types (no re-indexing necessary, not numerical)
        foreach ($item_field_data as $k_kfd => $v_ifd) {
            if (in_array($v_ifd['type'], ["oasysButton", "oasysAudioVideo", "oasysImage"])) {
                unset($item_field_data[$k_kfd]);
            }
        }

        # --------------- #
        # BLOCK ITERATION #
        # --------------- #

        foreach ($item_block_data as $ib_k => $ib_val) {

            // $if_val = array_values($item_field_data)[$ib_k]; // extract 'field' column data
            // $if_key_name = $ti_id . "_" . array_keys($item_field_data)[$ib_k]; // derive the keyname for item/field/question object
            $if_obj = $item_field_data[$ib_val["id"]]; // extract 'field' column data
            $if_key_name = $ti_id . "_" . $ib_val["id"]; // derive the keyname for item/field/question object

            if (!in_array($ib_val["type"], ["choicematrix", "inline_gaps", "inline_textfields", "choice"])) {
                if (!in_array($if_key_name, $u_ans_keys)) continue;
            }

            # --------------- #
            # FIELD ITERATION #
            # --------------- #

            if ($ib_val['type'] === "advanced") {
                $item_field_values[$if_key_name] = $if_obj['id'];

                # ADVANCED TYPE PROCESSING #

                if (isset($if_obj['values'])) {
                    $qXcat[$if_key_name] = [];
                    foreach ($if_obj['values'] as $ifValItem) {
                        if (gettype($ifValItem) === "string") {
                            array_push($qXcat[$if_key_name], [hex2bin($ifValItem)]);
                        } elseif (gettype($ifValItem) === "array") {
                            foreach ($ifValItem as $ivi) {
                                if (!isset($qXcat[$if_key_name])) $qXcat[$if_key_name] = [];
                                array_push($qXcat[$if_key_name], $ivi['value']);
                            }
                        }
                    }
                } else {
                    $srcString = $ib_val['source']['EN'] ?? $ib_val['source']['DE'] ?? $ib_val['source']['FR'];
                    $labelStr = $srcString;
                    $srcString = explode("\n", $srcString)[0];
                    $srcString = strip_tags($srcString); // strip all HTML tags
                    $srcString = trim(preg_replace('/\s*\[[^)]*\]/', '', $srcString)); // strip all contents within brackets
                    $srcString = trim(html_entity_decode($srcString), " \t\n\r\0\x0B\xC2\xA0"); // remove all HTML entities

                    $item_field_values[$if_key_name] = $srcString;

                    preg_match_all('/VALUE="(.+?)"/', $labelStr, $catMatches);
                    $qXcat[$if_key_name] = $catMatches[1];
                }

                $fType[$if_key_name] = $ib_val['type'];
            } elseif (isset($ib_val["question"])) {

                # CHOICEMATRIX HANDLING #

                if ($ib_val['type'] === "choicematrix") {
                    foreach ($ib_val['rows'] as $cmIdx => $cmVal) {
                        $fType[$if_key_name . "_" . $cmVal["value"]] = $item_field_data[$ib_val["id"] . "_" . $cmVal["value"]]["type"];
                        $item_field_values[$ti_id . "_" . $ib_val["id"] . "_" . $cmVal["value"]] = strip_tags($cmVal["label"][$settingsDefaults["defaultLanguage"]["value"] ?? key($cmVal["label"])]);
                        foreach ($ib_val['labels'] as $il_k => $il_v) {
                            $qXcat[$ti_id . "_" . $ib_val["id"] . "_" . $cmVal["value"]][] = strip_tags($il_v["value"]);
                        }
                    }
                    continue;
                }

                # INLINE GAPS HANDLING #

                if ($ib_val["type"] === "inline_gaps") {
                    $ig_lang = $settingsDefaults["defaultLanguage"]["value"] ?? key($igFieldVal["question"]);
                    foreach ($ib_val["fields"][$ig_lang] as $igIdx => $igFieldVal) {
                        $fType[$if_key_name . "_" . $igFieldVal["number"]] = $item_field_data[$ib_val["id"] . "_" . $igFieldVal["number"]]["type"];
                        $item_field_values[$ti_id . "_" . $ib_val["id"] . "_" . $igFieldVal["number"]] = strip_tags($igFieldVal["name"]);
                        $qXcat[$ti_id . "_" . $ib_val["id"] . "_" . $igFieldVal["number"]] = array_column($ib_val["answers"], "value");
                    }
                    continue;
                }

                # INLINE TEXTFIELD HANDLING (a.k.a., 'choice' interaction) #

                if ($ib_val["type"] === "inline_textfields") {
                    $ig_lang = $settingsDefaults["defaultLanguage"]["value"] ?? key($igFieldVal["question"]);
                    foreach ($ib_val["fields"][$ig_lang] as $igIdx => $igFieldVal) {
                        $fType[$if_key_name . "_" . $igFieldVal["number"]] = $item_field_data[$ib_val["id"] . "_" . $igFieldVal["number"]]["type"];
                        $item_field_values[$ti_id . "_" . $ib_val["id"] . "_" . $igFieldVal["number"]] = strip_tags($igFieldVal["name"]);
                        $qXcat[$ti_id . "_" . $ib_val["id"] . "_" . $igFieldVal["number"]] = array_column($ib_val["correction"], 0);
                    }
                    continue;
                }

                # CHECK DEFAULT LANGUAGE #

                if (isset($ib_val["question"][$settingsDefaults["defaultLanguage"]["value"]])) {
                    $item_field_values[$if_key_name] = strip_tags($ib_val["question"][$settingsDefaults["defaultLanguage"]["value"]]);
                } else {
                    $item_field_values[$if_key_name] = strip_tags(key($ib_val["question"]));
                }

                // fTypes for non-metafield types can be defined here, whereas the metafield 'fType' must be defined at the field level above
                $fType[$if_key_name] = $ib_val['type'];

                # ALL OTHER INTERACTION TYPE HANDLING #

                if (isset($ib_val['labels'])) {
                    $qXcat[$if_key_name] = array_column($ib_val['labels'], "value"); // we're taking the 'value' and not the label text as the x-category string
                } elseif (isset($ib_val['choices'])) {
                    $qXcat[$if_key_name] = array_column($ib_val['choices'], "value"); // we're taking the 'value' and not the label text as the x-category string
                } elseif ($ib_val["type"] == "slider") {
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
        $valueField = json_decode($mainKey['value'], true);
        if (!isset($core_stats["N"][$mainKey['fi_key']])) $core_stats["N"][$mainKey['fi_key']] = 0;

        if (is_null($valueField) || is_int($valueField)) {
            $core_stats["N"][$mainKey['fi_key']] += 1;
        } elseif (is_array($valueField)) {
            $core_stats["N"][$mainKey['fi_key']] += count($valueField);
        } else {
            $core_stats["N"][$mainKey['fi_key']] += 0;
        }
    }

    $returnData['data']['items'] = $item_field_values;
    $returnData['data']['core'] = $core_stats;
    $returnData['data']['xcat'] = $qXcat;
    $returnData['data']['fTypes'] = $fType;
}

/**
 * Takes JS call with *image and report data* payload and generates a PDF report file to send back to the client for download.
 * @param  array $data
 * @param  rixPDO $db
 * @param  array $returnData
 * @return void
 */
function report_export(array $data, rixPDO &$db, array &$returnData): void
{
    global $settings;
    require '../inc/domPDF/vendor/autoload.php';

    // pre-flight check and data extraction
    checkParams($data, ['htmlData']);
    extract($data);

    $tmpDir = sys_get_temp_dir();

    // initialize domPDF object
    $dompdf = new Dompdf([
        "defaultPaperSize" => "A4",
        "isRemoteEnabled" => true,
        "fontDir" => $tmpDir,
        "fontCache" => $tmpDir,
        "tempDir" => $tmpDir,
        "chroot" => $tmpDir
    ]);

    // build HTML for PDF and render

    // Must use full URL -- relative URL will not load the custom font
    $surl = $_SERVER['HTTP_ORIGIN'] . $settings["rootURL"] . "inc/fonts/opensans.css";

    $html_final = <<<HTML

    <html lang="en-US">
    <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width">
    <title></title>

    <!-- <link href="https://fonts.googleapis.com/css2?family=Open+Sans" rel="stylesheet">  -->
    
    <link rel="stylesheet"  href="{$surl}">
    
    <style>

        body { font-family: 'Open Sans'; }
        h1, h2, h3, h4, h5, h6 { font-family: 'Open Sans'; }
        .ot_content { font-family: 'Open Sans'; }

    </style>

    </head>

    </head>
    <body>

    HTML;

    foreach (array_unique(array_column($htmlData, "group")) as $grpNum) {

        foreach (array_values($htmlData) as $hVal) {
            if (intval($hVal['group']) === intval($grpNum)) $html_final .= (substr($hVal['value'], 0, 10) === "data:image") ?
                "<div><img border: 0; padding: 0px; margin: 0px; display: block;' src='{$hVal['value']}' width='100%'/></div>" : // base64 image handling
                "<div src='border: 0; padding: 0px; margin: 0px; display: block; width: 100%;'>{$hVal['value']}</div>"; // standard text handling
        }
    }

    $html_final = str_replace('<div data-id="##OARPT_PAGE_BREAK##" class="chart_pb">--PAGE BREAK--</div>', "<div style='page-break-after: always;'></div>", $html_final);
    $html_final .= "
    </body>
    </html>
    ";

    $dompdf->loadHtml($html_final);
    $dompdf->render();

    // send PDF data back to client
    $returnData['pdfData'] = base64_encode($dompdf->output());
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
    checkParams($data, ['testId']);

    extract($data);

    /* separate routine for fluid tests (?) */
    $fQuery = $db->fetchValue("SELECT `structure` FROM `tests` WHERE `id` = ?", [$testId])['data'];
    $isForM = in_array(json_decode($fQuery ?? '', true)['type'], ["fluid", "mutation"]);
    $returnData["fluidOrMut"] = $isForM;

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

    $returnData = array_merge($returnData, [
        'testId' => $testId,
        'testName' => $db->fetchValue("SELECT `name` FROM `tests` WHERE `id` = ?", [$testId])['data'],
        'hasMan' => $containsMS === 0 ? false : $testScoring->hasMSleft(),
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
    global $uiLang;
    checkParams($data, ['testId']);
    extract($data);

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

    try {
        $returnData = array_merge($returnData, [
            'testId' => $testId,
            'testName' => $testName,
            't_scoringSummary' => $testScoring->getTlistSummary($startPos),
            'q_scoringSummary' => $testScoring->getQlistSummary($q_startPos),
            'ttl_count' => $testScoring->get_tt_count(),
            'tpl_count' => $testScoring->get_q_count()
        ]);
    } catch (Exception $e) {
        $returnData['reloadFolder'] = true;
        $returnData['error'] = $e->getMessage();
        exit;
    }
}

function fetchQAListDetail($data, rixPDO &$db, &$returnData): void
{
    global $uiLang;

    checkParams($data, ['qType']);

    // quickly extract all $data input vars into their respective var names
    extract($data);

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
            try {
                $returnData = array_merge($returnData, $testScoring->get_q_list_detail($pagePosStart, $testId, $msOnly, $pageId));
            } catch (Exception $e) {
                $returnData['error'] = $e->getMessage();
                exit;
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

            try {
                $returnData = array_merge($returnData, $testScoring->get_tt_list_detail($passwordId, $pagePosStart, $msOnly, (($qType === 't') ? false : $pageId)));
            } catch (Exception $e) {
                $returnData['error'] = $e->getMessage();
                exit;
            }

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
        'displayName' => $displayName
    ];

    // return the page view type
    $returnData['qType'] = $data['qType'];
}

/**
 * Adds test activity timeLeft value to returnData array.
 *
 * @param  array $data
 * @param  rixPDO $db
 * @param  array $returnData
 * @return void
 */
function getTL(array $data, rixPDO &$db, array &$returnData): void
{
    checkParams($data, ['testId', 'passwordId']);
    extract($data);
    global $uiLang;

    $curTL = $db->fetchValue("SELECT `timeLeft` FROM `activity` WHERE `testId` = ? AND `passwordId` = ?", [$testId, $passwordId])['data'];

    if ($curTL === 0) {
        $returnData['tl_msg'] = ["#00008b"/* dark blue */ => $uiLang->translate("This test is in submitted status, and you may begin (or continue) scoring.")];
    } elseif ($curTL > 0) {
        $returnData['tl_msg'] = ["red" => $uiLang->translate("This test has {$curTL} minutes remaining, and has not been submitted!")];
    } elseif ($curTL < 0) {
        $returnData['tl_msg'] = ["red" => $uiLang->translate("This test does not have a time limit, and has not been submitted!")];
    }
}


function fetchQADetail($data, rixPDO &$db, &$returnData): void
{
    checkParams($data, ['passwordId', 'testId', 'pageId', 'pageName']);

    extract($data);

    // if NOT ONLY comment request, add these additional arrays in return
    try {
        $testScoring = new OasysScoring($testId, $db);
    } catch (Exception $e) {
        $returnData['error'] = $e->getMessage();
        die();
    }

    // $testScoring->getScoreData();
    // $testScoring->autoScore();

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
            $jsonEncItemName = json_encode($item);
            $sumScore += $scoreKey['score']['scoreValue'];
            $returnData['scoredByInfo'][$item] = json_decode($db->fetchValue("SELECT JSON_EXTRACT(`givenScoringData`, CONCAT('$.', ?, '.', ?, '.', 'score')) FROM `scoring` WHERE `passwordId` = ? AND `testId` = ?", [$pageId, $jsonEncItemName, $passwordId, $testId])['data'] ?? '[]', true);
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
}

function scoringAddComment($data, rixPDO &$db, &$returnData): void
{
    checkParams($data, ['comment', 'pageId', 'passwordId', 'itemName', 'testId']);
    extract($data);

    /* insert comment into appropriate db row and JSON property */

    $gsd = $db->fetchValue("SELECT `givenScoringData` FROM `scoring` WHERE `passwordId` = ? AND `testId` = ?", [$data['passwordId'], $data['testId']])['data'];
    $gsd = json_decode($gsd ?? '', true) ?? [];

    $comment = [
        'commentString' =>  $comment,
        'commentTime' => date('Y-m-d H:i:s'),
        'commentBy' => $_SESSION['username'],
        'commentById' => $_SESSION['userid']
        // 'uid' => bin2hex(random_bytes(8))
    ];

    $gsd[$pageId][$itemName]['comment'] = $comment;


    $gsd = json_encode($gsd, JSON_PRETTY_PRINT);

    $db->prepare("UPDATE `scoring` SET `givenScoringData` = ? WHERE `passwordId` = ? AND `testId` = ?");
    $db->executePrepared([$gsd, $passwordId, $testId]);

    $returnData['commentData'] = $comment;
}

function scoringRemComment($data, rixPDO &$db, &$returnData): void
{
    checkParams($data, ['itemName', 'pageId', 'testId', 'passwordId']);
    extract($data);

    /* extract given scoring data and convert to array for processing */

    $gsd = $db->fetchValue("SELECT `givenScoringData` FROM `scoring` WHERE `passwordId` = ? AND `testId` = ?", [$data['passwordId'], $data['testId']])['data'];
    $gsd = json_decode($gsd ?? '', true) ?? [];

    if (isset($gsd[$pageId][$itemName]['comment'])) unset($gsd[$pageId][$itemName]['comment']);

    /* re-encode to JSON to push back into DB */

    $gsd = json_encode($gsd, JSON_PRETTY_PRINT);

    $db->prepare("UPDATE `scoring` SET `givenScoringData` = ? WHERE `passwordId` = ? AND `testId` = ?");
    $db->executePrepared([$gsd, $passwordId, $testId]);
}

function setScore($data, rixPDO &$db, &$returnData): void
{
    global $uiLang;
    checkParams($data, ['testId', 'passwordId', 'pageId', 'itemName', 'score']);
    extract($data);

    // hard check that correction is not on an open test
    $testTL = $db->fetchValue("SELECT `timeLeft` FROM `activity` WHERE `testId` = ? AND `passwordId` = ?", [$testId, $passwordId])['data'];
    if ($testTL !== 0) {
        $returnData['error'] = $uiLang->translate("Cannot score an open test!");
        return;
    }

    // hard check that a cheeky autoscore override is not being sent in (or attempt to score anything other than "manual")
    $badProcType = $db->fetchValue("SELECT JSON_VALUE(`fields`, CONCAT('$.', ?, '.processing')) FROM `items` WHERE id = ?", [json_encode($itemName), $pageId])['data'] !== "manual";
    if ($badProcType === true) {
        $returnData['error'] = $uiLang->translate("This item is not scorable!");
        return;
    }

    $givenScFld = $db->fetchValue("SELECT `givenScoringData` FROM `scoring` WHERE `passwordId` = ? AND `testId` = ?", [$data['passwordId'], $data['testId']])['data'];
    $givenScFld = json_decode($givenScFld ?? '', true) ?? [];

    $scoreEntry = [
        'scoreValue' =>  $score,
        'scoreTime' => date('Y-m-d H:i:s'),
        'scoreBy' => $_SESSION['username'],
        'scoreById' => $_SESSION['userid'],
    ];

    $givenScFld[$pageId][$itemName]['score'] = $scoreEntry;
    $givenScFld = json_encode($givenScFld, JSON_PRETTY_PRINT);

    /* set new score value in database */

    $db->startTransaction();

    $db->prepare("UPDATE `scoring` SET `givenScoringData` = ? WHERE `passwordId` = ? AND `testId` = ?");
    $ret = $db->executePrepared([$givenScFld, $passwordId, $testId]);

    /* if scoring too fast, wait 1 second for DB to catch up and reload result */
    if ($ret['rows'] !== 1) {
        sleep(1);
        $ret = $db->fetchValue("SELECT `givenScoringData` FROM `scoring` WHERE `passwordId` = ? AND `testId` = ?", [$passwordId, $testId]);
    }

    if ($ret['error'] !== false || $ret['rows'] !== 1) {
        $returnData['error'] = $uiLang->translate("Server was unable to record score! The test page will now be reloaded. You may try scoring again.");
        $db->rollback();
    } else {

        /* need to send back the original 'touched' value of item being scored so we can keep an accurate count on the UI */

        $jsonEncItemName = json_encode($itemName);
        $returnData['touched'] = intVal($db->fetchValue("SELECT JSON_VALUE(`scoringData`, CONCAT('$.scoringAnswerList.', ?, '.', ?, '.', 'touched')) FROM `scoring` WHERE `testId` = ? AND `passwordId` = ?", [$pageId, $jsonEncItemName, $testId, $passwordId])['data']);

        /* if score recorded, get relevant update values and send back to UI, and mark the entry as touched */

        // mark the scored entry as 'touched' in the main scoringData table
        $touchUpdate = $db->fetchValue(
            "UPDATE `scoring`
                SET `scoringData` = (SELECT JSON_SET(`scoringData`, CONCAT('$.scoringAnswerList.', ?, '.', ?, '.', 'touched'), 1) FROM (SELECT * FROM `scoring`) as `s2` WHERE `testId` = ? AND `passwordId` = ?)
            WHERE `testId` = ? AND `passwordId` = ?",
            [$pageId, $jsonEncItemName, $testId, $passwordId, $testId, $passwordId] //params
        );

        if ($touchUpdate["error"] !== false) {
            $returnData['error'] = $uiLang->translate("Server was unable to record score! The test page will now be reloaded. You may try scoring again.");
            $db->rollback();
            return;
        };

        $newScoreMaster = json_decode($db->fetchValue("SELECT JSON_EXTRACT(`givenScoringData`, CONCAT('$.', ?)) FROM `scoring` WHERE `passwordId` = ? AND `testId` = ?", [$pageId, $passwordId, $testId])['data'], true);
        $itemNewScoreDetail = $newScoreMaster[$itemName]['score'];

        // validate that new score was recorded (or at the very least, matches) into the DB, else return failure message
        if ($itemNewScoreDetail['scoreValue'] !== $score) {
            $returnData['error'] = $uiLang->translate("Server was unable to record score! The test page will now be reloaded. You may try scoring again.");
            $db->rollback();
            return;
        }

        $db->commit();

        // execute scoring and get final score and score sums values

        try {
            $testScoring = new OasysScoring($testId, $db);
        } catch (Exception $e) {
            $returnData['error'] = $e->getMessage();
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
    }
}

function resetAllCorrections(array $data, rixPDO &$db, array &$returnData): void
{
    checkParams($data, ['testId', 'pId', 'conf']);
    extract($data);

    if ($conf !== true) {
        $returnData['error'] = "Confirmation not clicked. Canceling request.";
        return;
    }

    $testId = intVal($testId);
    $pId = intVal($pId);

    $db->fetchValue("UPDATE `scoring` SET `givenScoringData` = NULL, `scoringData` = NULL WHERE `testId` = ? AND `passwordId` = ?", [$testId, $pId])['data'];

    // update scoring table and columns after correction reset action
    try {
        $testScoring = new OasysScoring($testId, $db);
    } catch (Exception $e) {
        $returnData['error'] = $e->getMessage();
        die();
    }

    $testScoring->populateAnswers();
    $testScoring->getScoreData();
    $testScoring->manscoreProcess();

    // get number of mancorr items left to send back to caller to update label(s)
    $msLeft = 0;
    $sd = $db->fetchValue("SELECT `scoringData` FROM `scoring` WHERE `passwordId` = ? AND `testId` = ?", [$pId, $testId])['data'];

    // get remaining manual scoring items left per passwordId
    $sd = json_decode($sd ?? '', true)['scoringAnswerList'];

    foreach ($sd as $page => $pageValues) {
        foreach ($pageValues as $pageName => $itemValues) {
            if ($pageName === "pageName") continue;

            if ($itemValues['itemScoreType'] === "manual" && $itemValues['touched'] === 0) $msLeft++;
        }
    }
    $returnData['msLeft'] = $msLeft;
}

function closeOutTest($data, rixPDO &$db, &$returnData): void
{
    checkParams($data, ['testId', 'passwordId']);
    extract($data);

    $instructions = [['command' => 'timeUp', 'reason' => 'scoringStarted']];
    $instructions = json_encode($instructions);

    $db->update("activity", ["timeLeft" => 0, "instructions" => $instructions], "`testId` = ? AND `passwordId` = ?", [$testId, $passwordId]);
    getTL($data, $db, $returnData);
}

function hasMSleft(array $data, rixPDO &$db, array &$returnData): void
{
    checkParams($data, ['testId']);
    extract($data);

    try {
        $testScoring = new OasysScoring($testId, $db);
    } catch (Exception $e) {
        $returnData['error'] = $e->getMessage();
        exit;
    }

    $containsMS = $testScoring->containsMS();
    $returnData['hasMSleft'] = $containsMS === 0 ? false : $testScoring->hasMSleft();
}

function chartStorePrecheck(array $data, rixPDO &$db, array &$returnData): void
{
    extract($data);
    global $myAuth, $uiLang;

    # duplicate title check #

    $tcheck = $db->fetchRow("SELECT `title`, `ownerId` FROM `charts` WHERE `title` = ? AND `testId` = ?", [$title, $testId])['data'];

    if (!empty($tcheck)) {
        if ($myAuth->userid === $tcheck['ownerId']) {
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
    checkParams($data, ['chartData', 'title', 'testId']);

    extract($data);
    global $myAuth, $uiLang;

    # title length check #
    if (strlen($title) > 30) {
        $returnData['error'] = $uiLang->translate("Name of entry must be 30 characters or fewer!");
        return;
    }

    $tcheck = $db->fetchRow("SELECT `title`, `ownerId` FROM `charts` WHERE `title` = ? AND `testId` = ?", [$title, $testId])['data'];

    # check for override of overwrite by non-owner #
    if (!empty($tcheck)) {
        if (!($myAuth->userid === $tcheck['ownerId'] && $owrite === true)) {
            $returnData['error'] = $uiLang->translate("Name is already in use! You may not overwrite another user's entry.");
            return;
        }
    }

    $chartData = serialize($chartData);
    $layoutData = json_encode($layoutData, JSON_PRETTY_PRINT);

    if ($owrite) {
        $db->update("charts", ['testId' => $testId, 'ownerId' => $myAuth->userid,  'title' => $title, 'visibility' => $vis, 'data' => $chartData, 'layoutData' => $layoutData], "`title` = ?", [$title]);
    } else {
        $db->insert("charts", ['testId' => $testId, 'ownerId' => $myAuth->userid,  'title' => $title, 'visibility' => $vis, 'data' => $chartData, 'layoutData' => $layoutData]);
    }
}

function getChartList(array $data, rixPDO &$db, array &$returnData): void
{
    checkParams($data, ['testId']);
    extract($data);
    global $myAuth;

    // saved chart list is either only charts that are shared, or the current user is the creator of
    $allVis = $myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin();
    $cList = $db->fetchTable("SELECT `id`, `title` FROM `charts` WHERE `testId` = ? AND (`visibility` = 1 OR ownerId = ? OR ?)", [$testId, $myAuth->userid, $allVis])['data'];
    $returnData['chartList'] = $cList;
}

function loadChart(array $data, rixPDO &$db, array &$returnData): void
{

    checkParams($data, ['id']);
    extract($data);
    $ret = $db->fetchRow("SELECT `data`, `layoutData` FROM `charts` WHERE `id` = ?", [$id])['data'];

    $loadChart = unserialize($ret['data']);
    $layoutData = json_decode($ret['layoutData'] ?? '', true);

    $returnData['data'] = $loadChart;
    $returnData['layoutData'] = $layoutData;
}

function delChart(array $data, rixPDO &$db, array &$returnData): void
{
    checkParams($data, ['id']);
    extract($data);
    global $myAuth, $uiLang;

    # ----------------------------------------------------------------------- #
    # can only delete charts that the logged in user owns, or is a superadmin #
    # ----------------------------------------------------------------------- #

    # check first for ownership rights to delete targeted entry; if superadmin, this will be bypassed and entry will be deleted #
    $delOwnerId = $db->fetchValue("SELECT `ownerId` FROM `charts` WHERE `id` = ?", [$id])['data'];
    if ($delOwnerId !== $myAuth->userid && $myAuth->checkSA() === false) {
        $returnData['error'] = $uiLang->translate("Sorry, you may not remove another user's entry!");
        return;
    }

    $db->execute("DELETE FROM `charts` WHERE `id` = ?", [$id]);
}
