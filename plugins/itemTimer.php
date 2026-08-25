<?php

	namespace oasysItemTimer;

	use OasysParserPlugin;

	$plugin = new OasysParserPlugin('oasysItemTimer', '/(?:<(p|div|span).*?>)\s*\[@TIMER\b(.*?)@?\]\s*<\/\1>/i', 2);
	$plugin->setPrefix("itemTimer_");
	$plugin->setCategory('options');
	$plugin->setCategoryKey('timer');
	$plugin->registerAttribute('timeOut', ['pattern' => '/TIMEOUT\s*=\s*"(\d+?)"/i', 'cast' => 'integer']);
	$plugin->registerAttribute('id', ['pattern' => '/ID\s*=\s*"(.*?)"/i']);

	//TODO: make sure ID!='default' => reserved id