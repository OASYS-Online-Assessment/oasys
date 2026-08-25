/*

 jsMediaPlugin v1.16
 (c) 2014 - 2025 by Willibrord Koch

 DESCRIPTION:
 This plugin opens up a popup to manage to the media files of the OASYS system.

 --------------------------------------------------------------------------------------------------------------
 VERSIONS:
 --------------------------------------------------------------------------------------------------------------
 v1.0			Initial version
 v1.01			a few changes to the number input
 v1.02			corrections for the new version of number input with range and step
 v1.03			added possibility to transfer parameters from the calling function to callback function
 v1.04			modified to use db (blob) instead of disk storage (media files)
 v1.05			modified output (ID added for external skripts)
 v1.06          cosmetic changes - flexbox
 v1.07          added upload button and drag'n'drop support for uploading media files
 v1.08          added "new folder", "rename" & "delete" buttons & functionality
 v1.09          added MD5 hash
 v1.10          Option "NAVIGATEONEND" added for audio & video
 v1.11          Adaptions for Oasys 3.1 / Improved media preview
 v1.12          Added warning for used media files on deletion
 v1.13          Added hide/show options
 v1.14          Option globalManager added / sending mode/mediaTypes on upload
 v1.15          Online help added
 v1.15          AVIF format added
 --------------------------------------------------------------------------------------------------------------
 USAGE:
 instantiate with:
 new jsMediaPlugin(id, options);

 PARAMETERS:
 onClose -> callback for returning selected file
 mediaTypes -> display media files: 'all' or 'audio' or 'video' or 'image'
 preSelectWidth -> custom width of the preselected image, audio or video
 preSelectHeight -> custom height of the preselected image, audio or video
 hideOptions -> hide or show media options in plugin


 */

"use strict";

(function ($) {

    function jsMediaPlugin(id, options) {

        let origImageWidthQuo, origImageHeightQuo, fileType, fileWidth, fileHeight, fileSrc, presetw, preseth,
            mediaFileId, mediaChecksum, audioNumb, videoNumb;

        //setup image audio video option variables
        let audioPlaybacks = 0, audioUserControl, audioHidden, audioStart, audioForce, audioNavigate,
            videoPlaybacks = 0, videoPholder,
            videoUserControl, videoStart, videoForce, videoNavigate, imgVerticalAlign;

        if (!options)
            options = {};

        const closeCallback = options.onClose || null;
        const mediaTypes = options.mediaTypes || 'all';
        const globalManager = options.globalManager || false;
        const parameters = options.parameters || []; //custom parameters that the calling function wants to be transferred to closeCallback
        presetw = options.preSelectWidth || '';
        preseth = options.preSelectHeight || '';
        const hideOptions = options.hideOptions || false;
        let dataTmp;
        let singleSelect;
        let waitDialog;
        waitDialog = new jsModalWait(UILANG.m('please wait'));
        let mediaFileName;
        let medPat;
        let tTitle;
        let audioControlDiv;
        let audioHiddenDiv;
        let videoControlDiv;
        let videoPlaceHolder;
        let mediaHelpHtml;
        //nxUploader configured to accept all possible media formats, further filtering is done in mediaActions.php
        medPat = /(\.mp4$|\.m4v$|\.mp3$|\.m4a$|\.aac$|\.wav$|\.webm$|\.avif$|\.jpg$|\.jpeg$|\.png$|\.gif$|\.svg$|\.webp$)/i;
        switch (mediaTypes) {
            case 'image':
                tTitle = UILANG.m('Image Library<span id=mediaHelp></span>');
                mediaHelpHtml=UILANG.m('<p><strong>Image Upload Help</strong><br>You are in the media uploader for image interactions. Only single uploads are possible. You can still upload an audio or video file, but it will not be shown in the file manager for images.</p><table><tr><th><strong>Supported Image Formats</strong></th></tr><tr><td>- JPEG (.jpg, .jpeg)<br>- PNG (.png)<br>- GIF (.gif)<br>- SVG (.svg)<br>- WEBP (.webp)<br>- AVIF (.avif)</td></tr></table>');
                break;
            case 'audio':
                tTitle = UILANG.m('Audio Library<span id=mediaHelp></span>');
                mediaHelpHtml=UILANG.m('<p><strong>Audio Upload Help</strong><br>You are in the media uploader for audio interactions. Only single uploads are possible. You can still upload an image or video file, but it will not be shown in the file manager for audio files.</p><table><tr><th><strong>Supported Audio Formats</strong></th></tr><tr><td>- MP3 (.mp3)<br>- WAV (.wav)<br>- AAC (.aac)<br>- M4A (.m4a)<br>- WEBM (.webm)</td></tr></table>');
                break;
            case 'video':
                tTitle = UILANG.m('Video Library<span id=mediaHelp></span>');
                mediaHelpHtml=UILANG.m('<p><strong>Video Upload Help</strong><br>You are in the media uploader for video interactions. Only single uploads are possible. You can still upload an image or audio file, but it will not be shown in the file manager for video files.</p><table><tr><th><strong>Supported Video Formats</strong></th></tr><tr><td>- MP4 (.mp4)<br>- M4V (.m4v)<br>- WEBM (.webm)</td></tr></table>');
                break;
            case 'all':
                tTitle = UILANG.m('Media Library<span id=mediaHelp></span>');
                if(globalManager === true) {
                    mediaHelpHtml = UILANG.m('<p><strong>Media Upload Help</strong><br>This guide provides information on supported media formats. Please ensure your files match the following formats. You can upload multiple files at once in the main media manager. However, when using the media manager in interactions, only single file uploads are possible.</p><table><tr><th><strong>Images</strong></th><th><strong>Audio</strong></th><th><strong>Video</strong></th></tr><tr><td>- JPEG (.jpg, .jpeg)<br>- PNG (.png)<br>- GIF (.gif)<br>- SVG (.svg)<br>- WEBP (.webp)<br>- AVIF (.avif)</td><td>- MP3 (.mp3)<br>- WAV (.wav)<br>- AAC (.aac)<br>- M4A (.m4a)<br>- WEBM (.webm)</td><td>- MP4 (.mp4)<br>- M4V (.m4v)<br>- WEBM (.webm)</td></tr></table><p>If your file is not in one of these formats, please convert it before uploading.</p>');
                } else {
                    mediaHelpHtml = UILANG.m('<p><strong>Media Upload Help</strong><br>This guide provides information on supported media formats. Please ensure your files match the following formats. </p><table><tr><th><strong>Images</strong></th><th><strong>Audio</strong></th><th><strong>Video</strong></th></tr><tr><td>- JPEG (.jpg, .jpeg)<br>- PNG (.png)<br>- GIF (.gif)<br>- SVG (.svg)<br>- WEBP (.webp)<br>- AVIF (.avif)</td><td>- MP3 (.mp3)<br>- WAV (.wav)<br>- AAC (.aac)<br>- M4A (.m4a)<br>- WEBM (.webm)</td><td>- MP4 (.mp4)<br>- M4V (.m4v)<br>- WEBM (.webm)</td></tr></table><p>If your file is not in one of these formats, please convert it before uploading.</p>');
                }
                break;
        }

        let buttonsObj;

        if (hideOptions) {
            if (globalManager === true) {
                buttonsObj = [{
                    label: UILANG.m('Close'),
                    value: 'close',
                    'default': true
                }];
            } else {
                buttonsObj = [{
                    label: UILANG.m('cancel'),
                    'cancel': true,
                    value: 'close'
                }, {
                    label: UILANG.m('Insert'),
                    value: 'insert2editor',
                    'default': true,
                    disabled: true
                }];
            }
        } else {
            buttonsObj=[{
                label: UILANG.m('cancel'),
                'cancel': true,
                value: 'close'
            }, {
                label: UILANG.m('Insert URL'),
                value: 'insertURL',
                disabled: true
            }, {
                label: UILANG.m('Insert'),
                value: 'insert2editor',
                'default': true,
                disabled: true
            }];

        }

        const dialogMediaBrowser = {
            buttons: buttonsObj,
            contents: "<div style='height:640px;' id='mediaBrowser'></div>",
            title: UILANG.m('Media Browser'),
            width: 950,
            callback: mBrowserCb
        };
        const mediaBrowser = new nxDialog('DialogMB', dialogMediaBrowser);
        gui.extraMedia = createFlexSection('mediaBrowser', 'extraMedia', 905, 905);
        gui.boxes.tests = createFlexBox(gui.extraMedia, 'mediaChooser', {
            title: tTitle,
            minHeight: 590,
            flex: 1,
            noPadding: true
        });

        //show online help
        new OasysHelp('mediaHelp', {
            htmlContent: mediaHelpHtml,
            title: UILANG.m('Supported media types'),
        });

        $('#mediaChooser').append("<div id='plgToolBar'></div><table id='assetslistTable'><tr><td class='filerContainer'><div id='assetListPlugin' ></div></td><td style='background:#FFFFFF;'><div id='previewZonePlugin'></div><div style='' id='userPanel'></div></td></tr></table>");
        $('#extraMedia').css('padding', '0');
        $('#extraMedia>.jsFlexBox').css('box-shadow', 'none');
        $('#mediaChooser').css('overflow', 'hidden');

        const plgButtons = {};
        plgButtons.uploadMedia = new jsButton2($('#plgToolBar'), 'plgBUpload', {
            label: UILANG.m('Upload'),
            icon: '../images/dialogToolbar/ic_dl_tb_upload.png',
            iconWidth: 28,
            width: 60,
            height: 55,
            callback: clickUpload,
            disabled: false
        });
        plgButtons.renameSelection = new jsButton2($('#plgToolBar'), 'plgRename', {
            label: UILANG.m('Rename'),
            icon: '../images/dialogToolbar/ic_dl_tb_rename.png',
            iconWidth: 28,
            width: 60,
            height: 55,
            callback: clickRename,
            disabled: true
        });
        plgButtons.deleteSelection = new jsButton2($('#plgToolBar'), 'plgDelete', {
            label: UILANG.m('Delete'),
            icon: '../images/dialogToolbar/ic_dl_tb_delete.png',
            iconWidth: 28,
            width: 60,
            height: 55,
            callback: clickDelete,
            disabled: true
        });
        plgButtons.deleteAll = new jsButton2($('#plgToolBar'), 'plgDeleteAll', {
            label: UILANG.m('Delete all'),
            icon: '../images/dialogToolbar/ic_dl_tb_delete_all.png',
            iconWidth: 28,
            width: 60,
            height: 55,
            callback: clickDeleteAll,
            disabled: true
        });
        //Setup uploader
        $("body").append("<input type='file' multiple id='mediaUpload'><\/input>");

        let singleUpload = true;
        if (globalManager === true)singleUpload = false;

        const nxUploaderSettings = {
            filebrowser: 'mediaUpload', //html id of input element
            action: 'upload',
            ajaxTimeout: 300000,
            ajaxURL: '../editor/mediaActions.php', //which file is going to handle the uploaded files
            sendType: "POST",
            dataType: "json",
            dropMessage: UILANG.m('Drop media-file here to upload!'),
            formatPattern: medPat,
            showFolderDropMessage: true,
            singleUpload: singleUpload,
            singleUploadMsg: UILANG.m('You are in an interaction that only allows uploading one media file at a time. Please go to the main media manager to bulk upload files.'),
            invalidFiletypeMessage: UILANG.m('The following file(s) could not be uploaded, as they do not match one of the accepted file formats. <span id="invalidFiles">What formats are accepted</span>'),
            successCallback: ajaxSuccessPLG, //callback after handling each uploaded file
            ajaxParams: onUploadFiles,
            afterUploadCallback: onAfterUpload
        };
        const uploader = new nxUploader(nxUploaderSettings);

        window.addEventListener('nxDialog', function (event) {
            if (event.detail.action==='show' && $('#invalidFiles').length) {
                //show online help
                new OasysHelp('invalidFiles', {
                    htmlContent: mediaHelpHtml,
                    title: UILANG.m('Supported media types'),
                });
            }
        });

        //End loader
        function clickDelete() {
            mediaManagerPlugin.deleteFiles();
        }

        function clickDeleteAll(sender, button) {
            let txtStr, headerStr;
            switch (mediaTypes) {
                case 'image':
                    headerStr = UILANG.m('Delete all images?');
                    txtStr = UILANG.m('Are you sure you want to delete all images of this page group? This action is irreversible!');
                    break;
                case 'audio':
                    headerStr = UILANG.m('Delete all audio files?');
                    txtStr = UILANG.m('Are you sure you want to delete all audio files of this page group? This action is irreversible!');
                    break;
                case 'video':
                    headerStr = UILANG.m('Delete all video files?');
                    txtStr = UILANG.m('Are you sure you want to delete all video files of this page group? This action is irreversible!');
                    break;
                case 'all':
                    headerStr = UILANG.m('Delete all media files?');
                    txtStr = UILANG.m('Are you sure you want to delete all media files of this page group? This action is irreversible!');
                    break;
                default:
                    headerStr = UILANG.m('Delete all media files?');
                    txtStr = UILANG.m('Are you sure you want to delete all media files of this page group? This action is irreversible!');
                    break;
            }

            if (!button) {
                const dialogDataDel = {
                    buttons: [{
                        label: UILANG.m('cancel'),
                        'cancel': true,
                        'default': true,
                        value: 'cancel'
                    }, {
                        label: UILANG.m('Delete'),
                        value: 'ok'
                    }],
                    contents: txtStr,
                    width: 640,
                    callback: clickDeleteAll,
                    title: headerStr,
                    icon: "../images/warning.png",
                    iconWidth: 64
                };
                new nxDialog('delItemsDialog', dialogDataDel, arguments);
            }
            if (button === 'ok') {
                startAjaxPLG('deleteAll', {
                    location: serverData.group.id,
                    mediaType: mediaTypes
                });
            }
        }

        function clickUpload() {
            $("#mediaUpload").trigger('click');
        }

        function onUploadFiles() {
            return {
                action: 'upload',
                location: serverData.group.id,
                mediaTypes: mediaTypes,
                globalManager: globalManager
            };
        }

        function onAfterUpload() {
            startAjaxPLG('fetchLibrary', {
                location: serverData.group.id
            });
        }

        const fileOpPermissions = {
            copyFolders: false,
            copyItems: false,
            copyMultiple: false,
            cutFolders: false,
            cutItems: false,
            cutMultiple: false
        };

        let breadcrumbs = [{
            id: 1,
            name: "Home"
        }];

        let mediaManagerPlugin = new fileMgr("#assetListPlugin", "_mediaPlugin", [], breadcrumbs, fileOpPermissions, false, mlibraryEvent, mediaTypes);

        $("#breadcrumbs_mediaPlugin").css('display', 'none');
        //get library contents
        startAjaxPLG('fetchLibrary', {
            location: serverData.group.id
        });

        //function libraryEvent(type, data){}
        function mlibraryEvent(type, data) {
            switch (type) {
                case 'clear':
                    $('#previewZonePlugin').empty();
                    $('#userPanel').empty();
                    if (mediaBrowser) {
                        mediaBrowser.disableButton('insert2editor');
                        mediaBrowser.disableButton('insertURL');
                    }
                    break;
                case 'getSelect':
                case 'getSelectKeys':
                    if($('#prevVid'))$('#prevVid').attr('src', '');
                    if($('#prevAud'))$('#prevAud').attr('src', '');
                    if (data.length === 1 && data[0].type !== 'folder') {
                        if (data[0].type !== 'folder') {
                            assetPreview(data);
                        }
                        singleSelect = data[0];
                        plgButtons.deleteSelection.enable();
                        plgButtons.renameSelection.enable();
                    } else if (data.length === 1 && data[0].type === 'folder') {
                        $('#previewZonePlugin').empty();
                        $('#userPanel').empty();
                        singleSelect = data[0];
                        if (mediaBrowser) {
                            mediaBrowser.disableButton('insert2editor');
                            mediaBrowser.disableButton('insertURL');
                        }
                    } else {
                        $('#previewZonePlugin').empty();
                        $('#userPanel').empty();
                        plgButtons.deleteSelection.disable();
                        plgButtons.renameSelection.disable();
                        if (mediaBrowser) {
                            mediaBrowser.disableButton('insert2editor');
                            mediaBrowser.disableButton('insertURL');
                        }
                    }
                    break;
                case 'onDeleteRequest':
                    showDeleteMessage(data);
                    break;
                case 'getSelectDblclick':
                    mBrowserCb('insert2editor');
                    mediaBrowser.dismiss();
                    break;
                default:
                    break;
            }
        }

        function startAjaxPLG(action, data) {
            waitDialog.show();
            const params = {
                action: action,
                data: JSON.stringify(data)
            };
            $.ajax({
                data: params,
                type: "POST",
                cache: false,
                dataType: "json",
                timeout: 300000,
                success: ajaxSuccessPLG,
                error: ajaxErrorPLG,
                url: "../editor/mediaActions.php"
            });
        }

        function ajaxErrorPLG(xhr, textStatus) {
            if (waitDialog.busy()) waitDialog.hide();
            alert(stringf('Server connection failed with status: %@', textStatus));
            startAjaxPLG('fetchLibrary', {
                location: serverData.group.id
            });
        }

        function ajaxSuccessPLG(res, uploaderCallback) {
            if (waitDialog.busy()) waitDialog.hide();
            if (res.error) {
                const dialogData = {
                    buttons: [{
                        label: UILANG.m('OK'),
                        'default': true,
                        cancel: true,
                        value: 'ok'
                    }],
                    contents: '<strong>' + UILANG.m('Sorry! The action cannot be completed.') + '</strong><br />' + res.error,
                    title: UILANG.m("Error"),
                    icon: "../images/error.png",
                    iconWidth: 64,
                    width: 500
                };
                setTimeout(function () {
                    if ($("#error").length === 0) {
                        if (!$('#veil_error').length) new nxDialog('error', dialogData);
                    }
                }, 200);
                if (res.action === 'upload') {
                    uploader.hideVeil();
                    if (uploaderCallback) uploaderCallback.call(this, true);
                }
                return;
            }
            switch (res.action) {
                case 'upload':
                    if (uploaderCallback) uploaderCallback.call(this, true);
                    if(res.viewNote)showMessage(res.viewNote);
                    break;
                case 'deleteSelection':
                case 'deleteAll':
                case 'renameMedia':
                case 'fetchLibrary':
                    if(res.filesInUse){
                        if(res.action==='deleteSelection'){
                            showMessagePLG(UILANG.m('The selected media file could not be deleted because it is still in use.'));
                        } else if(res.action==='deleteAll'){
                            showMessagePLG(UILANG.m('Some of the selected media files could not be deleted because they are still in use.'));
                        }
                    }
                    updateLibraryPLG(res.data.list, res.data.path);
                    if (res.data.select) {
                        mediaManagerPlugin.setSelection([{id: res.data.select}]);
                    }
                    const pathString = '';
                    break;
                case 'preview':
                    mediaFileName=res.name+'.'+res.fileExt;
                    if (hideOptions) {
                        $('#userPanel').css('visibility', 'hidden');
                        $('#previewZonePlugin').css({
                            'height': 'auto',
                            'max-height': 'none'
                        });
                    }

                    switch (res.filetype) {
                        case 'image/jpg':
                        case 'image/png':
                        case 'image/gif':
                        case 'image/svg+xml':
                        case 'image/webp':
                        case 'image/avif':
                        case 'image/avif-sequence':
                            mediaChecksum = res.checksum;
                            mediaFileId = res.mediaFileId;
                            $('#previewZonePlugin').empty();
                            $('#previewZonePlugin').append('<table class="mediaTable"><tr><th>' + UILANG.m('Name:') + '</th><td>' + res.name + '</td></tr><tr><th>' + UILANG.m('File-Type:') + '</th><td>' + res.filetype + '</td></tr><tr><th>' + UILANG.m('Size / Uploaded:') + '</th><td>' + res.size + '  bytes / ' + res.created + ' </td></tr><tr><th>' + UILANG.m('Original size:') + '</th><td id="orgSiz"></td></tr></table>');
                            mediaBrowser.enableButton('insert2editor');
                            mediaBrowser.enableButton('insertURL');
                            $('#previewZonePlugin').append("<img alt='' id='prevImg' style='max-width:80%;margin:auto;' src='fetchMediaFile.php?fileid=" + mediaFileId + "&checksum=" + mediaChecksum + "'>");
                            const file2add = $('#prevImg');

                            //adjust image size
                            const imgObj = file2add[0];
                            $('#userPanel').empty();
                            $('#userPanel').append('<strong>' + UILANG.m('Image options:') + '</strong><br/>');
                            $('#userPanel').append('<form id="imgSizeForm"></form>');
                            $('#imgSizeForm').append('<table id="imgOptPlgTbl"><tr><td>' + UILANG.m('Width in pixels:') + '</td><td><div id="widthInputContainer"></div></td></tr><tr><td>' + UILANG.m('Height in pixels:') + '</td><td><div id=heightInputContainer></div></td><tr><td>' + UILANG.m('Vertical alignment:') + '</td><td><div id=alignmentContainer></div></td></tr></table>');
                            let imageWidth, imageHeight;
                            if (imgObj) imgObj.onload = function () {
                                origImageWidthQuo = imgObj.naturalWidth / imgObj.naturalHeight;
                                origImageHeightQuo = imgObj.naturalHeight / imgObj.naturalWidth;
                                $('#orgSiz').html(imgObj.naturalWidth + ' x ' + imgObj.naturalHeight + ' px');
                                fileType = res.filetype;
                                fileSrc = imgObj.src;
                                fileWidth = imgObj.naturalWidth;
                                fileHeight = imgObj.naturalHeight;
                                //create number inputs
                                const imgWidthOptions = {
                                    onChange: changeCallback,
                                    height: '20px',
                                    width: '60px',
                                    initialValue: fileWidth,
                                    dataId: 'widthInput',
                                    readOnly: false
                                };
                                const imgHeightOptions = {
                                    onChange: changeCallback,
                                    height: '20px',
                                    width: '60px',
                                    initialValue: fileHeight,
                                    dataId: 'heightInput',
                                    readOnly: false
                                };

                                imageWidth = new jsNumberInput('widthInputContainer', 'widthInput', imgWidthOptions);
                                imageHeight = new jsNumberInput('heightInputContainer', 'heightInput', imgHeightOptions);

                                //Display the file within the given container
                                file2add.css('max-width', '80%');
                                file2add.show();

                                imgVerticalAlign = 'default';
                                const alignOptions = {
                                    onChange: alignOptionChanged,
                                    initialValue: 'current',
                                    elements: [{
                                        value: 'default',
                                        label: UILANG.m('baseline (default)')
                                    }, {
                                        value: 'top',
                                        label: UILANG.m('top'),
                                    }, {
                                        value: 'middle',
                                        label: UILANG.m('middle'),
                                    }, {
                                        value: 'bottom',
                                        label: UILANG.m('bottom')
                                    }],
                                    dataId: 'valignment',
                                    width: 210,
                                    readOnly: false,
                                    cssCollapsed: {
                                        'font-size': '14px'
                                    },
                                    cssExpanded: {
                                        'font-size': '14px'
                                    }
                                };
                                new jsDropList('alignmentContainer', 'alignOpt', alignOptions);


                                function alignOptionChanged(sender, value) {
                                    imgVerticalAlign = value;
                                }


                                function changeCallback(id, v, dataId) {
                                    if (dataId === 'widthInput') {
                                        imageHeight.setValue(Math.round(v * origImageHeightQuo));
                                        fileWidth = v;
                                        fileHeight = imageHeight.getCurrentValue();
                                    } else {
                                        imageWidth.setValue(Math.round(v * origImageWidthQuo));
                                        fileWidth = imageWidth.getCurrentValue();
                                        fileHeight = v;
                                    }
                                }

                                if (presetw !== '') {
                                    imageWidth.setValue(presetw);
                                    imageHeight.setValue(preseth);
                                    presetw = '';
                                    preseth = '';
                                }
                                fileWidth = imageWidth.getCurrentValue();
                                fileHeight = imageHeight.getCurrentValue();

                            }
                            ;
                            break;
                        case 'audio/mpeg':
                        case 'audio/m4a':
                        case 'audio/webm':
                        case 'audio/wav':
                        case 'audio/aac':
                            //setting up option defaults
                            audioUserControl = true;
                            audioHidden = false;
                            audioStart = false;
                            audioForce = false;
                            audioNavigate = false;

                            mediaChecksum = res.checksum;
                            mediaFileId = res.mediaFileId;
                            $('#previewZonePlugin').empty();
                            $('#previewZonePlugin').append('<table class="mediaTable"><tr><th>' + UILANG.m('Name:') + '</th><td>' + res.name + '</td></tr><tr><th>' + UILANG.m('File-Type:') + '</th><td>' + res.filetype + '</td></tr><tr><th>' + UILANG.m('Size / Uploaded:') + '</th><td>' + res.size + '  bytes / ' + res.created + ' </td></tr></table>');
                            mediaBrowser.enableButton('insert2editor');
                            mediaBrowser.enableButton('insertURL');
                            fileType = res.filetype;
                            $('#previewZonePlugin').append('<audio id="prevAud" style="width:80%" controls="controls" autobuffer="autobuffer"><source src="fetchMediaFile.php?fileid=' + mediaFileId + '&checksum=' + mediaChecksum + '" /></audio>');
                            $('#userPanel').empty();
                            $('#userPanel').append('<strong>' + UILANG.m('Audio options:') + '</strong><br/>');
                            $('#userPanel').append('<form id="audioForm"></form>');
                            $('#audioForm').append('<p id="audioOptionsContainer">' + UILANG.m('Limit the number of playbacks (0 for unlimited):') + '  </p>');

                            const audioOptions = {
                                onChange: audioChangeCallback,
                                height: '20px',
                                width: '40px',
                                initialValue: 0,
                                range: '0..100',
                                dataId: 'audioOpts',
                                readOnly: false
                            };
                            audioNumb = new jsNumberInput('audioOptionsContainer', 'audioOpts', audioOptions);


                            $('#userPanel').append('<div id="div_audiocontrol" class ="mediaItem mediaChecked"><img alt="" src="../inc/filer/images/checked_checkbox.png" id="img_audiocontrol" /> ' + UILANG.m('allow user to control track (pause, rewind etc.)') + '</div>');
                            $('#userPanel').append('<div id="div_audiohidden" class ="mediaItem mediaUnChecked"><img alt="" src="../inc/filer/images/unchecked_checkbox.png" id="img_audiohidden" /> ' + UILANG.m('hide player interface') + '</div>');
                            $('#userPanel').append('<div id="div_audioplayback" class ="mediaItem mediaUnchecked"><img alt="" src="../inc/filer/images/unchecked_checkbox.png" id="img_audioplayback" /> ' + UILANG.m('start playback as soon as audio is loaded') + '</div>');
                            $('#userPanel').append('<div id="div_audioprevent" class ="mediaItem mediaUnchecked"><img alt="" src="../inc/filer/images/unchecked_checkbox.png" id="img_audioprevent" /> ' + UILANG.m('prevent user to continue without listening to audio') + '</div>');
                            $('#userPanel').append('<div id="div_navigateonend" class ="mediaItem mediaUnchecked"><img alt="" src="../inc/filer/images/unchecked_checkbox.png" id="img_navigateonend" /> ' + UILANG.m('proceed after playing') + '</div>');


                            audioControlDiv = $("#div_audiocontrol");
                            const audioControlDivIMG = $("#img_audiocontrol");
                            audioHiddenDiv = $("#div_audiohidden");
                            const audioHiddenDivIMG = $("#img_audiohidden");
                            const audioPlaybackDiv = $("#div_audioplayback");
                            const audioPlaybackDivIMG = $("#img_audioplayback");
                            const audioPreventDiv = $("#div_audioprevent");
                            const audioPreventDivIMG = $("#img_audioprevent");
                            const audioNavigateDiv = $("#div_navigateonend");
                            const audioNavigateDivIMG = $("#img_navigateonend");

                            audioControlDiv.on("click", function () {
                                if (!audioControlDiv.hasClass('optionDisabled')) {
                                    audioControlDiv.toggleClass('mediaChecked');
                                    if (audioControlDiv.hasClass('mediaChecked')) {
                                        audioControlDivIMG.attr('src', '../inc/filer/images/checked_checkbox.png');
                                        audioUserControl = true;
                                        audioHiddenDiv.addClass('optionDisabled');
                                    } else {
                                        audioControlDivIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
                                        audioUserControl = false;
                                        audioHiddenDiv.removeClass('optionDisabled');
                                    }
                                }
                            });

                            audioHiddenDiv.on("click", function () {
                                if (!audioHiddenDiv.hasClass('optionDisabled')) {
                                    audioHiddenDiv.toggleClass('mediaChecked');
                                    if (audioHiddenDiv.hasClass('mediaChecked')) {
                                        audioHiddenDivIMG.attr('src', '../inc/filer/images/checked_checkbox.png');
                                        audioHidden = true;
                                    } else {
                                        audioHiddenDivIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
                                        audioHidden = false;
                                    }
                                }
                            });

                            audioPlaybackDiv.on("click", function () {
                                audioPlaybackDiv.toggleClass('mediaChecked');
                                if (audioPlaybackDiv.hasClass('mediaChecked')) {
                                    audioPlaybackDivIMG.attr('src', '../inc/filer/images/checked_checkbox.png');
                                    audioStart = true;

                                } else {
                                    audioPlaybackDivIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
                                    audioStart = false;
                                }
                            });
                            audioPreventDiv.on("click", function () {
                                audioPreventDiv.toggleClass('mediaChecked');
                                if (audioPreventDiv.hasClass('mediaChecked')) {
                                    audioPreventDivIMG.attr('src', '../inc/filer/images/checked_checkbox.png');
                                    audioForce = true;

                                } else {
                                    audioPreventDivIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
                                    audioForce = false;
                                }
                            });
                            audioNavigateDiv.on("click", function () {
                                audioNavigateDiv.toggleClass('mediaChecked');
                                if (audioNavigateDiv.hasClass('mediaChecked')) {
                                    audioNavigateDivIMG.attr('src', '../inc/filer/images/checked_checkbox.png');
                                    audioNavigate = true;

                                } else {
                                    audioNavigateDivIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
                                    audioNavigate = false;
                                }
                            });
                            break;
                        case 'video/mp4':
                        case 'video/m4v':
                        case 'video/webm':
                            //setting up option defaults
                            videoPholder = true;
                            videoUserControl = true;
                            videoStart = false;
                            videoForce = false;
                            videoNavigate = false;

                            mediaChecksum = res.checksum;
                            mediaFileId = res.mediaFileId;
                            $('#previewZonePlugin').empty();
                            $('#previewZonePlugin').append('<table class="mediaTable"><tr><th>' + UILANG.m('Name:') + '</th><td>' + res.name + '</td></tr><tr><th>' + UILANG.m('File-Type:') + '</th><td>' + res.filetype + '</td></tr><tr><th>' + UILANG.m('Size / Uploaded:') + '</th><td>' + res.size + '  bytes / ' + res.created + ' </td></tr><tr><th>' + UILANG.m('Original size:') + '</th><td id="orgSiz"></td></tr></table>');
                            mediaBrowser.enableButton('insert2editor');
                            mediaBrowser.enableButton('insertURL');
                            fileType = res.filetype;
                            $('#previewZonePlugin').append('<video id="prevVid" style="width:80%" controls="controls" autobuffer="autobuffer"><source src="fetchMediaFile.php?fileid=' + mediaFileId + '&checksum=' + mediaChecksum + '" /></video>');


                            let vidObj = $('#prevVid')[0];
                            if(vidObj){vidObj.addEventListener('loadeddata', () => {
                                $('#orgSiz').html(vidObj.videoWidth + ' x ' + vidObj.videoHeight + ' px');
                            });}

                            $('#userPanel').empty();
                            $('#userPanel').append('<strong>' + UILANG.m('Video options:') + '</strong><br/>');
                            $('#userPanel').append('<form id="videoForm"></form>');
                            $('#videoForm').append('<p id="videoOptionsContainer">' + UILANG.m('Limit the number of playbacks (0 for unlimited):') + '&nbsp;&nbsp;</p>');
                            const videoOptions = {
                                onChange: videoChangeCallback,
                                height: '20px',
                                width: '40px',
                                initialValue: 0,
                                range: '0..100',
                                dataId: 'videoOpts',
                                readOnly: false
                            };
                            videoNumb = new jsNumberInput('videoOptionsContainer', 'videoOpts', videoOptions);


                            $('#userPanel').append('<div id="div_videopholder" class ="mediaItem mediaChecked"><img alt="" src="../inc/filer/images/checked_checkbox.png" id="img_videopholder" /> ' + UILANG.m('replace video by placeholder after it has been watched') + '</div>');
                            $('#userPanel').append('<div id="div_videocontrol" class ="mediaItem mediaChecked"><img alt="" src="../inc/filer/images/checked_checkbox.png" id="img_videocontrol" /> ' + UILANG.m('allow user to control video (pause, rewind etc.)') + '</div>');
                            $('#userPanel').append('<div id="div_videoplayback" class ="mediaItem mediaUnchecked"><img alt="" src="../inc/filer/images/unchecked_checkbox.png" id="img_videoplayback" /> ' + UILANG.m('start playback as soon as video is loaded') + '</div>');
                            $('#userPanel').append('<div id="div_videoprevent" class ="mediaItem mediaUnchecked"><img alt="" src="../inc/filer/images/unchecked_checkbox.png" id="img_videoprevent" /> ' + UILANG.m('prevent user to continue without watching video') + '</div>');
                            $('#userPanel').append('<div id="div_videonavigateonend" class ="mediaItem mediaUnchecked"><img alt="" src="../inc/filer/images/unchecked_checkbox.png" id="img_videonavigateonend" /> ' + UILANG.m('proceed after playing') + '</div>');


                            videoPlaceHolder = $("#div_videopholder");
                            const videoPlaceHolderIMG = $("#img_videopholder");
                            videoControlDiv = $("#div_videocontrol");
                            const videoControlDivIMG = $("#img_videocontrol");
                            const videoPlaybackDiv = $("#div_videoplayback");
                            const videoPlaybackDivIMG = $("#img_videoplayback");
                            const videoPreventDiv = $("#div_videoprevent");
                            const videoPreventDivIMG = $("#img_videoprevent");
                            const videoNavigateDiv = $("#div_videonavigateonend");
                            const videoNavigateDivIMG = $("#img_videonavigateonend");

                            videoPlaceHolder.addClass('optionDisabled');

                            videoPlaceHolder.on("click", function () {
                                if (!videoPlaceHolder.hasClass('optionDisabled')) {
                                    videoPlaceHolder.toggleClass('mediaChecked');
                                    if (videoPlaceHolder.hasClass('mediaChecked')) {
                                        videoPlaceHolderIMG.attr('src', '../inc/filer/images/checked_checkbox.png');
                                        videoPholder = true;

                                    } else {
                                        videoPlaceHolderIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
                                        videoPholder = false;
                                    }
                                }
                            });
                            videoControlDiv.on("click", function () {
                                if (!videoControlDiv.hasClass('optionDisabled')) {
                                    videoControlDiv.toggleClass('mediaChecked');
                                    if (videoControlDiv.hasClass('mediaChecked')) {
                                        videoControlDivIMG.attr('src', '../inc/filer/images/checked_checkbox.png');
                                        videoUserControl = true;

                                    } else {
                                        videoControlDivIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
                                        videoUserControl = false;
                                    }
                                }
                            });
                            videoPlaybackDiv.on("click", function () {
                                videoPlaybackDiv.toggleClass('mediaChecked');
                                if (videoPlaybackDiv.hasClass('mediaChecked')) {
                                    videoPlaybackDivIMG.attr('src', '../inc/filer/images/checked_checkbox.png');
                                    videoStart = true;

                                } else {
                                    videoPlaybackDivIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
                                    videoStart = false;
                                }
                            });
                            videoPreventDiv.on("click", function () {
                                videoPreventDiv.toggleClass('mediaChecked');
                                if (videoPreventDiv.hasClass('mediaChecked')) {
                                    videoPreventDivIMG.attr('src', '../inc/filer/images/checked_checkbox.png');
                                    videoForce = true;

                                } else {
                                    videoPreventDivIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
                                    videoForce = false;
                                }
                            });
                            videoNavigateDiv.on("click", function () {
                                videoNavigateDiv.toggleClass('mediaChecked');
                                if (videoNavigateDiv.hasClass('mediaChecked')) {
                                    videoNavigateDivIMG.attr('src', '../inc/filer/images/checked_checkbox.png');
                                    videoNavigate = true;

                                } else {
                                    videoNavigateDivIMG.attr('src', '../inc/filer/images/unchecked_checkbox.png');
                                    videoNavigate = false;
                                }
                            });
                            break;
                    }
                    break;
            }

            function audioChangeCallback(id, v) {
                if(v > 100){
                    showMessagePLG(UILANG.m('The maximum number of playbacks is set to 100!'));
                    audioNumb.reset(100);
                    v = 100;
                }
                audioPlaybacks = v;
                switch (true) {
                    case v === 1:
                        audioControlDiv.addClass('optionDisabled');
                        break;
                    case v > 1:
                        audioControlDiv.addClass('optionDisabled');
                        break;
                    case v === 0:
                        audioControlDiv.removeClass('optionDisabled');
                        break;
                }
            }

            function videoChangeCallback(id, v) {
                if(v > 100){
                    showMessagePLG(UILANG.m('The maximum number of playbacks is set to 100!'));
                    videoNumb.reset(100);
                    v = 100;
                }
                videoPlaybacks = v;
                if (v > 0) {
                    videoPlaceHolder.removeClass('optionDisabled');
                    videoControlDiv.addClass('optionDisabled');
                } else {
                    videoPlaceHolder.addClass('optionDisabled');
                    videoControlDiv.removeClass('optionDisabled');
                }

            }
        }

        function updateLibraryPLG(list, path) {
            if (path) breadcrumbs = path;
            if (list.length > 0) {
                plgButtons.deleteAll.enable();
            } else {
                plgButtons.deleteAll.disable();
            }
            mediaManagerPlugin.setItems(list, breadcrumbs);
        }

        function assetPreview(selection) {
            let mediaFileId = $(selection[0]).attr('id');
            if (mediaFileId.charAt(0) === 't' || mediaFileId.charAt(0) === 'f') {
                mediaFileId = mediaFileId.substring(1, mediaFileId.length)
            }

            startAjaxPLG('preview', {
                mediaFileId: mediaFileId,
                location: serverData.group.id
            });
        }

        //Creating main dialog
        function mBrowserCb(button) {
            uploader.destroy();
            $("#mediaUpload").remove();
            //Sending media file to editor
            if (button === 'insert2editor' || button === 'insertURL') {

                let btnType;
                button === 'insertURL' ? btnType = 'url' : btnType = 'full';

                const typeOfFile = fileType.split('/');
                let returnValue;
                let optString;
                switch (typeOfFile[0]) {
                    case 'image':
                        returnValue = {
                            filetype: typeOfFile[0],
                            width: fileWidth,
                            height: fileHeight,
                            fileId: mediaFileId,
                            checksum: mediaChecksum,
                            btnType: btnType,
                            imgVerticalAlign: imgVerticalAlign,
                            mediaFileName: mediaFileName
                        };
                        break;
                    case 'audio':
                        //build option String
                        optString = ' ';
                        if (audioPlaybacks > 0) {
                            optString += 'MAXPLAYCOUNT="' + audioPlaybacks + '" ';
                        }
                        if (audioUserControl === false && audioPlaybacks >= 0) {
                            optString += 'DISABLECONTROLS ';
                        }
                        if (audioHidden === true) {
                            optString += 'HIDDEN ';
                        }
                        if (audioStart === true) {
                            optString += 'AUTOPLAY ';
                        }
                        if (audioForce === true) {
                            optString += 'REQUIREPLAY ';
                        }
                        if (audioNavigate === true) {
                            optString += 'NAVIGATEONEND ';
                        }
                        optString = optString.substring(0, optString.length - 1);
                        returnValue = {
                            filetype: typeOfFile[0],
                            optionString: optString,
                            fileId: mediaFileId,
                            checksum: mediaChecksum,
                            btnType: btnType,
                            mediaFileName:mediaFileName
                        };
                        break;

                    case 'video':
                        //build option String
                        optString = ' ';
                        if (videoPlaybacks > 0) {
                            optString += 'MAXPLAYCOUNT="' + videoPlaybacks + '" ';
                        }
                        if (videoPholder === false && videoPlaybacks > 0) {
                            optString += 'NOPLACEHOLDER ';
                        }
                        if (videoUserControl === false && videoPlaybacks === 0) {
                            optString += 'DISABLECONTROLS ';
                        }
                        if (videoStart === true) {
                            optString += 'AUTOPLAY ';
                        }
                        if (videoForce === true) {
                            optString += 'REQUIREPLAY ';
                        }
                        if (videoNavigate === true) {
                            optString += 'NAVIGATEONEND ';
                        }
                        optString = optString.substring(0, optString.length - 1);
                        returnValue = {
                            filetype: typeOfFile[0],
                            optionString: optString,
                            fileId: mediaFileId,
                            checksum: mediaChecksum,
                            btnType: btnType,
                            mediaFileName: mediaFileName
                        };
                        break;
                }
                const args = [id, returnValue].concat(parameters);
                closeCallback.apply(this, args);
            }
        }

        //delete functionality
        function showDeleteMessage(data) {

            let delHtml="<div id='del-form' title='Delete'><p>" + UILANG.m('really_delete') + "</p><div id='scroll_area2'><ul id='delres'></ul></div><p id='delmsg'></p></div>";
            function buttonClickedDel(button) {
                if (button === 'ok') {
                    startAjaxPLG('deleteSelection', {
                        location: serverData.group.id,
                        selection: data
                    });
                }
            }
            const dialogDataDel = {
                buttons: [{
                    label: UILANG.m('cancel'),
                    'cancel': true,
                    'default': true,
                    value: 'cancel'
                }, {
                    label: UILANG.m('Delete'),
                    value: 'ok'
                }],
                contents: delHtml,
                width: 640,
                callback: buttonClickedDel,
                title: UILANG.m('Delete selection?'),
                icon: "../images/warning.png",
                iconWidth: 64
            };
            new nxDialog('delItemsDialog', dialogDataDel);

            $.each(data, function (k, v) {
                $("#delres").append('<li id="res' + v.id + '">' + v.label + '</li>');
                if (v.type === 'folder') {
                    $("#res" + v.id + "").addClass('folder');
                    if ($("#delmsg").html() === '') {
                        $("#delmsg").append("<span style='color:red;'>" + UILANG.m('warning_recursive') + "</span>");
                    }
                } else if (v.type === 'image') {
                    $("#res" + v.id + "").addClass('typepicture');
                } else if (v.type === 'video') {
                    $("#res" + v.id + "").addClass('typevideo');
                } else if (v.type === 'audio') {
                    $("#res" + v.id + "").addClass('typeaudio');
                } else {
                    $("#res" + v.id + "").addClass('typefile');
                }
            });
        }

        //Display "Rename"-Form
        function clickRename(data, button, name) {
            if (data === 'plgRename') data = singleSelect;
            if (!button) {
                dataTmp = data;
                const dialogData = {
                    buttons: [{
                        label: UILANG.m('cancel'),
                        'cancel': true,
                        value: 'cancel'
                    }, {
                        label: UILANG.m('OK'),
                        'default': true,
                        value: 'ok'
                    }],
                    datafields: ['dialogField1'],
                    mandatory: ['dialogField1'], //disable OK button if field is empty or contains only whitespace
                    blackList: {dialogField1: [data.label]}, //disable OK button if name has not been changed
                    focus: 'dialogField1',
                    values: {
                        dialogField1: data.label
                    },
                    contents: '<p>' + UILANG.m('Please enter a new name:') + '<br><input type="text" id="dialogField1" style="width: 100%; margin-top: 10px;"></p>',
                    title: 'Rename',
                    width: 400,
                    callback: clickRename
                };
                new nxDialog('renameDialog', dialogData, [data.label]);
                ///check for invalid chars
                $("#dialogField1").inputFilter(function (value) {
                    if (value.length > 254) {
                        return false;
                    } else {
                        return /^[0-9a-zA-ZÀ-ÿ-. !_+%&|#*:()\[\]{}´`^]*$/.test(value);
                    }
                });
            }
            if (button === 'ok' && !name.match(/^\s*$/) && name !== data) {
                startAjaxPLG('renameMedia', {
                    name: name,
                    type: dataTmp['type'],
                    id: dataTmp['dbId'],
                    location: serverData.group.id
                });
            }
        }
    }

    function showMessagePLG(msg) {
        const dialogData = {
            buttons: [
                {label: UILANG.m('OK'), 'default': true, cancel: true, value: 'ok'}
            ],
            contents: msg,
            width: 500,
            title: UILANG.m("Error"),
            icon: "../images/error.png",
            iconWidth: 64
        };
        new nxDialog('Message', dialogData);
    }

    function showMessage(msg) {
        const dialogNoteData = {
            buttons: [
                {label: UILANG.m('OK'), 'default': true, cancel: true, value: 'ok'}
            ],
            contents: msg,
            width: 500,
            title: UILANG.m("Warning"),
            icon: "../images/warning.png",
            iconWidth: 64
        };
        setTimeout(function () {
            if ($("#notification").length === 0) {
                if (!$('#veil_notification').length) new nxDialog('notification', dialogNoteData);
            }
        }, 200);
    }

    /* export class */
    window.jsMediaPlugin = jsMediaPlugin;

})(jQuery);
