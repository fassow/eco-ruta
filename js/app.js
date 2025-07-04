const firebaseConfig = {
  apiKey: "AIzaSyBJZhUsuQftgWxwFqL3KvkmK9px9SMVxS8",
  authDomain: "rutareciclajetilaran.firebaseapp.com",
  projectId: "rutareciclajetilaran",
  storageBucket: "rutareciclajetilaran.firebasestorage.app",
  messagingSenderId: "479261509255",
  appId: "1:479261509255:web:e2dae643ecb8faa9e2da22",
  measurementId: "G-E1J6T7X5CP"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Función para cargar mapa base
function cargarMapaBase(idDivMapa) {
  const mapa = L.map(idDivMapa).setView([10.466, -84.966], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(mapa);
  return mapa;
}

// Función para cargar datos de sectores (combina GeoJSON y Firestore)
async function cargarDatosSectores() {
  try {
    // 1. Cargar datos desde Firestore primero
    const snapshot = await db.collection('sectores').get();
    
    if (snapshot.empty) {
      // Si no hay datos en Firestore, cargar desde GeoJSON
      return await cargarDesdeGeoJSON();
    }
    
    // 2. Si hay datos en Firestore, usarlos como fuente principal
    const features = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      features.push({
        type: "Feature",
        properties: {
          id: doc.id,
          nombre: data.nombre,
          estado: data.estado || 'pendiente'
        },
        geometry: {
          type: "Polygon",
          coordinates: [data.coordenadas.map(coord => [coord.lng, coord.lat])]
        }
      });
    });
    
    return {
      type: "FeatureCollection",
      features: features
    };
    
  } catch (error) {
    console.error("Error cargando datos:", error);
    return await cargarDesdeGeoJSON(); // Fallback a GeoJSON
  }
}

// Función de fallback para cargar desde GeoJSON
async function cargarDesdeGeoJSON() {
  try {
    const response = await fetch('geojson/sectores-tilaran.geojson');
    if (!response.ok) throw new Error("Error al cargar GeoJSON");
    return await response.json();
  } catch (error) {
    console.error("Error cargando GeoJSON:", error);
    return null;
  }
}

// Función para obtener color según estado
function obtenerColorPorEstado(estado) {
  const colores = {
    recolectado: '#28a745',
    en_camino: '#ffc107',
    pendiente: '#dc3545'
  };
  return colores[estado] || '#6c757d';
}

// Configurar persistencia offline
function configurarPersistencia() {
  firebase.firestore().enablePersistence()
    .catch(err => console.log("Persistencia offline:", err));
}

// Inicializar
configurarPersistencia();

