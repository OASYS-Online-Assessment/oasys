/*
 * OASYS static plugin
 * 
 * audio/video
 *   
 */

"use strict";

(function ($) {

	const type = 'oasysAudioVideo';
	let instance;
	let styleSheet;

	function registerPlugin() {
		if (typeof (plugins) !== 'undefined') {
			plugins[type] = {
				id: type,
				constructor: oasysAudioVideo,
				validResponse: validResponse,
				category: 'fields'	//'fields' = response field, 'static' = static & media elements
			};
		}
	}

	/*
		definition of what constitutes a well formatted answer
		depending on the plugin it could be either a string, an integer, a float, a boolean, a JSON encoded array ... etc.
	 */

	/* test instance of textfield */
	function oasysAudioVideo(parent, options, item, currentValue, language) {
		/*
		parent:			string or jQuery object		container element for this object
		options:			object						structure depends on properties of plugin (see above)
		item:	{
		-			id:		int							id of current item in database
		-			code:	string						item code set in item manager
		}
		currentValue:		string						may need to be parsed to number, boolean, object depending on plugin
		*/

		/* mandatory settings */
		if (typeof (parent) === 'string') {
			parent = $(parent);
		}

		let startTime = core_getMediaProgress(item.id, options.code);

		//tracking playCount
		let playCount = currentValue || 0;

		//timer related
		let duration;
		let playing = false;
		let showTimer = false;

		/* optional settings */
		if (!options) return;
		if (options.navigateOnEnd === true) {
			/* show timer in skin only if there is no global test timer nor an item timer */
			if (!butler.useTimer && fetchFromObjPath(test, ['items', state.currentItemId, 'options', 'timer']) === null) {
				showTimer = true;
			}
		}
		if (playCount >= options.maxPlayCount && options.maxPlayCount > 0) return;
		const features = ['fullscreen', 'current', 'duration', 'playpause']; //'volume' removed here -> not usable if disable controls
		if (!options.disableControls) {
			features.push('progress');
		}
		const clickToPlayPause = (options.disableControls && !options.autoPlay) || (!options.disableControls);

		/* creation */
		const span = parent.first();

		if (options.hidden === true) {
			span.css('display', 'none');
		} else {
			span.css('display', 'inline-block');
			let widthString;
			if (options.info?.[language]?.width) {
				widthString = `min(${options.info[language].width}px, 100%)`;
			} else {
				widthString = `100%`; //fallback if size of video file could not be determined or for audio controls
			}
			span.css('width', widthString);
		}

		const html = `<${options.mediaType} id='${options.id}' src='${options.file[language]}' style='max-width: 100%' playsinline>`;
		span.html(html);

		let instance = new MediaElementPlayer(options.id, {
			success: function (mediaElement, node, instance) {
				mediaElement.load();
				$(mediaElement).on('playing', playBackHasStarted);
				$(mediaElement).on('pause', playBackIsPaused);
				$(mediaElement).on('ended', playBackHasEnded);
				$(mediaElement).on('timeupdate', playBackProgress);
				$(mediaElement).on('error', playbackError);
				if (options.disableControls) {
					parent.addClass('oasys__mejs__disableControls');
					mediaElement.setCurrentTime(startTime);
				}
				if (options.autoPlay) {
					mediaElement.play().catch(function (error) {
						console.log('Autoplay was prevented:', error);
						span.css('display', 'inline-block');
					});
				}
			},
			features: features,
			enableKeyboard: false,
			timeAndDurationSeparator: "<span style='text-align: center; margin: 0 10px;'>/</span>",
			clickToPlayPause: clickToPlayPause,
			poster: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
			showPosterWhenEnded: true,
			showPosterWhenPaused: true,
			iconSprite: 'inc/mejs/mejs-controls.svg'
		});


		/* private methods */
		function sendPlayCount() {
			const data = {
				type: 'answer',
				itemId: item.id,
				fieldType: type,
				fieldId: options.id,
				language: language,
				timestamp: core_getTimestamp(),
				timeLeft: core_getTimeLeft(),
				value: playCount
			};
			core_userEvent(data);
		}

		function sendBehaviour(subType) {
			const event = {
				itemId: state.currentItemId,
				type: 'behaviour',
				language: state.language,
				timestamp: core_getTimestamp(),
				timeLeft: core_getTimeLeft(),
				subType: subType
			};
			core_userEvent(event);
		}

		function playBackHasStarted(e) {
			state.mediaPlaying = {
				code: options.code,
				instance: instance,
				player: span
			};
			duration = Math.round(e.currentTarget.duration);
			if (options.disableControls) {
				parent.children('.mejs__container').css({'pointer-events': 'none'});
			}
			if (options.hidden === true) {
				span.css('display', 'none');
			}
			sendBehaviour('startPlayback');
			playing = true;
		}

		function playBackIsPaused(e) {
			if (state.mediaPlaying.code === options.code) {
				state.mediaPlaying = {};
			}
			playing = false;
			if (options.disableControls) parent.children('.mejs__container').css({'pointer-events': 'auto'});
			sendBehaviour('pausePlayback');
		}

		function playBackHasEnded(e) {
			if (state.mediaPlaying.code === options.code) {
				state.mediaPlaying = {};
			}
			core_clearMediaProgress(item.id, options.code); //media file no longer to be marked as partially played
			let placeHolder;
			playing = false;
			if (typeof (skin_hideTimer) === 'function') {
				skin_hideTimer();
			}
			if (options.disableControls) parent.children('.mejs__container').css({'pointer-events': 'auto'});
			playCount++;
			sendPlayCount();
			sendBehaviour('playbackEnded');
			if (options.navigateOnEnd) {
				core_nextItem(true);
				return;
			}
			if (playCount >= options.maxPlayCount && options.maxPlayCount > 0) {
				const obj = parent.children('.mejs__container');
				const h = obj.outerHeight(true);
				const w = obj.outerWidth(true);
				if (options.noPlaceHolder === false) {
					placeHolder = '<div style="width: ' + w + 'px; height: ' + h + 'px;"></div>';
					span.replaceWith(placeHolder);
				} else {
					if (span.parent().hasClass('oasysInteractionBlock')) {
						span.parent().remove();
					} else {
						span.remove();
					}
				}
			}
		}

		function playBackProgress(e) {
			const secondsUsed = Math.round(e.currentTarget.currentTime);
			core_updateMediaProgress(item.id, {code: options.code, time: secondsUsed});
			if (typeof (duration) === 'undefined' || !playing || !showTimer) return;
			const secondsLeft = duration - secondsUsed;
			let timeLeftString = lpad(secondsLeft % 60, 2, '0');
			const minutesLeft = Math.floor(secondsLeft / 60);
			timeLeftString = lpad(minutesLeft % 60, 2, '0') + ":" + timeLeftString;
			const hoursLeft = Math.floor(minutesLeft / 60);
			timeLeftString = lpad(hoursLeft, 2, '0') + ":" + timeLeftString;
			const percentageUsed = Math.round(secondsUsed / duration * 100);

			const timerData = {
				secondsLeft: secondsLeft,
				timeLeftString: timeLeftString,
				percentageUsed: percentageUsed,
				stringElements: {
					seconds: lpad(secondsLeft % 60, 2, '0'),
					minutes: lpad(minutesLeft % 60, 2, '0'),
					hours: lpad(hoursLeft, 2, '0')
				}
			};
			skin_setTimer(timerData);
		}

		function playbackError(e) {
			console.error('Error occurred: ' + e.target.error.code);
		}

		return this;

	}

	function validResponse(answer) {
		return answer > 0;
	}

	registerPlugin();

})(jQuery);