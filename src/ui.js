import GUI from 'lil-gui';
import * as viewer from './viewer.js';
import * as selection from './selection.js';
import * as stats from './stats.js';
import * as report from './report.js';

let gui;
let pointFolder, sceneFolder, boxFolder;
let boxControllers = {};

// Settings objekter
export const settings = {
  pointSize: 0.2,
  pointColor: '#ffffff',
  backgroundColor: '#000000',
  useHeightColor: true,
  showAxes: false
};

// Rapport metadata
export const reportSettings = {
  projectName: 'Mitt Prosjekt',
  datum: 'ED50',
  projection: 'UTM 32N',
  description: 'Punktsky data',
  generateReport: async () => await handleGenerateReport()
};

// Lagre statistikk for rapport
let currentStats = null;

export const boxSettings = {
  x: 0,
  y: 0,
  z: 0,
  width: 2,
  height: 2,
  depth: 2,
  visible: false,
  transformMode: 'translate',
  hideOutside: true,
  selectPoints: null,  // Vil bli satt senere
  saveSelected: null   // Vil bli satt senere
};

/**
 * Initialiserer GUI
 */
export function initGUI() {
  gui = new GUI();
  gui.domElement.style.position = 'absolute';
  gui.domElement.style.top = '20px';
  gui.domElement.style.right = '20px';

  // Punktsky innstillinger folder
  pointFolder = gui.addFolder('Punktsky Innstillinger');
  
  const sizeController = pointFolder.add(settings, 'pointSize', 0.01, 0.5, 0.01).name('Point Size');
  const colorController = pointFolder.addColor(settings, 'pointColor').name('Point Color');
  const heightColorController = pointFolder.add(settings, 'useHeightColor').name('Høyde-basert Farge');
  pointFolder.close();

  // Scene innstillinger folder
  sceneFolder = gui.addFolder('Scene Innstillinger');
  const bgColorController = sceneFolder.addColor(settings, 'backgroundColor').name('Bakgrunnsfarge');
  sceneFolder.add(settings, 'showAxes').name('Vis aksekors').onChange((value) => {
    viewer.setAxesVisible(value);
  });
  sceneFolder.open();

  // Kontroller folder
  const controlsFolder = gui.addFolder('Kontroller');
  controlsFolder.add({ invertZ: () => handleInvertZ() }, 'invertZ').name('🔄 Inverter Z-akse');
  controlsFolder.open();

  // Rapport & Lokasjon folder
  setupReportGUI();

  // Selection Box folder
  setupSelectionBoxGUI();

  // Event handlers
  bgColorController.onChange((value) => {
    viewer.setBackgroundColor(value);
  });

  sizeController.onChange((value) => {
    const pointCloud = viewer.getPointCloud();
    if (pointCloud) {
      pointCloud.material.size = value;
    }
  });

  colorController.onChange((value) => {
    const pointCloud = viewer.getPointCloud();
    if (pointCloud && !settings.useHeightColor) {
      pointCloud.material.color.set(value);
    }
  });

  heightColorController.onChange((value) => {
    const pointCloud = viewer.getPointCloud();
    if (pointCloud) {
      pointCloud.material.vertexColors = value;
      if (!value) {
        pointCloud.material.color.set(settings.pointColor);
      }
      pointCloud.material.needsUpdate = true;
    }
  });

  return gui;
}

/**
 * Setter opp Selection Box GUI
 */
function setupSelectionBoxGUI() {
  boxFolder = gui.addFolder('Selection Box');
  
  boxControllers.visible = boxFolder.add(boxSettings, 'visible').name('Vis boks').onChange((value) => {
    const selBox = selection.getSelectionBox();
    const transControls = selection.getTransformControls();
    const pointCloud = viewer.getPointCloud();
    
    selBox.visible = value;
    transControls.visible = value;
    
    // Automatisk velg punkter når boksen aktiveres (uten alert)
    if (value && pointCloud) {
      selection.selectPointsInBox(pointCloud, boxSettings, false);
    } else if (!value && pointCloud) {
      selection.restoreOriginalColors(pointCloud);
    }
  });
  
  boxControllers.mode = boxFolder.add(boxSettings, 'transformMode', ['translate', 'rotate', 'scale']).name('Kontroll Modus').onChange((value) => {
    selection.getTransformControls().setMode(value);
  });
  
  boxFolder.add(boxSettings, 'hideOutside').name('Blek ut utenfor').onChange(() => {
    if (boxSettings.visible) {
      selection.selectPointsInBox(viewer.getPointCloud(), boxSettings, false);
    }
  });
  
  boxControllers.x = boxFolder.add(boxSettings, 'x', -100, 100, 0.1).name('Posisjon X').onChange((value) => {
    selection.getSelectionBox().position.x = value;
    if (boxSettings.visible) {
      selection.selectPointsInBox(viewer.getPointCloud(), boxSettings, false);
    }
  });
  
  boxControllers.y = boxFolder.add(boxSettings, 'y', -100, 100, 0.1).name('Posisjon Y').onChange((value) => {
    selection.getSelectionBox().position.y = value;
    if (boxSettings.visible) {
      selection.selectPointsInBox(viewer.getPointCloud(), boxSettings, false);
    }
  });
  
  boxControllers.z = boxFolder.add(boxSettings, 'z', -100, 100, 0.1).name('Posisjon Z (Høyde)').onChange((value) => {
    selection.getSelectionBox().position.z = value;
    if (boxSettings.visible) {
      selection.selectPointsInBox(viewer.getPointCloud(), boxSettings, false);
    }
  });
  
  boxControllers.width = boxFolder.add(boxSettings, 'width', 0.1, 50, 0.1).name('Bredde (X)').onChange((value) => {
    selection.updateBoxSize(value, boxSettings.height, boxSettings.depth);
    if (boxSettings.visible) {
      selection.selectPointsInBox(viewer.getPointCloud(), boxSettings, false);
    }
  });
  
  boxControllers.height = boxFolder.add(boxSettings, 'height', 0.1, 50, 0.1).name('Dybde (Y)').onChange((value) => {
    selection.updateBoxSize(boxSettings.width, value, boxSettings.depth);
    if (boxSettings.visible) {
      selection.selectPointsInBox(viewer.getPointCloud(), boxSettings, false);
    }
  });
  
  boxControllers.depth = boxFolder.add(boxSettings, 'depth', 0.1, 50, 0.1).name('Høyde (Z)').onChange((value) => {
    selection.updateBoxSize(boxSettings.width, boxSettings.height, value);
    if (boxSettings.visible) {
      selection.selectPointsInBox(viewer.getPointCloud(), boxSettings, false);
    }
  });
  
  // Knapper for seleksjon og lagring
  boxSettings.selectPoints = () => {
    selection.selectPointsInBox(viewer.getPointCloud(), boxSettings, true);
  };
  boxSettings.saveSelected = () => {
    selection.saveSelectedPoints(viewer.getPointCloud(), boxSettings);
  };
  
  boxFolder.add(boxSettings, 'selectPoints').name('🔍 Velg Punkter');
  boxFolder.add(boxSettings, 'saveSelected').name('💾 Lagre Valgte');
  boxFolder.close();
}

/**
 * Oppdaterer GUI ranges basert på data bounds
 */
export function updateGUIRanges(bounds) {
  const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;
  const padding = 10;
  
  // Oppdater posisjon-sliders
  boxControllers.x.min(minX - padding).max(maxX + padding);
  boxControllers.y.min(minY - padding).max(maxY + padding);
  boxControllers.z.min(minZ - padding).max(maxZ + padding);
  
  // Oppdater størrelse-sliders
  const maxWidth = (maxX - minX) * 2;
  const maxHeight = (maxY - minY) * 2;
  const maxDepth = (maxZ - minZ) * 2;
  
  boxControllers.width.min(0.1).max(maxWidth);
  boxControllers.height.min(0.1).max(maxHeight);
  boxControllers.depth.min(0.1).max(maxDepth);
  
  console.log('GUI ranges oppdatert basert på data bounds');
}

/**
 * Åpner punktsky folder
 */
export function openPointFolder() {
  pointFolder.open();
}

/**
 * Oppdaterer GUI display
 */
export function updateDisplay() {
  // Oppdater alle controllers i GUI
  gui.controllersRecursive().forEach(controller => controller.updateDisplay());
}

/**
 * Håndterer Z-akse inversjon
 */
function handleInvertZ() {
  const result = viewer.invertZAxis();
  
  if (!result) {
    console.warn('Kunne ikke invertere Z-akse');
    return;
  }
  
  const { center, size, positions, boundingBox, originalMinZ, originalMaxZ } = result;
  
  const pointCount = positions.length / 3;
  
  // Hent koordinat-offset for å beregne originale X/Y bounds
  const offset = viewer.getCoordinateOffset();
  
  // Konverter sentrerte posisjoner tilbake til originale for histogram
  const originalPositions = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    originalPositions[i] = positions[i] + offset.x;
    originalPositions[i + 1] = positions[i + 1] + offset.y;
    originalPositions[i + 2] = positions[i + 2] + offset.z;  // Bruker det inverterte offset
  }
  
  // Oppdater dashboard med ORIGINALE verdier
  stats.updateDashboard(pointCount, {
    minX: boundingBox.min.x + offset.x,
    maxX: boundingBox.max.x + offset.x,
    minY: boundingBox.min.y + offset.y,
    maxY: boundingBox.max.y + offset.y,
    minZ: originalMinZ,  // Allerede konvertert til original i viewer.js
    maxZ: originalMaxZ   // Allerede konvertert til original i viewer.js
  }, originalPositions);
  
  stats.showDashboardMessage('✓ Z-akse invertert!', 'info');
  
  // Oppdater selection box hvis den er aktiv
  const selectionBox = selection.getSelectionBox();
  if (selectionBox && boxSettings.visible) {
    // Inverter box position Z
    selectionBox.position.z = -selectionBox.position.z;
    boxSettings.z = selectionBox.position.z;
    
    // Oppdater seleksjon
    selection.selectPointsInBox(viewer.getPointCloud(), boxSettings, false);
  } else {
    // Reposisjonér selection box til nye bounds (selv om den er skjult)
    selection.positionSelectionBox(center, size, boxSettings);
  }
  
  // Oppdater GUI display
  updateDisplay();
  
  console.log('Z-akse inversjon fullført');
}

/**
 * Setter opp Rapport & Lokasjon GUI
 */
function setupReportGUI() {
  const reportFolder = gui.addFolder('📄 Rapport & Lokasjon');
  
  reportFolder.add(reportSettings, 'projectName').name('Prosjektnavn').onChange((value) => {
    stats.updateMetadata(reportSettings);
  });
  
  reportFolder.add(reportSettings, 'datum').name('Datum').onChange((value) => {
    stats.updateMetadata(reportSettings);
  });
  
  reportFolder.add(reportSettings, 'projection').name('Projeksjon').onChange((value) => {
    stats.updateMetadata(reportSettings);
  });
  
  reportFolder.add(reportSettings, 'description').name('Beskrivelse').onChange((value) => {
    stats.updateMetadata(reportSettings);
  });
  
  reportFolder.add(reportSettings, 'generateReport').name('📥 Generer PDF-rapport');
  reportFolder.close();
}

/**
 * Håndterer PDF-rapport generering
 */
async function handleGenerateReport() {
  try {
    if (!currentStats) {
      stats.showDashboardMessage('⚠️ Last inn en punktsky først', 'error');
      return;
    }
    
    stats.showDashboardMessage('⏳ Genererer PDF-rapport...', 'info');
    
    const reportData = {
      projectName: reportSettings.projectName,
      datum: reportSettings.datum,
      projection: reportSettings.projection,
      description: reportSettings.description,
      pointCount: currentStats.pointCount,
      minZ: currentStats.minZ,
      maxZ: currentStats.maxZ,
      areaX: currentStats.areaX,
      areaY: currentStats.areaY
    };
    
    await report.generatePDFReport(
      reportData, 
      viewer.getRenderer(),
      stats
    );
    
    stats.showDashboardMessage('✓ PDF-rapport generert og lastet ned!', 'info');
    
  } catch (error) {
    console.error('Feil ved rapport-generering:', error);
    stats.showDashboardMessage('❌ Feil ved PDF-generering', 'error');
  }
}

/**
 * Oppdaterer statistikk for rapport
 */
export function updateStats(statsData) {
  currentStats = statsData;
}

/**
 * Henter renderer for PDF
 */
function getRendererForPDF() {
  // Få tak i renderer via viewer-modulen
  const scene = viewer.getScene();
  return scene ? scene.userData.renderer : null;
}

/**
 * Henter GUI
 */
export function getGUI() {
  return gui;
}
