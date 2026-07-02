/**
 * 📅 Integración Google Calendar
 * Agendar citas desde el CRM, sincronización bidireccional
 */

const { google } = require('googleapis');

/**
 * Inicializar cliente de Google Calendar
 */
function initGoogleCalendar() {
  if (!process.env.GOOGLE_CALENDAR_API_KEY || !process.env.GOOGLE_CLIENT_ID) {
    console.warn('Google Calendar API no configurada');
    return null;
  }

  return google.calendar({
    version: 'v3',
    auth: process.env.GOOGLE_CALENDAR_API_KEY,
  });
}

/**
 * Crear evento en Google Calendar
 * @param {Object} cita - { fecha, hora, cliente, vendedor, lote, descripcion }
 */
async function createCalendarEvent(cita) {
  try {
    const calendar = initGoogleCalendar();
    if (!calendar) return { error: 'Google Calendar no configurada' };

    const startTime = new Date(`${cita.fecha}T${cita.hora}:00`);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hora

    const event = {
      summary: `Cita: ${cita.cliente} - ${cita.lote}`,
      description: `
Vendedor: ${cita.vendedor}
Cliente: ${cita.cliente}
Teléfono: ${cita.clientePhone}
Lote: ${cita.lote}
Ubicación: ${cita.ubicacion}

${cita.descripcion}
      `,
      start: { dateTime: startTime.toISOString() },
      end: { dateTime: endTime.toISOString() },
      location: cita.ubicacion,
      attendees: [
        { email: cita.vendedorEmail, displayName: cita.vendedor },
        { email: cita.clienteEmail, displayName: cita.cliente },
      ],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 día antes
          { method: 'popup', minutes: 30 }, // 30 min antes
        ],
      },
    };

    const res = await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      resource: event,
      sendUpdates: 'all',
    });

    return {
      success: true,
      eventId: res.data.id,
      htmlLink: res.data.htmlLink,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('Error creating calendar event:', err.message);
    return { error: err.message };
  }
}

/**
 * Obtener disponibilidad de vendedor
 */
async function getVendorAvailability(vendorEmail, startDate, endDate) {
  try {
    const calendar = initGoogleCalendar();
    if (!calendar) return { error: 'Google Calendar no configurada' };

    const res = await calendar.events.list({
      calendarId: vendorEmail,
      timeMin: new Date(startDate).toISOString(),
      timeMax: new Date(endDate).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const busySlots = res.data.items.map(event => ({
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
      title: event.summary,
    }));

    return {
      vendorEmail,
      busySlots,
      availableDates: generateAvailableSlots(startDate, endDate, busySlots),
    };
  } catch (err) {
    console.error('Error getting vendor availability:', err.message);
    return { error: err.message };
  }
}

/**
 * Generar slots disponibles (working hours: 8am-6pm, lunes-viernes)
 */
function generateAvailableSlots(startDate, endDate, busySlots) {
  const available = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current < end) {
    // Solo días laborales (lunes-viernes)
    if (current.getDay() !== 0 && current.getDay() !== 6) {
      // Generar slots cada 1 hora de 8am a 6pm
      for (let hour = 8; hour < 18; hour++) {
        const slotStart = new Date(current);
        slotStart.setHours(hour, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

        // Verificar que no esté en busySlots
        const isBusy = busySlots.some(busy =>
          new Date(busy.start) < slotEnd && new Date(busy.end) > slotStart
        );

        if (!isBusy) {
          available.push({
            date: current.toISOString().split('T')[0],
            time: `${hour}:00`,
            isoStart: slotStart.toISOString(),
          });
        }
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return available;
}

/**
 * Actualizar evento existente
 */
async function updateCalendarEvent(eventId, updates) {
  try {
    const calendar = initGoogleCalendar();
    if (!calendar) return { error: 'Google Calendar no configurada' };

    const res = await calendar.events.update({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      eventId,
      resource: updates,
      sendUpdates: 'all',
    });

    return {
      success: true,
      eventId: res.data.id,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('Error updating calendar event:', err.message);
    return { error: err.message };
  }
}

module.exports = {
  createCalendarEvent,
  getVendorAvailability,
  updateCalendarEvent,
};
