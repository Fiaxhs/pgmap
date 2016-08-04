var Map,
    markers = {},
    scannerMarker,
    InitPosition = [48.869147, 2.3251892];
    InitZoom = 16;

function geolocateUser () {
    navigator.geolocation.getCurrentPosition(
        onSuccessfulGeolocation,
        onFailedGeolocation
    );
}

function onSuccessfulGeolocation(position) {
    centerOnPoint({
        lat : position.coords.latitude,
        lng : position.coords.longitude
    })
}

function onFailedGeolocation(err) {
    console.error("Failed geolocation", err)
}

function initMap() {
    var res,
        url = new URL(window.location),
        doRecenter = false;

    if (url.hash) {
        var res = window.location.hash.match(/(\d+\.\d+)\/(\d+\.\d+)\/(\d+)/);
        if (res) {
            InitPosition = [res[1], res[2]];
            InitZoom = res[3];
            doRecenter = true;
        }
    }

    Map = L.map('map').setView(InitPosition, InitZoom);
    addGeocoder();

    L.tileLayer(leafletURL, {
        attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://mapbox.com">Mapbox</a>',
        maxZoom: 18
    }).addTo(Map);

    scannerMarker = L.marker(InitPosition, {
        title: 'Scanner',
    }).addTo(Map);

    Map.on('dragend', savePosition);
    Map.on('zoomend', savePosition);
    Map.on('click', function (e) {
        doScan(e.latlng.lat, e.latlng.lng)
    });

    var isHttps = /https/.test(url.protocol),
        isLocalhost = url.hostname === 'localhost',
        hasGeolocation = !!navigator.geolocation;

    if ((isHttps || isLocalhost) && hasGeolocation) {
        geolocateUser();
    }
}

function addGeocoder () {
    L.Control.geocoder({
        defaultMarkGeocode: false
    }).on('markgeocode', function(e) {
        var center = e.geocode.center

        doScan(center.lat, center.lng)
        .then(function () {
            centerOnPoint(center)
        })
    })
    .addTo(Map);
}

function centerOnPoint(center) {
    newLocation({
        coords : {
            latitude : center.lat,
            longitude : center.lng
        }
    })
    savePosition(center)
    Map.setView([center.lat, center.lng], InitZoom);
}

function doScan(lat, lng) {
    return fetch('/scan/' + lat + '/' + lng)
    .then(function (response) {
        return response.json()
        .then(function (json) {
            console.log(json);
        })
    });
}

// Hash manipulation
function savePosition(center) {
    if (!center.lat && !center.lng) {
        center = Map.getCenter();
    }

    window.location = '#' + center.lat + '/' + center.lng + '/' + Map.getZoom();
}

function getIcon(pokemonid) {
    return L.icon({
        iconUrl: ('images/icons/' + pokemonid + '.png'),
        iconSize: [48, 48]
    });
}

function newLocation (location) {
    scannerMarker.setLatLng([location.coords.latitude, location.coords.longitude]);
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
        }).addTo(Map);
        window.setTimeout(function() {
            delete markers[pokemon.id];
            Map.removeLayer(marker);
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

socket.on('newLocation', newLocation);
