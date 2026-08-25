<?php

/** @phan-file-suppress PhanUnusedGlobalFunctionParameter, PhanUnusedVariable, PhanRedefineFunction, PhanUnusedClosureParameter, PhanTypeArraySuspiciousNullable, PhanSuspiciousWeakTypeComparison, PhanUnusedVariableValueOfForeachWithKey, PhanUnusedPublicNoOverrideMethodParameter */

//the JSON output will happen, even if a fatal error prevents the script from finishing
register_shutdown_function('outputJSON');
require_once 'inc/php/database.php';
require_once '../inc/php/rixPDO.php';

$action = filter_input(INPUT_POST, 'action');
if (!$action) {
    $action = "";
}

$returnData = [];
$returnData['action'] = $action;
$returnData['error'] = false;

# ----------------------- #
# Authentication Includes #
# ----------------------- #
$pageName = "acctprop"; // set to the related 'editor button' string name (e.g., 'items')
$isSubMod = false; // set true if a module page in a subdirectory
$isActionFile = true; // set true if an "xxxActions.php" file
require_once 'inc/php/authCommonFunctions.php'; // required for authentication inclusion

$returnData = (array) $myAuth->returnData;

// if the auth constructor results in an error, we want to immediately exit and report said error
if ($myAuth->returnData['error'] !== false) {
    // $returnData['error'] = $myAuth->returnData['error'];
    exit;
}


$data = filter_input(INPUT_POST, 'data');
if ($data) {
    $data = json_decode($data ?? '', true);
}
if (!$data) {
    $data = array();
}
//data field must be separately JSON encoded before sending to get past max_input_vars limitation

$db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, '../logs/acctPropErrors.log', 1, $returnData, 'error');

$action($data, $db, $returnData, $myAuth);

/*
###############
FUNCTIONS START
###############
*/

function updateUserSettings($data, rixPDO &$db, &$returnData, userAuth &$myAuth)
{
    global $myAuth, $settingsDefaults, $settings, $uiLang;
    $usVals = $data;

    // accessDef null check and fix
    $us_col_json = $db->fetchValue("SELECT `accessDef` FROM `users` WHERE id = ?", [$myAuth->userid])['data'];
    if (is_null($us_col_json)) {
        $db->prepare("UPDATE `users` SET `accessDef` = JSON_OBJECT() WHERE `id` = ?");
        $db->executePrepared([$myAuth->userid]);
        $us_col_json = $db->fetchValue("SELECT `accessDef` FROM `users` WHERE id = ?", [$myAuth->userid])['data'];
    }

    // accessDef missing userSettings JSON key check and fix
    $us_col_arr = json_decode($us_col_json ?? '', true);
    if (!isset($us_col_arr['userSettings'])) {
        $db->prepare("UPDATE `users` SET `accessDef` = JSON_SET(`accessDef`,'$.userSettings', JSON_OBJECT()) WHERE `id` = ?");
        $db->executePrepared([$myAuth->userid]);
        $us_col_json = $db->fetchValue("SELECT `accessDef` FROM `users` WHERE id = ?", [$myAuth->userid])['data'];
        $us_col_arr = json_decode($us_col_json ?? '', true);
    }

    # ---------------------------- #
    # Remove user settings subkeys #
    # ---------------------------- #
    foreach ($us_col_arr['userSettings'] as $usKey => $usVal) {
        if (!(in_array($usKey, array_keys($settingsDefaults)))) {
            $db->prepare("UPDATE `users` SET `accessDef` = JSON_REMOVE(`accessDef`, CONCAT('$.userSettings.', ?)) WHERE `id` = ?");
            $db->executePrepared([$usKey, $myAuth->userid]);
        }
    }

    foreach ($usVals as $newKey => $newVal) {

        $dataFmtType = $settingsDefaults[$newKey]['format'];

        // special handling for boolean true/false values to ensure proper conformation for database insert
        $valToken = $newVal;
        if ($newVal === true && $dataFmtType === FORMAT_BOOL) {
            $valToken = "true";
        } else if ($newVal === false && $dataFmtType === FORMAT_BOOL) {
            $valToken = "false";
        } else {
            $valToken = $newVal;
        }

        // FYI: ONLY BOOLEAN can be direct inserted with variable substitution, other types (i.e., string) MUST be prepared to prevent SQL injection vulns or data mangling
        if ($dataFmtType === FORMAT_BOOL) {
            $db->prepare("UPDATE `users` SET `accessDef` = JSON_SET(`accessDef`, CONCAT('$.userSettings.', ?), {$valToken}) WHERE `id` = ?");
            $db->executePrepared([$newKey, $myAuth->userid]);
        } else {
            $db->prepare("UPDATE `users` SET `accessDef` = JSON_SET(`accessDef`, CONCAT('$.userSettings.', ?), ?) WHERE `id` = ?");
            $db->executePrepared([$newKey, $valToken, $myAuth->userid]);
        }
    }

    $returnData['authMessage'] = $uiLang->translate("Updated user settings.");
}

function check($data, rixPDO &$db, &$returnData, userAuth &$myAuth)
{
    // the 'check' JS function already performed in userAuth instantiation

    // system settings values query
    global $settingsDefaults, $settings;

    // get keys
    $userSettings = [];
    foreach ($settingsDefaults as $sdKey => $sdVal) {
        if ($sdVal['scope'] === SETTINGS_USER) {
            $userSettings[$sdKey] = $sdVal;
            $userSettings[$sdKey]['value'] = $settings[$sdKey];
        }
    }

    // get actual settings values
    foreach ($userSettings as $uKey => &$uVal) {
        $uVal['value'] = $settings[$uKey];
    }

    $returnData['uSettings'] = $userSettings;
}

# -------------------- #
# Update User Language #
# -------------------- #
function langChange($data, rixPDO &$db, &$returnData, userAuth &$myAuth)
{
    global $languages, $uiLang;
    $newLang = $data['newLang'];

    if (!in_array($newLang, array_keys($languages))) {
        $returnData['error'] = $uiLang->translate("Language is not available.");
        $myAuth->writeLogEntry("BAD INPUT: Did not change language successfully. INPUT: " . $newLang);
    } else {
        $db->update("users", ["defLang" => $newLang], "id = ?", [$myAuth->userid]);
        $returnData['authMessage'] = $uiLang->translate("Language successfully updated.");
        $myAuth->writeLogEntry("USER ACTION: Changed language successfully.");
    }

    // return list of languages
    $returnData['langs'] = $languages;

    // return selected language (if any)
    $defLang = $db->fetchValue("SELECT `defLang` FROM `users` WHERE `id` = ?", [$myAuth->userid])['data'];
    $returnData['defLang'] = $defLang;
}
# -------------------------- #
# JS password update handler #
# -------------------------- #
function pwdChange($data, rixPDO &$db, &$returnData, userAuth &$myAuth)
{
    global $uiLang;
    $accType = $db->fetchValue("SELECT `acct_type` FROM `users` WHERE `id` = ?", [$myAuth->userid])['data'];
    if ($accType !== "LOCAL") {
        $myAuth->writeLogEntry("BAD INPUT: Password reset on non-LOCAL account type not allowed.");
        $returnData['error'] = $uiLang->translate("Password reset on non-local account type not allowed.");
        return;
    }

    $pwdChangeTry = $myAuth->pwdChange($myAuth->userid);
    if ($pwdChangeTry !== true) {
        $myAuth->writeLogEntry("BAD INPUT: " . $pwdChangeTry);
        $returnData['error'] = $pwdChangeTry;
    } else {
        $returnData['authMessage'] = $uiLang->translate("Password successfully updated.");
    }
}

# -------------------- #
# Email change handler #
# -------------------- #
function emailChange($data, rixPDO &$db, &$returnData, userAuth &$myAuth)
{
    global $uiLang;
    $email = $myAuth->handleInput($_POST['data']);
    $emUpdateTry = $myAuth->emailChange($myAuth->userid, $email['newemail']);
    if ($emUpdateTry !== true) {
        $myAuth->writeLogEntry("BAD INPUT: " . $emUpdateTry);
        $returnData['error'] = $emUpdateTry;
        $returnData['email'] = $myAuth->email;
    } else {
        $returnData['authMessage'] = $uiLang->translate("Email successfully updated.");
        $myAuth->writeLogEntry("USER ACTION: Email successfully updated.");
        $returnData['email'] = $myAuth->email;
    }
}


function outputJSON()
{
    global $returnData, $db, $action, $myAuth;

    // updated username
    global $myAuth;
    $returnData['loggedInName'] = $myAuth->username;


    if (!isset($returnData['action'])) {
        $returnData['action'] = $action;
    }

    // get account type to return
    $acctType = $db->fetchValue("SELECT `acct_type` FROM `users` WHERE `id` = ?", [$myAuth->userid])['data'];
    $returnData['accountType'] = $acctType;


    $error = error_get_last();
    if (!empty($error)) {
        $documentRoot = filter_input(INPUT_SERVER, "DOCUMENT_ROOT");
        $file = str_replace($documentRoot, '', $error['file']);
        $returnData['fatalError'] = "<p>Fatal error [type {$error['type']}] on line {$error['line']} of<br><code class='tinyCode'>$file</code></p><p>{$error['message']}</p>";
    }
    header('Cache-Control: no-cache, must-revalidate');
    header('Content-type: application/json; charset=UTF-8');
    echo json_encode($returnData);
}
