/**
 * Statistikk og dashboard-funksjonalitet
 */

import * as THREE from 'three';

let dashboardElement;
let currentFileName = '';
let currentMetadata = {
  datum: 'ED50',
  projection: 'UTM 32N'
};
let isDashboardMinimized = false;

/**
 * Initialiserer dashboard
 */
export function initDashboard() {
  dashboardElement = document.getElementById('dashboard');
  if (!dashboardElement) {
    console.error('Dashboard element not found');
  }
}

/**
 * Oppdaterer dashboard med punktsky-statistikk
 * @param {number} pointCount - Antall punkter
 * @param {Object} bounds - Originale bounds (minZ/maxZ i originale koordinater)
 * @param {Float32Array} positions - SENTRERTE posisjoner (scene-koordinater)
 * @param {string} fileName - Filnavn
 * @param {number} zOffset - Z-offset som gjør sentrert Z om til original Z
 */
export function updateDashboard(pointCount, bounds, positions, fileName = '', zOffset = 0) {
  if (!dashboardElement) return;
  
  // Lagre filnavn hvis det er gitt
  if (fileName) {
    currentFileName = fileName;
  }
  
  const { minZ, maxZ } = bounds;
  
  // Calculate histogram
  const histogram = calculateZHistogram(positions, minZ, maxZ, 10, zOffset);

  // Calculate point resolution (average distance in flat areas)
  const resolution = calculatePointResolution(positions);
  
  // Create HTML for dashboard
  const html = `
    <h3>📊 Point Cloud Statistics<button class="dashboard-minimize-btn" title="Minimize panel">−</button></h3>

    ${currentFileName ? `
    <div class="stat-row">
      <span class="stat-label">Filename:</span>
      <span class="stat-value">${currentFileName}</span>
    </div>
    ` : ''}

    <div class="stat-row">
      <span class="stat-label">Total points:</span>
      <span class="stat-value">${pointCount.toLocaleString('nb-NO')}</span>
    </div>

    <div class="stat-row">
      <span class="stat-label">Resolution:</span>
      <span class="stat-value">${resolution.toFixed(3)} m</span>
    </div>

    <div class="stat-row">
      <span class="stat-label">Height range (Z):</span>
      <span class="stat-value">${minZ.toFixed(2)} → ${maxZ.toFixed(2)} m</span>
    </div>

    <div class="stat-row">
      <span class="stat-label">Height span:</span>
      <span class="stat-value">${(maxZ - minZ).toFixed(2)} m</span>
    </div>

    <div class="histogram-section">
      <h4>Z-Height Histogram</h4>
      <div class="histogram">
        ${createHistogramBars(histogram, minZ, maxZ)}
      </div>
    </div>
  `;
  
  dashboardElement.innerHTML = html;
  dashboardElement.style.display = 'block';

  // Add minimize button functionality
  const minimizeBtn = dashboardElement.querySelector('.dashboard-minimize-btn');
  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDashboardMinimize(dashboardElement);
    });
  }

  // Returner resolution for bruk i rapport
  return resolution;
}

/**
 * Gets the current filename
 */
export function getFileName() {
  return currentFileName;
}

/**
 * Updates metadata in dashboard
 */
export function updateMetadata(metadata) {
  currentMetadata.datum = metadata.datum || 'ED50';
  currentMetadata.projection = metadata.projection || 'UTM 32N';

  console.log('Updating metadata in dashboard:', currentMetadata);

  // Update dashboard if visible
  if (dashboardElement && dashboardElement.innerHTML) {
    const statRows = dashboardElement.querySelectorAll('.stat-row');

    // statRows[0] = Datum, statRows[1] = Projection
    if (statRows.length >= 2) {
      const datumValue = statRows[0].querySelector('.stat-value');
      const projValue = statRows[1].querySelector('.stat-value');

      if (datumValue) {
        datumValue.textContent = currentMetadata.datum;
        console.log('✓ Dashboard Datum updated to:', currentMetadata.datum);
      }

      if (projValue) {
        projValue.textContent = currentMetadata.projection;
        console.log('✓ Dashboard Projection updated to:', currentMetadata.projection);
      }
    }
  }
}

/**
 * Clears dashboard
 */
export function clearDashboard() {
  if (!dashboardElement) return;
  dashboardElement.innerHTML = '<p class="no-data">Upload a point cloud to see statistics</p>';
  isDashboardMinimized = false; // Reset minimize state
}

/**
 * Toggles dashboard minimize state
 */
function toggleDashboardMinimize(dashboard) {
  isDashboardMinimized = !isDashboardMinimized;
  const minimizeBtn = dashboard.querySelector('.dashboard-minimize-btn');

  if (isDashboardMinimized) {
    dashboard.classList.add('minimized');
    if (minimizeBtn) {
      minimizeBtn.innerHTML = '+';
      minimizeBtn.title = 'Expand panel';
    }
  } else {
    dashboard.classList.remove('minimized');
    if (minimizeBtn) {
      minimizeBtn.innerHTML = '−';
      minimizeBtn.title = 'Minimize panel';
    }
  }
}

/**
 * Calculates point resolution (average distance between points in flat areas)
 *
 * Memory: works directly on the typed array. The cloud is divided into a
 * 50 x 50 grid in XY; per-cell count and Z sums are accumulated in one pass
 * (no per-point objects). Only the points in the (max 20) selected flat
 * cells are collected for the nearest-neighbour search.
 *
 * @param {Float32Array|number[]} positions - Positions (centered is fine; only differences are used)
 */
function calculatePointResolution(positions) {
  const numPoints = positions.length / 3;
  if (numPoints < 2) return 0;

  const gridSize = 50; // Number of cells in each direction
  const numCells = gridSize * gridSize;
  const maxFlatCells = 20;
  const minPointsPerCell = 10;
  const maxStdDev = 0.5; // Flat areas (< 0.5 m Z variation)

  // Find XY bounds
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const invCellX = gridSize / rangeX;
  const invCellY = gridSize / rangeY;

  const cellOf = (i) => {
    let cx = Math.floor((positions[i] - minX) * invCellX);
    let cy = Math.floor((positions[i + 1] - minY) * invCellY);
    if (cx >= gridSize) cx = gridSize - 1;
    if (cy >= gridSize) cy = gridSize - 1;
    return cy * gridSize + cx;
  };

  // Pass 1: count and Z statistics per cell (Z relative to first point for numeric stability)
  const z0 = positions[2];
  const counts = new Uint32Array(numCells);
  const sumZ = new Float64Array(numCells);
  const sumZ2 = new Float64Array(numCells);
  const firstSeen = new Int32Array(numCells).fill(-1); // Order cells were first encountered
  let seenCount = 0;
  const seenOrder = new Int32Array(numCells);

  for (let i = 0; i < positions.length; i += 3) {
    const c = cellOf(i);
    const z = positions[i + 2] - z0;
    if (firstSeen[c] === -1) {
      firstSeen[c] = seenCount;
      seenOrder[seenCount++] = c;
    }
    counts[c]++;
    sumZ[c] += z;
    sumZ2[c] += z * z;
  }

  // Select flat cells (in the order they were first encountered)
  const selected = [];
  for (let k = 0; k < seenCount && selected.length < maxFlatCells; k++) {
    const c = seenOrder[k];
    const n = counts[c];
    if (n < minPointsPerCell) continue;
    const mean = sumZ[c] / n;
    const variance = Math.max(0, sumZ2[c] / n - mean * mean);
    if (Math.sqrt(variance) < maxStdDev) selected.push(c);
  }

  // Collect XY of points per selected cell
  let cellPoints; // Array of Float64Array [x0, y0, x1, y1, ...]
  if (selected.length > 0) {
    const slot = new Int32Array(numCells).fill(-1);
    selected.forEach((c, k) => { slot[c] = k; });
    cellPoints = selected.map(c => new Float64Array(counts[c] * 2));
    const fill = new Uint32Array(selected.length);
    for (let i = 0; i < positions.length; i += 3) {
      const k = slot[cellOf(i)];
      if (k === -1) continue;
      const arr = cellPoints[k];
      arr[fill[k]++] = positions[i];
      arr[fill[k]++] = positions[i + 1];
    }
  } else {
    // Fallback: use a spread sample of up to 1000 points if no flat areas found
    console.warn('No flat areas found, using all points');
    const sampleCount = Math.min(1000, numPoints);
    const step = Math.max(1, Math.floor(numPoints / sampleCount));
    const arr = new Float64Array(sampleCount * 2);
    for (let k = 0; k < sampleCount; k++) {
      arr[k * 2] = positions[k * step * 3];
      arr[k * 2 + 1] = positions[k * step * 3 + 1];
    }
    cellPoints = [arr];
  }

  // Sample points and find nearest neighbour distance within the cell
  const distances = [];
  const maxDistanceSamples = 500;
  const samplesPerCell = 25;

  for (const arr of cellPoints) {
    const n = arr.length / 2;
    const sampleSize = Math.min(samplesPerCell, n);

    for (let s = 0; s < sampleSize; s++) {
      const p = Math.floor(Math.random() * n);
      const px = arr[p * 2];
      const py = arr[p * 2 + 1];
      let minDist2 = Infinity;

      for (let q = 0; q < n; q++) {
        if (q === p) continue;
        const dx = px - arr[q * 2];
        const dy = py - arr[q * 2 + 1];
        const d2 = dx * dx + dy * dy;
        if (d2 < minDist2 && d2 > 1e-6) { // > 0.001 m
          minDist2 = d2;
        }
      }

      if (minDist2 < Infinity) {
        distances.push(Math.sqrt(minDist2));
      }

      if (distances.length >= maxDistanceSamples) break;
    }

    if (distances.length >= maxDistanceSamples) break;
  }

  // Calculate average
  if (distances.length === 0) {
    // Extra fallback: estimate from area and number of points
    const area = rangeX * rangeY;
    return Math.sqrt(area / numPoints);
  }

  const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
  console.log(`Point resolution calculated from ${distances.length} samples in ${cellPoints.length} flat areas`);

  return avgDistance;
}

/**
 * Calculates color based on Z-value using the same elevation gradient as the point cloud
 */
function getColorForZ(z, minZ, maxZ) {
  const zRange = maxZ - minZ || 1;
  const normalizedZ = (z - minZ) / zRange;
  const color = new THREE.Color();
  color.setHSL(0.6 - normalizedZ * 0.6, 1.0, 0.5); // Blue (0.6) to red (0.0)
  return color;
}

/**
 * Converts THREE.Color to CSS rgb string
 */
function colorToCSS(color) {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Calculates histogram for Z-values
 */
function calculateZHistogram(positions, minZ, maxZ, numBins, zOffset = 0) {
  const bins = new Array(numBins).fill(0);
  const range = maxZ - minZ;
  const binSize = range / numBins;

  // Count points in each bin
  for (let i = 0; i < positions.length; i += 3) {
    const z = positions[i + 2] + zOffset; // Original Z (centered Z + offset)

    // Calculate which bin this point belongs to
    let binIndex = Math.floor((z - minZ) / binSize);

    // Handle edge case where z === maxZ
    if (binIndex >= numBins) binIndex = numBins - 1;
    if (binIndex < 0) binIndex = 0;

    bins[binIndex]++;
  }

  return bins;
}

/**
 * Creates HTML for histogram bars with elevation-based colors
 */
function createHistogramBars(histogram, minZ, maxZ) {
  const maxCount = Math.max(...histogram);
  const numBins = histogram.length;
  const binSize = (maxZ - minZ) / numBins;

  // Create bins array with proper structure
  const bins = [];
  for (let i = 0; i < histogram.length; i++) {
    const count = histogram[i];
    const binStart = minZ + (i * binSize);
    const binEnd = binStart + binSize;

    bins.push({
      min: binStart,
      max: binEnd,
      count: count,
      range: `${binStart.toFixed(1)}-${binEnd.toFixed(1)}`
    });
  }

  let html = '';

  // 3. Generer HTML for søylene
  bins.forEach(bin => {
    // Beregn høyde (minst 1% så den synes)
    const heightPercentage = maxCount > 0 ? (bin.count / maxCount) * 100 : 0;
    const height = Math.max(heightPercentage, 1);

    // Farge
    const color = getColorForZ((bin.min + bin.max) / 2, minZ, maxZ);
    const cssColor = colorToCSS(color);

    html += `
      <div class="histogram-column">

        <div class="histogram-bar" style="height: ${height}%; background-color: ${cssColor};">
            <span class="histogram-range-label">${bin.range}</span>
        </div>

        <span class="histogram-count-label">${formatCount(bin.count)}</span>

      </div>
    `;
  });

  return html;
}

/**
 * Formaterer tall for visning
 */
function formatCount(count) {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M';
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'k';
  }
  return count.toString();
}

/**
 * Shows a message in dashboard
 */
export function showDashboardMessage(message, type = 'info') {
  if (!dashboardElement) return;
  
  const className = type === 'error' ? 'message-error' : 'message-info';
  const icon = type === 'error' ? '⚠️' : 'ℹ️';
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `dashboard-message ${className}`;
  messageDiv.innerHTML = `${icon} ${message}`;
  
  dashboardElement.insertBefore(messageDiv, dashboardElement.firstChild);
  
  // Fjern melding etter 3 sekunder
  setTimeout(() => {
    messageDiv.style.opacity = '0';
    setTimeout(() => messageDiv.remove(), 300);
  }, 3000);
}

/**
 * Shows loading spinner with optional message
 */
export function showLoadingSpinner(message = 'Loading...') {
  const overlay = document.getElementById('loading-overlay');
  const text = overlay?.querySelector('.loading-text');
  
  if (overlay) {
    if (text) {
      text.textContent = message;
    }
    overlay.classList.add('active');
  }
}

/**
 * Hides loading spinner
 */
export function hideLoadingSpinner() {
  const overlay = document.getElementById('loading-overlay');
  
  if (overlay) {
    overlay.classList.remove('active');
  }
}