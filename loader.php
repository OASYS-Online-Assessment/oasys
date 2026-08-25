<?php

	//action is a string that defines what action to perform
	$action = filter_input(INPUT_GET, 'action') ?? filter_input(INPUT_POST, 'action');
	if (!$action) {
		$action = "";
	}

	if ($action !== 'loadMediaFiles') {
		register_shutdown_function('outputJSON'); //this will always be called when the script ends even if a fatal error occurred
	}

	//data is a JSON encoded associative array that contains all the necessary data for the action to be performed
	//(the array must be manually JSON encoded before sending to get past max_input_vars limitation)
	$data = filter_input(INPUT_GET, 'data') ?? filter_input(INPUT_POST, 'data');
	if ($data) {
		$data = json_decode($data ?? '', true);
	}
	if (!$data) {
		$data = array();
	}

	global $filterSettings;
	global $allowCache;
	$filterSettings = true;
	$allowCache = true; //allow caching of the loader data

	require_once 'inc/php/database.php'; //contains the database connection credentials
	require_once 'inc/php/rixPDO.php'; //wrapper around PDO functions (c.f. docs folder for manual)
	require_once 'inc/php/settings.php';
	require_once 'inc/php/settingsCommonFunctions.php';
	require_once 'editor/inc/php/MediaTool.php';

	//all data that is returned by this script will be put into $returnData array which is sent back in JSON encoded form
	$returnData = array();
	$returnData['action'] = $action; //when returning we must specify which action was performed
	$returnData['error'] = false; //if there is an error, this will contain a string with the error message

	$db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, __DIR__ . '/logs/loader_errors.txt');
	$results = $db->results();
	if ($results['error']) {
		$returnData['error'] = 'mySQL connection error';
		die();
	}

	$manifest = [];
	$eTag = '';
	$action($data, $db, $returnData);

	/*
	 * actions
	 */

	//the $db and $returnData variables MUST be given by reference
	function load(array $data, rixPDO &$db, array &$returnData): void
	{
		global $manifest;
		global $eTag;
		global $allowCache;
		checkParams($data, array('type', 'mode'));

		if ($data['type'] === 'switchMode') {
			if ($data['mode'] === 'login' && isset($data['landingPagePath'])) {
				getManifest($data['mode'], ['landingPagePath' => $data['landingPagePath']]);
			} elseif ($data['mode'] === 'test') {
				checkParams($data, array('skinPath'));
				getManifest($data['mode'], ['skinPath' => $data['skinPath']]);
			} else {
				if ($data['mode'] === 'global') {
					//in global mode we must disallow caching, as it transfers settings which is prone to change
					$allowCache = false;
				}
				getManifest($data['mode']);
			}
		} else {
			$returnData['error'] = 'unknown type: ' . $data['type'];
			exit();
		}

		//create a hash of the manifest to check if it has changed
		$manifestHash = sha1(print_r($manifest, true));
		$dateHash = '';
		foreach ($manifest as $entry) {
			//concatenate file modification dates of all files in the manifest
			if (isset($entry['url'])) {
				$path = $entry['url'];
				if (isset($entry['path'])) {
					$path = $entry['path'] . $entry['url'];
				} elseif (str_starts_with($path, '/')) {
					$path = substr($path, 1);
				}
				if (file_exists($path)) {
					$dateHash .= filemtime($path);
				}
			}
		}
		$dateHash = sha1($dateHash);
		$eTag = '"' . $manifestHash . $dateHash . '"';

		//if browser cache is still up to date, do not send data
		if ($allowCache === true && isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $eTag) {
			http_response_code(304);
			exit;
		}

		header("Content-Type: application/json; charset=UTF-8");
		header("Cache-Control: max-age=0, must-revalidate, public");
		header("ETag: $eTag");

		//load all files in the manifest
		foreach ($manifest as $entry) {
			if ($entry['type'] === 'text') {
				checkParams($entry, array('mode'));
				$query = "SELECT variable, language, text FROM l10n WHERE context=? AND text<>''";
				$db->prepare($query);
				$db->fetchPrepared(array($entry['mode']), 'column', 'variable', 'language');
				$results = $db->results();
				if ($results['error']) {
					$returnData['error'] = $results['error'];
					die();
				}
				$mode = $entry['mode'];
				$fname = "text/$mode.json";
				$text = [];
				if (file_exists($fname)) {
					$text = file_get_contents($fname);
					$text = json_decode($text ?? '', true);
				}
				foreach ($results['data'] as $k => $values) {
					foreach ($values as $lng => $value) {
						$text[$k][$lng] = $value;
					}
				}
				$output = ['details' => $entry, 'contents' => $text];
				$returnData['data'][] = $output;
			} else if ($entry['type'] === 'data') {
				checkParams($entry, array('request'));
				$output = ['details' => $entry, 'contents' => []];
				foreach ($entry['request'] as $request) {
					fetchData($request, $db, $output['contents']);
				}
				$returnData['data'][] = $output;
			} else if ($entry['type'] === 'skinProperties') {
				checkParams($entry, array('url'));
				$url = $entry['url'];
				$contents = json_decode(file_get_contents($url));
				$returnData['skinProperties'] = $contents->properties;
			} else {
				checkParams($entry, array('url'));
				$url = $entry['url'];
				if (isset($entry['path'])) {
					$url = $entry['path'] . $url;
				} elseif (str_starts_with($url, '/')) {
					//if we are loading a file from the root directory, we must remove the leading slash
					$url = substr($url, 1);
				}
				if ($entry['type'] === 'html') {
					$entry['target'] = $entry['target'] ?? 'contentWrapper';
				}
				$output = ['details' => $entry];
				$output['details']['path'] = dirname($url) . '/';
				/*	Base64 encoding the file contents and send it back to the client.
					The encoding is only strictly necessary for fonts, but we do it for all file types
					to keep things simple. */
				if ($entry['type'] === 'css') {
					$contents = prefixCssUrls($url);
				} else {
					$contents = file_get_contents($url);
				}
				if ($entry['type'] === 'html' && !empty($data['landingPagePath'])) {
					prependImgSrcPath($contents, $data['landingPagePath']);
				}

				$output['contents'] = base64_encode($contents);
				$returnData['data'][] = $output;
			}
		}
	}

	function fetchData($request, &$db, &$contents): void
	{
		/* @var $db rixPDO */
		switch ($request) {

			case 'skins':

				$contents['skins'] = getSkins();
				break;

			case 'settings':
				global $settings;

				/* not all settings must be sent to front end out of security concerns */
				$contents['settings']['loginLanguage'] = $settings['loginLanguage'];
				$contents['settings']['passwordField'] = $settings['passwordField'];
				$contents['settings']['defaultPassword'] = $settings['defaultPassword'];
				$contents['settings']['allowContextMenu'] = $settings['allowContextMenu'];
				$contents['settings']['debugSystem'] = $settings['debugSystem'];
				$contents['settings']['developmentMode'] = $settings['developmentMode'];
				$contents['settings']['rootURL'] = $settings['rootURL'];
				$contents['settings']['landingPage'] = $settings['landingPage'];
				$contents['settings']['title'] = $settings['title'];
				$contents['settings']['sendFrequency'] = $settings['sendFrequency'];
				$contents['settings']['ajaxTimeout'] = $settings['ajaxTimeout'];
				$contents['settings']['retryCount'] = $settings['retryCount'];
				$contents['settings']['customLoginURL'] = $settings['customLoginURL'];
				if (isset($settings['menuLanguages'])) {
					$contents['settings']['menuLanguages'] = $settings['menuLanguages'];
				} else {
					$contents['settings']['menuLanguages'] = false;
				}
				break;

			case 'languages':
				//fetch supported languages
				$query = "SELECT * FROM languages";
				$languages = $db->fetchTable($query, [], 'code');
				$contents['languages'] = $languages['data'];
				break;
		}
	}


	function getManifest($mode, $info = []): void
	{
		global $manifest;
		$manifest[] = ['type' => 'text', 'mode' => $mode];

		switch ($mode) {
			case 'global':
				$manifest[] = ['type' => 'text', 'mode' => 'languages'];
				$manifest[] = ['type' => 'data', 'request' => ['settings', 'languages', 'skins'], 'unload' => false];
				$manifest[] = ['url' => 'inc/js/jsKeyboardHandler.js', 'type' => 'js', 'unload' => false];
				$manifest[] = ['url' => 'inc/js/he.js', 'type' => 'js', 'unload' => false];
				$manifest[] = ['url' => 'inc/fonts/opensans.css', 'type' => 'css', 'unload' => false];
				$manifest[] = ['url' => 'inc/css/global.css', 'type' => 'css', 'unload' => false];
				$manifest[] = ['url' => 'inc/js/global.js', 'type' => 'js', 'onReady' => 'global_init', 'unload' => false];
				$manifest[] = ['url' => 'images/connectionLost.svg', 'type' => 'image', 'unload' => false];
				$manifest[] = ['url' => 'inc/fonts/ttf/OpenSans-VariableFont_wdth,wght.ttf', 'type' => 'font', 'unload' => false];
				$manifest[] = ['url' => 'inc/fonts/ttf/OpenSans-Italic-VariableFont_wdth,wght.ttf', 'type' => 'font', 'unload' => false];
				break;
			case 'login':
				if (!empty($info['landingPagePath'])) {
					$landingPagePath = $info['landingPagePath'];
					//read loaderManfiest.json file if it exist in the path
					$manifestFile = $landingPagePath . 'loaderManifest.json';
					$manifestFileEntries = [];
					if (file_exists($manifestFile)) {
						$manifestFileContent = file_get_contents($manifestFile);
						$manifestFileContent = json_decode($manifestFileContent ?? '', true);
						if ($manifestFileContent) {
							foreach ($manifestFileContent as $entry) {
								if (isset($entry['url'])) {
									$manifestFileEntries[$landingPagePath . $entry['url']] = $entry;
								}
							}
						}
					}
					//add all files from folder to manifest if their type can be identified
					foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($landingPagePath)) as $file) {
						if ($file->isFile()) {
							$url = $file->getPathname();
							/* if the loaderManifest.json file contains an entry for this file, use it otherwise enter
							   otherwise add the file to the manifest without any additional info */
							if (isset($manifestFileEntries[$url])) {
								$entry = $manifestFileEntries[$url];
								$entry['url'] = $url;
								$manifest[] = $entry;
							} else {
								$type = getTypeByName($url);
								if ($type !== 'unknown') {
									$manifest[] = ['url' => $url, 'type' => $type, 'unload' => true];
								}
							}
						}
					}
				} else {
					$manifest[] = ['url' => 'inc/css/login.css', 'type' => 'css', 'unload' => true];
					$manifest[] = ['url' => 'inc/html/login.snippet', 'type' => 'html', 'target' => 'contentWrapper', 'unload' => true];
					$manifest[] = ['url' => 'inc/js/login.js', 'type' => 'js', 'onReady' => 'login_init', 'unload' => true];
					$manifest[] = ['url' => 'images/OASYS_logo_vertical_color-10.svg', 'type' => 'image', 'unload' => true];
					$manifest[] = ['url' => 'images/LUCET.svg', 'type' => 'image', 'unload' => true];
				}
				break;
			case 'test':
				$manifest[] = ['url' => 'inc/css/test.css', 'type' => 'css', 'unload' => true];
				$manifest[] = ['url' => 'images/connectionLost.svg', 'type' => 'image', 'unload' => true];
				$manifest[] = ['url' => 'inc/js/butler.js', 'type' => 'js', 'flag' => 'butler', 'unload' => true];
				$manifest[] = ['url' => 'inc/js/scripting.js', 'type' => 'js', 'flag' => 'scripting', 'unload' => true];
				$manifest[] = ['url' => 'inc/js/timer.js', 'type' => 'worker'];
				$manifest[] = ['url' => 'inc/js/queue.js', 'type' => 'worker'];
				$manifest[] = ['url' => 'inc/js/core.js', 'type' => 'js', 'flag' => 'core', 'unload' => true, 'onReady' => 'core_init', 'onUnload' => 'core_cleanup'];
				$manifest[] = ['url' => 'inc/mejs/mediaelementplayer.min.css', 'type' => 'css', 'unload' => false];
				$manifest[] = ['url' => 'inc/mejs/mediaelement-and-player.min.js', 'type' => 'js', 'unload' => false];
				$manifest[] = ['url' => 'inc/jsMultipleChoice/jsMultipleChoice.css', 'type' => 'css', 'unload' => false];
				$manifest[] = ['url' => 'inc/jsMultipleChoice/jsMultipleChoice.js', 'type' => 'js', 'flag' => 'jsMultipleChoice', 'unload' => false];
				$manifest[] = ['url' => 'inc/jsDragAndDrop/jsDragAndDrop.css', 'type' => 'css', 'unload' => false];
				$manifest[] = ['url' => 'inc/jsDragAndDrop/jsDragAndDrop.js', 'type' => 'js', 'flag' => 'dragAndDropJS', 'initFunction' => 'jsDNDManager.init', 'unload' => false];
				$manifest[] = ['url' => 'inc/jsDropList/jsDropList.css', 'type' => 'css', 'unload' => false];
				$manifest[] = ['url' => 'inc/jsDropList/jsDropList.js', 'type' => 'js', 'flag' => 'jsDropList', 'unload' => false];

				//add widgets
				addFolderContentsToManifest('inc/jsMultipleChoice');
				addFolderContentsToManifest('inc/jsDragAndDrop');
				addFolderContentsToManifest('inc/jsDropList');

				//add all CSS and JS files from the plugins folder
				addFolderContentsToManifest('plugins');

				//add all files from skin folder and its subfolders except ones without a recognized type
				addFolderContentsToManifest($info['skinPath']);

				//add properties.json file for skin
				$propertiesFile = $info['skinPath'] . 'properties.json';
				if (file_exists($propertiesFile)) {
					$manifest[] = ['url' => $propertiesFile, 'type' => 'skinProperties', 'unload' => true];
				}

				break;

			case 'score':
				$manifest[] = ['url' => 'inc/css/score.css', 'type' => 'css', 'unload' => true];
				$manifest[] = ['url' => 'inc/js/score.js', 'type' => 'js', 'onReady' => 'score_init', 'unload' => true];
				break;

			case 'error':
				$manifest[] = ['url' => 'inc/css/error.css', 'type' => 'css', 'unload' => true];
				$manifest[] = ['url' => 'inc/html/error.snippet', 'type' => 'html', 'target' => 'contentWrapper', 'unload' => true];
				$manifest[] = ['url' => 'inc/js/error.js', 'type' => 'js', 'onReady' => 'error_init', 'unload' => true];
				$manifest[] = ['url' => 'images/smiley_crying.png', 'type' => 'image', 'unload' => true];
				break;

			case 'dashboard':
				$manifest[] = ['url' => 'inc/css/index.css', 'type' => 'css', 'unload' => false];
				$manifest[] = ['url' => 'inc/css/dashboard.css', 'type' => 'css', 'unload' => false];
				$manifest[] = ['url' => 'inc/html/dashboard.snippet', 'type' => 'html', 'target' => 'contentWrapper', 'unload' => true];
				$manifest[] = ['url' => 'inc/js/DashboardTestItem.js', 'type' => 'js', 'unload' => true];
				$manifest[] = ['url' => 'inc/js/dashboard.js', 'type' => 'js', 'onReady' => 'dashboard_init', 'unload' => true];

		}
	}

	function addFolderContentsToManifest($path): void
	{
		global $manifest;
		foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($path)) as $file) {
			if ($file->isFile()) {
				$url = $file->getPathname();
				$type = getTypeByName($url);
				if ($type !== 'unknown') {
					$manifest[] = ['url' => $url, 'type' => $type, 'unload' => true];
				}
			}
		}
	}

	function getTypeByName(string $url): string
	{
		$extension = pathinfo($url, PATHINFO_EXTENSION);
		return match ($extension) {
			'css' => 'css',
			'js' => 'js',
			'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif' => 'image',
			'woff', 'woff2', 'ttf', 'otf' => 'font',
			'html', 'snippet' => 'html',
			default => 'unknown',
		};
	}

	function prependImgSrcPath(string &$html, string $path): void
	{
		$html = preg_replace_callback(
			'#<img\b[^>]*\bsrc\s*=\s*["\']?([^"\'>\s]+)["\']?[^>]*>#i',
			function ($matches) use ($path) {
				$src = $matches[1];
				// If it's already absolute, leave it
				if (preg_match('#^(https?:)?//#i', $src)) {
					return $matches[0];
				}
				$newSrc = rtrim($path, '/') . '/' . ltrim($src, '/');
				return str_replace($src, $newSrc, $matches[0]);
			},
			$html
		);
	}

	function prefixCssUrls($url): array|string|null
	{
		// Read the CSS file
		$css = file_get_contents($url);
		if ($css === false) {
			return null;
		}

		// Determine the base path for relative URLs
		$base = dirname($url);
		$base = rtrim($base, '/') . '/';

		// Regex to match url(...) patterns
		$pattern = '/url\(\s*([\'"]?)(?![a-z]+:|\/)([^\'")]+)\1\s*\)/i';

		// Replace callback to prefix the path
		$css = preg_replace_callback($pattern, function ($matches) use ($base) {
			$quote = $matches[1] ?: '';
			$relativePath = $matches[2];
			$prefixedPath = $base . $relativePath;
			return "url($quote$prefixedPath$quote)";
		}, $css);

		return $css;
	}

	function loadMediaFiles(array $data, rixPDO &$db, array &$returnData): void
	{
		global $eTag;

		//loading media files in the background can take a long time, so we need to set a longer timeout
		set_time_limit(300); // 5 minutes timeout
		checkParams($data, array('mediaFiles'));
		$list = $data['mediaFiles'];
		if (!is_array($list) || count($list) == 0) {
			$returnData['error'] = 'No media files to load!';
			return;
		}
		//concatenate all mediaId properties into a comma separated string in ascending order
		$mediaIds = array();
		foreach ($list as $item) {
			if (isset($item['id']) && is_numeric($item['id'])) {
				$mediaIds[] = $item['id'];
			}
		}

		//sort the array
		sort($mediaIds, SORT_NUMERIC);

		//if there are no mediaIds, return an error
		if (count($mediaIds) == 0) {
			$returnData['error'] = 'No media files to load!';
			return;
		}
		$mediaIds = implode(',', $mediaIds);

		//create etag for the media files
		$query = "SELECT SHA1(GROUP_CONCAT(id, created)) as etag FROM media WHERE id IN ($mediaIds)";
		$res = $db->fetchValue($query);
		if (!$res) {
			$returnData['error'] = 'Error fetching etag!';
			return;
		}
		$eTag = '"' . $res['data'] . '"';

		//if browser cache is still up to date, do not send data
		if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $eTag) {
			http_response_code(304);
			exit;
		}

		header("Content-Type: application/json; charset=UTF-8");
		header("Cache-Control: max-age=0, must-revalidate, public");
		header("ETag: $eTag");

		//calculate and set Content-Length header
		$length = 52; // initial length for '{"action":"loadMediaFiles","sender":"OASYS","data":{'
		$first = true;
		$mediaTool = new mediaTool();
		foreach ($list as $item) {
			if (!$first) {
				$length += 1; // comma
			}
			$first = false;
			$length += strlen($item['id']) + 28; // for '"id":{"mimeType":"","data":""}'
			$length += strlen($mediaTool->getMimeType($item['id'], $item['checksum'] ?? ''));
			// estimate base64 length
			$mediaSize = $mediaTool->getFileSize($item['id'], $item['checksum'] ?? '');
			$base64Size = 4 * ceil($mediaSize / 3);
			$length += $base64Size;
		}
		$length += 2; // closing braces '}}'
		header("Content-Length: $length");

		$out  = fopen('php://output', 'wb');
		echo '{"action":"loadMediaFiles","sender":"OASYS","data":{';

		//fetch the media files from disk or database
		$mediaTool = new mediaTool();
		$first = true;
		foreach ($list as $item) {
			if (!$first) {
				echo ',';
			}
			$first = false;
			echo '"' . $item['id'] . '":{"mimeType":"';
			echo $mediaTool->getMimeType($item['id'], $item['checksum'] ?? '');
			echo '","data":"';
			if (function_exists('ob_flush')) @ob_flush();
			flush();

			// Apply base64 stream filter
			$filter = stream_filter_append(
				$out,
				'convert.base64-encode',
				STREAM_FILTER_WRITE,
				['line-length' => 0] // no line breaks
			);

			$mediaTool->getMediaStream($item['id'], $item['checksum'] ?? '', $out);

			//remove base64 filter in order to output JSON info correctly
			stream_filter_remove($filter);
			echo '"}';
		}
		echo '}}';
	}


	//checks if mandatory data is present
	function checkParams(&$data, $params): void
	{
		global $returnData;
		if (!$params || count($params) == 0) {
			return;
		}
		foreach ($params as $key) {
			if (!isset($data[$key])) {
				$returnData['error'] = "Error: missing parameter '$key'!";
				die();
			}
		}
	}

	/*
	 * This is used to encode associative arrays to JSON string in order to save it to the database.
	 * If an empty array is sent, PHP will not recognize that it should be an associative array
	 * and thus encode it as a normal array which will end up as an Array rather than an Object
	 * when decoded in Javascript, which will cause problems.
	 * That's why it uses the JSON_FORCE_OBJECT flag to force empty arrays to be encoded as Objects rather than Arrays.
	 *
	 * Usage example:
	 *		encodeData($data, array('options', 'settings'));
	 *
	 * In this example we are sending the $data array by reference and tell it to replace the contents of the
	 * key 'options' and the key 'settings' by their respective JSON encoded forms.
	 */
	function encodeData(&$data, $params): void
	{
		if (!$params || count($params) == 0) {
			return;
		}
		foreach ($params as $key) {
			if (isset($data[$key])) {
				$data[$key] = json_encode($data[$key], JSON_FORCE_OBJECT);
			}
		}
	}


	// this will always be called when the script ends even if a fatal error occurred
	// it encodes the $returnData to JSON and it adds an error message if a fatal PHP error occurred
	// this error message is registered under the 'fatalError' key and includes the file name of the PHP script and the line number of the error
	// all other errors (e.g. database) were registered under the 'error' key
	function outputJSON(): void
	{
		global $returnData, $action, $eTag;
		if (!isset($returnData['action'])) $returnData['action'] = $action;
		$returnData['sender'] = 'OASYS';
		$error = error_get_last();
		if (!empty($error)) {
			$documentRoot = filter_input(INPUT_SERVER, "DOCUMENT_ROOT");
			$file = str_replace($documentRoot, '', $error['file']);
			$returnData['fatalError'] = "<p>Fatal error [type {$error['type']}] on line {$error['line']} of<br><code class='tinyCode'>$file</code></p><p>{$error['message']}</p>";
		}

		// Check if headers have already been sent
		if (!headers_sent()) {
			header("Content-Type: application/json; charset=UTF-8");
			header("Cache-Control: max-age=0, must-revalidate, public");
			if (!empty($eTag)) {
				header("ETag: $eTag");
			}
		}

		echo json_encode($returnData);
	}