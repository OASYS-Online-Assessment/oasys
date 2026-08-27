<?php
/** @noinspection SqlResolve */
/** @phan-file-suppress PhanUnusedGlobalFunctionParameter, PhanUnusedVariable, PhanRedefineFunction, PhanUnusedClosureParameter, PhanTypeArraySuspiciousNullable, PhanSuspiciousWeakTypeComparison, PhanUnusedVariableValueOfForeachWithKey */

/*
    TITLE:      MESSAGE TRANSLATION CLASS FILE
    AUTHOR:     ULRICH GEBER
    BUILT:      2020-04-28 
    VERSION:    0.1 ACTIVE DEV
    DESC:       Contains translation functionality for php generated messages.
*/



class uiLang
{
	# --------------------------- #
	# Standard class declarations #
	# --------------------------- #


	/* @var  */
	private $language = null;
	private $fallbackList = null;
	private $messageList = null;

	public $returnData = null;



	# -------------------------------------- #
	# Constructor for Permission Check Class #
	# -------------------------------------- #
	public function __construct($language)
	{

		// $this->db = $db;
		$this->language = $language;

		// define DOCROOT constant
		global $settings;
		if (!defined("DOCROOT")) {
			define("DOCROOT", realpath(__DIR__ . '/../../../') . '/');
		}

		# --------------------------------- #
		# Load JSON language files #
		# --------------------------------- #

		//check if language file exists, if not, create empty array
		if (file_exists(DOCROOT.'editor/inc/lang/'.$language.'.json')) {
			$this->messageList = json_decode(file_get_contents(DOCROOT . 'editor/inc/lang/' . $language . '.json') ?? '', true); // language file JSON (converted to Php Array Object)
		} else {
			$this->messageList = [];
		}
		$this->fallbackList = json_decode(file_get_contents(DOCROOT.'editor/inc/lang/EN.json') ?? '', true); // fallback language file JSON (used if a key is not present in the target language file)

		
		# ------------------------------------------------------- #
		# Transform permission arrays into various usable formats #
		# ------------------------------------------------------- #
		/*$this->itemPermsFlat = [];
		array_walk_recursive($this->itemPerms, function ($val, $key) {
			array_push($this->itemPermsFlat, $val);
		});

		$gen_perms_flat = [];
		array_walk_recursive($gen_perms, function ($val, $key) use (&$gen_perms_flat) {
			array_push($gen_perms_flat, $val);
		});

		// item id being sent in for ig operations. We must catch multiple formulations of the groupId value as there is not a standard naming format for the incoming Ajax variable from the JS file
		$this->item_id = [];*/

	}

	public function translate(string $string, $replaceList = null): string
	{
		/*
            ##########################################################################################
            Message translation

            var string : string, string to translate
            var replaceList : array, placeholders 
            ##########################################################################################
        */
        $translation = '';

        if(array_key_exists ($string, $this->messageList)) { /* exists in target language? */
        	$translation = $this->messageList[$string];
        } else if (array_key_exists ($string, $this->fallbackList)) { /* exists in fallback language? */
        	$translation = $this->fallbackList[$string];
        } else { /* return $string as is */
        	$translation = $string;
        }

		# ----------------------------------------- #
		# replace placeholders
		# ----------------------------------------- #
		if(isset($replaceList)) {
			//replace occurrences of %@ by elements of $replaceList in order from first to last
			foreach ($replaceList as $replacement) {
				$pos = strpos($translation, '%@');
				if ($pos === false) {
					break; // no more placeholders
				}
				$translation = substr_replace($translation, $replacement, $pos, 2);
			}
		}

		// RETURN TRANSLATION OR KEY IF NO TRANSLATION EXISTS
		return $translation;
	}

}
