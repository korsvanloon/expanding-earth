# What the research pass found

The pass that RESEARCH.md asks for, run on 2026-09-05. One section per
question, in RESEARCH.md's order; then the datasets this pipeline could read;
then what is still missing and where it would be looked for.

How to read a row. **Status** says what was actually done: *verified* means the
source was opened and the number, table or figure was read off it; *partial*
means the source was opened but the specific claim could not be seen (abstract
only, paywall, image not inspected); *secondary* means the number is quoted
from another author who read the original; *not reached* means no host served
it. Where a figure is cited the page is the printed page of the work unless it
says "PDF p.", which is the page of the file named. The downloaded files
themselves (theses, scans, proceedings) sit in the session scratchpad and are
not part of the repository.

Two rules were kept: nothing here weighs the hypothesis, and nothing is a
summary of what an author thought. Where the literature has no number, the row
says not found.

---

## Q1 — An externally-picked conjugate set

Answered, with one substitution. The pick database exists, was downloaded and
counted, and carries no per-pick positional error; the per-pick errors live in a
sibling archive of published Hellinger fits. The conjugate misfit after best-fit
rotation has published numbers for two plate pairs and computed numbers for a
third. The obliquity distribution was not published anywhere as a table, so it
was computed here from the Seton 2020 obliquity grid.

### The pick set

| Artefact | What it gives | Source | URL | Status |
|---|---|---|---|---|
| **GSFML global magnetic-anomaly picks** | 101,806 point picks from 108 references and 206 chron names; OGR/GMT POINT file, header `Chron\|AnomalyEnd\|AnomEndQua\|CruiseName\|Reference\|DOI\|GeeK2007\|IDMethod`, each pick a `# @D` line then `lon<TAB>lat` (WGS84, lon −180…180, bbox −180/180/−75.85/58.08); ages on Gee & Kent 2007, 0–166.79 Ma; AnomalyEnd y/o/c; AnomEndQua 1/2/3 = 81,461 / 14,956 / 5,389; IDMethod 100,675 magnetic anomaly, 956 abyssal hill, 175 three-plate solution; also per-basin and per-publication files; **no per-pick positional uncertainty**; picks are not paired, so conjugate quadruples must be built by pairing same-chron, same-end picks across a ridge within one Reference; no licence stated | Seton et al. 2014, G-cubed 15(4), 1629–1641, DOI 10.1002/2013GC005176; site updated 17 Jul 2018 | https://www.soest.hawaii.edu/PT/GSFML/ML/DATA/GSFML.global.picks.gmt (11,080,541 bytes); shapefile and KML alongside | verified (downloaded, counted) |
| Seton 2014 on uncertainty | "a global set of 96,733 published magnetic anomaly identifications" (2014); errors "are difficult to quantify"; a missing young/old/centre flag "could potentially lead to tens of km of difference in the location/age association"; Pacific picks "old (pre-1980s), poorly documented and subject to larger data source and digitizing uncertainties"; look-up tables for Cande & Kent 1995, Gee & Kent 2007, Gradstein 2004 | accepted manuscript, 34 pp. | https://epic.awi.de/34756/1/Seton_etal_2014.pdf | verified |
| **GSFML Hellinger archive: the per-pick sigmas** | 487 files in 11 study directories; 162 `.pick` files with 18,315 picks (6,516 magnetic, 11,799 fracture zone); each pick has a segment number and an assigned 1σ position error in km (header: "Col5 sigma_mag sigma_fz km"); modal σ values 3.0, 3.5, 4.0, 5.0, 5.5, 6.0, 9, 10, 15 km, i.e. 3–6 km for Cenozoic magnetic picks and 5–15 km for Cretaceous, quiet-zone and FZ picks; model files carry the fitted pole (lat, lon, angle), κ̂ and a 3 × 3 covariance; the format is Chang's `hellinger1` (Kirkwood et al. 1999, GJI 137, 408–428) | Seton et al. 2014; studies: Williams 2011, Whittaker 2007 and 2013, Cande, Patriat & Dyment 2010, Cande & Patriat 2015, Granot & Dyment 2018, Granot 2013, Gaina 1998/1999/2002, Müller 1999 | https://www.soest.hawaii.edu/PT/GSFML/HELL/DATA/GSFML.Global.hellinger.zip (1,395,356 bytes); software http://www.soest.hawaii.edu/PT/Chang.zip | verified (unzipped, header quoted) |

### Conjugate misfit after a best-fit rotation

| Artefact | What it gives | Source | URL | Status |
|---|---|---|---|---|
| Eurasia–North America, 0–20 Ma | ">11 000 crossings of 21 magnetic reversals from Chron 1n (0.78 Ma) to C6no (19.72 Ma)"; best-fit rotations "reconstruct the reversal crossings with weighted root mean square misfits of only 1–2 km and 0.2–7 km for the transform fault and fracture zone crossings"; assigned 1σ per FZ crossing ±0.5 to ±6 km | Merkouriev & DeMets 2014, GJI 198(1), 366–384 | https://academic.oup.com/gji/article/198/1/366/611121 | verified (abstract) |
| Nubia–Eurasia–North America | 13,244 and 12,866 crossings; noise-reduced rotations raise reversal WRMS by ~20% and FZ-flowline WRMS (1,377 crossings) by 12% over best fit; km value in the body | DeMets, Iaffaldano & Merkouriev 2015, GJI 203(1), 416–427 | https://academic.oup.com/gji/article/203/1/416/578434 | partial (counts only) |
| **Australia–Antarctica, 40–83 Ma, from the model files** | Effective RMS = σ·√(reduced misfit): Whittaker 2007 C20o–C31o 4.2–5.9 km (σ 5.5), C32y–C34y 8.9–9.7 km (σ 9), quiet-zone boundary 12.3 km (σ 15); Whittaker 2013 C21y 6.6, C24o–C31o 15.1–17.4 (σ 10, reduced misfit 2.3–3.0), C32y–C33o 11.2–11.4; Williams 2011 C34y 24.7 km (σ 15, reduced misfit 2.71), full-fit COB 7.7 km. Hellinger per-pick residuals (distance to the fitted great-circle segment, not to a rotated conjugate) over 1,364 picks: median 0.9 km, p90 4.3, p95 6.0, max 16.0 | computed here from the GSFML Hellinger model and residual files | as above | verified (computed) |

Reading: for a slow-spreading Cretaceous pair the published effective RMS
conjugate misfit is 9–25 km at 83 Ma and 5–17 km for Cenozoic chrons; for a
young fast pair it is 1–2 km. The assigned σ are often too small (reduced misfit
above 1).

### Obliquity

| Artefact | What it gives | Source | URL | Status |
|---|---|---|---|---|
| **Seton 2020 obliquity grid, and its distribution** | `obliq.2020.1.GeeK2007.6m.nc`, 9,402,290 bytes, 3601 × 1801, 6 arcmin gridline, lon −180…180, **stored south-to-north (flip)**, float32, NaN fill, 0.01–90°; 3,189,443 valid cells (49.2%). Definition from the workflow code: deviation of the model spreading-velocity azimuth (from the rotation model, folded to the smaller azimuth) from the isochron normal. Area-weighted over dated floor: p10/p25/**p50** = 1.0/2.5/**6.5°**; p75/**p90**/p95/p99 = 16.1/**41.4**/81.4/90.0°; above 15°: 26.9%; above 30°: 13.9%; **above 45°: 9.3%**; above 60°: 7.7%. Histogram: 0–5° 42.4%, 5–10° 20.7%, 10–15° 10.0%, 15–20° 6.6%, 20–30° 6.4%, 30–45° 4.6%, 45–60° 1.6%, 60–90° 7.7%. The 60–90° bin is a separate near-90° cluster that the README's known-bugs note ("artefacts … along fracture zones … and in areas with highly oblique spreading (e.g. South-West Indian Ridge)") marks as partly artefact. This is a model obliquity (stage pole against isochron normal), not a measured FZ-azimuth residual | Seton et al. 2020, G-cubed 21, e2020GC009214, v2020.1; definition from `isopolate.py` lines 494–535 | https://www.earthbyte.org/webdav/ftp/earthbyte/agegrid/2020/Grids/obliq.2020.1.GeeK2007.6m.nc ; https://raw.githubusercontent.com/EarthByte/presentday-agegridding/master/isopolate.py | verified (computed from the file) |
| Companion grids | `dir` (spreading direction, deg, 7.5 MB), `asym` (%, 6.1 MB), `full_rate` (mm/yr), `full_rate_bands` (spreading-mode class), `conf`, `age_misfit` — all 6 arcmin, CC BY 4.0 | Seton 2020 | same directory | verified (listing, README) |

**Against the model.** The 45° pair-rejection gate keeps about 91% of dated
floor by area and discards a population that is mostly the near-90° cluster; a
30° gate would keep 86%. A uniform spring stiffness has a published replacement
in the 3–15 km σ of the Hellinger picks, or in the Seton misfit grid (Q6) for a
per-cell weight. The pipeline's own conjugate residuals (tens to hundreds of km)
compare with 1–2 km for a young fast pair and 9–25 km for Australia–Antarctica at
83 Ma, which is what a plate-model fit achieves on the same kind of pick.

### The fabric and the third witness

| Artefact | What it gives | Source | URL | Status |
|---|---|---|---|---|
| **GSFML sea-floor fabric polylines** | 10 OGR/GMT LINESTRING files, 2,246 segments, 24,504 vertices (sparse guide points, ~10 per FZ; continuous traces are regenerated by the GMT `gsfml` supplement against the VGG grid); per segment `> -I<ID> -L<Name> -T<Author>`; lon/lat decimal degrees, lat −67.7 to 58.3 (no Arctic); counts: FZ 1273 (Matthews) + 402 (Myhill) + 101 (Whittaker) + 11 (Chandler, Ellice Basin) + 54 less certain; discordant zones 288; propagating rifts 19; V-anomalies 6; extinct ridges 24; unclassified V 68; no age, azimuth or uncertainty field; no licence stated | Wessel, Matthews, Müller, Mazzoni, Whittaker, Myhill & Chandler 2015, G-cubed 16(7), 2462–2472; data 10 Jun 2015 | https://www.soest.hawaii.edu/PT/GSFML/SF/DATA/GSFML_SF.tbz (255,336 bytes); .zip shapefiles 362,072; .kmz 315,190; supplement https://www.soest.hawaii.edu/PT/GSFML/gmt-gsfml-1.0.3-src.tar.bz2 | verified (unpacked, counted) |
| Matthews 2011 Traces.zip | 1,686 polylines in four formats (gpml raw and cookie-cut, shapefile, KML, GMT xy): FZ 1208, FZLC 54, DZ 288, PR 19, PF 10, ER 33, VANOM 6, UNCV 68; FZ.gmt 12,837 coordinate lines, bbox −180/180/−70.64/71.85; digitised on Sandwell & Smith VGG v16.1 "along their vertical gravity gradient minima"; precision on 20 FZs: MAD under 3.4 km from the raw VGG minima and under 5.4 km from model-profile fits; **CC BY 4.0** (the GSFML site has no licence) | Matthews, Müller, Wessel & Whittaker 2011, JGR 116, B12109 | https://www.earthbyte.org/webdav/ftp/earthbyte/Seafloor_Tectonic_Fabric/Traces.zip (2,598,596 bytes) | verified (unpacked, counted) |
| EMAG2v3 | GMT server netCDF 06m: 4,284,908 bytes gridline, int16 at 0.2 nT with offset 800 nT, Gaussian-filtered 31.5 km, ocean-only at sea level; 4 km upward-continued global variant 7,016,987 bytes (0.4 nT, offset 2600); NOAA originals: CSV 1.1 GB, GeoTIFFs 85–228 MB with nodata 99999 nT and error −999 | Meyer, Saltus & Chulliat 2017, DOI 10.7289/V5H70CVX | https://oceania.generic-mapping-tools.org/server/earth/earth_mag/earth_mag_06m_g.grd ; readme https://www.ngdc.noaa.gov/geomag/data/EMAG2/EMAG2_readme.txt | verified |
| WDMAM v2.2 | GMT server 06m gridline 8,086,954 bytes; original 3 arcmin tiled (30 MB); global including land, nT at ~5 km, int16 0.2 nT offset 3000 nT; server dated 2025-03-18; the wdmam.org original sits in S3 buckets that deny listing | Choi et al. 2025 (GMT attribution) | https://oceania.generic-mapping-tools.org/server/earth/earth_wdmam/earth_wdmam_06m_g.grd | verified (GMT copy) |
| Kim & Wessel 2011 seamounts | `KWSMTSv01.txt`, 1,805,214 bytes, "24,646 potential seamounts"; columns lon, lat, basal-ellipse azimuth, major and minor axes (km), height (m), max FAA, max VGG (Eötvös), regional depth, sea-floor age, ID; 8,458 taller than 1 km; no licence | GJI 186(2), 615–631 | http://www.soest.hawaii.edu/PT/SMTS/kwsmts/KWSMTSv01.txt | verified |
| Gevorgian 2023 small-seamount census | `SIO_Seamounts.zip` 4.1 MB, CC BY 4.0; "19,325 newly identified seamounts" plus the KWSMTS KML and a bad-list; text files with longitude, latitude, height, radius, base depth, name, charted flag; total census ~35,000 above 400 m | Gevorgian, Sandwell, Yu, Kim & Wessel 2023, Earth and Space Science | https://zenodo.org/records/7718512 | verified (record) |
| Doubrovine 2012 moving-hotspot frame, what is open | Pacific APM to 83.5 Ma as 8 rotations (lon, lat, age, angle): (−82.3, 65.29, 10, 8.13), (−84.08, 70.5, 20, 15.41), (−82.03, 70.02, 30, 22.18), (−61.86, 70.31, 40, 29.03), (−58.69, 65.73, 50, 33.19), (−68.55, 58.22, 60, 36.95), (−71.29, 54.0, 70, 39.88), (−81.23, 54.73, 83.5, 45.25); Hawaii plume drift path 0–80 Ma; the full frame and the track-age table are in Wiley supporting information (403) | Doubrovine, Steinberger & Torsvik 2012, JGR 117, B09101 | https://raw.githubusercontent.com/GenericMappingTools/gmt/master/test/spotter/D2012x.txt ; D2012_HI_drift.txt | verified (GMT files); full frame not reached |
| Wessel & Kroenke 2008 | WK08-A/G Pacific absolute motion from 12 seamount chains; embedded in the EarthByte rotation files shipped with GMT (`Global_250-0Ma_Rotations_2019_v2.rot`, 510,331 bytes) rather than as its own file | JGR 113, B06101 | — | partial |

Not found: a per-pick positional error in the Seton 2014 compilation (only the
categorical end-quality flag); a single published global median conjugate
misfit; a published table of fracture-zone azimuth against spreading direction
(the GSFML polylines plus the Seton `dir` grid would let the pipeline compute
it); the full Doubrovine 2012 frame and the WK08 rotation files (Wiley 403 on
every route); the Wessel 2015 paper text (counts taken from the archive
instead); a wdmam.org download; licences for GSFML and KWSMTS.

## Q2 — Continental joins with a date from the geology

Answered for the six joins in use and for twelve more, with the finding that
two of the six dates in use fall on the wrong side of breakup and one is off
by about 45 Myr. Every chron age below is on the source paper's own timescale
(mostly GTS2012); GTS2020 was not opened, so C-chron ages may shift by up to 1
Myr and old M-chron ages by 2–3 Myr.

### The six joins in use

| Join | In use | Geology says | Basis | Source | URL | Status |
|---|---|---|---|---|---|---|
| South America – Africa | 180 | still joined by 140 ± 5; last moment before any oceanic crust ~133 | Extension "from 140 Ma until late Hauterivian times (≈126 Ma)"; final breakup Santos–Benguela "at around 113 Ma", equatorial Atlantic 103 Ma; salt base Aptian to 113 Ma; oldest anomalies M11 (~135 Ma) off Cape Town, M4 (130.6 Ma) reaching 9°S above the salt canopy | Heine, Zoethout & Müller 2013, Solid Earth 4, 215–253; Bird & Hall 2016, GJI 206, 835 | https://se.copernicus.org/articles/4/215/2013/ ; https://academic.oup.com/gji/article/206/2/835/2605992 | verified |
| Australia – Antarctica | 100 | 100 defensible; last contact 83 ± 3 (chron 34); rifting from ~160 (Callovian ~164) | "Seafloor spreading between Australia and Antarctica slowly initiated from 83 Ma (chron 34), following rifting that probably initiated as early as 160 Ma"; breakup propagating from ~93 Ma in the west; magma-poor margin with exhumed mantle; Cande & Mutter 1982 revised the oldest anomaly from 22 to 34 | Williams, Whittaker, Halpin & Müller 2019, Earth-Sci. Rev.; Gillard et al. 2015, Tectonics; Whittaker et al. 2007/2013 | https://www.earthbyte.org/australian-antarctic-breakup-and-seafloor-spreading-balancing-geological-and-geophysical-constraints/ | partial (abstract page has no numbers; numbers from snippets) |
| India – Africa | 120 | **still joined by 165 ± 5**; at 120 Ma the West Somali Basin had already *finished* opening | India left Africa inside the Madagascar block: West Somali Basin anomalies M0r (120.8 Ma) to M24Bn (152.43 Ma) about an extinct ridge, oldest M22–M24 (150–155 Ma), spreading "may have begun earlier, 170–160 Ma", ceased at M0 (Aptian); first oceanic crust in the Mozambique Basin and Riiser-Larsen Sea 164.1 Ma (M38n.2n); Karoo 183 Ma pre-dates | Davis, Eagles, Reeves et al. 2016, Gondwana Research, DOI 10.1016/j.gr.2016.02.010; Mueller & Jokat 2019, Tectonophysics 750, 301–328 | https://www.sciencedirect.com/science/article/abs/pii/S1342937X16300314 ; https://epic.awi.de/id/eprint/48756/ | partial (both hosts blocked; two independent snippets agree on each number) |
| Greenland – North America | 60 | still joined by 65; 70 to respect the C31 school | COT "first started … around 88 Ma"; "actual break-up and seafloor spreading started around 63 Ma in the Labrador Sea" and 61 Ma (chron 26) in Baffin Bay; "all previously identified magnetic lineations landward of anomaly 27 reflect intrusions into continental crust"; the alternative school puts the COB oceanward of anomaly 31 (70 Ma) | Hosseinpour, Müller, Williams & Whittaker 2013, Solid Earth 4, 461–479 | https://se.copernicus.org/articles/4/461/2013/ | verified |
| North America – NW Africa | 190 | still joined by 195 ± 5; 190 is the breakup instant itself | "the opening of the Central Atlantic Ocean started already during the Late Sinemurian (190 Ma)"; first 20 Myr "extremely slow (~0.8 cm/y)" to Blake Spur at 170 Ma; initial fit from the salt provinces off Morocco and Nova Scotia; CAMP 201.5 Ma is pre-breakup on both margins | Labails, Olivet, Aslanian & Roest 2010, EPSL 297, 355–368 | https://archimer.ifremer.fr/doc/00014/12533/ | verified |
| East Antarctica – Africa | 170 | 170 ± 5 defensible; 165 is the last joined instant | 164.1 Ma (M38n.2n) first oceanic crust in both the Mozambique Basin and the Riiser-Larsen Sea; Karoo 183 Ma as rift-onset marker; the Mozambique Ridge (M18n–M6n, 144–131.7 Ma) and the northern Natal Valley (M26r–M18n, 157.1–144 Ma) are thick oceanic crust added later, not continent | Mueller & Jokat 2019 | https://epic.awi.de/id/eprint/48756/ | partial (snippets) |

**What this does to the scorecard.** The India–Africa miss of 1159 km at 120
Ma is the width of the West Somali Basin, not a solver failure: the geology has
Madagascar and India already at their full Aptian separation from Africa by
then. India's own conjugate margins are Madagascar (to 90 Ma), the Seychelles
and Laxmi Ridge (to 66 Ma) and Antarctica, so the join that tests India's late
departure is India–Madagascar at 90 ± 2, and the join that tests Gondwana's
first rupture is Madagascar–Africa at 160 ± 5. Greenland–North America at 60
Ma is scored three million years *after* spreading began, so the model is asked
to close an ocean that the geology says was already about 100 km wide. North
America–Africa at 190 is scored on the last joined instant. South America–Africa
at 180 is safe but leaves 40 Myr of slack that cannot fail.

### Twelve further joins, with boxes

| Continent A | Continent B | Joined by Ma | ± | Basis | Source | URL | Status |
|---|---|---|---|---|---|---|---|
| Iberia (lon −10…3, lat 36…44) | Newfoundland | 130 | 5 | Exhumed-mantle domain from ~129–131 Ma; magmatism at M4 (128 Ma); J anomaly with exhumed mantle late Aptian 120–113; "onset of seafloor spreading at the Aptian–Albian transition (113 Ma)"; disputed M20–M0 picks off Iberia | Causer et al. 2020, Solid Earth 11, 397 | https://se.copernicus.org/articles/11/397/2020/ | verified |
| Europe (Norway) | Greenland | 56 | 1 | Breakup at C24r/C24n3n (~55–54 Ma) with NAIP seaward-dipping reflectors; "Deformation in the Norway Basin could have begun between chron C24n3n time (approximately 54–53 Ma) and the second breakup phase between East Greenland and the Jan Mayen microcontinent at around chron C6b" | Gernigon et al. 2015; Straume, Gaina et al. 2021, Comm. Earth Env. | https://www.nature.com/articles/s43247-021-00249-w | partial (snippets) |
| Jan Mayen microcontinent (lon −12…−5, lat 67…72) | Greenland | 25 | 3 | Second breakup at ~C6b (22–23 Ma); Aegir Ridge extinct | Gernigon et al. 2015 | https://www.researchgate.net/publication/282848579 | partial |
| Arabia (lon 34…60, lat 12…32) | Africa | 30 unrifted; 20 Gulf of Aden; 12 to 5 Red Sea | 2 / 1 | "The Afar area's development commenced with the eruption of vast flood basalts around 30 Ma"; "oceanic spreading ∼17.6 Ma in the easternmost part of the Gulf of Aden"; Arabia–Somalia spreading "circa 20 million years ago, shortly before Chron 6 (19.7 Ma)"; Red Sea spreading "∼5 Ma, with possible initiation as early as 12 Ma" | Nyangena et al. 2024, Heliyon (review); GJI 2016 kinematics | https://pmc.ncbi.nlm.nih.gov/articles/PMC11016725/ | verified (review); 20 Ma snippet |
| Madagascar (lon 43…51, lat −26…−11) | Africa | 160 | 5 | West Somali Basin M24Bn (152.43) to M0r (120.8); spreading possibly from 170–160 Ma | Davis et al. 2016; Phethean et al. 2016, G-cubed | as above | partial |
| India | Madagascar | 90 | 2 | "Seventeen argon-40/argon-39 age determinations reveal that volcanic rocks and dikes from the 1500-kilometer-long rifted eastern margin of Madagascar were emplaced rapidly (mean age = 87.6 ± 0.6 million years ago)"; Mascarene Basin opens ~88–84 Ma | Storey et al. 1995, Science 267, 852–855 | https://www.science.org/doi/10.1126/science.267.5199.852 | partial (snippet; PubMed page gave a cookie notice) |
| Seychelles (lon 52…58, lat −8…−3) | India (Laxmi Ridge) | 66 | 3 | Gop Rift spreading 71–66 Ma (uncertain); Seychelles–Laxmi Ridge spreading "well dated by magnetic anomalies at 63.4 Ma"; Deccan 66 | Collier, Sansom, Ishizuka et al. 2008, EPSL 272, 264–277 | https://www.sciencedirect.com/science/article/abs/pii/S0012821X08002999 | partial (snippet) |
| Sri Lanka | India | never separated | — | Cauvery–Mannar failed rift, Late Jurassic–Early Cretaceous; keep Sri Lanka inside the India polygon | Gibbons et al. 2013, JGR (plate model); "The Tectonic Umbilical Cord Linking India and Sri Lanka" 2020, JGR | https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2019JB018225 | partial (snippet) |
| Australia | Zealandia, Lord Howe Rise (lon 158…168, lat −38…−22) | 90 | 5 | "The Tasman Sea formed during separation of Eastern Australia from the Lord Howe Rise … (85 to 52 Ma)"; "Time of cessation: Ca. 52 Ma, chron C24n"; qualitative pre-C33y opening 90–73 Ma with 13 microplates | Gaina et al. 1998, JGR 103, 12413; GPlates Portal | https://portal.gplates.org/static/html/ExRidges/ExRidges_HTML_pages/4-14_Tasman_Sea.html | verified (portal page) |
| Antarctica (Marie Byrd Land) | Zealandia, Campbell Plateau (lon 165…180, lat −55…−46) and Chatham Rise (lat −45…−42) | 90 | 5 | "Seafloor spreading started first (Chron 34, before 83 Ma) … between the Chatham Rise and the Bellingshausen plate, and later (Chron 33, c. 79 Ma) between the Campbell Plateau and Marie Byrd Land"; rifting ~90 Ma | Wobbe et al. 2012, G-cubed; Larter et al. 2002; Eagles, Gohl & Larter 2004 | https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2011GC003742 | partial (Wiley 403) |
| Antarctica | South America, Falkland Plateau (Weddell) | 150 | 7 | "Seafloor spreading was established in the Weddell Sea around 140 Ma"; oldest crust ~147 Ma in other compilations (see the Q6 Weddell row: 147–167) | König & Jokat 2006, JGR | https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2005JB004035 | partial |
| Antarctic Peninsula | Tierra del Fuego (Drake) | 30 | 2 | "The Drake Passage opened around 28 Ma in the Oligocene (34–23 Ma)"; West Scotia Sea crust 30–6 Ma | Maldonado et al. 2021, Earth-Sci. Rev.; Eagles & Jokat 2014 | https://www.sciencedirect.com/science/article/pii/S0012825221000507 | partial |
| South China | Borneo, Dangerous Grounds (lon 111…118, lat 8…12) | 34 | 1 | "initial seafloor spreading started around 33 Ma in the northeastern South China Sea"; ridge jump ~23.6 Ma; terminal ages ~15 Ma (East) and ~16 Ma (Southwest); oldest chron C12 (32 Ma) | Li, Xu, Lin et al. 2014, G-cubed 15, 4958–4983 | https://repository.lsu.edu/geo_pubs/388/ | verified |
| Baja California (lon −118…−109, lat 22.5…32.5) | Mexico | 12 unrifted; 6 last contact | 1 | "oblique continental breakup onset occurred at ∼12 Ma, with seafloor spreading beginning at ∼7 Ma"; no oceanic crust in the northern Gulf | Oskin & Stock 2003, Geology; Umhoefer 2011, GSA Today | https://www.geosociety.org/gsatoday/archive/21/11/article/i1052-5173-21-11-4.htm | partial |
| Iberia | Africa | not a rifted pair | — | Algerian Basin (oceanic, Early Miocene ~20) and Alborán (Tortonian ~11) are slab-rollback back-arcs | Watts et al. 1993; Medaouri et al. 2014 | — | partial; not recommended |
| Adria (lon 12…20, lat 38…46) | Africa / Europe | Adria stayed an African promontory; Adria–Europe joined by 175 ± 5 (Alpine Tethys opens Middle Jurassic); Ionian ~250 | — | "The opening of the Neotethys around 250 Ma ago separated … Apulia from the Africa plate" | Tugend et al. 2019, Earth-Sci. Rev.; Muttoni et al. 2013 | https://www.sciencedirect.com/science/article/abs/pii/S0012825222001295 | partial |

### The three LIPs

| LIP | Age | Basis | Source | URL | Status |
|---|---|---|---|---|---|
| CAMP | main pulse 201.5 ± 0.1 Ma; province ~201.6–200.6 | Palisade sill "201.520 ± 0.034" Ma (feeder of the oldest Newark lavas); Preakness Basalt "201.274 ± 0.032 Ma"; end-Triassic extinction "201.564 ± 0.015/0.22 Ma"; four pulses over ~600 kyr; North Mountain Basalt re-dated "201.464 ± 0.017 Ma", Senador Pompeu dyke "201.579 ± 0.057 Ma" | Blackburn et al. 2013, Science 340, 941–945 (PDF read); Oliveira et al. 2023, Sci. Rep. | https://pmc.ncbi.nlm.nih.gov/articles/PMC10073112/ (Oliveira); Blackburn via a personal.kent.edu mirror | verified |
| Karoo–Ferrar | 182.7 ± 0.5 Ma; main pulse under 1 Myr | Karoo sills and dykes "ranging from 183.0 ± 0.5 to 182.3 ± 0.6 million years", basin-scale emplacement "within an interval of about 0.47 million years"; Ferrar "over an interval of 349 ± 49 kyr, beginning … as early as 182.779 ± 0.033 Ma" | Svensen, Corfu, Polteau, Hammer & Planke 2012, EPSL 325–326, 1–9; Burgess, Bowring, Fleming & Elliot 2015, EPSL 415, 90–99 | — | partial (snippets; ADS 405, ScienceDirect 403) |
| Paraná–Etendeka | 134.5 ± 1.0 Ma; main phase 135.5–132 | U–Pb baddeleyite/zircon "134.3 ± 0.8 Ma" for a Chapecó-type dacite, older than ⁴⁰Ar/³⁹Ar on overlying basalts (133.6–131.5); "main phase of magmatism of approximately 1.6–3.5 Myr, from 135.5 to 132 ± 0.1 Ma"; post-dates M11 (~135) by under 1 Myr and pre-dates M4 (130.6) | Janasi, de Freitas & Heaman 2011, EPSL 302, 147–153; Gomes & Vasconcelos 2021, Earth-Sci. Rev. 220, 103716 | — | partial (snippets) |

**Against the model.** Re-dated as the geology reads, the scorecard becomes:
India–Africa 165 ± 5 (or replaced by Madagascar–Africa 160 ± 5 and
India–Madagascar 90 ± 2); Greenland–North America 65 to 70; North America–Africa
195 ± 5; South America–Africa 140 ± 5 if it is to score at all; Australia–Antarctica
100 and East Antarctica–Africa 170 unchanged. Twelve joins with dates that
cannot be tuned against are listed above; the four with an opened primary
source are Iberia–Newfoundland 130 ± 5, South China–Borneo 34 ± 1, Arabia–Africa
30 ± 2 and Australia–Lord Howe Rise 90 ± 5.

Not found: GTS2020 chron ages (the book was not opened; all chrons are on the
source's scale); first-marine-incursion dates as distinct numbers on any margin;
salt ages except indirectly (South Atlantic base Aptian to 113 Ma; Central
Atlantic salt used by Labails but undated on the abstract page; Red Sea Miocene
evaporites undated on the review page); Central Atlantic rift onset (Carnian
~230 Ma) and Labrador Sea rift onset (223 Ma in a snippet) as opened numbers;
Marzoli's CAMP compilations (not searched). Wiley, ScienceDirect, ResearchGate,
Springer and AWI's repository refused every fetch, which is the sole reason the
Mueller & Jokat, Davis, Storey, Collier and Wobbe rows are partial.

## Q3 — Paleolatitude, paleoradius, and anything older than 120 Ma

### Paleoradius: the method and every published number

This half of Q3 is answered. The method exists in three forms, every published
estimate is listed with its source, and the one attempt to use the method *for*
a small Earth is included.

| Artefact | What it gives | Source | URL | Status |
|---|---|---|---|---|
| Egyed's paleomeridian method | R = d / α, with d the distance between two sites on one continent and α the difference of their paleolatitudes from inclination; the "two-site" form α = α₁ − α₂ | Egyed 1960, Geofisica Pura e Applicata 45, 115–116; formula as restated in Koziar 2018 pp. 149–161 | Koziar: http://www.wrocgeolab.pl/proofs.pdf | verified (Koziar); Egyed landing page only |
| van Hilten's paleolatitude on a changed radius | p = (Ra/R) · cot⁻¹(½ tan I): the colatitude a site would have on a globe of radius Ra if its inclination I is read with the present dipole law | van Hilten 1963, Nature 200, 1277–1279, pp. 1277–1278; formula as quoted by Koziar 2018 | https://www.nature.com/articles/2001277a0 | secondary (Nature page is metadata only) |
| Ward's minimum-scatter method and its three results | Devonian 1.12, Permian 0.94, Triassic 0.99 of the present radius, Europe + Siberia, "not considered to be significantly different from the present radius" | Ward 1963, Geophys. J. R. Astron. Soc. 8(2), 217–225, abstract | https://academic.oup.com/gji/article/8/2/217/695649 | verified |
| Carey's objection to Ward's method | The minimum-scatter test "inevitably occurs with the least change from this base radius (R), i.e. when Ra/R = 1" | Carey 1976, *The Expanding Earth*, p. 194, as quoted in Koziar 2018 | http://www.wrocgeolab.pl/proofs.pdf | secondary |
| McElhinny, Taylor & Stevenson | "limit possible expansion to less than 0.8%" over the past 400 Myr | Nature 271, 316–321 (1978), abstract | https://www.nature.com/articles/271316a0 | verified (abstract; table behind paywall) |
| Schmidt & Clark | Errors from orange-peel effect and crustal extension "are smaller by an order of magnitude than the response of palaeomagnetic data to simplified expansion models"; expansion since the Early Mesozoic judged unlikely | Geophys. J. R. Astron. Soc. 61(1), 95–100 (1980), abstract | https://academic.oup.com/gji/article/61/1/95/602793 | verified (abstract) |
| Schmidt & Embleton, the small-Earth use of Ward's method | "an Earth of about half the present radius accommodates the present continents"; expansion "between about 1,600 Myr and 1,000 Myr ago" to about the present size; fitted for 0.55 of the present radius | J. Geophys. 49(1), 20–25 (1981), abstract; Scalera 2013 Fig. 15 | https://journal.geophysicsjournal.com/JofG/article/view/34 | verified (abstract) |
| Stewart, hotspot-pair separations | "an increase in the Earth's radius of up to 12 per cent over the past 120 My"; the last 50 Myr "may be inconclusive" | Geophys. J. R. Astron. Soc. 46(3), 505–511 (1976), abstract | https://academic.oup.com/gji/article/46/3/505/607846 | verified (abstract) |
| Scalera's Fisher-grouping test at ten radii | Radii tried: 6370, 6000, 5600, 5200, 4800, 4400, 4000, 3600, 3200, 3000 km; Upper Triassic African poles "seem to be better grouped on a radius of 6370 km than on a radius of 3600–3200–3000 km"; Fisher average radius about 20° at 3200 km | Scalera 2018, GNGTS, "Late Triassic sequence of paleogeographic maps assisted by the GPMDB" | earth-prints.org item (text bitstream); see notes | verified |
| Scalera on the method's reach | "There is no paleomagnetic method capable of proving expansion"; Egyed's triangulation "impossible to apply due to the internal deformations of the continents"; supplementary tables SM-01…SM-09 list GPMDB poles per continent for the Upper Triassic and the Upper Jurassic of North America | Scalera 2020, Rend. Online Soc. Geol. It., "An Expanding Earth – a reply to two recent denial papers" + supplement | earth-prints.org item 570a5322 (text bitstream) | verified |
| Maxlow's colatitude on an expanding Earth | P = ((R₀ − Rp)e^{kt} + Rp) · tan⁻¹(2 / tan I) / R₀ (his Equation 4) | Maxlow 2021, *Beyond Plate Tectonics*, 2nd ed., Appendix p. 195 | https://www.billhowell.ca/ProjMini/Expanding%20Earth/Maxlow%202018%20Beyond%20Plate%20Tectonics%20(2nd%20Ed%202021).pdf | verified |
| Rickard's model APWPs on an expanding Earth | Title only: "Model palaeomagnetic polar-wandering paths on an expanding Earth", abstract, p. 71 of the Sydney volume | Carey (ed.) 1983, *The Expanding Earth: a Symposium*, contents p. ix | https://ndownloader.figshare.com/files/40912313 (front matter only) | partial |
| Egyed's own paleoradius table | R = 6250 km at 250 Ma, 6120 km at 500 Ma, 5870 km at 1000 Ma, 5370 km at 2000 Ma, for dR/dt = 0.5 mm/yr | Stewart 1970, as Table 1 in Kragh 2015, Hist. Geo Space Sci. 6, 45–55 | https://hgss.copernicus.org/articles/6/45/2015/hgss-6-45-2015.pdf | verified (secondary table) |

**Against the model.** Every inclination-based estimate reads the radius at
400–200 Ma as within a few percent of the present one, against this model's
3926 km at 200 Ma. The one small-Earth application (Schmidt & Embleton) puts
the half-radius Earth before 1000 Ma, not in the Mesozoic. Scalera's own
grouping test at ten radii is the closest thing to a recipe the model could
run on its own frames: take a continent's poles of one age, move them with the
frame, and ask at which radius they cluster tightest.

### Paleolatitude with A95

Answered. Two apparent polar wander paths with confidence circles are
downloaded as tables, the plate-circuit rotations to move them are in hand
with their sense checked, and the paleolatitude of one named point per
continent is computed at the four ages with its error bar.

| Artefact | What it gives | Source | URL | Status |
|---|---|---|---|---|
| **Vaes et al. 2023 global APWP, South Africa frame** (Table S3) | xlsx, one sheet; columns Window, Age, N, P95, Longitude, Latitude, Mean K, CSD, E; 5 Ma centres, 10 Ma window, 0–320 Ma; south poles in plate 701 coordinates. 60 Ma: lon 33.03, lat −73.16, P95 0.97, N 1298; 120 Ma: 81.52, −56.24, P95 1.45, N 302; **170 Ma: 78.60, −57.02, P95 6.09, N 45** (the weakest window); 200 Ma: 66.64, −64.60, P95 1.84, N 706. P95 = "the circle that includes 95% of the 2000 reference pseudo-poles". Companion 20 Ma-window path (V23) at 10 Ma steps, e.g. 200 Ma: 63.45, −65.35, 1.80 | Vaes, Li, Gaina & van Hinsbergen 2023, Earth-Sci. Rev. 245, 104547; Zenodo v2 (2024-04-12) | https://zenodo.org/records/10727855 ; https://zenodo.org/records/10727855/files/Table_S3.xlsx?download=1 ; preprint https://eartharxiv.org/repository/object/4924/download/9761/ | verified (downloaded, rows read) |
| **Torsvik et al. 2012 running-mean GAPWaP** (Table 10, South Africa frame) | age, N, lon, lat, A95 at 10 Ma steps 0–320. 60 Ma: N 44, 35.3, −72.9, A95 2.1; 120 Ma: N 28, 81.3, −53.6, 2.6; 170 Ma: N 18, 73.9, −55.9, 4.6; 200 Ma: N 39, 62.2, −69.0, 2.8; 320 Ma: 87.6, −4.1, 4.9. Redistributed as `T12_gapwap.xlsx` by Vaes 2023; the paper PDF is open at earthdynamics.org | Torsvik et al. 2012, Earth-Sci. Rev. 114, 325–368, Table 10 (PDF p. 39) | https://zenodo.org/records/10727855/files/T12_gapwap.xlsx?download=1 ; http://earthdynamics.org/papers-ED/2012/2012-Torsvik-etal-ESR.pdf | verified |
| **Torsvik 2012 Table 11: the same path in six plate frames** (no rotation needed) | Plat/Plon (south poles) for India, Amazonia, Australia, East Antarctica, North America, Europe; A95 and N as Table 10. 200 Ma (A95 2.8): India −24.4/130.0; Amazonia −74.4/238.7; Australia −50.1/195.1; E Antarctica −53.3/239.0; N America −64.9/259.9; Europe −57.9/279.3. 170 Ma (A95 4.6): India −10.7/125.8; Amazonia −86.8/297.0; Australia −48.6/173.3; E Antarctica −62.8/218.9; N America −70.1/314.8; Europe −67.3/316.4. 120 Ma (A95 2.6): India −8.6/116.4; Amazonia −84.8/68.7; Australia −50.2/146.4; E Antarctica −75.9/183.6; N America −73.7/15.5; Europe −79.0/10.1. 60 Ma (A95 2.1): India −48.5/100.8; Amazonia −80.2/340.0; Australia −65.5/110.3; E Antarctica −83.6/17.8; N America −73.6/7.5; Europe −78.2/352.6. Table 12 gives the true-polar-wander correction (pole lat 0, lon 11: angle 0 at 100 Ma, −8 at 110–140, 0 at 150, 22.5 at 200, 0 at 250) | Torsvik 2012 Table 11, p. 363 | as above (text extracted, lines ~2540–2575) | verified |
| **Plate-circuit rotations** (`Euler_poles_plate_circuit.csv`) | 6,259 rows, `plate_ID, age, EP_lat, EP_lon, EP_ang`, 1 Ma steps; plates 101, 102, 201, 202, 290, 291, 301, 501, 503, 701, 702, 707, 709, 714, 715, 801, 802 to 330 Ma, 803 to 140, 601/602 to 130, 304/901 to 83; rotation moves a plate-fixed pole into South Africa coordinates (Cox & Hart 1986 box 7-3 sense, counterclockwise); use the negative angle to bring the master path into a plate's own frame. Examples (lat, lon, angle): India 501 at 200 Ma (−30.88, −138.45, 60.89), 120 Ma (−25.07, −154.40, 54.39); Australia 801 at 200 Ma (−21.96, −65.14, 55.14); E Antarctica 802 at 200 Ma (−8.61, −33.76, 57.42); S America 201 fixed to Africa before 133.6 Ma (50.0, −32.5, 55.08); N America 101 at 200 Ma (63.20, −14.01, 79.51). Sense checked by reproducing Torsvik Table 11 to 1–5° | Vaes 2023 supplementary code; circuit from Torsvik 2012 / Torsvik & Cocks 2017 | https://zenodo.org/records/10727855/files/Euler_poles_plate_circuit.csv?download=1 ; https://zenodo.org/records/10727855/files/APWP_functions.py?download=1 | verified (code read, check run) |
| **Paleolatitude of a named point, computed** (Torsvik 2012 ± A95 / Vaes 2023 ± P95) | Johannesburg (−26.2, 28.0): 60 Ma −43.1 ± 2.1 / −43.0 ± 1.0; 120 Ma −42.3 ± 2.6 / −41.6 ± 1.5; 170 Ma −45.7 ± 4.6 / −42.9 ± 6.1; 200 Ma −42.7 ± 2.8 / −44.4 ± 1.8. **Nagpur (21.1, 79.1), India**: 60 Ma −17.7 ± 2.1 / −14.9 ± 1.0; 120 Ma −42.8 ± 2.6 / −43.0 ± 1.5; 170 Ma −34.2 ± 4.6 / −32.7 ± 6.1; 200 Ma −22.8 ± 2.8 / −26.7 ± 1.8. Schirmacher Oasis (−70.8, 11.7), E Antarctica: 60 Ma −77.1 ± 2.1 / −77.7 ± 1.0; 120 Ma −56.8 ± 2.6 / −56.5 ± 1.5; 170 Ma −44.9 ± 4.6 / −42.6 ± 6.1; 200 Ma −38.6 ± 2.8 / −40.8 ± 1.8. Alice Springs (−23.7, 133.9), Australia: 60 Ma −45.5 ± 2.1 / −44.2 ± 1.0; 120 Ma −61.8 ± 2.6 / −59.7 ± 1.5; 170 Ma −50.3 ± 4.6 / −53.3 ± 6.1; 200 Ma −36.3 ± 2.8 / −43.5 ± 1.8. Brasília (−15.8, −47.9), S America: 60 Ma −24.4 ± 2.1 / −24.9 ± 1.0; 120 Ma −13.4 ± 2.6 / −13.0 ± 1.5; 170 Ma −18.9 ± 4.6 / −16.0 ± 6.1; 200 Ma −19.6 ± 2.8 / −19.8 ± 1.8. Latitude = great-circle distance to the south pole − 90°; error = ± the pole's 95% radius (conservative bound). The two compilations differ by up to 7° (Australia, 200 Ma) and 4° (India, 200 Ma), a fair systematic error to add | computed from the two tables and the circuit above | scratchpad CSVs | verified inputs; arithmetic is this pass's own |
| Formula and error propagation | sin λ = sin λs sin λp + cos λs cos λp cos(φp − φs); tan I = 2 tan λ; "The dipole equation causes the error in paleolatitude to be asymmetrical", propagated through eqs 2a–2b (S1 Text, not opened); the default path in the calculator is Torsvik 2012's | van Hinsbergen et al. 2015, PLOS ONE 10(6), e0126946; Butler 1992 ch. 7 (page not verified) | https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0126946 ; http://paleolatitude.org | verified (page); S1 Text not opened |
| **GPMDB, the whole database by API** | `https://gpmdb.net/api/search?limit=20000` returns all 10,421 records as JSON (10.3 MB), 55 columns including PLAT, PLONG (north poles), DP, DM, A95 (`ED95`), Q (`QSUM`), INC, SLAT, SLONG, LOMAGAGE, HIMAGAGE, CONTINENT, TERRANE; no server-side filter works, so filter locally; India is filed under continent "Asia" or "Indian Ocean" with terrane "India"; continent labels include the misspellings "Asis" and "Nort America". Subset 110–210 Ma, Q ≥ 4, A95 ≤ 10 on four Gondwana continents: 122 poles; e.g. Drakensberg Karoo basalts 179–185 Ma, pole 65.3/267.9, A95 4.5, Q 6 (Moulin 2017); CAMP Morocco 199–201 Ma, pole 60.0/241.6, A95 3.0, Q 5 (Font 2011); Otway Group 110–115 Ma, pole 48.9/328.7, A95 1.8 (Idnurm 1985); Sierra de Los Cóndores 115–133 Ma, pole 86.0/255.9, A95 2.8 (Geuna & Vizán 1998). Direct site reading: λ = atan(tan I / 2), error dp = 2·a95 / (1 + 3 cos² p) | Pisarevsky, Li, Tetley, Liu & Beardmore 2022, Earth-Sci. Rev. 235, 104258 | https://gpmdb.net/api/search?limit=20000 | verified (pulled; subset written to `gpmdb_gondwana_50-220Ma.csv`) |
| **The Indian gap** | With 110 ≤ age ≤ 210 Ma and Q ≥ 4 the only Indian poles are Tirupati Sandstones 112–125 Ma (pole 29.7/286.9, A95 4.7) and the Rajmahal Traps 115–117 Ma (pole 7.5/296.5, A95 2.5, plus three related entries A95 3.0–7.0); **no Q ≥ 4 Indian pole between 125 and 210 Ma**, so India's 170 and 200 Ma latitudes above rest on the plate circuit alone. The Rajmahal pole gives Nagpur −43.5 ± 2.5° at 116 Ma, matching the circuit's −42.8/−43.0 at 120 Ma; the Tirupati pole gives −32.6 ± 4.7 | GPMDB pull | as above | verified |
| MagIC | FIESTA REST API at `https://api.earthref.org/v1/MagIC/search/{table}` with `n_max_rows`, `from`, `query` (Lucene syntax); 7,017 public contributions; pole fields in `locations` (pole_lat, pole_lon, pole_alpha95, pole_dp, pole_dm) and `sites` (vgp_lat, vgp_lon, dir_dec, dir_inc, dir_alpha95); download endpoint returns MagIC text zips | EarthRef.org | https://api.earthref.org/v1/openapi.yaml | verified (endpoints); pole-filter query syntax not cracked |
| Torsvik 2012 pole compilation and the Torsvik & Cocks data | The 626 poles of Tables 3–9 are redistributed with plate IDs and rotated coordinates in Vaes's `Table_S2.xlsx` (column DB = "T12"); Torsvik & Cocks 2017 ship CEED6.zip (GPlates polygons plus `Torsvik_Cocks_HybridRotationFile.rot`, 0–540 Ma) | as named | http://www.earthdynamics.org/earthhistory/Data_Software.html | verified (page); Elsevier supplement list 403 |

**Against the model.** For each of the five continents the model can now be
asked one radius-independent question at each of the four ages: does the
frame put Nagpur at 23–27° S at 200 Ma, at 33–34° S at 170 Ma and at 43° S at
120 Ma, within about 3°? The same for Alice Springs (36–44° S at 200 Ma,
50–53° S at 170, 60–62° S at 120), Schirmacher (39–41° S at 200, 43–45° at 170,
57° at 120), Johannesburg (43–44° S throughout) and Brasília (20° S at 200).
The 170 Ma window is the weak one in both compilations (A95 4.6, P95 6.1). For
India before 125 Ma there is no rock-based pole at all, so the 200 and 170 Ma
Indian numbers are the plate circuit talking, not Indian rocks; the one Indian
anchor is Rajmahal at 116 Ma.

### Non-seafloor constraints between 200 and 120 Ma

| Join | African-side belt (approx. box) | Conjugate belt (approx. box) | Age | Source | Status |
|---|---|---|---|---|---|
| Africa – East Antarctica | Namaqua–Natal belt, lon 17…31E, lat 34…28S | Maud belt, W Dronning Maud Land, lon 10W…15E, lat 75…70S | 1.1–1.0 Ga | Fitzsimons 2000, Geology 28(10), 879–882 | correlation partial (snippet); boxes are this pass's approximations |
| Africa – East Antarctica | Mozambique belt / East African orogen, lon 33…41E, lat 27S…5N | central Dronning Maud Land – Sør Rondane – Lützow-Holm, lon 0…45E, lat 72…68S; 20 km wide Heimefront transpression zone; Falkland, Ellsworth–Haag and Filchner microplates between southern Africa and East Antarctica | 650–500 Ma; late granitoids 530–490 Ma | Jacobs & Thomas 2004, Geology 32(8), 721–724 | verified (abstract via OpenAlex); boxes approximate |
| India – East Antarctica | Eastern Ghats belt, lon 78…87E, lat 14…21N | Rayner Complex (Kemp Land – Enderby Land – Prydz Bay), lon 45…80E, lat 70…66S | ~1.0–0.9 Ga, reworked 550–500 Ma | Fitzsimons 2000 | partial |
| Australia – East Antarctica | Albany–Fraser orogen, lon 115…127E, lat 35…30S | Wilkes province (Windmill Islands – Bunger Hills), lon 100…115E, lat 67…66S | 1.3–1.1 Ga | Fitzsimons 2000 | partial |
| Africa – South America | Kaoko and Gariep belts, lon 12…17E, lat 22…28S; Damara inland lon 14…20E, lat 19…23S | Dom Feliciano belt, lon 56…48W, lat 34…26S; Ribeira belt, lon 49…40W, lat 26…20S | Kaoko 580–550, Gariep 545–530, Damara 530–500 Ma, thrusting onto the Kalahari 495–480 | Gray et al. 2008, Geol. Soc. Spec. Publ. 294, 257–278 (PDF read) | verified (abstract); boxes approximate |
| Africa – South America | West Congo belt, lon 11…15E, lat 8…2S | Araçuaí belt, lon 43…39W, lat 21…15S | 630–500 Ma | Gray et al. 2008 | partial |
| Laurentia – Baltica | The useful constraint is Caledonide continuity (Scandinavia – East Greenland – Scotland – Newfoundland), not Grenville–Sveconorwegian, which is a ~1.0 Ga Rodinia join now disputed (Slagstad et al. 2019, Terra Nova) | — | 420 Ma to ~55 Ma | — | not pursued |
| Dated dyke swarms crossing joins | CAMP 201.564 ± 0.015 Ma (end-Triassic onset), NE Brazil dyke 201.579 ± 0.057, North Mountain Basalt 201.464 ± 0.017: the NE Brazil – West Africa – eastern North America join pinned at 201.5–201.6 Ma with ~0.05 Ma precision; Karoo 183.0 ± 0.5 to 182.3 ± 0.6 and Ferrar "<0.4 myr at c. 182.7 Ma" (Elliot & Fleming, PDF read; Ferrar "forms a linear outcrop belt for 3250 km across Antarctica, which then diverges into SE Australia and New Zealand"): Africa – Antarctica – Tasmania at 182.7 ± 0.5 Ma; Paraná–Etendeka onset 135.0 ± 0.6 (Gomes & Vasconcelos) and 134.3 ± 0.8 (Janasi) | see Q2 LIP table | 201.5, 182.7 and 134.5 Ma | Blackburn 2013 (PDF read); Oliveira 2023 (read); Elliot & Fleming https://par.nsf.gov/servlets/purl/10054585 (read); Svensen, Burgess, Janasi, Gomes (snippets) | verified / partial as marked |

Not found: digitised lon/lat polygons of any of these belts (candidates: the
CGMW Geological Map of Gondwana, Merdith 2021 GPlates static polygons with
terrane names, SCAR GeoMAP for Antarctica); Torsvik 2012's Elsevier supplement
list (403); the explicit form of van Hinsbergen's error equations (S1 Text);
a working MagIC pole query; Butler 1992 chapter 7 (Arizona PDF 404); the
Fitzsimons 2000 and Pisarevsky 2022 abstracts (no host served them).

## Q4 — The hypothesis's own globe, as numbers

The question asked for a published radius-versus-time curve as numbers, a set
of joins at named dates, and figures worth comparing a frame against. All three
exist, and the first turns out to have been measured the same way this model
measures it.

### The curves

| Artefact | What it gives | Source | URL | Status |
|---|---|---|---|---|
| **Maxlow's measured radii from digitised sea-floor areas** (his Table A1.1) | Chron / age Ma / R km: 0 / 0 / 6370.8; C2 / 1.9 / 6337.2; C3a / 5.9 / 6265.4; C6b / 23.0 / 5931.5; C15 / 37.7 / 5645.4; C25 / 59.2 / 5343.8; C29 / 66.2 / 5265.3; C34 / 84.0 / 4889.5; M0 / 118.7 / 4403.5; M17 / 143.8 / 4225.0; M38 / 205 / 4038.3. Areas from Larson et al. 1985, digitised in CAD, "arbitrarily assigned errors are ±5%", S₀ = 5.1 × 10⁸ km² | Maxlow 2001, PhD thesis, Curtin University, Appendix Table A1.1, thesis p. 248 (PDF p. 259) | https://ndownloader.figshare.com/files/62348560 (16.4 MB, 451 pp.; record https://api.figshare.com/v2/articles/31463311) | verified |
| Maxlow's fitted exponential | Ra = (R₀ − Rp)·e^{kt} + Rp with R₀ = 6370.8 km, Rp = 1700 km, k = 4.5366 × 10⁻⁹ /yr; gives 6247.4 (5.9 Ma), 5908.0 (23), 5636.5 (37.7), 5270.7 (59.2), 5159.1 (66.2), 4890.7 (84), 4426.0 (118.7), 4132.6 (143.8), 3960.2 (160), 3542.9 (205), 3237.0 (245), 2976.2 (286), 2612.2 (360) km; present rate 21.2 mm/yr | Maxlow 2001 thesis Eq. 2.6 (p. 19) and Table A1.2 (p. 250); repeated in *Beyond Plate Tectonics* pp. 109 and 195 and on the archived "Ancient Earth Radius" page | thesis as above; http://web.archive.org/web/20221207122029id_/https://www.jamesmaxlow.com/ancient-earth-radius/ | verified |
| Maxlow's 24 model radii | Model 13 (M34, Early Jurassic, 205 Ma) 3543 km; 14 (M29, 160 Ma) 3960; 15 (M17, 144 Ma) 4130; 16 (M0, 118 Ma) 4435; 17 (C34, 84 Ma) 4891; 18 (C29, 66 Ma) 5162; 19 (C25, 59 Ma) 5274; 20 (C15, 37 Ma) 5649; 21 (C6B, 23 Ma) 5908; 22 (C3A, 6 Ma) 6245; and pre-Jurassic 245 Ma 3237, 260 Ma 3136, 320 Ma 2794, 360 Ma 2612, down to 1703 km at 1.6 Ga. These are Eq. 2.6 values, not measurements | Maxlow 2001 thesis Table 2.1, p. 24 (PDF p. 36) | as above | verified |
| Maxlow's shortfall note | "Shortfall in measured palaeoradius between M17 and M38 represents accumulation of marginal basin sediments along continental slopes and shelves" (his reason for the measured curve sitting above the exponential at the old end) | thesis p. 16, Fig. 2.4 caption; *Beyond Plate Tectonics* p. 65 | as above | verified |
| Maxlow's data sources | Larson et al. 1985 and CGMW & UNESCO 1990 ocean-floor age maps for the 1995 work; the NOAA/NGDC 2008 age map in the later books. Not the EarthByte 2019 grid | thesis p. 14; *Beyond Plate Tectonics* pp. 50–52, 61 | as above | verified |
| Owen's diameter series | Diameter 97% at 29 Ma (anomaly 9), 94% at 53 Ma (anomaly 24), 90% at 90 Ma (quiet zone), 87% at 129 Ma (M7), 84% at 158 Ma (M23), 80% at 180–200 Ma (Pangaea); extended by hand to 75% (260 Ma), 70% (325 Ma), 65% (400 Ma), 60% (485 Ma); Palaeozoic terrains "indicate a diameter of 56% for this complete sialic shell" | Owen 2018, DVD index to *Atlas of Continental Displacement* (1983), pp. 1–6, 71–80; Owen 2012 in Scalera, Boschi & Cwojdziński (eds), pp. 77–89 | https://www.dinox.org/publications/Owen2018-Expanding%20Earth%20Diagrams.pdf (16.6 MB, 88 pp.) | verified |
| Owen 1976 | Pangaea at 80% of the present diameter, late Triassic–early Jurassic; ocean-floor data "demonstrate progressive global expansion commensurate with increase of 20%" | Phil. Trans. R. Soc. A 281(1303), 223–291, DOI 10.1098/rsta.1976.0026, abstract via OpenAlex; Fig. on p. 230 is a fast-expansion R(t) curve (Kragh 2015 Fig. 4) | https://api.openalex.org/works/https://doi.org/10.1098/rsta.1976.0026 | partial (Royal Society page 403) |
| Owen's volume and area | "200 million years ago, Earth's volume was 51% of present value; surface area 64% of present value" | Owen, *New Scientist* 22 Nov 1984, p. 27, as digested by Science Frontiers | https://www.science-frontiers.com/sf037/sf037p11.htm | secondary |
| Scalera's radii at named epochs | Triassic 3300 km; Jurassic 3800; Upper Cretaceous 4800; Paleocene 5300; modern 6370; a 4800 km globe used for India in Fig. 4; average rate 15 mm/yr | Scalera 2001, Annali di Geofisica 44(1), 13–32, p. 15 and Fig. 5 labels | https://www.annalsofgeophysics.eu/index.php/annals/article/download/3616/3669 (scan, OCR'd) | verified |
| Scalera's rate statements | dR/dt = (6370 − 3300) km / 220 Myr ≈ 14.0 mm/yr; "1–2 cm/y averaged by 250 Ma, and only a few millimeters today"; future +250 Myr at 9000 km | Scalera 2003, "The expanding Earth: a sound idea for the new millennium", in *Why Expanding Earth?*, INGV, pp. 181–232 | https://www.earth-prints.org/bitstreams/ce8dd0b8-d3aa-41c8-83ca-88a11f748691/download | verified |
| The Late Triassic consensus number | "3300 km radius Late Triassic dwarf Earth from Maxlow (2002, 2011, 2012) and Scalera (2003b, 2005b, 2006, 2007a)"; "The resulting Early Jurassic Earth diameter was 6600 km (Vogel, 1994; Scalera …; Maxlow …)"; McCarthy's Triassic Earth scales to 67% | Sudiro 2014, Hist. Geo Space Sci. 5, 135–148, p. 137, Figs 1–3 | https://hgss.copernicus.org/articles/5/135/2014/hgss-5-135-2014.pdf | verified |
| Hilgenberg's diameter ratio | Shelf area 35% of the surface gives a diameter ratio 1 : √0.35 ≈ 0.59; he used 0.62–0.65 "to have some play"; Tafel 1 is cut for a ball of 8.7 cm against a 14.0 cm globe (0.62); "rund 0,6" gives a volume ratio 0.216 and, with a 10⁹-yr Palaeozoic, a mass-growth constant | Hilgenberg 1933, *Vom wachsenden Erdball*, pp. 3–4 and Tafel 1 (between pp. 26–27), and the growth computation (scan lines 1754–1800) | https://archive.org/details/Hilgenberg1933 (djvu text at https://archive.org/download/Hilgenberg1933/Hilgenberg1933_djvu.txt) | verified |
| Hilgenberg 1965 | Five reconstructions Permian to Eocene in *Geologische Rundschau*; Permian radius 4590 km; rate 4 mm/yr; "30 projections of the globe at different paleoradii" | Scalera & Braun 2003, in *Why Expanding Earth?*, pp. 25–41, p. 36 and Fig. 6 | https://www.earth-prints.org/bitstreams/aaab8606-3e1f-4c81-86c1-0525e56424dc/download | verified (secondary) |
| Vogel's Pangaea | "'Pangaea' covered completely the surface of an earth with approximately 55 % – 60 % of the present diameter"; globes of 85 cm and 54 cm | Vogel 1994, in Barone & Selleri (eds) *Frontiers of Fundamental Physics*, Plenum, pp. 281–286, abstract | https://link.springer.com/chapter/10.1007/978-1-4615-2560-8_31 | verified (abstract) |
| Vogel's globe set | Three globes at 45, 65 and 75% of the modern radius (Cwojdziński); Vogel 1983 globe at 60% (Koziar Fig. 9); Hilgenberg's shelf globe "two-thirds of the Earth's actual diameter" (Vogel) | Cwojdziński 2020 in Hurrell (ed.) *The Hidden History of Earth Expansion*, p. 233; Koziar 1993/2013 *The Expanding Pacific* p. 16; Vogel 2012 in Scalera et al. (eds), pp. 161–170 | https://www.dinox.org/publications/Cwojdzinski2020-My%20lifetime%20adventure%20with%20an%20expanding%20Earth.pdf ; https://www.wrocgeolab.pl/Pacific.pdf ; Erice extended abstracts (earth-prints) | verified |
| Carey's numbers | 1958: "diameter … less than half its present diameter and its surface area less than a quarter" (Palaeozoic); Cox & Doell 1961: "Carey proposes an increase in the Earth's area of 45 per cent since the Palaeozoic era"; Holmes: Carey's rate over the last 200 Myr about 8 mm/yr | Carey 1958 p. 346 as quoted in Kragh 2015; Cox & Doell, Nature 189, 45–47 (1961) | https://hgss.copernicus.org/articles/6/45/2015/hgss-6-45-2015.pdf ; https://www.nature.com/articles/189045a0 | secondary |
| Carey's Jurassic radius | "about 60% … during the Jurassic" | Mundy 1988, *Origins* 15(2), reviewing Carey | https://www.grisda.org/origins-15053 | secondary, unconfirmed in Carey's text |
| Creer | Initial radius 0.55 R₀ (R₀ = 6378 km); 0.94–0.96 R₀ at the start of the Palaeozoic; 0.96–0.97 R₀ at the start of the Mesozoic; average 0.75 mm/yr; perspex shells remoulded from a 50 cm globe to 37 cm and 27 cm | Creer 1965, Nature 205, 539–544, as read by Carey 1975 (Earth-Sci. Rev. 11, p. 111) and Kragh 2015 | https://sites.ualberta.ca/~unsworth/UA-classes/699/2011/pdf/Carey_ESR_1975.pdf | secondary (Nature paywalled) |
| Dearnley | 0.65 ± 0.25 mm/yr back to 4500 Ma; R = 4400 km at 2750 Ma and 6000 km at 650 Ma | Dearnley 1965 Nature 206, 1284–1290 and 1966, as read by Carey 1975 p. 112 and Kragh 2015 | as above | secondary |
| Egyed | 0.4–0.8 mm/yr (Cox & Doell); 0.4–0.6 mm/yr (Kragh); 0.65 ± 0.15 mm/yr (Egyed 1969) | Kragh 2015 §4 | https://hgss.copernicus.org/articles/6/45/2015/hgss-6-45-2015.pdf | verified (secondary) |
| Stewart's fast model | R(T) = R₀[0.6 + 0.4·exp(−kT)], k ≈ 5 × 10⁻⁹/yr, primeval radius 0.6 R₀ = 3820 km | Kragh 2015 quoting Stewart | as above | secondary |
| Koziar and Blinov rates | Koziar 1980: 25.9 mm/yr (26 mm/yr, "Hubble coefficient" h = 4 × 10⁻⁹/yr); Blinov 1983: 19.9 mm/yr; Koziar's VLBI lower bound: 8.28 mm/yr if the northern megaplate were inextensible | Maxlow 2016 (dinox.org) p. 2; Koziar 2012 in Scalera et al. (eds) "Expanding Earth and space geodesy", pp. 48–50 of the extended abstracts | https://www.dinox.org/publications/Maxlow2016-ModellingModernGlobalGeodata.pdf ; Erice extended abstracts | verified |
| Larin | Surface area increased threefold, radius 1.73×, volume about fivefold; young oceans' area about equals the Pacific's; no dated table | Larin 1993, *Hydridic Earth*, ch. VII and Fig. 35 | https://archive.org/metadata/Hydridic_Earth_Larin_1993 (djvu text) | verified |
| Bretterbauer | Hubble-rate reading gives ṘE = +0.5 mm/yr; Dirac-type reading 0.1 to 1.0 mm/yr | Bretterbauer 1984, Österr. Z. Vermessungswesen u. Photogrammetrie 72(3), Eqs 2.4 and 2.9 | scratchpad PDF (source URL not recorded) | verified, URL missing |

**Against the model.** The number that matters is Maxlow's *measured* M38
point, because it was made the way this model makes its curve, from the area
of dated sea floor:

| age Ma | Maxlow measured (Table A1.1) | Maxlow exponential (Eq. 2.6) | this model, nearest-age | this model, permanent |
|---|---|---|---|---|
| 5.9 | 6265 | 6247 | 6184 | 6247 |
| 23 | 5931 | 5908 | 5824 | 5900 |
| 59 | 5344 | 5271 | 5168 | 5273 |
| 84 | 4889 | 4891 | 4783 | 4907 |
| 119 | 4403 | 4426 | 4328 | 4492 |
| 144 | 4225 | 4133 | 4097 | 4271 |
| 160 | — | 3960 | 3991 | 4175 |
| 205 | 4038 | 3543 | 3926 (at 200) | 4115 (at 200) |

Maxlow's measured curve sits 75 to 200 km above this model's nearest-age curve
at every chron and lands inside the model's own 3926–4115 km band at the old
end. His fitted exponential is a different object: it is forced through 1700 km
in the Archaean, crosses this model's curve near 160 Ma and ends 383 km below
it. Owen's 80%-diameter Earth is 5097 km at 200 Ma, 1171 km above this model,
and stays 485 to 1349 km above it at every anchor, because it is a fit of
continental outlines and not an area integral. Scalera's 3300 km Triassic is
about 626 km below the model's 200 Ma value; his 4800 km Upper Cretaceous sits
between the model's 4706 (90 Ma) and 4840 (80 Ma); his 5300 km Paleocene is 150
to 240 km above the model's 5062–5152 at 66–60 Ma. Hilgenberg's closed globe,
3950–4141 km, coincides with the model's 200 Ma band but is undated in his text
beyond "before the Palaeozoic". Mean rates: this model 12.2 mm/yr over 200 Myr;
Maxlow 21–22 mm/yr today on the exponential; Scalera 14–15 mm/yr averaged;
Owen about 6.4 mm/yr; Egyed 0.5 mm/yr.

### Named joins at named dates

| Artefact | What it gives | Source | Status |
|---|---|---|---|
| Maxlow's docking list | South-west Australia to Wilkes Land; Tasmania to south-east Australia and Victoria Land; South Africa to New Schwabenland (Weddell side); west Africa to South America; India to Queen Maud Land of East Antarctica (not Enderby Land); Siberia to Alaska; Canadian Northwest Territories to Greenland; Greenland to Norway; Spain to Morocco; Arabia to Africa; Madagascar to Mozambique | thesis pp. 30–32 and Fig. 2.10 (24 models, 10,000 km bar) | verified |
| Maxlow's opening dates | Somali Basin and an India–Antarctica basin from the Early Jurassic; South Atlantic separation from the Late Jurassic (~155 Ma) along the Agulhas and Falkland fracture zones, merging with the North Atlantic ridge in the Early Cretaceous along the Nigeria–Brazil rift (the Fig. 2.24 caption says Late Cretaceous); Madagascar and Sri Lanka rift from India Early to Mid Cretaceous; Australia–East Antarctica rifting from the Paleocene; Bering Strait opens in the Pliocene; Greenland–Canada rifting and Norway | thesis pp. 39–62; *Beyond Plate Tectonics* pp. 83–89 | verified |
| Owen's dated map sets | Six sets at 29, 53, 90, 129, 158 and 180–200 Ma, each with Boreal, North Atlantic, South Atlantic, Indian Ocean, Pacific and Southern Hemisphere maps; the 200 Ma set is Atlas Maps 13, 23 (pole 22N 30W), 33 (22S 50W), 43 (22S 40E), 53 (0, 170W), 63, all azimuthal equidistant; "a Middle Jurassic commencement of ocean-floor spreading in the North Atlantic" | Owen 2018 DVD index pp. 2–6, 65–67 | verified (index; the maps themselves not inspected) |

### Figures worth comparing a frame against

| Figure | What is on it | Where | Status |
|---|---|---|---|
| Maxlow, eleven post-Triassic globes | Four rows (Indian Ocean, South Pacific, Caribbean, Atlantic) at chrons M38, M29, M17, M0, C34, C29, C25, C15, C6B, C3A, 0 | thesis Fig. 1.1, p. 7 (PDF p. 19) | verified (image inspected) |
| Maxlow, Atlantic sequence | 14 globes, Permian to Future, 10,000 km bar; North Atlantic opens first as a meridional Permian basin | thesis Fig. 2.24, p. 53 (PDF p. 65) | verified (image inspected) |
| Maxlow, North Pacific sequence | 14 globes; model 13 (Early Jurassic) shows a small North Pacific basin between Australia, Canada and China; 10,000 km bar | thesis Fig. 2.28, p. 64 (PDF p. 76) | verified (image inspected) |
| Maxlow, Indian Ocean sequence; South Pacific | Fig. 2.27, p. 60; Fig. 2.29, p. 65 | thesis | verified (captions) |
| Maxlow, India | Fig. 9.5 "Continental crustal development of India", models 13–15 centred on the South Pole | *Beyond Plate Tectonics* p. 155 | verified (caption) |
| Hilgenberg's four globes | Cover photograph; Abb. 2 (South America, Africa, Antarctica), Abb. 3 (Africa, Arabia, India), Abb. 7–8 (the two North America halves and the Alaska shear), Tafel 1 (cut-out of the shelf globe), Tafel 2 (shear diagram) | 1933 booklet; cover image on Wikimedia Commons; globes rebuilt at INGV 2001, on show at Rocca di Papa | verified |
| Scalera's Triassic Pangaea at 3300 km | Fig. 2b (India against Antarctica), Fig. 4 (India on a 4800 km globe), Fig. 5 (radius ladder 3300–6370) | Annals 44(1) 2001 | verified (OCR) |
| Scalera's Pacific side of Pangaea | Two reconstructions on a 3500 km globe, Fig. 1a,b | Annals of Geophysics 50(6) 2007, 789–798 | verified |
| Owen's 200 Ma set | Atlas Maps 13, 23, 33, 43, 53, 63 | *Atlas of Continental Displacement* 1983; index PDF above | partial (not inspected) |
| Vogel's globe-in-globe | Photograph; inner globe with continents, outer with oceans, built with Maxlow's segments | Erice 2012 Fig. 3; wachsende-erde.de photographs | verified (photographs seen) |

## Q5 — The three motions the model does not have

### (a) India, 200 to 80 Ma

| Author | Claimed position at ~200 Ma | Claimed motion | Source | Status |
|---|---|---|---|---|
| Maxlow | West India against Queen Maud Land, East Antarctica; Madagascar against Mozambique; India "remained firmly attached to the Asian continent throughout the Mesozoic and Cenozoic" | The Indian Ocean opens by two ruptures from the Early Jurassic, in what are now the Somali Basin and the Bay of Bengal; Madagascar and Sri Lanka leave India in the Early to Mid Cretaceous; an anticlockwise rotation of India relative to Asia gives 1400 km of Himalayan shortening; from 65 Ma a central Indian Ocean triple junction | thesis pp. 32, 60–62, Fig. 2.27; *Beyond Plate Tectonics* pp. 87–89, Fig. 5.5, Fig. 9.5 | verified |
| Scalera 2001 | Two positions tried; preferred: West India against Antarctica (Mac Robertson Land facing the Cooperation Sea), Ceylon touching the Naturaliste Plateau, the Himalayan margin against the Siberian Traps; on a 3300 km globe | "strong clockwise rotation (more than 150°) from Jurassic to Cretaceous", path "nearly 4000 km (less than the 8000 km of plate tectonics)", in the window 110–87 Ma | Annals 44(1), pp. 15–17, Figs 2b, 4, 5 | verified |
| Scalera 2003 | "Indian western margin connected to Antarctica … Indian eastern margin connected, or divided only by narrow and shallow sea, to Indochina, which in turn is now connected to West Australia"; clockwise rotation 110–85 Ma | — | *Why Expanding Earth?* pp. 181–232 | verified |
| Scalera 2018 | Revision: "the Indian east coast facing Asia", i.e. the 2001 position withdrawn | — | GNGTS 2018 | verified |
| Vogel 1983 | Antarctica in contact with India on a 60%-radius globe | — | Koziar 1993/2013 Fig. 9 | verified (secondary figure) |
| Hilgenberg 1933 | Africa, Arabia and India on the shelf globe (Abb. 3); a 3000 km northward displacement of India rejected, Tibet explained by 1:2 shortening | — | pp. 4 and 47–48 | verified |
| Owen 1983 | Indian Ocean map at 200 Ma is Atlas Map 43 (pole 22S 40E) | — | index PDF | partial (not read) |

Not found: any Expanding Earth author who closes India onto *Africa* south of
Somalia. Every reconstruction read puts India's west margin against East
Antarctica with Madagascar between it and Mozambique, and the Indian Ocean
opening from two ruptures rather than by India travelling.

### (b) The Central Atlantic before or after the South Atlantic

| Author | Order | Dates | Source | Status |
|---|---|---|---|---|
| Maxlow | Central first | Rift basin between North America and Africa from the Early Permian; sea-floor crust preserved from the Early Jurassic "between North Africa and North America"; South Atlantic from ~155 Ma along Agulhas–Falkland; the two ridges merge in the Early Cretaceous (text) or Late Cretaceous (Fig. 2.24 caption) along the Nigeria–Brazil rift | thesis pp. 53–55; *Beyond Plate Tectonics* pp. 83–85 | verified |
| Owen | Central first | "a Middle Jurassic commencement of ocean-floor spreading in the North Atlantic … at 80% of modern diameter" | Owen 2018 index p. 1 | verified |
| Hilgenberg | Both closed on one globe; Africa laid first, South America second when building | — | 1933 p. 4 | verified |

Not found: a published Expanding Earth sequence that closes North America onto
north-west Africa *after* the South Atlantic. Every sequence read opens the
Central Atlantic first.

### (c) The Pacific hemisphere at 200 Ma

| Author | Pacific at ~200 Ma | Australia against what | Source | Status |
|---|---|---|---|---|
| Maxlow | Two basins from the Early Permian: a North Pacific basin "between northwest Australia, Canada and China" and a South Pacific basin "between east Australia, South America, New Zealand and Antarctica"; merged Late Triassic (thesis) or mid–late Jurassic (book); a Queensland–California land link breached in the Late Triassic (Fig. 16.5); asymmetric spreading axis along the North American west coast | Australia against North America and China until the Jurassic; Queensland against California until the Late Triassic | thesis pp. 39, 63–64, Fig. 2.28 (10,000 km bar); *Beyond Plate Tectonics* pp. 90, 145–146, 282–283 | verified |
| Barnett 1962 | Pacific closed on a 3-inch globe from 4½-inch templates | West Antarctica against the southern Andes; eastern Australia against Central America; northern Australia against North America | Carey 1975, Earth-Sci. Rev. 11, p. 110 | secondary |
| Brösske 1962 | — | Eastern Australia into the Peru re-entrant; New Guinea front against California | Carey 1975 p. 110 | secondary |
| Creer 1965 | "a U-shaped crack between Australia and America and between Australia and Asia … widened to form the Pacific Basin" | — | Carey 1975 p. 111 | secondary |
| Scalera 2007 | Pacific side of Pangaea on a 3500 km globe | "Australia east margin is in proximity with Western South America, and Western Laurentia is in proximity with Western and Northern Australia–New Guinea" (Fig. 1a,b) | Annals of Geophysics 50(6), 789–798 | verified |
| Scalera 2018 | At the minimum radii | Australia "juxtaposed with its modern eastern edge to South America, and with New Guinea overlaid with the Californian region" | GNGTS 2018 | verified |
| Owen 1983/2018 | An "Eo-Pacific" ocean already exists at 200 Ma on the 80% Earth; half that area at 260 Ma (75%); Australia "in close contact with Cathaysia … and North America" only at 400 Ma (65%) | see left | Owen 2018 index p. 1, Figs 3A–6A pp. 71–77 | verified |
| Carey | Five "labile gaps": Australian–Antarctic, Antarctic–South American, Central American, Arctic, Asian–Australian | — | Koziar 1993/2013 p. 11 | secondary |
| Hilgenberg | North America cut in two along the Alaska shear with 2000 km of displacement; the Bering junction "fused over more than 1000 km" with the Asian shelf | — | 1933 pp. 6–7, Abb. 7–8 | verified |
| Koziar | "At the turn of the Jurassic and Lower Cretaceous, the Pacific was at an embryonic stage" confined to the Upper Jurassic segment (Fig. 7b) | — | *The Expanding Pacific* p. 14 | verified |

So the two claims RESEARCH.md asked to check split by author: "Australia
against North America" is Barnett (northern margin) and Maxlow (north-west
Australia against Canada across a narrow basin); "California against
Australia" is Brösske, Scalera 2018 (New Guinea on California) and Maxlow
(Queensland–California, breached Late Triassic). Owen alone keeps an open
Pacific at 200 Ma.

**Against the model.** This model has Australia 1930 km from North America at
200 Ma and closest at 1660 km at 175 Ma. Maxlow's model 13 shows a basin
between them a few thousand km wide at 205 Ma on his 3543 km globe (readable
against the 10,000 km bar on thesis p. 64; not measured here); Scalera and
Barnett show contact. The India failure reads differently in this light: the
literature never asks India to reach Africa, it asks it to sit on Antarctica,
which is a join the scorecard does not carry.

Not found: a stated Australia–North America distance in kilometres in any
publication read; a figure with a graticule from which the gap can be read
without scaling off a bar.

## Q6 — The age grid itself, and therefore A(t)

Answered, with two corrections to the model's own text. The 338.81 Ma tail is
Granot's Herodotus Basin at 340 ± 25 Ma, so the "about 280 Ma" calibration
paragraph in MODEL.md is stale. And the repository carries two different age
products: the file on disk is Müller 2019 v2.0, while the fetcher's `age` entry
points at the GMT server's copy of Seton 2020.

### The grids

| Artefact | What it gives | Source | URL | Status |
|---|---|---|---|---|
| `data-src/agegrid.nc`, identified from its header | Müller 2019 v2.0, internal revision r1625, no-mask grid masked with a continent–ocean-boundary mask; 3601 × 1801 nodes, gridline-registered 0.1° with the repeated meridian, lon −180…180, lat −90…90 ascending; float32, NaN fill, range 0.01–338.81 Ma; NaN over 51.36% of nodes, 42.87% of area | header read with the project's own h5wasm; matches `Muller_etal_2019_Tectonics_v2.0_AgeGrid-0.nc` (7.6 MB) in the EarthByte directory | https://www.earthbyte.org/webdav/ftp/Data_Collections/Muller_etal_2019_Tectonics/Muller_etal_2019_Agegrids/ (CC BY 4.0) | verified |
| Müller 2019 v2.0 present-day grid, the other file | `Muller_etal_2019_Tectonics_v2.0_PresentDay_AgeGrid.nc`, 25,985,584 bytes; same product family; README is 48 bytes | same directory | as above | verified (index) |
| **Seton et al. 2020, the successor** ("2019_v3" in its history string) | 6 arc-min gridline-registered, lon −180…180; `age.2020.1.GTS2012.6m.nc` 7.7 MB (also 2m 58 MB, 1m 206 MB, and a GeeK2007-timescale twin); range 0.01–338.684 Ma; NaN 50.82% of nodes, 42.60% of area; companion grids of spreading rate (mm/yr), asymmetry (%), direction and obliquity (deg), spreading-mode class | Seton, Müller, Zahirovic, Williams, Wright, Cannon, Whittaker, Matthews, McGirr 2020, G-cubed 21, e2020GC009214; README dated 29 Sep 2020, last updated 30 Jun 2022 | https://www.earthbyte.org/webdav/ftp/earthbyte/agegrid/2020/Grids/ (README.txt there); Zenodo v1.1 https://zenodo.org/records/6782543 (Grids.zip 914.8 MB) | verified (README, headers) |
| **The per-cell uncertainty grid** | `age_misfit.2020.1.GeeK2007.6m.nc`, 9.3 MB: "the age grid misfit (Myrs) between the age grid and age constraints"; float, capped at 20 Myr; **longitude runs 0…360 in this one file**, against the README; area-weighted over dated ocean: 45.4% under 1 Myr, 20.5% at 1–2, 26.7% at 2–5, 6.8% at 5–10, 0.5% at 10 or more; mean 1.86 Myr. Only on the GeeK2007 timescale | Seton 2020 v1.1 (added June 2022) | as above | verified (header and statistics computed) |
| The confidence grid | `conf.2020.1.GeeK2007.6m.nc`, 420 KB, values {0, 1, 2}; 60.0% of dated ocean is 0 and 40.5% is 2; the README does not define the codes (the paper's "low where uncertainty exceeds four times the global mean" was seen only in a search snippet) | Seton 2020 | as above | partial |
| Nothing shipped with Müller 2019 v2.0 | No file named uncertainty, error, misfit or confidence in any Müller 2019 subdirectory | EarthByte directory listing | as above | verified (negative) |
| What switching to Seton 2020 would change | Seton dates 0.271% of the globe that Müller v2 leaves NaN; Müller dates 0.001% that Seton leaves NaN; where both are dated the mean absolute age difference is 1.25 Myr (max 102.8 Myr); the newly dated cells are margin fringes (Scotia–Weddell, Sulu–Celebes, Bering), not the big basins, so at most a tenth of the model's 2.8% undated deep water | computed here from the two headers, area-weighted | — | verified (computed) |
| The GMT server's `earth_age` (what the fetcher points at) | Seton 2020 on GTS2012, 0.01 Myr precision; 06m tier is 3600 × 1800 int16 with scale/offset in both `_g` and `_p` registrations, 3.0 MB | GMT remote-dataset docs | https://www.generic-mapping-tools.org/remote-datasets/earth-age.html ; https://oceania.generic-mapping-tools.org/server/earth/earth_age/ | verified |

### The old end of the curve

| Artefact | What it gives | Source | URL | Status |
|---|---|---|---|---|
| **The 338.81 Ma tail** | Granot: "the estimated age of the Herodotus crust is 340±25 Myr (that is, early to middle Carboniferous)"; "the older age bound is not well determined"; method: skewness of lineated magnetic anomalies, a normal-polarity chron lasting at least 4 Myr at half-rates of 50 km/Myr or less, and such long normal chrons "are known to have occurred only before 316 Myr ago"; remanence Ir = 64°, Dr = 19° from the 370 Myr African pole | Granot 2016, Nature Geoscience 9, 701–705, DOI 10.1038/NGEO2784 | https://www.cordis.europa.eu/docs/results/320/320496/final1-naturegeogranot2016.pdf (open copy) | verified |
| Where the tail sits in the grid | Müller v2 nodes older than 200 Ma cover 0.032% of the globe, all inside lat 30–40N, lon 10–40E; 1257 nodes older than 250 Ma, 1172 older than 300, 492 older than 330; Seton 2020's maximum is 338.68 Ma from the same source | computed from the grid | — | verified (computed) |
| Oldest in-situ Pacific crust | ODP Hole 801C, Pigafetta Basin: "The oldest part of the Pacific plate was formed at the spreading ridges at 167.4 ± 1.4/3.4 Ma" (⁴⁰Ar/³⁹Ar); alkali basalts 160.1 ± 0.6 Ma; radiolaria 167–173 Ma | Koppers, Staudigel & Duncan 2003, G-cubed 4, 8914, quoted in the ODP Leg 185 synthesis | https://www-odp.tamu.edu/publications/185_SR/synth/synth_3.htm | verified |
| Oldest Atlantic crust | DSDP 534 basal sediments Middle Callovian ~163 Ma; first crust between the Blake Spur and Atlantis fracture zones "approximately 200 Ma" | Labails et al. 2010, GJI 178, 1078 | https://academic.oup.com/gji/article/178/2/1078/2013146 | partial (snippets) |
| Oldest Indian Ocean crust | West Somali Basin anomalies M22–M24 (150–155 Ma); onset extrapolated to ~165 Ma, possibly 170–160 | Davis et al. 2016, Gondwana Research | https://www.sciencedirect.com/science/article/abs/pii/S1342937X16300314 | partial (snippets) |

### The basins the grid leaves undated

| Basin | Age Ma | Range or ± | Method | Source | Status |
|---|---|---|---|---|---|
| Amerasia / Canada Basin | crust 139.5–128.6 (Zhang 2019); breakup Barremian 130.8–126.3, spreading "ended at ca. 80 Ma", dykes 138–125 (Lundin & Doré) | not older than ~160, not younger than ~72 | aeromagnetic anomaly identification; dyke ages | Zhang et al. 2019 GRL, DOI 10.1029/2019GL085736; Lundin & Doré 2017, GSA Today 27(1), 4–11 | Lundin & Doré verified (https://www.geosociety.org/gsatoday/archive/27/1/article/i1052-5173-27-1-4.htm); Zhang partial |
| Weddell Sea | oldest isochrons M-series 147–167 Ma; onset ~M41n (166 Ma) | 147–167 | magnetic anomaly compilation, 2,460 picks, ArcGIS and GMT formats, CC BY 3.0 | Lindeque, Martos, Gohl & Maldonado 2012, PANGAEA DOI 10.1594/PANGAEA.777459 | verified (PANGAEA page) |
| Enderby Basin | spreading from chron M9r (~133 Ma), then Cretaceous Normal Superchron 120–84; crust 3.5–5 km at the COB thickening to 12 km; oceanic crust reaches ~160 km farther south than earlier maps | M9r to CNS | wide-angle seismic, gravity, magnetics | Altenbernd-Lang, Jokat & Leitchenkov 2022, GJI 231(3), 1959–1981, DOI 10.1093/gji/ggac299 | verified (abstract) |
| Ionian Basin | 220–230 Ma (Carnian); "isostatic equilibrium and magnetic anomalies exclude a sea-floor age younger than Late Triassic or Early Jurassic"; crust 6–7 km | Triassic, not younger than ~180 | wide-angle seismic and gravity; magnetic modelling (Speranza 2012) | Dannowski et al. 2019, Solid Earth 10, 447–462, DOI 10.5194/se-10-447-2019 | verified |
| Herodotus Basin | 340 | ± 25 | magnetic skewness | Granot 2016 | verified |
| Levant Basin | no magnetic-anomaly age; "patches of the southern Neo-Tethys ocean, formed by the Middle Permian" or older | Permian?–Triassic? | refraction and gravity inference | Tectonophysics 2023 heat-flow paper (snippet) | not found as a number |
| Black Sea (W and E) | rifting Early to early Late Cretaceous; some authors Paleocene–Eocene for the east; one school: oceanic crust "entirely of Tertiary age" | ~100–84 vs ~66–50 | seismic, subsidence; no isochrons | Nikishin et al. 2015, Mar. Pet. Geol.; Shillington et al. 2009 | partial (snippets; PDF 403) |
| South China Sea | spreading 33 to ~15–16 Ma; basement U1431 16.7–17.6 Ma, U1433 ~18–21 Ma; ridge jump 23.6 Ma; breakup unconformity ~33 Ma | ± ~1 | IODP 349 drilling and deep-tow magnetics | Li et al. 2014, G-cubed, DOI 10.1002/2014GC005567; IODP 349 summary | partial (snippets) |
| Gulf of Mexico | spreading after ~160 Ma, ended Berriasian 145.0–139.4; rifting from the Norian 228–209 | 160–140 | fracture zones in satellite gravity, Yucatán rotation 78 ± 11°, salt age | Lundin & Doré 2017 | verified |
| Caribbean (Venezuelan, Colombian basins) | plateau basement ~90 Ma; obducted crust 91–88 Ma | 88–91 | ⁴⁰Ar/³⁹Ar on obducted plateau | Kerr et al. 1997 EPSL; Ramos et al. 2025 G-cubed | partial (snippets) |
| Scotia Sea (central) | Eagles: "all but one of the available constraints … consistent with a Mesozoic age", accreted "in Jurassic times"; Barker: 21–7 Ma; western Scotia Sea under 30 Ma | Mesozoic vs Miocene, unresolved | magnetic anomaly modelling at 10–18 km/Myr | Eagles 2010, GJI 183(2), 587–600, DOI 10.1111/j.1365-246X.2010.04781.x | verified (abstract) |
| Western Pacific back-arcs | not searched (budget); most are dated in both grids | — | — | — | not attempted |

### Paleo-age grids past 200 Ma, and what in them is modelled

| Product | What it is | Format | Modelled versus measured | URL | Status |
|---|---|---|---|---|---|
| Müller 2019 v2.0 paleo-age grids | `Muller_etal_2019_Tectonics_v2.0_AgeGrid-<t>.nc`, t = 0…250 at 1 Myr, 7.2–7.6 MB each, 1.8 GB zipped; the 200 Ma file: same 0.1° gridline layout, range 0.01–209.84 Ma, 53% of nodes "ocean" | netCDF-4 | Every cell at 200 Ma is synthetic: ages come from the plate model's ridges rotated back; present-day preserved floor older than 200 Ma is 0.032% of the globe. The EarthByte page carries no sentence saying so; the statement is inferred from the product | https://www.earthbyte.org/webdav/ftp/Data_Collections/Muller_etal_2019_Tectonics/Muller_etal_2019_Agegrids/Muller_etal_2019_Tectonics_v2.0_netCDF/ | verified (header); inference flagged |
| Williams, Wright, Cannon, Flament & Müller 2020 | "seafloor age grids for 0–410 Ma topological plate reconstructions", Matthews 2016 and Young 2019 models, 0.5°, 1 Myr steps; readme: "unusually high ages around the edges of large ocean basins … care should be taken when relying on values directly adjacent to continental margins" | netCDF-4 | Explicit: "past ocean basins that have now been subducted cannot be uniquely reconstructed" | https://www.earthbyte.org/webdav/ftp/Data_Collections/Williams_etal_2020_GSF/ ; code https://github.com/siwill22/agegrid-0.1 ; Geoscience Frontiers, DOI 10.1016/j.gsf.2020.06.004 | verified (readme, post) |
| Karlsen, Conrad, Domeier & Trønnes 2021 | Tracer-based (TracTec) age grids, 400 Ma to present; zip 189,172,766 bytes; grids at 0, 50, …, 400 Ma on the author page | not stated | "the TracTec algorithm uses tracers to assign ages to seafloor areas. Here we apply interpolation to fill in any gaps" | https://www.clintconrad.no/seafloorages/Karlsen_etal_2021_agegrids.zip ; GRL 48, e2020GL092119 | verified (page, HEAD) |
| Merdith 2021 and Zahirovic paleo-age grids | not located as hosted products | — | — | — | not found |

### Sediment thickness, for classifying the undated water

| Dataset | What it gives | URL | Status |
|---|---|---|---|
| GlobSed v2 (Straume et al. 2019, G-cubed 20, DOI 10.1029/2018GC008115) | netCDF-4, 4321 × 2161 nodes, gridline-registered 5 arc-min, lon −180…180, lat −90…90 ascending, float32, NaN over land, range −68.73 to 18,333.70 m (a few slightly negative values), NaN 33.05% of nodes, 11,287,663 bytes | http://www.earthdynamics.org/data/GlobSed_v2.nc | verified (header) |
| NOAA/NCEI total sediment thickness v3 | page is a JavaScript-only catalogue; resolution and format not readable | https://data.noaa.gov/onestop/collections/details/0ed0104f-2add-4c87-8fb3-9787b6d416c7 | not reached |
| CRUST1.0 sediment layer (Laske, Masters, Ma & Pasyanos 2013) | 1° × 1°, eight layers including three sediment layers, km, tarball plus ready-made xyz files | https://igppweb.ucsd.edu/~gabi/crust1.html | verified (page); registration not read |

**Against the model.** Three things change on reading this. The calibration
sentence in MODEL.md should say 340 ± 25 Ma, and the ± 25 on that one basin is
the largest single age uncertainty anywhere in the grid. The fetcher and the
loaded file disagree about which product the model runs on, and only Seton 2020
comes with a misfit grid, so moving to it would buy a per-cell weight at the
cost of a documented longitude quirk in that one file and almost no change in
dated area (0.27% of the globe). And the paleo-age grids past 200 Ma are not a
way to extend A(t): each of them says in its own words that the floor it draws
is modelled, not preserved.

Not found: a present-day age grid newer than Seton 2020 (the EarthByte seafloor-age
category lists nothing after November 2020); the definition of the confidence
codes; Merdith 2021 and Zahirovic paleo-age grids as hosted files; a numeric age
for the Levant Basin; the western Pacific back-arc basins (not searched).

## Q7 — Stretching factors and breakup timing

Answered in the main. A public global β grid exists, a 24-profile table of
measured margin β is in hand, the passive-margin database is downloaded and
read, and orogenic shortening has numbers. The β grid is a plate-model output,
which the row says.

| Artefact | What it gives | Source | URL | Status |
|---|---|---|---|---|
| **Müller 2019 v2.0 total stretching factor, present day** | Classic netCDF-3 (GMT 4.5.18), 3601 × 1801, 0.1° gridline-registered, lon −180…180, **lat −90…90 ascending (row 0 is the south pole; flip)**, float32, NaN fill; z = cumulative β since 240 Ma (>1 extension, <1 compression); non-NaN in 986,378 of 6,485,401 cells = 13.0% of the surface by area; range 0.043–235.3; cells with β > 1: 8.5% of Earth's area; β > 1.5: 327,290 cells; > 2: 193,435; > 2.5: 119,658; > 3: 75,557; > 5: 36,082; area-weighted mean β over extended cells 2.15; spot values Vøring 1.48, Basin and Range 1.49, NW Shelf 1.03, Tibet 0.70, Alps 0.79, Central Andes 0.81; Iberia, Newfoundland, North Sea and Red Sea are NaN at the sampled points (outside the model's deforming networks). 25,985,556 bytes, CC BY 4.0. A kinematic model output, not a measurement, from the same family as the age grid | Müller et al. 2019, Tectonics 38, DOI 10.1029/2018TC005462 (their Fig. 9) | https://www.earthbyte.org/webdav/ftp/Data_Collections/Muller_etal_2019_Tectonics/Muller_etal_2019_TotalStretchingFactors/Muller_etal_2019_v2.0_TotalStretchingFactors_Global_PresentDay.nc ; time-dependent active-stretching grids in the sibling directory (158 MB zip) | verified (downloaded, header and values parsed) |
| **Measured β on 24 Atlantic wide-angle profiles** (Biari et al. Table 2) | Original crust A / thinned crust B / β = A/B / oceanic crust, km: NE Greenland 43/8/5.37/5; Lofoten–Vøring 43/10/4.3/6.7; SE Greenland SIGMA 1 43/20/2.15/15; Faroe 43/15/2.8/15; SE Greenland SIGMA 3 43/15/2.86/8; Hatton Bank 46/13/3.53/9; Newfoundland SCREECH1 30/6.5/4.61/4.5; Iberia ISE1 30/3/10/7.5; SCREECH2 30/10/3/4; Iberia CAM144 30/3/10/?; SCREECH3 30/5/6/4; Iberia IAM9 30/8/3.75/8–10; Nova Scotia SMART 37/5/7.4/3–4; Morocco MIRROR 37/9/4.11/7–8; US East Coast LASE 40/20/2/10; Mauritania DAKHLA 37/17/2.17/7–8; Santos SALSA11 40/6/6.66/5; Angola ZAIANGO14 40/5/8/5.5; S Brazil SANBA2 42/12/3.5/6; Namibia P2 40/15/2.66/6; Argentina BGR98 45/5/9/6.5; Namibia SPRINGBOK 45/10/4.5/7.5; Argentina BGR04 45/12/3.75/6.5; Namibia MAMBA2 45/19/2.36/7.5. Reference crust 30 km (Iberia–Newfoundland), 37–40 (Central Atlantic), 40–46 (NE and South Atlantic). No per-row uncertainty; "approximate beta factors". Also: South Atlantic rift zones 55–90 km wide with β 2.5–3.5 where parallel to basement fabric, 185–220 km wide with β 4.3–5 where orthogonal | Biari et al. 2021, Marine and Petroleum Geology 126, 104898, Table 2 (preprint pp. 59–60) | https://archimer.ifremer.fr/doc/00676/78762/80937.pdf (19.6 MB) | verified (table re-aligned by hand with β = A/B as the check) |
| **Bradley 2008 passive margins, digitised** | ESRI shapefile, WGS84 polylines, 78 records, fields M_MARGIN, NAME, OCEAN, OLD_AGE_MA, YNG_AGE_MA, MEAN_AGE, LENGTH_KM; ages are basin-initiation bounds (drift onset), not rift onset; fill −9999 on two Madagascar segments. Rows read: US East Coast 171–170; Mauritania 171.4–167.2; Iberia W 129.7–119.5; Argentina 134.8–109.6; Namibia 133.6–119.9; W Australia 134.2–128.3; Exmouth 150.9–134.7; India W 119.4–98.6; India E 128.1–120.4; Mozambique 179.6–179.3; Somalia 169.8–168.9; Antarctica S of Africa 179.6–120.4; Antarctica S of Australia 89.2–82.7; S Australia 89.2–82.7; E Australia 89.3–72.9; Norway 58.6–46.7; E Greenland 38.6–30.6; Labrador 109–68; W Greenland 89.5–87.5; Red Sea 5; Gulf of Aden 29.8–28.5; Gulf of California 17.5–1.7; Canada Basin 130.2; Lomonosov 60–58.4 | Bradley 2008, Earth-Sci. Rev. 91, 1–26; digitised in McCafferty et al. 2023 (v1.1, March 2025), USGS DOI 10.5066/P970GDD5 | https://www.sciencebase.gov/catalog/item/619550d9d34eb622f69061b7 (GeologyModernPassiveMargins_Global.zip, 24,001 bytes) | verified (all 78 rows read) |
| Brune et al. 2016 rift-velocity database | Per-point CSV from the GPlates portal: time Ma, lon, lat, full rift velocity mm/yr, rift obliquity deg, 240–0 Ma along Pangaea-derived margins; from the deforming model; no bulk per-margin onset/breakup table | Brune, Williams, Butterworth & Müller 2016, Nature 536, 201–204 | http://portal.gplates.org/cesium/?view=rift_v ; https://cesium.com/blog/2016/09/29/rift-velocity-database/ | verified (portal and columns); Extended Data table not reached |
| Chappell & Kusznir gravity inversion | Thinning factor γ = 1 − 1/β from crystalline thickness against a reference, pure shear, densities 2850/3330 kg/m³, Sandwell & Smith free-air input; Alvey, Kusznir & Roberts 2012 "produced a global suite of maps showing crustal thickness and oceanic lithosphere distribution for all of the world's oceans and adjacent margins" | GJI 174(1), 1–13 (2008); AAPG ICE 2012 abstract | https://academic.oup.com/gji/article/174/1/1/2125712 ; https://www.searchanddiscovery.com/abstracts/html/2012/90155ice/abstracts/alv.htm | verified (abstracts); **no public grid** (commercial OCTek products) |
| Orogenic shortening | Himalaya "total minimum shortening in the fold-thrust belt is up to ~670 km" (DeCelles, Robinson & Zandt 2002) and ~610 (480–740) km at 81E (Curzi 2025); Alps "some 500 km of N–S convergence between Europe and Apulia", mostly subducted (Schmid et al. 1996), Southern Alps thrust belt ~50 km; Central Andes ~285 km at 19.5S; Canadian Rockies ~200 km; Sevier ~220 km; Idaho–Montana ~245; Mexican belt ~140; Central Apennines ~170; Pyrenees ~125; Jura ~12 (Curzi, Billi, Carminati & Tavani 2025, Sci. Rep., Table S1 as a Word file on Figshare); Zagros "70 ± 20 km, which corresponds to ~20% shortening of the Arabian block" (McQuarrie 2004) | as named | https://api.crossref.org/works/10.1029/2001TC001322 ; https://api.crossref.org/works/10.1029/96TC00433 ; https://www.nature.com/articles/s41598-025-19660-w ; https://tectonics.caltech.edu/publications/pdf/mcquarrie_JSG2004.pdf | verified |
| Thickest crust | 80 ± 2 km, middle Lhasa terrane, wide-angle refraction (Wang et al. 2021); Central Andes modern mean 65 km from 35–40 km initial, i.e. thickening 1.6–1.9 (Eichelberger et al. 2015, EPSL 426, 191–203); Pamir Moho doublet to ~90 km (Schneider 2019, snippet) | as named | https://pmc.ncbi.nlm.nih.gov/articles/PMC7886915/ | verified; Pamir partial |

**Against the model.** The β cap of 2.5 is below 20 of the 24 measured
margin values and below 12% of the extended cells in the Müller grid. The
shortening cap of 1.6 is met by the Andes (1.6–1.9 thickening) and exceeded in
Tibet (80 km on a 40 km reference is 2.0). The unextended reference the model
takes as the median shield thickness compares with the 30–46 km reference
crust the Atlantic profiles use. The "rift date taken from the nearest sea
floor and spread inland over twelve rings" has two published replacements:
Bradley's 78 margin segments with basin-initiation bounds (a polyline table the
pipeline can read as is), and the Müller time-dependent stretching grids.

Not found: a public Kusznir-group crustal-thickness or β grid (a "global suite
of maps" exists commercially); Bradley's rift-onset ages as a table (the
shapefile carries drift-onset bounds only; ScienceDirect 403); Brune 2016's
Extended Data table; the CRUST1.0 xyz row order (readme inside the tarball).

## Q8 — A measured strength field

Answered for the continents, with a measured result that changes what the
question was asking for over the oceans.

| Artefact | What it gives | Source | URL | Status |
|---|---|---|---|---|
| **Audet & Bürgmann 2011 global Te** | `te_global.xyz`, 1,203,581 bytes, plain text "lon lat Te", 64,800 rows = 360 × 180, cell centres −179.5…179.5 by 89.5…−89.5, **first row lon −179.5 lat 89.5**, i.e. already in the pipeline's row-0-north, column-0-at-180W order; Te in km, integer, 1–200 km over 21,678 cells (33% of the globe: continents and shelves), NaN elsewhere; a `te_nobias.xyz` variant drops gravitational-noise-biased cells; MIT licence. Method: wavelet coherence between topography and Bouguer gravity | Audet & Bürgmann 2011, Nature Geoscience 4, 184–187, DOI 10.1038/ngeo1080 | https://github.com/paudetseis/GlobalTe ; https://raw.githubusercontent.com/paudetseis/GlobalTe/master/data/te_global.xyz | verified (downloaded and inspected) |
| **Oceanic Te(age)** | Te [km] = (2.70 ± 0.15)·√t, t the plate age at loading in Myr, from seamount flexure in three oceans after excluding anomalously low south-central Pacific values; gives ~8.5 km at 10 Ma, 19 at 50, 27 at 100, 35 at 170 | Calmant, Francheteau & Cazenave 1990, GJI 100(1), 59–67 | https://academic.oup.com/gji/article/100/1/59/615401 | verified (abstract) |
| The controlling isotherm | Oceanic Te at loading age tracks the "450 ± 150 °C isotherm" of a cooling plate (Watts); with a cooling half-space, κ = 10⁻⁶ m²/s, Tm = 1350 °C, the 300/450/600 °C isotherm depths run 3.1/4.8/6.5 km per √Myr, so Calmant's 2.7·√t is at the cool edge (arithmetic done here, not in the source) | Watts 1978, 2001, as quoted in the Louisville Ridge admittance paper, Earthquake Science 29 (2016), DOI 10.1007/s11589-016-0147-2 | https://link.springer.com/article/10.1007/s11589-016-0147-2 | verified (quotation); Watts 2001 not opened |
| **Pacific Te does not follow age** | Pacific Te 0–80 km, mean 13.5 km, s.d. 12.3; "generally poorly correlated with plate loading age, crustal age, heat flow and Curie point depth, except for relatively young (<60 Ma) and warm lithospheres"; under 5 km at spreading centres, over 30 km along subduction zones and the Hawaiian–Emperor chain; plateaus and seamounts low; method wavelet admittance of free-air gravity and bathymetry (PlateFlex) | Lu, Audet, Li, Zhu & Wu 2021, JGR Solid Earth 126, e2020JB021074 | https://api.crossref.org/works/10.1029/2020JB021074 ; code https://github.com/paudetseis/PlateFlex | verified (abstract numbers); grid deposit not found |
| Tesauro, Kaban & Cloetingh rheological Te | Te from yield-strength envelopes on CRUST2.0 plus tomographic temperatures; rheological and coherence Te "have a similar range", the rheological one is bimodal (cratons against the rest), coherence Te exceeds it at ~65% of points so coherence Te "provides an upper bound on Te"; young provinces ~25 km, cratons >100 km (snippet) | G-cubed 13(9), Q09001 (2012), DOI 10.1029/2012GC004162; Global and Planetary Change 90–91, 51–57; Tectonophysics 602, 78–86 | https://api.crossref.org/works/10.1029/2012GC004162 ; https://www.gfz.de/en/section/earth-system-modelling/topics/density-structure-of-the-earth/thermal-rheological-and-strength-models/ | verified (abstract); **no grid files offered** |
| CRUST1.0 | 1° × 1°, cell centres at x.5, 8 layers with boundary depth, Vp, Vs, ρ per layer; tarball 1,155,392 bytes; add-on 12,887 bytes with a crustal-type code per cell; `crsthk.xyz.zip` 267,130 bytes as "lon lat thickness_km" text; also depth-to-Moho and sediment xyz files | Laske, Masters, Ma & Pasyanos 2013, EGU2013-2658 | https://igppweb.ucsd.edu/~gabi/crust1.html | verified (page and HEAD sizes); row order not stated |
| LITHO1.0 | 1° icosahedral tessellation (not equirectangular; needs resampling), 11 layers with thickness, Vp, Vs, ρ, Q; lithosphere–asthenosphere boundary depth in km is the strength field; tarball 12,419,118 bytes (~500 MB unpacked, native format plus access code); GeoTess zip 4,723,028 bytes; the page warns the interpolator "can yield non-physical values at some coordinates" | Pasyanos, Masters, Laske & Ma 2014, JGR 119(3), 2153–2173, DOI 10.1002/2013JB010626 | https://igppweb.ucsd.edu/~gabi/litho1.0.html | verified |

**Against the model.** The eleven-value rigidity table has a measured
replacement for a third of the globe: Audet's 1° Te, 1–200 km, in the
pipeline's own row order. Over the oceans the measured field says something
the model cannot currently say and did not expect: beyond about 60 Ma the
Pacific's coherence Te does not follow age, so "old Pacific floor stiff, young
Atlantic floor soft" is not what the measurement shows. The √age law is a rule
for the age at loading (seamounts), so if it is used it should be applied as a
formula with Calmant's coefficient, not read from a grid. That leaves the
0.70 island threshold and the ocean value 0.10 without a measured counterpart
in the same units; a mapping from Te to the model's dimensionless rigidity has
to be chosen and stated.

Not found: Tesauro's grids as files (GFZ page has none; PDF 403); Kalnins &
Watts 2009 Te numbers (no abstract, ScienceDirect 403); Lu 2021's Pacific Te
grid as a deposit; any oceanic Te grid that is age-driven, for the reason just
given.

## Q9 — Where deformation belongs, and how much is allowed

Answered: the four numbers RESEARCH.md asked for are in hand with sources, and
there are three per-cell maps of where deformation is allowed.

| Artefact | What it gives | Source | URL | Status |
|---|---|---|---|---|
| **Fraction of the surface that deforms** | GSRM v2.1: "About 14% of the Earth is allowed to deform in 145,086 deforming grid cells (0.25° longitude by 0.2° latitude in dimension). The remainder of the Earth's surface is modeled as rigid spherical caps representing 50 tectonic plates"; Gordon: "Diffuse plate boundaries cover ~15% of Earth's surface"; Bird: orogens "have total area of 0.937 steradian (comparable to SA; 7.5% of Earth)"; Müller 2019: "About a third of the continental crustal area has been deformed since 240 Ma, partitioned roughly into 65% extension and 35% compression" | Kreemer, Blewitt & Klein 2014, G-cubed 15, 3849–3889; Gordon 1998, Annu. Rev. Earth Planet. Sci. 26, 615–642; Bird 2003, G-cubed 4(3), 1027; Müller et al. 2019 | https://api.crossref.org/works/10.1002/2014GC005407 ; https://revistamaya.com/wp-content/uploads/2022/03/Gordon_1998_Plate-tectonic-approximation.pdf ; http://peterbird.name/publications/2003_pb2002/2001GC000252.pdf ; https://www.earthbyte.org/muller-et-al-2019-deforming-plate-reconstruction-and-seafloor-age-grids-tectonics/ | verified |
| **Diffuse-boundary width and speed** | "Some diffuse plate boundaries in both continents and oceans exceed dimensions of 1000 km on a side"; relative speed across any one of them "~2 to ~15 mm/year"; Sierra Nevada–Pacific ~100 km wide; strain rates: stable interiors 10⁻¹²–10⁻¹¹ /yr (seismic) to ~4 × 10⁻¹⁰ /yr (geodetic), diffuse boundaries up to ~10⁻⁸ /yr, transforms 6 × 10⁻⁶ to 3 × 10⁻⁴ /yr | Gordon 1998, pp. 624–632 | as above | verified |
| **Intraplate residual velocity** | ITRF2020 plate-motion model: 518 sites away from boundaries, GIA and deforming zones; "The overall precision with which the ITRF2020 velocity field is represented by the rigid ITRF2020-PMM is at the level of 0.25 mm/yr WRMS"; Gordon's upper bound on stable interiors ≤ 2 mm/yr; GSRM v2 appendix residuals (17 rows parsed) median 0.66 mm/yr, p90 4.0 | Altamimi, Métivier, Rebischung, Collilieux, Chanard & Barnéoud 2023, GRL 50, e2023GL106373; Gordon 1998; GEM GSRM report App. C | https://api.semanticscholar.org/graph/v1/paper/DOI:10.1029/2023GL106373?fields=abstract | verified; GSRM rows partial |
| **Stage-pole duration, measured from the rotation file** | Myr between consecutive finite rotations, 0–200 Ma (n, median, mean, min, max): N America 101/714 19, 8.95, 12.5, 4.8, 37.6; S America 201/701 11, 11.35, 12.1, 7.0, 24.6; Eurasia 301/101 11, 12.8, 22.2, 8.0, 80.0; India 501/702 7, 4.3, 7.1, 0.4, 17.0; Australia 801/802 20, 5.8, 8.9, 2.1, 60.0; Antarctica 802/701 24, 5.6, 8.1, 1.1, 28.2; Pacific 901/804 14, 5.5, 6.4, 2.85, 13.0; all 166 stages: median 5.0, mean 8.2, p25 5.0, p75 9.2 (the absolute-frame poles are interpolated at fixed 5 Myr) | computed from `Global_250-0Ma_Rotations_2019_v2.rot` in the Müller 2019 v2.0 Updated zip | https://www.earthbyte.org/webdav/ftp/Data_Collections/Muller_etal_2019_Tectonics/Muller_etal_2019_PlateMotionModel/Muller_etal_2019_PlateMotionModel_v2.0_Tectonics_Updated.zip (37,938,150 bytes) | verified (computed) |
| **How much a margin can absorb** | "hyper-extended (with a thickness <10 km) crustal slivers", "70 km offshore Iberia" and "200 km off Angola", "achieving crustal thinning of a factor larger than 3" | Brune, Heine, Pérez-Gussinyé & Sobolev 2014, Nature Comms 5, 4014 | https://pmc.ncbi.nlm.nih.gov/articles/PMC4059923/ | verified |
| **Maximum crustal thickening** | 80 ± 2 km, middle Lhasa terrane (Q7); Central Andes 65 km from 35–40 | Wang, Thybo & Artemieva 2021; Eichelberger 2015 | see Q7 | verified |
| **PB2002, the per-cell map** | `PB2002_boundaries.dig` (6,048 points, 229 segments, lon/lat polylines with left plate, polarity symbol, right plate), `PB2002_plates.dig` (52 closed counter-clockwise outlines), `PB2002_orogens.dig` (13 closed outlines: Alps, Persia–Tibet–Burma, …), `PB2002_steps.dat` (5,819 steps, mean 44.7 km, classes SUB/OSR/OTF/OCB/CRB/CTF/CCB with velocities); per-orogen areas not tabulated in the paper, computable from the polygons; global area production/destruction 0.108 m²/s | Bird 2003 | http://peterbird.name/publications/2003_PB2002/2003_PB2002.htm | verified |
| **GSRM v2.1 grid** | Mesh 87.5S–87.5N, cells 0.2° lat × 0.25° lon; 145,086 deforming cells (paper) / 144,827 (GEM report); 22,511 velocities; open version CC BY-NC-SA 4.0 on the GEM product page; geodesy.unr.edu/GSRM listing empty on the day | Kreemer 2014; GEM technical report (11.4 MB PDF read) | https://www.globalquakemodel.org/product/gsrm ; https://cloud-storage.globalquakemodel.org/public/wix-new-website/pdf-collections-wix/publications/Global%20geodetic%20strain%20rate%20model.pdf | verified (report); file listing not reached |
| **Müller 2019 deforming networks** | ~25 regional `*_Deforming_Mesh_2019_v2.gpml` topological networks (Alps, Andes, Australia–Antarctica, East African Rift, Greater India, North America, North Atlantic, North China, Papua New Guinea, Eurasia–Arabia, Arctic–Eurasia, Baja, Coral Sea, Ellesmere, America–Anyui, Northern Andes, Australia–North Zealandia, East–West Gondwana, …) with valid-time begin/end and lon/lat in `gml:posList`, so "inside a deforming network at time t" is readable at 1° without GPlates; plus the 44.7 MB global plate-boundary GPML, the 510 KB rotation file (comparator only), and 20–82 MB point sets carrying stretching factors | Müller et al. 2019 | as above | verified (zip listing) |

**Against the model.** The 4 km/Myr plate tolerance is 4 mm/yr, mid-way in
Gordon's 2–15 mm/yr for diffuse boundaries and twice his intraplate bound; the
geodetic rigid-plate residual is 0.25 mm/yr. The pole memory τ ≈ 1.4 Myr is
three to four times shorter than the shortest common stage in the compilation
and four times shorter than its median; 5–10 Myr would match. The share of the
sphere the model may let deform has three published values to choose between,
7.5%, 14% and 15%, and a per-cell map for each. The 0.5 land-crush margin
compares with a thinning factor of 3 over 70–200 km strips on the widest
hyperextended margins.

Not found: per-orogen areas as a table (compute from the `.dig` file); the
GSRM grid file itself (the GEM download was not followed); Argus or Kreemer
intraplate residuals as a separate published number.

## Q10 — The descending sheet: force and geometry

Answered for the mainstream quantities, with one ratio left unverified.

| Artefact | What it gives | Source | URL | Status |
|---|---|---|---|---|
| **Slab-pull share of the driving force** | "Observed plate motions are best predicted if slabs in the upper mantle are attached to plates and generate slab pull forces that account for about half of the total driving force on plates"; best fit "between about 40% and 100% of upper-mantle slab weight causing slab pull, which corresponds to between 40 and 65% of the total force on plates"; ridge push "accounts for at most only 5–10% of the forces on plates"; slab below 660 km drives by suction, not pull; tensional stress at the plate edge 200–500 MPa | Conrad & Lithgow-Bertelloni 2002, Science 298, 207–209, and supplement | https://www.clintconrad.no/papers/Conrad_Science2002.pdf ; https://www.clintconrad.no/papers/Conrad_Science2002supp.pdf | verified |
| Becker & Faccenna | "anywhere from 20 to 80% of the net slab weight" transmitted as pull; slab-related forces "approximately 90% of total driving force" | Becker & Faccenna 2009, in *Subduction Zone Geodynamics*, Springer, 3–34 | https://www-udc.ig.utexas.edu/external/becker/preprints/bf07.pdf (connection reset) | partial (snippet) |
| **Slab dip** | 159 transects; "back-arc spreading is observed for deep dips (deeper than 125 km) larger than 50°, whereas back-arc shortening occurs only for deep dips less than 30°"; "Slabs dip more steeply, by about 20° on average, beneath oceanic overriding plates than beneath continental ones"; ~10° steeper near slab edges; dip does not correlate with slab pull, age at trench, convergence rate or polarity; the per-transect table is the paper's Table 1 (not opened) | Lallemand, Heuret & Boutelier 2005, G-cubed 6, Q09006 | https://api.crossref.org/works/10.1029/2005GC000917 | verified (abstract); histogram not opened |
| **Stalling depth** | Four stages: "I – slab stagnant above the 660 km discontinuity; II – slab penetrating the 660 km discontinuity; III – slab trapped in the uppermost lower mantle (at a depth of 660–1000 km); and IV – slab descending well into the deep lower mantle. The majority of slab images are found to be either at Stage I or III"; Goes: "None of the current transition-zone slabs seem to have stagnated there more than 60 m.y."; viscosity jump ×20–50; Clapeyron −1 to −2 MPa/K; slab yield stress 100–300 MPa | Fukao & Obayashi 2013, JGR 118, 5920–5938; Goes, Agrusta, van Hunen & Garel 2017, Geosphere 13(3), 644–664 | https://api.crossref.org/works/10.1002/2013JB010466 ; https://api.semanticscholar.org/graph/v1/paper/DOI:10.1130/GES01476.1?fields=abstract | verified (abstracts) |
| **Slab2** | 27 regional slabs (alu, cal, cam, car, cas, cot, hal, hel, him, hin, izu, ker, kur, mak, man, mue, pam, phi, png, puy, ryu, sam, sco, sol, sul, sum, van); per region `_dep`, `_dip`, `_str`, `_thk`, `_unc` as GMT netCDF `.grd` and ASCII `.xyz`, depth contours, clipping polygon CSV, shapefiles; measured on Cascadia: comma-separated lon,lat,depth, **lon 0–360**, 0.05° spacing (3 arcmin), 361 × 381 nodes, NaN outside the slab, **depth negative downward** (−4.7 to −437 km); full tarball 140,213,438 bytes; "24 million square kilometers of subducted slabs" | Hayes et al. 2018, Science 362, 58–61; USGS DOI 10.5066/F7PV6JNV | https://www.sciencebase.gov/catalog/item/5aa1b00ee4b0b1c392e86467 | verified (listing and file) |
| **Outer-rise flexure** | 26 circum-Pacific sites, 15–148 Ma; plate "nearly moment-saturated at the trench axis"; "The effective elastic thickness of the plate on the outer trench slope is at least three times smaller than the elastic thickness of the plate before bending at the outer rise"; Table 2 outer-slope Te 3.27–21.78 km rising with age; curvature −3.45 to −14.07 × 10⁻⁷ /m, i.e. **bending radius 710–2,900 km**; friction 0.3 fits better than 0.6; "the model predicts significant fracturing of the lithosphere between 75 and 150 km away from the trench axis where no fracturing is observed", so the bend is taken up within ~75 km | Garcia, Sandwell & Bassett 2019, GJI 218, 708–728 | https://academic.oup.com/gji/article/218/1/708/5423205 | verified |
| Trench Te against age | Levitt & Sandwell: 117 profiles, "The bending moment needed to support the trench and outer rise topography increases by a factor of 10 as lithospheric age increases from 20 to 150 Ma", flexural wavelength unreliable as a thickness proxy; Bry & White: 10 Myr age bins 0–150 Ma, "no consistent increase of elastic thickness as a function of plate age"; Craig & Copley: trench Te shows "little correlation with the age of the incoming lithosphere" | Levitt & Sandwell 1995, JGR 100, 379–400; Bry & White 2007, JGR 112, B08414; Craig & Copley 2014, EPSL 392, 207–216 | Crossref and Semantic Scholar abstracts | verified (abstracts) |
| Compressive against tensile strength | Brittle strength = κ × effective lithostatic stress with κc = 2.1–3.7 (thrust) and κe = 0.68–0.79 (normal), **ratio 3.1–4.7** for μ 0.6–0.85; the same numbers follow from [(1 + μ²)^½ + μ]² (arithmetic done here); the ductile part of the envelope is symmetric, so for 7 km crust plus mantle lid the asymmetry lives in the top 20–40 km | Brace & Kohlstedt 1980, JGR 85, 6248–6252, as restated in a later paper; Kohlstedt, Evans & Mackwell 1995, JGR 100, 17587–17602, Figs 8–9 | https://agupubs.onlinelibrary.wiley.com/doi/10.1029/JB085iB11p06248 (not opened) | partial (snippet; consistency check passes) |
| **Geodetic bound on the radius, for the honesty section** | Wu et al.: mean radius change 0.1 mm/yr, "statistically insignificant" (JPL release; the ± is in the GRL abstract, which no host served); ITRF2014: "scale and scale rate differences between the two solutions are 1.37 (±0.10) ppb at epoch 2010.0 and 0.02 (±0.02) ppb/yr", which at 6371 km is **0.13 ± 0.13 mm/yr** as the SLR–VLBI disagreement, an upper bound on an undetected common rate rather than a measurement of one; ITRF2020 origin rate bias 0.74 ± 0.09 mm/yr along Z | Wu, Collilieux, Altamimi, Vermeersen, Gross & Fukumori 2011, GRL 38, L13304; Altamimi, Rebischung, Métivier & Collilieux 2016, JGR 121, 6109–6131; Altamimi 2023 | https://www.jpl.nasa.gov/news/nasa-research-confirms-its-a-small-world-after-all ; https://api.semanticscholar.org/graph/v1/paper/DOI:10.1002/2016JB013098?fields=abstract | Wu value verified, ± not seen; ITRF2014 verified |

**Against the model.** The drag gain that "no interior criterion can choose"
has a published value if it is read as the fraction of driving torque carried
by the descending sheet: 0.40–0.65 for upper-mantle slabs, with ridge push at
most 0.05–0.10 and the rest suction. The fold's depth law has two literature
stalling depths, 660 km and 660–1000 km, with most sheets at one of them and
none stalled longer than 60 Myr. The right-angle surface fold compares with
dips at 125 km that span roughly 30–70°, and with a bending radius of
710–2,900 km taken up within ~75 km of the trench, where the plate is moment-
saturated and its outer-slope Te is a third of the unbent value; the 150 km
hang length ("one mesh spacing") is twice that bend zone. The 0.9 compressive
resistance has no literature analogue below 1: brittle lithosphere is three to
five times *stronger* in compression than in tension, and the fold's real limit
is bending-moment saturation, which grows tenfold from 20 to 150 Ma. The
model's implied 12.2 mm/yr sits two orders of magnitude above the geodetic
bound, whichever form of the bound is quoted.

Not found: Forsyth & Uyeda 1975's torque-balance sentence (no host); Conrad &
Lithgow-Bertelloni 2004; the Slab2 dip histograms (Science and USGS pages 403;
spacing measured from the file instead); Turcotte & Schubert forebulge width
and height formulae as applied per trench; the Kohlstedt 1995 envelope figure;
Wu 2011's uncertainty.

### The Expanding Earth side of Q10

Not found: any Expanding Earth account that quantifies descending lithosphere
(a rate, a dip, a depth, a bending radius). Carey 1975 (read in full), Carey
1996 ch. 7 (read in full), Maxlow 2001 and 2021 (searched), Scalera 2003 and
2007 (read), Koziar 2018 (searched): the Pacific margins are treated as
extensional or diapiric ("krikogenesis", Wezel; "geotumours", Cecioni; Ciric
"Is subduction a real phenomenon?", all Sydney 1983 pp. 247–263) and no author
gives a number for a returning sheet. Carey 1976 and 1988 could not be opened
(archive.org lending copy 403; Google Books no preview).

---

## The collections, so nobody has to find them twice

| Volume | Where | What is in it for this model |
|---|---|---|
| Carey (ed.) 1958, *Continental Drift: a Symposium*, Hobart 1956 | archive.org copy restricted (403); not read | Carey's "less than half the diameter" statement (p. 346, via Kragh) |
| Carey 1975, "The Expanding Earth — an essay review", Earth-Sci. Rev. 11, 105–143 | https://sites.ualberta.ca/~unsworth/UA-classes/699/2011/pdf/Carey_ESR_1975.pdf | Barnett, Brösske, Creer, Dearnley, Meservey numbers (pp. 110–112) |
| Carey 1976, *The Expanding Earth*, Elsevier, x + 488 pp. | https://archive.org/details/expandingearth0000care (lending, 403 to fetch); TOC: Introductory Review p. 1, Some Principles p. 90, Regional p. 337, Retrospect p. 443 | not read; p. 194 (Ward critique) via Koziar |
| Carey (ed.) 1983, *The Expanding Earth: a Symposium*, Sydney 1981, ISBN 085901 209-3 | Front matter only: https://ndownloader.figshare.com/files/40912313 | Contents with pages: Vogel "Global models and Earth expansion" 17; Owen "Ocean-floor spreading evidence of global expansion" 31; Dooley 59; Bailey & Stewart 67; Rickard (APWPs on an expanding Earth) 71; Vogel & Schwab "The position of Madagascar in Pangaea" 73; Burrett 79; Embleton, Schmidt & Fisher 87; Glikson 88; Crook 89; Kremp 91; Termier 101; Gorai "primordial size of the Earth" 105; Crawford 111; Stöcklin 119; Ahmad 131; Plumb 147; Johnston 148; Ciric 149; Tassos 161; Brunnschweiler 165; Carey "Tethys, and her forebears" 169; Davidson 191; Shields "Trans-Pacific biotic links" 199; Bevis & Payne "A new Palaeozoic reconstruction of Antarctica, Australia and South America" 207; Iturralde-Vinent 215; Tanner 219, 227; Ramberg 233; Scholl & Vallier 235; Ciric 247; Cecioni 259; Wezel 263; Dachille 267; Shields 277; Myers 283; then Neiman, Talobre, Blinov ("Spreading rate and rate of expansion of the Earth"), Stewart ("Quantitative limits to the palaeoradius of the Earth") — pages lost in the scan |
| Scalera & Jacob (eds) 2003, *Why Expanding Earth? A book in honour of O. C. Hilgenberg*, INGV, 465 pp. | earth-prints.org (DSpace), chapter bitstreams | Scalera & Braun on Hilgenberg 25–41; Migotto & Ferracci on the globe restoration 65–69; Scalera's Carey memoir 85–95 (not reached); Scalera "a sound idea" 181–232 |
| Scalera, Boschi & Cwojdziński (eds) 2012, *The Earth Expansion Evidence*, Aracne, Erice 2011 | Table of contents: https://www.earth-prints.org/bitstreams/6bfa53ef-8513-44e2-a1f0-99e3928c30ce/download ; extended abstracts book (58 MB) also on earth-prints | Cwojdziński 29; Maxlow 41; Ollier 61; Owen 77; Pavlenkova 91; Perin 101; Scalera 115; Vogel 161; Blinov 173; Cahill 185; Edwards 197; Kokus 213; Michelini 219; Müller 227; Myers 233; Scalera 239; Shehu 243; Cwojdziński 263; Kochemasov 275; Mele 283; Morris 291; Ollier 297; Hurrell 307; Mardfar 327; Strutinski 343; Devoti et al. 367; Sarti 377; Scalera (geodesy) 389; Gottfried 397; Jacob & Dietrich 407; Maxlow 421; Rodkin & Shatakhtsyan 439; Sakhno 449; Scalera 463; Scalera 479 |
| Koziar 2018, *Geological proofs of significant expansion of the Earth*, Wrocław, 227 pp. | http://www.wrocgeolab.pl/proofs.pdf | Paleoradius methods pp. 149–161; Vogel and Maxlow reconstructions Figs 87–90 |
| Owen 2018, DVD index to the 1983 Atlas | https://www.dinox.org/publications/Owen2018-Expanding%20Earth%20Diagrams.pdf | Diameter series and map list |
| Maxlow 2001 thesis; Maxlow 2021 *Beyond Plate Tectonics* | Figshare and billhowell.ca URLs above | Everything in Q4 |
| NCGT Journal | https://www.ncgtjournal.com/issues (2013–2026 only) | Maxlow 2002 NCGT Newsletter 22, 13–21 not hosted |

Axes that yielded nothing: the NCGT Newsletter years (not online); Carey's own
books (not openable); Neal Adams (videos, no stated size at any age); Blinov's
books (Russian hosts behind CAPTCHA); Shields 1979 (ScienceDirect 403, no
abstract anywhere); Ollier's expanding-Earth papers (not indexed).

---

## Datasets this pipeline could read

The pipeline wants global equirectangular grids on a regular graticule, row 0
at the north pole and column 0 at longitude −180, int16 with scale, offset and
a fill value, gzipped, at 6 arcmin for a field or 1° for a per-face
classification; lon/lat polylines go through the groove reader; plain text
tables and netCDF-4 from the GMT server are what the fetcher already reads.
Every EarthByte and GMT netCDF below is stored south-to-north, so rows are
flipped on the way in, as `fetch-grids.ts` already does. Two files carry
longitude 0…360 and are marked. Nothing here is a rotation file used as input;
the two rotation files listed are comparators.

| Dataset | Holds | Format | Resolution / count | Size | URL | Convention | Fit | Status |
|---|---|---|---|---|---|---|---|---|
| Seton et al. 2020 age grid v2020.1 | sea-floor age, GTS2012 or GeeK2007 | netCDF-4 (also netCDF-3, xyz) | 6 arcmin gridline, 3601 × 1801 (also 2m, 1m) | 7.7 MB | https://www.earthbyte.org/webdav/ftp/earthbyte/agegrid/2020/Grids/age.2020.1.GTS2012.6m.nc | lon −180…180, lat S→N, float32, NaN fill, 0.01–338.68 Ma, CC BY 4.0 | 6 arcmin field, drop-in successor to `agegrid.nc` | verified |
| **Seton 2020 age misfit** | per-cell age misfit, Myr, capped 20 | netCDF-4 | 6 arcmin gridline | 9.3 MB | …/Grids/age_misfit.2020.1.GeeK2007.6m.nc | **lon 0…360**, lat S→N, float, NaN | 6 arcmin field: the inverse-variance weight Q1 asked for | verified |
| Seton 2020 confidence | codes 0/1/2 | netCDF-4 | 6 arcmin | 420 KB | …/Grids/conf.2020.1.GeeK2007.6m.nc | lon −180…180; codes undocumented | 1° or 6 arcmin classification | partial |
| **Seton 2020 obliquity, direction, asymmetry, rate** | spreading obliquity (deg), direction (deg), asymmetry (%), full rate (mm/yr), mode class | netCDF-4 | 6 arcmin gridline | 9.4 / 7.5 / 6.1 MB | …/Grids/obliq.2020.1.GeeK2007.6m.nc etc. | lon −180…180, lat S→N, float32, NaN, 0.01–90° | 6 arcmin fields; obliquity and direction feed the pair gate and the tracer | verified |
| Müller 2019 v2.0 present-day age grid | the file in use | netCDF-4 | 0.1° gridline | 7.6 MB (25 MB variant) | https://www.earthbyte.org/webdav/ftp/Data_Collections/Muller_etal_2019_Tectonics/Muller_etal_2019_Agegrids/ | as `agegrid.nc`; CC BY 4.0 | in use | verified |
| Müller 2019 v2.0 paleo-age grids | modelled age at t = 0…250 Ma | netCDF-4, 251 files | 0.1° | 7.2–7.6 MB each, 1.8 GB zipped | …/Muller_etal_2019_Tectonics_v2.0_netCDF/ | as above; synthetic past 200 Ma | comparator only | verified |
| **Müller 2019 total stretching factor** | cumulative β since 240 Ma, present day | netCDF-3 | 0.1° gridline | 26 MB | …/Muller_etal_2019_TotalStretchingFactors/Muller_etal_2019_v2.0_TotalStretchingFactors_Global_PresentDay.nc | lon −180…180, **lat S→N**, float32, NaN outside deforming networks (13% covered), 0.04–235 | 6 arcmin field or 1° classification: replaces the un-stretching constants | verified |
| Müller 2019 active stretching factors | β per time step | netCDF zip | 0.1° | 158 MB | …/Muller_etal_2019_ActiveStretchingFactors/ | as above | per-frame rift dating | listing only |
| Müller 2019 deforming networks and boundaries | ~25 regional network GPMLs with valid times; global boundary GPML; rotation file | GPML (GML/XML), `.rot` | polygons | 38 MB zip (44.7 MB GPML inside) | …/Muller_etal_2019_PlateMotionModel/Muller_etal_2019_PlateMotionModel_v2.0_Tectonics_Updated.zip | lon/lat in `gml:posList` | 1° per-face "deforming at t" flag; rotations are a comparator | verified |
| Williams et al. 2020 paleo-age grids | modelled age 0–410 Ma | netCDF-4 | 0.5°, 1 Myr | not stated | https://www.earthbyte.org/webdav/ftp/Data_Collections/Williams_etal_2020_GSF/ | edge artefacts flagged in readme | comparator only | verified |
| Karlsen et al. 2021 age grids | tracer-based age 400–0 Ma | zip | not stated | 189 MB | https://www.clintconrad.no/seafloorages/Karlsen_etal_2021_agegrids.zip | not stated | comparator only | verified (HEAD) |
| **GlobSed v2** | total sediment thickness, m | netCDF-4 | 5 arcmin gridline, 4321 × 2161 | 11.3 MB | http://www.earthdynamics.org/data/GlobSed_v2.nc | lon −180…180, lat S→N, float32, NaN over land, −68.7…18,334 m | 6 arcmin field: classifies the 2.8% undated deep water | verified |
| CRUST1.0 | 8-layer crust: depths, Vp, Vs, ρ; sediment and crustal thickness xyz | text | 1° cells at x.5 | 1.2 MB tar; 267 KB thickness xyz | https://igppweb.ucsd.edu/~gabi/crust1.html | row order in tarball readme | 1° classification (plain text path) | verified |
| LITHO1.0 | 11-layer crust + lithosphere, LAB depth | native + GeoTess | 1° icosahedral tessellation | 12.4 MB tar (~500 MB unpacked); 4.7 MB GeoTess | https://igppweb.ucsd.edu/~gabi/litho1.0.html | not equirectangular; resample | 1° strength field after resampling | verified |
| **Audet & Bürgmann 2011 Te** | effective elastic thickness, km | text "lon lat Te" | 1°, 64,800 rows | 1.2 MB | https://raw.githubusercontent.com/paudetseis/GlobalTe/master/data/te_global.xyz | **first row lon −179.5 lat 89.5: already the pipeline's order**; 1–200 km over 33% of the globe, NaN elsewhere; MIT | 1° strength field for continents and shelves | verified |
| **GSFML sea-floor fabric** | FZ, discordant zone, propagating rift, V-anomaly, extinct ridge polylines | OGR/GMT multisegment ASCII (also shapefile, KMZ) | 2,246 segments, 24,504 guide points | 255 KB | https://www.soest.hawaii.edu/PT/GSFML/SF/DATA/GSFML_SF.tbz | lon −180…180, lat −67.7…58.3; ID, Name, Author only; no licence stated | polylines into the groove reader | verified |
| Matthews 2011 Traces.zip | same feature classes, 2011 snapshot | GPML, shapefile, KML, GMT xy | 1,686 polylines | 2.6 MB | https://www.earthbyte.org/webdav/ftp/earthbyte/Seafloor_Tectonic_Fabric/Traces.zip | lon −180…180; CC BY 4.0 | polylines; the licensed alternative | verified |
| **GSFML magnetic picks** | 101,806 picks with chron, end flag, quality, reference, GeeK2007 age | OGR/GMT POINT (also shapefile, KML) | points | 11.1 MB | https://www.soest.hawaii.edu/PT/GSFML/ML/DATA/GSFML.global.picks.gmt | lon −180…180; no positional error | point table: pair within a Reference to make conjugate quadruples | verified |
| **GSFML Hellinger archive** | 18,315 picks with 1σ km, segments, fitted poles, covariances, residuals | Chang `hellinger1` text | 487 files, 11 studies | 1.4 MB | https://www.soest.hawaii.edu/PT/GSFML/HELL/DATA/GSFML.Global.hellinger.zip | lat lon per row | point table with weights: the per-pick error Q1 asked for | verified |
| EMAG2v3 (GMT copy) | magnetic anomaly at sea level (ocean only) or 4 km (global), nT | netCDF | 6 arcmin, g and p | 4.3 MB (7.0 MB 4 km) | https://oceania.generic-mapping-tools.org/server/earth/earth_mag/earth_mag_06m_g.grd | int16 at 0.2 nT + 800 nT offset; same server the fetcher reads | 6 arcmin field, add to the fetcher catalogue | verified |
| WDMAM v2.2 (GMT copy) | magnetic anomaly, global incl. land, nT | netCDF | 6 arcmin (3 arcmin original) | 8.1 MB | https://oceania.generic-mapping-tools.org/server/earth/earth_wdmam/earth_wdmam_06m_g.grd | int16 at 0.2 nT + 3000 nT | 6 arcmin field, add to the fetcher catalogue | verified |
| SRTM15+ (GMT copy) | topography and bathymetry, m | netCDF | 6 arcmin | ~3 MB class | https://oceania.generic-mapping-tools.org/server/earth/earth_relief/earth_relief_06m_p.grd | already the `relief` entry of the fetcher | replaces `height-map.jpg` | in the fetcher, not yet fetched |
| KWSMTS v0.1 seamounts | 24,646 seamounts with ellipse, height, VGG, age | whitespace text | points | 1.8 MB | http://www.soest.hawaii.edu/PT/SMTS/kwsmts/KWSMTSv01.txt | lon −180…180; no licence | point table for false-positive labelling | verified |
| Gevorgian 2023 seamounts | 19,325 new seamounts plus KWSMTS KML | text and KML in zip | points | 4.1 MB | https://zenodo.org/records/7718512 | CC BY 4.0 | point table | verified (record) |
| Doubrovine 2012 Pacific APM (partial) | 8 rotations to 83.5 Ma; Hawaii drift path | text | — | <3 KB | https://raw.githubusercontent.com/GenericMappingTools/gmt/master/test/spotter/D2012x.txt | lon lat age angle | comparator for the Pacific | verified; full frame not reached |
| **Bradley 2008 passive margins (digitised)** | 78 margin segments with basin-initiation age bounds | ESRI shapefile, WGS84 polylines | 78 records | 24 KB | https://www.sciencebase.gov/catalog/item/619550d9d34eb622f69061b7 | OLD_AGE_MA, YNG_AGE_MA, MEAN_AGE, LENGTH_KM; fill −9999 | polylines with dates: replaces the twelve-ring rift dating | verified |
| Brune 2016 rift velocities | per-point rift velocity and obliquity 240–0 Ma | CSV from portal | points | — | http://portal.gplates.org/cesium/?view=rift_v | time, lon, lat, mm/yr, deg | point table (model output) | verified (portal) |
| **PB2002** | plate boundaries, plate outlines, 13 orogen outlines, boundary steps | `.dig` / `.dat` text | 6,048 boundary points, 52 plates, 13 orogens, 5,819 steps | small | http://peterbird.name/publications/2003_PB2002/2003_PB2002.htm | lon/lat polygons | 1° per-face orogen flag by point-in-polygon | verified |
| GSRM v2.1 | strain rates and rigid caps | grid files behind GEM download | 0.2° × 0.25°, 145,086 deforming cells | — | https://www.globalquakemodel.org/product/gsrm | CC BY-NC-SA 4.0 | 6 arcmin field after resampling | file listing not reached |
| **Slab2** | slab depth, dip, strike, thickness, uncertainty | GMT `.grd` and `.xyz` per region, contours, clip polygons | 27 regions at 0.05° (3 arcmin) | 140 MB tarball; ~95 KB per regional grid | https://www.sciencebase.gov/catalog/item/5aa1b00ee4b0b1c392e86467 | **lon 0…360**, NaN outside slab, **depth negative down** | 6 arcmin mosaic with fill outside the clip polygons | verified |
| **Vaes 2023 APWP and plate circuit** | poles with P95 per 5 Ma; 1 Ma rotations for 23 plates to South Africa; the full pole database | xlsx, CSV, py | 65 windows; 6,259 rotation rows | small | https://zenodo.org/records/10727855 | south poles in plate 701 frame; negative angle to go to a plate frame | text tables: paleolatitude checks | verified |
| Torsvik 2012 GAPWaP | poles with A95 per 10 Ma in seven frames | xlsx (Zenodo) and printed table (PDF) | 33 windows | small | https://zenodo.org/records/10727855/files/T12_gapwap.xlsx?download=1 ; http://earthdynamics.org/papers-ED/2012/2012-Torsvik-etal-ESR.pdf | south poles | text table | verified |
| GPMDB | 10,421 poles, 55 columns | JSON by API | whole database | 10.3 MB | https://gpmdb.net/api/search?limit=20000 | north poles; filter locally; India under continent "Asia" | text table | verified |
| MagIC | contributions, locations with pole fields, sites with VGPs | REST/JSON, MagIC text | 7,017 contributions | — | https://api.earthref.org/v1/openapi.yaml | Lucene queries | text table; pole query not cracked | partial |
| Weddell Sea magnetic picks | 2,460 picks, 147–167 Ma | ArcGIS and GMT | points | — | PANGAEA DOI 10.1594/PANGAEA.777459 | CC BY 3.0 | point table for an undated basin | verified (page) |
| Maxlow 2001 Table A1.1 | radius against chron age | printed table (PDF) | 11 rows | — | https://ndownloader.figshare.com/files/62348560 | — | the published R(t) as numbers | verified |

**Highest-value reads, in order.** Seton 2020 age misfit and obliquity grids
(a per-cell weight and a measured obliquity distribution for the pair score,
on the pipeline's own graticule); GSFML picks plus the Hellinger archive (the
external conjugate set with per-pick σ); Müller 2019 total stretching factor
with Bradley's dated margins (the un-stretching correction from published
values); Audet & Bürgmann Te (a measured strength field for a third of the
globe, already in the pipeline's row order); GlobSed v2 (a rule for the 2.8%
undated deep water); PB2002 orogens or the Müller deforming networks (a per-face
map of where deformation is allowed).

## What is still missing, and where it would be looked for

By question, sharpest first.

- **Q1.** A per-pick positional error for the whole 101,806-pick compilation
  does not exist; the 18,315-pick Hellinger subset is the only source of σ and
  covers eleven plate-pair studies. A measured fracture-zone azimuth residual
  against spreading direction was never published as a table; the pipeline can
  compute it from the GSFML polylines and the Seton `dir` grid. The full
  Doubrovine 2012 frame and the WK08 rotations sit behind Wiley (403 on every
  route); the GPlates 2.x sample rotation files carry WK08-A embedded and are
  the next place to look.
- **Q2.** Every chron age is on the source's timescale; GTS2020 (Gradstein,
  Ogg, Schmitz & Ogg 2020) needs opening once to convert the M-series ages,
  which can shift by 2–3 Myr. First-marine-incursion and salt ages per margin
  were found only indirectly; DSDP/ODP site reports and the Bradley shapefile's
  basin-initiation bounds are where they would be read. Mueller & Jokat 2019,
  Davis 2016, Storey 1995, Collier 2008 and Wobbe 2012 rest on consistent
  abstract excerpts because Wiley, ScienceDirect, ResearchGate, Springer and
  AWI's repository refused every fetch; a library proxy or the authors' pages
  would settle them.
- **Q3.** Digitised outlines of the Gondwana belts (Mozambique–Maud, Eastern
  Ghats–Rayner, Albany-Fraser–Wilkes, Kaoko–Dom Feliciano) were not found;
  candidates are the CGMW Geological Map of Gondwana, Merdith 2021's GPlates
  static polygons with terrane names, and SCAR GeoMAP for Antarctica. India has
  no rock-based pole between 125 and 210 Ma in GPMDB at Q ≥ 4, so the 170 and
  200 Ma Indian latitudes are plate-circuit values; MagIC might hold newer
  Indian data but its pole query syntax was not cracked. Van Hilten 1963's
  original numbers and Egyed 1960's paper were not opened (Nature and Springer
  landing pages only); a library copy would give the paleoradius section its two
  missing primary readings.
- **Q4.** Carey's own radius-versus-time figures as numbers are in *The
  Expanding Earth* (1976) and *Theories of the Earth and Universe* (1988),
  neither openable here (archive.org lending copy 403, no Google Books
  preview); the HathiTrust search-only copies (record 000721506) would at least
  confirm page numbers. Hilgenberg's 1965 *Geologische Rundschau* series (five
  reconstructions with radii, 4590 km Permian) was read only through Scalera &
  Braun; the journal itself is on Springer. Vogel's own booklet (1984, Z. geol.
  Wiss. 12, 563–573) was not opened. The Sydney 1983 volume exists only as
  front matter on Figshare; the rate-of-expansion papers (Neiman, Talobre,
  Blinov, Stewart) would need a library copy. Bretterbauer 1984's source URL was
  not recorded.
- **Q5.** No publication read states an Australia–North America distance in
  kilometres; the measurable figure is Maxlow's thesis Fig. 2.28 (p. 64) with its
  10,000 km bar, and Owen's Atlas Map 53 at 200 Ma, which was not inspected. The
  Owen Atlas maps themselves (Cambridge 1983) are the one set of dated,
  projected small-Earth maps not looked at; the DVD index at dinox.org lists
  every map with its projection and pole.
- **Q6.** No present-day age grid newer than Seton 2020 exists on EarthByte;
  the meaning of the confidence codes is in the paper (Wiley 403). Merdith 2021
  and Zahirovic paleo-age grids were not located as files. The western Pacific
  back-arc basins and the Levant Basin have no basement age here; the back-arcs
  are mostly dated in the grid already.
- **Q7.** A public Kusznir-group crustal-thickness or β grid does not exist
  (the maps are commercial OCTek products); Bradley's rift-onset ages as a
  table are in the 2008 paper (ScienceDirect 403); Brune 2016's Extended Data
  table of per-rift onset and breakup ages was not reachable.
- **Q8.** Tesauro's rheological Te grids are not offered as files on the GFZ
  page; Lu 2021's Pacific Te grid was not deposited anywhere found; Kalnins &
  Watts 2009 has no readable abstract. There is no age-driven oceanic Te grid,
  and the measurement says there should not be one.
- **Q9.** Per-orogen areas for PB2002 are computed, not tabulated; the GSRM
  v2.1 grid file was not downloaded (GEM's open version needs the download
  button followed).
- **Q10.** Forsyth & Uyeda 1975's torque-balance sentence, the Slab2 dip
  histograms, Turcotte & Schubert's forebulge formulae applied per trench, the
  Kohlstedt 1995 envelope figure, and the ± on Wu 2011's 0.1 mm/yr all sit
  behind hosts that refused the fetch (Wiley, Science, USGS pubs, ADS). No
  Expanding Earth author quantifies a returning sheet; that axis is empty, not
  unread.

Axes that yielded nothing at all: the NCGT Newsletter years before 2013 (not
online); Neal Adams (videos only); Blinov's Russian books (CAPTCHA hosts);
Shields 1979 (no abstract anywhere); Ollier's expanding-Earth papers (not
indexed); Egyed's and van Hilten's originals (landing pages only).
