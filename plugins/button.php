<?php

	namespace oasysButton;

	use OasysParserPlugin;

	$plugin = new OasysParserPlugin('oasysButton', '/\[@BUTTON\b(.*?)@\]/i');
	$plugin->setPrefix("button_");
	$plugin->setCategory('static');
	$plugin->registerAttribute('id', ['pattern' => '/ID\s*=\s*"(.*?)"/i']);
	$plugin->registerAttribute('label', ['pattern' => '/(?:NAME|LABEL)\s*=\s*"(.*?)"/i', 'localised' => true]);
	$plugin->registerAttribute('action', ['pattern' => '/(?:FUNCTION|ACTION)\s*=\s*"(.*?)"/i']);
