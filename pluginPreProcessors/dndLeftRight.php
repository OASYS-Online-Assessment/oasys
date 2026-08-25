<?php namespace oasysDndLeftRight;

use OasysParserPreProcessor;

$processor = new OasysParserPreProcessor('oasysDNDLeftRight', '/<(p|div)>\[@DND\/LR\b(.*?)@\]<\/\1>/i', 2);
$processor->registerAttribute('layout', ['pattern' => '/LAYOUT="(.*?)"/i', "defaultValue" => "default"], false);
$processor->registerAttribute('titleLeft', ['pattern' => '/TITLELEFT="(.*?)"/i'], true);
$processor->registerAttribute('titleRight', ['pattern' => '/TITLERIGHT="(.*?)"/i'], true);
$processor->registerAttribute('titleCenter', ['pattern' => '/TITLECENTER="(.*?)"/i'], true);
$processor->registerAttribute('fontsize', ['pattern' => '/FONTSIZE="(.*?)"/i', "defaultValue" => "inherit"]);
$processor->registerAttribute('lines', ['pattern' => '/LINES="(.*?)"/i', "defaultValue" => 2, 'cast' => 'integer']);
$processor->registerAttribute('labels', ['pattern' => '/LABELS="(.*?)"/i', 'localised' => true, 'process' => [$processor, 'splitString']], true);
$processor->registerAttribute('maxLeft', ['pattern' => '/MAXLEFT\s*=\s*"(\d*?)"/i', 'cast' => 'integer'], true);
$processor->registerAttribute('maxRight', ['pattern' => '/MAXRIGHT\s*=\s*"(\d*?)"/i', 'cast' => 'integer'], true);
$processor->registerPostProcess(__NAMESPACE__ . '\createHTML');

function createHTML(&$settings, $processor, $lng): string {
	$html = '';

	switch ($settings['layout']) {
		case 'narrow':
			$columnWidth = 242;
			break;
		default:
			$columnWidth = 312;
	}
	$draggableWidth = $columnWidth - 16;
	$fontSize = $settings['fontsize'];
	$lines = $settings['lines'];

	if (preg_match("/^(\d+)px$/", $fontSize, $captures)) {
		$h1 = floor(($captures[1] * 1.5 - 1) * $lines);
	} else {
		$h1 = 23 * $lines;
	}
	$h2 = ($h1 + 11);
	foreach ($settings['labels'][$lng] as $k => $label) {
		$value = $k+1;
		$n = str_pad($value, 2, '0', STR_PAD_LEFT);
		$html.='<p>[@DG ID="dg' . $n. '" PARENT="stock" STYLE="font-size: ' . $fontSize .'; width: ' . $draggableWidth . 'px; height: ' . $h1 . 'px; border: 1px solid black; padding: 2px; background-color: #E5F2F7;" VALUE="' . $value . '" LABEL="' . $label . '"@]</p>';
	}
	$dgCount = count($settings['labels'][$lng]);
	$height = $h2 * $dgCount;
	if (isset($settings['titleLeft']) || isset($settings['titleRight']) || isset($settings['titleCenter'])) {
		$lTitle = isset($settings['titleLeft']) ? "<b>{$settings['titleLeft']}</b>" : "&nbsp;";
		$rTitle = isset($settings['titleRight']) ? "<b>{$settings['titleRight']}</b>" : "&nbsp;";
		$cTitle = isset($settings['titleCenter']) ? "<b>{$settings['titleCenter']}</b>" : "&nbsp;";
	} else {
		$lTitle = $rTitle = $cTitle = "";
	}
	$maxLeft = $settings['maxLeft'] ?? $dgCount;
	$maxRight = $settings['maxRight'] ?? $dgCount;
	$html .=	'<table style="border: 1px solid black;">';
	$html .=	'<tbody>';
	$html .=	'<tr>';
	$html .=	'<td style="background-color: #eeeeee; text-align: center;">' . $lTitle;
	$html .=	'<div>[@DZ ONFULL="refuse" ID="dz_left" RULE="0+" MAX="' . $maxLeft . '" STYLE="position: relative; width: ' . $columnWidth .'px; height: ' . $height . 'px; margin: 3px 0; background-color: none;" PADDING="5"@]</div>';
	$html .=	'</td>';
	$html .=	'<td style="background-color: #ffffff; text-align: center;">' . $cTitle;
	$html .=	'<div>[@DZ ONFULL="refuse" ID="stock" RULE="0" MAX="' . $dgCount . '" STYLE="position: relative; width: ' . $columnWidth .'px; height: ' . $height . 'px; background-color: none; border: none;" PADDING="5" CONTAINS="*" @]</div>';
	$html .=	'</td>';
	$html .=	'<td style="background-color: #eeeeee; text-align: center;">' . $rTitle;
	$html .=	'<div>[@DZ ONFULL="refuse" ID="dz_right" RULE="0+" MAX="' . $maxRight . '" STYLE="position: relative; width: ' . $columnWidth .'px; height: ' . $height . 'px; margin: 3px 0; background-color: none;" PADDING="5"@]</div>';
	$html .=	'</td>';
	$html .=	'</tr>';
	$html .=	'</tbody>';
	$html .=	'</table>';
	return $html;
}