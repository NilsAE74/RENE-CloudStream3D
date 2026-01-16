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
import { MeasurementTool } from './src/measurement.js';
import { ProfileTool } from './src/profile.js';
import { initDraggablePanels } from './src/ui.js';

// Global variabel for å spore om brukeren har lastet en fil
let hasUserUploadedFile = false;

/**
 * Oppdaterer visningen av upload-knapper basert på om data er lastet
 */
function updateUploadButtonVisibility() {
  const uploadButton = document.querySelector('.upload-button');
  const toolbarUpload = document.getElementById('toolbar-upload');
  
  if (hasUserUploadedFile) {
    // Brukeren har lastet en fil - vis toolbar knapp, skjul stor knapp
    if (uploadButton) uploadButton.style.display = 'none';
    if (toolbarUpload) toolbarUpload.style.display = 'flex';
  } else {
    // Brukeren har ikke lastet noen fil ennå - vis stor knapp, skjul toolbar knapp
    if (uploadButton) uploadButton.style.display = 'block';
    if (toolbarUpload) toolbarUpload.style.display = 'none';
  }
}


// Initialiser Three.js viewer
const { scene, camera, controls } = viewer.initViewer();

// Initialiser GUI
ui.initGUI();

// Initialiser Dashboard
stats.initDashboard();

// Oppdater visningen av upload-knapper ved oppstart
updateUploadButtonVisibility();

// Initialiser draggable panels
initDraggablePanels();

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

// Update box position in GUI when moved manually
transformControls.addEventListener('change', () => {
  ui.boxSettings.x = selectionBox.position.x;
  ui.boxSettings.y = selectionBox.position.y;
  ui.boxSettings.z = selectionBox.position.z;
  ui.updateDisplay();

  // Update selection dynamically while box moves (without alert)
  if (ui.boxSettings.visible && viewer.getPointCloud()) {
    selection.selectPointsInBox(viewer.getPointCloud(), ui.boxSettings, false);
  }
});

// Initialiser Measurement Tool
const measurementTool = new MeasurementTool(
  viewer.getScene(),
  viewer.getCamera(),
  viewer.getRendererElement(),
  { x: 0, y: 0, z: 0 }
);

// Sett referanser til measurement tool
viewer.setMeasurementTool(measurementTool);
ui.setMeasurementTool(measurementTool);

// Initialiser Profile Tool
const profileTool = new ProfileTool({ x: 0, y: 0, z: 0 });

// Sett referanse til profile tool
ui.setProfileTool(profileTool);



// Wrapper for completeMeasurement som også oppdaterer dashboard
const originalCompleteMeasurement = measurementTool.completeMeasurement.bind(measurementTool);
measurementTool.completeMeasurement = function(startPoint, endPoint) {
  const measurement = originalCompleteMeasurement(startPoint, endPoint);
  if (measurement) {
    // Log measurement data to console
    console.log('📏 Measurement completed:');
    console.log(`  Start: (${measurement.startOriginal.x.toFixed(2)}, ${measurement.startOriginal.y.toFixed(2)}, ${measurement.startOriginal.z.toFixed(2)})`);
    console.log(`  End: (${measurement.endOriginal.x.toFixed(2)}, ${measurement.endOriginal.y.toFixed(2)}, ${measurement.endOriginal.z.toFixed(2)})`);
    console.log(`  ΔX: ${measurement.deltaX.toFixed(2)} m, ΔY: ${measurement.deltaY.toFixed(2)} m, ΔZ: ${measurement.deltaZ.toFixed(2)} m`);
    console.log(`  Total distance: ${measurement.distance3D.toFixed(2)} m`);
    
    stats.showDashboardMessage(`✓ Measurement completed: ${measurement.distance3D.toFixed(2)} m`, 'info');
  }
  return measurement;
};

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
    measurementTool.setCoordinateOffset(offset);
    profileTool.setCoordinateOffset(offset);
    
    console.log('📏 Measurement tool ready for default point cloud');
    console.log('✂️ Profile tool ready for default point cloud');
    console.log(`   Coordinate offset: (${offset.x.toFixed(2)}, ${offset.y.toFixed(2)}, ${offset.z.toFixed(2)})`);
    
    // Update dashboard with statistics (TERRAIN ONLY, not logo)
    const resolution = stats.updateDashboard(terrainData.count, terrainData.bounds, terrainData.positions, 'Default Terrain');

    // Update legend with Z-values (TERRAIN ONLY, not logo)
    ui.updateLegend(terrainData.bounds.minZ, terrainData.bounds.maxZ);

    // Save statistics for report (TERRAIN ONLY, including positions for histogram)
    ui.updateStats({
      pointCount: terrainData.count,
      minZ: terrainData.bounds.minZ,
      maxZ: terrainData.bounds.maxZ,
      areaX: terrainData.bounds.maxX - terrainData.bounds.minX,
      areaY: terrainData.bounds.maxY - terrainData.bounds.minY,
      resolution: resolution,
      positions: terrainData.positions  // Store original positions for PDF histogram
    });
    
    // Create point cloud and add to scene
    // useHeightColor = true activates vertex colors (uses colors from both terrain gradient and logo pixels)
    const pointCloud = viewer.addPointCloud(
      centeredPositions,
      combinedColors,
      ui.settings.pointSize,
      true, // Use vertex colors: terrain gets gradient, logo gets its actual colors
      ui.settings.pointColor
    );
    
    // Calculate bounding box and center camera
    const geometry = pointCloud.geometry;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const { center, size, maxDim } = viewer.centerCameraOnBounds(
      geometry.boundingBox,
      geometry.boundingSphere
    );

    // Respect GUI settings for axes
    viewer.setAxesVisible(ui.settings.showAxes);

    // Create coordinate grid with original coordinates (but keep it hidden by default)
    grid.createSurveyGrid(geometry.boundingBox, offset, viewer.getScene());
    grid.setGridVisible(ui.settings.showGrid);

    // Keep all folders closed by default
    // ui.openPointFolder();

    // Update GUI ranges based on actual data
    ui.updateGUIRanges(combinedBounds);

    // Hide selection box by default
    selectionBox.visible = false;
    transformControls.visible = false;
    ui.boxSettings.visible = false;

    // Position selection box
    selection.positionSelectionBox(center, size, ui.boxSettings);
    
    // Update GUI
    ui.updateDisplay();

    // Reset originalColors
    selection.resetOriginalColors();

    // Mark that this is the default cloud and save velocity data for explosion
    viewer.setIsDefaultCloud(true, combinedVelocities);

    console.log('Point cloud with logo loaded!');
    console.log('📏 Tip: Activate the measurement tool in GUI to measure distances!');
    stats.showDashboardMessage(`✓ Terrain loaded with ${terrainData.count.toLocaleString('nb-NO')} points (+ Logo: ${logoData.count.toLocaleString('nb-NO')} points)`, 'info');

    // Oppdater upload knapp visning etter default terreng er lastet
    updateUploadButtonVisibility();
   
    
  } catch (error) {
    console.error('Error loading default point cloud:', error);
    stats.showDashboardMessage(`Error loading default point cloud: ${error.message}`, 'error');
  }
}

// Load default point cloud at startup (with spinner)
stats.showLoadingSpinner('Loading default terrain...');
loadDefaultCloud().then(() => {
  stats.hideLoadingSpinner();
}).catch((error) => {
  stats.hideLoadingSpinner();
  console.error('Feil ved lasting av default punktsky:', error);
});

// Handle file upload
const fileInput = document.getElementById('fileInput');

// Function to load file (used by both file input and drag-drop)
function loadFile(file) {
  if (!file) {
    stats.showDashboardMessage('No file selected', 'error');
    return;
  }

  const reader = new FileReader();

  reader.onload = (e) => {
    const content = e.target.result;

    console.log('=== FILE UPLOADED ===');
    console.log(`Filename: ${file.name}`);
    console.log(`Size: ${(file.size / 1024).toFixed(2)} KB`);

    // Function that actually loads the new file
    const processNewFile = () => {
    try {
      // Show loading spinner
      stats.showLoadingSpinner(`Parsing ${file.name}...`);
      
      console.log('Starting file parsing...');

      // Parse XYZ file (use setTimeout to allow UI to update)
      setTimeout(() => {
      try {
      const { positions, colors, count, bounds } = parser.parseXYZFile(content);

      if (count === 0) {
        stats.showDashboardMessage('No valid points found in file!', 'error');
        return;
      }

      console.log('Parsing completed. Creating point cloud...');
      console.log(`Positions array length: ${positions.length}`);
      console.log(`Colors array length: ${colors.length}`);

      // Center positions around origin for better WebGL precision
      const { centeredPositions, offset } = parser.centerPositions(positions, bounds);

      // Save offset in selection module for correct export
      selection.setCoordinateOffset(offset.x, offset.y, offset.z);

      // Save offset in viewer module for inversion
      viewer.setCoordinateOffset(offset.x, offset.y, offset.z);

      // Save offset in measurement tool
      measurementTool.setCoordinateOffset(offset);
      
      // Save offset in profile tool
      profileTool.setCoordinateOffset(offset);

      console.log('📏 Measurement tool updated for new point cloud');
      console.log('✂️ Profile tool updated for new point cloud');
      console.log(`   Coordinate offset: (${offset.x.toFixed(2)}, ${offset.y.toFixed(2)}, ${offset.z.toFixed(2)})`);
      
      // Update dashboard with statistics (using ORIGINAL positions for histogram)
      const resolution = stats.updateDashboard(count, bounds, positions, file.name);

      // Update legend with Z-values
      ui.updateLegend(bounds.minZ, bounds.maxZ);

      // Save statistics for report (including original positions for histogram)
      ui.updateStats({
        pointCount: count,
        minZ: bounds.minZ,
        maxZ: bounds.maxZ,
        areaX: bounds.maxX - bounds.minX,
        areaY: bounds.maxY - bounds.minY,
        resolution: resolution,
        positions: positions  // Store original positions for PDF histogram
      });

      // Create point cloud and add to scene (using CENTERED positions for rendering)
      const pointCloud = viewer.addPointCloud(
        centeredPositions,
        colors,
        ui.settings.pointSize,
        ui.settings.useHeightColor,
        ui.settings.pointColor
      );

      // Calculate bounding box and center camera
      const geometry = pointCloud.geometry;
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      const { center, size, maxDim } = viewer.centerCameraOnBounds(
        geometry.boundingBox,
        geometry.boundingSphere
      );

      // Respect GUI settings for axes
      viewer.setAxesVisible(ui.settings.showAxes);

      // Create coordinate grid with original coordinates (but keep it hidden by default)
      grid.createSurveyGrid(geometry.boundingBox, offset, viewer.getScene());
      grid.setGridVisible(ui.settings.showGrid);

      // Keep all folders closed by default
      // ui.openPointFolder();

      // Update GUI ranges based on actual data
      ui.updateGUIRanges(bounds);

      // Hide selection box by default
      selectionBox.visible = false;
      transformControls.visible = false;
      ui.boxSettings.visible = false;
      
      // Position selection box
      selection.positionSelectionBox(center, size, ui.boxSettings);

      // Update GUI
      ui.updateDisplay();

      // Reset originalColors when new file is loaded
      selection.resetOriginalColors();

      // Mark that this is no longer the default cloud
      viewer.setIsDefaultCloud(false, null);

      // Hide loading spinner
      stats.hideLoadingSpinner();

      console.log('Point cloud created!');
      stats.showDashboardMessage(`✓ Point cloud loaded! ${count.toLocaleString('nb-NO')} points visualized.`, 'info');

      // Marker at brukeren har lastet en fil
      hasUserUploadedFile = true;

      // Oppdater upload knapp visning etter fil er lastet
      updateUploadButtonVisibility();
      
      } catch (error) {
        stats.hideLoadingSpinner();
        console.error('Error parsing file:', error);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        stats.showDashboardMessage(`Error parsing: ${error.message}`, 'error');
      }
      }, 100); // Small delay to allow UI to update

    } catch (error) {
      stats.hideLoadingSpinner();
      console.error('Error parsing file:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      stats.showDashboardMessage(`Error parsing: ${error.message}`, 'error');
      }
    };

    // Check if we should trigger explosion
    if (viewer.getIsDefaultCloud()) {
      console.log('🎆 Default cloud detected! Starting explosion before loading new file...');
      stats.showDashboardMessage('🎆 Exploding logo...', 'info');

      // Trigger explosion, and load new file when animation is finished
      viewer.animateExplosion(() => {
        console.log('Explosion finished, loading new file...');
        processNewFile();
      });
    } else {
      // Not default cloud, load file directly
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

// Event listener for file input
fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  loadFile(file);
});

// Event listener for toolbar upload button
document.getElementById('toolbar-upload').addEventListener('click', () => {
  fileInput.click();
});

// Drag and Drop functionality
const body = document.body;

// Prevent default drag behavior
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

// Handle drop
body.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  body.classList.remove('dragging');

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];

    // Check file type
    const validExtensions = ['.txt', '.xyz', '.pcd', '.ply'];
    const fileName = file.name.toLowerCase();
    const isValid = validExtensions.some(ext => fileName.endsWith(ext));

    if (isValid) {
      loadFile(file);
    } else {
      stats.showDashboardMessage('Invalid file type. Supported formats: .txt, .xyz, .pcd, .ply', 'error');
    }
  }
});

console.log('3D Point Cloud Visualization - Ready!');
console.log('Upload a .xyz file to get started.');
console.log('You can also drag and drop files directly on the page!');