document.addEventListener('DOMContentLoaded', () => {
  // Elementos UI
  const loginForm = document.getElementById('login-conductor');
  const conductorUI = document.getElementById('conductor-interface');
  const btnLogin = document.getElementById('btn-login');
  const btnLogout = document.getElementById('btn-logout');
  const infoSector = document.getElementById('info-sector');
  const controlesEdicion = document.getElementById('controles-edicion');

  // Variables de estado
  let mapaConductor = null;
  let sectorSeleccionado = null;
  let capaSectores = null;
  const layers = {}; // Almacena todas las capas del mapa por ID

  // Iniciar sesión
  btnLogin.addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    try {
      await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
      mostrarNotificacion(`Error: ${error.message}`, 'error');
    }
  });

  // Cerrar sesión
  btnLogout.addEventListener('click', () => {
    auth.signOut();
    mostrarNotificacion('Sesión cerrada correctamente', 'success');
  });

  // Estado de autenticación
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      loginForm.classList.add('d-none');
      conductorUI.classList.remove('d-none');
      await iniciarMapaConductor();
      escucharCambiosEnTiempoReal();
      actualizarResumen();
    } else {
      loginForm.classList.remove('d-none');
      conductorUI.classList.add('d-none');
      if (mapaConductor) {
        mapaConductor.remove();
        mapaConductor = null;
        capaSectores = null;
        sectorSeleccionado = null;
        Object.keys(layers).forEach(key => delete layers[key]);
      }
    }
  });

  // Inicializar mapa
  async function iniciarMapaConductor() {
    if (mapaConductor) return;
    
    mapaConductor = cargarMapaBase('mapa-conductor');
    const geojsonData = await cargarDatosSectores();
    
    if (!geojsonData) {
      mostrarNotificacion('Error cargando los sectores', 'error');
      return;
    }
    
    // Capa de sectores
    capaSectores = L.geoJSON(geojsonData, {
      style: (feature) => getEstiloSector(feature.properties.estado),
      onEachFeature: (feature, layer) => {
        const sectorId = feature.properties.id;
        layers[sectorId] = layer;
        layer._leaflet_id = sectorId;
        
        layer.on('click', () => {
          seleccionarSector(sectorId, feature.properties);
        });
        
        layer.feature = feature;
      }
    }).addTo(mapaConductor);
    
    mapaConductor.fitBounds(capaSectores.getBounds());
  }

  // Seleccionar sector
  function seleccionarSector(sectorId, propiedades) {
    // Deseleccionar anterior
    if (sectorSeleccionado && layers[sectorSeleccionado.id]) {
      layers[sectorSeleccionado.id].setStyle(getEstiloSector(sectorSeleccionado.estado));
    }
    
    // Seleccionar nuevo
    sectorSeleccionado = { id: sectorId, ...propiedades };
    layers[sectorId].setStyle({
      weight: 3,
      color: '#000'
    });
    
    mostrarInfoSector(propiedades);
    mostrarControlesEdicion();
  }

  // Mostrar información del sector
  function mostrarInfoSector(sector) {
    infoSector.innerHTML = `
      <h4>${sector.nombre}</h4>
      <p><strong>Estado actual:</strong> 
        <span class="badge ${sector.estado}">${sector.estado.toUpperCase()}</span>
      </p>
      <hr>
      <p><small>ID: ${sector.id}</small></p>
    `;
  }

  // Mostrar controles de edición
function mostrarControlesEdicion() {
  if (!sectorSeleccionado) return;
  
  controlesEdicion.innerHTML = `
    <div class="card">
      <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
        <h5 class="mb-0">Cambiar Estado</h5>
        <button class="btn-close btn-close-white" id="btn-cerrar-controles"></button>
      </div>
      <div class="card-body">
        <div class="d-grid gap-2">
          <button class="btn btn-success" id="btn-marcar-recolectado">
            <i class="fas fa-check-circle"></i> Recolectado
          </button>
          <button class="btn btn-warning" id="btn-marcar-camino">
            <i class="fas fa-truck-moving"></i> En Camino
          </button>
          <button class="btn btn-danger" id="btn-marcar-pendiente">
            <i class="fas fa-clock"></i> Pendiente
          </button>
        </div>
      </div>
    </div>
  `;
    
  document.getElementById('btn-cerrar-controles').addEventListener('click', () => {
    controlesEdicion.innerHTML = '';
    if (sectorSeleccionado && layers[sectorSeleccionado.id]) {
      layers[sectorSeleccionado.id].setStyle(getEstiloSector(sectorSeleccionado.estado));
    }
    sectorSeleccionado = null;
  });
  
  document.getElementById('btn-marcar-recolectado').addEventListener('click', () => {
    actualizarEstadoSector('recolectado');
  });
  
  document.getElementById('btn-marcar-camino').addEventListener('click', () => {
    actualizarEstadoSector('en_camino');
  });
  
  document.getElementById('btn-marcar-pendiente').addEventListener('click', () => {
    actualizarEstadoSector('pendiente');
  });
}

  // Actualizar estado en Firestore
  async function actualizarEstadoSector(estado) {
    if (!sectorSeleccionado) return;
    
    try {
      // Actualizar localmente primero para mejor experiencia de usuario
      layers[sectorSeleccionado.id].setStyle(getEstiloSector(estado));
      sectorSeleccionado.estado = estado;
      mostrarInfoSector(sectorSeleccionado);
      
      // Intentar actualizar en Firestore
      await db.collection('sectores').doc(sectorSeleccionado.id).update({
        estado: estado,
        ultimaActualizacion: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      mostrarNotificacion(`Sector ${sectorSeleccionado.nombre} actualizado a ${estado}`, 'success');
      actualizarResumen();
      
    } catch (error) {
      console.error("Error actualizando sector:", error);
      mostrarNotificacion(`Error al actualizar: ${error.message}`, 'error');
      
      // Revertir cambios locales si falla
      layers[sectorSeleccionado.id].setStyle(getEstiloSector(sectorSeleccionado.estado));
    }
  }

  // Escuchar cambios en tiempo real
  function escucharCambiosEnTiempoReal() {
    db.collection('sectores').onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'modified') {
          const sectorId = change.doc.id;
          const nuevoEstado = change.doc.data().estado;
          
          // Actualizar capa si existe
          if (layers[sectorId]) {
            layers[sectorId].setStyle(getEstiloSector(nuevoEstado));
            
            // Actualizar si está seleccionado
            if (sectorSeleccionado && sectorSeleccionado.id === sectorId) {
              sectorSeleccionado.estado = nuevoEstado;
              mostrarInfoSector(sectorSeleccionado);
            }
          }
        }
      });
      actualizarResumen();
    }, (error) => {
      console.error("Error en listener:", error);
    });
  }

  // Actualizar resumen de estados
  async function actualizarResumen() {
    try {
      const snapshot = await db.collection('sectores').get();
      const conteo = {
        pendiente: 0,
        en_camino: 0,
        recolectado: 0
      };
      
      snapshot.forEach(doc => {
        const estado = doc.data().estado;
        if (conteo.hasOwnProperty(estado)) {
          conteo[estado]++;
        }
      });
      
      document.getElementById('contador-pendientes').textContent = conteo.pendiente;
      document.getElementById('contador-camino').textContent = conteo.en_camino;
      document.getElementById('contador-recolectados').textContent = conteo.recolectado;
      
    } catch (error) {
      console.error("Error actualizando resumen:", error);
    }
  }

  // Estilo para sectores
  function getEstiloSector(estado) {
    return {
      fillColor: obtenerColorPorEstado(estado),
      color: '#fff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.7,
      className: `sector-${estado}`
    };
  }

  // Mostrar notificación
function mostrarNotificacion(mensaje, tipo = 'info') {
  const tipos = {
    success: { class: 'alert-success', icon: 'check-circle' },
    error: { class: 'alert-danger', icon: 'exclamation-triangle' },
    info: { class: 'alert-info', icon: 'info-circle' }
  };
  
  const notificacion = document.createElement('div');
  notificacion.className = `alert ${tipos[tipo].class} alert-dismissible fade show position-fixed`;
  notificacion.style.cssText = `
    top: 20px;
    right: 20px;
    z-index: 2000;
    min-width: 300px;
    box-shadow: 0 0 10px rgba(0,0,0,0.2);
  `;
  notificacion.innerHTML = `
    <i class="fas fa-${tipos[tipo].icon} me-2"></i>
    ${mensaje}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;
  
  const existente = document.querySelector('.alert.position-fixed');
  if (existente) existente.remove();
  
  document.body.appendChild(notificacion);
    
  // Inicializar el tooltip de Bootstrap para el botón de cierre
  const closeButton = notificacion.querySelector('.btn-close');
  closeButton.addEventListener('click', () => {
    notificacion.classList.add('fade');
    setTimeout(() => notificacion.remove(), 150);
  });

    // Eliminar automáticamente después de 5 segundos
    setTimeout(() => {
      notificacion.classList.add('fade');
      setTimeout(() => notificacion.remove(), 150);
    }, 5000);
  }
});