<?php

require_once __DIR__ . "/../../../inc/php/OasysFrontendState.php";

use \OASYS\Frontend\OasysFrontendState;

/**
 * User authentication operations for Oasys editor (backend) system.
 * @author NILANJAN NAG
 */
class userAuth
{
	# --------------------------- #
	# Standard class declarations #
	# --------------------------- #

	public $sid = null;
	private $db = null;
	public $authResult = null;
	public $username = "";
	public $userid = -999;
	public $usergroup = [];
	public $roles = [];
	public $email = "";
	public $returnData = null;
	private $echoSuppress = null;
	private $cookiePath = "";
	private const schemaFiles = ['inc/js/perm_items.json', 'inc/js/perm_items_generic.json']; // list of file based schema definitions used for permission structures

	private $uiLang = null; // translation class instance

	// constant declaration for bad password threshold checking
	const MAX_BADPWD_COUNT = 20;
	const MAX_TIME4_BADPWD = 300; // definition value is in seconds; 300 = 5 mins

	public function __construct(bool $noOutput = false)
	{
		# ----------------------------------------------- #
		# Register Shutdown Function and Return Data Init #
		# ----------------------------------------------- #
		register_shutdown_function([$this, 'responseAndExit']);
		$this->returnData['error'] = false; //if there is an error, this will contain a string with the error message

		global $settings;
		// if using output buffer, uncomment line below and line at end of file
		// ob_start();

		// set default JSON output, or not
		$this->echoSuppress = $noOutput;

		// define DOCROOT constant
		if (!defined("DOCROOT")) define("DOCROOT", str_replace("//", "/", ($_SERVER['CONTEXT_DOCUMENT_ROOT'] ?? $_SERVER['DOCUMENT_ROOT']) . $settings['rootURL']));

		// This will also make avilable database credentials, settings and language information
		global $sql_db, $sql_user, $sql_password, $sql_host;

		// define master cookie path for class
		$this->cookiePath = $settings['JSrootURL'];

		// init db class object - sql login vars populated from settings.php call
		$this->db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, DOCROOT . "logs/userauth_db_err.log", 1, $this->returnData, 'error');

		# ------------------- #
		# Translation Include #
		# ------------------- #
		require_once DOCROOT . "editor/inc/php/uiLang.php"; // required for translation inclusion
		$this->uiLang = new uiLang($settings['interfaceLanguage']);

		# ------------- #
		# Session Inits #
		# ------------- #

		// check if cookie is set yet, and if not, assign a value
		if (!isset($_COOKIE['PHPSESSID'])) {
			try {
				$rndb = random_bytes(16);
			} catch (Error $e) {
				$this->killSession($this->uiLang->translate("Unable to generate random session ID string:") . " " . $e->getMessage(), true);
				$this->echoSuppress = true;
				return;
			} catch (Exception $ex) {
				$this->killSession($this->uiLang->translate("Unable to generate random session ID string:") . " " . $ex->getMessage(), true);
				$this->echoSuppress = true;
				return;
			}

			if (session_status() !== PHP_SESSION_ACTIVE) {
				session_id(bin2hex($rndb));
			}
		}

		if (session_status() !== PHP_SESSION_ACTIVE) {

			// main session start after clearing conditions above
			if (session_status() === 1) $prevSesh = $_SESSION;
			$sessionHandler = new dbSessionHandler($sql_db, $sql_user, $sql_password, $sql_host, DOCROOT . 'logs/sessionHandler_errors.txt', 'userAuth');
			session_set_save_handler($sessionHandler, true);
			session_start(['cookie_path' => $this->cookiePath, 'cookie_httponly' => true]);
			if (isset($prevSesh)) $_SESSION = $prevSesh;
		}
		$this->sid = session_id();

		# --------------------------------------------- #
		# Set class scoped user variables if they exist #
		# --------------------------------------------- #

		// $this->username = $_SESSION['username'] ?? "";
		$this->userid = $_SESSION['userid'] ?? -999;
		$this->username = $this->getUsername($this->userid) ?? "";
		$this->usergroup = $_SESSION['usergroup'] ?? [];
		$this->roles = $_SESSION['roles'] ?? [];
		$this->email = $_SESSION['email'] ?? "";

		# --------------- #
		# Action routines #
		# --------------- #

		// set action value in our data return array
		$this->returnData['action'] = $_POST['action'] ?? '';

		if (isset($_SESSION['SSOloginTrigger']) && ($_SESSION['SSOloginTrigger'] === true)) $this->returnData['action'] = "login";

		if (!in_array($this->returnData['action'], ['login', 'check', 'logout'])) {
			$this->echoSuppress = true;
		}

		// determine functions to call baesd on sent action request value
		switch ($this->returnData['action']) {
				# --------------------- #
				# JS Login Call Handler #
				# --------------------- #
			case 'login':
				/** @var array|bool $loginInputs Array containing username/password when submission is valid, otherwise boolean 'false' if non-conforming */
				$loginInputs = $this->loginPrecheck();

				// validate and parse all of our input data from client AJAX call
				if ($loginInputs === false) {
					// if parser returns false, the JSON structure was bad or user inputs did not conform to restrictions
					$this->killSession($this->uiLang->translate("Incorrect credentials."), true);
					return;
				}

				// some post-login verifications (maint. mode check, etc)
				extract($loginInputs);
				$this->outerLogin($username, $password); // standard local login routine

				break;

				# ----------------------- #
				# JS access check handler #
				# ----------------------- #
			case 'check':
				$this->check();
				break;

			case 'logout':
				$this->logout();
				break;
		}
	}

	/**
	 * Validate some basic assumptions for user/pass and system state prior to starting actual real login routine.
	 *
	 * @param string|null $username Submitted username
	 * @param string|null $password Submitted password
	 * 
	 * @return void
	 * 
	 */
	private function outerLogin(?string $username, ?string $password): void
	{
		// required for front/backend active login checking
		require_once "inc/php/systemState.php";

		// check for maintenance mode, block login if maint mode active
		$sstate = get_mmode("backend", $this->db);

		// get uid ahead of time for superadmin check in next lines; usually class object uid not instantiated at this point in the code
		// the if statement also bypasses the login block for all superadmins, so only superadmins can login when in maint mode
		$uid = $this->db->fetchValue("SELECT `id` FROM `users` WHERE `name` = ?", [$this->username])['data'];
		if ($sstate === true && $this->checkSA($uid) === false) {
			$this->killSession($this->uiLang->translate("System is currently in maintenance mode. Please try again later."), true);
		}

		// call login method after initial input validation/sanitation/maintenance check have passed
		$loginAttempt = $this->loginAuthValidation($username, $password);
		if ($loginAttempt === true) {
			// log successful authentication
			$this->returnData['returnMsg'] = $this->uiLang->translate("User has been successfully logged in.");

			// clear out the users.resetdata column for the user to keep things nice n' tidy
			$this->db->update("users", ['resetdata' => null], "id = ?", [$uid]);
		} else {
			$this->killSession($loginAttempt, true);
		}
	}

	/**
	 * Session/authentication consistency checking which is performed on any/all action calls.
	 *
	 * @return void
	 * 
	 */
	private function check(): void
	{
		// check if session has valid auth
		$authResult = $this->getAuthResult();
		if (($authResult !== true) && (!empty($_SESSION['username']))) {
			$this->writeLogEntry("BAD SESSION: {$authResult}");
			$this->killSession($authResult);
		}

		// check that our user account is active/enabled and return array of available languages
		// FYI: This particular condition would probably only occur when the login page is reloaded after account disable and before logout
		if ((!empty($this->username)) && ($this->checkAcctEnabled($this->userid) === false)) {
			$this->killSession($this->uiLang->translate("Account has been disabled."), true);
		}

		// return list of languages
		// $this->returnData['langs'] = $languages; //FYI: instead of using the full set of langs in the DB, we set a hard-coded set back for editor
		$this->returnData['langs'] = ['DE' => 'DE', 'EN' => 'EN', 'FR' => 'FR'];


		// get and return editor button list
		$eList = [];
		$eListRes = [];

		$ugIds = $this->usergroup;
		$this->returnData['ugroups'] = $ugIds;

		// iterate the editor button list based on usergroup IDs
		foreach (array_values($ugIds) as $userGroupId) {
			$eListRes = json_decode($this->db->fetchValue("SELECT JSON_QUERY(`accessDef`, '$.editorButtons') FROM `userGroups` WHERE id = ?", [$userGroupId])['data'] ?? '', true);

			// failsafe for blank accessDef column for superadmin
			if (is_null($eListRes) && $this->checkSA() === true) {
				$a = [];
				$b = [];
				$tempDef = getDefaultSettings($this->db, $a, $b);

				$edtbtnJSON = [];
				foreach (array_keys($tempDef['editorButtons']['choices']) as $editorKey) {
					$edtbtnJSON[$editorKey]	= true;
				}

				$edtbtnJSON = json_encode($edtbtnJSON);

				$this->db->update("userGroups", ['accessDef' => '{"editorButtons": ' . $edtbtnJSON . '}'], "name = ?", ['superadmin']);
				$eListRes = json_decode($this->db->fetchValue("SELECT JSON_QUERY(`accessDef`, '$.editorButtons') FROM `userGroups` WHERE id = ?", [$userGroupId])['data'] ?? '', true);
			}

			foreach ($eListRes as $eName => $eVal) {
				if ($eVal === true && (!in_array($eName, $eList))) array_push($eList, $eName);
			}
		}

		$this->returnData['editors'] = $eList;

		// return selected language (if any)
		$defLang = $this->db->fetchValue("SELECT `defLang` FROM `users` WHERE `id` = ?", [$this->userid])['data'];
		$this->returnData['defLang'] = $defLang;

		// return email
		$this->returnData['email'] = $this->db->fetchValue("SELECT `email` FROM `users` WHERE `id` = ?", [$this->userid])['data'];
	}

	/**
	 * Final session logout routine for backend.
	 *
	 * @return void
	 * 
	 */
	private function logout(): void
	{
		$this->writeLogEntry("USER ACTION: User logged out.");
		$this->killSession($this->uiLang->translate("User has been logged out."));

		if (isset($_SESSION['SSOUserName'])) $this->returnData['SSOlogout'] = true;
	}

	/**
	 * Check if session has access to a particular module/editor
	 *
	 * @param string $editorId
	 * 
	 * @return bool When session has access to the editor id being checked, boolean 'true' is returned, otherwise, boolean 'false'
	 * 
	 */
	public function getEditorResult(string $editorId): bool
	{
		foreach ($this->usergroup as $userGroupId) {
			$eListRes = $this->db->fetchValue("SELECT JSON_VALUE(`accessDef`, '$.editorButtons.$editorId') FROM `userGroups` WHERE id = ?", [$userGroupId])['data'];

			if ($eListRes === "1") return true;
		}

		return false;
	}

	/**
	 * Publicly available authorisation status return for current session.
	 * If 'true' is not returned, a string is returned containing the reason why the session is not authenticated.
	 * 
	 *
	 * @param bool $noEcho Whether or not to echo out at the shutdown handler part of the stack.
	 * 
	 * @return string|bool
	 * 
	 */
	public function getAuthResult(bool $noEcho = false): string|bool
	{
		// for Php calls, we want to supress the JSON echo, which is set via boolean argument for the method
		if ($noEcho === true) {
			$this->echoSuppress = true;
		}

		// if no authStatus is defined for this session, return false (probably session expiration condition)
		if (!isset($_SESSION['authStatus'])) {
			return $this->uiLang->translate("No valid session was found. Please log in again.");
		}

		// if authStatus is set and it's not set to true, return message indicating that user is actively not authenticated
		if (isset($_SESSION['authStatus']) && ($_SESSION['authStatus'] !== true)) {
			return $this->uiLang->translate("User is not logged in.");
		}

		// if authStatus is set but the account has been disabled prior to logoff, return disabled account message
		if ($this->checkAcctEnabled($this->userid) !== true) {
			return $this->uiLang->translate("Account has been disabled.");
		}

		return true;
	}

	/**
	 * setter for user authentication value
	 *
	 * @param bool|string $auth
	 * 
	 * @return void
	 * 
	 */
	private function setAuthResult(bool|string $auth): void
	{
		$_SESSION['authStatus'] = $auth;
		$this->authResult = $auth;
	}

	/**
	 * setter for username
	 *
	 * @param string $username
	 * 
	 * @return void
	 * 
	 */
	private function setUsername(string $username): void
	{
		$_SESSION['username'] = $username;
		$this->username = $username;
	}

	/**
	 * getter for username (sourced from DB)
	 *
	 * @param int $uid
	 * 
	 * @return string|null
	 * 
	 */
	public function getUsername(int $uid): ?string
	{
		if ($uid === -999) return null;
		$realUsername = $this->db->fetchValue("SELECT `name` FROM `users` WHERE id = ?", [$uid])['data'];
		return $realUsername;
	}

	/**
	 * Force resync of group-based editor button list to master editor list.
	 *
	 * @return bool
	 * 
	 * @todo // TODO: implement some form of error catching in case of bad DB data
	 * 
	 */
	public function forceEditorSync(): bool
	{
		global $settingsDefaults;

		$masterEBlist = $settingsDefaults['editorButtons']['choices'];

		$ugList = $this->db->fetchColumn("SELECT `id` FROM `userGroups`", [])['data'];

		foreach ($ugList as $userGroupId) {

			$groupEBlist = json_decode(
				$this->db->fetchValue("SELECT `accessdef` FROM `userGroups` WHERE `id` = ?", [$userGroupId])['data'] ?? '',
				true
			)['editorButtons'];

			// setup JSON shell if the accessDef col is null
			if (is_null($groupEBlist)) {
				$this->db->execute("UPDATE `userGroups` SET `accessDef` = '{}' WHERE `id` = ?", [$userGroupId]);
				$this->db->execute("UPDATE `userGroups` SET `accessDef` = JSON_SET(`accessDef`, '$.editorButtons', JSON_OBJECT()) WHERE `id` = ?", [$userGroupId]);

				// refresh group editor button list
				$groupEBlist = json_decode(
					$this->db->fetchValue("SELECT `accessdef` FROM `userGroups` WHERE `id` = ?", [$userGroupId])['data'] ?? '',
					true
				)['editorButtons'];
			}

			// EB SYNC I: ADD GROUP EDITOR ITEMS ADDED TO MASTER LIST
			foreach (array_keys($masterEBlist) as $mKey) {
				if (empty($groupEBlist[$mKey])) {
					$groupEBlist[$mKey] = false; // if we find a new key that the group does not have, add it and set to false
					$this->db->prepare("UPDATE `userGroups` SET `accessDef` = JSON_SET(`accessDef`, CONCAT('$.editorButtons.', ?), false) WHERE `id` = ?");
					$this->db->executePrepared([$mKey, $userGroupId]);
					continue;
				}
			}
		}

		// EB SYNC II: REMOVE GROUP EDITOR ITEMS REMOVED FROM MASTER LIST
		foreach ($ugList as $userGroupId) {

			$groupEBlist = json_decode(
				$this->db->fetchValue("SELECT `accessdef` FROM `userGroups` WHERE `id` = ?", [$userGroupId])['data'] ?? '',
				true
			)['editorButtons'];

			foreach (array_keys($groupEBlist) as $gKey) {
				if (empty($masterEBlist[$gKey])) {
					$this->db->prepare("UPDATE `userGroups` SET `accessDef` = JSON_REMOVE(`accessDef`, CONCAT('$.editorButtons.', ?)) WHERE `id` = ?");
					$this->db->executePrepared([$gKey, $userGroupId]);
					continue;
				}
			}
		}

		return true;
	}

	/**
	 * Force resync of granular permissions to their concept permission value.
	 *
	 * @param bool|array $returnData
	 * 
	 * @return bool
	 * 
	 * @todo // TODO: implement some form of error catching in case of bad DB data
	 * 
	 */
	public function forceGSync(bool|array &$returnData): bool
	{
		/* @var $db rixPDO */
		$masterSchema = [];
		$counter = 1;
		$db_data = "";
		$updPerm = [];

		foreach (self::schemaFiles as $pFile) {
			$masterSchema[$counter] = json_decode(file_get_contents($pFile) ?? '', true);
			if (json_last_error() !== JSON_ERROR_NONE) {
				$this->writeLogEntry("SYSTSEM ERROR: Bad JSON permission schema file.");
				$returnData['error'] = $this->uiLang->translate("Permission") . "[$counter] " . $this->uiLang->translate("JSON permission schema file not valid. It may have been incorrectly updated. Please report to Oasys Administrator.");
				exit;
			}

			$counter++;
		}

		// iterate modules
		foreach (['itemFolderAccess' => 1, 'testFolderAccess' => 1, 'loginsFolderAccess' => 1] as $accessTableName => $sKey) {

			/** @noinspection SqlResolve */
			$res = $this->db->fetchTable("SELECT `id`, `accessDef` FROM {$accessTableName}")['data'];

			// iterate accessDef entries
			foreach ($res as $entryVal) {
				$db_data = json_decode($entryVal['accessDef'] ?? '', true);
				$updPerm = [];

				// iterate schema entries
				foreach ($masterSchema[$sKey] as $c_perm => $g_perm) {
					$updPerm['c_items'][$c_perm] = $db_data['c_items'][$c_perm] ?? false;

					// iterate granular entries
					foreach ($g_perm as $g_entry) {
						$updPerm['items'][$g_entry] = $db_data['c_items'][$c_perm] ?? false;
					}
				}
				$updatedJSON = json_encode($updPerm);
				$this->db->update($accessTableName, ['accessDef' => $updatedJSON], "id = ?", [$entryVal['id']]);
			}
		}
		return true;
	}

	/**
	 * Check for permission schema consistency with usergroup permission entries.
	 *
	 * @param array|bool $returnData
	 * 
	 * @return bool
	 * 
	 */
	public function syncSchema(array|bool &$returnData): bool
	{
		$changeMade = false;
		$masterSchema = [];

		// fetch and process JSON master permission item sets
		$counter = 1; // if json schema file is bad, we can identify which one. 1 = perm_items and 2 = perm_items_generic; We will also bind some specific vars to this counter value
		foreach (self::schemaFiles as $pFile) {

			// load our master schema file values into an array so we can iterate them, and select the correct schema depending on the source table being processed
			$masterSchema[$counter] = json_decode(file_get_contents($pFile) ?? '', true);
			if (json_last_error() !== JSON_ERROR_NONE) {
				$this->writeLogEntry("SYSTSEM ERROR: Bad JSON permission schema file.");
				$returnData['error'] = "<br>Permission[{$counter}] JSON permission schema file not valid. It may have been incorrectly updated. Please report to Oasys Administrator.";
				exit;
			}

			$counter++;
		}

		// Check for blank accessDef entries in all tables requiring accessDef

		$noAccess = $this->db->fetchTable("SELECT `id`, `name` FROM `users` WHERE `accessDef` IS NULL")['data'];
		if (!(empty($noAccess))) {
			$badUserStr = "<br>";
			foreach ($noAccess as $key => $psVal) {
				$badUserStr .= "<br>" . $psVal['name'];
			}

			// auto fix accessDef cols with blank entries
			$this->db->update('users', ['accessDef' => '{"c_items": {}, "items": {}}'], '`accessDef` IS NULL');
			$this->db->update('users', ['accessDef' => '{"c_items": {}, "items": {}}'], '`accessDef` = ""');

			$returnData['logMsg'] =
				$this->uiLang->translate("The following user entries did not have any general access definitions and were automatically repaired.") .
				"<span style='font-style: italic'>" .
				$this->uiLang->translate("Please manually check standard permission rights on these user accounts.") .
				"</span><span style='font-weight: bold;'>{$badUserStr}</span><br><br>";
		}

		$permShell = '{"c_items": {}, "items": {}}';

		// iterate all the tables we require to check for permission lineitem updates
		foreach (['itemFolderAccess' => 1, 'testFolderAccess' => 1, 'loginsFolderAccess' => 1, 'users' => 2] as $accessTableName => $sKey) { // link the table to the correctly associated master schema we're checking against

			/** @noinspection SqlResolve */
			$res = $this->db->fetchTable("SELECT `id`, `accessDef` FROM {$accessTableName}")['data'];

			// iterate group/folder combinations in permission access tables and add missing records (default to false for missing entries)
			if ($sKey === 1) {
				$ugMasterList = $this->db->fetchColumn("SELECT `id` FROM `userGroups` WHERE `name` <> 'superadmin' AND `name` <> 'admin'")['data'];

				$tblUgIds = $this->db->fetchColumn("SELECT DISTINCT `userGroupId` FROM {$accessTableName}")['data'];

				$missingGroupsDefs = array_diff($ugMasterList, $tblUgIds);

				$rootTbl = "";
				if ($accessTableName === 'itemFolderAccess') $rootTbl = 'itemFolders';
				if ($accessTableName === 'testFolderAccess') $rootTbl = 'testFolders';
				if ($accessTableName === 'loginsFolderAccess') $rootTbl = 'loginsFolders';

				# ---------------------------------------------------- #
				# Missing accessDef fillout from root folder as source #
				# ---------------------------------------------------- #
				if (!empty($missingGroupsDefs)) {
					$uniqueFID_root = $this->db->fetchColumn("SELECT DISTINCT `id` FROM {$rootTbl} WHERE `name` <> 'Home'")['data'];

					foreach (array_values($uniqueFID_root) as $fID) {
						foreach (array_values($missingGroupsDefs) as $missingGroup) {
							$this->db->prepare("INSERT INTO {$accessTableName} VALUES (null, ?, ?, null, ?)");
							$this->db->executePrepared([$fID, $missingGroup, '{"c_items": {}, "items": {}}']);
						}
					}
				}

				# ----------------------------------------------------------------------- #
				# Missing individual entries in existing folder Ids from accessDef source #
				# ----------------------------------------------------------------------- #
				if (!empty($missingGroupsDefs)) {
					$uniqueFIDs = $this->db->fetchColumn("SELECT DISTINCT `folderId` FROM {$accessTableName}")['data'];

					foreach (array_values($uniqueFIDs) as $fID) {
						foreach (array_values($missingGroupsDefs) as $missingGroup) {
							$this->db->prepare("INSERT INTO {$accessTableName} VALUES (null, ?, ?, null, ?)");
							$this->db->executePrepared([$fID, $missingGroup, '{"c_items": {}, "items": {}}']);
						}
					}
				}
			}

			// iterate through the JSON permission entries
			foreach ($res as $entryVal) {

				# -------------------------- #
				# NULL and missing key check #
				# -------------------------- #

				// check for null or blank columns, which should never exist, and fill them in with blank structure;
				if (empty($entryVal['accessDef'])) {
					$entryVal['accessDef'] = $permShell;
					$this->db->update($accessTableName, ['accessDef' => $permShell], '`id` = ?', [$entryVal['id']]);
				}

				$db_data = json_decode($entryVal['accessDef'] ?? '', true);

				// check for individually missing json keys and update
				$ps_arr = json_decode($permShell ?? '', true);
				foreach (array_keys($ps_arr) as $psKey) {
					if (!isset($db_data[$psKey])) {
						$this->db->execute("UPDATE `users` SET `accessDef` = JSON_SET(`accessdef`, '$.{$psKey}', JSON_OBJECT()) WHERE `id` = ?", [$entryVal['id']]);
						$db_data[$psKey] = [];
					}
				}

				# ---------------------------- #
				# Insert conceptual permission #
				# ---------------------------- #
				foreach ($masterSchema[$sKey] as $c_perm => $g_perm) {

					if (!(in_array($c_perm, array_keys($db_data['c_items'])))) {
						$changeMade = true;
						/** @noinspection SqlResolve */
						$this->db->prepare("UPDATE {$accessTableName} SET `accessDef` = JSON_SET(`accessDef`, CONCAT('$.', ?, '.', ?), false) WHERE `id` = ?");
						$this->db->executePrepared(["c_items", $c_perm, $entryVal['id']]);
					}

					# -------------------------- #
					# Insert granular permission #
					# -------------------------- #
					foreach ($g_perm as $gp_entry) {
						if (!(in_array($gp_entry, array_keys($db_data['items'])))) {
							$changeMade = true;

							$cKey = null;
							foreach ($masterSchema[$sKey] as $cVal => $gVal) {
								if (array_search($gp_entry, $masterSchema[$sKey][$cVal]) !== false) $cKey = $cVal;
							} // find the parent concept permission key based on granular permission name

							/** @noinspection SqlResolve */
							$parCval = $this->db->fetchValue(
								"SELECT JSON_EXTRACT(`accessDef`, CONCAT('$.', ?, '.', ?)) FROM {$accessTableName} WHERE id = ?",
								['c_items', $cKey, $entryVal['id']]
							)['data'] ?? 'false'; // get true/false value of the concept parent key linked to the new granular permission, or false if no value found, which shouldn't even be possible

							// insert key
							/** @noinspection SqlResolve */
							$this->db->prepare("UPDATE {$accessTableName} SET `accessDef` = JSON_SET(`accessDef`, CONCAT('$.', ?, '.', ?), {$parCval}) WHERE `id` = ?");
							$this->db->executePrepared(["items", $gp_entry, $entryVal['id']]);
						}
					}
				}

				# ----------------------------------------- #
				# Remove removed conceptual permission keys #
				# ----------------------------------------- #
				foreach ($db_data['c_items'] as $key => $psVal) {
					if (!(in_array($key, array_keys($masterSchema[$sKey])))) {
						$changeMade = true;
						/** @noinspection SqlResolve */
						$this->db->prepare("UPDATE {$accessTableName} SET `accessDef` = JSON_REMOVE(`accessDef`, CONCAT('$.', ?, '.', ?)) WHERE `id` = ?");
						$this->db->executePrepared(["c_items", $key, $entryVal['id']]);
					}
				}

				# --------------------------------------- #
				# Remove removed granular permission keys #
				# --------------------------------------- #
				foreach ($db_data['items'] as $key => $psVal) {
					// FYI: In Php 7.4 the check for an empty array requirements goes away with the new array_merge option to not have a param
					$arrCompare = empty($masterSchema[$sKey]) ? [] : array_merge(...array_values($masterSchema[$sKey]));
					if (!(in_array($key, $arrCompare))) {
						$changeMade = true;
						/** @noinspection SqlResolve */
						$this->db->prepare("UPDATE {$accessTableName} SET `accessDef` = JSON_REMOVE(`accessDef`, CONCAT('$.', ?, '.', ?)) WHERE `id` = ?");
						$this->db->executePrepared(["items", $key, $entryVal['id']]);
					}
				}
			}
		}

		if ($changeMade) {
			if (!(isset($returnData['logMsg']))) $returnData['logMsg'] = "";
			$returnData['logMsg'] .= $this->uiLang->translate("Global permission schema changes synchronized to permission entries.");
		}
		return true;
	}

	/**
	 * Change account email address
	 *
	 * @param int|null $userid
	 * @param string $email
	 * 
	 * @return string|bool
	 * 
	 */
	public function emailChange(?int $userid = null, string $email = ""): string|bool
	{
		// validate email format
		if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 320) return $this->uiLang->translate("Illegal input detected! Aborting Request.");

		// username duplicate checking
		$emCount = $this->db->fetchValue("SELECT COUNT(*) FROM `users` WHERE `email` = ?", [$email])['data'];
		if ($emCount > 0) return $this->uiLang->translate("This email address is already in use! Please select another value.");

		$this->db->update('users', ['email' => $email], 'id = ?', [$userid]);
		$this->email = $email;
		return true;
	}

	/**
	 * Change account password.
	 *
	 * @param int|null $userid
	 * 
	 * @return string|bool
	 * 
	 */
	public function pwdChange(?int $userid = null): string|bool
	{
		// JSON -> array
		$pwdChangeInputs = $this->handleInput(filter_input(INPUT_POST, 'data'));

		if (!$pwdChangeInputs) {
			$this->writeLogEntry("BAD INPUT: Invalid password change inputs (invalid or empty JSON data submitted)");
			return $this->uiLang->translate("Invalid password change input data.");
		}

		// validate session exists and is auth'd
		if (($this->getAuthResult() !== true) || (!isset($_SESSION['userid']))) {
			$this->writeLogEntry("BAD INPUT: Password update attempted without valid authentication, or with an empty session.");
			return $this->uiLang->translate("Session not valid.");
		}

		// set pwd vars
		$oldPass = $pwdChangeInputs['oldpass'];
		$newPass = $pwdChangeInputs['newpass'];
		$newPass2 = $pwdChangeInputs['newpass2'];

		// check for empty vars
		foreach ([$userid, $oldPass, $newPass, $newPass2] as $value) {
			if (empty($value)) {
				$this->writeLogEntry("BAD INPUT: Missing input values during password update attempt.");
				return $this->uiLang->translate("Bad or missing input value(s)");
			}
		}

		// check for mismatch newpass / newpass2
		if ($newPass !== $newPass2) {
			$this->writeLogEntry("BAD INPUT: New password value does not match new password confirmation value during password update attempt.");
			return $this->uiLang->translate("Cannot assign new password. New password does not match confirmation value.");
		}

		// query to obtain database password hash value
		$query = "SELECT password FROM `users` WHERE `id`=?";
		$qResult = $this->db->fetchValue($query, [$userid]);

		$realHashedPass = $qResult['data'];

		// compare user input vs hash value from db
		$pwdValid = password_verify($oldPass, $realHashedPass);

		// password non-match handler
		if ($pwdValid !== true) {
			$this->writeLogEntry("BAD INPUT: Current password input does not match actual password during password update attempt.");
			return $this->uiLang->translate("Cannot assign new password. Current password is not correct.");
		}

		// password complexity check - not used right now except for max length
		// if (
		// filter_var($newPass, FILTER_VALIDATE_REGEXP, ['options' => ["regexp" => "/^.{8,30}$/"]]) === false ||
		// (filter_var($newPass, FILTER_VALIDATE_REGEXP, ['options' => ["regexp" => "/[A-Z]/"]]) === false ||
		// 	(filter_var($newPass, FILTER_VALIDATE_REGEXP, ['options' => ["regexp" => "/[a-z]/"]]) === false ||
		// 		(filter_var($newPass, FILTER_VALIDATE_REGEXP, ['options' => ["regexp" => "/[0-9]/"]]) === false)))
		// )

		if (strlen($newPass) > 50) {
			$this->writeLogEntry("BAD INPUT: Password exceeded maximum allowable length (50 characters).");
			return $this->uiLang->translate("Password exceeded maximum allowable length (50 characters).");
		}

		// check if new pass is same as current pass - must be done after checking validity of 'current' pwd
		if ($newPass === $oldPass) {
			$this->writeLogEntry("BAD INPUT: New password equals old password during password update attempt.");
			return $this->uiLang->translate("Current password same as new password. Password not modified.");
		}

		# ------------------ #
		# Do password update #
		# ------------------ #
		$newPwdHash = password_hash($newPass, PASSWORD_DEFAULT);
		$this->db->update('users', ['password' => $newPwdHash], 'id=?', [$userid]);

		// final return when all conditions passed
		$this->writeLogEntry("USER ACTION: Password successfully updated.");
		return true;
	}

	/**
	 * Input data parsing and validation
	 *
	 * @return array|bool
	 * 
	 */
	private function loginPrecheck(): array|bool
	{
		// SSO username sanitation; this login type does not have a local password (validation done against SAML data returned by IdP)
		if (isset($_SESSION['SSOloginTrigger']) && $_SESSION['SSOloginTrigger'] == true) {
			$loginInputs['username'] = filter_var($_SESSION['SSOUserName'], FILTER_SANITIZE_FULL_SPECIAL_CHARS);
			$loginInputs['password'] = "";
		} else {
			// JSON -> array conversion, or bail if not valid
			$loginInputs = $this->handleInput(filter_input(INPUT_POST, 'data'));
			if (!isset($loginInputs['username']) || !isset($loginInputs['password'])) {
				$this->writeLogEntry("BAD INPUT: Invalid login inputs (empty data submitted in either username or password.)");
				return false;
			}
		}
		// set class-scoped username based on input - put into session var, and used for logging
		$this->setUsername($loginInputs['username']);

		// return original login data
		return $loginInputs;
	}

	/**
	 * Validate POST data from JS AJAX requests.
	 *
	 * @param string $data JSON formatted user/pass data.
	 * 
	 * @return array|bool The return value will either be 'false' on error or bad data, or an arrayified version of the JSON input data.
	 * 
	 */
	public function handleInput(string $data): array|bool
	{
		# --------------------------------------------------- #
		# Input array JSON validation and conversion to array #
		# --------------------------------------------------- #
		if ($data) {
			$jsonValid = json_decode($data ?? '', true);
			if ($jsonValid) {
				return $jsonValid;
			} else {
				$this->writeLogEntry("BAD INPUT: Input data not found to be valid JSON in action type `{$this->returnData['action']}`.");
				return false;
			}
		} else {
			$this->writeLogEntry("BAD INPUT: Input data not found for request type: `{$this->returnData['action']}`");
			return false;
		}
	}

	/**
	 * Rotate / cycle session
	 *
	 * @param int $percentRotate 100 = do not rotate, 0 = force rotate
	 * 
	 * @return bool
	 * 
	 */
	private function rotateSesh(int $percentRotate = 100): bool
	{
		// limit our SID rotation to not cycle on every call
		if (rand(0, 99) < $percentRotate) {
			// if the session is good, rotate session id val for extra security
			if ($this->getAuthResult() === true) {
				$prevSesh = $_SESSION;

				// kill session var and session itself if/when active
				if (session_status() === PHP_SESSION_ACTIVE) {
					$_SESSION = [];
					session_destroy();
				}

				try {
					$rndb = random_bytes(16);
				} catch (Error $e) {
					$this->killSession($this->uiLang->translate("Unable to generate random session ID string:") . " " . $e->getMessage(), true);
					$this->echoSuppress = false;
					return false;
				} catch (Exception $ex) {
					$this->killSession($this->uiLang->translate("Unable to generate random session ID string:") . " " . $ex->getMessage(), true);
					$this->echoSuppress = false;
					return false;
				}

				$newSid = bin2hex($rndb); // gen new cryptographically secure string
				session_id($newSid);

				global $sql_db, $sql_user, $sql_password, $sql_host;
				$sessionHandler = new dbSessionHandler($sql_db, $sql_user, $sql_password, $sql_host, DOCROOT . 'logs/sessionHandler_errors.txt', 'userAuth');
				session_set_save_handler($sessionHandler, true);

				session_start(['cookie_path' => $this->cookiePath, 'cookie_httponly' => true]);
				$_COOKIE['PHPSESSID'] = session_id();
				$_SESSION = $prevSesh; // restore previous session's array values
				$this->sid = session_id(); // update the class SID property
			}
		}
		return true;
	}

	/**
	 * Attempt LDAP authentication based on login and password parameter input.
	 * 
	 * The LDAP/Active Directory values are preconfigured in the setting section of Oasys.  
	 *   
	 * This is a public static method which has been designed to be called from the frontend  
	 * Oasys login area as well.
	 *
	 * @param string $login
	 * @param string $password
	 * 
	 * @return bool|string
	 * 
	 */
	public static function bindLDAP(string $login, string $password): bool|string
	{
		global $settings;
		// define DOCROOT for static method calls
		if (!defined("DOCROOT")) define("DOCROOT", str_replace("//", "/", ($_SERVER['CONTEXT_DOCUMENT_ROOT'] ?? $_SERVER['DOCUMENT_ROOT']) . $settings['rootURL']));
		require_once DOCROOT . "editor/inc/php/uiLang.php"; // required for translation inclusion (additional call for static calls to method)

		// define uiLang for static method calls
		$uiLang = new uiLang($settings['interfaceLanguage']);


		# -------------------------------------- #
		# Setup initial vars for ldap connection #
		# -------------------------------------- #

		$username = preg_replace("/@.*/", "", $login);
		$app_user = $settings['ldap_appUser'];
		$app_pass = Crypt::decryptString($settings['ldap_appPass']);
		$ldap_server = $settings['ldap_server'];
		$search_base = $settings['ldap_searchBase'];

		# ---------------------------------- #
		# Initial connection to LDAP service #
		# ---------------------------------- #

		putenv('LDAPTLS_REQCERT=never'); // this is required to ignore SSL certificate as we have not imported the chain
		$conn_status = ldap_connect($ldap_server); // the secondary 'port' param for ldap_connect() is depreciated and should not be used
		if ($conn_status === false) {
			self::writeLogEntry("The LDAP-URI [$ldap_server] was not parseable.");
			return $uiLang->translate("Couldn't connect to LDAP service.");
		}

		//set protocol version 3 (v2 is deprecated). Important to support passwords with certain special characters e.g. the EURO sign
		ldap_set_option($conn_status, LDAP_OPT_PROTOCOL_VERSION, 3);

		//disable referrals due to security issues
		ldap_set_option($conn_status, LDAP_OPT_REFERRALS, 0);

		# ---------------------------- #
		# Initial bind to read objects #
		# ---------------------------- #

		$bind_status = ldap_bind($conn_status, $app_user, $app_pass);
		if ($bind_status === false) {
			self::writeLogEntry("LDAP ERROR: " . ldap_error($conn_status) . ".");
			return $uiLang->translate("Couldn't bind to LDAP as application user.");
		}

		# ------------------------------------------ #
		# Initial query to find target DN and expiry #
		# ------------------------------------------ #

		// variable query string - the %1 in the imported settings string is substituted with the $username value
		$settingsQuery = $settings['ldap_query'];
		$query = str_replace('%1', $username, $settingsQuery);

		$search_status = ldap_search($conn_status, $search_base, $query, array('dn', 'msds-userpasswordexpirytimecomputed'));

		//if an error occurred during search
		if ($search_status === false) {
			self::writeLogEntry("LDAP ERROR: " . ldap_error($conn_status) . ".");
			return $uiLang->translate("Search on LDAP failed.");
		}

		//pull the search results
		$result = ldap_get_entries($conn_status, $search_status);
		if ($result === false) {
			self::writeLogEntry("LDAP ERROR: " . ldap_error($conn_status) . ".");
			return $uiLang->translate("Couldn't pull search results from LDAP.");
		}

		//check if there is either no match or more than 1 match
		if ((int) @$result['count'] === 0) {
			self::writeLogEntry("LDAP RESULT: " . "Username not found on LDAP.");
			return $uiLang->translate("Username not found on LDAP.");
		} else if ((int) @$result['count'] > 1) {
			self::writeLogEntry("LDAP ERROR: " . "Username found more than once on LDAP.");
			return $uiLang->translate("Username found more than once on LDAP.");
		}

		//read DN and convert expiry date
		$userdn = $result[0]['dn'];
		$ms_expiry = $result[0]['msds-userpasswordexpirytimecomputed'][0] ?? null;
		if (!is_null($ms_expiry)) {
			$expiryDate = bcsub(bcdiv($ms_expiry, '10000000'), '11644473600');
		}

		// if DN entry is empty
		if (trim((string) $userdn) == '') {
			self::writeLogEntry("LDAP ERROR: " . ldap_error($conn_status) . ".");
			return "Empty DN. Something is wrong.";
		}

		# --------------------------------------------------- #
		# Final find to target object to validate credentials #
		# --------------------------------------------------- #

		// manually suppress error warning 
		$originalErrorReporting = error_reporting();
		error_reporting(E_ERROR);
		$auth_status = @ldap_bind($conn_status, $userdn, $password);
		error_reporting($originalErrorReporting);

		//if login fails
		if ($auth_status === false) {

			if (isset($expiryDate) && time() > $expiryDate) {
				// if password has expired
				self::writeLogEntry("LDAP ERROR: " . ldap_error($conn_status) . ".");
				return $uiLang->translate("Account password has expired.");
			} else {
				// if login has failed due to any other reason (probably wrong password)
				self::writeLogEntry("LDAP ERROR: " . ldap_error($conn_status) . ".");
				return $uiLang->translate("Incorrect credentials.");
			}
		}

		ldap_close($conn_status);
		return true;
	}

	/**
	 * Main login routine (user/pass authentication check)
	 *
	 * @param string $username
	 * @param string $password
	 * 
	 * @return string|bool
	 * 
	 */
	private function loginAuthValidation(string $username, string $password): string|bool
	{
		# ------------------------ #
		# Username existence check #
		# ------------------------ #
		$query = "SELECT COUNT(*) FROM `users` WHERE `name`=?";
		$qResult = $this->db->fetchValue($query, [$username]);
		$rowCount = $qResult['data'];

		// if the username doesn't match exactly one entry from user table, bail
		if ($rowCount !== 1) {
			$this->writeLogEntry("BAD INPUT: Unique instance of username `{$username}` not found.");
			$_SESSION['SSO_LO_ECODE'] = "oaNUF"; // this code will display 'user not found in oasys' on frontend return, when applicable in an SSO scenario
			return $this->uiLang->translate("Incorrect credentials.");
		}

		// set uid/gid val based on unique username existing
		$this->userid = $this->db->fetchValue("SELECT `id` FROM `users` WHERE `name` = ?", [$username])['data'];
		$this->usergroup = $this->db->fetchColumn("SELECT `usergroupId` FROM `userGroupAccess` WHERE `userId` = ?", [$this->userid])['data'];

		// set roles values based on logged in ID
		$roleRes = $this->db->fetchValue("SELECT JSON_EXTRACT(`accessDef`, '$.c_items') FROM users WHERE `id` = ?", [$this->userid])['data'];
		$this->roles = json_decode($roleRes ?? '', TRUE);

		# ----------------------------------------------- #
		# Switch case for type of account being logged in #
		# ----------------------------------------------- #

		$acctType = $this->db->fetchValue("SELECT `acct_type` FROM `users` WHERE `id` = ?", [$this->userid])['data'];


		switch ($acctType) {

				# ---------------------------------------------------------------------------- #
				# SSO validation already run -- validate username exists in Oasys users table. #
				# Perform session checking to ensure the login attempt is being routed from an #
				# SSO route, and not direct login.                                             #
				# ---------------------------------------------------------------------------- #

			case 'SSO':

				if (
					isset($_SESSION['SSOloginTrigger']) &&
					$_SESSION['SSOloginTrigger'] === true &&
					isset($_POST['RelayState']) &&
					$_POST['RelayState'] === "oali"
				) {
					$pwdRes = true;
					$this->setAuthResult($pwdRes);
					$_SESSION['SSOloginTrigger'] = false;
				} else {
					$pwdRes = $this->uiLang->translate("Incorrect credentials.");
					$this->setAuthResult($pwdRes);
					$this->killSession($this->uiLang->translate("Incorrect credentials."), true);
				}

				break;

			case 'LDAP':

				# ------------------------------------------------------------- #
				# Perform LDAP connection and validation of sent in credentials #
				# ------------------------------------------------------------- #

				$ldap_attempt = $this->bindLDAP($username, $password);

				$pwdRes = $ldap_attempt === true ? true : $ldap_attempt;
				$this->setAuthResult($pwdRes);

				break;

				// if the account is set as LOCAL, or blank/null, use default pwd check method
			case 'LOCAL':
			default:

				# ------------------------------- #
				# Verify correct password - local #
				# ------------------------------- #

				// get hashed pwd from users table
				$query = "SELECT `password` FROM `users` WHERE `id` = ?";
				$qResult = $this->db->fetchValue($query, [$this->userid]);
				$dbPassHash = $qResult['data'];

				// set the authentication result based on verification check
				$pwdRes = ((password_verify($password, $dbPassHash)) === true) ? true : $this->uiLang->translate("Incorrect credentials.");
				$this->setAuthResult($pwdRes);

				break;
		}

		# ---------------------------------------------------------------------------------------- #
		# Bad password count exceeding check (exclude SSO b/c local login attempts blocked anyway) #
		# ---------------------------------------------------------------------------------------- #

		if ($pwdRes !== true && $acctType !== "SSO") {
			$bpCheckRes = $this->badPassCountOk($this->userid);
			if ($bpCheckRes !== true) {
				$this->killSession($bpCheckRes, true);
				$this->writeLogEntry("BAD INPUT: User exceeded bad password threshold.");
				exit; // FYI: this is a special short-circuit to the exit handler to immediately return a more specific login failure message
			}
		}

		# --------------------- #
		# Account enabled check #
		# --------------------- #

		if ($this->checkAcctEnabled($this->userid) !== true) {
			$this->writeLogEntry("ACCOUNT RESTRICTION: Login attempted on disabled user account.");
			$this->killSession($this->uiLang->translate("Account has been disabled."), true);

			// special re-direct for SSO login types which have a disabled Oasys account
			if ($acctType === "SSO") {
				$_SESSION['SSO_LO_ECODE'] = "oaD"; // change our default error code message to 'account disabled' when returning frontend message
				return "SSO_E_AD"; // this gets returned to the ssologin call for oasys login -- not used now, but could be used later
			} else {
				exit; // FYI: this is a special short-circuit to the exit handler to immediately return a more specific login failure message
			}
		}

		// output message for login attempt to send back to frontend client
		if ($this->getAuthResult() !== true) {
			$this->writeLogEntry("BAD INPUT: {$pwdRes}");
			return $pwdRes;
		} else {
			// reset our bad login counter and timestamp on an authenticated login
			$this->db->update("users", ["bad_logins" => "0", "last_bad_pass" => null], "id = ?", [$this->userid]);

			// set class-scoped uid/gid vals only after sucessful login
			$_SESSION['userid'] = $this->userid;
			$_SESSION['usergroup'] = $this->usergroup;
			$_SESSION['roles'] = $this->roles;
			$_SESSION['email'] = $this->email;
			if (!isset($_SESSION['editor_active'])) $_SESSION['editor_active'] = true;

			$this->writeLogEntry("USER ACTION: User successfully logged in.");
			$this->rotateSesh(100);
			return true;
		}
	}

	/**
	 * Check if account in question is enabled/disabled
	 *
	 * @param int $uid
	 * 
	 * @return bool
	 * 
	 */
	public function checkAcctEnabled(int $uid): bool
	{
		$query = "SELECT `status` FROM `users` WHERE `id`=?";
		$qResult = $this->db->fetchValue($query, [$uid]);
		$acctStatus = $qResult['data'];

		// what to do if account is disabled
		return ((int) $acctStatus !== 1) ? false : true;
	}

	/**
	 * Unset and destroy the active session.
	 * 
	 * Used when auth condition is unmet, various errors, and standard logout requests.
	 *
	 * @param string|bool $killMsg
	 * @param bool $isError
	 * 
	 * @return void
	 * 
	 */
	public function killSession(string|bool $killMsg = false, bool $isError = false)
	{
		$this->setAuthResult($killMsg); // set class auth var to reason why it's being killed

		// remove selected editor server side session vars
		unset($_SESSION['userid']);
		unset($_SESSION['username']);
		unset($_SESSION['usergroup']);
		unset($_SESSION['roles']);
		unset($_SESSION['email']);
		if (isset($_SESSION['editor_active']) && $_SESSION['editor_active'] === true) $_SESSION['editor_active'] = false;

		// if the frontend has been active within the last 15 minutes, only set editor auth to false
		if (OasysFrontendState::getNumberOfActiveClients(15 * 60) > 0) {
			$this->setAuthResult(false);
		} elseif (session_status() === PHP_SESSION_ACTIVE) {
			// if frontend not active, remove client cookie, unset session, and stop session (exemption for SSO logins since we still need session vals to logout)
			if (!isset($_SESSION['SSOloginTrigger'])) {
				setcookie("PHPSESSID", "", time() - 3600, $this->cookiePath);
				session_unset();
				session_destroy();
			}
		}

		// remove upgrader auth cookies regardless of either condition above
		setcookie("UNAME", "", time() - 3600, $this->cookiePath . "editor/");
		setcookie("PSID", "", time() - 3600, $this->cookiePath . "editor/");

		// set auth message for editor page
		if ($killMsg) {
			$this->returnData['error'] = $killMsg;
			$this->returnData['returnMsg'] = $killMsg;
		}
		// set error msg for editor page
		if ($isError) {
			$this->returnData['error'] = $killMsg;
		}
	}

	/**
	 * Validate that user is not exceeding max bad password count.
	 *
	 * @param int $uid
	 * 
	 * @return string|bool
	 * 
	 */
	private function badPassCountOk(int $uid): string|bool
	{
		// increment bad pwd count for user by 1
		$badPassIncrementQuery = "UPDATE `users` SET `bad_logins` = `bad_logins` + 1 WHERE `id` = ?";
		$this->db->prepare($badPassIncrementQuery);
		$this->db->executePrepared([$uid]);

		// get current bad pwd count and last bad attempt timestamp
		$bpCount = $this->db->fetchValue("SELECT `bad_logins` FROM `users` WHERE `id` = ?", [$uid])['data'];
		$lastBadTime = strtotime($this->db->fetchValue("SELECT `last_bad_pass` FROM `users` WHERE `id` = ?", [$uid])['data']);

		// update bad pass last attempt timestamp
		$this->db->update('users', ['last_bad_pass' => date("Y-m-d H:i:s")], "id = ?", [$uid]);

		// check if bad pwds exceed limit in time allowed time period (defaults set in class constants); if no current val for last bad timestamp don't execute block
		if ($lastBadTime) {
			if ((time() - $lastBadTime < self::MAX_TIME4_BADPWD) && ($bpCount >= self::MAX_BADPWD_COUNT)) {
				$this->db->update("users", ["status" => "0"], "id = ?", [$uid]);
				return $this->uiLang->translate("Exceeded incorrect password attempts. Your account has been disabled. <br><strong>Please contact your system adminstrator to re-enable this account.</strong>");
			} else {
				return true;
			}
		} else {
			return true;
		}
	}

	/**
	 * Check if operator is elevated admin
	 */
	public function checkElevatedAdmin($id = null): bool
	{
		if ($id === null) $id = $this->userid;
		if ($id === -999) return false;
		$aeRes = $this->db->fetchValue("SELECT `accessDef` FROM `users` WHERE `id` = ?", [$id])['data'];
		$ae = json_decode($aeRes ?? '', true);
		$finalRes = $ae['items']['adminElevated'] ?? false;

		return $finalRes;
	}

	/**
	 * Check if operator is regular admin
	 */
	public function checkAdmin($id = null): bool
	{
		if ($id === null) $id = $this->userid;
		$adminRes = $this->db->fetchColumn(
			"SELECT `name` FROM `userGroups` WHERE `id` IN
			(SELECT `usergroupId` FROM `userGroupAccess` WHERE `userID` = ?)
			",
			[$id]
		)['data'];

		if (!(in_array('admin', $adminRes))) {
			return false;
		} else {
			return true;
		}
	}

	/**	
	 * Write+close session.
	 * Close out session early to avoid clashing with session table operations
	 */
	public function wc_session(): void
	{
		session_write_close();
	}

	/**
	 * Check if operator is superadmin
	 */
	public function checkSA($id = null): bool
	{
		if ($id === null) $id = $this->userid;
		$suprAdminRes = $this->db->fetchColumn(
			"SELECT `name` FROM `userGroups` WHERE `id` IN
			(SELECT `usergroupId` FROM `userGroupAccess` WHERE `userID` = ?)
			",
			[$id]
		)['data'];

		if (!(in_array('superadmin', $suprAdminRes))) {
			return false;
		} else {
			return true;
		}
	}

	/**
	 * writeLogEntry
	 * Write a log entry related to an authentication event
	 * @param  string $entry Output log entry string
	 * @param  string $logfileName output file, defaults to 'authentication.log' if left blank or empty string sent in
	 * @param  Array $opDetail Extra log detail [location, action]
	 * @return void
	 */
	public static function writeLogEntry(string $entry, string $logfileName = "authentication.log", array $opDetail = ['loc' => '', 'action' => ''])
	{
		global $settings;

		// force default log file name even when an empty string is sent in
		if ($logfileName === "") $logfileName = "authentication.log";

		// conditional line-breaking when needed
		$multiLine = substr_count($entry, "\n") > 0;

		$user = $_SESSION['username'] ?? "<UNKNOWN_USERNAME>";
		$id = $_SESSION['userid'] ?? "<UNKNOWN_USER_ID>";
		$timeAndUserInfo = date("[Y-m-d H:i:s]") . "[{$user}:{$id}]";
		$actionInfo = "[" . $opDetail['loc'] . "|" . $opDetail['action'] . "]\t";
		$sessionCapture = ($multiLine ? "\n" : " ") .  "SESSIONID: [" . session_id() . "]";

		// define DOCROOT for static method calls
		if (!defined("DOCROOT")) define("DOCROOT", str_replace("//", "/", ($_SERVER['CONTEXT_DOCUMENT_ROOT'] ?? $_SERVER['DOCUMENT_ROOT']) . $settings['rootURL']));

		$logFileRelPath = DOCROOT . "logs" . DIRECTORY_SEPARATOR . $logfileName;
		if (!file_exists($logFileRelPath)) {
			touch($logFileRelPath);
		}

		// for fresh installs that don't have the file present yet
		file_put_contents($logFileRelPath, $timeAndUserInfo . $actionInfo . ($multiLine ? "\n" : "") . $entry . $sessionCapture . "\n\n", FILE_APPEND);
	}

	/**
	 * Common method for logging various operator actions in content editors.
	 *
	 * @param array $data
	 * @param string $logType
	 * @param array $retData
	 * 
	 * @return void
	 * 
	 */
	public function prepLog(array $data, string $logType, array $retData): void
	{
		global $permAuth;
		$operLogname = "operation_actions.log";
		$operDetail = ['action' => '', 'loc' => $permAuth->srcRef]; // extra action/location detail var

		// cancel logging if error prevented proper execution of the operation
		if ($retData['error'] !== false) {
			$this->writeLogEntry("ERROR! \nMODULE: {$permAuth->srcRef}\nRAW DATA:" . print_r($data, true));
			return;
		};

		switch ($logType) {
				# ------------------------- #
				#  CONTENT RENAMING LOGGING #
				# ------------------------- #
			case "rename":

				$renType = $data['type'];
				$renNewName = $data['name'];
				$renId = intVal($data['id']);
				$renOrig = $data['origName'];
				$operDetail['action'] = "Rename";

				$this->writeLogEntry("Object type [{$renType}] in [{$permAuth->srcRef}] module with id [{$renId}] was renamed from [{$renOrig}] to [{$renNewName}]", $operLogname, $operDetail);

				break;

			case "updatePerm":
				# ------------------------- #
				# PERMISSION CHANGE LOGGING #
				# ------------------------- #

				// new permission data object
				$newPermObj = $data['updPermObj'];
				$origPermObj = $data['origPermObj'];
				$operDetail['action'] = "Permission Update";

				// populate item type table selection variable array
				$it_vars = $permAuth->setTypeVars($permAuth->srcRef);

				$log_oldPerm = rtrim($origPermObj, ","); // remove last , char
				$log_oldPerm = "{" . $log_oldPerm . "}"; // add surrounding brackets for correct JSON format

				// convert JSON to Php array to remove items subkey
				$log_oldPerm = json_decode($log_oldPerm ?? '', true) ?? [];
				foreach ($log_oldPerm as $key => $value) {
					unset($log_oldPerm[$key]['items']);
				}

				// remove untouched permissions from the original perm array and new perm array
				foreach ($newPermObj as $k1 => $value) {
					if (count($newPermObj[$k1]['c_items']) === 0) {
						unset($log_oldPerm[$k1]);
						unset($newPermObj[$k1]);
					}
				}

				// query and attach the group name value for each group ID entry
				foreach (array_keys($log_oldPerm) as $groupId) {
					$log_oldPerm["{$groupId} (" . $this->db->fetchValue("SELECT `name` FROM `userGroups` WHERE id =?", [$groupId])['data'] . ")"] = $log_oldPerm[$groupId];
					unset($log_oldPerm[$groupId]);
				}

				foreach (array_keys($newPermObj) as $newGroupId) {
					$newPermObj["{$newGroupId} (" . $this->db->fetchValue("SELECT `name` FROM `userGroups` WHERE id =?", [$newGroupId])['data'] . ")"] = $newPermObj[$newGroupId];
					unset($newPermObj[$newGroupId]);
				}

				// final JSON output, prettified
				$log_oldPerm = json_encode($log_oldPerm, JSON_PRETTY_PRINT); // old values in JSON
				$log_newPerm = json_encode($newPermObj, JSON_PRETTY_PRINT); // new values in JSON

				// get name of folder being modified
				foreach ($permAuth->folder_id as $fId) {
					$fldName = $this->db->fetchValue("SELECT `name` FROM {$it_vars['i_rootFldTblName']} WHERE `id` = ?", [$fId])['data'];

					if ($log_newPerm !== $log_oldPerm)
						$this->writeLogEntry(
							"Permissions updated in [{$it_vars['i_rootFldTblName']}] table on folder ID [{$fId}] ({$fldName}) in the [{$permAuth->srcRef}] module\nBEFORE:\n{$log_oldPerm}\nAFTER\n{$log_newPerm}\n",
							$operLogname,
							$operDetail
						);

					# -------------------- #
					# OWNER CHANGE LOGGING #
					# -------------------- #
					$log_curOwnerId = $data['log_curOwnerId'] !== "" ? intval($data['log_curOwnerId']) : "<USER REMOVED>";

					// only do owner logging operation if new owner is not old owner
					if ($log_curOwnerId !== $data['newOwner'][$fId]) {
						$operDetail['action'] = "Folder Owner Change";

						$log_newOwnerName = $this->db->fetchValue(("SELECT `name` FROM `users` WHERE `id` = ?"), [$data['newOwner'][$fId]])['data'];
						$log_fldName = $this->db->fetchValue("SELECT `name` FROM {$it_vars['i_rootFldTblName']} WHERE `id` = ?", [$fId])['data'];

						$log_curOwnerName = is_int($log_curOwnerId) ?  $this->db->fetchValue(("SELECT `name` FROM `users` WHERE `id` = ?"), [$log_curOwnerId])['data'] : "<USER REMOVED>";

						// log action
						if (empty($log_curOwnerName)) $log_curOwnerName = "<USER REMOVED>"; // when dealing with expired/non-existent user IDs
						$this->writeLogEntry(
							"Owner changed in [{$permAuth->srcRef}] module on folder ID [{$fId}] ({$log_fldName}) from userid [{$log_curOwnerId}] ({$log_curOwnerName}) to userid [{$data['newOwner']}] ({$log_newOwnerName})",
							$operLogname,
							$operDetail
						);
					}
				}
				break;
				# ------------------------ #
				# CONTENT DELETION LOGGING #
				# ------------------------ #

			case 'delSelection':
				$delItems = [];
				$operDetail['action'] = "Object(s) Deletion";

				foreach ($data['selection'] as $key => $value) {
					if (substr($value['id'], 0, 1) === 'f') {
						array_push($delItems, "Folder ID: [{$value['dbId']}] ('{$value['name']}')");
					}

					if (substr($value['id'], 0, 2) === 'ig') {
						array_push($delItems, "ItemGroup ID: [{$value['dbId']}] ('{$value['name']}')");
					}

					if (substr($value['id'], 0, 1) === 't') {
						$tType = $permAuth->srcRef === 'tests' ? 'Test' : 'Test Taker';
						array_push($delItems, "{$tType} ID: [{$value['dbId']}] ('{$value['name']}')");
					}
				}

				$delItems = json_encode($delItems, JSON_PRETTY_PRINT);

				$this->writeLogEntry("The following content was deleted in the [{$permAuth->srcRef}] module\n{$delItems}\n", $operLogname, $operDetail);
				break;

			case 'deleteItem':
				# --------------------- #
				# ITEM DELETION LOGGING #
				# --------------------- #

				$i_name = $data['origName'];
				$g_id = $data['groupId'];
				$g_name = $data['groupName'];
				$operDetail['action'] = "Item Deletion";

				$this->writeLogEntry("The following item was deleted in the [{$permAuth->srcRef}] module: item ID [{$data['id']}] ({$i_name}) belonging to group ID [{$g_id}] ({$g_name})", $operLogname, $operDetail);

				break;

			case 'moveObjects':
				# --------------------- #
				# OBJECT MOVING LOGGING #
				# --------------------- #

				$module = $permAuth->srcRef;
				$data_orig = $data['origInfo'];
				$target = $data['target'];
				$operDetail['action'] = "Object Move";

				$this->writeLogEntry("The following content was moved to a new folder location in the [{$module}] module\n{$data_orig}", $operLogname, $operDetail);

				break;

			case "resetTTakers":

				$idStr = "\n" . implode("\n", $data);
				$operDetail['action'] = "Test Taker Results Reset";

				$this->writeLogEntry("The following test taker ID(s) had all test results reset for all passwords: {$idStr}\n", $operLogname, $operDetail);

				break;

			case "resetResPass":

				$operDetail['action'] = "All Password Results Reset";
				$ttid = $data["testee"];
				$pwdIds = $data["password"];
				$ttname  = $data["ttname"];

				$this->writeLogEntry("The following password ID [{$pwdIds}] had all its test results reset for the test taker ID [{$ttid}] (\"$ttname\")\n", $operLogname, $operDetail);
				break;

			case "resetResTestPass":

				$operDetail["action"] = "Test/Password Results Reset";
				$testId = $data["test"];
				$testName = $data["testName"];
				$passId = $data["password"];
				$ttid = $data["testee"];
				$ttname = $data["ttname"];

				$this->writeLogEntry("The following test ID [{$testId}] (\"{$testName}\") had its results reset for the password ID [{$passId}] and test taker ID [{$ttid}] (\"$ttname\")\n", $operLogname, $operDetail);
				break;

			case "testResResults":

				$operDetail['action'] = "Test Results Reset";
				$allIds = "\n" . implode("\n", $data);
				$this->writeLogEntry("Results for all associated test takers were reset for the following test ID(s): {$allIds}\n", $operLogname, $operDetail);


				break;
				//
				//			case "resetResultsTest":
				//
				//
				//
				//				break;

			default:
				break;
		}
	}

	/**
	 * Custom shutdown handler for userAuth class
	 *
	 * @return void
	 * 
	 */
	public function responseAndExit(): void
	{
		// global $returnData;
		// $this->returnData = array_merge($this->returnData, $returnData);
		$finalAuth = $this->getAuthResult(false, false);

		if ($finalAuth === true) {
			// update username in case updated in middle of session
			if (isset($_SESSION['username'])) {
				$unameRefresh = $this->db->fetchValue("SELECT `name` FROM `users` WHERE `id` = ?", [$_SESSION['userid']])['data'];
				$this->setUsername($unameRefresh);
			}

			// update usergroups in case updated in middle of session
			if (isset($_SESSION['usergroup'])) {
				$ugroupRefresh = $this->db->fetchColumn("SELECT `usergroupId` FROM `userGroupAccess` WHERE `userId` = ?", [$_SESSION['userid']])['data'];
				$_SESSION['usergroup'] = $ugroupRefresh;
			}

			// update roles in case updated in middle of session
			if (isset($_SESSION['roles'])) {
				$roleRes = $this->db->fetchValue("SELECT JSON_EXTRACT(`accessDef`, '$.c_items') FROM users WHERE `id` = ?", [$this->userid])['data'];
				$_SESSION['roles'] = json_decode($roleRes ?? '', TRUE);
			}

			// update email in case updated in middle of session
			if (isset($_SESSION['email'])) {
				$emailRes = $this->db->fetchValue("SELECT `email` FROM `users` WHERE `id` = ?", [$this->userid])['data'];
				$_SESSION['email'] = $emailRes;
			}

			// cycle our session ID at a 10% chance only when fetching new page library
			// if (isset($this->returnData['action']) && $this->returnData['action'] === 'fetchLibrary') $this->rotateSesh(10);

			// if the user is still auth'd, update last used timestamp for session timeout purposes;
			// $_SESSION['lastTimeUsed'] = time();
		}

		// set our auth status and username values to return to client UI
		if ($finalAuth === true) {
			$this->returnData['authStatus'] = $finalAuth;
			$this->returnData['username'] = $this->username;
			$this->returnData['userid'] = $this->userid;
			$this->returnData['email'] = $this->email;
		}

		// on an SSO local attempt + acct disabled scenario, convert error code to normal message
		if (key_exists("returnMsg", $this->returnData) && $this->returnData['returnMsg'] === "SSO_E_AD") {
			$this->returnData['error'] = $this->uiLang->translate("Incorrect credentials.");
			$this->returnData['returnMsg'] = $this->uiLang->translate("Incorrect credentials.");
		}

		// echo JSON by default, or not at all if echo class property is true
		if ($this->echoSuppress === false) {
			header('Cache-Control: no-cache, must-revalidate');
			header('Content-type: application/json; charset=UTF-8');

			echo json_encode($this->returnData);
			// ob_end_flush();
		}
	}
}
