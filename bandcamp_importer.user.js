// ==UserScript==
// @name           Import Bandcamp releases to MusicBrainz
// @description    Add a button on Bandcamp's album pages to open MusicBrainz release editor with pre-filled data for the selected release
// @version        2022.5.6.1
// @namespace      http://userscripts.org/users/22504
// @downloadURL    https://raw.githubusercontent.com/euamotubaina/musicbrainz-userscripts/master/bandcamp_importer.user.js
// @updateURL      https://raw.githubusercontent.com/euamotubaina/musicbrainz-userscripts/master/bandcamp_importer.user.js
// @include        /^https?://[^/]+/(?:album|track)/[^/]+\/?$/
// @include        /^https?://web\.archive\.org/web/\d+/https?://[^/]+/(?:album|track)/[^/]+\/?$/
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.2.4/jquery.min.js
// @require        https://raw.githubusercontent.com/euamotubaina/musicbrainz-userscripts/master/lib/mbimport.js
// @require        https://raw.githubusercontent.com/euamotubaina/musicbrainz-userscripts/master/lib/logger.js
// @require        https://raw.githubusercontent.com/euamotubaina/musicbrainz-userscripts/master/lib/mblinks.js
// @require        https://raw.githubusercontent.com/euamotubaina/musicbrainz-userscripts/master/lib/mbimportstyle.js
// @icon           https://raw.githubusercontent.com/euamotubaina/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// @grant          unsafeWindow
// @run-at         document-start
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

// eslint-disable-next-line no-global-assign
if (!unsafeWindow) unsafeWindow = window;

String.prototype.fix_bandcamp_url = function () {
    return this.replace('http://', 'https://');
};

const BandcampImport = {
    // Analyze Bandcamp data and return a release object
    retrieveReleaseInfo: function () {
        let bandcampAlbumData = unsafeWindow.TralbumData;
        let bandcampEmbedData = unsafeWindow.EmbedData;

        let release = {
            discs: [],
            artist_credit: [],
            barcode: '',
            title: '',
            year: 0,
            month: 0,
            day: 0,
            parent_album_url: '',
            labels: [],
            format: 'Digital Media',
            country: 'XW',
            type: '',
            status: 'official',
            packaging: 'None',
            language: 'eng',
            script: 'Latn',
            urls: [],
            url: bandcampAlbumData.url.fix_bandcamp_url(),
        };

        // Grab release title
        release.title = bandcampAlbumData.current.title;

        // Grab release event information
        let date = this.convdate(bandcampAlbumData.current.release_date);
        if (date) {
            if (!(date.year > 2008 || (date.year == 2008 && date.month >= 9))) {
                // use publish date if release date is before Bandcamp launch (2008-09)
                let pdate = this.convdate(bandcampAlbumData.current.publish_date);
                if (pdate) {
                    date = pdate;
                }
            }
            release.year = date.year;
            release.month = date.month;
            release.day = date.day;
        }

        // FIXME: implement a mapping between bandcamp release types and MB ones
        if (bandcampAlbumData.current.type == 'track') {
            // map Bandcamp single tracks to singles
            release.type = 'single';
            // if track belongs to an album, get its url.
            if (bandcampEmbedData.album_embed_data) {
                release.parent_album_url = bandcampEmbedData.album_embed_data.linkback.fix_bandcamp_url();
                release.type = 'track'; // <-- no import
            }
        }

        // Tracks
        let disc = {
            tracks: [],
            format: release.format,
        };
        release.discs.push(disc);

        // attempt to detect multiple artists tracks
        // bandcamp formats them as 'artist - tracktitle'
        // only set to true if ALL tracks are formatted like this
        // and if string doesn't start with a number (ie. 02 - title)
        let various_artists = true;
        for (let i = 0; i < bandcampAlbumData.trackinfo.length; i++) {
            if (!bandcampAlbumData.trackinfo[i].title.match(/ - /) || bandcampAlbumData.trackinfo[i].title.match(/^\d+ - /)) {
                various_artists = false;
                break;
            }
        }

        // Release artist credit
        if (bandcampAlbumData.artist.match(/^various(?: artists)?$/i) && various_artists) {
            release.artist_credit = [MBImport.specialArtist('various_artists')];
        } else {
            release.artist_credit = MBImport.makeArtistCredits([bandcampAlbumData.artist]);
        }

        let tracks_streamable = 0;
        $.each(bandcampAlbumData.trackinfo, function (index, bctrack) {
            let title = bctrack.title;
            let artist = [];
            if (various_artists) {
                let m = bctrack.title.match(/^(.+) - (.+)$/);
                if (m) {
                    title = m[2];
                    artist = [m[1]];
                }
            }
            if (bctrack.file) tracks_streamable++;
            let track = {
                title: title,
                duration: Math.round(bctrack.duration * 1000),
                artist_credit: MBImport.makeArtistCredits(artist),
            };
            disc.tracks.push(track);
        });

        // Check for hidden tracks (more tracks in the download than shown for streaming ie.)
        let showntracks = bandcampAlbumData.trackinfo.length;
        let numtracks = -1;
        let nostream = false;
        // album description indicates number of tracks in the download
        let match = /^\d+ track album$/.exec(document.querySelector('meta[property="og:description"]').getAttribute('content'));
        if (match) {
            numtracks = parseInt(match, 10);
        }
        if (numtracks > 0 && numtracks > showntracks) {
            // display a warning if tracks in download differs from tracks shown
            $('h2.trackTitle').append(
                `<p style="font-size: 70%; font-style: italic; margin: 0.1em 0;">Warning: ${numtracks} vs ${showntracks} tracks</p>`
            );

            // append unknown tracks to the release
            for (let i = 0; i < numtracks - showntracks; i++) {
                let track = {
                    title: '[unknown]',
                    duration: null,
                    artist_credit: [],
                };
                disc.tracks.push(track);
            }
            // disable stream link as only part of the album can be streamed
            nostream = true;
        }

        // URLs
        let link_type = MBImport.URL_TYPES;
        // Download for free vs. for purchase
        if (bandcampAlbumData.current.download_pref !== null) {
            if (
                bandcampAlbumData.freeDownloadPage !== null ||
                bandcampAlbumData.current.download_pref === 1 ||
                (bandcampAlbumData.current.download_pref === 2 && bandcampAlbumData.current.minimum_price === 0)
            ) {
                release.urls.push({
                    url: release.url,
                    link_type: link_type.download_for_free,
                });
            }
            if (bandcampAlbumData.current.download_pref === 2) {
                release.urls.push({
                    url: release.url,
                    link_type: link_type.purchase_for_download,
                });
            }
        }
        // Check if the release is streamable
        if (bandcampAlbumData.hasAudio && !nostream && disc.tracks.length > 0 && disc.tracks.length == tracks_streamable) {
            release.urls.push({
                url: release.url,
                link_type: link_type.stream_for_free,
            });
        }
        // Check if release is Creative Commons licensed
        const ccIcons = document.querySelector('div#license a.cc-icons');
        if (ccIcons) {
            release.urls.push({
                url: ccIcons.getAttribute('href'),
                link_type: link_type.license,
            });
        }
        // Check if album has a back link to a label
        let label = this.getlabelname();
        if (label) {
            release.labels.push({
                name: label,
                mbid: '',
                catno: 'none',
            });
        }

        // UPCs generally apply to physical releases so set the barcode when
        // digital download is the only available medium
        let mediums = bandcampAlbumData.packages;
        let upc = bandcampAlbumData.current.upc;
        if ((mediums === null || mediums.length === 0) && upc !== null) {
            release.barcode = upc;
        }

        return release;
    },

    // Insert links in page
    insertLink: function (release) {
        if (release.type == 'track') {
            // only import album or single, tracks belong to an album
            return false;
        }
        // Form parameters
        let edit_note = MBImport.makeEditNote(release.url, 'Bandcamp');
        let parameters = MBImport.buildFormParameters(release, edit_note);
        // Build form
        let mbUI = $(`<div id="mb_buttons">${MBImport.buildFormHTML(parameters)}${MBImport.buildSearchButton(release)}</div>`).hide();

        // Append MB import link
        $('#name-section').append(mbUI);
        document.querySelector('#mb_buttons').style.marginTop = '6px';
        document.querySelectorAll('form.musicbrainz_import').forEach(form => (form.style.display = 'inline-block'));
        mbUI.slideDown();
    },

    // helper to convert bandcamp date to MB date
    convdate: function (date) {
        if (typeof date != 'undefined' && date !== '') {
            let d = new Date(date);
            return {
                year: d.getUTCFullYear(),
                month: d.getUTCMonth() + 1,
                day: d.getUTCDate(),
            };
        }
        return false;
    },

    // get label name from back link if possible
    getlabelname: function () {
        let label = $('a.back-to-label-link span.back-link-text').contents().get(2);
        if (typeof label == 'undefined') {
            return '';
        }
        return label.textContent;
    },
};

if (window.location.hostname === 'web.archive.org') {
    window.addEventListener('beforescriptexecute', function (e) {
        let prev = e.target.previousElementSibling;

        if (!prev || !prev.src) {
            return;
        }

        let patchproc = function () {
            if (!window._WBWombat) {
                return;
            }

            // Patch the Wombat options to exclude Musicbrainz URLs
            let oldWombat = window._WBWombat;
            window._WBWombat = function (wbwindow, wbinfo) {
                wbinfo.wombat_opts.no_rewrite_prefixes.push('https://musicbrainz.org/');
                wbinfo.wombat_opts.no_rewrite_prefixes.push('http://musicbrainz.org/');
                wbinfo.wombat_opts.no_rewrite_prefixes.push('//musicbrainz.org/');
                return oldWombat(wbwindow, wbinfo);
            };
        };

        // Insert our payload after Wombat's been loaded, but before its initialised
        if (prev.src.search(/\/_static\/js\/wombat.js/) != -1) {
            window.removeEventListener('beforescriptexecute', arguments.callee);

            let script = document.createElement('script');
            script.type = 'text/javascript';
            script.text = `(${patchproc})()`;
            prev.parentNode.insertBefore(script, e.target);
        }
    });
}

$(document).ready(function () {
    /* keep the following line as first, it is required to skip
     * pages which aren't actually a bandcamp page, since we support
     * bandcamp pages under third-party domains.
     * see @include
     */
    if (!unsafeWindow.TralbumData) return;
    /***/

    MBImportStyle();

    let mblinks = new MBLinks('BCI_MBLINKS_CACHE');

    let release = BandcampImport.retrieveReleaseInfo();

    // add MB artist link
    let root_url = release.url.match(/^(https?:\/\/[^/]+)/)[1].split('?')[0];
    let label_url = '';

    mblinks.searchAndDisplayMbLink(
        root_url,
        'label',
        function (link) {
            $('p#band-name-location span.title').append(link);
        },
        `label:${root_url}`
    );
    const labelback = document.querySelector('a.back-to-label-link');
    if (labelback) {
        const labelbacklink = labelback.getAttribute('href');
        if (labelbacklink) {
            label_url = labelbacklink
                .match(/^(https?:\/\/[^/]+)/)[1]
                .split('?')[0]
                .fix_bandcamp_url();
            mblinks.searchAndDisplayMbLink(
                label_url,
                'label',
                function (link) {
                    $('a.back-to-label-link span.back-link-text').append(link);
                },
                `label:${label_url}`
            );
        }
    }

    if (release.artist_credit.length == 1) {
        // try to get artist's mbid from cache
        let artist_mbid = mblinks.resolveMBID(root_url);
        if (artist_mbid) {
            release.artist_credit[0].mbid = artist_mbid;
        }
    }

    // try to get label mbid from cache
    let label_mbid = '';
    let label_name = '';
    if (label_url) {
        label_mbid = mblinks.resolveMBID(`label:${label_url}`);
        label_name = BandcampImport.getlabelname();
    } else {
        label_mbid = mblinks.resolveMBID(`label:${root_url}`);
        if (label_mbid) label_name = $('p#band-name-location span.title').text().trim();
    }
    if (label_mbid || label_name) {
        if (release.labels.length == 0) {
            release.labels.push({
                name: '',
                mbid: '',
                catno: 'none',
            });
        }
        release.labels[0].name = label_name;
        release.labels[0].mbid = label_mbid;
    }

    BandcampImport.insertLink(release);
    LOGGER.info('Parsed release: ', release);

    if (release.type == 'track') {
        mblinks.searchAndDisplayMbLink(root_url, 'artist', function (link) {
            $('div#name-section h3 span:last').before(link);
        });
        // add MB links to parent album
        mblinks.searchAndDisplayMbLink(release.parent_album_url, 'release', function (link) {
            $('div#name-section h3 span:first').before(link);
        });
    } else {
        mblinks.searchAndDisplayMbLink(root_url, 'artist', function (link) {
            $('div#name-section h3 span:first').before(link);
        });
        // add MB release links to album or single
        mblinks.searchAndDisplayMbLink(release.url, 'release', function (link) {
            $('div#name-section h3 span:first').after(link);
        });
    }

    // append a comma after each tag to ease cut'n'paste to MB
    $('div.tralbum-tags a:not(:last-child).tag').after(', ');

    // append a link to the full size image
    const tralbumArt = document.querySelector('div#tralbumArt');
    const fullsizeimageurl = tralbumArt.querySelector('a').getAttribute('href').replace('_10', '_0');
    tralbumArt.insertAdjacentHTML(
        'afterend',
        `<div id='bci_link'><a class='custom-color' href='${fullsizeimageurl}' title='Open original image in a new tab (Bandcamp importer)' target='_blank'>Original image</a></div>`
    );

    const bci_link = document.querySelector('div#bci_link');
    bci_link.style.paddingTop = '0.5em';
    bci_link.style.textAlign = 'right';
    bci_link.querySelector('a').style.fontWeight = 'bold';
    const upc = unsafeWindow.TralbumData.current.upc;
    if (typeof upc != 'undefined' && upc !== null) {
        document
            .querySelector('div #trackInfoInner')
            .insertAdjacentHTML(
                'beforeend',
                `<div id="mbimport_upc" style="margin-bottom: 2em; font-size: smaller;">UPC: <a href="https://atisket.pulsewidth.org.uk/?upc=${upc}">${upc}</a></div>`
            );
    }
});
