/**
 * PDF-rapport generering - Profesjonell kart-basert rapport
 */

import { jsPDF } from 'jspdf';
import * as viewer from './viewer.js';

// Konstanter
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 20;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

/**
 * Genererer og laster ned PDF-rapport
 */
export async function generatePDFReport(reportData, renderer, stats) {
  try {
    console.log('Starter PDF-generering...');
    
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    // === SIDE 1: FORSIDE ===
    createCoverPage(pdf, reportData);
    
    // === SIDE 2: KART OG DATA ===
    pdf.addPage();
    await createMapPage(pdf, reportData);
    
    // Footer på alle sider
    addFooter(pdf);
    
    // Lagre PDF
    const filename = `Rapport_${(reportData.projectName || 'Punktsky').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(filename);
    
    console.log('PDF generert:', filename);
    return true;
    
  } catch (error) {
    console.error('Feil ved PDF-generering:', error);
    throw error;
  }
}

/**
 * Forside
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
  
  const date = new Date().toLocaleDateString('no-NO', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  });
  
  pdf.text(`Generert: ${date}`, MARGIN + 10, yPos + 28);
  pdf.text(`Koordinatsystem: ${reportData.datum || 'WGS84'}`, MARGIN + 10, yPos + 38);
  pdf.text(`Projeksjon: ${reportData.projection || 'UTM 32N'}`, MARGIN + 10, yPos + 48);
}

/**
 * Kart- og dataside
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
  
  // Metadata-tabell
  yPos = drawSectionHeader(pdf, 'Metadata', yPos);
  const metaData = [
    ['Koordinatsystem', reportData.datum || 'WGS84'],
    ['Projeksjon', reportData.projection || 'UTM 32N'],
    ['Beskrivelse', reportData.description || '-']
  ];
  yPos = drawTable(pdf, metaData, yPos) + 8;
  
  // Kartvisning
  yPos = drawSectionHeader(pdf, 'Topp-visning (Ortografisk)', yPos);
  
  try {
    const mapResult = await viewer.generateMapImage(2048);
    
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
      
      // Skala-info (plasseres under X-akse label)
      yPos = imgY + imgSize + 18;
      pdf.setFontSize(8);
      pdf.setTextColor(128, 128, 128);
      pdf.text(`Utstrekning: ${mapResult.size.x.toFixed(1)} × ${mapResult.size.y.toFixed(1)} m | Rutenett: ${mapResult.gridCellSize} m`, PAGE_WIDTH / 2, yPos, { align: 'center' });
      
      yPos += 8;
    }
  } catch (error) {
    console.error('Feil ved kart-generering:', error);
    pdf.setFontSize(10);
    pdf.text('Kunne ikke generere kartvisning', MARGIN, yPos + 20);
    yPos += 40;
  }
  
  // Statistikk
  if (yPos > PAGE_HEIGHT - 70) {
    pdf.addPage();
    yPos = MARGIN;
  }
  
  yPos = drawSectionHeader(pdf, 'Statistikk', yPos);
  const statsData = [
    ['Antall punkter', reportData.pointCount.toLocaleString('nb-NO')],
    ['Høydeområde (Z)', `${reportData.minZ.toFixed(2)} til ${reportData.maxZ.toFixed(2)} m`],
    ['Høydespenn', `${(reportData.maxZ - reportData.minZ).toFixed(2)} m`],
    ['Utstrekning X', `${reportData.areaX.toFixed(2)} m`],
    ['Utstrekning Y', `${reportData.areaY.toFixed(2)} m`]
  ];
  drawTable(pdf, statsData, yPos);
}

/**
 * Tegner akselabeler
 */
function drawAxisLabels(pdf, imgX, imgY, imgSize, bounds, gridCellSize, gridCenter) {
  pdf.setFontSize(6);
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
  pdf.text('X (Øst) [m]', imgX + imgSize / 2, imgY + imgSize + 10, { align: 'center' });
  
  // Y-akse (venstre)
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  const firstTickY = gridCenter.y + Math.ceil((bounds.minY - gridCenter.y) / tickInterval) * tickInterval;
  for (let yVal = firstTickY; yVal <= bounds.maxY; yVal += tickInterval) {
    const frac = (yVal - bounds.minY) / yRange;
    const yPos = imgY + imgSize - frac * imgSize;
    pdf.line(imgX - 1.5, yPos, imgX, yPos);
    pdf.text(formatCoord(yVal), imgX - 2, yPos + 1, { align: 'right' });
  }
  
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Y (Nord) [m]', MARGIN + 3, imgY + imgSize / 2, { angle: 90, align: 'center' });
}

/**
 * Formaterer koordinat
 */
function formatCoord(val) {
  if (Math.abs(val) >= 10000) {
    return Math.round(val).toLocaleString('nb-NO');
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
