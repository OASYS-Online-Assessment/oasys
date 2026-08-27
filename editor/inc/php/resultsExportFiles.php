<?php

const RESULTS_EXPORT_TTL = 1800;

function resultsExportTempRoot(): string
{
	$root = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'oasys-results-exports';
	if (!is_dir($root) && !mkdir($root, 0700, true) && !is_dir($root)) {
		throw new RuntimeException('Could not create the temporary results export directory.');
	}
	return $root;
}

function resultsExportCleanup(): void
{
	$root = resultsExportTempRoot();
	foreach (glob($root . DIRECTORY_SEPARATOR . '*.json') ?: [] as $metaPath) {
		$meta = json_decode((string)@file_get_contents($metaPath), true);
		if (!is_array($meta) || (int)($meta['expires'] ?? 0) < time()) {
			$token = basename($metaPath, '.json');
			@unlink($metaPath);
			@unlink($root . DIRECTORY_SEPARATOR . $token . '.bin');
		}
	}
}

function resultsExportStage(string $contents, string $filename, string $mime): string
{
	global $myAuth;
	resultsExportCleanup();
	$token = bin2hex(random_bytes(24));
	$root = resultsExportTempRoot();
	$dataPath = $root . DIRECTORY_SEPARATOR . $token . '.bin';
	$metaPath = $root . DIRECTORY_SEPARATOR . $token . '.json';
	$metadata = [
		'owner' => (int)$myAuth->userid,
		'filename' => $filename,
		'mime' => $mime,
		'expires' => time() + RESULTS_EXPORT_TTL,
	];
	if (file_put_contents($dataPath, $contents, LOCK_EX) === false
		|| file_put_contents($metaPath, json_encode($metadata, JSON_UNESCAPED_SLASHES), LOCK_EX) === false) {
		@unlink($dataPath);
		@unlink($metaPath);
		throw new RuntimeException('Could not stage the generated results export.');
	}
	@chmod($dataPath, 0600);
	@chmod($metaPath, 0600);
	return $token;
}

function resultsExportRead(string $token): ?array
{
	global $myAuth;
	if (preg_match('/^[a-f0-9]{48}$/', $token) !== 1) return null;
	$root = resultsExportTempRoot();
	$metaPath = $root . DIRECTORY_SEPARATOR . $token . '.json';
	$dataPath = $root . DIRECTORY_SEPARATOR . $token . '.bin';
	$metadata = json_decode((string)@file_get_contents($metaPath), true);
	if (!is_array($metadata)
		|| (int)($metadata['owner'] ?? 0) !== (int)$myAuth->userid
		|| (int)($metadata['expires'] ?? 0) < time()
		|| !is_file($dataPath)) {
		return null;
	}
	$metadata['dataPath'] = $dataPath;
	$metadata['metaPath'] = $metaPath;
	return $metadata;
}

function resultsExportFilename(array $returnData, string $extension): string
{
	$prefix = match ($returnData['action'] ?? '') {
		'fetchDetailedTestScore' => 'testscore',
		'fetchBehaviourTiming' => 'behaviourTiming',
		default => 'testresults',
	};
	$testId = (int)($returnData['testData']['id'] ?? 0);
	$testName = (string)($returnData['testData']['name'] ?? 'test');
	return $prefix . '_id_' . $testId . '_' . $testName . '.' . $extension;
}

function resultsExportDelimiter(string $delimiter): string
{
	return match ($delimiter) {
		',' => ',',
		';' => ';',
		'%09', "\t" => "\t",
		default => throw new InvalidArgumentException('Unsupported CSV delimiter.'),
	};
}

function resultsExportStageCsv(array &$returnData, string $delimiter): void
{
	$separator = resultsExportDelimiter($delimiter);
	$stream = fopen('php://temp/maxmemory:5242880', 'w+b');
	if ($stream === false) throw new RuntimeException('Could not create the CSV export stream.');
	fwrite($stream, "\xEF\xBB\xBF");
	foreach ($returnData['csvHeaders'] as $row) fputcsv($stream, $row, $separator, '"', '');
	foreach ($returnData['csvRows'] as $row) fputcsv($stream, $row, $separator, '"', '');
	rewind($stream);
	$contents = stream_get_contents($stream);
	fclose($stream);
	if ($contents === false) throw new RuntimeException('Could not finalize the CSV export.');
	$returnData['reportToken'] = resultsExportStage(
		$contents,
		resultsExportFilename($returnData, 'csv'),
		'text/csv; charset=UTF-8'
	);
	unset($returnData['csvHeaders'], $returnData['csvRows']);
}
