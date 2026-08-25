<?Php

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

require_once __DIR__ . "/../../../inc/phpmailer/Exception.php";
require_once __DIR__ . "/../../../inc/phpmailer/PHPMailer.php";
require_once __DIR__ . "/../../../inc/phpmailer/SMTP.php";

header("Cache-Control: no-cache, no-store, must-revalidate");

// TODO: createUser in api/createUser/index.php needs to be updated to require email (?) - consult with Ricky

/**
 * Fail n' Kick function when something doesn't check out
 *
 * @param  String $msg
 * @return void
 */
function failKick(String $msg): void
{
	global $uiLang;
	if ($msg === "") $msg = $uiLang->translate("Unauthorized access attempt logged.");
	unset($_SESSION['smt']);
	echo "<script>window.history.replaceState(null, null, window.location.href);</script>\n"; // prevent data repost
	echo "<script>window.rview = 'm';</script>\n"; // set return to be a message display
	echo "<script>window.errmsg = \"$msg\";</script>\n"; // set return to be a message display
	// TODO: log here
}

/**
 * modified oasys root url function for this file only
 *
 * @return String
 */
function getOasysRoot(): String
{
	// Windows file system slash fix
	$fullOAroot = str_replace("\\", "/", realpath(__DIR__ . "/../../../"));
	$fullOAroot = (substr($fullOAroot, -1, 1) != "/") ? $fullOAroot . "/" : $fullOAroot;
	$webRoot = ($_SERVER['CONTEXT_DOCUMENT_ROOT'] ?? $_SERVER['DOCUMENT_ROOT']);

	// if the app root is the same as server root, we want '/' to be the rootURL value in settings, otherwise, the diff between the two
	$updatedRootURL = ($fullOAroot == $webRoot) ? "/" : str_split($fullOAroot, strlen($webRoot));
	$updatedRootURL = $updatedRootURL[1] ?? $updatedRootURL[0];

	// string checks and fixes
	$updatedRootURL = trim($updatedRootURL);
	$updatedRootURL = (substr($updatedRootURL, 0, 1) != "/") ? "/" . $updatedRootURL : $updatedRootURL;
	$updatedRootURL = (substr($updatedRootURL, -1, 1) != "/") ? $updatedRootURL . "/" : $updatedRootURL;

	return $updatedRootURL;
}

/**
 * Function to generate cryptographically secure 6 digit code (with possible leading zero)
 *
 * @return String
 */
function genSecCode(): String
{
	$code = "";
	for ($i = 0; $i < 6; $i++) {
		$code .= random_int(0, 9);
	}
	return $code;
};

/**
 * initialize SMTP connection values prior to email transmission
 *
 * @param  String $oru
 * @param  PHPMailer $mail
 * @param  String $email
 * @param  rixPDO $db
 * @return void
 */
function initSMTP(String $oru, PHPMailer &$mail, String $email, rixPDO &$db): void
{
	global $emSysData, $uiLang;
	require_once "../inc/php/Crypt.php";
	$mail->isSMTP();

	$emHost = $db->fetchValue("SELECT `value` FROM `settings` WHERE `option`='SMTP_Host'", [])['data'];
	$emPort = $db->fetchValue("SELECT `value` FROM `settings` WHERE `option`='SMTP_Port'", [])['data'];
	$emFrom = $db->fetchValue("SELECT `value` FROM `settings` WHERE `option`='SMTP_From'", [])['data'];
	$emUser = in_array("SMTP_Username", $emSysData) ? $db->fetchValue("SELECT `value` FROM `settings` WHERE `option`='SMTP_Username'", [])['data'] : "";
	$emPass = in_array("SMTP_Password", $emSysData) ? $db->fetchValue("SELECT `value` FROM `settings` WHERE `option`='SMTP_Password'", [])['data'] : "";
	$emPass = Crypt::decryptString($emPass);
	$emEnc = $db->fetchValue("SELECT `value` FROM `settings` WHERE `option`='SMTP_Encryption'", [])['data'];
	if (empty($emEnc)) $emEnc = 0;

	switch ($emEnc) {
			// no encryption
		case 0:
			$mail->SMTPAuth = false;
			$mail->SMTPOptions = [
				'ssl' => [
					'verify_peer' => false,
					'verify_peer_name' => false,
					'allow_self_signed' => true
				]
			];
			break;

			// implicit SSL/TLS
		case 1:
			$mail->SMTPAuth = true;
			$mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
			break;

			// upgradable SSL/TLS
		case 2:
			$mail->SMTPAuth = true;
			$mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
			break;

		default:
			failKick($uiLang->translate("System unavailable or misconfigured. Please notify the Oasys system administrator."));
			return;
	}

	$mail->isHTML(true);
	$mail->Host = $emHost;
	$mail->Port = $emPort;
	$mail->Username = $emUser ?? "";
	$mail->Password = $emPass ?? "";
	$mail->setFrom($emFrom, "noreply");
	$mail->addAddress($email);
	$mail->CharSet = "UTF-8";
	$mail->Encoding = "base64"; // use with utf-8, otherwise it could be problematic
}

function doCodeMail($oru, String $email, String $sendcode, rixPDO &$db): ?bool
{
	global $login, $uiLang;
	$mail = new PHPMailer(true);
	initSMTP($oru, $mail, $email, $db); // initialize SMTP vars in preparation to send message

	$mail->Subject = $uiLang->translate("Requested Account Reset from Oasys");
	$yciStr = $uiLang->translate("Your code is");
	$mail->Body = "<code style='font-size: 14pt;'>{$yciStr}: <strong>$sendcode</strong></code><br>";
	$emLidStr = $uiLang->translate("Your Oasys login id is");
	if (!is_null($login) && array_key_exists("f_username", $_POST)) $mail->Body .= "<code style='font-size: 14pt;'>{$emLidStr}: <code style='font-size: 14pt;'><strong>$login</strong></code>";

	try {
		$mail->send();
	} catch (Exception $e) {
		session_destroy();
		failKick($uiLang->translate("Sorry, message could not be sent! Please try again later, or notify the Oasys System Administrator."));
		return false;
	}
	return null;
}

$oasysRootURL = getOasysRoot();
$rs_count = $_SESSION['emr_resend_count'] ?? 0; // set default resend count (non-reset mode) for login page

if (
	!(isset($_POST['emr_active'])
		&& isset($_POST['emr_active'])
		// && !empty($_COOKIE['PHPSESSID']) // check for normal phpsessid being set first from the index page
		&& str_ends_with($_SERVER['REQUEST_URI'], "editor/index.php"))
) {
	# --------------------------------------- #
	# normal mode start (standard login page) #
	# --------------------------------------- #
	echo "<script>window.rview = 1;</script>\n";
	// setcookie("PHPSESSID_EMR", "", time() - 3600, $oasysRootURL); // revoke any previously set sessions on the client from recovery mode attempts
	return;
}

# ---------------- #
# reset mode start #
# ---------------- #

# standard includes #
require_once("../inc/php/dbSessionHandler.php");
require_once "../inc/php/database.php";
require_once "../inc/php/rixPDO.php";
require_once 'uiLang.php'; // required for translation inclusion

$lang = substr($_POST['lang'], 0, 2) ?? "EN"; // no matter if this field is hacked/modified/attempting to use injection, we only care about the first 2 chars!
$settings['rootURL'] = getOasysRoot(); // fake-ass settings key so that the uiLang class will initalize
$uiLang = new uiLang($lang);

// init DB class
$db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, '../logs/acctreset_errors.log', 1, $returnData, 'error');

// custom db session handling
$sessionHandler = new dbSessionHandler($sql_db, $sql_user, $sql_password, $sql_host, '../logs/sessionHandler_acctreset_errors.log', 'authKeyGen');
session_set_save_handler($sessionHandler, true);

// start session if an actual reset request (or resend code)
session_name("PHPSESSID_EMR");
session_start(['cookie_path' => $oasysRootURL, 'cookie_httponly' => true]);

# email system active check (skips 'settings' include -- just an absolute headache) #
$emSysData = $db->fetchColumn("select option from settings", [])['data'];
$emSysActive = in_array("emailSysActive", $emSysData) && in_array("SMTP_Host", $emSysData) && in_array("SMTP_Port", $emSysData) && in_array("SMTP_From", $emSysData);

if ($emSysActive !== true) {
	failKick($uiLang->translate("System unavailable or misconfigured. Please notify the Oasys system administrator."));
	return;
}

# emr flag must be set, or not a valid request of any sort #
if (!isset($_POST['emr_active'])) {
	failKick($uiLang->translate("Malformed request."));
	return;
}

# email validation/sanitation #
$email = emCheck($_POST['emr_addr'] ?? $_SESSION['email'] ?? "bad_session");
if ($email === false) {
	failKick($uiLang->translate("Malformed request."));
	return;
}

# check if email exists in system; assign login (name) value if user exists #
$realUser = ($db->fetchValue("SELECT COUNT(*) FROM `users` WHERE `email` = ?", [$email])['data'] === 1) ? true : false;
$login = $realUser ? $db->fetchValue("SELECT `name` FROM `users` WHERE `email` = ?", [$email])['data'] : null;

# get db data for existing requests #
$dbdata = $db->fetchValue("SELECT `resetdata` FROM `users` WHERE `email` = ?", [$email])['data'] ?: "{}";
$dbdata = json_decode($dbdata, true);

# catch if previous submission flag is active (used in timestamp validation to prevent hammering) #
$prevsub = $_SESSION['prevsub'] ?? $dbdata['prevsub'] ?? false;

# get the timestamp value for comparison usage #
$ts_val = $dbdata['timestamp'] ?? $_SESSION['ts'] ?? 9999999999;

# kick out if trying to reset same email within 10 minutes, and the post request is NOT a request to re-send code #
if (isUnder10mins($ts_val) && $_POST['emr_active'] === "0" && $prevsub === true) {
	failKick($uiLang->translate("Please wait 10 or more minutes before submitting a new request."));
	return;
}

$_SESSION['ts'] = time();
$_SESSION['email'] = $email;

// precheck for duplicates, bail if found
if (emDupCheck($email, $db) !== true) {
	failKick($uiLang->translate("This account is not eligible for email operations. Please contact the Oasys system administrator for further assistance."));
	return;
}

# switch which function to call based on request type (0 = initial req; 1 = resend req; 2 = code submission) #
switch ($_POST['emr_active']) {
	case '0':
		# initial request; code generation and send email routine #
		geninitcode($oasysRootURL, $db, $login, $email, $realUser);
		break;

	case '1':
		# resend code email routine #
		resendcode($oasysRootURL, $db, $dbdata, $realUser);
		break;

	case '2':
		# code submission and validation routine #
		codecheck($oasysRootURL, $db);
		break;

	case '3':
		newpwdset($oasysRootURL, $db);
		break;

	default:
		failKick($uiLang->translate("Malformed request."));
		break;
}

/**
 * Regenerate a new code and resend through email
 */
function resendcode($oru, rixPDO &$db, $dbdata, $realUser)
{
	global $rs_count, $uiLang;
	echo "<script>window.rview = 2;</script>\n";

	// validate post source
	secCheck($oru, 2);
	$_SESSION['smt'] = 1;
	$email = $_SESSION["email"];

	// validate user is within time constraint
	if (passcodeTimeChecker($oru, $db, $realUser, $dbdata, $email) === false) return;

	// create counter for how many times user tried to resend code (limit to 3)
	if (!isset($_SESSION['emr_resend_count'])) {
		$_SESSION['emr_resend_count'] = 1;
	} else {
		$_SESSION['emr_resend_count']++;
		if ($_SESSION['emr_resend_count'] === 3) echo "<script>let rs_over = true;</script>\n";
		if ($_SESSION['emr_resend_count'] > 3) {
			failKick($uiLang->translate("Exceeded code resend limit. Aborting reset request and logging action."));
			return;
		}
		if ($realUser && ($_SESSION['emr_resend_count'] !== ($dbdata['resends'] + 1))) {
			failKick($uiLang->translate("Malformed request."));
			return;
		}
	}

	$rs_count = 3 - $_SESSION['emr_resend_count'];
	$resends = $_SESSION['emr_resend_count'];
	echo "<script>\n";
	echo "window.rs_count = $rs_count;\n";
	echo "</script>\n";

	if (!$realUser) return; // next set of code is for existing users, so we exit silently if email doesn't exist

	# reinit and resend code #
	$newcode = genSecCode();
	$hashedCode = password_hash($newcode, PASSWORD_DEFAULT);
	$res = $db->execute("UPDATE `users` SET `resetdata` = JSON_REPLACE(`resetdata`, '$.secCode', '$hashedCode', '$.resends', $resends) WHERE `email` = ?", [$email]);

	if ($res["error"] !== false) {
		failKick($uiLang->translate("Something went wrong. Please try again later."));
		return;
	}
	$_SESSION['prevsub'] = true;
	doCodeMail($oru, $email, $newcode, $db);
}

/**
 * Generate initial reset code for requesting user and send via email
 */
function geninitcode(String $oru, rixPDO &$db, String|null $login, String $email, bool $realUser)
{
	global $uiLang;
	secCheck($oru, 0); // generic security check; SMT step validation and incrementation

	# IFF username was forgotten, do an email without any codes/etc., notify, and exit #
	if (array_key_exists("f_username", $_POST) && !array_key_exists("f_password", $_POST)) {
		onlyLoginMail($oru, $email, $db, $realUser, $login);
		return;
	}

	# only do real stuff if a 'real user', meaning 1 exact email addr value match #
	if ($realUser) {

		# get the account type (local, or other) #
		$acctType = $db->fetchValue("SELECT `acct_type` FROM `users` WHERE `email` = ?", [$email])['data'];

		# special operation for when acct is not local #
		if ($acctType !== "LOCAL") {

			echo "<script>window.history.replaceState(null, null, window.location.href);</script>\n"; // prevent data repost client-side

			$sCols = $db->fetchColumn("select option from settings", [])['data'];
			$urlRedir = (in_array("reset_LDAP_Redirect", $sCols)) ? $db->fetchValue("SELECT `value` FROM `settings` WHERE `option` = 'reset_LDAP_Redirect'", [])['data'] : null;

			// url redirect info not configured
			if (is_null($urlRedir)) {

				failKick($uiLang->translate("Oasys is not configured to redirect you to your account reset information page. Please contact the system administrator."));

				return;
			} else {
				// url redirect info

				$redirString = $uiLang->translate("Please click this text for more information on resetting your account credentials.");

				echo "<script>window.history.replaceState(null, null, window.location.href);</script>\n"; // prevent data repost
				echo "<script>window.rview = 'm';</script>\n"; // set return to be a message display
				echo "<script>window.goodmsg = \"\";</script>\n";
				echo "<script>window.goodmsg = \"<a style='color: blue; text-decoration: none;' href='$urlRedir' target='_blank' rel='noopener noreferrer'>$redirString</a>\";</script>\n"; // set return to be a message display

			}

			// handle username request, if requested
			if (array_key_exists("f_username", $_POST)) {
				onlyLoginMail($oru, $email, $db, $realUser, $login, true);
				$olmsg = $uiLang->translate("Your login username has been emailed to the address provided.");
				echo "<script>window.goodmsg += \"$olmsg\"</script>\n";
			}

			return;
		}

		$secCode = genSecCode();
		$hashedCode = password_hash($secCode, PASSWORD_DEFAULT);
		$resetUpdateData = [
			"secCode" => $hashedCode,
			"timestamp" => $_SESSION['ts'],
			"resends" => 0,
			"sid" => session_id(),
			"prevsub" => true
		];

		$dbInsJSON = json_encode($resetUpdateData);
		$db->update("users", ["resetdata" => $dbInsJSON], "email = ?", [$email]);
		if (doCodeMail($oru, $email, $secCode, $db) === false) return;
	}
	$_SESSION['prevsub'] = true;
	echo "<script>window.rview = 2;</script>\n";
	echo "<script>window.rs_count = 3;</script>\n";
}

/**
 * Check the code being sent in for validity
 *
 * @param  String $oru The Oasys relative root path
 * @param  rixPDO &$db
 * @return void
 */
function codecheck(String $oru, rixPDO &$db): void
{
	global $rs_count, $uiLang;
	echo "<script>window.rview = 2;</script>\n";

	secCheck($oru, 3);
	$email = $_SESSION['email'];
	$realUser = true;

	# get reset JSON data #
	$dbdata = $db->fetchValue("SELECT `resetdata` FROM `users` WHERE `email` = ?", [$email])['data'];
	if (empty($dbdata)) {
		$realUser = false;
		$dbdata = "{}";
	}

	$dbdata = json_decode($dbdata, true);

	// validate user is within time constraint
	if (passcodeTimeChecker($oru, $db, $realUser, $dbdata, $email) === false) return;

	# init code submission attempt counter #
	if (!isset($_SESSION['codesubs'])) $_SESSION['codesubs'] = 0;
	$_SESSION['codesubs']++;

	# check for exceeded code submission limit #
	if ($_SESSION['codesubs'] > 3) {
		failKick($uiLang->translate("Exceeded code attempts. Please try again after 10 minutes."));
		return;
	}

	# no more processing for non-real users #
	if (!$realUser) {
		$_SESSION['smt'] = 2;
		return;
	}

	$submitted = trim($_POST['subcode']);

	# validate input #
	if (preg_match("/^[0-9]{6}$/", $submitted) !== 1) {
		failKick($uiLang->translate($uiLang->translate("Malformed request.")));
		return;
	}

	# code verification	for an existant user #
	if (password_verify($_POST['subcode'], $dbdata['secCode']) !== true) {
		# CODE FAIL!
		$count = 3 - $rs_count;
		printf('<script>window.rs_count = %d;</script>' . "\n", $count);

		$_SESSION['smt'] = 1;
		echo "<script>window.bcta = true;</script>\n";
		return;
	} else {
		# CODE SUCCESS! -- set the next view variable for the page reload #
		echo "<script>window.rview = 3;</script>\n";
	}
}

/**
 * Given a UNIX epoch timestamp, check if within 10 minute window
 *
 * @param  Int $entryTime
 * @return bool
 */
function isUnder10mins(Int $entryTime): Bool
{
	if ((abs(time() - $entryTime)) < 600) return true;
	return false;
}

/**
 * 2nd generic XSS security check (after initial check at top)  
 * Also checks for data repost attempts, and bails if found
 *
 * @param  String $oru The relative root path for the oasys instance
 * @param  Int $smt The reset stage to check for and set to avoid data reposts
 * @return void
 */
function secCheck(String $oru, Int $smt): void
{
	global $uiLang;
	if (!str_ends_with(get_required_files()[0], "editor/index.php")) {
		failKick("");
		return;
	}

	if ($smt === 0) {
		if (isset($_SESSION['smt'])) {
			failKick($uiLang->translate("Something went wrong. Please clear your cookies, reload the page, and try again."));
			return;
		}
		$_SESSION['smt'] = 1;
	} else {
		if (!isset($_SESSION['smt'])) {
			failKick("");
			return;
		}
		if ($_SESSION['smt'] === $smt) {
			failKick($uiLang->translate("Something went wrong. Please clear your cookies, reload the page, and try again."));
			return;
		}
		$_SESSION['smt'] = $smt;
	}
}

/**
 * Email cleaner and validator
 *
 * @param  String $emaddr
 * @return String|Bool
 */
function emCheck(String $emaddr): String|Bool
{
	$e = htmlspecialchars(trim($emaddr), ENT_QUOTES, "UTF-8"); // convert and neutralize any tags or special chars not intended for an email address
	$e = filter_var($e, FILTER_VALIDATE_EMAIL); // validate that it's a conforming email address (returns string if true, bool false if failed)
	return $e;
}

/**
 * Handles the POST for the new password for the resetting user, and redirects back to login page
 *
 * @param  String $oru
 * @param  rixPDO &$db
 * @return void
 */
function newpwdset(string $oru, rixPDO &$db): void
{
	global $uiLang;
	// set email value as primary key to perform password update
	$email = $_SESSION['email'];

	// validate pwd inputs

	$p1 = password_hash($_POST['pwd1'], PASSWORD_DEFAULT);
	if (strlen($_POST['pwd1']) > 50 || strlen($_POST['pwd1']) <= 3 || ($_POST['pwd1'] !== $_POST['pwd2'])) {
		failKick("");
		return;
	}

	// re-check hidden session params
	secCheck($oru, 4);

	// update password in users table
	$db->update("users", ["password" => $p1], "email = ?", [$email]);


	// session, table resetdata, and cookie cleanup
	setcookie("PHPSESSID_EMR", "", time() - 3600, $oru);
	session_destroy();
	$db->update("users", ["resetdata" => null], "email = ?", [$email]);

	// redirect back to login page with header (and refresh delay with message to try new password)
	echo "<script>window.history.replaceState(null, null, window.location.href);</script>\n"; // prevent data repost
	echo "<script>window.rview = 'm';</script>\n"; // set return to be a message display
	$npmsg = $uiLang->translate("New password set! Please login with your new password.");
	echo "<script>window.goodmsg = \"$npmsg\";</script>\n"; // set return to be a message display
}

/**
 * send only the login value when requested w/out password reset
 *
 * @param  String $oru
 * @param  String $email
 * @param  rixPDO $db
 * @param  Bool $realUser
 * @param  Bool $bypassMsg
 * @return void
 */
function onlyLoginMail(String $oru, String $email, rixPDO &$db, bool $realUser, String|null $uname, bool $bypassMsg = false): void
{
	global $uiLang;
	unset($_SESSION['smt']);

	if ($realUser) {
		# send out mail #
		$mail = new PHPMailer(true);
		initSMTP($oru, $mail, $email, $db); // initialize SMTP vars in preparation to send message
		$mail->Subject = $uiLang->translate("Requested Account Information from Oasys");
		$emLidStr = $uiLang->translate("Your login ID is");
		$mail->Body .= "<code style='font-size: 14pt;'>{$emLidStr}: <strong>$uname</strong></code>";

		try {
			$mail->send();
		} catch (Exception $e) {
			session_destroy();
			failKick($uiLang->translate("Sorry, message could not be sent! Please try again later, or notify the Oasys System Administrator."));
			return;
		}

		// set timestamp in DB to prevent hammering from a different session cookie
		$dbInsJSON = json_encode(["timestamp" => time(), "prevsub" => true]);
		$db->update("users", ["resetdata" => $dbInsJSON], "name = ?", [$uname]);
		$_SESSION['prevsub'] = true;
	}

	if ($bypassMsg === false) {
		echo "<script>window.history.replaceState(null, null, window.location.href);</script>\n"; // prevent data repost
		echo "<script>window.rview = 'm';</script>\n"; // set return to be a message display
		$emmsg = $uiLang->translate("If we have a record of your email address in our system, you will receive a message containing your login information.");
		echo "<script>window.goodmsg = \"$emmsg\";</script>\n"; // set return to be a message display
	}
}

function passcodeTimeChecker($oru, &$db, $realUser, $dbdata, $email): Bool
{
	global $uiLang;
	# check for exceeding 10 min timeout #
	$time2use = $realUser ? $dbdata['timestamp'] : $_SESSION['ts'];

	if (isUnder10mins($time2use) === false) {
		# reset the resetdata column for the user when code timeout expired, when an actual user! #
		if ($realUser === true) $db->update("users", ['resetdata' => NULL], "email = ?", [$email]);
		failKick($uiLang->translate("Passcode timeout has expired. Please restart the code reset process."));
		return false;
	} else {
		return true;
	}
}

function emDupCheck(String $email, rixPDO &$db)
{
	$dupres = $db->fetchColumn("SELECT `email`, count(`email`) FROM `users` GROUP BY `email` HAVING count(`email`) > 1", [])['data'];

	// check for 2 or more email accounts associated with an account
	if (in_array($email, $dupres)) return false;
	return true;
}
