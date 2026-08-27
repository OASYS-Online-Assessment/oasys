<?php

	/*
	 *  rixTools for PHP v1.18
	 *  (versions of this file that do not have a version number are old and should be replaced)
	 */

	function curPageURL(): string
	{
		$pageURL = 'http';
		if ($_SERVER["HTTPS"] == "on") {
			$pageURL .= "s";
		}
		$pageURL .= "://";
		if ($_SERVER["SERVER_PORT"] != "80") {
			$pageURL .= $_SERVER["SERVER_NAME"] . ":" . $_SERVER["SERVER_PORT"] . $_SERVER["REQUEST_URI"];
		} else {
			$pageURL .= $_SERVER["SERVER_NAME"] . $_SERVER["REQUEST_URI"];
		}
		return $pageURL;
	}

	function redirectPOST($url, $postString): void
	{
		if ($postString == '') {
			return;
		}
		echo '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">';
		echo "<html lang=''><head><title></title></head><body>";
		echo "<form name=\"myform\" action=\"$url\" method=\"POST\">";
		$postArray = explode("&", $postString);
		foreach ($postArray as $v) {
			$var = explode("=", $v);
			$vName = $var[0];
			$vData = $var[1];
			echo "<input type=\"hidden\" name=\"$vName\" value=\"$vData\">";
		}
		echo "</form>";
		echo "<SCRIPT language=\"JavaScript\">";
		echo "document.myform.submit();";
		echo "</SCRIPT>";
		echo "</body></html>";
	}

	function redirectGET($url, $getString = ''): void
	{
		if ($getString != '') {
			$getString = "?" . $getString;
		}
		$location = ($url . $getString);
		header("Location: $location");
	}

	function htmlComment($s): void
	{
		echo("\r\n\r\n<!-- DEBUG INFO: $s -->\r\n\r\n");
	}

//function returns an array of numbers corresponding to the bits that are set in the input value
//e.g.: decodeFlags(5) == array (0, 2)
	function decodeFlags($val): array
	{
		$bitCounter = 0;
		$bitValue = 1;
		$bits = array();
		while ($val > 0) {
			if ($bitValue & $val) {
				$val -= $bitValue;
				$bits[] = $bitCounter;
			}
			$bitValue = $bitValue << 1;
			$bitCounter++;
		}
		return $bits;
	}

//similar as decodeFlags, just that all bits are represented and the value is true or false depending on its state
	function decodeBitfield($val, $msb = 63): array
	{
		$bits = array();
		for ($i = 0; $i <= $msb; $i++) {
			$bitValue = pow(2, $i);
			if ($bitValue & $val) {
				$bits[$i] = true;
			} else {
				$bits[$i] = false;
			}
		}
		return $bits;
	}


	/**
	 * Creates an alphanumerical password of length $len
	 * Note: The letter l (lowercase L) and the number 1
	 * have been removed, as they can be mistaken
	 * for each other.
	 */

	function createRandomPassword($len): string
	{
		$chars = "abcdefghijkmnpqrstuvwxyz23456789";
		$i = 0;
		$pass = '';
		while ($i <= $len) {
			$num = rand() % 33;
			$tmp = substr($chars, $num, 1);
			$pass = $pass . $tmp;
			$i++;
		}
		return $pass;
	}


	/**
	 * Write to a logfile on disk (appends if file exists)
	 */

	function writeLogFile($logFile, $logData): void
	{
		if (file_exists($logFile)) {
			$fh = fopen($logFile, 'a');
		} else {
			$fh = fopen($logFile, 'w');
		}
		fwrite($fh, date('[Y-m-d H:i:s]') . " $logData");
		fclose($fh);
	}

	/*
	 * return $nth key of array $a, or if $n is not specified the first key
	 */
	function getKey($a, $n = 0): bool|int|string
	{
		if (!is_array($a)) {
			return false;
		}
		$keys = array_keys($a);
		if (!isset($keys[$n])) {
			return false;
		}
		return ($keys[$n]);
	}

	function arrayToTable($arr, $title, $hColor = '#FFF0F0', $evenColor = '#FFF8F8', $oddColor = '#FFFFFF'): void
	{
		$k = getKey($arr);
		$keys = array_keys($arr[$k]);
		echo "<h2>$title</h2>\n";
		echo "<table>\n";
		echo "<tr style=\"background-color: $hColor;\">";
		foreach ($keys as $key) {
			echo "<td>$key</td>";
		}
		echo "</tr>\n";

		$hilight = false;
		foreach ($arr as $row) {
			if ($hilight) {
				$style = "style='background-color: $evenColor;'";
				$hilight = false;
			} else {
				$style = "style='background-color: $oddColor;'";
				$hilight = true;
			}
			echo "<tr $style>";
			foreach ($row as $item) {
				echo "<td>$item</td>";
			}
			echo "</tr>\n";
		}
		echo "</table>\n";
	}

	function exportDelimited($type, $name, $data, $printKeys = true): void
	{
		$titleArray = array_keys($data[key($data)]);
		switch ($type) {
			case "tab":
				$delimiter = "\t";
				$filename = $name . ".csv";
				break;
			case "comma":
				$delimiter = ",";
				$filename = $name . ".csv";
				break;
			case "semicolon":
				$delimiter = ";";
				$filename = $name . ".csv";
				break;
			default:
				$delimiter = "|";
				$filename = $name . ".txt";
		}
		header("Content-Description: File Transfer");
		header("Content-type: text/csv");
		header("Content-Disposition: attachment; filename=$filename");
		header("Content-Transfer-Encoding: binary");
		header("Pragma: no-cache");
		header("Expires: 0");
		print chr(239) . chr(187) . chr(191); //UTF-8 byte order mark => necessary for Excel to open the files correctly
		$titleString = implode($delimiter, $titleArray);
		if ($printKeys) {
			print $titleString . "\r\n";
		}
		foreach ($data as $subArray) {
			foreach ($subArray as $k => $v) {
				if (preg_match("/[\"$delimiter]/", $v)) {
					$v = preg_replace('/\"/', '""', $v);
					$subArray[$k] = '"' . $v . '"';
				}
			}
			$dataRowString = implode($delimiter, $subArray);
			print $dataRowString . "\r\n";
		}
	}

	/* alternative of count() for stdClass objects */
	function countObj($obj): bool|int
	{
		if (!is_object($obj) || !($obj instanceof stdClass)) {
			return false;
		}

		return count(get_object_vars($obj));
	}

	/*  compare two objects and return a log of differences
	 *  $obj1: first stdClass object or json string
	 *  $obj2: second stdClass object or json string
	 *  $log: array to store the log in
	 *  $label1: label for the first object, defaults to 'obj1'
	 *  $label2: label for the second object, defaults to 'obj2'
	 *  $parentKey: internal use only, may be set to a prefix for the keys if desired
	 */
	function compareObjects($obj1, $obj2, &$log, $label1 = 'obj1', $label2 = 'obj2', $parentKey = ''): void
	{
		if (is_string($obj1)) {
			$decodedObj1 = json_decode($obj1);
			if (json_last_error() === JSON_ERROR_NONE) {
				$obj1 = $decodedObj1;
			}
		}

		if (is_string($obj2)) {
			$decodedObj2 = json_decode($obj2);
			if (json_last_error() === JSON_ERROR_NONE) {
				$obj2 = $decodedObj2;
			}
		}

		if (gettype($obj1) !== gettype($obj2)) {
			$entry = new stdClass();
			$entry->key = $parentKey;
			$entry->$label1 = $obj1;
			$entry->$label2 = $obj2;
			$log[] = $entry;
			return;
		}

		foreach ($obj1 as $key => $value) {
			$currentKey = $parentKey !== '' ? $parentKey . ' ⮕ ' . $key : $key;

			if (is_object($obj1) && is_object($obj2)) {
				if (!property_exists($obj2, $key)) {
					$entry = new stdClass();
					$entry->key = $currentKey;
					$entry->$label1 = (is_object($value) || is_array($value)) ? json_encode($value) : $value;
					$entry->$label2 = 'key does not exist';
					$log[] = $entry;
				} else {
					$value2 = $obj2->$key;
					if ((is_object($value) || is_array($value)) && (is_object($value2) || is_array($value2))) {
						compareObjects($value, $value2, $log, $label1, $label2, $currentKey);
					} elseif ($value !== $value2) {
						$entry = new stdClass();
						$entry->key = $currentKey;
						$entry->$label1 = (is_object($value) || is_array($value)) ? json_encode($value) : $value;
						$entry->$label2 = (is_object($value2) || is_array($value2)) ? json_encode($value2) : $value2;
						$log[] = $entry;
					}
				}
			} elseif (is_array($obj1) && is_array($obj2)) {
				if (!array_key_exists($key, $obj2)) {
					$entry = new stdClass();
					$entry->key = $currentKey;
					$entry->$label1 = (is_object($value) || is_array($value)) ? json_encode($value) : $value;
					$entry->$label2 = 'key does not exist';
					$log[] = $entry;
				} else {
					$value2 = $obj2[$key];
					if ((is_object($value) || is_array($value)) && (is_object($value2) || is_array($value2))) {
						compareObjects($value, $value2, $log, $label1, $label2, $currentKey);
					} elseif ($value !== $value2) {
						$entry = new stdClass();
						$entry->key = $currentKey;
						$entry->$label1 = (is_object($value) || is_array($value)) ? json_encode($value) : $value;
						$entry->$label2 = (is_object($value2) || is_array($value2)) ? json_encode($value2) : $value2;
						$log[] = $entry;
					}
				}
			} else {
				$entry = new stdClass();
				$entry->key = $currentKey;
				$entry->$label1 = (is_object($obj1) || is_array($obj1)) ? json_encode($obj1) : $obj1;
				$entry->$label2 = (is_object($obj2) || is_array($obj2)) ? json_encode($obj2) : $obj2;
				$log[] = $entry;
			}
		}

		foreach ($obj2 as $key => $value) {
			$currentKey = $parentKey !== '' ? $parentKey . ' ⮕ ' . $key : $key;

			if (is_object($obj1) && is_object($obj2)) {
				if (!property_exists($obj1, $key)) {
					$entry = new stdClass();
					$entry->key = $currentKey;
					$entry->$label1 = 'key does not exist';
					$entry->$label2 = (is_object($value) || is_array($value)) ? json_encode($value) : $value;
					$log[] = $entry;
				}
			} elseif (is_array($obj1) && is_array($obj2)) {
				if (!array_key_exists($key, $obj1)) {
					$entry = new stdClass();
					$entry->key = $currentKey;
					$entry->$label1 = 'key does not exist';
					$entry->$label2 = (is_object($value) || is_array($value)) ? json_encode($value) : $value;
					$log[] = $entry;
				}
			} else {
				$entry = new stdClass();
				$entry->key = $currentKey;
				$entry->$label1 = (is_object($obj1) || is_array($obj1)) ? json_encode($obj1) : $obj1;
				$entry->$label2 = (is_object($obj2) || is_array($obj2)) ? json_encode($obj2) : $obj2;
				$log[] = $entry;
			}
		}
	}

	/**
	 * Filters out unwanted entries in an array based on a key-value condition.
	 * @param array $inputArray The input array containing subarrays as elements.
	 * @param string $filterKey The key to check in each subarray.
	 * @param array $unwantedValues The set of values to filter out.
	 * @return array The filtered array.
	 */
	function filterArrayEntries(array $inputArray, string $filterKey, array $unwantedValues): array
	{
		return array_filter($inputArray, function ($item) use ($filterKey, $unwantedValues) {
			return !(isset($item[$filterKey]) && in_array($item[$filterKey], $unwantedValues, true));
		});
	}

	function deepCopy($obj): mixed
	{
		return json_decode(json_encode($obj));
	}

	function debugArray($arr, $name = '', $hidden = false, $usePre = false): void
	{
		global $backtrace;
		if (!is_array($arr) && !is_object($arr)) {
			$backtrace = debug_backtrace();
			die();
		}
		if ($hidden) {
			echo "\n\n<!--\n";
			if ($name != '') {
				echo "\n\n$name\n\n";
			}
			print_r($arr);
			echo "\n-->\n\n";
		} else {
			// Generate a unique ID for the table
			$tableId = 'debug_array_' . uniqid();
			$triangleId = 'triangle_' . $tableId;

			if ($name != '') {
				echo "<h1 style='cursor: pointer;' onclick=\"
					let table = document.getElementById('$tableId');
					let triangle = document.getElementById('$triangleId');
					if (table.style.display === 'none') {
						table.style.display = 'table';
						triangle.innerHTML = '▼';
					} else {
						table.style.display = 'none';
						triangle.innerHTML = '▶';
					}
				\"><span id='$triangleId' style='display: inline-block; width: 1em; margin-right: 5px;'>▼</span>$name</h1>";
			}
			echo "<table id='$tableId' style='border-spacing: 10px;'>";
			foreach ($arr as $key => $value) {
				echo "<tr><td style='vertical-align: top; padding: 0 10px'>";
				echo "<span style='border: 1px solid orange; border-radius: 20px; padding: 0 5px; background-color: #FFCC66; width: 100%; display: inline-block; text-align: center;'>$key</span>";
				echo "</td><td style='vertical-align: top; border: 1px solid orange; padding: 1px 5px; background-color: rgba(255, 200, 0, 0.15)'>";
				if (is_array($value) || is_object($value)) {
					debugArray($value, '', false, $usePre);
				} else {
					if ($usePre) {
						echo "<pre>";
					}
					if (is_bool($value)) {
						echo $value ? 'true' : 'false';
					} elseif (is_null($value)) {
						echo 'null';
					} else {
						echo htmlentities($value);
					}
					if ($usePre) {
						echo "</pre>";
					}
				}
				echo "</td></tr>";
			}
			echo "</table>";
		}
	}

	function errorNotification(): void
	{
		$error = error_get_last();
		if (!empty($error)) {
			echo "\n\n<!--\n";
			echo "Fatal error in {$error['file']} on line {$error['line']}\n";
			echo var_export($error, true) . PHP_EOL;
			echo var_export($_SERVER, true) . PHP_EOL;
			echo "-->\n\n";
		}
	}

	/*
		 IN:	integer	=> unix epoch in milliseconds resolution
		OUT:	string	=> datetime as string in "Y-m-d H:i:s.u" format
	 */

	function milliseconds2DateString($preciseTime): string
	{
		try {
			$unixTime = floor($preciseTime / 1000);
			$milliSeconds = str_pad($preciseTime - 1000 * $unixTime, 3, "0", STR_PAD_LEFT);
			$objDateTime = new DateTime("@$unixTime");
			$objDateTime->setTimezone(new DateTimeZone(date_default_timezone_get()));
		} catch (Exception $e) {
			return "undefined";
		}
		return $objDateTime->format('Y-m-d H:i:s') . ".$milliSeconds";
	}

	/*
		IN:	string	=> datetime as string in "Y-m-d H:i:s.u" format
		OUT:	float	=> unix epoch in milliseconds resolution
	 */

	function dateString2Milliseconds(string $dateString): float
	{
		try {
			// Split the date string to get the milliseconds part
			$parts = explode('.', $dateString);
			$dateWithoutMs = $parts[0];
			$ms = $parts[1] ?? '0';

			// Create DateTime object from the date string without milliseconds
			$dt = new DateTime($dateWithoutMs);

			// Get Unix timestamp in seconds
			$timestamp = $dt->getTimestamp();

			// Add milliseconds and return
			return ($timestamp * 1000) + (float)$ms;
		} catch (Exception $e) {
			return 0;
		}
	}

	/*
		This function checks if a file may be created or modified
		parameters:

		$file		string		full path of the file
		$status		array		reference to an array that should get detailed status information

		returns:	boolean

		Fields of $status array returned:
		exist		boolean		indicates if path already exists
		type		string		'file', 'dir' or 'unknown' [only if exists === true]
		link		boolean		indicates if path is a symbolic link [only if exists === true]
		error		string		full explanation of situation (useful for logging)
	 */
	function checkFileWritePermission($file, &$status = []): bool
	{
		if (file_exists("$file")) {
			$status['exist'] = true;
			if (is_file($file)) {
				$status['type'] = 'file';
				$status['info'] = is_writable($file) ? "file exists and is writable" : "file exists but is not writable";
				$status['link'] = is_link($file);
				return is_writable($file);
			} elseif (is_dir($file)) {
				$status['type'] = 'dir';
				$status['info'] = "indicated path exists, but is a directory";
				$status['link'] = is_link($file);
				return false; //no file with this path can be written since there is already a directory with the same name
			} else {
				$status['type'] = 'unknown';
				$status['info'] = "unknown error";
				return false; //neither file nor dir -> probably this should never happen
			}
		} else {
			/* if file_exists() returns false, parent folder is not executable, or the file really does not exist yet */
			$path = dirname($file); // parent directory
			$status['exist'] = false;
			if (is_executable($path)) {
				$status['info'] = is_writable($path) ? "file does not exist but can be created" : "parent directory is not writable";
				return is_writable($path);
			} else {
				$status['info'] = "parent is not executable";
				return false;
			}
		}
	}

	function display($output): void
	{
		if (php_sapi_name() !== 'cli') {
			// Running in a web browser
			// Replace newline characters with HTML line breaks
			$output = nl2br($output);
		}
		// Output the text
		echo $output;
	}

	function sizeStringToBytes(string $val): int
	{
		$val = trim($val);
		$last = strtolower($val[strlen($val) - 1]);
		$val = (int)$val;
		switch ($last) {
			case 'g':
				$val *= 1024;
				break;
			case 'm':
				$val *= 1024 * 1024;
				break;
			case 'k':
				$val *= 1024 * 1024 * 1024;
				break;
		}
		return $val;
	}

	/*
		Adds missing properties from $defaults to $obj if they do not exist in $obj.
		Supports both arrays and objects.
		@param array|object $obj The object or array to which defaults will be added.
		@param array|object $defaults The object or array containing default properties.
		@return array|object The modified object or array with missing defaults added.
	 */
	function addMissingPropertyDefaults(array|object &$obj, array|object $defaults): array|object
	{
		if (is_object($obj)) {
			foreach ($defaults as $key => $value) {
				if (!property_exists($obj, $key)) {
					$obj->$key = $value;
				}
			}
		} elseif (is_array($obj)) {
			foreach ($defaults as $key => $value) {
				if (!array_key_exists($key, $obj)) {
					$obj[$key] = $value;
				}
			}
		}
		return $obj;
	}