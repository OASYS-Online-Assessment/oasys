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
		let playbackErrorReported = false;

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

		const source = options.file[language];
		const isBlobSource = String(source).startsWith('blob:');
		const cachedId = isBlobSource ? Object.keys(loader.mediaURLs).find(id => loader.mediaURLs[id] === source) : undefined;
		const mimeType = cachedId !== undefined ? loader.mediaCache[cachedId]?.type : undefined;
		const html = `<${options.mediaType} id='${options.id}' src='${source}' style='max-width: 100%' playsinline>`;
		span.html(html);
		// MediaElement guesses video/mp4 for extensionless URLs unless given a type.
		const mediaNode = span.children().get(0);
		if (mimeType && mediaNode?.canPlayType(mimeType)) {
			mediaNode.setAttribute('type', mimeType);
		}

		let instance = new MediaElementPlayer(options.id, {
			success: function (mediaElement, node, player) {
				$(mediaElement).on('error', playbackError);
				// The HTML5 renderer does not forward every native media error.
				if (node && node !== mediaElement) $(node).on('error', playbackError);
				// MediaElement's Play button does not report rejected play requests.
				const play = player.play;
				player.play = function (...args) {
					const playback = play.apply(this, args);
					if (playback === null && mediaElement.renderer === null) {
						reportPlaybackError('Media playback could not start: no playback renderer available', 'play');
					}
					playback?.catch?.(error => {
						// Pausing or leaving the page can cancel an in-flight play request.
						if (error?.name === 'AbortError' || node?.isConnected === false) return;
						const detail = error?.message || String(error ?? 'No browser error details');
						reportPlaybackError(`Media play request rejected (${error?.name ?? 'Error'}): ${detail}`, 'play');
					});
					return playback;
				};
				mediaElement.load();
				$(mediaElement).on('playing', playBackHasStarted);
				$(mediaElement).on('pause', playBackIsPaused);
				$(mediaElement).on('ended', playBackHasEnded);
				$(mediaElement).on('timeupdate', playBackProgress);
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
			// MediaElement can call listeners with a synthetic event whose target is null.
			const event = e.originalEvent ?? e;
			const mediaError = event.target?.error ?? event.detail?.target?.originalNode?.error;
			const code = mediaError?.code;
			const message = mediaError?.message || event.message || 'No browser error details';
			reportPlaybackError(`Media playback failed${code ? ` (code ${code})` : ''}: ${message}`, 'mediaError');
		}

		function reportPlaybackError(message, stage) {
			if (playbackErrorReported) return;
			playbackErrorReported = true;

			const error = new Error(message);
			console.error(error);
			global_prepareJSErrorReport({error, filename: 'plugins/audioVideo.js'}, {
				stage: stage,
				mediaItemId: item.id,
				mediaFieldId: options.id,
				mediaType: options.mediaType,
				mediaLanguage: language,
				mediaSource: isBlobSource ? 'preloaded' : 'url',
				mediaId: cachedId ?? null,
				mediaMimeType: mimeType ?? null
			});
		}

		return this;

	}

	function validResponse(answer) {
		return answer > 0;
	}

	registerPlugin();

})(jQuery);
