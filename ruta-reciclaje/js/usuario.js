document.addEventListener('DOMContentLoaded', async () => {
  // Inicializar mapa
  const mapa = cargarMapaBase('mapa-usuario');
  const listaSectores = document.getElementById('lista-sectores');
  let capaSectores = null;

  // Cargar y dibujar sectores
  const geojsonData = await cargarDatosSectores();
  if (!geojsonData) return;
  
  // Dibujar sectores iniciales
  capaSectores = L.geoJSON(geojsonData, {
    style: (feature) => ({
      color: obtenerColorPorEstado(feature.properties.estado),
      weight: 2,
      fillOpacity: 0.5
    }),
    onEachFeature: (feature, layer) => {
      layer.bindPopup(`
        <b>${feature.properties.nombre}</b>
        <div class="estado-${feature.properties.estado}">
          Estado: ${feature.properties.estado.toUpperCase()}
        </div>
      `);
    }
  }).addTo(mapa);

  // Actualizar lista de sectores
  actualizarListaSectores(geojsonData);

  // Escuchar cambios en tiempo real
  db.collection('sectores').onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'modified') {
        const sectorId = change.doc.id;
        const nuevoEstado = change.doc.data().estado;
        
        // Actualizar mapa
        capaSectores.eachLayer((layer) => {
          if (layer.feature?.properties?.id === sectorId) {
            layer.setStyle({
              color: obtenerColorPorEstado(nuevoEstado),
              fillColor: obtenerColorPorEstado(nuevoEstado)
            });
            layer.setPopupContent(`
              <b>${layer.feature.properties.nombre}</b>
              <div class="estado-${nuevoEstado}">
                Estado: ${nuevoEstado.toUpperCase()}
              </div>
            `);
          }
        });
        
        // Actualizar lista con el color correcto
        const item = document.querySelector(`#lista-sectores li[data-id="${sectorId}"]`);
        if (item) {
          let badgeClass = '';
          if (nuevoEstado === 'recolectado') {
            badgeClass = 'bg-success';
          } else if (nuevoEstado === 'en_camino') {
            badgeClass = 'bg-warning';
          } else {
            badgeClass = 'bg-danger';
          }
          
          const badge = item.querySelector('.badge');
          badge.className = `badge ${badgeClass}`;
          badge.textContent = nuevoEstado;
        }
      }
    });
  });

  // Función para actualizar lista
  function actualizarListaSectores(geojsonData) {
    listaSectores.innerHTML = '';
    
    geojsonData.features.forEach(sector => {
      const item = document.createElement('li');
      item.className = 'list-group-item d-flex justify-content-between align-items-center';
      item.dataset.id = sector.properties.id;
      
      // Usamos las mismas clases de color que en el mapa
      const estado = sector.properties.estado;
      let badgeClass = '';
      if (estado === 'recolectado') {
        badgeClass = 'bg-success';
      } else if (estado === 'en_camino') {
        badgeClass = 'bg-warning';
      } else {
        badgeClass = 'bg-danger'; // pendiente por defecto
      }
      
      item.innerHTML = `
        ${sector.properties.nombre}
        <span class="badge ${badgeClass}">
          ${estado}
        </span>
      `;
      listaSectores.appendChild(item);
    });
  }
});