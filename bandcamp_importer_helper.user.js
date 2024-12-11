// ==UserScript==
// @name        Import Bandcamp releases to MusicBrainz Album Link Helper
// @description Add a link to Bandcamp's album canonical URL on pages without /album/, for one to import the release into MusicBrainz
// @version     2024-12-11
// @namespace   https://github.com/euamotubaina/musicbrainz-userscripts
// @downloadURL https://raw.githubusercontent.com/euamotubaina/musicbrainz-userscripts/master/bandcamp_importer_helper.user.js
// @updateURL   https://raw.githubusercontent.com/euamotubaina/musicbrainz-userscripts/master/bandcamp_importer_helper.user.js
// @match       http*://*.bandcamp.com/
// @match       http*://*.bandcamp.com/releases
// @exclude     http*://*.bandcamp.com/*/*
// @require     https://raw.githubusercontent.com/euamotubaina/musicbrainz-userscripts/master/lib/logger.js
// @icon        https://raw.githubusercontent.com/euamotubaina/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// @grant       unsafeWindow
// ==/UserScript==

if (!unsafeWindow) unsafeWindow = window;

const ready = function (fn) {
    if (document.readyState !== 'loading') {
        fn();
    } else {
        document.addEventListener('DOMContentLoaded', fn);
    }
};

ready(function () {
    // Display a link to the correct album bandcamp url (i.e. main page or releases page)
    const bandcampAlbumData = unsafeWindow.TralbumData;
    if (bandcampAlbumData && bandcampAlbumData.url) {
        const innerHTML = `
            <div id="bci_helper" style="padding-top: 5px;">
                <a href="${bandcampAlbumData.url}" title="Load album page and display Import to MB button">Album page (MB import)</a>
            </div>`;
        document.querySelector('#name-section').insertAdjacentHTML('beforeend', innerHTML);
    }
});
