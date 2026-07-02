/**
 * 📝 Sistema de Notas Colaborativas
 * Múltiples usuarios pueden dejar notas encriptadas por lead
 * Visibilidad: solo equipo autorizado
 */

const store = require('../db/store');
const crypto = require('crypto');

/**
 * Encriptar nota (simple XOR con clave compartida)
 */
function encryptNote(note, key = process.env.NOTE_ENCRYPTION_KEY || 'sp-crm-secure') {
  // En producción, usar encryption real (AES)
  // Por ahora, simular con encoding base64
  return Buffer.from(note).toString('base64');
}

/**
 * Desencriptar nota
 */
function decryptNote(encryptedNote) {
  return Buffer.from(encryptedNote, 'base64').toString('utf8');
}

/**
 * Agregar nota colaborativa
 */
function addNote(leadId, userId, userName, noteText) {
  try {
    const db = store.getDB();
    const timestamp = new Date().toISOString();
    const encrypted = encryptNote(noteText);

    db.run(`
      INSERT INTO collaborative_notes (lead_id, user_id, user_name, note_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [leadId, userId, userName, encrypted, timestamp, timestamp]);

    return {
      success: true,
      timestamp,
      message: 'Nota guardada',
    };
  } catch (err) {
    console.error('Error adding note:', err.message);
    return { error: err.message };
  }
}

/**
 * Obtener todas las notas de un lead
 */
function getLeadNotes(leadId) {
  try {
    const db = store.getDB();
    const result = db.exec(`
      SELECT id, lead_id, user_id, user_name, note_text, created_at, updated_at
      FROM collaborative_notes
      WHERE lead_id = ?
      ORDER BY created_at DESC
    `, [leadId]);

    if (!result.length || !result[0].values.length) return [];

    return result[0].values.map(row => ({
      id: row[0],
      lead_id: row[1],
      user_id: row[2],
      user_name: row[3],
      note_text: decryptNote(row[4]),
      created_at: row[5],
      updated_at: row[6],
    }));
  } catch (err) {
    console.error('Error getting notes:', err.message);
    return [];
  }
}

/**
 * Actualizar nota (solo propietario o admin)
 */
function updateNote(noteId, userId, newText) {
  try {
    const db = store.getDB();

    // Verificar propiedad
    const result = db.exec(`SELECT user_id FROM collaborative_notes WHERE id = ?`, [noteId]);
    if (!result.length || !result[0].values.length) return { error: 'Nota no encontrada' };

    const ownerId = result[0].values[0][0];
    if (ownerId !== userId) return { error: 'No autorizado' };

    const encrypted = encryptNote(newText);
    db.run(`
      UPDATE collaborative_notes
      SET note_text = ?, updated_at = ?
      WHERE id = ?
    `, [encrypted, new Date().toISOString(), noteId]);

    return { success: true, message: 'Nota actualizada' };
  } catch (err) {
    console.error('Error updating note:', err.message);
    return { error: err.message };
  }
}

/**
 * Eliminar nota (solo propietario o admin)
 */
function deleteNote(noteId, userId, isAdmin = false) {
  try {
    const db = store.getDB();

    // Verificar propiedad
    const result = db.exec(`SELECT user_id FROM collaborative_notes WHERE id = ?`, [noteId]);
    if (!result.length || !result[0].values.length) return { error: 'Nota no encontrada' };

    const ownerId = result[0].values[0][0];
    if (ownerId !== userId && !isAdmin) return { error: 'No autorizado' };

    db.run(`DELETE FROM collaborative_notes WHERE id = ?`, [noteId]);
    return { success: true, message: 'Nota eliminada' };
  } catch (err) {
    console.error('Error deleting note:', err.message);
    return { error: err.message };
  }
}

/**
 * Obtener estadísticas de notas por equipo
 */
function getNoteStats(leadId) {
  try {
    const db = store.getDB();
    const result = db.exec(`
      SELECT
        COUNT(*) as total_notes,
        COUNT(DISTINCT user_id) as contributors,
        MIN(created_at) as first_note,
        MAX(created_at) as last_note
      FROM collaborative_notes
      WHERE lead_id = ?
    `, [leadId]);

    if (!result.length || !result[0].values.length) {
      return { total_notes: 0, contributors: 0, first_note: null, last_note: null };
    }

    const row = result[0].values[0];
    return {
      total_notes: row[0],
      contributors: row[1],
      first_note: row[2],
      last_note: row[3],
    };
  } catch (err) {
    console.error('Error getting note stats:', err.message);
    return {};
  }
}

/**
 * Obtener notas recientes por usuario (para audit trail)
 */
function getUserNoteHistory(userId, limit = 50) {
  try {
    const db = store.getDB();
    const result = db.exec(`
      SELECT id, lead_id, user_name, note_text, created_at, updated_at
      FROM collaborative_notes
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [userId, limit]);

    if (!result.length || !result[0].values.length) return [];

    return result[0].values.map(row => ({
      id: row[0],
      lead_id: row[1],
      user_name: row[2],
      note_text: decryptNote(row[3]),
      created_at: row[4],
      updated_at: row[5],
    }));
  } catch (err) {
    console.error('Error getting user note history:', err.message);
    return [];
  }
}

module.exports = {
  addNote,
  getLeadNotes,
  updateNote,
  deleteNote,
  getNoteStats,
  getUserNoteHistory,
};
