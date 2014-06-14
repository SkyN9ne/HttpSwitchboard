/*******************************************************************************

    httpswitchboard - a Chromium browser extension to black/white list requests.
    Copyright (C) 2013  Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/httpswitchboard
*/

/******************************************************************************/
//
// Asset update manager
//
/******************************************************************************/

HTTPSB.assetUpdater = (function() {

/******************************************************************************/

var getUpdateList = function(callback) {
    var localChecksumsText = '';
    var remoteChecksumsText = '';

    var compareChecksums = function() {
        var parseChecksumsText = function(text) {
            var result = {};
            var lines = text.split(/\n+/);
            var i = lines.length;
            var fields;
            while ( i-- ) {
                fields = lines[i].trim().split(/\s+/);
                if ( fields.length !== 2 ) {
                    continue;
                }
                result[fields[1]] = fields[0];
            }
            return result;
        };
        if ( remoteChecksumsText === 'Error' || localChecksumsText === 'Error' ) {
            remoteChecksumsText = localChecksumsText = '';
        }
        var localAssetChecksums = parseChecksumsText(localChecksumsText);
        var remoteAssetChecksums = parseChecksumsText(remoteChecksumsText);

        var toUpdate = {};
        for ( var path in remoteAssetChecksums ) {
            if ( !remoteAssetChecksums.hasOwnProperty(path) ) {
                continue;
            }
            if ( localAssetChecksums[path] === undefined ) {
                toUpdate[path] = {
                    status: 'Added',
                    remoteChecksum: remoteAssetChecksums[path],
                    localChecksum: ''
                };
                continue;
            }
            if ( localAssetChecksums[path] === remoteAssetChecksums[path] ) {
                toUpdate[path] = {
                    status: 'Unchanged',
                    remoteChecksum: remoteAssetChecksums[path],
                    localChecksum: localAssetChecksums[path]
                };
                continue;
            }
            toUpdate[path] = {
                status: 'Changed',
                remoteChecksum: remoteAssetChecksums[path],
                localChecksum: localAssetChecksums[path]
            };
        }
        for ( var path in localAssetChecksums ) {
            if ( !localAssetChecksums.hasOwnProperty(path) ) {
                continue;
            }
            if ( remoteAssetChecksums[path] === undefined ) {
                toUpdate[path] = {
                    status: 'Removed',
                    remoteChecksum: '',
                    localChecksum: localAssetChecksums[path]
                };
            }
        }

        HTTPSB.utils.reportBack(callback, { 'list': toUpdate });
    };

    var validateChecksums = function(details) {
        if ( details.error || details.content === '' ) {
            return 'Error';
        }
        if ( /^(?:[0-9a-f]{32}\s+\S+(\s+|$))+/.test(details.content) ) {
            return details.content;
        }
        return 'Error';
    };

    var onLocalChecksumsLoaded = function(details) {
        localChecksumsText = validateChecksums(details);
        if ( remoteChecksumsText !== '' ) {
            compareChecksums();
        }
    };

    var onRemoteChecksumsLoaded = function(details) {
        remoteChecksumsText = validateChecksums(details);
        if ( localChecksumsText !== '' ) {
            compareChecksums();
        }
    };

    HTTPSB.assets.getRemote('assets/checksums.txt', onRemoteChecksumsLoaded);
    HTTPSB.assets.get('assets/checksums.txt', onLocalChecksumsLoaded);
};

/******************************************************************************/

// If `list` is null, it will be fetched internally.

var update = function(list, callback) {
    var assetToUpdateCount;
    var updatedAssetChecksums = [];

    var reportBack = function() {
        HTTPSB.utils.reportBack(callback);
        chrome.runtime.sendMessage({ what: 'allLocalAssetsUpdated' });
    };

    var countdown = function() {
        assetToUpdateCount -= 1;
        if ( assetToUpdateCount > 0 ) {
            return;
        }
        HTTPSB.assets.put(
            'assets/checksums.txt',
            updatedAssetChecksums.join('\n'),
            reportBack
        );
        chrome.storage.local.set({ 'assetsUpdateTimestamp': Date.now() });
    };

    var assetUpdated = function(details) {
        var path = details.path;
        var entry = list[path];
        if ( details.error ) {
            updatedAssetChecksums.push(entry.localChecksum + ' ' + path);
        } else {
            updatedAssetChecksums.push(entry.remoteChecksum + ' ' + path);
        }
        countdown();
    };

    var processList = function() {
        assetToUpdateCount = Object.keys(list).length;
        if ( assetToUpdateCount === 0 ) {
            reportBack();
            return;
        }
        var entry;
        var details = { path: '', md5: '' };
        for ( var path in list ) {
            if ( list.hasOwnProperty(path) === false ) {
                continue;
            }
            entry = list[path];
            if ( entry.status === 'Added' || entry.status === 'Changed' ) {
                details.path = path;
                details.md5 = entry.remoteChecksum;
                HTTPSB.assets.update(details, assetUpdated);
                continue;
            }
            if ( entry.status === 'Unchanged' ) {
                updatedAssetChecksums.push(entry.localChecksum + ' ' + path);
            }
            countdown();
        }
    };

    var listLoaded = function(details) {
        list = details.list;
        processList();
    };

    if ( list ) {
        processList();
    } else {
        getUpdateList(listLoaded);
    }
};

/******************************************************************************/

// Export API

return {
    'getList': getUpdateList,
    'update': update
};

/******************************************************************************/

})();

/******************************************************************************/

