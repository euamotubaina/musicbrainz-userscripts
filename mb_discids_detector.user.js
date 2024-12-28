﻿// ==UserScript==
// @name            Musicbrainz DiscIds Detector
// @version         2024-12-28
// @namespace       github.com/euamotubaina/musicbrainz-userscripts
// @description     Generate MusicBrainz DiscIds from online EAC logs, and check existence in MusicBrainz database.
// @downloadURL     https://raw.githubusercontent.com/euamotubaina/musicbrainz-userscripts/master/mb_discids_detector.user.js
// @updateURL       https://raw.githubusercontent.com/euamotubaina/musicbrainz-userscripts/master/mb_discids_detector.user.js
// @match           http*://orpheus.network/torrents.php?id=*
// @match           http*://redacted.sh/torrents.php?id=*
// @match           http*://lztr.us/torrents.php?id=*
// @match           http*://lztr.me/torrents.php?id=*
// @match           http*://mutracker.org/torrents.php?id=*
// @match           http*://notwhat.cd/torrents.php?id=*
// @require         https://code.jquery.com/jquery-3.7.1.min.js
// @require         http://pajhome.org.uk/crypt/md5/sha1.js
// @require         https://raw.githubusercontent.com/euamotubaina/musicbrainz-userscripts/master/lib/logger.js
// @icon            https://raw.githubusercontent.com/euamotubaina/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

LOGGER.setLevel('info');

const CHECK_IMAGE =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/gD+AP7rGNSCAAAACXBIWXMAAABIAAAASABGyWs+AAAACXZwQWcAAAAQAAAAEABcxq3DAAADKklEQVQ4y32TS2hcZRiGn/8/Z87MNNc2zczEmptO0jSXagJtXCjWhhSEXpCI4EYENy6KG8FFBYtgEbzQ4k5QqNp2VyMtJVGpRU0tGDNoQxvrmCbkMslkSJrJXM6cOef8v4ukQqX4wbP5eL/327wv/M/Em+qNeFO9ASDEwzUPrM+fP8dqOhXqeGJ/f21ddCAYCsfRyFLJvru2mvnh9mTil8am1uJLQ8ceNOhoa+XC8HfMJm81x1q63glV179oBMLVhpQYEiQKzy0VNtZWLs9OT53s6X3qrxPHX+bSyNVNgyujV8lvrDXG2vZ/7oWig64nAY0hwZCCgIRwUGBJRSGbvp6cHH91R33078ODTyNOnXqPxcRl88ibX5wuBJuP5x2BVhop2PwuBA01kn2tJo4HtxfL5DIzZ7+/8MHrOx7tcMQ3I9dwnWKvF+kfTdlVEc/10f59A0HAgMEui90xgxvTLn8u+9SYhXUnNX60smr7z7Jx3wG8UOSZhUI4spJTrGwo0lssZxVSQlOdZGrJYyzpks4qlvLBWhWMHOgb7Mfsq4PfXOvx+bwgk/WxSwrfUwRNQSgAh7oCFB3N1xNllrMK04A5V7PLMOOvCSFMgFzJl6u2Jl8Gx9XkCppSWdEWNWiPGZy9XmIs6WJKKHuasq+p3qlkOwhz9B54dnbOkorOR0yG9gZJ3fP5cNTm4J4Akws+FyfKOK5GCFAatm/T4ObmB7RWxt74k9hrC0LVtLwwmw2FwyY8323hK2iLGnz2U4lMTiHvR04IGiqLxbrS7x/np3NJozoEmcTFTLTz2U7bivTcXNSsFxWHeyyGE2XGZ7x/j7WGyhA0W3e/LU58eiY1N+0IgLc++or1VLLb6hz6MmPGe/M2NFTBzIpH3lYoX6MQhC1NkzV/p2Jp5JX6eP+vn7wxsJnEXXUVnL6T59K7J/u2tR96365oey7nVQTKnsDzNFr5hETBq3ZmbrB47cS5M2+PdTbHmJpL89+OGbv3dLc81n/kWLih+yDhnTGtEcpeXXHSUz/OJ64M3/ojMS3BUw9rI2BsIUxBsLYyEJYC1nNuqawpARrwtwDgHxTwbTT5CxY9AAAALnpUWHRjcmVhdGUtZGF0ZQAAeNozMjCw0DWw0DUyCTEwsDIyszIw0jUwtTIwAABB3gURQfNnBAAAAC56VFh0bW9kaWZ5LWRhdGUAAHjaMzIwsNA1sNA1MggxNLMyNLYyNtM1MLUyMAAAQgUFF56jVzIAAAAASUVORK5CYII%3D';

$(document).ready(() => {
    if (window.location.host.match(/orpheus\.network|redacted\.sh|passtheheadphones\.me|lztr\.(us|me)|mutracker\.org|notwhat\.cd/)) {
        LOGGER.debug('Gazelle site detected');
        gazellePageHandler();
    }
});

function gazellePageHandler() {
    const serverHost = window.location.host;

    // Determine Artist name and Release title
    const titleAndArtists = $('#content div.thin h2:eq(0)').text();
    let pattern = /(.*) - (.*) \[.*\] \[.*/;
    if (serverHost.match(/orpheus/)) {
        pattern = /(.*) [-–] (.*) \[.*\]( \[.*)?/;
    }
    let artistName, releaseName;
    if (m = titleAndArtists.match(pattern)) {
        artistName = m[1];
        releaseName = m[2];
    }
    LOGGER.debug('artist:', artistName, '- releaseName:', releaseName);

    // Parse each torrent
    $('tr.group_torrent')
        .filter(function () { return $(this).attr('id') })
        .each(function () {
            const torrentInfo = $(this).next();

            $(torrentInfo)
                .find('a')
                // Only investigate the ones with a log
                .filter(function (index) { $(this).text().match(/View\s+Log/i) })
                .each(function () {
                    LOGGER.debug('Log link', this);
                    if (
                        $(this).attr('onclick')?.match(/show_logs/)
                        || $(this).hasClass('view-riplog')
                    ) {
                        if (window.location.host.match(/orpheus/)) {
                            LOGGER.debug('Orpheus');
                            var logAction = 'viewlog';
                        } else if (window.location.host.match(/redacted|passtheheadphones/)) {
                            LOGGER.debug('RED');
                            var logAction = 'loglist';
                        }
                    }
                    // LzTR
                    else if ($(this).attr('onclick').match(/get_log/)) {
                        LOGGER.debug('LzTR');
                        var logAction = 'log_ajax';
                    }
                    // NotWhat.CD
                    else if ($(this).attr('onclick').match(/show_log/)) {
                        LOGGER.debug('NotWhat.CD');
                        var logAction = 'viewlog';
                    } else {
                        return true;
                    }
                    const targetContainer = $(this).parents('.linkbox');
                    const torrentId = window.location.host.match(/orpheus/)
                        ? targetContainer.data('id')
                        : /(show_logs|get_log|show_log)\('(\d+)/.exec($(this).attr('onclick'))[2];
                    const logUrl = `/torrents.php?action=${logAction}&torrentid=${torrentId}`;
                    LOGGER.info('Log URL: ', logUrl);
                    LOGGER.debug('targetContainer: ', targetContainer);

                    // Get log content
                    $.get(logUrl, function (data) {
                        LOGGER.debug('Log content', $(data).find('pre'));
                        const discs = analyze_log_files($(data).find('pre'));
                        LOGGER.debug('Number of disc found', discs.length);
                        const mbIdsEl = $(`<div class="mbdiscid_${torrentId}"></div>`);
                        check_and_display_discs(
                            discs,
                            function (discNumber) {
                                mbIdsEl.append(
                                    `${
                                        discs.length > 1 ? `<strong>Disc ${discNumber}: </strong>` : ''
                                    }<span id="${torrentId}_disc${discNumber}" />`
                                );
                            },
                            function (mb_toc_numbers, discid, discNumber, found) {
                                const url = computeAttachURL(mb_toc_numbers, artistName, releaseName);
                                const mbId = $(`#${torrentId}_disc${discNumber}`);
                                if (found) {
                                    mbId.css({
                                        'padding-right': '15px',
                                        'background': `no-repeat right/6% url("${CHECK_IMAGE}")`,
                                    });
                                };
                                LOGGER.debug(`#${torrentId}_disc${discNumber}`);
                                const mbIdLink = $(`<a href="${url}" target="_blank" style="background: none">${discid}</a>`);
                                mbIdLink.css({
                                    'background': 'none',
                                    'padding': '0',
                                });
                                mbId.append(mbIdLink);
                            }
                        );
                        targetContainer.append(mbIdsEl);
                    });
                });
        });
}

// Common functions

function computeAttachURL(mb_toc_numbers, artistName, releaseName) {
    return `https://musicbrainz.org/cdtoc/attach?toc=${mb_toc_numbers.join('%20')}&artist-name=${
        encodeURIComponent(artistName)}&release-name=${encodeURIComponent(releaseName)}`;
}

function analyze_log_files(log_files) {
    let discs = [];
    $.each(log_files, function (i, log_file) {
        let discsInLog = MBDiscid.log_input_to_entries($(log_file).text());
        for (let i = 0; i < discsInLog.length; i++) {
            discs.push(discsInLog[i]);
        }
    });

    // Remove dupes discs
    let keys = new Object();
    let uniqueDiscs = new Array();
    for (let i = 0; i < discs.length; i++) {
        let discid = MBDiscid.calculate_mb_discid(discs[i]);
        if (discid in keys) {
            continue;
        } else {
            keys[discid] = 1;
            uniqueDiscs.push(discs[i]);
        }
    }
    discs = uniqueDiscs;
    return discs;
}

function check_and_display_discs(discs, displayDiscHandler, displayResultHandler) {
    // For each disc, check if it's in MusicBrainz database
    for (let i = 0; i < discs.length; i++) {
        const entries = discs[i];
        const discNumber = i + 1;
        if (entries.length > 0) {
            const mb_toc_numbers = MBDiscid.calculate_mb_toc_numbers(entries);
            const discid = MBDiscid.calculate_mb_discid(entries);
            LOGGER.info(`Computed discid :${discid}`);
            displayDiscHandler(discNumber);

            // Now check if this discid is known by MusicBrainz
            (function (discid, discNumber, mb_toc_numbers) {
                const query = $.getJSON(`//musicbrainz.org/ws/2/discid/${discid}?cdstubs=no`);
                query.done(function (data) {
                    const existsInMusicbrainz = !('error' in data) && data.error != 'Not found';
                    displayResultHandler(mb_toc_numbers, discid, discNumber, existsInMusicbrainz);
                });
                query.fail(function () {
                    // If discid is not found, the webservice returns a 404 http code
                    displayResultHandler(mb_toc_numbers, discid, discNumber, false);
                });
            })(discid, discNumber, mb_toc_numbers);
        }
    }
}

/* -------------------------------------------- */

// MBDiscid code comes from https://gist.github.com/kolen/766668
// Copyright 2010, kolen
// Released under the MIT License

var MBDiscid = (function () {
    this.SECTORS_PER_SECOND = 75;
    this.PREGAP = 150;
    this.DATA_TRACK_GAP = 11400;

    this.toc_entry_matcher = new RegExp(
        '^\\s*' +
        '(\\d+)' + // 1 - track number
        '\\s*\\|\\s*' +
        '([0-9:.]+)' + // 2 - time start
        '\\s*\\|\\s*' +
        '([0-9:.]+)' + // 3 - time length
        '\\s*\\|\\s*' +
        '(\\d+)' + // 4 - start sector
        '\\s*\\|\\s*' +
        '(\\d+)' + // 5 - end sector
        '\\s*$'
    );
    this.log_input_to_entries = function (text) {
        let discs = [];
        var entries = [];
        $.each(text.split('\n'), function (index, value) {
            let m = toc_entry_matcher.exec(value);
            if (m) {
                // New disc
                if (parseInt(m[1], 10) == 1) {
                    if (entries.length > 0) {
                        discs.push(entries);
                    }
                    entries = [];
                }
                entries.push(m);
            }
        });
        if (entries.length > 0) {
            discs.push(entries);
        }

        for (let i = 0; i < discs.length; i++) {
            var entries = discs[i];
            let layout_type = get_layout_type(entries);
            var entries_audio;
            if (layout_type == 'with_data') {
                entries_audio = entries.slice(0, entries.length - 1);
            } else {
                entries_audio = entries;
            }
            discs[i] = entries_audio;
        }
        return discs;
    };

    this.get_layout_type = function (entries) {
        let type = 'standard';
        for (let i = 0; i < entries.length - 1; i++) {
            let gap = parseInt(entries[i + 1][4], 10) - parseInt(entries[i][5], 10) - 1;
            if (gap != 0) {
                if (i == entries.length - 2 && gap == DATA_TRACK_GAP) {
                    type = 'with_data';
                } else {
                    type = 'unknown';
                    break;
                }
            }
        }
        return type;
    };

    this.calculate_mb_toc_numbers = function (entries) {
        if (entries.length == 0) {
            return null;
        }

        let leadout_offset = parseInt(entries[entries.length - 1][5], 10) + PREGAP + 1;

        let offsets = $.map(entries, function (entry) {
            return parseInt(entry[4], 10) + PREGAP;
        });
        return [1, entries.length, leadout_offset].concat(offsets);
    };

    this.calculate_cddb_id = function (entries) {
        let sum_of_digits = function (n) {
            let sum = 0;
            while (n > 0) {
                sum = sum + (n % 10);
                n = Math.floor(n / 10);
            }
            return sum;
        };

        let decimalToHexString = function (number) {
            if (number < 0) {
                number = 0xffffffff + number + 1;
            }

            return number.toString(16).toUpperCase();
        };

        let length_seconds = Math.floor(
            (parseInt(entries[entries.length - 1][5], 10) - parseInt(entries[0][4], 10) + 1) / SECTORS_PER_SECOND
        );
        let checksum = 0;
        $.each(entries, function (index, entry) {
            checksum += sum_of_digits(Math.floor((parseInt(entry[4], 10) + PREGAP) / SECTORS_PER_SECOND));
        });

        let xx = checksum % 255;
        let discid_num = (xx << 24) | (length_seconds << 8) | entries.length;
        //return discid_num
        return decimalToHexString(discid_num);
    };

    this.calculate_mb_discid = function (entries) {
        let hex_left_pad = function (input, totalChars) {
            input = `${parseInt(input, 10).toString(16).toUpperCase()}`;
            let padWith = '0';
            if (input.length < totalChars) {
                while (input.length < totalChars) {
                    input = padWith + input;
                }
            }
            if (input.length > totalChars) {
                //if padWith was a multiple character string and num was overpadded
                input = input.substring(input.length - totalChars, totalChars);
            }

            return input;
        };

        const mb_toc_numbers = calculate_mb_toc_numbers(entries);
        let message = '';
        let first_track = mb_toc_numbers[0];
        let last_track = mb_toc_numbers[1];
        let leadout_offset = mb_toc_numbers[2];
        message = message + hex_left_pad(first_track, 2);
        message = message + hex_left_pad(last_track, 2);
        message = message + hex_left_pad(leadout_offset, 8);
        for (let i = 0; i < 99; i++) {
            let offset = i + 3 < mb_toc_numbers.length ? mb_toc_numbers[i + 3] : 0;
            message = message + hex_left_pad(offset, 8);
        }

        b64pad = '=';
        let discid = b64_sha1(message);
        discid = discid.replace(/\+/g, '.').replace(/\//g, '_').replace(/=/g, '-');
        return discid;
    };

    return this;
})();
