<?php

//the JSON output will happen, even if a fatal error prevents the script from finishing

use MathPHP\Probability\Distribution\Continuous\Continuous;

register_shutdown_function('outputJSON');

require_once("../backupRestore/export.class.php"); // call class used for db and file operations

//action is a string that defines what action to perform
$action = filter_input(INPUT_POST, 'action');
if (!$action) {
    $action = "";
}

//data is a JSON encoded associative array that contains all the necessary data for the action to be performed
//(the array must be manually JSON encoded before sending to get past max_input_vars limitation)
$data = filter_input(INPUT_POST, 'data');
if ($data) {
    $data = json_decode($data ?? '', true);
}
if (!$data) {
    $data = array();
}

#################################################################################################

define("BKPROOT", realpath("../") . DIRECTORY_SEPARATOR . "backupRestore" . DIRECTORY_SEPARATOR);


require_once 'inc/php/database.php'; //contains the database connection credentials

//all data that is returned by this script will be put into $returnData array which is sent back in JSON encoded form
$returnData = array();
$returnData['action'] = $action; //when returning we must specify which action was performed
$returnData['error'] = false; //if there is an error, this will contain a string with the error message

# ----------------------- #
# Authentication Includes #
# ----------------------- #
$pageName = "backup"; // set to the related 'editor button' string name (e.g., 'items')
$isSubMod = false; // set true if a module page in a subdirectory
$isActionFile = true; // set true if an "xxxActions.php" file
require_once 'inc/php/authCommonFunctions.php'; // required for authentication inclusion
require_once 'inc/php/systemState.php'; // required for maintenance mode handling and session kicking and/or reloading


$returnData['skipJson'] = false;

/* $db is for database backup/restore operations */
try {
    $db = new DbOperationClass($sql_host, $sql_user, $sql_password, $sql_db);
} catch (Exception $e) {
    $returnData['error'] = $e->getMessage();
    writeLogEntry($e->getMessage(), true);
    exit;
}

/* $dbr is for standard rixPDO operations; used primarily in systemState.php include */
try {
    $dbr = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host);
} catch (Exception $e) {
    $returnData['error'] = $e->getMessage();
    writeLogEntry($e->getMessage(), true);
    exit;
}


// if the auth constructor results in an error, we want to immediately exit and report said error
if ($myAuth->returnData['error'] !== false) {
    $returnData['error'] = $myAuth->returnData['error'];
    exit;
}

# ------------------------------------------- #
# Inclusion of permission authenticator class #
# ------------------------------------------- #
$permAuth = new permAuth($action, $data, $myAuth);

# ---------------------------------------- #
# Action permission authentication routine #
# ---------------------------------------- #
$letMePass = $permAuth->permCheck($data);
if ($letMePass === true) {
    // preset the returnData var with anything the authenticator may have alraedy loaded in prior to sending to action
    $returnData = $permAuth->returnData;
    $action($data, $db, $returnData);
} else {
    // forward on the fail message from the auth class
    $returnData = $permAuth->returnData;
}

/*
##########################################################################################
##########################################################################################
********************************** MAIN ACTIONS SECTION *********************************
##########################################################################################
##########################################################################################
*/


/*
##########################################################################################
SNAPSHOT RESTORE ROUTINE - RESTORES DATABASE STATE FROM SELECTED ARCHIVE
##########################################################################################
*/

function getFile($data, DbOperationClass &$db, &$returnData)
{
    checkParams($data, ['fname', 'type']);
    global $myAuth;
    include_once('dlActions.php');

    $returnData['skipJson'] = true;
}

function checkActive($data, DbOperationClass &$db, &$returnData)
{
    global $dbr;
    checkActiveStates($data, $dbr, $returnData);
}

function restoreSnapshot($data, DbOperationClass &$db, &$returnData)
{
    checkParams($data, ['restoreFileName']);
    $rFileName = $data['restoreFileName'];

    global $settings, $dbr;
    $realDbVer = $settings['database_version'];

    $zipObj = new ZipArchive();
    $zipObj->open(BKPROOT . $rFileName);
    $zRes = $zipObj->extractTo(BKPROOT, "db_ver.txt");

    if (!$zRes) {
        $returnData['error'] = "Database version file not found!";
        writeLogEntry("Database version file not found!", true);
        exit;
    }

    $fileDbVer = file_get_contents(BKPROOT . "db_ver.txt");

    unlink(BKPROOT . "db_ver.txt");

    if ($realDbVer !== $fileDbVer) {
        $returnData['error'] = "Cannot restore snapshot which has an older database version than current system.";
        writeLogEntry("Cannot restore snapshot which has an older database version than current system.", true);
        exit;
    }

    # -------------------------------- #
    # kick all front and backend users #
    # -------------------------------- #

    /*
    NN NOTE:
    Sessions table will be backed up, the archive file
    restored, then session table will be restored from
    the pre-restore state.

    The restored version of the sessions table will
    only contain the active superadmin account used
    to run the restoration action.
     */

    // activate maintenance mode
    set_mmode("all", 1, $dbr);

    // remove all backend sessions except the sid of the one launching the command (leave frontend out of this routine to allow for graceful session terminations)
    rem_be_sessions($dbr);


    // TODO:@Ricky PLACEHOLDER FOR FRONTEND GRACEFUL KICK ROUTINE; consider adding a function to editor/inc/php/systemState.php for reusability


    // backup pre-restore sessions (only will restore active operator session)

    $preSesh = bkpSessions($dbr);

    # ----------------------------------------- #
    # Passed all checks - start restore process #
    # ----------------------------------------- #

    // restore selected database archive file

    try {
        $returnData['restoreResult'] = $db->restoreTables($rFileName);
    } catch (Exception $e) {
        $returnData['error'] = $e->getMessage();
        writeLogEntry($e->getMessage(), true);

        // deactivate maintenance mode in case of operation failure
        set_mmode("all", 0, $dbr);

        exit;
    }

    // restore saved sessions from pre backup
    resSessions($preSesh, $dbr);

    // remove all /media files prior to restore

    if (is_dir("../media")) {
        function rrDir($path)
        {

            $objects = array_diff(scandir($path), ["..", "."]);
            foreach ($objects as $obj) {
                is_dir($path . "/" . $obj) ? rrDir($path . "/" . $obj) : unlink($path . "/" . $obj);
            }
            rmdir($path);
        }
        rrDir("../media");

        // restore /media files from archive

        mkdir("tmp");
        $zipObj->extractTo("tmp/");
        if (file_exists("tmp/media")) rename("tmp/media", "../media");
        rrDir("tmp");
    }

    // deactivate maintenance mode
    set_mmode("all", 0, $dbr);

    writeLogEntry("Successfully restored snapshot: {$rFileName}");
}

/*
##########################################################################################
ARCHIVE DELETION ROUTINE - REMOVES ZIP FILE BASED ON $DATA['DELFILENAME'] VALUE
##########################################################################################
*/

function deleteBackup($data, DbOperationClass &$db, &$returnData)
{
    checkParams($data, array('delFileName'));
    $delFileName = $data['delFileName'];

    try {
        $returnData['deleteResult'] = FileOperationClass::delArchive($delFileName);
    } catch (Exception $e) {
        $returnData['error'] = $e->getMessage();
        writeLogEntry($e->getMessage(), true);
        exit;
    }

    writeLogEntry("Successfully deleted archive: {$delFileName}");
}

/*
##########################################################################################
ARCHIVE FETCH LIST ROUTINE - FETCHES *.ZIP FILES IN DOCUMENT ROOT
##########################################################################################
*/

function fetchBackups($data, DbOperationClass &$db, &$returnData)
{
    try {
        $archiveList = FileOperationClass::getArchiveList();
    } catch (Exception $e) {
        $returnData['error'] = $e->getMessage();
        writeLogEntry($e->getMessage(), true);
        exit;
    }

    // main file list/property array to be picked up as res.data
    $returnData['data'] = $archiveList;

    // create two count objects for file type counts
    // $returnData['instCount'] = $archiveList['installerCount'];
    $returnData['snapCount'] = $archiveList['snapshotCount'];
    $returnData['fullCount'] = $archiveList['fullbkpCount'];

    // remove count info from main data return to keep return file list pure (issues in backup.js when trying to iterate array otherwise)
    // unset($returnData['data']['installerCount']);
    unset($returnData['data']['snapshotCount']);
    unset($returnData['data']['fullbkpCount']);

    // return admin levels for UI toggling
    global $myAuth;
    $returnData['isAdmin'] = $myAuth->checkAdmin();
    $returnData['isAE'] = $myAuth->checkElevatedAdmin();
}

/*
##########################################################################################
ARCHIVE CREATION ROUTINE - CALLS DB AND FILE BACKUP HELPERS
##########################################################################################
*/

function backupBegin($data, DbOperationClass &$db, &$returnData)
{
    global $dbr;

    checkParams($data, ['type']);
    $type = $data['type'];
    $returnData['type'] = $type;

    if ($type === "installer") {
        $returnData['error'] = "This backup type has been disabled.";
        return;
    }

    $zipArchive = new FileOperationClass($type);

    // activate maintenance mode
    set_mmode("all", 1, $dbr);

    /* call db backup helper sub */
    dbBackup($db, $returnData);

    /* call file backup helper sub */
    $returnData['createResult'] = fileBackup($zipArchive, $returnData);

    /* if any files were unable to be added to archive, list them in fileErrList element in returnData */
    $returnData['fileErrList'] = $zipArchive->fileErrList;

    // deactivate maintenance mode
    set_mmode("all", 0, $dbr);
}

/*
########################
HELPER FUNCTIONS SECTION
########################
*/

# -------------- #
# Logfile writer #
# -------------- #

function writeLogEntry(string $entry, bool $errLog = false)
{
    // chdir(BKPROOT);
    $logfileName = $errLog ? 'backup_errors.log' : 'backup.log';
    $timeStamp = date('[Y-m-d H:i:s]') . ": ";
    file_put_contents(DOCROOT . 'logs/' . $logfileName, $timeStamp . strip_tags($entry) . "\n", FILE_APPEND);
}

# ------------------------------------ #
# Database backup - object method call #
# ------------------------------------ #

function dbBackup(DbOperationClass &$db, &$returnData)
{
    /* Try to execute DB export to .sql file routine. Do not continue if this operation fails. */
    try {
        $db->backupTables();
    } catch (Exception $e) {
        $returnData['error'] = $e->getMessage();
        writeLogEntry($e->getMessage(), true);
        exit;
    };
}

/*
##########################################################################################
File backup - object method call
##########################################################################################
*/


function fileBackup(&$zipArchive, &$returnData)
{
    try {
        $zipArchive->ZipUp(BKPROOT, $zipArchive->zipFileLoc);
    } catch (Exception $e) {
        $returnData['error'] = $e->getMessage();
        writeLogEntry($e->getMessage(), true);
        exit;
    };

    writeLogEntry('Successfully created archive: ' . $zipArchive->lastFileCreated);
    return $zipArchive->lastFileCreated;
}

//checks if mandatory data is present
function checkParams(&$data, $params)
{
    global $returnData;
    if (!$params || count($params) == 0) {
        return;
    }
    foreach ($params as $key) {
        if (!isset($data[$key])) {
            $returnData['error'] = "Error: missing parameter '$key'!";
            die();
        }
    }
}

// this will always be called when the script ends even if a fatal error occurred
// it encodes the $returnData to JSON and it adds an error message if a fatal PHP error occurred
// this error message is registered under the 'fatalError' key and includes the file name of the PHP script and the line number of the error
// all other errors (e.g. database) were registere under the 'error' key
function outputJSON()
{
    global $returnData, $action;
    if (!isset($returnData['action'])) $returnData['action'] = $action;
    $error = error_get_last();

    // updated username
    global $myAuth;
    $returnData['loggedInName'] = $myAuth->username;

    if (!empty($error)) {
        $documentRoot = filter_input(INPUT_SERVER, "DOCUMENT_ROOT");
        $file = str_replace($documentRoot, '', $error['file']);
        $returnData['fatalError'] = "<p>Fatal error [type {$error['type']}] on line {$error['line']} of<br><code class='tinyCode'>$file</code></p>
<p>{$error['message']}</p>";
    }

    header('Cache-Control: no-cache, must-revalidate');
    header('Content-type: application/json; charset=UTF-8');
    echo json_encode($returnData);
}
