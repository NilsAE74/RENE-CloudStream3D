/**
 * Main.js - Dirigent for 3D punktsky visualisering
 * Importerer og koordinerer alle moduler
 */

import * as viewer from './src/viewer.js';
import * as parser from './src/parser.js';
import * as ui from './src/ui.js';
import * as selection from './src/selection.js';
import * as stats from './src/stats.js';
import * as grid from './src/grid.js';

// Initialiser Three.js viewer
const { scene, camera, controls } = viewer.initViewer();

// Initialiser GUI
ui.initGUI();

// Initialiser Dashboard
stats.initDashboard();

// Initialiser Selection Box
const { selectionBox, transformControls } = selection.initSelectionBox(
  viewer.getScene(),
  viewer.getCamera(),
  viewer.getRendererElement()
);

// Koble TransformControls til OrbitControls
transformControls.addEventListener('dragging-changed', (event) => {
  controls.enabled = !event.value;
});

// Oppdater box position i GUI når den flyttes manuelt
transformControls.addEventListener('change', () => {
  ui.boxSettings.x = selectionBox.position.x;
  ui.boxSettings.y = selectionBox.position.y;
  ui.boxSettings.z = selectionBox.position.z;
  ui.updateDisplay();
  
  // Oppdater seleksjon dynamisk mens boksen flyttes (uten alert)
  if (ui.boxSettings.visible && viewer.getPointCloud()) {
    selection.selectPointsInBox(viewer.getPointCloud(), ui.boxSettings, false);
  }
});

// Start animasjons-loop
viewer.animate();

// Last inn default punktsky og logo ved oppstart
async function loadDefaultCloud() {
  console.log('=== LASTER DEFAULT PUNKTSKY MED LOGO ===');
  
  try {
    // Generer default terreng
    const terrainData = parser.generateDefaultCloud();
    
    // Generer logo punktsky (asynkront)
    const logoData = await parser.generateLogoCloud();
    
    // Kombiner terreng og logo
    console.log('Kombinerer terreng og logo...');
    const combinedPositions = [...terrainData.positions, ...logoData.positions];
    const combinedColors = [...terrainData.colors, ...logoData.colors];
    
    // Kombiner velocities (terreng har ingen velocity, logo har)
    const terrainVelocities = new Array(terrainData.positions.length).fill(0);
    const combinedVelocities = [...terrainVelocities, ...logoData.velocities];
    
    const totalCount = terrainData.count + logoData.count;
    
    // Kombiner bounds
    const combinedBounds = {
      minX: Math.min(terrainData.bounds.minX, logoData.bounds.minX),
      maxX: Math.max(terrainData.bounds.maxX, logoData.bounds.maxX),
      minY: Math.min(terrainData.bounds.minY, logoData.bounds.minY),
      maxY: Math.max(terrainData.bounds.maxY, logoData.bounds.maxY),
      minZ: Math.min(terrainData.bounds.minZ, logoData.bounds.minZ),
      maxZ: Math.max(terrainData.bounds.maxZ, logoData.bounds.maxZ)
    };
    
    console.log(`Total punkter: ${totalCount.toLocaleString('nb-NO')} (Terreng: ${terrainData.count}, Logo: ${logoData.count})`);
    
    // Sentrer posisjonene rundt origo
    const { centeredPositions, offset } = parser.centerPositions(combinedPositions, combinedBounds);
    
    // Lagre offset
    selection.setCoordinateOffset(offset.x, offset.y, offset.z);
    viewer.setCoordinateOffset(offset.x, offset.y, offset.z);
    
    // Oppdater dashboard med statistikk
    const resolution = stats.updateDashboard(totalCount, combinedBounds, combinedPositions, 'Default Terreng + Logo');
    
    // Oppdater legend med Z-verdier (KUN TERRENG, ikke logo)
    ui.updateLegend(terrainData.bounds.minZ, terrainData.bounds.maxZ);
    
    // Lagre statistikk for rapport
    ui.updateStats({
      pointCount: totalCount,
      minZ: combinedBounds.minZ,
      maxZ: combinedBounds.maxZ,
      areaX: combinedBounds.maxX - combinedBounds.minX,
      areaY: combinedBounds.maxY - combinedBounds.minY,
      resolution: resolution
    });
    
    // Opprett punktsky og legg til i scenen
    // useHeightColor = true aktiverer vertex colors (bruker fargene fra både terreng-gradient og logo-piksler)
    const pointCloud = viewer.addPointCloud(
      centeredPositions,
      combinedColors,
      ui.settings.pointSize,
      true, // Bruk vertex colors: terreng får gradient, logo får sine faktiske farger
      ui.settings.pointColor
    );
    
    // Beregn bounding box og sentrer kamera
    const geometry = pointCloud.geometry;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    
    const { center, size, maxDim } = viewer.centerCameraOnBounds(
      geometry.boundingBox,
      geometry.boundingSphere
    );
    
    // Respekter GUI-innstillingene for aksekors
    viewer.setAxesVisible(ui.settings.showAxes);
    
    // Opprett koordinatgrid med originale koordinater (men hold det skjult som standard)
    grid.createSurveyGrid(geometry.boundingBox, offset, viewer.getScene());
    grid.setGridVisible(ui.settings.showGrid);
    
    // Åpne punkt-innstillinger folder
    ui.openPointFolder();
    
    // Oppdater GUI ranges basert på faktiske data
    ui.updateGUIRanges(combinedBounds);
    
    // Skjul selection box som standard
    selectionBox.visible = false;
    transformControls.visible = false;
    ui.boxSettings.visible = false;
    
    // Posisjonér selection box
    selection.positionSelectionBox(center, size, ui.boxSettings);
    
    // Oppdater GUI
    ui.updateDisplay();
    
    // Nullstill originalColors
    selection.resetOriginalColors();
    
    // Marker at dette er default-skyen og lagre velocity-data for eksplosjon
    viewer.setIsDefaultCloud(true, combinedVelocities);
    
    console.log('Punktsky med logo lastet!');
    stats.showDashboardMessage(`✓ Default Terreng + Logo lastet! ${totalCount.toLocaleString('nb-NO')} punkter visualisert.`, 'info');
    
  } catch (error) {
    console.error('Feil ved lasting av default punktsky:', error);
    stats.showDashboardMessage(`Feil ved lasting av default punktsky: ${error.message}`, 'error');
  }
}

// Last default punktsky ved oppstart
loadDefaultCloud();

// Håndter fil-opplasting
const fileInput = document.getElementById('fileInput');

// Funksjon for å laste fil (brukes av både file input og drag-drop)
function loadFile(file) {
  if (!file) {
    stats.showDashboardMessage('Ingen fil valgt', 'error');
    return;
  }
  
  const reader = new FileReader();
  
  reader.onload = (e) => {
    const content = e.target.result;
    
    console.log('=== FIL LASTET OPP ===');
    console.log(`Filnavn: ${file.name}`);
    console.log(`Størrelse: ${(file.size / 1024).toFixed(2)} KB`);
    
    // Funksjon som faktisk laster den nye filen
    const processNewFile = () => {
    try {
      console.log('Starter parsing av fil...');
      
      // Parse XYZ-filen
      const { positions, colors, count, bounds } = parser.parseXYZFile(content);
      
      if (count === 0) {
        stats.showDashboardMessage('Ingen gyldige punkter funnet i filen!', 'error');
        return;
      }
      
      console.log('Parsing fullført. Oppretter punktsky...');
      console.log(`Positions array lengde: ${positions.length}`);
      console.log(`Colors array lengde: ${colors.length}`);
      
      // Sentrer posisjonene rundt origo for bedre WebGL-presisjon
      const { centeredPositions, offset } = parser.centerPositions(positions, bounds);
      
      // Lagre offset i selection-modulen for korrekt eksport
      selection.setCoordinateOffset(offset.x, offset.y, offset.z);
      
      // Lagre offset i viewer-modulen for inversjon
      viewer.setCoordinateOffset(offset.x, offset.y, offset.z);
      
      // Oppdater dashboard med statistikk (bruker ORIGINALE posisjoner for histogram)
      const resolution = stats.updateDashboard(count, bounds, positions, file.name);
      
      // Oppdater legend med Z-verdier
      ui.updateLegend(bounds.minZ, bounds.maxZ);
      
      // Lagre statistikk for rapport
      ui.updateStats({
        pointCount: count,
        minZ: bounds.minZ,
        maxZ: bounds.maxZ,
        areaX: bounds.maxX - bounds.minX,
        areaY: bounds.maxY - bounds.minY,
        resolution: resolution
      });
      
      // Opprett punktsky og legg til i scenen (bruker SENTRERTE posisjoner for rendering)
      const pointCloud = viewer.addPointCloud(
        centeredPositions,
        colors,
        ui.settings.pointSize,
        ui.settings.useHeightColor,
        ui.settings.pointColor
      );
      
      // Beregn bounding box og sentrer kamera
      const geometry = pointCloud.geometry;
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      
      const { center, size, maxDim } = viewer.centerCameraOnBounds(
        geometry.boundingBox,
        geometry.boundingSphere
      );

      // Respekter GUI-innstillingene for aksekors
      viewer.setAxesVisible(ui.settings.showAxes);

      // Opprett koordinatgrid med originale koordinater (men hold det skjult som standard)
      grid.createSurveyGrid(geometry.boundingBox, offset, viewer.getScene());
      grid.setGridVisible(ui.settings.showGrid);

      // Åpne punkt-innstillinger folder
      ui.openPointFolder();
      
      // Oppdater GUI ranges basert på faktiske data
      ui.updateGUIRanges(bounds);
      
      // Skjul selection box som standard
      selectionBox.visible = false;
      transformControls.visible = false;
      ui.boxSettings.visible = false;
      
      // Posisjonér selection box
      selection.positionSelectionBox(center, size, ui.boxSettings);
      
      // Oppdater GUI
      ui.updateDisplay();
      
      // Nullstill originalColors når ny fil lastes
      selection.resetOriginalColors();
      
      // Marker at dette ikke er default-skyen lenger
      viewer.setIsDefaultCloud(false, null);
      
      console.log('Punktsky opprettet!');
      stats.showDashboardMessage(`✓ Punktsky lastet! ${count.toLocaleString('nb-NO')} punkter visualisert.`, 'info');
      
    } catch (error) {
      console.error('Feil ved parsing av fil:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      stats.showDashboardMessage(`Feil ved parsing: ${error.message}`, 'error');
      }
    };
    
    // Sjekk om vi skal trigge eksplosjon
    if (viewer.getIsDefaultCloud()) {
      console.log('🎆 Default-sky detektert! Starter eksplosjon før lasting av ny fil...');
      stats.showDashboardMessage('🎆 Eksploderer logo...', 'info');
      
      // Trigger eksplosjon, og last ny fil når animasjonen er ferdig
      viewer.animateExplosion(() => {
        console.log('Eksplosjon ferdig, laster ny fil...');
        processNewFile();
      });
    } else {
      // Ikke default-sky, last filen direkte
      processNewFile();
    }
  };
  
  reader.onerror = () => {
    stats.showDashboardMessage('Feil ved lesing av fil', 'error');
    console.error('FileReader feil:', reader.error);
  };
  
  // Les filen som tekst
  reader.readAsText(file);
}

// Event listener for fil-input
fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  loadFile(file);
});

// Drag and Drop funksjonalitet
const body = document.body;

// Hindre default drag behavior
body.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  body.classList.add('dragging');
});

body.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  body.classList.remove('dragging');
});

// Håndter drop
body.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  body.classList.remove('dragging');
  
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    
    // Sjekk filtype
    const validExtensions = ['.txt', '.xyz', '.pcd', '.ply'];
    const fileName = file.name.toLowerCase();
    const isValid = validExtensions.some(ext => fileName.endsWith(ext));
    
    if (isValid) {
      loadFile(file);
    } else {
      stats.showDashboardMessage('Ugyldig filtype. Støttede formater: .txt, .xyz, .pcd, .ply', 'error');
    }
  }
});

console.log('3D Punktsky Visualisering - Klar!');
console.log('Last opp en .xyz fil for å komme i gang.');
console.log('Du kan også dra og slippe filer direkte på siden!');