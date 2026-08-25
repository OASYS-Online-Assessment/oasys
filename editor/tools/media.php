<?php

register_shutdown_function('shutDown');

require_once '../maintenance/mediaClass.php';

use maintenance\mediaClass;

$action = filter_input(INPUT_POST, 'action');
if (!$action) {
	$action = "index";
}

$returnData = [];

function shutDown(): void
{
    GLOBAL $returnData;
	$error = error_get_last();
    echo "<pre>";
	print_r($error);
    echo "</pre>";
    echo($returnData['error']);
}

?>

<html lang="en">
<head>
    <meta charset="utf-8">
    <title>media maintenance</title>
    <style>
        a {
            margin-top: 50px;
            text-decoration: none;
            color: black;
            border: none;
            outline: none;
            cursor: pointer;
            padding: 10px 20px;
            border-radius: 5px;
            font-size: 18px;
            background-color: rgb(239, 239, 239);
        }

        a:hover {
            background-color: #3498db;
            color: white;
        }

        body {
            font-family: sans-serif;
            background-color: #FDFDFD;
        }

        h1 {
            text-align: center;
        }

        form {
            margin: 20px 0;
            text-align: center;
        }

        input[type="submit"] {
            border: none;
            outline: none;
            cursor: pointer;
            padding: 10px 20px;
            border-radius: 5px;
            font-size: 18px;
            width: 400px;
        }

        input[type="submit"]:hover {
            background-color: #3498db;
            color: white;
        }

        .centerAligned {
            text-align: center;
        }
    </style>
</head>
<body>
<h1>OASYS media assets maintenance tool</h1>
<?php if ($action === 'index') { ?>

    <form method="post" action="media.php">
        <input type="hidden" name="action" value="verify">
        <input type="submit" value="Verify media files">
    </form>

    <form method="post" action="media.php">
        <input type="hidden" name="action" value="consolidate">
        <input type="submit" value="Consolidate media files and fix errors">
    </form>

    <form method="post" action="media.php">
        <input type="hidden" name="action" value="disk">
        <input type="submit" value="Set media location to disk">
    </form>

    <form method="post" action="media.php">
        <input type="hidden" name="action" value="database">
        <input type="submit" value="Set media location to database">
    </form>

	<?php
} else {
	if ($action === 'verify') {
		$mc = new mediaClass($returnData, []);
		$mc->execute('verifyMediaAssets');
		echo "<pre>";
		if (isset($returnData['log'])) {
			foreach ($returnData['log'] as $log) {
				echo $log . "\n";
			}
		}
		if (isset($returnData['error'])) {
			echo "ERROR: " . $returnData['error'] . "\n";
		}
		echo "Done!</pre>";
	} elseif ($action === 'consolidate') {
		$mc = new mediaClass($returnData, []);
		$mc->execute('consolidateMediaAssets');
		echo "<pre>";
		if (isset($returnData['log'])) {
			foreach ($returnData['log'] as $log) {
				echo $log . "\n";
			}
		}
		if (isset($returnData['error'])) {
			echo "ERROR: " . $returnData['error'] . "\n";
		}
		echo "Done!</pre>";
	} elseif ($action === 'disk') {
		$mc = new mediaClass($returnData, []);
        $mc->execute('setMediaLocationToDisk');
        echo "<pre>";
		echo "Media location set to disk\n";
		echo "Now you need to return to the main menu and run 'Consolidate media files and fix errors'\n";
		echo "</pre>";
	} elseif ($action === 'database') {
		$mc = new mediaClass($returnData, []);
        $mc->execute('setMediaLocationToDatabase');
        echo "<pre>";
        echo "Media location set to database\n";
        echo "Now you need to return to the main menu and run 'Consolidate media files and fix errors'\n";
        echo "</pre>";
	}
	echo "<p class='centerAligned'><a href='media.php'>Back to index</a></p>";
}
?>
</body>
</html>