# Endringslogg

Alle merkbare endringer i RENE CloudStream3D står her.

Formatet følger [Keep a Changelog](https://keepachangelog.com/no/1.1.0/), og versjonsnumrene følger [semantisk versjonering](https://semver.org/lang/no/), tilpasset en app uten API:

- **Major** (`2.0.0`): samme fil kan gi andre tall enn før (koordinater, statistikkmetode, oppløsningsberegning), eller støtte for et filformat er fjernet.
- **Minor** (`1.1.0`): nye funksjoner eller filformater. Gamle filer gir samme resultat.
- **Patch** (`1.0.1`): feilrettinger som ikke endrer resultatene.

Versjonen og commit-hashen står nederst i appen og i bunnteksten i PDF-rapporten, f.eks. `CloudStream3D v1.0.0-rc.1 (161da9e)`. Slik kan du se hvilken versjon som laget en rapport.

## [Unreleased]

### Lagt til
- Versjonsnummer i appen, i konsollen og i PDF-rapporten: `CloudStream3D v1.0.0-rc.1 (161da9e)`. Byggetidspunktet vises når du holder musen over etiketten.
- Denne endringsloggen.

### Endret
- Deploy kjører testene før bygging. En feilende test stopper publiseringen.

## [1.0.0-rc.1] - 2026-11-24

Første versjon med versjonsnummer. Den samler alt som er gjort frem til nå. «rc» betyr *release candidate*: appen er ikke testet med ekte skannerdata ennå. `1.0.0` settes når det er gjort.

> **Viktig: rapporter laget før 24.11.2026 kan ha feil koordinater.**
> Eldre versjoner lagret UTM-koordinater med for lav presisjon. Y-verdier (nord, ca. 6.000.000) kunne bli avrundet med **opptil 0,5 m**, og X-verdier (øst, ca. 500.000) med opptil ca. 3 cm. Feilen gjaldt koordinater i måling, profil, eksport, statistikk og PDF-rapport. Rapporter og eksporterte filer laget med eldre versjoner bør kontrolleres eller lages på nytt. Versjonsnummeret i bunnteksten kom først etter rettingen, så regn rapporter uten versjonsnummer som berørt.

### Rettet
- **Koordinatpresisjon** (#11): UTM-koordinater beholder full presisjon. Største feil på et testsett på 2 × 2 km gikk fra 250 mm til under 0,1 mm.
- **Filer med mer enn tre kolonner** (#11): filer med `x y z intensitet` eller `x y z r g b` ga forskjøvne punkter eller ekstra feilpunkter. Nå leses bare de tre første tallene på hver linje. Header- og kommentarlinjer blir ikke lenger lest som punkter.
- **Z-invertering** (#11): etter invertering viste måleverktøyet, profilverktøyet og eksporterte punkter feil Z.
- **Statistikk etter Z-invertering av standardterrenget** (#12): høydeområdet tok med logo-punktene og viste feil minimum.
- **Z med få desimaler** (#11): datasett med under 1 m høydespenn viste samme verdi for min og maks. Z vises nå med 3 desimaler når spennet er under 1 m.

### Lagt til
- **Komma- og semikolonseparerte filer og `.csv`** (#12): skilletegn (mellomrom, tab, komma, semikolon) og desimalkomma finnes automatisk. Norsk Excel-eksport (`1,5;2,5;3,5`) fungerer.
- **PLY og PCD** (#12): ASCII og binær (little endian). Bare punktene leses; flater (faces) i PLY ignoreres. Ugyldige punkter (NaN) i PCD hoppes over. UTM-presisjonen beholdes også for binære filer. Formater som ikke støttes (big endian PLY, komprimert PCD, avkortede filer) gir en tydelig feilmelding.
- **Store filer** (#12): filer over 512 MB kan lastes, med fremdrift i prosent. 20 mill. punkter (600 MB) lastes på ca. 8 s i Chromium. Før feilet slike filer uten feilmelding.
- **Manuell fargeskala** (#11): «Color Scale (Z)» i panelet gir valg mellom automatisk og manuell min/maks. Skalaen beholdes når ny fil lastes. Legenden, histogrammet og PDF-rapporten følger den.
- Legenden viser høydespennet (Δz).
- Eksport av valgte punkter med 3 desimaler (mm).

### Endret
- **Mindre minnebruk ved innlasting** (#11, #12): fra ca. 175 til ca. 24 byte per punkt utover selve filen. Store filer laster raskere og krasjer sjeldnere. Oppløsningsberegningen er ca. 5 ganger raskere.
- Filtypen avgjøres av innholdet, ikke av filendelsen.
- Deploy bruker Node 22 (#13).

### Grunnfunksjoner (januar 2026)
- 3D-visning av punktskyer med høydefarger, histogram og statistikk.
- Avstandsmåling, profil/tverrsnitt, seleksjonsboks med eksport og koordinatgrid.
- PDF-rapport med kartbilde, statistikk, histogram og profil.
- Standardterreng med RENE-logo ved oppstart.
- Automatisk publisering til GitHub Pages ved hver endring på `main` (#1–#3). Prosjektdokumentasjon ryddet (#4).
