'use strict';

import 'whatwg-fetch';
import 'socket.io-client/socket.io.js';
import 'leaflet/dist/leaflet.js';
import 'leaflet/dist/leaflet.css';
L.Icon.Default.imagePath = "/images/leaflet";
import 'leaflet-control-geocoder/dist/Control.Geocoder.js';
import 'leaflet-control-geocoder/dist/Control.Geocoder.css';

import { pokemon } from 'pokemon-go-node-api/pokemons.json';
var pokemonList = pokemon;

// npm install left-pad alternative.
function pad(s, chars) {
    return (chars + s).slice(-chars.length);
}

// dom creation helper
function h(tag, attrs, content) {
    var result = document.createElement(tag);

    if (attrs) for (var attr in attrs) result.setAttribute(attr, attrs[attr]);

    function populate(c) {
        if (!c) return;

        if (Array.isArray(c)) c.forEach(populate);
        else if (typeof c === 'string') result.appendChild(document.createTextNode(c));
        else result.appendChild(c);
    }
    populate(content);
    return result;
}

function generateUserId() {
    return pad(Math.floor(Math.random() * Math.pow(16, 10)).toString(16), '0'.repeat(10));
}

function getUserId() {
    var userId = localStorage.getItem('userId');
    if (!userId) {
        userId = generateUserId();
        localStorage.setItem('userId', userId);
    }
    return userId;
}

var map,
    markers = {},
    clickMarker,
    scanButton,
    currentPosition = [48.869147, 2.3251892],
    initZoom = 16;


function setupHashRoute () {
    var res,
        url = new URL(window.location);

    if (url.hash) {
        res = window.location.hash.match(/(\d+\.\d+)\/(\d+\.\d+)\/(\d+)/);
        if (res) {
            currentPosition = [res[1], res[2]];
            initZoom = res[3];
        }
    }
}

// Setup map
function initMap(leafletURL) {
    // Add retina tiles if retina screen
    var retinaAwareURL;
    if (L.Browser.retina) {
        retinaAwareURL = leafletURL.replace('{y}?access_token', '{y}@2x?access_token');
    } else {
        retinaAwareURL = leafletURL;
    }
    map = L.map('map').setView(currentPosition, initZoom);
    L.tileLayer(retinaAwareURL, {maxZoom: 18}).addTo(map);

    // Map events
    map.on('dragend', savePosition);
    map.on('zoomend', savePosition);
    map.on('click', addMarkerForScan);
}

// Update location.hash with given position
function savePosition(center) {
    if (!center.lat && !center.lng) {
        center = map.getCenter();
    }
    window.location = '#' + center.lat + '/' + center.lng + '/' + map.getZoom();
}

// Add the marker for location to scan
function addMarkerForScan (e) {
    clickMarker.setLatLng(e.latlng).addTo(map);
    map.addControl(scanButton);
    scanButton.getContainer().style.display = 'block';
}

function addMapControls () {
    addGeocoder();
    map.addControl(new locateControl());
    scanButton = new scanControl();

    clickMarker = L.marker(currentPosition);
}

// Scan control
var scanControl = L.Control.extend({
    options: {
        position: 'bottomleft'
    },

    onAdd: function () {
        var container = h('div', { class: 'leaflet-bar leaflet-control scan-control' }, [
            h('span', { class: 'name' }, 'Scan')
        ]);

        container.onclick = function(e){
            e.stopPropagation();
            doScan(clickMarker.getLatLng());
            map.removeControl(scanButton);
            map.removeControl(clickMarker);
        };
        return container;
    }
});

// Geolocation control
var locateControl = L.Control.extend({
    options: {position: 'topright'},

    onAdd: function (map) {
        var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-locate');
        container.innerHTML = '✛';

        container.onclick = function(event){
            event.stopPropagation();
            map.locate({setView: true, maxZoom: 16});
        };
        return container;
    }

});

// Add searchbar
function addGeocoder () {
    L.Control.geocoder({
        defaultMarkGeocode: false
    }).on('markgeocode', function(e) {
        var center = e.geocode.center;

        doScan(center)
        .then(function () {
            centerOnPoint(center);
        });
    })
    .addTo(map);
}

// Center map on given point
function centerOnPoint(center) {
    savePosition(center);
    map.setView([center.lat, center.lng], initZoom);
}

// Queue location for scan
function doScan(latlng) {
    currentPosition = latlng;
    return fetch(`/scan/${getUserId()}/${latlng.lat}/${latlng.lng}`)
    .then(function (response) {
        response.json()
        .then(function (json) {
            var pop = L.popup()
                .setLatLng([latlng.lat, latlng.lng])
                .setContent('<div>Scan queued.</div> Scanning in ~' + json.position * json.interval + 's')
                .openOn(map);
            window.setTimeout(function () {map.closePopup(pop);}, 1300);
        });
    });
}

// Icon creation for pokemon
function getIcon(pokemonid) {
    var size = L.Browser.retina ? 'retina' : 'narmol';
    return L.icon({
        iconUrl: `images/pokemons/${size}/${pokemonid}.png`,
        iconSize: [48, 48]
    });
}

function formatTime(ms) {
    var totalSeconds = Math.round(ms / 1000);
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;

    return ` ${minutes}:${pad(seconds, '00')}`;
}

// Counter for pokemon popup
function createCounter(expiration, updatefn) {
    function update() {
        var remaining = expiration - Date.now();
        if (remaining < 0) remaining = 0;
        updatefn(remaining);
        if (!remaining) clearInterval(interval);
    }

    var interval = window.setInterval(update, 1000);
    update();
}

// Pokemon popup
function createPopup(pokemon) {
    var counter = h('span');

    createCounter(pokemon.expiration, function (remaining) {
        counter.textContent = formatTime(remaining);
    });

    return h('div', { class: 'popup' }, [
        h('span', { class: 'name' }, pokemonList[pokemon.pokemonid].name),
        counter,
    ]);
}


// Listen to newPokemon and newLocation
var socket = io();


// Let's go, baby
socket.once('run', run);
function run(leafletURL) {
    setupHashRoute();
    initMap(leafletURL);
    addMapControls();
    setInterval(function () {
        // Renew poi every 5 minutes
        doScan(currentPosition);
    }, 3e5 /* 5 minutes*/);
}


socket.on('newPokemon', addPokemon);
// Add pokemon marker to map
function addPokemon(pokemon) {
    var oldMarker = markers[pokemon.id];
    if (oldMarker) {
        if (oldMarker.pokemonid == pokemon.pokemonid && oldMarker.expiration == pokemon.expiration) {
            return;
        } else { //update lure
            oldMarker.marker.setIcon(getIcon(pokemon.pokemonid));
        }
    } else {
        var time = new Date(+pokemon.expiration);
        var icon = getIcon(pokemon.pokemonid);

        var formattedTime = time.getHours() + ':' + ('00' + time.getMinutes()).slice(-2)+ ':' + ('00' + time.getSeconds()).slice(-2);

        var marker = L.marker([pokemon.latitude, pokemon.longitude], {
            icon: icon,
            title: pokemonList[pokemon.pokemonid].name + ' (' + formattedTime + ')',
            opacity: pokemon.isLure ? 0.5 : 1
        }).addTo(map);

        marker.bindPopup(createPopup(pokemon));

        window.setTimeout(function() {
            delete markers[pokemon.id];
            map.removeLayer(marker);
        }, +pokemon.expiration - Date.now());

        markers[pokemon.id] = {marker: marker, pokemonid: pokemon.pokemonid, expiration: pokemon.expiration};
    }
}


socket.on('newLocation', newLocation);

// Update scannerCircle position
function newLocation (location) {
    var scannerCircle = L.circle([location.latitude, location.longitude], 50, {
        clickable: false,
        fillOpacity: 0.2,
        opacity:0.2,
    }).addTo(map);
    setTimeout(function () {
        scannerCircle.remove();
    }, 2000);
}
