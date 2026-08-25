<?php

require_once __DIR__ . '/../../../inc/php/settings.php';

/*
		### FILTER SENSITIVE SETTINGS FROM JS ###
	
		We need to filter out sensitive settings vars so they are not
		exposed to all logged in users. If these vars are not needed
		on the JS side, filter here.

		The loop looks for the 'noJS' key for each setting entry to be
		set to true, and then removed that particular key from the
		'settings' variable.
	*/

foreach ($settingsDefaults as $k0 => $v0) {
	if ((array_key_exists("noJS", $v0) && $v0['noJS'] === true)) {
		unset($settings[$k0]);
	}
}

// Start standard $settings to JS global var routine

$jsSettings = "";

$jsSettings .= "\t\tvar settingsDefaults = " . json_encode($settingsDefaults) . ";\n\n";
$jsSettings .= "\t\tvar settings = " . json_encode($settings) . ";\n\n";

$jsSettings .= "\t\tvar languages = " . json_encode($languages) . ";\n\n";

$jsSettings .= "\t\tvar skins = " . json_encode($skins) . ";\n\n";

global $myAuth;
if (isset($myAuth)) $jsSettings .= "\t\tvar localUName = " . json_encode($myAuth->username) . ";\n\n";

echo "\n\t<script id='jsSettings'>\n\t\t" . '"use strict";' . "\n\n";
echo $jsSettings;
echo "\t</script>\n";


/* language file */

$uilang = $settings['interfaceLanguage'];

$uilang_messages = [];

if (!file_exists(__DIR__ . '/../lang/' . $uilang . '.json')) {
	if (file_exists(__DIR__ . '/../lang/EN.json')) {
		$uilang = 'EN';
	} else {
		$uilang_messages[] = "No language file found for neither $uilang nor EN. Please contact the administrator.";
		die();
	}
}

$langScriptFile = file_get_contents(__DIR__ . '/../js/lang.js');
$langScriptFile = str_replace("[/*loadingMessages*/]", json_encode($uilang_messages), $langScriptFile);

$msgStrings = file_get_contents(__DIR__ . '/../lang/' . strtoupper($uilang) . '.json');
$langScriptFile = str_replace("{/*msgStrings*/}", $msgStrings, $langScriptFile);

if ($uilang !== 'EN') {
	//only load the English messages as failover if the main language is something other than English
	$msgStrings = file_get_contents(__DIR__ . '/../lang/EN.json');
	$langScriptFile = str_replace("{/*enStrings*/}", $msgStrings, $langScriptFile);
}

echo "\n\t<script id='jsLang'>\n";
echo $langScriptFile;
echo "\n\t</script>\n";
