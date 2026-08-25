<?php

/** @noinspection SqlResolve */

/**
 * Permission allowance checking for Oasys backend operations.
 * 
 * @author NILANJAN NAG
 */
class permAuth
{
	# --------------------------- #
	# Standard class declarations #
	# --------------------------- #

	private rixPDO $db; // DB object for use in class
	private $action  = null; // external action being checked
	private $data = null; // data related to action being checked
	public userAuth $myAuth; // userauth class
	public $returnData = null; // return info for client or further processing
	private $permType = null;
	public $folder_id = null;
	public $itemPerms = null; // item permissions pairs
	public $itemPermsFlat = null; // flattened item permissions
	public $srcRef = null; // source reference (page from which request was made)
	private $uiLang = null; // translation class instance
	private $pi_path = ""; // permission items file path
	private $pig_path = ""; // permisison items generic flie path

	public function __construct(string $action, array $data, userAuth $myAuth)
	{
		if (!(isset($_SERVER['HTTP_REFERER']))) {
			$this->myAuth->writeLogEntry("BAD REFERRER: Page referrer token not found (SERVER['HTTP_REFERER'] not set). [" . basename(__FILE__) . "▶{$this->action}]");
			$this->returnData['error'] = $this->uiLang->translate("Page referrer token not found.");
			return;
		}

		global $sql_db, $sql_user, $sql_password, $sql_host, $settings;

		// define DOCROOT constant
		if (!defined("DOCROOT")) define("DOCROOT", str_replace("//", "/", ($_SERVER['CONTEXT_DOCUMENT_ROOT'] ?? $_SERVER['DOCUMENT_ROOT']) . $settings['rootURL']));

		$this->action = $action;
		$this->data = $data;
		$this->myAuth = $myAuth;
		$this->returnData['error'] = false;

		// init rixPDO DB object
		$this->db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, DOCROOT . "logs/permauth_db_err.log", 1, $this->returnData, 'error');

		# ------------------- #
		# Translation Include #
		# ------------------- #
		require_once DOCROOT . "editor/inc/php/uiLang.php"; // required for translation inclusion
		$this->uiLang = new uiLang($settings['interfaceLanguage']);

		# ------------------------------------------------------------------------------------------ #
		# Determine referring page and set vars based on it, or exit with error code on bad referral #
		# ------------------------------------------------------------------------------------------ #
		$allowedSources = ['dashboard', 'backup', 'upgrader', 'systemSettings', 'l10n', 'users', 'content', 'tests', 'items', 'testTakers', 'results', 'accountProp', 'activityTracker'];

		switch ($action) {
			case 'previewItem':
				$this->srcRef = 'items';
				$this->action = 'fetchItem';
				$action = 'fetchItem'; // set action to fetchItem for consistency
				break;
			case 'previewGroup':
				$this->srcRef = 'items';
				$this->action = 'fetchItemGroup';
				$action = 'fetchItemGroup'; // set action to fetchItemGroup for consistency
				break;
			case 'previewTest':
				$this->srcRef = 'tests';
				$this->action = 'fetchTest';
				$action = 'fetchTest'; // set action to fetchTest for consistency
				break;
			default:
				foreach ($allowedSources  as $srcPage) {
					if (str_contains($_SERVER['HTTP_REFERER'], $srcPage)) {
						$this->srcRef = $srcPage;
						break;
					}
				}
		}

		if (empty($this->srcRef)) {
			$this->myAuth->writeLogEntry("BAD REFERRER: referrer page not in whitelist. Value recorded: " . $_SERVER['HTTP_REFERER'] . " : [" . basename(__FILE__) . "▶{$this->action}]");
			$this->returnData['error'] = $this->uiLang->translate("Could not determine section referral source.");
			return;
		}

		# --------------------------------- #
		# Load JSON permission schema files #
		# --------------------------------- #

		$this->pi_path = DOCROOT . "editor/inc/js/perm_items.json";
		$this->pig_path = DOCROOT . "editor/inc/js/perm_items_generic.json";

		# Pre-check that the required JSON firstly exist #
		if (!file_exists($this->pi_path)) {
			$this->myAuth->writeLogEntry("SYSTEM ERROR: perm_items.json file is missing! [" . basename(__FILE__) . "▶{$this->action}]");
			$this->returnData['error'] = $this->uiLang->translate("Permission[1] JSON schema file is missing! Please report to Oasys Administrator.");
			return;
		}

		if (!file_exists($this->pig_path)) {
			$this->myAuth->writeLogEntry("SYSTEM ERROR: perm_items_generic.json file is missing! [" . basename(__FILE__) . "▶{$this->action}]");
			$this->returnData['error'] = $this->uiLang->translate("Permission[2] JSON schema file is missing! Please report to Oasys Administrator.");
			return;
		}


		$this->itemPerms = json_decode(file_get_contents($this->pi_path) ?: '', true); // Itemgroup specific JSON permission set (converted to Php Array Object)
		if (json_last_error() !== JSON_ERROR_NONE) {
			$this->myAuth->writeLogEntry("SYSTEM ERROR: perm_items.json file found to be non-conforming. [" . basename(__FILE__) . "▶{$this->action}]");
			$this->returnData['error'] = $this->uiLang->translate("Permission[1] JSON schema file is invalid. Please report to Oasys Administrator.");
			exit;
		}

		$gen_perms = json_decode(file_get_contents($this->pig_path) ?: '', true); // Generic itemgroup specific JSON permission set (converted to Php Array Object)
		if (json_last_error() !== JSON_ERROR_NONE) {
			$this->myAuth->writeLogEntry("SYSTEM ERROR: perm_items_generic.json file found to be non-conforming. [" . basename(__FILE__) . "▶{$this->action}]");
			$this->returnData['error'] = $this->uiLang->translate("Permission[2] JSON schema file is invalid. Please report to Oasys Administrator.");
			exit;
		}

		# ------------------------------------------------------- #
		# Transform permission arrays into various usable formats #
		# ------------------------------------------------------- #
		$this->itemPermsFlat = [];
		array_walk_recursive($this->itemPerms, function ($val, $key) {
			array_push($this->itemPermsFlat, $val);
		});

		$gen_perms_flat = [];
		array_walk_recursive($gen_perms, function ($val, $key) use (&$gen_perms_flat) {
			array_push($gen_perms_flat, $val);
		});

		// item id being sent in for ig operations. We must catch multiple formulations of the groupId value as there is not a standard naming format for the incoming Ajax variable from the JS file
		$this->folder_id = [];

		/*
			######################################################################
			Determine item type(s) and load main item_ID array based on data input
			######################################################################
		*/

		# ------------------------------------------------------------------------------------------- #
		# Initial dashboard load does not include location -- force to 1 (root/home folder of module) #
		# ------------------------------------------------------------------------------------------- #
		if ($this->srcRef === "dashboard" && $this->action === "fetchLibrary") {
			$data['location'] = 1;
		}

		# ------------------------------------------------------------- #
		# Special case handling for ID-less or folder function requests #
		# ------------------------------------------------------------- #
		if (in_array($action, [
			'fetchLibrary',
			'newItemGroup',
			'newFolder',
			'newTest',
			'fetchItemLibrary',
			'fetchTestLibrary'
		])) {
			$this->folder_id['folders'] = [];
			array_push($this->folder_id['folders'], $data['location']);
		}
		# -------------- #
		# Wizard handler #
		# -------------- #
		elseif (in_array($action, ['wizardCreateFromFile', 'wizardCreate'])) {
			$this->folder_id['folders'] = [];
			array_push($this->folder_id['folders'], $data['pid']);
		}
		# ------------------------------ #
		# Fetch items permission handler #
		# ------------------------------ #
		elseif (in_array($action, ['fetchIgPerm', 'updatePerm'])) {
			$this->folder_id['folders'] = [];
			array_push($this->folder_id['folders'], $data['i_id']);
		}
		# --------------------------------------------------------- #
		# Single itemGroup (file) handling or library folder access #
		# --------------------------------------------------------- #
		elseif (isset($data['type']) && $data['type'] === 'folder') {
			$this->folder_id['folders'] = [];
			array_push($this->folder_id['folders'], $data['groupId'] ?? $data['itemgroup'] ?? $data['id'] ?? null);
		}
		# --------------------------------------------------------------------------------------------------------------------------------------------- #
		# Item editing (file) handling - we are not using 'location' value of item # because that value can be spoofed and not locked to actual item id #
		# --------------------------------------------------------------------------------------------------------------------------------------------- #
		elseif (in_array($action, ['checkItem', 'fetchStimulus', 'deleteItem', 'renameItem', 'saveItem', 'duplicateItem'])) {
			$this->folder_id['files'] = [];
			array_push($this->folder_id['files'], $data['item'] ?? $data['link'] ?? $data['id']);
		}
		# --------------------------- #
		# Test Takers action handling #
		# --------------------------- #
		elseif (in_array($action, ['saveTestAssignmentsLibrary', 'fetchTestStructure', 'saveMetaTagsChange', 'saveOverrides'])) {
			$this->folder_id['files'] = [];

			switch ($action) {
				case 'saveMetaTagsChange':
					array_push($this->folder_id['files'], $data['testId'] ?? $data['testeeId']);
					break;

				case 'saveTestAssignmentsLibrary':
					array_push($this->folder_id['files'], $data['testeeId']);
					break;

				case 'fetchTestStructure':
					array_push($this->folder_id['files'], $data['dbId'] ?? $data['deleteId']);
					break;
				case 'saveOverrides':
					array_push($this->folder_id['files'], $data['id']);
					break;
			}
		}
		# ---------------------------------- #
		# Reset test result request handling #
		# ---------------------------------- #
		elseif (in_array($this->action, ['resetResultsPassword', 'resetResultsTestee', 'resetResultsTest', 'resetResults'])) {
			if ($this->action === 'resetResultsTestee' || $this->action === 'resetResults') $this->folder_id['files'][] = $data['selection'][0]['dbId'];
			if ($this->action === 'resetResultsPassword') $this->folder_id['files'][] = $data['password'];
			if ($this->action === 'resetResultsTest') $this->folder_id['files'][] = $data['test'];
		}
		# ----------------------------------------------------------------------------------------- #
		# Multiple or mixed selection handling - a catch-all for a bunch of different request types #
		# ----------------------------------------------------------------------------------------- #
		elseif (
			isset($data['type']) &&
			($data['type'] === 'itemGroup' || $data['type'] === 'test')
			|| (!(isset($data['current']))
				&& (!(isset($data['sources'])))
				&& (!(isset($data['selection'])))
				&& (!(isset($data['pwId'])))
				&& (!(isset($data['searchString']))))
		) {
			$this->folder_id['files'] = [];
			array_push(
				$this->folder_id['files'],
				$data['groupId'] ??
					$data['testId'] ??
					$data['test'] ??
					$data['testee'] ??
					$data['itemgroup'] ??
					$data['id'] ??
					$data['dbId'] ??
					$data['itemId'] ??
					$data['selectedTest'] ??
					null
			);
		}
		# --------------------------------------------- #
		# Advanced crosscheck between managers handling #
		# --------------------------------------------- #
		elseif (isset($data['selection']) || isset($data['pwId'])) {
			if (isset($data['pwId'])) {
				$this->folder_id['files'] = [];
				array_push($this->folder_id['files'], $data['testee']);
				$this->folder_id['type'] = 'password';
			} else {
				foreach ($data['selection'] as $key => $value) {
					switch ($value['type']) {
						case 'template':
						case 'testee':
						case 'cloned':
							$this->folder_id['folders'] = [];
							array_push($this->folder_id['folders'], $data['location'] ?? $data['pid']);
							break;

						case 'folder':

							$this->folder_id['folders'][$key]['id'] = [];
							$this->folder_id['folders'][$key]['type'] = [];

							$this->folder_id['folders'][$key]['id'] = $data['selection'][$key]['dbId'];
							$this->folder_id['folders'][$key]['type'] = $value['type'];
							break;

						case 'test':
						case 'itemGroup':
						case 'pageGroup':
							$this->folder_id['files'] = [];
							array_push($this->folder_id['files'], $data['selection'][$key]['dbId']);
							break;

						default:
							$this->myAuth->writeLogEntry("BAD INPUT: Value type unable to be determined amongst testee, folder, test, or itemgroup. [" . basename(__FILE__) . "▶{$this->action}]");
							$this->returnData['error'] = $this->uiLang->translate("Bad input detected!");
							return;
							break;
					}
				}
			}
		}
		# ----------------------------------------------------------------------------------- #
		# Multiple or mixed selection handling - for other cases such as object move requests #
		# ----------------------------------------------------------------------------------- #
		elseif (isset($data['sources'])) {
			if ((isset($data['sources']['files'])) && !(empty($data['sources']['files']))) {
				$this->folder_id['files'] = $data['sources']['files'];
			}
			if ((isset($data['sources']['folders'])) && !(empty($data['sources']['folders']))) {
				$this->folder_id['folders'] = $data['sources']['folders'];
			}
			if ((isset($data['sources']['tests'])) && !(empty($data['sources']['tests']))) {
				$this->folder_id['files'] = $data['sources']['tests'];
			}
		} elseif (isset($data['searchString'])) {
			$this->folder_id['folders'] = [];
			array_push($this->folder_id['folders'], 'dummy_value');
		}

		// if we cannot detect the input type, return error
		if (empty($this->folder_id['files']) && empty($this->folder_id['folders'])) {
			$this->myAuth->writeLogEntry("BAD INPUT: Item ID files and folders empty. Request sent in without usable data. [" . basename(__FILE__) . "▶{$this->action}]");
			$this->returnData['error'] = $this->uiLang->translate("Unable to load item data values for permission handling.");
			return;
		}

		// determine permission request type based on $action argument's categorization (what array does it fall into? that determines request type assignment)
		if (in_array($action, $gen_perms_flat)) {
			// Generic: requires user level permission to execute
			$this->permType = "generic";
		} elseif ((in_array($action, $this->itemPermsFlat)) || (in_array($this->action, ['moveObjects', 'deletePassword']))) {
			// ItemObject: Requires itemgroup and/or folder level permission or ownership of item to execute;
			// force moveObject to be itemObject since there is not a lineitem permission for this
			$this->permType = "itemObject";
		} else {
			// does not require any permission to execute
			$this->permType = "standard";
		}
	}

	/**
	 * Primary function request permission checking method.
	 *
	 * @param array $data
	 * 
	 * @return bool|null
	 * 
	 */
	public function permCheck(array $data): ?bool
	{
		/*
			##########################################################################################
			ITEM PERMISISON CHECKING

			Code block below will check if the requested function is item related, and if so,
			will check first to see if the item owner value matches the logged in owner value;
			if this is the case, it will allow any item related function.

			If the groupitem owner ID does not match, it then checks to see if there is a specific
			access definition configured for the foreign user in the item[type]Access table, and if so,
			allows execution.

			If all of these conditions fail, the operation is not allowed.

			If the function being requested applies to multiple item IDs, the array is parsed
			and if one item id fails the check, none of the operations will execute.

			*superadmin check performed inside getaccessval method call
			##########################################################################################
		*/

		# ----------------------------------------- #
		# Set class vars based on remote permChecks #
		# ----------------------------------------- #
		if (isset($data['remCall']) && $data['remCall']) {
			$this->permType = "itemObject";

			if (isset($data['action'])) {
				if ($data['action'] === 'fetchLibrary') unset($this->folder_id);
				$this->action = $data['action'];
			}

			if (isset($this->folder_id['folders'][0])) unset($this->folder_id['folders'][0]);
			$this->folder_id['folders'][0] = $data['fid'];
		}

		# ------------------------------------------------------ #
		# Special skip for initial igSearch and testsSearch call #
		# ------------------------------------------------------ #
		if (!isset($data['remCall']) && (in_array($this->action, ['search', 'igSearch', 'testsSearch']))) return true;

		# ------------------------------------------------ #
		# ADMIN/SUPERADMIN BYPASS FOR ANY REQUESTED ACTION #
		# ------------------------------------------------ #
		if ($this->myAuth->checkSA() === true) {
			return true;
		}

		if ($this->myAuth->checkAdmin() && in_array($this->srcRef, ['items', 'tests', 'testTakers', 'results'])) {
			return true;
		}

		/*
			For now these operation check values are hard-coded and do not rely on any
			externally configurable JSON schema file. This may change in the future
			if deemed necessary. --NN
		*/

		# ----------------------------------- #
		# USERS MODULE ADMIN OPERATION CHECKS #
		# ----------------------------------- #

		if ($this->srcRef === 'users') {

			if ($this->myAuth->checkAdmin() !== true) {
				$this->returnData['error'] = $this->uiLang->translate("Unauthorized operation attempted.");
				return false;
			}

			// get superadmin group id val
			$saGroupId = $this->db->fetchValue("SELECT `id` FROM `userGroups` WHERE `name` = 'superadmin'")['data'];

			// get admin group id val
			$aId = $this->db->fetchValue("SELECT `id` FROM `userGroups` WHERE `name` = 'admin'")['data'];

			switch ($this->action) {

				case 'updatePerms':
					# elevated admins can update admins, but not superadmins; a standard admin cannot change any elevation level #

					// get list of groups to which the target belongs
					$targGroupList = $this->db->fetchColumn("SELECT `usergroupId` FROM `userGroupAccess` WHERE `userId` = ?", [$data['userId']])['data'];

					$isAdminUpdate = in_array($aId, $targGroupList); // check if trying to update another admin
					$isSAUpdate = in_array($saGroupId, $targGroupList); // check if trying to update a superadmin

					// prevent standard admin changing other admins, unless elevated, and also not on own account
					if ($this->myAuth->checkElevatedAdmin() === false && $isAdminUpdate && $data['userId'] !== $this->myAuth->userid) {
						$this->returnData['error'] = $this->uiLang->translate("Unauthorized action on admin user without elevated privileges.");
						return false;
					};

					// prevent any admin from changing any superadmin values
					if ($isSAUpdate) {
						$this->returnData['error'] = $this->uiLang->translate("Unauthorized action on superadmin user.");
						return false;
					}

					// prevent standard admin from elevating themselves
					if ($data['perm'] === 'Elevated Administrator' && $data['userId'] === $this->myAuth->userid) {
						$this->returnData['error'] = $this->uiLang->translate("Unauthorized action on own account.");
						return false;
					}

					break;

					// block group editor access editing/fetching for all admins regardless of elevation level
				case 'fetchGroupSettings':
					$theAdminGroupId = $this->db->fetchValue("SELECT `id` FROM `userGroups` WHERE `name` = 'admin'")['data'];
					if ($data['groupId'] === $theAdminGroupId) {
						$this->returnData['error'] = $this->uiLang->translate("Unauthorized operation. You may not edit the admin editor access list.");
						return false;
					};

					break;

				case 'addUser':
					// prevent non-elevated admin from creating user in admin group;
					if ($this->myAuth->checkElevatedAdmin() === false && $aId === intval($data['userData']['userGroupId'])) {
						$this->returnData['error'] = $this->uiLang->translate("Unauthorized new user creation attempt in admin group.");
						return null;
					}

					// prevent all admins from creating superadmin
					if (intVal($data['userData']['userGroupId']) === $saGroupId) {
						$this->returnData['error'] = $this->uiLang->translate("Unauthorized new user creation attempt in superadmin group.");
						return null;
					}

					break;

				case 'deleteUser':

					/*
						Minimum access level of any user deletion operation is 'admin', so check for that.
						Advanced deletion logic checking found in userHandling.php file.

						We do not have to check for superadmin access because that's checked for above
						and a generic 'true' is returned for all superadmin actions.
					*/

					if (!$this->myAuth->checkAdmin()) {
						$this->returnData['error'] = $this->uiLang->translate("Unauthorized user deletion attempt detected.");
						return null;
					}

					break;

				case 'passReset':
					if ($this->myAuth->checkSA() === false && $data['userId'] !== $this->myAuth->userid) {
						// get list of groups to which the target belongs
						$targGroupList = $this->db->fetchColumn("SELECT `usergroupId` FROM `userGroupAccess` WHERE `userId` = ?", [$data['userId']])['data'];

						$isAdminUpdate = in_array($aId, $targGroupList); // check if trying to update another admin
						$isSAUpdate = in_array($saGroupId, $targGroupList); // check if trying to update a superadmin

						// prevent admin changing other admins unless elevated
						if ($this->myAuth->checkElevatedAdmin() === false && $isAdminUpdate) {
							$this->returnData['error'] = $this->uiLang->translate("Unauthorized action on admin user without elevated privileges.");
							return null;
						};

						// prevent admin from changing any superadmin values
						if ($isSAUpdate) {
							$this->returnData['error'] = $this->uiLang->translate("Unauthorized action on superadmin user.");
							return null;
						}
					}

					break;

				default:

					break;
			}

			return true;
		}

		# ------------------------------------------ #
		# LOCALIZATION MODULE ADMIN OPERATION CHECKS #
		# ------------------------------------------ #

		if ($this->srcRef === 'l10n') {

			if ($this->myAuth->checkAdmin() !== true) {
				$this->returnData['error'] = $this->uiLang->translate("Unauthorized operation attempted.");
				return false;
			}

			// if operator passes the minimum 'admin' level check, they can do everything for l10n actions
			return true;
		}

		# --------------------------------------------- #
		# SYSTEM SETTINGS MODULE ADMIN OPERATION CHECKS #
		# --------------------------------------------- #

		if ($this->srcRef === 'systemSettings') {

			if ($this->myAuth->checkElevatedAdmin() !== true) {
				$this->returnData['error'] = $this->uiLang->translate("Unauthorized operation attempted.");
				return false;
			}

			return true;
		}

		# ------------------------------------- #
		# BACKUPS MODULE ADMIN OPERATION CHECKS #
		# ------------------------------------- #

		if ($this->srcRef === 'backup') {

			if ($this->myAuth->checkAdmin() !== true) {
				$this->returnData['error'] = $this->uiLang->translate("Unauthorized operation attempted.");
				return false;
			}

			switch ($this->action) {
				case 'getFile': // this action actually is called in dlActions.php, and the perm check is accounted for there
				case 'restoreSnapshot':
				case 'deleteBackup':
					if ($this->myAuth->checkElevatedAdmin() !== true) {
						$this->returnData['error'] = $this->uiLang->translate("Unauthorized operation attempted.");
						return false;
					}

					break;

				default:
					if ($this->myAuth->checkAdmin() !== true) {
						$this->returnData['error'] = $this->uiLang->translate("Unauthorized operation attempted.");
						return false;
					}
			}

			return true;
		}

		# -------------------------------------- #
		# UPGRADER MODULE ADMIN OPERATION CHECKS #
		# -------------------------------------- #

		if ($this->srcRef === 'upgrader') {

			if ($this->myAuth->checkAdmin() !== true) {
				$this->returnData['error'] = $this->uiLang->translate("Unauthorized operation attempted.");
				return false;
			}

			switch ($this->action) {
					// allow downloading of archives except for baseline unless elevated admin
				case 'getFileDlInstall':
					if (($this->data['fileDlName'] === '_BASELINE_') && ($this->myAuth->checkElevatedAdmin() !== true)) {
						$this->returnData['error'] = $this->uiLang->translate("Unauthorized operation attempted.");
						return false;
					}

					break;

				case 'changePwd':
					if ($this->myAuth->checkElevatedAdmin() !== true) {
						$this->returnData['error'] = $this->uiLang->translate("Unauthorized operation attempted.");
						return false;
					}

					break;

				default:
					if ($this->myAuth->checkAdmin() !== true) {
						$this->returnData['error'] = $this->uiLang->translate("Unauthorized operation attempted.");
						return false;
					}
			}

			return true;
		}


		# ------------------ #
		# MAIN ROUTINE START #
		# ------------------ #

		// folow different logic paths based on if permission request is for an item object or folder object
		if ($this->permType === "itemObject") {
			if (empty($this->folder_id)) {
				$this->myAuth->writeLogEntry("BAD INPUT: Attempted operation without proper input value(s): [" . basename(__FILE__) . "▶{$this->action}]");
				$this->returnData['error'] = $this->uiLang->translate("Bad input request data detected.");

				return false;
			}

			$it_vars = $this->setTypeVars($this->srcRef);

			# -------------------------------------------------------- #
			# Handle itemgroup (file) type input permission processing #
			# -------------------------------------------------------- #
			if (isset($this->folder_id['files'])) {
				foreach ($this->folder_id['files'] as $key => $fileItemId) {

					// special condition for cross-linked tests folder checking from test takers section
					// if ($this->srcRef === 'testTakersFolder' && in_array($this->action, ['saveTestAssignmentsLibrary', 'fetchTestStructure'])) { //FYI: saving/modifying test assignments now a logins perm function
					if ($this->srcRef === 'testTakers' && in_array($this->action, ['fetchTestStructure'])) {
						$parentFolderId = $this->db->fetchValue("SELECT `parent` FROM `tests` WHERE `id` = ?", [$fileItemId])['data']; // special condition to switch to an it_var value not currently in the varset definintion list
						$it_vars['i_rootFldTblName'] = $it_vars['i_xrefFldLink'];
					} elseif (
						in_array($this->action, ['checkItem', 'fetchStimulus', 'deleteItem', 'renameItem', 'saveItem', 'duplicateItem']) || ($this->action === 'preview' && $data['previewMode'] === 'item')
					) {
						if ($this->action === 'fetchStimulus' && $fileItemId === -1) continue; // special condition where stimulus is being unselected, and thus does not have a linked parent folder ID to compare action against
						$parentFolderId = $this->db->fetchValue("SELECT `parent` FROM {$it_vars['i_rootObjTblName']} WHERE id = (SELECT `groupId` FROM `items` WHERE `id` = ?)", [$fileItemId])['data'];
					} else {
						$parentFolderId = $this->db->fetchValue("SELECT `parent` FROM {$it_vars['i_rootObjTblName']} WHERE `id` = ?", [$fileItemId])['data'];
					}

					if (in_array($this->action, ['moveObjects', 'duplicateItemGroup', 'duplicateObjects'])) {
						$folderTargetId = $data['target'];

						// COPY/MOVEOBJECTS OWNER CHECK
						$sourceOwner = $this->db->fetchValue("SELECT `owner` FROM {$it_vars['i_rootFldTblName']} WHERE `id` = ?", [$parentFolderId])['data'] === $this->myAuth->userid;
						$targetOwner = $this->db->fetchValue("SELECT `owner` FROM {$it_vars['i_rootFldTblName']} WHERE `id` = ?", [$folderTargetId])['data'] === $this->myAuth->userid;
						if (($sourceOwner === true) && ($targetOwner === true)) {
							continue;
						}

						// COPY/MOVEOBJECTS PERMISSION ENTRY CHECK WITH SUB-OWNER CHECK
						$sourcePerm = false;

						if ($sourceOwner === true) $sourcePerm = true;
						if ($this->action === "duplicateObjects" || $this->action === "duplicateItemGroup") {
							if ($this->getAccessVal(('items'), 'fetchItemGroup', $this->permType, $parentFolderId) === true) $sourcePerm = true; // operator needs at least "read" to duplicate an object
						}
						if ($this->action === "moveObjects") {
							if ($this->getAccessVal(('items'), 'deleteItem', $this->permType, $parentFolderId) === true) $sourcePerm = true; // operator needs at least "write" in order to move an object
						}

						$targetPerm = ($targetOwner) ?: $this->getAccessVal(('items'), $this->action, $this->permType, $folderTargetId);

						//FYI: uncomment and add result to logical AND check below to also include move permission explicitly to permission check
						// $explPerm = ($targetOwner) ?: $myAuth->getAccessVal(('items'), $action, $this->permType, $folderTargetId);

						if (($sourcePerm === true) && ($targetPerm === true)) {
							continue;
						}
						# ----------------------------------- #
						# TEST RESULT RESET PERMISSION CHECKS #
						# ----------------------------------- #
					} elseif (in_array($this->action, ['resetResultsTestee', 'resetResultsPassword', 'resetResultsTest']) && false) { // FYI: Disabling b/c of new ttaker perm check logic //@phan-suppress-current-line PhanImpossibleCondition

						// SWITCH HOW TO BUILD TEST ID ARRAY DEPENDENT ON WHICH TYPE OF RESET IS BEING REQUESTED
						switch ($this->action) {

							case 'resetResultsTestee':

								// assign test taker Id we're with which we're starting
								$ttakerId = $this->folder_id['files'][0];

								// get the json decoded test ID values linked to test taker ID and push into array
								$testIdsJSON = $this->db->fetchColumn("SELECT `structure` FROM `passwords` WHERE `loginID` = ?", [$ttakerId])['data'];

								// check for empty structure
								if (empty($testIdsJSON[0])) {
									$this->returnData['error'] = $this->uiLang->translate("Structure not found for test taker ID.");
									return false;
								}

								// decode JSON structure field
								$testIds = [];
								foreach ($testIdsJSON as $tidJSON) {
									$res = json_decode($tidJSON ?? '', true);

									foreach ($res as $tidItem) {
										array_push($testIds, $tidItem['hiddenID']);
									}
								}

								break;

							case 'resetResultsTest':
								$testIds = [];
								$testIds[] = $this->folder_id['files'][0];



								break;

							case 'resetResultsPassword':

								$passId = $this->folder_id['files'][0];
								$tidJSON = $this->db->fetchValue("SELECT `structure` FROM `passwords` WHERE `id` = ?", [$passId])['data'];
								$tidJSON = json_decode($tidJSON ?? '', true);

								$testIds = [];
								foreach ($tidJSON as $tidItem) {
									$testIds[] = $tidItem['hiddenID'];
								}

								break;

							default:
								$testIds = [];
						} //END SWITCH

						$testIds = array_unique($testIds);
						$finalPerm = [];

						// take array of test IDs and get their parent folder values, then see if either ownership or explicit permisison entry allows action to proceed
						foreach ($testIds as $tidItem) {
							$testParentId = $this->db->fetchValue("SELECT `parent` FROM `tests` WHERE `id` = ?", [$tidItem])['data'];

							if ($this->db->fetchValue("SELECT `owner` FROM `testFolders` WHERE `id` = ?", [$testParentId])['data'] === $this->myAuth->userid) {
								$finalPerm[] = true;
							} elseif ($this->getAccessVal("items", $this->action, $this->permType, $testParentId)) {
								$finalPerm[] = true;
							} else {
								$finalPerm[] = false;
							}
						} //END FOREACH

						if (empty($finalPerm)) {
							$this->myAuth->writeLogEntry("BAD OUTPUT: Unable to construct final permission array: [" . basename(__FILE__) . "▶{$this->action}]");
							$this->returnData['error'] = $this->uiLang->translate("Could not process test item permissions.");
							return false;
						}

						// FINAL PERMISSION CHECKING IRRESPECTIVE OF TYPE OF TEST RESET RESULT WAS SENT IN
						if (!(in_array(false, $finalPerm))) {
							continue;
						}
					} //END ELSEIF

					# ------------------------------------------------------------------------------------------------------------------------------------ #
					# SPECIAL CONDITION WHEN TRYING TO ADD A TEST TO A PASSWORD THAT HAS OTHER TESTS IN IT WHICH THE CURRENT OWNER DOES NOT HAVE ACCESS TO #
					# ------------------------------------------------------------------------------------------------------------------------------------ #
					elseif ($this->action === "saveTestAssignmentsLibrary" && false) { //FYI: disabling b/c of new folder permission access logic //@phan-suppress-current-line PhanImpossibleCondition

						// EXTRACT OUR NEW SET OF TEST IDS WHICH ARE BEING SAVED
						$salArr = [];
						foreach ($data['structure'] as $testId) {
							array_push($salArr, $testId['hiddenID']);
						}

						// CALCULATE DIFFERENTIAL BETWEEN ORIGINAL LIST OF TESTS AND SENT IN DATA TO FIND OUR TARGET TEST ID

						$alJSON = $this->db->fetchValue("SELECT `structure` FROM `passwords` WHERE `id` = ?", [$data['id']])['data'];

						if (!(is_null($alJSON))) {

							$targTestId = null;
							$origAlArr = [];

							foreach (json_decode($alJSON ?? '', true) as $value) {
								$origAlArr[] = $value['hiddenID'];
							} // define our main test ID we're checking permissions on
							if (sizeof($salArr) > sizeof($origAlArr)) {
								$targTestId = array_values(array_diff($salArr, $origAlArr))[0];
							} elseif (sizeof($origAlArr) > sizeof($salArr)) {
								$targTestId = array_values(array_diff($origAlArr, $salArr))[0];
							} else {
								if (sort($origAlArr) === sort($salArr)) {
									continue; // in the case where the original and new lists are the length and have same values
								} else {
									$this->returnData['error'] = $this->uiLang->translate("Could not determine test action intent.");
								}
							}
						} else {
							$targTestId = $this->folder_id['files'][0];
						}
						// get parent folder ID of our test value
						$parIds = $this->db->fetchValue("SELECT `parent` FROM `tests` WHERE `id` = ?", [$targTestId])['data'];


						// OWNER CHECK
						if ($this->db->fetchValue("SELECT `owner` FROM {$it_vars['i_rootFldTblName']} WHERE `id` = ?", [$parIds])['data'] === $this->myAuth->userid) {
							continue;
						}

						// PERMISSION ENTRY CHECK
						if ($this->getAccessVal("items", "saveTestAssignmentsLibrary", "itemObject", $parIds)) {
							continue;
						}
					}

					# --------------------------------------------------------------------------------------------------
					// FYI: all checks above this line are specific conditions, now we move on to the general conditions
					# --------------------------------------------------------------------------------------------------

					// OWNER CHECK
					else {
						if (empty($parentFolderId)) continue;
						$oCheck = $this->db->fetchValue("SELECT `owner` FROM {$it_vars['i_rootFldTblName']} WHERE `id` = ?", [$parentFolderId])['data'] === $this->myAuth->userid;
						if ($oCheck) continue;

						// PERMISSION ENTRY CHECK
						$peCheck = $this->getAccessVal(('folders'), $this->action, $this->permType, $parentFolderId) === true;
						if ($peCheck) continue;
					}

					// FAILURE RETURN MESSAGE
					$this->myAuth->writeLogEntry("ACCOUNT RESTRICTION: Attempted operation without item rights on entry: [" . basename(__FILE__) . "▶{$this->action}]", "", ["loc" => ($this->data['location'] ?? "<UNKNOWN>"), "action" => $this->action]);
					$this->returnData['reloadFolder'] = true;
					$this->returnData['error'] = $this->uiLang->translate("You do not have permission to perform the requested function on this or these object(s)");
					return false;
				}
			}
			# -------------------------------------------------- #
			# Handle itemfolder type input permission processing #
			# -------------------------------------------------- #
			// *some items entering this loop aren't specifically folder values; the test takers cross-linked permission checks can be password item IDs or test taker IDs

			if (isset($this->folder_id['folders'])) {

				foreach ($this->folder_id['folders'] as $key => $folderId) {

					// Special allowances in root folder for all users - fetch contents of root
					if ((intval($folderId) === 1) && (in_array($this->action, ['fetchTestLibrary', 'fetchLibrary', 'fetchItemLibrary']))) { //@phan-suppress-current-line PhanSuspiciousWeakTypeComparisonInLoop
						continue;
					}

					# ----------------------------------------------- #
					# Special condition for a 'password/login' action #
					# ----------------------------------------------- #
					// if ($this->srcRef === 'testTakersFolder' && $this->action === 'deletePassword') {

					// 	// convert the folderId from the inputted login id to the folder to which it belongs
					// 	$folderId = $this->db->fetchValue("SELECT `parent` FROM `logins` WHERE `id` = ?", [$this->item_id['folders'][0]])['data'];
					// }

					// MOVEOBJECT REQUEST CHECK
					/*
						In order to qualify to move an object, the permission for the group must have delete, create, and the move
						permissions set in the appropriate locations all validated as 'true' in order to perform the operation.
					 */
					if ($this->action === 'moveObjects') {
						$parentFolderId = $data['remCall'] ?? false ? $folderId : $this->db->fetchValue("SELECT `parent` FROM {$it_vars['i_rootFldTblName']} WHERE `id` = ?", [$folderId])['data']; //@phan-suppress-current-line PhanImpossibleCondition
						if ($parentFolderId === 1) $parentFolderId = $folderId;
						$folderTargetId = intval($data['target']);

						// MOVEOBJECTS OWNER CHECK
						$sourceOwner = $this->db->fetchValue("SELECT `owner` FROM {$it_vars['i_rootFldTblName']} WHERE `id` = ?", [$parentFolderId])['data'] === $this->myAuth->userid;
						$targetOwner = $this->db->fetchValue("SELECT `owner` FROM {$it_vars['i_rootFldTblName']} WHERE `id` = ?", [$folderTargetId])['data'] === $this->myAuth->userid;
						if (($sourceOwner === true) && ($targetOwner === true)) {
							continue;
						}

						// DELETE/NEW FOLDER ACCESS CHECK FROM SOURCE TO TARGET
						$sourcePerm = ($sourceOwner) ?: $this->getAccessVal(('items'), 'deleteSelection', $this->permType, $parentFolderId);
						$targetPerm = ($targetOwner) ?: $this->getAccessVal(('items'), 'newFolder', $this->permType, $folderTargetId);

						//FYI: uncomment and add result to logical AND check below to also include move permission explicitly to permission check
						// $explPerm = ($targetOwner) ?: $myAuth->getAccessVal(('items'), $action, $this->permType, $folderTargetId);

						if (($sourcePerm === true) && ($targetPerm === true)) {
							continue;
						}

						# ------------------------------------------------------ #
						# Test Takers Folder Deletion Recursive Permisison Check #
						# ------------------------------------------------------ #
					}

					# ---------------------------------------- #
					# CROSS-REFERENCED DELETE PASSWORD ROUTINE #
					# ---------------------------------------- #
					/*
						elseif ($this->srcRef === 'testTakersFolder' && (in_array($this->action, ['deletePassword']))) {

						$testFldParents = [];
						$tEntries = [];
						$testIdList = [];
						$loginIds = [];
						$lid_raw = [];

						if ($this->item_id['type'] === 'password') {
							$loginIds = $this->item_id['folders'];
						} else { //if the sent in value is a folder


							// if tt exists in first level, start by pushing first login parent id's related login ID into the loginIds array
							$lid_first = [];
							$lid_first = $this->db->fetchColumn("SELECT `id` FROM `logins` WHERE `parent` = ?", [$folderId['id']])['data'];
							if (!(empty($lid_first))) array_push($loginIds, $lid_first[0]);

							$lParents = $this->recursTTF($folderId['id'], $this->db);
							foreach ($lParents as $lKey => $loginParent) {
								$res = $this->db->fetchColumn("SELECT `id` FROM `logins` WHERE `parent` = ?", [$loginParent])['data'];

								array_push($lid_raw, $res);

								array_walk_recursive($lid_raw, function ($val, $lKey) use (&$loginIds) {
									array_push($loginIds, $val);
								});
							}
						}

						foreach ($loginIds as $k => $loginId) {
							$testIds = $this->db->fetchColumn("SELECT `structure` FROM `passwords` WHERE `loginID` = ?", [$loginId])['data'];
							foreach ($testIds as $lKey => $testId) {
								array_push($tEntries, json_decode('[' . str_replace("'", '"', $testId) . ']' ?? '', true));
							}

							array_walk_recursive($tEntries, function ($val, $lKey) use (&$testIdList) {
								array_push($testIdList, $val);
							});

							// get array of parent folders for each test ID
							foreach ($testIdList as $tid) {
								array_push($testFldParents, $this->db->fetchColumn("SELECT `parent` FROM `tests` WHERE id = ?", [$tid])['data']);
							}
						}

						// if test takers are not populated with tests, then there's nothing to check, so we grant permission for the deletion
						if (empty($testFldParents)) continue;

						// perm checking on parent folder ID values extract from individual test entries
						$permRes = [];
						$ownerRes = [];
						$testFldParents = array_unique(array_column($testFldParents, 0)); // flatten array one level
						$permRes = [];
						$finalores = [];
						$finalRes = [];

						foreach ($testFldParents as $testFldItem) {

							// OWNER VALUES POPULATION
							$oRes = $this->db->fetchTable("SELECT `id`, `owner` FROM `testFolders` WHERE `id` = ?", [$testFldItem])['data'];
							$finalores[$oRes[0]['id']] = ($this->myAuth->userid === $oRes[0]['owner']) ? true : false;

							array_push($ownerRes, $oRes);

							// ACCESSDEF VALUES POPULATION
							$res = $this->getAccessVal('folders', 'fetchLibrary', 'itemObject', $testFldItem);
							$permRes[$testFldItem] = $res;
						}

						// OWNER/ACCESSDEF CROSS-REFERENCE PERMISSION VALIDATION

						foreach ($finalores as $oKey => $oCheck) {
							$pCheck = $permRes[$oKey];
							if ($oCheck + $pCheck > 0) { //@phan-suppress-current-line PhanTypeInvalidRightOperandOfAdd, PhanTypeInvalidLeftOperandOfAdd
								$finalRes[] = true;
							} else {
								$finalRes[] = false;
							}
						}

						if (!(in_array(false, $finalRes))) continue;
						}
					*/
					# --------------------------------------------------------------------------------------------------
					// FYI: all checks above this line are specific conditions, now we move on to the general conditions
					# --------------------------------------------------------------------------------------------------
					// OWNER & GRANULAR PERMISSION CHECK
					else {
						$tbl_source = (in_array($this->action, ['testsSearch', 'igSearch', 'fetchItemLibrary', 'fetchTestLibrary'])) ? $it_vars['i_xrefFldLink'] : $it_vars['i_rootFldTblName']; //@phan-suppress-current-line PhanSuspiciousWeakTypeComparisonInLoop

						$oCheck = $this->db->fetchValue("SELECT `owner` FROM {$tbl_source} WHERE `id` = ?", [$folderId['id'] ?? $folderId])['data'] === $this->myAuth->userid;
						if ($oCheck) continue;

						$peCheck = $this->getAccessVal(('folders'), $this->action, $this->permType, $folderId['id'] ?? $folderId);
						if ($peCheck) continue;
					}

					# ------------------------------------------------------------------------------------------------------------------------------- #
					# FAILURE RETURN -- IF NO CONDITIONS ABOVE RESULTED IN A 'CONTINUE', IT MEANS THE REQUESTED ACTION DID NOT PASS PERMISSION CHECKS #
					# ------------------------------------------------------------------------------------------------------------------------------- #

					# short circuit: when a remote permission check call, do not log as 'error' since an actual auth bypass is not being attempted #
					if (isset($data['remCall']) && $data['remCall'] === true && $this->action === "fetchLibrary" && gettype($data['fid'] === "integer")) return false;

					$this->myAuth->writeLogEntry("ACCOUNT RESTRICTION: Attempted operation without item rights on entry: [" . basename(__FILE__) . "▶{$this->action}]", "", ["loc" => ($this->data['location'] ?? "<UNKNOWN>"), "action" => $this->action]);

					$this->returnData['reloadFolder'] = true;
					$this->returnData['error'] = $this->uiLang->translate("You do not have permission to perform the requested function on this or these object(s)");
					return false;
				} //END FOREACH

			} // END 'IF FOLDER' BLOCK

			// FYI: This entire section not in use while we do folder permission checking only
			# ------------------------------------------------------ #
			# Handle itemObject action request permission processing #
			# ------------------------------------------------------ #
			/*
					foreach ($this->item_id as $key => $ig_item) {
					// Determine our table source type first (itemGroups | itemFolders)
					$tbl_source = "itemGroups";

					// check if item being checked is a folder or not
					if ((($key === "folders")) || (isset($data['type']) && ($data['type'] === "folder"))) {
					$tbl_source = "itemFolders";
					if (isset($ig_item['folders'])) $ig_item = $ig_item['folders'];
					} elseif (isset($data['selection'][$key]['type']) && ($data['selection'][$key]['type'] === "folder")) {
					$tbl_source = "itemFolders";
					}

					// check if item being checked is a itemgroup or not
					if ($key === "files") {
					$tbl_source = "itemGroups";
					if (isset($ig_item['files'])) $ig_item = $ig_item['files'];
					} elseif (isset($data['selection'][$key]['type']) && ($data['selection'][$key]['type'] === "itemGroup")) {
					$tbl_source = "itemGroups";
					}

					// first check if user is owner of object by running query based on object type
					if ($db->fetchValue("SELECT `owner` FROM {$tbl_source} WHERE `id` = ?", [$ig_item])['data'] === $myAuth->userid) {
					continue;
					// if not owner, check if user has permission on object
					} elseif (($myAuth->getAccessVal(($tbl_source === 'itemGroups' ? 'items' : 'folders'), $action, $this->permType, $ig_item) === true)) {
					continue;
					} else {
					// failure block if preceeding conditions were not met
					$this->returnData['error'] = $this->uiLang->translate("You do not have permission to perform the requested function on this or these object(s)");
					$myAuth->writeLogEntry("ACCOUNT RESTRICTION: Attempted operation without item rights on entry: [" . basename(__FILE__) . "▶{$action}]");
					return false;
					}
					}
				/*
					##########################################################################################
					NON-ITEM PERMISSION CHECKING

					For non-item requested permissions, there are 2 main categories: generic and
					standard.

					STANDARD functions are always permittable.

					GENERIC functions require explicit access, however they are not linked to an actual
					item ID. For example, creating a new item or folder, etc. The access for
					a generic item is checked against the JSON value definition value in the 'users' table
					for said user.
					##########################################################################################
				*/
		} elseif ($this->getAccessVal('items', $this->action, $this->permType) !== true) {
			$this->myAuth->writeLogEntry("ACCOUNT RESTRICTION: Attempted operation without generic rights on entry: [" . basename(__FILE__) . "▶{$this->action}]");

			// if we already have a previous error which is causing the failure, we want that msg to be forwarded instead of a generic "not authorized", which may not even be true
			if ($this->returnData['error'] === false) $this->returnData['error'] = $this->uiLang->translate("Your account is not authorized to perform the requested action.");
			return false;
		}

		// RETURN PERMIT WHEN ALL CONDITIONS HAVE PASSED
		return true;
	}

	/**
	 * Internal permisison function check to ensure owner id of object being accessed matches logged in owner id value
	 *
	 * @param rixPDO $db
	 * @param userAuth $authObj
	 * @param int|null $i_id
	 * @param array $it_vars
	 * @param bool $subSelect
	 * 
	 * @return bool
	 * 
	 */
	private function ownerPermCheck(rixPDO &$db, userAuth &$authObj, ?int $i_id = null, array $it_vars = [], bool $subSelect = false): bool
	{
		if (empty($i_id) || empty($it_vars) || empty($authObj)) {
			return false;
		}

		// all superadmins can do whateva they want like Eric Cartman in South Park S06E03
		$userGroupList = $db->fetchColumn(
			"SELECT `name` FROM `userGroups` WHERE `id` IN
		(SELECT `usergroupId` FROM `userGroupAccess` WHERE `userID` = ?)
		",
			[$authObj->userid]
		)['data'];

		if (in_array('superadmin', $userGroupList) || in_array('admin', $userGroupList)) {
			return true;
		}

		$suffixClause = ($subSelect) ? "(SELECT `{$it_vars['i_colName']}` FROM `{$it_vars['i_xrefTblName']}` WHERE `id` = ?)" : "?";
		$oid = $db->fetchValue("SELECT `owner` FROM `{$it_vars['i_rootFldTblName']}` WHERE `id` = {$suffixClause}", [$i_id])['data'];

		if ($oid !== $authObj->userid) {
			$this->myAuth->writeLogEntry("ACCOUNT RESTRICTION: Attempted owner-only operation without rights on entry: [" . basename(__FILE__) . "▶{$this->action}]");
			$this->returnData['error'] = $this->uiLang->translate("You are not allowed to perform this operation on this item.");
			return false;
		}
		return true;
	}

	/**
	 * Set itemtype variables - set various database table names based on the type of item being processed
	 *
	 * @param string $itemType
	 * 
	 * @return array
	 * 
	 */
	public function setTypeVars(string $itemType): array
	{
		$it_vars = [];

		// Determine table names based on object type
		switch ($itemType) {
			case 'itemGroup':
				$it_vars['i_colName'] = 'itemgroupId';
				$it_vars['i_xrefTblName'] = 'itemGroupAccess';
				$it_vars['i_rootFldTblName'] = 'itemGroups';
				$it_vars['i_rootObjTblName'] = 'items';

				break;

			case 'items':
				$it_vars['i_colName'] = 'folderId';
				$it_vars['i_xrefTblName'] = 'itemFolderAccess';
				$it_vars['i_rootFldTblName'] = 'itemFolders';
				$it_vars['i_rootObjTblName'] = 'itemGroups';

				break;

			case 'results':
			case 'tests':
				$it_vars['i_colName'] = 'folderId';
				$it_vars['i_xrefTblName'] = 'testFolderAccess';
				$it_vars['i_rootFldTblName'] = 'testFolders';
				$it_vars['i_rootObjTblName'] = 'tests';
				$it_vars['i_xrefFldLink'] = 'itemFolders';

				break;

			case 'testTakers':
				$it_vars['i_colName'] = 'folderId';
				$it_vars['i_xrefTblName'] = 'loginsFolderAccess';
				$it_vars['i_rootFldTblName'] = 'loginsFolders';
				$it_vars['i_rootObjTblName'] = 'logins';
				$it_vars['i_xrefFldLink'] = 'testFolders';

				break;

			default:
				$this->myAuth->writeLogEntry("BAD INPUT: Unable to determine source variable assignment based on referrer: [" . basename(__FILE__) . "▶{$this->action}]");
				$this->returnData['error'] = $this->uiLang->translate("Unable to set internal variables based on module referral.");
		}

		return $it_vars;
	}

	/**
	 * Fetch active permission values for single or multi-selected folders
	 */
	public function fetchIgPerm(array $data, rixPDO &$db, array &$returnData, userAuth &$authObj)
	{
		/* @var $db rixPDO */
		checkParams($data, ['i_id']);
		extract($data);

		# --------------------------------------------- #
		# Prevent bulk edit with non-superadmin account #
		# --------------------------------------------- #
		if ($authObj->checkSA() === false && gettype($i_id) !== 'integer') {
			$this->returnData['error'] = $this->uiLang->translate("Bulk editing permissions only allowed for superadmins!");
			return;
		}

		# -------------------- #
		# Inheritance handling #
		# -------------------- #

		$inherit = $inherit ?? false;
		if (($inherit) && (($parentId ?? 0) === 1) && $authObj->checkSA() !== true) {
			$this->myAuth->writeLogEntry("ACCOUNT RESTRICTION: Cannot inherit permissions from root folder: [" . basename(__FILE__) . "▶{$this->action}]");
			$this->returnData['error'] = $this->uiLang->translate("You may not inherit permissions from the root folder.");
			return;
		}

		# -------------------------------------- #
		# Function to retrieve permission values #
		# -------------------------------------- #

		$doPermFetch = function ($sectionVars, $targId) {
			$res = $this->db->fetchTable(
				"SELECT
				`userGroups`.`id`,
				`userGroups`.`name`,
				JSON_EXTRACT(`{$sectionVars['i_xrefTblName']}`.`accessDef`,'$.c_items') AS `accessDef`,
				`{$sectionVars['i_xrefTblName']}`.`id` AS `i_id`
			FROM `userGroups`
			INNER JOIN
				`{$sectionVars['i_xrefTblName']}` ON `userGroups`.`id`=`{$sectionVars['i_xrefTblName']}`.`userGroupId`
			WHERE `{$sectionVars['i_xrefTblName']}`.`{$sectionVars['i_colName']}` = ?",
				[$targId]
			)['data'];

			// if found that there are no perm entries, build them out and make them all set to disabled for the target folder
			if (empty($res)) {
				$ugList = $this->db->fetchTable("SELECT `id`, `name`, `accessDef` FROM `userGroups` WHERE `name` NOT IN ('superadmin', 'admin')", [])['data'];
				foreach ($ugList as $ugEntry => $ugObj) {
					array_push($res, [
						'id' => intVal($ugObj['id']),
						'name' => $ugObj['name'],
						'accessDef' => "{\"Read\": false, \"Write\": false, \"Edit Permissions\": false}",
						'i_id' => 0,
					]);
				}
			}

			// return folder perm data slice
			return $res;
		};

		# ------------------------------------------- #
		# Set conditions applying to both fetch types #
		# ------------------------------------------- #

		// return loadGroup if sent in
		$loadGroup = $loadGroup ?? false;

		// populate item type variable array
		$it_vars = $this->setTypeVars($this->srcRef);

		// permission structure
		$this->returnData['data']['permStruct'] = array_keys(json_decode(file_get_contents($this->pi_path) ?? '', true));

		# ---------------------------------------------- #
		# Get full owner list and retrieve current owner #
		# ---------------------------------------------- #

		$owner_list = $db->fetchTable("SELECT `id`, `name` AS `username` FROM `users`", [])['data'];
		$this->returnData['data']['ownerList'] = $owner_list;

		# -------------------------------- #
		# Multi-selection owner population #
		# -------------------------------- #

		if (is_array($i_id)) {
			foreach ($i_id as $itemVal) {
				$permResults[$itemVal] = $doPermFetch($it_vars, $itemVal);

				// have to check that the owner id value corresponds to an actual existant userId value... if not, set to null
				$owner_id[$itemVal] = $db->fetchValue("SELECT `id` FROM `users` WHERE `id` = (SELECT `owner` FROM `{$it_vars['i_rootFldTblName']}` WHERE `id` = ?)", [$itemVal])['data'];

				// inheritance trigger loading
				$ihActive[$itemVal] = $db->fetchValue("SELECT COUNT(*) FROM {$it_vars['i_xrefTblName']} WHERE `inherited` > 1 AND `folderId` = ?", [$itemVal])['data'];
			}

			// set selection mode
			$this->returnData['data']['isMulti'] = true;
		} else {

			# --------------------------------- #
			# Single-selection owner population #
			# --------------------------------- #

			// get current owner
			$owner_id = $db->fetchValue("SELECT `id` FROM `users` WHERE `id` = (SELECT `owner` FROM `{$it_vars['i_rootFldTblName']}` WHERE `id` = ?)", [$data['i_id']])['data'];

			// create target permission to retrieve the parent id value if requesting parent permissions and activation
			$targId = ($inherit) ? $parentId : $i_id;

			// get target users for permission entry
			$permResults = $doPermFetch($it_vars, $targId);

			// determine if item has inheritance activated
			$ihActive = $db->fetchValue("SELECT COUNT(*) FROM {$it_vars['i_xrefTblName']} WHERE `inherited` > 1 AND `folderId` = ?", [$targId])['data'];

			// set selection mode
			$this->returnData['data']['isMulti'] = false;
		}

		# ---------------------------- #
		# Generate full usergroup list #
		# ---------------------------- #
		$ugList = $this->db->fetchColumn("SELECT `name` FROM `userGroups` WHERE `name` NOT IN ('superadmin', 'admin')", [])['data'];

		# ------------- #
		# Return values #
		# ------------- #

		$this->returnData['data']['ugList'] = $ugList;
		$this->returnData['data']['ownerId'] = $owner_id;
		$this->returnData['data']['ig_targets'] = $permResults;
		$this->returnData['data']['loadGroup'] = ($loadGroup);
		$this->returnData['data']['mode'] = ($inherit) ? 'inherit' : 'normal';
		$this->returnData['data']['ihActive'] = ($ihActive > 0) ? true : false;
	}

	/**
	 * Update a specific user permisison set for an object
	 *
	 * @param mixed $data
	 * @param rixPDO $db
	 * @param mixed $returnData
	 * @param userAuth $authObj
	 * 
	 * @return void
	 * 
	 */
	public function updatePerm($data, rixPDO &$db, &$returnData, userAuth  &$authObj): void
	{
		// TODO: make sure bulk edits are logged in detail

		checkParams($data, ['updPermObj', 'upType']); // duplicate of the updPermObj version but easier to send to owner auth check this way

		// set var for new permissions object
		$updatedPermVals = $data['updPermObj'];

		// populate item type variable array
		$it_vars = $this->setTypeVars($this->srcRef);

		// determine if multiselection or not
		$bulkEdit = (is_array($data['i_id']) || $data['mOpts']['m_opt_inh_recurs'] || $data['mOpts']['m_opt_fld_recurs_do'] || $data['mOpts']['m_opt_owner_recurs']) ? true : false;

		// determine if recursive mode or not
		$recMode = ($data['mOpts']['m_opt_inh_recurs'] || $data['mOpts']['m_opt_fld_recurs_do'] || $data['mOpts']['m_opt_owner_recurs']);

		// set specific item ID being modified; when not a multi-edit, turn single value into array for looping for structure
		$this->folder_id = (is_array($data['i_id'])) ? $data['i_id'] : [$data['i_id']];

		// recursive folder id list build
		function recurs_folder_build($fList, $it_vars, rixPDO &$db)
		{
			static $recLocalFlds = [];
			foreach ($fList as $key => $fId) {
				$descendants = $db->fetchColumn("SELECT `id` FROM `{$it_vars['i_rootFldTblName']}` WHERE `parent` = ?", [$fId])['data'];
				array_push($recLocalFlds, $descendants);
				recurs_folder_build($descendants, $it_vars, $db);
			}
			return $recLocalFlds;
		}

		// kickoff recursive folder build (when required)
		if ($bulkEdit && $recMode) $rec_folders = array_merge($this->folder_id, ...recurs_folder_build($this->folder_id, $it_vars, $this->db));
		$masterFolderList = $rec_folders ?? $this->folder_id;

		$ownTypeConv = (gettype($data['newOwner']) === 'integer');

		if ($data['mOpts']["m_opt_owner_recurs"]) {
			if ($ownTypeConv) {
				$data['newOwnerOrig'] = [];
				$newOwner = $data['newOwner'];
				unset($data['newOwner']);
				$data['newOwner'] = [];
			}

			foreach ($masterFolderList as $key => $folderId) {
				$data['newOwnerOrig'][$folderId] = $this->db->fetchColumn("SELECT `owner` FROM `{$it_vars['i_rootFldTblName']}` WHERE `id` = ?", [$folderId])['data'][0];
				if ($ownTypeConv) $data['newOwner'][$folderId] = $newOwner; // preserve original owner keys for transmorgification later (recursive mode)
			}
		} else {
			if ($ownTypeConv) {
				$newOV = $data['newOwner']; // preserve original owner keys for transmorgification later (single or multi folder selection mode)
				unset($data['newOwner']);
				$data['newOwner'] = [];
			}

			if (gettype($data['i_id']) === 'integer') $data['i_id'] = [$data['i_id']];
			foreach ($data['i_id'] as $key => $value) {
				$data['newOwnerOrig'][$value] = $this->db->fetchColumn("SELECT `owner` FROM `{$it_vars['i_rootFldTblName']}` WHERE `id` = ?", [$value])['data'][0];
				if ($ownTypeConv) $data['newOwner'][$value] = $newOV;
			}
		}

		# FOLDER ARRAY ITERATION LEVEL (IMPLEMENTED FOR BULK EDITING CONDITION) #
		foreach ($masterFolderList as $fId) {

			// preserve pre-update owner info
			$data['log_curOwnerId'] = (string) $this->db->fetchValue("SELECT `owner` FROM {$it_vars['i_rootFldTblName']} WHERE `id` = ?", [$fId])['data'];

			// preserve original permission values for logging in its own data key
			$data['origPermObj'] = "";
			foreach ($updatedPermVals as $groupId => $folderId) {
				$orig = $this->db->fetchValue("SELECT `accessDef` FROM `{$it_vars['i_xrefTblName']}` WHERE `folderId` = ? AND `userGroupId` = ?", [$fId, $groupId])['data'];
				$orig = (empty($orig)) ? "NONE " : $orig;
				$data['origPermObj'] .= "\"{$groupId}\":" . $orig . ",";
			}

			$parentId = $this->db->fetchValue("SELECT `parent` FROM {$it_vars['i_rootFldTblName']} WHERE `id` = ?", [$fId])['data'];
			// $recurs_perms = $data['mOpts']['m_opt_fld_recurs_do'] && (array_search($fId, $this->folder_id) !== false);

			# ----------------------------- #
			# PERMISSIONS ITERATION ROUTINE #
			# ----------------------------- #

			foreach ($updatedPermVals as $uid => $ci) {

				$origFids = (gettype($data['i_id']) === "integer") ? [$data['i_id']] : $data['i_id'];

				// check that when a recursion option activated that's not folder related, folders do not get recursively updated unintendedly
				if ($data['mOpts']['m_opt_fld_recurs_do'] === false && !in_array($fId, $origFids)) continue;

				// if the ugid/folder set doesn't exist in access table, create it so that it can be populated
				$preExecCheck = $this->db->fetchValue("SELECT COUNT(*) FROM `{$it_vars['i_xrefTblName']}` WHERE `folderId` = ? AND `userGroupId` = ?", [$fId, $uid])['data'];
				if ($preExecCheck === 0) $this->db->insert($it_vars['i_xrefTblName'], ['folderId' => $fId, 'userGroupId' => $uid, 'inherited' => null, 'accessDef' => '{"c_items" : {}, "items": {}}']);

				$insertObj = json_decode($this->db->fetchValue("SELECT `accessDef` FROM `{$it_vars['i_xrefTblName']}` WHERE `folderId` = ? AND `userGroupId` = ?", [$fId, $uid])['data'] ?? '', true);

				# MASTER CONCEPTUAL PERMISSION LIST ITERATION ROUTINE #
				foreach ($this->itemPerms as $cEntry => $gItems) {

					// fill in missing concept keys when missing and set to disabled
					if (!isset($insertObj['c_items'][$cEntry])) $insertObj['c_items'][$cEntry] = false;

					// fill in missing granular keys when missing and set to disabled
					foreach ($gItems as $gEntry) {
						if (!isset($insertObj['items'][$gEntry])) $insertObj['items'][$gEntry] = false;
					}

					# UPDATE CONCEPTUAL PERMISSION VALUE IF UPDATE SENT #
					if (in_array($cEntry, array_keys($ci['c_items']))) {
						$insertObj['c_items'][$cEntry] = $ci['c_items'][$cEntry];

						# UPDATE LINKED GRANULAR PERMISSIONS WHEN CONCEPT PERMISSION UPDATES #
						foreach ($gItems as $gEntry) {
							$insertObj['items'][$gEntry] = ($ci['c_items'][$cEntry]) ? true : false;
						}
					}
				}

				$insertObj = json_encode($insertObj, JSON_PRETTY_PRINT);
				$this->db->update($it_vars['i_xrefTblName'], ['accessDef' => $insertObj], "`folderId` = ? AND `userGroupId` = ?", [$fId, $uid]);
			}

			# ----------------------------- #
			# INHERITANCE ITERATION ROUTINE #
			# ----------------------------- #

			if (($data['mOpts']['m_opt_inh_disabled'] === true || $data['mOpts']['m_opt_inh_enabled'] === true)) {
				$ihVal = ($bulkEdit || $authObj->checkSA()) ? $data['mOpts']['m_opt_inh_enabled'] : $data['inherit'];

				// loop and set inheritance value
				if ($ihVal && $parentId !== 1) {
					// prevent ever copying perms from 'home' b/c home permissions do not exist!

					// copy permissions from parent to this id (covers both granular and concept permission keys)
					$ugList = $this->db->fetchColumn("SELECT `userGroupId` FROM {$it_vars['i_xrefTblName']} WHERE `folderId` = ?", [$fId])['data'];

					foreach ($ugList as $ugId) {
						$this->db->prepare(
							"UPDATE {$it_vars['i_xrefTblName']} AS `A1` SET `A1`.`accessDef` =
							(SELECT `accessDef` FROM (SELECT * FROM {$it_vars['i_xrefTblName']})  AS `A2` WHERE `A2`.`folderId` = ? AND `A2`.`userGroupId` = ?)
							WHERE `A1`.`folderId` = ? AND `A1`.`userGroupId` = ?"
						);
						$this->db->executePrepared([$parentId, $ugId, $fId, $ugId]);

						// set inheritance parent value
						$this->db->prepare(
							"UPDATE {$it_vars['i_xrefTblName']} AS `A1` SET `inherited` =
							(SELECT `folderId` FROM (SELECT * FROM {$it_vars['i_xrefTblName']}) AS `A2` WHERE `A2`.`folderId` = ? AND `A2`.`userGroupId` = ?)
							WHERE `A1`.`folderId` = ? AND `A1`.`userGroupId` = ?"
						);
						$this->db->executePrepared([$parentId, $ugId, $fId, $ugId]);
					}
				} else {
					// remove inheritance values
					$this->db->prepare("UPDATE {$it_vars['i_xrefTblName']} SET `inherited` = NULL WHERE `folderId` = ?");
					$this->db->executePrepared([$fId]);
				}
			}

			/* verify the folder reference exists in the new owner array, leave alone is no owner found */
			if ($data['newOwner'] !== null && in_array($fId, array_keys($data['newOwner'])) === true) {

				/* If the new supposed owner assignment is same as current, skip re-stamping routine, otherwise, apply new stamp */
				$curOwner = $this->db->fetchValue("SELECT `owner` FROM `{$it_vars['i_rootFldTblName']}` WHERE `id` = ?", [$fId])['data'];
				if ($curOwner !== $data['newOwner'][$fId]) {
					$this->db->update($it_vars['i_rootFldTblName'], ['owner' => $data['newOwner'][$fId]], "id = ?", [$fId]);
				}
			}

			// initiate recursive tree scanning routine - force permission changes downstream to folders who have inheritance enabled
			$this->getIhTreeRecurs($fId, $it_vars);

			// log actions 
			$this->myAuth->prepLog($data, "updatePerm", $returnData);

			// standard returns
			$this->returnData['data']['loadGroup'] = $data['loadGroup'];
			$this->returnData['data']['i_id'] = $fId;
		}
	}

	/**
	 * Recursive inheritance update operation.
	 *
	 * @param string $sourceFldId
	 * @param array $it_vars
	 * 
	 * @return void
	 * 
	 */
	private function getIhTreeRecurs(string $sourceFldId, array $it_vars): void
	{
		$ihChildren = $this->db->fetchTable(
			// get the target children [ID/GroupId] array
			"SELECT `id`, `folderId`, `userGroupId` FROM {$it_vars['i_xrefTblName']} WHERE `inherited` = ?",
			[$sourceFldId]
		)['data'];

		// exit recursion when we run out of children to process
		if (count($ihChildren) === 0) {
			return;
		}

		// stamp accessDef onto the child which has the linked inheritance from source folder
		foreach ($ihChildren as $key => $ihTarget) {
			$this->db->prepare(
				"UPDATE {$it_vars['i_xrefTblName']} AS `A1` SET `A1`.`accessDef` =
								(SELECT `A2`.`accessDef` FROM (SELECT * FROM {$it_vars['i_xrefTblName']}) AS `A2` WHERE `A2`.`folderId` = ? AND `A2`.`userGroupId` = ?)
							 WHERE `A1`.`folderId` = ? AND `A1`.`userGroupId` = ?"
			);
			$this->db->executePrepared([
				$sourceFldId,
				$ihTarget['userGroupId'],
				$ihTarget['folderId'],
				$ihTarget['userGroupId']
			]);

			// recursive call - send in current child that was processed to see if it has its own inherited children
			$this->getIhTreeRecurs($ihTarget['folderId'], $it_vars);
		}
	}

	/**
	 * Remove existing user permission entry for a given itemObject.
	 *
	 * @param array $data
	 * @param rixPDO $db
	 * @param array $returnData
	 * @param userAuth $authObj
	 * 
	 * @return void
	 * 
	 */
	public function userPermRemove(array $data, rixPDO &$db, array &$returnData, userAuth  &$authObj): void
	{
		/* @var $db rixPDO */
		checkParams($data, ['iga_id']);

		// populate item type variable array
		$it_vars = $this->setTypeVars($this->srcRef);

		// Do item owner vs logged in owner authentication check on IG being requested to access
		if (($this->ownerPermCheck($db, $authObj, $data['iga_id'], $it_vars, true)) === false) {
			return;
		}

		$query = "DELETE FROM `{$it_vars['i_xrefTblName']}` WHERE id=?";
		$db->prepare($query);
		$db->executePrepared([$data['iga_id']]);

		$this->returnData['data'] = "OK";
	}

	/**
	 * Copy base folder permissions into newly created folder access entries.
	 *
	 * @param mixed $location
	 * @param mixed $folderId
	 * 
	 * @return void
	 * 
	 */
	public function newFolderPermSet($location, $folderId): void
	{
		// start with blank Json schema structure variable
		$JsonInsert = [];

		// create JSON accessDef with all set to 'false'
		foreach ($this->itemPerms as $key => $value) {
			$JsonInsert["c_items"][$key] = false;
		}

		foreach ($this->itemPermsFlat as $key) {
			$JsonInsert["items"][$key] = false;
		}
		$JsonInsert = json_encode($JsonInsert);

		// get the proper db vars based on calling manager
		$it_vars = $this->setTypeVars($this->srcRef);

		// if the new folder is from the root or child of the root
		switch ($location) {
			case '1': // when creating from home root, all access denied by default
				$ugList = $this->db->fetchColumn("SELECT DISTINCT `id` FROM `userGroups` WHERE `name` != 'superadmin' AND `name` != 'admin'")['data'];

				foreach ($ugList as $ugItem) {
					$this->db->insert(
						$it_vars['i_xrefTblName'],
						[
							'id' => null,
							'folderId' => $folderId,
							'userGroupId' => $ugItem,
							'inherited' => null,
							'accessDef' => $JsonInsert
						]
					);
				}

				break;

				// Apply parent folder permissions to the new folder by usergroup row
			default:
				$c_section = "c_items";
				$g_section = substr($c_section, 2); // the substring of the section input gives us the actual granular permission tree on which we want to do our updates

				$srcDefs = $this->db->fetchTable("SELECT `usergroupId`, `accessDef` FROM `{$it_vars['i_xrefTblName']}` WHERE `folderId` = ?", [$location])['data'];

				// iterate over source folder's usergroup rows
				foreach ($srcDefs as $key => $sourceRow) {

					// get accessDef from current folder + usergroup row
					$accessDefIns = $this->db->fetchValue(
						"SELECT accessDef FROM `{$it_vars['i_xrefTblName']}` WHERE folderId = ? AND userGroupId = ?",
						[
							$location,
							$sourceRow['usergroupId']
						]
					)['data'];

					// insert values into new entry row
					$this->db->insert($it_vars['i_xrefTblName'], [
						'id' => null,
						'folderId' => $folderId,
						'userGroupId' => $sourceRow['usergroupId'],
						'inherited' => $location,
						'accessDef' => $accessDefIns
					]);
				}

				break;
		}
	}

	/**
	 * Get function access value for user true/false.
	 *
	 * @param string $module
	 * @param string $fnName
	 * @param string|null $permType
	 * @param ?int $folderParentId
	 * 
	 * @return bool
	 * 
	 */
	public function getAccessVal(string $module = "", string $fnName = "", ?string $permType = null, ?int $folderParentId = null): bool
	{
		if (empty($fnName) || empty($module)) {
			return false;
		}

		// get table vars, and override if action is fetchItemLibrary b/c we then have to calculate item perms FROM the test mgr area
		if ($this->srcRef === "dashboard") $this->srcRef = $module;
		$it_vars = $this->setTypeVars($this->srcRef);

		// FYI: for now we force everything to folder checking and not individual item checking
		$acDefModule = "items";

		// If the action is a cross-module lookup, transform our it_var variable to set the table source to the cross-linked 'access' table for the permission query
		$tbl_source = (in_array($this->action, ['testsSearch', 'igSearch', 'fetchItemLibrary', 'fetchTestLibrary', 'fetchTestStructure'])) ? rtrim($it_vars['i_xrefFldLink'], "s")  . "Access"  : $it_vars['i_xrefTblName'];

		$tbl_col_clause = $it_vars['i_colName']; //table column clause

		switch ($permType) {

				// standard function is an always permittable function (e.g., fetchLibrary, etc.). The definition of what's 'standard' may fluctuate
			case 'standard':
				return true;

				break;

				// FYI: not in use as we cannot determine any 'global' level permissions requiring implementation at the moment
				// generic case is when a function is not linked to an owner ID but still requires explicit rights (e.g., create new folder, new groupitem, etc.)
			case 'generic':

				$query = "SELECT JSON_EXTRACT(`accessDef`, '$.$acDefModule.$fnName') FROM `users` WHERE `id` = ?";
				$res = $this->db->fetchValue($query, [$this->myAuth->userid]);
				return (($res['data'] === true) || ($res['data'] === "true")) ? true : false;

				break;

				// itemgroup specific function linked to a group ID value

			case 'itemObject':

				# --------------------------------------------- #
				# Allow home folder creation for selected users #
				# --------------------------------------------- #

				// pre-check permission for button enabling/disabling
				if ($fnName === 'newFolder' && $folderParentId === 1) {
					$homeVal = $this->db->fetchValue("SELECT `homeaccess` FROM `users` WHERE id=?", [$this->myAuth->userid])['data'];
					if ($homeVal === 1) {
						return true;
					}
				}

				// check on active request for new folder creation in home
				if ($fnName === 'newFolder' && isset($this->folder_id['folders']) && $this->folder_id['folders'][0] === 1) {
					$homeVal = $this->db->fetchValue("SELECT `homeaccess` FROM `users` WHERE id=?", [$this->myAuth->userid])['data'];
					if ($homeVal === 1) {
						return true;
					}
				}

				// array of permission results on a per-group basis
				$accessArr = [];

				# -------------------------------------------------- #
				# PRIMARY GRANULAR PERMISSION CHECKING QUERY ROUTINE #
				# -------------------------------------------------- #
				foreach ($this->myAuth->usergroup as $ugEntry => $ugItem) {
					$query = "SELECT JSON_EXTRACT(`accessDef`, '$.{$acDefModule}.{$fnName}') FROM `{$tbl_source}` WHERE (`userGroupId` = ? AND `{$tbl_col_clause}` = ?)";
					$res = $this->db->fetchValue($query, [$ugItem, $folderParentId]);

					array_push($accessArr, ($res['data'] === "true" ? true : false));

					// if (($res['data'] === true) || ($res['data'] === "true")) { }
				}

				// FYI: PERMISSIVE access allowance
				if (in_array(true, $accessArr)) {
					return true;
				} else {
					return false;
				}
				// FYI: RESTRICTIVE access allowance - comment out above and uncomment this block to enable restrictive permission conflict resolution
				// if (in_array(false, $accessArr)) {
				//     return false;
				// } else {
				//     return true;
				// }

				// default return
				// return false;
				// return (($res['data'] === true) || ($res['data'] === "true")) ? true : false;

				break;

			default:
				return false;

				break;
		}
	}
}
