<?php

	require_once "valueFormats.php";

	class OasysParserPreProcessor {

		/*
		 * this class describes a parser plugin preprocessor for OASYS v2+
		 */

		/* static properties */
		private static $processors = [];

		/* instance properties */
		private $id;
		private $pattern;
		private $captureGroup;
		private $additionalCaptures;
		private array $attributes = [];
		private $postprocess = null;

		/* constructor */
		function __construct($id, $pattern, $captureGroup = 1, $additionalCaptures = []) {

			$this->id = $id;
			$this->pattern = $pattern;
			$this->captureGroup = $captureGroup;
			$this->additionalCaptures = $additionalCaptures;

			if (!isset(self::$processors[$id])) {
				self::$processors[$id] = $this;
			}

		}


		/*-------------------------*
		 * public instance methods *
		 *-------------------------*/

		/* getter for the id of the instance */
		public function getId() {
			return $this->id;
		}

		/* getter for the field pattern */
		public function getPattern() {
			return $this->pattern;
		}

		/* getter for the capture group */
		public function getCaptureGroup(): int {
			return $this->captureGroup;
		}

		/* registration of an attribute syntax (called right after creation) */
		public function registerAttribute($key, $specs, $skipDefaultValue = false) {
			try {
				if (!isset($key)) {
					throw new Exception("Error: registerAttribute requires a key!");
				}
				if (!isset($specs['pattern']) || !isset($key)) {
					$specs['pattern'] = false;
				}
				if (!isset($specs['defaultValue']) && !$skipDefaultValue) {
					$specs['defaultValue'] = "";
				}
				$this->attributes[$key] = $specs;
			} catch (Exception $e) {
				/* global log of handled exceptions */ global $handledExceptions;
				$newError = [];
				$newError['msg'] = $e->getMessage();
				$newError['stackTrace'] = explode(PHP_EOL, $e->getTraceAsString());
				$handledExceptions[] = $newError;
				error_log($newError['msg']);
				foreach ($newError['stackTrace'] as $line) {
					error_log($line);
				}
			}
		}

		/* register a custom function that is run after all attributes have been evaluated */
		public function registerPostProcess($function) {
			try {
				if (isset($this->postprocess)) {
					throw new Exception("Error: only one postprocess function can be set per plugin type!");
				}
				if (is_callable($this->postprocess)) {
					throw new Exception("Error: registerPostProcess received non callable argument!");
				}

				$this->postprocess = $function;
			} catch (Exception $e) {
				/* global log of handled exceptions */ global $handledExceptions;
				$newError = [];
				$newError['msg'] = $e->getMessage();
				$newError['stackTrace'] = explode(PHP_EOL, $e->getTraceAsString());
				$handledExceptions[] = $newError;
				error_log($newError['msg']);
				foreach ($newError['stackTrace'] as $line) {
					error_log($line);
				}
			}
		}

		/* settings parser (called by source parser) */
		public function parseSettings($attributeText, $lng, $globalMatches, $itemId): string {

			//replace UTF8 nonbreaking space, in order for attributes to be separated correctly
			$attributeText = mb_eregi_replace("\xC2\xA0", " ", $attributeText);

			$settings = [];

			//add additional capture groups to the settings
			if (count($this->additionalCaptures) > 0) {
				foreach ($this->additionalCaptures as $k => $n) {
					if (isset($globalMatches[$n])) {
						$settings[$k] = $globalMatches[$n];
					}
				}
			}

			foreach ($this->attributes as $key => $attrib) {

				/* if no pattern is defined, this attribute will be created by postprocessing and can ignored here */
				if ($attrib['pattern'] === false) continue;

				$group = isset($attrib['captureGroup']) ? $attrib['captureGroup'] : 1;
				$default = isset($attrib['defaultValue']) ? $attrib['defaultValue'] : null;
				$value = self::rxAttribute($attrib['pattern'], $attributeText, $group, $default);

				if ($value == null) continue;

				if (isset($attrib['cast'])) {
					switch ($attrib['cast']) {
						case 'boolean':
							$value = boolval($value);
							break;
						case 'int':
						case 'integer':
							$value = intval($value);
					}
				}

				if (!isset($attrib['decodeEntities']) || $attrib['decodeEntities'] === true) {
					$value = html_entity_decode($value);
				}

				if (isset($attrib['localised']) && $attrib['localised'] === true) {
					$settings[$key][$lng] = $value;
				} else {
					$settings[$key] = $value;
				}

				if (isset($attrib['process'])) {
					call_user_func_array($attrib['process'], [&$settings, $key, $lng]);
				}
			}

			if (isset($this->postprocess) && is_callable($this->postprocess)) {
				/* the postprocess function always gets the $settings variable, which it is bound to need
				as well as a pointer to the current instance which is necessary to get hold of custom properties */
				return call_user_func_array(callback: $this->postprocess, args: [&$settings, &$this, $lng, $itemId]);
			} else {
				return '';
			}

		}

		/* post process method that explodes a string with pipes as delimiter */
		public function splitString(&$settings, $key, $lng) {
			$s = $settings[$key];
			unset($settings[$key]);
			if (is_array($s) && isset($lng)) {
				$a = explode("|", $s[$lng]);
				$settings[$key][$lng] = $a;
			} else {
				$a = explode("|", $s);
				$settings[$key] = $a;
			}
		}

		/* return whether or no $attribute is localised */
		public function isLocalised($attribute) {
			if (!isset($this->attributes[$attribute])) return 0;
			if (!isset($this->attributes[$attribute]['localised'])) return false;
			return ($this->attributes[$attribute]['localised'] == true);
		}

		/* for debugging purposes only */
		public function getAttributes() {
			return $this->attributes;
		}



		/*----------------*
		 * static methods *
		 *----------------*/

		/* getter for the static list of plugins */
		public static function getProcessors() {
			return self::$processors;
		}

		/* getter for one specific plugin */
		public static function getPlugin($pluginName) {
			return self::$processors[$pluginName] ? self::$processors[$pluginName] : false;
		}

		/* method for parsing a single attribute (called by parseSettings) */
		public static function rxAttribute($pattern, $attributes, $group, $default) {
			preg_match($pattern, $attributes, $captures);
			if (count($captures) >= $group) {
				return $captures[$group];
			} else {
				return $default;
			}
		}

		public static function testAttributePresence($pattern, $attributes) {
			return preg_match($pattern, $attributes);
		}

	}