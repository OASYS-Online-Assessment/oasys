/*

	nxProgress v1.2
		(c) 2014-2024 by Eric J. Francois

	DESCRIPTION:
		implements an animated progress bar

	USAGE:

	include the JS and CSS file in your HTML document
	instantiate the list with:
		new nxProgress(parent, id, options);

	PARAMETERS:
		parent:		name or jQuery object of the parent HTML element
		id:			id for the new element
		options:	an object with the following options
			label:		<string>	label for the progress bar
			style:		<map>		CSS rules to override defaults
			width:		<string>	CSS width string (including units)
			height:		<string>	CSS height string (including units)
			max:		<integer>	max value
			min:		<integer>	min value
			progress:	<integer>	initial progress

	METHODS:
		setMin(min)			change minimum value
		setMax(max)			change maximum value
		setProgress(p)		update progress value
		startAnimating()	starts animation
		stopAnimating()		halts animation

	EXAMPLE:

*/

"use strict";

(function ($) {

	function nxProgress(parent, id, data) {
		const label = data.label ?? '';
		let style = data.style ?? {};
		const width = data.width ?? '100px';
		const height = data.height ?? '20px';
		const dimensions = {width: width, height: height};
		style = $.extend({}, dimensions, style);
		let max = data.max ?? 100;
		let min = data.min ?? 0;
		let progress = data.progress ?? 0;
		const html = `<div id='${id}' class='nxProgress'><div id='${id}_bar' class='nxProgressBar'>${label}</div></div>`;
		parent.append(html);
		const pBar = $('#' + id);
		const bar = $(`#${id}_bar`);
		if (style) {
			pBar.css(style);
		}
		if (data.animated) {
			startAnimating();
		}
		setProgress(progress);

		/* public methods */

		function setProgress(p) {
			progress = p;
			const w = progress / (max - min) * 100;
			bar.css('width', w+'%');
		}

		function setMin(x) {
			min = x;
		}

		function setMax(x) {
			max = x;
		}

		function startAnimating() {
			bar.addClass('animated');
		}

		function stopAnimating() {
			bar.removeClass('animated');
		}

		pBar.setProgress = setProgress;
		pBar.setMin = setMin;
		pBar.setMax = setMax;
		pBar.startAnimating = startAnimating;
		pBar.stopAnimating = stopAnimating;
		return pBar;

	}

	window.nxProgress = nxProgress;

})(jQuery);
