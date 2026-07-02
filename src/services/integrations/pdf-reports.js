/**
 * 📄 Integración PDF Reports
 * Generar propuestas y reportes en PDF
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generar propuesta PDF para un lead
 */
async function generateLeadProposal(lead, lotDetails) {
  try {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
    });

    const filename = `propuesta_${lead.id}_${Date.now()}.pdf`;
    const filepath = path.join(process.env.UPLOADS_DIR || './uploads', filename);

    // Asegurar que el directorio exista
    if (!fs.existsSync(path.dirname(filepath))) {
      fs.mkdirSync(path.dirname(filepath), { recursive: true });
    }

    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    // Encabezado
    doc.fontSize(24).font('Helvetica-Bold').text('SP LEONS GROUP', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text('Propuesta de Inversión Inmobiliaria', { align: 'center' });
    doc.moveDown(1);

    // Datos del cliente
    doc.fontSize(14).font('Helvetica-Bold').text('Datos del Cliente');
    doc.fontSize(10).font('Helvetica');
    doc.text(`Nombre: ${lead.customer_name}`);
    doc.text(`Teléfono: ${lead.customer_phone}`);
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-CO')}`);
    doc.moveDown(1);

    // Detalles del lote
    doc.fontSize(14).font('Helvetica-Bold').text('Detalles del Lote');
    doc.fontSize(10).font('Helvetica');
    doc.text(`Ubicación: ${lotDetails.location}`);
    doc.text(`Área: ${lotDetails.area} m²`);
    doc.text(`Precio: $${lotDetails.price.toLocaleString('es-CO')}`);
    doc.text(`Descripción: ${lotDetails.description}`);
    doc.moveDown(1);

    // Condiciones de pago
    if (lotDetails.paymentTerms) {
      doc.fontSize(14).font('Helvetica-Bold').text('Condiciones de Pago');
      doc.fontSize(10).font('Helvetica');
      doc.text(lotDetails.paymentTerms);
      doc.moveDown(1);
    }

    // Pie de página
    doc.fontSize(9).font('Helvetica').text('Este documento es una propuesta preliminar', { align: 'center' });
    doc.text('SP Leons Group - info@spleongroup.com', { align: 'center' });

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        resolve({
          success: true,
          filename,
          filepath,
          url: `${process.env.APP_URL}/uploads/${filename}`,
        });
      });
      stream.on('error', reject);
    });
  } catch (err) {
    console.error('Error generating PDF:', err.message);
    return { error: err.message };
  }
}

/**
 * Generar reporte de vendedor
 */
async function generateVendorReport(vendorId, startDate, endDate) {
  try {
    const store = require('../../db/store');
    const db = store.getDB();

    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
    });

    const filename = `reporte_vendedor_${vendorId}_${Date.now()}.pdf`;
    const filepath = path.join(process.env.UPLOADS_DIR || './uploads', filename);

    if (!fs.existsSync(path.dirname(filepath))) {
      fs.mkdirSync(path.dirname(filepath), { recursive: true });
    }

    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    // Encabezado
    doc.fontSize(24).font('Helvetica-Bold').text('SP LEONS GROUP', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text('Reporte de Vendedor', { align: 'center' });
    doc.moveDown(1);

    // Datos del vendedor
    const vendorResult = db.exec(
      'SELECT nombre, telefono FROM usuarios WHERE id = ?',
      [vendorId]
    );

    if (vendorResult.length && vendorResult[0].values.length) {
      const [nombre, telefono] = vendorResult[0].values[0];
      doc.fontSize(12).font('Helvetica-Bold').text(`Vendedor: ${nombre}`);
      doc.fontSize(10).font('Helvetica').text(`Período: ${startDate} a ${endDate}`);
    }

    doc.moveDown(1);

    // Estadísticas
    const statsResult = db.exec(`
      SELECT
        COUNT(*) as total_leads,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as cerrados,
        AVG(lead_score) as score_promedio
      FROM leads
      WHERE assigned_to = ? AND created_at BETWEEN ? AND ?
    `, [vendorId, startDate, endDate]);

    if (statsResult.length && statsResult[0].values.length) {
      const [totalLeads, cerrados, scorePromedio] = statsResult[0].values[0];
      doc.fontSize(11).font('Helvetica-Bold').text('Estadísticas');
      doc.fontSize(10).font('Helvetica');
      doc.text(`Total de leads: ${totalLeads}`);
      doc.text(`Leads cerrados: ${cerrados || 0}`);
      doc.text(`Score promedio: ${(scorePromedio || 0).toFixed(2)}`);
    }

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        resolve({
          success: true,
          filename,
          filepath,
          url: `${process.env.APP_URL}/uploads/${filename}`,
        });
      });
      stream.on('error', reject);
    });
  } catch (err) {
    console.error('Error generating vendor report:', err.message);
    return { error: err.message };
  }
}

module.exports = {
  generateLeadProposal,
  generateVendorReport,
};
