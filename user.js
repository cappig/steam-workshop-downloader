// ==UserScript==
// @name           Steam collection Downloader
// @version        0.1
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

// consistant color palette that fits with steams design
const blue = "#54a5d4";
const green = "#4c6b22";
const red = "#992929";

const appid = document.querySelector(".apphub_sectionTab").href.split("/")[4];
const header = document.querySelector(".workshopItemDetailsHeader");
const parser = new DOMParser();

var path = ""; // subfolder for collection mods, this only works on firefox, on Chrome it's included in the name

// run this on load
(function () {
    "use strict";

    /* inject HTML */
    addButton();
})();

function addButton() {
    const button = document.createElement("span");

    button.className = "btnv6_blue_hoverfade btn_medium";
    button.id = "SD-dbtn";
    button.style.padding = "10px";

    if (document.querySelector(".collectionNotifications")) {
        // collection
        button.innerText = "> Download collection";

        button.addEventListener("click", startFetching);

        let name = document.querySelector(".workshopItemTitle").innerHTML;
        path = `${name.replace(/ /g, "_")}/`;
    } else {
        button.innerText = "> Download item";

        button.addEventListener("click", fetchSingle);
    }

    header.appendChild(button);
}

function fetchSingle() {
    // prevent fetching twice
    if (isFetching) {
        return;
    }
    isFetching = true;

    done = 0;
    failed = 0;
    total = 1;
    document.querySelector("#SD-dbtn").innerText = `> Downloading... || 0/1 | failed: 0`;

    let id = document.URL.split("id=")[1];
    fetchSmodsID(id);
}

var isFetching = false;
function startFetching() {
    // prevent fetching twice
    if (isFetching) {
        return;
    }
    isFetching = true;

    // scrape and filter all items
    let collectionChildren = [...document.querySelector(".collectionChildren").children];
    let collectionItems = collectionChildren.filter((item) => item.id != "");

    done = 0;
    failed = 0;
    total = collectionItems.length;
    document.querySelector("#SD-dbtn").innerText = `> Downloading... || 0/${total} | failed: 0`;

    // queue all items for fetching and add HTML status indicator
    for (let item of collectionItems) {
        let id = item.id.split("_")[1];

        addFetchStatusHTML(id, item);

        fetchSmodsID(id);
    }

    console.log("<Steam-downloader> All items queued");
}

var done = 0,
    total = 0,
    failed = 0;
//var total = 0;
function incrementDownloadCount(hasFailed) {
    if (hasFailed) {
        failed++;
    } else {
        done++;
    }

    let button = document.querySelector("#SD-dbtn");
    if (done + failed == total) {
        if (failed > 0) {
            button.style.background = red;
        } else {
            button.style.background = green;
        }

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
        return; // for single mods
    }

    if (failed) {
        status.style.background = red;
        status.innerText = "Failed to download";
    } else {
        status.style.background = green;
        status.innerText = "Downloaded successfully";
    }
}

function downloadModbse(MBid, id) {
    let requestData = `op=download2&id=${MBid}`;

    GM_xmlhttpRequest({
        method: "POST",
        url: "https://modsbase.com/",
        headers: {
            "content-type": "application/x-www-form-urlencoded"
        },
        data: requestData,

        onload: function (response) {
            GM_download({
                url: response.finalUrl,
                name: `${path}${id}.zip`
            });
            console.log(`<Steam-downloader> Successfully downloaded ${id}`);
        }
    });
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

var dlErrors = [];
function fetchSmodsID(id) {
    console.log(`<Steam-downloader> Started downloading ${id}`);

    let url = getSmodsURL(id);

    GM_xmlhttpRequest({
        method: "GET",
        url: url,

        onload: function (response) {
            if (response.status == 524) {
                // check for timeout
                console.log(`<Steam-downloader> Timeout fetching ${id}. Retrying...`);
                fetchSmodsID(id);
                return;
            }

            let document = parser.parseFromString(response.response, "text/html");
            let item = document.querySelector(".post-inner");

            if (item == null) {
                console.log(`<Steam-downloader> Error fetching ${id} from smods.ru. Trying SWD`);

                // Fallback to SWD
                downloadSWD(id);
            } else {
                let url = item.querySelector(".skymods-excerpt-btn").href;
                let MBid = url.split("/")[3];

                console.log(`<Steam-downloader> Successfully fetched ${id}`);
                downloadModbse(MBid, id);

                incrementDownloadCount(false);
                modifyFetchStatusHTML(id, false);
            }
        },

        onerror: function (response) {
            console.log(response);
        }
    });
}

function downloadSWD(id) {
    let url = `http://workshop8.abcvg.info/archive/${appid}/${id}.zip`;

    GM_xmlhttpRequest({
        method: "GET",
        url: url,

        onload: function (response) {
            if (response.status != 200) {
                incrementDownloadCount(true);
                modifyFetchStatusHTML(id, true);

                console.log(`<Steam-downloader> Error downloading ${id} from SWD`);
            } else {
                GM_download({
                    url: response.finalUrl,
                    name: `${path}${id}.zip`
                });

                incrementDownloadCount(false);
                modifyFetchStatusHTML(id, false);

                console.log(`<Steam-downloader> Successfully downloaded ${id} from SWD`);
            }
        }
    });
}
