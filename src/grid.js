import * as THREE from 'three';

/**
 * SurveyGrid - Viser et koordinatgrid med originale UTM/World koordinater
 * Selv om 3D-modellen er sentrert rundt 0,0,0, viser dette gridet de faktiske koordinatene
 */

/**
 * Formaterer tall med mellomrom som tusenskiller
 */
function formatWithSpaces(num) {
  const rounded = Math.round(num);
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

let gridGroup = null;
let gridLines = null;
let gridLabels = [];

/**
 * Initialiserer og oppretter koordinatgridet
 * @param {THREE.Box3} boundingBox - Bounding box for punktskyen (sentrert rundt 0,0,0)
 * @param {Object} centerOffset - Offset-vektoren som ble brukt for sentrering {x, y, z}
 * @param {THREE.Scene} scene - Three.js scene å legge gridet til
 */
export function createSurveyGrid(boundingBox, centerOffset, scene) {
  // Fjern eksisterende grid
  if (gridGroup) {
    disposeGrid(scene);
  }
  
  // Opprett ny group for gridet
  gridGroup = new THREE.Group();
  gridGroup.name = 'SurveyGrid';
  
  const size = new THREE.Vector3();
  boundingBox.getSize(size);
  const center = new THREE.Vector3();
  boundingBox.getCenter(center);
  
  // Beregn fornuftig intervall for grid-linjer
  const maxDim = Math.max(size.x, size.y);
  const gridInterval = calculateGridInterval(maxDim);
  
  console.log(`Grid interval: ${gridInterval}m for modell med dimensjon ${maxDim.toFixed(2)}m`);
  
  // Plasser gridet like under modellens laveste Z-punkt
  const gridZ = boundingBox.min.z - 0.1;
  
  // Beregn grid-utstrekning
  const padding = gridInterval * 0.5;
  const minX = Math.floor((boundingBox.min.x - padding) / gridInterval) * gridInterval;
  const maxX = Math.ceil((boundingBox.max.x + padding) / gridInterval) * gridInterval;
  const minY = Math.floor((boundingBox.min.y - padding) / gridInterval) * gridInterval;
  const maxY = Math.ceil((boundingBox.max.y + padding) / gridInterval) * gridInterval;
  
  // Opprett linjer
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xaaaaaa,
    transparent: true,
    opacity: 0.3
  });
  
  const lineGeometry = new THREE.BufferGeometry();
  const positions = [];
  
  // Vertikale linjer (X-retning)
  for (let x = minX; x <= maxX; x += gridInterval) {
    positions.push(x, minY, gridZ);
    positions.push(x, maxY, gridZ);
  }
  
  // Horisontale linjer (Y-retning)
  for (let y = minY; y <= maxY; y += gridInterval) {
    positions.push(minX, y, gridZ);
    positions.push(maxX, y, gridZ);
  }
  
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  gridLines = new THREE.LineSegments(lineGeometry, lineMaterial);
  gridGroup.add(gridLines);
  
  // Opprett labels langs kanten
  createGridLabels(minX, maxX, minY, maxY, gridZ, gridInterval, centerOffset);
  
  // Legg til gridet i scenen
  scene.add(gridGroup);
  
  console.log(`Survey grid opprettet: ${(maxX - minX).toFixed(0)}m x ${(maxY - minY).toFixed(0)}m`);
  console.log(`Originale koordinater: Ø ${(minX + centerOffset.x).toFixed(0)} til ${(maxX + centerOffset.x).toFixed(0)}`);
  console.log(`                       N ${(minY + centerOffset.y).toFixed(0)} til ${(maxY + centerOffset.y).toFixed(0)}`);
  
  return gridGroup;
}

/**
 * Beregner fornuftig grid-intervall basert på modellens størrelse
 */
function calculateGridInterval(dimension) {
  const intervals = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  
  // Vi vil ha ca 5-15 grid-linjer
  const targetInterval = dimension / 10;
  
  for (let i = 0; i < intervals.length; i++) {
    if (intervals[i] >= targetInterval * 0.7) {
      return intervals[i];
    }
  }
  
  return intervals[intervals.length - 1];
}

/**
 * Oppretter tekst-labels for grid-koordinater
 */
function createGridLabels(minX, maxX, minY, maxY, gridZ, interval, centerOffset) {
  gridLabels = [];
  
  const labelSize = interval * 0.2; // Tilpass tekststørrelse til grid-størrelse
  const labelOffset = interval * 0.2; // Avstand fra grid-kant
  
  // Labels langs X-aksen (Øst-koordinater)
for (let x = minX; x <= maxX; x += interval) {
  // Original koordinat
  const originalX = x + centerOffset.x;
  
  // Label nederst
  const label = createTextSprite(`E: ${formatWithSpaces(originalX)}`, labelSize);
  label.position.set(x, minY - labelOffset, gridZ);
  gridGroup.add(label);
  gridLabels.push(label);
}

// Labels langs Y-aksen (Nord-koordinater)
for (let y = minY; y <= maxY; y += interval) {
  // Original koordinat
  const originalY = y + centerOffset.y;
  
  // Label til venstre
  const label = createTextSprite(`N: ${formatWithSpaces(originalY)}`, labelSize);
  label.position.set(minX - labelOffset, y, gridZ);
  gridGroup.add(label);
  gridLabels.push(label);
}
  
  console.log(`${gridLabels.length} grid-labels opprettet`);
}

/**
 * Oppretter et tekst-sprite (alltid vendt mot kamera)
 */
function createTextSprite(text, size) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  // Canvas størrelse
  canvas.width = 512;
  canvas.height = 128;
  
  // Tekst-styling
  context.fillStyle = 'rgba(0, 0, 0, 0.9)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  
  context.font = 'bold 72px Arial';
  context.fillStyle = 'rgba(255, 255, 255, 0.9)';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  
  // Opprett texture fra canvas
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  
  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.8
  });
  
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(size * 4, size, 1); // Bredde, høyde, depth (ikke brukt)
  
  return sprite;
}

/**
 * Setter synlighet for gridet
 */
export function setGridVisible(visible) {
  if (gridGroup) {
    gridGroup.visible = visible;
  }
}

/**
 * Henter grid-gruppen
 */
export function getGridGroup() {
  return gridGroup;
}

/**
 * Rydder opp grid-ressurser
 */
export function disposeGrid(scene) {
  if (!gridGroup) return;
  
  // Fjern fra scene
  scene.remove(gridGroup);
  
  // Dispose linjer
  if (gridLines) {
    gridLines.geometry.dispose();
    gridLines.material.dispose();
  }
  
  // Dispose labels
  gridLabels.forEach(label => {
    if (label.material.map) {
      label.material.map.dispose();
    }
    label.material.dispose();
  });
  
  gridLabels = [];
  gridGroup = null;
  gridLines = null;
  
  console.log('Grid resources disposed');
}

/**
 * Oppdaterer grid når ny fil lastes eller Z inverteres
 */
export function updateGrid(boundingBox, centerOffset, scene) {
  return createSurveyGrid(boundingBox, centerOffset, scene);
}
