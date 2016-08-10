const long = require('long');
const it = require('iterator-tools');

module.exports = function crawl(account, location) {
    return setLocation(account, location)
    .then(() => parsePokemons(account));
};

function longToString(int) {
    return new long(int.low, int.high, int.unsigned).toString();
}

function setLocation(account, coords) {
    return new Promise((resolve, reject) => {
        account.SetLocation({ type: 'coords', coords }, function (error, coordinates) {
            if (error) return reject(error);
            resolve(coordinates);
        });
    });
}

// Get wild pokemons and lure pokemons around
function parsePokemons(account) {
    return new Promise((resolve, reject) => {
        account.Heartbeat(function(error, hb) {
            if (error) return reject(error);

            if (!hb || !hb.cells || !hb.cells.length) {
                return reject(new Error('Unexpected heartbeat response'));
            }

            const newPokemons = it.chainFromIterable(it.map(
                hb.cells,
                (cell) => {
                    return it.chain(
                        it.map(
                            it.filter(cell.Fort, (fort) => fort.LureInfo),
                            (fort) => {
                                return {
                                    longitude: fort.Longitude,
                                    latitude: fort.Latitude,
                                    expiration: longToString(fort.LureInfo.LureExpiresTimestampMs),
                                    pokemonid: fort.LureInfo.ActivePokemonId,
                                    id: fort.FortId.toString(),
                                    isLure: true
                                };
                            }
                        ),
                        it.map(
                            it.filter(cell.WildPokemon, (p) => Math.floor(p.TimeTillHiddenMs / 1000) > 0),
                            (pokemon) => {
                                return {
                                    longitude: pokemon.Longitude,
                                    latitude: pokemon.Latitude,
                                    expiration: Date.now() + pokemon.TimeTillHiddenMs,
                                    pokemonid: pokemon.pokemon.PokemonId,
                                    id: longToString(pokemon.EncounterId)
                                };
                            }
                        )
                    );
                }
            ));

            resolve(newPokemons);
        });
    });
}
