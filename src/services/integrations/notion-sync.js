/**
 * 🔗 Integración Notion/Airtable
 * Sincronizar leads a base de datos externa
 */

const axios = require('axios');

/**
 * Sincronizar lead a Notion
 */
async function syncLeadToNotion(lead) {
  try {
    if (!process.env.NOTION_API_KEY || !process.env.NOTION_DATABASE_ID) {
      return { error: 'Notion no configurada' };
    }

    const response = await axios.post(
      `https://api.notion.com/v1/pages`,
      {
        parent: { database_id: process.env.NOTION_DATABASE_ID },
        properties: {
          'Nombre': {
            title: [{ text: { content: lead.customer_name } }],
          },
          'Teléfono': {
            phone_number: lead.customer_phone,
          },
          'Estado': {
            status: { name: lead.status },
          },
          'Score': {
            number: lead.lead_score || 0,
          },
          'Mensajes': {
            number: lead.messages_count || 0,
          },
          'Fecha Creación': {
            date: { start: lead.created_at },
          },
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
          'Notion-Version': '2022-06-28',
        },
      }
    );

    return {
      success: true,
      notionPageId: response.data.id,
      notionPageUrl: response.data.url,
    };
  } catch (err) {
    console.error('Error syncing to Notion:', err.message);
    return { error: err.message };
  }
}

/**
 * Sincronizar lead a Airtable
 */
async function syncLeadToAirtable(lead) {
  try {
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
      return { error: 'Airtable no configurada' };
    }

    const response = await axios.post(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Leads`,
      {
        records: [
          {
            fields: {
              'Nombre': lead.customer_name,
              'Teléfono': lead.customer_phone,
              'Estado': lead.status,
              'Score': lead.lead_score || 0,
              'Mensajes': lead.messages_count || 0,
              'Creado': new Date(lead.created_at).toISOString().split('T')[0],
              'Vendedor': lead.assigned_to || 'Sin asignar',
            },
          },
        ],
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      success: true,
      airtableRecordId: response.data.records[0].id,
      fields: response.data.records[0].fields,
    };
  } catch (err) {
    console.error('Error syncing to Airtable:', err.message);
    return { error: err.message };
  }
}

/**
 * Actualizar registro en Notion
 */
async function updateNotionPage(notionPageId, updates) {
  try {
    const response = await axios.patch(
      `https://api.notion.com/v1/pages/${notionPageId}`,
      { properties: updates },
      {
        headers: {
          'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
          'Notion-Version': '2022-06-28',
        },
      }
    );

    return {
      success: true,
      updated: response.data.last_edited_time,
    };
  } catch (err) {
    console.error('Error updating Notion page:', err.message);
    return { error: err.message };
  }
}

/**
 * Obtener leads desde Notion y sincronizar a nuestro CRM
 */
async function syncNotionToCRM() {
  try {
    if (!process.env.NOTION_API_KEY || !process.env.NOTION_DATABASE_ID) {
      return { error: 'Notion no configurada' };
    }

    const response = await axios.post(
      `https://api.notion.com/v1/databases/${process.env.NOTION_DATABASE_ID}/query`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
          'Notion-Version': '2022-06-28',
        },
      }
    );

    const leads = response.data.results.map(page => ({
      notionPageId: page.id,
      name: page.properties.Nombre?.title[0]?.text?.content || '',
      phone: page.properties.Teléfono?.phone_number || '',
      status: page.properties.Estado?.status?.name || '',
    }));

    return {
      success: true,
      totalLeads: leads.length,
      leads,
    };
  } catch (err) {
    console.error('Error syncing Notion to CRM:', err.message);
    return { error: err.message };
  }
}

module.exports = {
  syncLeadToNotion,
  syncLeadToAirtable,
  updateNotionPage,
  syncNotionToCRM,
};
