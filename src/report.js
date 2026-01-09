/**
 * PDF report generation - Professional map-based report
 */

import { jsPDF } from 'jspdf';
import * as viewer from './viewer.js';

// Konstanter
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 20;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

/**
 * Generates and downloads PDF report
 */
export async function generatePDFReport(reportData, renderer, stats, profileTool = null) {
  try {
    console.log('Starting PDF generation...');
    
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    // === SIDE 1: FORSIDE ===
    createCoverPage(pdf, reportData);
    
    // === SIDE 2: KART OG DATA ===
    pdf.addPage();
    await createMapPage(pdf, reportData);
    
    // === SIDE 3 (optional): PROFILE ===
    if (profileTool) {
      const profileState = profileTool.getProfileState();
      if (profileState.hasProfile) {
        pdf.addPage();
        await createProfilePage(pdf, profileTool, reportData);
      }
    }
    
    // Footer på alle sider
    addFooter(pdf);
    
    // Lagre PDF
    const filename = `Rapport_${(reportData.projectName || 'Punktsky').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(filename);
    
    console.log('PDF generated:', filename);
    return true;

  } catch (error) {
    console.error('Error in PDF generation:', error);
    throw error;
  }
}

/**
 * Cover page
 */
function createCoverPage(pdf, reportData) {
  // Header
  pdf.setFillColor(41, 128, 185);
  pdf.rect(0, 0, PAGE_WIDTH, 100, 'F');
  
  pdf.setFillColor(44, 62, 80);
  pdf.rect(0, 95, PAGE_WIDTH, 10, 'F');
  
  // Tittel
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(32);
  pdf.setFont('helvetica', 'bold');
  pdf.text(reportData.projectName || 'Punktsky Analyse', PAGE_WIDTH / 2, 50, { align: 'center' });
  
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Punktsky-analyse Rapport', PAGE_WIDTH / 2, 70, { align: 'center' });
  
  // Info-boks
  let yPos = 130;
  pdf.setTextColor(50, 50, 50);
  pdf.setFillColor(248, 248, 248);
  pdf.roundedRect(MARGIN, yPos, CONTENT_WIDTH, 50, 3, 3, 'F');
  
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Rapport Detaljer', MARGIN + 10, yPos + 15);
  
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  pdf.text(`Generated: ${date}`, MARGIN + 10, yPos + 28);
  pdf.text(`Coordinate system: ${reportData.datum || ''}`, MARGIN + 10, yPos + 38);
  pdf.text(`Projection: ${reportData.projection || ''}`, MARGIN + 10, yPos + 48);
}

/**
 * Map and data page
 */
async function createMapPage(pdf, reportData) {
  let yPos = 25;
  
  // Header
  pdf.setFillColor(41, 128, 185);
  pdf.rect(0, 0, PAGE_WIDTH, 15, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Data og Visualisering', MARGIN, 10);
  
  pdf.setTextColor(50, 50, 50);
  
  // Metadata table
  yPos = drawSectionHeader(pdf, 'Metadata', yPos);
  const metaData = [
    ['Coordinate system', reportData.datum || 'ED 50'],
    ['Projection', reportData.projection || 'UTM 32N'],
    ['Description', reportData.description || '-']
  ];
  yPos = drawTable(pdf, metaData, yPos) + 8;
  
  // Map visualization
  yPos = drawSectionHeader(pdf, 'Top View (Orthographic)', yPos);
  
  try {
    const mapResult = await viewer.generateMapImage(2048, reportData.resolution);
    
    if (mapResult && mapResult.imageDataUrl) {
      const axisSpace = 12;
      const imgSize = CONTENT_WIDTH - axisSpace;
      const imgX = MARGIN + axisSpace;
      const imgY = yPos;
      
      // Ramme
      pdf.setDrawColor(180, 180, 180);
      pdf.setLineWidth(0.5);
      pdf.rect(imgX, imgY, imgSize, imgSize);
      
      // Bilde
      pdf.addImage(mapResult.imageDataUrl, 'PNG', imgX, imgY, imgSize, imgSize);
      
      // Akser med koordinater
      drawAxisLabels(pdf, imgX, imgY, imgSize, mapResult.bounds, mapResult.gridCellSize, mapResult.gridCenter);
      
      // Legg til fargeforklaring (legend) i øvre høyre hjørne
      const legendWidth = 50;  // mm
      const legendHeight = 12; // mm
      const legendX = imgX + imgSize - legendWidth - 3;
      const legendY = imgY + 3;
      
      const legendDataUrl = createLegend(mapResult.minZ, mapResult.maxZ);
      pdf.addImage(legendDataUrl, 'PNG', legendX, legendY, legendWidth, legendHeight);
      
      // Scale info (placed under X-axis label)
      yPos = imgY + imgSize + 18;
      pdf.setFontSize(8);
      pdf.setTextColor(128, 128, 128);
      pdf.text(`Extent: ${mapResult.size.x.toFixed(1)} × ${mapResult.size.y.toFixed(1)} m | Grid: ${mapResult.gridCellSize} m`, PAGE_WIDTH / 2, yPos, { align: 'center' });
      
      yPos += 8;
    }
  } catch (error) {
    console.error('Feil ved kart-generering:', error);
    pdf.setFontSize(10);
    pdf.text('Kunne ikke generere kartvisning', MARGIN, yPos + 20);
    yPos += 40;
  }
  
  // Statistics
  if (yPos > PAGE_HEIGHT - 70) {
    pdf.addPage();
    yPos = MARGIN;
  }

  yPos = drawSectionHeader(pdf, 'Statistics', yPos);
  const statsData = [
    ['Number of points', reportData.pointCount.toLocaleString('nb-NO')],
    ['Point resolution', `${reportData.resolution.toFixed(3)} m`],
    ['Height range (Z)', `${reportData.minZ.toFixed(2)} to ${reportData.maxZ.toFixed(2)} m`],
    ['Height span', `${(reportData.maxZ - reportData.minZ).toFixed(2)} m`],
    ['Extent X', `${reportData.areaX.toFixed(2)} m`],
    ['Extent Y', `${reportData.areaY.toFixed(2)} m`]
  ];
  yPos = drawTable(pdf, statsData, yPos) + 8;
  
  // Add histogram
  if (reportData.positions && reportData.positions.length > 0) {
    // Check if we need a new page for the histogram
    if (yPos > PAGE_HEIGHT - 85) {
      pdf.addPage();
      yPos = MARGIN;
    }
    
    yPos = drawSectionHeader(pdf, 'Z-Height Distribution', yPos);
    
    try {
      const histogramDataUrl = createHistogramImage(reportData.positions, reportData.minZ, reportData.maxZ);
      
      const histWidth = CONTENT_WIDTH;
      const histHeight = 60;
      
      // Add histogram image
      pdf.addImage(histogramDataUrl, 'PNG', MARGIN, yPos, histWidth, histHeight);
      
      yPos += histHeight + 5;
      
      // Description
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.text('Distribution of points across elevation ranges', PAGE_WIDTH / 2, yPos, { align: 'center' });
    } catch (error) {
      console.error('❌ Error generating histogram:', error);
      console.error('Error stack:', error.stack);
      pdf.setFontSize(9);
      pdf.text('Could not generate histogram', MARGIN, yPos);
    }
  } else {
    console.warn('❌ No positions data available for histogram');
    console.warn('reportData.positions value:', reportData.positions);
  }
}

/**
 * Tegner akselabeler
 */
function drawAxisLabels(pdf, imgX, imgY, imgSize, bounds, gridCellSize, gridCenter) {
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(50, 50, 50);
  
  const xRange = bounds.maxX - bounds.minX;
  const yRange = bounds.maxY - bounds.minY;
  const tickInterval = gridCellSize;
  
  // X-akse (bunn)
  const firstTickX = gridCenter.x + Math.ceil((bounds.minX - gridCenter.x) / tickInterval) * tickInterval;
  for (let xVal = firstTickX; xVal <= bounds.maxX; xVal += tickInterval) {
    const frac = (xVal - bounds.minX) / xRange;
    const xPos = imgX + frac * imgSize;
    pdf.line(xPos, imgY + imgSize, xPos, imgY + imgSize + 1.5);
    pdf.text(formatCoord(xVal), xPos, imgY + imgSize + 5, { align: 'center' });
  }
  
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text('X (East) [m]', imgX + imgSize / 2, imgY + imgSize + 10, { align: 'center' });

  // Y-axis (left)
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'bold');
  const firstTickY = gridCenter.y + Math.ceil((bounds.minY - gridCenter.y) / tickInterval) * tickInterval;
  for (let yVal = firstTickY; yVal <= bounds.maxY; yVal += tickInterval) {
    const frac = (yVal - bounds.minY) / yRange;
    const yPos = imgY + imgSize - frac * imgSize;
    pdf.line(imgX - 1.5, yPos, imgX, yPos);
    pdf.text(formatCoord(yVal), imgX - 2, yPos + 1, { align: 'right' });
  }

  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Y (North) [m]', MARGIN + 3, imgY + imgSize / 2, { angle: 90, align: 'center' });
}

/**
 * Formats coordinate
 */
function formatCoord(val) {
  if (Math.abs(val) >= 10000) {
    return Math.round(val).toLocaleString('en-US');
  }
  return val.toFixed(1);
}

/**
 * Seksjons-header
 */
function drawSectionHeader(pdf, title, yPos) {
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(44, 62, 80);
  pdf.setDrawColor(41, 128, 185);
  pdf.setLineWidth(1.5);
  pdf.line(MARGIN, yPos, MARGIN + 4, yPos);
  pdf.text(title, MARGIN + 7, yPos + 1);
  return yPos + 7;
}

/**
 * Tabell
 */
function drawTable(pdf, data, startY) {
  const rowH = 7;
  let yPos = startY;
  
  pdf.setFontSize(9);
  data.forEach((row, i) => {
    if (i % 2 === 0) {
      pdf.setFillColor(248, 248, 248);
      pdf.rect(MARGIN, yPos, CONTENT_WIDTH, rowH, 'F');
    }
    pdf.setTextColor(50, 50, 50);
    pdf.setFont('helvetica', 'normal');
    pdf.text(row[0], MARGIN + 2, yPos + 5);
    pdf.setFont('helvetica', 'bold');
    pdf.text(String(row[1]), MARGIN + CONTENT_WIDTH * 0.45, yPos + 5);
    yPos += rowH;
  });
  return yPos;
}

/**
 * Footer
 */
function addFooter(pdf) {
  const pages = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text(`Side ${i} av ${pages}`, PAGE_WIDTH / 2, PAGE_HEIGHT - 10, { align: 'center' });
  }
}

/**
 * Profile page
 */
async function createProfilePage(pdf, profileTool, reportData) {
  let yPos = 25;
  
  // Header
  pdf.setFillColor(41, 128, 185);
  pdf.rect(0, 0, PAGE_WIDTH, 15, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Profile View', MARGIN, 10);
  
  pdf.setTextColor(50, 50, 50);
  
  // Profile info
  yPos = drawSectionHeader(pdf, 'Cross-Section Profile', yPos);
  
  const profileState = profileTool.getProfileState();
  const profileData = [
    ['Thickness', `${profileState.thickness.toFixed(2)} m`],
    ['Number of points', profileState.points ? profileState.points.length.toLocaleString('nb-NO') : '0']
  ];
  yPos = drawTable(pdf, profileData, yPos) + 8;
  
  // Profile image
  try {
    const profileImageUrl = profileTool.getProfileImageDataURL();
    
    if (profileImageUrl) {
      const imgWidth = CONTENT_WIDTH;
      const imgHeight = imgWidth * 0.4;  // Aspect ratio for profile
      
      yPos = drawSectionHeader(pdf, 'Profile Visualization', yPos);
      
      // Ramme
      pdf.setDrawColor(180, 180, 180);
      pdf.setLineWidth(0.5);
      pdf.rect(MARGIN, yPos, imgWidth, imgHeight);
      
      // Bilde
      pdf.addImage(profileImageUrl, 'PNG', MARGIN, yPos, imgWidth, imgHeight);
      
      yPos += imgHeight + 10;
      
      // Description
      pdf.setFontSize(9);
      pdf.setTextColor(100, 100, 100);
      pdf.text('2D profile showing elevation (Z) vs. distance along the section line', PAGE_WIDTH / 2, yPos, { align: 'center' });
    }
  } catch (error) {
    console.error('Error adding profile image to PDF:', error);
    pdf.setFontSize(10);
    pdf.text('Could not generate profile visualization', MARGIN, yPos + 20);
  }
}

/**
 * Creates color legend for Z-values
 * Returns a DataURL with gradient and labels
 */
function createLegend(minZ, maxZ) {
  // Opprett midlertidig canvas
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 60;
  const ctx = canvas.getContext('2d');
  
  // Hvit bakgrunn med avrundede hjørner
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, 6);
  ctx.fill();
  
  // Ramme
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1;
  ctx.stroke();
  
  // Gradient bar dimensjoner
  const barX = 15;
  const barY = 10;
  const barWidth = canvas.width - 30;
  const barHeight = 20;
  
  // Tegn farge-gradient (matcher den mørkere skalaen brukt i PDF-eksporten)
  const gradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
  
  // HSL: 0.6 (blå) til 0.0 (rød), saturation 1.0, lightness 0.35 (mørkere for bedre synlighet)
  gradient.addColorStop(0, 'hsl(216, 100%, 35%)');    // Mørk blå (lav Z)
  gradient.addColorStop(0.25, 'hsl(180, 100%, 35%)'); // Mørk cyan
  gradient.addColorStop(0.5, 'hsl(120, 100%, 35%)');  // Mørk grønn
  gradient.addColorStop(0.75, 'hsl(60, 100%, 45%)');  // Mørk gul (litt lysere for synlighet)
  gradient.addColorStop(1, 'hsl(0, 100%, 40%)');      // Mørk rød (høy Z)
  
  ctx.fillStyle = gradient;
  ctx.fillRect(barX, barY, barWidth, barHeight);
  
  // Ramme rundt gradient
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barWidth, barHeight);
  
  // Labels
  ctx.fillStyle = '#000';
  ctx.font = 'bold 11px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`${minZ.toFixed(1)} m`, barX, barY + barHeight + 14);
  
  ctx.textAlign = 'center';
  const midZ = (minZ + maxZ) / 2;
  ctx.fillText(`${midZ.toFixed(1)} m`, barX + barWidth / 2, barY + barHeight + 14);
  
  ctx.textAlign = 'right';
  ctx.fillText(`${maxZ.toFixed(1)} m`, barX + barWidth, barY + barHeight + 14);
  
  // Title
  ctx.fillStyle = '#333';
  ctx.font = 'bold 10px Arial';
  ctx.textAlign = 'right';
  ctx.fillText('Depth (Z)', canvas.width - 10, barY + barHeight / 2 + 4);
  
  return canvas.toDataURL('image/png');
}

/**
 * Creates histogram image for Z-height distribution with light background
 */
function createHistogramImage(positions, minZ, maxZ) {
  const canvas = document.createElement('canvas');
  canvas.width = 1400;
  canvas.height = 500;
  const ctx = canvas.getContext('2d');
  
  // Light background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Calculate histogram
  const numBins = 10;
  const bins = new Array(numBins).fill(0);
  const range = maxZ - minZ;
  const binSize = range / numBins;
  
  // Count points in each bin
  for (let i = 0; i < positions.length; i += 3) {
    const z = positions[i + 2];
    let binIndex = Math.floor((z - minZ) / binSize);
    if (binIndex >= numBins) binIndex = numBins - 1;
    if (binIndex < 0) binIndex = 0;
    bins[binIndex]++;
  }
  
  const maxCount = Math.max(...bins);
  
  // Drawing parameters
  const padding = { top: 40, right: 60, bottom: 80, left: 80 };
  const chartWidth = canvas.width - padding.left - padding.right;
  const chartHeight = canvas.height - padding.top - padding.bottom;
  const barWidth = chartWidth / numBins;
  const barSpacing = barWidth * 0.1;
  
  // Draw grid lines
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
  const numGridLines = 5;
  for (let i = 0; i <= numGridLines; i++) {
    const y = padding.top + (chartHeight * i / numGridLines);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();
  }
  
  // Draw bars
  for (let i = 0; i < bins.length; i++) {
    const count = bins[i];
    const barHeight = maxCount > 0 ? (count / maxCount) * chartHeight : 0;
    const x = padding.left + (i * barWidth) + barSpacing / 2;
    const y = padding.top + chartHeight - barHeight;
    const width = barWidth - barSpacing;
    
    // Calculate color based on elevation
    const binStart = minZ + (i * binSize);
    const binEnd = binStart + binSize;
    const avgZ = (binStart + binEnd) / 2;
    const normalizedZ = (avgZ - minZ) / range;
    
    // Use same color scheme as dashboard (blue to red)
    const hue = (0.6 - normalizedZ * 0.6) * 360;
    ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
    
    // Draw bar
    ctx.fillRect(x, y, width, barHeight);
    
    // Draw bar outline
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, barHeight);
    
    // Draw X-axis labels (bin ranges)
    ctx.fillStyle = '#333';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(binStart.toFixed(1), x + width / 2, padding.top + chartHeight + 25);
    
    // Draw count on top of bar if there's space
    if (barHeight > 30) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      const countText = formatCountForHistogram(count);
      ctx.fillText(countText, x + width / 2, y + 20);
    }
  }
  
  // Draw last bin label
  ctx.fillStyle = '#333';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  const lastX = padding.left + (numBins * barWidth) - barSpacing / 2;
  ctx.fillText(maxZ.toFixed(1), lastX, padding.top + chartHeight + 25);
  
  // Draw Y-axis labels (counts)
  ctx.fillStyle = '#333';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'right';
  for (let i = 0; i <= numGridLines; i++) {
    const count = maxCount * (1 - i / numGridLines);
    const y = padding.top + (chartHeight * i / numGridLines);
    ctx.fillText(formatCountForHistogram(count), padding.left - 10, y + 5);
  }
  
  // Draw axes
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartHeight);
  ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
  ctx.stroke();
  
  // Axis labels
  ctx.fillStyle = '#000';
  ctx.font = 'bold 20px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Elevation (m)', canvas.width / 2, canvas.height - 20);
  
  ctx.save();
  ctx.translate(20, canvas.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Number of Points', 0, 0);
  ctx.restore();
  
  // Title
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#2c3e50';
  ctx.fillText('Z-Height Distribution', canvas.width / 2, 25);
  
  return canvas.toDataURL('image/png');
}

/**
 * Formats count for histogram display
 */
function formatCountForHistogram(count) {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M';
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'k';
  }
  return Math.round(count).toString();
}
