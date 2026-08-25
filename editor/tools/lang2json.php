<?php

	require_once "../../inc/php/rixTools.php";

	$languageData = [];

	if (($handle = fopen("../inc/lang/oasys_languages.tsv", "r")) !== FALSE) {

		//read the first line in to $keys array
		if (($keys = fgetcsv($handle, 0, "\t", '"', "\\")) === FALSE) {
			die ("Error reading keys from TSV file");
		}

		if (!isset($keys[0]) || $keys[0] === '') {
			exit("No keys found");
		}

		//remove byte order mark from first key
		$bom = pack('H*','EFBBBF');
		$keys[0] = ltrim($keys[0], $bom);

		while (($data = fgetcsv($handle, 0, "\t", '"', "\\")) !== FALSE) {
			$textKey = null;
			foreach ($data as $n => $v) {
				if (!isset($keys[$n])) {
					echo "<p>Error, too many values in line:<br>". implode("    ",$data) . "</p>";
					continue;
				}
				$k = $keys[$n];
				if ($k === 'key') {
					$textKey = $v;
				} elseif ($textKey === null) {
					echo "<p>missing key for string: $k = '$v'</p>";
				} else {
					$languageData[$k][$textKey] = $v; // example: $languageData['DE']['big brother'] = 'Großer Bruder';
				}
			}
		}
		fclose($handle);
	} else {
		die ("Cannot open TSV file");
	}

	foreach ($languageData as $lang => $strings) {
		file_put_contents("../inc/lang/$lang.json",json_encode($strings, JSON_UNESCAPED_UNICODE));
		echo "<p>Written ../inc/lang/$lang.json</p>";
	}

	echo "<p>Finished!</p>";


	function isKey($k): string
	{
		return $k === 'key' ? 'true' : 'false';
	}

	function strToHex($string): string
	{
		$hex='';
		for ($i=0; $i < mb_strlen($string, 'UTF-8'); $i++){
			$hex .= dechex(ord(mb_substr($string, $i, 1, 'UTF-8')));
		}
		return $hex;
	}
