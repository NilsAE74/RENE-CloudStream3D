import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * PointCloudViewer class for managing 3D point cloud visualization
 */
export class PointCloudViewer {
  constructor(containerElement = null) {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.axesHelper = null;
    this.pointCloud = null;
    this.coordinateOffset = { x: 0, y: 0, z: 0 }; // Lagrer offset fra sentrering
    this.isDefaultCloud = false; // Flagg for å vite om det er default-skyen
    this.explosionVelocities = null; // Lagrer velocity-data for eksplosjon
    this.measurementTool = null; // Referanse til measurement tool for rendering

    if (containerElement) {
      this.init(containerElement);
    }
  }

  /**
   * Initialiserer Three.js viewer
   */
  init(containerElement) {
    // Sett opp scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    // Legg til AxesHelper for å vise X, Y, Z akser
    // Rød = X, Grønn = Y, Blå = Z (Z peker opp)
    this.axesHelper = new THREE.AxesHelper(5);
    this.scene.add(this.axesHelper);

    // Sett opp kamera
    this.camera = new THREE.PerspectiveCamera(
      75, // Field of view
      window.innerWidth / window.innerHeight, // Aspect ratio
      0.1, // Near clipping plane
      1000 // Far clipping plane
    );
    // Sett Z-aksen som "opp" (standard i GIS/surveying)
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(5, 5, 5);
    this.camera.lookAt(0, 0, 0);

    // Sett opp renderer (preserveDrawingBuffer for PDF screenshots)
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true  // Nødvendig for screenshots
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // Append to provided container or document.body
    const targetContainer = containerElement || document.body;
    targetContainer.appendChild(this.renderer.domElement);

    // Sett opp OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    // Håndter resize av nettleservindu - bind til this instance
    window.addEventListener('resize', () => this.onWindowResize());

    return { scene: this.scene, camera: this.camera, renderer: this.renderer, controls: this.controls };
  }

  /**
   * Håndterer window resize
   */
  onWindowResize() {
    if (this.camera && this.renderer) {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  /**
   * Animasjons-loop
   */
  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    // Render measurement labels hvis measurement tool er aktiv
    if (this.measurementTool) {
      this.measurementTool.render();
    }
  }

  /**
   * Setter koordinat-offset (brukes ved inversjon)
   */
  setCoordinateOffset(offsetX, offsetY, offsetZ) {
    this.coordinateOffset.x = offsetX;
    this.coordinateOffset.y = offsetY;
    this.coordinateOffset.z = offsetZ;
  }

  /**
   * Henter koordinat-offset
   */
  getCoordinateOffset() {
    return this.coordinateOffset;
  }

  /**
   * Legger til punktsky i scenen
   */
  addPointCloud(positions, colors, pointSize, useHeightColor, pointColor) {
    // Fjern gammel punktsky hvis den finnes
    if (this.pointCloud) {
      this.scene.remove(this.pointCloud);
      this.pointCloud.geometry.dispose();
      this.pointCloud.material.dispose();
    }

    // Opprett BufferGeometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    // Opprett materiale for punktene
    const material = new THREE.PointsMaterial({
      size: pointSize,
      vertexColors: useHeightColor,
      sizeAttenuation: true,
      color: useHeightColor ? 0xffffff : pointColor
    });

    // Lag punktsky
    this.pointCloud = new THREE.Points(geometry, material);
    this.scene.add(this.pointCloud);

    return this.pointCloud;
  }

  /**
   * Henter punktskyen
   */
  getPointCloud() {
    return this.pointCloud;
  }

  /**
   * Setter punktskyen
   */
  setPointCloud(cloud) {
    this.pointCloud = cloud;
  }

  /**
   * Oppdaterer kamera for å sentrere på punktsky
   */
  centerCameraOnBounds(boundingBox, boundingSphere) {
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);

    const size = new THREE.Vector3();
    boundingBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);

    console.log('Bounding box:');
    console.log(`  Min: (${boundingBox.min.x.toFixed(2)}, ${boundingBox.min.y.toFixed(2)}, ${boundingBox.min.z.toFixed(2)})`);
    console.log(`  Max: (${boundingBox.max.x.toFixed(2)}, ${boundingBox.max.y.toFixed(2)}, ${boundingBox.max.z.toFixed(2)})`);
    console.log(`  Center: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`);
    console.log(`  Size: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`);
    console.log(`  Max dimension: ${maxDim.toFixed(2)}`);

    // Sentrer kameraet perfekt på punktskyen
    const radius = boundingSphere.radius;
    const fov = this.camera.fov * (Math.PI / 180);
    let distance = Math.abs(radius / Math.sin(fov / 2));

    // Legg til litt ekstra avstand for bedre visning
    distance *= 1.5;

    // Juster kamera clipping planes for store scener
    this.camera.near = radius / 1000;
    this.camera.far = radius * 100;
    this.camera.updateProjectionMatrix();

    console.log(`Kamera innstillinger: near=${this.camera.near.toFixed(3)}, far=${this.camera.far.toFixed(1)}, distance=${distance.toFixed(2)}`);

    // Plasser kameraet i en god vinkel (Z er opp, så vi ser fra siden/ovenifra)
    // X = høyre, Y = fremover, Z = opp
    this.camera.position.set(
      center.x + distance * 0.7,  // Litt til høyre
      center.y - distance * 0.7,  // Litt bakover (for å se fremover på modellen)
      center.z + distance * 0.5   // Litt over (Z er opp)
    );

    // Oppdater OrbitControls target
    this.controls.target.copy(center);
    this.controls.update();

    // Juster AxesHelper størrelse basert på modellstørrelse
    const axesSize = maxDim * 0.3;
    this.axesHelper.scale.setScalar(axesSize / 5); // 5 er original størrelse
    this.axesHelper.position.copy(center);

    console.log('Aksekors: Rød=X (høyre), Grønn=Y (fremover), Blå=Z (opp)');

    return { center, size, maxDim };
  }

  /**
   * Setter bakgrunnsfarge
   */
  setBackgroundColor(color) {
    this.scene.background.set(color);
  }

  /**
   * Viser/skjuler aksekors
   */
  setAxesVisible(visible) {
    if (this.axesHelper) {
      this.axesHelper.visible = visible;
    }
  }

  /**
   * Legger til objekt i scenen
   */
  addToScene(object) {
    this.scene.add(object);
  }

  /**
   * Fjerner objekt fra scenen
   */
  removeFromScene(object) {
    this.scene.remove(object);
  }

  /**
   * Henter renderer domElement for å koble til andre controls
   */
  getRendererElement() {
    return this.renderer.domElement;
  }

  /**
   * Henter renderer for PDF-generering
   */
  getRenderer() {
    return this.renderer;
  }

  /**
   * Genererer et kart-bilde (topp-visning) for PDF-rapport
   * Bruker ortografisk kamera for flat projeksjon uten perspektivforvrengning
   */
  async generateMapImage(resolution = 2048, pointResolution = null) {
    return new Promise((resolve, reject) => {
      try {
        if (!this.pointCloud) {
          reject(new Error('Ingen punktsky å visualisere'));
          return;
        }

        // === 1. Lagre nåværende tilstand ===
        const originalBackground = this.scene.background.clone();
        const originalAxesVisible = this.axesHelper ? this.axesHelper.visible : false;
        const originalRendererSize = {
          width: this.renderer.domElement.width,
          height: this.renderer.domElement.height
        };

        // Lagre original material-innstillinger
        const originalPointSize = this.pointCloud.material.size;
        const originalOpacity = this.pointCloud.material.opacity;
        const originalTransparent = this.pointCloud.material.transparent;

        // === 2. Sett opp kart-modus for PDF ===
        this.scene.background = new THREE.Color(0xffffff); // Hvit bakgrunn
        if (this.axesHelper) this.axesHelper.visible = false;

        // VISIBILITY BOOST: Øk punktstørrelse betydelig for tydeligere punkter
        // Sjekk at pointResolution faktisk er et tall (ikke null/undefined)
        if (pointResolution && !isNaN(pointResolution)) {
          this.pointCloud.material.size = pointResolution * 10;
        } else {
          this.pointCloud.material.size = originalPointSize * 10;  // Fallback
        }

        // Full opasitet for kraftige, solide farger
        this.pointCloud.material.opacity = 1.0;
        this.pointCloud.material.transparent = false;
        this.pointCloud.material.needsUpdate = true;

        // Lagre originale farger
        const originalColors = this.pointCloud.geometry.attributes.color.array.slice();
        const colors = this.pointCloud.geometry.attributes.color.array;
      
      // FARGE-FIX: Konverter til mørkere, mer mettede farger for PDF
      // Bruker Three.js Color-klasse for enkel HSL-konvertering
      const tempColor = new THREE.Color();
      const hsl = {}; // Objekt for å lagre HSL verdier

      // FARGE-FIX: Bruk Three.js sin innebygde funksjonalitet (Mye raskere og tryggere)
      for (let i = 0; i < colors.length; i += 3) {
        // 1. Les nåværende farge
        tempColor.setRGB(colors[i], colors[i + 1], colors[i + 2]);

        // 2. Konverter til HSL
        tempColor.getHSL(hsl);

        // 3. Øk "trykket" i fargene for PDF (Maks metning, mørkere tone)
        // Behold hue (hsl.h), sett saturation til 1.0, lightness til 0.35
        tempColor.setHSL(hsl.h, 1.0, 0.35);

        // 4. Skriv tilbake til arrayet
        colors[i] = tempColor.r;
        colors[i + 1] = tempColor.g;
        colors[i + 2] = tempColor.b;
      }
      this.pointCloud.geometry.attributes.color.needsUpdate = true;

        // === 3. Beregn bounds for ortografisk kamera ===
        this.pointCloud.geometry.computeBoundingBox();
        const boundingBox = this.pointCloud.geometry.boundingBox;
        const center = new THREE.Vector3();
        boundingBox.getCenter(center);

        const size = new THREE.Vector3();
        boundingBox.getSize(size);

        const maxXY = Math.max(size.x, size.y);
        const padding = maxXY * 0.1;

      // === 4. Opprett ortografisk kamera ===
      const frustumSize = (maxXY + padding * 2) / 2;
      
      const orthoCamera = new THREE.OrthographicCamera(
        -frustumSize, frustumSize,
        frustumSize, -frustumSize,
        0.1, size.z * 10 + 100
      );
      
      orthoCamera.position.set(center.x, center.y, boundingBox.max.z + size.z + 10);
      orthoCamera.up.set(0, 1, 0);
      orthoCamera.lookAt(center.x, center.y, center.z);
      orthoCamera.updateProjectionMatrix();

      // === 5. Legg til GridHelper ===
      const gridZ = center.z;
      const niceIntervals = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];
      const rawCellSize = maxXY / 10;
      
      let gridCellSize = 10;
      for (const interval of niceIntervals) {
        if (interval >= rawCellSize * 0.7) {
          gridCellSize = interval;
          break;
        }
      }
      
      let gridDivisions = Math.ceil(maxXY / gridCellSize) + 2;
      if (gridDivisions % 2 !== 0) gridDivisions++;
      const gridSize = gridDivisions * gridCellSize;
      
        const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x888888, 0xcccccc);
        gridHelper.rotation.x = Math.PI / 2;
        gridHelper.position.set(center.x, center.y, gridZ);
        this.scene.add(gridHelper);

        // === 6. Render til høy-oppløselig bilde ===
        this.renderer.setSize(resolution, resolution);
        this.renderer.render(this.scene, orthoCamera);
        const imageDataUrl = this.renderer.domElement.toDataURL('image/png', 1.0);

        // === 7. Gjenopprett original tilstand ===
        this.scene.remove(gridHelper);
        gridHelper.dispose();

        this.scene.background = originalBackground;
        if (this.axesHelper) this.axesHelper.visible = originalAxesVisible;
      
        // Gjenopprett original material-innstillinger
        this.pointCloud.material.size = originalPointSize;
        this.pointCloud.material.opacity = originalOpacity;
        this.pointCloud.material.transparent = originalTransparent;
        this.pointCloud.material.needsUpdate = true;

        // Gjenopprett originale farger
        for (let i = 0; i < originalColors.length; i++) {
          colors[i] = originalColors[i];
        }
        this.pointCloud.geometry.attributes.color.needsUpdate = true;

        this.renderer.setSize(originalRendererSize.width, originalRendererSize.height);
        this.renderer.render(this.scene, this.camera);

        // Beregn koordinater for akser
        const gridCenterOriginal = {
          x: center.x + this.coordinateOffset.x,
          y: center.y + this.coordinateOffset.y
        };
      
        const visibleBounds = {
          minX: (center.x - frustumSize) + this.coordinateOffset.x,
          maxX: (center.x + frustumSize) + this.coordinateOffset.x,
          minY: (center.y - frustumSize) + this.coordinateOffset.y,
          maxY: (center.y + frustumSize) + this.coordinateOffset.y
        };

        // Beregn Z-verdier i originale koordinater for legend
        const minZ = boundingBox.min.z + this.coordinateOffset.z;
        const maxZ = boundingBox.max.z + this.coordinateOffset.z;

      console.log('Kart-bilde generert med sterke farger');
      console.log(`Rutenett: ${gridCellSize}m per rute`);
      console.log(`Z-range: ${minZ.toFixed(2)} til ${maxZ.toFixed(2)} m`);
      
      resolve({
        imageDataUrl,
        bounds: visibleBounds,
        gridCenter: gridCenterOriginal,
        size: { x: size.x, y: size.y, z: size.z },
        gridCellSize,
        minZ,
        maxZ
      });

    } catch (error) {
      console.error('Feil ved generering av kart-bilde:', error);
      reject(error);
    }
  });
}

  /**
   * Henter camera
   */
  getCamera() {
    return this.camera;
  }

  /**
   * Henter controls
   */
  getControls() {
    return this.controls;
  }

  /**
   * Henter scene
   */
  getScene() {
    return this.scene;
  }

  /**
   * Setter referanse til measurement tool
   */
  setMeasurementTool(tool) {
    this.measurementTool = tool;
  }

  /**
   * Henter measurement tool
   */
  getMeasurementTool() {
    return this.measurementTool;
  }

  /**
   * Setter flagg for om punktskyen er default-skyen
   */
  setIsDefaultCloud(isDefault, velocities = null) {
    this.isDefaultCloud = isDefault;
    this.explosionVelocities = velocities;
    console.log(`Default cloud status: ${isDefault}, velocities: ${velocities ? 'loaded' : 'none'}`);
  }

  /**
   * Sjekker om punktskyen er default-skyen
   */
  getIsDefaultCloud() {
    return this.isDefaultCloud;
  }

  /**
   * Animerer eksplosjon av punktskyen
   * @param {Function} callback - Funksjon som kjøres når animasjonen er ferdig
   */
  animateExplosion(callback) {
    if (!this.pointCloud || !this.explosionVelocities) {
      console.warn('Ingen punktsky eller velocity-data for eksplosjon');
      if (callback) callback();
      return;
    }

    console.log('🎆 Starter eksplosjon-animasjon!');

    const positions = this.pointCloud.geometry.attributes.position.array;
    const startTime = Date.now();
    const duration = 1000; // 1 sekund

    // Sett material til transparent for fade-out
    this.pointCloud.material.transparent = true;
    this.pointCloud.material.opacity = 1.0;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1.0);

      // Oppdater posisjoner basert på velocity
      const deltaTime = 1 / 60; // Antatt 60 FPS
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] += this.explosionVelocities[i] * deltaTime;
        positions[i + 1] += this.explosionVelocities[i + 1] * deltaTime;
        positions[i + 2] += this.explosionVelocities[i + 2] * deltaTime;
      }

      // Marker at posisjoner er oppdatert
      this.pointCloud.geometry.attributes.position.needsUpdate = true;

      // Fade out
      this.pointCloud.material.opacity = 1.0 - progress;

      if (progress < 1.0) {
        requestAnimationFrame(animate);
      } else {
        console.log('✓ Eksplosjon fullført!');
        // Fjern punktskyen fra scenen
        this.scene.remove(this.pointCloud);
        if (this.pointCloud.geometry) this.pointCloud.geometry.dispose();
        if (this.pointCloud.material) this.pointCloud.material.dispose();
        this.pointCloud = null;
        this.isDefaultCloud = false;
        this.explosionVelocities = null;

        // Kjør callback
        if (callback) callback();
      }
    };

    animate();
  }

  /**
   * Recalculates point colors based on current Z-values
   * Used after Z-axis inversion to update colors correctly
   */
  recalculateColorsFromZ() {
    if (!this.pointCloud) return;

    const positions = this.pointCloud.geometry.attributes.position.array;
    const colors = this.pointCloud.geometry.attributes.color.array;

    // First pass: find min/max Z
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (let i = 0; i < positions.length; i += 3) {
      const z = positions[i + 2];
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }

    const zRange = maxZ - minZ || 1; // Avoid division by zero

    // Opprett tempColor objekt utenfor loopen for å unngå GC overhead
    const tempColor = new THREE.Color();

    // Second pass: recalculate colors based on normalized Z
    for (let i = 0; i < positions.length; i += 3) {
      const z = positions[i + 2];
      const normalizedZ = (z - minZ) / zRange;

      // Use same color gradient as in parser: blue (0.6) to red (0.0)
      tempColor.setHSL(0.6 - normalizedZ * 0.6, 1.0, 0.5);

      const colorIndex = i; // Color array has same indices as position array
      colors[colorIndex] = tempColor.r;
      colors[colorIndex + 1] = tempColor.g;
      colors[colorIndex + 2] = tempColor.b;
    }

    // Mark colors as updated
    this.pointCloud.geometry.attributes.color.needsUpdate = true;
    console.log('Colors recalculated based on inverted Z-values');
  }

  /**
   * Inverterer Z-aksen for punktskyen
   * Returnerer nye bounds for oppdatering av andre komponenter
   */
  invertZAxis() {
    if (!this.pointCloud) {
      console.warn('Ingen punktsky å invertere');
      return null;
    }

    const positions = this.pointCloud.geometry.attributes.position.array;

    // Inverter alle Z-verdier (sentrerte koordinater)
    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 2] = -positions[i + 2]; // Z er den tredje verdien
    }

    // Inverter også Z-offset for korrekt konvertering tilbake til originale koordinater
    this.coordinateOffset.z = -this.coordinateOffset.z;
    console.log(`Z-offset invertert til: ${this.coordinateOffset.z.toFixed(2)}`);

    // Marker at posisjoner er oppdatert
    this.pointCloud.geometry.attributes.position.needsUpdate = true;

    // Recalculate colors based on new Z-values
    this.recalculateColorsFromZ();

    // Beregn nye bounds (sentrerte)
    this.pointCloud.geometry.computeBoundingBox();
    this.pointCloud.geometry.computeBoundingSphere();

    const boundingBox = this.pointCloud.geometry.boundingBox;
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);

    const size = new THREE.Vector3();
    boundingBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);

    // Beregn originale bounds (for dashboard)
    const originalMinZ = boundingBox.min.z + this.coordinateOffset.z;
    const originalMaxZ = boundingBox.max.z + this.coordinateOffset.z;

    console.log('Z-akse invertert!');
    console.log('Sentrerte bounds:');
    console.log(`  Min: (${boundingBox.min.x.toFixed(2)}, ${boundingBox.min.y.toFixed(2)}, ${boundingBox.min.z.toFixed(2)})`);
    console.log(`  Max: (${boundingBox.max.x.toFixed(2)}, ${boundingBox.max.y.toFixed(2)}, ${boundingBox.max.z.toFixed(2)})`);
    console.log('Originale Z-bounds:');
    console.log(`  Z: ${originalMinZ.toFixed(2)} til ${originalMaxZ.toFixed(2)}`);

    // Snu kameraet opp-ned (inverter Z-posisjon relativt til center)
    const currentCameraPos = this.camera.position.clone();
    const currentTarget = this.controls.target.clone();

    // Beregn relativ posisjon
    const relativePos = currentCameraPos.sub(currentTarget);

    // Inverter Z-komponenten
    relativePos.z = -relativePos.z;

    // Sett ny kamera posisjon
    this.camera.position.copy(center.clone().add(relativePos));

    // Oppdater target til nye center
    this.controls.target.copy(center);
    this.controls.update();

    // Juster AxesHelper
    const axesSize = maxDim * 0.3;
    this.axesHelper.scale.setScalar(axesSize / 5); // 5 er original størrelse
    this.axesHelper.position.copy(center);

    console.log('Kamera snudd opp-ned og aksekors oppdatert');

    return {
      boundingBox,
      center,
      size,
      positions,
      originalMinZ,
      originalMaxZ
    };
  }
}

// Create a default instance for backward compatibility
const defaultViewer = new PointCloudViewer();

// Export functions that wrap the default viewer instance for backward compatibility
export function initViewer() {
  return defaultViewer.init();
}

export function animate() {
  defaultViewer.animate();
}

export function setCoordinateOffset(offsetX, offsetY, offsetZ) {
  defaultViewer.setCoordinateOffset(offsetX, offsetY, offsetZ);
}

export function getCoordinateOffset() {
  return defaultViewer.getCoordinateOffset();
}

export function addPointCloud(positions, colors, pointSize, useHeightColor, pointColor) {
  return defaultViewer.addPointCloud(positions, colors, pointSize, useHeightColor, pointColor);
}

export function getPointCloud() {
  return defaultViewer.getPointCloud();
}

export function setPointCloud(cloud) {
  defaultViewer.setPointCloud(cloud);
}

export function centerCameraOnBounds(boundingBox, boundingSphere) {
  return defaultViewer.centerCameraOnBounds(boundingBox, boundingSphere);
}

export function setBackgroundColor(color) {
  defaultViewer.setBackgroundColor(color);
}

export function setAxesVisible(visible) {
  defaultViewer.setAxesVisible(visible);
}

export function addToScene(object) {
  defaultViewer.addToScene(object);
}

export function removeFromScene(object) {
  defaultViewer.removeFromScene(object);
}

export function getRendererElement() {
  return defaultViewer.getRendererElement();
}

export function getRenderer() {
  return defaultViewer.getRenderer();
}

export async function generateMapImage(resolution = 2048, pointResolution = null) {
  return await defaultViewer.generateMapImage(resolution, pointResolution);
}

export function getCamera() {
  return defaultViewer.getCamera();
}

export function getControls() {
  return defaultViewer.getControls();
}

export function getScene() {
  return defaultViewer.getScene();
}

export function setMeasurementTool(tool) {
  defaultViewer.setMeasurementTool(tool);
}

export function getMeasurementTool() {
  return defaultViewer.getMeasurementTool();
}

export function setIsDefaultCloud(isDefault, velocities = null) {
  defaultViewer.setIsDefaultCloud(isDefault, velocities);
}

export function getIsDefaultCloud() {
  return defaultViewer.getIsDefaultCloud();
}

export function animateExplosion(callback) {
  defaultViewer.animateExplosion(callback);
}

export function invertZAxis() {
  return defaultViewer.invertZAxis();
}
