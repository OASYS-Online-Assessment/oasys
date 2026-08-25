<?php namespace oasysLabel;

use OasysParserPlugin;

$plugin = new OasysParserPlugin('oasysLabel', '/\[@LB\b(.*?)@?\](.*?)\[@\/LB@?\]/i');
$plugin->setPrefix("LB");
$plugin->setCategory("labels");
$plugin->registerAttribute('labelType', ['pattern' => '/TYPE\s*=\s*"(.*?)"/i', 'defaultValue' => '*']);
$plugin->registerAttribute('link', ['pattern' => '/LINK\s*=\s*"(.*?)"/i', 'defaultValue' => '']);

/*
In the LINK attribute we can put the GROUP of a radio button or check box (or the id of a textfield) in order to
force the parser to link the label to the correct field. This is mainly necessary when using a likert scale in the
top of an item (which for obvious reasons do not have clickable labels) and then adding some "normal" radio buttons
that need to get labels. Then the label must be forced to ignore the likert radio buttons
 */