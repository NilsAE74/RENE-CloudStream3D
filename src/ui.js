import GUI from 'lil-gui';
import * as viewer from './viewer.js';
import * as selection from './selection.js';
import * as stats from './stats.js';
import * as report from './report.js';
import * as grid from './grid.js';

let gui;
let pointFolder, sceneFolder, controlsFolder, boxFolder, measurementFolder, profileFolder;
let boxControllers = {};

// Settings objekter
export const settings = {
  pointSize: 0.2,
  pointColor: '#ffffff',
  backgroundColor: '#000000',
  useHeightColor: true,
  showAxes: false,
  showGrid: false,
  showLegend: true
};

// Report metadata
export const reportSettings = {
  projectName: 'My Project',
  datum: 'ED50',
  projection: 'UTM 32N',
  description: 'Point cloud data',
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
  selectPoints: null,  // Will be set later
  saveSelected: null   // Will be set later
};

// Measurement tool settings
export const measurementSettings = {
  active: false,
  clearAll: null,  // Will be set later
  measurementTool: null  // Reference to MeasurementTool instance
};

// Profile tool settings
export const profileSettings = {
  active: false,
  thickness: 1.0,
  drawProfile: null,  // Will be set later
  clearProfile: null,  // Will be set later
  profileTool: null  // Reference to profile tool instance
};

/**
 * Initializes the toolbar
 */
export function initToolbar() {
  const resetBtn = document.getElementById('toolbar-reset');
  const heatmapBtn = document.getElementById('toolbar-heatmap');
  const gridBtn = document.getElementById('toolbar-grid');
  const profileBtn = document.getElementById('toolbar-profile');
  const measurementBtn = document.getElementById('toolbar-measurement');

    // Reset View button
    resetBtn.addEventListener('click', () => {
      const pointCloud = viewer.getPointCloud();
      if (pointCloud) {
        // Recompute bounding box and sphere
        pointCloud.geometry.computeBoundingBox();
        pointCloud.geometry.computeBoundingSphere();
        
        // Center camera on the point cloud
        viewer.centerCameraOnBounds(
          pointCloud.geometry.boundingBox,
          pointCloud.geometry.boundingSphere
        );
        
        console.log('Camera view reset to show entire point cloud');
      } else {
        console.warn('No point cloud to reset view for');
      }
    });

  // Heatmap button - toggle height-based color
  heatmapBtn.addEventListener('click', () => {
    settings.useHeightColor = !settings.useHeightColor;
    
    const pointCloud = viewer.getPointCloud();
    if (pointCloud) {
      pointCloud.material.vertexColors = settings.useHeightColor;
      if (!settings.useHeightColor) {
        pointCloud.material.color.set(settings.pointColor);
      }
      pointCloud.material.needsUpdate = true;
    }

    // Toggle active state
    heatmapBtn.classList.toggle('active', settings.useHeightColor);

    // Update legend visibility
    setLegendVisible(settings.useHeightColor);
    
    // Update GUI display
    updateDisplay();
  });

  // Grid button - toggle grid visibility
  gridBtn.addEventListener('click', () => {
    settings.showGrid = !settings.showGrid;
    grid.setGridVisible(settings.showGrid);
    gridBtn.classList.toggle('active', settings.showGrid);
    updateDisplay();
  });

  // Profile button - activate cross-section tool
  profileBtn.addEventListener('click', () => {
    if (profileSettings.profileTool) {
      const isActive = !profileSettings.active;
      
      if (isActive) {
        profileSettings.active = true;
        
        // Set callback to re-enable controls when drawing completes
        profileSettings.profileTool.setOnDrawingComplete(() => {
          // Re-enable OrbitControls after profile is drawn
          const controls = viewer.getControls();
          if (controls) {
            controls.enabled = true;
          }
          // Keep the button active since profile is still visible
        });
        
        profileSettings.profileTool.startDrawing();
        stats.showDashboardMessage('✂️ Click twice to define profile line', 'info');
        
        // Disable OrbitControls while drawing
        const controls = viewer.getControls();
        if (controls) {
          controls.enabled = false;
        }
      } else {
        profileSettings.profileTool.clearProfile();
        profileSettings.active = false;
        
        // Re-enable OrbitControls
        const controls = viewer.getControls();
        if (controls) {
          controls.enabled = true;
        }
      }
      
      profileBtn.classList.toggle('active', isActive);
      
      // Deactivate measurement if it's active
      if (isActive && measurementSettings.active) {
        measurementSettings.active = false;
        if (measurementSettings.measurementTool) {
          measurementSettings.measurementTool.setActive(false);
        }
        measurementBtn.classList.remove('active');
        
        // Re-enable controls since we're switching tools
        const controls = viewer.getControls();
        if (controls) {
          controls.enabled = true;
        }
      }
    }
  });

  // Measurement button - activate measurement tool
  measurementBtn.addEventListener('click', () => {
    if (measurementSettings.measurementTool) {
      measurementSettings.active = !measurementSettings.active;
      measurementSettings.measurementTool.setActive(measurementSettings.active);
      measurementBtn.classList.toggle('active', measurementSettings.active);
      
      // Show/hide measurement panel
      if (measurementSettings.active) {
        measurementSettings.measurementTool.showMeasurementPanel();
      } else {
        measurementSettings.measurementTool.hideMeasurementPanel();
      }
      
      // Update GUI display to sync the checkbox
      updateDisplay();
      
      // Note: We keep OrbitControls enabled for measurement tool
      // so users can navigate while measuring
      
      // Deactivate profile if it's active
      if (measurementSettings.active && profileSettings.active) {
        profileSettings.active = false;
        if (profileSettings.profileTool) {
          profileSettings.profileTool.clearProfile();
        }
        profileBtn.classList.remove('active');
        
        // Re-enable controls since profile is cleared
        const controls = viewer.getControls();
        if (controls) {
          controls.enabled = true;
        }
      }
    }
  });

  // Set initial states
  heatmapBtn.classList.toggle('active', settings.useHeightColor);
  gridBtn.classList.toggle('active', settings.showGrid);
}

/**
 * Initialiserer GUI
 */
export function initGUI() {
  // Initialize toolbar first
  initToolbar();

  gui = new GUI();
  gui.title('Point Cloud Viewer');
  gui.close(); // Collapse main menu by default
  gui.domElement.style.position = 'absolute';
  gui.domElement.style.top = '20px';
  gui.domElement.style.right = '20px';
  gui.domElement.classList.add('glass-panel');

  // Point cloud settings folder
  pointFolder = gui.addFolder('⚙️ Point Cloud Settings');
  
  const sizeController = pointFolder.add(settings, 'pointSize', 0.01, 1, 0.01).name('Point Size');
  const colorController = pointFolder.addColor(settings, 'pointColor').name('Point Color');
  const heightColorController = pointFolder.add(settings, 'useHeightColor').name('Height-based Color');
  pointFolder.close(); // Closed by default

  // Scene settings folder
  sceneFolder = gui.addFolder('🎥 Scene Settings');
  const bgColorController = sceneFolder.addColor(settings, 'backgroundColor').name('Background Color');
  sceneFolder.add(settings, 'showAxes').name('Show/Hide Axes').onChange((value) => {
    viewer.setAxesVisible(value);
  });
  sceneFolder.add(settings, 'showGrid').name('Show/Hide Coordinate Grid').onChange((value) => {
    grid.setGridVisible(value);
  });
  sceneFolder.add(settings, 'showLegend').name('Show/Hide Height Legend').onChange((value) => {
    setLegendVisible(value);
  });
  sceneFolder.close(); // Closed by default

  // Controls folder
  controlsFolder = gui.addFolder('🔧 Controls');
  controlsFolder.add({ invertZ: () => handleInvertZ() }, 'invertZ').name('🔄 Invert Z-axis');

  // Ensure Controls folder stays closed by default
  controlsFolder.close();

  // Override the open method to prevent Controls folder from opening
  const originalOpen = controlsFolder.open;
  controlsFolder.open = function() {
    // Keep it closed by default - only allow manual opening if really needed
    return this;
  };

  // Rapport & Lokasjon folder
  setupReportGUI();

  // Selection Box folder
  setupSelectionBoxGUI();
  
  // Måleverktøy folder
  setupMeasurementGUI();
  
  // Profile tool folder
  setupProfileGUI();

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

  // Ensure Controls folder stays closed after all initialization
  const ensureControlsClosed = () => {
    if (controlsFolder) {
      controlsFolder.close();
      // Also force the DOM state
      if (controlsFolder.domElement) {
        const title = controlsFolder.domElement.querySelector('.lil-title');
        const content = controlsFolder.domElement.querySelector('.lil-content');
        if (title && content) {
          title.setAttribute('aria-expanded', 'false');
          content.style.display = 'none';
        }
      }
    }
  };

  // Try multiple times to ensure it stays closed
  setTimeout(ensureControlsClosed, 0);
  setTimeout(ensureControlsClosed, 50);
  setTimeout(ensureControlsClosed, 100);
  setTimeout(ensureControlsClosed, 200);

  return gui;
}

/**
 * Sets up Selection Box GUI
 */
function setupSelectionBoxGUI() {
  boxFolder = gui.addFolder('🎯 Selection Box');

  boxControllers.visible = boxFolder.add(boxSettings, 'visible').name('Show Box').onChange((value) => {
    const selBox = selection.getSelectionBox();
    const transControls = selection.getTransformControls();
    const pointCloud = viewer.getPointCloud();

    selBox.visible = value;
    transControls.visible = value;

    // Automatically select points when box is activated (without alert)
    if (value && pointCloud) {
      selection.selectPointsInBox(pointCloud, boxSettings, false);
    } else if (!value && pointCloud) {
      selection.restoreOriginalColors(pointCloud);
    }
  });

  boxControllers.mode = boxFolder.add(boxSettings, 'transformMode', ['translate', 'rotate', 'scale']).name('Control Mode').onChange((value) => {
    selection.getTransformControls().setMode(value);
  });

  boxFolder.add(boxSettings, 'hideOutside').name('Fade Outside').onChange(() => {
    if (boxSettings.visible) {
      selection.selectPointsInBox(viewer.getPointCloud(), boxSettings, false);
    }
  });

  boxControllers.x = boxFolder.add(boxSettings, 'x', -100, 100, 0.1).name('Position X').onChange((value) => {
    selection.getSelectionBox().position.x = value;
    if (boxSettings.visible) {
      selection.selectPointsInBox(viewer.getPointCloud(), boxSettings, false);
    }
  });

  boxControllers.y = boxFolder.add(boxSettings, 'y', -100, 100, 0.1).name('Position Y').onChange((value) => {
    selection.getSelectionBox().position.y = value;
    if (boxSettings.visible) {
      selection.selectPointsInBox(viewer.getPointCloud(), boxSettings, false);
    }
  });

  boxControllers.z = boxFolder.add(boxSettings, 'z', -100, 100, 0.1).name('Position Z (Height)').onChange((value) => {
    selection.getSelectionBox().position.z = value;
    if (boxSettings.visible) {
      selection.selectPointsInBox(viewer.getPointCloud(), boxSettings, false);
    }
  });
  
  boxControllers.width = boxFolder.add(boxSettings, 'width', 0.1, 50, 0.1).name('Width (X)').onChange((value) => {
    selection.updateBoxSize(value, boxSettings.height, boxSettings.depth);
    if (boxSettings.visible) {
      selection.selectPointsInBox(viewer.getPointCloud(), boxSettings, false);
    }
  });

  boxControllers.height = boxFolder.add(boxSettings, 'height', 0.1, 50, 0.1).name('Depth (Y)').onChange((value) => {
    selection.updateBoxSize(boxSettings.width, value, boxSettings.depth);
    if (boxSettings.visible) {
      selection.selectPointsInBox(viewer.getPointCloud(), boxSettings, false);
    }
  });

  boxControllers.depth = boxFolder.add(boxSettings, 'depth', 0.1, 50, 0.1).name('Height (Z)').onChange((value) => {
    selection.updateBoxSize(boxSettings.width, boxSettings.height, value);
    if (boxSettings.visible) {
      selection.selectPointsInBox(viewer.getPointCloud(), boxSettings, false);
    }
  });

  // Buttons for selection and saving
  boxSettings.selectPoints = () => {
    selection.selectPointsInBox(viewer.getPointCloud(), boxSettings, true);
  };
  boxSettings.saveSelected = () => {
    selection.saveSelectedPoints(viewer.getPointCloud(), boxSettings);
  };

  boxFolder.add(boxSettings, 'selectPoints').name('🔍 Select Points');
  boxFolder.add(boxSettings, 'saveSelected').name('💾 Save Selected');
  boxFolder.close();
}

/**
 * Updates GUI ranges based on data bounds
 */
export function updateGUIRanges(bounds) {
  const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;
  const padding = 10;

  // Update position sliders
  boxControllers.x.min(minX - padding).max(maxX + padding);
  boxControllers.y.min(minY - padding).max(maxY + padding);
  boxControllers.z.min(minZ - padding).max(maxZ + padding);

  // Update size sliders
  const maxWidth = (maxX - minX) * 2;
  const maxHeight = (maxY - minY) * 2;
  const maxDepth = (maxZ - minZ) * 2;

  boxControllers.width.min(0.1).max(maxWidth);
  boxControllers.height.min(0.1).max(maxHeight);
  boxControllers.depth.min(0.1).max(maxDepth);

  console.log('GUI ranges updated based on data bounds');
}

/**
 * Opens point cloud folder
 */
export function openPointFolder() {
  pointFolder.open();
}

/**
 * Updates GUI display
 */
export function updateDisplay() {
  // Update all controllers in GUI
  gui.controllersRecursive().forEach(controller => controller.updateDisplay());

  // Respect visibility settings for axes and grid
  viewer.setAxesVisible(settings.showAxes);
  grid.setGridVisible(settings.showGrid);
}

/**
 * Handles Z-axis inversion
 */
function handleInvertZ() {
  const result = viewer.invertZAxis();

  if (!result) {
    console.warn('Could not invert Z-axis');
    return;
  }

  const { center, size, positions, boundingBox, originalMinZ, originalMaxZ } = result;

  const pointCount = positions.length / 3;

  // Get coordinate offset to calculate original X/Y bounds
  const offset = viewer.getCoordinateOffset();
  
  // Convert centered positions back to original for histogram
  const originalPositions = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    originalPositions[i] = positions[i] + offset.x;
    originalPositions[i + 1] = positions[i + 1] + offset.y;
    originalPositions[i + 2] = positions[i + 2] + offset.z;  // Using the inverted offset
  }

  // Update dashboard with ORIGINAL values
  stats.updateDashboard(pointCount, {
    minX: boundingBox.min.x + offset.x,
    maxX: boundingBox.max.x + offset.x,
    minY: boundingBox.min.y + offset.y,
    maxY: boundingBox.max.y + offset.y,
    minZ: originalMinZ,  // Already converted to original in viewer.js
    maxZ: originalMaxZ   // Already converted to original in viewer.js
  }, originalPositions);

  // Update legend with new Z-values
  updateLegend(originalMinZ, originalMaxZ);

  // Update statistics for report with new Z-values AND positions
  if (currentStats) {
    currentStats.minZ = originalMinZ;
    currentStats.maxZ = originalMaxZ;
    currentStats.positions = originalPositions;  // Update positions for histogram
    console.log('Statistics updated for PDF export with inverted Z-values and positions');
  }

  stats.showDashboardMessage('✓ Z-axis inverted!', 'info');

  // Update selection box if active
  const selectionBox = selection.getSelectionBox();
  if (selectionBox && boxSettings.visible) {
    // Invert box position Z
    selectionBox.position.z = -selectionBox.position.z;
    boxSettings.z = selectionBox.position.z;

    // Update selection
    selection.selectPointsInBox(viewer.getPointCloud(), boxSettings, false);
  } else {
    // Reposition selection box to new bounds (even if hidden)
    selection.positionSelectionBox(center, size, boxSettings);
  }

  // Update GUI display
  updateDisplay();

  // Update grid with inverted coordinates
  grid.updateGrid(boundingBox, offset, viewer.getScene());
  grid.setGridVisible(settings.showGrid);

  console.log('Z-axis inversion completed');
}

/**
 * Sets up Measurement Tool GUI
 */
function setupMeasurementGUI() {
  measurementFolder = gui.addFolder('📏 Measurement Tool');

  // Activate measurement checkbox
  measurementFolder.add(measurementSettings, 'active').name('Activate Measurement').onChange((value) => {
    if (measurementSettings.measurementTool) {
      measurementSettings.measurementTool.setActive(value);

      // Update toolbar button active state
      const measurementBtn = document.getElementById('toolbar-measurement');
      if (measurementBtn) {
        if (value) {
          measurementBtn.classList.add('active');
        } else {
          measurementBtn.classList.remove('active');
        }
      }

      // Show/hide measurement panel
      if (value) {
        measurementSettings.measurementTool.showMeasurementPanel();
      } else {
        measurementSettings.measurementTool.hideMeasurementPanel();
      }
    }
  });

  // Delete all measurements button
  measurementSettings.clearAll = () => {
    if (measurementSettings.measurementTool) {
      measurementSettings.measurementTool.clearAllMeasurements();
      stats.showDashboardMessage('✓ All measurements deleted', 'info');
    }
  };

  measurementFolder.add(measurementSettings, 'clearAll').name('🗑️ Delete All Measurements');
  measurementFolder.close();
}

/**
 * Sets up Report & Location GUI
 */
function setupReportGUI() {
  const reportFolder = gui.addFolder('📄 Report & Location');

  reportFolder.add(reportSettings, 'projectName').name('Project Name');
  reportFolder.add(reportSettings, 'datum').name('Datum');
  reportFolder.add(reportSettings, 'projection').name('Projection');
  reportFolder.add(reportSettings, 'description').name('Description');

  reportFolder.add(reportSettings, 'generateReport').name('📥 Generate PDF Report');
  reportFolder.close();
}

/**
 * Handles PDF report generation
 */
async function handleGenerateReport() {
  try {
    if (!currentStats) {
      stats.showDashboardMessage('⚠️ Load a point cloud first', 'error');
      return;
    }

    // Show loading spinner
    stats.showLoadingSpinner('Generating PDF report...');
    stats.showDashboardMessage('⏳ Generating PDF report...', 'info');
    
    // Use positions from stored statistics (original coordinates)
    const positions = currentStats.positions || null;
    
    const reportData = {
      projectName: reportSettings.projectName,
      datum: reportSettings.datum,
      projection: reportSettings.projection,
      description: reportSettings.description,
      pointCount: currentStats.pointCount,
      minZ: currentStats.minZ,
      maxZ: currentStats.maxZ,
      areaX: currentStats.areaX,
      areaY: currentStats.areaY,
      resolution: currentStats.resolution,
      positions: positions  // Add positions for histogram
    };
    
    await report.generatePDFReport(
      reportData, 
      viewer.getRenderer(),
      stats,
      profileSettings.profileTool  // Pass profile tool for optional profile export
    );
    
    // Hide loading spinner
    stats.hideLoadingSpinner();
    stats.showDashboardMessage('✓ PDF report generated and downloaded!', 'info');

  } catch (error) {
    stats.hideLoadingSpinner();
    console.error('Error in report generation:', error);
    stats.showDashboardMessage('❌ Error in PDF generation', 'error');
  }
}

/**
 * Updates statistics for report
 */
export function updateStats(statsData) {
  currentStats = statsData;
}

/**
 * Gets renderer for PDF
 */
function getRendererForPDF() {
  // Get renderer via viewer module
  const scene = viewer.getScene();
  return scene ? scene.userData.renderer : null;
}

/**
 * Gets GUI
 */
export function getGUI() {
  return gui;
}

/**
 * Updates height legend with Z-values
 */
export function updateLegend(minZ, maxZ) {
  const legend = document.getElementById('height-legend');
  if (!legend) return;

  const maxLabel = legend.querySelector('.legend-max');
  const midLabel = legend.querySelector('.legend-mid');
  const minLabel = legend.querySelector('.legend-min');

  if (maxLabel && midLabel && minLabel) {
    maxLabel.textContent = maxZ.toFixed(2);
    midLabel.textContent = ((minZ + maxZ) / 2).toFixed(2);
    minLabel.textContent = minZ.toFixed(2);
  }

  // Vis legenden hvis den er aktivert
  if (settings.showLegend) {
    legend.style.display = 'block';
  }
}

/**
 * Shows/hides legend
 */
export function setLegendVisible(visible) {
  const legend = document.getElementById('height-legend');
  if (legend) {
    legend.style.display = visible ? 'block' : 'none';
  }
}

/**
 * Draggable Panel System
 * Gjør paneler flyttbare med drag & drop funksjonalitet
 */

export class DraggablePanel {
  constructor(panelElement, handleElement = null) {
    this.panel = panelElement;
    this.handle = handleElement || panelElement; // Bruk hele panelet som handle hvis ikke spesifisert
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragInitialX = 0;
    this.dragInitialY = 0;
    
    this.setupDragging();
  }
  
  setupDragging() {
    const onMouseDown = (e) => {
      // Ikke drag hvis klikk på interaktive elementer
      if (e.target.closest('button, input, select, textarea, .btn-icon, .measurement-close-btn')) {
        return;
      }
      
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      
      const rect = this.panel.getBoundingClientRect();
      this.dragInitialX = rect.left;
      this.dragInitialY = rect.top;
      
      document.body.style.cursor = 'move';
      document.body.style.userSelect = 'none';
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      
      e.preventDefault();
    };
    
    const onMouseMove = (e) => {
      if (!this.isDragging) return;
      
      const deltaX = e.clientX - this.dragStartX;
      const deltaY = e.clientY - this.dragStartY;
      
      const newLeft = this.dragInitialX + deltaX;
      const newTop = this.dragInitialY + deltaY;
      
      // Begrens til viewport
      const maxLeft = window.innerWidth - this.panel.offsetWidth;
      const maxTop = window.innerHeight - this.panel.offsetHeight;
      
      const constrainedLeft = Math.max(0, Math.min(newLeft, maxLeft));
      const constrainedTop = Math.max(0, Math.min(newTop, maxTop));
      
      // Oppdater posisjon
      this.panel.style.left = `${constrainedLeft}px`;
      this.panel.style.top = `${constrainedTop}px`;
      this.panel.style.bottom = 'auto'; // Fjern fixed bottom
      this.panel.style.transform = 'none';
      
      e.preventDefault();
    };
    
    const onMouseUp = () => {
      this.isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    this.handle.addEventListener('mousedown', onMouseDown);
  }
}

/**
 * Dashboard Minimize/Collapse Funksjonalitet
 */
class CollapsibleDashboard {
  constructor(dashboardElement) {
    this.dashboard = dashboardElement;
    this.isMinimized = false;
    this.setupCollapse();
  }
  
  setupCollapse() {
    // Legg til minimize knapp i dashboard header
    const header = this.dashboard.querySelector('h3');
    if (!header) return;
    
    // Wrap dashboard innhold i en container
    const content = document.createElement('div');
    content.className = 'dashboard-content';
    
    // Flytt alt etter header til content container
    while (header.nextSibling) {
      content.appendChild(header.nextSibling);
    }
    
    this.dashboard.appendChild(content);
    
    // Legg til minimize knapp
    const minimizeBtn = document.createElement('button');
    minimizeBtn.className = 'dashboard-minimize-btn';
    minimizeBtn.innerHTML = '−';
    minimizeBtn.title = 'Minimize panel';
    header.appendChild(minimizeBtn);
    
    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMinimize();
    });
  }
  
  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
    const minimizeBtn = this.dashboard.querySelector('.dashboard-minimize-btn');
    
    if (this.isMinimized) {
      this.dashboard.classList.add('minimized');
      minimizeBtn.innerHTML = '+';
      minimizeBtn.title = 'Expand panel';
    } else {
      this.dashboard.classList.remove('minimized');
      minimizeBtn.innerHTML = '−';
      minimizeBtn.title = 'Minimize panel';
    }
  }
}

// Initialiser draggable paneler når DOM er klar
export function initDraggablePanels() {
  // Gjør dashboard flyttbar og collapsable
  const dashboard = document.getElementById('dashboard');
  if (dashboard) {
    new DraggablePanel(dashboard, dashboard.querySelector('h3'));
    new CollapsibleDashboard(dashboard);
  }
  
  // Measurement panel initialiseres når det vises i measurement.js
  // Profile panel har allerede drag funksjonalitet i profile.js
  console.log('Draggable panels initialized');
}

/**
 * Sets reference to measurement tool
 */
export function setMeasurementTool(tool) {
  measurementSettings.measurementTool = tool;
}

/**
 * Sets up Profile Tool GUI
 */
function setupProfileGUI() {
  profileFolder = gui.addFolder('✂️ Profile Tool');

  // Thickness slider
  profileFolder.add(profileSettings, 'thickness', 0.1, 5.0, 0.1).name('Section Thickness (m)').onChange((value) => {
    if (profileSettings.profileTool) {
      profileSettings.profileTool.updateThickness(value);
    }
  });

  // Draw profile button
  profileSettings.drawProfile = () => {
    if (profileSettings.profileTool) {
      profileSettings.active = true;
      profileSettings.profileTool.startDrawing();
      stats.showDashboardMessage('✂️ Click twice to define profile line', 'info');
    }
  };

  // Clear profile button
  profileSettings.clearProfile = () => {
    if (profileSettings.profileTool) {
      profileSettings.profileTool.clearProfile();
      profileSettings.active = false;
      stats.showDashboardMessage('✓ Profile cleared', 'info');
    }
  };

  profileFolder.add(profileSettings, 'drawProfile').name('✏️ Draw Profile Line');
  profileFolder.add(profileSettings, 'clearProfile').name('🗑️ Clear Profile');
  profileFolder.close();
}

/**
 * Sets reference to profile tool
 */
export function setProfileTool(tool) {
  profileSettings.profileTool = tool;
}
