<?php

//the JSON output will happen, even if a fatal error prevents the script from finishing
register_shutdown_function('outputJSON');
require_once "../inc/php/Crypt.php";
require_once 'inc/php/userHandling.php';
include_once 'userMgmtActions.php';
include_once 'inc/php/systemState.php';

# ----------------------- #
# Authentication Includes #
# ----------------------- #
$pageName = "systemsettings"; // set to the related 'editor button' string name (e.g., 'items')
$isSubMod = false; // set true if a module page in a subdirectory
$isActionFile = true; // set true if an "xxxActions.php" file
require_once 'inc/php/authCommonFunctions.php'; // required for authentication inclusion

# ----------------------- #
# Translation Include #
# ----------------------- #
require_once 'inc/php/uiLang.php'; // required for translation inclusion
$uiLang = new uiLang($settings['interfaceLanguage']);

//action is a string that defines what action to perform
$action = filter_input(INPUT_POST, 'action');
if (!$action) {
    $action = "";
}

//all data that is returned by this script will be put into $returnData array which is sent back in JSON encoded form
$returnData = array();
$returnData['action'] = $action; //when returning we must specify which action was performed
$returnData['error'] = false; //if there is an error, this will contain a string with the error message

// if the auth constructor results in an error, we want to immediately exit and report said error
if ($myAuth->returnData['error'] !== false) {
    $returnData['error'] = $myAuth->returnData['error'];
    exit;
}

$auth = $myAuth->getAuthResult(true);

//the JSON output will happen, even if a fatal error prevents the script from finishing
require_once "../inc/php/Crypt.php";

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
$db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, '../logs/usersManager_errors.txt', 1, $returnData, 'error');

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
 * actions
 */

/**
 * Get current maintenance mode statuses
 *
 * @param  array $data
 * @param  rixPDO $db
 * @param  array $returnData
 * @return void
 */
function m_status(array $data, rixPDO &$db, array &$returnData)
{
    global $myAuth;

    if ($myAuth->checkSA() !== true) {
        $returnData['error'] = "This function is reserved for superadmins only!";
        return;
    }

    $returnData['m_status'] = get_mmode("all", $db);
    checkActiveStates($data, $db, $returnData);
}

/**
 * Change the current maintenance mode status(es)
 *
 * @param  array $data
 * @param  rixPDO $db
 * @param  array $returnData
 * @return void
 */
function change_m_status(array $data, rixPDO &$db, array &$returnData)
{
    global $myAuth;

    if ($myAuth->checkSA() !== true) {
        $returnData['error'] = "This function is reserved for superadmins only!";
        return;
    }

    checkParams($data, ['section']);
    extract($data);

    checkActiveStates($data, $db, $returnData); // populate returnData with be/fe counts and detail

    if ($returnData['fecount'] > 0 && $state === 1 && $section === "frontend") {
        $returnData['stop'] = true;
        return;
    }

    if ($returnData['becount'] > 0 && $state === 1 && $section === "backend") {
        rem_be_sessions($db);
    }

    set_mmode($section, $state, $db); // does the maint mode change
    m_status($data, $db, $returnData); // will send back updated data
}

/** File cleanup using sha1 file as reference for extraneous files */

function file_cleanup(array $data, rixPDO &$db, array &$returnData)
{
    $remSourceLog = './tools/sha1_data/last_result.log';
    if (!file_exists($remSourceLog)) {
        $returnData['error'] = "Source log file not found!";
        return;
    }

    $remContents = file($remSourceLog, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    $filteredContents = array_filter($remContents, function ($line) {
        return str_contains($line, 'EXTRA:') || str_contains($line, 'EMPTY:');
    });

    $thing2Kill = array_map(function ($line) {
        return trim(str_replace(['EMPTY:', 'EXTRA:', '"'], '', $line));
    }, $filteredContents);

    # ------------------------------- #
    # EXTRANEOUS FILE REMOVAL ROUTINE #
    # ------------------------------- #

    $returnData['res'] = "";
    foreach ($thing2Kill as $dirObject) {
        $dirObject = str_replace("../../", "", $dirObject);
        $filepath = DOCROOT . $dirObject;
        if (is_file($filepath)) {
            if (!@unlink($filepath)) {
                $FfailReason = substr(strrchr(error_get_last()['message'], ":"), 1);
                error_clear_last(); // we don't want the whole file removal process to halt if it can't be removed
                $returnData['res'] .= "<code>Failed to remove file: <u>" . $dirObject . "</u> : <strong>{$FfailReason}</strong></code><br>";
            } else {
                $returnData['res'] .= "<code>Successfully removed file: <u>" . $dirObject . "</u></code><br>";
            }
        } elseif (is_dir($filepath)) {
            if (!@rmdir($filepath)) {
                $DfailReason = substr(strrchr(error_get_last()['message'], ":"), 1);
                error_clear_last(); // we don't want the whole file removal process to halt if it can't be removed
                $returnData['res'] .= "<code>Failed to remove directory: <u>" . $dirObject . "</u> : <strong>{$DfailReason}</strong></code><br>";
            } else {
                $returnData['res'] .= "<code>Successfully removed directory: <u>" . $dirObject . "</u></code><br>";
            }
        } else {
            $returnData['res'] .= "<code>Could not read path: <u>" . $dirObject . "</u> : <strong>File is unreadable. Check for existence, and permission settings in the file system.</strong></code><br>";
        }
    }

    # --------------------------------------------- #
    # POST-FILE REMOVAL EMPTY DIR CHECK AND REMOVAL #
    # --------------------------------------------- #

    $allDirs = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator(DOCROOT, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );

    try {
        foreach ($allDirs as $dir) {
            if ($dir->isDir() && iterator_count(new FilesystemIterator($dir->getPathname())) === 0 && str_contains($dir->getPathname(), ".git" . DIRECTORY_SEPARATOR) === false) {
                $dirObjectStr = $dir->getPathname();
                if (!@rmdir($dirObjectStr)) {
                    $D2failReason = substr(strrchr(error_get_last()['message'], ":"), 1);
                    error_clear_last(); // we don't want the whole file removal process to halt if it can't be removed
                    $returnData['res'] .= "<code>Failed to remove directory: <u>" . $dirObjectStr . "</u> : <strong>{$D2failReason}</strong></code><br>";
                } else {
                    $returnData['res'] .= "<code>Successfully removed directory: <u>" . $dirObjectStr . "</u></code><br>";
                }
            }
        }
    } catch (Exception $e) {
        $returnData['res'] .= "<code>An unknown error occurred during directory cleanup.</code>" . "<br>";
    }
}

/** Oasys file system validation routine based on SHA1 reference file from git commit */
function filesyscheck(array $data, rixPDO &$db, array &$returnData): void
{
    // Verify the script exists
    $scriptPath = './tools/file_verifier.sh';
    if (!file_exists($scriptPath)) {
        $returnData['error'] = "Did not find SHA1 validator script!";
        return;
    }

    if (!file_exists("./tools/sha1_data/oasys_sha1s.txt.ref")) {
        $returnData['error'] = "Did not find SHA1 reference file!";
        return;
    }

    // Make sure the script is executable
    if (!is_executable($scriptPath)) {
        try {
            if (!chmod($scriptPath, 0770)) {
                error_clear_last();
                throw new Exception("<br><strong>Could not set SHA1 validator script to executable!</strong>");
            }
        } catch (Exception $e) {
            $returnData['error'] = $e->getMessage() . "<br><br>Please ask your system administrator to manually enable executable rights on the file validator script.";
            return;
        }
    }

    // Execute the script
    $output = [];
    $returnCode = 0;
    exec($scriptPath . " -v -n 2>&1", $output, $returnCode);

    if (!file_exists("./tools/sha1_data/oasys_sha1s.txt.cur")) {
        $returnData['error'] = "Could not generate the SHA1 hash file!";
        return;
    }

    // Store the results
    $returnData['output'] = file_get_contents("./tools/sha1_data/last_result.log");

    $returnData['output'] = preg_replace('/\e[[][A-Za-z0-9];?[0-9]*m?/', '', $returnData['output']); // Strip all Linux terminal color codes from the output
    $returnData['output'] = str_replace("../../", "", $returnData['output']); // Strip the relative path from the output
    $returnData['exitCode'] = $returnCode;

    // If the script returned non-zero, consider it an error
    if ($returnCode !== 0) {
        $returnData['error'] = "File verification failed with exit code: $returnCode";
    }
}

function syscheck(array $data, rixPDO &$db, array &$returnData): void
{

    global $sql_db, $sql_user, $sql_password, $sql_host;

    $db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, null, 0);

    // check php version
    $pv = phpversion();
    $phpMin = "8.2.24";
    $phpMax = "8.3.23";
    $returnData['data']['Php Version'] = version_compare($pv, $phpMin) >= 0 && version_compare($pv, $phpMax) <= 0;
    if (version_compare($pv, $phpMax) > 0) $returnData['data']['Php Version'] = "warn";
    $returnData['data']['req']['Php Version'] = "&GreaterEqual;&nbsp;" . $phpMin . "&nbsp;&le;&nbsp;" . $phpMax;
    $returnData['data']['found']['Php Version'] = $pv;
    $returnData['data']['failMsgs']['Php Version'] = "Oasys is officially supported on versions between <span class='specialEmBase'>{$phpMin}</span> and <span class='specialEmBase'>{$phpMax}</span>. Please update your Php version to a supported version.";
    $returnData['data']['warn']['Php Version'] = "{$pv}<br><br>Please note that Oasys has not been officially verified on this version of Php. You may continue to use this version at your own risk!";

    // check loaded php extensions

    $returnData['data']['XMLReader'] = extension_loaded('xmlreader');
    $returnData['data']['req']['XMLReader'] = "Yes";
    $returnData['data']['found']['XMLReader'] = extension_loaded('zlib') ? "Yes" : "No";
    $returnData['data']['failMsgs']['XMLReader'] = "You are missing the 'XMLReader' module in your Php instance. <a href='https://www.php.net/manual/en/book.xmlreader.php' target='_blank'>Click here for full reference documentation on this module.</a>.";

    $returnData['data']['XMLWriter'] = extension_loaded('xmlwriter');
    $returnData['data']['req']['XMLWriter'] = "Yes";
    $returnData['data']['found']['XMLWriter'] = extension_loaded('zlib') ? "Yes" : "No";
    $returnData['data']['failMsgs']['XMLWriter'] = "You are missing the 'XMLWriter' module in your Php instance. <a href='https://www.php.net/manual/en/book.xmlwriter.php' target='_blank'>Click here for full reference documentation on this module.</a>.";

    $returnData['data']['XML'] = extension_loaded('xml');
    $returnData['data']['req']['XML'] = "Yes";
    $returnData['data']['found']['XML'] = extension_loaded('zlib') ? "Yes" : "No";
    $returnData['data']['failMsgs']['XML'] = "You are missing the 'XML' module in your Php instance. <a href='https://www.php.net/manual/en/book.xml.php' target='_blank'>Click here for full reference documentation on this module.</a>.";

    $returnData['data']['BCMath'] = extension_loaded('bcmath');
    $returnData['data']['req']['BCMath'] = "Yes";
    $returnData['data']['found']['BCMath'] = extension_loaded('zlib') ? "Yes" : "No";
    $returnData['data']['failMsgs']['BCMath'] = "You are missing the 'BCMath' module in your Php instance. <a href='https://www.php.net/manual/en/book.bc.php' target='_blank'>Click here for full reference documentation on this module.</a>.";

    $returnData['data']['Php Zlib Module'] = extension_loaded('zlib');
    $returnData['data']['req']['Php Zlib Module'] = "Yes";
    $returnData['data']['found']['Php Zlib Module'] = extension_loaded('zlib') ? "Yes" : "No";
    $returnData['data']['failMsgs']['Php Zlib Module'] = "You are missing the 'Zlib' module in your Php instance. <a href='https://www.php.net/manual/en/book.zlib.php' target='_blank'>Click here for full reference documentation on this module.</a>.";

    $returnData['data']['Php ZIP Module'] = extension_loaded('zip');
    $returnData['data']['req']['Php ZIP Module'] = "Yes";
    $returnData['data']['found']['Php ZIP Module'] = extension_loaded('zip') ? "Yes" : "No";
    $returnData['data']['failMsgs']['Php ZIP Module'] = "You are missing the 'ZIP' module in your Php instance. <a href='https://www.php.net/manual/en/book.zip.php' target='_blank'>Click here for full reference documentation on this module.</a>.";

    $returnData['data']['Php MBSTRING Module'] = extension_loaded('mbstring');
    $returnData['data']['req']['Php MBSTRING Module'] = "Yes";
    $returnData['data']['found']['Php MBSTRING Module'] = extension_loaded('mbstring') ? "Yes" : "No";
    $returnData['data']['failMsgs']['Php MBSTRING Module'] = "You are missing the 'MBSTRING' module in your Php instance. <a href='https://www.php.net/manual/en/book.mbstring.php' target='_blank'>Click here for full reference documentation on this module.</a>.";

    $returnData['data']['php PDO Module'] = extension_loaded('PDO');
    $returnData['data']['req']['php PDO Module'] = "Yes";
    $returnData['data']['found']['php PDO Module'] = extension_loaded('PDO') ? "Yes" : "No";
    $returnData['data']['failMsgs']['php PDO Module'] = "You are missing the 'PDO' module in your Php instance. <a href='https://www.php.net/manual/en/book.pdo.php' target='_blank'>Click here for full reference documentation on this module.</a>.";

    $returnData['data']['Php PDO MYSQL Module'] = extension_loaded('pdo_mysql');
    $returnData['data']['req']['Php PDO MYSQL Module'] = "Yes";
    $returnData['data']['found']['Php PDO MYSQL Module'] = extension_loaded('pdo_mysql') ? "Yes" : "No";
    $returnData['data']['failMsgs']['Php PDO MYSQL Module'] = "You are missing the 'PDO MYSQL' module in your Php instance. <a href='https://www.php.net/manual/en/ref.pdo-mysql.php' target='_blank'>Click here for full reference documentation on this module.</a>.";

    $returnData['data']['Php PDO SQLITE Module'] = extension_loaded('pdo_sqlite');
    $returnData['data']['req']['Php PDO SQLITE Module'] = "Yes";
    $returnData['data']['found']['Php PDO SQLITE Module'] = extension_loaded('pdo_sqlite') ? "Yes" : "No";
    $returnData['data']['failMsgs']['Php PDO SQLITE Module'] = "You are missing the 'PDO SQLITE' module in your Php instance. <a href='https://www.php.net/manual/en/book.sqlite3.php' target='_blank'>Click here for full reference documentation on this module.</a>.";

    $returnData['data']['Php CURL Module'] = extension_loaded('curl');
    $returnData['data']['req']['Php CURL Module'] = "Yes";
    $returnData['data']['found']['Php CURL Module'] = extension_loaded('curl') ? "Yes" : "No";
    $returnData['data']['failMsgs']['Php CURL Module'] = "You are missing the 'CURL' module in your Php instance. <a href='https://www.php.net/manual/en/book.curl.php' target='_blank'>Click here for full reference documentation on this module.</a>.";

    $returnData['data']['Php FILEINFO Module'] = extension_loaded('fileinfo');
    $returnData['data']['req']['Php FILEINFO Module'] = "Yes";
    $returnData['data']['found']['Php FILEINFO Module'] = extension_loaded('fileinfo') ? "Yes" : "No";
    $returnData['data']['failMsgs']['Php FILEINFO Module'] = "You are missing the 'FILEINFO' module in your Php instance. <a href='https://www.php.net/manual/en/book.fileinfo.php' target='_blank'>Click here for full reference documentation on this module.</a>.";

    $returnData['data']['Php LDAP Module'] = extension_loaded('ldap');
    $returnData['data']['req']['Php LDAP Module'] = "Optional";
    $returnData['data']['found']['Php LDAP Module'] = extension_loaded('ldap') ? "Yes" : "No";
    if ($returnData['data']['found']['Php LDAP Module'] === "No") $returnData['data']['Php LDAP Module'] = "warn";
    $returnData['data']['warn']['Php LDAP Module'] = "No<br><br>Warning! You are missing the 'LDAP' module in your Php instance. This is not a core requirement for Oasys to operate, however, LDAP authentication will not function without this module. It is recommended to have this module installed. <a href='https://www.php.net/manual/en/book.ldap.php' target='_blank'>Click here for full reference documentation on this module.</a>.";

    // check various php.ini values

    // max upload size
    $uploadSize = intval(rtrim(ini_get('upload_max_filesize'), "M"));
    $postSize = intval(rtrim(ini_get('post_max_size'), "M"));

    $returnData['data']['Post Max > Upload Max'] = ($postSize > $uploadSize);
    $returnData['data']['req']['Post Max > Upload Max'] = "Yes";
    $returnData['data']['found']['Post Max > Upload Max'] = ($postSize > $uploadSize) ? "Yes" : "No";
    $returnData['data']['failMsgs']['Post Max > Upload Max'] = "The Php max post size (currently <strong>{$postSize}M)</strong> must be <u>larger</u> than the Php max upload size (currently <strong>{$uploadSize}M)</strong>. Please adjust the values accordingly in your <span class='specialEmBase'>php.ini</span> file in the <span class='specialEmBase'>upload_max_filesize</span> and <span class='specialEmBase'>post_max_size</span> entries, then restart your Apache service.";

    // max execution time (Php default 30s, we require 300s (5 mins))
    $maxTime = intval(ini_get("max_execution_time"));
    $minMaxTime = 300;

    $returnData['data']['Max Execution Time'] = $maxTime >= $minMaxTime;
    $returnData['data']['req']['Max Execution Time'] = "&GreaterEqual;&nbsp;" . $minMaxTime;
    $returnData['data']['found']['Max Execution Time'] = $maxTime;
    $returnData['data']['failMsgs']['Max Execution Time'] = "The Php max execution time (currently <strong>{$maxTime})</strong> must be <u>larger or equal</u> to the Oasys required minimum value (currently <strong>{$minMaxTime})</strong>. Please adjust the values accordingly in your <span class='specialEmBase'>php.ini</span> file in the <span class='specialEmBase'>max_execution_time</span> entry, then restart your Apache service.";

    $retBytes = function ($val) {
        $val  = trim($val);

        if (is_numeric($val))
            return $val;

        $last = strtolower($val[strlen($val) - 1]);
        $val  = substr($val, 0, -1);

        switch ($last) {
            case 'g':
                $val *= 1024;
            case 'm':
                $val *= 1024;
            case 'k':
                $val *= 1024;
        }

        return $val;
    };

    // max memory utilization limit
    $actulMem_HR = ini_get("memory_limit");
    $actualMem = $retBytes(ini_get("memory_limit"));

    $minMem_HR = "256M";
    $minMem = $retBytes("256M");

    $recMem_HR = "512M";
    $recMem = $retBytes("512M");

    if ($actulMem_HR === "-1") {
        $actualMem = -1;
        $actulMem_HR = "NO LIMIT";
    }

    $returnData['data']['Memory Limit'] = (($actualMem >= $recMem) || $actualMem === -1);
    if (($actualMem >= $minMem && $actualMem < $recMem)) $returnData['data']['Memory Limit'] = "warn";
    $returnData['data']['req']['Memory Limit'] = "&GreaterEqual;&nbsp;" . $minMem_HR;
    $returnData['data']['found']['Memory Limit'] = $actulMem_HR;
    $returnData['data']['warn']['Memory Limit'] = "{$actulMem_HR}<br><br>Warning! This value meets the minimum value, however, it is <strong>recommended to be set to <em>{$recMem_HR}</em> or higher</strong>.";
    $returnData['data']['failMsgs']['Memory Limit'] = "The configured Php Memory Limit (currently <strong>{$actulMem_HR})</strong> must be <u>larger or equal</u> to the Oasys required minimum value (<strong>{$minMem_HR})</strong>. Please adjust the values accordingly in your <span class='specialEmBase'>php.ini</span> file in the <span class='specialEmBase'>memory_limit</span> entry, then restart your Apache service.<br><br><em><strong>Please note -- the recommended value for this entry is to set the value to at least {$recMem_HR} or higher.</em></strong>";

    // query to split and check db product and version values
    $result = $db->fetchValue("select version()")['data'];

    // split out db info string to get name and version of the db product
    $dbInfo = explode("-", $result);
    (string) $dbName = (string) $dbInfo[1];

    // query to get table definition cache value of database
    $tabDefCache = intval($db->fetchRow("SHOW GLOBAL VARIABLES WHERE `Variable_name` = 'table_definition_cache'", [])['data']['Value']);

    // compare product name
    $dbProdName = "MariaDB"; // db product
    $returnData['data']['Database Product'] = ($dbName === $dbProdName);
    $returnData['data']['req']['Database Product'] = $dbProdName;
    $returnData['data']['found']['Database Product'] = $dbName;
    $returnData['data']['failMsgs']['Database Product'] = "Not running the correct database product.";

    // compare product version
    $dbVersion = $dbInfo[0];
    $minDBversion = "10.11.9"; // db version
    $maxDBversion = "11.8.2"; // max tested db version
    $returnData['data']['Database Version'] = version_compare($dbVersion, $minDBversion) >= 0 && version_compare($dbVersion, $maxDBversion) <= 0;
    if (version_compare($dbVersion, $maxDBversion) > 0) $returnData['data']['Database Version'] = "warn";
    $returnData['data']['req']['Database Version'] = "&GreaterEqual;&nbsp;" . $minDBversion . "&nbsp;&le;&nbsp;$maxDBversion";
    $returnData['data']['found']['Database Version'] = $dbVersion;
    $returnData['data']['failMsgs']['Database Version'] = "Not running the correct database version. Although Oasys may continue to run, MariaDB version {$dbVersion} is no longer officially supported.";
    $returnData['data']['warn']['Database Version'] = "{$dbVersion}<br><br>Please note that Oasys has not been officially verified on this version of MariaDB. You may continue to use this version at your own risk!";

    // compare table definition cache
    $minTDCval = 1024; // db version
    $returnData['data']['Table Definition Cache'] = ($minTDCval <= $tabDefCache);
    $returnData['data']['req']['Table Definition Cache'] = "&GreaterEqual;&nbsp;" . $minTDCval;
    $returnData['data']['found']['Table Definition Cache'] = $tabDefCache;
    $returnData['data']['failMsgs']['Table Definition Cache'] = "The table definition cache value is required to be <span class='specialEmBase'>1024</span> or higher. Please create a custom <span class='specialEmBase'>table_definition_cache</span> entry in the database configuration file, then restart the MariaDB service.";

    // compare innodb_flush_log_at_trx_commit
    $result = $db->fetchRow("show variables like '%innodb_flush_log_at_trx_commit%'")['data']['Value'];
    (int) $DFL = (int) $result;

    (int) $minDFL = 0; // defaultFlushLog

    $returnData['data']['Flush Log at Transaction Commit'] = ($DFL === $minDFL);
    $returnData['data']['req']['Flush Log at Transaction Commit'] = $minDFL;
    $returnData['data']['found']['Flush Log at Transaction Commit'] = $DFL;
    $returnData['data']['failMsgs']['Flush Log at Transaction Commit'] = "Flush Log at Tx Commit setting not correct. <br>Adjust or add the <span class='specialEmBase'>innodb_flush_log_at_trx_commit</span> value in the database configuration file, then restart the MariaDB service.";

    // compare @@collation_database
    $result = $db->fetchValue("select @@collation_database")['data'];
    (string) $collation = $result;

    $minCollation = "utf8mb4_unicode_520_ci"; // database character collation

    $returnData['data']['Database Collation Value'] = ($collation === $minCollation);
    $returnData['data']['req']['Database Collation Value'] = $minCollation;
    $returnData['data']['found']['Database Collation Value'] = $collation;
    $returnData['data']['failMsgs']['Database Collation Value'] = "Database collation value not correct. ALTER your database with the required collation value.";

    // compare @@character_set_database
    $result = $db->fetchValue("select @@character_set_database")['data'];
    (string) $charSet = $result;

    $minCharset = "utf8mb4"; // database character set

    $returnData['data']['Database Character Set'] = ($charSet === $minCharset);
    $returnData['data']['req']['Database Character Set'] = $minCharset;
    $returnData['data']['found']['Database Character Set'] = $charSet;
    $returnData['data']['failMsgs']['Database Character Set'] = "Database character set value not correct. ALTER your database with the required character set value.";

    // comapre Php and server time differential
    $stq = $db->fetchValue("SELECT NOW()", [])['data'];
    $serverTime = date_create($stq);
    $timediff = date_diff($serverTime, date_create(), true);
    $tdSecs = ($timediff->d * 86400) + ($timediff->h * 3600) + ($timediff->i * 60);
    $tdNice = $timediff->format(($timediff->d * 24) + ($timediff->h) . " hour %i minute %s second differential");

    $returnData['debug'] = $timediff;

    $returnData['data']['Php/Server Time Differential'] = $tdSecs <= 15;
    $returnData['data']['req']['Php/Server Time Differential'] = "<= 15 second differential";
    $returnData['data']['found']['Php/Server Time Differential'] = $tdNice;
    $returnData['data']['failMsgs']['Php/Server Time Differential'] = "Php and server time differential exceeds the limit. Please ensure your Php INI file timezone, and local server timezone values match.";

    // Validate grants given to db user

    // get grant list for db user connected to this Oasys instance
    $grantQry = $db->fetchColumn("SHOW GRANTS FOR CURRENT_USER");

    // set minimum required grant list
    $minGrantList = [
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE',
        'CREATE',
        'DROP',
        'ALTER',
        'LOCK TABLES',
        'EXECUTE',
        'CREATE VIEW',
        'SHOW VIEW',
    ];
    $minGrantsString = implode("<br>", $minGrantList);

    // do 1st level filtration to parse only (potentially) relevant elements
    $userGrantArr = array_values(array_filter($grantQry['data'], function ($a) use ($sql_user, $sql_db) {
        return (strpos($a, "GRANT USAGE ON") !== 0 && ((strpos($a, "ON `" . $sql_db . "`") !== false ||
            strpos($a, "ON *.* TO " . "`" . $sql_user . "`") !== false) ||
            preg_match("/\sON\s\`{$sql_user}\`.*\sTO\s\`{$sql_db}.*/", $a) !== 0)
        );
    }));

    // do a search for a global grant to all DBs (usually when the 'root' db user is being used for the connection)
    foreach ($userGrantArr as $userGrantItem) {
        if (preg_match('/GRANT ALL PRIVILEGES ON \*\.\*/', $userGrantItem) === 1 || preg_match("/GRANT ALL PRIVILEGES ON \`$sql_db\`/", $userGrantItem) === 1) {
            $returnData['data']['User Grant Privileges'] = true;
            $returnData['data']['req']['User Grant Privileges'] = $minGrantsString;
            $returnData['data']['found']['User Grant Privileges'] = "<u>FOUND:</u><br>" . "ALL PRIVILEGES GRANTED";
            return;
        }
    }

    // If there're no entries left after first level filtering... something's wrong (with either the instance state, or my code 🤨 ).
    if (empty($userGrantArr)) {
        $returnData['data']['User Grant Privileges'] = false;
        $returnData['data']['req']['User Grant Privileges'] = $minGrantsString;
        $returnData['data']['found']['User Grant Privileges'] = "<u>FOUND:</u><br>" . "N/A";
        $returnData['data']['failMsgs']['User Grant Privileges'] = <<<LONGLINE
    Unable to determine the grant privileges for the database user!<br>
    <br>
    You may have a duplicate database user with a differing hostname which can cause permission conflicts and issues.<br>
    <br>
    <strong>Please manually review your database users, and remove any duplicate names with different host values which are not in use.</strong><br>
    <br>
    Example scenario:<br>
    <pre>DB USER
    ---------------
    oasys@localhost     <-- intended oasys db user
    oasys@%             <-- extraneous db user, should be removed

    LONGLINE;
        return;
    }

    // Individual grant list parsing/building
    $aggMatches = "";
    foreach ($userGrantArr as $gfItem) {
        preg_match('/GRANT\s(.+)\sON\s[`*]/', $gfItem, $matches);
        $aggMatches = $aggMatches . $matches[1] . ", ";
    }

    $aggMatches = rtrim($aggMatches, " ,");

    $presentGrants = array_unique(array_map(function ($a) {
        return trim($a);
    }, explode(",", $aggMatches)));

    // Iterate present grants vs. required grants
    $grantPassed = false;
    $missingGrants = [];

    if (!$grantPassed) {
        foreach ($minGrantList as $grantCheckVal) {
            $grantPassed = in_array($grantCheckVal, $presentGrants);
            if (!$grantPassed) {
                $missingGrants[] = $grantCheckVal;
            }
        }
    }

    $grantPassed = (empty($missingGrants)) ?: false;

    // convert final results to string format for return message
    $missingGrantsString = implode("<br>", $missingGrants);
    $presentGrantsMod = implode("<br>", $presentGrants);

    $returnData['data']['User Grant Privileges'] = $grantPassed;
    $returnData['data']['req']['User Grant Privileges'] = $minGrantsString;
    $returnData['data']['found']['User Grant Privileges'] = "<u>FOUND:</u><br>" . $presentGrantsMod;
    $returnData['data']['failMsgs']['User Grant Privileges'] = <<<LONGLINE
        User Grant Privileges incorrect<br>for database user <strong>`{$sql_user}`</strong>.<br><br>
        <u id="missingText">MISSING:</u> <br><span class='specialEmFail'>$missingGrantsString</span>
LONGLINE;
}

function fetchSettings($data, &$db, &$returnData)
{
    $query = "SELECT * FROM settings";
    $db->fetchTable($query, array());
    $result = $db->results();

    foreach ($result['data'] as $key => $value) {
        if ($value['encryption'] === 1) {
            $returnData['data'][$value['option']] = '< value set >';
        } else {
            $returnData['data'][$value['option']] = $value['value'];
        }
    }
}

function saveSetting($data, &$db, &$returnData)
{
    checkParams($data, array('clickedKey', 'value', 'encryption'));
    if ($data['encryption'] === true) {
        $encrypt = 1;
        $value = Crypt::encryptString($data['value']);
    } else {
        $encrypt = 0;
        $value = $data['value'];
    }
    $clickedKey = $data['clickedKey'];
    if ($value === true) $value = 'true';
    if ($value === false) $value = 'false';
    $db->prepare("DELETE FROM settings WHERE `option`=?");
    $db->executePrepared(array($clickedKey));
    $db->prepare('INSERT INTO settings (`option`,`value`,`encryption`) VALUES(?,?,?)');
    $db->executePrepared(array($clickedKey, $value, $encrypt));
}

function resetSetting($data, &$db, &$returnData)
{
    checkParams($data, array('clickedKey'));
    $clickedKey = $data['clickedKey'];
    $db->prepare("DELETE FROM settings WHERE `option`=?");
    $db->executePrepared(array($clickedKey));
}

/*
 * helper functions
 */
//checks if mandatory data is present
function checkParams(&$data, $params)
{
    global $uiLang;
    global $returnData;
    if (!$params || count($params) == 0) {
        return;
    }
    foreach ($params as $key) {
        if (!isset($data[$key])) {
            $returnData['error'] = $uiLang->translate("Error: missing parameter '$key'!");
            die();
        }
    }
}

/*
 * This is used to encode associative arrays to JSON string in order to save it to the database.
 * If an empty array is sent, PHP will not recognize that it should be an associative array
 * and thus encode it as a normal array which will end up as an Array rather than an Object
 * when decoded in Javascript, which will cause problems.
 * That's why it uses the JSON_FORCE_OBJECT flag to force empty arrays to be encoded as Objects rather than Arrays.
 *
 * Usage example:
 *		encodeData($data, array('options', 'settings'));
 *
 * In this example we are sending the $data array by reference and tell it to replace the contents of the
 * key 'options' and the key 'settings' by their respective JSON encoded forms.
 */
function encodeData(&$data, $params)
{
    if (!$params || count($params) == 0) {
        return;
    }
    foreach ($params as $key) {
        if (isset($data[$key])) {
            $data[$key] = json_encode($data[$key], JSON_FORCE_OBJECT);
        }
    }
}


// this will always be called when the script ends even if a fatal error occurred
// it encodes the $returnData to JSON and it adds an error message if a fatal PHP error occurred
// this error message is registered under the 'fatalError' key and includes the file name of the PHP script and the line number of the error
// all other errors (e.g. database) were registere under the 'error' key
function outputJSON()
{
    global $returnData, $action, $myAuth;

    // set superadmin check value
    $returnData['isSuper'] = $myAuth->checkSA();

    // updated username
    global $myAuth;
    $returnData['loggedInName'] = $myAuth->username;

    if (!isset($returnData['action'])) $returnData['action'] = $action;
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
