<?php

require_once 'settingsCommonFunctions.php';

/*
 	This script is required by settings.php and should not be used separately: settings.php publishes the variable
	$settingsDefaults defined here as well as $settings (which handles all overrides).
*/

/* scope constants */
const SETTINGS_SYSTEM = 0; //can be overridden only for the complete system -> always affects all users
const SETTINGS_USER = 1; //can be overriden seperately for each user
const SETTINGS_USERGROUP = 2; //can be overriden for a usergroup or single user by superadmin, but not by user themself

/* format constants */
const FORMAT_BOOL = 0;
const FORMAT_INT = 1;
//////////////////////////////////////////////////////////////
//Not to be used at the moment, if needed jsNumberInput needs to be modified to support floats/doubles
const FORMAT_DOUBLE = 2;
//////////////////////////////////////////////////////////////
const FORMAT_STRING = 3;
const FORMAT_SINGLE_CHOICE_INT = 4; //shown as a dropdown field, where the actual value is an integer (though not visible to the user)
const FORMAT_SINGLE_CHOICE_STRING = 5; //shown as a dropdown field, where the actual value is a string.
const FORMAT_MULTIPLE_CHOICE = 6; //value is saved in database as a JSON encoded array of all checked options
const FORMAT_PASSWORD = 7; //value is saved in database using Crypt::encryptString()

/*
	The $settingsDefault variable defines all possible settings of the platform and gives them default values. It
	contains information on allowed values and required formats as well the context in which they may be overridden.

	Every setting has the following attributes:
		value			the default value
		scope			defines if the setting always affects the whole system, or if can be customized by user
		format			format of the expected value (see above for details)

	Depending on the format, some extra attributes exist:
		FORMAT_INT & FORMAT_DOUBLE
			min			minimum allowed value
			max			maximum allowed value
			step		incremental steps for variable (e.g. 1000 when talking milliseconds)

		FORMAT_SINGLE_CHOICE_INT, FORMAT_SINGLE_CHOICE_STRING & FORMAT_MULTIPLE_CHOICE
			choices		a list of choices to be shown in either a dropbox (SINGLE_CHOICE) or as checkboxes (MULTIPLE_CHOICE)
						this is an array of key/value pairs, where the value is the label to show the user and the key
						is to be saved as the value of the setting

	When overrides happen, the values are always saved as strings into the database; for FORMAT_BOOL that will be 'true'
	or 'false' in lowercase. The settings.php scripts reconverts them to correct native data type.

	In order to remove sensitive global setting entries from bgeing expoed on the client side, when there is a 'noJS' key
	whose value is set to true, the entire key will be removed from the client facing javascript 'settings' variable. The
	noJS subkey does not need to be explicity defined and set to false if the  entry is a standard client-facing entry. -- NN
	 */

function getDefaultSettings(rixPDO &$db, array &$languages, array &$skins): array
{

	// @formatter:off
	$settingsDefaults = [
		"alphaChannel" => [
			'value' => false,
			'scope' => SETTINGS_SYSTEM,
			'format' => FORMAT_BOOL,
			'comment' => "Whether or not the Oasys system is eligible for alpha (unstable) upgrade release packages"
		],
		"ajaxTimeout" => [
			"value" => 30000,
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_INT,
			"min" => 1000,
			"max" => 600000,
			"step" => 1000,
			"comment" => 'The timeout in milliseconds after which the ajax connection is considered missing in action'
		],
		"allowContextMenu" => [
			"value" => false,
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_BOOL,
			"comment" => 'Enable context menu in front end, but beware: this might allow unwanted features (e.g. video controls, google translate, ... etc.)'
		],
		"customLoginURL" => [
			'value' => "",
			'scope' => SETTINGS_SYSTEM,
			'format' => FORMAT_STRING,
			"comment" => 'URL where user is redirected after test instead of standard login page'
		],
		"debugSystem" => [
			"value" => false,
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_BOOL,
			"comment" => 'This defines whether detailed error information is output. DO NOT ENABLE WHEN IN PRODUCTION!!!'
		],
		"defaultLanguage" => [
			"value" => "EN",
			"scope" => SETTINGS_USER,
			"format" => FORMAT_SINGLE_CHOICE_STRING,
			"choices" => $languages,
			"comment" => 'Default language to add to a new page:'
		],
		"defaultPassword" => [
			"value" => "",
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_STRING,
			"comment" => 'This allows to set a default password to be pre-filled in login page'
		],
		"developmentMode" => [
			"value" => false,
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_BOOL,
			"comment" => 'This defines whether the loader uses direct urls for CSS and JS files instead of blobs. DO NOT ENABLE WHEN IN PRODUCTION!!!'
		],
		"disableAnimations" => [
			"value" => false,
			"scope" => SETTINGS_USER,
			"format" => FORMAT_BOOL,
			"comment" => 'Disable all animations in the editor:'
		],"showLockedObjects" => [
			"value" => true,
			"scope" => SETTINGS_USER,
			"format" => FORMAT_BOOL,
			"comment" => 'Show locked objects in file managers:'
		],
		"editorButtons" => [
			"value" => ["content", "tests", "testtakers", "testresults", "activityTracker"], // minimum set of buttons to show
			"scope" => SETTINGS_USERGROUP,
			"format" => FORMAT_MULTIPLE_CHOICE,
			"choices" => [
				'content' => [
					'name' => 'Content Editor',
					'accesslevel' => 0
				],
				'tests' => [
					'name' => 'Test Editor',
					'accesslevel' => 0
				],
				'testtakers' => [
					'name' => 'Test Takers',
					'accesslevel' => 0
				],
				'testresults' => [
					'name' => 'Test Results',
					'accesslevel' => 0
				],
				'activityTracker' => [
					'name' => 'Activity Tracker',
					'accesslevel' => 0
				],
				'l10n' => [
					'name' => 'Localization',
					'accesslevel' => 200
				],
				'systemsettings' => [
					'name' => 'System Settings',
					'accesslevel' => 200
				],
				'users' => [
					'name' => 'Users',
					'accesslevel' => 200
				],
				'backup' => [
					'name' => 'Backup',
					'accesslevel' => 200
				],
				'upgrader' => [
					'name' => 'Upgrader',
					'accesslevel' => 200
				]
			],
			"comment" => 'Defining which editor buttons are visible'
		],
		// TODO: as of right now, when set to SETTINGS_USERGROUP, only FORMAT_MULTIPLE_CHOICE is parsed in the userActions correctly. Expand handling if ever needed.
		// "demo of extra group settings" => [
		// 	'value' => 'whatevs',
		// 	"scope" => SETTINGS_USERGROUP,
		// 	"format" => FORMAT_MULTIPLE_CHOICE,
		// 	"choices" => [
		// 		'a' => [
		// 			'name' => "any setting you want I",
		// 			'accesslevel' => 0
		// 		],
		// 		'b' => [
		// 			'name' => "any setting you want II",
		// 			'accesslevel' => 0
		// 		]
		// 	]
		// ],
		"editorOrder" => [
			"value" => 'cps',
			"scope" => SETTINGS_USER,
			"format" => FORMAT_SINGLE_CHOICE_STRING,
			"choices" => ['cps' => 'content, preview, scoring', 'csp' => 'content, scoring, preview', 'pcs' => 'preview, content, scoring'],
			"comment" => 'Order of editor blocks in interaction editors:'
		],
		"forceLogoff" => [
			"value" => false,
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_BOOL,
			"comment" => 'Default setting for forced logoff when test becomes inactive due to date/time restrictions or on-off switch'
		],
		"hideTimeoutMsg" => [
			"value" => false,
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_BOOL,
			"comment" => 'Default setting for “Hide time out message” for new tests'
		],
		"landingPage" => [
			"value" => "",
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_STRING,
			"comment" => 'This will show instead of login page when returning from a test'
		],
		"ldap_appUser" => [
			'value' => "",
			'scope' => SETTINGS_SYSTEM,
			'format' => FORMAT_STRING,
			"comment" => 'Username for LDAP search account',
			"noJS" => true
		],
		"ldap_appPass" => [
			'value' => "",
			'scope' => SETTINGS_SYSTEM,
			'format' => FORMAT_PASSWORD,
			"comment" => '(encrypted) Password for LDAP search account',
			"noJS" => true
		],
		"ldap_server" => [
			'value' => "",
			'scope' => SETTINGS_SYSTEM,
			'format' => FORMAT_STRING,
			"comment" => 'URL for LDAP server (prepend with LDAP:// or LDPS://)',
			"noJS" => true
		],
		"ldap_searchBase" => [
			'value' => "",
			'scope' => SETTINGS_SYSTEM,
			'format' => FORMAT_STRING,
			"comment" => 'DN for user search base',
			"noJS" => true
		],
		"ldap_query" => [
			'value' => "cn=%1",
			'scope' => SETTINGS_SYSTEM,
			'format' => FORMAT_STRING,
			"comment" => 'Query attribute string for user search (%1 is substituted for username value)',
			"noJS" => true
		],
		"limitNavigation" => [
			"value" => false,
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_BOOL,
			"comment" => 'Default setting for "limit navigation"'
		],
		"loginLanguage" => [
			"value" => "default",
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_SINGLE_CHOICE_STRING,
			"choices" => ['default' => 'browser language', ...$languages],
			"comment" => 'Default language to use at login'
		],
		"logoAdminPanel" => [
			"value" => "images/logos/standard/oasyslogo_backend.svg",
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_STRING,
			"comment" => 'Path to the logo for the admin panel'
		],
		"logoLoginView" => [
			"value" => "images/logos/standard/logo_vertical_large.png",
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_STRING,
			"comment" => 'Path to the logo for the test taker login'
		],
		"logoBackendLoginView" => [
			"value" => "images/logos/standard/logo_vertical_for_dark.svg",
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_STRING,
			"comment" => 'Path to the logo for the back end login'
		],
		"logPayload" => [
			"value" => 0,
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_SINGLE_CHOICE_INT,
			"choices" => [
				0 => "nothing",
				1 => "packages without data",
				2 => "complete packages"
			],
			"comment" => 'Indicates how much of the network traffic will be logged'
		],
		"mediaLocation" => [
			"value" => 'disk',
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_SINGLE_CHOICE_STRING,
			"choices" => ['disk' => 'disk', 'database' => 'database'],
			"comment" => 'Media saved on disk or in database, please contact the OASYS team in order to change this!',
			"options" => ['immutable']
		],
		"menuLanguages" => [
			"value" => ['EN', 'DE', 'FR'],
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_MULTIPLE_CHOICE,
			"choices" => $languages,
			"comment" => 'List of languages to show in login screen; selection will be hidden if only one language is active'
		],
		"mutationMethod" => [
			"value" => 'random',
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_SINGLE_CHOICE_STRING,
			"choices" => ['random' => 'random', 'sequential' => 'sequential'],
			"comment" => 'Default setting for "mutation method" for new mutation tests'
		],
		"passwordField" => [
			"value" => 0,
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_SINGLE_CHOICE_INT,
			"choices" => [
				0 => "obfuscated",
				1 => "readable"
			],
			"comment" => 'Defines if password field shows the typed text or not'
		],
		"retryCount" => [
			"value" => 3,
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_INT,
			"min" => 1,
			"max" => 10,
			"step" => 1,
			"comment" => 'Count of tries to contact server before failing'
		],
		"saveResults" => [
			"value" => true,
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_BOOL,
			"comment" => 'Default setting for "save results" for new tests'
		],
		"sendFrequency" => [
			"value" => 15000,
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_INT,
			"min" => 5000,
			"max" => 60000,
			"step" => 5000,
			"comment" => 'The frequency in milliseconds how often packages are sent to the server'
		],
		/* the following is also hard coded inside dbSessionHandler.php … don't forget to update that if you change this default */
		"sessionTimeout" => [
			"value" => 60,
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_INT,
			"min" => 15,
			"max" => 10080,
			"step" => 15,
			"comment" => 'Time to keep a login session alive'
		],
		"showScore" => [
			"value" => false,
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_BOOL,
			"comment" => 'Default setting for "show score" for new tests'
		],
		"skin" => [
			"value" => "Default Responsive",
			"scope" => SETTINGS_USER,
			"format" => FORMAT_SINGLE_CHOICE_STRING,
			"choices" => $skins,
			"comment" => 'Skin to use for preview & default for new tests:'
		],
		"title" => [
			"value" => "OASYS",
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_STRING,
			"comment" => 'The title for the browser tab. Will also be used by iOS when creating a homescreen link.'
		],
		"useTimer" => [
			"value" => false,
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_BOOL,
			"comment" => 'Default setting for "use timer" for new tests'
		],
        "waitForMediaCache" => [
            "value" => false,
            "scope" => SETTINGS_SYSTEM,
            "format" => FORMAT_BOOL,
            "comment" => 'Default setting for "Wait for media to load" for new tests'
        ],
		"writeLog" => [
			"value" => true,
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_BOOL,
			"comment" => 'Write technical log data'
		],
		"SSOSysActive" => [
			"value" => false,
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_BOOL,
			"comment" => 'SSO integration active'
		],
		"emailSysActive" => [
			"value" => false,
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_BOOL,
			"comment" => "Whether to enable email functionality for automated account resets, account validation, etc."
		],
        "SMTP_Host" => [
			"value" => "",
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_STRING,
			"comment" => "(encrypted) Outgoing email server address for Oasys Editor",
			"noJS" => true
		],
		"SMTP_Port" => [
			"value" => 0,
			"scope" => SETTINGS_SYSTEM,
			"min" => 0,
			"max" => 65535,
			"step" => 1,
			"format" => FORMAT_INT,
			"comment" => "Email server SMTP port value for Oasys Editor",
			"noJS" => true
		],
		"SMTP_Username" => [
			"value" => "",
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_STRING,
			"comment" => "(encrypted) Email server SMTP username value for Oasys Editor",
			"noJS" => true
		],
		"SMTP_Password" => [
			"value" => "",
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_PASSWORD,
			"comment" => "(encrypted) Email server SMTP password value for Oasys Editor",
			"noJS" => true
		],
		"SMTP_From" => [
			"value" => "",
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_STRING,
			"comment" => "FROM address value for outgoing emails",
			"noJS" => true
		],
		"SMTP_Encryption" => [
			"value" => 0,
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_SINGLE_CHOICE_INT,
			"choices" => [0 => 'None', 1 => 'Implicit TLS', 2 => 'StartTLS'],
			"comment" => "Encryption type for SMTP server connection (none/implicit/TLS upgradable)",
			"noJS" => true
		],
		"reset_LDAP_Redirect" => [
			"value" => "",
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_STRING,
			"comment" => "URL redirect value for LDAP password information (ensure to prefix with \"http(s)://\")",
			"noJS" => true
		],
		"upgraderURL" => [
			"value" => "https://update.oasys.lu/",
			"scope" => SETTINGS_SYSTEM,
			"format" => FORMAT_STRING,
			"comment" => "Oasys upgrade server URL (ensure to prefix with \"http(s)://\")"
		]
	];
	// @formatter:on

	// filter out settings whose scope is not SETTINGS_SYSTEM if $filterSettings is set to true
	global $filterSettings;
	if ($filterSettings === true) {
		foreach ($settingsDefaults as $property => $entry) {
			if ($entry['scope'] !== SETTINGS_SYSTEM) {
				unset($settingsDefaults[$property]);
			}
		}
	}

	return $settingsDefaults;
}
