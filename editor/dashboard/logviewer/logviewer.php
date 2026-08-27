<?php
// JSON-Ausgabe auch bei fatal errors
	register_shutdown_function('outputJSON');
	require_once __DIR__ . '/../../inc/php/initBackend.php';

	$action = filter_input(INPUT_POST, 'action');
	if (!$action) {
		$action = "";
	}

	$returnData = [];
	$returnData['data'] = [];
	$returnData['action'] = $action;
	$returnData['error'] = false;

# ----------------------- #
# Authentication Includes #
# ----------------------- #
	$pageName = "dashboard";
	$isSubMod = true;
	$isActionFile = true;
	require_once '../../inc/php/authCommonFunctions.php';

	$returnData = (array)$myAuth->returnData;

// wenn Auth Fehler -> sofort raus (wie Watchlist)
	if ($myAuth->returnData['error'] !== false) {
		exit;
	}
	if (!($myAuth->checkElevatedAdmin() || $myAuth->checkSA())) {
		$returnData['error'] = 'Unauthorized operation attempted.';
		exit;
	}


	$data = filter_input(INPUT_POST, 'data');
	if ($data) {
		$data = json_decode($data ?? '', true);
	}
	if (!$data) {
		$data = array();
	}

// Action-Dispatch (Funktionsname == $action)
	if ($action) {
		if (function_exists($action)) {
			if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
			$action($data, $db, $returnData, $myAuth);
		} else {
			// Unbekannte Action -> Fehlermeldung, aber nicht fatal
			$returnData['error'] = "Unknown action: " . htmlspecialchars($action);
		}
	}

	/*
	###############
	FUNCTIONS START
	###############
	*/
	function readLogs($data, rixPDO &$db, &$returnData, userAuth &$myAuth)
	{
		// Resolve logs directory (same as before)
		$logDir = realpath(__DIR__ . '/../../../logs');

		if (!$logDir || !is_dir($logDir)) {
			$returnData['error'] = "Log directory not found.";
			return;
		}

		// Optional whitelist of common log extensions
		$allowExt = ['log', 'txt', 'csv', 'json'];

		$files = [];
		if ($dh = opendir($logDir)) {
			while (($entry = readdir($dh)) !== false) {
				if ($entry === '.' || $entry === '..') {
					continue;
				}

				$path = $logDir . DIRECTORY_SEPARATOR . $entry;
				if (!is_file($path)) {
					continue;
				}

				$ext = strtolower(pathinfo($entry, PATHINFO_EXTENSION));
				if ($ext && !in_array($ext, $allowExt, true)) {
					continue;
				}

				$mtime = @filemtime($path) ?: 0;
				$size = @filesize($path) ?: 0;

				$files[] = [
					'name' => $entry,
					'mtime' => $mtime,
					'mtime_iso' => date('Y-m-d H:i:s', $mtime),
					'size' => $size,
					'size_h' => human_bytes((int)$size),
				];
			}
			closedir($dh);
		}

		// Newest first
		usort($files, function ($a, $b) {
			return $b['mtime'] <=> $a['mtime'];
		});

		$lastLoginISO = null;
		$lastLoginTS = null;

		$currentUserName = trim($myAuth->username ?? ($myAuth->name ?? ''));
		if ($currentUserName !== '') {
			// Only fetch the JSON column now
			$query = "SELECT activity FROM users WHERE name=? LIMIT 1";
			$row = $db->fetchRow($query, [$currentUserName]); // wrapper result: ['error','rows','data' => ['activity' => ...]]

			$useNow = true;
			if (!empty($row['data']) && array_key_exists('activity', $row['data'])) {
				$activityJson = $row['data']['activity'];

				if (!is_null($activityJson) && $activityJson !== '') {
					$activity = json_decode($activityJson, true);

					if (json_last_error() === JSON_ERROR_NONE && is_array($activity)) {
						$prev = $activity['authTimes']['previousStateLogin'] ?? null;

						// previousStateLogin can be false (bool) or "false" (string) -> treat as missing
						if ($prev && $prev !== 'false') {
							$ts = strtotime($prev);
							if ($ts !== false) {
								$lastLoginISO = date('Y-m-d H:i:s', $ts);
								$lastLoginTS = $ts;
								$useNow = false;
							}
						}
					}
				}
			}

			if ($useNow) {
				$now = time();
				$lastLoginTS = $now;
				$lastLoginISO = date('Y-m-d H:i:s', $now);
			}
		} else {
			// No username? fall back to now.
			$now = time();
			$lastLoginTS = $now;
			$lastLoginISO = date('Y-m-d H:i:s', $now);
		}

		// keep your files payload
		$returnData['data'] = $files;
		$returnData['lastLogin'] = $lastLoginISO;  // original DATETIME string
		$returnData['lastLoginTS'] = $lastLoginTS;   // unix seconds (or null)
	}


	function readLogFile($data, rixPDO &$db, &$returnData, userAuth &$myAuth)
	{
		$relPath = isset($data['path']) ? (string)$data['path'] : '';
		$limit = max(1, min(1000000, isset($data['limit']) ? (int)$data['limit'] : 200000));

		// Base logs dir
		$base = realpath(__DIR__ . '/../../../logs');
		if ($base === false) {
			$returnData['error'] = "Logs directory not found.";
			return;
		}

		// Resolve requested file safely inside logs
		$full = realpath($base . DIRECTORY_SEPARATOR . ltrim($relPath, "/\\"));
		if ($full === false || !str_starts_with($full, $base . DIRECTORY_SEPARATOR) || !is_file($full)) {
			$returnData['error'] = "Invalid log file path.";
			return;
		}

		// Read tail of file
		$size = filesize($full);
		if ($size <= 0) {
			// Empty file: return success with empty content, no fread on length 0
			$returnData['data'] = [
				'path' => basename($full),
				'fullPath' => substr($full, strlen($base) + 1),
				'size' => 0,
				'bytesReturned' => 0,
				'truncated' => false,
				'content' => ''
			];
			return;
		}
		$truncated = false;
		$bytesReturned = 0;
		$content = '';

		$fh = @fopen($full, 'rb');
		if ($fh === false) {
			$returnData['error'] = "Unable to open file.";
			return;
		}

		if ($size > $limit) {
			fseek($fh, $size - $limit);
			$content = fread($fh, $limit);
			$truncated = true;
		} else {
			$content = fread($fh, $size);
		}
		fclose($fh);

		// Ensure UTF-8 for JSON
		if (!mb_detect_encoding($content, 'UTF-8', true)) {
			$content = @mb_convert_encoding($content, 'UTF-8', 'UTF-8, ISO-8859-1, Windows-1252, auto');
		}
		$bytesReturned = strlen($content);

		$returnData['data'] = [
			'path' => basename($full),
			'fullPath' => substr($full, strlen($base) + 1),
			'size' => (int)$size,
			'bytesReturned' => (int)$bytesReturned,
			'truncated' => (bool)$truncated,
			'content' => $content
		];
	}

	function downloadLogFile($data, rixPDO &$db, &$returnData, userAuth &$myAuth)
	{
		global $suppressJsonOutput;
		$base = realpath(__DIR__ . '/../../../logs');
		$relPath = isset($data['path']) ? (string)$data['path'] : '';
		$full = $base === false ? false : realpath($base . DIRECTORY_SEPARATOR . ltrim($relPath, "/\\"));
		if ($base === false || $full === false || !str_starts_with($full, $base . DIRECTORY_SEPARATOR) || !is_file($full)) {
			$returnData['error'] = 'Invalid log file path.';
			return;
		}
		$suppressJsonOutput = true;
		$downloadName = preg_replace('/[^A-Za-z0-9._-]/', '_', basename($full)) ?: 'oasys.log';
		header('Content-Type: application/octet-stream');
		header('Content-Disposition: attachment; filename="' . $downloadName . '"');
		header('Content-Length: ' . filesize($full));
		header('Cache-Control: no-store');
		readfile($full);
		exit;
	}

	function clearLogFile($data, rixPDO &$db, &$returnData, userAuth &$myAuth)
	{
		// Validate input
		$relPath = isset($data['path']) ? trim($data['path']) : '';
		if ($relPath === '') {
			$returnData['error'] = "Missing path.";
			return;
		}

		// Resolve and restrict to logs directory
		$baseDir = realpath(__DIR__ . '/../../../logs');
		if ($baseDir === false) {
			$returnData['error'] = "Logs base directory not found.";
			return;
		}

		// Normalize target path inside logs
		$target = realpath($baseDir . DIRECTORY_SEPARATOR . ltrim($relPath, '/\\'));
		if ($target === false || !str_starts_with($target, $baseDir . DIRECTORY_SEPARATOR) || !is_file($target)) {
			$returnData['error'] = "Invalid log file path.";
			return;
		}

		if (!is_writable($target)) {
			$returnData['error'] = "Log file is not writable.";
			return;
		}

		// Truncate to 0 bytes
		$ok = @file_put_contents($target, '', LOCK_EX);
		if ($ok === false) {
			$returnData['error'] = "Could not clear the log file.";
			return;
		}

		clearstatcache(true, $target);
		$returnData['data'] = [
			'path' => $relPath,
			'fullPath' => $target,
			'size' => 0,
			'mtime' => @filemtime($target) ?: time()
		];
	}

// Convert bytes to human-readable format
	function human_bytes(int $bytes): string
	{
		$units = ['B', 'KB', 'MB', 'GB', 'TB'];
		$i = 0;
		while ($bytes >= 1024 && $i < count($units) - 1) {
			$bytes /= 1024;
			$i++;
		}
		return sprintf($i ? '%.1f %s' : '%d %s', $bytes, $units[$i]);
	}

	/*
	###############
	OUTPUT HANDLER
	###############
	*/
	function outputJSON()
	{
		global $returnData, $action, $myAuth, $suppressJsonOutput;
		if (!empty($suppressJsonOutput)) return;

		$returnData['loggedInName'] = $myAuth->username ?? '';

		if (!isset($returnData['action'])) {
			$returnData['action'] = $action;
		}

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
