$(onDOMReady);

function onDOMReady() {
	initGUI();
	$('header').hide();
	$('#UI').append('<div style="margin: 200px auto;"><h1>OASYS Editor</h1><p>'+UILANG.m('Please make a choice from the menu')+'</p></div>');
}
