<?php

	require_once 'settingsDefault.php';

	global $filterSettings;
	if (!isset($filterSettings)) {
		$filterSettings = false;
	}

	require_once 'database.php';
	require_once 'rixPDO.php';
	require_once 'rixTools.php';
	require_once 'settingsCommonFunctions.php';

	if (!isset($db)) {
		$keepConnection = false; // if $db is not set, we clear it again after use
		$db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, __DIR__ . '/../../logs/settings_errors.txt');
		$result = $db->results();
		if ($result['error']) {
			if (!isset ($returnData)) {
				$returnData = [];
			}
			$returnData = ['fatalError' => $result['error']]; // most scripts that include settings.php should send this back as json
			die();
		}
	} else {
		$keepConnection = true; // if $db is already set, we keep the connection
	}

	//fetch supported languages
	$query = "SELECT code, name FROM languages";
	$res = $db->fetchColumn($query, [], 'code');
	$languages = $res['data'];

	$skins = getSkins();

	$settingsDefaults = getDefaultSettings($db, $languages, $skins);
	//read platform settings (settings specific to this installation)
	$query = "SELECT `option`, `value` FROM settings";
	$db->fetch($query, 'column', 'option');
	$platform = $db->results();

	if (isset($settingsDefaults['editorButtons'])) {
		$settingsDefaults['editorButtons']['value'] = userSettingsFetch($db, 'editorButtons');
		// append module editor pages to editorButton key
		foreach (getMods() as $modKey => $mod) {
			foreach ($mod['editor_sections'] as $section => $secProps) {
				$settingsDefaults['editorButtons']['choices'][$section] = [
					'name' => $secProps['name'],
					'accesslevel' => $secProps['accesslevel']
				];
			}
		}
	}

	//merge settings where platform settings overwrite default settings

	$settings = array_map(function ($defaultsEntry) {
		return $defaultsEntry['value'];
	}, $settingsDefaults);

	foreach ($platform['data'] as $option => $value) {
		if (!isset($settingsDefaults[$option])) {
			//delete deprecated setting from database
			$query = "DELETE FROM settings WHERE `option` = ?";
			$db->execute($query, [$option]);
			continue;
		}
		switch ($settingsDefaults[$option]["format"]) {
			case FORMAT_BOOL:
				if ($value === 'true') {
					$settings[$option] = true;
				} else {
					$settings[$option] = false;
				}
				break;
			case FORMAT_SINGLE_CHOICE_INT:
			case FORMAT_INT:
				$settings[$option] = (int)$value;
				break;
			case FORMAT_DOUBLE:
				$settings[$option] = (float)$value;
				break;
			case FORMAT_SINGLE_CHOICE_STRING:
			case FORMAT_STRING:
			case FORMAT_PASSWORD:
				$settings[$option] = $value;
				break;
			case FORMAT_MULTIPLE_CHOICE:
				$settings[$option] = json_decode($value ?? '', true);
				if (json_last_error() !== JSON_ERROR_NONE) {
					//revert back to default value if value from database could not be json decoded
					$settings[$option] = $settingsDefaults[$option]['value'];
				}
				break;
		}
	}

	/*	if (isset($settings['editorButtons'])) {
			$settings['editorButtons'] = userSettingsFetch($db, 'editorButtons'); // populate the list of editor buttons based on group settings
			// append module editor pages to editorButton key
			foreach (getMods() as $modKey => $mod) {
				foreach ($mod['editor_sections'] as $section => $secProps) {
					$settings['editorButtons']['choices'][$section] = [
						'name' => $secProps['name'],
						'accesslevel' => $secProps['accesslevel']
					];
				}
			}
		}*/

	//sanitize menuLanguages and loginLanguage
	$menuLanguages = $settings['menuLanguages'];
	$invalidValueDetected = false;
	if (count($menuLanguages) === 0) {
		$invalidValueDetected = true;
	}
	$newMenuLanguages = [];
	foreach ($menuLanguages as $lng) {
		if (!isset($languages[$lng])) {
			$invalidValueDetected = true;
		} else {
			$newMenuLanguages[] = $lng;
		}
	}

	// validate and enforce upgrader URL value and format
	$settings['upgraderURL'] = rtrim($settings["upgraderURL"], "/") . "/";

	//if a language is found in menuLanguages, which has been removed from OASYS (c.f. languages table), remove it from menuLanguages as well
	if ($invalidValueDetected) {
		if (count($newMenuLanguages) === 0) {
			$db->execute("DELETE FROM settings WHERE `option` = 'menuLanguages'");
			$settings['menuLanguages'] = $settingsDefaults['menuLanguages']['value'];
		} else {
			$settings['menuLanguages'] = $newMenuLanguages;
			$newMenuLanguages = json_encode($newMenuLanguages);
			$platform['data']['menuLanguages'] = $newMenuLanguages;
			$db->insert('settings', ['option' => 'menuLanguages', 'value' => $newMenuLanguages, 'encryption' => 0], 'update', ['value']);
		}
	}

	//if selected loginLanguage is not part of menuLanguages change to default (the browser language)
	if ($settings['loginLanguage'] !== 'default' && !in_array($settings['loginLanguage'], $menuLanguages)) {
		$settings['loginLanguage'] = $settings['menuLanguages'][0];
		$db->execute("DELETE FROM settings WHERE `option` = 'loginLanguage'");
	}


	// add module properties to settings to JS accessibility
	$settings['modVars'] = getMods();

	//add values from oasys_ver.txt to $settings
	if (file_exists(__DIR__ . '/../../oasys_ver.txt')) {
		$versioninfo = file(__DIR__ . '/../../oasys_ver.txt', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
		unset($versioninfo[0]); // we do not use the first line for anything
		// add to settings
		foreach ($versioninfo as $line) {
			$pair = explode("=", $line);
			if (isset($pair[1])) $settings[$pair[0]] = $pair[1];
		}
	} else { // if the oasys_ver.txt is not located, set version info to helpful values
		$settings['vshort'] = 'undetected';
		$settings['v'] = 'no oasys_ver.txt found';
		$settings['info'] = '-';
	}

	//check modules
	$modulesDir = __DIR__ . "/../../modules";

	// Ensure 'modules' key exists in $settings
	if (!isset($settings['modules'])) {
		$settings['modules'] = [];
	}

	if (is_dir($modulesDir)) {
		$subfolders = array_filter(glob($modulesDir . '/*'), 'is_dir');

		foreach ($subfolders as $subfolder) {
			$folderName = basename($subfolder);
			$versionFile = $subfolder . "/VERSION_MODULE.txt";

			if (file_exists($versionFile)) {
				$lines = file($versionFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
				$moduleData = [
					'module' => $lines[0] ?? '',
					'version' => '',
					'vshort' => '',
					'oamin' => '',
					'oamax' => '',
					'info' => '',
				];

				foreach ($lines as $line) {
					if (strpos($line, 'v=') === 0) {
						$moduleData['version'] = substr($line, 2);
					} elseif (strpos($line, 'vshort=') === 0) {
						$moduleData['vshort'] = substr($line, 7);
					} elseif (strpos($line, 'oamin=') === 0) {
						$moduleData['oamin'] = substr($line, 6);
					} elseif (strpos($line, 'oamax=') === 0) {
						$moduleData['oamax'] = substr($line, 6);
					} elseif (strpos($line, 'info=') === 0) {
						$moduleData['info'] = substr($line, 5);
					}
				}

				// Add to existing $settings['modules']
				$settings['modules'][$folderName] = $moduleData;
			}
		}
	}

	// set logged interface language
	if (!$filterSettings) {
		$settings['interfaceLanguage'] = getIntLang();
	}

	//add database version
	$res = $db->fetchRow("SHOW TABLE STATUS WHERE Name='settings';");
	$settings['database_version'] = $res['data']['Comment'];

	//PHP settings
	$settings['post_max_size'] = return_bytes(ini_get('post_max_size'));
	$settings['upload_max_filesize'] = return_bytes(ini_get('upload_max_filesize'));
	$settings['memory_limit'] = return_bytes(ini_get('memory_limit'));

	// hardcode the system root URL path
	$settings['rootURL'] = establishRootURL();
	$settings['JSrootURL'] = ($_SERVER['CONTEXT_PREFIX'] !== "") ? $_SERVER['CONTEXT_PREFIX'] . DIRECTORY_SEPARATOR : $settings['rootURL'];

	// get user-scoped settings and override default settings
	startLocalSession();
	userOverride($settings, $settingsDefaults, $db);
	closeLocalSession();

	// Define list of possible authentication methods for editor user logins
	$settings['authMethods'] = ['LOCAL' => 'LOCAL', 'LDAP' => 'LDAP', 'SSO' => 'SSO'];


	//close database connection and release memory
	if (!$keepConnection) {
		unset($db);
	}

	function isURL($path): mixed
	{
		return filter_var($path, FILTER_VALIDATE_URL);
	}


	/**
	 * Overwrites various settings keys which have
	 * a user-scoped override definition.
	 * @param array $settings
	 * @param array $settingsDefaults
	 * @param rixPDO $db
	 * @return void
	 */
	function userOverride(array &$settings, array $settingsDefaults, rixPDO $db)
	{
		if (!empty($_SESSION['userid'])) {
			$userDbSettingsJson = $db->fetchValue("SELECT `accessdef` FROM `users` WHERE `id` = ?", [$_SESSION['userid']])['data'];

			// in the case that the user has been deleted while attempting to browse
			if (empty($userDbSettingsJson)) {
				return;
			}

			$udb_settings = json_decode($userDbSettingsJson ?? '', true);
			if (isset($udb_settings['userSettings'])) {
				foreach ($udb_settings['userSettings'] as $option => $value) {
					if (!isset($settingsDefaults[$option])) {
						continue;
					}
					switch ($settingsDefaults[$option]["format"]) {
						case FORMAT_BOOL:
							if ($value === true) {
								$settings[$option] = true;
							} else {
								$settings[$option] = false;
							}
							break;
						case FORMAT_SINGLE_CHOICE_INT:
						case FORMAT_INT:
							$settings[$option] = (int)$value;
							break;
						case FORMAT_DOUBLE:
							$settings[$option] = (float)$value;
							break;
						case FORMAT_SINGLE_CHOICE_STRING:
						case FORMAT_STRING:
						case FORMAT_PASSWORD:
							$settings[$option] = $value;
							break;
						case FORMAT_MULTIPLE_CHOICE:
							$settings[$option] = json_decode($value ?? '', true);
							if (json_last_error() !== JSON_ERROR_NONE) {
								//revert back to default value if value from database could not be json decoded
								$settings[$option] = $settingsDefaults[$option]['value'];
							}
							break;
					}
				}
			} else {
				$db->prepare("UPDATE `users` SET `accessDef` = JSON_SET(`accessDef`,'$.userSettings', JSON_OBJECT()) WHERE `id` = ?");
				$db->executePrepared([$_SESSION['userid']]);
			}
		}
	}

	function return_bytes($val)
	{
		$val = trim($val);
		$last = strtolower($val[strlen($val) - 1]);
		$val = (int)$val;
		switch ($last) {
			case 'g':
				$val *= 1024;
				break;
			case 'm':
				$val *= 1024 * 1024;
				break;
			case 'k':
				$val *= 1024 * 1024 * 1024;
				break;
		}
		return $val;
	}

	/**
	 * A generified routine to return json decoded \
	 * setting values from the users 'accessDef' row.
	 * @param rixPDO $db
	 * @param string $settingName
	 * @return array
	 */
	function userSettingsFetch(rixPDO &$db, string $settingName): array
	{
		startLocalSession();

		if (!isset($_SESSION['usergroup'])) {
			return [];
		}

		$ugIds = $_SESSION['usergroup'];
		$userSettingVal = [];

		closeLocalSession();

		// iterate the editor button list based on usergroup IDs
		foreach (array_values($ugIds) as $userGroupId) {
			$userSettingRes = json_decode($db->fetchValue("SELECT JSON_QUERY(`accessDef`, '$.$settingName') FROM userGroups WHERE id = ?", [$userGroupId])['data'] ?? '', true);

			if (is_null($userSettingRes)) {
				return [];
			}

			// since a user can belong to multiple usergroups, we use an 'additive' permission population method. I.e., the 'allowed' or 'true' access keys are merged and sent back
			foreach ($userSettingRes as $settingKey => $settingVal) {
				if ($settingVal === true && (!in_array($settingKey, $userSettingVal))) {
					array_push($userSettingVal, $settingKey);
				}
			}
		}

		return $userSettingVal;
	}

	/**
	 * Calculate and return the relative root path for
	 * the Oasys instance.
	 * @return string
	 */
	function establishRootURL(): string
	{
		// Windows file system slash fix
		$curPath = str_replace("\\", "/", realpath(__DIR__ . "/../../"));
		$curPath = (substr($curPath, -1, 1) != "/") ? $curPath . "/" : $curPath;
		$rootPath = ($_SERVER['CONTEXT_DOCUMENT_ROOT'] ?? $_SERVER['DOCUMENT_ROOT']);

		// if the app root is the same as server root, we want '/' to be the rootURL value in settings, otherwise, the diff between the two
		$updatedRootURL = ($curPath == $rootPath) ? "/" : str_split($curPath, strlen($rootPath));
		$updatedRootURL = $updatedRootURL[1] ?? $updatedRootURL[0];

		// string checks and fixes
		$updatedRootURL = trim($updatedRootURL);
		$updatedRootURL = (substr($updatedRootURL, 0, 1) != "/") ? "/" . $updatedRootURL : $updatedRootURL;
		$updatedRootURL = (substr($updatedRootURL, -1, 1) != "/") ? $updatedRootURL . "/" : $updatedRootURL;

		return $updatedRootURL;
	}

	/**
	 * Fetch and return the interface language
	 * set for the logged-in user. If no value
	 * is defined or the browser language is
	 * not in the standard set of accepted
	 * values, return 'EN'.
	 * @return string
	 */
	function getIntLang(): string
	{
		global $db, $forceLang;
		startLocalSession();
		$final_lang = "";

		// get browser lang if possible as a starting point
		$server_lang_string = $_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '';
		if (!empty($server_lang_string)) {
			$final_lang = strtoupper(substr($server_lang_string, 0, 2));
		}

		// check for pre-saved entry first for lang selection, otherwise, if a forced value present, use that
		if (isset($_SESSION['userid'])) {
			$res = $db->fetchValue("SELECT `defLang` FROM `users` WHERE `id` = ?", [$_SESSION['userid']]);
			$final_lang = !empty($res['data']) ? $res['data'] : $final_lang;
		} elseif (!empty($forceLang)) {
			$final_lang = $forceLang;
		}

		closeLocalSession();

		// if no forced or set lang found, use EN
		if (!in_array($final_lang, ['EN', 'FR', 'DE'])) {
			$final_lang = 'EN';
		}
		return $final_lang;
	}

	/**
	 * Starts session to execute read-only pulls for logged in user.
	 * @return void
	 */
	function startLocalSession(): void
	{
		if (session_status() !== PHP_SESSION_ACTIVE && headers_sent() === false) {
			global $sql_db, $sql_user, $sql_password, $sql_host;
			require_once __DIR__ . '/dbSessionHandler.php';
			/*
			 * settings open read-only sessions to avoid deadlocks, as settings are sometimes used in parallel ajax calls
			 * and since settings only need to read, there is no need for them to have write access and lock the sessions table
			 */
			$sessionHandler = new dbSessionHandler($sql_db, $sql_user, $sql_password, $sql_host, __DIR__ . '/../../logs/sessionHandler_errors.txt', 'settings', true);

			session_set_save_handler($sessionHandler, true);

			$rootPath = ($_SERVER['CONTEXT_PREFIX'] !== "") ? $_SERVER['CONTEXT_PREFIX'] . DIRECTORY_SEPARATOR : establishRootURL();

			session_start(['cookie_path' => $rootPath, 'read_and_close' => false, 'cookie_httponly' => true]);
		}
	}

	function closeLocalSession(): void
	{
		if (session_status() === PHP_SESSION_ACTIVE) {
			session_write_close();
		}
	}

	function suppress_errors($errno, $errstr)
	{
		// Do nothing
	}
