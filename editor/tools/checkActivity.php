<?php

    global $filterSettings;
    $filterSettings = true;

    use editor\maintenance\DataSanitizer;

	register_shutdown_function('shutDown');

	$action = filter_input(INPUT_POST, 'action');
	if (!$action) {
		$action = "index";
	}

	if ($action === 'check') {
		$startDate = filter_input(INPUT_POST, 'startDate');
		if ($startDate === '') {
			$startDate = null;
		}
		$endDate = filter_input(INPUT_POST, 'endDate');
		if ($endDate === '') {
			$endDate = null;
		}
		$limitOffset = filter_input(INPUT_POST, 'limitOffset');
		if ($limitOffset === '') {
			$limitOffset = null;
		}
		$limitCount = filter_input(INPUT_POST, 'limitCount');
		if ($limitCount === '' || $limitCount === '0') {
			$limitCount = null;
		}
	}

	require_once "../maintenance/DataSanitizer.php";

?>

<html lang="en">
<head>
    <meta charset="utf-8">
    <title>OASYS activity checker</title>
    <link rel="stylesheet" href="../../inc/fonts/opensans.css">
    <script src="../../inc/js/jquery-3.2.1.min.js"></script>
    <style>
        /* General Reset */
        body {
            font-family: "Open Sans", Arial, sans-serif;
            font-size: 12pt;
            background-color: #f4f4f9;
            margin: 0;
            color: #333;
            padding: 70px 30px 30px 30px;
        }

        header {
            border-bottom: 1px solid #666666;
            background-color: #CCCCCC;
            margin: 0 -30px 30px;
            padding: 10px 50px;
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
        }

        header input[type="checkbox"] {
            margin-right: 10px;
        }

        header label {
            margin-right: 50px;
        }

        /* Center the content */
        form {
            margin: 100px auto;
            padding: 20px;
            max-width: 500px;
            background-color: #fff;
            border: 1px solid #ddd;
            border-radius: 10px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }

        form label {
            display: block;
            margin: 15px 0 5px;
            font-weight: bold;
            color: #555;
        }

        form input[type="date"],
        form input[type="number"] {
            width: calc(100% - 22px);
            padding: 10px;
            margin-bottom: 15px;
            font-size: 16px;
            border: 1px solid #ccc;
            border-radius: 5px;
            box-sizing: border-box;
        }

        form input[type="submit"] {
            display: inline-block;
            background-color: #4CAF50;
            color: white;
            padding: 10px 20px;
            font-size: 18px;
            font-weight: bold;
            cursor: pointer;
            border: none;
            border-radius: 25px;
            transition: background-color 0.3s ease;
        }

        form input[type="submit"]:hover {
            background-color: #45a049;
        }

        /* Responsive Design */
        @media (max-width: 600px) {
            form {
                margin: 50px 20px;
                padding: 15px;
            }

            form input[type="date"],
            form input[type="number"] {
                font-size: 14px;
            }

            form input[type="submit"] {
                font-size: 16px;
                padding: 8px 16px;
            }
        }

        div.boxHeader {
            background-color: #888888;
            color: #FFFFFF;
            padding: 3px 8px;
            border-radius: 5px;
            margin-top: -25px;
            margin-left: -15px;
            display: inline-block;
            font-weight: bold;
            border: 1px solid #666666;
        }

        h3 {
            font-size: 14pt;
            font-weight: bold;
        }

        .log {
            background-color: white;
            margin: 30px 10px;
            padding: 10px 30px;
            border: #666666 1px solid;
            color: #666666;
            box-shadow: rgba(0, 0, 0, 0.1) 0 4px 8px;
        }

        ul {
            padding: 0 25px;
        }

        @media print {
            .screenOnly {
                display: none;
            }
        }

        body.hideBehaviour .behaviourLog {
            display: none;
        }

        body.hideAnswers .answersLog {
            display: none;
        }

        body.hideBehaviour .log:not(:has(div.answersLog)) {
            display: none;
        }

        body.hideAnswers .log:not(:has(div.behaviourLog)) {
            display: none;
        }

        a {
            color: inherit;
            text-decoration: none;
        }

    </style>

</head>
<body>

<?php
	if ($action === 'index') {
		?>

        <form method="post" action="checkActivity.php">
            <label for="startDate">Start date:</label>
            <input type="date" name="startDate" id="startDate" value="">
            <label for="endDate">End date:</label>
            <input type="date" name="endDate" id="endDate" value="">
            <label for="limitOffset">Limit offset:</label>
            <input type="number" name="limitOffset" id="limitOffset" placeholder="Limit offset" min="0" value="0">
            <label for="limitCount">Limit count:</label>
            <input type="number" name="limitCount" id="limitCount" placeholder="Limit count" min="0" value="1000">
            <input type="hidden" name="action" value="check">
            <input type="submit" value="Sanity check activity">
        </form>


		<?php
	} elseif ($action === 'check') {
		$returnData = [];
		$sanitizer = new DataSanitizer($returnData);
		/* create header bar with 2 checkboxes to show or hide behaviour and answers data */
		echo "<header class='screenOnly'>";
		echo "<input type='checkbox' id='showBehaviour' checked><label for='showBehaviour'>Show behaviour</label>";
		echo "<input type='checkbox' id='showAnswers' checked><label for='showAnswers'>Show answers</label>";
		echo "</header>";
		echo "<p class='screenOnly'>Checking activity data …</p>";
		$options = [
			'startDate' => $startDate,
			'endDate' => $endDate,
			'limitOffset' => $limitOffset,
			'limitCount' => $limitCount
		];
		$sanitizer->check($options);
		if (!isset($returnData['log'])) {
			echo "<p>No problems found.</p>";
			return;
		}
        /* loop through the log data and display it */
		foreach ($returnData['log'] as $loginId => $loginLog) {
            foreach ($loginLog as $pwId => $pwLog) {
	            foreach ($pwLog as $testId => $log) {
		            if (empty($log)) {
			            continue;
		            }
		            echo "<div class='log'>";
		            echo "<div class='boxHeader'><a target='_blank' href='../resultsPreviewActions.php?loginId=$loginId&testId=$testId'>Login id: $loginId – Password id: $pwId – Test id: $testId</a></div>";
		            if (isset($log['behaviour'])) {
			            echo "<div class='behaviourLog'>";
			            echo "<h3>Behaviour discrepancies</h3>";
			            echo "<ul>";
			            foreach ($log['behaviour'] as $entry) {
				            echo "<li><b>event {$entry['eventId']}:</b> {$entry['message']}</li>";
			            }
			            echo "</ul>";
			            echo "</div>";
		            }
		            if (isset($log['answers'])) {
			            echo "<div class='answersLog'>";
			            echo "<h3>Answer discrepancies</h3>";
			            echo "<ul>";
			            foreach ($log['answers'] as $pageId => $pageAnswers) {
				            echo "<li><b>key:</b> {$pageAnswers['key']}<br><b>expected:</b> {$pageAnswers['expected']}<br><b>actual:</b> {$pageAnswers['actual']}</li>";
			            }
			            echo "</ul>";
			            echo "</div>";
		            }
		            echo "</div>";
	            }
            }
		}
		echo "<p class='screenOnly'>Done!</p>";
	}

	function shutDown(): void
	{
		$error = error_get_last();
		if (!empty($error)) {
			$documentRoot = filter_input(INPUT_SERVER, "DOCUMENT_ROOT");
			$file = str_replace($documentRoot, '', $error['file']);
			echo "<p>Fatal error [type {$error['type']}] on line {$error['line']} of<br><code class='tinyCode'>$file</code></p><pre>{$error['message']}</pre>";
		}
	}

?>
<script>
	const showBehaviour = document.getElementById('showBehaviour');
	const showAnswers = document.getElementById('showAnswers');

	showBehaviour.addEventListener('change', () => {
		if (showBehaviour.checked) {
			$('body').removeClass('hideBehaviour');
		} else {
			$('body').addClass('hideBehaviour');
		}
	});

	showAnswers.addEventListener('change', () => {
		if (showAnswers.checked) {
			$('body').removeClass('hideAnswers');
		} else {
			$('body').addClass('hideAnswers');
		}
	});
</script>

</body>
</html>
