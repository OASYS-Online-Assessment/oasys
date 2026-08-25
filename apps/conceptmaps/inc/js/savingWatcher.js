"use strict";
(function ($) {
    function SavingWatcher() {
    
      	let isSaved = true; // boolean saved status of document
        let isLoading = false; // avoid setting status while loading a document
      	
        // public 

        // setter for loading state
        this.setLoading = function (status) {
            isLoading = status;
        };

        // setter for saved status of document
        this.setSaved = function (status) {
            isSaved = status;
            // handle any possible oasys context
            if(isLoading === true) return; // no oasys actions while loading
            let oasysContext = OASYSCOM.getContext();
            if((oasysContext ?? null) !== null) { // running in oasys
                if(isSaved === true) { // switch save button status in editor
                    bSave2oasys.disable();
                } else {
                    bSave2oasys.enable();
                }
                if(oasysContext === 'assessment' && isSaved === false) { // all changes are submitted to oasys frontend
                    OASYSCOM.saveToOasys();
                }
            }
        };
    
        // getter for saved status of document
        this.getSaved = function () {
            return isSaved;
        };

        this.exitWithoutSaving = function (e = {type : 'default'}) { // set type to default for calls without event
            if (e.type !== 'default') {
                e.preventDefault();
            }
            
            if(e.type === 'beforeunload') {
                return; // no way to prevent the browser default dialog...
            }
            let oasysContext = OASYSCOM.getContext();
            if (isSaved === false && oasysContext !== 'manualCorrection') { 
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
                        clearCanvas();
                    }
                };
                new nxDialog('overwriteDialog', dialogData, null);
            } else {
                let dialogData = {
                    buttons: [
                        {label: UILANG.m('Cancel'), 'cancel': true, value: 'cancel'},
                        {label: UILANG.m('Proceed'), 'default': true, value: 'proceed'}
                    ],
                    contents: UILANG.m('If you proceed, all objects will be deleted!'),
                    title: UILANG.m('Delete all objects?'),
                    width: 400,
                    callback: function (b) {
                        if(b === 'cancel') return;
                        clearCanvas();
                    }
                };
                new nxDialog('overwriteDialog', dialogData, null); 
            }
        };

        // private
        function clearCanvas () {
            for (let i in dd) {
                if (dd[i].type !== 'handle') {deleteObj(parseInt(i));} // everything but the handles
            }
            // clear undo and redo lists
            undoList = [];
            redoList = [];
            undoMode = false;
            redoMode = false;
            switchUndoButtons();
            newUndoStep(); // push empty array to undoList
        }
    
    }

    //export class
    window.SavingWatcher = SavingWatcher;

})(jQuery);
//const UILANG = new Lang();

/*for (let msg of UILANG.loadingMessages) {
	alert(msg);
}*/
