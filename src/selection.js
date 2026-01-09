import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

let selectionBox, boxEdges, transformControls;
let originalColors = null;
let coordinateOffset = { x: 0, y: 0, z: 0 }; // Lagrer offset fra sentreringen

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const edgesGeometry = new THREE.EdgesGeometry(boxGeometry);
const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });

/**
 * Initialiserer Selection Box
 */
export function initSelectionBox(scene, camera, rendererElement) {
  // Opprett Selection Box
  const boxMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide
  });
  selectionBox = new THREE.Mesh(boxGeometry, boxMaterial);

  // Legg til kanter på boksen for bedre synlighet
  boxEdges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
  selectionBox.add(boxEdges);

  selectionBox.visible = false; // Skjul til punktsky er lastet
  scene.add(selectionBox);

  // Sett opp TransformControls for å manipulere boksen
  transformControls = new TransformControls(camera, rendererElement);
  transformControls.attach(selectionBox);
  transformControls.setMode('translate'); // Start i translate-modus
  transformControls.visible = false;
  scene.add(transformControls);

  return { selectionBox, transformControls };
}

/**
 * Henter selection box
 */
export function getSelectionBox() {
  return selectionBox;
}

/**
 * Henter transform controls
 */
export function getTransformControls() {
  return transformControls;
}

/**
 * Oppdaterer boksstørrelse
 */
export function updateBoxSize(width, height, depth) {
  selectionBox.scale.set(width, height, depth);
  
  // Oppdater edges
  selectionBox.remove(boxEdges);
  const newEdgesGeometry = new THREE.EdgesGeometry(boxGeometry);
  boxEdges = new THREE.LineSegments(newEdgesGeometry, edgesMaterial);
  selectionBox.add(boxEdges);
}

/**
 * Velger punkter innenfor boksen
 */
export function selectPointsInBox(pointCloud, boxSettings, showAlert = false) {
  if (!pointCloud) {
    if (showAlert) {
      alert('Upload a point cloud first!');
    }
    return 0;
  }
  
  const positions = pointCloud.geometry.attributes.position.array;
  const colors = pointCloud.geometry.attributes.color.array;
  
  // Lagre originale farger hvis ikke allerede gjort
  if (!originalColors) {
    originalColors = new Float32Array(colors);
  }
  
  // Hent boksens inverse transformasjonsmatrise for korrekt rotasjonshåndtering
  const boxMatrix = new THREE.Matrix4();
  // Bruk scale(1,1,1) fordi vi sjekker scale separat
  boxMatrix.compose(selectionBox.position, selectionBox.quaternion, new THREE.Vector3(1, 1, 1));
  const inverseMatrix = new THREE.Matrix4().copy(boxMatrix).invert();
  
  let selectedCount = 0;
  const pointVector = new THREE.Vector3();
  
  // Gå gjennom alle punkter
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    
    const colorIndex = i;
    
    // Transformer punktet til boksens lokale koordinatsystem (uten scale)
    pointVector.set(x, y, z);
    pointVector.applyMatrix4(inverseMatrix);
    
    // Nå må vi ta hensyn til scale siden vi ikke inkluderte den i matrisen
    const localX = pointVector.x / selectionBox.scale.x;
    const localY = pointVector.y / selectionBox.scale.y;
    const localZ = pointVector.z / selectionBox.scale.z;
    
    // Sjekk mot ±0.5 (siden box geometry er 1x1x1)
    const isInside = (Math.abs(localX) <= 0.5 &&
                      Math.abs(localY) <= 0.5 &&
                      Math.abs(localZ) <= 0.5);
    
    if (isInside) {
      // Punkter INNI boksen: Behold originale farger (høyde-basert gradient)
      colors[colorIndex] = originalColors[colorIndex];
      colors[colorIndex + 1] = originalColors[colorIndex + 1];
      colors[colorIndex + 2] = originalColors[colorIndex + 2];
      selectedCount++;
    } else {
      // Punkter UTENFOR boksen
      if (boxSettings.hideOutside) {
        // Blek dem ut (lys grå/hvit)
        colors[colorIndex] = 0.9;
        colors[colorIndex + 1] = 0.9;
        colors[colorIndex + 2] = 0.9;
      } else {
        // Behold originale farger
        colors[colorIndex] = originalColors[colorIndex];
        colors[colorIndex + 1] = originalColors[colorIndex + 1];
        colors[colorIndex + 2] = originalColors[colorIndex + 2];
      }
    }
  }
  
  // Oppdater farger
  pointCloud.geometry.attributes.color.needsUpdate = true;
  
  console.log(`${selectedCount} punkter valgt`);
  
  // Vis alert kun hvis eksplisitt forespurt
  if (showAlert) {
    alert(`${selectedCount} punkter valgt! Punkter utenfor boksen er nå bleket ut.`);
  }
  
  return selectedCount;
}

/**
 * Gjenoppretter originale farger
 */
export function restoreOriginalColors(pointCloud) {
  if (!pointCloud || !originalColors) return;
  
  const colors = pointCloud.geometry.attributes.color.array;
  for (let i = 0; i < originalColors.length; i++) {
    colors[i] = originalColors[i];
  }
  pointCloud.geometry.attributes.color.needsUpdate = true;
}

/**
 * Nullstiller originale farger
 */
export function resetOriginalColors() {
  originalColors = null;
}

/**
 * Setter koordinat-offset for å kunne eksportere originale koordinater
 */
export function setCoordinateOffset(offsetX, offsetY, offsetZ) {
  coordinateOffset.x = offsetX;
  coordinateOffset.y = offsetY;
  coordinateOffset.z = offsetZ;
  console.log(`Koordinat-offset satt til: (${offsetX.toFixed(2)}, ${offsetY.toFixed(2)}, ${offsetZ.toFixed(2)})`);
}

/**
 * Lagrer valgte punkter til fil
 */
export function saveSelectedPoints(pointCloud, boxSettings) {
  if (!pointCloud) {
    alert('Upload a point cloud first!');
    return;
  }
  
  const positions = pointCloud.geometry.attributes.position.array;
  
  // Hent boksens inverse transformasjonsmatrise for korrekt rotasjonshåndtering
  const boxMatrix = new THREE.Matrix4();
  // Bruk scale(1,1,1) fordi vi sjekker scale separat
  boxMatrix.compose(selectionBox.position, selectionBox.quaternion, new THREE.Vector3(1, 1, 1));
  const inverseMatrix = new THREE.Matrix4().copy(boxMatrix).invert();
  
  // Samle valgte punkter
  const selectedPoints = [];
  const pointVector = new THREE.Vector3();
  
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    
    // Transformer punktet til boksens lokale koordinatsystem (uten scale)
    pointVector.set(x, y, z);
    pointVector.applyMatrix4(inverseMatrix);
    
    // Ta hensyn til scale
    const localX = pointVector.x / selectionBox.scale.x;
    const localY = pointVector.y / selectionBox.scale.y;
    const localZ = pointVector.z / selectionBox.scale.z;
    
    // Sjekk mot ±0.5 (box geometry er 1x1x1)
    if (Math.abs(localX) <= 0.5 &&
        Math.abs(localY) <= 0.5 &&
        Math.abs(localZ) <= 0.5) {
      
      // Konverter tilbake til originale koordinater før eksport (2 desimaler)
      const originalX = x + coordinateOffset.x;
      const originalY = y + coordinateOffset.y;
      const originalZ = z + coordinateOffset.z;
      
      selectedPoints.push(`${originalX.toFixed(2)} ${originalY.toFixed(2)} ${originalZ.toFixed(2)}`);
    }
  }
  
  if (selectedPoints.length === 0) {
    console.warn('Ingen punkter i boksen!');
    return;
  }
  
  // Opprett fil-innhold
  const fileContent = selectedPoints.join('\n');
  
  // Opprett Blob og last ned
  const blob = new Blob([fileContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `selected_points_${Date.now()}.xyz`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  console.log(`${selectedPoints.length} punkter lagret til fil: ${link.download}`);
}

/**
 * Posisjonerer selection box i midten av punktskyen
 */
export function positionSelectionBox(center, size, boxSettings) {
  console.log(`Posisjonerer selection box:`);
  console.log(`  Center mottatt: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`);
  console.log(`  Size mottatt: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`);
  
  selectionBox.position.set(center.x, center.y, center.z);
  boxSettings.x = center.x;
  boxSettings.y = center.y;
  boxSettings.z = center.z;
  
  // Sett boksen til å matche hele punktskyens bounding box
  boxSettings.width = size.x;
  boxSettings.height = size.y;
  boxSettings.depth = size.z;
  updateBoxSize(boxSettings.width, boxSettings.height, boxSettings.depth);
  
  console.log(`Selection box posisjon satt til: (${selectionBox.position.x.toFixed(2)}, ${selectionBox.position.y.toFixed(2)}, ${selectionBox.position.z.toFixed(2)})`);
  console.log(`Selection box størrelse satt til: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`);
}
