'use strict';

const long = require('long'),
    cassandra = require('cassandra-driver'),
    client = new cassandra.Client({ contactPoints: ['localhost'], keyspace: 'pokego'}),
    express = require('express'),
    app = express(),
    pokemongo = require('pokemon-go-node-api'),
    config = require('./config'),
    account = new pokemongo.Pokeio(),
    R = 6378.137; // Radius of earth in KM

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
    res.render('index');
});

app.get('/scan/:lat/:lng', function (req, res) {
    queueLocation.push({type: 'coords', coords:{latitude: +req.params.lat , longitude: +req.params.lng, altitude:0}});
    res.send({postion: queueLocation.length});
});

app.listen(config.app.port, function () {
  console.log('Example app listening on port 3000!');
});


account.init(username, password, location, provider, function(err) {
    if (err) throw err;
    setInterval(function () {
        moveNext();
        setTimeout(parsePokemons, 2000);
    }, 5000);
});


function moveNext() {
    if (queueLocation.length) {
        location = queueLocation.shift();
        console.log('Moving to ' + location.toString());
        account.SetLocation(location, function () {});
        gridPos = 0;
        return;
    }
    var step = 200;
    var offX = -step + (Math.floor(gridPos/3) * step); 
    var offY = -step + (gridPos % 3 * step); 
    var newLocation = moveAround(location, offX, offY);
    account.SetLocation(newLocation, function () {});
    gridPos = (gridPos + 1) % 9;
    return;
}

function parsePokemons() {
    account.Heartbeat(function(err, hb) {
        if (err) throw err;
        for (var i = hb.cells.length - 1; i >= 0; i--) {
                hb.cells[i].WildPokemon.forEach(function (pokemon) {
                    var ttl = Math.floor(pokemon.TimeTillHiddenMs/1000);
                    if (ttl > 0) {
                        var query = 'INSERT INTO pokemons (longitude, latitude, expiration, pokemonid, id) VALUES (?, ?, ?, ?, ?) USING ttl ?';
                        var encounterId = new long(pokemon.EncounterId.low, pokemon.EncounterId.high, pokemon.EncounterId.unsigned);
                            
                        var expiration = Date.now()/1000 + ttl;
                        var params = [pokemon.Longitude, pokemon.Latitude, expiration, pokemon.pokemon.PokemonId, encounterId.toString(), ttl];
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


function moveAround(loc, offsetX, offsetY) {
    var new_latitude  = loc.coords.latitude  + (offsetY/1000 / R) * (180 / Math.PI);
    var new_longitude = loc.coords.longitude + (offsetX/1000 / R) * (180 / Math.PI) / Math.cos(loc.coords.latitude * Math.PI/180);
    return {type: 'coords', coords: {longitude: new_longitude, latitude: new_latitude, altitude:0}};
}