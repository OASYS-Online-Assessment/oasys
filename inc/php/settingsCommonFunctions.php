<?php

/* find all installed skins */
function getSkins()
{
	$skins = [];

	//fetch supported skins
	foreach (glob(__DIR__ . "/../../skins/*") as $path) {
		$propertiesPath = $path . '/properties.json';
		if (!file_exists($propertiesPath)) {
			/* skip every folder that does not have the required properties.json file */
			continue;
		}
		$options = file_get_contents($propertiesPath);
		$options = json_decode($options ?? '', true);
		$path = preg_replace('/^.*skins\//', 'skins/', $path);
		$skin = ['folder' => $path, 'id' => $options['id'], 'options' => $options['properties']];
		$skins[$options['id']] = $skin;
	}
	foreach (glob(__DIR__ . "/../../modules/*") as $modulePath) {
		$moduleSkins = $modulePath . "/skins";
		if (!file_exists($moduleSkins)) {
			/* skip every module folder that does not have any skins */
			continue;
		}
		foreach (glob($moduleSkins . '/*') as $path) {
			$propertiesPath = $path . '/properties.json';
			if (!file_exists($propertiesPath)) {
				/* skip every folder that does not have the required properties.json file */
				continue;
			}
			$options = file_get_contents($propertiesPath);
			$options = json_decode($options ?? '', true);
			$path = preg_replace('/^.*modules\//', 'modules/', $path);
			$skin = ['folder' => $path, 'id' => $options['id'], 'options' => $options['properties']];
			$skins[$options['id']] = $skin;
		}
	}

	return $skins;
}

/* find all custom modules and load into settings*/

function getMods()
{
	$moduleList = [];
	foreach (glob(__DIR__ . "/../../modules/*", GLOB_ONLYDIR) as $editorModFolder) {
		if (!file_exists($editorModFolder . '/editor/editor.json')) {
			/* skip every folder that does not have the required editor.json file */
			continue;
		}
		array_push($moduleList, json_decode(file_get_contents($editorModFolder . '/editor/editor.json') ?? '', true));
	}

	return $moduleList;
}
