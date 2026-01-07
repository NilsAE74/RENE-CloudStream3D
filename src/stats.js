/**
 * Statistikk og dashboard-funksjonalitet
 */

let dashboardElement;
let currentMetadata = {
  datum: 'WGS84',
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
export function updateDashboard(pointCount, bounds, positions) {
  if (!dashboardElement) return;
  
  const { minZ, maxZ } = bounds;
  
  // Beregn histogram
  const histogram = calculateZHistogram(positions, minZ, maxZ, 10);
  
  // Beregn punktoppløsning (gjennomsnittlig avstand i flate områder)
  const resolution = calculatePointResolution(positions);
  
  // Opprett HTML for dashboard
  const html = `
    <h3>📊 Punktsky Statistikk</h3>
    
    <div class="stat-row">
      <span class="stat-label">Datum:</span>
      <span class="stat-value">${currentMetadata.datum}</span>
    </div>
    
    <div class="stat-row">
      <span class="stat-label">Projeksjon:</span>
      <span class="stat-value">${currentMetadata.projection}</span>
    </div>
    
    <div class="stat-row" style="border-top: 1px solid rgba(255,255,255,0.2); margin-top: 8px; padding-top: 8px;">
      <span class="stat-label">Totalt antall punkter:</span>
      <span class="stat-value">${pointCount.toLocaleString('nb-NO')}</span>
    </div>
    
    <div class="stat-row">
      <span class="stat-label">Oppløsning:</span>
      <span class="stat-value">${resolution.toFixed(3)} m</span>
    </div>
    
    <div class="stat-row">
      <span class="stat-label">Høydeområde (Z):</span>
      <span class="stat-value">${minZ.toFixed(2)} → ${maxZ.toFixed(2)} m</span>
    </div>
    
    <div class="stat-row">
      <span class="stat-label">Høydespenn:</span>
      <span class="stat-value">${(maxZ - minZ).toFixed(2)} m</span>
    </div>
    
    <div class="histogram-section">
      <h4>Z-Høyde Histogram</h4>
      <div class="histogram">
        ${createHistogramBars(histogram, minZ, maxZ)}
      </div>
    </div>
  `;
  
  dashboardElement.innerHTML = html;
  dashboardElement.style.display = 'block';
}

/**
 * Oppdaterer metadata i dashboard
 */
export function updateMetadata(metadata) {
  currentMetadata.datum = metadata.datum || 'ED50';
  currentMetadata.projection = metadata.projection || 'UTM 32N';
  
  console.log('Oppdaterer metadata i dashboard:', currentMetadata);
  
  // Oppdater dashboard hvis det er synlig
  if (dashboardElement && dashboardElement.innerHTML) {
    const statRows = dashboardElement.querySelectorAll('.stat-row');
    
    // statRows[0] = Datum, statRows[1] = Projeksjon
    if (statRows.length >= 2) {
      const datumValue = statRows[0].querySelector('.stat-value');
      const projValue = statRows[1].querySelector('.stat-value');
      
      if (datumValue) {
        datumValue.textContent = currentMetadata.datum;
        console.log('✓ Dashboard Datum oppdatert til:', currentMetadata.datum);
      }
      
      if (projValue) {
        projValue.textContent = currentMetadata.projection;
        console.log('✓ Dashboard Projeksjon oppdatert til:', currentMetadata.projection);
      }
    }
  }
}

/**
 * Tømmer dashboard
 */
export function clearDashboard() {
  if (!dashboardElement) return;
  dashboardElement.innerHTML = '<p class="no-data">Last opp en punktsky for å se statistikk</p>';
}

/**
 * Beregner punktoppløsning (gjennomsnittlig avstand mellom punkter i flate områder)
 */
function calculatePointResolution(positions) {
  const numPoints = positions.length / 3;
  
  // For store punktskyer, sample kun en del av punktene
  const maxSamples = Math.min(5000, numPoints);
  const sampleInterval = Math.max(1, Math.floor(numPoints / maxSamples));
  
  // Del punktskyen i grid-celler for raskere søk
  const gridSize = 50; // Antall celler i hver retning
  const grid = new Map();
  
  // Finn min/max for grid
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
  
  // Populer grid
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
  
  // Finn celler med lav Z-variasjon (flate områder)
  const flatCells = [];
  for (const [key, points] of grid.entries()) {
    if (points.length < 10) continue; // Skip celler med for få punkter
    
    // Beregn Z standard deviation
    const avgZ = points.reduce((sum, p) => sum + p.z, 0) / points.length;
    const variance = points.reduce((sum, p) => sum + Math.pow(p.z - avgZ, 2), 0) / points.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev < 0.5) { // Flate områder (< 0.5m variasjon)
      flatCells.push(points);
    }
  }
  
  if (flatCells.length === 0) {
    // Fallback: bruk alle punkter hvis ingen flate områder
    console.warn('Ingen flate områder funnet, bruker alle punkter');
    flatCells.push(Array.from({ length: Math.min(1000, numPoints) }, (_, i) => ({
      x: positions[i * 3 * sampleInterval],
      y: positions[i * 3 * sampleInterval + 1],
      z: positions[i * 3 * sampleInterval + 2]
    })));
  }
  
  // Sample punkter fra flate områder og beregn nærmeste nabo-avstand
  const distances = [];
  const maxDistanceSamples = 500;
  
  for (const cellPoints of flatCells.slice(0, 20)) { // Max 20 celler
    const sampleSize = Math.min(25, cellPoints.length);
    
    for (let i = 0; i < sampleSize; i++) {
      const point = cellPoints[Math.floor(Math.random() * cellPoints.length)];
      let minDist = Infinity;
      
      // Finn nærmeste nabo
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
  
  // Beregn gjennomsnitt
  if (distances.length === 0) {
    // Ekstra fallback: estimer fra area og antall punkter
    const area = rangeX * rangeY;
    const avgArea = area / numPoints;
    return Math.sqrt(avgArea);
  }
  
  const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
  console.log(`Punktoppløsning beregnet fra ${distances.length} samples i ${flatCells.length} flate områder`);
  
  return avgDistance;
}

/**
 * Beregner histogram for Z-verdier
 */
function calculateZHistogram(positions, minZ, maxZ, numBins) {
  const bins = new Array(numBins).fill(0);
  const range = maxZ - minZ;
  const binSize = range / numBins;
  
  // Tell punkter i hver bin
  for (let i = 0; i < positions.length; i += 3) {
    const z = positions[i + 2]; // Z er den tredje verdien
    
    // Beregn hvilken bin dette punktet tilhører
    let binIndex = Math.floor((z - minZ) / binSize);
    
    // Håndter edge case hvor z === maxZ
    if (binIndex >= numBins) binIndex = numBins - 1;
    if (binIndex < 0) binIndex = 0;
    
    bins[binIndex]++;
  }
  
  return bins;
}

/**
 * Lager HTML for histogram bars
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
      <div class="histogram-bar-container" title="${count.toLocaleString('nb-NO')} punkter (${binStart.toFixed(2)} - ${binEnd.toFixed(2)} m)">
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
 * Viser en melding i dashboard
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
