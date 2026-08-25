<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Translation key checker</title>
    <style>
        @import url("../../inc/fonts/opensans.css");

        body {
            font-family: "Open Sans", sans-serif;
            margin: 20px;
        }

        li {
            color: #0099e3;
        }

        li.error {
            color: red;
        }

        li.notice {
            color: #AAA;
        }

    </style>
</head>
<body>


<?php

	require_once "../../inc/php/rixTools.php";

	$languageData = [];
	chdir("../");

	echo "<h1>Tab separated values file</h1>";
	echo "<h2>Count of values errors</h2><ul>";

	if (($handle = fopen("inc/lang/oasys_languages.tsv", "r")) !== false) {

		//read the first line in to $keys array
		$keys = fgetcsv($handle, 0, "\t");

		if ($keys === false) {
			die ("Error reading keys from TSV file");
		}

		//remove byte order mark from first key
		$bom = pack('H*', 'EFBBBF');
		$keys[0] = preg_replace("/^$bom/", "", $keys[0]);

		$counter = 1;
		$keyOccurrences = [];

		while (($data = fgetcsv($handle, 0, "\t")) !== false) {
			$counter++;
			if (count($data) < count($keys)) {
				echo "<li class='error'>missing values in line $counter: " . implode("    ", $data) . "</li>";
			}
			foreach ($data as $n => $v) {
				if (!isset($keys[$n])) {
					echo "<li class='error'>too many values in line $counter: " . implode("    ", $data) . "</li>";
				}
				$k = $keys[$n];
				if ($k === 'key') {
					$languageData[] = $v;
					$keyOccurrences[$v][] = $counter;
				}
			}
		}
		fclose($handle);

		echo "</ul>";
		echo "<h2>Duplicate keys</h2><ul>";
		foreach ($keyOccurrences as $k => $lines) {
			if (count($lines) > 1) {
				echo "<li>Lines " . implode(" & ", $lines) . ": " . $k . "</li>";
			}
		}
		echo "</ul>";

	} else {
		die ("Cannot open TSV file");
	}

	$jsFiles = [];
	$phpFiles = [];
	recursiveScan("..", $jsFiles, $phpFiles);

	function recursiveScan($path, &$jsFiles, &$phpFiles): void
	{
		$jsFiles = array_merge($jsFiles, (glob("$path/*.js")));
		$phpFiles = array_merge($phpFiles, (glob("$path/*.php")));
		foreach (glob("$path/*", GLOB_ONLYDIR) as $dir) {
            // Skip directories that start with a dot (hidden directories) or with "node_modules" or "apps"
            if (str_starts_with(basename($dir), '.') || str_starts_with(basename($dir), 'node_modules') || str_starts_with(basename($dir), 'apps')) {
                continue;
            }
            // Recursively scan subdirectories
			recursiveScan($dir, $jsFiles, $phpFiles);
		}
	}

	$usedKeys = [];
	$problematicKeys = [];
	echo "<h1>Javascript files</h1>";

	foreach ($jsFiles as $jsFile) {
		$src = file_get_contents($jsFile);
		$lines = explode("\n", $src);
		$needUlTag = true;
		$occurrences = [];

		foreach ($lines as $lineNumber => $line) {
            //if $line contains comment "*** skip langcheck ***" continue to next line
            if (str_contains($line, '*** skip langcheck ***')) {
                continue;
            }
			$positions = findUILANGCallsPositions($line);
			if (empty($positions)) {
				continue;
			} else {
				//extract the part of the line from pos n to pos n+1 or end of line if last pos and add substring to occurrences
				$lineLength = strlen($line);
				foreach ($positions as $n => $pos) {
					$endPos = ($n + 1 < count($positions)) ? $positions[$n + 1] : $lineLength;
					$occurrences[] = ['line' => $lineNumber, 'string' => trim(substr($line, $pos, $endPos - $pos))];
				}
			}
		}
		foreach ($occurrences as $row) {
            $occurrence = $row['string'];
            $line = $row['line'];
			$param = extractUILANGParameter($occurrence);
			if ($param !== false) {
                if (preg_match('/\$\{.+?}/', $param)) {
                    if (preg_match('/(([\'"]).*?\2)\s*,\s*\{.*?}/', $param, $matches)) {
                        $param = $matches[1];
                    }
                }
                if (isSimpleLiteral($param)) {
					$key = stripOuterQuotes($param);
					$usedKeys[] = $key;
					if (!in_array($key, $languageData)) {
						if ($needUlTag) {
							echo "<div>$jsFile</div>";
							echo "<ul>";
							$needUlTag = false;
						}
						echo "<li class='error'><b>Line {$line}: Missing key<span style='margin:0 1em'>→</span></b> " . htmlentities($key) . "</li>";
					}
				} else {
					$problematicKeys[] = $param;
					if ($needUlTag) {
						echo "<div>$jsFile</div>";
						echo "<ul>";
						$needUlTag = false;
					}
					echo "<li class='notice'><b>Line {$line}: Non-string key<span style='margin:0 1em'>→</span></b> " . htmlentities($param) . "</li>";
				}
			}
		}

		/* special check for config files, where UILANG is implicitly called for labels, titles and messages */
		if (preg_match('/config.js/', $jsFile)) {
			preg_match_all('/([lL]abel|[tT]itle|[mM]essage)["\']?\s*:\s*(["\'])(.*?[^\\\\])\2/s', $src, $jsonMatches, PREG_SET_ORDER);
			foreach ($jsonMatches as $row) {
				$key = stripslashes($row[3]);
				$usedKeys[] = $key;
				if (!in_array($key, $languageData)) {
					if ($needUlTag) {
						echo "<div>$jsFile</div>";
						echo "<ul>";
						$needUlTag = false;
					}
					echo "<li>" . htmlentities($key) . "</li>";
				}
			}
		}

		if ($needUlTag === false) {
			echo "</ul>";
		}
	}

	echo "<h1>Interactions manifest file</h1>";

	$src = file_get_contents('interactions/manifest.json');
	$data = json_decode($src ?? '', true);
	$labels = [];

	foreach ($data['sections']['labels'] as $lbl) {
		$labels[] = $lbl;
	}

	foreach ($data['sections']['blocks'] as $block) {
		foreach ($block['labels'] as $lbl) {
			$labels[] = $lbl;
		}
	}

	$needUlTag = true;
	foreach ($labels as $key) {
		$usedKeys[] = $key;
		if (!in_array($key, $languageData)) {
			if ($needUlTag) {
				echo "<div>manifest.json</div>";
				echo "<ul>";
				$needUlTag = false;
			}
			echo "<li>" . htmlentities($key) . "</li>";
		}
	}
	if ($needUlTag === false) {
		echo "</ul>";
	}


	echo "<h1>PHP files</h1>";

	foreach ($phpFiles as $phpFile) {
		$src = file_get_contents($phpFile);
		preg_match_all("/->translate\(\s*(['\"])(.*?)(?<!\\\\)\\1\s*\)/", $src, $matches);
		$needUlTag = true;
		foreach ($matches[2] as $key) {
			$usedKeys[] = $key;
			if (!in_array($key, $languageData)) {
				if ($needUlTag) {
					echo "<div>$phpFile</div>";
					echo "<ul>";
					$needUlTag = false;
				}
				echo "<li>" . htmlentities($key) . "</li>";
			}
		}
		if ($needUlTag === false) {
			echo "</ul>";
		}
	}


	echo "<h1>Possibly unused keys</h1><ul>";

	foreach ($keyOccurrences as $key => $lines) {
		if (!in_array($key, $usedKeys)) {
			echo "<li><b>Line " . implode(" & ", $lines) . ":</b> " . $key;
		}
	}

	echo "</ul>";

	function strToHex($string): string
	{
		$hex = '';
		for ($i = 0; $i < strlen($string); $i++) {
			$hex .= dechex(ord($string[$i]));
		}
		return $hex;
	}

	/**
	 * Extracts the parameter of a UILANG call from a line of JS code.
	 * Returns the parameter as a string (with any surrounding whitespace trimmed)
	 * or false if no matching parameter was found.
	 */
	function extractUILANGParameter($line): false|string
	{
		// Quickly filter out lines that don't contain UILANG.m( or UILANG.e(
		if (!preg_match('/UILANG\.[me]\(/', $line)) {
			return false;
		}

		// Find the position of the call.
		if (preg_match('/UILANG\.[me]\(/', $line, $match, PREG_OFFSET_CAPTURE)) {
			// $match[0][1] gives the offset where the match starts.
			// Find the first opening parenthesis after that.
			$openParenPos = strpos($line, '(', $match[0][1]);
			if ($openParenPos === false) {
				return false;
			}

			// Use a custom parser to extract the text inside the matching parentheses.
			return parseParameter($line, $openParenPos);
		}

		return false;
	}

	/**
	 * Parses the parameter from a string starting at an opening parenthesis.
	 * This function will scan the line from the given position, handling quotes
	 * (single, double, or backticks), escape sequences, and nested parentheses.
	 *
	 * @param string $line The line of code to parse.
	 * @param int $openParenPos The position of the first '('.
	 *
	 * @return string|false The extracted parameter (trimmed), or false on failure.
	 */
	function parseParameter(string $line, int $openParenPos): false|string
	{
		$length = strlen($line);
		$pos = $openParenPos;
		$level = 0;
		$result = '';
		$inString = false;
		$stringChar = '';

		for (; $pos < $length; $pos++) {
			$char = $line[$pos];

			if (!$inString) {
				if ($char === '(') {
					$level++;
					// Do not include the very first '(' in the result.
					if ($level > 1) {
						$result .= $char;
					}
				} elseif ($char === ')') {
					$level--;
					if ($level === 0) {
						// We found the matching closing parenthesis.
						return trim($result);
					} else {
						$result .= $char;
					}
				} elseif ($char === '"' || $char === "'" || $char === '`') {
					// Entering a string literal.
					$inString = true;
					$stringChar = $char;
					$result .= $char;
				} else {
					$result .= $char;
				}
			} else {
				// Inside a string literal.
				$result .= $char;
				if ($char === '\\') {
					// Skip the next character (whatever it is).
					if ($pos + 1 < $length) {
						$pos++;
						$result .= $line[$pos];
					}
				} elseif ($char === $stringChar) {
					// End of the string literal.
					$inString = false;
				}
			}
		}

		// If we exit the loop without the level reaching zero,
		// the parentheses were not balanced.
		return false;
	}

	/**
	 * Checks if the parameter is exactly a simple literal string.
	 * For single/double quotes, the entire string must be the literal.
	 * For backticks (template literals), we require that there is no interpolation (i.e. no '${').
	 *
	 * @param string $param The parameter string (trimmed).
	 * @return bool True if it is a simple literal, false otherwise.
	 */
	function isSimpleLiteral(string $param): bool
	{
		if (strlen($param) < 2) {
			return false;
		}
		$quote = $param[0];
		if (!in_array($quote, ["'", '"', '`'])) {
			return false;
		}
		// For template literals, if there's an interpolation, we don’t consider it simple.
		if ($quote === '`' && str_contains($param, '${')) {
			return false;
		}
		$len = strlen($param);
		$i = 1;
		while ($i < $len) {
			$char = $param[$i];
			if ($char === '\\') {
				// Skip over escaped characters.
				$i += 2;
				continue;
			}
			if ($char === $quote) {
				break;
			}
			$i++;
		}
		// If we never found a closing quote, it’s not a valid literal.
		if ($i >= $len) {
			return false;
		}
		// After the closing quote, only whitespace is allowed.
		$rest = trim(substr($param, $i + 1));
		return ($rest === '');
	}

	/**
	 * Analyzes the parameter string and returns a classification.
	 *
	 * Returns:
	 *  - 'simple_literal' if the parameter is exactly one literal string (e.g. 'foo', "bar", or a backtick literal with no interpolation).
	 *  - 'concatenation' if it contains a plus sign (+) outside of any quoted substring.
	 *  - 'non_literal_expression' for other kinds of expressions (such as a variable reference, function call, etc.)
	 *
	 * @param string $param The parameter extracted from the UILANG call.
	 * @return string The classification.
	 */
	function analyzeParameterType(string $param): string
	{
		$param = trim($param);

		// First, check if it is exactly a literal string.
		if (isSimpleLiteral($param)) {
			return true;
		}

		return false;
	}

	/**
	 * Strips the outer quotes (single, double, or backtick) from a simple literal string.
	 *
	 * For example:
	 *   "'Hello, world!'"   → "Hello, world!"
	 *   '"Hello, world!"'   → "Hello, world!"
	 *   "`Hello, world!`"   → "Hello, world!"
	 *
	 * Optionally, this function decodes escape sequences (such as \" or \n) using stripcslashes().
	 *
	 * @param string $literal The simple literal string (with quotes).
	 * @return string The literal's inner content, with escape sequences decoded.
	 */
	function stripOuterQuotes(string $literal): string
	{
		$literal = trim($literal);
		$len = strlen($literal);
		if ($len < 2) {
			return $literal;
		}

		$quote = $literal[0];
		// Ensure the first character is one of the supported quotes and the last character matches.
		if (($quote === "'" || $quote === '"' || $quote === '`') && $literal[$len - 1] === $quote) {
			// Remove the outer quotes.
			$inner = substr($literal, 1, $len - 2);
			// Decode common escape sequences (optional).
			return stripcslashes($inner);
		}

		// If not properly quoted, return the original string.
		return $literal;
	}

	/**
	 * Finds all positions in a line where a call to UILANG.m( or UILANG.e( occurs.
	 *
	 * @param string $line The line of JavaScript code.
	 * @return array An array of starting offsets for each occurrence.
	 */
	function findUILANGCallsPositions(string $line): array
	{
		// The regex matches "UILANG.m(" or "UILANG.e(".
		$pattern = '/UILANG\.[me]\(/';
		$matches = [];
		preg_match_all($pattern, $line, $matches, PREG_OFFSET_CAPTURE);

		$positions = [];
		if (!empty($matches[0])) {
			foreach ($matches[0] as $match) {
				// $match[1] contains the starting offset of this match.
				$positions[] = $match[1];
			}
		}

		return $positions;
	}


?>


</body>
</html>
