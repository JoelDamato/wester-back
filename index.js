const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

const updateNotionDatabase = async () => {
  try {
    const databaseId = 'e1c86c0d490c4ccdb7b3d92007dea981';
    const notionToken = 'secret_uCBoeC7cnlFtq7VG4Dr58nBYFLFbR6dKzF00fZt2dq';

    const response = await axios.post(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {},
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

    const pages = response.data.results;
    const phoneCount = {};
    let processedNumbers = 0; // Contador de números procesados

    // Contar cuántas veces aparece cada número en "Filtro de telefono"
    pages.forEach(page => {
      const filtroTelefono = page.properties['Filtro de telefono']?.formula?.string || '';
      if (filtroTelefono) {
        phoneCount[filtroTelefono] = (phoneCount[filtroTelefono] || 0) + 1;
        processedNumbers++; // Incrementar el contador de números procesados
      }
    });

    // Filtrar y mostrar los números duplicados en la consola
    const duplicatedPhones = Object.entries(phoneCount).filter(([phone, count]) => count > 1);

    if (duplicatedPhones.length > 0) {
      console.log("Números duplicados:");
      duplicatedPhones.forEach(([phone, count]) => {
        console.log(`Número: ${phone}, Repeticiones: ${count}`);
      });
    } else {
      console.log("No se encontraron números duplicados.");
    }

    // Actualizar cada página en función de si el teléfono está duplicado en "Filtro de telefono"
    for (const page of pages) {
      const filtroTelefono = page.properties['Filtro de telefono']?.formula?.string || '';

      if (!filtroTelefono) {
        continue;
      }

      // Solo etiquetar como duplicado si el número aparece más de una vez
      if (phoneCount[filtroTelefono] > 1) {
        const newLabel = `Duplicado (${phoneCount[filtroTelefono]})`;

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
      }
    }

    // Obtener la hora actual en formato legible
    const currentTime = new Date().toLocaleString();
    console.log(`Base de datos de Notion actualizada con éxito a las ${currentTime}`);
    console.log(`Total de números procesados: ${processedNumbers}`); // Mostrar el total de números procesados
  } catch (error) {
    console.error('Error al actualizar la base de datos de Notion:', error.message);
  }
};

// Ejecutar la actualización inmediatamente al iniciar el servidor
updateNotionDatabase();

// Configurar la actualización periódica (cada 5 minutos en este ejemplo)
const UPDATE_INTERVAL = 1 * 60 * 1000; // 5 minutos en milisegundos
setInterval(updateNotionDatabase, UPDATE_INTERVAL);

app.get('/notion', async (req, res) => {
  try {
    await updateNotionDatabase();
    res.status(200).json({ message: 'Actualización manual iniciada con éxito.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
