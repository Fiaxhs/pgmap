const deg = 360 / (Math.PI * 2);
const R = 6378137; // Radius of earth in meters

function shift(coords, offsetX, offsetY) {
    return {
        latitude: coords.latitude  + (offsetY / R) * deg,
        longitude: coords.longitude + (offsetX / R) * deg / Math.cos(coords.latitude * deg),
    };
}

function floor(coords, delta) {
    const deltaAngle = (delta / R) * deg;
    return {
        latitude: Math.floor(coords.latitude / deltaAngle) * deltaAngle,
        longitude: Math.floor(coords.longitude / deltaAngle) * deltaAngle,
    };
}

module.exports = { shift, floor };
