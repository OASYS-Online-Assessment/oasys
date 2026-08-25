<?php namespace oasysDND;

use OasysParserPlugin;

$plugin = new OasysParserPlugin('oasysDND', '/\[@(DG|DZ)\b(.*?)@\]/i', 2, ['objectType' => 1]);
$plugin->setPrefix("dnd_");
$plugin->registerPreProcess(__NAMESPACE__ . '\preProcess');
$plugin->registerAttribute('style', ['pattern' => '/STYLE\s*=\s*"(.*?)"/i'], true);
$plugin->registerAttribute('html', ['pattern' => '/(?:LABEL|HTML)\s*=\s*"((.*?(<img[^>]*?>).*?)*?|.*?)"/i', 'localised' => true], true);
$plugin->registerAttribute('image', ['pattern' => '/IMAGE\s*=\s*"(.*?)"/i', 'localised' => true], true);

$plugin->registerAttribute('id', ['pattern' => '/ID\s*=\s*"(.*?)"/i'], true);
$plugin->registerAttribute('groups', ['pattern' => '/GROUPS\s*=\s*"(.*?)"/i', 'process' => [$plugin, 'splitString']], true);
$plugin->registerAttribute('behaviour', ['pattern' => '/TYPE\s*=\s*"(.*?)"/i'], true);
$plugin->registerAttribute('onFull', ['pattern' => '/ONFULL\s*=\s*"(.*?)"/i'], true);
$plugin->registerAttribute('padding', ['pattern' => '/PADDING\s*=\s*"(.*?)"/i'], true);
$plugin->registerAttribute('zindex', ['pattern' => '/ZINDEX\s*=\s*"(\d*?)"/i'], true);
$plugin->registerAttribute('maxDraggableCount', ['pattern' => '/MAX\s*=\s*"(\d*?)"/i', 'cast' => 'integer'], true);
$plugin->registerAttribute('orientation', ['pattern' => '/ORIENTATION\s*=\s*"(.*?)"/i'], true);
$plugin->registerAttribute('alignment', ['pattern' => '/ALIGNMENT\s*=\s*"(.*?)"/i'], true);
$plugin->registerAttribute('spacing', ['pattern' => '/SPACING\s*=\s*"(\d*?)"/i', 'cast' => 'integer'], true);
$plugin->registerAttribute('gridSize', ['pattern' => '/GRID\s*=\s*"(\d*?)"/i', 'cast' => 'integer'], true);
$plugin->registerAttribute('onDrop', ['pattern' => '/ONDROP\s*=\s*"(.*?)"/i'], true);
$plugin->registerAttribute('orderBy', ['pattern' => '/ORDERBY\s*=\s*"(.*?)"/i'], true);
$plugin->registerAttribute('initialDraggables', ['pattern' => '/CONTAINS\s*=\s*"(.*?)"/i', 'process' => [$plugin, 'splitString']], true);
$plugin->registerAttribute('acceptClones', ['pattern' => '/(ACCEPTCLONES)/i', 'cast' => 'boolean', 'default' => false]);

$plugin->registerAttribute('group', ['pattern' => '/GROUP\s*=\s*"(.*?)"/i'], true);
$plugin->registerAttribute('clone', ['pattern' => '/CLONE\s*=\s*"(.*?)"/i', 'cast' => 'boolean'], true);
$plugin->registerAttribute('value', ['pattern' => '/VALUE\s*=\s*"(.*?)"/i'], true);

$plugin->registerAttribute('rule', ['pattern' => '/RULE\s*=\s*"(.*?)"/i'], true);

$plugin->registerPostProcess(__NAMESPACE__ . '\finalise');


function preProcess(&$settings, OasysParserPlugin &$plugin, $lng, $itemId) {
	$plugin->setProperty('score', null);
}


function finalise(&$settings, &$plugin, $lng, $itemId): void {
	$settings['objectType'] = mb_strtolower($settings['objectType']);

	//draggables are no fields, only dropzones are; draggables are marked as optional, as they will never receive a value
	if ($settings['objectType'] === 'dg') {
		$settings['category'] = 'static';
		$settings['required'] = false;
	}

	if (isset($settings['image'])) {
		$settings['html'][$lng] = "<img src='{$settings['image'][$lng]}' alt='' style='vertical-align: middle'>";
		unset($settings['image']);
	}

	if (isset($settings['zindex'])) {
		$zindex = $settings['zindex'];
		unset($settings['zindex']);
		if ($settings['objectType'] === 'dz') {
			$settings['zIndexBaseValue'] = $zindex;
		} else {
			$settings['zIndexDragging'] = $zindex;
		}
	}
	if (isset($settings['value'])) {
		$value = $settings['value'];
		unset($settings['value']);
		$settings['data'] = ['value' => $value];
	}
	if (isset($settings['padding'])) {
		$s = $settings['padding'];
		$matches = [];
		preg_match("/(\d+)\D*(\d*)\D*(\d*)\D*(\d*)/", $s, $matches);
		$padding = ['left' => 0, 'right' => 0, 'top' => 0, 'bottom' => 0];
		if ($matches[1] !== "") {
			$padding['left'] = (int)$matches[1];
			$padding['right'] = (int)$matches[1];
			$padding['top'] = (int)$matches[1];
			$padding['bottom'] = (int)$matches[1];
		}
		if ($matches[2] !== "") {
			$padding['left'] = (int)$matches[2];
			$padding['right'] = (int)$matches[2];
		}
		if ($matches[3] !== "") {
			$padding['bottom'] = (int)$matches[3];
		}
		if ($matches[4] !== "") {
			$padding['left'] = (int)$matches[4];
		}
		$settings['padding'] = $padding;
	}
	if (isset($settings['alignment'])) {
		$s = $settings['alignment'];
		$align = ['x' => 'left', 'y' => 'top'];
		if (preg_match("/right/i", $s)) {
			$align['x'] = 'right';
		}
		if (preg_match("/bottom/i", $s)) {
			$align['y'] = 'bottom';
		}
		$settings['alignment'] = $align;
	}

	$settings['processing'] = 'none';
}