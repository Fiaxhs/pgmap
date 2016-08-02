CREATE keyspace "pokego" WITH REPLICATION = {'class' : 'SimpleStrategy', 'replication_factor': 1};
USE pokego;
CREATE table pokemons ("longitude" float, "latitude" float, "expiration" int, "pokemonid" int, "id" bigint, PRIMARY KEY ("id"));