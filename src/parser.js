import * as THREE from 'three';

/**
 * Optimalisert parser for XYZ-filer
 * Bruker TypedArrays og unngår String.split() for å spare minne.
 *
 * Presisjon: Float32 har bare ~7 gjeldende siffer, så UTM-verdier som
 * Y ≈ 6.000.000 ville blitt avrundet til 0,5 m. Derfor lagres posisjonene
 * RELATIVT til første punkt (origin), som holdes i full presisjon (double).
 * Absolutt koordinat = positions[i] + origin. Bounds er i absolutte koordinater.
 */
export function parseXYZFile(content) {

  // 1. Tell linjer for å pre-allokere riktig størrelse (ett punkt per linje).
  // indexOf er rask, og dette unngår både overallokering og resizing.
  let lineCount = 1;
  for (let idx = content.indexOf('\n'); idx !== -1; idx = content.indexOf('\n', idx + 1)) {
    lineCount++;
  }

  // Alloker TypedArray (mye raskere enn vanlige arrays).
  // Farger allokeres først etter parsing, når antall punkter er kjent.
  let positions = new Float32Array(lineCount * 3);

  let pIndex = 0; // Peker til hvor vi er i positions-arrayet
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  // Regex som leser de tre FØRSTE tallene på hver linje (X Y Z).
  // - Flagg 'm': ^ matcher starten av hver linje, så en match alltid starter på en ny linje.
  // - Skilletegn er [ \t]+ (ikke \s+), så en match aldri går over et linjeskift.
  // Ekstra kolonner (intensitet, RGB, ...) ignoreres dermed, og linjer som ikke
  // starter med tre tall (headere, kommentarer, PCD/PLY-header) hoppes over.
  // V8 sin regex-motor er skrevet i C++ og er raskere enn manuell parsing for store strenger.
  // Matcher: start av linje, (tall) mellomrom (tall) mellomrom (tall)
  const lineRegex = /^[ \t]*([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)[ \t]+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)[ \t]+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)/gm;

  let match;

  // Lokalt origo (første punkt), lagret i full presisjon
  let originX = 0, originY = 0, originZ = 0;
  let hasOrigin = false;

  // --- PASS 1: Parse tekst til tall ---
  // Vi kjører regex i en løkke. exec() returnerer neste match uten å lage en gigantisk array.
  while ((match = lineRegex.exec(content)) !== null) {
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    const z = parseFloat(match[3]);

    if (!hasOrigin) {
      originX = x;
      originY = y;
      originZ = z;
      hasOrigin = true;
    }

    // Utvid array hvis estimatet var for lavt
    if (pIndex + 3 > positions.length) {
      const newPos = new Float32Array(Math.max(positions.length * 2, 3));
      newPos.set(positions);
      positions = newPos;
    }

    // Lagre relativt til origo (differansen regnes i double før lagring i Float32)
    positions[pIndex] = x - originX;
    positions[pIndex + 1] = y - originY;
    positions[pIndex + 2] = z - originZ;

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

  // Trim ned til faktisk størrelse (kopier bare hvis mye plass er ubrukt,
  // ellers holder det med et view; arrayet kopieres uansett til GPU-bufferet)
  if (pIndex < positions.length) {
    positions = (positions.length - pIndex > positions.length * 0.01)
      ? positions.slice(0, pIndex)
      : positions.subarray(0, pIndex);
  }
  const colors = new Float32Array(pIndex);

  console.log(`Parsed ${count} points. Z-Range: ${minZ} to ${maxZ}`);

  // --- PASS 2: Fargelegging (Lynraskt siden vi jobber med tall) ---
  const zRange = maxZ - minZ || 1;
  const tempColor = new THREE.Color(); // Gjenbruk objektet for å spare GC

  for (let i = 0; i < pIndex; i += 3) {
    const z = positions[i + 2] + originZ;
    const normalizedZ = (z - minZ) / zRange;

    // Blå (0.6) til Rød (0.0)
    tempColor.setHSL(0.6 - normalizedZ * 0.6, 1.0, 0.5);

    colors[i] = tempColor.r;
    colors[i + 1] = tempColor.g;
    colors[i + 2] = tempColor.b;
  }

  return {
    positions, // Float32Array, RELATIVT til origin
    colors,    // Float32Array
    count,
    bounds: { minX, maxX, minY, maxY, minZ, maxZ }, // Absolutte koordinater
    origin: { x: originX, y: originY, z: originZ }  // Full presisjon
  };
}

/**
 * Sentrerer posisjoner rundt origo.
 * @param {Float32Array|number[]} positions - Posisjoner relativt til `origin`
 * @param {Object} bounds - Absolutte bounds
 * @param {Object} origin - Origo som posisjonene er relative til (default 0,0,0 = absolutte posisjoner)
 * @returns {{centeredPositions: Float32Array, offset: {x,y,z}}} offset er i absolutte koordinater
 */
export function centerPositions(positions, bounds, origin = { x: 0, y: 0, z: 0 }) {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;

  // Forskyvning fra origin til senter (regnes i double)
  const shiftX = centerX - origin.x;
  const shiftY = centerY - origin.y;
  const shiftZ = centerZ - origin.z;

  console.log(`Centering offset: ${centerX}, ${centerY}, ${centerZ}`);

  // Hvis positions allerede er Float32Array, er dette raskt.
  // Vi kan modifisere in-place for å spare 50% minne:
  // const centeredPositions = positions;

  // ELLER lage kopi for sikkerhets skyld (men bruk samme type):
  const centeredPositions = new Float32Array(positions.length);

  for (let i = 0; i < positions.length; i += 3) {
    centeredPositions[i] = positions[i] - shiftX;
    centeredPositions[i + 1] = positions[i + 1] - shiftY;
    centeredPositions[i + 2] = positions[i + 2] - shiftZ;
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
  const tempColor = new THREE.Color();

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

  // Generer punkter med variert terreng - direkte til positions array
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

      positions.push(x, y, z);

      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }

  const count = positions.length / 3;
  console.log(`✓ ${count} punkter generert`);
  console.log(`📍 Høydespenn: ${(maxZ - minZ).toFixed(2)}m (${minZ.toFixed(2)} til ${maxZ.toFixed(2)}m)`);

  // Fargelegging i samme loop siden vi vet Z-range på forhånd (baseZ til baseZ+10)
  const zRange = maxZ - minZ || 1;

  for (let i = 0; i < positions.length; i += 3) {
    const z = positions[i + 2];
    const normalizedZ = (z - minZ) / zRange;

    // Fargelegg basert på Z-verdi (samme gradient som i parseXYZFile)
    tempColor.setHSL(0.6 - normalizedZ * 0.6, 1.0, 0.5); // Blå (0.6) til rød (0.0)
    colors.push(tempColor.r, tempColor.g, tempColor.b);
  }

  return {
    positions,
    colors,
    count,
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

      // PASS 1: Samle punkter og beregn bounds
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

            positions.push(pointX, pointY, pointZ);
            colors.push(r / 255, g / 255, b / 255); // Logo beholder originalfarger

            minZ = Math.min(minZ, pointZ);
            maxZ = Math.max(maxZ, pointZ);
          }
        }
      }

      const count = positions.length / 3;
      console.log(`Logo punktsky generert: ${count} punkter`);
      console.log(`Z range: ${minZ.toFixed(2)} til ${maxZ.toFixed(2)}`);

      // Finn X/Y bounds fra positions array
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

      // PASS 2: Beregn velocities for eksplosjon
      for (let i = 0; i < positions.length; i += 3) {
        const pointX = positions[i];
        const pointY = positions[i + 1];
        const pointZ = positions[i + 2];

        // Beregn retningsvektor fra sentrum til punktet (for eksplosjon)
        const dx = pointX - logoCenterX;
        const dy = pointY - logoCenterY;
        const dz = pointZ - logoCenterZ;

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
        count,
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