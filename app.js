'use strict';

const long = require('long'),
    config = require('./config'),
    R = 6378.137, // Radius of earth in KM
    
    express = require('express'),
    app = express(),
    server = app.listen(config.app.port, function () {
      console.log('Example app listening on port 3000!');
    }),
    io = require('socket.io').listen(server),

    cassandra = require('cassandra-driver'),
    client = new cassandra.Client({ contactPoints: ['localhost'], keyspace: 'pokego'}),
    
    pokemongo = require('pokemon-go-node-api'),
    account = new pokemongo.Pokeio();


// Socket for scanner position
io.on('connection', function(socket){
  console.log('a user connected');
});

function changeLocation(location) {
    account.SetLocation(location, parsePokemons);
    io.emit('newLocation', location);
}

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

app.get('/pokemons', function (req, res) {
    client.execute('SELECT * FROM pokemons', function (err, result){
        res.send(result.rows);
    });
});

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/views/index.html');
});

app.get('/scan/:lat/:lng', function (req, res) {
    queueLocation.push({type: 'coords', coords:{latitude: +req.params.lat , longitude: +req.params.lng, altitude:0}});
    res.send({postion: queueLocation.length});
});




// Scraping api
account.init(username, password, location, provider, function(err) {
    if (err){
        console.log(err);
    }
    setInterval(function () {
        moveNext();
    }, 2000);
});

// Find next move, either a ping from the user or around current ping.
function moveNext() {
    if (queueLocation.length) {
        location = queueLocation.shift();
        console.log('Moving to ' + location.toString());
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

// Get wild pokemons and save to db
function parsePokemons() {
    account.Heartbeat(function(err, hb) {
        if (err){
            console.log(err);
        }
        for (var i = hb.cells.length - 1; i >= 0; i--) {
                hb.cells[i].WildPokemon.forEach(function (pokemon) {
                    var ttl = Math.floor(pokemon.TimeTillHiddenMs/1000);
                    if (ttl > 0) {
                        var query = 'INSERT INTO pokemons (longitude, latitude, expiration, pokemonid, id) VALUES (?, ?, ?, ?, ?) USING ttl ?';
                        var encounterId = new long(pokemon.EncounterId.low, pokemon.EncounterId.high, pokemon.EncounterId.unsigned);
                            
                        var expiration = Date.now() + pokemon.TimeTillHiddenMs;
                        var params = [pokemon.Longitude, pokemon.Latitude, expiration, pokemon.pokemon.PokemonId, encounterId.toString(), ttl];
                        io.emit('newPokemon', { longitude:pokemon.Longitude, latitude:pokemon.Latitude, expiration:expiration, pokemonid: pokemon.pokemon.PokemonId, id:encounterId.toString()});
                        client.execute(query, params, { prepare: true }, function(err) {
                            if (err) {
                                console.log(err);
                            } else {
                                console.log('Row inserted on the cluster');
                            }
                        });
                    }
                });
        }

    });
}

