<?php

register_shutdown_function('shutDown');

$action = filter_input(INPUT_POST, 'action');
if (!$action) {
    $action = "index";
}

$debugInfo = [];

require_once "../maintenance/pageUpdater.php";

?>

<html lang="en">
<head>
    <meta charset="utf-8">
    <title>OASYS database updater</title>
    <style>
        form {
            margin: 100px 0;
            text-align: center;
        }

        input[type="submit"] {
            padding: 10px;
            font-size: 24px;
            cursor: pointer;
            border-radius: 20px;
        }
    </style>
</head>
<body>
<?php if ($action === 'index') { ?>

    <form method="post" action="updateItems.php">
        <input type="hidden" name="action" value="update">
        <input type="submit" value="Update all pages in database">
    </form>

    <form method="post" action="updateItems.php">
        <input type="hidden" name="action" value="test">
        <input type="submit" value="Test the updater">
    </form>

    <?php
} elseif ($action === 'update') {
    $returnData = [];
    $updater = new pageUpdater($returnData);
    echo "<p>Verifying and updating all pages, if necessary …</p>";
    $updater->checkAllPages();
    debugArray($returnData);
    echo "<p>Done!</p>";
} elseif ($action === 'test') {
    $returnData = [];
    $updater = new pageUpdater($returnData);
    echo "<p>Verifying and comparing all pages …</p>";
    $updater->checkAllPages(true);
    debugArray($returnData);
    echo "<p>Done!</p>";
}

	function shutDown(): void {
		$error = error_get_last();
		if (!empty($error)) {
			$documentRoot = filter_input(INPUT_SERVER, "DOCUMENT_ROOT");
			$file = str_replace($documentRoot, '', $error['file']);
			echo "<p>Fatal error [type {$error['type']}] on line {$error['line']} of<br><code class='tinyCode'>$file</code></p><pre>{$error['message']}</pre>";
//            debugArray($GLOBALS['debugInfo']);
		}
	}

?>
</body>
</html>
