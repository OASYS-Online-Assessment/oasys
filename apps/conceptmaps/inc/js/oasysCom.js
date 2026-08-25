"use strict";

/*
 OasysCom v1.00

 Depencies:
 Instance of a communication object in OASYS
 jQuery 1.7 or newer

 */

(function ($) {
    function OasysCom() {
      	let inoasys; // standalone or in an oasys iframe?
        let comObj = null;
        let context = null; // could be frontend, item editor or manual correction
        if (window !== window.top) {
            inoasys = true;
            comObj = window.parent;

            context = comObj.getExternalContext();
        } else {
            inoasys = false;
        }

        // private
        function docData () {
            //clearSelection();
            let data = $.extend(true,{}, dd); // data of map objects            
            for (let i in data) {
                // global locking (to be removed when single locking is implemented)
                if (context === 'editor') { // apply global state
                    if (data[i].type === 'label') {
                        data[i].locked = DATAFORMAT.getLabelsLocked();
                    } else {
                        data[i].locked = DATAFORMAT.getObjectsLocked();
                    }
                }
                if (data[i].glow) delete data[i].glow;
                if (data[i].type === 'handle') delete data[i];
            }
            let completeData = {meta: DATAFORMAT.getMeta(),map: data};
            return completeData;
        }

        function loadDocData () {
            let data = comObj.getExternalData();
            data = JSON.parse(data);
            if ($.isEmptyObject(data)) {
                // set labels editable cb to disabled
                $('#cbLabelsEditable').prop("disabled", true);
                return; // don't load empty documents -> CMS-82
            }
            //data = DATAFORMAT.prepareData(JSON.parse(data));
            //data = DATAFORMAT.prepareData(jpd);
            
            if (data.hasOwnProperty('error')) {
                let dialogData = {
                    buttons : [
                        {label: UILANG.m('Close'), 'cancel': true, value: 'ok'},
                    ],
                    width: 400
                };
                if (data.error === 'filefromthefuture') dialogData.contents = UILANG.m('filefromthefuture');
                new nxDialog('errorDialog', dialogData, null);

                return false;
            }
            recreateDocument(data); // defined in document.js
        }
      	
        // public 
        // setter for document data
        this.setData = function (data) {
            recreateDocument(JSON.parse(data)); // defined in document.js
        };
    
        // getter for document data
        this.getData = function () {
            return docData();
        };

        // close item editor
        this.closeEditor = function() {
            if ((comObj ?? null) === null) return;
            // todo: really set data in oasys?
            $(window).off('beforeunload');
            let isSaved = savingWatcher.getSaved();
            //return;
            if (isSaved === false && context !== 'manualCorrection') { // warn when exiting without saving
                let dialogData = {
                    buttons: [
                        {label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel'},
                        {label: UILANG.m('Proceed'), 'default': true, value: 'proceed'}
                    ],
                    contents: UILANG.m('There is unsaved content in your conceptmap. If you proceed, you will loose all unsaved changes!'),
                    title: UILANG.m('Proceed without saving?'),
                    width: 400,
                    callback: function (b) {
                        if(b === 'cancel') return;
                        if (context === 'editor') comObj.save(); // only in editor, not in assessment
                        comObj.closeExternalEditor();
                    }
                };
                new nxDialog('overwriteDialog', dialogData, null);
            } else {
                if (context === 'editor') comObj.save(); // only in editor, not in assessment
                if (context === 'assessment') comObj.setExternalData(docData()); // only in assessment
                comObj.closeExternalEditor();
            }
            
        };

        // prepare UI according to context
        this.doContext = function() {
            if (context === 'manualCorrection') {
                 
                // remove buttons not needed in this context
                $('#background_openButton').css('display','none');
                $('#background_saveButton').css('display','none');
                $('#background_uploadButton').css('display','none'); // hide upload map
                $('#background_deleteButton').css('display','none');
                $('#background_gridButton').css('display','none');
                $('#background_undoButton').css('display','none');
                $('#background_redoButton').css('display','none');
                $('#background_clearCanvasButton').css('display','none');

                $('#background_helpButton').css('display','none'); // hide help button (until it will get some useful functionality)
                $('#background_langButton').css('display','none'); // hide lang choice
                $('#background_returnToTestButton').css('display','none'); // hide close for assessment
                $('#background_save2oasysButton').css('display','none'); // hide save to oasys
                $('#background_lockButton').css('display','none'); // lock objects

                // remove the rest of the UI
                $('#toolSwitch').css('display','none');
                $('#leftPanel').css('display','none');
                $('#main').css({'left':'0px','top':'70px'});
                $('#canvas').css({cursor: 'default'});
                // mouse and keyboard are blocked in events.js by OASYSCOM.getContext() conditions
                loadDocData ();
            }

            if (context === 'editor') { // item creation

                $('#background_openButton').css('display','none'); // semantically identical buttons are displayed
                $('#background_saveButton').css('display','none');

                $('#background_helpButton').css('display','none'); // hide help button (until it will get some useful functionality)
                $('#background_langButton').css('display','none'); // hide lang choice
                $('#background_returnToTestButton').css('display','none'); // hide close for assessment

                $('.hideWhenEditor').css('display','none'); // keyboard shortcuts
                loadDocData ();

                let question = comObj.getExternalQuestion();
                if (question === '') $('#background_showButton').css('display','none'); // hide show question in case there isn't a question set in the item
            }

            if (context === 'assessment') { // frontend
                $('#background_downloadButton').css('display','none'); // hide save to disk
                $('#background_uploadButton').css('display','none'); // hide upload map
                $('#background_openButton').css('display','none'); // semantically identical, differently named buttons for standalone
                $('#background_saveButton').css('display','none');
                $('#background_clearCanvasButton').css('display','none'); // no weapons of map destruction in assessment
                $('#background_helpButton').css('display','none'); // hide help button (until it will get some useful functionality)
                $('#background_langButton').css('display','none'); // hide lang choice
                $('#background_save2oasysButton').css('display','none'); // hide save to oasys
                $('#background_closeEditorButton').css('display','none'); // hide close to oasys
                $('#background_lockButton').css('display','none'); // lock objects
                $('.hideWhenAssessment').css('display','none'); // keyboard shortcuts
                $('.hideWhenNotEditor').css('display','none'); // keyboard shortcuts
                        
                loadDocData ();

                let question = comObj.getExternalQuestion();
                if (question === '') $('#background_showButton').css('display','none'); // hide show question in case there isn't a question set in the item
            }

            if (context !== 'assessment') { // except for frontend
                $('#autosaveNotice').css('display','none'); // hide autosave notice
            }

            if ((context ?? null) === null) { // standalone
                $('#background_downloadButton').css('display','none'); // hide save to disk (semantically identical buttons open and save are displayed)
                $('#background_uploadButton').css('display','none'); // hide upload map
                $('#background_save2oasysButton').css('display','none'); // hide save to oasys
                $('#background_closeEditorButton').css('display','none'); // hide close to oasys
                $('#background_returnToTestButton').css('display','none'); // hide close for assessment
                $('#background_showButton').css('display','none'); // hide show question
                $('#background_lockButton').css('display','none'); // lock objects

                $('.hideWhenNotEditor').css('display','none'); // keyboard shortcuts
            } else { // all contexts
                // set focus to self in order to make shortcuts work
                self.focus();

                // set lang from oasys
                let lang = comObj.getExternalLanguage();
                //console.log(lang);
                UILANG.updateLang(lang);             
            }
        };

        // some parts of Concept Maps code rely on context, i.e. manualCorrection must block all mouse and keyboard interactions
        this.getContext = function () {
            return context;
        };

        this.saveToOasys = function () {
            comObj.setExternalData(docData());
            savingWatcher.setSaved(true);
            //comObj.save();
        };

        // get and display the question part of the oasys concept maps item
        this.showQuestion = function () {
            let question = comObj.getExternalQuestion();
            let dialogData = {
                    buttons: [
                        {label: 'OK', 'default': true, value: 'ok'}
                    ],
                    contents: question,
                    /*title: UILANG.m('Question'),*/
                    
                    callback: function (b) {
                        return;
                    }
                };
            new nxDialog('questionDisplay', dialogData, null);
            // make nxDialog look oasysh (close to the appearance of the question in the frontend)
            $('#questionDisplay').removeAttr("style"); // remove all the formatting
            $('#questionDisplay').removeClass('ui-draggable');
            /* it should look according to the current oasys skin
               todo: pass CSS from oasys frontend
               for now CSS for #questionDisplay is defined in style.css */
        }


    
    }

    //export class
    window.OasysCom = OasysCom;

})(jQuery);
