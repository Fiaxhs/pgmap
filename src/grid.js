const it = require('iterator-tools');
const coordinates = require('./coordinates');

function computeKey(coordinates) {
    return `${coordinates.latitude.toFixed(10)},${coordinates.longitude.toFixed(10)}`;
}

function isAlive(object) {
    return object.expiration === undefined || object.expiration > Date.now();
}

module.exports = class Grid {
    constructor(delta) {
        if (typeof delta !== 'number' || delta <= 0) throw new Error('Invalid delta');
        this._delta = delta;
        this._map = new Map();
        this._collectorInterval = null;
        this._garbageCollectorDelay = 60000;
    }

    _key(object) {
        return computeKey(coordinates.floor(object, this._delta));
    }

    _stopGC() {
        clearInterval(this._collectorInterval);
        this._collectorInterval = null;
    }

    _startGC() {
        if (this._collectorInterval === null) {
            this._collectorInterval = setInterval(() => this._gc(), this._garbageCollectorDelay);
        }
    }

    _gc() {
        let aliveObjectCount = 0;

        for (const [key, list] of this._map) {
            const filteredList = list.filter(isAlive);
            if (filteredList.length) this._map.set(key, filteredList);
            else this._map.delete(key);
            aliveObjectCount += filteredList.length;
        }

        if (aliveObjectCount === 0) this._stopGC();
    }

    add(object) {
        if (typeof object.longitude !== 'number' || typeof object.latitude !== 'number') {
            throw new Error('Invalid object');
        }
        const key = this._key(object);
        let list = this._map.get(key);
        if (!list) this._map.set(key, list = []);
        list.push(object);
        this._startGC();
    }

    entries() {
        return it.map(
            this._map.values(),
            (list) => [ coordinates.floor(list[0], this._delta), list.filter(isAlive) ]
        );
    }

    values() {
        return it.map(this.entries(), (entry) => entry[1]);
    }
};
