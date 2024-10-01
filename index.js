const express = require('express');
const axios = require('axios');
const cors = require('cors');

// Crear la aplicación Express
const app = express();
const PORT = process.env.PORT || 3000;

// Configurar CORS para permitir todas las peticiones
app.use(cors());

// Ruta para consultar datos en Notion
app.get('/notion', async (req, res) => {
  try {
    // El ID de tu base de datos en Notion
    const databaseId = 'd03874483db44f498080ad7ffe0b6219'; // Reemplaza con el ID de tu base de datos

    // Consulta a la API de Notion con un filtro para la propiedad "Bancos N" que contenga "Western"
    const notionQuery = {
      filter: {
        property: 'Bancos N', // La propiedad "Bancos N" de la base de datos
        title: {
          contains: 'Western', // Busca títulos que contengan "Western"
        },
      },
    };

    // Hacer la petición POST a la API de Notion
    const response = await axios.post(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      notionQuery,
      {
        headers: {
          Authorization: 'Bearer secret_uCBoeC7cnlFtq7VG4Dr58nBYFLFbR6dKzF00fZt2dq', // Token directo (NO SEGURO)
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
        },
      }
    );

    // Extraer los resultados
    const results = response.data.results.map((page) => {
      const bancosTitle = page.properties['Bancos N'].title[0]?.text?.content || 'Sin datos';

      // Acceder al valor de la fórmula en "Estado de datos"
      const estadoDeDatos = page.properties['Estado Datos'].formula?.string || 'Sin estado';

      // Acceder a la propiedad "Nacionalidad" de tipo Select
      const nacionalidad = page.properties['Nacionalidad']?.select?.name || 'Sin nacionalidad';

      // Acceder a la propiedad "Prioridad" de tipo Select
      const prioridad = page.properties['Prioridad']?.select?.name || 'Sin prioridad';

      return {
        bancos: bancosTitle,
        estadoDeDatos: estadoDeDatos,
        nacionalidad: nacionalidad,
        prioridad: prioridad,
      };
    });

    // Enviar los resultados al cliente
    res.status(200).json(results);
  } catch (error) {
    // Manejar errores
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Iniciar el servidor en el puerto definido
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
