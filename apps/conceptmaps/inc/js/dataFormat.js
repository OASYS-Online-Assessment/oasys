"use strict";

/*
 DataFormat v1.00

 Depencies:
 jQuery 1.7 or newer
 fileFormat defined in host file
 OASYSCOM instance

 handle data format and meta
 */

(function ($) {
    function DataFormat() {
      	let meta = {}; // meta data
        let fileFormat;
        let labelsLocked = false;
        let objectsLocked = false;
        let respectLock = OASYSCOM.getContext() === 'assessment'; // context decides whether lock state is evaluated or not

        // private
        function updateLockedState (typeList, state) {
            for (let i in dd) {
                if (dd[i].hasOwnProperty('type')) {
                    if (typeList.includes(dd[i].type)) dd[i].locked = state;
                }
            }
        }

        // public 
        this.setFileFormat = function (ff) {
            fileFormat = ff;
        };
        // setter for meta data
        this.setMeta = function (data) {
            for (let i in data) {
                meta[i] = data[i];
            }
        };
    
        // getter for meta data
        this.getMeta = function () {
            return meta;
        };

        // setter for global objects lock
        this.setObjectsLocked = function (state) {
            objectsLocked = state;
            // update document data
            updateLockedState (['object','connector', 'labelBox'], objectsLocked);
            if (state === true) {
                meta.objlockstate = 'locked';
            } else {
                meta.objlockstate = 'editable';
            }

            if (OASYSCOM.getContext() === 'assessment') objectsLocked = false;
        };
    
        // getter for global objects lock
        this.getObjectsLocked = function () {
            return objectsLocked;
        };

        // setter for global labels lock
        this.setLabelsLocked = function (state) {
            labelsLocked = state;
            // update document data
            updateLockedState (['label'], labelsLocked);
            if (state === true) {
                meta.labelslockstate = 'locked';
            } else {
                meta.labelslockstate = 'editable';
            }
            if (OASYSCOM.getContext() === 'assessment') labelsLocked = false;
        };
    
        // getter for global labels lock
        this.getLabelsLocked = function () {
            return labelsLocked;
        };

        this.getRespectLock = function () {
            return respectLock;
        };



        // prepare loaded data
        this.prepareData = function (data) {
            let docData; // map objects
            if (data.hasOwnProperty('meta')) { // already in sustainable format
                if (data.meta.fileversion > fileFormat) { // data from newer 
                    return {error: 'filefromthefuture'};
                }
                meta = data.meta;
                meta.fileversion = fileFormat;
                if(!meta.hasOwnProperty('objlockstate')) {
                    meta.objlockstate = 'editable'; // import from standalone or legacy file
                    this.setObjectsLocked(false);
                }
                if(!meta.hasOwnProperty('labelslockstate')) {
                    meta.labelslockstate = 'editable';
                    this.setLabelsLocked(false);
                }
                if(OASYSCOM.getContext() === 'editor'){ // set assessment tools checkbox
                    if(meta.objlockstate === 'locked') {
                        $('#cbLockShapes').prop( "checked", true );
                        objectsLocked = true;
                        labelsLocked = true;
                    } else {
                        $('#cbLockShapes').prop( "checked", false );
                        $('#cbLabelsEditable').prop("disabled", true);
                    }
                    if(meta.labelslockstate === 'editable' && meta.objlockstate === 'locked') {
                        $('#cbLabelsEditable').prop( "checked", true );
                        $('#cbLabelsEditable').prop("disabled", false);
                        labelsLocked = false;
                    } else {
                        $('#cbLabelsEditable').prop( "checked", false );
                    }
                }
                docData = data.map;
                // ToDo: check for compatibility with current fileformat
            } else { // prepare for sustainable format
                meta.fileversion = fileFormat;
                meta.objlockstate = 'editable';
                meta.labelslockstate = 'editable';
                for (let i in data) { // add locked prop ToDo: whenever the objects structure changes...
                    if (data[i] && typeof data[i] === 'object') { // Check if it's an object
                        data[i].locked = false;
                    } else {
                        //console.warn(`Item at index ${i} is not an object`, data[i]);
                    }
                }
                docData = data;
            }

            return docData;
        }
    
    }

    //export class
    window.DataFormat = DataFormat;

})(jQuery);
