<?php

	require_once "valueFormats.php";

	class OasysParserPlugin {

		/*
		 * this class describes a parser plugin for OASYS v2+ for supporting v1 keywords
		 */

		/* static properties */
		private static $plugins = [];

		/* instance properties */
		private string $id;
		private string $pattern;
		private int $captureGroup;
		private array $additionalCaptures;
		private array $attributes = [];
		private ?string $preprocess = null;
		private ?string $postprocess = null;
		private string $prefix = 'field_';
		private string $category = 'fields';
		private string $categoryKey = '';
		private string $categoryMode = 'list';
		private array $properties = [];
		private ?string $labelType = null;

		/* constructor */
		function __construct($id, $pattern, $captureGroup = 1, $additionalCaptures = []) {

			$this->id = $id;
			$this->pattern = $pattern;
			$this->captureGroup = $captureGroup;
			$this->additionalCaptures = $additionalCaptures;

			if (!isset(self::$plugins[$id])) {
				/*
					Having more than 1 instance of the same type does not make any sense, but it does not cause any problems
					either. We'll only register the first instance in the static $plugins array, though
				*/
				self::$plugins[$id] = $this;
			}

			//common attributes for all plugins
			$this->registerAttribute('required', ['pattern' => '/\b(OPTIONAL)\b/i', 'cast' => 'boolean', 'invert' => true, 'appliesTo' => ['fields']]);
			$this->registerAttribute('export', ['pattern' => '/\b(?:EXPORT="(.*?)"|EXPORT()\b)/i', 'appliesTo' => ['fields']], true);
			$this->registerAttribute('comment', ['pattern' => '/\bCOMMENT="(.*?)"/i', 'appliesTo' => ['fields']], true);
			$this->registerAttribute('scoring', ['pattern' => '/SCORE\s*=\s*"(.*?)"/i'], true);
		}


		/*-------------------------*
		 * public instance methods *
		 *-------------------------*/

		/* getter for the id of the instance */
		public function getId(): string {
			return $this->id;
		}

		/* getter for the field pattern */
		public function getPattern(): string {
			return $this->pattern;
		}

		/* getter for the capture group */
		public function getCaptureGroup(): int {
			return $this->captureGroup;
		}

		/* getter & setter for the prefix for autonaming */
		public function setPrefix($prefix) {
			$this->prefix = $prefix;
		}

		public function getPrefix(): string {
			return $this->prefix;
		}

		/*
			getter & setter for the category (either 'fields', 'static', 'options' or 'labels')
			fields		any kind of field that gathers data and saves results
			static		elements like audio or video that do not save results
			options		extra data that will be removed entirely from the item and applied differently (e.g. custom CSS rules)
			labels		labels linked to fields
		*/
		public function getCategory(): string {
			return $this->category;
		}

		public function setCategory($category) {
			$this->category = $category;
		}

		/* getter & setter for the categoryKey (used only if category is 'options') */
		public function getCategoryKey(): string {
			return $this->categoryKey;
		}

		public function setCategoryKey($key) {
			$this->categoryKey = $key;
		}

		/* getter & setter for the categoryMode (used only if category is 'options', can be 'list' or 'value')
			list => an array is created and each of these keywords is added to this list
			value => the value is set as is, overwriting any previous values (there can only be one) */
		public function getCategoryMode(): string {
			return $this->categoryMode;
		}

		public function setCategoryMode($mode) {
			$this->categoryMode = $mode;
		}

		/* getter, setter and other helper functions for managing custom properties that each parser instance might need */
		public function getProperty($key) {
			return $this->properties[$key] ?? null;
		}

		public function setProperty($key, $value) {
			$this->properties[$key] = $value;
		}

		public function increaseProperty($key, $step = 1) {
			$this->properties[$key] += $step;
		}

		public function decreaseProperty($key, $step = 1) {
			$this->properties[$key] -= $step;
		}

		public function defineArray($key, $contents = false) {
			if (!is_array($contents)) {
				$this->properties[$key] = [];
			} else {
				$this->properties[$key] = $contents;
			}
		}

		public function addToArray($key, $value) {
			if (is_array($this->properties[$key])) {
				$this->properties[$key][] = $value;
			}
		}

		/* registration of an attribute syntax (called right after creation) */
		public function registerAttribute($key, $specs, $skipDefaultValue = false) {
			try {
				if (!isset($key)) {
					throw new Exception("Error: registerAttribute requires a key!");
				}
				if (!isset($specs['pattern'])) {
					$specs['pattern'] = false;
				}
				if (!isset($specs['group'])) {
					$specs['group'] = 1;
				}
				if (!isset($specs['defaultValue']) && !$skipDefaultValue) {
					$specs['defaultValue'] = "";
				}
				if (!isset($specs['deprecated'])) {
					$specs['deprecated'] = false;
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

		/* register a custom function that is run before attributes are evaluated */
		public function registerPreProcess($function) {
			try {
				if (isset($this->preprocess)) {
					throw new Exception("Error: only one preprocess function can be set per plugin type!");
				}
				if (!is_callable($function)) {
					throw new Exception("Error: registerPreProcess received non callable argument!");
				}

				$this->preprocess = $function;
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
				if (!is_callable($function)) {
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

		/* register a string to match with the type attribute of a label, e.g. RB for radiobuttons etc. */
		public function setLabelType($type) {
			$this->labelType = $type;
		}

		public function getLabelType(): ?string {
			return $this->labelType;
		}

		/* settings parser (called by source parser) */
		public function parseSettings($attributeText, $lng, $globalMatches, $itemId): array {

			//replace UTF8 nonbreaking space, in order for attributes to be separated correctly
			$attributeText = mb_eregi_replace("\xC2\xA0", " ", $attributeText);

			$settings = ['type' => $this->id, 'category' => $this->category];
			if ($this->category === 'field') {
				$settings['required'] = true; //true by default, can be changed by introducing the "OPTIONAL" attribute
			} else {
				$settings['required'] = false;
			}

			//add additional capture groups to the settings
			if (count($this->additionalCaptures) > 0) {
				foreach ($this->additionalCaptures as $k => $n) {
					if (isset($globalMatches[$n])) {
						$settings[$k] = $globalMatches[$n];
					}
				}
			}

			if (isset($this->preprocess)) {
				/* the preprocess function always gets the $settings variable, which it is bound to need
				as well as a pointer to the current instance which is necessary to get hold of custom properties */
				call_user_func_array($this->preprocess, [&$settings, &$this, $lng, $itemId]);
			}

			foreach ($this->attributes as $key => $attrib) {

				/* if no pattern is defined, this attribute will be created by postprocessing and can ignored here */
				if ($attrib['pattern'] === false) {
					continue;
				}

				if (isset($attrib['appliesTo']) && !in_array($this->category, $attrib['appliesTo'])) {
					continue;
				}
				$group = $attrib['captureGroup'] ?? 1;
				$default = $attrib['defaultValue'] ?? null;
				$deprecated = $attrib['deprecated'];
				if ($deprecated || $default === null) {
					//if a setting is deprecated it should not get a default value if it does not exist
					if (!self::testAttributePresence($attrib['pattern'], $attributeText)) {
						continue;
					}
				}
				$value = self::rxAttribute($attrib['pattern'], $attributeText, $group, $default);

				if ($value === null) {
					continue;
				}

				if (!isset($attrib['decodeEntities']) || $attrib['decodeEntities'] === true) {
					$value = html_entity_decode($value);
				}

				if (isset($attrib['cast'])) {
					switch ($attrib['cast']) {
						case 'boolean':
							$value = boolval($value);
							break;
						case 'int':
						case 'integer':
							$value = intval($value);
							break;
						case 'float':
							$value = floatval($value);
							break;
						case 'cssUnit':
							//add px unit if no unit is given
							if (preg_match("/^(\d+)$/", $value, $matches)) {
								$value = $value . "px";
							}
							break;
					}
				}

				if (isset($attrib['encode']) && $attrib['encode'] === 'hex') {
					$value = bin2hex($value);
				}

				if (isset($attrib['invert']) && $attrib['invert'] === true) {
					$value = !$value;
				}

				if (isset($attrib['validValues'])) {
					if (!in_array($value, $attrib['validValues'])) {
						$value = $default;
					}
				}

				if (isset($attrib['localised']) && $attrib['localised'] === true) {
					$settings[$key][$lng] = $value;
				} else {
					$settings[$key] = $value;
				}

				if (isset($attrib['process'])) {
					call_user_func_array($attrib['process'], [&$settings, $key, $lng]);
				}

				if (isset($attrib['domAttributeName'])) {
					$settings['domAttributes'][$attrib['domAttributeName']] = $value;
				}
			}

			if (isset($settings['export'])) {
				if ($settings['export'] === "") {
					//if EXPORT attribute is set, but no name specified, export under ID of field
					$settings['export'] = $settings['id'];
				}
			}

			if (isset($this->postprocess)) {
				/* the postprocess function always gets the $settings variable, which it is bound to need
				as well as a pointer to the current instance which is necessary to get hold of custom properties */
				call_user_func_array($this->postprocess, [&$settings, &$this, $lng, $itemId]);
			}

			if (isset($settings['scoring'])) {
				if (preg_match('/^(-?\d+(?:\.5)?)\s+(-?\d+(?:\.5)?)\s+(-?\d+(?:\.5)?)\s+(-?\d+(?:\.5)?)$/', $settings['scoring'], $matches)) {
					$settings['score'] = [
						'initial' => floatval($matches[1]), 'correct' => floatval($matches[2]), 'wrong' => floatval($matches[3]), 'missing' => floatval($matches[4])
					];
					$this->setProperty('score', $settings['score']);
				}
			} else {
				$settings['score'] = $this->getProperty('score');
			}

			unset($settings['scoring']);
			return $settings;
		}

		/* post process method for the 'options' attribute, available in some fields */
		public function processOptions(&$settings) {
			$optList = [];
			$options = $settings['options'];
			if ($options) {
				$optArray = preg_split('/[;|]\s*/', $options);
				foreach ($optArray as $option) {
					$optList[$option] = true;
				}
			}

			if (!isset($settings['required'])) {
				if (isset($optList['optional']) && ($optList['optional'] === true)) {
					$settings['required'] = false;
					unset($optList['optional']);
				} else {
					$settings['required'] = true;
				}
			}
			$settings['options'] = $optList;
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
			if (!isset($this->attributes[$attribute])) {
				return 0;
			}
			if (!isset($this->attributes[$attribute]['localised'])) {
				return false;
			}
			return ($this->attributes[$attribute]['localised'] == true);
		}

		/* for debugging purposes only */
		public function getAttributes(): array {
			return $this->attributes;
		}



		/*----------------*
		 * static methods *
		 *----------------*/

		/* getter for the static list of plugins */
		public static function getPlugins(): array {
			return self::$plugins;
		}

		/* getter for one specific plugin */
		public static function getPlugin($pluginName) {
			return self::$plugins[$pluginName] ?: null;
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