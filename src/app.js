'use strict';

const express = require('express'),
    pokemongo = require('pokemon-go-node-api'),
    socketio = require('socket.io'),
    it = require('iterator-tools'),

    coordinates = require('./coordinates'),
    Grid = require('./grid'),
    crawl = require('./crawl'),

    config = require('../config'),

    app = express(),
    server = app.listen(config.app.port, function () {
        console.log('Server started');
    }),

    io = socketio.listen(server),

    account = new pokemongo.Pokeio();

if (!config.leafletURL) {
    console.log('Empty "leafletURL" field in config.js. Did you update your config?');
    process.exit(1);
}

const step = 100; // consider each heartbeat returns pokemons in a 100 meters square.
const grid = new Grid(step);

function emitPokemon(socket, pokemon) {
    if (!pokemon.pokemonid) throw new Error('Tried to send an invalid pokemon');
    socket.emit('newPokemon', pokemon);
}

// Socket for scanner position
io.on('connection', function (socket) {
    console.log('New websocket connection');
    socket.emit('run', config.leafletURL);
    for (const pokemon of it.chainFromIterable(grid.values())) {
        emitPokemon(socket, pokemon);
    }
});


// User account
const username = config.login.username,
    password = config.login.password,
    provider = config.login.provider;

// Initial position
var location = {latitude:config.initialposition.latitude , longitude:config.initialposition.longitude, altitude:0};

var pointsOfInterest = new Map();

function getActivePointOfInterests() {
    return it.map(
        it.filter(
            pointsOfInterest.entries(),
            ([id, poi]) => {
                // Remove points of interest older than 10 minutes
                if (poi.date < Date.now() - 6e5 /*10 minutes*/) {
                    pointsOfInterest.delete(id);
                    return false;
                }
                return true;
            }
        ),
        (entry) => entry[1]
    );
}

// App setup
app.set('view engine', 'pug');
app.use(express.static('public'));

app.get('/scan/:id/:lat/:lng', function (req, res) {
    const location = { latitude: +req.params.lat, longitude: +req.params.lng, altitude: 0 };

    // Delete it so it will be inserted at the end
    pointsOfInterest.delete(req.params.id);
    pointsOfInterest.set(req.params.id, {
        date: Date.now(),
        index: 0,
        location
    });

    const position = Array.from(
        // Filter POIs that will be scanned in priority
        it.filter(
            getActivePointOfInterests(),
            (poi) => poi.index === 0
        )
    ).length;

    res.send({position, interval: config.moveInterval/1000});
});


// Scraping api
account.init(username, password, { type: 'coords', coords: location }, provider, function(err) {
    if (err){
        console.log(err);
        return;
    }
    setInterval(function () {
        moveNext();
    }, config.moveInterval + 500);
});

// Find next move, either a ping from the user or around current ping.
function moveNext() {
    let minPoi = null;

    for (const poi of getActivePointOfInterests()) {
        if (!minPoi || poi.index < minPoi.index) minPoi = poi;
    }

    if (minPoi) {
        let location;

        // This means all poi have an index of 9, so reset everything to 0
        if (minPoi.index === 9) {
            for (const poi of getActivePointOfInterests()) {
                poi.index = 0;
            }
        }


        if (minPoi.index === 0) {
            // Start with the actual location
            location = minPoi.location;
        } else {
            const gridPos = (minPoi.index - 1) % 9;
            location = coordinates.shift(
                minPoi.location,
                -step + (Math.floor(gridPos/3) * step),
                -step + (gridPos % 3 * step)
            );
        }

        minPoi.index += 1;

        changeLocation(location);
    }
}

function changeLocation(location) {
    io.emit('newLocation', location);
    crawl(account, location)
    .then((newPokemons) => {
        for (const pokemon of newPokemons) {
            grid.add(pokemon);
            emitPokemon(io, pokemon);
        }
    })
    .catch((error) => {
        console.log('Error while crawling location:', error.stack || String(error));
    });
}
