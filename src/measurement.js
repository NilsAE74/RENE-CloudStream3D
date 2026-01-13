import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { DraggablePanel } from './ui.js';

/**
 * MeasurementTool - Verktøy for å måle avstander mellom punkter i 3D
 * 
 * Funksjoner:
 * - Klikk på punkter for å måle avstand
 * - Viser rubber-band linje under bevegelse
 * - Beregner Delta X, Y, Z og total 3D-avstand
 * - Viser originale kartkoordinater
 */
export class MeasurementTool {
  constructor(scene, camera, rendererElement, coordinateOffset) {
    this.scene = scene;
    this.camera = camera;
    this.rendererElement = rendererElement;
    this.coordinateOffset = coordinateOffset || { x: 0, y: 0, z: 0 };
    
    // Raycaster for punkt-deteksjon
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Points.threshold = 0.15; // Lettere å treffe punkter
    
    // Tilstand
    this.isActive = false;
    this.isFirstPoint = true;
    this.startPoint = null;
    this.startMarker = null;
    this.rubberBandLine = null;
    this.measurements = []; // Lagrer alle målinger
    
    // CSS2D Renderer for labels
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0px';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    document.body.appendChild(this.labelRenderer.domElement);
    
    // Event listeners
    this.onMouseClickBound = this.onMouseClick.bind(this);
    this.onMouseMoveBound = this.onMouseMove.bind(this);
    this.onWindowResizeBound = this.onWindowResize.bind(this);
    
    // Window resize handler
    window.addEventListener('resize', this.onWindowResizeBound);
  }
  
  /**
   * Håndterer window resize
   */
  onWindowResize() {
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
  }
  
  /**
   * Aktiverer eller deaktiverer måleverktøyet
   */
  setActive(active) {
    this.isActive = active;
    
    if (active) {
      // Legg til event listeners
      this.rendererElement.addEventListener('click', this.onMouseClickBound);
      this.rendererElement.addEventListener('mousemove', this.onMouseMoveBound);
      
      // Show measurement panel
      this.showMeasurementPanel();
      
      console.log('📏 Measurement tool activated');
    } else {
      // Fjern event listeners
      this.rendererElement.removeEventListener('click', this.onMouseClickBound);
      this.rendererElement.removeEventListener('mousemove', this.onMouseMoveBound);
      
      // Fjern midlertidig geometri
      this.clearTemporaryGeometry();
      
      // Hide measurement panel
      this.hideMeasurementPanel();
      
      console.log('📏 Measurement tool deactivated');
    }
  }
  
  /**
   * Håndterer museklikk
   */
  onMouseClick(event) {
    if (!this.isActive) return;
    
    const intersect = this.getIntersectedPoint(event);
    
    if (!intersect) {
      console.log('No point hit');
      return;
    }
    
    if (this.isFirstPoint) {
      // Første klikk: Sett startpunkt
      this.startPoint = intersect.point.clone();
      this.createStartMarker(this.startPoint);
      this.isFirstPoint = false;
      
      // Konverter til originale koordinater for logging
      const startOrig = {
        x: this.startPoint.x + this.coordinateOffset.x,
        y: this.startPoint.y + this.coordinateOffset.y,
        z: this.startPoint.z + this.coordinateOffset.z
      };
      console.log('✓ Start point set (original coordinates):',
        `X: ${startOrig.x.toFixed(2)}, Y: ${startOrig.y.toFixed(2)}, Z: ${startOrig.z.toFixed(2)}`);
    } else {
      // Andre klikk: Lås sluttpunkt og fullfør målingen
      const endPoint = intersect.point.clone();
      this.completeMeasurement(this.startPoint, endPoint);
      
      // Nullstill for neste måling
      this.clearTemporaryGeometry();
      this.isFirstPoint = true;
      this.startPoint = null;
    }
  }
  
  /**
   * Håndterer musebevegelse (rubber band)
   */
  onMouseMove(event) {
    if (!this.isActive || this.isFirstPoint || !this.startPoint) return;
    
    const intersect = this.getIntersectedPoint(event);
    
    if (intersect) {
      this.updateRubberBand(this.startPoint, intersect.point);
    }
  }
  
  /**
   * Finn intersected point ved bruk av raycaster
   */
  getIntersectedPoint(event) {
    // Beregn normalized device coordinates
    const rect = this.rendererElement.getBoundingClientRect();
    const mouse = new THREE.Vector2();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Oppdater raycaster
    this.raycaster.setFromCamera(mouse, this.camera);
    
    // Finn punkter i scenen
    const pointClouds = this.scene.children.filter(obj => obj.type === 'Points');
    
    if (pointClouds.length === 0) return null;
    
    // Sjekk intersections
    const intersects = this.raycaster.intersectObjects(pointClouds, false);
    
    if (intersects.length > 0) {
      return intersects[0]; // Returner første (nærmeste) intersection
    }
    
    return null;
  }
  
  /**
   * Opprett startpunkt-markør (rød kule)
   */
  createStartMarker(position) {
    const geometry = new THREE.SphereGeometry(0.2, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    this.startMarker = new THREE.Mesh(geometry, material);
    this.startMarker.position.copy(position);
    this.scene.add(this.startMarker);
  }
  
  /**
   * Oppdater rubber band-linje
   */
  updateRubberBand(startPoint, endPoint) {
    // Fjern gammel linje
    if (this.rubberBandLine) {
      this.scene.remove(this.rubberBandLine);
      this.rubberBandLine.geometry.dispose();
      this.rubberBandLine.material.dispose();
    }
    
    // Opprett stiplet linje
    const points = [startPoint, endPoint];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
      color: 0xffff00,
      dashSize: 0.3,
      gapSize: 0.2,
      linewidth: 2
    });
    
    this.rubberBandLine = new THREE.Line(geometry, material);
    this.rubberBandLine.computeLineDistances(); // Nødvendig for dashed lines
    this.scene.add(this.rubberBandLine);
  }
  
  /**
   * Fullfør måling og opprett permanent geometri
   */
  completeMeasurement(startPoint, endPoint) {
    // Beregn avstander (i sentrerte koordinater)
    const deltaX = endPoint.x - startPoint.x;
    const deltaY = endPoint.y - startPoint.y;
    const deltaZ = endPoint.z - startPoint.z;
    const distance3D = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
    
    // Konverter til originale koordinater
    const startOriginal = {
      x: startPoint.x + this.coordinateOffset.x,
      y: startPoint.y + this.coordinateOffset.y,
      z: startPoint.z + this.coordinateOffset.z
    };
    
    const endOriginal = {
      x: endPoint.x + this.coordinateOffset.x,
      y: endPoint.y + this.coordinateOffset.y,
      z: endPoint.z + this.coordinateOffset.z
    };
    
    console.log('📏 Measurement completed:');
    console.log(`  Start: (${startOriginal.x.toFixed(2)}, ${startOriginal.y.toFixed(2)}, ${startOriginal.z.toFixed(2)})`);
    console.log(`  Slutt: (${endOriginal.x.toFixed(2)}, ${endOriginal.y.toFixed(2)}, ${endOriginal.z.toFixed(2)})`);
    console.log(`  ΔX: ${deltaX.toFixed(2)} m, ΔY: ${deltaY.toFixed(2)} m, ΔZ: ${deltaZ.toFixed(2)} m`);
    console.log(`  Total avstand: ${distance3D.toFixed(2)} m`);
    
    // Opprett solid linje
    const points = [startPoint, endPoint];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
    const line = new THREE.Line(geometry, material);
    
    // Opprett sluttpunkt-markør (grønn kule)
    const endMarkerGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const endMarkerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const endMarker = new THREE.Mesh(endMarkerGeometry, endMarkerMaterial);
    endMarker.position.copy(endPoint);
    
    // Opprett label (midt på linjen)
    const midPoint = new THREE.Vector3(
      (startPoint.x + endPoint.x) / 2,
      (startPoint.y + endPoint.y) / 2,
      (startPoint.z + endPoint.z) / 2
    );
    
    const labelDiv = document.createElement('div');
    labelDiv.className = 'measurement-label';
    labelDiv.textContent = `L: ${distance3D.toFixed(2)} m`;
    labelDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    labelDiv.style.color = '#00ff00';
    labelDiv.style.padding = '4px 8px';
    labelDiv.style.borderRadius = '4px';
    labelDiv.style.fontSize = '14px';
    labelDiv.style.fontWeight = 'bold';
    labelDiv.style.whiteSpace = 'nowrap';
    
    const label = new CSS2DObject(labelDiv);
    label.position.copy(midPoint);
    
    // Lagre målingen
    const measurement = {
      startPoint: startPoint.clone(),
      endPoint: endPoint.clone(),
      startOriginal,
      endOriginal,
      deltaX,
      deltaY,
      deltaZ,
      distance3D,
      line,
      startMarker: this.startMarker, // Gjenbruk startMarker
      endMarker,
      label,
      id: Date.now() // Unik ID
    };
    
    this.measurements.push(measurement);
    
    // Legg til i scene
    this.scene.add(line);
    this.scene.add(endMarker);
    this.scene.add(label);
    
    // Ikke fjern startMarker her, den blir en del av målingen
    this.startMarker = null;
    
    console.log(`✓ Measurement saved (total ${this.measurements.length} measurements)`);
    
    // Update measurement panel with the latest measurement
    this.updateMeasurementPanel(measurement);
    
    // Returner målingen for dashboard-oppdatering
    return measurement;
  }
  
  /**
   * Fjern midlertidig geometri (under pågående måling)
   */
  clearTemporaryGeometry() {
    if (this.startMarker) {
      this.scene.remove(this.startMarker);
      this.startMarker.geometry.dispose();
      this.startMarker.material.dispose();
      this.startMarker = null;
    }
    
    if (this.rubberBandLine) {
      this.scene.remove(this.rubberBandLine);
      this.rubberBandLine.geometry.dispose();
      this.rubberBandLine.material.dispose();
      this.rubberBandLine = null;
    }
  }
  
  /**
   * Slett alle målinger
   */
  clearAllMeasurements() {
    for (const measurement of this.measurements) {
      this.scene.remove(measurement.line);
      this.scene.remove(measurement.startMarker);
      this.scene.remove(measurement.endMarker);
      this.scene.remove(measurement.label);
      
      measurement.line.geometry.dispose();
      measurement.line.material.dispose();
      measurement.startMarker.geometry.dispose();
      measurement.startMarker.material.dispose();
      measurement.endMarker.geometry.dispose();
      measurement.endMarker.material.dispose();
    }
    
    this.measurements = [];
    this.clearTemporaryGeometry();
    this.isFirstPoint = true;
    this.startPoint = null;
    
    // Reset panel display
    this.resetMeasurementPanel();
    
    console.log('✓ All measurements deleted');
  }
  
  /**
   * Hent siste måling (for dashboard)
   */
  getLastMeasurement() {
    if (this.measurements.length === 0) return null;
    return this.measurements[this.measurements.length - 1];
  }
  
  /**
   * Hent alle målinger
   */
  getAllMeasurements() {
    return this.measurements;
  }
  
  /**
   * Oppdater coordinate offset
   */
  setCoordinateOffset(offset) {
    this.coordinateOffset = offset;
  }
  
  /**
   * Render labels (må kalles i animasjonsloop)
   */
  render() {
    this.labelRenderer.render(this.scene, this.camera);
  }
  
  /**
   * Show measurement panel
   */
  showMeasurementPanel() {
    const panel = document.getElementById('measurement-panel');
    if (panel) {
      panel.style.display = 'block';

      // Initialiser drag funksjonalitet første gang panelet vises
      if (!panel._dragInitialized) {
        new DraggablePanel(panel, panel.querySelector('.measurement-header'));
        panel._dragInitialized = true;
      }

      // Set up close button handler if not already set
      const closeBtn = document.getElementById('measurement-close');
      if (closeBtn && !closeBtn._hasClickHandler) {
        closeBtn.addEventListener('click', () => {
          this.hideMeasurementPanel();
          // Deactivate tool when panel is closed
          this.setActive(false);
          
          // Update toolbar button state
          const measurementBtn = document.getElementById('toolbar-measurement');
          if (measurementBtn) {
            measurementBtn.classList.remove('active');
          }
        });
        closeBtn._hasClickHandler = true;
      }
      
      // Reset panel to default state
      this.resetMeasurementPanel();
    }
  }
  
  /**
   * Hide measurement panel
   */
  hideMeasurementPanel() {
    const panel = document.getElementById('measurement-panel');
    if (panel) {
      panel.style.display = 'none';
    }
  }
  
  /**
   * Reset measurement panel to default state
   */
  resetMeasurementPanel() {
    const lengthEl = document.getElementById('measurement-length');
    const deltaXEl = document.getElementById('measurement-delta-x');
    const deltaYEl = document.getElementById('measurement-delta-y');
    const deltaZEl = document.getElementById('measurement-delta-z');
    
    if (lengthEl) lengthEl.textContent = '--';
    if (deltaXEl) deltaXEl.textContent = '--';
    if (deltaYEl) deltaYEl.textContent = '--';
    if (deltaZEl) deltaZEl.textContent = '--';
  }
  
  /**
   * Update measurement panel with measurement data
   */
  updateMeasurementPanel(measurement) {
    const lengthEl = document.getElementById('measurement-length');
    const deltaXEl = document.getElementById('measurement-delta-x');
    const deltaYEl = document.getElementById('measurement-delta-y');
    const deltaZEl = document.getElementById('measurement-delta-z');
    
    if (lengthEl) {
      lengthEl.textContent = `${measurement.distance3D.toFixed(2)} m`;
    }
    
    if (deltaXEl) {
      deltaXEl.textContent = `${measurement.deltaX >= 0 ? '+' : ''}${measurement.deltaX.toFixed(3)} m`;
    }
    
    if (deltaYEl) {
      deltaYEl.textContent = `${measurement.deltaY >= 0 ? '+' : ''}${measurement.deltaY.toFixed(3)} m`;
    }
    
    if (deltaZEl) {
      deltaZEl.textContent = `${measurement.deltaZ >= 0 ? '+' : ''}${measurement.deltaZ.toFixed(3)} m`;
    }
  }
  
  /**
   * Cleanup
   */
  dispose() {
    this.setActive(false);
    this.clearAllMeasurements();
    
    // Remove window resize event listener to prevent memory leak
    window.removeEventListener('resize', this.onWindowResizeBound);
    
    if (this.labelRenderer && this.labelRenderer.domElement) {
      document.body.removeChild(this.labelRenderer.domElement);
    }
  }
}
