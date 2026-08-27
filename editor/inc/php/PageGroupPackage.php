<?php

/**
 * Portable page-group package support.
 *
 * Packages deliberately store media as ordinary archive entries. The importing
 * instance writes those bytes to its configured media backend (disk or DB).
 */

const PGP_PACKAGE_FORMAT = 'oasys-page-groups';
const PGP_PACKAGE_VERSION = 1;
const PGP_PACKAGE_TTL = 1800;
const PGP_PACKAGE_MAX_FILES = 20000;
const PGP_PACKAGE_MAX_UNCOMPRESSED_BYTES = 2147483648;

function pgpTempRoot(): string
{
	$root = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'oasys-page-group-packages';
	if (!is_dir($root) && !mkdir($root, 0700, true) && !is_dir($root)) {
		throw new RuntimeException('Could not create the temporary package directory.');
	}
	return $root;
}

function pgpRemoveTree(string $path): void
{
	if (!is_dir($path)) {
		if (is_file($path)) @unlink($path);
		return;
	}
	$iterator = new RecursiveIteratorIterator(
		new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS),
		RecursiveIteratorIterator::CHILD_FIRST
	);
	foreach ($iterator as $entry) {
		if ($entry->isDir()) @rmdir($entry->getPathname());
		else @unlink($entry->getPathname());
	}
	@rmdir($path);
}

function pgpCleanupTemporaryPackages(): void
{
	$root = pgpTempRoot();
	$threshold = time() - PGP_PACKAGE_TTL;
	foreach (glob($root . DIRECTORY_SEPARATOR . '*.json') ?: [] as $metaPath) {
		$meta = json_decode((string)@file_get_contents($metaPath), true);
		if (!is_array($meta) || (int)($meta['expires'] ?? 0) < time() || filemtime($metaPath) < $threshold) {
			$token = basename($metaPath, '.json');
			@unlink($metaPath);
			@unlink($root . DIRECTORY_SEPARATOR . $token . '.zip');
		}
	}
	foreach (glob($root . DIRECTORY_SEPARATOR . '*.zip') ?: [] as $zipPath) {
		$metaPath = substr($zipPath, 0, -4) . '.json';
		if (!is_file($metaPath) && filemtime($zipPath) < $threshold) @unlink($zipPath);
	}
}

function pgpCreateTempDirectory(string $prefix): string
{
	$path = pgpTempRoot() . DIRECTORY_SEPARATOR . $prefix . '-' . bin2hex(random_bytes(12));
	if (!mkdir($path, 0700, true) && !is_dir($path)) {
		throw new RuntimeException('Could not create a temporary working directory.');
	}
	return $path;
}

function pgpAssertDbResult(mixed $result, string $message): void
{
	if (!is_array($result) || !empty($result['error'])) {
		throw new RuntimeException($message);
	}
}

function pgpCurrentOasysVersion(): string
{
	global $settings;
	$version = trim((string)($settings['vshort'] ?? ''));
	if ($version === '' || $version === 'undetected') {
		$version = trim((string)($settings['v'] ?? ''));
	}
	return $version;
}

function pgpOasysVersionLine(?string $version): ?string
{
	$version = trim((string)$version);
	if ($version === '') return null;
	if (!preg_match('/(\d+)\.(\d+)/', $version, $matches)) return null;
	return $matches[1] . '.' . $matches[2];
}

function pgpValidateOasysVersionCompatibility(array $manifest): void
{
	$packageVersion = trim((string)($manifest['oasysVersion'] ?? ''));
	if ($packageVersion === '') {
		throw new RuntimeException('The uploaded ZIP file is not a valid OASYS page-group package. Its OASYS version information is missing.');
	}

	$packageLine = pgpOasysVersionLine($packageVersion);
	$currentVersion = pgpCurrentOasysVersion();
	$currentLine = pgpOasysVersionLine($currentVersion);

	if ($packageLine === null) {
		throw new RuntimeException('The uploaded ZIP file is not a valid OASYS page-group package. Its OASYS version information is invalid.');
	}
	if ($currentLine !== null && $packageLine !== $currentLine) {
		$packageVersionHtml = htmlspecialchars($packageVersion, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
		$currentVersionHtml = htmlspecialchars($currentVersion, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
		$packageLineHtml = htmlspecialchars($packageLine, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
		throw new RuntimeException(
			'This page-group package was created with OASYS ' . $packageVersionHtml .
			'. It can only be imported into OASYS ' . $packageLineHtml .
			'.x installations. This installation is OASYS ' . $currentVersionHtml . '.'
		);
	}
}

function pgpGetGroup(int $groupId, rixPDO &$db): ?array
{
	$result = $db->fetchRow('SELECT id, name, options, info, parent FROM itemGroups WHERE id=? LIMIT 1', [$groupId]);
	if (!empty($result['error']) || ($result['rows'] ?? 0) === 0) return null;
	return $result['data'];
}

function pgpCanReadGroup(array $group, rixPDO &$db): bool
{
	global $myAuth, $permAuth;
	if ($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin()) return true;
	$parentId = (int)($group['parent'] ?? 0);
	$ownerId = (int)($db->fetchValue('SELECT owner FROM itemFolders WHERE id=? LIMIT 1', [$parentId])['data'] ?? 0);
	if ($ownerId > 0 && $ownerId === (int)$myAuth->userid) return true;
	return $parentId > 0 && $permAuth->getAccessVal('items', 'fetchItemGroup', 'itemObject', $parentId) === true;
}

function pgpCanCreateInFolder(int $folderId, rixPDO &$db): bool
{
	global $myAuth, $permAuth;
	if ($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin()) return true;
	$ownerId = (int)($db->fetchValue('SELECT owner FROM itemFolders WHERE id=? LIMIT 1', [$folderId])['data'] ?? 0);
	if ($ownerId > 0 && $ownerId === (int)$myAuth->userid) return true;
	return $folderId > 0 && $permAuth->getAccessVal('items', 'newItemGroup', 'itemObject', $folderId) === true;
}

function pgpReadDatabaseMediaToFile(int $mediaId, string $targetPath, int $expectedSize, rixPDO &$db): void
{
	$handle = fopen($targetPath, 'wb');
	if ($handle === false) throw new RuntimeException('Could not stage media data for export.');
	try {
		$offset = 0;
		$chunkSize = 1024 * 1024;
		while ($offset < $expectedSize) {
			$length = min($chunkSize, $expectedSize - $offset);
			$result = $db->fetchValue('SELECT SUBSTR(`data`, ?, ?) FROM mediaFiles WHERE id=?', [$offset + 1, $length, $mediaId]);
			if (!empty($result['error']) || ($result['rows'] ?? 0) === 0 || !isset($result['data'])) {
				throw new RuntimeException('A media file referenced by this page group is missing from database storage.');
			}
			$data = (string)$result['data'];
			if ($data === '' && $length > 0) throw new RuntimeException('Could not read media data from database storage.');
			if (fwrite($handle, $data) === false) throw new RuntimeException('Could not stage media data for export.');
			$offset += strlen($data);
		}
	} finally {
		fclose($handle);
	}
}

function pgpCreateExportPackage(array $groupIds, rixPDO &$db): array
{
	global $settings, $myAuth;
	if (!class_exists('ZipArchive')) throw new RuntimeException('ZIP support is not available on this server.');
	$groupIds = array_values(array_unique(array_filter(array_map('intval', $groupIds), static fn($id) => $id > 0)));
	if (empty($groupIds)) throw new RuntimeException('Select at least one page group to export.');

	$groups = [];
	foreach ($groupIds as $groupId) {
		$group = pgpGetGroup($groupId, $db);
		if ($group === null || !pgpCanReadGroup($group, $db)) {
			throw new RuntimeException('You do not have permission to export one or more selected page groups.');
		}
		$groups[] = $group;
	}

	pgpCleanupTemporaryPackages();
	$workspace = pgpCreateTempDirectory('export');
	$token = bin2hex(random_bytes(24));
	$zipPath = pgpTempRoot() . DIRECTORY_SEPARATOR . $token . '.zip';
	$zip = new ZipArchive();
	if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
		pgpRemoveTree($workspace);
		throw new RuntimeException('Could not create the export package.');
	}

	$exportError = null;
	try {
		$manifestGroups = [];
		foreach ($groups as $group) {
			$groupId = (int)$group['id'];
			$groupKey = 'group-' . $groupId;
			$pageRows = $db->fetchTable(
				'SELECT id, itemCode, name, languages, blocks, metadata, link FROM items WHERE groupId=? ORDER BY id',
				[$groupId]
			)['data'] ?? [];
			$mediaTool = new MediaTool();
			if ($mediaTool->hasErrors()) throw new RuntimeException(implode('<br>', $mediaTool->getErrors()));
			$usedMediaIds = [];
			foreach ($pageRows as $page) {
				$mediaData = $mediaTool->parseBlocks($page['blocks'] ?? '[]', $page['languages'] ?? '[]');
				if ($mediaTool->hasErrors()) throw new RuntimeException(implode('<br>', $mediaTool->getErrors()));
				foreach (($mediaData->mediaIds ?? []) as $mediaId) {
					$mediaId = (int)$mediaId;
					if ($mediaId > 0) $usedMediaIds[$mediaId] = true;
				}
			}
			$mediaRows = [];
			if (!empty($usedMediaIds)) {
				$mediaIds = array_keys($usedMediaIds);
				$placeholders = implode(',', array_fill(0, count($mediaIds), '?'));
				$mediaRows = $db->fetchTable(
					"SELECT id, name, filetype, created, filesize, uuid FROM media WHERE parent=? AND id IN ($placeholders) ORDER BY id",
					array_merge([$groupId], $mediaIds)
				)['data'] ?? [];
				if (count($mediaRows) !== count($mediaIds)) {
					throw new RuntimeException('A media file referenced by an exported test page is no longer available.');
				}
			}
			$mediaEntries = [];
			foreach ($mediaRows as $media) {
				$mediaId = (int)$media['id'];
				$entryPath = $groupKey . '/media/' . $mediaId . '.bin';
				$stagedPath = $workspace . DIRECTORY_SEPARATOR . $groupKey . '-' . $mediaId . '.bin';
				$size = max(0, (int)($media['filesize'] ?? 0));
				if (($settings['mediaLocation'] ?? '') === 'disk') {
					$sourcePath = __DIR__ . '/../../../media/' . $groupId . '/' . $mediaId . '.dat';
					if (!is_file($sourcePath)) throw new RuntimeException('A media file referenced by an exported page group is missing from disk storage.');
					if (!$zip->addFile($sourcePath, $entryPath)) throw new RuntimeException('Could not add media to the export package.');
					$checksum = hash_file('sha256', $sourcePath);
				} elseif (($settings['mediaLocation'] ?? '') === 'database') {
					pgpReadDatabaseMediaToFile($mediaId, $stagedPath, $size, $db);
					if (!$zip->addFile($stagedPath, $entryPath)) throw new RuntimeException('Could not add media to the export package.');
					$checksum = hash_file('sha256', $stagedPath);
				} else {
					throw new RuntimeException('The configured media storage location is invalid.');
				}
				$mediaEntries[] = [
					'sourceId' => $mediaId,
					'name' => (string)($media['name'] ?? ''),
					'filetype' => (string)($media['filetype'] ?? ''),
					'created' => (string)($media['created'] ?? ''),
					'filesize' => $size,
					'uuid' => (string)($media['uuid'] ?? ''),
					'path' => $entryPath,
					'sha256' => $checksum,
				];
			}
			$manifestGroups[] = [
				'sourceId' => $groupId,
				'name' => (string)$group['name'],
				'options' => $group['options'],
				'info' => $group['info'],
				'pages' => array_map(static fn($page) => [
					'sourceId' => (int)$page['id'],
					'itemCode' => $page['itemCode'],
					'name' => (string)$page['name'],
					'languages' => $page['languages'],
					'blocks' => $page['blocks'],
					'metadata' => $page['metadata'],
					'link' => $page['link'] === null ? null : (int)$page['link'],
				], $pageRows),
				'media' => $mediaEntries,
			];
		}
		$manifest = [
			'format' => PGP_PACKAGE_FORMAT,
			'version' => PGP_PACKAGE_VERSION,
			'oasysVersion' => pgpCurrentOasysVersion(),
			'createdAt' => gmdate('c'),
			'groups' => $manifestGroups,
		];
		if (!$zip->addFromString('manifest.json', json_encode($manifest, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE))) {
			throw new RuntimeException('Could not write the package manifest.');
		}
	} catch (Throwable $e) {
		$exportError = $e;
	} finally {
		$zip->close();
		pgpRemoveTree($workspace);
	}
	if ($exportError !== null) {
		if (is_file($zipPath)) unlink($zipPath);
		throw $exportError;
	}

	$filename = 'oasys-page-groups-' . gmdate('Y-m-d-His') . '.zip';
	$metadata = [
		'userId' => (int)$myAuth->userid,
		'groupIds' => array_map(static fn($group) => (int)$group['id'], $groups),
		'filename' => $filename,
		'expires' => time() + PGP_PACKAGE_TTL,
	];
	$metaPath = pgpTempRoot() . DIRECTORY_SEPARATOR . $token . '.json';
	if (file_put_contents($metaPath, json_encode($metadata, JSON_THROW_ON_ERROR), LOCK_EX) === false) {
		if (is_file($zipPath)) unlink($zipPath);
		throw new RuntimeException('Could not prepare the export package for download.');
	}
	return ['token' => $token, 'filename' => $filename, 'groupCount' => count($groups)];
}

function pgpReadDownloadToken(string $token, rixPDO &$db): ?array
{
	global $myAuth;
	if (!preg_match('/^[a-f0-9]{48}$/', $token)) return null;
	$root = pgpTempRoot();
	$metaPath = $root . DIRECTORY_SEPARATOR . $token . '.json';
	$zipPath = $root . DIRECTORY_SEPARATOR . $token . '.zip';
	$meta = json_decode((string)@file_get_contents($metaPath), true);
	if (!is_array($meta) || !is_file($zipPath) || (int)($meta['expires'] ?? 0) < time() || (int)($meta['userId'] ?? 0) !== (int)$myAuth->userid) {
		return null;
	}
	foreach (($meta['groupIds'] ?? []) as $groupId) {
		$group = pgpGetGroup((int)$groupId, $db);
		if ($group === null || !pgpCanReadGroup($group, $db)) return null;
	}
	$meta['zipPath'] = $zipPath;
	$meta['metaPath'] = $metaPath;
	return $meta;
}

function pgpValidateArchiveEntry(string $path): bool
{
	return $path !== ''
		&& !str_contains($path, "\0")
		&& !str_starts_with($path, '/')
		&& !str_contains($path, '../')
		&& !str_contains($path, '..\\')
		&& preg_match('#^[A-Za-z0-9_./-]+$#', $path) === 1;
}

function pgpStageArchiveEntry(ZipArchive $zip, string $entryPath, string $targetPath, int $expectedSize, string $checksum): void
{
	if (!pgpValidateArchiveEntry($entryPath)) throw new RuntimeException('The package contains an invalid media path.');
	$stat = $zip->statName($entryPath);
	if (!is_array($stat) || (int)($stat['size'] ?? -1) !== $expectedSize) throw new RuntimeException('A packaged media file is missing or has an unexpected size.');
	$input = $zip->getStream($entryPath);
	$output = fopen($targetPath, 'wb');
	if ($input === false || $output === false) {
		if (is_resource($input)) fclose($input);
		if (is_resource($output)) fclose($output);
		throw new RuntimeException('Could not read media data from the package.');
	}
	try {
		while (!feof($input)) {
			$data = fread($input, 1024 * 1024);
			if ($data === false || ($data !== '' && fwrite($output, $data) === false)) throw new RuntimeException('Could not stage packaged media data.');
		}
	} finally {
		fclose($input);
		fclose($output);
	}
	if (filesize($targetPath) !== $expectedSize || ($checksum !== '' && !hash_equals($checksum, hash_file('sha256', $targetPath)))) {
		throw new RuntimeException('A packaged media file did not pass its integrity check.');
	}
}

/**
 * Validate and read the portable package manifest without importing anything.
 * This is shared by the import preview and the actual import path.
 */
function pgpReadPackageManifest(ZipArchive $zip): array
{
	if ($zip->numFiles > PGP_PACKAGE_MAX_FILES) throw new RuntimeException('The package contains too many files.');
	$totalSize = 0;
	for ($i = 0; $i < $zip->numFiles; $i++) {
		$stat = $zip->statIndex($i);
		$name = (string)($stat['name'] ?? '');
		if (!pgpValidateArchiveEntry($name)) throw new RuntimeException('The package contains an invalid archive path.');
		$totalSize += max(0, (int)($stat['size'] ?? 0));
		if ($totalSize > PGP_PACKAGE_MAX_UNCOMPRESSED_BYTES) throw new RuntimeException('The package is too large to import safely.');
	}
	$manifestRaw = $zip->getFromName('manifest.json');
	if ($manifestRaw === false) {
		throw new RuntimeException('The uploaded ZIP file is not a valid OASYS page-group package. It does not contain the required package manifest.');
	}
	try {
		$manifest = json_decode($manifestRaw, true, 512, JSON_THROW_ON_ERROR);
	} catch (JsonException $e) {
		throw new RuntimeException('The uploaded ZIP file is not a valid OASYS page-group package. Its package manifest is invalid.');
	}
	if (($manifest['format'] ?? null) !== PGP_PACKAGE_FORMAT || (int)($manifest['version'] ?? 0) !== PGP_PACKAGE_VERSION || empty($manifest['groups']) || !is_array($manifest['groups'])) {
		throw new RuntimeException('The uploaded ZIP file is not a valid OASYS page-group package. Its format or version is not supported.');
	}
	pgpValidateOasysVersionCompatibility($manifest);
	return ['manifest' => $manifest, 'uncompressedSize' => $totalSize];
}

function pgpValidateImportGroupNames(array $manifest, int $targetFolderId, rixPDO &$db): void
{
	$groupNames = [];
	$sourceGroupIds = [];
	foreach ($manifest['groups'] as $group) {
		$name = trim((string)($group['name'] ?? ''));
		$sourceId = (int)($group['sourceId'] ?? 0);
		if ($name === '' || mb_strlen($name) > 255 || $sourceId <= 0 || isset($groupNames[mb_strtolower($name)]) || isset($sourceGroupIds[$sourceId])) {
			throw new RuntimeException('The package contains invalid or duplicate page-group information.');
		}
		$groupNames[mb_strtolower($name)] = true;
		$sourceGroupIds[$sourceId] = true;
		$exists = $db->fetchValue('SELECT COUNT(*) FROM itemGroups WHERE name=? AND parent=?', [$name, $targetFolderId]);
		if ((int)($exists['data'] ?? 0) > 0) throw new RuntimeException('A page group named <strong>' . htmlspecialchars($name, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</strong> already exists in the destination folder.');
	}
}

function pgpBuildImportSummary(array $manifest, int $archiveSize): array
{
	$groups = [];
	$pageCount = 0;
	$mediaCount = 0;
	$mediaBytes = 0;
	foreach ($manifest['groups'] as $group) {
		$pages = is_array($group['pages'] ?? null) ? $group['pages'] : [];
		$media = is_array($group['media'] ?? null) ? $group['media'] : [];
		$groupMediaBytes = array_sum(array_map(static fn($entry) => max(0, (int)($entry['filesize'] ?? 0)), $media));
		$groups[] = [
			'name' => trim((string)($group['name'] ?? '')),
			'pageCount' => count($pages),
			'mediaCount' => count($media),
			'mediaBytes' => $groupMediaBytes,
		];
		$pageCount += count($pages);
		$mediaCount += count($media);
		$mediaBytes += $groupMediaBytes;
	}
	return [
		'groupCount' => count($groups),
		'pageCount' => $pageCount,
		'mediaCount' => $mediaCount,
		'mediaBytes' => $mediaBytes,
		'archiveBytes' => $archiveSize,
		'groups' => $groups,
	];
}

function pgpStageImportPackage(string $uploadPath, string $originalName, int $targetFolderId, rixPDO &$db): array
{
	global $myAuth;
	if (!class_exists('ZipArchive')) throw new RuntimeException('ZIP support is not available on this server.');
	if (!is_file($uploadPath) || filesize($uploadPath) <= 0) throw new RuntimeException('The selected package is empty or unavailable.');
	$zip = new ZipArchive();
	if ($zip->open($uploadPath) !== true) throw new RuntimeException('The selected file is not a valid ZIP package.');
	try {
		$package = pgpReadPackageManifest($zip);
		pgpValidateImportGroupNames($package['manifest'], $targetFolderId, $db);
		$summary = pgpBuildImportSummary($package['manifest'], (int)filesize($uploadPath));
	} finally {
		$zip->close();
	}

	pgpCleanupTemporaryPackages();
	$token = bin2hex(random_bytes(24));
	$root = pgpTempRoot();
	$zipPath = $root . DIRECTORY_SEPARATOR . $token . '.import.zip';
	$metaPath = $root . DIRECTORY_SEPARATOR . $token . '.import.json';
	if (!move_uploaded_file($uploadPath, $zipPath)) throw new RuntimeException('Could not prepare the uploaded package for review.');
	$metadata = [
		'userId' => (int)$myAuth->userid,
		'folderId' => $targetFolderId,
		'filename' => basename($originalName),
		'expires' => time() + PGP_PACKAGE_TTL,
		'summary' => $summary,
	];
	try {
		if (file_put_contents($metaPath, json_encode($metadata, JSON_THROW_ON_ERROR), LOCK_EX) === false) throw new RuntimeException('Could not prepare the package review.');
	} catch (Throwable $e) {
		@unlink($zipPath);
		throw $e;
	}
	return ['token' => $token, 'summary' => $summary];
}

function pgpReadStagedImport(string $token, int $targetFolderId): ?array
{
	global $myAuth;
	if (!preg_match('/^[a-f0-9]{48}$/', $token)) return null;
	$root = pgpTempRoot();
	$zipPath = $root . DIRECTORY_SEPARATOR . $token . '.import.zip';
	$metaPath = $root . DIRECTORY_SEPARATOR . $token . '.import.json';
	$meta = json_decode((string)@file_get_contents($metaPath), true);
	if (!is_array($meta) || !is_file($zipPath) || (int)($meta['expires'] ?? 0) < time() || (int)($meta['userId'] ?? 0) !== (int)$myAuth->userid || (int)($meta['folderId'] ?? 0) !== $targetFolderId) {
		return null;
	}
	$meta['zipPath'] = $zipPath;
	$meta['metaPath'] = $metaPath;
	return $meta;
}

function pgpDeleteStagedImport(string $token): void
{
	if (!preg_match('/^[a-f0-9]{48}$/', $token)) return;
	$root = pgpTempRoot();
	@unlink($root . DIRECTORY_SEPARATOR . $token . '.import.zip');
	@unlink($root . DIRECTORY_SEPARATOR . $token . '.import.json');
}

function pgpImportArchive(string $archivePath, int $targetFolderId, rixPDO &$db): array
{
	global $settings, $myAuth;
	if (!class_exists('ZipArchive')) throw new RuntimeException('ZIP support is not available on this server.');
	if (!is_file($archivePath) || filesize($archivePath) <= 0) throw new RuntimeException('The selected package is empty or unavailable.');
	$zip = new ZipArchive();
	if ($zip->open($archivePath) !== true) throw new RuntimeException('The selected file is not a valid ZIP package.');
	$stageDir = pgpCreateTempDirectory('import');
	$transactionStarted = false;
	$createdDirs = [];
	$copiedFiles = [];

	try {
		$package = pgpReadPackageManifest($zip);
		$manifest = $package['manifest'];
		if (!pgpCanCreateInFolder($targetFolderId, $db)) throw new RuntimeException('You do not have permission to create page groups in the selected folder.');
		if (!in_array(($settings['mediaLocation'] ?? ''), ['disk', 'database'], true)) throw new RuntimeException('The configured media storage location is invalid.');
		pgpValidateImportGroupNames($manifest, $targetFolderId, $db);

		$stagedMedia = [];
		foreach ($manifest['groups'] as $group) {
			$sourceGroupId = (int)$group['sourceId'];
			$seenMedia = [];
			foreach (($group['media'] ?? []) as $media) {
				$sourceMediaId = (int)($media['sourceId'] ?? 0);
				$size = (int)($media['filesize'] ?? -1);
				if ($sourceMediaId <= 0 || $size < 0 || isset($seenMedia[$sourceMediaId])) throw new RuntimeException('The package contains invalid media information.');
				$seenMedia[$sourceMediaId] = true;
				$stagedPath = $stageDir . DIRECTORY_SEPARATOR . $sourceGroupId . '-' . $sourceMediaId . '.bin';
				pgpStageArchiveEntry($zip, (string)($media['path'] ?? ''), $stagedPath, $size, (string)($media['sha256'] ?? ''));
				$stagedMedia[$sourceGroupId][$sourceMediaId] = $stagedPath;
			}
		}

		if ($db->startTransaction() !== true) throw new RuntimeException('Could not start the page-group import transaction.');
		$transactionStarted = true;
		$groupMap = [];
		$mediaMap = [];
		$pageMap = [];
		foreach ($manifest['groups'] as $group) {
			$sourceGroupId = (int)$group['sourceId'];
			$create = $db->execute('INSERT INTO itemGroups (name, options, info, parent, owner, permissions) VALUES (?, ?, ?, ?, ?, NULL)', [
				trim((string)$group['name']),
				$group['options'] ?? null,
				$group['info'] ?? null,
				$targetFolderId,
				(int)$myAuth->userid,
			]);
			pgpAssertDbResult($create, 'Could not create an imported page group.');
			$newGroupId = (int)($create['id'] ?? 0);
			if ($newGroupId <= 0) throw new RuntimeException('Could not create an imported page group.');
			$groupMap[$sourceGroupId] = $newGroupId;

			$targetDir = __DIR__ . '/../../../media/' . $newGroupId;
			foreach (($group['media'] ?? []) as $media) {
				$sourceMediaId = (int)$media['sourceId'];
				$mediaName = (string)($media['name'] ?? '');
				$filetype = (string)($media['filetype'] ?? '');
				if ($mediaName === '' || mb_strlen($mediaName) > 255 || !preg_match('/^[A-Za-z0-9]{1,4}$/', $filetype)) throw new RuntimeException('The package contains invalid media metadata.');
				$insert = $db->execute('INSERT INTO media (name, filetype, parent, created, filesize, uuid) VALUES (?, ?, ?, ?, ?, UUID())', [
					$mediaName, $filetype, $newGroupId, (string)($media['created'] ?? '') ?: date('Y-m-d H:i:s'), (int)$media['filesize'],
				]);
				pgpAssertDbResult($insert, 'Could not create imported media information.');
				$newMediaId = (int)($insert['id'] ?? 0);
				$newUuid = (string)($db->fetchValue('SELECT uuid FROM media WHERE id=?', [$newMediaId])['data'] ?? '');
				if ($newMediaId <= 0 || $newUuid === '') throw new RuntimeException('Could not create imported media information.');
				$mediaMap[$sourceGroupId][$sourceMediaId] = ['id' => $newMediaId, 'uuid' => $newUuid, 'oldUuid' => (string)($media['uuid'] ?? ''), 'oldId' => $sourceMediaId];
				$stagedPath = $stagedMedia[$sourceGroupId][$sourceMediaId] ?? null;
				if (!$stagedPath || !is_file($stagedPath)) throw new RuntimeException('A packaged media file is unavailable.');
				if (($settings['mediaLocation'] ?? '') === 'database') {
					$result = $db->insertFile('mediaFiles', ['id' => $newMediaId, 'data' => $stagedPath], 'data');
					pgpAssertDbResult($result, 'Could not import media data into database storage.');
				} else {
					if (!is_dir($targetDir)) {
						if (!mkdir($targetDir, 0775, true) && !is_dir($targetDir)) throw new RuntimeException('Could not create the imported media directory.');
						$createdDirs[$targetDir] = true;
					}
					$targetPath = $targetDir . DIRECTORY_SEPARATOR . $newMediaId . '.dat';
					if (!copy($stagedPath, $targetPath)) throw new RuntimeException('Could not import media data into disk storage.');
					$copiedFiles[] = $targetPath;
				}
			}

			foreach (($group['pages'] ?? []) as $page) {
				$sourcePageId = (int)($page['sourceId'] ?? 0);
				$pageName = trim((string)($page['name'] ?? ''));
				if ($sourcePageId <= 0 || $pageName === '' || mb_strlen($pageName) > 255) throw new RuntimeException('The package contains invalid test-page information.');
				$insert = $db->execute('INSERT INTO items (`groupId`, `itemCode`, `name`, `languages`, `blocks`, `parsed`, `fields`, `options`, `scripts`, `metadata`, `link`, `lock`) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, NULL, NULL)', [
					$newGroupId, $page['itemCode'] ?? null, $pageName, $page['languages'] ?? '[]', $page['blocks'] ?? '[]', $page['metadata'] ?? '{}',
				]);
				pgpAssertDbResult($insert, 'Could not create an imported test page.');
				$newPageId = (int)($insert['id'] ?? 0);
				if ($newPageId <= 0 || isset($pageMap[$sourceGroupId][$sourcePageId])) throw new RuntimeException('Could not create an imported test page.');
				$pageMap[$sourceGroupId][$sourcePageId] = $newPageId;
			}
		}

		$mediaTool = new MediaTool();
		if ($mediaTool->hasErrors()) throw new RuntimeException(implode('<br>', $mediaTool->getErrors()));
		foreach ($manifest['groups'] as $group) {
			$sourceGroupId = (int)$group['sourceId'];
			foreach (($group['pages'] ?? []) as $page) {
				$sourcePageId = (int)$page['sourceId'];
				$blocks = json_decode((string)($page['blocks'] ?? '[]'), false, 512, JSON_THROW_ON_ERROR);
				$languages = json_decode((string)($page['languages'] ?? '[]'), true, 512, JSON_THROW_ON_ERROR);
				if (!is_array($blocks) || !is_array($languages)) throw new RuntimeException('The package contains invalid interaction data.');
				$mediaTool->replaceMediaIds($blocks, $mediaMap[$sourceGroupId] ?? []);
				$newPageId = $pageMap[$sourceGroupId][$sourcePageId];
				$compiler = new InteractionCompiler($blocks, $languages, $newPageId, $db, []);
				$compiler->compileBlocks();
				if ($compiler->getErrors()) throw new RuntimeException((string)$compiler->getErrors());
				$metadata = json_decode((string)($page['metadata'] ?? '{}'), false, 512, JSON_THROW_ON_ERROR);
				if (!is_object($metadata)) $metadata = new stdClass();
				foreach ($compiler->getMetadata() as $key => $value) $metadata->$key = $value;
				$linkedSourceId = (int)($page['link'] ?? 0);
				if ($linkedSourceId > 0 && !isset($pageMap[$sourceGroupId][$linkedSourceId])) throw new RuntimeException('A page in the package references a stimulus page outside its page group.');
				$link = $linkedSourceId > 0 ? $pageMap[$sourceGroupId][$linkedSourceId] : null;
				$update = $db->update('items', [
					'fields' => $compiler->getFields(),
					'options' => $compiler->getOptions(),
					'parsed' => $compiler->getParsed(),
					'scripts' => $compiler->getScripts(),
					'blocks' => $compiler->getBlocks(),
					'metadata' => json_encode($metadata, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
					'link' => $link,
				], 'id=?', [$newPageId]);
				pgpAssertDbResult($update, 'Could not finalize an imported test page.');
			}
		}
		if ($db->commit() !== true) throw new RuntimeException('Could not complete the page-group import transaction.');
		$transactionStarted = false;
		return ['groupCount' => count($groupMap), 'pageCount' => array_sum(array_map(static fn($group) => count($group['pages'] ?? []), $manifest['groups']))];
	} catch (Throwable $e) {
		if ($transactionStarted) $db->rollback();
		foreach ($copiedFiles as $path) @unlink($path);
		foreach (array_keys($createdDirs) as $directory) @rmdir($directory);
		throw $e;
	} finally {
		$zip->close();
		pgpRemoveTree($stageDir);
	}
}
