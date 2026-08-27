<?php

//the JSON output will happen, even if a fatal error prevents the script from finishing
register_shutdown_function('outputJSON');

require_once __DIR__ . "/inc/php/initBackend.php";
require_once(__DIR__ . "/inc/php/export.class.php"); // call class used for db and file operations

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

/* $dbOps is for database backup/restore operations */
try {
	//get db credentials from OasysApp
	$dbOps = new DbOperationClass();
} catch (Exception $e) {
	$returnData['error'] = $e->getMessage();
	writeLogEntry($e->getMessage(), true);
	exit;
}

/* $db is for standard rixPDO operations; it already exists in global scope */

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
	if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
	$action($data, $dbOps, $db, $returnData);
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

function getFile($data, DbOperationClass &$dbOps, rixPDO &$db, &$returnData): void
{
	checkParams($data, ['fname', 'type']);
	global $myAuth;
	include_once('dlActions.php');

	$returnData['skipJson'] = true;
}

/**
 * @throws Exception
 */
function checkActive($data, DbOperationClass &$dbOps, rixPDO &$db, &$returnData): void
{
	checkActiveStates($data, $db, $returnData);
}

/**
 * Recursively removes a directory and its contents, including the root path itself.
 *
 * @param string $path The path to the directory to remove.
 * @param bool $remRoot Whether to remove the root directory itself.
 * 
 * @return void
 * 
 */
function rrDir(string $path, bool $remRoot = true): void
{
	if (is_link($path)) {
		@unlink($path);
		return;
	}
	if (!is_dir($path)) {
		return;
	}

	$objects = array_diff(scandir($path), ["..", "."]);
	foreach ($objects as $obj) {
		$objPath = $path . DIRECTORY_SEPARATOR . $obj;
		(is_dir($objPath) && !is_link($objPath)) ? rrDir($objPath) : @unlink($objPath);
	}
	if ($remRoot === true) rmdir($path);
}

function copyDir($source, $destination): void
{
	if (!is_dir($source)) {
		return;
	}

	if (!is_dir($destination) && !mkdir($destination, 0777, true) && !is_dir($destination)) {
		throw new RuntimeException("Could not create directory: {$destination}");
	}

	$objects = array_diff(scandir($source), ["..", "."]);
	foreach ($objects as $obj) {
		$sourcePath = $source . DIRECTORY_SEPARATOR . $obj;
		$destinationPath = $destination . DIRECTORY_SEPARATOR . $obj;

		if (is_link($sourcePath)) {
			throw new RuntimeException("Symbolic links are not permitted in restored content.");
		} elseif (is_dir($sourcePath)) {
			copyDir($sourcePath, $destinationPath);
		} else {
			if (!copy($sourcePath, $destinationPath)) {
				throw new RuntimeException("Could not copy file: {$sourcePath}");
			}
		}
	}
}

function backupOperationLock()
{
	$instance = substr(hash('sha256', realpath(__DIR__ . '/..') ?: __DIR__), 0, 16);
	$handle = fopen(rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . "oasys-backup-{$instance}.lock", 'c');
	if ($handle === false || !flock($handle, LOCK_EX | LOCK_NB)) {
		if (is_resource($handle)) fclose($handle);
		throw new RuntimeException('Another backup or restore operation is already running.');
	}
	return $handle;
}

function releaseBackupOperationLock($handle): void
{
	if (is_resource($handle)) {
		flock($handle, LOCK_UN);
		fclose($handle);
	}
}

function validateAndExtractSnapshot(string $fileName): array
{
	if (basename($fileName) !== $fileName || preg_match('/^oasys_snapshot_[A-Za-z0-9_.-]+\.zip$/', $fileName) !== 1) throw new RuntimeException('Invalid snapshot filename.');
	$backupRoot = realpath(BKPROOT);
	$archivePath = realpath(BKPROOT . $fileName);
	if ($backupRoot === false || $archivePath === false || !str_starts_with($archivePath, rtrim($backupRoot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR)) throw new RuntimeException('Snapshot cannot be read from the backup directory.');
	$zip = new ZipArchive();
	if ($zip->open($archivePath) !== true) throw new RuntimeException('Snapshot archive is invalid or unreadable.');
	$entries = [];
	$seenEntries = [];
	$totalSize = 0;
	$hasSql = false;
	$hasRoots = ['media' => false, 'customContent' => false];
	for ($i = 0; $i < $zip->numFiles; $i++) {
		$name = (string)$zip->getNameIndex($i, ZipArchive::FL_UNCHANGED);
		$normalized = str_replace('\\', '/', $name);
		if ($normalized === '' || str_starts_with($normalized, '/') || preg_match('#(^|/)\.\.(/|$)#', $normalized)) {
			$zip->close();
			throw new RuntimeException('Snapshot contains an unsafe path.');
		}
		if (isset($seenEntries[$normalized])) {
			$zip->close();
			throw new RuntimeException('Snapshot contains duplicate entries.');
		}
		$seenEntries[$normalized] = true;
		$entryStat = $zip->statIndex($i);
		$totalSize += (int)($entryStat['size'] ?? 0);
		$isSql = preg_match('/^oasys-backup-[A-Za-z0-9_.-]+\.sql$/', $normalized) === 1;
		$allowed = $isSql || in_array($normalized, ['db_ver.txt', 'oasys_ver.txt', 'media', 'media/', 'customContent', 'customContent/'], true) || str_starts_with($normalized, 'media/') || str_starts_with($normalized, 'customContent/');
		if (!$allowed) {
			$zip->close();
			throw new RuntimeException('Snapshot contains an unexpected entry: ' . $normalized);
		}
		if ($isSql) {
			if ($hasSql) {
				$zip->close();
				throw new RuntimeException('Snapshot contains multiple database dumps.');
			}
			$hasSql = true;
		}
		foreach (array_keys($hasRoots) as $root) if ($normalized === $root || $normalized === $root . '/' || str_starts_with($normalized, $root . '/')) $hasRoots[$root] = true;
		if ($zip->getExternalAttributesIndex($i, $opsys, $attributes) && ((($attributes >> 16) & 0170000) === 0120000)) {
			$zip->close();
			throw new RuntimeException('Snapshot contains a symbolic link.');
		}
		$entries[] = $name;
	}
	$availableSpace = @disk_free_space(sys_get_temp_dir());
	if ($availableSpace !== false && $totalSize > max(0, $availableSpace - 268435456)) {
		$zip->close();
		throw new RuntimeException('Snapshot is too large for the available restore staging space.');
	}
	if (!$hasSql || in_array(false, $hasRoots, true)) {
		$zip->close();
		throw new RuntimeException('Snapshot must contain one database dump plus media and customContent.');
	}
	$dbVersion = $zip->getFromName('db_ver.txt');
	if ($dbVersion === false) {
		$zip->close();
		throw new RuntimeException('Snapshot database-version file is missing.');
	}
	$tempRoot = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'oasys-restore-' . BACKUP_OPERATION_ID;
	if (is_dir($tempRoot)) rrDir($tempRoot);
	if (!mkdir($tempRoot, 0700, true) && !is_dir($tempRoot)) {
		$zip->close();
		throw new RuntimeException('Could not create restore staging directory.');
	}
	if (!$zip->extractTo($tempRoot, $entries)) {
		$zip->close();
		rrDir($tempRoot);
		throw new RuntimeException('Could not extract snapshot.');
	}
	$zip->close();
	return ['tempRoot' => $tempRoot, 'databaseVersion' => trim((string)$dbVersion)];
}

function prepareContentSwap(string $tempRoot): array
{
	$swap = [];
	try {
		foreach (['media', 'customContent'] as $directory) {
			$source = $tempRoot . DIRECTORY_SEPARATOR . $directory;
			if (!is_dir($source)) throw new RuntimeException("Restored {$directory} directory is missing.");
			$live = rtrim(DOCROOT, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $directory;
			if (!is_dir($live) && !mkdir($live, 0777, true) && !is_dir($live)) throw new RuntimeException("Could not create target directory: {$directory}");
			$stage = $live . DIRECTORY_SEPARATOR . '.restore-' . BACKUP_OPERATION_ID;
			$old = $live . DIRECTORY_SEPARATOR . '.previous-' . BACKUP_OPERATION_ID;
			if (file_exists($stage) || file_exists($old)) throw new RuntimeException("Restore staging path already exists for {$directory}.");
			copyDir($source, $stage);
			$swap[] = ['live' => $live, 'stage' => $stage, 'old' => $old, 'hadLive' => true, 'activated' => false];
		}
	} catch (Throwable $e) {
		foreach ($swap as $entry) if (is_dir($entry['stage'])) rrDir($entry['stage']);
		throw $e;
	}
	return $swap;
}

function commitContentSwap(array &$swap): void
{
	try {
		foreach ($swap as &$entry) {
			if (!is_dir($entry['old']) && !mkdir($entry['old'], 0777, true) && !is_dir($entry['old'])) throw new RuntimeException('Could not create old directory.');

			// Move current live contents to old
			$objects = array_diff(scandir($entry['live']), ["..", ".", basename($entry['stage']), basename($entry['old'])]);
			foreach ($objects as $obj) {
				if (!rename($entry['live'] . DIRECTORY_SEPARATOR . $obj, $entry['old'] . DIRECTORY_SEPARATOR . $obj)) {
					throw new RuntimeException('Could not preserve existing generated content.');
				}
			}

			// Move staged contents to live
			$objects = array_diff(scandir($entry['stage']), ["..", "."]);
			foreach ($objects as $obj) {
				if (!rename($entry['stage'] . DIRECTORY_SEPARATOR . $obj, $entry['live'] . DIRECTORY_SEPARATOR . $obj)) {
					throw new RuntimeException('Could not activate restored generated content.');
				}
			}
			$entry['activated'] = true;
		}
	} catch (Throwable $e) {
		foreach (array_reverse(array_keys($swap)) as $key) {
			$entry = &$swap[$key];
			// Move live back to stage if activated
			$objects = array_diff(scandir($entry['live']), ["..", ".", basename($entry['stage']), basename($entry['old'])]);
			foreach ($objects as $obj) @rename($entry['live'] . DIRECTORY_SEPARATOR . $obj, $entry['stage'] . DIRECTORY_SEPARATOR . $obj);
			// Move old back to live
			if (is_dir($entry['old'])) {
				$objects = array_diff(scandir($entry['old']), ["..", "."]);
				foreach ($objects as $obj) @rename($entry['old'] . DIRECTORY_SEPARATOR . $obj, $entry['live'] . DIRECTORY_SEPARATOR . $obj);
			}
		}
		throw $e;
	}
}

function cleanupContentSwap(array $swap, bool $success): void
{
	foreach ($swap as $entry) {
		if (is_dir($entry['stage'])) rrDir($entry['stage']);
		if ($success && is_dir($entry['old'])) rrDir($entry['old']);
	}
}

/**
 * Restores a database snapshot from a specified archive file.
 *
 * @param mixed $data The data containing the restore file name.
 * @param DbOperationClass $dbOps The database operations class.
 * @param rixPDO $db The database connection object.
 * @param mixed $returnData The return data array to store results and errors.

 * 
 * @return void
 * 
 */
function restoreSnapshot($data, DbOperationClass &$dbOps, rixPDO &$db, &$returnData): void
{
	global $backendState;
	checkParams($data, ['restoreFileName']);
	$rFileName = (string)$data['restoreFileName'];
	global $settings;
	$lock = null;
	$prepared = null;
	$swap = [];
	$maintenanceEnabled = false;
	$stateBackedUp = false;
	$success = false;
	try {
		$lock = backupOperationLock();
		$prepared = validateAndExtractSnapshot($rFileName);
		if ((string)$settings['database_version'] !== $prepared['databaseVersion']) throw new RuntimeException('Cannot restore a snapshot with a different database version.');
		$swap = prepareContentSwap($prepared['tempRoot']);
		set_mmode("all", 1, $db);
		$maintenanceEnabled = true;
		$backendState->nukeAllStatesExceptCurrent();
		$backendState->backupState();
		$stateBackedUp = true;
		$returnData['restoreResult'] = $dbOps->restoreTables($rFileName);
		$backendState->restoreState();
		$stateBackedUp = false;
		commitContentSwap($swap);
		$success = true;
		writeLogEntry("Successfully restored snapshot: {$rFileName}");
	} catch (Throwable $e) {
		if ($stateBackedUp) {
			try {
				$backendState->restoreState();
			} catch (Throwable $ignored) {
			}
		}
		$returnData['error'] = $e->getMessage();
		writeLogEntry($e->getMessage(), true);
	} finally {
		cleanupContentSwap($swap, $success);
		if ($prepared && is_dir($prepared['tempRoot'])) rrDir($prepared['tempRoot']);
		if (is_dir(oasysBackupTempDir())) rrDir(oasysBackupTempDir());
		if ($maintenanceEnabled) set_mmode("all", 0, $db);
		releaseBackupOperationLock($lock);
	}
}

/*
	##########################################################################################
	ARCHIVE DELETION ROUTINE - REMOVES ZIP FILE BASED ON $DATA['DELFILENAME'] VALUE
	##########################################################################################
	*/

function deleteBackup($data, DbOperationClass &$dbOps, rixPDO &$db, &$returnData): void
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

function fetchBackups($data, DbOperationClass &$dbOps, rixPDO &$db, &$returnData): void
{
	/* as this is the default action on page load, we check for backup prereqs for full functionality */
	// -------------------------------------------------------------------------------------------------

	$returnData['bkprereqfail'] = [];

	// Check the process API used by the streaming database dump.
	if (!function_exists('proc_open') || !is_callable('proc_open')) {
		array_push($returnData['bkprereqfail'], "The PHP 'proc_open' function is disabled or unavailable on this server.");
	} else {
		$dumpExists = false;
		foreach (['mariadb-dump', 'mysqldump'] as $candidate) {
			$probe = @proc_open([$candidate, '--version'], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $probePipes);
			if (!is_resource($probe)) continue;
			fclose($probePipes[0]);
			stream_get_contents($probePipes[1]);
			stream_get_contents($probePipes[2]);
			fclose($probePipes[1]);
			fclose($probePipes[2]);
			if (proc_close($probe) === 0) {
				$dumpExists = true;
				break;
			}
		}
		if (!$dumpExists) {
			array_push($returnData['bkprereqfail'], "Neither the <code style='font-weight: bold'>mysqldump</code> nor <code style='font-weight: bold'>mariadb-dump</code> binaries were found on the server.");
		}
	}

	// Check if the backup / restore directory is writable.
	// We no longer require the application root itself to be writable because backup temp files are stored in the system temp directory.
	$appRoot = realpath(__DIR__ . '/..');
	$bkpDir = $appRoot . DIRECTORY_SEPARATOR . 'backupRestore' . DIRECTORY_SEPARATOR;
	if (!is_dir($bkpDir) && !mkdir($bkpDir, 0777, true) && !is_dir($bkpDir)) {
		array_push($returnData['bkprereqfail'], "The backup processing and storage directory could not be created.");
	} elseif (!is_writable($bkpDir)) {
		array_push($returnData['bkprereqfail'], "The backup processing and storage directory is not writable by the web application service.");
	}

	// check for stray .sql files leftover in the backup temp directory that require removal
	$tempBackupDir = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'oasys-backup';
	if (!empty(glob($tempBackupDir . DIRECTORY_SEPARATOR . '*.sql'))) {
		array_push($returnData['bkprereqfail'], "One or more backup SQL files found in the temporary backup directory. Archive or remove any .sql files from this location.");
	}

	// -------------------------------------------------------------------------------------------------

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

function backupBegin($data, DbOperationClass &$dbOps, rixPDO &$db, &$returnData): void
{
	checkParams($data, ['type']);
	$type = (string)$data['type'];
	$returnData['type'] = $type;

	if (!in_array($type, ['snapshot', 'fullBackup'], true)) {
		$returnData['error'] = "Invalid or disabled backup type.";
		return;
	}
	$lock = null;
	$maintenanceEnabled = false;
	try {
		$lock = backupOperationLock();
		$zipArchive = new FileOperationClass($type);
		set_mmode("all", 1, $db);
		$maintenanceEnabled = true;
		dbBackup($dbOps, $returnData);
		$returnData['createResult'] = fileBackup($zipArchive, $returnData);
		$returnData['fileErrList'] = $zipArchive->fileErrList;
	} catch (Throwable $e) {
		if (isset($zipArchive) && is_file($zipArchive->zipFileLoc)) @unlink($zipArchive->zipFileLoc);
		$returnData['error'] = $e->getMessage();
		writeLogEntry($e->getMessage(), true);
	} finally {
		if ($maintenanceEnabled) set_mmode("all", 0, $db);
		if (is_dir(oasysBackupTempDir())) rrDir(oasysBackupTempDir());
		releaseBackupOperationLock($lock);
	}
}

/*
	########################
	HELPER FUNCTIONS SECTION
	########################
	*/

# -------------- #
# Logfile writer #
# -------------- #

function writeLogEntry(string $entry, bool $errLog = false): void
{
	// chdir(BKPROOT);
	$logfileName = $errLog ? 'backup_errors.log' : 'backup.log';
	$timeStamp = date('[Y-m-d H:i:s]') . ": ";
	file_put_contents(DOCROOT . 'logs/' . $logfileName, $timeStamp . strip_tags($entry) . "\n", FILE_APPEND);
}

# ------------------------------------ #
# Database backup - object method call #
# ------------------------------------ #

function dbBackup(DbOperationClass &$dbOps, &$returnData): void
{
	$dbOps->backupTables();
}

/*
	##########################################################################################
	File backup - object method call
	##########################################################################################
	*/


function fileBackup(&$zipArchive, &$returnData)
{
	$zipArchive->ZipUp(BKPROOT, $zipArchive->zipFileLoc);

	writeLogEntry('Successfully created archive: ' . $zipArchive->lastFileCreated);
	return $zipArchive->lastFileCreated;
}

//checks if mandatory data is present
function checkParams(&$data, $params): void
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
function outputJSON(): void
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
		$returnData['fatalError'] = "<p>Fatal error [type {$error['type']}] on line {$error['line']} of<br><code class='tinyCode'>$file</code></p><p>{$error['message']}</p>";
	}

	header('Cache-Control: no-cache, must-revalidate');
	header('Content-type: application/json; charset=UTF-8');
	echo json_encode($returnData);
}
