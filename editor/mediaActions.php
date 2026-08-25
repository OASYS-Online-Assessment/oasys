<?php
	//the JSON output will happen, even if a fatal error prevents the script from finishing
	register_shutdown_function('outputJSON');
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

	require_once 'inc/php/database.php'; //contains the database connection credentials
	require_once '../inc/php/rixPDO.php'; //wrapper around PDO functions (c.f. docs folder for manual)
	require_once '../inc/php/mp4Info.php'; //wrapper around mp4Info functions (c.f. docs folder for manual)
	require_once '../inc/php/webmInfo.php'; //wrapper around webmInfo functions (c.f. docs folder for manual)
	require_once '../inc/php/settings.php';

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
	$db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, '../logs/mediaManager_errors.txt', 1, $returnData, 'error');

	//call function whose name is given by the $action variable
	//(the name of the function must obviously exactly match the string in $action)
	//an action function will always be given the $data sent by the client, a pointer to the database object and a pointer to the global $returnData array
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
			die();
		}

		if (!$fileShortType) {
			$returnData['error'] = $uiLang->translate("Your media file is broken or not supported. Please check the file and upload again!");
			die();
		}

		//Check if a media file with that name & type is already present in the selected "folder"
		$query = "SELECT COUNT(*) FROM media WHERE name=? and parent=? and filetype=?";
		$parameters = array($name, $location, $fileShortType);
		$results = $db->fetchValue($query, $parameters);

		if ($results['data'] != 0) {
			$returnData['error'] = $uiLang->translate('A media file with the same name and type already exists in this page group!');
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

			//Trigger notification if media file is different to current editor view
			$fileCat = match ($fileShortType) {
				'jpg', 'png', 'gif', 'svg', 'avif', 'webp' => 'image',
				'mp3', 'wav', 'aac', 'm4a', 'weba' => 'audio',
				'mp4', 'm4v', 'webm' => 'video',
				default => 'unknown',
			};
			if ($fileCat !== $editorView && $editorView !== 'all') {
				$returnData['viewNote'] =
					$uiLang->translate("The uploaded media file is of type") .
					" <strong>$fileCat</strong>, " .
					$uiLang->translate("but your current media browser view is set to") .
					" <strong>$editorView</strong>. " .
					$uiLang->translate("Please switch to a corresponding interaction or the main media manager to see the uploaded file.");
			}
		}
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
            "SELECT COUNT(*) AS occurrences FROM items WHERE JSON_CONTAINS(JSON_EXTRACT(metadata, '$.mediaIds'), ?)",
            [json_encode((string)$id)]
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
    $returnData['www']=$ids;

    foreach ($ids as $id) {
        $check = $db->fetchRow(
            "SELECT COUNT(*) AS occurrences FROM items WHERE JSON_CONTAINS(JSON_EXTRACT(metadata, '$.mediaIds'), ?)",
            [json_encode((string)$id)]
        );

        $returnData['www2']=$check['data'];

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


function renameMedia($data, rixPDO &$db, &$returnData): void
	{
		global $uiLang;
		checkParams($data, array('name', 'type', 'id', 'location'));

		$location = $data['location'];
		if (igPresent($location, $db) === false) {
			$returnData['error'] = $uiLang->translate("The page group you were working in has been deleted by another user. Please close the page group!");
			die();
		}
		$id = $data['id'];
		$newName['name'] = $data['name'];
		$table = "media";
		//Check if mediafile has been deleted or removed by another user
		$query = "SELECT * FROM media WHERE id=? LIMIT 1";
		$parameters = array($id);
		$result = $db->fetchRow($query, $parameters);

		//Show error message if selected mediafile is not availabe anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("The mediafile you are trying to rename has been deleted by another user. The view will be refreshed.");
			$returnData['reloadFolder'] = true;
			die();
		}
		//verify if a mediafile with that name already exists
		$query = "SELECT COUNT(*) as isPresent, id FROM media WHERE name=? and parent=? and filetype=?";
		$parameters = array($newName['name'], $location, $data['type']);
		$results = $db->fetchRow($query, $parameters);
		// if the name is already in use:
		if ($results['data']['isPresent'] != 0) {
			//allow cosmetic renaming
			if ($results['data']['id'] !== $id) {
				$returnData['error'] = $uiLang->translate("A mediafile with that name and type does already exist. Try using another name.");
				die();
			}
		}
		$db->update($table, $newName, 'id=?', array($id));
		$data['select'] = 't' . $id;
		fetchLibrary($data, $db, $returnData);
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
