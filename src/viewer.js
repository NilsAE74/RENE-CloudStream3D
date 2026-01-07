import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Scene, camera, renderer og controls
let scene, camera, renderer, controls;
let axesHelper;
let pointCloud = null;
let coordinateOffset = { x: 0, y: 0, z: 0 }; // Lagrer offset fra sentrering

/**
 * Initialiserer Three.js viewer
 */
export function initViewer() {
  // Sett opp scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  // Legg til AxesHelper for å vise X, Y, Z akser
  // Rød = X, Grønn = Y, Blå = Z (Z peker opp)
  axesHelper = new THREE.AxesHelper(5);
  scene.add(axesHelper);

  // Sett opp kamera
  camera = new THREE.PerspectiveCamera(
    75, // Field of view
    window.innerWidth / window.innerHeight, // Aspect ratio
    0.1, // Near clipping plane
    1000 // Far clipping plane
  );
  // Sett Z-aksen som "opp" (standard i GIS/surveying)
  camera.up.set(0, 0, 1);
  camera.position.set(5, 5, 5);
  camera.lookAt(0, 0, 0);

  // Sett opp renderer (preserveDrawingBuffer for PDF screenshots)
  renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    preserveDrawingBuffer: true  // Nødvendig for screenshots
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Sett opp OrbitControls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Håndter resize av nettleservindu
  window.addEventListener('resize', onWindowResize);

  return { scene, camera, renderer, controls };
}

/**
 * Håndterer window resize
 */
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Animasjons-loop
 */
export function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

/**
 * Setter koordinat-offset (brukes ved inversjon)
 */
export function setCoordinateOffset(offsetX, offsetY, offsetZ) {
  coordinateOffset.x = offsetX;
  coordinateOffset.y = offsetY;
  coordinateOffset.z = offsetZ;
}

/**
 * Henter koordinat-offset
 */
export function getCoordinateOffset() {
  return coordinateOffset;
}

/**
 * Legger til punktsky i scenen
 */
export function addPointCloud(positions, colors, pointSize, useHeightColor, pointColor) {
  // Fjern gammel punktsky hvis den finnes
  if (pointCloud) {
    scene.remove(pointCloud);
    pointCloud.geometry.dispose();
    pointCloud.material.dispose();
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
  pointCloud = new THREE.Points(geometry, material);
  scene.add(pointCloud);

  return pointCloud;
}

/**
 * Henter punktskyen
 */
export function getPointCloud() {
  return pointCloud;
}

/**
 * Setter punktskyen
 */
export function setPointCloud(cloud) {
  pointCloud = cloud;
}

/**
 * Oppdaterer kamera for å sentrere på punktsky
 */
export function centerCameraOnBounds(boundingBox, boundingSphere) {
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
  const fov = camera.fov * (Math.PI / 180);
  let distance = Math.abs(radius / Math.sin(fov / 2));

  // Legg til litt ekstra avstand for bedre visning
  distance *= 1.5;

  // Juster kamera clipping planes for store scener
  camera.near = radius / 1000;
  camera.far = radius * 100;
  camera.updateProjectionMatrix();

  console.log(`Kamera innstillinger: near=${camera.near.toFixed(3)}, far=${camera.far.toFixed(1)}, distance=${distance.toFixed(2)}`);

  // Plasser kameraet i en god vinkel (Z er opp, så vi ser fra siden/ovenifra)
  // X = høyre, Y = fremover, Z = opp
  camera.position.set(
    center.x + distance * 0.7,  // Litt til høyre
    center.y - distance * 0.7,  // Litt bakover (for å se fremover på modellen)
    center.z + distance * 0.5   // Litt over (Z er opp)
  );

  // Oppdater OrbitControls target
  controls.target.copy(center);
  controls.update();

  // Juster AxesHelper størrelse basert på modellstørrelse
  scene.remove(axesHelper);
  const axesSize = maxDim * 0.3;
  axesHelper = new THREE.AxesHelper(axesSize);
  axesHelper.position.copy(center);
  scene.add(axesHelper);

  console.log('Aksekors: Rød=X (høyre), Grønn=Y (fremover), Blå=Z (opp)');

  return { center, size, maxDim };
}

/**
 * Setter bakgrunnsfarge
 */
export function setBackgroundColor(color) {
  scene.background.set(color);
}

/**
 * Viser/skjuler aksekors
 */
export function setAxesVisible(visible) {
  if (axesHelper) {
    axesHelper.visible = visible;
  }
}

/**
 * Legger til objekt i scenen
 */
export function addToScene(object) {
  scene.add(object);
}

/**
 * Fjerner objekt fra scenen
 */
export function removeFromScene(object) {
  scene.remove(object);
}

/**
 * Henter renderer domElement for å koble til andre controls
 */
export function getRendererElement() {
  return renderer.domElement;
}

/**
 * Henter renderer for PDF-generering
 */
export function getRenderer() {
  return renderer;
}

/**
 * Genererer et kart-bilde (topp-visning) for PDF-rapport
 * Bruker ortografisk kamera for flat projeksjon uten perspektivforvrengning
 */
export async function generateMapImage(resolution = 2048) {
  return new Promise((resolve, reject) => {
    try {
      if (!pointCloud) {
        reject(new Error('Ingen punktsky å visualisere'));
        return;
      }

      // === 1. Lagre nåværende tilstand ===
      const originalBackground = scene.background.clone();
      const originalAxesVisible = axesHelper ? axesHelper.visible : false;
      const originalRendererSize = {
        width: renderer.domElement.width,
        height: renderer.domElement.height
      };
      
      // Lagre original material-innstillinger
      const originalPointSize = pointCloud.material.size;
      const originalOpacity = pointCloud.material.opacity;
      const originalTransparent = pointCloud.material.transparent;

      // === 2. Sett opp kart-modus for PDF ===
      scene.background = new THREE.Color(0xffffff); // Hvit bakgrunn
      if (axesHelper) axesHelper.visible = false;

      // VISIBILITY BOOST: Øk punktstørrelse betydelig (3x) for tydeligere punkter
      pointCloud.material.size = originalPointSize * 3;
      
      // Full opasitet for kraftige, solide farger
      pointCloud.material.opacity = 1.0;
      pointCloud.material.transparent = false;
      pointCloud.material.needsUpdate = true;

      // Forsterk fargene for sterkere visning mot hvit bakgrunn
      const originalColors = pointCloud.geometry.attributes.color.array.slice(); // Kopier
      const colors = pointCloud.geometry.attributes.color.array;
      const colorBoost = 2.0; // 100% sterkere farger for maksimal synlighet
      
      for (let i = 0; i < colors.length; i++) {
        const boosted = colors[i] * colorBoost;
        colors[i] = Math.min(1.0, boosted);
      }
      pointCloud.geometry.attributes.color.needsUpdate = true;

      // === 3. Beregn bounds for ortografisk kamera ===
      pointCloud.geometry.computeBoundingBox();
      const boundingBox = pointCloud.geometry.boundingBox;
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
      scene.add(gridHelper);

      // === 6. Render til høy-oppløselig bilde ===
      renderer.setSize(resolution, resolution);
      renderer.render(scene, orthoCamera);
      const imageDataUrl = renderer.domElement.toDataURL('image/png', 1.0);

      // === 7. Gjenopprett original tilstand ===
      scene.remove(gridHelper);
      gridHelper.dispose();
      
      scene.background = originalBackground;
      if (axesHelper) axesHelper.visible = originalAxesVisible;
      
      // Gjenopprett original material-innstillinger
      pointCloud.material.size = originalPointSize;
      pointCloud.material.opacity = originalOpacity;
      pointCloud.material.transparent = originalTransparent;
      pointCloud.material.needsUpdate = true;
      
      // Gjenopprett originale farger
      for (let i = 0; i < originalColors.length; i++) {
        colors[i] = originalColors[i];
      }
      pointCloud.geometry.attributes.color.needsUpdate = true;

      renderer.setSize(originalRendererSize.width, originalRendererSize.height);
      renderer.render(scene, camera);

      // Beregn koordinater for akser
      const gridCenterOriginal = {
        x: center.x + coordinateOffset.x,
        y: center.y + coordinateOffset.y
      };
      
      const visibleBounds = {
        minX: (center.x - frustumSize) + coordinateOffset.x,
        maxX: (center.x + frustumSize) + coordinateOffset.x,
        minY: (center.y - frustumSize) + coordinateOffset.y,
        maxY: (center.y + frustumSize) + coordinateOffset.y
      };
      
      // Beregn Z-verdier i originale koordinater for legend
      const minZ = boundingBox.min.z + coordinateOffset.z;
      const maxZ = boundingBox.max.z + coordinateOffset.z;

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
export function getCamera() {
  return camera;
}

/**
 * Henter controls
 */
export function getControls() {
  return controls;
}

/**
 * Henter scene
 */
export function getScene() {
  return scene;
}

/**
 * Inverterer Z-aksen for punktskyen
 * Returnerer nye bounds for oppdatering av andre komponenter
 */
export function invertZAxis() {
  if (!pointCloud) {
    console.warn('Ingen punktsky å invertere');
    return null;
  }
  
  const positions = pointCloud.geometry.attributes.position.array;
  
  // Inverter alle Z-verdier (sentrerte koordinater)
  for (let i = 0; i < positions.length; i += 3) {
    positions[i + 2] = -positions[i + 2]; // Z er den tredje verdien
  }
  
  // Inverter også Z-offset for korrekt konvertering tilbake til originale koordinater
  coordinateOffset.z = -coordinateOffset.z;
  console.log(`Z-offset invertert til: ${coordinateOffset.z.toFixed(2)}`);
  
  // Marker at posisjoner er oppdatert
  pointCloud.geometry.attributes.position.needsUpdate = true;
  
  // Beregn nye bounds (sentrerte)
  pointCloud.geometry.computeBoundingBox();
  pointCloud.geometry.computeBoundingSphere();
  
  const boundingBox = pointCloud.geometry.boundingBox;
  const center = new THREE.Vector3();
  boundingBox.getCenter(center);
  
  const size = new THREE.Vector3();
  boundingBox.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  
  // Beregn originale bounds (for dashboard)
  const originalMinZ = boundingBox.min.z + coordinateOffset.z;
  const originalMaxZ = boundingBox.max.z + coordinateOffset.z;
  
  console.log('Z-akse invertert!');
  console.log('Sentrerte bounds:');
  console.log(`  Min: (${boundingBox.min.x.toFixed(2)}, ${boundingBox.min.y.toFixed(2)}, ${boundingBox.min.z.toFixed(2)})`);
  console.log(`  Max: (${boundingBox.max.x.toFixed(2)}, ${boundingBox.max.y.toFixed(2)}, ${boundingBox.max.z.toFixed(2)})`);
  console.log('Originale Z-bounds:');
  console.log(`  Z: ${originalMinZ.toFixed(2)} til ${originalMaxZ.toFixed(2)}`);
  
  // Snu kameraet opp-ned (inverter Z-posisjon relativt til center)
  const currentCameraPos = camera.position.clone();
  const currentTarget = controls.target.clone();
  
  // Beregn relativ posisjon
  const relativePos = currentCameraPos.sub(currentTarget);
  
  // Inverter Z-komponenten
  relativePos.z = -relativePos.z;
  
  // Sett ny kamera posisjon
  camera.position.copy(center.clone().add(relativePos));
  
  // Oppdater target til nye center
  controls.target.copy(center);
  controls.update();
  
  // Juster AxesHelper
  scene.remove(axesHelper);
  const axesSize = maxDim * 0.3;
  axesHelper = new THREE.AxesHelper(axesSize);
  axesHelper.position.copy(center);
  scene.add(axesHelper);
  
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
