/**
 * 🤖 Sistema de Automatización por Patrones
 * Detectar tipo de pregunta y sugerir respuesta automática
 */

const openai = require('openai');
const client = new openai.OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Plantillas de respuesta por tipo de pregunta
 */
const RESPONSE_TEMPLATES = {
  precio: {
    keywords: ['precio', 'costo', 'valor', 'cuánto cuesta', 'tarifa'],
    template: 'Gracias por tu interés. Los precios varían según la ubicación y características del lote. ¿Cuál es tu presupuesto aproximado?',
  },
  ubicacion: {
    keywords: ['dónde', 'ubicación', 'zona', 'dirección', 'cerca de'],
    template: 'Tenemos lotes en excelentes ubicaciones a nivel nacional. ¿En qué región te interesa?',
  },
  disponibilidad: {
    keywords: ['disponible', 'cuándo', 'en stock', 'hay', 'qué tienen'],
    template: 'Tenemos varias opciones disponibles. Te envío fotos y más información. ¿Cuáles son tus preferencias?',
  },
  documentacion: {
    keywords: ['papeles', 'documentos', 'escritura', 'registro', 'legal'],
    template: 'Todos nuestros lotes cuentan con documentación completa y en regla. Podemos enviarte los detalles.',
  },
  credito: {
    keywords: ['crédito', 'financiamiento', 'cuotas', 'plazo', 'hipoteca'],
    template: 'Trabajamos con varios bancos para facilitar el financiamiento. ¿Necesitas información sobre opciones de crédito?',
  },
  agendarcita: {
    keywords: ['visita', 'ver', 'conocer', 'ir', 'cita'],
    template: '¡Perfecto! Podemos agendar una visita. ¿Qué día te vendría mejor?',
  },
};

/**
 * Detectar tipo de pregunta usando pattern matching + IA
 */
async function detectQuestionType(messageText) {
  try {
    // 1. Primero intentar pattern matching
    const lowerText = messageText.toLowerCase();

    for (const [type, { keywords }] of Object.entries(RESPONSE_TEMPLATES)) {
      if (keywords.some(k => lowerText.includes(k))) {
        return {
          type,
          confidence: 0.9,
          method: 'pattern_matching',
        };
      }
    }

    // 2. Si no coincide patrón, usar IA para clasificación
    if (process.env.OPENAI_API_KEY) {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Eres un asistente de clasificación de mensajes inmobiliarios.
Clasifica el mensaje en uno de estos tipos: precio, ubicacion, disponibilidad, documentacion, credito, agendarcita, otro.
Responde solo con el tipo, sin explicaciones.`,
          },
          {
            role: 'user',
            content: messageText,
          },
        ],
        temperature: 0.3,
        max_tokens: 20,
      });

      const type = response.choices[0].message.content.trim().toLowerCase();
      return {
        type,
        confidence: 0.7,
        method: 'ai_classification',
      };
    }

    return {
      type: 'otro',
      confidence: 0,
      method: 'unknown',
    };
  } catch (err) {
    console.error('Error detecting question type:', err.message);
    return { type: 'otro', confidence: 0, error: err.message };
  }
}

/**
 * Obtener respuesta sugerida para tipo de pregunta
 */
function getSuggestedResponse(questionType) {
  const template = RESPONSE_TEMPLATES[questionType];
  if (!template) return null;

  return {
    type: questionType,
    suggestion: template.template,
    confidence: 0.85,
    quickReply: true,
  };
}

/**
 * Generar respuesta personalizada con IA
 */
async function generatePersonalizedResponse(messageText, leadInfo) {
  try {
    if (!process.env.OPENAI_API_KEY) return null;

    const prompt = `Eres un vendedor profesional de bienes raíces en Colombia.
Genera una respuesta profesional, amable y breve (máximo 2 líneas) al siguiente mensaje de cliente.

Cliente: ${leadInfo?.nombre || 'Cliente'}
Mensaje: ${messageText}

Responde de forma natural y enfocada en ayudar.`;

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 100,
    });

    return {
      response: response.choices[0].message.content,
      generated: true,
      model: 'gpt-4o-mini',
    };
  } catch (err) {
    console.error('Error generating response:', err.message);
    return null;
  }
}

/**
 * Sugerir siguiente acción después de respuesta
 */
function suggestNextAction(messageText, questionType) {
  const actions = {
    precio: 'Enviar catálogo de precios',
    ubicacion: 'Compartir mapa interactivo',
    disponibilidad: 'Enviar fotos del lote',
    documentacion: 'Enviar copia de escritura',
    credito: 'Conectar con asesor de crédito',
    agendarcita: 'Agendar visita en calendario',
    otro: 'Derivar a especialista',
  };

  return actions[questionType] || 'Seguimiento manual';
}

/**
 * Sistema de aprendizaje: registrar respuesta efectiva
 */
function registerEffectiveResponse(messageType, responseText, wasEffective) {
  try {
    // Guardar en logs para análisis posterior
    console.log({
      timestamp: new Date().toISOString(),
      messageType,
      responseText,
      wasEffective,
      event: 'automation_feedback',
    });
    return true;
  } catch (err) {
    console.error('Error registering feedback:', err.message);
    return false;
  }
}

module.exports = {
  detectQuestionType,
  getSuggestedResponse,
  generatePersonalizedResponse,
  suggestNextAction,
  registerEffectiveResponse,
  RESPONSE_TEMPLATES,
};
