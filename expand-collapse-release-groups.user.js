// ==UserScript==
// @name          MusicBrainz: Expand/collapse release groups
// @description	  See what's inside a release group without having to follow its URL. Also adds convenient edit links for it.
// @version       2024-12-28
// @namespace     github.com/euamotubaina/musicbrainz-userscripts
// @author        Michael Wiencek <mwtuea@gmail.com>
// @license       GPL
// @downloadURL   https://raw.githubusercontent.com/euamotubaina/musicbrainz-userscripts/master/expand-collapse-release-groups.user.js
// @updateURL     https://raw.githubusercontent.com/euamotubaina/musicbrainz-userscripts/master/expand-collapse-release-groups.user.js
// @grant         none
// @match         http*://*.musicbrainz.org/artist/*
// @match         http*://*.musicbrainz.org/label/*
// @match         http*://*.musicbrainz.org/release-group/*
// @match         http*://*.musicbrainz.org/series/*
// @exclude       http*://*.musicbrainz.org/label/*/*
// @exclude       http*://*.musicbrainz.org/release-group/*/*
// @exclude       http*://*.musicbrainz.org/series/*/*
// @icon          https://wiki.musicbrainz.org/-/images/3/3d/Musicbrainz_logo.png
// ==/UserScript==

const MBID_REGEX = /[0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}/;

const releasesOrReleaseGroups = document.querySelectorAll("#content table.tbl > tbody > tr > td a[href^='/release']");
for (const entity of releasesOrReleaseGroups) {
    const entityLink = entity.getAttribute('href');
    if (entityLink.match(/\/release-group\//)) {
        inject_release_group_button(entity.parentNode);
    } else if (!entityLink.match(/\/cover-art/)) {
        // avoid injecting a second button for a release's cover art link
        inject_release_button(entity.parentNode);
    }
}

function inject_release_group_button(parent) {
    const mbid = parent.querySelector('a').href.match(MBID_REGEX);
    const table = document.createElement('table');

    table.style.marginTop = '1em';
    table.style.marginLeft = '1em';
    table.style.paddingLeft = '1em';

    const button = create_button(
        `/ws/2/release?release-group=${mbid}&limit=100&inc=media&fmt=json`,
        toggled => toggled ? parent.appendChild(table) : parent.removeChild(table),
        json => parse_release_group(json, mbid, table),
        status => table.innerHTML = `<tr><td style="color: #f00;">Error loading release group (HTTP status ${status})</td></tr>`
    );

    parent.insertBefore(button, parent.firstChild);
}

function inject_release_button(parent, _table_parent, _table, _mbid) {
    const mbid = _mbid || parent.querySelector('a').href.match(MBID_REGEX);
    const table = _table || document.createElement('table');
    const table_parent = _table_parent || parent; // fallback for pages where we do not inject the release groups

    table.style.paddingLeft = '1em';

    const button = create_button(
        `/ws/2/release/${mbid}?inc=media+recordings+artist-credits&fmt=json`,
        toggled => toggled ? table_parent.appendChild(table) : table_parent.removeChild(table),
        json => parse_release(json, table),
        status => table.innerHTML = `<tr><td style="color: #f00;">Error loading release (HTTP status ${status})</td></tr>`
    );

    parent.insertBefore(button, parent.childNodes[0]);
}

function create_button(url, dom_callback, success_callback, error_callback) {
    const button = document.createElement('span');
    let toggled = false;

    button.innerHTML = '&#9654;';
    button.style.cursor = 'pointer';
    button.style.marginRight = '4px';
    button.style.color = '#777';

    button.addEventListener(
        'mousedown',
        () => {
            toggled = !toggled;
            toggled ? button.innerHTML = '&#9660;' : button.innerHTML = '&#9654;';
            dom_callback(toggled);
        },
        false
    );

    button.addEventListener(
        'mousedown',
        () => {
            const this_event = arguments.callee;
            button.removeEventListener('mousedown', this_event, false);
            const req = new XMLHttpRequest();

            req.onreadystatechange = () => {
                if (req.readyState != 4) return;

                if (req.status == 200 && req.responseText) {
                    success_callback(JSON.parse(req.responseText));
                } else {
                    button.addEventListener(
                        'mousedown',
                        () => {
                            button.removeEventListener('mousedown', arguments.callee, false);
                            button.addEventListener('mousedown', this_event, false);
                        },
                        false
                    );
                    error_callback(req.status);
                }
            };

            req.open('GET', url, true);
            req.send(null);
        },
        false
    );

    return button;
}

function format_time(ms) {
    const ts = ms / 1000;
    const s = Math.round(ts % 60);
    return `${Math.floor(ts / 60)}:${s >= 10 ? s : `0${s}`}`;
}

function parse_release_group(json, mbid, table) {
    let releases = json.releases;
    table.innerHTML = '';

    for (const release of releases) {
        const media = {};
        let tracks = [];
        let formats = [];

        for (const medium of release.media) {
            const format = medium.format;
            const count = medium['track-count'];
            if (format) {
                format in media ? media[format] += 1 : media[format] = 1;
            }
            tracks.push(count);
        }

        for (const format in media) {
            const count = media[format];
            count > 1 ? formats.push(`${count.toString()}&#215;${format}`) : formats.push(format);
        }

        release.tracks = tracks.join(' + ');
        release.formats = formats.join(' + ');
    }

    releases.sort(function (a, b) {
        if (a.date < b.date) return -1;
        if (a.date > b.date) return 1;
        return 0;
    });

    for (const release of releases) {
        const track_tr = document.createElement('tr');
        const track_td = document.createElement('td');
        const track_table = document.createElement('table');
        const format_td = document.createElement('td');
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        const a = createLink(`/release/${release.id}`, release.title);

        track_td.colSpan = 6;
        track_table.style.width = '100%';
        track_table.style.marginLeft = '1em';
        track_tr.appendChild(track_td);
        inject_release_button(td, track_td, track_table, release.id);
        td.appendChild(a);
        if (release.disambiguation) {
            td.appendChild(document.createTextNode(` (${release.disambiguation})`));
        }
        tr.appendChild(td);
        format_td.innerHTML = release.formats;
        tr.appendChild(format_td);

        const columns = [release.tracks, release.date || '', release.country || '', release.status || ''];
        for (const column of columns) {
            tr.appendChild(createElement('td', column));
        }

        table.appendChild(tr);
        table.appendChild(track_tr);
    }

    const bottom_tr = document.createElement('tr');
    const bottom_td = document.createElement('td');

    bottom_td.colSpan = 6;
    bottom_td.style.padding = '1em';

    bottom_td.appendChild(createNewTabLink(`/release-group/${mbid}/edit`, 'edit'));
    bottom_td.appendChild(document.createTextNode(' | '));
    bottom_td.appendChild(createNewTabLink(`/release/add?release-group=${mbid}`, 'add release'));
    bottom_td.appendChild(document.createTextNode(' | '));
    bottom_td.appendChild(createNewTabLink(`/release-group/${mbid}/edits`, 'editing history'));

    bottom_tr.appendChild(bottom_td);
    table.appendChild(bottom_tr);
}

function parse_release(json, table) {
    const media = json.media;
    table.innerHTML = '';

    for (let i = 0; i < media.length; i++) {
        const medium = media[i];
        const format = medium.format ? `${medium.format} ${i + 1}` : `Medium ${i + 1}`;

        table.innerHTML += `<tr class="subh"><td colspan="4">${format}</td></tr>`;

        for (let j = 0; j < medium.tracks.length; j++) {
            const track = medium.tracks[j];
            const recording = track.recording;
            const disambiguation = recording.disambiguation ? ` (${recording.disambiguation})` : '';
            const length = track.length ? format_time(track.length) : '?:??';
            const artist_credit = track['artist-credit'] || track.recording['artist-credit'];
            const tr = document.createElement('tr');

            tr.appendChild(createElement('td', j + 1));
            const title_td = createElement('td', disambiguation);
            title_td.insertBefore(createLink(`/recording/${recording.id}`, recording.title), title_td.firstChild);
            tr.appendChild(title_td);
            tr.appendChild(createElement('td', length));
            const ac_td = document.createElement('td');
            ac_td.appendChild(createAC(artist_credit));
            tr.appendChild(ac_td);

            table.appendChild(tr);
        }
    }

    const bottom_tr = document.createElement('tr');
    const bottom_td = document.createElement('td');

    bottom_td.colSpan = 4;
    bottom_td.style.padding = '1em';

    bottom_td.appendChild(createNewTabLink(`/release/${json.id}/edit`, 'edit'));
    bottom_td.appendChild(document.createTextNode(' | '));
    bottom_td.appendChild(createNewTabLink(`/release/${json.id}/edit-relationships`, 'edit relationships'));
    bottom_td.appendChild(document.createTextNode(' | '));
    bottom_td.appendChild(createNewTabLink(`/release/${json.id}/edits`, 'editing history'));
    bottom_td.appendChild(document.createTextNode(' | '));
    bottom_td.appendChild(createNewTabLink(`/release/${json.id}/add-cover-art`, 'add cover art'));

    bottom_tr.appendChild(bottom_td);
    table.appendChild(bottom_tr);
}

function createAC(artist_credit_array) {
    const span = document.createElement('span');

    for (const credit of artist_credit_array) {
        const artist = credit.artist;
        const link = createLink(`/artist/${artist.id}`, credit.name || artist.name);

        link.setAttribute('title', artist['sort-name']);
        span.appendChild(link);

        if (credit.joinphrase) span.appendChild(document.createTextNode(credit.joinphrase));
    }
    return span;
}

function createElement(name, text) {
    const element = document.createElement(name);
    element.textContent = text;
    return element;
}

function createLink(href, text) {
    const element = createElement('a', text);
    element.href = href;
    return element;
}

function createNewTabLink(href, text) {
    const link = createLink(href, text);
    link.target = '_blank';
    return link;
}
