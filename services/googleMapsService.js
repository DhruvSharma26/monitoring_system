const apiKey = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Geocodes an address string to latitude and longitude coordinates.
 * @param {string} address
 * @returns {Promise<{lat: number, lng: number, formattedAddress: string}|null>}
 */
const geocodeAddress = async (address) => {
    if (!address || !apiKey) return null;

    try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === "OK" && data.results && data.results.length > 0) {
            const location = data.results[0].geometry.location;
            return {
                lat: location.lat,
                lng: location.lng,
                formattedAddress: data.results[0].formatted_address
            };
        }
        console.warn("Geocoding failed with status:", data.status);
        return null;
    } catch (error) {
        console.error("Error in geocodeAddress:", error);
        return null;
    }
};

/**
 * Reverse geocodes coordinates to a human-readable address string.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<string|null>}
 */
const reverseGeocode = async (lat, lng) => {
    if (lat == null || lng == null || !apiKey) return null;

    try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === "OK" && data.results && data.results.length > 0) {
            return data.results[0].formatted_address;
        }
        return null;
    } catch (error) {
        console.error("Error in reverseGeocode:", error);
        return null;
    }
};

/**
 * Gets distance matrix between origin and destination coordinates/addresses.
 * @param {string} origin - "lat,lng" or address
 * @param {string} destination - "lat,lng" or address
 * @returns {Promise<{distance: string, duration: string}|null>}
 */
const getDistanceMatrix = async (origin, destination) => {
    if (!origin || !destination || !apiKey) return null;

    try {
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === "OK" && data.rows?.[0]?.elements?.[0]?.status === "OK") {
            const element = data.rows[0].elements[0];
            return {
                distance: element.distance.text,
                duration: element.duration.text
            };
        }
        return null;
    } catch (error) {
        console.error("Error in getDistanceMatrix:", error);
        return null;
    }
};

module.exports = {
    geocodeAddress,
    reverseGeocode,
    getDistanceMatrix
};
