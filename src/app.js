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
var gridPos  = 0;
var location = {type: 'coords', coords:{latitude:config.initialposition.latitude , longitude:config.initialposition.longitude, altitude:0}};

var queueLocation = [];

// App setup
app.set('view engine', 'pug');
app.use(express.static('public'));

app.get('/scan/:lat/:lng', function (req, res) {
    queueLocation.push({type: 'coords', coords:{latitude: +req.params.lat , longitude: +req.params.lng, altitude:0}});
    res.send({position: queueLocation.length, interval: config.moveInterval/1000});
});


// Scraping api
account.init(username, password, location, provider, function(err) {
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
    if (queueLocation.length) {
        location = queueLocation.shift();
        changeLocation(location);
        gridPos = 0;
        return;
    }
    var offX = -step + (Math.floor(gridPos/3) * step);
    var offY = -step + (gridPos % 3 * step);
    var newLocation = {
        type: 'coords',
        coords: coordinates.shift(location.coords, offX, offY),
    };
    changeLocation(newLocation);
    gridPos = (gridPos + 1) % 9;
    return;
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
