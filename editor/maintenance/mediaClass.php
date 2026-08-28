<?php

namespace maintenance;

use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use rixPDO;
use uiLang;
use userAuth;

require_once(__DIR__ . "/../../inc/php/initSettings.php");

class mediaClass
{
	private array $returnData;
	private array $data;
	private rixPDO $db;
	private ?uiLang $uiLang;
	private ?userAuth $myAuth;
	private array $mediaLibrary;
	private string $mediaLocation;
	private string $mediaPath = __DIR__ . '/../../media';

	public function __construct(&$returnData, $data = [])
	{
		global $db, $uiLang, $myAuth, $settings;
		$this->returnData = &$returnData;
		$this->uiLang = &$uiLang;
		$this->myAuth = &$myAuth;
		$this->data = $data;

		//init database connections
		$this->db = $db;
		$this->fetchMediaLibrary();
		$this->mediaLocation = $settings['mediaLocation'];
	}

	public function execute($action): void
	{
		$allowedActions = ['verifyMediaAssets', 'consolidateMediaAssets', 'setMediaLocationToDisk', 'setMediaLocationToDatabase'];
		if (is_string($action) && in_array($action, $allowedActions, true)) {
			call_user_func([$this, $action]);
		} else {
			$this->returnData['error'] = 'Unknown or unsupported action.';
		}
	}

	private function fetchMediaLibrary(): void
	{
		$res = $this->db->fetchTable("SELECT id, `name`, filetype, parent, filesize, CONCAT('/', parent, '/', id, '.dat') as 'path' FROM media", [], 'id');
		$this->mediaLibrary = $res['data'];
	}

	private function fetchAssetListFromDisk(): array
	{
		$objects = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($this->mediaPath), RecursiveIteratorIterator::SELF_FIRST);
		$fileList = [];
		foreach ($objects as $name => $object) {
			if ($object->isFile() && $object->getExtension() === 'dat') {
				$fpath = "/" . str_replace($this->mediaPath . '/', '', $name);
				preg_match('/\/(\d+)\/(\d+)\.dat$/', $fpath, $matches);
				$groupId = $matches[1];
				$assetId = $matches[2];
				$fileList[$assetId] = [
					'path' => $fpath,
					'parent' => intval($groupId),
					'id' => intval($assetId)
				];
			}
		}
		return $fileList;
	}

	private function fetchListOfEmptyFolders(): array
	{
		$emptyDirectories = [];
		if (is_dir($this->mediaPath)) {
			$subdirectories = glob($this->mediaPath . '/*', GLOB_ONLYDIR);
			foreach ($subdirectories as $subdir) {
				$isEmpty = true;
				// Check if the directory is empty or contains only a .htaccess file
				$filesInSubdir = scandir($subdir);
				foreach ($filesInSubdir as $file) {
					if ($file !== '.' && $file !== '..' && $file !== '.htaccess') {
						$isEmpty = false;
						break;
					}
				}
				if ($isEmpty) {
					$emptyDirectories[] = $subdir;
				}
			}
		}
		return $emptyDirectories;
	}

	private function verifyMediaAssets(): void
	{
		//check if all media files from media table are present
		if (count($this->mediaLibrary) > 0) {
			foreach ($this->mediaLibrary as $media) {
				$fileExists = $this->fileExists($media['id'], $media['path']);
				if ($this->mediaLocation === 'disk') {
					if ($fileExists['disk'] === false) {
						if ($fileExists['database'] === true) {
							$this->returnData['log'][] = "Media file with id={$media['id']} found in database instead of disk [{$media['name']}][{$media['filetype']}]";
						} else {
							$this->returnData['log'][] = "Media file with id={$media['id']} neither found on disk nor in database [{$media['name']}][{$media['filetype']}]";
						}
					} else {
						if ($fileExists['database'] === true) {
							$this->returnData['log'][] = "Media file with id={$media['id']} found both in database and on disk [{$media['name']}][{$media['filetype']}]";
						}
						$size = $this->fileSizeDisk($media['path']);
						if ($size !== $media['filesize']) {
							$this->returnData['log'][] = "Media file with id={$media['id']} has wrong size on disk (expected: {$media['filesize']}, actual: $size) [{$media['name']}][{$media['filetype']}]";
						}
					}
				} elseif ($this->mediaLocation === 'database') {
					if ($fileExists['database'] === false) {
						if ($fileExists['disk'] === true) {
							$this->returnData['log'][] = "Media file with id={$media['id']} found on disk instead of database [{$media['name']}][{$media['filetype']}]";
						} else {
							$this->returnData['log'][] = "Media file with id={$media['id']} neither found on disk nor in database [{$media['name']}][{$media['filetype']}]";
						}
					} else {
						if ($fileExists['disk'] === true) {
							$this->returnData['log'][] = "Media file with id={$media['id']} found both in database and on disk [{$media['name']}][{$media['filetype']}]";
						}
						$size = $this->fileSizeDatabase($media['id']);
						if ($size !== $media['filesize']) {
							$this->returnData['log'][] = "Media file with id={$media['id']} has wrong size in database (expected: {$media['filesize']}, actual: $size) [{$media['name']}][{$media['filetype']}]";
						}
					}
				}
			}
		}

		//search for orphaned media files on disk and files in wrong folders
		$fileList = $this->fetchAssetListFromDisk();
		foreach ($fileList as $id => $file) {
			if (!isset($this->mediaLibrary[$id])) {
				//if no file with this id exists in media table
				$this->returnData['log'][] = "Orphaned media file with id=$id found on disk [{$file['path']}]";
			} else {
				//if file with this id exists in media table but is found in wrong folder …
				if ($file['parent'] !== $this->mediaLibrary[$id]['parent']) {
					if ($this->fileExists($id, $this->mediaLibrary[$id]['path'])['disk'] === true) {
						//… and is also found in correct folder
						$this->returnData['log'][] = "Extra copy of media file with id=$id found in wrong folder (expected: {$this->mediaLibrary[$id]['parent']}, actual: {$file['parent']}) [{$this->mediaLibrary[$id]['name']}][{$this->mediaLibrary[$id]['filetype']}]";
					} else {
						//… and is not found in correct folder
						$this->returnData['log'][] = "Media file with id=$id found in wrong folder (expected: {$this->mediaLibrary[$id]['parent']}, actual: {$file['parent']}) [{$this->mediaLibrary[$id]['name']}][{$this->mediaLibrary[$id]['filetype']}]";
					}
				}
			}
		}

		//search for empty folders
		$emptyDirectories = $this->fetchListOfEmptyFolders();
		foreach ($emptyDirectories as $emptyDirectory) {
			//remove media path prefix from path
			$emptyDirectory = str_replace($this->mediaPath, 'media', $emptyDirectory);
			$this->returnData['log'][] = "Empty media folder found on disk [$emptyDirectory]";
		}

		//check media folder permissions
		$this->checkMediaFolders(true);
	}

	private function consolidateMediaAssets(): void
	{
		//search for orphaned media files on disk and files in wrong folders
		$fileList = $this->fetchAssetListFromDisk();
		foreach ($fileList as $id => $file) {
			if (isset($this->mediaLibrary[$id]) === false) {
				$this->deleteFileFromDisk($file['path']);
				$this->returnData['log'][] = "Orphaned media file with id=$id has been deleted [{$file['path']}]";
			} else {
				if ($file['parent'] !== $this->mediaLibrary[$id]['parent']) {
					if ($this->fileExists($id, $this->mediaLibrary[$id]['path'])['disk'] === true) {
						$this->deleteFileFromDisk($file['path']);
						$this->returnData['log'][] = "Extra copy of media file with id=$id has been deleted [{$file['path']}]";
					} else {
						$res = $this->moveFileToFolder($file['path'], "/{$this->mediaLibrary[$id]['parent']}/{$file['id']}.dat");
						if ($res === true) {
							$this->returnData['log'][] = "Misplaced media file with id=$id moved from folder {$file['parent']} to folder {$this->mediaLibrary[$id]['parent']} [{$this->mediaLibrary[$id]['name']}][{$this->mediaLibrary[$id]['filetype']}]";
						} else {
							$this->returnData['log'][] = "Failed to move misplaced media file with id=$id from folder {$file['parent']} to folder {$this->mediaLibrary[$id]['parent']} [{$this->mediaLibrary[$id]['name']}][{$this->mediaLibrary[$id]['filetype']}]";
						}
					}
				}
			}
		}

		if (count($this->mediaLibrary) > 0) {
			foreach ($this->mediaLibrary as $media) {
				$fileExists = $this->fileExists($media['id'], $media['path']);
				if ($this->mediaLocation === 'disk') {
					if ($fileExists['disk'] === false) {
						if ($fileExists['database'] === true) {
							$res = $this->copyFileToDisk($media['path'], $media['id']);
							if ($res === true) {
								$this->returnData['log'][] = "Media file with id={$media['id']} moved from database to disk [{$media['name']}][{$media['filetype']}]";
								$this->deleteFileFromDatabase($media['id']);
							} else {
								$this->returnData['log'][] = "Failed to move media file with id={$media['id']} from database to disk [{$media['name']}][{$media['filetype']}]";
							}
						} else {
							$this->removeMediaEntry($media['id']);
							$this->returnData['log'][] = "Media file with id={$media['id']} was missing, entry removed from media table [{$media['name']}][{$media['filetype']}]";
						}
					} else {
						if ($fileExists['database'] === true) {
							$this->deleteFileFromDatabase($media['id']);
							$this->returnData['log'][] = "Media file with id={$media['id']} deleted from database [{$media['name']}][{$media['filetype']}]";
						}
						$size = $this->fileSizeDisk($media['path']);
						if ($size !== $media['filesize']) {
							$this->updateFileSize($media['id'], $size);
							$this->returnData['log'][] = "Corrected filesize for media file with id={$media['id']} [{$media['name']}][{$media['filetype']}]";
						}
					}
				} elseif ($this->mediaLocation === 'database') {
					if ($fileExists['database'] === false) {
						if ($fileExists['disk'] === true) {
							$res = $this->copyFileToDatabase($media['path'], $media['id']);
							if ($res === true) {
								$this->returnData['log'][] = "Media file with id={$media['id']} moved from disk to database [{$media['name']}][{$media['filetype']}]";
								$this->deleteFileFromDisk($media['path']);
							} else {
								$this->returnData['log'][] = "Failed to move media file with id={$media['id']} from disk to database [{$media['name']}][{$media['filetype']}]";
							}
						} else {
							$this->removeMediaEntry($media['id']);
							$this->returnData['log'][] = "Media file with id={$media['id']} was missing, entry removed from media table [{$media['name']}][{$media['filetype']}]";
						}
					} else {
						if ($fileExists['disk'] === true) {
							$this->deleteFileFromDisk($media['path']);
							$this->returnData['log'][] = "Media file with id={$media['id']} deleted from disk [{$media['name']}][{$media['filetype']}]";
						}
						$size = $this->fileSizeDatabase($media['id']);
						if ($size !== $media['filesize']) {
							$this->updateFileSize($media['id'], $size);
							$this->returnData['log'][] = "Corrected filesize for media file with id={$media['id']} [{$media['name']}][{$media['filetype']}]";
						}
					}
				}
			}
		}


		$emptyDirectories = $this->fetchListOfEmptyFolders();
		foreach ($emptyDirectories as $emptyDirectory) {
			//delete directory from disk
			$this->deleteDirectoryFromDisk($emptyDirectory);
			$this->returnData['log'][] = "Empty media folder deleted from disk [$emptyDirectory]";
		}

		//fix media folder permissions
		$this->checkMediaFolders();

	}

	//check if file exists on disk and in database
	private function fileExists($id, $path): array
	{
		$return = ['disk' => file_exists($this->mediaPath . $path), 'database' => false];
		$res = $this->db->fetchValue("SELECT id FROM mediaFiles WHERE id = :id", ['id' => $id]);
		if ($res['rows'] === 1) {
			$return['database'] = true;
		}
		return $return;
	}

	private function fileSizeDisk($path): int
	{
		return filesize($this->mediaPath . $path);
	}

	private function fileSizeDatabase($id): int
	{
		$res = $this->db->fetchValue("SELECT OCTET_LENGTH(data) FROM mediaFiles WHERE id = :id", ['id' => $id]);
		return $res['data'];
	}

	private function updateFileSize($id, $size): void
	{
		$this->db->execute("UPDATE media SET filesize = :size WHERE id = :id", ['id' => $id, 'size' => $size]);
	}

	private function removeMediaEntry($id): void
	{
		$this->db->execute("DELETE FROM media WHERE id = :id", ['id' => $id]);
	}

	private function deleteFileFromDatabase($id): void
	{
		$this->db->execute("DELETE FROM mediaFiles WHERE id = :id", ['id' => $id]);
	}

	private function deleteFileFromDisk($path): void
	{
		unlink($this->mediaPath . $path);
	}

	private function deleteDirectoryFromDisk(string $emptyDirectory): void
	{
		//delete .htaccess file if it exists
		if (file_exists($emptyDirectory . '/.htaccess')) {
			unlink($emptyDirectory . '/.htaccess');
		}
		//remove directory
		rmdir($emptyDirectory);
	}

	private function moveFileToFolder($sourcePath, $destinationPath): bool
	{
		if (!$this->createMediaFolder($destinationPath)) {
			return false;
		}
		return rename($this->mediaPath . $sourcePath, $this->mediaPath . $destinationPath);
	}

	private function createMediaFolder($path): bool
	{
		$targetDir = dirname($this->mediaPath . $path);
		if (!is_dir($targetDir)) {
			$res = mkdir($targetDir, 0775, true);

			if ($res === false) {
				$error = error_get_last();
				$returnData['log'] = "Creation of directory failed: $targetDir -> {$error['message']}";
				return false;
			}
		}
		return true;
	}

	private function copyFileToDatabase($path, $id): bool
	{
		if (!str_starts_with($path, '/')) {
			$path = '/' . $path;
		}
		$mediaLocation = $this->mediaPath . $path;
		$res = $this->db->insertFile("mediaFiles", ['id' => $id, 'data' => $mediaLocation], 'data');
		if ($res['error'] !== false) {
			$this->returnData['log'][] = "Error copying file to database: {$res['error']}";
			return false;
		}
		return true;
	}

	private function copyFileToDisk($path, $id): bool
	{
		if (!str_starts_with($path, '/')) {
			$path = '/' . $path;
		}
		$mediaLocation = $this->mediaPath . $path;
		$this->createMediaFolder($path);
		$res = $this->db->fetchValue("SELECT data FROM mediaFiles WHERE id = :id", ['id' => $id]);
		$res = file_put_contents($mediaLocation, $res['data']);
		if ($res === false) {
			$this->returnData['log'][] = "Error copying file to disk!";
			return false;
		}
		return true;
	}

	private function setMediaLocationToDatabase(): void
	{
		$this->setMediaLocation('database');
	}

	private function setMediaLocationToDisk(): void
	{
		$this->setMediaLocation('disk');
	}

	private function setMediaLocation($location): void
	{
		$this->mediaLocation = $location;
		if ($location === 'disk') {
			$this->db->execute("DELETE FROM settings WHERE `option` = 'mediaLocation'");
		} elseif ($location === 'database') {
			$this->db->insert("settings", ['option' => 'mediaLocation', 'value' => 'database'], 'update', ['value']);
		}
	}

	private function checkMediaFolders($simulate = false): void
	{
		$mediaFolders = $this->fetchListOfMediaFolders();
		foreach ($mediaFolders as $mediaFolder) {
			// The effective permissions depend on ownership, ACLs, the process umask,
			// and (for bind mounts) the host filesystem. Check the capability OASYS
			// actually needs instead of requiring one exact numeric mode.
			if (!is_writable($mediaFolder)) {
				if ($simulate) {
					$this->returnData['log'][] = "Media folder is not writable [$mediaFolder]";
					continue;
				}

				if (chmod($mediaFolder, 0775) && is_writable($mediaFolder)) {
					$this->returnData['log'][] = "Changed permissions for media folder [$mediaFolder]";
				} else {
					$this->returnData['log'][] = "Failed to make media folder writable [$mediaFolder]";
				}
			}
		}
	}

	private function fetchListOfMediaFolders(): array
	{
		//get all subfolders of media folder
		$mediaFolders = glob($this->mediaPath . '/*', GLOB_ONLYDIR);
		return $mediaFolders;
	}

}
