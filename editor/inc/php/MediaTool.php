<?php

	/* MediaTool v1.2
	 * This class is used to parse blocks for media ids, fetch media file information, and handle media files.
	 * It is used in the OASYS front end to load media files and in the editor to parse blocks for media ids.
	 *
	 * changelog:
	 * v1.0: initial version
	 * v1.1: added loader functions for front end
	 * v1.2: added functionality for replacing media ids in blocks
	 */

	require_once __DIR__ . "/../../../inc/php/valueFormats.php";
	require_once __DIR__ . "/../../../inc/php/settings.php";
	require_once __DIR__ . "/../../../inc/php/rixPDO.php";
	require_once __DIR__ . "/../../../inc/php/db_credentials.php";

	class MediaTool
	{
		private static ?rixPDO $static_db = null;
		private array $languages = [];
		private string $mediaRegex = '/fetchMediaFile\.php\?(?:fileid=(\d+)(?:&|&amp;)checksum=[0-9a-fA-F-]+|checksum=[0-9a-fA-F-]+(?:&|&amp;)fileid=(\d+))/';
		private array $defaultValues = [];
		private stdClass $mediaData;
		private array $errors = [];

		public function __construct()
		{
			/* read the manifest.json from the interactions folder */
			try {
				$manifestFile = __DIR__ . "/../../interactions/manifest.json";
				if (file_exists($manifestFile)) {
					$manifest = json_decode(file_get_contents($manifestFile), true, 512, JSON_THROW_ON_ERROR);
				} else {
					$this->errors[] = "MediaTool: manifest file not found.";
					return;
				}
				/* read the default values for each interaction
					1. iterate through the entries of the paths array in the manifest to establish the paths to the defaultValues.json files
					2. read the defaultValues.json files and store them in $this->defaultValues array under the interaction name
				*/
				foreach ($manifest['paths'] as $interaction => $folder) {
					$defaultValuesFile = __DIR__ . "/../../interactions/$folder/$interaction/defaultValues.json";
					if (file_exists($defaultValuesFile)) {
						$defaultValues = file_get_contents($defaultValuesFile);
						$defaultValues = json_decode($defaultValues, true, 512, JSON_THROW_ON_ERROR);
						if (is_array($defaultValues)) {
							$this->defaultValues[$interaction] = $defaultValues;
						} else {
							$this->errors[] = "Default values for interaction '$interaction' are not valid JSON.";
						}
					} else {
						$this->errors[] = "Default values file for interaction '$interaction' not found.";
					}
				}
			} catch (JsonException $e) {
				$this->errors[] = "Error parsing manifest or default values: " . $e->getMessage();
			}
		}

		public function parseBlocks($blocks, $languages, $includePaths = false): stdClass
		{
			$this->errors = [];
			$this->mediaData = new stdClass();

			try {
				if (is_array($blocks)) {
					$blocks = deepCopy($blocks);
				} else {
					$blocks = json_decode($blocks ?? '[]', false, 512, JSON_THROW_ON_ERROR);
				}

				if (is_array($languages)) {
					$this->languages = $languages;
				} else {
					$this->languages = json_decode($languages ?? '[]', false, 512, JSON_THROW_ON_ERROR);
				}
			} catch (JsonException $e) {
				$this->errors[] = "Error parsing blocks or languages: " . $e->getMessage();
				return $this->mediaData;
			}

			$this->mediaData->mediaIds = [];
			if ($includePaths) {
				$this->mediaData->paths = [];
			}

			foreach ($blocks as $block) {
				$this->extractMediaIds($block, $includePaths);
			}

			// remove duplicates
			$this->mediaData->mediaIds = array_values(array_unique($this->mediaData->mediaIds));
			return $this->mediaData;
		}

		private function extractMediaIds($block, $includePaths = false): void
		{
			$defaultValues = $this->defaultValues[$block->type] ?? [];
			foreach ($defaultValues as $row) {
				// check if the row has 'parseForMedia' string in flags property
				if (isset($row['flags']) && is_array($row['flags']) && in_array('parseForMedia', $row['flags'], true)) {
					// if so, check the block's property that corresponds to the row path property and parse it for media ids
					$id = $block->id ?? null;
					//prefix path with interaction id if the context is not 'parsed'
					if ($row['context'] !== 'parsed' && $id !== null) {
						$pathPrefix = [$id];
					} else {
						$pathPrefix = [];
					}
					$path = $row['path'] ?? [];
					if (!empty($path)) {
						//dig into the block to find the property
						$blockProperty = $block;
						foreach ($path as $blockKey) {
							if (isset($blockProperty->$blockKey)) {
								$blockProperty = $blockProperty->$blockKey;
							} else {
								// if the property does not exist, skip to the next row
								continue 2;
							}
						}
						// now we have the block property, parse it for media ids
						$this->parseForMediaId($blockProperty, $row['context'], $includePaths, $path, $row['contextPath'], $pathPrefix);
					}
				} elseif (isset($row['flags']) && is_array($row['flags']) && in_array('isMediaId', $row['flags'], true)) {
					// if the row has 'isMediaId' flag, check the block's property that corresponds to the row path property
					$path = $row['path'] ?? [];
					if (!empty($path)) {
						//dig into the block to find the property
						$blockProperty = $block;
						foreach ($path as $blockKey) {
							if ($row['localized'] === true && isset($blockProperty->$blockKey)) {
								/* if $row is localized, add all sub-properties as media ids if they are numeric */
								foreach ($blockProperty->$blockKey as $lang => $value) {
									if (is_numeric($value)) {
										$this->mediaData->mediaIds[] = $value;
										if ($includePaths) {
											// if includePaths is true, we have to parse
											$fileChecksum = $block->filechecksum->$lang;
											$obj = new stdClass();
											$obj->context = $row['context'] ?? null;
											$id = $block->id ?? null;
											if ($obj->context === 'parsed' || $id === null) {
												$obj->path = [...$row['contextPath'] ?? [], $lang];
											} else {
												$obj->path = [$id,...$row['contextPath'] ?? [], $lang];
											}
											$obj->mediaId = $value;
											$obj->string = "fetchMediaFile.php?fileid=$value&checksum=$fileChecksum";
											$obj->checksum = $fileChecksum;
											$this->mediaData->paths[] = $obj;
										}
									}
								}
							} else {
								/*
								 the property should always be localized … if it is not, it is most likely a bug in the
								 block structure, so we disregard this case for now
								*/
							}
						}
					}
				}
			}
		}

		private function parseForMediaId($blockProperty, $context, $includePaths = false, $path = [], $contextPath = [], $pathPrefix = []): void
		{
			if (is_string($blockProperty)) {
				preg_match_all($this->mediaRegex, $blockProperty, $matches);
				if (empty($matches[0])) {
					// no media ids found, return
					return;
				}

				$matchCount = count($matches[0]);
				for ($i = 0; $i < $matchCount; $i++) {
					if (!empty($matches[1]) && $matches[1][$i] !== '') {
						$this->mediaData->mediaIds[] = $matches[1][$i];
						if ($includePaths) {
							// if includePaths is true, add the path to the mediaData object
							$obj = new stdClass();
							$obj->context = $context;
							$obj->path = $contextPath === null ? null : [...$pathPrefix, ...$contextPath];
							$obj->mediaId = $matches[1][$i];
							$obj->string = $matches[0][$i];
							// extract checksum from the string if it exists
							if (preg_match('/checksum=([0-9a-fA-F-]+)/', $matches[0][$i], $checksumMatches)) {
								$obj->checksum = $checksumMatches[1];
							} else {
								$obj->checksum = null; // or handle as needed
							}
							$this->mediaData->paths[] = $obj;
						}
					} elseif (!empty($matches[2]) && $matches[2][$i] !== '') {
						$this->mediaData->mediaIds[] = $matches[2][$i];
						if ($includePaths) {
							// if includePaths is true, add the path to the mediaData object
							$obj = new stdClass();
							$obj->context = $context;
							$obj->path = $contextPath === null ? null : [...$pathPrefix, ...$contextPath];
							$obj->mediaId = $matches[2][$i];
							$obj->string = $matches[0][$i];
							// extract checksum from the string if it exists
							if (preg_match('/checksum=([0-9a-fA-F-]+)/', $matches[0][$i], $checksumMatches)) {
								$obj->checksum = $checksumMatches[1];
							} else {
								$obj->checksum = null; // or handle as needed
							}
							$this->mediaData->paths[] = $obj;
						}
					}
				}
			} elseif (is_array($blockProperty) || is_object($blockProperty)) {
				foreach ($blockProperty as $key => $subProperty) {
					$this->parseForMediaId($subProperty, $context, $includePaths, [...$path, $key], $contextPath === null ? null : [...$contextPath, $key], $pathPrefix);
				}
			}
		}

		public function replaceMediaIds(&$blocks, $idTable): void
		{
			foreach ($blocks as $block) {
				$defaultValues = $this->defaultValues[$block->type] ?? [];
				foreach ($defaultValues as $row) {
					if (!isset($row['flags']) || !is_array($row['flags'])) {
						continue;
					}
					if (in_array('parseForMedia', $row['flags'], true)) {
						$path = $row['path'] ?? [];
						if (!empty($path)) {
							//dig into the block to find the property
							$blockProperty = &$block;
							foreach ($path as $blockKey) {
								if (isset($blockProperty->$blockKey)) {
									$blockProperty = &$blockProperty->$blockKey;
								} else {
									// if the property does not exist, skip to the next row
									continue 2;
								}
							}
							// now we have the block property, parse it for media ids to replace
							$blockProperty = $this->replaceMediaURLs($blockProperty, $idTable);
						}
					} elseif (in_array('isMediaId', $row['flags'], true)) {
						// if the row has 'isMediaId' flag, check the block's property that corresponds to the row path property
						$path = $row['path'] ?? [];
						$uuidPath = $row['uuidPath'] ?? [];
						if (!empty($path)) {
							//dig into the block to find the property
							$blockProperty = &$block;
							foreach ($path as $blockKey) {
								if (isset($blockProperty->$blockKey)) {
									$blockProperty = &$blockProperty->$blockKey;
								} else {
									// if the property does not exist, skip to the next row
									continue 2;
								}
							}
							$uuidProperty = &$block;
							foreach ($uuidPath as $blockKey) {
								if (isset($uuidProperty->$blockKey)) {
									$uuidProperty = &$uuidProperty->$blockKey;
								} else {
									// if the property does not exist, skip to the next row
									continue 2;
								}
							}

							if ($row['localized'] === true) {
								foreach ($blockProperty as $lang => $value) {
									if (is_numeric($value)) {
										$blockProperty->$lang = $idTable[$value]['id'] ?? '';
										$uuidProperty->$lang = $idTable[$value]['uuid'] ?? '';
									}
								}
							}
						}
					}
				}
			}
		}

		public function replaceMediaURLs($property, $idTable): string|array|object {
			foreach ($idTable as $k => $row) {
				$oldId = $row['oldId'] ?? null;
				$newId = $row['id'] ?? null;
				$oldUuid = $row['oldUuid'] ?? null;
				$newUuid = $row['uuid'] ?? null;
				if ($oldId === null || $newId === null || $oldUuid === null || $newUuid === null) {
					continue;
				}
				$regex = "/fetchMediaFile\.php\?(?:fileid=$oldId(?:&|&amp;)checksum=$oldUuid|checksum=$oldUuid(?:&|&amp;)fileid=$oldId)/";
				$replacement = "fetchMediaFile.php?fileid=$newId&checksum=$newUuid";
				$property = $this->recursiveReplaceString($property, $regex, $replacement);
			}
			return $property;
		}

		private function recursiveReplaceString($property, $regex, $replacement): string|array|object {
			if (is_string($property)) {
				return preg_replace($regex, $replacement, $property);
			} elseif (is_array($property)) {
				foreach ($property as $key => $subProperty) {
					$property[$key] = $this->recursiveReplaceString($subProperty, $regex, $replacement);
				}
				return $property;
			} elseif (is_object($property)) {
				foreach ($property as $key => $subProperty) {
					$property->$key = $this->recursiveReplaceString($subProperty, $regex, $replacement);
				}
				return $property;
			} else {
				return $property;
			}
		}

		public function hasErrors(): bool
		{
			return !empty($this->errors);
		}

		public function getErrors(): array
		{
			return $this->errors;
		}

		public function getMediaData(): stdClass
		{
			return $this->mediaData;
		}

		public function getFileInformation($fileid, $checksum): array|bool
		{
			$db = self::getDataBase();

			$query = "SELECT filetype, UNIX_TIMESTAMP(created) as modTime, filesize, `name`, parent FROM media WHERE id = ? AND uuid = ?";
			$results = $db->fetchRow($query, array($fileid, $checksum));
			if ($results['error'] || $results['rows'] < 1) {
				return false;
			}

			return $results['data'];
		}

		public function getFileSize($fileid, $checksum, $mediaInformation = null): bool|int
		{
			$db = self::getDataBase();
			global $settings;

			if (!$mediaInformation) {
				$mediaInformation = $this->getFileInformation($fileid, $checksum);
				if (!$mediaInformation) {
					return false;
				}
			}

			return $mediaInformation['filesize'];
		}

		public function getMimeType($fileid, $checksum, $mediaInformation = null): bool|string
		{
			if (!$mediaInformation) {
				$mediaInformation = $this->getFileInformation($fileid, $checksum);
				if (!$mediaInformation) {
					return false;
				}
			}

			return match ($mediaInformation['filetype']) {
				'svg' => 'image/svg+xml',
				'png' => 'image/png',
				'gif' => 'image/gif',
				'jpg' => 'image/jpeg',
				'webp' => 'image/webp',
				'avif' => 'image/avif',
				'wav' => 'audio/wav',
				'mp3' => 'audio/mpeg',
				'aac' => 'audio/aac',
				'm4a' => 'audio/mp4',
				'weba' => 'audio/webm',
				'webm' => 'video/webm',
				'm4v', 'mp4' => 'video/mp4',
				default => 'application/octet-stream',
			};
		}

		public function fileExists($fileid, $checksum, $mediaInformation = null): bool
		{
			$db = self::getDataBase();
			global $settings;

			if (!$mediaInformation) {
				$mediaInformation = $this->getFileInformation($fileid, $checksum);
				if (!$mediaInformation) {
					return false;
				}
			}

			if ($settings['mediaLocation'] === 'disk') {
				$parent = $mediaInformation['parent'];
				$path = __DIR__ . "/../../../media/$parent/$fileid.dat";
				if (!file_exists($path)) {
					$log = ['message' => "Media file not found", 'data' => $path];
					$db->insert("logErrors", $log);
					return false;
				}
			} elseif ($settings['mediaLocation'] === 'database') {
				$query = "SELECT MD5(`data`) FROM mediaFiles WHERE id = ?";
				$results = $db->fetchValue($query, [$fileid]);
				if ($results['error'] || $results['rows'] < 1) {
					$log = ['message' => "Media file not found in database", 'data' => $fileid];
					$db->insert("logErrors", $log);
					return false;
				}
			}

			// if we reach this point, the file exists
			return true;
		}

		public function getMediaFile($fileid, $checksum, $mediaInformation = null): ?string
		{
			$db = self::getDataBase();
			global $settings;
			if (!$mediaInformation) {
				$mediaInformation = $this->getFileInformation($fileid, $checksum);
				if (!$mediaInformation) {
					return null;
				}
			}

			if (!$this->fileExists($fileid, $checksum, $mediaInformation)) {
				return null;
			}

			if ($settings['mediaLocation'] === 'disk') {
				$parent = $mediaInformation['parent'];
				$path = __DIR__ . "/../../../media/$parent/$fileid.dat";
				$data = file_get_contents($path);
				if ($data === false) {
					return null;
				}
				return $data;
			}

			if ($settings['mediaLocation'] === 'database') {
				$query = "SELECT `data` FROM mediaFiles WHERE id = ?";
				$results = $db->fetchValue($query, [$fileid]);
				if ($results['error'] || $results['rows'] < 1) {
					return null;
				}
				return $results['data'];
			}

			// invalid media location setting
			return null;
		}

		/**
		 * Get the data for a media file.
		 * This function reads the media file from disk or database and outputs it as a stream.
		 */

		public function getMediaStream($fileid, $checksum, $outputBuffer, $mediaInformation = null): void
		{
			$db = self::getDataBase();
			global $settings;
			if (!$mediaInformation) {
				$mediaInformation = $this->getFileInformation($fileid, $checksum);
				if (!$mediaInformation) {
					return;
				}
			}

			if (!$this->fileExists($fileid, $checksum, $mediaInformation)) {
				return;
			}

			if ($settings['mediaLocation'] === 'disk') {
				$parent = $mediaInformation['parent'];
				$path = __DIR__ . "/../../../media/$parent/$fileid.dat";
				$fp = fopen($path, "rb");
				if ($fp === false) {
					return;
				}
				stream_filter_append($fp, 'convert.base64-encode');
				fpassthru($fp);
				fclose($fp);
			} elseif ($settings['mediaLocation'] === 'database') {
				$memoryLimit = self::parseMemoryLimit(ini_get('memory_limit'));
				$usedMemory = memory_get_usage(true);
				$availableMemory = max(0, $memoryLimit - $usedMemory);

				// Reserve a safety margin (e.g., leave 10MB free)
				$safeAvailable = max(1024 * 1024, $availableMemory - (10 * 1024 * 1024));

				// Pick a sane chunk size (at most 1MB, never exceeding safe available)
				$chunkSize = min($safeAvailable, 20 * 1024 * 1024);

				// Total size of blob
				$totalSize = $mediaInformation['filesize'] ?? 0;

				// Read blob in chunks and write to stream
				$offset = 0;
				while ($offset < $totalSize) {
					$length = min($chunkSize, $totalSize - $offset);
					$data = $this->getMediaRange($fileid, '', $offset, $length);
					if ($data === null) {
						// if we cannot read the data, silently fail
						return;
					}
					fwrite($outputBuffer, $data);
					$offset += $length;
				}
			}
		}

		public function getMediaRange($fileid, $path, $start, $length): ?string
		{
			$db = self::getDataBase();
			global $settings;

			if ($settings['mediaLocation'] === 'disk') {
				$fp = fopen($path, 'rb');
				if ($fp !== false) {
					fseek($fp, $start);
					$stream = fread($fp, $length);
					fclose($fp);
					if ($stream !== false) {
						return $stream;
					}

					$log = ['message' => "Error reading from media file", 'data' => $path];
					$db->insert("logErrors", $log);
					return null;
				}

				$log = ['message' => "Media file not found", 'data' => $path];
				$db->insert("logErrors", $log);
				return null;
			}

			if ($settings['mediaLocation'] === 'database') {
				$query = "SELECT SUBSTR(`data`,?,?) FROM mediaFiles WHERE id = ?";
				$results = $db->fetchValue($query, [($start + 1), $length, $fileid]);
				if ($results['error'] || $results['rows'] < 1) {
					return null;
				}

				return $results['data'];
			}

			// invalid media location setting
			return null;
		}

		public function getETag($fileid, $checksum, $mediaInformation = null): bool|string
		{
			$db = self::getDataBase();
			global $settings;

			if (!$mediaInformation) {
				$mediaInformation = $this->getFileInformation($fileid, $checksum);
				if (!$mediaInformation) {
					return false;
				}
			}

			if (!$this->fileExists($fileid, $checksum, $mediaInformation)) {
				return false;
			}

			if ($settings['mediaLocation'] === 'disk') {
				$parent = $mediaInformation['parent'];
				$path = __DIR__ . "/../../../media/$parent/$fileid.dat";
				return md5_file($path);
			}

			if ($settings['mediaLocation'] === 'database') {
				$query = "SELECT MD5(`data`) FROM mediaFiles WHERE id = ?";
				$results = $db->fetchValue($query, [$fileid]);
				return $results['data'];
			}

			// invalid media location setting
			return false;
		}

		private static function parseMemoryLimit(string $value): int {
			$unit = strtolower(substr($value, -1));
			$num = (int) $value;
			return match ($unit) {
				'g' => $num * 1024 * 1024 * 1024,
				'm' => $num * 1024 * 1024,
				'k' => $num * 1024,
				default => (int)$value,
			};
		}

		private static function getDataBase(): rixPDO
		{
			global $sql_db, $sql_user, $sql_password, $sql_host;
			if (!self::$static_db) {
				self::$static_db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, __DIR__ . '/../../../logs/MediaTool_errors.txt');
				$results = self::$static_db->results();
				if ($results['error']) {
					http_response_code(500);
					die();
				}
			}
			return self::$static_db;
		}
	}