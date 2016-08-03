'use strict';

const long = require('long'),
    config = require('./config'),
    R = 6378.137, // Radius of earth in KM

    express = require('express'),
    app = express(),
    server = app.listen(config.app.port, function () {
      console.log('Server started');
    }),
    io = require('socket.io').listen(server),

    pokemongo = require('pokemon-go-node-api'),
    account = new pokemongo.Pokeio();


// Socket for scanner position
io.on('connection', function(socket){
  console.log('New websocket connection');
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

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/views/index.html');
});

app.get('/scan/:lat/:lng', function (req, res) {
    queueLocation.push({type: 'coords', coords:{latitude: +req.params.lat , longitude: +req.params.lng, altitude:0}});
    res.send({position: queueLocation.length});
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
        console.log('Moving to ', location);
        changeLocation(location);
        gridPos = 0;
        return;
    }
    var step = 100;
    var offX = -step + (Math.floor(gridPos/3) * step);
    var offY = -step + (gridPos % 3 * step);
    var newLocation = moveAround(location, offX, offY);
    changeLocation(newLocation);
    gridPos = (gridPos + 1) % 9;
    return;
}

// Move around last ping location to cover a big enough area
function moveAround(loc, offsetX, offsetY) {
    var new_latitude  = loc.coords.latitude  + (offsetY/1000 / R) * (180 / Math.PI);
    var new_longitude = loc.coords.longitude + (offsetX/1000 / R) * (180 / Math.PI) / Math.cos(loc.coords.latitude * Math.PI/180);
    return {type: 'coords', coords: {longitude: new_longitude, latitude: new_latitude, altitude:0}};
}

// Change location, notify client
function changeLocation(location) {
    // Wait before scanning
    account.SetLocation(location, function () { 
        setTimeout(parsePokemons, config.moveInterval);
    });
    io.emit('newLocation', location);
}

// Get wild pokemons and lure pokemons around
function parsePokemons() {
    account.Heartbeat(function(err, hb) {
        if (err){
            console.log(err);
            return;
        }
        if (!hb || !hb.cells || !hb.cells.length) {
            console.log("Uh oh, something's weird.");
            return;
        }
        hb.cells.forEach(function (cell) {
            cell.Fort.forEach(function (fort){
                if (fort.LureInfo) {
                    var expiration = new long(fort.LureInfo.LureExpiresTimestampMs.low, fort.LureInfo.LureExpiresTimestampMs.high, fort.LureInfo.LureExpiresTimestampMs.unsigned).toString();
                    io.emit('newPokemon', { 
                        longitude:fort.Longitude, 
                        latitude:fort.Latitude, 
                        expiration: expiration, 
                        pokemonid: fort.LureInfo.ActivePokemonId, 
                        id:fort.FortId.toString(),
                        isLure: true
                    });
                }
            });
            cell.WildPokemon.forEach(function (pokemon) {
                var ttl = Math.floor(pokemon.TimeTillHiddenMs/1000);
                if (ttl > 0) {
                    var encounterId = new long(pokemon.EncounterId.low, pokemon.EncounterId.high, pokemon.EncounterId.unsigned);
                        
                    var expiration = Date.now() + pokemon.TimeTillHiddenMs;
                    io.emit('newPokemon', { longitude:pokemon.Longitude, latitude:pokemon.Latitude, expiration:expiration, pokemonid: pokemon.pokemon.PokemonId, id:encounterId.toString()});
                }
            });
        });
    });
}