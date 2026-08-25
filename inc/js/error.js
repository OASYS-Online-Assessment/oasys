"use strict";
/**
 * Created by eric.francois on 13/09/2016.
 */

function error_init() {
	$('#txt_error').html(global_getText('error', 'fatalError'));
	const returnButtonData = {
		label: global_getText('global', 'returnToLogin'),
		callback: global_returnToLogin,
		default: true
	};
	new nxButton($('#buttonContainer'), 'returnButton', returnButtonData);

}