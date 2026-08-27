<?Php

/*
		TITLE:      UPGRADER ACTIONS FOR UPGRADER CLIENT SIDE MODULE

		AUTHOR:     NILANJAN NAG

		DESC:       Client side code which handles sending and receiving requests
					to Oasys Upgrader Server. Primary functions are processing and sending
					authentication credentials, processing and receiving applicable
					packages for the particular user based on login account, handling
					of downloads, and processing of authentication state (session cookies, etc)
	 */


//the JSON output will happen, even if a fatal error prevents the script from finishing
register_shutdown_function('outputJSON');

//all data that is returned by this script will be put into $returnData array which is sent back in JSON encoded form
$returnData = array();
$returnData['error'] = false; //if there is an error, this will contain a string with the error message

# ----------------------- #
# Authentication Includes #
# ----------------------- #
$pageName = "upgrader"; // set to the related 'editor button' string name (e.g., 'items')
$isSubMod = false; // set true if a module page in a subdirectory
$isActionFile = true; // set true if an "xxxActions.php" file
require_once __DIR__ . "/inc/php/initBackend.php";
require_once 'inc/php/authCommonFunctions.php'; // required for authentication inclusion
require_once "inc/php/systemState.php"; // required for front/backend active login checking

// we have to pull the rootURL settings to determine proper cookie setting path later on
$cookiePath = $settings['JSrootURL'] . "editor/";

// client session cookie timeout in minutes
// FYI: Server session timeout is 1 hour whereas the default here is 24 hours so the proper return message can be returned to user from the client side
$seshMinTimeout = 86400;

// global document root directory
// define("DOCROOT", realpath("../") . DIRECTORY_SEPARATOR);

// global backup root dir for backup operation and backup class
define("BKPROOT", realpath("../") . DIRECTORY_SEPARATOR . "backupRestore" . DIRECTORY_SEPARATOR);

define("INSTDBROOT", DOCROOT . DIRECTORY_SEPARATOR . "pkg_installer" . DIRECTORY_SEPARATOR . "install.db");

// local package download dir
if (realpath("../pkg_installer/downloads/") !== false) {
	define("PKGDIR", realpath("../pkg_installer/downloads/") . DIRECTORY_SEPARATOR);
} else {
	$returnData['error'] = "Package installer download directory not found! Exiting.";
	exit;
}

//action is a string that defines what action to perform
$action = filter_input(INPUT_POST, 'action');
if (!$action) {
	$action = "";
}

$returnData = [];
$returnData['action'] = $action;
$returnData['error'] = false;


$data = filter_input(INPUT_POST, 'data');
if ($data) {
	$data = json_decode($data ?? '', true);
}
if (!$data) {
	$data = array();
}

require_once 'inc/php/database.php'; //contains the database connection credentials

if (!isset($app)) {
	$app = \Oasys\OasysApp::getInstance();
}

$db = $app->getDatabaseInstance();

# ------------------------------------------- #
# Inclusion of permission authenticator class #
# ------------------------------------------- #
$permAuth = new permAuth($action, $data, $myAuth);

# ---------------------------------------- #
# Action permission authentication routine #
# ---------------------------------------- #
if ($action === 'requestPackageList') {
	if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
	$action($data, $db, $returnData);
} else {
	$letMePass = $permAuth->permCheck($data);
	if ($letMePass === true) {
		// preset the returnData var with anything the authenticator may have alraedy loaded in prior to sending to action
		$returnData = $permAuth->returnData;
		if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
		$action($data, $db, $returnData);
	} else {
		// forward on the fail message from the auth class
		$returnData = $permAuth->returnData;
	}
}

/*
	##############
	MAIN FUNCTIONS
	##############
	 */

function ofChk($data, rixPDO $db, &$returnData)
{
	$olDir = PKGDIR . ".." . DIRECTORY_SEPARATOR . "offlinePkg" . DIRECTORY_SEPARATOR;
	$olfn = "";

	$offlinePkgFiles = [];
	if (is_dir($olDir)) {
		$offlinePkgFiles = array_values(array_filter(glob($olDir . "oasys_*"), 'is_file'));
	}

	$hasOL = count($offlinePkgFiles) === 1;

	if ($hasOL) {
		$olfn = basename($offlinePkgFiles[0]);
	}

	$returnData['isOffline'] = $hasOL;
	$returnData['filename'] = $olfn;
}

function getFileDlInstall($data, rixPDO $db, &$returnData)
{
	checkParams($data, ['fileDlName', "isOffline"]);
	extract($data);

	global $settings, $myAuth, $backendState;

	// if ($myAuth->checkSA() === false) {
	//     $returnData['error'] = "Not authorized to continue.";
	//     return;
	// }

	$isOffline = filter_var($isOffline, FILTER_VALIDATE_BOOLEAN);
	$returnData['isOffline'] = $isOffline;

	// define offline package dir, for when it's needed
	$olDir = PKGDIR . ".." . DIRECTORY_SEPARATOR . "offlinePkg" . DIRECTORY_SEPARATOR;

	// save previous maint. mode status, then enable maintenance mode
	$backendState->preUpMM = get_mmode("all", $db);
	set_mmode("all", 1, $db);

	// nuke backend sessions, frontend sessions should not be active, and have been checked for already at this point
	$backendState->nukeAllStatesExceptCurrent();

	// nuke dl/temp dir regardless of if file dl is successful or not
	clearDlTemp(null, $db, $returnData);

	// start download of file and checking stuff
	if ($isOffline) {
		$offlineSource = $olDir . basename($fileDlName);
		$offlineTarget = PKGDIR . basename($fileDlName);
		if (!is_file($offlineSource) || !copy($offlineSource, $offlineTarget)) {
			$returnData['error'] = 'Unable to stage the offline upgrade package.';
			return;
		}
	} else {
		getFileDl($data, $db, $returnData);
		if ($returnData['error'] !== false) return;
	}

	$foundInst = false;
	$fullFileName = PKGDIR . basename($fileDlName);
	$shortFileName = basename($fileDlName);

	$zObj = new ZipArchive;
	$res = $zObj->open($fullFileName);

	if ($res === true && $zObj->getFromName('inst_start.php') !== false) {
		$foundInst = true;
	}

	if ($res === true) $zObj->close();

	/*
		###################################################
		AUTO-INSTALLER CHECK AND PACKAGE EXTRACTION ROUTINE
		###################################################
		*/

	# --------------------------------- #
	# Check for auto-installer presence #
	# --------------------------------- #

	if (!$foundInst) {
		$returnData['error'] = "Could not find auto-installer script in package! Please contact Oasys technical support to notify them of this corrupt package: [<strong>{$shortFileName}</strong>].";
		unlink($fullFileName);
		writeLogEntry("No autoinstaller found for: $shortFileName");
		writeInstDbEntry($shortFileName, "AUTOINSTALLER PRESENT", 1, $_COOKIE['UNAME']);
	} else {
		$randInstDir = bin2hex(random_bytes(6));
		$fullInstDir = PKGDIR . $randInstDir;

		# ------------------------------- #
		# Create directory for extraction #
		# ------------------------------- #

		if (!mkdir($fullInstDir)) {
			$returnData['error'] = "Unable to create temporary directory for archive extraction [<strong>{$fullInstDir}</strong>]. Please notify Oasys technical support.";
			writeLogEntry($returnData['error']);
			writeInstDbEntry($shortFileName, "TEMP DIR CREATION", 1, $_COOKIE['UNAME']);
			return;
		}

		$pkgInstallZip = new ZipArchive;
		if ($pkgInstallZip->open($fullFileName) !== true) {
			$returnData['error'] = "Unable to open ZIP archive [{$shortFileName}].";
			recursKill($fullInstDir);
			return;
		}

		# ------------------- #
		# ZIP file extraction #
		# ------------------- #

		if (!$pkgInstallZip->extractTo($fullInstDir)) {
			$pkgInstallZip->close();
			$returnData['error'] = "Unable to extract ZIP archive to temporary installation directory [{$fullFileName}].";
			writeLogEntry($returnData['error']);
			writeInstDbEntry($shortFileName, "PACKAGE EXTRACTION", 1, $_COOKIE['UNAME']);
			recursKill($fullInstDir);
			return;
		}

		# -------------------------------------------- #
		# Set link to auto-installer to send to client #
		# -------------------------------------------- #
		// Use a relative path for the installation link to ensure protocol and host are correctly handled by the browser, avoiding Host Header Injection risks.
		$returnData['instLink'] = $settings['JSrootURL'] . "pkg_installer/downloads/{$randInstDir}/inst_start.php";

		# ------------------- #
		# Output all log data #
		# ------------------- #

		if (isset($shortFileName)) writeLogEntry("Autoinstaller scripts found for: $shortFileName");
		if (isset($shortFileName)) writeLogEntry("Temp install dir created for: $shortFileName");
		if (isset($shortFileName)) writeLogEntry("Package archive extracted for: $shortFileName");
		if (isset($returnData['instLink'])) writeLogEntry("Sent Install Link: {$returnData['instLink']}");

		$uString = $_COOKIE['UNAME'] ?? $myAuth->username;

		writeInstDbEntry($shortFileName, "AUTOINSTALLER PRESENT", 0, $uString);
		writeInstDbEntry($shortFileName, "TEMP DIR CREATION", 0, $uString);
		writeInstDbEntry($shortFileName, "PACKAGE EXTRACTION", 0, $uString);
		writeInstDbEntry($shortFileName, "SENT INSTALL LINK", 0, $uString);

		# ------------------------------------------------------------------- #
		# Close out ZIP archive and remove offline package file if applicable #
		# ------------------------------------------------------------------- #

		$pkgInstallZip->close();
	}
}

# ----------------------------------- #
# Backup routine prior to autoinstall #
# ----------------------------------- #

function preInstallBackup($data, rixPDO $db, &$returnData)
{
	checkParams($data, ['openAfter', 'isOffline', 'bkp']);
	extract($data);

	$returnData['isOffline'] = $isOffline;

	if ($bkp === "yes") {
		$backupRoot = defined('BKPROOT') ? (string) BKPROOT : '';
		if ($backupRoot === '' || !is_dir($backupRoot)) {
			$returnData['error'] = 'Backup root directory is not available.';
			return;
		}
		// export class init to utilize the current backup API signatures
		require_once __DIR__ . '/inc/php/export.class.php';

		$dbBkpObj = new DbOperationClass();

		// backup db state
		try {
			$dbBkpObj->backupTables();
		} catch (Exception $e) {
			$returnData['error'] = $e->getMessage();
			return;
		}

		// backup file state
		$fileBkpObj = new FileOperationClass('fullBackup');
		$archivePath = $fileBkpObj->zipFileLoc;

		if (!is_string($archivePath) || $archivePath === '') {
			$returnData['error'] = 'Backup archive path was not initialized.';
			return;
		}

		// zip up file contents created from previous line
		try {
			$fileBkpObj->ZipUp($backupRoot, $archivePath);
		} catch (Exception $e) {
			$returnData['error'] = $e->getMessage();
			return;
		}

		writeLogEntry("Executed full system backup.");
	}

	// return the carried over autoinstall open link
	$returnData['instAddr'] = $openAfter;

	if ($bkp !== "yes") {
		writeLogEntry("System backup option skipped.");
	}
}

/**
 * Get the client key when it exists, otherwise, return blank
 *
 * @return string
 *
 */
function getCLkey(): ?string
{
	// get client key value if exists
	return file_exists('../cl_key.txt') ? trim(explode("\n", file_get_contents('../cl_key.txt'))[0]) : null;
}

# --------------------- #
# File download request #
# --------------------- #

function getFileDl($data, rixPDO $db, &$returnData)
{
	// check for requested file name in data input
	checkParams($data, ['fileDlName']);

	// assign args to vars
	$fileName = $data['fileDlName'];

	// setup array to send to curl func, and execute
	$dlCurl = ['r' => 'gfd', 'fileDlName' => $fileName, 'clKey' => getCLkey()];
	if (is_null($dlCurl['clKey'])) unset($dlCurl['clKey']);
	$dlRet = curlGo($dlCurl, "BINZIP");

	// if value anything but true, it's an error; handle it
	if ($dlRet !== true) {
		$dlRetJSON = json_decode($dlRet ?? '', true);
		$returnData['error'] = is_array($dlRetJSON) && isset($dlRetJSON['error'])
			? $dlRetJSON['error']
			: 'Package retrieval failed: invalid response from upgrade server.';
		return;
	} else {
		$returnData['fileDlMsg'] = "Package retrieval successful.";
		writeLogEntry("Downloaded file: $fileName");
	}

	// final session check & refresh
}

# ------------------ #
# User login request #
# ------------------ #

function requestPackageList($data, rixPDO $db, &$returnData)
{

	global $settings;
	# ------------------- #
	# curl setup and send #
	# ------------------- #

	// setup curl vars in an array to curl post to 'upgraderServer'
	$cFields = [
		'r' => 'gfl', // request = get file list
		'sVer' => getVer('short'),
		'lVer' => getVer('long'),
		'modList' => getModList(),
		'clKey' => getCLkey(),
		'alphaChannel' => $settings['alphaChannel']
	];

	if (is_null($cFields['clKey'])) unset($cFields['clKey']);

	# ----------------------------------------------------------- #
	# parse curl response and determine auth status, set auth var #
	# ----------------------------------------------------------- #

	$upgResponse = curlGo($cFields);

	// set response back to upgrader.js based on response
	if (!is_array($upgResponse)) {
		$returnData['error'] = 'Invalid response from upgrade server.';
		$returnData['fileList'] = '';
		return;
	}
	$returnData['error'] = $upgResponse['error'] ?? false;

	if (isset($upgResponse['fileList'])) {
		if (!is_array($upgResponse['fileList'])) {
			$returnData['error'] = 'Upgrade server returned an invalid package list.';
			$returnData['fileList'] = '';
			return;
		}
		$returnData['fileList'] = filterFileList($upgResponse['fileList']);
	} else {
		$returnData['fileList'] = "";
	}
}

# --------------------------------------- #
# Filter file list for installed packages #
# --------------------------------------- #

function filterFileList(array $inpArr)
{
	// check if file exists and copy from template file if not
	if (!file_exists(INSTDBROOT)) {
		writeLogEntry("Core installer database file not found -- attempting to recreate from template file.");
		if (copy(INSTDBROOT . ".template", INSTDBROOT)) {
			writeLogEntry("Recreated install.db file from installe.db.template file");
		} else {
			writeLogEntry("Failed recreation/initalization of install.db file. Check if source template file exists.");
			throw new RuntimeException("Unable to initialize installer database file. Please contact the system administrator.");
		}
	}

	$sldb = null;
	// try to connect to SQLite Installer DB
	try {
		$sldb = new PDO("sqlite:" . INSTDBROOT, '', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
	} catch (PDOException $e) {
		writeLogEntry("Unable to connect to installer database tracker.");
	}

	// if the DB is bad, do a re-copy and skip this instance of upgrader autocheck routine
	if (is_null($sldb)) {
		if (!copy(INSTDBROOT . ".template", INSTDBROOT)) {
			throw new RuntimeException('Unable to restore the installer database template.');
		}
		return [];
	}

	return $inpArr;
}

# --------------------------------- #
# Check post-install success status #
# --------------------------------- #

// alias to make upgrades compatible from 3.1.x
function chkInstStatus($data, rixPDO $db, &$returnData)
{
	checkInstStatus($data, $db, $returnData);
};

function checkInstStatus($data, rixPDO $db, &$returnData)
{
	// restore maintenance mode to its pre-upgrade state regardless of package installation success or failure
	global $backendState;
	$preFEMM = $backendState->preUpMM['frontend']['status'];
	$preBEMM = $backendState->preUpMM['backend']['status'];
	set_mmode("backend", $preBEMM, $db);
	set_mmode("frontend", $preFEMM, $db);


	checkparams($data, ['pkgName', 'isOffline']);
	$package = $data['pkgName'];
	$isOffline = $data['isOffline'];

	# ----------------- #
	# SQLite connection #
	# ----------------- #

	try {
		$sldb = new PDO("sqlite:" . INSTDBROOT, '', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
	} catch (PDOException $e) {
		writeLogEntry("Unable to connect to installer database tracker.");
		return;
	}

	$query = "SELECT `state` FROM package_status WHERE `package` = ?";
	$stmt = $sldb->prepare($query);

	$stmt->bindValue(1, $package, PDO::PARAM_STR);
	$stmt->execute();

	$res = $stmt->fetch(PDO::FETCH_ASSOC);

	if (!is_array($res) || !array_key_exists('state', $res)) {
		$returnData['error'] = 'No installation status was recorded for this package.';
		return;
	}

	$retResult = intval($res['state']);
	$returnData['instStatus'] = $retResult;
	$returnData['pkgName'] = $package;

	if (preg_match("/oasys_pkg_(.+)_\d+\.zip$/", $package, $matches)) {
		$returnData['modName'] = $matches[1];

		$versionFile = ".." . DIRECTORY_SEPARATOR . "modules" . DIRECTORY_SEPARATOR . $matches[1] . DIRECTORY_SEPARATOR . "VERSION_MODULE.txt";
		if (!is_file($versionFile) || ($verTxt = file_get_contents($versionFile)) === false) {
			$returnData['error'] = 'The installed module version could not be read.';
			return;
		}
		$returnData['modVer'] = getModVals('modVer', $verTxt);
	}

	// clear out temp package files
	clearDlTemp(null, $db, $returnData);
	if ($isOffline && $retResult === 0) {
		$olDir = PKGDIR . ".." . DIRECTORY_SEPARATOR . "offlinePkg" . DIRECTORY_SEPARATOR;
		unlink($olDir . $package);
	}
	// final session check & refresh

	$sldb = null;
}

# -------------- #
# Logoff request #
# -------------- #

function logoff($data, rixPDO $db, &$returnData)
{
	global $cookiePath;
	$sid = $_COOKIE['PSID'] ?? '';

	if (empty($sid)) {
		$returnData['error'] = "Could not process session ID for logoff attempt.";
		exit;
	}

	// setup curl vars in an array to curl post to 'upgraderServer'
	$cFields = ['logoff' => true, 'sid' => $sid];

	# ----------------------------------------------------------- #
	# parse curl response and determine auth status, set auth var #
	# ----------------------------------------------------------- #

	$upgResponse = curlGo($cFields);

	// get timeout value
	$returnData['sessTimeout'] = $upgResponse['sessTimeout'] ?? false;

	// set response back to upgrader.js based on response
	$returnData['error'] = $upgResponse['error'];
	$returnData['logoffStatus'] = ($upgResponse['error'] === false) ? "You have successfully logged out of the Upgrader Server." : $upgResponse['error'];

	// cleanup temp dl and package files
	clearDlTemp(null, $db, $returnData);

	// klil client cookie regardless of logoff success on the server side
	writeLogEntry("Successful Logoff: " . $_COOKIE['UNAME']);
	setcookie('PSID', '', time() - 2592000, "{$cookiePath}");
	setcookie('UNAME', '', time() - 2592000, "{$cookiePath}");
}

// ********************

/**
 * curl_close() is not a thing anymore, so we just reset the handle
 * and unset the ref for garbage collection.
 */
function safeCurlClose(&$ch): void
{
	// If curl_reset exists, try to reset the handle (best-effort)
	if (function_exists('curl_reset')) {
		try {
			curl_reset($ch);
		} catch (Throwable $e) {
			// ignore - best-effort
		}
	}

	// Unset reference so GC can collect the handle
	$ch = null;
}

/**
 * @throws Exception
 */
function curlGo(array $credCurlPost = [], string $retFormat = "JSON")
{
	global $settings;

	// default to production destination for updater server. Other entries left in for debugging/dev when needed
	if (filter_var($settings['upgraderURL'], FILTER_VALIDATE_URL) === false) {
		throw new Exception("upgrader URL value is invalid!");
	}

	$postDest = $settings['upgraderURL'] . "UpgraderServer.class.php";

	// init curl handle and set various options prior to send call
	$cHandle = curl_init();
	curl_setopt($cHandle, CURLOPT_RETURNTRANSFER, true);
	curl_setopt($cHandle, CURLOPT_POST, 1);
	// curl_setopt($cHandle, CURLOPT_COOKIE, 'XDEBUG_SESSION=XDEBUG_VSCODE'); //DEBUG: UNCOMMENT TO LAUCH XDEBUG DEBUGGING ON THE UPGRADER SERVER
	curl_setopt($cHandle, CURLOPT_POSTFIELDS, json_encode($credCurlPost));
	curl_setopt($cHandle, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
	curl_setopt($cHandle, CURLOPT_URL, $postDest);
	curl_setopt($cHandle, CURLOPT_CONNECTTIMEOUT, 10); // if it takes longer than 10 seconds to connect to server, that's not right.
	curl_setopt($cHandle, CURLOPT_TIMEOUT, 1200); // length of the operation post connection. Limited to 20 mins (shouldn't take longer than this for an xfer)
	curl_setopt($cHandle, CURLOPT_SSL_VERIFYHOST, 2); // *explicitly* set SSL validation for the host to which we're connecting to ON
	curl_setopt($cHandle, CURLOPT_SSL_VERIFYPEER, 0); // certificate chain unable to be traversed for *.oasys.lu so we disable peer verification option (per CISO)

	if ($retFormat === "BINZIP") {
		// binary expected return (file download)
		// init vars
		$cExecRet = true;
		$targFile = PKGDIR . basename($credCurlPost['fileDlName']);

		// check that local target dir exists and is writable
		clearstatcache(true);
		if (!is_writable(PKGDIR)) {
			$cExecRet = json_encode(['error' => "Unable to write to the <strong>{$targFile}</strong> directory. <br><br>Ensure the directory exists and your system has write access to this location."]);
			return $cExecRet;
		}

		// attempt to open target file pointer and return on error
		if (!$dlFileHandle = fopen($targFile, 'w')) {
			$cExecRet = json_encode(['error' => "Unable to write to <strong>{$targFile}</strong>! Ensure you have write permissions and file download filename is valid."]);
			safeCurlClose($cHandle);
			return $cExecRet;
		}

		// define curlopt to do direct file write, thereby bypassing large file memory issues
		curl_setopt($cHandle, CURLOPT_FILE, $dlFileHandle);

		// execute curl call
		$cExecRet = curl_exec($cHandle);
		$httpCode = (int) curl_getinfo($cHandle, CURLINFO_HTTP_CODE);
		$contentType = (string) curl_getinfo($cHandle, CURLINFO_CONTENT_TYPE);
		$curlError = curl_error($cHandle);

		// if return data is JSON, it's an error from the server; Catch and return it
		if (stripos($contentType, 'application/json') === 0) {
			fclose($dlFileHandle);
			safeCurlClose($cHandle);
			gc_collect_cycles(); // sometimes needed between an fclose() and unlink() to release file
			$cExecRet = file_get_contents($targFile);
			@unlink($targFile);
			return $cExecRet;
		}

		// actual cURL error - set a JSON encoded return w/error message
		if ($cExecRet !== true || $curlError !== '' || $httpCode !== 200) {
			$message = $curlError !== '' ? $curlError : "HTTP status {$httpCode}";
			$cExecRet = json_encode(['error' => 'PACKAGE DOWNLOAD FAILED: <strong>' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</strong>']);
			fclose($dlFileHandle);
			safeCurlClose($cHandle);
			@unlink($targFile);
			return $cExecRet;
		}

		// valid file download return - close out handles and return 'true' to indicate valid download operation
		fclose($dlFileHandle);
		safeCurlClose($cHandle);
		if (!is_file($targFile) || filesize($targFile) === 0) {
			@unlink($targFile);
			return json_encode(['error' => 'Package download returned an empty file.']);
		}

		return $cExecRet;

		// normal JSON expected response block
	} else {
		// execute curl call and assign response to var
		$cServerResponse = curl_exec($cHandle);
		$cRetInfo = curl_getinfo($cHandle);

		// if we do not receive a proper OK http status, something is not right, and we bail
		if ($cRetInfo['http_code'] !== 200) {
			safeCurlClose($cHandle);
			return ['error' => "Invalid response from server.<br>HTTP code: {$cRetInfo['http_code']}", 'authStatus' => false];
		}

		$crJSON = json_decode($cServerResponse ?? '', true);
		safeCurlClose($cHandle);
		return $crJSON;
	}
}

# ----------------------------------------------- #
# Clear out package download and install location #
# ----------------------------------------------- #

function clearDlTemp($data, rixPDO $db, &$returnData, $dir2kill = PKGDIR)
{
	// DEBUG: Uncomment to bypass DL temp dir nuking (Useful for debugging)
	// return;

	// first remove all files in our downloads root
	$root = realpath(PKGDIR);
	$targetRoot = realpath($dir2kill);
	if ($root === false || $targetRoot === false || $targetRoot !== $root) {
		$returnData['error'] = 'Invalid package cleanup directory.';
		return;
	}

	foreach (glob("{$dir2kill}*", GLOB_NOSORT) ?: [] as $entry) {
		if (is_link($entry) || is_file($entry)) {
			@unlink($entry);
		}
	}

	/* Internal recursive function to remove downloads */
	if (!function_exists('recursKill')) {
		function recursKill($target)
		{
			if (is_link($target)) {
				@unlink($target);
				return;
			}
			if (!is_dir($target)) return;
			if (substr($target, -1) !== DIRECTORY_SEPARATOR) $target .= DIRECTORY_SEPARATOR;
			$objs = scandir($target);
			if ($objs === false) return;

			foreach ($objs as $obj) {
				if ($obj !== "." && $obj !== "..") {
					if (is_link($target . $obj))
						@unlink($target . $obj);
					else if (is_dir($target . $obj))
						recursKill($target . $obj . DIRECTORY_SEPARATOR);
					else
						@unlink($target . $obj);
				}
			}
			@rmdir($target);
		}
	}

	// call our recursive nested function for file/dir killing
	array_map('recursKill', glob("{$dir2kill}*", GLOB_ONLYDIR) ?: []);
}

# ------------------------------------------------------------------------- #
# Session expiry calculator (return in seconds, global var set in  minutes) #
# ------------------------------------------------------------------------- #

function cExpiryTimeout()
{
	global $seshMinTimeout;
	// return time() + 5; // DEBUG: this sets timeout to 5 seconds (good for debugging sessions and cookies)
	return time() + (60 * $seshMinTimeout);
}

	/*
	###############
	Log file writer
	###############
	 */

/**
 * To handle external AJAX requests to write to upgrader.log file
 * @param mixed $data
 * @param mixed $db
 * @param mixed $returnData
 *
 * @return void
 */
function writeLogWrapper($data, $db, &$returnData)
{
	checkParams($data, ['entry']);
	$entry = str_replace(["\r", "\n"], ' ', (string) $data['entry']);
	writeLogEntry($entry);
}

/**
 * writeLogEntry
 * [upgraderActions] - write an entry log to either upgrader login error log file or upgrader event log file
 * @param string $entry
 * @param boolean $login_err
 *
 * @return void
 */
function writeLogEntry(string $entry, bool $login_err = false)
{
	$logfileName = $login_err ? 'upgrader_errors.log' : 'upgrader.log';
	$timeStamp = date('[Y-m-d H:i:s]') . ": ";
	file_put_contents(DOCROOT . 'logs' . DIRECTORY_SEPARATOR . $logfileName, $timeStamp . $entry . "\n", FILE_APPEND);
}

function writeInstDbEntry(string $package, string $event, int $result, string $user = '!NOUSER!')
{
	# ----------------- #
	# SQLite connection #
	# ----------------- #

	try {
		$sldb = new PDO("sqlite:" . INSTDBROOT, '', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
	} catch (PDOException $e) {
		writeLogEntry("Unable to connect to installer tracker database.");
		return;
	}

	# -------------------------------------------- #
	# Setup query and prepare for SQLite DB insert #
	# -------------------------------------------- #

	$query = "INSERT INTO install_history (datetime, user, package, event, result) VALUES (:dt, :usr, :pkg, :evt, :res)";
	$stmt = $sldb->prepare($query);

	# ----------------------------------------- #
	# Insert column values into local SQLite DB #
	# ----------------------------------------- #

	$stmt->bindValue(':dt', time()); // will bind UNIX epoch time
	$stmt->bindValue(':usr', $user);
	$stmt->bindValue(':pkg', $package);
	$stmt->bindValue(':evt', $event);
	$stmt->bindValue(':res', $result);

	# ----------------------------- #
	# Execute SQL statement via PDO #
	# ----------------------------- #

	$stmt->execute();

	$sldb = null;
}

/**
 * Scans the modules directory and returns an array of found Oasys modules.
 *
 * returns a json encoded array of module directory names (empty if none found)
 */
function getModList(): string
{
	$basePath = realpath(__DIR__ . '/../modules/');
	if (!$basePath) {
		return '';
	}

	$dirs = [];
	foreach (scandir($basePath) as $item) {
		if ($item === "." || $item === "..") continue; //ignore current and parent dir
		if (is_dir($basePath . DIRECTORY_SEPARATOR . $item) && file_exists($basePath . DIRECTORY_SEPARATOR . $item . DIRECTORY_SEPARATOR . "VERSION_MODULE.txt")) { // verify the module version file exists before processing
			$verTxt = file_get_contents($basePath . DIRECTORY_SEPARATOR . $item . DIRECTORY_SEPARATOR . "VERSION_MODULE.txt");
			$modVer = getModVals('modVer', $verTxt);
			$oamin = getModVals('oamin', $verTxt);
			$oamax = getModVals('oamax', $verTxt);

			array_push($dirs, [$item => ['modVersion' => $modVer, 'oamin' => $oamin, 'oamax' => $oamax]]);
		}
	}

	return json_encode($dirs);
}

function getModVals($type, $txt)
{
	switch ($type) {
		case 'modVer':
			return preg_match('/(?<=^v=).+$/m', $txt, $matches) ? $matches[0] : '';
			break;
		case 'oamin':
			return preg_match('/(?<=^oamin=).+$/m', $txt, $matches) ? $matches[0] : '';
			break;
		case 'oamax':
			return preg_match('/(?<=^oamax=).+$/m', $txt, $matches) ? $matches[0] : '';
			break;
		default:
			return '';
			break;
	}
}

/**
 * Get Oasys version information based on the specified type.
 *
 * @param string $vType The type of version information to return ('short' or 'long')
 * @return string The version information based on the specified type
 */
function getVer(string $vType = 'short')
{
	// replace any plain \r chars because Php can't handle matching them for some reason
	$verFileVar = str_replace("\r", "\n", file_get_contents(DOCROOT . "oasys_ver.txt"));

	switch ($vType) {
		case 'short':
			$verValue = preg_match('/(vshort=)(.+.)$/m', $verFileVar, $verMatch);
			if ($verValue !== 1) {
				return "CANNOT_PARSE_VSHORT_FIELD";
			} else {
				return $verMatch[2];
			}

			break;

		case 'long':
			$verValue = preg_match('/^(v=)(.+.)$/m', $verFileVar, $verMatch);
			if ($verValue !== 1) {
				return "CANNOT_PARSE_VLONG_FIELD";
			} else {
				return $verMatch[2];
			}
			break;

		default:
			break;
	}
}

// initiate log file download for last failed package
function logDl($data, $db, &$returnData)
{
	// check params and assign package name var
	checkparams($data, ['pkgName']);
	$sid = $_COOKIE['PSID'] ?? '';
	$package = $data['pkgName'];

	// zip up
	$zip = new ZipArchive;
	$zip->open(PKGDIR . "update_logs.zip", ZipArchive::CREATE);
	$zip->addFile(DOCROOT . "logs" . DIRECTORY_SEPARATOR . "upgrader.log", "upgrader.log");
	$zip->addFile(DOCROOT . "logs" . DIRECTORY_SEPARATOR . $package . "_install.log", $package . "_install.log");
	$zip->close();

	// send to browser - do through JS UI instead -- much easier
	// header('Content-type: application/zip');
	// header('Content-disposition: attachment; filename="upgrader_logs.zip"');
	// readfile(PKGDIR . "update_logs.zip");

	// final session check & refresh
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

# ---------------------------------------------- #
# JSON data return exit function to front end UI #
# ---------------------------------------------- #

/*
	##########################################################################################
	this will always be called when the script ends even if a fatal error occurred
	it encodes the $returnData to JSON and it adds an error message if a fatal PHP error occurred
	this error message is registered under the 'fatalError' key and includes the file name of the
	PHP script and the line number of the error all other errors (e.g. database) were
	registered under the 'error' key
	##########################################################################################
	 */

function outputJSON()
{
	global $returnData, $action, $myAuth, $db, $backendState;

	// updated username
	$returnData['loggedInName'] = $myAuth->username;

	if (!isset($returnData['action'])) {
		$returnData['action'] = $action;
	}

	// always return Oasys long version value
	$returnData['longVer'] = getVer('long');

	$error = error_get_last();
	$fatalTypes = E_ERROR | E_PARSE | E_CORE_ERROR | E_COMPILE_ERROR | E_USER_ERROR;
	$hasFatalError = !empty($error) && (($error['type'] & $fatalTypes) !== 0);

	// There are a lot of spots where failures can leave maint. mode on, so let's always deactivate on error
	if ($returnData['error'] !== false || $hasFatalError) {
		$documentRoot = filter_input(INPUT_SERVER, "DOCUMENT_ROOT");
		if ($hasFatalError) {
			$file = str_replace($documentRoot, '', $error['file']);
			$returnData['fatalError'] = "<p>Fatal error [type {$error['type']}] on line {$error['line']} of<br><code class='tinyCode'>$file</code></p><p>{$error['message']}</p>";
		}
	}

	// revert maintenance mode to its pre-upgrade state if an error is detected; we have to make this conditional so maintenance mode stays in the proper mode during update lifecycle
	if (isset($backendState->preUpMM) && ($returnData['error'] !== false || $hasFatalError)) {
		$preFEMM = $backendState->preUpMM['frontend']['status'];
		$preBEMM = $backendState->preUpMM['backend']['status'];
		set_mmode("backend", $preBEMM, $db);
		set_mmode("frontend", $preFEMM, $db);
	}

	// always return admin level status
	$returnData['isAdmin'] = $myAuth->checkAdmin();
	$returnData['isAE'] = $myAuth->checkElevatedAdmin();

	header('Cache-Control: no-cache, must-revalidate');
	header('Content-type: application/json; charset=UTF-8');
	echo json_encode($returnData);
}
