const getApiKey = () => process.env.GOOGLE_MAPS_API_KEY;

/**
 * Geocodes an address string to latitude and longitude coordinates.
 * Supports Google Maps API with automatic fallback to OpenStreetMap Nominatim.
 * @param {string} address
 * @returns {Promise<{lat: number, lng: number, formattedAddress: string}|null>}
 */
const geocodeAddress = async (address) => {
    if (!address || !address.trim()) return null;
    const apiKey = getApiKey();

    if (apiKey) {
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
            console.warn("Google Maps Geocoding status:", data.status);
        } catch (error) {
            console.error("Error in Google Maps geocodeAddress:", error);
        }
    }

    // Fallback: OpenStreetMap Nominatim API
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'SinexusMonitoringApp/1.0' }
        });
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
                formattedAddress: data[0].display_name
            };
        }
    } catch (error) {
        console.error("Error in Nominatim fallback geocodeAddress:", error);
    }

    return null;
};

/**
 * Reverse geocodes coordinates to a human-readable address string.
 * Supports Google Maps API with automatic fallback to OpenStreetMap Nominatim.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<string|null>}
 */
const reverseGeocode = async (lat, lng) => {
    if (lat == null || lng == null) return null;
    const apiKey = getApiKey();

    if (apiKey) {
        try {
            const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.status === "OK" && data.results && data.results.length > 0) {
                return data.results[0].formatted_address;
            }
            console.warn("Google Maps Reverse Geocoding status:", data.status);
        } catch (error) {
            console.error("Error in Google Maps reverseGeocode:", error);
        }
    }

    // Fallback: OpenStreetMap Nominatim API
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'SinexusMonitoringApp/1.0' }
        });
        const data = await response.json();
        if (data && data.display_name) {
            return data.display_name;
        }
    } catch (error) {
        console.error("Error in Nominatim fallback reverseGeocode:", error);
    }

    return null;
};

/**
 * Gets distance matrix between origin and destination coordinates/addresses.
 * @param {string} origin - "lat,lng" or address
 * @param {string} destination - "lat,lng" or address
 * @returns {Promise<{distance: string, duration: string}|null>}
 */
const getDistanceMatrix = async (origin, destination) => {
    const apiKey = getApiKey();
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

/**
 * Places Autocomplete (New)
 */
const autocompletePlaces = async (input, sessionToken, lat, lng) => {
    const apiKey = getApiKey();
    if (!input || !apiKey) return [];

    try {
        const body = {
            input: input.trim(),
            sessionToken: sessionToken || undefined
        };
        if (lat != null && lng != null) {
            body.locationBias = {
                circle: {
                    center: { latitude: Number(lat), longitude: Number(lng) },
                    radius: 50000.0
                }
            };
        }

        const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey
            },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        return data.suggestions || [];
    } catch (error) {
        console.error("Error in autocompletePlaces:", error);
        return [];
    }
};

/**
 * Place Details (New)
 */
const getPlaceDetails = async (placeId, sessionToken) => {
    const apiKey = getApiKey();
    if (!placeId || !apiKey) return null;

    try {
        const url = `https://places.googleapis.com/v1/places/${placeId}${sessionToken ? `?sessionToken=${sessionToken}` : ''}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,primaryType,types'
            }
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Error in getPlaceDetails:", error);
        return null;
    }
};

module.exports = {
    geocodeAddress,
    reverseGeocode,
    getDistanceMatrix,
    autocompletePlaces,
    getPlaceDetails
};
