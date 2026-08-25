<?php

	namespace oasysLink;

	use OasysParserPlugin;

	$plugin = new OasysParserPlugin('oasysLink', '/\[@LINK\b(.*?)@?\](.*?)\[@\/LINK@?\]/i',1,['innerHTML' => 2]);
	$plugin->setPrefix("link_");
	$plugin->setCategory('static');
	$plugin->registerAttribute('targetCode', ['pattern' => '/\bCODE\s*=\s*"(.*?)"/i'], true);
	$plugin->registerAttribute('targetPage', ['pattern' => '/\bPAGE\s*=\s*"(\d+)"/i', 'cast' => 'integer'], true);
	$plugin->registerAttribute('targetRelative', ['pattern' => '/\bRELATIVE\s*=\s*"([\-+]?\d+)"/i', 'cast' => 'integer'], true);
	$plugin->registerAttribute('first', ['pattern' => '/(FIRST)/i', 'cast' => 'boolean', 'default' => false]);
	$plugin->registerAttribute('last', ['pattern' => '/(LAST)/i', 'cast' => 'boolean', 'default' => false]);
	$plugin->registerAttribute('html', ['localised' => true]); //has no pattern, gets data from capture group 2


	$plugin->registerPostProcess(__NAMESPACE__ . '\finalise');

	function finalise(&$settings, &$plugin, $lng, $itemId) {
		if (!isset($settings['targetPage'])) {
			if ($settings['first'] === true) {
				$settings['targetPage'] = 1;
			} elseif ($settings['last'] === true) {
				$settings['targetPage'] = -1;
			}
		}
		unset($settings['first']);
		unset($settings['last']);

		$settings['html'][$lng] = $settings['innerHTML'];
		unset($settings['innerHTML']);
	}