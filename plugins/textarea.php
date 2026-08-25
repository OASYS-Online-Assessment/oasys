<?php namespace oasysTextarea;

	use OasysParserPlugin;

	$plugin = new OasysParserPlugin('oasysTextarea', '/\[@TA#?\b(.*?)@\]/i', 1);
	$plugin->setPrefix("ta_");
	$plugin->registerAttribute('id', ['pattern' => '/ID\s*=\s*"(.*?)"/i']);
	$plugin->registerAttribute('pattern', ['pattern' => '/PATTERN\s*=\s*"(.*?)"/i']);
	$plugin->registerAttribute('width', ['pattern' => '/\bWIDTH\s*=\s*"(.*?)"/i', 'cast' => 'cssUnit', 'defaultValue' => '990']);
	$plugin->registerAttribute('maxwidth', ['pattern' => '/\bMAXWIDTH\s*=\s*"(.*?)"/i', 'cast' => 'cssUnit', 'defaultValue' => 'calc(100% - 25px)']);
	$plugin->registerAttribute('height', ['pattern' => '/\bHEIGHT\s*=\s*"(.*?)"/i', 'cast' => 'cssUnit', 'defaultValue' => '200']);
	$plugin->registerAttribute('prefill', ['pattern' => '/(PREFILL|VALUE)\s*=\s*"(.*?)"/i', 'captureGroup' => 2]);
	$plugin->registerAttribute('readOnly', ['pattern' => '/(READONLY)/i', 'cast' => 'boolean', 'defaultValue' => false]);
	$plugin->registerAttribute('resize', ['pattern' => '/RESIZE\s*=\s*"(.*?)"/i', 'defaultValue' => 'none']);
	$plugin->registerAttribute('alignment', ['pattern' => '/ALIGN\s*=\s*"(.*?)"/i', 'validValues' => ['left', 'right', 'center'], 'defaultValue' => 'left']);
	$plugin->registerAttribute('placeholder', ['pattern' => '/PLACEHOLDER\s*=\s*"(.*?)"/i', 'localised' => true]);
	$plugin->registerAttribute('options', ['pattern' => '/OPTIONS?\s*=\s*"(.*?)"/i', 'process' => [$plugin, 'processOptions']]);
	$plugin->registerPostProcess(__NAMESPACE__ . '\cleanup');
	$plugin->setLabelType('TA');

	function cleanup(&$settings) {
		$settings['processing'] = 'none';
		$settings['signature'] = "TA {$settings['id']}";
	}