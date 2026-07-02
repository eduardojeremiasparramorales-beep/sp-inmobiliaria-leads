/**
 * 🗺️ Integración Google Maps
 * Mostrar ubicación de lotes en mapa interactivo
 */

const axios = require('axios');

/**
 * Geocodificar dirección a coordenadas
 */
async function geocodeAddress(address) {
  try {
    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return { error: 'Google Maps API no configurada' };
    }

    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        address,
        key: process.env.GOOGLE_MAPS_API_KEY,
        region: 'CO', // Colombia
      },
    });

    if (response.data.results.length === 0) {
      return { error: 'Dirección no encontrada' };
    }

    const location = response.data.results[0];
    return {
      address: location.formatted_address,
      latitude: location.geometry.location.lat,
      longitude: location.geometry.location.lng,
      placeId: location.place_id,
      addressComponents: location.address_components,
    };
  } catch (err) {
    console.error('Error geocoding address:', err.message);
    return { error: err.message };
  }
}

/**
 * Obtener detalles de un lugar
 */
async function getPlaceDetails(placeId) {
  try {
    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return { error: 'Google Maps API no configurada' };
    }

    const response = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: {
        place_id: placeId,
        fields: 'name,geometry,formatted_address,photos,rating,reviews,url',
        key: process.env.GOOGLE_MAPS_API_KEY,
      },
    });

    const place = response.data.result;
    return {
      name: place.name,
      address: place.formatted_address,
      latitude: place.geometry.location.lat,
      longitude: place.geometry.location.lng,
      rating: place.rating,
      reviews: place.reviews?.slice(0, 3) || [],
      googleMapsUrl: place.url,
      photos: place.photos?.slice(0, 5).map(p => p.photo_reference) || [],
    };
  } catch (err) {
    console.error('Error getting place details:', err.message);
    return { error: err.message };
  }
}

/**
 * Calcular distancia entre dos puntos
 */
async function getDistance(origin, destination) {
  try {
    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return { error: 'Google Maps API no configurada' };
    }

    const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
      params: {
        origins: origin,
        destinations: destination,
        key: process.env.GOOGLE_MAPS_API_KEY,
        units: 'metric',
      },
    });

    const element = response.data.rows[0].elements[0];
    if (element.status !== 'OK') {
      return { error: 'No se puede calcular distancia' };
    }

    return {
      distance: element.distance.text,
      distanceMeters: element.distance.value,
      duration: element.duration.text,
      durationSeconds: element.duration.value,
    };
  } catch (err) {
    console.error('Error calculating distance:', err.message);
    return { error: err.message };
  }
}

/**
 * Generar embed de mapa para mostrar en el CRM
 */
function generateMapEmbed(latitude, longitude, zoom = 15) {
  return {
    embedUrl: `https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3976.5421234567!2d${longitude}!3d${latitude}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8d27c4e4c4c4c4c1%3A0x1234567890!2sSP%20Lotes!5e0!3m2!1ses!2sco!4v1234567890`,
    staticMapUrl: `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=${zoom}&size=600x400&key=${process.env.GOOGLE_MAPS_API_KEY}`,
    latitude,
    longitude,
  };
}

module.exports = {
  geocodeAddress,
  getPlaceDetails,
  getDistance,
  generateMapEmbed,
};
