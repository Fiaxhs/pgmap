var map,
    pokemonsSeen = {},
    scannerMarker;

function initMap() {
    var initPosition = [48.869147, 2.3251892],
        initZoom = 16;
    if (window.location.hash) {
        res = window.location.hash.match(/(\d+\.\d+)\/(\d+\.\d+)\/(\d+)/);
        if (res) {
            initPosition = [res[1], res[2]];
            initZoom = res[3];
        }

    }
    map = L.map('map').setView(initPosition, initZoom);
    L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/light-v9/tiles/256/{z}/{x}/{y}?access_token=' + mapboxToken, {
        attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://mapbox.com">Mapbox</a>',
        maxZoom: 18
    }).addTo(map);

    scannerMarker = L.marker(initPosition, {
        title: 'Scanner',
    }).addTo(map);

    map.on('dragend', savePostion);
    map.on('zoomend', savePostion);
    map.on('click', function (e) {
        fetch('/scan/' + e.latlng.lat + '/' + e.latlng.lng)
        .then(function (response) {
            response.json()
            .then(function (json) {
                console.log(json);
            })
        });
    });

    getPokemons();
    // window.setInterval(getPokemons, 1000);
}

// Hash manipulation
function savePostion() {
    var center = map.getCenter();
    window.location = '#' + center.lat + '/' + center.lng + '/' + map.getZoom();
}

// Fetch pokemons
function getPokemons() {
    fetch('/pokemons')
        .then(function (response){
            response.json()
            .then(function (pokemons){
                pokemons.forEach(addPokemon);
            });
        });
}

// Add pokemon marker to map
function addPokemon(pokemon) {
    if (pokemonsSeen[pokemon.id]) {
        return;
    }
    pokemonsSeen[pokemon.id] = true;
    var time = new Date(+pokemon.expiration);
    var icon = L.icon({
        iconUrl: ('images/icons/' + pokemon.pokemonid + '.png'),
        iconSize: [48, 48]
    });

    var marker = L.marker([pokemon.latitude, pokemon.longitude], {
        icon: icon,
        title: pokemonList[pokemon.pokemonid].name + ' (' + time.getHours() + ':' + ('00' + time.getMinutes()).slice(-2) + ')',
    }).addTo(map);
    window.setTimeout(function() {
        delete pokemonsSeen[pokemon.id];
        map.removeLayer(marker);
    }, pokemon.expiration - Date.now());
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