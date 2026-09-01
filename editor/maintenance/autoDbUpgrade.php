<?php
// standard page inits
require_once __DIR__ . '/../../inc/php/initSettings.php';
register_shutdown_function('outputJSON');
$returnData = array();
$returnData['error'] = false; //if there is an error, this will contain a string with the error message
$returnData['result'] = [];

global $autoDbLogFile, $config, $app;
$autoDbLogFile = __DIR__ . "/../../logs/autoDbUpgrade.log";

global $app;

if (!isset($app)) {
	$app = \Oasys\OasysApp::getInstance();
}

$dbCreds = $app->getDbConfig();

// Check if any of the properties are empty
if (empty($dbCreds->user) || empty($dbCreds->password) || empty($dbCreds->db) || empty($dbCreds->host)) {
	global $autoDbLogFile;
	file_put_contents($autoDbLogFile, "Error: One or more database credentials are empty or invalid.\n", FILE_APPEND);
	$returnData['error'] = "Invalid session.";
	return;
}

doTheDbUpgrade($dbCreds->user, $dbCreds->password, $dbCreds->db, $dbCreds->host);

function doTheDbUpgrade($mdbUser, $mdbPass, $mdbDb, $mdbHost)
{
	global $config, $autoDbLogFile, $returnData;

	$dbCurVer = $config->settings['database_version'];

	$webRoot = dirname(__DIR__, 2);
	$dbDir = $webRoot . '/database';

	// Get all patch directories and sort them
	$patchDirs = array_filter(scandir($dbDir), function ($item) use ($dbDir) {
		return is_dir($dbDir . '/' . $item) && preg_match('/^v\d+(\.\d+)*$/', $item);
	});
	sort($patchDirs, SORT_NATURAL);
	$latestPatchDir = end($patchDirs);

	// Check for rollup directories
	$rollupDirs = array_filter(scandir($dbDir), function ($item) use ($dbDir) {
		return is_dir($dbDir . '/' . $item) && preg_match('/^rollup.*_v(\d+(\.\d+)*)$/', $item);
	});
	sort($rollupDirs, SORT_NATURAL);
	$latestRollupDir = end($rollupDirs);

	// Compare current database version with the latest rollup directory
	if ($latestRollupDir) {
		$rollupVersion = substr(strrchr($latestRollupDir, '_'), 1); // Extract version from the part after the last '_' in 'rollup_..._v###'
		if (version_compare($dbCurVer, $rollupVersion, '<')) {
			$rollupSqlFile = $dbDir . '/' . $latestRollupDir . '/patch.sql';

			if (!file_exists($rollupSqlFile)) {
				file_put_contents($autoDbLogFile, "[" . getCurrentDateTime() . "] Error: Rollup SQL patch file not found for version $rollupVersion at $rollupSqlFile\n", FILE_APPEND);
			} else {
				// Execute the rollup SQL file
				$command = sprintf(
					"mariadb -N -s -u%s -p%s %s -h%s < %s 2>&1",
					escapeshellarg($mdbUser),
					escapeshellarg($mdbPass),
					escapeshellarg($mdbDb),
					escapeshellarg($mdbHost),
					escapeshellarg($rollupSqlFile)
				);

				exec($command, $output, $returnVar);
				if ($returnVar !== 0) {
					file_put_contents($autoDbLogFile, "[" . getCurrentDateTime() . "] Error executing rollup SQL patch for version $rollupVersion. Command: $command\nOutput: " . implode("\n", $output) . "\n", FILE_APPEND);
					array_push($returnData['result'], "Failed rollup SQL patch $rollupVersion. Aborting update sequence.");
				} else {
					file_put_contents($autoDbLogFile, "[" . getCurrentDateTime() . "] Successfully applied rollup SQL patch for version $rollupVersion.\n", FILE_APPEND);
					array_push($returnData['result'], "Applied rollup SQL patch $rollupVersion");
					// Exit gracefully after applying rollup patch
					return;
				}
			}
		}
	}

	// Compare current database version with the latest patch directory
	if ($dbCurVer !== $latestPatchDir) {
		if (version_compare($dbCurVer, $latestPatchDir, '>')) {
			file_put_contents($autoDbLogFile, "[" . getCurrentDateTime() . "] Error: Current database version ($dbCurVer) is newer than the latest patch directory ($latestPatchDir). No action taken.\n", FILE_APPEND);
		} else {
			file_put_contents($autoDbLogFile, "[" . getCurrentDateTime() . "] Database upgrade needed. Current version: $dbCurVer, Latest version: $latestPatchDir\n", FILE_APPEND);

			// Loop through each patch directory and apply patches if needed
			foreach ($patchDirs as $patchDir) {
				if (version_compare($patchDir, $dbCurVer, '>')) {
					$patchSqlFile = $dbDir . '/' . $patchDir . '/patch.sql';

					if (!file_exists($patchSqlFile)) {
						file_put_contents($autoDbLogFile, "[" . getCurrentDateTime() . "] Error: SQL patch file not found for version $patchDir at $patchSqlFile\n", FILE_APPEND);
						break;
					}

					// Execute the SQL file
					$command = sprintf(
						"mariadb -N -s -u%s -p%s %s -h%s < %s 2>&1",
						escapeshellarg($mdbUser),
						escapeshellarg($mdbPass),
						escapeshellarg($mdbDb),
						escapeshellarg($mdbHost),
						escapeshellarg($patchSqlFile)
					);

					exec($command, $output, $returnVar);
					if ($returnVar !== 0) {
						file_put_contents($autoDbLogFile, "[" . getCurrentDateTime() . "] Error executing SQL patch for version $patchDir. Command: $command\nOutput: " . implode("\n", $output) . "\n", FILE_APPEND);
						array_push($returnData['result'], "Failed SQL patch $patchDir. Aborting update sequence.");
						break;
					} else {
						file_put_contents($autoDbLogFile, "[" . getCurrentDateTime() . "] Successfully applied SQL patch for version $patchDir.\n", FILE_APPEND);
						array_push($returnData['result'], "Applied SQL patch $patchDir");
					}
				}
			}
		}
	}
}

/**
 * Get the current date and time in "Y-m-d H:i:s" format (helper function for logging)
 *
 * @return string Current date and time in "Y-m-d H:i:s" format
 * 
 */
function getCurrentDateTime()
{
	return date("Y-m-d H:i:s");
}

function outputJSON()
{
	global $returnData, $action;

	// updated username
	if (!isset($returnData['action'])) {
		$returnData['action'] = $action;
	}

	$error = error_get_last();
	$fatalTypes = E_ERROR | E_PARSE | E_CORE_ERROR | E_COMPILE_ERROR | E_USER_ERROR;
	$hasFatalError = !empty($error) && (($error['type'] & $fatalTypes) !== 0);

	header('Cache-Control: no-cache, must-revalidate');
	header('Content-type: application/json; charset=UTF-8');
	echo json_encode($returnData);
}
