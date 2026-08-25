<?php

	require_once __DIR__ . "/../inc/php/initBackend.php";
	require_once __DIR__ . "/../../inc/php/valueFormats.php";
	require_once __DIR__ . "/../../inc/php/mp4Info.php";
	require_once __DIR__ . "/../../inc/php/webmInfo.php";
	require_once __DIR__ . "/../inc/php/MediaTool.php";
	require_once __DIR__ . "/../../inc/php/OasysIdGenerator.php";
	require_once __DIR__ . "/../../inc/php/parser.php";

	class InteractionCompiler
	{

		private array $blocks;
		private array $languages;
		private int $pageId;
		private stdClass $fields;
		private stdClass $options;
		private stdClass $parsed;
		private array $errors;
		private stdClass $scripts;
		private stdClass $metadata;
		private array $flags;
		private rixPDO $db;

		public function __construct(mixed $blocks, mixed $languages, int $id, rixPDO &$db, array $flags = [])
		{
			$this->pageId = $id;
			$this->errors = [];
			$this->fields = new stdClass();
			$this->parsed = new stdClass();
			$this->options = new stdClass();
			$this->scripts = new stdClass();
			$this->metadata = new stdClass();
			// Always emit the media usage index, including for pages with no interactions.
			// Otherwise saving an empty page preserves stale mediaIds from its previous contents.
			$this->metadata->mediaIds = [];
			$this->flags = $flags;
			$this->db = $db;
			$this->blocks = $this->normalizeBlocks($blocks);
			$this->languages = $this->normalizeLanguages($languages);
		}

		private function decodeListInput(mixed $input, string $name, bool $associative): ?array
		{
			if (is_array($input)) {
				$decoded = $input;
			} elseif (is_string($input)) {
				try {
					$decoded = json_decode($input, $associative, 512, JSON_THROW_ON_ERROR);
				} catch (JsonException $e) {
					$this->errors[] = "InteractionCompiler: '$name' contains malformed JSON: " . $e->getMessage();
					return null;
				}
			} else {
				$this->errors[] = "InteractionCompiler: '$name' must be a JSON list or PHP array.";
				return null;
			}

			if (!is_array($decoded) || !array_is_list($decoded)) {
				$this->errors[] = "InteractionCompiler: '$name' must be a list.";
				return null;
			}
			return $decoded;
		}

		private function normalizeBlocks(mixed $blocks): array
		{
			$errorCount = count($this->errors);
			$decoded = $this->decodeListInput($blocks, 'blocks', false);
			if ($decoded === null) return [];

			try {
				// Besides making the input independent from the caller, this preserves
				// the compiler's existing support for blocks supplied as associative arrays.
				$normalized = json_decode(
					json_encode($decoded, JSON_THROW_ON_ERROR),
					false,
					512,
					JSON_THROW_ON_ERROR
				);
			} catch (JsonException $e) {
				$this->errors[] = 'InteractionCompiler: blocks could not be normalized: ' . $e->getMessage();
				return [];
			}

			foreach ($normalized as $index => $block) {
				if (!$block instanceof stdClass) {
					$this->errors[] = "InteractionCompiler: block at index $index must be an object.";
					continue;
				}
				if (!property_exists($block, 'type') || !is_string($block->type) || trim($block->type) === '') {
					$this->errors[] = "InteractionCompiler: block at index $index must have a non-empty string type.";
				}
			}
			return count($this->errors) === $errorCount ? $normalized : [];
		}

		private function normalizeLanguages(mixed $languages): array
		{
			$errorCount = count($this->errors);
			$decoded = $this->decodeListInput($languages, 'languages', true);
			if ($decoded === null) return [];

			$normalized = [];
			foreach ($decoded as $index => $language) {
				if (!is_string($language) || trim($language) === '') {
					$this->errors[] = "InteractionCompiler: language at index $index must be a non-empty string.";
					continue;
				}
				if (in_array($language, $normalized, true)) {
					$this->errors[] = "InteractionCompiler: language at index $index is duplicated.";
					continue;
				}
				$normalized[] = $language;
			}
			if (count($normalized) === 0 && count($this->errors) === $errorCount) {
				$this->errors[] = 'InteractionCompiler: languages must contain at least one entry.';
			}
			return count($this->errors) === $errorCount ? $normalized : [];
		}

		public function compileBlocks(): void
		{
			if (count($this->errors) > 0 || count($this->blocks) === 0 || count($this->languages) === 0) {
				return;
			}
			//initialize media tool
			$mediaTool = new MediaTool();
			if ($mediaTool->hasErrors()) {
				$this->errors = array_merge($this->errors, $mediaTool->getErrors());
				return;
			}
			$mediaData = $mediaTool->parseBlocks($this->blocks, $this->languages);
			$this->errors = array_merge($this->errors, $mediaTool->getErrors());

			// copy all properties from mediaData to this->metadata
			foreach ($mediaData as $property => $value) {
				$this->metadata->$property = $value;
			}

			foreach ($this->blocks as $k => $b) {
				// sanitize some block properties
				// if there is a property called 'id' and if it start with an underscore, set it to empty string
				if (isset($b->id) && str_starts_with($b->id, '_')) {
					$b->id = '';
				}
				// if there is a property called 'export' and if it starts with an underscore or a dollar sign, set it to empty string
				if (isset($b->export) && (str_starts_with($b->export, '_') || str_starts_with($b->export, '$'))) {
					$b->export = '';
				}

				$block = deepCopy($b);
				if (isset($block->__valid) && $block->__valid === false) {
					$this->wrapDiv([], $k);
					continue;
				}
				switch ($block->type) {
					case('advanced'):
						$this->compileAdvancedEditor($block, $k);
						break;
					case('audio'):
						$this->compileAudioEditor($block, $k);
						break;
					case('button'):
						$this->compileButton($block, $k);
						break;
					case('choice'):
						$this->compileChoice($block, $k);
						break;
					case('choicematrix'):
						$this->compileChoiceMatrix($block, $k);
						break;
					case('conceptmap'):
						$this->compileConceptmap($block, $k);
						break;
					case('image'):
						$this->compileImageEditor($block, $k);
						break;
					case('inline_textfields'):
						$this->compileInlineTextfields($block, $k);
						break;
					case('inline_gaps'):
						$this->compileInlineGaps($block, $k);
						break;
					case('languageswitcher'):
						$this->compileLanguageswitcher($block, $k);
						break;
					case('slider'):
						$this->compileSlider($block, $k);
						break;
					case('slikert'):
						$this->compileSlikert($block, $k);
						break;
					case('textarea'):
						$this->compileTextarea($block, $k);
						break;
					case('textfield'):
						$this->compileTextfield($block, $k);
						break;
					case('video'):
						$this->compileVideoEditor($block, $k);
						break;
					case('wysiwyg'):
						$this->compileWysiwygEditor($block, $k);
						break;
					default:
						$this->wrapDiv([], $k);
				}
				//write back id to block
				if (isset($block->id) && $block->id !== '') {
					$this->blocks[$k]->id = $block->id;
				}
				//generate visibility scripts
				if (isset($block->visibility) && $block->visibility !== '') {
					if (isset($this->scripts->visibility) && $this->scripts->visibility !== '') {
						$this->scripts->visibility .= "\n";
					} else {
						$this->scripts->visibility = "";
					}
					$this->scripts->visibility .= "if ($block->visibility) {show('#oasysBlock_$k')} else {hide('#oasysBlock_$k')}";
				}
			}
			$this->sanitizeScoring();
			$this->replacePendingIds();
//			$this->fillBlockIds();
		}


		/* set processing to none if it is set to auto, but correction->data does not meet the expected criteria */
		private function sanitizeScoring(): void
		{
			foreach ($this->fields as $id => $field) {
				if (isset($field->processing)) {
					if ($field->processing === 'auto') {
						switch ($field->correction->format) {
							case VALUES_STRING:
								if ($field->correction->data === '') {
									$field->processing = 'none';
								}
								break;
							case VALUES_STRING_ARRAY:
								if (is_object($field->correction->data)) {
									/* in case of a meta field like choice matrix, this is an object of arrays,
									which must be checked individually … */
									foreach ($field->correction->data as $subfield => $subdata) {
										if (count($subdata) === 0) {
											$field->processing = 'none';
										}
									}
								} elseif (count($field->correction->data) === 0) {
									/* … otherwise we can treat the main data field as an array */
									$field->processing = 'none';
								}
								break;
							case VALUES_RANGE:
								if ($field->correction->data->min > $field->correction->data->max) {
									$field->processing = 'none';
								}
								break;
						}
					}
				}
			}
		}

		/*	All the auto generated ids have been written with 2 underscores as prefix to mark them as temporary. Now we
			replace these temporary with the final ids, since now all fields have been registered and the hardcoded ids
			are known also for the advanced editor blocks. This is necessary to ensure that no id is generated
			automatically that would conflict with a hardcoded id of a later block.*/
		private function replacePendingIds(): void
		{
			$idGenerator = OasysIdGenerator::getInstance($this->fields, $this->pageId);

			/*	move fields that have an identifier starting with 2 underscores to a temporary array and remove them from
			the main fields array */

			$pendingFields = new stdClass();
			foreach ($this->fields as $id => $field) {
				if (str_starts_with($id, '__')) {
					$pendingFields->$id = $field;
					unset($this->fields->$id);
				}
			}

			$tranformedIds = []; //keep track of pending versus final ids

			// iterate through all pending fields and get final id for each one, then add it to the main fields array
			foreach ($pendingFields as $id => $field) {
				// get the final id from the id generator
				$newId = $idGenerator->transformPendingId($id);
				if ($newId !== null) {
					$field->id = $newId;
					$tranformedIds[$id] = $newId; //store the mapping of pending id to final id
					$this->fields->$newId = $field;
					//find block with pending id and replace it with the final id
					foreach ($this->blocks as $block) {
						if (isset($block->id) && $block->id === $id) {
							$block->id = $newId; //replace the pending id with the final id
						}
					}
				} else {
					// if the id was not marked as pending, it is a subfield of a metafield, so we need to rename it accordingly
					if (isset($field->parentId)) {
						//get the parent metafield id
						$parentId = $field->parentId;
						if (!isset($tranformedIds[$parentId])) {
							//if the parent metafield id is not yet transformed, we transform it now
							$newParentId = $idGenerator->transformPendingId($parentId);
							$tranformedIds[$parentId] = $newParentId;
							//find block with pending id and replace it with the final id
							foreach ($this->blocks as $block) {
								if (isset($block->id) && $block->id === $parentId) {
									$block->id = $newParentId; //replace the pending id with the final id
								}
							}
						}
						//replace the pending id of the parent field with the final id in the current field id
						$newId = str_replace($parentId, $tranformedIds[$parentId], $id);
						$tranformedIds[$id] = $newId;
						$field->id = $newId;
						$this->fields->$newId = $field;
						$this->fields->$newId->parentId = $tranformedIds[$parentId];
					} else {
						$this->errors[] = "Could not transform pending id '$id' to final id";
					}
				}
			}

			//iterate through all choice interactions and fix links to text fields if any
			foreach ($this->fields as $id => $field) {
				if ($field->type === 'oasysChoice' && isset($field->choices)) {
					foreach ($field->choices as $k => $choice) {
						if (isset($choice->link) && str_starts_with($choice->link, '__')) {
							//if the link is a pending id, we need to transform it to the final id
							if (isset($tranformedIds[$choice->link])) {
								$oldCode = bin2hex($choice->link);
								$choice->link = $tranformedIds[$choice->link];
								$newCode = bin2hex($choice->link);
								//replace the code in the label of this choice
								foreach ($choice->label as $lang => $html) {
									//replace the code in the html
									$choice->label->$lang = preg_replace("/\b$oldCode\b/u", $newCode, $choice->label->$lang);
								}
								$this->fields->$id->choices[$k] = $choice; //update the choice in the field
							} else {
								$this->errors[] = "Could not transform pending id '$choice->link' to final id";
							}
						}
					}
				}
			}

			//recreate the codes of all fields, since they might have changed and replace them in the parsed blocks
			foreach ($this->fields as $id => $field) {
				$newCode = bin2hex($field->id);
				if ($newCode !== $field->code) {
					//replace the code in the parsed blocks
					foreach ($this->parsed as $lang => $html) {
						//replace the code in the html
						$this->parsed->$lang = preg_replace("/\b$field->code\b/u", $newCode, $this->parsed->$lang);
					}
					$this->fields->$id->code = $newCode;
				}
				//if field has a property group and a parentId, we need to convert to hex the parentId and write it into the property group
				if (isset($field->group) && isset($field->parentId)) {
					$this->fields->$id->group = bin2hex($field->parentId);
				}
			}
		}

		private function wrapDiv($source, $num): void
		{
			foreach ($this->languages as $lang) {
				$localizedSource = $source->$lang ?? '';
				$html = "<!-- block $num start --><div id='oasysBlock_$num' class='oasysInteractionBlock'>$localizedSource</div><!-- block $num end -->";
				if (!isset($this->parsed->$lang)) {
					$this->parsed->$lang = "";
				}
				$this->parsed->$lang .= $html;
			}
		}

		private function compileAdvancedEditor($block, $num): void
		{
			$source = (array)$block->source;
			//if $source is transferred as an object, the parser has to be redesigned, so we convert it to an array and back
			parseSource($source, $this->fields, $this->options, $this->errors, $this->pageId, $this->flags);
			$source = (object)$source;
			$this->fields = $this->sanitizeFields(deepCopy($this->fields));
			$this->wrapDiv($source, $num);
		}

		/* replace empty arrays with empty stdClass object to ensure correct json encoding */
		private function sanitizeFields($obj): stdClass
		{
			foreach ($obj as $id => $field) {
				foreach ($field as $property => $value) {
					if (is_array($value)) {
						if (empty($value)) {
							$obj->$id->$property = new stdClass();
						}
					}
				}
			}
			return $obj;
		}

		private function compileImageEditor(&$block, $num): void
		{
			global $settings;
			$idGenerator = OasysIdGenerator::getInstance($this->fields, $this->pageId);
			$html = new stdClass();
			$cnf = new stdClass();
			$cnf->blockNumber = $num;
			$cnf->id = $idGenerator->getId($this->languages, 'image_');
			$cnf->code = bin2hex($cnf->id);
			$cnf->type = 'oasysImage';
			$cnf->category = 'static';
			$this->copyValues($cnf, $block, ['width', 'ratio']);
			foreach ($this->languages as $lang) {
				$fileId = $block->fileid->$lang;
				$width = trim($block->width->$lang);
				if (is_numeric($width)) {
					$width .= 'px'; //add pixel as unit if none is given
				}
				$fileChecksum = $block->filechecksum->$lang;
				$html->$lang = "<div style='text-align: $block->align'><img data-id='$cnf->code' class='oasysTag oasysImage' src='fetchMediaFile.php?fileid=$fileId&checksum=$fileChecksum' style='max-width: 100%; width: $width'></div>";

			}
			$this->fields->{$cnf->id} = $cnf;
			$this->wrapDiv($html, $num);
		}

		private function compileVideoEditor(&$block, $num): void
		{
			global $settings;
			$idGenerator = OasysIdGenerator::getInstance($this->fields, $this->pageId);
			$cnf = new stdClass();
			$cnf->blockNumber = $num;
			$this->copyValues($cnf, $block, ['id']);
			if ($cnf->id === '') {
				//if no id is given, get an id from generator; it must be registered for all languages
				$cnf->id = $idGenerator->getId($this->languages, 'video_');
				$block->id = $cnf->id; //set the temporary id in the block for later update
			}
			if (isset($this->fields->{$cnf->id})) {
				$this->errors[] = "field id '$cnf->id' reused";
				return;
			}
			$cnf->type = 'oasysAudioVideo';
			$cnf->category = 'fields';
			$this->copyValues($cnf, $block, ['required', 'maxPlayCount', 'disableControls', 'autoPlay', 'noPlaceHolder', 'navigateOnEnd', 'hidden']);
			if ($block->limitPlayCount === false) {
				$cnf->maxPlayCount = 0;
			}

			$cnf->processing = 'none';
			$cnf->code = bin2hex($cnf->id);
			$cnf->file = new stdClass();
			$cnf->mediaType = 'video';
			$html = new stdClass();
			$cnf->info = new stdClass();
			foreach ($this->languages as $lang) {
				$fileId = $block->fileid->$lang;
				if (!is_numeric($fileId)) {
					$cnf->file->$lang = null;
					$html->$lang = "";
					continue;
				}
				$fileChecksum = $block->filechecksum->$lang;
				$cnf->file->$lang = "fetchMediaFile.php?fileid=$fileId&checksum=$fileChecksum";
				$html->$lang = "<span class='oasysTag oasysAudioVideo' data-id='$cnf->code'></span>";

				$query = "SELECT parent from media WHERE id = ?";
				$results = $this->db->fetchValue($query, [$fileId]);

				if (!$results['error'] && $results['rows'] === 1) {
					if ($settings['mediaLocation'] === 'disk') {
						$path = __DIR__ . "/../../media/{$results['data']}/$fileId.dat";
					} elseif ($settings['mediaLocation'] === 'database') {
						$path = $fileId;
					}

					$error = false;
					$info = null;

					if (isset($path)) {
						try {
							$info = new mp4Info($settings['mediaLocation'], $path, $this->db);
							if (!$info->isValid()) {
								$info = new webmInfo($settings['mediaLocation'], $path, $this->db);
								if (!$info->isValid()) {
									$error = true;
									$this->errors[] = "Invalid video file";
								}
							}
						} catch (Exception $e) {
							$error = true;
							$this->errors[] = $e->getMessage();
						}

						if (!$error && ($info instanceof mp4Info || $info instanceof webmInfo)) {
							$cnf->info->$lang = $info->getInfo();
						}
					}
				}
			}
			$this->fields->{$cnf->id} = $cnf;
			$this->wrapDiv($html, $num);
		}

		private function compileAudioEditor(&$block, $num): void
		{
			global $settings;
			$idGenerator = OasysIdGenerator::getInstance($this->fields, $this->pageId);
			$cnf = new stdClass();
			$cnf->blockNumber = $num;
			$this->copyValues($cnf, $block, ['id']);
			if ($cnf->id === '') {
				//if no id is given, get an id from generator; it must be registered for all languages
				$cnf->id = $idGenerator->getId($this->languages, 'audio_');
				$block->id = $cnf->id; //set the temporary id in the block for later update
			}
			if (isset($this->fields->{$cnf->id})) {
				$this->errors[] = "field id '$cnf->id' reused";
				return;
			}
			$cnf->type = 'oasysAudioVideo';
			$cnf->category = 'fields';
			$this->copyValues($cnf, $block, ['required', 'maxPlayCount', 'disableControls', 'autoPlay', 'noPlaceHolder', 'navigateOnEnd', 'hidden']);
			if ($block->limitPlayCount === false) {
				$cnf->maxPlayCount = 0;
			}

			$cnf->processing = 'none';
			$cnf->code = bin2hex($cnf->id);
			$cnf->file = new stdClass();
			$cnf->mediaType = 'audio';
			$html = new stdClass();
			$cnf->info = new stdClass();
			foreach ($this->languages as $lang) {
				$fileId = $block->fileid->$lang;
				if (!is_numeric($fileId)) {
					$cnf->file->$lang = null;
					$html->$lang = "";
					continue;
				}
				$fileChecksum = $block->filechecksum->$lang;
				$cnf->file->$lang = "fetchMediaFile.php?fileid=$fileId&checksum=$fileChecksum";
				$html->$lang = "<span class='oasysTag oasysAudioVideo' data-id='$cnf->code'></span>";

				$query = "SELECT parent from media WHERE id = ?";
				$results = $this->db->fetchValue($query, [$fileId]);
			}
			$this->fields->{$cnf->id} = $cnf;
			$this->wrapDiv($html, $num);
		}

		private function compileWysiwygEditor(&$block, $num): void
		{
			$this->wrapDiv($block->source, $num);
		}

		private function compileTextfield(&$block, $num): void
		{
			$idGenerator = OasysIdGenerator::getInstance($this->fields, $this->pageId);
			$cnf = new stdClass();
			$cnf->blockNumber = $num;
			$this->copyValues($cnf, $block, ['id']);
			if ($cnf->id === '') {
				//if no id is given, get an id from generator; it must be registered for all languages
				$cnf->id = $idGenerator->getId($this->languages, 'tf_');
				$block->id = $cnf->id; //set the temporary id in the block for later update
			}
			if (isset($this->fields->{$cnf->id})) {
				$this->errors[] = "field id '$cnf->id' reused";
				return;
			}
			$cnf->type = 'oasysTextfield';
			$cnf->category = 'fields';
			$cnf->required = $block->mandatory;
			$cnf->maxwidth = 'calc(100% - 25px)';
			$cnf->prefill = '';
			$cnf->readOnly = false;
			$cnf->placeholder = $block->placeholder;
			$cnf->options = new stdClass();
			$cnf->code = bin2hex($cnf->id);
			$cnf->processing = $block->processing;
			$cnf->score = new stdClass();
			if ($cnf->processing === 'auto') {
				$cnf->correction = new stdClass();
				$cnf->correction->data = $block->correction;
				$cnf->correction->format = VALUES_STRING;
				$cnf->correction->ignoreCase = !$block->case;
				if (isset($block->score->initial) && isset($block->score->correct) && isset($block->score->wrong) && isset($block->score->missing)) {
					$cnf->score->initial = $block->score->initial;
					$cnf->score->correct = $block->score->correct;
					$cnf->score->wrong = $block->score->wrong;
					$cnf->score->missing = $block->score->missing;
				}
			} elseif ($cnf->processing === 'manual') {
				if (isset($block->score->maximum)) {
					$cnf->score->maximum = $block->score->maximum;
				}
			}

			$this->copyValues($cnf, $block, ['limit']);

			if ($block->export !== "") {
				$cnf->export = $block->export;
			}

			$cnf->inputMode = '';
			if ($block->filter === 'custom') {
				$cnf->pattern = $block->pattern;
			} else {
				$cnf->inputMode = $this->getInputMode($block->filter);
				$cnf->pattern = $this->getFilter($block->filter);
			}

			switch ($block->size) {
				case 's':
					$cnf->width = '50px';
					break;
				case 'm':
					$cnf->width = '200px';
					break;
				case 'l':
					$cnf->width = '400px';
					break;
				case 'xl':
					$cnf->width = '800px';
					break;
				case 'custom':
					$cnf->width = $block->width;
					break;
			}

			$cnf->alignment = 'left';

			$this->fields->{$cnf->id} = $cnf;

			$html = new stdClass();
			foreach ($this->languages as $lang) {
				$html->$lang = "<p><span class='oasysLabel' data-id='$cnf->code'>{$block->question->$lang}</span></p>
								<div class='layout_inlineWrapper'><div class='oasysTag oasysTextfield' data-id='$cnf->code'></div>{$block->suffix->$lang}</div>\n";">";
			}
			$this->wrapDiv($html, $num);

		}

		private function compileTextarea(&$block, $num): void
		{
			$idGenerator = OasysIdGenerator::getInstance($this->fields, $this->pageId);
			$cnf = new stdClass();
			$cnf->blockNumber = $num;
			$this->copyValues($cnf, $block, ['id']);
			if ($cnf->id === '') {
				//if no id is given, get an id from generator; it must be registered for all languages
				$cnf->id = $idGenerator->getId($this->languages, 'ta_');
				$block->id = $cnf->id; //set the temporary id in the block for later update
			}
			if (isset($this->fields->{$cnf->id})) {
				$this->errors[] = "field id '$cnf->id' reused";
				return;
			}
			$cnf->type = 'oasysTextarea';
			$cnf->category = 'fields';
			$cnf->required = $block->mandatory;
			$cnf->maxwidth = 'calc(100% - 25px)';
			$cnf->prefill = '';
			$cnf->readOnly = false;
			$cnf->placeholder = $block->placeholder;
			$cnf->options = new stdClass();
			$cnf->code = bin2hex($cnf->id);
			$cnf->processing = $block->processing;
			$cnf->score = new stdClass();
			if ($cnf->processing === 'manual') {
				if (isset($block->score->maximum)) {
					$cnf->score->maximum = $block->score->maximum;
				}
			}

			$this->copyValues($cnf, $block, ['limit']);

			if ($block->export !== "") {
				$cnf->export = $block->export;
			}

			switch ($block->size) {
				case 's':
					$cnf->width = '200px';
					$cnf->height = '100px';
					break;
				case 'm':
					$cnf->width = '400px';
					$cnf->height = '200px';
					break;
				case 'l':
					$cnf->width = '800px';
					$cnf->height = '400px';
					break;
				case 'xl':
					$cnf->width = '100%';
					$cnf->height = '600px';
					break;
				case 'custom':
					$cnf->width = $block->width;
					$cnf->height = $block->height;
					break;
			}

			$cnf->resize = $block->resize;
			$cnf->alignment = 'left';

			$this->fields->{$cnf->id} = $cnf;

			$html = new stdClass();
			foreach ($this->languages as $lang) {
				$html->$lang = "<p><span class='oasysLabel' data-id='$cnf->code'>{$block->question->$lang}</span></p>
								<p><span class='oasysTag oasysTextarea' data-id='$cnf->code'></span></p>";
			}
			$this->wrapDiv($html, $num);

		}

		private function compileChoice(&$block, $num): void
		{
			$idGenerator = OasysIdGenerator::getInstance($this->fields, $this->pageId);
			$cnf = new stdClass();
			$cnf->blockNumber = $num;
			$this->copyValues($cnf, $block, ['id']);
			if ($cnf->id === '') {
				//if no id is given, get an id from generator; it must be registered for all languages
				$cnf->id = $idGenerator->getId($this->languages, 'choice_');
				$block->id = $cnf->id; //set the temporary id in the block for later update
			}
			if (isset($this->fields->{$cnf->id})) {
				$this->errors[] = "field id '$cnf->id' reused";
				return;
			}
			$cnf->type = 'oasysChoice';
			$cnf->category = 'fields';
			$cnf->required = $block->mandatory;
			$cnf->options = new stdClass();
			$cnf->code = bin2hex($cnf->id);
			$cnf->score = new stdClass();
			$this->copyValues($cnf, $block, ['choices', 'order', 'processing', 'alignment', 'labelPosition', 'proceedOnAnswer', 'choiceType', 'rowgap', 'colgap']);
			if ($cnf->processing === 'auto') {
				$cnf->correction = new stdClass();
				$cnf->correction->data = $block->correction;
				if ($cnf->choiceType === 'multiple') {
					$cnf->correction->format = VALUES_STRING_ARRAY; //checkboxes
					$cnf->correction->noreply = '';
				} else {
					if ($cnf->choiceType === 'dropdown') {
						$cnf->correction->format = VALUES_STRING; //dropdown
						$cnf->correction->noreply = '__noreply__';
					} else {
						$cnf->correction->format = VALUES_STRING; //radio buttons
						$cnf->correction->noreply = hex2bin($block->noreply);
					}
				}
				if (isset($block->score->initial) && isset($block->score->correct) && isset($block->score->wrong) && isset($block->score->missing)) {
					$cnf->score->initial = $block->score->initial;
					$cnf->score->correct = $block->score->correct;
					$cnf->score->wrong = $block->score->wrong;
					$cnf->score->missing = $block->score->missing;
				}
			} elseif ($cnf->processing === 'manual') {
				if (isset($block->score->maximum)) {
					$cnf->score->maximum = $block->score->maximum;
				}
			}

			if ($block->export !== "") {
				$cnf->export = $block->export;
			}

			if ($cnf->choiceType === 'multiple') {
				if ($block->limit === true) {
					$cnf->minRequired = $block->limit_min;
					$cnf->maxRequired = $block->limit_max;
				} else {
					$cnf->minRequired = 1;
					$cnf->maxRequired = -1;
				}
				if ($cnf->order === 'manual') {
					$cnf->textfields = $block->textfields->multiple;
				} else {
					$cnf->textfields = 0;
				}
				$cnf->layout = $block->layout;
			} elseif ($cnf->choiceType === 'single') {
				if ($cnf->order === 'manual' && $block->textfields->single === true) {
					$cnf->textfields = 1;
				} else {
					$cnf->textfields = 0;
				}
				$cnf->layout = $block->layout;
			}

			if ($cnf->choiceType !== 'single' || $cnf->textfields > 0) {
				$cnf->proceedOnAnswer = false;
			}

			if ($cnf->choiceType !== 'dropdown' && $cnf->textfields > 0) {
				switch ($block->size) {
					case 's':
						$cnf->width = '50px';
						break;
					case 'm':
						$cnf->width = '200px';
						break;
					case 'l':
						$cnf->width = '400px';
						break;
					case 'xl':
						$cnf->width = '800px';
						break;
					case 'custom':
						$cnf->width = $block->width;
						break;
				}
			}

			$this->fields->{$cnf->id} = $cnf;

			if (isset($cnf->textfields) && $cnf->textfields > 0) {
				$tfCounter = 1;
				for ($i = count($cnf->choices) - $cnf->textfields; $i < count($cnf->choices); $i++) {
					$tfId = $cnf->id . "__tf" . $tfCounter++;
					$tfCode = bin2hex($tfId);
					if ($cnf->choiceType === 'single') {
						$linkType = 'is';
					} else {
						$linkType = 'includes';
					}
					$this->createChoiceTextfield($cnf->id, $cnf->choices[$i]->value, $linkType, $tfId, $tfCode, $cnf->width);
					foreach ($cnf->choices[$i]->label as $lang => $lbl) {
						$this->fields->{$cnf->id}->choices[$i]->label->$lang = $lbl . " <span class='oasysTag oasysTextfield' data-id='$tfCode'></span>";
						$this->fields->{$cnf->id}->choices[$i]->link = $tfId; //id of text field linked
					}
				}
			}

			$html = new stdClass();
			foreach ($this->languages as $lang) {
				$html->$lang = "<p>{$block->question->$lang}</p>
								<p><div class='oasysTag oasysChoice' data-id='$cnf->code'></div></p>";
			}
			$this->wrapDiv($html, $num);

		}

		private function createChoiceTextfield($id, $value, $linkType, $tfId, $tfCode, $width): void
		{
			$cnf = new stdClass();
			$cnf->id = $tfId;
			$cnf->parentId = $id;
			$cnf->code = $tfCode;
			if (isset($this->fields->{$cnf->id})) {
				$this->errors[] = "field id '$cnf->id' reused";
				return;
			}
			$cnf->type = 'oasysTextfield';
			$cnf->category = 'fields';
			$cnf->required = true;
			$cnf->maxwidth = 'calc(100% - 25px)';
			$cnf->prefill = '';
			$cnf->readOnly = false;
			$cnf->options = new stdClass();
			$cnf->processing = 'none';

			$cnf->alignment = 'left';
			$cnf->width = $width;

			//define the link to the choice that regulates if the text field is required or not
			$cnf->link = ['master' => $id, 'logic' => $linkType, 'value' => $value];

			$this->fields->{$cnf->id} = $cnf;
		}

		private function compileConceptmap(&$block, $num): void
		{
			$idGenerator = OasysIdGenerator::getInstance($this->fields, $this->pageId);
			$cnf = new stdClass();
			$cnf->blockNumber = $num;
			$this->copyValues($cnf, $block, ['id']);
			if ($cnf->id === '') {
				//if no id is given, get an id from generator; it must be registered for all languages
				$cnf->id = $idGenerator->getId($this->languages, 'cmap_');
				$block->id = $cnf->id; //set the temporary id in the block for later update
			}
			if (isset($this->fields->{$cnf->id})) {
				$this->errors[] = "field id '$cnf->id' reused";
				return;
			}

			$cnf->type = 'oasysConceptMap';
			$cnf->category = 'fields';
			$cnf->required = $block->mandatory;
			$cnf->document = $block->conceptmap;
			$cnf->options = new stdClass();
			$cnf->code = bin2hex($cnf->id);
			$cnf->processing = $block->processing;
			$cnf->score = new stdClass();
			if ($cnf->processing === 'manual') {
				if (isset($block->score->maximum)) {
					$cnf->score->maximum = $block->score->maximum;
				}
			}

			$this->copyValues($cnf, $block, ['question']);
			$this->fields->{$cnf->id} = $cnf;

			$html = new stdClass();
			foreach ($this->languages as $lang) {
				$html->$lang = "<p><span class='oasysLabel' data-id='$cnf->code'>{$block->question->$lang}</span></p>
								<p><span class='oasysTag oasysConceptMap' data-id='$cnf->code'></span></p>";
			}
			$this->wrapDiv($html, $num);

		}

		private function compileButton(&$block, $num): void
		{
			$idGenerator = OasysIdGenerator::getInstance($this->fields, $this->pageId);
			$cnf = new stdClass();
			$cnf->blockNumber = $num;
			$cnf->id = $idGenerator->getId($this->languages, 'button_');

			if (isset($this->fields->{$cnf->id})) {
				$this->errors[] = "field id '$cnf->id' reused";
				return;
			}
			$cnf->type = 'oasysButton';
			$cnf->category = 'static';
			$this->copyValues($cnf, $block, ['action', 'label', 'disableOnTestIncomplete', 'language', 'ignoreNavigationConstraints']);
			$cnf->options = new stdClass();
			$cnf->code = bin2hex($cnf->id);
			$alignment = $block->align;

			$this->fields->{$cnf->id} = $cnf;

			$html = new stdClass();
			foreach ($this->languages as $lang) {
				$html->$lang = "<div class='oasysTag oasysButton buttonInteraction' data-id='$cnf->code' style='text-align: $alignment'></div>";
			}
			$this->wrapDiv($html, $num);

		}

		private function compileLanguageswitcher(&$block, $num): void
		{
			$idGenerator = OasysIdGenerator::getInstance($this->fields, $this->pageId);
			$cnf = new stdClass();
			$cnf->blockNumber = $num;
			$cnf->id = $idGenerator->getId($this->languages, 'languageswitcher_');

			if (isset($this->fields->{$cnf->id})) {
				$this->errors[] = "field id '$cnf->id' reused";
				return;
			}
			$cnf->type = 'oasysLanguageSwitcher';
			$cnf->category = 'static';
			$this->copyValues($cnf, $block, ['label']);
			$cnf->options = new stdClass();
			$cnf->code = bin2hex($cnf->id);
			$alignment = $block->align;

			$this->fields->{$cnf->id} = $cnf;

			$html = new stdClass();
			foreach ($this->languages as $lang) {
				$html->$lang = <<<html
					<div style='text-align: $alignment'>
						<p>
							{$block->label->$lang}<br>
							<span class='oasysTag oasysLanguageSwitcher' data-id='$cnf->code'></span>
						</p>
					</div>
				html;
			}
			$this->wrapDiv($html, $num);

		}

		private function compileChoiceMatrix(&$block, $num): void
		{
			$idGenerator = OasysIdGenerator::getInstance($this->fields, $this->pageId);
			$cnf = new stdClass();
			$cnf->blockNumber = $num;
			$this->copyValues($cnf, $block, ['id']);
			if ($cnf->id === '') {
				//if no id is given, get an id from generator; it must be registered for all languages
				$cnf->id = $idGenerator->getId($this->languages, 'choiceMatrix_');
				$block->id = $cnf->id; //set the temporary id in the block for later update
			}
			if (isset($this->fields->{$cnf->id})) {
				$this->errors[] = "field id '$cnf->id' reused";
				return;
			}
			$cnf->type = 'oasysChoiceMatrix';
			$cnf->category = 'metafields';
			$cnf->options = new stdClass();
			$cnf->code = bin2hex($cnf->id);
			$cnf->required = $block->mandatory;
			$this->copyValues($cnf, $block, ['choiceType', 'mandatory', 'processing']);
			$cnf->score = new stdClass();

			if ($cnf->processing === 'auto') {
				$cnf->correction = new stdClass();
				$cnf->correction->data = $block->correction;
				if ($cnf->choiceType === 'multiple') {
					$cnf->correction->format = VALUES_STRING_ARRAY; //checkboxes
					$cnf->correction->noreply = "";
				} else {
					$cnf->correction->format = VALUES_STRING; //radio buttons
					$cnf->correction->noreply = hex2bin($block->noreply);
				}
				if (isset($block->score->initial) && isset($block->score->correct) && isset($block->score->wrong) && isset($block->score->missing)) {
					$cnf->score->initial = $block->score->initial;
					$cnf->score->correct = $block->score->correct;
					$cnf->score->wrong = $block->score->wrong;
					$cnf->score->missing = $block->score->missing;
				}
			} elseif ($cnf->processing === 'manual') {
				if (isset($block->score->maximum)) {
					$cnf->score->maximum = $block->score->maximum;
				}
			}

			$this->copyValues($cnf, $block, ['shuffle', 'fieldWidth', 'labelWidth', 'labels', 'rows']);

			$cnf->layout = $block->layout;
			if ($cnf->choiceType === 'multiple') {
				if ($block->limit === true) {
					$cnf->minRequired = $block->limit_min;
					$cnf->maxRequired = $block->limit_max;
				} else {
					$cnf->minRequired = 1;
					$cnf->maxRequired = -1;
				}
			}

			$this->fields->{$cnf->id} = $cnf;

			$html = new stdClass();
			$legend = "";

			foreach ($this->languages as $lang) {

				if ($cnf->layout === 'legend') {
					$legend = "<div class='matrixLegend'>";
					foreach ($cnf->labels as $i => $lbl) {
						$legend .= "<div class='matrixLegendItem'><div>" . ($i + 1) . " = </div><div>{$lbl->label->$lang}</div></div>";
					}
					$legend .= "</div>";
				}

				$html->$lang = "<p>{$block->question->$lang}</p>
								$legend
								<div class='matrixWrapper oasysTag oasysChoiceMatrix' data-id='$cnf->code'>
									<div class='matrixTableHeader'>";
				foreach ($cnf->labels as $i => $lbl) {
					if ($cnf->layout === 'inplace') {
						$html->$lang .= "<div class='matrixTableHeaderCell' data-col='$i'>{$lbl->label->$lang}</div>";
					} else {
						$html->$lang .= "<div class='matrixTableHeaderCell' data-col='$i'>" . ($i + 1) . "</div>";
					}
				}
				$html->$lang .= "</div>";
				foreach ($cnf->rows as $i => $row) {
					$html->$lang .= $this->createMatrixRow($cnf, $i, $lang);
				}
				$html->$lang .= "</div>";
			}
			$this->wrapDiv($html, $num);

		}

		private function createMatrixRow(&$options, $num, $lang): string
		{
			$row = $options->rows[$num];
			$labels = deepCopy($options->labels);
			foreach ($labels as $i => $lbl) {
				$lbl->value = bin2hex($lbl->value);
			}
			$cnf = new stdClass();
			$cnf->parentId = $options->id;
			$cnf->id = $options->id . "_" . $row->value;
			if ($options->choiceType === 'single') {
				$cnf->type = 'oasysRadioButton';
			} else {
				$cnf->type = 'oasysCheckBox';
				$cnf->minRequired = $options->minRequired;
				$cnf->maxRequired = $options->maxRequired;
				$cnf->max = $options->maxRequired;
			}
			$cnf->layout = $options->layout;
			$cnf->category = 'fields';
			$cnf->options = new stdClass();
			$cnf->code = bin2hex($cnf->id);
			$cnf->height = 20;
			$cnf->clickableParent = '.matrixChoiceCell';

			$cnf->required = $options->required;
			$cnf->processing = $options->processing;
			if ($cnf->processing !== 'none') {
				$cnf->score = $options->score;
				if ($cnf->processing === 'auto') {
					$cnf->correction = new stdClass();
					$cnf->correction->format = $options->correction->format;
					$cnf->correction->data = $options->correction->data->{$row->value};
					$cnf->correction->noreply = $options->correction->noreply;
				}
			}

			$this->fields->{$cnf->id} = $cnf;

			$html = "<div class='matrixRow'><div class='matrixRowLabel' data-row='$num'>{$row->label->$lang}</div>";
			for ($i = 0; $i < count($labels); $i++) {
				if ($cnf->layout === 'inplace') {
					$lbl = $labels[$i]->label->$lang;
				} else {
					$lbl = $i + 1;
				}
				$html .= "<div class='matrixStackedHeaderCell'>
							<span class='oasysLabel' data-id='$cnf->code' data-value='{$labels[$i]->value}'>$lbl</span>
						</div>
						<div class='matrixChoiceCell' data-row='$num' data-col='$i'>
							<span class='oasysTag $cnf->type' data-id='$cnf->code' data-value='{$labels[$i]->value}'></span>
						</div>";
			}
			$html .= "</div>";

			return $html;
		}

		private function compileSlider(&$block, $num): void
		{
			$idGenerator = OasysIdGenerator::getInstance($this->fields, $this->pageId);
			$cnf = new stdClass();
			$cnf->blockNumber = $num;
			$this->copyValues($cnf, $block, ['id']);
			if ($cnf->id === '') {
				//if no id is given, get an id from generator; it must be registered for all languages
				$cnf->id = $idGenerator->getId($this->languages, 'slider_');
				$block->id = $cnf->id; //set the temporary id in the block for later update
			}
			if (isset($this->fields->{$cnf->id})) {
				$this->errors[] = "field id '$cnf->id' reused";
				return;
			}
			$cnf->type = 'oasysSlider';
			$cnf->category = 'fields';
			$cnf->required = $block->mandatory;
			$cnf->options = new stdClass();
			$cnf->code = bin2hex($cnf->id);
			$this->copyValues($cnf, $block, ['processing', 'labelLeft', 'labelCentre', 'labelRight', 'labelNoReply', 'min', 'max', 'step', 'subDivisions', 'showSteps', 'noReply', 'showValue']);
			$cnf->score = new stdClass();

			if ($cnf->showSteps === true) {
				$this->copyValues($cnf, $block, ['showAllValues']);
			}
			if ($cnf->processing === 'auto') {
				$cnf->correction = new stdClass();
				$cnf->correction->noreply = "N/A";
				$cnf->correction->data = new stdClass();
				if ($block->correction->type === 'range') {
					$cnf->correction->data->min = $block->correction->min;
					$cnf->correction->data->max = $block->correction->max;
				} else {
					$cnf->correction->data->min = $block->correction->value;
					$cnf->correction->data->max = $block->correction->value;
				}
				$cnf->correction->format = VALUES_RANGE;
				if (isset($block->score->initial) && isset($block->score->correct) && isset($block->score->wrong) && isset($block->score->missing)) {
					$cnf->score->initial = $block->score->initial;
					$cnf->score->correct = $block->score->correct;
					$cnf->score->wrong = $block->score->wrong;
					$cnf->score->missing = $block->score->missing;
				}
			} elseif ($cnf->processing === 'manual') {
				if (isset($block->score->maximum)) {
					$cnf->score->maximum = $block->score->maximum;
				}
			}

			if ($block->export !== "") {
				$cnf->export = $block->export;
			}

			$this->fields->{$cnf->id} = $cnf;

			$html = new stdClass();
			foreach ($this->languages as $lang) {
				$html->$lang = "<p><span class='oasysLabel' data-id='$cnf->code'>{$block->question->$lang}</span></p>
								<p><span class='oasysTag oasysSlider' data-id='$cnf->code'></span></p>";
			}
			$this->wrapDiv($html, $num);

		}

		private function compileSlikert(&$block, $num): void
		{
			$idGenerator = OasysIdGenerator::getInstance($this->fields, $this->pageId);
			$cnf = new stdClass();
			$cnf->blockNumber = $num;
			$this->copyValues($cnf, $block, ['id']);
			if ($cnf->id === '') {
				//if no id is given, get an id from generator; it must be registered for all languages
				$cnf->id = $idGenerator->getId($this->languages, 'slikert_');
				$block->id = $cnf->id; //set the temporary id in the block for later update
			}
			if (isset($this->fields->{$cnf->id})) {
				$this->errors[] = "field id '$cnf->id' reused";
				return;
			}
			$cnf->type = 'oasysSlikert';
			$cnf->category = 'fields';
			$cnf->required = $block->mandatory;
			$cnf->options = new stdClass();
			$cnf->code = bin2hex($cnf->id);
			$this->copyValues($cnf, $block, ['processing', 'labelLeft', 'labelCentre', 'labelRight', 'labelNoReply', 'min', 'max', 'step', 'noReply', 'origin', 'bicolour', 'labelPosition', 'tooltip', 'labelWidth']);
			$cnf->score = new stdClass();

			if ($cnf->processing === 'auto') {
				$cnf->correction = new stdClass();
				$cnf->correction->noreply = "N/A";
				$cnf->correction->data = new stdClass();
				if ($block->correction->type === 'range') {
					$cnf->correction->data->min = $block->correction->min;
					$cnf->correction->data->max = $block->correction->max;
				} else {
					$cnf->correction->data->min = $block->correction->value;
					$cnf->correction->data->max = $block->correction->value;
				}
				$cnf->correction->format = VALUES_RANGE;
				if (isset($block->score->initial) && isset($block->score->correct) && isset($block->score->wrong) && isset($block->score->missing)) {
					$cnf->score->initial = $block->score->initial;
					$cnf->score->correct = $block->score->correct;
					$cnf->score->wrong = $block->score->wrong;
					$cnf->score->missing = $block->score->missing;
				}
			} elseif ($cnf->processing === 'manual') {
				if (isset($block->score->maximum)) {
					$cnf->score->maximum = $block->score->maximum;
				}
			}

			if ($block->export !== "") {
				$cnf->export = $block->export;
			}

			$this->fields->{$cnf->id} = $cnf;

			$html = new stdClass();
			foreach ($this->languages as $lang) {
				$html->$lang = "<p><span class='oasysLabel' data-id='$cnf->code'>{$block->question->$lang}</span></p>
								<p><span class='oasysTag oasysSlikert' data-id='$cnf->code'></span></p>";
			}
			$this->wrapDiv($html, $num);

		}

		private function compileInlineTextfields(&$block, $num): void
		{
			$idGenerator = OasysIdGenerator::getInstance($this->fields, $this->pageId);
			$cnf = new stdClass();
			$cnf->blockNumber = $num;
			$this->copyValues($cnf, $block, ['id']);
			if ($cnf->id === '') {
				//if no id is given, get an id from generator; it must be registered for all languages
				$cnf->id = $idGenerator->getId($this->languages, 'inlineTextFields_');
				$block->id = $cnf->id; //set the temporary id in the block for later update
			}
			if (isset($this->fields->{$cnf->id})) {
				$this->errors[] = "field id '$cnf->id' reused";
				return;
			}
			$cnf->type = 'oasysInline_TextFields';
			$cnf->category = 'metafields';
			$cnf->code = bin2hex($cnf->id);
			$cnf->required = $block->mandatory;
			$this->copyValues($cnf, $block, ['processing', 'case', 'question', 'size', 'width', 'fields']);
			$cnf->score = new stdClass();

			$cnf->inputMode = '';
			if ($block->filter === 'custom') {
				$cnf->pattern = $block->pattern;
			} else {
				$cnf->inputMode = $this->getInputMode($block->filter);
				$cnf->pattern = $this->getFilter($block->filter);
			}

			if ($cnf->processing === 'auto') {
				$cnf->correction = new stdClass();
				$cnf->correction->data = $block->correction;
				$cnf->correction->format = VALUES_STRING;
				if (isset($block->score->initial) && isset($block->score->correct) && isset($block->score->wrong) && isset($block->score->missing)) {
					$cnf->score->initial = $block->score->initial;
					$cnf->score->correct = $block->score->correct;
					$cnf->score->wrong = $block->score->wrong;
					$cnf->score->missing = $block->score->missing;
				}
				foreach ($block->fields as $field) {
					foreach ($field as $fieldId => $entry) {
						if (!isset($cnf->correction->data->{$fieldId})) {
							$cnf->correction->data->{$fieldId} = [];
						}
						if (is_string($entry)) {
							$cnf->correction->data->{$fieldId}[] = $entry;
						} else {
							$cnf->correction->data->{$fieldId}[] = $entry->name;
						}
					}
				}
				//make sure the correction data is unique
				foreach ($cnf->correction->data as $fieldId => $data) {
					$cnf->correction->data->{$fieldId} = array_unique($data);
				}
			} elseif ($cnf->processing === 'manual') {
				if (isset($block->score->maximum)) {
					$cnf->score->maximum = $block->score->maximum;
				}
			}

			$this->fields->{$cnf->id} = $cnf;

			$html = new stdClass();
			$legend = "";

			foreach ($this->languages as $lang) {
				$text = $block->source->$lang;
				$pattern = "/([\p{L}\p{N}\-']*)\[{2}(\d+)#(.*?)]{2}([\p{L}\p{N}\-']*)/u";
				$text = preg_replace_callback($pattern, function ($matches) use ($cnf, $lang) {
					return $this->createInlineTextfield($cnf, $lang, $matches[2], $matches[1], $matches[4]);
				}, $text);
				$html->$lang = <<<HTML
					<div class="oasysQuestion">{$block->question->$lang}</div>
					<div class='oasysInlineText oasysTag' data-id='$cnf->code'>
						{$text}
					</div>
				HTML;
			}
			$this->wrapDiv($html, $num);

		}

		private function createInlineTextfield($options, $lang, $fieldId, $before, $after): string
		{

			$cnf = new stdClass();
			$cnf->parentId = $options->id;
			$cnf->id = $options->id . "_" . $fieldId;
			$cnf->code = bin2hex($cnf->id);
			$cnf->maxwidth = 'calc(100% - 25px)';

			switch ($options->size) {
				case 's':
					$cnf->width = '50px';
					break;
				case 'm':
					$cnf->width = '100px';
					break;
				case 'l':
					$cnf->width = '150px';
					break;
				case 'xl':
					$cnf->width = '200px';
					break;
				case 'custom':
					$cnf->width = $options->width;
					break;
			}

			/* check if prefix ends on a letter or dash resp. suffix starts with a letter or a dash
				and adjust text alignment accordingly */
			$prefix = $options->fields->$lang->$fieldId->prefix;
			$suffix = $options->fields->$lang->$fieldId->suffix;
			$align = 'center';
			if ($before !== '' && $after === '') {
				$align = 'left';
			} elseif ($before === '' && $after !== '') {
				$align = 'right';
			}
			$cnf->align = $align;

			/* the config is language agnostic, so we only have to fill this in for the first language */
			if (!isset($this->fields->{$cnf->id})) {
				$cnf->type = 'oasysInline_Textfield';
				$cnf->category = 'fields';
				$cnf->processing = $options->processing;
				if ($cnf->processing !== 'none') {
					$cnf->score = $options->score;
					if ($cnf->processing === 'auto') {
						$cnf->correction = new stdClass();
						$cnf->correction->format = $options->correction->format;
						$cnf->correction->data = $options->correction->data->{$fieldId};
					}
				}
				$this->copyValues($cnf, $options, ['required', 'case', 'size', 'pattern', 'score']);
				$this->fields->{$cnf->id} = $cnf;
			}

			return "<span class='oasysInline_Textfield_noBreakWrapper'><span class='oasysInline_Textfield_prefix'>$before</span><span class='oasysTag oasysInline_Textfield' data-id='$cnf->code'></span><span class='oasysInline_Textfield_suffix'>$after</span></span>";
		}


		private function compileInlineGaps(&$block, $num): void
		{
			$idGenerator = OasysIdGenerator::getInstance($this->fields, $this->pageId);
			$cnf = new stdClass();
			$cnf->blockNumber = $num;
			$this->copyValues($cnf, $block, ['id']);
			if ($cnf->id === '') {
				//if no id is given, get an id from generator; it must be registered for all languages
				$cnf->id = $idGenerator->getId($this->languages, 'inlineGaps_');
				$block->id = $cnf->id; //set the temporary id in the block for later update
			}
			if (isset($this->fields->{$cnf->id})) {
				$this->errors[] = "field id '$cnf->id' reused";
				return;
			}
			$cnf->type = 'oasysInline_Gaps';
			$cnf->category = 'metafields';
			$cnf->code = bin2hex($cnf->id);
			$cnf->required = $block->mandatory;
			$this->copyValues($cnf, $block, ['processing', 'question', 'answers', 'order']);
			$cnf->score = new stdClass();

			if ($cnf->processing === 'auto') {
				$cnf->correction = new stdClass();
				$cnf->correction->data = $block->correction;
				$cnf->correction->format = VALUES_STRING;
				if (isset($block->score->initial) && isset($block->score->correct) && isset($block->score->wrong) && isset($block->score->missing)) {
					$cnf->score->initial = $block->score->initial;
					$cnf->score->correct = $block->score->correct;
					$cnf->score->wrong = $block->score->wrong;
					$cnf->score->missing = $block->score->missing;
				}
				foreach ($block->answers as $answer) {
					if (!isset($answer->link)) continue; //distractors will be skipped
					$cnf->correction->data->{$answer->link} = $answer->value;
				}
			} elseif ($cnf->processing === 'manual') {
				if (isset($block->score->maximum)) {
					$cnf->score->maximum = $block->score->maximum;
				}
			}

			$this->fields->{$cnf->id} = $cnf;

			$html = new stdClass();
			$legend = "";

			foreach ($this->languages as $lang) {
				$text = $block->source->$lang;
				$pattern = "/\[{2}(\d+)#(.*?)]{2}/u";
				$text = preg_replace_callback($pattern, function ($matches) use ($cnf) {
					return $this->createInlineGap($cnf, $matches[1]);
				}, $text);
				$html->$lang = <<<HTML
					<div class="oasysQuestion">{$block->question->$lang}</div>
					<div class='oasysInlineText oasysTag' data-id='$cnf->code'>
						{$text}
					</div>
					<div class='oasysInline_GapDraggableStock' data-group='$cnf->code'></div>
				HTML;
			}
			$this->wrapDiv($html, $num);
		}

		private function createInlineGap($options, $fieldId): string
		{
			$cnf = new stdClass();
			$cnf->group = $options->code;
			$cnf->parentId = $options->id;
			$cnf->id = $options->id . "_" . $fieldId;
			$cnf->code = bin2hex($cnf->id);

			/* the config is language agnostic, so we only have to fill this in for the first language */
			if (!isset($this->fields->{$cnf->id})) {
				$cnf->type = 'oasysInline_Gap';
				$cnf->category = 'fields';
				$cnf->processing = $options->processing;
				if ($cnf->processing !== 'none') {
					$cnf->score = $options->score;
					if ($cnf->processing === 'auto') {
						$cnf->correction = new stdClass();
						$cnf->correction->format = $options->correction->format;
						$cnf->correction->data = $options->correction->data->{$fieldId};
					}
				}
				$this->copyValues($cnf, $options, ['required', 'score']);
				$this->fields->{$cnf->id} = $cnf;
			}

			return "<span class='oasysTag oasysInline_Gap' data-id='$cnf->code'></span>";
		}

		private function getFilter($filter): string
		{
			return match ($filter) {
				'letter_single' => '^[a-zA-Z]$',
				'num_digit' => '^\\d$',
				'num_entire_pos' => '^\\d*$',
				'num_entire' => '^\\-?\\d*$',
				'num_decimal_pos' => '^(\\d*[.,])?\\d*$',
				'num_decimal' => '^\\-?(\\d*[.,])?\\d*$',
				'date_DDMMYYYY' => '^(?:[0-3](?:(?:(?<=0)[1-9]|(?<=[1-2])[0-9]|(?<=3)[[0-1])(?:([\\.\\-\\/])(?:[0-1](?:(?:(?<=0)[1-9]|(?<=1)[0-2])(?:\\1(?:\\d(?:\\d(?:\\d\\d?)?)?)?)?)?)?)?)?)?$',
				default => ''
			};
		}

		private function getInputMode($filter): string
		{
			return match ($filter) {
				'num_digit', 'num_entire_pos' => 'numeric',
				'num_decimal_pos' => 'decimal',
				'num_entire', 'num_decimal' => 'text', //negative numbers cannot be typed on an iPhone in numeric or decimal mode
				default => ''
			};
		}

		private function copyValues(stdClass &$cnf, stdClass &$block, array $keys): void
		{
			foreach ($keys as $key) {
				if (isset($block->$key)) {
					$cnf->$key = $block->$key;
				}
			}
		}

		public function getFields(): string
		{
			return json_encode($this->fields, JSON_UNESCAPED_UNICODE);
		}

		public function getOptions(): string
		{
			return json_encode($this->options, JSON_UNESCAPED_UNICODE);
		}

		public function getParsed(): string
		{
			return json_encode($this->parsed, JSON_UNESCAPED_UNICODE);
		}

		public function getScripts(): string
		{
			return json_encode($this->scripts, JSON_UNESCAPED_UNICODE);
		}

		public function getBlocks(): string
		{
			return json_encode($this->blocks, JSON_UNESCAPED_UNICODE);
		}

		public function getMetadata(): stdClass
		{
			return $this->metadata;
		}

		public function getErrors(): bool|string
		{
			$errorString = false;
			if (count($this->errors) > 0) {
				$errorString = "";
				foreach ($this->errors as $error) {
					$errorString .= "<p>$error</p>";
				}
			}
			return $errorString;
		}

	}
