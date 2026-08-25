<?php

require_once __DIR__ . "/../../../inc/php/OasysFrontendState.php";
require_once __DIR__ . "/../../inc/php/OasysBackendState.php";
require_once __DIR__ . "/../../../inc/php/OasysSettings.php";
require_once __DIR__ . "/../../../inc/php/OasysLdapAuthenticator.php";

use OASYS\Backend\OasysBackendState;
use OASYS\OasysLdapAuthenticator;
use OASYS\OasysSettings;

/**
 * User authentication operations for Oasys editor (backend) system.
 * @author NILANJAN NAG
 */
class userAuth
{
	# --------------------------- #
	# Standard class declarations #
	# --------------------------- #

	public ?string $sid = null;
	private ?rixPDO $db;
	private ?OasysBackendState $backendState;
	private ?OasysSettings $config;
	private array $settings;
	public string|bool|null $authResult = null;
	public string $username = "";
	public int $userid = -999;
	public mixed $usergroup = [];
	public mixed $roles = [];
	public mixed $email = "";
	public ?array $returnData = null;
	private ?bool $echoSuppress;
	private mixed $cookiePath;
	private const array schemaFiles = ['inc/js/perm_items.json', 'inc/js/perm_items_generic.json']; // list of file based schema definitions used for permission structures

	private ?uiLang $uiLang; // translation class instance

	// constant declaration for bad password threshold checking
	const int MAX_BADPWD_COUNT = 20;
	const int MAX_TIME4_BADPWD = 300; // definition value is in seconds; 300 = 5 mins
	const int BADPWD_LOCKOUT_TIME = 900; // temporary lockout in seconds; 900 = 15 mins
	private const string SECURE_COOKIE_HTTP_ERROR = 'Secure cookies are enabled, but OASYS is being accessed over HTTP. Please use HTTPS or disable secure cookies.';

	public function __construct(bool $noOutput = false)
	{
		# ----------------------------------------------- #
		# Register Shutdown Function and Return Data Init #
		# ----------------------------------------------- #
		register_shutdown_function([$this, 'responseAndExit']);
		$this->returnData['error'] = false; //if there is an error, this will contain a string with the error message

		$this->config = OasysSettings::getInstance();
		$this->backendState = OasysBackendState::getInstance();
		$this->settings = &$this->config->getSettingsArray();

		// if using output buffer, uncomment line below and line at end of file
		// ob_start();

		// set default JSON output, or not
		$this->echoSuppress = $noOutput;

		// define DOCROOT constant
		if (!defined("DOCROOT")) {
			define("DOCROOT", realpath(__DIR__ . '/../../../') . '/');
		}

		// This will also make available database credentials, settings and language information

		// define master cookie path for class
		$this->cookiePath = $this->settings['JSrootURL'];

		// init db class object
		$this->db = $this->config->getDatabaseInstance();

		# ------------------- #
		# Translation Include #
		# ------------------- #
		require_once DOCROOT . "editor/inc/php/uiLang.php"; // required for translation inclusion
		$this->uiLang = new uiLang($this->settings['interfaceLanguage']);

		# ------------- #
		# State Inits   #
		# ------------- #

		$this->sid = $this->backendState->getStateId();

		# --------------------------------------------- #
		# Set class scoped user variables if they exist #
		# --------------------------------------------- #

		$this->userid = (int)($this->backendState->userid ?? -999);
		$this->username = $this->getUsername($this->userid) ?? "";
		$this->usergroup = $this->backendState->usergroup ?? [];
		$this->roles = $this->backendState->roles ?? [];
		$this->email = $this->backendState->email ?? "";

		# --------------- #
		# Action routines #
		# --------------- #

		// set action value in our data return array
		$this->returnData['action'] = $_POST['action'] ?? '';

		if (isset($this->backendState->SSOloginTrigger) && ($this->backendState->SSOloginTrigger === true)) $this->returnData['action'] = "login";

		if (!in_array($this->returnData['action'], ['login', 'check', 'logout'])) {
			$this->echoSuppress = true;
		}

		// determine functions to call baesd on sent action request value
		switch ($this->returnData['action']) {
			# --------------------- #
			# JS Login Call Handler #
			# --------------------- #
			case 'login':
				if (($this->settings['cookieSecure'] ?? false) && !$this->requestUsesHttps()) {
					$message = $this->uiLang->translate(self::SECURE_COOKIE_HTTP_ERROR);
					$this->returnData['error'] = $message;
					$this->returnData['returnMsg'] = $message;
					return;
				}

				/** @var array|bool $loginInputs Array containing username/password when submission is valid, otherwise boolean 'false' if non-conforming */
				$loginInputs = $this->loginPrecheck();

				// validate and parse all of our input data from client AJAX call
				if ($loginInputs === false) {
					// if parser returns false, the JSON structure was bad or user inputs did not conform to restrictions
					$this->killBackendState($this->uiLang->translate("Incorrect credentials."), true);
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
				$uid = $this->db->fetchValue("SELECT `id` FROM `users` WHERE `name` = ?", [$this->username])['data'];
				$this->check_mmode($uid, true);
				$this->check();
				break;

			case 'logout':
				$this->logout();
				break;
		}
	}

	/**
	 * Determine whether the browser-facing request uses HTTPS, including when
	 * TLS is terminated by a reverse proxy that supplies X-Forwarded-Proto.
	 */
	private function requestUsesHttps(): bool
	{
		$https = strtolower((string)($_SERVER['HTTPS'] ?? ''));
		if ($https !== '' && $https !== 'off' && $https !== '0') {
			return true;
		}

		$forwardedProto = explode(',', (string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''))[0];
		return strtolower(trim($forwardedProto)) === 'https';
	}

	private function check_mmode(?int $uid, bool $disableMsg = false): void
	{
		if (is_null($uid)) return;

		// required for front/backend active login checking
		require_once __DIR__ . "/systemState.php";

		// check for maintenance mode, block login if maint mode active
		$sstate = get_mmode("backend", $this->db);

		if ($sstate === true && $this->checkSA($uid) === false) {
			$retMsg = ($disableMsg) ? "" : $this->uiLang->translate("System is currently in maintenance mode. Please try again later.");
			$this->killBackendState($retMsg, true);
			exit;
		}
	}

	/**
	 * Validate some basic assumptions for user/pass and system state prior to starting actual real login routine.
	 * @param string|null $username Submitted username
	 * @param string|null $password Submitted password
	 * @return void
	 */
	private function outerLogin(?string $username, ?string $password): void
	{

		// get the uid of the logging in user
		$uid = $this->db->fetchValue("SELECT `id` FROM `users` WHERE `name` = ?", [$this->username])['data'];

		// check maintenance mode status
		$this->check_mmode($uid);

		// call login method after initial input validation/sanitation/maintenance check have passed
		$loginAttempt = $this->loginAuthValidation($username, $password);
		if ($loginAttempt === true) {
			// log successful authentication
			$this->returnData['returnMsg'] = $this->uiLang->translate("User has been successfully logged in.");

			// clear out the users.resetdata column for the user to keep things nice n' tidy
			$this->db->update("users", ['resetdata' => null], "id = ?", [$uid]);
		} else {
			$this->rejectLoginAttempt($loginAttempt);
		}
	}

	/**
	 * Reject a normal credential attempt without deleting the anonymous backend
	 * state. Keeping that state allows another AJAX login attempt on the same
	 * page while still removing every value that could represent authentication.
	 */
	private function rejectLoginAttempt(string $message): void
	{
		$this->setAuthResult($message);
		foreach (['userid', 'username', 'usergroup', 'roles', 'email', 'editor_active'] as $property) {
			if (isset($this->backendState->$property)) {
				unset($this->backendState->$property);
			}
		}

		$this->userid = -999;
		$this->username = '';
		$this->usergroup = [];
		$this->roles = [];
		$this->email = '';
		$this->returnData['error'] = $message;
		$this->returnData['returnMsg'] = $message;
	}

	/**
	 * initial sesh/auth check and one off consistency routines
	 * @return void
	 */
	private function check(): void
	{
		// check if session has valid auth
		$authResult = $this->getAuthResult();
		if (($authResult !== true) && (!empty($this->backendState->username))) {
			$this->writeLogEntry("BAD BACKENDSTATE: $authResult");
			$this->killBackendState($authResult);
		}

		// check that our user account is active/enabled and return array of available languages

		// FYI: This particular condition would probably only occur when the login page is reloaded after account disable and before logout
		if ((!empty($this->username)) && ($this->checkAcctEnabled($this->userid) === false)) {
			$this->killBackendState($this->uiLang->translate("Account has been disabled."), true);
		}

		// return list of languages
		// $this->returnData['langs'] = $languages; //FYI: instead of using the full set of langs in the DB, we set a hard-coded set back for editor
		$this->returnData['langs'] = ['DE' => 'DE', 'EN' => 'EN', 'FR' => 'FR'];


		/* -----------------------EDITOR LIST VALIDATION AND ENFORCEMENT---------------------------- */

		global $languages, $skins;
		$eList = ['placeholder'];
		$ugIds = $this->usergroup;
		$modRawData = \Oasys\OasysSettings::findMods();
		$modData = [];
		$core_editor_list = $this->config->getDefaults()['editorButtons']['choices']; // fetch core editor list sans modules
		//remove all buttons that have a property 'module' => true
		foreach ($core_editor_list as $button => $properties) {
			if (isset($properties['module']) && $properties['module'] === true) {
				unset($core_editor_list[$button]);
			}
		}
		$user_access_level = 0; // default init as standard user

		if ($this->checkAdmin() === true) $user_access_level = 50; // regular admin
		// System Settings editor removed for non-elevated admins in the authcommonfunctions routine.
		if ($this->checkSA()) $user_access_level = 150; // superadmin

		/* build out all non-core editors as an array */
		foreach ($modRawData as $ml_key => $ml_entry) {
			foreach ($ml_entry["editor_sections"] as $ml_name => $m_entry) {
				$modData[$ml_name] = $m_entry;
			}
		}

		function enforce_AL(rixPDO $db, array $modData, array $core_editor_list, int $user_access_level, int $userGroupId): void
		{
			$editorData = [];

			// get current permission set for group
			$cur_ad_set = json_decode($db->fetchValue("SELECT JSON_QUERY(`accessDef`, '$.editorButtons') FROM `userGroups` WHERE id = ?", [$userGroupId])['data'] ?? '', true);

			// loop module access values, and set default to 'false' if it does not exist yet
			foreach ($modData as $main_mod_entry => $mod_values) {
				if (!isset($cur_ad_set[$main_mod_entry])) {
					$editorData["editorButtons"][$main_mod_entry] = false;
				} else {
					if ($mod_values["accesslevel"] > $user_access_level) {
						$editorData["editorButtons"][$main_mod_entry] = false; // enforce access level restrictions for module based editors as well
					} else {
						$editorData["editorButtons"][$main_mod_entry] = $cur_ad_set[$main_mod_entry]; // final fallthrough condition is to keep original value
					}
				}
			}

			// set access for each core editor module based on access level
			foreach ($core_editor_list as $c_key => $c_values) {
				$editorData["editorButtons"][$c_key] = $c_values["accesslevel"] <= $user_access_level;
			}

			// record when this update is made in the accessDef column
			$editorData["updateStamp"] = (new DateTime())->format(DateTimeInterface::ATOM);

			$el_db_update = json_encode($editorData, JSON_PRETTY_PRINT);
			$db->update("userGroups", ["accessDef" => $el_db_update], "id=?", [$userGroupId]);
		}

		/* get and set the ONLY the core editor list based on user access standards */
		switch ($user_access_level) {
			case 0:
				foreach ($ugIds as $userGroupId) {
					enforce_AL($this->db, $modData, $core_editor_list, $user_access_level, $userGroupId);
				}

				break;

			case 50:
				$admin_ug_id = $this->db->fetchValue("SELECT `id` FROM `userGroups` WHERE `name` = 'admin'")['data'];
				enforce_AL($this->db, $modData, $core_editor_list, $user_access_level, $admin_ug_id);

				break;

			case 150:
				$superadmin_ug_id = $this->db->fetchValue("SELECT `id` FROM `userGroups` WHERE `name` = 'superadmin'")['data'];
				enforce_AL($this->db, $modData, $core_editor_list, $user_access_level, $superadmin_ug_id);

				break;
		}

		/* ----------------------------------------------------------------------------------------- */

		// return combined editor access list, this may be out of use now since we have editor access hard-coded now
		$this->returnData['editors'] = $eList;

		// return usergroup membership id list
		$this->returnData['ugroups'] = $ugIds;


		// return selected language (if any)
		$defLang = $this->db->fetchValue("SELECT `defLang` FROM `users` WHERE `id` = ?", [$this->userid])['data'];
		$this->returnData['defLang'] = $defLang;

		// return email
		$this->returnData['email'] = $this->db->fetchValue("SELECT `email` FROM `users` WHERE `id` = ?", [$this->userid])['data'];
	}

	/**
	 * Final session logout routine for backend.
	 * @return void
	 */
	private function logout(): void
	{
		if (isset($this->backendState->SSOUserName)) {
			$this->returnData['SSOlogout'] = true;
		} else {
			$this->killBackendState($this->uiLang->translate("User has been logged out."));
			$this->writeLogEntry("USER ACTION: User logged out.");
		}
	}

	/**
	 * Check if session has access to a particular module/editor
	 * @param string $editorId
	 * @return bool When session has access to the editor id being checked, boolean 'true' is returned, otherwise, boolean 'false'
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
	 * @param bool $noEcho Whether or not to echo out at the shutdown handler part of the stack.
	 * @return string|bool
	 */
	public function getAuthResult(bool $noEcho = false): string|bool
	{
		// for Php calls, we want to supress the JSON echo, which is set via boolean argument for the method
		if ($noEcho === true) {
			$this->echoSuppress = true;
		}

		// if no authStatus is defined for this session, return false (probably session expiration condition)
		if (!isset($this->backendState->authStatus)) {
			return $this->uiLang->translate("No valid session was found. Please log in again.");
		}

		// if authStatus is set and it's not set to true, return message indicating that user is actively not authenticated
		if (isset($this->backendState->authStatus) && ($this->backendState->authStatus !== true)) {
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
	 * @param bool|string $auth
	 * @return void
	 */
	private function setAuthResult(bool|string $auth): void
	{
		$this->backendState->authStatus = $auth;
		$this->authResult = $auth;
	}

	/**
	 * setter for username
	 * @param string $username
	 * @return void
	 */
	private function setUsername(string $username): void
	{
		$this->backendState->username = $username;
		$this->username = $username;
	}

	/**
	 * getter for username (sourced from DB)
	 * @param int $uid
	 * @return string|null
	 */
	public function getUsername(int $uid): ?string
	{
		if ($uid === -999) return null;
		$realUsername = $this->db->fetchValue("SELECT `name` FROM `users` WHERE id = ?", [$uid])['data'];
		return $realUsername;
	}

	/**
	 * Force resync of group-based editor button list to master editor list.
	 * @return bool
	 */
	public function forceEditorSync(): bool
	{
		global $config;

		$settingsDefaults = $config->getDefaults();

		$masterEBlist = $settingsDefaults['editorButtons']['choices'];

		$ugList = $this->db->fetchColumn("SELECT `id` FROM `userGroups`")['data'];

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
				}
			}
		}

		return true;
	}

	/**
	 * Force resync of granular permissions to their concept permission value.
	 * @param bool|array $returnData
	 * @return bool
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
			$res = $this->db->fetchTable("SELECT `id`, `accessDef` FROM $accessTableName")['data'];

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
	 * @param array|bool $returnData
	 * @return bool
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
				$returnData['error'] = "<br>Permission[$counter] JSON permission schema file not valid. It may have been incorrectly updated. Please report to Oasys Administrator.";
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
				"</span><span style='font-weight: bold;'>$badUserStr</span><br><br>";
		}

		$permShell = '{"c_items": {}, "items": {}}';

		// iterate all the tables we require to check for permission lineitem updates
		foreach (['itemFolderAccess' => 1, 'testFolderAccess' => 1, 'loginsFolderAccess' => 1, 'users' => 2] as $accessTableName => $sKey) { // link the table to the correctly associated master schema we're checking against

			/** @noinspection SqlResolve */
			$res = $this->db->fetchTable("SELECT `id`, `accessDef` FROM $accessTableName")['data'];

			// iterate group/folder combinations in permission access tables and add missing records (default to false for missing entries)
			if ($sKey === 1) {
				$ugMasterList = $this->db->fetchColumn("SELECT `id` FROM `userGroups` WHERE `name` <> 'superadmin' AND `name` <> 'admin'")['data'];

				$tblUgIds = $this->db->fetchColumn("SELECT DISTINCT `userGroupId` FROM $accessTableName")['data'];

				$missingGroupsDefs = array_diff($ugMasterList, $tblUgIds);

				$rootTbl = "";
				if ($accessTableName === 'itemFolderAccess') $rootTbl = 'itemFolders';
				if ($accessTableName === 'testFolderAccess') $rootTbl = 'testFolders';
				if ($accessTableName === 'loginsFolderAccess') $rootTbl = 'loginsFolders';

				# ---------------------------------------------------- #
				# Missing accessDef fillout from root folder as source #
				# ---------------------------------------------------- #
				if (!empty($missingGroupsDefs)) {
					$uniqueFID_root = $this->db->fetchColumn("SELECT DISTINCT `id` FROM $rootTbl WHERE `name` <> 'Home'")['data'];

					foreach ($uniqueFID_root as $fID) {
						foreach ($missingGroupsDefs as $missingGroup) {
							$this->db->prepare("INSERT INTO $accessTableName VALUES (null, ?, ?, null, ?)");
							$this->db->executePrepared([$fID, $missingGroup, '{"c_items": {}, "items": {}}']);
						}
					}
				}

				# ----------------------------------------------------------------------- #
				# Missing individual entries in existing folder Ids from accessDef source #
				# ----------------------------------------------------------------------- #
				if (!empty($missingGroupsDefs)) {
					$uniqueFIDs = $this->db->fetchColumn("SELECT DISTINCT `folderId` FROM $accessTableName")['data'];

					foreach ($uniqueFIDs as $fID) {
						foreach ($missingGroupsDefs as $missingGroup) {
							$this->db->prepare("INSERT INTO $accessTableName VALUES (null, ?, ?, null, ?)");
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
						$this->db->execute("UPDATE `users` SET `accessDef` = JSON_SET(`accessdef`, '$.$psKey', JSON_OBJECT()) WHERE `id` = ?", [$entryVal['id']]);
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
						$this->db->prepare("UPDATE $accessTableName SET `accessDef` = JSON_SET(`accessDef`, CONCAT('$.', ?, '.', ?), false) WHERE `id` = ?");
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
								if (in_array($gp_entry, $masterSchema[$sKey][$cVal])) $cKey = $cVal;
							} // find the parent concept permission key based on granular permission name

							/** @noinspection SqlResolve */
							$parCval = $this->db->fetchValue(
								"SELECT JSON_EXTRACT(`accessDef`, CONCAT('$.', ?, '.', ?)) FROM $accessTableName WHERE id = ?",
								['c_items', $cKey, $entryVal['id']]
							)['data'] ?? 'false'; // get true/false value of the concept parent key linked to the new granular permission, or false if no value found, which shouldn't even be possible

								// insert key
							/** @noinspection SqlResolve */
							$this->db->prepare("UPDATE $accessTableName SET `accessDef` = JSON_SET(`accessDef`, CONCAT('$.', ?, '.', ?), $parCval) WHERE `id` = ?");
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
						$this->db->prepare("UPDATE $accessTableName SET `accessDef` = JSON_REMOVE(`accessDef`, CONCAT('$.', ?, '.', ?)) WHERE `id` = ?");
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
						$this->db->prepare("UPDATE $accessTableName SET `accessDef` = JSON_REMOVE(`accessDef`, CONCAT('$.', ?, '.', ?)) WHERE `id` = ?");
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
	 * @param int|null $userid
	 * @param string $email
	 * @return string|bool
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
	 * @param int|null $userid
	 * @return string|bool
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
		if (($this->getAuthResult() !== true) || (!isset($this->backendState->userid))) {
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
	 * @return array|bool
	 */
	private function loginPrecheck(): array|bool
	{
		// SSO username sanitation; this login type does not have a local password (validation done against SAML data returned by IdP)
		if (isset($this->backendState->SSOloginTrigger) && $this->backendState->SSOloginTrigger) {
			$loginInputs['username'] = filter_var($this->backendState->SSOUserName, FILTER_SANITIZE_FULL_SPECIAL_CHARS);
			$loginInputs['password'] = "";
		} else {
			// JSON -> array conversion, or bail if not valid
			$loginInputs = $this->handleInput(filter_input(INPUT_POST, 'data'));
			if (
				!isset($loginInputs['username'], $loginInputs['password'])
				|| !is_string($loginInputs['username'])
				|| !is_string($loginInputs['password'])
				|| trim($loginInputs['username']) === ''
				|| $loginInputs['password'] === ''
			) {
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
	 * @param string $data JSON formatted user/pass data.
	 * @return array|bool The return value will either be 'false' on error or bad data, or an arrayified version of the JSON input data.
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
	 * @param int $percentRotate 100 = do not rotate, 0 = force rotate
	 * @return void
	 */
	private function rotateSesh(int $percentRotate = 100): void
	{
		// limit our SID rotation to not cycle on every call
		if (rand(0, 99) < $percentRotate) {
			$this->backendState->rotateStateId();
		}
	}

	/**
	 * Attempt LDAP authentication based on login and password parameter input.
	 * The LDAP/Active Directory values are preconfigured in the setting section of Oasys.
	 * @param string $login
	 * @param string $password
	 * @return string One of the OasysLdapAuthenticator status constants.
	 */
	private function bindLDAP(string $login, string $password): string
	{
		return OasysLdapAuthenticator::authenticate(
			$login,
			$password,
			$this->settings,
			static function (string $message, array $context): void {
				$encodedContext = json_encode($context, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) ?: '{}';
				$details = $context === [] ? '' : " $encodedContext";
				self::writeLogEntry("LDAP: $message$details");
			}
		);
	}

	/**
	 * Main login routine (user/pass authentication check)
	 * @param string $username
	 * @param string $password
	 * @return string|bool
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
			$this->writeLogEntry("BAD INPUT: Unique instance of username `$username` not found.");
			$this->backendState->SSO_LO_ECODE = "oaNUF"; // this code will display 'user not found in oasys' on frontend return, when applicable in an SSO scenario
			return $this->uiLang->translate("Incorrect credentials.");
		}

		// set uid/gid val based on unique username existing
		$this->userid = (int)($this->db->fetchValue("SELECT `id` FROM `users` WHERE `name` = ?", [$username])['data'] ?? -999);
		$this->usergroup = $this->db->fetchColumn("SELECT `usergroupId` FROM `userGroupAccess` WHERE `userId` = ?", [$this->userid])['data'];

		// set roles values based on logged in ID
		$roleRes = $this->db->fetchValue("SELECT JSON_EXTRACT(`accessDef`, '$.c_items') FROM users WHERE `id` = ?", [$this->userid])['data'];
		$this->roles = json_decode($roleRes ?? '', TRUE);

		# ----------------------------------------------- #
		# Switch case for type of account being logged in #
		# ----------------------------------------------- #

		$acctType = $this->db->fetchValue("SELECT `acct_type` FROM `users` WHERE `id` = ?", [$this->userid])['data'];
		$countFailedAttempt = $acctType !== 'SSO';

		// Local and LDAP accounts are temporarily throttled after too many failed attempts.
		// SSO authentication is validated by the identity provider and does not use this counter.
		$lockMinutes = $acctType !== 'SSO' ? $this->badPasswordLockMinutesRemaining($this->userid) : 0;
		if ($lockMinutes > 0) {
			$message = sprintf(
				$this->uiLang->translate("Login temporarily locked after too many unsuccessful attempts. Please try again in %d minute(s) or ask an administrator to reset your password."),
				$lockMinutes
			);
			$this->setAuthResult($message);
			$this->writeLogEntry("ACCOUNT RESTRICTION: Login temporarily blocked after too many incorrect password attempts.");
			return $message;
		}


		switch ($acctType) {

			# ---------------------------------------------------------------------------- #
			# SSO validation already run -- validate username exists in Oasys users table. #
			# Perform session checking to ensure the login attempt is being routed from an #
			# SSO route, and not direct login.                                             #
			# ---------------------------------------------------------------------------- #

			case 'SSO':

				if (
					isset($this->backendState->SSOloginTrigger) &&
					$this->backendState->SSOloginTrigger === true &&
					isset($_POST['RelayState']) &&
					$_POST['RelayState'] === "oali"
				) {
					$pwdRes = true;
					$this->setAuthResult($pwdRes);
					$this->backendState->SSOloginTrigger = false;
				} else {
					$pwdRes = $this->uiLang->translate("Incorrect credentials.");
					$this->setAuthResult($pwdRes);
					$this->killBackendState($this->uiLang->translate("Incorrect credentials."), true);
				}

				break;

			case 'LDAP':

				# ------------------------------------------------------------- #
				# Perform LDAP connection and validation of sent in credentials #
				# ------------------------------------------------------------- #

				$ldapAttempt = $this->bindLDAP($username, $password);
				$countFailedAttempt = in_array($ldapAttempt, [
					OasysLdapAuthenticator::INVALID_CREDENTIALS,
					OasysLdapAuthenticator::PASSWORD_EXPIRED
				], true);
				$pwdRes = match ($ldapAttempt) {
					OasysLdapAuthenticator::SUCCESS => true,
					OasysLdapAuthenticator::INVALID_CREDENTIALS,
					OasysLdapAuthenticator::PASSWORD_EXPIRED => $this->uiLang->translate("Incorrect credentials."),
					default => $this->uiLang->translate("Couldn't connect to LDAP service.")
				};
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
		# Bad password count exceeding check (exclude SSO and LDAP service/configuration failures)  #
		# ---------------------------------------------------------------------------------------- #

		if ($pwdRes !== true && $countFailedAttempt) {
			$bpCheckRes = $this->badPassCountOk($this->userid);
			if ($bpCheckRes !== true) {
				$this->killBackendState($bpCheckRes, true);
				$this->writeLogEntry("BAD INPUT: User exceeded bad password threshold.");
				exit; // FYI: this is a special short-circuit to the exit handler to immediately return a more specific login failure message
			}
		} elseif ($pwdRes === true) {
			$this->loginTSupdate($this->userid);
		}

		# --------------------- #
		# Account enabled check #
		# --------------------- #

		if ($this->checkAcctEnabled($this->userid) !== true) {
			$this->writeLogEntry("ACCOUNT RESTRICTION: Login attempted on disabled user account.");
			$this->killBackendState($this->uiLang->translate("Account has been disabled."), true);

			// special re-direct for SSO login types which have a disabled Oasys account
			if ($acctType === "SSO") {
				$this->backendState->SSO_LO_ECODE = "oaD"; // change our default error code message to 'account disabled' when returning frontend message
				return "SSO_E_AD"; // this gets returned to the ssologin call for oasys login -- not used now, but could be used later
			} else {
				exit; // FYI: this is a special short-circuit to the exit handler to immediately return a more specific login failure message
			}
		}

		// output message for login attempt to send back to frontend client
		if ($this->getAuthResult() !== true) {
			$this->writeLogEntry("BAD INPUT: $pwdRes");
			return $pwdRes;
		} else {
			// reset our bad login counter and timestamp on an authenticated login
			$this->db->update("users", ["bad_logins" => "0", "last_bad_pass" => null], "id = ?", [$this->userid]);

			// set class-scoped uid/gid vals only after sucessful login
			$this->backendState->userid = $this->userid;
			$this->backendState->usergroup = $this->usergroup;
			$this->backendState->roles = $this->roles;
			$this->backendState->email = $this->email;
			$this->backendState->editor_active = true;

			$this->writeLogEntry("USER ACTION: User successfully logged in.");
			$this->rotateSesh();
			return true;
		}
	}

	/**
	 * Update the lastLogin timestamp in the users.activity column for a given user.
	 * @param int $uid The user ID whose lastLogin timestamp will be updated.
	 * @return void
	 */
	private function loginTSupdate(int $uid): void
	{
		// Update or create the JSON structure for lastLogin in users.activity column
		$currentActivity = $this->db->fetchValue("SELECT `activity` FROM `users` WHERE `id` = ?", [$uid])['data'];
		$activityData = json_decode($currentActivity ?? '{}', true) ?? [];

		// Ensure authTimes key exists
		if (!isset($activityData['authTimes'])) {
			$activityData['authTimes'] = [];
		}

		// Move the current timestamp to previous timestamp, unless this is an initial run
		if (isset($activityData['authTimes']['currentStateLogin'])) {
			$activityData['authTimes']['previousStateLogin'] = $activityData['authTimes']['currentStateLogin'];
			$activityData['authTimes']['currentStateLogin'] = date("Y-m-d H:i:s");
		} else {
			$activityData['authTimes']['currentStateLogin'] = date("Y-m-d H:i:s");
			$activityData['authTimes']['previousStateLogin'] = false;
		}

		// Update the database
		$this->db->update('users', ['activity' => json_encode($activityData, JSON_PRETTY_PRINT)], "id = ?", [$uid]);
	}

	/**
	 * Check if account in question is enabled/disabled
	 * @param int $uid
	 * @return bool
	 */
	public function checkAcctEnabled(int $uid): bool
	{
		$query = "SELECT `status` FROM `users` WHERE `id`=?";
		$qResult = $this->db->fetchValue($query, [$uid]);
		$acctStatus = $qResult['data'];

		// what to do if account is disabled
		return !(((int)$acctStatus !== 1));
	}

	/**
	 * Unset and destroy the active session.
	 * Used when auth condition is unmet, various errors, and standard logout requests.
	 * @param string|bool $killMsg
	 * @param bool $isError
	 * @return void
	 */
	public function killBackendState(string|bool $killMsg = false, bool $isError = false): void
	{
		$this->setAuthResult($killMsg); // set class auth var to reason why it's being killed
		$this->backendState->eraseState();

		// remove upgrader auth cookies
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
	 * @param int $uid
	 * @return string|bool
	 */
	private function badPassCountOk(int $uid): string|bool
	{
		$row = $this->db->fetchRow(
			"SELECT `bad_logins`, `last_bad_pass` FROM `users` WHERE `id` = ?",
			[$uid]
		)['data'] ?? [];
		$lastBadTime = !empty($row['last_bad_pass']) ? strtotime($row['last_bad_pass']) : false;

		// A sufficiently long gap starts a new sequence of failed attempts.
		if ($lastBadTime === false || time() - $lastBadTime >= self::MAX_TIME4_BADPWD) {
			$this->db->update("users", ["bad_logins" => 0, "last_bad_pass" => null], "id = ?", [$uid]);
		}

		$badPassIncrementQuery = "UPDATE `users`
			SET `bad_logins` = `bad_logins` + 1, `last_bad_pass` = ?
			WHERE `id` = ?";
		$this->db->prepare($badPassIncrementQuery);
		$this->db->executePrepared([date("Y-m-d H:i:s"), $uid]);

		$bpCount = (int)($this->db->fetchValue(
			"SELECT `bad_logins` FROM `users` WHERE `id` = ?",
			[$uid]
		)['data'] ?? 0);

		if ($bpCount >= self::MAX_BADPWD_COUNT) {
			return sprintf(
				$this->uiLang->translate("Login temporarily locked after too many unsuccessful attempts. Please try again in %d minute(s) or ask an administrator to reset your password."),
				(int)ceil(self::BADPWD_LOCKOUT_TIME / 60)
			);
		}
		return true;
	}

	/**
	 * Return the remaining temporary bad-password lockout in whole minutes.
	 * Expired counters are cleared automatically; the account's enabled status is never changed.
	 */
	private function badPasswordLockMinutesRemaining(int $uid): int
	{
		$row = $this->db->fetchRow(
			"SELECT `bad_logins`, `last_bad_pass` FROM `users` WHERE `id` = ?",
			[$uid]
		)['data'] ?? [];
		$badLogins = (int)($row['bad_logins'] ?? 0);
		$lastBadTime = !empty($row['last_bad_pass']) ? strtotime($row['last_bad_pass']) : false;

		if ($badLogins < self::MAX_BADPWD_COUNT || $lastBadTime === false) {
			return 0;
		}
		$remainingSeconds = self::BADPWD_LOCKOUT_TIME - (time() - $lastBadTime);
		if ($remainingSeconds > 0) {
			return (int)ceil($remainingSeconds / 60);
		}

		$this->db->update("users", ["bad_logins" => 0, "last_bad_pass" => null], "id = ?", [$uid]);
		return 0;
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
		//		session_write_close();
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
	 * @param string $entry Output log entry string
	 * @param string $logfileName output file, defaults to 'authentication.log' if left blank or empty string sent in
	 * @param array $opDetail Extra log detail [location, action]
	 * @return void
	 */
	public static function writeLogEntry(string $entry, string $logfileName = "authentication.log", array $opDetail = ['loc' => '', 'action' => '']): void
	{
		global $settings, $backendState;

		// force default log file name even when an empty string is sent in
		if ($logfileName === "") $logfileName = "authentication.log";

		// conditional line-breaking when needed
		$multiLine = substr_count($entry, "\n") > 0;

		$user = $backendState->username ?? "<UNKNOWN_USERNAME>";
		$id = $backendState->userid ?? "<UNKNOWN_USER_ID>";
		$timeAndUserInfo = date("[Y-m-d H:i:s]") . "[$user:$id]";
		$actionInfo = "[" . $opDetail['loc'] . "|" . $opDetail['action'] . "]\t";
		$stateCapture = ($multiLine ? "\n" : " ") . "STATEID: [" . $backendState->getStateId() . "]";

		// define DOCROOT for static method calls
		if (!defined("DOCROOT")) {
			define("DOCROOT", realpath(__DIR__ . '/../../../') . '/');
		}

		$logFileRelPath = DOCROOT . "logs" . DIRECTORY_SEPARATOR . $logfileName;
		if (!file_exists($logFileRelPath)) {
			touch($logFileRelPath);
		}

		// for fresh installs that don't have the file present yet
		file_put_contents($logFileRelPath, $timeAndUserInfo . $actionInfo . ($multiLine ? "\n" : "") . $entry . $stateCapture . "\n\n", FILE_APPEND);
	}

	/**
	 * Common method for logging various operator actions in content editors.
	 * @param array $data
	 * @param string $logType
	 * @param array $retData
	 * @return void
	 */
	public function prepLog(array $data, string $logType, array $retData): void
	{
		global $permAuth;
		$operLogname = "operation_actions.log";
		$operDetail = ['action' => '', 'loc' => $permAuth->srcRef]; // extra action/location detail var

		// cancel logging if error prevented proper execution of the operation
		if ($retData['error'] !== false) {
			$this->writeLogEntry("ERROR! \nMODULE: $permAuth->srcRef\nRAW DATA:" . print_r($data, true));
			return;
		}

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

				$this->writeLogEntry("Object type [$renType] in [$permAuth->srcRef] module with id [$renId] was renamed from [$renOrig] to [$renNewName]", $operLogname, $operDetail);

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
					if (count($value['c_items']) === 0) {
						unset($log_oldPerm[$k1]);
						unset($newPermObj[$k1]);
					}
				}

				// query and attach the group name value for each group ID entry
				foreach (array_keys($log_oldPerm) as $groupId) {
					$log_oldPerm["$groupId (" . $this->db->fetchValue("SELECT `name` FROM `userGroups` WHERE id =?", [$groupId])['data'] . ")"] = $log_oldPerm[$groupId];
					unset($log_oldPerm[$groupId]);
				}

				foreach (array_keys($newPermObj) as $newGroupId) {
					$newPermObj["$newGroupId (" . $this->db->fetchValue("SELECT `name` FROM `userGroups` WHERE id =?", [$newGroupId])['data'] . ")"] = $newPermObj[$newGroupId];
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
							"Permissions updated in [{$it_vars['i_rootFldTblName']}] table on folder ID [$fId] ($fldName) in the [$permAuth->srcRef] module\nBEFORE:\n$log_oldPerm\nAFTER\n$log_newPerm\n",
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

						$log_curOwnerName = is_int($log_curOwnerId) ? $this->db->fetchValue(("SELECT `name` FROM `users` WHERE `id` = ?"), [$log_curOwnerId])['data'] : "<USER REMOVED>";

						// log action
						if (empty($log_curOwnerName)) $log_curOwnerName = "<USER REMOVED>"; // when dealing with expired/non-existent user IDs
						if (is_array($data['newOwner'])) $data['newOwner'] = $data['newOwner'][array_key_first($data['newOwner'])]; // handle array data -- only updating to one owner ever at a time
						$this->writeLogEntry(
							"Owner changed in [$permAuth->srcRef] module on folder ID [$fId] ($log_fldName) from userid [$log_curOwnerId] ($log_curOwnerName) to userid [{$data['newOwner']}] ($log_newOwnerName)",
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
					if (str_starts_with($value['id'], 'f')) {
						array_push($delItems, "Folder ID: [{$value['dbId']}] ('{$value['name']}')");
					}

					if (str_starts_with($value['id'], 'ig')) {
						array_push($delItems, "ItemGroup ID: [{$value['dbId']}] ('{$value['name']}')");
					}

					if (str_starts_with($value['id'], 't')) {
						$tType = $permAuth->srcRef === 'tests' ? 'Test' : 'Test Taker';
						array_push($delItems, "$tType ID: [{$value['dbId']}] ('{$value['name']}')");
					}
				}

				$delItems = json_encode($delItems, JSON_PRETTY_PRINT);

				$this->writeLogEntry("The following content was deleted in the [$permAuth->srcRef] module\n$delItems\n", $operLogname, $operDetail);
				break;

			case 'deleteItem':
				# --------------------- #
				# ITEM DELETION LOGGING #
				# --------------------- #

				$i_name = $data['origName'];
				$g_id = $data['groupId'];
				$g_name = $data['groupName'];
				$operDetail['action'] = "Item Deletion";

				$this->writeLogEntry("The following item was deleted in the [$permAuth->srcRef] module: item ID [{$data['id']}] ($i_name) belonging to group ID [$g_id] ($g_name)", $operLogname, $operDetail);

				break;

			case 'moveObjects':
				# --------------------- #
				# OBJECT MOVING LOGGING #
				# --------------------- #

				$module = $permAuth->srcRef;
				$data_orig = $data['origInfo'];
				$target = $data['target'];
				$operDetail['action'] = "Object Move";

				$this->writeLogEntry("The following content was moved to a new folder location in the [$module] module\n$data_orig", $operLogname, $operDetail);

				break;

			case "resetTTakers":

				$idStr = "\n" . implode("\n", $data);
				$operDetail['action'] = "Test Taker Results Reset";

				$this->writeLogEntry("The following test taker ID(s) had all test results reset for all passwords: $idStr\n", $operLogname, $operDetail);

				break;

			case "resetResPass":

				$operDetail['action'] = "All Password Results Reset";
				$ttid = $data["testee"];
				$pwdIds = $data["password"];
				$ttname = $data["ttname"];

				$this->writeLogEntry("The following password ID [$pwdIds] had all its test results reset for the test taker ID [$ttid] (\"$ttname\")\n", $operLogname, $operDetail);
				break;

			case "resetResTestPass":

				$operDetail["action"] = "Test/Password Results Reset";
				$testId = $data["test"];
				$testName = $data["testName"];
				$passId = $data["password"];
				$ttid = $data["testee"];
				$ttname = $data["ttname"];

				$this->writeLogEntry("The following test ID [$testId] (\"$testName\") had its results reset for the password ID [$passId] and test taker ID [$ttid] (\"$ttname\")\n", $operLogname, $operDetail);
				break;

			case "testResResults":

				$operDetail['action'] = "Test Results Reset";
				$allIds = "\n" . implode("\n", $data);
				$this->writeLogEntry("Results for all associated test takers were reset for the following test ID(s): $allIds\n", $operLogname, $operDetail);


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
	 * @return void
	 */
	public function responseAndExit(): void
	{
		// global $returnData;
		// $this->returnData = array_merge($this->returnData, $returnData);
		$error = error_get_last();
		if (!empty($error)) {
			$documentRoot = filter_input(INPUT_SERVER, "DOCUMENT_ROOT");
			$file = str_replace($documentRoot, '', $error['file']);
			$this->returnData['fatalError'] = "<p>Fatal error [type {$error['type']}] on line {$error['line']} of<br><code class='tinyCode'>$file</code></p><p>{$error['message']}</p>";
		}

		$finalAuth = $this->getAuthResult();

		if ($finalAuth === true) {
			// update username in case updated in middle of session
			if (isset($this->backendState->username)) {
				$unameRefresh = $this->db->fetchValue("SELECT `name` FROM `users` WHERE `id` = ?", [$this->backendState->userid])['data'];
				$this->setUsername($unameRefresh);
			}

			// update usergroups in case updated in middle of session
			if (isset($this->backendState->usergroup)) {
				$ugroupRefresh = $this->db->fetchColumn("SELECT `usergroupId` FROM `userGroupAccess` WHERE `userId` = ?", [$this->backendState->userid])['data'];
				$this->backendState->usergroup = $ugroupRefresh;
			}

			// update roles in case updated in middle of session
			if (isset($this->backendState->roles)) {
				$roleRes = $this->db->fetchValue("SELECT JSON_EXTRACT(`accessDef`, '$.c_items') FROM users WHERE `id` = ?", [$this->userid])['data'];
				$this->backendState->roles = json_decode($roleRes ?? '', TRUE);
			}

			// update email in case updated in middle of session
			if (isset($this->backendState->email)) {
				$emailRes = $this->db->fetchValue("SELECT `email` FROM `users` WHERE `id` = ?", [$this->userid])['data'];
				$this->backendState->email = $emailRes;
			}
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
		}
	}
}
