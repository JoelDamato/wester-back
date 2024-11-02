const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 30000;

app.use(cors());

// Configuración
const RATE_LIMIT_DELAY = 500; // 500ms entre peticiones
const BATCH_SIZE = 100; // Tamaño del lote para las actualizaciones

let isUpdateInProgress = false;

// Función para normalizar el número de teléfono
const normalizePhoneNumber = (phone) => {
  if (!phone) return '';
  
  // Normaliza eliminando caracteres no numéricos
  const normalized = phone.replace(/[^0-9]/g, '');
  
  // Si la longitud es menor de 10, ignora el número
  if (normalized.length < 10) {
    return ''; // Ignora números demasiado cortos
  }

  return normalized;
};

// Función para obtener todas las páginas de la base de datos de Notion
const getAllPages = async (databaseId, notionToken) => {
  let allPages = [];
  let hasMore = true;
  let startCursor = undefined;
  let requestCount = 0;

  while (hasMore) {
    try {
      if (requestCount > 0 && requestCount % 50 === 0) {
        console.log('Pausa preventiva para respetar límites de rate...');
        await new Promise(resolve => setTimeout(resolve, 15000)); // Aumentado a 15 segundos
      }

      const response = await axios.post(
        `https://api.notion.com/v1/databases/${databaseId}/query`,
        {
          page_size: 100,
          start_cursor: startCursor,
        },
        {
          headers: {
            Authorization: `Bearer ${notionToken}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
            Expires: '0',
          },
        }
      );

      const { results, has_more, next_cursor } = response.data;
      allPages = allPages.concat(results);
      hasMore = has_more;
      startCursor = next_cursor;
      requestCount++;

      console.log(`Recuperados ${allPages.length} registros hasta ahora...`);
      
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY)); // Aumentado a 500ms
    } catch (error) {
      if (error.response?.status === 429) {
        console.log('Límite de rate alcanzado, esperando 2 minutos...');
        await new Promise(resolve => setTimeout(resolve, 120000)); // Aumentado a 2 minutos
        continue;
      }
      console.error('Error al obtener página:', error.message);
      throw error;
    }
  }

  return allPages;
};

// Programar la próxima actualización
const scheduleNextUpdate = async () => {
  const delay = 60000; // 60 segundos de espera entre ciclos
  console.log(`\nProgramando próxima actualización en ${delay/1000} segundos...`);
  await new Promise(resolve => setTimeout(resolve, delay));
  updateNotionDatabase();
};

// Función para actualizar la base de datos de Notion
const updateNotionDatabase = async () => {
  if (isUpdateInProgress) {
    console.log('Ya hay una actualización en progreso. Saltando esta iteración.');
    return;
  }

  isUpdateInProgress = true;
  const startTime = new Date();

  try {
    const databaseId = 'e1c86c0d490c4ccdb7b3d92007dea981';
    const notionToken = 'secret_uCBoeC7cnlFtq7VG4Dr58nBYFLFbR6dKzF00fZt2dq';

    console.log(`\n=== Iniciando nuevo ciclo de actualización a las ${startTime.toLocaleString()} ===`);
    const pages = await getAllPages(databaseId, notionToken);
    console.log(`Total de registros recuperados: ${pages.length}`);

    const phoneCount = {}; // Conteo de números normalizados
    const phoneMapping = {}; // Almacena formatos únicos de cada número normalizado

    pages.forEach(page => {
      const originalPhone = page.properties['Filtro de telefono']?.formula?.string || '';
      
      // Normaliza y verifica el número
      const normalizedPhone = normalizePhoneNumber(originalPhone);
      if (!normalizedPhone) return; // Ignora números vacíos o no válidos

      // Aumenta el conteo solo si el número es válido
      phoneCount[normalizedPhone] = (phoneCount[normalizedPhone] || 0) + 1;

      // Agrega la versión del número en su formato original al mapeo
      if (!phoneMapping[normalizedPhone]) {
        phoneMapping[normalizedPhone] = new Set();
      }
      phoneMapping[normalizedPhone].add(originalPhone);
    });

    // Filtra solo aquellos números que son verdaderamente duplicados y tienen múltiples variantes
    const duplicatedPhones = Object.entries(phoneMapping)
      .filter(([phone, formats]) => formats.size > 1);

    if (duplicatedPhones.length > 0) {
      console.log("\nNúmeros duplicados encontrados:");
      duplicatedPhones.forEach(([normalizedPhone, formats]) => {
        console.log(`\nNúmero normalizado: ${normalizedPhone}`);
        
        [...formats].forEach((format, index) => {
          console.log(`Duplicado${index + 1}: ${format}`);
        });

        console.log(`Repeticiones: ${formats.size}`);
      });
    } else {
      console.log("No se encontraron números duplicados.");
    }

    console.log('\nIniciando actualización de registros...');
    let updatedCount = 0;
    let batchCount = 0;

    for (const page of pages) {
      const originalPhone = page.properties['Filtro de telefono']?.formula?.string || '';
      
      if (!originalPhone || originalPhone.length < 10) { // Ignora los números vacíos o menores a 10 caracteres
        continue;
      }

      const normalizedPhone = normalizePhoneNumber(originalPhone);

      if (phoneMapping[normalizedPhone]?.size > 1) { 
        // Confirma que existen al menos 2 variantes (duplicados) antes de actualizar
        const newLabel = `Duplicado (${phoneMapping[normalizedPhone].size})`;

        console.log(`Actualizando duplicado: ${originalPhone} (Normalizado: ${normalizedPhone})`);
        console.log(`Otras variantes del duplicado: ${[...phoneMapping[normalizedPhone]].join(', ')}`);

        try {
          await axios.patch(
            `https://api.notion.com/v1/pages/${page.id}`,
            {
              properties: {
                'Duplicado': {
                  select: {
                    name: newLabel,
                  },
                },
              },
            },
            {
              headers: {
                Authorization: `Bearer ${notionToken}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28',
              },
            }
          );

          updatedCount++;
          batchCount++;

          if (updatedCount % 10 === 0) {
            console.log(`Actualizados ${updatedCount} registros...`);
          }

          if (batchCount >= BATCH_SIZE) {
            console.log('Pausa entre lotes de actualizaciones...');
            await new Promise(resolve => setTimeout(resolve, 15000));
            batchCount = 0;
          } else {
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
          }

        } catch (error) {
          if (error.response?.status === 429) {
            console.log('Límite de rate alcanzado, esperando 2 minutos...');
            await new Promise(resolve => setTimeout(resolve, 120000));
            continue;
          }
          console.error(`Error al actualizar página ${page.id}:`, error.message);
        }
      }
    }

    const endTime = new Date();
    const duration = (endTime - startTime) / 1000 / 60;

    console.log(`\n=== Ciclo de actualización completado ===`);
    console.log(`Hora de finalización: ${endTime.toLocaleString()}`);
    console.log(`Duración total: ${duration.toFixed(2)} minutos`);
    console.log(`Total de registros en la base de datos: ${pages.length}`);
    console.log(`Total de números procesados: ${Object.keys(phoneCount).length}`);
    console.log(`Total de registros actualizados: ${updatedCount}`);

  } catch (error) {
    console.error('Error al actualizar la base de datos de Notion:', error.message);
  } finally {
    isUpdateInProgress = false;
    scheduleNextUpdate();
  }
};

// Endpoint para iniciar la actualización manualmente
app.get('/notion', async (req, res) => {
  try {
    if (isUpdateInProgress) {
      return res.status(429).json({ 
        message: 'Ya hay una actualización en progreso. Por favor, intente más tarde.' 
      });
    }
    await updateNotionDatabase();
    res.status(200).json({ message: 'Actualización manual iniciada con éxito.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
  // Iniciar el primer ciclo de actualización
  updateNotionDatabase();
});
