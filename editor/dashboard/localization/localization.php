<?php
// Always output JSON (even on fatal)
	register_shutdown_function('outputJSON');
	require_once __DIR__ . '/../../inc/php/initBackend.php';

	$action = filter_input(INPUT_POST, 'action') ?: "";
	$returnData = ['data' => [], 'action' => $action, 'error' => false];

	/* Auth (same pattern you use elsewhere) */
	$pageName = "dashboard";
	$isSubMod = true;
	$isActionFile = true;
	require_once '../../inc/php/authCommonFunctions.php';
	$returnData = (array)$myAuth->returnData;
	if ($myAuth->returnData['error'] !== false) {
		exit;
	}
	if (!($myAuth->checkAdmin() || $myAuth->checkElevatedAdmin() || $myAuth->checkSA())) {
		$returnData['error'] = 'Unauthorized operation attempted.';
		exit;
	}

	/* Input */
	$data = filter_input(INPUT_POST, 'data');
	$data = $data ? json_decode($data ?? '', true) : [];
	if (!$data) $data = [];

	/* Dispatch */
	if ($action) {
		if (function_exists($action)) {
			if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
			$action($data, $db, $returnData, $myAuth);
		} else {
			$returnData['error'] = "Unknown action: " . htmlspecialchars($action);
		}
	}

	/* =========================
	   ACTIONS
	========================= */

	/**
	 * Overview payload:
	 *  data: {
	 *    defaults:    [{ code,name,fallback,flag,modifiedCount,totalVars }],
	 *    additionals: [{ code,name,fallback,isDefault:false,missingCount,totalVars }]
	 *  }
	 */
	function readOverview($data, rixPDO &$db, &$returnData, userAuth &$myAuth)
	{
		$contexts = scan_contexts_and_variables(); // defaults on disk
		$totalPairs = all_pairs($contexts);

		$langs = fetch_languages($db);
		// Normalize to map for quick lookup
		$byCode = [];
		foreach ($langs as $lg) $byCode[$lg['code']] = $lg;

		// Build defaults (fixed 4 tiles) – no fallback shown for defaults
		$DEFAULTS = [
			['code' => 'EN', 'name' => ($byCode['EN']['name'] ?? 'English')],
			['code' => 'DE', 'name' => ($byCode['DE']['name'] ?? 'Deutsch')],
			['code' => 'FR', 'name' => ($byCode['FR']['name'] ?? 'Français')],
			['code' => 'LU', 'name' => ($byCode['LU']['name'] ?? "Lëtzebuergesch")],
		];

		$defaultsOut = [];
		foreach ($DEFAULTS as $d) {
			$code = $d['code'];
			$flag = small_flag_emoji($code);

			// Count modified pairs for default language: one per (context|variable)
			$modifiedMap = fetch_modified_map_for_language($db, $code); // key => value
			$modifiedCount = count($modifiedMap);

			$defaultsOut[] = [
				'code' => $code,
				'name' => $d['name'],
				'flag' => $flag,
				'modifiedCount' => $modifiedCount,
				'totalVars' => $totalPairs
			];
		}

		// Build additionals (non-defaults) with "missing" counts
		$additionals = [];
		foreach ($langs as $lg) {
			if ($lg['isDefault']) continue; // only additional languages
			$code = $lg['code'];
			$name = $lg['name'];
			$fb = $lg['fallback'];

			$missingCount = 0;
			$present = fetch_present_pairs_for_language($db, $code); // "context|var" => true
			foreach ($contexts as $c) {
				$ctx = $c['context'];
				foreach ($c['variables'] as $var) {
					$key = $ctx . '|' . $var;
					if (!isset($present[$key])) $missingCount++;
				}
			}
			$additionals[] = [
				'code' => $code,
				'name' => $name,
				'fallback' => $fb,
				'isDefault' => false,
				'totalVars' => $totalPairs,
				'missingCount' => $missingCount
			];
		}

		// Sort additional languages alphabetically by name
		usort($additionals, function ($a, $b) {
			return strcmp(mb_strtolower($a['name']), mb_strtolower($b['name']));
		});

		$returnData['data'] = [
			'defaults' => $defaultsOut,
			'additionals' => $additionals
		];
	}

	/**
	 * Detailed list of missing strings for an additional language.
	 * Returns: { code, missing: [{context,variable,exampleEN}] }
	 */
	function inspectLanguage($data, rixPDO &$db, &$returnData, userAuth &$myAuth)
	{
		$code = strtoupper(trim($data['code'] ?? ''));
		if ($code === '') {
			$returnData['error'] = "Missing language code.";
			return;
		}

		$contexts = scan_contexts_and_variables();
		$present = fetch_present_pairs_for_language($db, $code);

		$missing = [];
		foreach ($contexts as $c) {
			$ctx = $c['context'];
			$defMap = $c['defaults']; // [var => [DE|EN|FR|LU => str]]
			foreach ($c['variables'] as $var) {
				$key = $ctx . '|' . $var;
				if (!isset($present[$key])) {
					// Prefer EN example, fallback to DE/FR/LU
					$example = $defMap[$var]['EN'] ?? '';
					if ($example === '') {
						foreach (['DE', 'FR', 'LU'] as $alt)
							if (!empty($defMap[$var][$alt])) {
								$example = $defMap[$var][$alt];
								break;
							}
					}
					$missing[] = ['context' => $ctx, 'variable' => $var, 'exampleEN' => $example];
				}
			}
		}

		$returnData['data'] = ['code' => $code, 'missing' => $missing];
	}

	/**
	 * Detailed list of modified strings for a DEFAULT language.
	 * Returns: { code, modified: [{context,variable,defaultValue,modifiedValue}] }
	 */
	function inspectModified($data, rixPDO &$db, &$returnData, userAuth &$myAuth)
	{
		$code = strtoupper(trim($data['code'] ?? ''));
		if (!in_array($code, ['DE', 'EN', 'FR', 'LU'], true)) {
			$returnData['error'] = "This endpoint is for default languages only (DE/EN/FR/LU).";
			return;
		}

		$contexts = scan_contexts_and_variables(); // get defaults
		$defLookup = []; // "ctx|var" => defaultValueForCode
		foreach ($contexts as $c) {
			$ctx = $c['context'];
			foreach ($c['variables'] as $var) {
				$defLookup[$ctx . '|' . $var] = (string)($c['defaults'][$var][$code] ?? '');
			}
		}

		$modMap = fetch_modified_map_for_language($db, $code); // key => value
		$out = [];
		foreach ($modMap as $key => $modifiedValue) {
			[$ctx, $var] = explode('|', $key, 2) + [null, null];
			if ($ctx === null || $var === null) continue;
			$defaultValue = $defLookup[$key] ?? '';
			$out[] = [
				'context' => $ctx,
				'variable' => $var,
				'defaultValue' => (string)$defaultValue,
				'modifiedValue' => (string)$modifiedValue
			];
		}

		// Sort for determinism (ctx, then var)
		usort($out, fn($a, $b) => ($a['context'] === $b['context'])
			? strcmp($a['variable'], $b['variable'])
			: strcmp($a['context'], $b['context'])
		);

		$returnData['data'] = ['code' => $code, 'modified' => $out];
	}

	/* =========================
	   HELPERS
	========================= */

	function scan_contexts_and_variables(): array
	{
		$candidates = [
			realpath(__DIR__ . '/../../../text'),
			realpath(__DIR__ . '/../../text'),
		];
		$base = null;
		foreach ($candidates as $p) {
			if ($p && is_dir($p)) {
				$base = $p;
				break;
			}
		}
		if (!$base) return [];

		$contexts = [];
		$dh = opendir($base);
		if ($dh === false) return [];

		while (($entry = readdir($dh)) !== false) {
			if ($entry === '.' || $entry === '..') continue;
			if (!preg_match('/\.json$/i', $entry)) continue;

			$ctxName = preg_replace('/\.json$/i', '', $entry);
			$full = $base . DIRECTORY_SEPARATOR . $entry;

			$json = @file_get_contents($full);
			if ($json === false || $json === '') {
				$contexts[] = ['context' => $ctxName, 'variables' => [], 'defaults' => []];
				continue;
			}
			$data = json_decode($json, true);
			if (!is_array($data)) {
				$contexts[] = ['context' => $ctxName, 'variables' => [], 'defaults' => []];
				continue;
			}

			$vars = [];
			$defaults = []; // var => [DE,EN,FR,LU]
			foreach ($data as $varName => $langMap) {
				$vars[] = $varName;
				$defaults[$varName] = [
					'DE' => (is_array($langMap) && array_key_exists('DE', $langMap)) ? (string)$langMap['DE'] : '',
					'EN' => (is_array($langMap) && array_key_exists('EN', $langMap)) ? (string)$langMap['EN'] : '',
					'FR' => (is_array($langMap) && array_key_exists('FR', $langMap)) ? (string)$langMap['FR'] : '',
					'LU' => (is_array($langMap) && array_key_exists('LU', $langMap)) ? (string)$langMap['LU'] : '',
				];
			}

			$contexts[] = [
				'context' => $ctxName,
				'variables' => $vars,
				'defaults' => $defaults
			];
		}
		closedir($dh);

		usort($contexts, fn($a, $b) => strcmp($a['context'], $b['context']));
		return $contexts;
	}

	function all_pairs(array $contexts): int
	{
		$n = 0;
		foreach ($contexts as $c) {
			$n += count($c['variables']);
		}
		return $n;
	}

	/** Present pairs (context,variable) for any language */
	function fetch_present_pairs_for_language(rixPDO $db, string $code): array
	{
		$map = [];
		$res = $db->fetchTable("SELECT context, variable FROM l10n WHERE language=?", [$code]);
		$rows = (is_array($res) && $res['error'] === false && is_array($res['data'])) ? $res['data'] : [];
		foreach ($rows as $row) {
			$ctx = (string)($row['context'] ?? '');
			$var = (string)($row['variable'] ?? '');
			if ($ctx !== '' && $var !== '') {
				$map[$ctx . '|' . $var] = true;
			}
		}
		return $map;
	}

	/** Modified map for defaults: key "ctx|var" => overridden value */
	function fetch_modified_map_for_language(rixPDO $db, string $code): array
	{
		$out = [];
		// 'text' is the actual column in your schema; alias it to 'value'
		$res = $db->fetchTable(
			"SELECT context, variable, text AS value FROM l10n WHERE language=?",
			[$code]
		);
		$rows = (is_array($res) && $res['error'] === false && is_array($res['data'])) ? $res['data'] : [];
		foreach ($rows as $r) {
			$ctx = (string)($r['context'] ?? '');
			$var = (string)($r['variable'] ?? '');
			if ($ctx === '' || $var === '') continue;
			$out[$ctx . '|' . $var] = (string)($r['value'] ?? ''); // uses the alias
		}
		return $out;
	}

	/** Load languages and normalize (code, name, fallback, isDefault) */
	function fetch_languages(rixPDO $db): array
	{
		$defaults = ['DE', 'EN', 'FR', 'LU'];

		$res = $db->fetchTable("SELECT * FROM languages", []);
		$rows = (is_array($res) && $res['error'] === false && is_array($res['data'])) ? $res['data'] : [];

		$out = [];
		foreach ($rows as $r) {
			$code = strtoupper(trim($r['code'] ?? $r['lang'] ?? ''));
			if ($code === '') continue;

			$name = (string)($r['name'] ?? $r['native_name'] ?? '');
			if ($name === '') $name = $code; // fallback
			$fallback = strtoupper((string)($r['fallback'] ?? $r['fallback_code'] ?? ''));

			$out[] = [
				'code' => $code,
				'name' => $name,
				'fallback' => $fallback,
				'isDefault' => in_array($code, $defaults, true),
			];
		}

		// Ensure defaults exist even if table minimal
		$ensure = [
			['code' => 'DE', 'name' => 'Deutsch', 'fallback' => '', 'isDefault' => true],
			['code' => 'EN', 'name' => 'English', 'fallback' => '', 'isDefault' => true],
			['code' => 'FR', 'name' => 'Français', 'fallback' => '', 'isDefault' => true],
			['code' => 'LU', 'name' => 'Lëtzebuergesch', 'fallback' => '', 'isDefault' => true],
		];
		$byCode = [];
		foreach ($out as $r) $byCode[$r['code']] = $r;
		foreach ($ensure as $d) if (!isset($byCode[$d['code']])) $byCode[$d['code']] = $d;

		return array_values($byCode);
	}

	/** Tiny flag helper (emoji as a simple stand-in) */
	function small_flag_emoji(string $code): string
	{
		// EN -> 🇬🇧 (use GB for EN); simple mapping
		$map = [
			'EN' => '🇬🇧',
			'DE' => '🇩🇪',
			'FR' => '🇫🇷',
			'LU' => '🇱🇺'
		];
		return $map[$code] ?? '🏳️';
	}

	/* =========================
	   OUTPUT (always JSON)
	========================= */
	function outputJSON()
	{
		global $returnData, $action, $myAuth;
		$returnData['loggedInName'] = $myAuth->username ?? '';
		if (!isset($returnData['action'])) $returnData['action'] = $action;

		$error = error_get_last();
		if (!empty($error)) {
			$documentRoot = filter_input(INPUT_SERVER, "DOCUMENT_ROOT");
			$file = str_replace($documentRoot, '', $error['file']);
			$returnData['fatalError'] =
				"<p>Fatal error [type {$error['type']}] on line {$error['line']} of<br>" .
				"<code class='tinyCode'>$file</code></p><p>{$error['message']}</p>";
		}
		header('Cache-Control: no-cache, must-revalidate');
		header('Content-type: application/json; charset=UTF-8');
		echo json_encode($returnData);
	}
