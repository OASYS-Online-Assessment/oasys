<?php
// JSON output even if fatal error occurs
register_shutdown_function('outputJSON');

require_once __DIR__ . "/inc/php/initBackend.php";
require_once "../inc/php/Crypt.php";
require_once 'inc/php/userHandling.php';
include_once 'userMgmtActions.php';
include_once 'inc/php/systemState.php';
require_once 'inc/php/syscheck.php';
require_once 'inc/php/EncryptionKeyRotation.php';
require_once 'maintenance/mediaClass.php';

use maintenance\mediaClass;

# ----------------------- #
# Authentication Includes #
# ----------------------- #
$pageName = "systemsettings";
$isSubMod = false;
$isActionFile = true;
require_once 'inc/php/authCommonFunctions.php';

# ----------------------- #
# Translation Include     #
# ----------------------- #
require_once 'inc/php/uiLang.php';
$uiLang = new uiLang($settings['interfaceLanguage']);

// Action routing
$action = filter_input(INPUT_POST, 'action') ?: "";
$returnData = array();
$returnData['action'] = $action;
$returnData['error'] = false;

// Early auth error passthrough from constructor
if ($myAuth->returnData['error'] !== false) {
	$returnData['error'] = $myAuth->returnData['error'];
	exit;
}

$auth = $myAuth->getAuthResult(true);

// Receive JSON data payload
$data = filter_input(INPUT_POST, 'data');
if ($data) {
	$data = json_decode($data ?? '', true);
}
if (!$data) {
	$data = array();
}

// DB
$db = $app->getDatabaseInstance();

# ------------------------------------------- #
# Permission authenticator wrapper            #
# ------------------------------------------- #
$permAuth = new permAuth($action, $data, $myAuth);
$letMePass = $permAuth->permCheck($data);
if ($letMePass === true) {
	$returnData = $permAuth->returnData;  // carry-over any preloaded data
	if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
	$action($data, $db, $returnData);
} else {
	$returnData = $permAuth->returnData;
}

/*
	 * actions
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

function change_m_status(array $data, rixPDO &$db, array &$returnData)
{
	global $myAuth, $backendState;

	if ($myAuth->checkSA() !== true) {
		$returnData['error'] = "This function is reserved for superadmins only!";
		return;
	}

	checkParams($data, ['section', 'state']);
	$section = (string)$data['section'];
	if (!in_array($section, ['frontend', 'backend'], true)) {
		$returnData['error'] = "Invalid maintenance-mode section.";
		return;
	}
	if (!in_array($data['state'], [0, 1, '0', '1'], true)) {
		$returnData['error'] = "Invalid maintenance-mode state.";
		return;
	}
	$state = (int)$data['state'];

	checkActiveStates($data, $db, $returnData); // populate returnData with be/fe counts and detail

	if ($returnData['fecount'] > 0 && $state === 1 && $section === "frontend") {
		$returnData['stop'] = true;
		return;
	}

	if ($returnData['becount'] > 0 && $state === 1 && $section === "backend") {
		$backendState->nukeAllStatesExceptCurrent();
	}

	set_mmode($section, $state, $db);
	m_status($data, $db, $returnData);
}

function encryptionRotationStatus(array $data, rixPDO &$db, array &$returnData): void
{
	global $myAuth;
	if ($myAuth->checkSA() !== true) {
		$returnData['error'] = 'This function is reserved for superadmins only!';
		return;
	}
	try {
		$returnData['data'] = EncryptionKeyRotation::status($db);
	} catch (Throwable $e) {
		$returnData['error'] = $e->getMessage();
	}
}

function rotateManagedEncryptionKey(array $data, rixPDO &$db, array &$returnData): void
{
	global $myAuth;
	if ($myAuth->checkSA() !== true) { $returnData['error'] = 'This function is reserved for superadmins only!'; return; }
	try {
		$returnData['data'] = EncryptionKeyRotation::rotateManaged($db, (int)$myAuth->userid);
	} catch (Throwable $e) {
		$returnData['error'] = $e->getMessage();
	}
}

function prepareEnvironmentEncryptionKey(array $data, rixPDO &$db, array &$returnData): void
{
	global $myAuth;
	if ($myAuth->checkSA() !== true) { $returnData['error'] = 'This function is reserved for superadmins only!'; return; }
	try {
		$returnData['data'] = EncryptionKeyRotation::prepareEnvironment($db, (int)$myAuth->userid);
	} catch (Throwable $e) {
		$returnData['error'] = $e->getMessage();
	}
}

function verifyEnvironmentEncryptionKey(array $data, rixPDO &$db, array &$returnData): void
{
	global $myAuth;
	if ($myAuth->checkSA() !== true) { $returnData['error'] = 'This function is reserved for superadmins only!'; return; }
	try {
		$returnData['data'] = EncryptionKeyRotation::verifyEnvironment($db, (int)$myAuth->userid);
	} catch (Throwable $e) {
		$returnData['error'] = $e->getMessage();
	}
}

function rotateEnvironmentEncryptedData(array $data, rixPDO &$db, array &$returnData): void
{
	global $myAuth;
	if ($myAuth->checkSA() !== true) { $returnData['error'] = 'This function is reserved for superadmins only!'; return; }
	try {
		$returnData['data'] = EncryptionKeyRotation::rotateEnvironmentData($db, (int)$myAuth->userid);
	} catch (Throwable $e) {
		$returnData['error'] = $e->getMessage();
	}
}

function finalizeEnvironmentEncryptionKey(array $data, rixPDO &$db, array &$returnData): void
{
	global $myAuth;
	if ($myAuth->checkSA() !== true) { $returnData['error'] = 'This function is reserved for superadmins only!'; return; }
	try {
		$returnData['data'] = EncryptionKeyRotation::finalizeEnvironment($db, (int)$myAuth->userid);
	} catch (Throwable $e) {
		$returnData['error'] = $e->getMessage();
	}
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

	$returnData['res'] = [];
	$documentRoot = realpath(DOCROOT);
	if ($documentRoot === false) {
		$returnData['error'] = "Could not resolve the OASYS document root.";
		return;
	}
	$documentRoot = rtrim($documentRoot, DIRECTORY_SEPARATOR);
	foreach ($thing2Kill as $dirObject) {
		// The verifier runs from editor/tools and therefore reports OASYS-root paths with this exact prefix.
		if (!str_starts_with($dirObject, '../../')) {
			$returnData['res'][] = "Skipped path with an unexpected origin: " . $dirObject;
			continue;
		}
		$relativePath = ltrim(str_replace(['\\', '/'], DIRECTORY_SEPARATOR, substr($dirObject, 6)), DIRECTORY_SEPARATOR);
		$candidate = $documentRoot . DIRECTORY_SEPARATOR . $relativePath;
		$filepath = realpath($candidate);
		if ($filepath === false || $filepath === $documentRoot || !str_starts_with($filepath, $documentRoot . DIRECTORY_SEPARATOR) || is_link($candidate)) {
			$returnData['res'][] = "Skipped unsafe or unreadable path: " . $dirObject;
			continue;
		}
		if (is_file($filepath)) {
			if (!@unlink($filepath)) {
				$lastError = error_get_last();
				$FfailReason = $lastError['message'] ?? 'Unknown error';
				error_clear_last();
				$returnData['res'][] = "Failed to remove file: " . $dirObject . " - " . $FfailReason;
			} else {
				$returnData['res'][] = "Successfully removed file: " . $dirObject;
			}
		} elseif (is_dir($filepath)) {
			if (!@rmdir($filepath)) {
				$lastError = error_get_last();
				$DfailReason = $lastError['message'] ?? 'Unknown error';
				error_clear_last();
				$returnData['res'][] = "Failed to remove directory: " . $dirObject . " - " . $DfailReason;
			} else {
				$returnData['res'][] = "Successfully removed directory: " . $dirObject;
			}
		} else {
			$returnData['res'][] = "Could not read path: " . $dirObject;
		}
	}
}

/** Oasys file system validation routine */
function filesyscheck(array $data, rixPDO &$db, array &$returnData): void
{
	$scriptPath = './tools/file_verifier.sh';
	if (!file_exists($scriptPath)) {
		$returnData['error'] = "Did not find SHA1 validator script!";
		return;
	}

	if (!file_exists("./tools/sha1_data/oasys_sha1s.txt.ref")) {
		$returnData['error'] = "Did not find SHA1 reference file!";
		return;
	}

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

	$output = [];
	$returnCode = 0;
	exec($scriptPath . " -v -n 2>&1", $output, $returnCode);

	if (!file_exists("./tools/sha1_data/oasys_sha1s.txt.cur")) {
		$returnData['error'] = "Could not generate the SHA1 hash file!";
		return;
	}

	$returnData['output'] = file_get_contents("./tools/sha1_data/last_result.log");
	$returnData['output'] = preg_replace('/\e[[][A-Za-z0-9];?[0-9]*m?/', '', $returnData['output']);
	$returnData['output'] = str_replace("../../", "", $returnData['output']);
	$returnData['exitCode'] = $returnCode;

	if ($returnCode !== 0) {
		$returnData['error'] = "File verification failed with exit code: $returnCode";
	}
}

function syscheck(array $data, rixPDO &$db, array &$returnData): void
{
	require_once 'inc/php/syscheck.php';
	$result = oasys_syscheck($db);
	$returnData['data'] = $result['data'];
}

function mediaCheck(array $data, rixPDO &$db, array &$returnData): void
{
	$traffic = expensiveCheckTrafficState();
	if ($traffic['blocked']) {
		$returnData['errorCode'] = 'activeTestTakers';
		$returnData['error'] = 'The media check cannot run while test takers are active.';
		$returnData['data'] = $traffic;
		return;
	}
	$returnData['data'] = runMediaMaintenanceCheck('verifyMediaAssets');
}

function mediaCheckSafety(array $data, rixPDO &$db, array &$returnData): void
{
	$returnData['data'] = expensiveCheckTrafficState();
}

function mediaRepair(array $data, rixPDO &$db, array &$returnData): void
{
	global $myAuth;
	if ($myAuth->checkSA() !== true && $myAuth->checkElevatedAdmin() !== true) {
		$returnData['error'] = 'This function is reserved for superadmins and elevated administrators!';
		return;
	}

	$repair = runMediaMaintenanceCheck('consolidateMediaAssets');
	$verification = runMediaMaintenanceCheck('verifyMediaAssets');
	$verification['repairLog'] = $repair['log'];
	$returnData['data'] = $verification;
}

function runMediaMaintenanceCheck(string $action): array
{
	global $settings;
	$result = ['error' => false, 'log' => []];
	$media = new mediaClass($result, []);
	$media->execute($action);

	return [
		'log' => $result['log'] ?? [],
		'error' => $result['error'] ?? false,
		'mediaLocation' => $settings['mediaLocation'] ?? 'disk',
		'canRepair' => mediaMaintenanceHasRepairableIssues($result['log'] ?? []),
	];
}

function mediaMaintenanceHasRepairableIssues(array $log): bool
{
	$area = '';
	foreach ($log as $line) {
		if ($line === '=== Test-content media [media] ===') {
			$area = 'media';
			continue;
		}
		if ($line === '=== Meta-page media [customContent] ===') {
			$area = 'customContent';
			continue;
		}
		if ($line === '') continue;
		if ($area === 'media') return true;
		if ($area === 'customContent' && (
			str_starts_with($line, 'Empty custom-content folder')
			|| str_starts_with($line, 'Custom-content folder is not writable')
			|| str_starts_with($line, 'Custom-content reference in test id=')
		)) return true;
	}
	return false;
}

function fetchSettings($data, &$db, &$returnData)
{
	//TODO: adapt to new settings
	global $myAuth, $config;
	$settingsDefaults = $config->getDefaults();

	// privileged if SA or AE
	$priv = ((bool)$myAuth->checkSA() || (bool)$myAuth->checkElevatedAdmin());

	$passwordOptions = array_keys(array_filter($settingsDefaults, static function ($entry) {
		return isset($entry['format']) && $entry['format'] === FORMAT_PASSWORD;
	}));

	$returnData['data']  = array();
	$returnData['encMap'] = array(); // which options are encrypted in DB
	$returnData['passwordSetMap'] = array(); // password options that have a DB override, without fetching the value

	$nonPasswordQuery = "SELECT `option`, `value`, `encryption` FROM settings";
	$nonPasswordParams = array();
	if (count($passwordOptions) > 0) {
		$nonPasswordQuery .= " WHERE `option` NOT IN (" . implode(',', array_fill(0, count($passwordOptions), '?')) . ")";
		$nonPasswordParams = $passwordOptions;
	}

	$db->fetchTable($nonPasswordQuery, $nonPasswordParams);
	$result = $db->results();

	foreach ($result['data'] as $row) {
		$opt = $row['option'];
		$val = $row['value'];
		$enc = (int)$row['encryption'];

		$returnData['encMap'][$opt] = $enc;

		if ($enc === 1) {
			if ($priv) {
				try {
					$decryptedValue = Crypt::decryptString($val);
					if ($decryptedValue === false) {
						$returnData['error'] = "Please contact your system administrator. There is a problem with password handling.";
						return;
					}
					$returnData['data'][$opt] = $decryptedValue;
				} catch (Throwable $e) {
					$returnData['error'] = "Please contact your system administrator. There is a problem with password handling.";
					return;
				}
			} else {
				$returnData['data'][$opt] = '< value set >';
			}
		} else {
			$returnData['data'][$opt] = $val;
		}
	}

	if (count($passwordOptions) > 0) {
		$passwordQuery = "SELECT `option`, `value`, `encryption` FROM settings WHERE `option` IN (" . implode(',', array_fill(0, count($passwordOptions), '?')) . ")";
		$db->fetchTable($passwordQuery, $passwordOptions);
		$passwordResult = $db->results();

		foreach ($passwordResult['data'] as $row) {
			$opt = $row['option'];
			$returnData['encMap'][$opt] = (int)$row['encryption'];
			if ($priv && (int)$row['encryption'] === 1 && Crypt::decryptString($row['value']) === false) {
				$returnData['error'] = "Please contact your system administrator. There is a problem with password handling.";
				return;
			}
			$returnData['passwordSetMap'][$opt] = true;
		}
	}
}

function export_settings_values(array $data, rixPDO &$db, array &$returnData)
{
	//TODO: adapt to new settings
	global $myAuth, $config;
	$settingsDefaults = $config->getDefaults();

	$isPriv = ((bool)$myAuth->checkSA() || (bool)$myAuth->checkElevatedAdmin());
	if (!$isPriv) {
		$returnData['error'] = "This function is reserved for superadmins and elevated admins!";
		return;
	}

	if (!isset($data['keys']) || !is_array($data['keys'])) {
		$returnData['error'] = "Error: missing parameter 'keys'!";
		return;
	}

	$keys = array_values(array_unique(array_filter(array_map('strval', $data['keys']), static function ($key) use ($settingsDefaults) {
		return isset($settingsDefaults[$key]) && $settingsDefaults[$key]['scope'] === SETTINGS_SYSTEM;
	})));

	$returnData['values'] = array();
	if (count($keys) === 0) {
		return;
	}

	$query = "SELECT `option`, `value`, `encryption` FROM settings WHERE `option` IN (" . implode(',', array_fill(0, count($keys), '?')) . ")";
	$db->fetchTable($query, $keys);
	$result = $db->results();

	foreach ($result['data'] as $row) {
		$opt = $row['option'];
		$val = $row['value'];
		if ((int)$row['encryption'] === 1) {
			try {
				$val = Crypt::decryptString($val);
				if ($val === false) {
					$returnData['error'] = "Please contact your system administrator. There is a problem with password handling.";
					return;
				}
			} catch (Throwable $e) {
				$returnData['error'] = "Please contact your system administrator. There is a problem with password handling.";
				return;
			}
		}
		$returnData['values'][$opt] = $val;
	}
}

function saveSetting($data, &$db, &$returnData)
{
	global $config;
	checkParams($data, array('clickedKey', 'value'));
	$defaults = $config->getDefaults();
	$validated = validateSystemSetting((string)$data['clickedKey'], $data['value'], $defaults);
	if ($validated['error'] !== false) {
		$returnData['error'] = $validated['error'];
		return;
	}

	$settingsToSave = [$validated];
	if ($validated['option'] === 'cookieSameSite' && $validated['value'] === 'None' && $config->getProperty('cookieSecure') !== true) {
		$settingsToSave[] = validateSystemSetting('cookieSecure', true, $defaults);
		$returnData['adjustedSetting'] = ['option' => 'cookieSecure', 'value' => true];
	} elseif ($validated['option'] === 'cookieSecure' && $validated['value'] === 'false' && $config->getProperty('cookieSameSite') === 'None') {
		$settingsToSave[] = validateSystemSetting('cookieSameSite', $defaults['cookieSameSite']['value'], $defaults);
		$returnData['adjustedSetting'] = ['option' => 'cookieSameSite', 'value' => $defaults['cookieSameSite']['value']];
	}

	try {
		if ($db->startTransaction() !== true) throw new RuntimeException('Could not start database transaction.');
		$db->prepare('INSERT INTO settings (`option`,`value`,`encryption`) VALUES(?,?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`), `encryption`=VALUES(`encryption`)');
		foreach ($settingsToSave as $setting) {
			$result = $db->executePrepared([$setting['option'], $setting['value'], $setting['encryption']]);
			if (is_array($result) && !empty($result['error'])) throw new RuntimeException('Could not save the system setting.');
		}
		if ($db->commit() !== true) throw new RuntimeException('Could not commit the system setting.');
	} catch (Throwable $e) {
		$db->rollback();
		$returnData['error'] = $e->getMessage();
	}
}

function resetSetting($data, &$db, &$returnData)
{
	global $config;
	checkParams($data, array('clickedKey'));
	$clickedKey = $data['clickedKey'];
	$defaults = $config->getDefaults();
	if (!isset($defaults[$clickedKey]) || ($defaults[$clickedKey]['scope'] ?? null) !== SETTINGS_SYSTEM || in_array('immutable', $defaults[$clickedKey]['options'] ?? [], true)) {
		$returnData['error'] = 'Invalid or immutable system setting.';
		return;
	}

	$settingsToReset = [$clickedKey];
	if ($clickedKey === 'cookieSecure' && $config->getProperty('cookieSameSite') === 'None') {
		$settingsToReset[] = 'cookieSameSite';
		$returnData['adjustedSetting'] = ['option' => 'cookieSameSite', 'value' => $defaults['cookieSameSite']['value']];
	}

	try {
		if ($db->startTransaction() !== true) throw new RuntimeException('Could not start database transaction.');
		$db->prepare("DELETE FROM settings WHERE `option` IN (" . implode(',', array_fill(0, count($settingsToReset), '?')) . ")");
		$result = $db->executePrepared($settingsToReset);
		if (is_array($result) && !empty($result['error'])) throw new RuntimeException('Could not reset the system setting.');
		if ($db->commit() !== true) throw new RuntimeException('Could not commit the system setting.');
	} catch (Throwable $e) {
		$db->rollback();
		$returnData['error'] = $e->getMessage();
	}
}

/**
 * Import settings: atomically replaces mutable system-setting overrides.
 * Payload: { items: [ { option, value } ] }
 * Auth: superadmin OR elevated admin only.
 */
function import_settings(array $data, rixPDO &$db, array &$returnData)
{
	global $myAuth, $uiLang, $config;

	// privilege: SA or Elevated Admin
	$isPriv = ((bool)$myAuth->checkSA() || (bool)$myAuth->checkElevatedAdmin());
	if (!$isPriv) {
		$returnData['error'] = "This function is reserved for superadmins and elevated admins!";
		return;
	}

	if (!isset($data['items']) || !is_array($data['items'])) {
		$returnData['error'] = $uiLang->translate("Error: missing parameter 'items'!");
		return;
	}

	$validatedItems = [];
	$seen = [];
	foreach ($data['items'] as $item) {
		if (!is_array($item) || !array_key_exists('option', $item) || !array_key_exists('value', $item)) {
			$returnData['error'] = 'Import contains an invalid row.';
			return;
		}
		$option = (string)$item['option'];
		if (isset($seen[$option])) {
			$returnData['error'] = 'Import contains the setting more than once: ' . $option;
			return;
		}
		$seen[$option] = true;
		$validated = validateSystemSetting($option, $item['value'], $config->getDefaults());
		if ($validated['error'] !== false) {
			$returnData['error'] = $validated['error'];
			return;
		}
		$validatedItems[] = $validated;
	}
	if (count($validatedItems) === 0) {
		$returnData['error'] = 'Import contains no valid system settings.';
		return;
	}

	$validatedItemsByOption = array_column($validatedItems, null, 'option');
	$defaults = $config->getDefaults();
	$importedSameSite = $validatedItemsByOption['cookieSameSite']['value'] ?? $defaults['cookieSameSite']['value'];
	$importedSecure = $validatedItemsByOption['cookieSecure']['value'] ?? ($defaults['cookieSecure']['value'] ? 'true' : 'false');
	if ($importedSameSite === 'None' && $importedSecure !== 'true') {
		$validatedItemsByOption['cookieSecure'] = validateSystemSetting('cookieSecure', true, $defaults);
		$returnData['adjustedSetting'] = ['option' => 'cookieSecure', 'value' => true];
	}
	$validatedItems = array_values($validatedItemsByOption);

	try {
		$started = $db->startTransaction();
		if ($started !== true) throw new RuntimeException('Could not start database transaction.');
		// Replace mutable system settings only. User/group overrides and immutable values remain intact.
		$systemKeys = array_keys(array_filter($config->getDefaults(), static fn($entry) => ($entry['scope'] ?? null) === SETTINGS_SYSTEM && !in_array('immutable', $entry['options'] ?? [], true)));
		if (count($systemKeys) > 0) {
			$db->prepare("DELETE FROM settings WHERE `option` IN (" . implode(',', array_fill(0, count($systemKeys), '?')) . ")");
			$result = $db->executePrepared($systemKeys);
			if (is_array($result) && !empty($result['error'])) throw new RuntimeException('Could not replace existing settings.');
		}
		$db->prepare('INSERT INTO settings (`option`,`value`,`encryption`) VALUES(?,?,?)');
		$inserted = 0;
		foreach ($validatedItems as $item) {
			$result = $db->executePrepared([$item['option'], $item['value'], $item['encryption']]);
			if (is_array($result) && !empty($result['error'])) throw new RuntimeException('Could not import setting: ' . $item['option']);
			$inserted++;
		}
		if ($db->commit() !== true) throw new RuntimeException('Could not commit imported settings.');
		$returnData['inserted'] = $inserted;
	} catch (Throwable $e) {
		$db->rollback();
		$returnData['error'] = "Import failed: " . $e->getMessage();
		return;
	}
}

function validateSystemSetting(string $option, mixed $value, array $defaults): array
{
	$invalid = static fn(string $message): array => ['error' => $message, 'option' => $option, 'value' => '', 'encryption' => 0];
	if (!isset($defaults[$option]) || ($defaults[$option]['scope'] ?? null) !== SETTINGS_SYSTEM) return $invalid('Unknown or non-system setting: ' . $option);
	$definition = $defaults[$option];
	if (in_array('immutable', $definition['options'] ?? [], true)) return $invalid('Setting is immutable: ' . $option);
	$format = $definition['format'] ?? null;
	$normalized = '';
	switch ($format) {
		case FORMAT_BOOL:
			if (is_bool($value)) $normalized = $value ? 'true' : 'false';
			elseif (is_string($value) && in_array(strtolower($value), ['true', 'false'], true)) $normalized = strtolower($value);
			else return $invalid('Invalid boolean value for setting: ' . $option);
			break;
		case FORMAT_INT:
		case FORMAT_SINGLE_CHOICE_INT:
			if (filter_var($value, FILTER_VALIDATE_INT) === false) return $invalid('Invalid integer value for setting: ' . $option);
			$number = (int)$value;
			if (isset($definition['min']) && $number < $definition['min'] || isset($definition['max']) && $number > $definition['max']) return $invalid('Value is outside the permitted range for setting: ' . $option);
			if ($format === FORMAT_SINGLE_CHOICE_INT && !in_array((string)$number, array_map('strval', array_keys($definition['choices'] ?? [])), true)) return $invalid('Invalid choice for setting: ' . $option);
			$normalized = (string)$number;
			break;
		case FORMAT_DOUBLE:
			if (!is_numeric($value)) return $invalid('Invalid numeric value for setting: ' . $option);
			$number = (float)$value;
			if (isset($definition['min']) && $number < $definition['min'] || isset($definition['max']) && $number > $definition['max']) return $invalid('Value is outside the permitted range for setting: ' . $option);
			$normalized = (string)$number;
			break;
		case FORMAT_SINGLE_CHOICE_STRING:
			$normalized = (string)$value;
			if (!in_array($normalized, array_map('strval', array_keys($definition['choices'] ?? [])), true)) return $invalid('Invalid choice for setting: ' . $option);
			break;
		case FORMAT_MULTIPLE_CHOICE:
			$values = is_array($value) ? $value : json_decode((string)$value, true);
			if (!is_array($values) || !array_is_list($values)) return $invalid('Invalid multiple-choice value for setting: ' . $option);
			$allowed = array_map('strval', array_keys($definition['choices'] ?? []));
			$values = array_values(array_unique(array_map('strval', $values)));
			if (count(array_diff($values, $allowed)) > 0) return $invalid('Invalid choice for setting: ' . $option);
			$normalized = json_encode($values, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
			break;
		case FORMAT_STRING:
		case FORMAT_PASSWORD:
			$normalized = (string)$value;
			break;
		default:
			return $invalid('Unsupported format for setting: ' . $option);
	}
	$encryption = $format === FORMAT_PASSWORD ? 1 : 0;
	if ($encryption === 1) $normalized = Crypt::encryptString($normalized);
	if (!is_string($normalized) || strlen($normalized) > 255) return $invalid('Value is too long for setting: ' . $option);
	return ['error' => false, 'option' => $option, 'value' => $normalized, 'encryption' => $encryption];
}


/*
	 * helper functions
	 */
function checkParams(&$data, $params)
{
	global $uiLang, $returnData;
	if (!$params || count($params) == 0) return;
	foreach ($params as $key) {
		if (!isset($data[$key])) {
			$returnData['error'] = $uiLang->translate("Error: missing parameter '$key'!");
			die();
		}
	}
}

/*
	 * JSON encoding helper for associative arrays (kept for reference)
	 */
function encodeData(&$data, $params)
{
	if (!$params || count($params) == 0) return;
	foreach ($params as $key) {
		if (isset($data[$key])) {
			$data[$key] = json_encode($data[$key], JSON_FORCE_OBJECT);
		}
	}
}

// Final JSON output
function outputJSON()
{
	global $returnData, $action, $myAuth;

	// role flags (ONLY isSuper + isAE as requested)
	$isSA = (bool)$myAuth->checkSA();
	$isEA = (bool)$myAuth->checkElevatedAdmin();

	$returnData['isSuper'] = $isSA;
	$returnData['isAE'] = $isEA;

	// username
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
