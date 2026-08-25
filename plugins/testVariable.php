<?php

	namespace oasysTestVariable;

	use OasysParserPlugin;

	$plugin = new OasysParserPlugin('oasysTestVariable', '/\[@VAR\b(.*?)@?\]/i');
	$plugin->setPrefix("testVariable_");
	$plugin->setCategory('static');
	$plugin->registerAttribute('name', ['pattern' => '/NAME\s*=\s*"(.*?)"/i']);
