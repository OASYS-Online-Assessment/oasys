/*
nxPopup v2.3

changes :
 - added hide feature in addition to toggle

*/

"use strict";

(function($) {
		
	//constructor
	function nxPopup(id, data) {
		$('body').append('');
		const blurTarget = data.blurTarget ?? null;
		const height = data.height ?? 0;
		const width = data.width ?? 0;
		let x = '50%';
		let y = '50%';
		let topMargin = (data.fixedTopMargin !== undefined) ? data.fixedTopMargin : -Math.ceil(height / 2) - 10;
		let leftMargin = -Math.ceil(width / 2) - 20;

		if (data.anchor) { // position close to given element
			let anchor = data.anchor;
			if (typeof(anchor) == 'string') {
				anchor = $('#' + anchor);
			}
			// overwrite default 
			x = anchor.offset().left+ (data.x ?? 0)+'px';
			y = anchor.offset().top + anchor.height()+ (data.y ?? 0)+'px';
			topMargin  = 0;
			leftMargin = 0;
		}


		$('body').append(`<div id="veil_${id}" class="nxPopupVeil"><div id="${id}" class="nxPopup">${data.contents ?? ''}</div></div>`);
		const veil = $('#veil_' + id);
		const box = $('#' + id);
		box.css({
			height: height + 'px',
			width: width + 'px',
			position: 'absolute',
			top: y,
			left: x,
			'margin-left': leftMargin + 'px',
			'margin-top': topMargin + 'px',
			overflow: 'auto'
		});
		veil.on("click", hide);
		box.on("click", stopBubble);
		hide();
				
		function hide(e) {
			veil.hide();
			if (blurTarget) blurTarget.removeClass('blurred3');
		}
		
		function stopBubble(e) {
			e.stopImmediatePropagation();
		}

		/*
		 *		methods 
		 */
		
		this.show = function() {
			veil.show();
			if (blurTarget) blurTarget.addClass('blurred3');
		};
		
		this.toggle = function() {
			veil.toggle();
			if (blurTarget) {
				if(veil.is(":visible")){
                	blurTarget.addClass('blurred3');
            	} else{
                	blurTarget.removeClass('blurred3');
            	}
			}
		};

		this.hide = function() {
			veil.hide();
			if (blurTarget) blurTarget.removeClass('blurred3');
		};
	}
	
	window.nxPopup = nxPopup;

})(jQuery);
