"use strict";

function Lang() {

  	let lang; // UI language
  	const translatableNodeTypes = 'DIV, P, LABEL, SPAN'; // nodes which might contain translatable content.to be updated!
        let nxBtnInstances = []; // nxButton does reset the label to the last state, which does mean to the last language...
        // bZoom, bDelete, bUpload, bGrid, bScroll, bUndo, bRedo, bHome, bDownload, bLang, bHelp, bClearCanvas
	
        //const loadingMessages = [/*loadingMessages*/];
	// en = {/*enStrings*/};
	const msg = {
        'upload document' : {
                EN : 'import',
                DE : 'importieren',
                FR : 'importer',
                LU : 'Importéieren'
        },
        'selection tool' : {
                EN : 'select',
                DE : 'Auswahl',
                FR : 'sélectionner',
                LU : 'Auswielen'
        },
        'drawing tool' : {
                EN : 'draw',
                DE : 'Form',
                FR : 'dessiner',
                LU : 'Zeechnen'
        },
        'connection tool' : {
                EN : 'connect',
                DE : 'Verbindung',
                FR : 'connecter',
                LU : 'Verbannen'
        },
        'zoom settings' : {
                EN : 'zoom',
                DE : 'zoom',
                FR : "zoom",
                LU : 'Zoomen'
        },
        'delete selected elements' : {
                EN : 'delete',
                DE : 'löschen',
                FR : 'supprimer',
                LU : 'Läschen'
        },
        'download document' : {
                EN : 'export',
                DE : 'exportieren',
                FR : 'exporter',
                LU : 'Exportéieren'
        },
        'grid settings' : {
                EN : 'grid',
                DE : 'Raster',
                FR : 'grille',
                LU : 'Raster'
        },
        'undo' : {
                EN : 'undo',
                DE : 'zurück',
                FR : 'annuler',
                LU : 'Annuléieren'
        },
        'redo' : {
                EN : 'redo',
                DE : 'vorwärts',
                FR : "rétablir",
                LU : 'Retabléieren'
        },
        'clear canvas' : {
                EN : 'clear canvas',
                DE : 'alles löschen',
                FR : "tout supprimer",
                LU : 'Alles läschen'
        },
        'language' : {
                EN : 'language',
                DE : 'Sprache',
                FR : "langue",
                LU : 'Sprooch'
        },
        'home' : {
                EN : 'home',
                DE : 'Home',
                FR : "accueil",
                LU : 'Home'
        },
        'object shape' : {
                EN : 'object shape',
                DE : 'Form',
                FR : "forme de l'objet",
                LU : 'Objetform'
        },
        'connector shape' : {
                EN : 'connector shape',
                DE : 'Verbindung',
                FR : 'forme du connecteur',
                LU : 'Verbindungsform'
        },
        'line style' : {
                EN : 'line style',
                DE : 'Linienstil',
                FR : 'style de ligne',
                LU : 'Stil vum Stréch'
        },
        'line width' : {
                EN : 'line width',
                DE : 'Linienbreite',
                FR : 'largeur de ligne',
                LU : 'Breet vum Stréch'
        },
        'colour' : {
                EN : 'colour',
                DE : 'Farbe',
                FR : 'couleur',
                LU : 'Faarw'
        },
        'text editor' : {
                EN : 'text editor',
                DE : 'Texteditor',
                FR : 'éditeur de texte',
                LU : 'Textbeaarbeschtung'
        },
        'scroll document' : {
                EN : 'scroll document',
                DE : 'Dokument scrollen',
                FR : 'défiler le document',
                LU : 'Dokument scrollen'
        },
        'Selection Properties' : {
                EN : 'Selection Properties',
                DE : 'Auswahl Eigenschaften',
                FR : 'Propriétés de la sélection',
                LU : 'Selektiounsproprietéiten'
        },
        'Drawing Tool Properties' : {
                EN : 'Drawing Tool Properties',
                DE : 'Zeichenwerkzeug Eigenschaften',
                FR : "Propriétés de l'outil de dessin",
                LU : 'Molproprietéiten'
        },
        'Connector Tool Properties' : {
                EN : 'Connector Tool Properties',
                DE : 'Verbindungswerkzeug Eigenschaften',
                FR : "Propriétés de l'outil de connexion",
                LU : 'Verbindungsproprietéieten'
        },
        'Label' : {
                EN : 'Label',
                DE : 'Beschriftung',
                FR : 'Etiquette',
                LU : 'Label'
        },
        'Properties' : {
                EN : 'Properties',
                DE : 'Eigenschaften',
                FR : 'Propriétés',
                LU : 'Proprietéiten'
        },
        'Cancel' : {
                EN : 'Cancel',
                DE : 'Abbrechen',
                FR : 'Annuler',
                LU : 'Ofbriechen'
        },
        'Overwrite' : {
                EN : 'Overwrite',
                DE : 'Überschreiben',
                FR : 'Remplacer',
                LU : 'Iwwerschreiwen'
        },
        'There is already content in the conceptmap. Loading a new conceptmap will delete everything in the current map!' : {
                EN : 'There is already content in the concept map. Loading a new concept map will delete everything in the current map!',
                DE : 'In ihrer Concept-Map sind bereits Objekte. Das Laden eines Dokuments wird alle aktuellen Objekte löschen!',
                FR : "La carte conceptuelle contient déjà du contenu. Le chargement d'une nouvelle carte conceptuelle supprimera tout ce qui se trouve dans la carte actuelle.",
                LU : "Et ass scho Contenu an der Conceptmap. D'Luede vun enger neier Conceptmap läscht alles an der aktueller Conceptmap."
        },
        'Delete current objects?' : {
                EN : 'Delete current objects?',
                DE : 'Aktuelle Objekte löschen?',
                FR : 'Supprimer les objets en cours?',
                LU : 'Aktuell Objete läschen'
        },
        'Keyboard shortcuts' : {
                EN : 'Keyboard shortcuts',
                DE : 'Tastaturbefehle',
                FR : 'Raccourcis clavier',
                LU : 'Tastatur-Shortcutten'
        },
        'select: cmd/ctrl+1' : {
                EN : 'select: ctrl+1',
                DE : 'Auswählen: ctrl+1',
                FR : 'Sélectionner: ctrl+1',
                LU : 'Auswielen: Cmd/Ctrl+1'
        },
        'draw: cmd/ctrl+2' : {
                EN : 'draw: ctrl+2',
                DE : 'Zeichnen: ctrl+2',
                FR : 'Dessiner: ctrl+2',
                LU : 'Zeechnen: Cmd/Ctrl+2'
        },
        'connect: cmd/ctrl+3' : {
                EN : 'connect: ctrl+3',
                DE : 'Verbinden: ctrl+3',
                FR : 'Connecter: ctrl+3',
                LU : 'Verbannen: Cmd/Ctrl+3'
        },
        'zoom: cmd/ctrl+m' : {
                EN : 'zoom: cmd/ctrl+shift+m',
                DE : 'Zoom: cmd/ctrl+shift+m',
                FR : 'Zoom: cmd/ctrl+shift+m',
                LU : 'Zoomen: Cmd/Ctrl+Shift+M'
        },
        'grid: cmd/ctrl+g' : {
                EN : 'grid: ctrl+g',
                DE : 'Raster: ctrl+g',
                FR : 'Grille: ctrl+g',
                LU : 'Raster: Cmd/Ctrl+G'
        },
        'delete: del/backspace' : {
                EN : 'delete: del/backspace',
                DE : 'Löschen: Entf/Löschen',
                FR : 'Supprimer: del/backspace',
                LU : 'Läschen: Del/Backspace'
        },
        'undo: cmd/ctrl+z' : {
                EN : 'undo: ctrl+z',
                DE : 'Schritt zurück: ctrl+z',
                FR : 'Annuler: ctrl+z',
                LU : 'Annuléieren: Cmd/Ctrl+Z'
        },
        'redo: cmd/ctrl+shift+z' : {
                EN : 'redo: ctrl+shift+z',
                DE : 'Schritt vorwärts: ctrl+shift+z',
                FR : 'Rétablir: ctrl+shift+z',
                LU : 'Retabléieren: Cmd/Ctrl+Shift+Z'
        },
        'load document: cmd/ctrl+o' : {
                EN : 'open document: ctrl+o',
                DE : 'Dokument öffnen: ctrl+o',
                FR : 'Ouvrir un document: ctrl+o',
                LU : 'Dokument opmachen: Cmd/Ctrl+O'
        },
        'save document: cmd/ctrl+s' : {
                EN : 'save document: ctrl+s',
                DE : 'Dokument speichern: ctrl+s',
                FR : 'Sauvegarder un document: ctrl+s',
                LU : 'Dokument späicheren: Cmd/Ctrl+S'
        },
        'import: cmd/ctrl+o' : {
                EN : 'import: ctrl+o',
                DE : 'importieren: ctrl+o',
                FR : 'Importer: ctrl+o',
                LU : 'Importéieren: Cmd/Ctrl+O'
        },
        'export: cmd/ctrl+s' : {
                EN : 'export: ctrl+s',
                DE : 'exportieren: ctrl+s',
                FR : 'Exporter: ctrl+s',
                LU : 'Exportéieren: Cmd/Ctrl+S'
        },
        ' grid visible' : {
                EN : ' grid visible',
                DE : ' Raster anzeigen',
                FR : ' Grille visible',
                LU : 'Raster siichtbar maachen'
        },
        ' snap to grid' : {
                EN : ' snap to grid',
                DE : ' am Raster ausrichten',
                FR : ' Aligner sur la grille',
                LU : 'um Raster ausriichten'
        },
        'help' : {
                EN : 'help',
                DE : 'Hilfe',
                FR : 'Aide',
                LU : 'Hëllef'
        },
        'Save' : {
                EN : 'Save',
                DE : 'Speichern',
                FR : 'Sauvegarder',
                LU : 'späicheren'
        },
        'Save Concept Map' : {
                EN : 'Save Concept Map',
                DE : 'Concept Map speichern',
                FR : 'Sauvegarder votre carte conceptuelle',
                LU : 'Conceptmap späicheren'
        },
        'Export Concept Map' : {
                EN : 'Export Concept Map',
                DE : 'Concept Map exportieren',
                FR : 'Exporter votre carte conceptuelle',
                LU : 'Conceptmap exportéieren'
        },
        'saveDialog1' : {
                EN : 'The concept map file will be saved on your computer. <br>You can open and work on your concept map any time by opening the file again.',
                DE : 'Die Datei mit Ihrer Concept Map wird auf Ihrem Computer gespeichert.<br>Sie können Ihre Concept Map jederzeit öffnen und weiter bearbeiten.',
                FR : "Le document comprenant la carte conceptuelle va être enregistré sur votre ordinateur.<br>Vous pouvez ouvrir et travailler sur votre carte conceptuelle à tout moment en chargeant à nouveau le document.",
                LU : "D'Dokument vun der Conceptmap gëtt op Ärem Computer gespäichert.<br>Dir kënnt Är Conceptmap zu all Zäit opmaachen an dru schaffen."
        },
        'saveDialogCorrection' : {
                EN : 'The concept map document will be exported to your computer, enabling you to to share it with another person.',
                DE : 'Das Concept Map-Dokument wird auf Ihren Computer exportiert, so dass Sie es mit anderen Personen teilen können.',
                FR : "Le document de la carte conceptuelle sera exporté sur votre ordinateur, ce qui vous permettra de le partager avec une autre personne.",
                LU : "D'Concept-Map Dokument gëtt op Äre Computer exportéiert, wat Iech erméiglecht, et mat enger anerer Persoun ze deelen."
        },
        'saveDialogEditor' : {
                EN : 'A snapshot of your work will be exported to your computer, allowing you to revert to the current state of your document at a later time.',
                DE : 'Ein Schnappschuss Ihrer Arbeit wird auf Ihren Computer exportiert, so dass Sie zu einem späteren Zeitpunkt zum derzeitigen Stand Ihres Dokuments zurückkehren können.',
                FR : "Un snapshot de votre travail sera exporté sur votre ordinateur, ce qui vous permettra de revenir ultérieurement à l'état actuel de votre document.",
                LU : "E Snapshot vun Ärer Aarbecht gëtt op Äre Computer exportéiert, wat Iech erméiglecht, spéider op de momentane Stand vun Ärem Dokument zréckzegoen."
        },
        'saveDialog2' : {
                EN : 'Please provide a name for your concept map:',
                DE : 'Bitte geben Sie einen Namen für Ihre Concept Map ein:',
                FR : 'Veuillez attribuer un nom à votre carte conceptuelle :',
                LU : 'Gitt Ärer Conceptmap wgl. en Numm:'
        },
        'Close' : {
                EN : 'close',
                DE : 'schließen',
                FR : 'fermer',
                LU : 'Zoumaachen'
        },
        'open' : {
                EN : 'open',
                DE : 'öffnen',
                FR : 'ouvrir',
                LU : 'Opmaachen'
        },
        'Sorry, your browser does not support embedded videos.' : {
                EN : 'Sorry, your browser does not support embedded videos.',
                DE : 'Tut uns leid, Ihr Browser unterstützt keine eingebundenen Videos.',
                FR : 'Désolé, votre navigateur ne prend pas en charge les vidéos intégrées.',
                LU : 'Et deet eis leed, Äre Browser ënnerstëtzt keng integréiert Videoen.'
        },
        'You can download the video by clicking this link' : {
                EN : 'You can download the video by clicking this link',
                DE : 'Sie können das Video herunterladen indem Sie diesen Link klicken.',
                FR : 'Vous pouvez télécharger la vidéo en cliquant sur ce lien.',
                LU : 'Dir kënnt de Video eroflueden, andeems Dir op de Link klickt. '
        },
        'There is unsaved content in your conceptmap. If you proceed, you will loose all unsaved changes!' : {
                EN : 'There is unsaved content in your conceptmap. If you proceed, you will loose all unsaved changes!',
                DE : 'In ihrer Concept-Map sind bereits Objekte. Fortfahren wird alle ungespeicherten Änderungen löschen!',
                FR : "La carte conceptuelle contient déjà du contenu. Continuer supprimera tout ce qui se trouve dans la carte actuelle.",
                LU : 'An Ärer Conceptmap gëtt et net-gespäichert Inhalter. Wann Dir weiderfuert, verléiert Dir all net-gespäichert Ännerungen!'

        },
        'Proceed' : {
                EN : 'Proceed',
                DE : 'Fortfahren',
                FR : 'Continuer',
                LU : 'Weiderfueren'
        },
        'Proceed without saving?' : {
                EN : 'Proceed without saving?',
                DE : 'Fortfahren ohne Speichern?',
                FR : 'Continuer sans sauvegarder ?',
                LU : 'Weiderfueren, ouni ze späicheren?'
        },
        'Delete all objects?' : {
                EN : 'Delete all objects?',
                DE : 'Alle Objekte löschen?',
                FR : 'Tout supprimer ?',
                LU : "All d'Objete läschen?"
        },
        'If you proceed, all objects will be deleted!' : {
                EN : 'If you proceed, all objects will be deleted!',
                DE : 'Wenn Sie fortfahren werden alle Objekte gelöscht!',
                FR : 'Continuer supprimera tout ce qui se trouve dans la carte actuelle.',
                LU : "Wann Dir weiderfuert, ginn all d'Objete geläscht!"
        },
        'save' : {
                EN : 'save',
                DE : 'speichern',
                FR : 'sauvegarder',
                LU : 'Späicheren'
        },
        'Return to test' : {
                EN : 'Return to test',
                DE : 'Zurück zum Test',
                FR : 'Return to test',
                LU : 'Zeréck bei den Test'
        },
        'Show question' : {
                EN : 'Show question',
                DE : 'Frage anzeigen',
                FR : 'Afficher la question',
                LU : 'Fro uweisen'
        },
        'Question' : {
                EN : 'Question',
                DE : 'Frage',
                FR : 'Question',
                LU : 'Fro'
        },
        'All changes will be automatically saved.' : {
                EN : 'All changes will be automatically saved.',
                DE : 'Alle Änderungen werden automatisch gespeichert.',
                FR : 'Tous les changements seront enregistrés.',
                LU : 'All Ännerunge ginn automatesch gespäichert. '
        },
        'scrollmode active' : {
                EN : 'scrollmode active',
                DE : 'Scrollmodus aktiv',
                FR : 'mode de défilement actif',
                LU : 'Scrollmodus aktivéiert'
        },
        'Font size' : {
                EN : 'Font size',
                DE : 'Schriftgröße',
                FR : 'taille de police',
                LU : 'Schrëftgréisst'
        },
        'filefromthefuture' : {
                EN : 'The map you are trying to load has been created with a newer version of Concept Maps. Please contact your administrator!',
                DE : 'Die Map, die Sie laden wollen, wurde mit einer neueren Version von Concept Maps erstellt. Bitte kontaktieren Sie Ihren Administrator!',
                FR : 'La carte conceptuelle que vous essayez de charger a été créée avec une version plus récente de Concept Maps. Veuillez contacter votre administrateur !',
                LU : "D'Map, déi Dir versicht ze lueden, ass mat enger méi neier Versioun vu Concept Maps erstallt ginn. Kontaktéiert wgl. Ären Administrateur."
        },
        'Lock' : {
                EN : 'Lock',
                DE : 'Sperren',
                FR : 'verrouiller',
                LU : 'Spären'
        },
        'Lock content' : {
                EN : 'Lock content',
                DE : 'Inhalt sperren',
                FR : 'Verrouiller le contenu',
                LU : 'Contenu spären'
        },
        'Labels editable' : {
                EN : 'Labels editable',
                DE : 'Beschriftungen bearbeitbar',
                FR : 'Inscriptions modifiables',
                LU : 'Labelen editéierbar'
        },
	};

	getLang(); // initialize variable lang
  	

	function t(str, replacement) {
		/* todo: replace placeholder with replacement */
		return str;
	}

	// UG reactivate for server errors???
	/* returns the given string if it isn't a key in the translation files */
	/*function e(str) {
		let r;
		if (typeof msg[str] !== 'undefined' && msg[str] !== '') {
			r = msg[str];
		} else if (typeof en[str] !== 'undefined' && msg[str] !== '') {
			r = en[str];
		} else {
			r = str;
			//console.log('error message: '+str);
		}
		return r;
	}*/

	/* returns the value of the key in the translation object
	   fallback to EN if the key is missing in the target language
	   returns error string if the key is missing in EN, too
	*/
	function m(key) {
		let r;
		if (typeof msg[key] === 'undefined') {
			r = key;
		} else if (typeof msg[key][lang] !== 'undefined' && msg[key][lang] !== '') {
			r = msg[key][lang];
		} else if (typeof msg[key].EN !== 'undefined' && msg[key].EN !== '') {
			r = msg[key].EN;
		}
		return r;
	}

	// helper ------------------------------------------------------

	// UI language
	function getLang () {
		let l = localStorage.getItem('lang'); // read stored UI language
		if (l == null) { // no UI language set yet
            let navLang = navigator.language.split('-').shift().toUpperCase(); // retrieve part of fr-FR or fr-fr or...
            let availLangs = ['EN','DE','FR','LU'];
            // set browser language as default if available
            if (availLangs.includes(navLang)) {
                localStorage.setItem('lang', navLang);
                getLang();
                refreshLang();
            } else {
                //setLang (); // browser language not availe for UI -> raise chooser dialog
                localStorage.setItem('lang', 'EN');
                getLang();
                refreshLang();
            }
		} else { // successfully read from local storage
			lang = l;
		}
	}

	// raise language dialog
	function setLang () {
        let l = localStorage.getItem('lang'); // read stored UI language
        /* editor toolbar buttons */
        $('#cm_toolbar_bold_btn').removeClass('selected-tool-btn_'+l);
        $('#cm_toolbar_bold_btn').removeClass('cm_toolbar_bold_btn_'+l);
        $('#cm_toolbar_italic_btn').removeClass('selected-tool-btn_'+l);
        $('#cm_toolbar_italic_btn').removeClass('cm_toolbar_italic_btn_'+l);
        let buttons = null;
        switch (l) {
            case 'EN':
                buttons = [
                        {label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel'},
                        {label: 'Deutsch', 'default': false, value: 'DE'},
                        {label: 'Français', 'default': false, value: 'FR'},
                        {label: 'Lëtzebuergesch', 'default': false, value: 'LU'}
                    ];
                break;
            case 'DE':
                buttons = [
                        {label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel'},
                        {label: 'English', 'default': false, value: 'EN'},
                        {label: 'Français', 'default': false, value: 'FR'},
                        {label: 'Lëtzebuergesch', 'default': false, value: 'LU'}
                    ];
                break;
            case 'FR':
                buttons = [
                        {label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel'},
                        {label: 'English', 'default': false, value: 'EN'},
                        {label: 'Deutsch', 'default': false, value: 'DE'},
                        {label: 'Lëtzebuergesch', 'default': false, value: 'LU'}
                    ];
                break;
            case 'LU':
                    buttons = [
                            {label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel'},
                            {label: 'English', 'default': false, value: 'EN'},
                            {label: 'Deutsch', 'default': false, value: 'DE'},
                            {label: 'Français', 'default': false, value: 'FR'}
                        ];
                    break;
            default:
                buttons = [
                        {label: 'English', 'default': false, value: 'EN'},
                        {label: 'Deutsch', 'default': false, value: 'DE'},
                        {label: 'Français', 'default': false, value: 'FR'},
                        {label: 'Lëtzebuergesch', 'default': false, value: 'LU'}
                    ];
                break;
        }
		// let dialogData = {
		// 			buttons: buttons,
		// 			contents: ' ',
		// 			title: 'Language - Sprache - Langue',
		// 			width: 400,
		// 			callback: function (b) {
                //         if (b === 'cancel') return; // shouldn't that be implemented in nxButton?
		// 				localStorage.setItem('lang', b);
		// 				getLang();
		// 				refreshLang();
		// 			}
		// 		};
		// new nxDialog('langDialog', dialogData, null);


        //         let langContents = '<div class="hoverHilight"><ul><li>Bu</li> <li>Mu</li><li></li></ul></div>';
        //        let langPopup = new nxPopup('langPopup', {
        //                 anchor: $('#langButton'),
        //                 width: 250,
        //                 height: 60,
        //                 topMargin: '40',
        //                 background: 'rgba(255, 255, 255, 0.5)',
        //                 contents: langContents
        //         });
      
        getLang();
        refreshLang();


	}



	// traverse all relevant elements and apply translations
	// when land is set/changed, the UI allready is loaded
	function refreshLang () { 
		let isText; // 
                /* editor toolbar buttons */
                $('#cm_toolbar_bold_btn').addClass('cm_toolbar_bold_btn_'+currentLang());
                $('#cm_toolbar_italic_btn').addClass('cm_toolbar_italic_btn_'+currentLang());
		$(translatableNodeTypes).each(function() { 
			// text
			if ($(this).text() in msg) { // translatable title
				//console.log($(this).text());
				//$(this).text(msg[$(this).text()][lang]);
			}
			// tooltip
			if ($(this).attr('data-translate') !== undefined && $(this).attr('data-translate') in msg) { // translatable title
				//console.log($(this)[0].tagName);
				$(this).attr('title',msg[$(this).attr('data-translate')][lang]); // tooltips
				if (translatableNodeTypes.includes($(this)[0].tagName) && $(this).text() !== '') { // don't put text in nodes without text!
					$(this).text(msg[$(this).attr('data-translate')][lang]); // sidebar section headline
				}
			}
		});

                // registered nxButtons
                nxBtnInstances.forEach(function(inst){
                  if(inst === undefined) {
                        return;
                  }
                  let tr = inst.getTranslate();
                  inst.setLabel(msg[tr][lang]);
                });
	}

    // getter for current language
    function currentLang () {
        return lang;
    }

    /* register nxButton instances in order to repair their language glitch */
    function registerNxButton (refArr) {       
        refArr.forEach(function(ref){
          if(ref === undefined) {
                return;
          }
          nxBtnInstances.push(ref);
        });
    }

    function updateLang(newLang) {
        /* editor toolbar buttons */
        $('#cm_toolbar_bold_btn').removeClass('selected-tool-btn_'+currentLang());
        $('#cm_toolbar_bold_btn').removeClass('cm_toolbar_bold_btn_'+currentLang());
        $('#cm_toolbar_italic_btn').removeClass('selected-tool-btn_'+currentLang());
        $('#cm_toolbar_italic_btn').removeClass('cm_toolbar_italic_btn_'+currentLang());
        lang = newLang;
        refreshLang ();
    }


	//this.loadingMessages = loadingMessages; // UG ???
	this.setLang = setLang; // public. call from language change button in the UI.
        this.registerNxButton = registerNxButton;
        this.updateLang = updateLang;

	//this.t = t;
	//this.e = e;
	this.m = m;

    this.currentLang = currentLang;
}

//const UILANG = new Lang();

/*for (let msg of UILANG.loadingMessages) {
	alert(msg);
}*/
