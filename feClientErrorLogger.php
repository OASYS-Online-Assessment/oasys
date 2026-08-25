<?php
// Check if data is sent via POST request
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
	// Get the data sent via the POST request
	$data = file_get_contents('php://input');

	if (!empty($data)) {
		// Define the path to the log file
		$logFilePath = 'logs/fe_client_log.txt';

		// Append the data to the log file
		file_put_contents($logFilePath, $data . PHP_EOL, FILE_APPEND);
	}
} else {
	// Invalid request method
	http_response_code(405);
	echo 'Method Not Allowed';
}
