<?php

	namespace oasysTestIndex;

	use OasysParserPlugin;

	$plugin = new OasysParserPlugin('oasysTestIndex', '/\[@INDEX\b(.*?)@?\]/i');
	$plugin->registerAttribute('includeStandAlone', ['pattern' => '/\b(ALL)\b/i', 'cast' => 'boolean', 'defaultValue' => false]);
	$plugin->setPrefix("testIndex_");
	$plugin->setCategory('static');

	/*
	By default only stimuli that are linked to an item are listed, but not standalone stimuli. The 'ALL' attribute
	allows to add those as well to the list.
	 */
