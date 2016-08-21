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

    io = socketio.listen(server);

if (!config.leafletURL) {
    console.log('Empty "leafletURL" field in config.js. Did you update your config?');
    process.exit(1);
}

// User accounts
const allAccountsConfig = config.accounts || [];
if (config.login) {
    console.log('Warning: the configuration "login" field is deprecated, please use the "accounts" field instead.');
    allAccountsConfig.push(config.login);
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


function errorHandler(topic) {
    return (error) => {
        console.log(`${topic}:`, error.stack || String(error));
    };
}

Promise.all(allAccountsConfig.map(({ username, password, provider }) => {
    return new Promise((resolve, reject) => {
        const account = new pokemongo.Pokeio();
        account.init(username, password, { type: 'coords', coords: location }, provider, function (error) {
            if (error) return reject(new Error(`Unable to login with username ${username}`, error));
            resolve(account);
        });
    });
}))
.then((accounts) => {
    for (const account of accounts) {
        setInterval(function () {
            moveNext(account);
        }, config.moveInterval + 500);
    }
}, errorHandler('Login error'))
.catch(errorHandler('Unexpected error'));

// Find next move, either a ping from the user or around current ping.
function moveNext(account) {
    let minPoi = null;
    let gridTotalSize = config.gridSize;
    let gridBy = Math.sqrt(config.gridSize);
    let initDistFromCenter = Math.floor(gridBy/2);

    for (const poi of getActivePointOfInterests()) {
        if (!minPoi || poi.index < minPoi.index) minPoi = poi;
    }

    if (minPoi) {
        let location;

        // This means all poi have an index of configurable gridTotalSize, so reset everything to 0
        if (minPoi.index === gridTotalSize) {
            for (const poi of getActivePointOfInterests()) {
                poi.index = 0;
            }
        }

        if (minPoi.index === 0) {
            // Start with the actual location
            location = minPoi.location;
        } else {

            const gridPos = (minPoi.index - 1) % gridTotalSize;
            const x = -step*initDistFromCenter + (Math.floor(gridPos/gridBy) * step)
            const y = -step*initDistFromCenter + (gridPos % gridBy * step)

            location = coordinates.shift(
                minPoi.location,
                x,
                y
            );
        }

        minPoi.index += 1;

        changeLocation(account, location);
    }
}

function changeLocation(account, location) {
    io.emit('newLocation', location);
    crawl(account, location)
    .then((newPokemons) => {
        for (const pokemon of newPokemons) {
            grid.add(pokemon);
            emitPokemon(io, pokemon);
        }
    })
    .catch(errorHandler('Crawling error'));
}
