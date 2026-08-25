<?php
//the JSON output will happen, even if a fatal error prevents the script from finishing
	register_shutdown_function('outputJSON');
	require_once __DIR__ . "/inc/php/initBackend.php";
//action is a string that defines what action to perform
	$action = filter_input(INPUT_POST, 'action');
	if (!$action) {
		$action = "";
	}
//data is a JSON encoded associative array that contains all the necessary data for the action to be performed
//(the array must be manually JSON encoded before sending to get past max_input_vars limitation)
	$data = filter_input(INPUT_POST, 'data');
	if ($data) {
		$data = json_decode($data ?? '', true);
	}
	if (!$data) {
		$data = array();
	}

	require_once __DIR__ . '/../inc/php/mp4Info.php'; //wrapper around mp4Info functions (c.f. docs folder for manual)
	require_once __DIR__ . '/../inc/php/webmInfo.php'; //wrapper around webmInfo functions (c.f. docs folder for manual)

# ----------------------- #
# Translation Include #
# ----------------------- #
	require_once 'inc/php/uiLang.php'; // required for translation inclusion
	$uiLang = new uiLang($settings['interfaceLanguage']);

//all data that is returned by this script will be put into $returnData array which is sent back in JSON encoded form
	$returnData = array();
	$returnData['action'] = $action; //when returning we must specify which action was performed
	$returnData['error'] = false; //if there is an error, this will contain a string with the error message

//make a connection to the database and define the log file in which database errors are to be recorded
	$db = $app->getDatabaseInstance();

//call function whose name is given by the $action variable
//(the name of the function must obviously exactly match the string in $action)
//an action function will always be given the $data sent by the client, a pointer to the database object and a pointer to the global $returnData array
	if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
	$action($data, $db, $returnData);

	/*
	 * actions
	 */
	function fetchLibrary($data, rixPDO &$db, &$returnData): void
	{
		global $uiLang;
		checkParams($data, array('location'));
		$location = (int)$data['location'];
		if (igPresent($location, $db) === false) {
			$returnData['error'] = $uiLang->translate("The page group you were trying to add a media file has been deleted by another user. Please close the page group!");
			die();
		}
		$query = "SELECT CONCAT('t',id) as id, id as 'dbId', CONCAT('f', parent) as pid, filetype as type,`name`, name as label FROM media WHERE parent=?";
		$parameters = array($location);
		$results = $db->fetchTable($query, $parameters);
		$returnData['data']['list'] = $results['data'];
		$returnData['data']['loc'] = $location;
		if (isset($data['select'])) $returnData['data']['select'] = $data['select'];

	}

	function fetchLibraryTm($data, rixPDO &$db, &$returnData): void
	{
		global $uiLang;

		checkParams($data, ['location']);
		$testId = (int)$data['location'];

		// <OASYS_ROOT>/editor → eine Ebene darüber ist <OASYS_ROOT>
		$rootDir = realpath(__DIR__ . '/..');
		if ($rootDir === false) {
			$returnData['error'] = $uiLang->translate("Could not determine application root directory.");
			return;
		}

    	$dir = $rootDir . DIRECTORY_SEPARATOR . 'customContent' . DIRECTORY_SEPARATOR . $testId;

		$list = [];

		if (is_dir($dir)) {
			$dh = opendir($dir);
			if ($dh === false) {
				$returnData['error'] = $uiLang->translate("Could not open upload directory.");
				return;
			}

			// allowed image extensions in test manager
			$allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'avif'];

			while (($entry = readdir($dh)) !== false) {
				if ($entry === '.' || $entry === '..') {
					continue;
				}

				$path = $dir . DIRECTORY_SEPARATOR . $entry;
				if (!is_file($path)) {
					continue;
				}

				$base = pathinfo($entry, PATHINFO_FILENAME);
				$ext = strtolower(pathinfo($entry, PATHINFO_EXTENSION));

				// jQuery-sichere ID für DOM (keine Punkte, keine Sonderzeichen)
				$safeId = 'tm_' . preg_replace('/[^A-Za-z0-9_]/', '_', $entry);

				$list[] = [
					'id' => $safeId,      // NUR für DOM / filer.js
					'dbId' => $entry,       // echter Dateiname für Delete/Preview
					'name' => $base,        // ohne Extension
					'label' => $base,
					'pid' => 0,
					'type' => $ext          // 'jpg', 'png', 'svg', ...
				];

			}

			closedir($dh);

			// natural sorting by label
			usort($list, static function (array $a, array $b): int {
				return strnatcasecmp($a['label'], $b['label']);
			});
		}

		// Return **CMS-compatible** structure
		$returnData['data'] = [
			'list' => $list,
			'path' => [
				['id' => 1, 'name' => 'Home']   // required breadcrumbs format
			],
			'loc' => $testId
		];

		if (isset($data['select'])) {
			$returnData['data']['select'] = $data['select'];
		}

		// Ensure correct action name for JS switch()
		$returnData['action'] = 'fetchLibraryTm';
	}



	function upload($data, rixPDO &$db, &$returnData): void
	{
		$editorView = $_REQUEST['mediaTypes'];
		ini_set('max_execution_time', 1800);
		global $uiLang, $settings;
		if (isset($_REQUEST['location'])) {
			$location = $_REQUEST['location'];
			if (igPresent($location, $db) === false) {
				$returnData['error'] = $uiLang->translate("The page group you were trying to add a media file has been deleted by another user. Please close the page group!");
				die();
			}
		} else {
			$returnData['error'] = $uiLang->translate("No destination specified. Please try again. If the problem persists, please call the administrator!");
			die();
		}
		if (!is_uploaded_file($_FILES['userfile']['tmp_name'])) {
			$returnData['error'] = $uiLang->translate("Something went wrong, please call the administrator!");
			die();
		}

		$mediaLoc = $_FILES['userfile']['tmp_name'];
		$origName = $_FILES['userfile']['name'];
		$name = $_FILES['userfile']['name'];
		$size = $_FILES['userfile']['size'];
		$error = $_FILES['userfile']['error'];

		if ($error != 0) {
			$message = match ($error) {
				UPLOAD_ERR_INI_SIZE => $uiLang->translate("The uploaded file exceeds the upload_max_filesize directive in php.ini"),
				UPLOAD_ERR_FORM_SIZE => $uiLang->translate("The uploaded file exceeds the MAX_FILE_SIZE directive that was specified in the HTML form"),
				UPLOAD_ERR_PARTIAL => $uiLang->translate("The uploaded file was only partially uploaded"),
				UPLOAD_ERR_NO_FILE => $uiLang->translate("No file was uploaded"),
				UPLOAD_ERR_NO_TMP_DIR => $uiLang->translate("Missing a temporary folder"),
				UPLOAD_ERR_CANT_WRITE => $uiLang->translate("Failed to write file to disk"),
				UPLOAD_ERR_EXTENSION => $uiLang->translate("File upload stopped by extension"),
				default => $uiLang->translate("Unknown upload error"),
			};
			$returnData['error'] = $message;
			die();
		}
		$permitted = array('webp', 'webm', 'svg', 'avif', 'jpg', 'jpeg', 'png', 'gif', 'mp4', 'm4v', 'ogv', 'ogg', 'mp3', 'aac', 'wav', 'm4a');
		$ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
		if (!in_array($ext, $permitted)) {
			$returnData['error'] = "Error uploading file '$name': only files of type JPG, PNG, GIF, SVG, WEPB, AVIF, WEBM, MP3, AAC, WAV, M4A, MP4 and M4V may be uploaded.";
			$returnData['fileName'] = $origName;
			die();
		}

		$finfo = new finfo(FILEINFO_MIME_TYPE);
		$fileMime = $finfo->file($_FILES['userfile']['tmp_name']);
		//Removing file ext from name
		$name = preg_replace('/\\.[^.\\s]{3,4}$/', '', $name);
		// Determining file type and validating MIME type
		$validTypes = [
			'jpg' => ['image/jpg', 'image/jpeg'],
			'png' => ['image/png'],
			'gif' => ['image/gif'],
			'svg' => ['image/svg+xml'],
			'webp' => ['image/webp'],
			'avif' => ['image/avif', 'image/avif-sequence'],
			'webm' => ['video/webm', 'audio/webm'],
			'mp3' => ['audio/mpeg', 'audio/mp3', 'audio/m4a', 'audio/x-m4a'],
			'wav' => ['audio/wav', 'audio/x-wav'],
			'aac' => ['audio/aac', 'audio/x-aac', 'audio/aacp', 'audio/x-aacp', 'audio/x-hx-aac-adts'],
			'm4a' => ['audio/m4a', 'audio/x-m4a'],
			'mp4' => ['video/mp4', 'application/mp4', 'audio/x-mp4'],
			'm4v' => ['video/mp4', 'video/m4v', 'video/x-m4v', 'application/m4v'],
		];

		$fileShortType = false;
		if ($ext === 'jpeg') $ext = 'jpg';
		$mimeTypes = $validTypes[$ext];
		if (in_array($fileMime, $mimeTypes)) {
			$fileShortType = $ext; // Directly set to $ext as it matches
		} else {
			// MIME type doesn't match the expected ones for the given extension
			$returnData['error'] = $uiLang->translate("Error uploading file. File extension does not match the MIME type:") . "<br />$name: $ext -> $fileMime";
			$returnData['fileName'] = $origName;
			die();
		}

		if (!$fileShortType) {
			$returnData['error'] = $uiLang->translate("Your media file is broken or not supported. Please check the file and upload again!");
			$returnData['fileName'] = $origName;
			die();
		}

		$fileCat = match ($fileShortType) {
			'jpg', 'png', 'gif', 'svg', 'avif', 'webp' => 'image',
			'mp3', 'wav', 'aac', 'm4a', 'weba' => 'audio',
			'mp4', 'm4v', 'webm' => 'video',
			default => 'unknown',
		};
		// Refine for mp4/webm containers based on MIME (audio/* => audio, else video)
		if (in_array($fileShortType, ['mp4', 'webm'], true)) {
			if (str_starts_with($fileMime, 'audio/')) {
				$fileCat = 'audio';
			} else {
				$fileCat = 'video';
			}
		}
		$editorView = $_REQUEST['mediaTypes'] ?? 'all';
		if ($editorView !== 'all' && $fileCat !== $editorView) {
			$returnData['error'] =
				$uiLang->translate("The uploaded media file is of type") . " <strong>$fileCat</strong>. " .
				$uiLang->translate("This view only accepts") . " <strong>$editorView</strong> " .
				$uiLang->translate("files. Please switch to a corresponding interaction or the main media manager.");
			$returnData['fileName'] = $origName;
			die();
		}

		//Check if a media file with that name & type is already present in the selected "folder"
		$query = "SELECT COUNT(*) FROM media WHERE name=? and parent=? and filetype=?";
		$parameters = array($name, $location, $fileShortType);
		$results = $db->fetchValue($query, $parameters);

		if ($results['data'] != 0) {
			$returnData['error'] = $uiLang->translate('A media file with the same name and type already exists in this page group!');
			$returnData['fileName'] = $origName;
			die();
		}

		$targetDir = __DIR__ . "/../media/$location";
		if ($settings['mediaLocation'] === 'disk') {
			//check if folder already exists, if not try to create it
			if (!is_dir($targetDir)) {
				$res = mkdir($targetDir, 0775, true);

				if ($res === false) {
					$error = error_get_last();
					$returnData['error'] = $uiLang->translate("Creation of directory failed:") . " $targetDir<br><br>{$error['message']}";
					die();
				}
			}
		}

		//insert information into media table and create UUID
		$db->prepare("INSERT INTO media (parent, `name`, filetype, created, filesize, uuid) VALUES (?, ?, ?, NOW(), ?, UUID())");
		$params = array($location, $name, $fileShortType, $size);
		$results = $db->executePrepared($params);

		//get autoincrement id of newly created entry and move file with that name to target folder
		if (!$results['error']) {
			$id = $results['id'];

			$targetFile = null;
			if ($settings['mediaLocation'] === 'disk') {
				$targetFile = "$targetDir/$id.dat";

				if (!move_uploaded_file($mediaLoc, $targetFile)) {
					$returnData['error'] = $uiLang->translate("Error moving file into media folder");
					$db->execute("DELETE FROM media WHERE id = ?", [$id]); //clean up database since file could not be moved
					$returnData['fileName'] = $origName;
					die();
				}
			} elseif ($settings['mediaLocation'] === 'database') {
				$targetFile = $id;
				$db->insertFile("mediaFiles", ['id' => $id, 'data' => $mediaLoc], 'data');
			}

			if ($fileShortType === 'mp4') {
				try {
					$mp4 = new mp4Info($settings['mediaLocation'], $targetFile, $db);
					$type = $mp4->getType();
					if ($type === mp4Info::AUDIO) {
						$fileShortType = 'm4a';
						//Update db
						$db->prepare("UPDATE media SET filetype=? WHERE id=?");
						$params = array($fileShortType, $id);
						$db->executePrepared($params);
					}
				} catch (Exception $e) {
					$returnData['error'] = $e->getMessage();
				}
			}
			if ($fileShortType === 'webm') {
				try {
					$webm = new webmInfo($settings['mediaLocation'], $targetFile, $db);
					$type = $webm->getType();
					if ($type === mp4Info::AUDIO) {
						$fileShortType = 'weba';
						//Update db
						$db->prepare("UPDATE media SET filetype=? WHERE id=?");
						$params = array($fileShortType, $id);
						$db->executePrepared($params);
					}
				} catch (Exception $e) {
					$returnData['error'] = $e->getMessage();
				}
			}
		}
	}

	function uploadTm($data, rixPDO &$db, &$returnData): void
	{
		global $uiLang;

		ini_set('max_execution_time', 1800);

		//
		// 1) Resolve testId
		//
		$testId = 0;
		if (isset($_REQUEST['testId'])) {
			$testId = (int)$_REQUEST['testId'];
		} elseif (isset($data['testId'])) {
			$testId = (int)$data['testId'];
		}

		if ($testId <= 0) {
			$returnData['error'] = $uiLang->translate("No test specified for upload.");
			die();
		}

		//
		// 2) Basic upload validation
		//
		if (!isset($_FILES['userfile']) || !is_uploaded_file($_FILES['userfile']['tmp_name'])) {
			$returnData['error'] = $uiLang->translate("No file uploaded or temporary file missing.");
			die();
		}

		$tmpFile = $_FILES['userfile']['tmp_name'];
		$origName = $_FILES['userfile']['name'];
		$size = $_FILES['userfile']['size'];
		$error = $_FILES['userfile']['error'];

		if ($error !== UPLOAD_ERR_OK) {
			$returnData['error'] = $uiLang->translate("Upload error (code: %s)", $error);
			$returnData['fileName'] = $origName;
			die();
		}

		//
		// 3) Validate extension
		//
		$ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
    	if ($ext === 'jpeg') { $ext = 'jpg'; }

    	$allowedExts = ['jpg','png','gif','svg','webp','avif'];
		if (!in_array($ext, $allowedExts, true)) {
			$returnData['error'] =
				$uiLang->translate("Only image files (JPG, PNG, GIF, SVG, WEBP, AVIF) are allowed in this view.");
			$returnData['fileName'] = $origName;
			die();
		}

		//
		// 4) MIME type validation (same level of strictness as CMS upload)
		//
		$validMimes = [
			'jpg' => ['image/jpg', 'image/jpeg'],
			'png' => ['image/png'],
			'gif' => ['image/gif'],
			'svg' => ['image/svg+xml'],
			'webp' => ['image/webp'],
			'avif' => ['image/avif', 'image/avif-sequence']
		];

		$finfo = new finfo(FILEINFO_MIME_TYPE);
		$mime = $finfo->file($tmpFile);

		if (!in_array($mime, $validMimes[$ext], true)) {
			$returnData['error'] =
				$uiLang->translate("File extension does not match MIME type:") .
				"<br>$origName ($ext → $mime)";
			$returnData['fileName'] = $origName;
			die();
		}

		//
		// 5) Prepare upload target
    	//    <OASYS_ROOT>/customContent/<testId>
		//
		$rootDir = realpath(__DIR__ . '/..');
    	$targetDir = $rootDir . DIRECTORY_SEPARATOR . 'customContent' . DIRECTORY_SEPARATOR . $testId;

		if (!is_dir($targetDir)) {
			if (!mkdir($targetDir, 0770, true) && !is_dir($targetDir)) {
				$returnData['error'] = $uiLang->translate("Could not create upload directory.");
				die();
			}
		}

		//
		// 6) Sanitized final filename
		//
		$base = preg_replace('/[^a-zA-Z0-9_\-\.]+/', '_', pathinfo($origName, PATHINFO_FILENAME));
    	if ($base === '') { $base = 'img'; }

		$fileName = $base . '_' . time() . '.' . $ext;
		$targetFile = $targetDir . DIRECTORY_SEPARATOR . $fileName;

		//
		// 7) Move uploaded file
		//
		if (!move_uploaded_file($tmpFile, $targetFile)) {
			$returnData['error'] = $uiLang->translate("Could not move uploaded file.");
			$returnData['fileName'] = $origName;
			die();
		}

		//
		// 8) Image dimensions for preview panel
		//
		$width = null;
		$height = null;

		if ($ext !== 'svg') {
			$info = @getimagesize($targetFile);
			if ($info) {
				$width = $info[0];
				$height = $info[1];
			}
		}

		//
		// 9) Success response
		//
		$returnData['success'] = true;
		$returnData['data'] = [
			'fileName' => $fileName,
			'width' => $width,
			'height' => $height,
			'size' => $size,
			'testId' => $testId,
			'mime' => $mime
		];
	}



	function preview($data, rixPDO &$db, &$returnData): void
	{
		global $uiLang;
		checkParams($data, array('mediaFileId', 'location'));
		$mediaFileId = $data['mediaFileId'];
		$data['location'] = (int)$data['location'];
		if (igPresent($data['location'], $db) === false) {
			$returnData['error'] = $uiLang->translate("The page group you were trying to add a media file has been deleted by another user. Please close the page group!");
			die();
		}
		$query = "SELECT * FROM media WHERE id=? LIMIT 1";
		$parameters = array($mediaFileId);
		$results = $db->fetchRow($query, $parameters);
		//Show error message if selected mediafile is not availabe anymore
		if ($results['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("The mediafile you are trying to select has been deleted by another user. The view will be refreshed.");
			$returnData['reloadFolder'] = true;
			die();
		}

		$returnData['mediaFileId'] = $mediaFileId;
		$returnData['name'] = $results['data']['name'];
		$returnData['checksum'] = $results['data']['uuid'];
		$returnData['fileExt'] = $results['data']['filetype'];
		$returnData['created'] = $results['data']['created'];
		$returnData['size'] = $results['data']['filesize'];

		//Determining file type
		switch ($results['data']['filetype']) {
			case 'jpg':
			case 'jpeg':
				$returnData['filetype'] = 'image/jpg';
				break;
			case 'png':
				$returnData['filetype'] = 'image/png';
				break;
			case 'svg':
				$returnData['filetype'] = 'image/svg+xml';
				break;
			case 'avif':
				$returnData['filetype'] = 'image/avif';
				break;
			case 'webp':
				$returnData['filetype'] = 'image/webp';
				break;
			case 'gif':
				$returnData['filetype'] = 'image/gif';
				break;
			case 'mp3':
				$returnData['filetype'] = 'audio/mpeg';
				break;
			case 'wav':
				$returnData['filetype'] = 'audio/wav';
				break;
			case 'aac':
				$returnData['filetype'] = 'audio/aac';
				break;
			case 'weba':
				$returnData['filetype'] = 'audio/webm';
				break;
			case 'm4a':
				$returnData['filetype'] = 'audio/m4a';
				break;
			case 'mp4':
				$returnData['filetype'] = 'video/mp4';
				break;
			case 'webm':
				$returnData['filetype'] = 'video/webm';
				break;
			case 'm4v':
				$returnData['filetype'] = 'video/m4v';
				break;
		}
	}

	function previewTm($data, rixPDO &$db, &$returnData): void
	{
		global $uiLang;

		// mediaFileId = Dateiname (ohne Pfad), location = testId
		checkParams($data, ['mediaFileId', 'location']);

		$testId = (int)$data['location'];
		$fileId = (string)$data['mediaFileId'];
		$fileName = basename($fileId);

		// OASYS-Root: mediaActions.php liegt in <OASYS_ROOT>/editor
		$rootDir = realpath(__DIR__ . '/..');
		if ($rootDir === false) {
			$returnData['error'] = $uiLang->translate("Could not determine application root directory.");
			return;
		}

    	$filePath = $rootDir . DIRECTORY_SEPARATOR . 'customContent'
			. DIRECTORY_SEPARATOR . $testId
			. DIRECTORY_SEPARATOR . $fileName;

		if (!is_file($filePath)) {
			$returnData['error'] = $uiLang->translate("The media file you selected is no longer available. The view will be refreshed.");
			return;
		}

		$ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
		$baseName = pathinfo($fileName, PATHINFO_FILENAME);

		$size = filesize($filePath);
		$created = date('d.m.Y H:i', filemtime($filePath));

		// MIME-Typ nach Extension – im TM haben wir aktuell nur Bilder
		$mime = match ($ext) {
			'jpg', 'jpeg' => 'image/jpg',
			'png' => 'image/png',
			'gif' => 'image/gif',
			'svg' => 'image/svg+xml',
			'webp' => 'image/webp',
			'avif' => 'image/avif',
			default => 'application/octet-stream',
		};

		$returnData['success'] = true;
		$returnData['action'] = 'previewTm';
		$returnData['name'] = $baseName;
		$returnData['fileExt'] = $ext;
		$returnData['filetype'] = $mime;
		$returnData['size'] = $size;
		$returnData['created'] = $created;

		// Für die bestehende JS-Logik:
		// - mediaFileId = Dateiname
		// - checksum = Dummy, nur für Konsistenz
		$returnData['mediaFileId'] = $fileName;
		$returnData['checksum'] = md5($fileName . '|' . $size . '|' . $created);
	}



	function deleteSelection($data, rixPDO &$db, &$returnData): void
	{
		checkParams($data, ['location', 'selection']);
		$location = $data['location'];
		$selection = $data['selection'];
		$targetDir = __DIR__ . "/../media/$location";
		$returnData['FilesInUse'] = false;

		$deletableIds = [];
		$groupClauseParts = [];

		foreach ($selection as $row) {
			$id = $row['dbId'];

			// Check if the media file is in use
			$check = $db->fetchRow(
				"SELECT COUNT(*) AS occurrences FROM items
				 WHERE JSON_CONTAINS(JSON_EXTRACT(metadata, '$.mediaIds'), ?)
				    OR JSON_CONTAINS(JSON_EXTRACT(metadata, '$.mediaIds'), ?)",
				[json_encode((string)$id), json_encode((int)$id)]
			);

			if ((int)$check['data']['occurrences'] > 0) {
				$returnData['filesInUse'] = true;
				continue; // Skip deletion
			}

			// Collect for deletion
			$deletableIds[] = $id;
			$groupClauseParts[] = 'id=?';

			// Delete file on disk
			$targetPath = "$targetDir/{$id}.dat";
			if (file_exists($targetPath)) {
				unlink($targetPath);
			}
		}

		// Delete from database
		if (!empty($deletableIds)) {
			$groupClause = implode(' OR ', $groupClauseParts);
			$db->prepare("DELETE FROM media WHERE $groupClause");
			$db->executePrepared($deletableIds);
		}

		fetchLibrary($data, $db, $returnData);
	}

	function deleteSelectionTm($data, rixPDO &$db, &$returnData): void
	{
		global $uiLang;

		checkParams($data, ['location', 'selection']);

		$testId = (int)$data['location'];
		$selection = $data['selection'];

		// <OASYS_ROOT>/editor → real OASYS ROOT one level above
		$rootDir = realpath(__DIR__ . '/..');
		if ($rootDir === false) {
			$returnData['error'] = $uiLang->translate("Could not determine application root directory.");
			return;
		}

    	$dir = $rootDir . DIRECTORY_SEPARATOR . 'customContent' . DIRECTORY_SEPARATOR . $testId;

		if (!is_dir($dir)) {
			// Nothing to delete → still return updated, empty library
			$returnData['success'] = true;

			// Rebuild empty library
			fetchLibraryTm($data, $db, $returnData);
			$returnData['action'] = 'deleteSelectionTm';
			return;
		}

		$hadErrors = false;

		foreach ($selection as $item) {
			if (!isset($item['dbId'])) {
				continue;
			}

			$fileName = basename($item['dbId']);
			$path = $dir . DIRECTORY_SEPARATOR . $fileName;

			if (is_file($path)) {
				if (!@unlink($path)) {
					$hadErrors = true;
				}
			}
		}

		$returnData['success'] = !$hadErrors;
		if ($hadErrors) {
			$returnData['filesInUse'] = false; // for now: files on disk cannot be "in use"
			$returnData['error'] = $uiLang->translate("Some images could not be deleted.");
		}

		// IMPORTANT: rebuild the list exactly like CMS does
		fetchLibraryTm($data, $db, $returnData);

		// Set action so JS handles it in correct switch-case
		$returnData['action'] = 'deleteSelectionTm';
	}


	/**
	 * @throws Exception
	 */
	function deleteAll($data, rixPDO &$db, &$returnData): void
	{
		global $uiLang;
		checkParams($data, ['location', 'mediaType']);
		$location = $data['location'];
		$mediaType = $data['mediaType'];

		$returnData['FilesInUse'] = false;

		$fileTypes = match ($mediaType) {
			'image' => "('jpg', 'jpeg', 'png', 'svg', 'avif', 'webp', 'gif')",
			'audio' => "('mp3', 'aac', 'wav', 'm4a', 'weba')",
			'video' => "('mp4', 'm4v', 'webm')",
			'all' => "",
			default => throw new Exception("Invalid media type"),
		};

		$targetDir = __DIR__ . "/../media/$location";

		// Get list of media ids based on type
		if ($mediaType === 'all') {
			$sql = "SELECT id FROM media WHERE parent=?";
			$params = [$location];
		} else {
			$sql = "SELECT id FROM media WHERE parent=? AND filetype IN $fileTypes";
			$params = [$location];
		}
		$results = $db->fetchTable($sql, $params);
		$ids = array_column($results['data'], 'id');

		// Loop and check usage / delete
		$returnData['www'] = $ids;

		foreach ($ids as $id) {
			$check = $db->fetchRow(
				"SELECT COUNT(*) AS occurrences FROM items
				 WHERE JSON_CONTAINS(JSON_EXTRACT(metadata, '$.mediaIds'), ?)
				    OR JSON_CONTAINS(JSON_EXTRACT(metadata, '$.mediaIds'), ?)",
				[json_encode((string)$id), json_encode((int)$id)]
			);

			$returnData['www2'] = $check['data'];

			if ((int)$check['data']['occurrences'] > 0) {
				$returnData['filesInUse'] = true;
				continue;
			}

			$db->prepare("DELETE FROM media WHERE id=?");
			$db->executePrepared([$id]);

			$filePath = "$targetDir/$id.dat";
			if (file_exists($filePath)) {
				unlink($filePath);
			}
		}

		fetchLibrary($data, $db, $returnData);
	}

	function deleteAllTm($data, rixPDO &$db, &$returnData): void
	{
		global $uiLang;

		// location = testId, mediaType kommt von jsMediaPlugin (hier nur 'image' relevant)
		checkParams($data, ['location', 'mediaType']);
		$testId = (int)$data['location'];
		$mediaType = $data['mediaType'] ?? 'image';

		// Wir arbeiten nur mit Bildern – für andere Typen gibt es im Testmanager aktuell nichts
		$allowedExts = ['jpg', 'jpeg', 'png', 'svg', 'avif', 'webp', 'gif'];

		// OASYS-Root: mediaActions.php liegt in <OASYS_ROOT>/editor
		$rootDir = realpath(__DIR__ . '/..');
		if ($rootDir === false) {
			$returnData['error'] = $uiLang->translate("Could not determine application root directory.");
			return;
		}

    	$dir = $rootDir . DIRECTORY_SEPARATOR . 'customContent' . DIRECTORY_SEPARATOR . $testId;

		// Ordner existiert nicht → nichts zu löschen, nur leere Library zurückgeben
		if (!is_dir($dir)) {
			if (function_exists('fetchLibraryTm')) {
				$data['location'] = $testId;
				fetchLibraryTm($data, $db, $returnData);
			}
			return;
		}

		$hadErrors = false;

		$dh = opendir($dir);
		if ($dh === false) {
			$returnData['error'] = $uiLang->translate("Could not open upload directory.");
			return;
		}

		while (($entry = readdir($dh)) !== false) {
			if ($entry === '.' || $entry === '..') {
				continue;
			}

			$path = $dir . DIRECTORY_SEPARATOR . $entry;
			if (!is_file($path)) {
				continue;
			}

			$ext = strtolower(pathinfo($entry, PATHINFO_EXTENSION));

			// Nur Bilddateien löschen (und nur wenn mediaType image/all ist)
			if (!in_array($ext, $allowedExts, true)) {
				continue;
			}

			if (!@unlink($path)) {
				$hadErrors = true;
			}
		}

		closedir($dh);

		// Im Testmanager haben wir keinen "in use"-Check, alles ist filebasiert
		$returnData['filesInUse'] = false;

		if ($hadErrors) {
			// Optional, du kannst die Meldung auch weglassen, wenn du es still haben willst
			$returnData['error'] = $uiLang->translate("Some images could not be deleted.");
		}

		// Library wieder neu aufbauen (wie bei deleteAll im CMS über fetchLibrary)
		if (function_exists('fetchLibraryTm')) {
			$data['location'] = $testId;
			fetchLibraryTm($data, $db, $returnData);
		}
	}


	function renameMedia($data, rixPDO &$db, &$returnData): void
	{
		global $uiLang;
		checkParams($data, array('name', 'type', 'id', 'location'));

		$location = (int)$data['location'];
		if (igPresent($location, $db) === false) {
			$returnData['error'] = $uiLang->translate("The page group you were working in has been deleted by another user. Please close the page group!");
			die();
		}
		$id = (int)$data['id'];
		$newName = (string)$data['name'];
		$transactionStarted = false;
		$updatedInteractions = 0;
		try {
			if ($db->startTransaction() !== true) throw new RuntimeException('Could not start the media rename transaction.');
			$transactionStarted = true;

			// Lock and scope the media row to its page group so a concurrent rename/delete cannot intervene.
			$result = $db->fetchRow('SELECT id, filetype FROM media WHERE id=? AND parent=? LIMIT 1 FOR UPDATE', [$id, $location]);
			if (($result['rows'] ?? 0) !== 1) {
				$returnData['reloadFolder'] = true;
				throw new DomainException('The mediafile you are trying to rename has been deleted by another user. The view will be refreshed.');
			}

			$duplicate = $db->fetchValue('SELECT COUNT(*) FROM media WHERE name=? AND parent=? AND filetype=? AND id<>?', [$newName, $location, $data['type'], $id]);
			if ((int)($duplicate['data'] ?? 0) !== 0) {
				throw new DomainException('A mediafile with that name and type does already exist. Try using another name.');
			}

			mediaRenameAssertDbResult($db->update('media', ['name' => $newName], 'id=? AND parent=?', [$id, $location]), 'Could not rename the media file.');

			$pages = $db->fetchTable("SELECT id, blocks FROM items WHERE groupId=? AND blocks IS NOT NULL AND blocks<>'' FOR UPDATE", [$location]);
			mediaRenameAssertDbResult($pages, 'Could not inspect the interactions that use this media file.');
			foreach (($pages['data'] ?? []) as $page) {
				try {
					$pageBlocks = json_decode($page['blocks'], true, 512, JSON_THROW_ON_ERROR);
				} catch (JsonException) {
					// Preserve compatibility with unrelated legacy pages whose source cannot be decoded.
					continue;
				}
				if (!is_array($pageBlocks)) continue;
				$pageChanged = updateMediaInteractionFilenames($pageBlocks, $id, $newName, $updatedInteractions);
				if (!$pageChanged) continue;
				$encodedBlocks = json_encode($pageBlocks, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
				mediaRenameAssertDbResult($db->update('items', ['blocks' => $encodedBlocks], 'id=? AND groupId=?', [(int)$page['id'], $location]), 'Could not update a media interaction title.');
			}

			if ($db->commit() !== true) throw new RuntimeException('Could not complete the media rename.');
			$transactionStarted = false;
		} catch (Throwable $e) {
			if ($transactionStarted) $db->rollback();
			$returnData['error'] = $uiLang->translate($e->getMessage());
			return;
		}

		$returnData['renamedMedia'] = ['id' => $id, 'name' => $newName, 'groupId' => $location, 'updatedInteractions' => $updatedInteractions];
		$data['select'] = 't' . $id;
		fetchLibrary($data, $db, $returnData);
	}

	function updateMediaInteractionFilenames(array &$blocks, int $mediaId, string $newName, int &$updatedInteractions): bool
	{
		$pageChanged = false;
		foreach ($blocks as &$block) {
			if (!is_array($block) || !in_array($block['type'] ?? '', ['image', 'audio', 'video'], true)) continue;
			$fileIds = $block['fileid'] ?? null;
			if (!is_array($fileIds)) continue;
			$blockChanged = false;
			if (!isset($block['filename']) || !is_array($block['filename'])) $block['filename'] = [];
			foreach ($fileIds as $language => $fileId) {
				if ((string)$fileId !== (string)$mediaId) continue;
				if (($block['filename'][$language] ?? null) === $newName) continue;
				$block['filename'][$language] = $newName;
				$blockChanged = true;
			}
			if ($blockChanged) {
				$pageChanged = true;
				$updatedInteractions++;
			}
		}
		unset($block);
		return $pageChanged;
	}

	function mediaRenameAssertDbResult($result, string $message): void
	{
		if (!is_array($result) || !empty($result['error'])) throw new RuntimeException($message);
	}

	function renameMediaTm($data, rixPDO &$db, &$returnData): void
	{
		global $uiLang, $settings;

		// keep the same parameter naming as the existing renameMedia:
		checkParams($data, ['location', 'id', 'name']);

		$testId = (int)$data['location'];
		$oldName = $data['id'];        // existing file name
		$newName = $data['name'];      // desired new name (without enforcing extension)

		$rootDir = realpath(__DIR__ . '/..');
    	$dir = $rootDir . DIRECTORY_SEPARATOR . 'customContent' . DIRECTORY_SEPARATOR . $testId;


		if (!is_dir($dir)) {
			$returnData['error'] = $uiLang->translate("Upload directory not found.");
			return;
		}

		$oldPath = $dir . DIRECTORY_SEPARATOR . basename($oldName);

		// keep old extension, sanitize new base name
		$ext = strtolower(pathinfo($oldName, PATHINFO_EXTENSION));
		$base = preg_replace('/[^a-zA-Z0-9_\-\.]+/', '_', pathinfo($newName, PATHINFO_FILENAME));
		if ($base === '') {
			$base = 'img';
		}
		$newFileName = $base . '.' . $ext;
		$newPath = $dir . DIRECTORY_SEPARATOR . $newFileName;

		if (!is_file($oldPath)) {
			$returnData['error'] = $uiLang->translate("File not found.");
			return;
		}

		if (!rename($oldPath, $newPath)) {
			$returnData['error'] = $uiLang->translate("Could not rename file.");
			return;
		}

		$returnData['success'] = true;
		$returnData['data']['newName'] = $newFileName;
	}


	/*
	 * helper functions
	 */
//checks if item group is still present
	function igPresent($location, rixPDO &$db): bool
	{
		$query = "SELECT * FROM itemGroups WHERE id=? LIMIT 1";
		$parameters = array($location);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if parent folder is not availabe anymore
		if ($result['rows'] === 0) {
			return false;
		} else {
			return true;
		}
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
// all other errors (e.g. database) were registere under the 'error' key
	function outputJSON(): void
	{
		global $returnData, $action;
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
