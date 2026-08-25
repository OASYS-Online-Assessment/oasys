<?php

	namespace oasysCSSRule;

	use OasysParserPlugin;

	$plugin = new OasysParserPlugin('oasysCSSRule', '/(?:<(p|div|span).*?>)\s*\[@CSS\b(.*?)@\]\s*<\/\1>/i', 2);
	$plugin->setPrefix("cssRule_");
	$plugin->setCategory('options');
	$plugin->setCategoryKey('customCSS');
	$plugin->registerAttribute('selector', ['pattern' => '/SELECTOR\s*=\s*"(.*?)"/i']);
	$plugin->registerAttribute('rules', ['pattern' => '/RULES\s*=\s*"(.*?)"/i']);
