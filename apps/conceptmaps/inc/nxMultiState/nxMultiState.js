"use strict";

(function($) {
	
	//constructor
	function nxMultiState(parent, id, data) {
		const width = 40;
		const height = 40;
		let value;
		const states = data.options;
		const style = data.style;
		const hideWhenDisabled = data.hideWhenDisabled || false;
		const count = states.length;
		if (!count > 0) return;
		const icons = [];
		let undefinedIcon;
		if (data.useIcons) {
			for (let i in states) {
				icons[i] = new Image();
				icons[i].src = states[i].icon;
				icons[i] = $(icons[i])
			}
		} else {
			for (let i in states) {
				icons[i] = $(states[i].html);
			}
		}
		undefinedIcon = new Image();
		undefinedIcon.src = data["undefined"];
		undefinedIcon = $(undefinedIcon);
		const callback = data.callback;
		if (typeof(parent) == 'string') {
			parent = $('#'+parent);
		}
		const div = parent.append("<div></div>").find('div').last();
		div.attr('id', id);
		div.addClass('nxMultiState');
		if (data.tooltip) {
			div.attr('title', data.tooltip);
		}
		if (data.translate) {
			div.attr('data-translate', data.translate);
		}
		div.append("<div class='nxmsDisplay'></div><div class='nxmsGloss'></div>");
		const display = div.find('.nxmsDisplay');
		display.addClass(style);
		const gloss = div.find('.nxmsGloss');
		let touch = false;
		if (data.touch) {
			touch = true;
		} 
		let state = data.state || 0;
		if (hideWhenDisabled) div.hide();
		if (data.active) activate();
		icons[state].addClass('active');
		div.append("<div class='nxmsArrow'><div class='nxmsDown'></div></div>");
		const arrow  = div.find('.nxmsArrow');
		const popupWidth = Math.ceil(Math.sqrt(count));
		const popupHeight = Math.ceil(count/popupWidth);
		$('body').append(stringf('<div id="veil_%@" class="nxmsVeil"></div>',id));
		const veil = $('#veil_'+id);
		veil.hide();
		veil.append(stringf('<div id="popup_%@" class="nxmsPopup"></div>',id));
		const popup = $('#popup_'+id);
		popup.width(popupWidth * width);
		for (let i = 0; i < popupHeight; i++) {
			for (let j = 0; j < popupWidth; j++) {
				const n = i * popupWidth + j;
				if (n >= count) break;
				popup.append(icons[n]);
				if (touch) {
					icons[n].on('touchstart', {n: n}, select);
				} else {
					icons[n].click({n: n}, select);
				}
			}
		}
		if (touch) {
			veil.on('touchstart', collapse);
			div.on('touchstart', clicked);
		} else {
			veil.click(collapse);
			div.click(clicked);
		}
		$('.nxmsPopup img').on('dragstart', function(e) {
			return false;
		});
		setState(true);
	
		//called when any part of the button is clicked/touched
		function clicked(event) {
			if (!div.hasClass('active')) return;
			expand(event);
		}
		
		//make all the modifications when state changes
		function setState(noCallBack) {
			popup.children().removeClass('active');
			if (state < 0) {
				value = 'undefined';
				display.html(undefinedIcon);
			} else {
				value = states[state].value;
				display.html(icons[state].clone(false, false).removeAttr('id'));
				icons[state].addClass('active');
				if (callback && !noCallBack) callback(id, value);
			}
		} 
		
		//executed on clicking the arrow button
		function expand(event) {
			if (!div.hasClass('active')) return;
			const x = div.offset().left;
			const y = div.offset().top + div.height();
			popup.css({top: y+'px', left: x+'px'});
			veil.show();
		}
		
		//executed on clicking anywhere on the screen in expanded mode
		function collapse(event) {
			veil.hide();
			return false;
		}
		
		//executed on selecting something from popup
		function select(event) {
			state = event.data.n;
			setState();
		}
		
		//make button active
		function activate() {
			div.addClass('active');
			if (hideWhenDisabled) div.show();
		}
		
		//make button inactive
		function deactivate() {
			div.removeClass('active');
			if (hideWhenDisabled) div.hide();
		}
		
		//getter
		function getValue() {
			return value;
		}
		
		//setter
		function setValue(v) {
			state = -1;
			for (let i in states) {
				if (states[i].value === v) state = i;
			}
			setState(true);
		}
		
		//reset to default value
		function reset() {
			state = 0;
			setState();
		}
		
		this.setValue = setValue;
		this.deactivate = deactivate;
		this.activate = activate;
	
	}
	
	window.nxMultiState = nxMultiState;

})(jQuery);
