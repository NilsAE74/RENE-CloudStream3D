import * as THREE from 'three';

/**
 * Optimalisert parser for XYZ-filer
 * Bruker TypedArrays og unngår String.split() for å spare minne.
 */
export function parseXYZFile(content) {
  const len = content.length;

  // 1. Estimer antall punkter for å pre-allokere minne.
  // En typisk XYZ-linje er kanskje 25-50 bytes. Vi gjetter konservativt for å unngå resizing.
  // Det er raskere å ha for mye minne og slice det etterpå, enn å growe arrayet.
  const estimatedPoints = Math.ceil(len / 20);

  // Alloker TypedArrays (mye raskere enn vanlige arrays)
  let positions = new Float32Array(estimatedPoints * 3);
  let colors = new Float32Array(estimatedPoints * 3);

  let pIndex = 0; // Peker til hvor vi er i positions-arrayet
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  // Regex for å finne tall. Dette er ofte raskere enn manuell parsing i JS for store strenger
  // fordi V8 sin regex-motor er skrevet i C++.
  // Matcher: (tall) mellomrom (tall) mellomrom (tall)
  const lineRegex = /([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)/g;

  let match;

  // --- PASS 1: Parse tekst til tall ---
  // Vi kjører regex i en løkke. exec() returnerer neste match uten å lage en gigantisk array.
  while ((match = lineRegex.exec(content)) !== null) {
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    const z = parseFloat(match[3]);

    // Utvid arrays hvis estimatet var for lavt
    if (pIndex + 3 >= positions.length) {
      const newPos = new Float32Array(positions.length * 2);
      newPos.set(positions);
      positions = newPos;

      const newCol = new Float32Array(colors.length * 2);
      newCol.set(colors);
      colors = newCol;
    }

    positions[pIndex] = x;
    positions[pIndex + 1] = y;
    positions[pIndex + 2] = z;

    // Oppdater bounds "inline" for å unngå en ekstra loop
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;

    pIndex += 3;
  }

  const count = pIndex / 3;

  // Trim arrays ned til faktisk størrelse
  positions = positions.slice(0, pIndex);
  colors = colors.slice(0, pIndex);

  console.log(`Parsed ${count} points. Z-Range: ${minZ} to ${maxZ}`);

  // --- PASS 2: Fargelegging (Lynraskt siden vi jobber med tall) ---
  const zRange = maxZ - minZ || 1;
  const tempColor = new THREE.Color(); // Gjenbruk objektet for å spare GC

  for (let i = 0; i < pIndex; i += 3) {
    const z = positions[i + 2];
    const normalizedZ = (z - minZ) / zRange;

    // Blå (0.6) til Rød (0.0)
    tempColor.setHSL(0.6 - normalizedZ * 0.6, 1.0, 0.5);

    colors[i] = tempColor.r;
    colors[i + 1] = tempColor.g;
    colors[i + 2] = tempColor.b;
  }

  return {
    positions, // Returnerer nå Float32Array direkte
    colors,    // Returnerer Float32Array direkte
    count,
    bounds: { minX, maxX, minY, maxY, minZ, maxZ }
  };
}

export function centerPositions(positions, bounds) {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;

  console.log(`Centering offset: ${centerX}, ${centerY}, ${centerZ}`);

  // Hvis positions allerede er Float32Array, er dette raskt.
  // Vi kan modifisere in-place for å spare 50% minne:
  // const centeredPositions = positions;

  // ELLER lage kopi for sikkerhets skyld (men bruk samme type):
  const centeredPositions = new Float32Array(positions.length);

  for (let i = 0; i < positions.length; i += 3) {
    centeredPositions[i] = positions[i] - centerX;
    centeredPositions[i + 1] = positions[i + 1] - centerY;
    centeredPositions[i + 2] = positions[i + 2] - centerZ;
  }

  return {
    centeredPositions,
    offset: { x: centerX, y: centerY, z: centerZ }
  };
}

/**
 * Genererer en syntetisk default punktsky for testing
 * - 100x100 meter terreng
 * - Ca. 10 000 punkter
 * - Høydevariasjoner mellom 0 og 10 meter
 * - Realistiske UTM-koordinater (500.000 / 6.000.000 område)
 */
export function generateDefaultCloud() {
  console.log('🏔️ Genererer random default terreng...');
  
  const positions = [];
  const colors = [];
  
  // UTM-koordinater i 500.000 / 6.000.000 området
  const baseX = 500000;
  const baseY = 6000000;
  const baseZ = -20;
  
  // Terrengstørrelse: 100x100 meter
  const sizeX = 100;
  const sizeY = 100;
  
  // Ca. 10 000 punkter (100x100 = 10 000)
  const gridResX = 100;
  const gridResY = 100;
  
  const stepX = sizeX / (gridResX - 1);
  const stepY = sizeY / (gridResY - 1);
  
  // Randomiserte parametere for variert terreng
  const amp1 = 2 + Math.random() * 2;      // 2-4m (store bølger)
  const amp2 = 1.5 + Math.random() * 1;  // 1.5-3m (medium bølger)
  const amp3 = 1 + Math.random() * 1;      // 1-2m (små bølger)
  const amp4 = 2 + Math.random() * 1;    // 2-3.5m (diagonale bølger)
  
  const phase1 = Math.random() * Math.PI * 1;
  const phase2 = Math.random() * Math.PI * 2;
  const phase3 = Math.random() * Math.PI * 1;
  const phase4 = Math.random() * Math.PI * 2;
  
  console.log(`📊 Amplituder: ${amp1.toFixed(1)}m, ${amp2.toFixed(1)}m, ${amp3.toFixed(1)}m, ${amp4.toFixed(1)}m`);
  
  let minZ = Infinity;
  let maxZ = -Infinity;
  
  // Generer punkter med variert terreng
  const tempPoints = [];
  for (let i = 0; i < gridResX; i++) {
    for (let j = 0; j < gridResY; j++) {
      const x = baseX + (i * stepX);
      const y = baseY + (j * stepY);
      
      // Bruk flere sinus-bølger for å lage et interessant terreng
      // Kombinerer store bølger med små bølger for naturlig utseende
      const wave1 = Math.sin(i / 10 + phase1) * amp1;  // Store bølger
      const wave2 = Math.sin(j / 8 + phase2) * amp2;   // Medium bølger
      const wave3 = Math.sin(i / 3 + phase3) * Math.cos(j / 4) * amp3;  // Små bølger
      const wave4 = Math.sin((i + j) / 15 + phase4) * amp4;  // Diagonale bølger
      
      // Legg til litt "støy" for mer naturlig variasjon
      const noise = (Math.sin(i * 0.5) * Math.cos(j * 0.7) + 
                     Math.sin(i * 1.3) * Math.cos(j * 1.1)) * 0.5;
      
      // Kombiner alle bølger og skaler til 0-10 meter
      let z = baseZ + 5 + wave1 + wave2 + wave3 + wave4 + noise;
      
      // Sikre at z er innenfor baseZ til baseZ+10 meter
      z = Math.max(baseZ, Math.min(baseZ + 10, z));
      
      tempPoints.push({ x, y, z });
      
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }
  
  console.log(`✓ ${tempPoints.length} punkter generert`);
  console.log(`📍 Høydespenn: ${(maxZ - minZ).toFixed(2)}m (${minZ.toFixed(2)} til ${maxZ.toFixed(2)}m)`);
  
  
  // Opprett posisjon og farge-arrays
  const zRange = maxZ - minZ || 1;
  
  for (const point of tempPoints) {
    positions.push(point.x, point.y, point.z);
    
    // Fargelegg basert på Z-verdi (samme gradient som i parseXYZFile)
    const normalizedZ = (point.z - minZ) / zRange;
    const color = new THREE.Color();
    color.setHSL(0.6 - normalizedZ * 0.6, 1.0, 0.5); // Blå (0.6) til rød (0.0)
    colors.push(color.r, color.g, color.b);
  }
  
  return {
    positions,
    colors,
    count: tempPoints.length,
    bounds: {
      minX: baseX,
      maxX: baseX + sizeX,
      minY: baseY,
      maxY: baseY + sizeY,
      minZ: minZ,
      maxZ: maxZ
    }
  };
}

/**
 * Genererer en 3D punktsky fra bedriftens logo
 * - Laster inn RENElogo.png
 * - Konverterer hver piksel til et 3D-punkt
 * - Beholder originalfargene fra logoen
 * - Plasserer logoen svevende over terrenget
 * 
 * @returns {Promise} Promise som resolves til punktsky-data
 */
export function generateLogoCloud() {
  return new Promise((resolve, reject) => {
    console.log('Genererer logo punktsky...');
    
    // Opprett et usynlig canvas-element
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Logo-dimensjoner
    const logoWidth = 1067;
    const logoHeight = 400;
    canvas.width = logoWidth;
    canvas.height = logoHeight;
    
    // Last inn logo-bildet
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Tillat CORS hvis nødvendig
    
    img.onload = () => {
      // Tegn logoen på canvas
      ctx.drawImage(img, 0, 0, logoWidth, logoHeight);
      
      // Hent pixel-data
      const imageData = ctx.getImageData(0, 0, logoWidth, logoHeight);
      const pixels = imageData.data;
      
      const positions = [];
      const colors = [];
      const velocities = []; // For eksplosjon-animasjon
      const tempPoints = [];
      
      // UTM-koordinater (samme som default cloud)
      const baseX = 500000;
      const baseY = 6000000;
      const baseZ = -15; // Svevende over terrenget (som er på -70 til -60)
      
      // Skalering: Logo skal være ca. 50 meter bred
      const targetWidth = 50;
      const scaleX = targetWidth / logoWidth;
      const scaleY = scaleX; // Behold aspect ratio
      
      // Sentrer logoen over terrenget (terreng er 100x100m, starter på baseX/baseY)
      const centerOffsetX = baseX + 25; // Midt i terrenget (100m / 2 - 50m / 2 = 25m offset)
      const centerOffsetY = baseY + 50;
      
      // Beregn sentrum for logo (for eksplosjon-retninger)
      const logoCenterX = centerOffsetX + (logoWidth * scaleX) / 2;
      const logoCenterY = centerOffsetY + 1; // Midt i tykkelsen
      const logoCenterZ = baseZ + (logoHeight * scaleY) / 2;
      
      let minZ = Infinity;
      let maxZ = -Infinity;
      
      // Sample-rate: For å ikke få for mange punkter, kan vi sample hver N'te piksel
      const sampleRate = 2; // Sample hver 2. piksel (justér for tetthet)
      
      // Iterer gjennom alle piksler
      for (let y = 0; y < logoHeight; y += sampleRate) {
        for (let x = 0; x < logoWidth; x += sampleRate) {
          const index = (y * logoWidth + x) * 4;
          
          const r = pixels[index];
          const g = pixels[index + 1];
          const b = pixels[index + 2];
          const a = pixels[index + 3];
          
          // Kun punkter for synlige piksler (alpha > threshold)
          if (a > 50) { // Threshold for transparens
            // Konverter piksel-koordinater til 3D-koordinater
            // Logo skal stå OPPREIST (vertikal):
            const pointX = centerOffsetX + (x * scaleX);  // Bredde (venstre-høyre)
            const pointY = centerOffsetY + Math.random() * 2;  // Tykkelse (dybde)
            const pointZ = baseZ + ((logoHeight - y) * scaleY);  // Høyde (opp-ned)
            
            tempPoints.push({ 
              x: pointX, 
              y: pointY, 
              z: pointZ,
              r: r / 255,
              g: g / 255,
              b: b / 255
            });
            
            minZ = Math.min(minZ, pointZ);
            maxZ = Math.max(maxZ, pointZ);
          }
        }
      }
      
      console.log(`Logo punktsky generert: ${tempPoints.length} punkter`);
      console.log(`Z range: ${minZ.toFixed(2)} til ${maxZ.toFixed(2)}`);
      
      // Finn X/Y bounds
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      
      for (const point of tempPoints) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }
      
      // Opprett posisjon, farge og velocity-arrays
      for (const point of tempPoints) {
        positions.push(point.x, point.y, point.z);
        colors.push(point.r, point.g, point.b);
        
        // Beregn retningsvektor fra sentrum til punktet (for eksplosjon)
        const dx = point.x - logoCenterX;
        const dy = point.y - logoCenterY;
        const dz = point.z - logoCenterZ;
        
        // Normaliser retningen og multipliser med tilfeldig hastighet
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const speed = 15 + Math.random() * 25; // Tilfeldig hastighet 15-40 m/s
        
        if (distance > 0) {
          velocities.push(
            (dx / distance) * speed,
            (dy / distance) * speed,
            (dz / distance) * speed
          );
        } else {
          // Hvis punktet er akkurat i sentrum, gi tilfeldig retning
          const randomAngle = Math.random() * Math.PI * 2;
          const randomElevation = (Math.random() - 0.5) * Math.PI;
          velocities.push(
            Math.cos(randomAngle) * Math.cos(randomElevation) * speed,
            Math.sin(randomAngle) * Math.cos(randomElevation) * speed,
            Math.sin(randomElevation) * speed
          );
        }
      }
      
      console.log(`X range: ${minX.toFixed(2)} til ${maxX.toFixed(2)}`);
      console.log(`Y range: ${minY.toFixed(2)} til ${maxY.toFixed(2)}`);
      
      resolve({
        positions,
        colors,
        velocities, // Legg til velocities for eksplosjon
        count: tempPoints.length,
        bounds: {
          minX,
          maxX,
          minY,
          maxY,
          minZ,
          maxZ
        }
      });
    };
    
    img.onerror = (error) => {
      console.error('Feil ved lasting av logo:', error);
      reject(new Error('Kunne ikke laste logo-bilde'));
    };
    
    // Start lasting av bilde
    // Bruk full path med Vite base (satt i vite.config.js)
    img.src = '/RENE-CloudStream3D/RENElogo.png';
  });
}