var map;

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
    L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/streets-v9/tiles/256/{z}/{x}/{y}?access_token=' + mapboxToken, {
        attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://mapbox.com">Mapbox</a>',
        maxZoom: 18
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
    window.setInterval(getPokemons, 1000);
}

function savePostion() {
    var center = map.getCenter();
    window.location = '#' + center.lat + '/' + center.lng + '/' + map.getZoom();
}

function getPokemons() {
    fetch('/pokemons')
        .then(function (response){
            response.json()
            .then(function (pokemons){
                pokemons.forEach(function (pokemon) {
                    var time = new Date(pokemon.expiration*1000);
                    var icon = L.icon({
                        iconUrl: ('images/icons/' + pokemon.pokemonid + '.png'),
                        iconSize: [48, 48]
                    });

                    L.marker([pokemon.latitude, pokemon.longitude], {
                        icon: icon,
                        title: pokemonList[pokemon.pokemonid].name + ' (' + time.getHours() + ':' + ('00' + time.getMinutes()).slice(-2) + ')',
                    }).addTo(map);
                });
            });
        });
}
initMap();