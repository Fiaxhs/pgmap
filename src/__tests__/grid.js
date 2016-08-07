const test = require('ava');
const Grid = require('../grid');

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

test('Grid is a function', (t) => {
    t.is(typeof Grid, 'function');
});


test('add a coordinate', (t) => {
    const g = new Grid(10);
    g.add({ latitude: 0, longitude: 0, data: 1 });
    g.add({ latitude: 0.000002, longitude: 0, data: 2 });
    g.add({ latitude: 1, longitude: 0, data: 3 });

    t.deepEqual(Array.from(g.entries()), [
        [
            { latitude: 0, longitude: 0 },
            [
                { latitude: 0, longitude: 0, data: 1 },
                { latitude: 0.000002, longitude: 0, data: 2 },
            ],
        ],
        [
            { latitude: 0.9999147427534394, longitude: 0 },
            [
                { latitude: 1, longitude: 0, data: 3 },
            ],
        ],
    ]);
});

test('expiring coordinates', (t) => {
    const g = new Grid(10);

    const pastCoordinates = {
        latitude: 0,
        longitude: 0,
        data: 1,
        expiration: Date.now() - 1000
    };

    const futureCoordinates = {
        latitude: 0,
        longitude: 0,
        data: 2,
        expiration: Date.now() + 1000
    };

    g.add(pastCoordinates);
    g.add(futureCoordinates);

    t.deepEqual(Array.from(g.entries()), [
        [
            { latitude: 0, longitude: 0 },
            [
                futureCoordinates,
            ],
        ],
    ]);
});

test('garbage collected coordinates', (t) => {
    const g = new Grid(10);
    g._garbageCollectorDelay = 10;

    const pastCoordinates = {
        latitude: 0,
        longitude: 0,
        data: 1,
        expiration: Date.now() - 1000
    };

    g.add(pastCoordinates);

    t.deepEqual(Array.from(g._map.values()), [ [ pastCoordinates ] ]);


    return sleep(100)
        .then(() => {
            t.deepEqual(Array.from(g._map.values()), [ ]);
        });
});
