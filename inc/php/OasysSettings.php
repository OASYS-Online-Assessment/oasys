<?php

	declare(strict_types=1);

	namespace Oasys;

	use LogicException;
	use rixPDO;

	require_once __DIR__ . "/settingsDefault.php";

	class OasysSettings
	{
		private static OasysSettings $instance;
		private array $defaults;
		public array $settings;
		public array $languages;
		public array $skins;
		private ?rixPDO $db;

		private function __construct(OasysApp $app)
		{
			$this->db = $app->getDatabaseInstance();

			$this->fetchLanguages();
			$this->fetchSkins();

			//retrieve default settings
			$this->defaults = getDefaultSettings($this->db, $this->languages, $this->skins);

			//retrieve system settings from DB
			$this->fetchSystemSettings();
			$this->sanitizeSettings();

			/*
				Fetching user specific settings is done externally by calling getUserSettings with the userId.
				The system settings are required for the backend state to be established, which is required to
				set the user id and then fetch user specific settings, so we cannot fetch user specific settings
				in the constructor.
			*/
		}

		private function sanitizeSettings(): void
		{
			//validate and enforce upgrader URL value and format
			$this->settings['upgraderURL'] = rtrim($this->settings["upgraderURL"], "/") . "/";

			//sanitize menuLanguages and loginLanguage
			$menuLanguages = $this->settings['menuLanguages'];
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

			//if a language is found in menuLanguages, which has been removed from OASYS (c.f. languages table), remove it from menuLanguages as well
			if ($invalidValueDetected) {
				if (count($newMenuLanguages) === 0) {
					$this->db->execute("DELETE FROM settings WHERE `option` = 'menuLanguages'");
					$this->settings['menuLanguages'] = $this->defaults['menuLanguages']['value'];
				} else {
					$this->settings['menuLanguages'] = $newMenuLanguages;
					$newMenuLanguages = json_encode($newMenuLanguages);
					$platform['data']['menuLanguages'] = $newMenuLanguages;
					$this->db->insert('settings', ['option' => 'menuLanguages', 'value' => $newMenuLanguages, 'encryption' => 0], 'update', ['value']);
				}
			}

			//if selected loginLanguage is not part of menuLanguages change to default (the browser language)
			if ($this->settings['loginLanguage'] !== 'default' && !in_array($this->settings['loginLanguage'], $menuLanguages)) {
				$this->settings['loginLanguage'] = $this->settings['menuLanguages'][0];
				$this->db->execute("DELETE FROM settings WHERE `option` = 'loginLanguage'");
			}


		}

		private function fetchLanguages(): void {
			//fetch supported languages
			$query = "SELECT code, name FROM languages";
			$res = $this->db->fetchColumn($query, [], 'code');
			$this->languages = $res['data'];
		}

		private function fetchSkins(): void {
			$this->skins = $this::findSkins();
		}

		private function fetchSystemSettings(): void {
			$query = "SELECT `option`, `value` FROM settings";
			$res = $this->db->fetchColumn($query, [], 'option');
			$platform = $res['data'];

			//iterate through $defaults and override with values from DB; user overrides are done separately after login
			foreach ($this->defaults as $key => $row) {
					if (isset($platform[$key])) {
						//setting found in DB, override default value, but need to convert string back to correct type
						$this->settings[$key] = $this->convertStringToType($key, $platform[$key]);
					} else {
						$this->settings[$key] = $row['value'];
					}
			}

			//iterate through $platform and find any legacy settings that are not in defaults anymore
			foreach ($platform as $key => $value) {
				if (!isset($this->defaults[$key])) {
					//legacy setting found, delete it from database
					$deleteQuery = "DELETE FROM settings WHERE `option` = :option";
					$this->db->execute($deleteQuery, ['option' => $key]);
				}
			}

			$this->settings['interfaceLanguage'] = 'EN'; //init to English, needed before user login
			$this->settings['modVars'] = $this::findMods();

			//check modules
			$modulesDir = __DIR__ . "/../../modules";

			// Ensure 'modules' key exists in $this->settings
			if (!isset($this->settings['modules'])) {
				$this->settings['modules'] = [];
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
							if (str_starts_with($line, 'v=')) {
								$moduleData['version'] = substr($line, 2);
							} elseif (str_starts_with($line, 'vshort=')) {
								$moduleData['vshort'] = substr($line, 7);
							} elseif (str_starts_with($line, 'oamin=')) {
								$moduleData['oamin'] = substr($line, 6);
							} elseif (str_starts_with($line, 'oamax=')) {
								$moduleData['oamax'] = substr($line, 6);
							} elseif (str_starts_with($line, 'info=')) {
								$moduleData['info'] = substr($line, 5);
							}
						}

						// Add to existing $this->settings['modules']
						$this->settings['modules'][$folderName] = $moduleData;
					}
				}
			}

			//add values from oasys_ver.txt to $this->settings
			if (file_exists(__DIR__ . '/../../oasys_ver.txt')) {
				$versioninfo = file(__DIR__ . '/../../oasys_ver.txt', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
				array_shift($versioninfo); // we do not use the first line for anything
				// add to settings
				foreach ($versioninfo as $line) {
					$pair = explode("=", $line);
					if (isset($pair[1])) $this->settings[$pair[0]] = $pair[1];
				}
			} else { // if the oasys_ver.txt is not located, set version info to helpful values
				$this->settings['vshort'] = 'undetected';
				$this->settings['v'] = 'no oasys_ver.txt found';
				$this->settings['info'] = '-';
			}

			//add database version
			$res = $this->db->fetchRow("SHOW TABLE STATUS WHERE Name='settings';");
			$this->settings['database_version'] = $res['data']['Comment'];

			//PHP settings
			$this->settings['post_max_size'] = sizeStringToBytes(ini_get('post_max_size'));
			$this->settings['upload_max_filesize'] = sizeStringToBytes(ini_get('upload_max_filesize'));
			$this->settings['memory_limit'] = sizeStringToBytes(ini_get('memory_limit'));

			// define backend and js relative root paths
			$this->settings['rootURL'] = $this::establishRootURL();
			$this->settings['JSrootURL'] = $this::establishJSRootURL($this->settings['rootURL']);

			// define list of possible authentication methods for editor user logins
			$this->settings['authMethods'] = ['LOCAL' => 'LOCAL', 'LDAP' => 'LDAP', 'SSO' => 'SSO'];

			// add modules editor sections to editorButtons choices
			foreach (static::findMods() as $modKey => $mod) {
				foreach ($mod['editor_sections'] as $section => $secProps) {
					$this->defaults['editorButtons']['choices'][$section] = [
						'name' => $secProps['name'],
						'accesslevel' => $secProps['accesslevel'],
						'module' => true
					];
				}
			}

		}

		private function convertStringToType(string $option, string $value): mixed
		{
			$format = $this->defaults[$option]['format'];
			switch ($format) {
				case FORMAT_BOOL:
					if ($value === 'true') {
						$value = true;
					} else {
						$value = false;
					}
					break;
				case FORMAT_SINGLE_CHOICE_INT:
				case FORMAT_INT:
					$value = (int)$value;
					break;
				case FORMAT_DOUBLE:
					$value = (float)$value;
					break;
				case FORMAT_SINGLE_CHOICE_STRING:
				case FORMAT_STRING:
				case FORMAT_PASSWORD:
					//keep as is
					break;
				case FORMAT_MULTIPLE_CHOICE:
					$value = json_decode($value ?? '', true);
					if (json_last_error() !== JSON_ERROR_NONE) {
						//revert back to default value if value from database could not be json decoded
						$value = $this->defaults[$option]['value'];
					}
					break;
			}
			return $value;
		}

		public function getDatabaseInstance(): ?rixPDO
		{
			return $this->db ?? null;
		}

		public function &getSettingsArray(): array
		{
			return $this->settings;
		}

		public function getProperty(string $property): mixed
		{
			return $this->settings[$property] ?? null;
		}

		public function getDefaults(): array
		{
			return $this->defaults;
		}

		public function getJSSafeSettings(): array
		{
			$jsSafeSettings = [];
			foreach ($this->settings as $key => $value) {
				if (isset($this->defaults[$key]['noJS']) && $this->defaults[$key]['noJS'] === true) {
					continue;
				}
				$jsSafeSettings[$key] = $value;
			}
			return $jsSafeSettings;
		}

		public function getLanguages(): array
		{
			return $this->languages;
		}

		public function getSkins(): array
		{
			return $this->skins;
		}

		/* ==== user specific functions ==== */
		public function fetchUserSettings(string $userId, array $userGroup, string $forceLang = ''): void
		{
			/*  adjust defaults based on user group permissions for editor buttons, this is required to properly populate
				the editor buttons settings for the user, which is used to determine which editor buttons the user has
				access to across the editor */
			$this->getEditorButtons($userGroup);

			//override defaults with user specific settings
			$this->userOverride($userId);
			$this->settings['interfaceLanguage'] = $this->getIntLang($userId, $forceLang);
			$this->sanitizeSettings();
		}

		private function userOverride(string $userId): void
		{

			if (!empty($userId)) {
				$query = "SELECT `accessdef` FROM `users` WHERE `id` = ?";
				$res = $this->db->fetchValue($query, [$userId]);
				$userDbSettingsJson = $res['data'] ?? '';

				// in the case that the user has been deleted while attempting to browse
				if (empty($userDbSettingsJson)) {
					return;
				}

				$udb_settings = json_decode($userDbSettingsJson, true);
				if (isset($udb_settings['userSettings'])) {
					foreach ($udb_settings['userSettings'] as $option => $value) {
						if (!isset($this->defaults[$option])) {
							continue;
						}
						switch ($this->defaults[$option]["format"]) {
							case FORMAT_BOOL:
								if ($value === true) {
									$this->settings[$option] = true;
								} else {
									$this->settings[$option] = false;
								}
								break;
							case FORMAT_SINGLE_CHOICE_INT:
							case FORMAT_INT:
								$this->settings[$option] = (int)$value;
								break;
							case FORMAT_DOUBLE:
								$this->settings[$option] = (float)$value;
								break;
							case FORMAT_SINGLE_CHOICE_STRING:
							case FORMAT_STRING:
							case FORMAT_PASSWORD:
								$this->settings[$option] = $value;
								break;
							case FORMAT_MULTIPLE_CHOICE:
								$this->settings[$option] = json_decode($value ?? '', true);
								if (json_last_error() !== JSON_ERROR_NONE) {
									//revert back to default value if value from database could not be json decoded
									$this->settings[$option] = $this->defaults[$option]['value'];
								}
								break;
						}
					}
				} else {
					$this->db->prepare("UPDATE `users` SET `accessDef` = JSON_SET(`accessDef`,'$.userSettings', JSON_OBJECT()) WHERE `id` = ?");
					$this->db->executePrepared([$userId]);
				}
			}
		}

		function getIntLang(string $userId, string $forceLang = ''): string
		{
			$final_lang = "";

			// get browser lang if possible as a starting point
			$server_lang_string = $_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '';
			if (!empty($server_lang_string)) {
				$final_lang = strtoupper(substr($server_lang_string, 0, 2));
			}

			// check for pre-saved entry first for lang selection, otherwise, if a forced value present, use that
			if (isset($userId)) {
				$res = $this->db->fetchValue("SELECT `defLang` FROM `users` WHERE `id` = ?", [$userId]);
				$final_lang = !empty($res['data']) ? $res['data'] : $final_lang;
			} elseif (!empty($forceLang)) {
				$final_lang = $forceLang;
			}

			// if no forced or set lang found, use EN
			if (!in_array($final_lang, ['EN', 'FR', 'DE'])) {
				$final_lang = 'EN';
			}
			return $final_lang;
		}

		private function getEditorButtons(array $userGroup): void
		{
			if (isset($this->defaults['editorButtons'])) {
				$this->settings['editorButtons'] = $this->userSettingsFetch('editorButtons', $userGroup);
			}
		}

		private function userSettingsFetch(string $settingName, array $userGroup): array
		{
			if (!isset($userGroup)) {
				return [];
			}

			$ugIds = $userGroup;
			$userSettingVal = [];

			// iterate the editor button list based on usergroup IDs
			foreach ($ugIds as $userGroupId) {
				$userSettingRes = json_decode($this->db->fetchValue("SELECT JSON_QUERY(`accessDef`, '$.$settingName') FROM userGroups WHERE id = ?", [$userGroupId])['data'] ?? '', true);

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


		/* ==== static functions ==== */
		public static function getInstance(?OasysApp $app = null): OasysSettings
		{
			if (!isset(self::$instance)) {
				if (!isset($app)) {
					throw new LogicException("OasysSettings must be initialized by OasysApp.");
				}

				self::$instance = new OasysSettings($app);
			}
			return self::$instance;
		}


		/* find all installed skins */
		public static function findSkins(): array
		{
			$skins = [];

			//fetch supported skins
			foreach (glob(__DIR__ . "/../../skins/*") as $path) {
				$propertiesPath = $path . '/properties.json';
				if (!file_exists($propertiesPath)) {
					/* skip every folder that does not have the required properties.json file */
					continue;
				}
				$options = file_get_contents($propertiesPath);
				$options = json_decode($options ?? '', true);
				$path = preg_replace('/^.*skins\//', 'skins/', $path);
				$skin = ['folder' => $path, 'id' => $options['id'], 'options' => $options['properties']];
				$skins[$options['id']] = $skin;
			}
			foreach (glob(__DIR__ . "/../../modules/*") as $modulePath) {
				$moduleSkins = $modulePath . "/skins";
				if (!file_exists($moduleSkins)) {
					/* skip every module folder that does not have any skins */
					continue;
				}
				foreach (glob($moduleSkins . '/*') as $path) {
					$propertiesPath = $path . '/properties.json';
					if (!file_exists($propertiesPath)) {
						/* skip every folder that does not have the required properties.json file */
						continue;
					}
					$options = file_get_contents($propertiesPath);
					$options = json_decode($options ?? '', true);
					$path = preg_replace('/^.*modules\//', 'modules/', $path);
					$skin = ['folder' => $path, 'id' => $options['id'], 'options' => $options['properties']];
					$skins[$options['id']] = $skin;
				}
			}

			return $skins;
		}


		/* find all custom modules and load into settings */
		public static function findMods(): array
		{
			$moduleList = [];
			foreach (glob(__DIR__ . "/../../modules/*", GLOB_ONLYDIR) as $editorModFolder) {
				if (!file_exists($editorModFolder . '/editor/editor.json')) {
					/* skip every folder that does not have the required editor.json file */
					continue;
				}
				array_push($moduleList, json_decode(file_get_contents($editorModFolder . '/editor/editor.json') ?? '', true));
			}

			return $moduleList;
		}

		/**
		 * Calculate and return the relative root path for
		 * the Oasys instance.
		 * @return string
		 */
		public static function establishRootURL(): string
		{
			// Root URL discovery depends on web-server variables and is not needed by CLI tools.
			if (PHP_SAPI === 'cli') {
				return "/";
			}

			// Windows file system slash fix
			$curPath = str_replace("\\", "/", realpath(__DIR__ . "/../../"));

			// Fallback for cases where server variables are missing
			if (empty($_SERVER['SCRIPT_FILENAME']) || empty($_SERVER['SCRIPT_NAME'])) {
				return "/";
			}

			$scriptFilename = str_replace("\\", "/", realpath($_SERVER['SCRIPT_FILENAME']));
			if ($scriptFilename === false) {
				$scriptFilename = str_replace("\\", "/", $_SERVER['SCRIPT_FILENAME']);
			}

			// check for standard Kubernetes Ingress prefix headers
			$prefixHeader = $_SERVER['HTTP_X_FORWARDED_PREFIX'] ?? null;

			if ($prefixHeader !== null) {
				$scriptName = $_SERVER['SCRIPT_NAME'];

				// Find the relative path of the executing script from the app root
				if (str_starts_with($scriptFilename, $curPath)) {
					// +1 to also remove the leading slash from the relative path
					$relPath = substr($scriptFilename, strlen($curPath));

					if (str_ends_with($scriptName, $relPath)) {
						$rootUrl = substr($scriptName, 0, strlen($scriptName) - strlen($relPath));
					} else {
						$rootUrl = dirname($scriptName);
					}
				} else {
					$rootUrl = dirname($scriptName);
				}

				// inject ingress prefix if provided
				if ($prefixHeader !== '') {
					$rootUrl = rtrim($prefixHeader, '/') . '/' . ltrim($rootUrl, '/');
				}
			} else {
				$contextDocRoot = $_SERVER['CONTEXT_DOCUMENT_ROOT'] ?? null;
				if ($contextDocRoot === null) {
					global $returnData;
					if (!isset($returnData)) {
						$returnData = [];
					}
					$returnData = ['fatalError' => 'Unable to determine prefix header.'];
					die(json_encode($returnData));
				}

				$curPathWithSlash = (!str_ends_with($curPath, "/")) ? $curPath . "/" : $curPath;

				// if the app root is the same as server root, we want '/' to be the rootURL value in settings, otherwise, the diff between the two
				$rootUrl = substr($curPathWithSlash, strlen(rtrim($contextDocRoot, '/')));
			}

			// string checks and fixes
			$rootUrl = trim($rootUrl);
			$rootUrl = (!str_starts_with($rootUrl, "/")) ? "/" . $rootUrl : $rootUrl;
			$rootUrl = (!str_ends_with($rootUrl, "/")) ? $rootUrl . "/" : $rootUrl;


			return $rootUrl;
		}

		public static function establishJSRootURL($defaultRootURL): string
		{
			// Windows file system slash fix
			$curPath = str_replace("\\", "/", realpath(__DIR__ . "/../../"));
			$curPath = (!str_ends_with($curPath, "/")) ? $curPath . "/" : $curPath;

			$prefixHeader = $_SERVER['HTTP_X_FORWARDED_PREFIX'] ?? null;
			$contextPrefix = $_SERVER['CONTEXT_PREFIX'] ?? '';

			// If using K8s HTTP_X_FORWARDED_PREFIX, the establishRootURL function 
			// already factored this in, so $defaultRootURL is sufficient
			if ($prefixHeader !== null) {
				$rootPath = $defaultRootURL;
			} elseif ($contextPrefix !== '') {
				//if there is a CONTEXT_PREFIX, we need to use it to establish the root path as an alias or similar is in use
				$contextDocRoot = $_SERVER['CONTEXT_DOCUMENT_ROOT'] ?? '';
				$contextPath = str_replace("\\", "/", realpath($contextDocRoot) . "/");
				$contextPath = (!str_ends_with($contextPath, "/")) ? $contextPath . "/" : $contextPath;
				$rootPath = str_replace(rtrim($contextPath, '/'), "", $curPath);
				$rootPath = $contextPrefix . $rootPath;
			} else {
				$rootPath = $defaultRootURL;
			}

			// string checks and fixes
			$rootPath = trim($rootPath);
			$rootPath = (!str_starts_with($rootPath, "/")) ? "/" . $rootPath : $rootPath;
			$rootPath = (!str_ends_with($rootPath, "/")) ? $rootPath . "/" : $rootPath;

			return $rootPath;
		}

}
