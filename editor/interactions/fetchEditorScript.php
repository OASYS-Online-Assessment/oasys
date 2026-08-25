<?php
	/* read the path from the request */
	$path = $_GET['path'] ?? '';
	if (empty($path)) {
		http_response_code(400);
		echo "Error: No path provided.";
		exit;
	}
	$path = __DIR__ . "/$path";
	if (!is_dir($path)) {
		http_response_code(404);
		echo "Error: Directory not found.";
		exit;
	}
	/* read editor.js and defauktValues.json from path */
	$editorFile = "$path/editor.js";
	if (!file_exists($editorFile)) {
		http_response_code(404);
		echo "Error: editor.js not found in the specified path.";
		exit;
	}
	$defaultValuesFile = "$path/defaultValues.json";
	if (!file_exists($defaultValuesFile)) {
		http_response_code(404);
		echo "Error: defaultValues.json not found in the specified path.";
		exit;
	}
	/* read the contents of the files */
	$editorContent = file_get_contents($editorFile);
	$defaultValuesContent = trim(file_get_contents($defaultValuesFile));
	/* replace the placeholder in editor.js with the contents of defaultValues.json */
	$editorContent = preg_replace(
		'/\[.*\/\*DEFAULTVALUES\*\/.*?]/s',
		$defaultValuesContent,
		$editorContent
	);
	/* set the content type to JavaScript */
	header('Content-Type: application/javascript');
	/* output the contents of the files */
	echo $editorContent;