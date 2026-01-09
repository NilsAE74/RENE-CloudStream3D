/**
 * Statistikk og dashboard-funksjonalitet
 */

let dashboardElement;
let currentFileName = '';
let currentMetadata = {
  datum: 'ED50',
  projection: 'UTM 32N'
};

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
 */
export function updateDashboard(pointCount, bounds, positions, fileName = '') {
  if (!dashboardElement) return;
  
  // Lagre filnavn hvis det er gitt
  if (fileName) {
    currentFileName = fileName;
  }
  
  const { minZ, maxZ } = bounds;
  
  // Calculate histogram
  const histogram = calculateZHistogram(positions, minZ, maxZ, 10);

  // Calculate point resolution (average distance in flat areas)
  const resolution = calculatePointResolution(positions);
  
  // Create HTML for dashboard
  const html = `
    <h3>📊 Point Cloud Statistics</h3>

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

  // Returner resolution for bruk i rapport
  return resolution;
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
}

/**
 * Calculates point resolution (average distance between points in flat areas)
 */
function calculatePointResolution(positions) {
  const numPoints = positions.length / 3;

  // For large point clouds, sample only a portion of the points
  const maxSamples = Math.min(5000, numPoints);
  const sampleInterval = Math.max(1, Math.floor(numPoints / maxSamples));

  // Divide point cloud into grid cells for faster search
  const gridSize = 50; // Number of cells in each direction
  const grid = new Map();

  // Find min/max for grid
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const cellSizeX = rangeX / gridSize;
  const cellSizeY = rangeY / gridSize;
  
  // Populate grid
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];

    const cellX = Math.floor((x - minX) / cellSizeX);
    const cellY = Math.floor((y - minY) / cellSizeY);
    const key = `${cellX},${cellY}`;

    if (!grid.has(key)) {
      grid.set(key, []);
    }
    grid.get(key).push({ x, y, z, index: i });
  }

  // Find cells with low Z variation (flat areas)
  const flatCells = [];
  for (const [key, points] of grid.entries()) {
    if (points.length < 10) continue; // Skip cells with too few points

    // Calculate Z standard deviation
    const avgZ = points.reduce((sum, p) => sum + p.z, 0) / points.length;
    const variance = points.reduce((sum, p) => sum + Math.pow(p.z - avgZ, 2), 0) / points.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev < 0.5) { // Flat areas (< 0.5m variation)
      flatCells.push(points);
    }
  }

  if (flatCells.length === 0) {
    // Fallback: use all points if no flat areas found
    console.warn('No flat areas found, using all points');
    flatCells.push(Array.from({ length: Math.min(1000, numPoints) }, (_, i) => ({
      x: positions[i * 3 * sampleInterval],
      y: positions[i * 3 * sampleInterval + 1],
      z: positions[i * 3 * sampleInterval + 2]
    })));
  }
  
  // Sample points from flat areas and calculate nearest neighbor distance
  const distances = [];
  const maxDistanceSamples = 500;

  for (const cellPoints of flatCells.slice(0, 20)) { // Max 20 cells
    const sampleSize = Math.min(25, cellPoints.length);

    for (let i = 0; i < sampleSize; i++) {
      const point = cellPoints[Math.floor(Math.random() * cellPoints.length)];
      let minDist = Infinity;

      // Find nearest neighbor
      for (const other of cellPoints) {
        if (point === other) continue;

        const dx = point.x - other.x;
        const dy = point.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < minDist && dist > 0.001) {
          minDist = dist;
        }
      }

      if (minDist < Infinity) {
        distances.push(minDist);
      }

      if (distances.length >= maxDistanceSamples) break;
    }

    if (distances.length >= maxDistanceSamples) break;
  }

  // Calculate average
  if (distances.length === 0) {
    // Extra fallback: estimate from area and number of points
    const area = rangeX * rangeY;
    const avgArea = area / numPoints;
    return Math.sqrt(avgArea);
  }

  const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
  console.log(`Point resolution calculated from ${distances.length} samples in ${flatCells.length} flat areas`);

  return avgDistance;
}

/**
 * Calculates histogram for Z-values
 */
function calculateZHistogram(positions, minZ, maxZ, numBins) {
  const bins = new Array(numBins).fill(0);
  const range = maxZ - minZ;
  const binSize = range / numBins;

  // Count points in each bin
  for (let i = 0; i < positions.length; i += 3) {
    const z = positions[i + 2]; // Z is the third value

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
 * Creates HTML for histogram bars
 */
function createHistogramBars(histogram, minZ, maxZ) {
  const maxCount = Math.max(...histogram);
  const numBins = histogram.length;
  const binSize = (maxZ - minZ) / numBins;

  let html = '';

  for (let i = 0; i < histogram.length; i++) {
    const count = histogram[i];
    const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
    const binStart = minZ + (i * binSize);
    const binEnd = binStart + binSize;

    html += `
      <div class="histogram-bar-container" title="${count.toLocaleString('nb-NO')} points (${binStart.toFixed(2)} - ${binEnd.toFixed(2)} m)">
        <div class="histogram-bar" style="height: ${percentage}%">
          <span class="bar-count">${count > 0 ? formatCount(count) : ''}</span>
        </div>
        <span class="bar-label">${binStart.toFixed(1)}</span>
      </div>
    `;
  }

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