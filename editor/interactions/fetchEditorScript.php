<?php

header('X-Content-Type-Options: nosniff');

function respondWithError(int $statusCode, string $message): never
{
	header('Content-Type: text/plain; charset=UTF-8');
	http_response_code($statusCode);
	echo $message;
	exit;
}

$requestedPath = $_GET['path'] ?? null;
if (!is_string($requestedPath) || $requestedPath === '') {
	respondWithError(400, 'Error: No path provided.');
}

/* Only serve interaction directories declared in the manifest. */
$manifestContent = @file_get_contents(__DIR__ . '/manifest.json');
if ($manifestContent === false) {
	respondWithError(500, 'Error: Interaction manifest could not be read.');
}

try {
	$manifest = json_decode($manifestContent, true, 512, JSON_THROW_ON_ERROR);
} catch (JsonException) {
	respondWithError(500, 'Error: Interaction manifest is invalid.');
}

if (!isset($manifest['paths']) || !is_array($manifest['paths'])) {
	respondWithError(500, 'Error: Interaction manifest is invalid.');
}

$allowedPaths = [];
foreach ($manifest['paths'] as $interaction => $folder) {
	if (is_string($interaction) && $interaction !== '' && is_string($folder) && $folder !== '') {
		$allowedPaths["$folder/$interaction/"] = true;
	}
}

$normalizedPath = rtrim($requestedPath, '/') . '/';
if (!isset($allowedPaths[$normalizedPath])) {
	respondWithError(404, 'Error: Interaction not found.');
}

/* Resolve the path before use to prevent traversal and symlink escapes. */
$baseDirectory = realpath(__DIR__);
$interactionDirectory = realpath(__DIR__ . DIRECTORY_SEPARATOR . $normalizedPath);
if (
	$baseDirectory === false
	|| $interactionDirectory === false
	|| !str_starts_with($interactionDirectory, $baseDirectory . DIRECTORY_SEPARATOR)
	|| !is_dir($interactionDirectory)
) {
	respondWithError(404, 'Error: Interaction not found.');
}

$editorFile = realpath($interactionDirectory . DIRECTORY_SEPARATOR . 'editor.js');
$defaultValuesFile = realpath($interactionDirectory . DIRECTORY_SEPARATOR . 'defaultValues.json');
$interactionPrefix = $interactionDirectory . DIRECTORY_SEPARATOR;

if (
	$editorFile === false
	|| !str_starts_with($editorFile, $interactionPrefix)
	|| !is_file($editorFile)
	|| !is_readable($editorFile)
) {
	respondWithError(404, 'Error: editor.js not found for the requested interaction.');
}

if (
	$defaultValuesFile === false
	|| !str_starts_with($defaultValuesFile, $interactionPrefix)
	|| !is_file($defaultValuesFile)
	|| !is_readable($defaultValuesFile)
) {
	respondWithError(404, 'Error: defaultValues.json not found for the requested interaction.');
}

$editorContent = @file_get_contents($editorFile);
$defaultValuesContent = @file_get_contents($defaultValuesFile);
if ($editorContent === false || $defaultValuesContent === false) {
	respondWithError(500, 'Error: Interaction files could not be read.');
}

/* Validate and re-encode the JSON before inserting it into executable JavaScript. */
try {
	$defaultValues = json_decode($defaultValuesContent, false, 512, JSON_THROW_ON_ERROR);
	if (!is_array($defaultValues) || !array_is_list($defaultValues)) {
		respondWithError(500, 'Error: Default values must be a JSON array.');
	}
	$encodedDefaultValues = json_encode($defaultValues, JSON_THROW_ON_ERROR);
} catch (JsonException) {
	respondWithError(500, 'Error: defaultValues.json is invalid.');
}

$editorContent = preg_replace(
	'/\[\s*\/\*DEFAULTVALUES\*\/\s*]/',
	$encodedDefaultValues,
	$editorContent,
	1,
	$replacementCount
);

if ($editorContent === null || $replacementCount !== 1) {
	respondWithError(500, 'Error: editor.js does not contain a valid default-values placeholder.');
}

header('Content-Type: application/javascript; charset=UTF-8');
echo $editorContent;
