
function h(tag, attrs, content) {
    var result = document.createElement(tag);

    if (attrs) for (attr in attrs) result.setAttribute(attr, attrs[attr]);

    function populate(c) {
        if (!c) return;

        if (Array.isArray(c)) c.forEach(populate);
        else if (typeof c === 'string') result.appendChild(document.createTextNode(c));
        else result.appendChild(c);
    }
    populate(content);
    return result;
}

var map,
    markers = {},
    scannerMarker;

var locateControl = L.Control.extend({
    options: {position: 'topright'},

    onAdd: function (map) {
        var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-locate');
        container.innerHTML = '✛';

        container.onclick = function(event){
            event.stopPropagation();
            map.locate({setView: true, maxZoom: 16});
        }
        return container;
    }
 
});

function initMap() {
    var initPosition = [48.858574056544384, 2.2939968109130864],
        initZoom = 16;

    if (window.location.hash) {
        res = window.location.hash.match(/(\d+\.\d+)\/(\d+\.\d+)\/(\d+)/);
        if (res) {
            initPosition = [res[1], res[2]];
            initZoom = res[3];
        }

    }

    // Add retina tiles if retina screen
    if (L.Browser.retina) {
        leafletURL = leafletURL.replace('{y}?access_token', '{y}@2x?access_token');
    }
    map = L.map('map').setView(initPosition, initZoom);
    L.tileLayer(leafletURL, {maxZoom: 18}).addTo(map);


    map.addControl(new locateControl());
    scannerMarker = L.marker(initPosition, {
        title: 'Scanner',
    }).addTo(map);

    attachMapEvents();
}

function attachMapEvents () {
    map.on('dragend', savePosition);
    map.on('zoomend', savePosition);
    map.on('click', function (e) {
        fetch('/scan/' + e.latlng.lat + '/' + e.latlng.lng)
        .then(function (response) {
            response.json()
            .then(function (json) {
                console.log(json);
            })
        });
    });
}

// Hash manipulation
function savePosition() {
    var center = map.getCenter();
    window.location = '#' + center.lat + '/' + center.lng + '/' + map.getZoom();
}

function getIcon(pokemonid) {
    var size = L.Browser.retina ? 'retina' : 'narmol';
    return L.icon({
        iconUrl: `images/pokemons/${size}/${pokemonid}.png`,
        iconSize: [48, 48]
    });
}

function pad(s, chars) {
    return (chars + s).slice(-chars.length);
}

function formatTime(ms) {
    var totalSeconds = Math.round(ms / 1000);
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;

    return `${minutes}:${pad(seconds, '00')}`;
}

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
initMap();

// Scanner position
var socket = io();
socket.on('newPokemon', function (pokemon){
    addPokemon(pokemon);
});

socket.on('newLocation', function (location){
    scannerMarker.setLatLng([location.coords.latitude, location.coords.longitude]);
});
