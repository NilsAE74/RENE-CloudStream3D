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
      stats.updateDashboard(count, bounds, positions, file.name);
      
      // Oppdater legend med Z-verdier
      ui.updateLegend(bounds.minZ, bounds.maxZ);
      
      // Lagre statistikk for rapport
      ui.updateStats({
        pointCount: count,
        minZ: bounds.minZ,
        maxZ: bounds.maxZ,
        areaX: bounds.maxX - bounds.minX,
        areaY: bounds.maxY - bounds.minY
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
      
      console.log('Punktsky opprettet!');
      stats.showDashboardMessage(`✓ Punktsky lastet! ${count.toLocaleString('nb-NO')} punkter visualisert.`, 'info');
      
    } catch (error) {
      console.error('Feil ved parsing av fil:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      stats.showDashboardMessage(`Feil ved parsing: ${error.message}`, 'error');
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