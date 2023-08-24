// ==UserScript==
// @name           Steam collection Downloader
// @version        0.3.1
// @description    Downloads steam workshop collections and items from smods.ru / steamworkshop.download
// @author         Cappig
// @license        GPLv3
// @namespace      https://github.com/cappig/steam-workshop-downloader
// @icon           https://steamcommunity.com/favicon.ico
// @match          *://steamcommunity.com/workshop/filedetails/?id=*
// @match          *://steamcommunity.com/sharedfiles/filedetails/?id=*
// @grant          GM_xmlhttpRequest
// @grant          GM_download
// ==/UserScript==
"use strict";

// consistent color palette that fits with steams design
const blue = "#54a5d4";
const green = "#4c6b22";
const red = "#992929";

const appid = document.querySelector(".apphub_sectionTab").href.split("/")[4];
const parser = new DOMParser();

var button; // Store the button so that we don't have to call querySelector() all the time
var path = ""; // subfolder for collection mods, this only works on firefox, on Chrome it's included in the name

// Run this on load and inject the HTML download button
(function () {
    const header = document.querySelector(".workshopItemDetailsHeader");

    button = document.createElement("span"); // global variable

    button.className = "btnv6_blue_hoverfade btn_medium";
    button.id = "SD-dbtn";
    button.style.padding = "10px";

    if (document.querySelector(".collectionNotifications")) {
        // collection
        button.innerText = "> Download collection";

        button.addEventListener("click", fetchCollection);

        let name = document.querySelector(".workshopItemTitle").innerHTML;
        path = `${name.replace(/ /g, "_")}/`;
    } else {
        // single item
        button.innerText = "> Download item";

        button.addEventListener("click", fetchSingle);
    }

    header.appendChild(button);
})();

var isFetching = false;
var done = 0,
    total = 0,
    failed = 0;

function fetchSingle() {
    // prevent fetching twice
    if (isFetching) {
        return;
    }
    isFetching = true;

    total = 1;

    button.innerText = `> Downloading... || 0/1 | failed: 0`;

    let url = new URL(document.URL);
    let id = url.searchParams.get("id");

    fetchSmodsID(id);
}

function fetchCollection() {
    // prevent fetching twice
    if (isFetching) {
        return;
    }
    isFetching = true;

    // scrape and filter all items
    let collectionChildren = [...document.querySelector(".collectionChildren").children];
    let collectionItems = collectionChildren.filter((item) => item.id != "");

    total = collectionItems.length;

    button.innerText = `> Downloading... || 0/${total} | failed: 0`;

    // queue all items for fetching and add HTML status indicator
    for (let item of collectionItems) {
        let id = item.id.split("_")[1];

        addFetchStatusHTML(id, item);
        fetchSmodsID(id);
    }

    console.log("<Steam-downloader> All items queued");
}

function incrementDownloadCount(hasFailed) {
    if (hasFailed) {
        failed++;
    } else {
        done++;
    }

    if (done + failed == total) {
        button.style.background = failed > 0 ? red : green;

        button.innerText = `> Done! || ${done}/${total} | failed: ${failed}`;
        button.style.setProperty("color", "white", "important");

        console.log("<Steam-downloader> All items downloaded");

        isFetching = false;
    } else {
        button.innerText = `> Downloading... || ${done}/${total} | failed: ${failed}`;
    }
}

function addFetchStatusHTML(id, item) {
    const status = document.createElement("span");

    status.className = "btnv6_blue_hoverfade";
    status.id = id;

    status.style.padding = "5px";
    status.style.marginLeft = "10px";
    status.style.background = blue;
    //status.style.color = "white !important"; // this only works on Chrome for some reason
    status.style.setProperty("color", "white", "important"); // workaround

    status.innerText = "Checking availability";

    item.querySelector(".workshopItemTitle ").appendChild(status);
}

function modifyFetchStatusHTML(id, failed) {
    let status = document.getElementById(id);

    if (status == null) {
        return;
    }

    if (failed) {
        status.style.background = red;
        status.innerText = "Failed to download";
    } else {
        status.style.background = green;
        status.innerText = "Downloaded successfully";
    }
}

function getSmodsURL(id) {
    switch (appid) {
        case "255710": // Cities: Skylines
            return `https://smods.ru/?s=${id}`;
        case "394360": // Hearts of Iron IV
            return `https://hearts-of-iron-4.smods.ru/?s=${id}`;
        case "281990": // Stellaris
            return `https://stellaris.smods.ru/?s=${id}`;
        default:
            return `https://catalogue.smods.ru/?s=${id}&app=${appid}`;
    }
}

function fetchSmodsID(id) {
    console.log(`<Steam-downloader> Started downloading ${id}`);

    let retries = 0;
    let url = getSmodsURL(id);

    GM_xmlhttpRequest({
        method: "GET",
        url: url,

        onload: function (response) {
            let document = parser.parseFromString(response.response, "text/html");
            let item = document.querySelector(".skymods-excerpt-btn");

            downloadSWD(id);
        },

        // Is this even necessary?
        ontimeout: function (response) {
            if (retries < 3) {
                console.warn(`<Steam-downloader> Timeout fetching ${id} from Smods. Retrying... [${retries}/3]`);
                fetchSmodsID(id);
            } else {
                console.warn(`<Steam-downloader> Timeout fetching ${id}!`);
            }
        },

        onerror: function (response) {
            console.warn(`<Steam-downloader> Error while fetching ${id}!\n ERROR: ${response}`);
        }
    });
}

function downloadSWD(id) {
    console.log(`<Steam-downloader> Started downloading ${id} from SWD`);

    GM_xmlhttpRequest({
        method: "POST",
        url: "http://steamworkshop.download/online/steamonline.php",
        headers: {
            "content-type": "application/x-www-form-urlencoded"
        },
        data: `item=${id}&app=${appid}`,

        onload: function (response) {
            let document = parser.parseFromString(response.response, "text/html");
            let download_url = document.querySelector("pre > a");

            if (download_url == null) {
                console.warn(`<Steam-downloader> Error downloading ${id} from SWD!`);

                incrementDownloadCount(true);
                modifyFetchStatusHTML(id, true);
            } else {
                downloadFile(id, download_url.href);
            }
        }
    });
}

function downloadFile(id, url) {
    console.log(`<Steam-downloader> Started downloading ${id}`);

    GM_download({
        url: url,
        name: `${path}${id}.zip`,

        onload: function (response) {
            console.log(`<Steam-downloader> Successfully downloaded ${id}`);

            incrementDownloadCount(false);
            modifyFetchStatusHTML(id, false);
        },

        onerror: function (response) {
            console.warn(`<Steam-downloader> Error downloading ${id}!\n ERROR: ${response}`);

            incrementDownloadCount(true);
            modifyFetchStatusHTML(id, true);
        }
    });
}
