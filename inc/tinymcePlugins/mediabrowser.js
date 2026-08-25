tinymce.PluginManager.add('mediabrowser', function (editor, url) {
	// Add a button that opens a window
	editor.ui.registry.addButton('mediabrowser', {
		tooltip: UILANG.m('Insert media'),
		icon: "image",
		onAction: function () {
			initMediaBrowser(editor);
		}
	});

	// Adds a menu item to the tools menu
	editor.ui.registry.addMenuItem('mediabrowser', {
		text: UILANG.m('Insert media'),
		// context: 'insert',
		icon: "image",
		onAction: function () {
			initMediaBrowser(editor);
		}
	});
});

function initMediaBrowser(ed) {
	new jsMediaPlugin('oasysImagePlugin', {
		mediaTypes: 'all',
		onClose: insertImageElement
	});	

	function insertImageElement(sender, mediaObj){
        if(mediaObj.btnType==='url'){
            ed.insertContent("fetchMediaFile.php?fileid="+mediaObj.fileId+"&checksum="+mediaObj.checksum);
        } else {
            switch (mediaObj.filetype){
                case 'image':
                    if(mediaObj.imgVerticalAlign!=='default'){
                    	ed.insertContent("<img style='vertical-align:"+mediaObj.imgVerticalAlign+";' src='fetchMediaFile.php?fileid="+mediaObj.fileId+"&checksum="+mediaObj.checksum+"' width='" + mediaObj.width + "px' height='" + mediaObj.height + "px'>");
					} else {
						ed.insertContent("<img src='fetchMediaFile.php?fileid="+mediaObj.fileId+"&checksum="+mediaObj.checksum+"' width='" + mediaObj.width + "px' height='" + mediaObj.height + "px'>");
					}
                    break;
                case 'audio':
                    ed.insertContent('[@AUDIO FILE="fetchMediaFile.php?fileid='+mediaObj.fileId+'&checksum='+mediaObj.checksum+'"'+mediaObj.optionString+']');
                    break;
                case 'video':
                    ed.insertContent('[@VIDEO FILE="fetchMediaFile.php?fileid='+mediaObj.fileId+'&checksum='+mediaObj.checksum+'"'+mediaObj.optionString+']');
                    break;
            }
		}
	}
}

