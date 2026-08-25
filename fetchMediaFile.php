<?php

	global $filterSettings;
	$filterSettings = true;

	require_once __DIR__ . '/inc/php/initSettings.php';
	require_once __DIR__ . '/inc/php/OasysFrontendState.php';
	require_once __DIR__ . '/editor/inc/php/OasysBackendState.php';
	require_once __DIR__ . '/editor/inc/php/MediaTool.php';

	use Oasys\frontend\OasysFrontendState;
	use Oasys\backend\OasysBackendState;
	use Oasys\OasysSettings;

	$config = OasysSettings::getInstance();
	$settings =& $config->getSettingsArray();

	$active = OasysFrontendState::stateIdActive();

	if (!$active) {
		if (OasysBackendState::browserHasActiveState()) {
			/*  the browser has a cookie for backend and the
				state in the database is still active, so
				now we need to check if it is also logged in */
			$backendState = OasysBackendState::getInstance();
			if (isset($backendState->editor_active)) {
				$active = $backendState->editor_active;
			}
		}

		/* fetching a media file is only allowed when logged into the
		front end or editor of OASYS in order to prevent link sharing */
		if (!$active) {
			http_response_code(401);
			die();
		}
	}

	$fileid = filter_input(INPUT_GET, 'fileid', FILTER_SANITIZE_NUMBER_INT);
	if (!$fileid) {
		http_response_code(404);
		die();
	}

	$checksum = filter_input(INPUT_GET, 'checksum');
	if (!$checksum) {
		http_response_code(403);
		die();
	}

	$mediaInformation = MediaTool::getFileInformation($fileid, $checksum);

	if (!$mediaInformation) {
		header("HTTP/1.1 404 Not Found");
		header("Cache-Control: no-store, must-revalidate");
		exit;
	}

	$fileType = $mediaInformation['filetype'];
	$modTime = $mediaInformation['modTime'];
	$size = $mediaInformation['filesize'];
	$name = $mediaInformation['name'];
	$parent = $mediaInformation['parent'];
	$path = __DIR__ . "/media/$parent/$fileid.dat";

	$mimeType = MediaTool::getMimeType($fileid, $checksum, $mediaInformation);

	/*
	 * get hash of the file to use as ETag and send 404 if file not found
	 */

	$etag = MediaTool::getETag($fileid, $checksum, $mediaInformation);
	if (!$etag) {
		header("HTTP/1.1 404 Not Found");
		header("Cache-Control: no-store, must-revalidate");
		exit;
	}

	/*
	 * cache related stuff
	 */
	ob_start();

	// Check ETag for revalidation
	if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
		http_response_code(304);
		exit;
	}

	// Check Last-Modified header
	if (isset($_SERVER['HTTP_IF_MODIFIED_SINCE']) && strtotime($_SERVER['HTTP_IF_MODIFIED_SINCE']) >= strtotime($modTime)) {
		http_response_code(304);
		exit;
	}

	ob_end_clean();

	/*
	 * set headers
	 */
	header("Content-Type: $mimeType");
	header("Cache-Control: max-age=0, must-revalidate, public");
	header("Expires: " . gmdate('D, d M Y H:i:s', time() + 2592000) . ' GMT');
	header("Last-Modified: " . $modTime);
	header("ETag: \"$etag\"");
	$start = 0;
	$end = $size - 1;
	$length = $size;
	header("Accept-Ranges: 0-" . $end);

	if (isset($_SERVER['HTTP_RANGE'])) {

		$c_start = $start;
		$c_end = $end;

		list(, $range) = explode('=', $_SERVER['HTTP_RANGE'], 2);
		if (str_contains($range, ',')) {
			header('HTTP/1.1 416 Requested Range Not Satisfiable');
			header("Content-Range: bytes $start-$end/$size");
			exit;
		}
		if ($range == '-') {
			$c_start = $size - substr($range, 1);
		} else {
			$range = explode('-', $range);
			$c_start = $range[0];

			$c_end = (isset($range[1]) && is_numeric($range[1])) ? $range[1] : $c_end;
		}
		$c_end = ($c_end > $end) ? $end : $c_end;
		if ($c_start > $c_end || $c_start > $size - 1 || $c_end >= $size) {
			header('HTTP/1.1 416 Requested Range Not Satisfiable');
			header("Content-Range: bytes $start-$end/$size");
			exit;
		}
		$start = $c_start;
		$end = $c_end;
		$length = $end - $start + 1;
		header('HTTP/1.1 206 Partial Content');
		header("Content-Length: " . $length);
		header("Content-Range: bytes $start-$end/" . $size);
	} else {
		header("Content-Length: " . $size);
	}

	$data = MediaTool::getMediaRange($fileid, $path, $start, $length);
	if ($data) {
		echo $data;
	} else {
		header("HTTP/1.1 404 Not Found");
		header("Cache-Control: no-store, must-revalidate");
		exit;
	}
