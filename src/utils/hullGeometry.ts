/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HullParameters, Hydrostatics, ResistanceResult, ResistanceAnalysis } from '../types';

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

// Helper to get deck sheer height
export function getSheer(u: number, sheerBow: number, sheerStern: number): number {
  // u is 0 at stern, 1 at bow
  // Sheer is a quadratic curve peaking at the ends and minimum around midship (u = 0.5)
  return sheerStern * Math.pow(1 - u, 2) + sheerBow * Math.pow(u, 2);
}

// Helper to get local keel height (rises at stem and transom)
export function getKeelHeight(u: number, depth: number): number {
  if (u > 0.9) {
    const t = (u - 0.9) / 0.1; // 0 to 1
    return depth * 0.4 * Math.pow(t, 2); // rises at bow
  }
  if (u < 0.1) {
    const t = (0.1 - u) / 0.1; // 0 to 1
    return depth * 0.1 * Math.pow(t, 2); // slight rise at transom
  }
  return 0;
}

// Helper to get half-beam of waterline at fraction u
export function getWaterlineHalfBeam(u: number, beam: number, transomBeamRatio: number, fullness: number): number {
  const halfBeamMax = beam / 2;
  const transomHalfBeam = halfBeamMax * transomBeamRatio;

  if (u < 0.5) {
    const t = u / 0.5; // 0 to 1
    const s = Math.sin(t * Math.PI / 2); // 0 to 1
    const shape = Math.pow(s, fullness);
    return transomHalfBeam + (halfBeamMax - transomHalfBeam) * shape;
  } else {
    const t = (u - 0.5) / 0.5; // 0 to 1
    const shape = 1 - Math.pow(t, 2 / Math.max(0.1, fullness));
    return halfBeamMax * Math.max(0, shape);
  }
}

// Helper to get half-beam of deck at fraction u
export function getDeckHalfBeam(u: number, beam: number, transomBeamRatio: number, fullness: number): number {
  const deckBeamFactor = 1.05;
  const halfBeamMax = (beam / 2) * deckBeamFactor;
  const transomHalfBeam = halfBeamMax * Math.max(transomBeamRatio * 1.1, 0.35);

  if (u < 0.5) {
    const t = u / 0.5;
    const s = Math.sin(t * Math.PI / 2);
    return transomHalfBeam + (halfBeamMax - transomHalfBeam) * s;
  } else {
    const t = (u - 0.5) / 0.5;
    const shape = 1 - Math.pow(t, 2.5 / Math.max(0.1, fullness));
    return halfBeamMax * Math.max(0, shape);
  }
}

// Generate the points for a single station section
export function getStationPoints(
  u: number,
  params: HullParameters,
  numPoints = 25
): Point3D[] {
  const points: Point3D[] = [];
  
  // NURBS Deform Z affects local keel line
  const deformZ = params.nurbsDeformZ || 0;
  const keelProfileCorrection = deformZ * Math.sin(u * Math.PI) * params.depth * 0.12;
  const zKeel = getKeelHeight(u, params.depth) + keelProfileCorrection;
  
  const zDeck = params.depth + getSheer(u, params.sheerBow, params.sheerStern);
  const bDeck = getDeckHalfBeam(u, params.beam, params.transomBeamRatio, params.fullness);
  const bWl = getWaterlineHalfBeam(u, params.beam, params.transomBeamRatio, params.fullness);
  
  const tLocal = Math.max(0, params.draft - zKeel);
  const dLocal = zDeck - zKeel;

  // Local deadrise angle
  const deadriseRad = (params.deadrise * Math.PI / 180) * Math.cos(u * Math.PI / 2);

  // Local section fullness parameter (p_u)
  let p_u = 2.0;
  if (u < 0.5) {
    const t = u / 0.5; // 0 to 1
    const p_mid = Math.max(1.2, 5.0 - params.bilgeRadius);
    p_u = 2.0 + (p_mid - 2.0) * t;
  } else {
    const t = (u - 0.5) / 0.5; // 0 to 1
    const p_mid = Math.max(1.2, 5.0 - params.bilgeRadius);
    const p_bow = 1.15 + params.deadrise / 45;
    p_u = p_mid + (p_bow - p_mid) * Math.pow(t, 1.3);
  }

  // Bow rake offset
  const bowRakeRad = (params.bowRake * Math.PI / 180);

  // NURBS Chine parameter: shapes the section to look like a hard chine
  const chineFactor = params.nurbsChine || 0;

  for (let i = 0; i <= numPoints; i++) {
    const hFrac = i / numPoints; // 0 to 1
    let z = zKeel + hFrac * dLocal;

    // Rake offset increases with height and is localized to the bow (u > 0.5)
    const rakeOffset = Math.max(0, u - 0.3) * z * Math.tan(bowRakeRad) * Math.pow(u, 2);
    
    // NURBS Deform X adjusts longitudinal morphing
    const deformX = params.nurbsDeformX || 0;
    const longitudinalDeform = deformX * Math.sin(u * Math.PI) * params.length * 0.05;
    let x = u * params.length + rakeOffset + longitudinalDeform;

    let y = 0;
    if (z <= params.draft && tLocal > 0) {
      // Submerged part
      const hSub = (z - zKeel) / tLocal;
      let baseWidth = bWl * Math.pow(hSub, 1 / p_u);
      
      // If hard chine requested, make bilge corner sharp instead of rounded
      if (chineFactor > 0) {
        // Linear bottom from keel to chine (approx at hSub = 0.35, width = bWl * 0.8)
        const chineH = 0.35;
        const chineW = 0.8;
        const chineWidth = hSub < chineH 
          ? (hSub / chineH) * bWl * chineW 
          : bWl * chineW + ((hSub - chineH) / (1 - chineH)) * bWl * (1 - chineW);
        // Interpolate smooth vs hard chine
        baseWidth = baseWidth * (1 - chineFactor) + chineWidth * chineFactor;
      }

      // Bottom flat deadrise limit
      const deadriseLimit = deadriseRad > 0 ? (z - zKeel) / Math.max(0.001, Math.tan(deadriseRad)) : Infinity;
      y = Math.min(baseWidth, deadriseLimit);
    } else {
      // Dry part (between draft and deck)
      const tDry = dLocal > tLocal ? (z - params.draft) / (zDeck - params.draft) : 0;
      // Interpolate with flare coefficient
      const flareFactor = Math.pow(tDry, 1.0 - params.flare / 90);
      y = bWl + (bDeck - bWl) * flareFactor;
    }

    // NURBS Bulbous bow: adds volume low-down at the bow (u > 0.8)
    const bulbFactor = params.nurbsBulb || 0;
    if (bulbFactor > 0 && u > 0.8) {
      const bulbU = Math.sin(((u - 0.8) / 0.2) * Math.PI / 2); // 0 at u=0.8, 1 at bow tip
      const maxSubDepth = params.draft * 0.6;
      if (z < maxSubDepth && z > 0) {
        const bulbZ = Math.sin((z / maxSubDepth) * Math.PI); // sine shape from keel to 60% draft
        // Inflate width
        y += bulbFactor * 0.12 * bulbU * bulbZ * (params.beam * 0.08);
        // Project forward (stretch X)
        x += bulbFactor * 0.25 * bulbU * bulbZ * (params.length * 0.015);
      }
    }

    // NURBS Deform Y applies custom body-bulge / flare scale
    const deformY = params.nurbsDeformY || 0;
    if (deformY !== 0) {
      y *= (1 + deformY * Math.sin(u * Math.PI) * (1 - hFrac * 0.5) * 0.28);
    }

    if (isNaN(y) || y < 0) y = 0;

    points.push({ x, y, z });
  }

  return points;
}

// Generate complete hull mesh structure (grid of stations)
export function generateHullMesh(
  params: HullParameters,
  numStations = 21,
  numPointsPerStation = 25
): Point3D[][] {
  const mesh: Point3D[][] = [];
  for (let s = 0; s < numStations; s++) {
    const u = s / (numStations - 1); // 0 at stern, 1 at bow
    mesh.push(getStationPoints(u, params, numPointsPerStation));
  }
  return mesh;
}

// Real-time hydrostatics calculations
export function calculateHydrostatics(params: HullParameters): Hydrostatics {
  const numStations = 25;
  const numPoints = 30;
  const mesh = generateHullMesh(params, numStations, numPoints);
  
  const dx = params.length / (numStations - 1);
  const saltWaterDensity = 1.025; // tonnes/m^3

  let totalVolume = 0;
  let totalWettedArea = 0;
  let totalWaterplaneArea = 0;
  let longMomentVolume = 0; // for LCB
  let vertMomentVolume = 0; // for VCB
  let longMomentWp = 0;     // for LCF
  let inertiat = 0;         // Transverse waterplane inertia
  let inertial = 0;         // Longitudinal waterplane inertia

  // Submerged cross sectional areas at stations
  const Ax: number[] = [];
  const VCBx: number[] = [];
  const yWl: number[] = []; // Waterline half-breadths at stations
  const stationX: number[] = [];

  for (let s = 0; s < numStations; s++) {
    const u = s / (numStations - 1);
    const stationPoints = mesh[s];
    const x = stationPoints[0].x;
    stationX.push(x);

    // Filter points below or at design draft
    const subPoints = stationPoints.filter(p => p.z <= params.draft);
    
    // Calculate station submerged area and centroid using trapezoidal integration
    let area = 0;
    let vMoment = 0;
    let girth = 0;

    for (let i = 0; i < subPoints.length - 1; i++) {
      const p1 = subPoints[i];
      const p2 = subPoints[i + 1];
      
      const dy = p2.y - p1.y;
      const dz = p2.z - p1.z;
      const segmentGirth = Math.sqrt(dy * dy + dz * dz);
      girth += segmentGirth;

      const segArea = 0.5 * (p1.y + p2.y) * dz;
      area += segArea;

      // Z centroid of the segment
      const segZ = (p1.z + p2.z) / 2;
      vMoment += segArea * segZ;
    }

    // Double for both sides of the hull
    area = area * 2;
    vMoment = vMoment * 2;
    girth = girth * 2;

    Ax.push(area);
    VCBx.push(area > 0 ? vMoment / area : 0);

    // Waterline half-breadth
    const wlHalfBeam = getWaterlineHalfBeam(u, params.beam, params.transomBeamRatio, params.fullness);
    yWl.push(wlHalfBeam);

    // Integrate longitudinal wetted surface area element (girth * dx)
    // Add slightly for longitudinal slope
    let longitudinalSlopeFactor = 1.0;
    if (s > 0 && s < numStations - 1) {
      const prevGirthPoints = mesh[s - 1];
      const nextGirthPoints = mesh[s + 1];
      // compute slope of bilge
      const dy_dx = (nextGirthPoints[Math.floor(numPoints/2)].y - prevGirthPoints[Math.floor(numPoints/2)].y) / (2 * dx);
      longitudinalSlopeFactor = Math.sqrt(1 + dy_dx * dy_dx);
    }
    totalWettedArea += girth * dx * longitudinalSlopeFactor;
  }

  // Simpson's / Trapezoidal integration along length X
  for (let s = 0; s < numStations - 1; s++) {
    const x1 = stationX[s];
    const x2 = stationX[s + 1];
    const segmentDx = x2 - x1;

    const avgArea = 0.5 * (Ax[s] + Ax[s + 1]);
    const volSegment = avgArea * segmentDx;
    totalVolume += volSegment;

    const avgX = 0.5 * (x1 + x2);
    longMomentVolume += volSegment * avgX;

    const avgVCB = 0.5 * (VCBx[s] + VCBx[s + 1]);
    vertMomentVolume += volSegment * avgVCB;

    // Waterplane area integration
    const avgWpHalfBeam = 0.5 * (yWl[s] + yWl[s + 1]);
    const wpSegment = 2 * avgWpHalfBeam * segmentDx;
    totalWaterplaneArea += wpSegment;
    longMomentWp += wpSegment * avgX;
  }

  const lcb = totalVolume > 0 ? longMomentVolume / totalVolume : params.length / 2;
  const vcb = totalVolume > 0 ? vertMomentVolume / totalVolume : params.draft * 0.6;
  const lcf = totalWaterplaneArea > 0 ? longMomentWp / totalWaterplaneArea : params.length / 2;

  // Calculate moments of inertia of the waterplane area
  for (let s = 0; s < numStations - 1; s++) {
    const x1 = stationX[s];
    const x2 = stationX[s + 1];
    const segmentDx = x2 - x1;

    // Transverse Inertia: integral(2/3 * y^3 * dx)
    const yAvg = 0.5 * (yWl[s] + yWl[s + 1]);
    inertiat += (2 / 3) * Math.pow(yAvg, 3) * segmentDx;

    // Longitudinal Inertia: integral(2 * y * (x - LCF)^2 * dx)
    const avgX = 0.5 * (x1 + x2);
    inertial += 2 * yAvg * Math.pow(avgX - lcf, 2) * segmentDx;
  }

  const displacementMass = totalVolume * saltWaterDensity;
  const bmt = totalVolume > 0 ? inertiat / totalVolume : 0;
  const kbt = vcb;
  const kmt = kbt + bmt;

  // Assume Vertical Center of Gravity KG is at 60% of hull depth
  const kg = params.depth * 0.58;
  const gmt = Math.max(0.1, kmt - kg);

  // Hull Coefficients
  // Midship section area is around station 12 (u = 0.5)
  const midshipArea = Ax[Math.floor(numStations / 2)];
  
  const cb = totalVolume > 0 ? totalVolume / (params.length * params.beam * params.draft) : 0;
  const cwp = totalWaterplaneArea > 0 ? totalWaterplaneArea / (params.length * params.beam) : 0;
  const cm = midshipArea > 0 ? midshipArea / (params.beam * params.draft) : 0.8;
  const cp = midshipArea > 0 ? totalVolume / (midshipArea * params.length) : cb / 0.8;

  // Generate a realistic stability GZ curve (GZ = GM * sin(theta) + stability correction)
  // GZ peaks around 42 degrees and declines as deck edge immerses or bilge comes out of water
  const gzCurve: { angle: number; gz: number }[] = [];
  for (let angleDeg = 0; angleDeg <= 90; angleDeg += 5) {
    const theta = angleDeg * Math.PI / 180;
    // Wall-sided formula with a damping term as angle exceeds 35 degrees
    let gz = gmt * Math.sin(theta) + 0.5 * bmt * Math.pow(Math.tan(theta), 2) * Math.sin(theta);
    
    if (angleDeg > 35) {
      const dropFactor = Math.cos((angleDeg - 35) * (Math.PI / 110));
      gz = gz * Math.max(0, dropFactor);
    }
    
    gzCurve.push({ angle: angleDeg, gz: Math.max(0, gz) });
  }

  // Calculate local buoyancy and pressure distribution along length
  const buoyancyDistribution: { x: number; buoyancyForce: number; pressureKPa: number }[] = [];
  for (let s = 0; s < numStations; s++) {
    const u = s / (numStations - 1);
    const x = stationX[s];
    const area = Ax[s];
    const bForce = 1.025 * 9.81 * area; // kN/m buoyancy force intensity
    
    const zKeel = getKeelHeight(u, params.depth) + (params.nurbsDeformZ || 0) * Math.sin(u * Math.PI) * params.depth * 0.12;
    const draftDepth = Math.max(0, params.draft - zKeel);
    const pressureKPa = 1.025 * 9.81 * draftDepth; // Hydrostatic keel pressure in kPa
    
    buoyancyDistribution.push({ x, buoyancyForce: bForce, pressureKPa });
  }

  return {
    displacementVolume: totalVolume,
    displacementMass,
    wettedSurfaceArea: totalWettedArea,
    waterplaneArea: totalWaterplaneArea,
    lcb,
    vcb,
    lcf,
    kbt,
    bmt,
    kmt,
    gmt,
    cb: Math.max(0.3, Math.min(0.9, cb)),
    cp: Math.max(0.4, Math.min(0.95, cp)),
    cm: Math.max(0.5, Math.min(0.99, cm)),
    cwp: Math.max(0.4, Math.min(0.95, cwp)),
    gzCurve,
    buoyancyDistribution
  };
}

// Holtrop-Mennen/ITTC-57 real-time resistance analysis
export function calculateResistance(params: HullParameters, hydro: Hydrostatics): ResistanceAnalysis {
  const curves: ResistanceResult[] = [];
  const g = 9.81;
  const kinematicViscosity = 1.188e-6; // m^2/s for saltwater at 15C
  const density = 1.025; // t/m^3 (1025 kg/m^3)
  
  // Speed range from 1 knot to 30 knots
  for (let speedKn = 1; speedKn <= 30; speedKn += 1) {
    const v = speedKn * 0.514444; // m/s
    const fn = v / Math.sqrt(g * params.length); // Froude Number
    const rn = (v * params.length) / kinematicViscosity; // Reynolds Number

    // Frictional Resistance using ITTC-57
    const cf = 0.075 / Math.pow(Math.log10(rn) - 2, 2);
    const rf = 0.5 * density * 1000 * cf * hydro.wettedSurfaceArea * v * v / 1000; // in kN

    // Wave-making resistance (highly simplified Holtrop-Mennen model)
    // Wave resistance peaks around hull speed (Fn ~ 0.4) and grows exponentially
    let cw = 0.003 * Math.pow(hydro.cb, 1.5);
    if (fn < 0.4) {
      cw = cw * Math.pow(fn / 0.4, 4);
    } else {
      cw = cw * (1 + 1.5 * (fn - 0.4));
    }
    const rw = 0.5 * density * 1000 * cw * Math.pow(hydro.displacementVolume, 2/3) * v * v / 1000; // kN

    // Total Resistance (kN) with small append/correlation allowance
    const ca = 0.0004; // correlation allowance
    const r_corr = 0.5 * density * 1000 * ca * hydro.wettedSurfaceArea * v * v / 1000;
    const rt = rf + rw + r_corr;

    // Effective Power (kW) = Rt * V
    const pe = rt * v;

    curves.push({
      speedKnots: speedKn,
      froudeNumber: fn,
      rf,
      rw,
      rt,
      pe
    });
  }

  // Calculate design speed using standard hull speed formula: V = 1.34 * sqrt(L_wl in feet)
  // or V_knots ~ 2.43 * sqrt(L_wl)
  const hullSpeedKnots = Math.round(2.43 * Math.sqrt(params.length));
  const designSpeedKnots = Math.max(5, Math.min(25, hullSpeedKnots));
  
  const designResult = curves.find(c => c.speedKnots === designSpeedKnots) || curves[12];

  return {
    curves,
    designSpeedKnots,
    designResistanceKn: designResult ? designResult.rt : 0,
    designPowerKw: designResult ? designResult.pe : 0
  };
}

// Export to CAD DXF format (string payload)
export function exportToDXF(params: HullParameters): string {
  const mesh = generateHullMesh(params, 15, 20);
  let dxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nENDSEC\n0\nSECTION\n2\nBLOCKS\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`;

  // Draw hull stations as 3D Polylines
  for (let s = 0; s < mesh.length; s++) {
    const station = mesh[s];
    
    // Port side (Y is negative)
    dxf += `0\nPOLYLINE\n8\nHULL_STATIONS\n66\n1\n70\n8\n`;
    for (let p = 0; p < station.length; p++) {
      const pt = station[p];
      dxf += `0\nVERTEX\n8\nHULL_STATIONS\n10\n${pt.x.toFixed(4)}\n20\n${(-pt.y).toFixed(4)}\n30\n${pt.z.toFixed(4)}\n`;
    }
    dxf += `0\nSEQEND\n`;

    // Starboard side (Y is positive)
    dxf += `0\nPOLYLINE\n8\nHULL_STATIONS\n66\n1\n70\n8\n`;
    for (let p = 0; p < station.length; p++) {
      const pt = station[p];
      dxf += `0\nVERTEX\n8\nHULL_STATIONS\n10\n${pt.x.toFixed(4)}\n20\n${pt.y.toFixed(4)}\n30\n${pt.z.toFixed(4)}\n`;
    }
    dxf += `0\nSEQEND\n`;
  }

  // Draw waterlines
  const numWaterlines = 6;
  for (let wl = 0; wl < numWaterlines; wl++) {
    const wlZ = (params.draft / (numWaterlines - 1)) * wl;
    
    // Port
    dxf += `0\nPOLYLINE\n8\nHULL_WATERLINES\n66\n1\n70\n8\n`;
    for (let s = 0; s < mesh.length; s++) {
      const u = s / (mesh.length - 1);
      const bWl = getWaterlineHalfBeam(u, params.beam, params.transomBeamRatio, params.fullness);
      const x = u * params.length;
      dxf += `0\nVERTEX\n8\nHULL_WATERLINES\n10\n${x.toFixed(4)}\n20\n${(-bWl).toFixed(4)}\n30\n${wlZ.toFixed(4)}\n`;
    }
    dxf += `0\nSEQEND\n`;

    // Starboard
    dxf += `0\nPOLYLINE\n8\nHULL_WATERLINES\n66\n1\n70\n8\n`;
    for (let s = 0; s < mesh.length; s++) {
      const u = s / (mesh.length - 1);
      const bWl = getWaterlineHalfBeam(u, params.beam, params.transomBeamRatio, params.fullness);
      const x = u * params.length;
      dxf += `0\nVERTEX\n8\nHULL_WATERLINES\n10\n${x.toFixed(4)}\n20\n${bWl.toFixed(4)}\n30\n${wlZ.toFixed(4)}\n`;
    }
    dxf += `0\nSEQEND\n`;
  }

  dxf += `0\nENDSEC\n0\nEOF\n`;
  return dxf;
}

// Export to OBJ 3D Mesh format (string payload)
export function exportToOBJ(params: HullParameters): string {
  const mesh = generateHullMesh(params, 21, 20);
  const numStations = mesh.length;
  const numPoints = mesh[0].length;

  let obj = `# NavalArch Parametric Hull Mesh\n# Generated automatically\n\n`;

  // Write vertices
  // Port side
  for (let s = 0; s < numStations; s++) {
    for (let p = 0; p < numPoints; p++) {
      const pt = mesh[s][p];
      obj += `v ${pt.x.toFixed(4)} ${(-pt.y).toFixed(4)} ${pt.z.toFixed(4)}\n`;
    }
  }
  // Starboard side
  for (let s = 0; s < numStations; s++) {
    for (let p = 0; p < numPoints; p++) {
      const pt = mesh[s][p];
      obj += `v ${pt.x.toFixed(4)} ${pt.y.toFixed(4)} ${pt.z.toFixed(4)}\n`;
    }
  }

  // Write faces
  const offset = numStations * numPoints; // Starboard offset

  // Port faces
  obj += `\ng Port_Hull\n`;
  for (let s = 0; s < numStations - 1; s++) {
    for (let p = 0; p < numPoints - 1; p++) {
      const v1 = s * numPoints + p + 1;
      const v2 = s * numPoints + (p + 1) + 1;
      const v3 = (s + 1) * numPoints + (p + 1) + 1;
      const v4 = (s + 1) * numPoints + p + 1;
      // Triangle 1
      obj += `f ${v1} ${v2} ${v3}\n`;
      // Triangle 2
      obj += `f ${v1} ${v3} ${v4}\n`;
    }
  }

  // Starboard faces (reversed winding for correct normals)
  obj += `\ng Starboard_Hull\n`;
  for (let s = 0; s < numStations - 1; s++) {
    for (let p = 0; p < numPoints - 1; p++) {
      const v1 = offset + s * numPoints + p + 1;
      const v2 = offset + s * numPoints + (p + 1) + 1;
      const v3 = offset + (s + 1) * numPoints + (p + 1) + 1;
      const v4 = offset + (s + 1) * numPoints + p + 1;
      // Triangle 1
      obj += `f ${v1} ${v3} ${v2}\n`;
      // Triangle 2
      obj += `f ${v1} ${v4} ${v3}\n`;
    }
  }

  return obj;
}

// Export Station Offset Table (CSV payload)
export function exportOffsetTable(params: HullParameters): string {
  const mesh = generateHullMesh(params, 11, 10);
  let csv = `Station,X Coordinate (m),Heel Keel Height (m),Waterline Half-Beam (m),Deck Half-Beam (m),Deck Height (m)\n`;

  for (let s = 0; s < mesh.length; s++) {
    const u = s / (mesh.length - 1);
    const station = mesh[s];
    const x = station[0].x;
    const zKeel = getKeelHeight(u, params.depth);
    const zDeck = params.depth + getSheer(u, params.sheerBow, params.sheerStern);
    const bWl = getWaterlineHalfBeam(u, params.beam, params.transomBeamRatio, params.fullness);
    const bDeck = getDeckHalfBeam(u, params.beam, params.transomBeamRatio, params.fullness);

    csv += `${s},${x.toFixed(3)},${zKeel.toFixed(3)},${bWl.toFixed(3)},${bDeck.toFixed(3)},${zDeck.toFixed(3)}\n`;
  }

  return csv;
}

export interface CFDResult {
  waveElevations: { x: number; z: number }[];
  pressures: { x: number; z: number; pressureKpa: number }[];
  liftKn: number;
  trimDeg: number;
  dragKn: { friction: number; wave: number; viscous: number; total: number };
  detailLevels: string[];
}

export function calculateSimplifiedCFD(
  params: HullParameters,
  hydro: Hydrostatics,
  speedKnots = 15,
  detail: 'low' | 'medium' | 'high' = 'medium'
): CFDResult {
  // Speed in m/s
  const V = speedKnots * 0.5144;
  const g = 9.81;
  const Fn = V / Math.sqrt(g * params.length);

  // Density of water (saltwater = 1025 kg/m^3)
  const rho = 1.025; 

  // 1. Calculate drag components
  // Frictional Drag (ITTC'57 formula approximation)
  const kinematicViscosity = 1.188e-6; // m^2/s at 15 deg C saltwater
  const Re = (V * params.length) / kinematicViscosity;
  const Cf = 0.075 / Math.pow(Math.log10(Re) - 2, 2);
  const frictionDragKn = 0.5 * rho * Cf * hydro.wettedSurfaceArea * V * V;

  // Wave drag coefficient - highly non-linear with Froude number
  let Cw = 0;
  if (Fn > 0.05) {
    const humpFactor = Math.exp(-Math.pow(Fn - 0.42, 2) / 0.015);
    Cw = 0.0012 * Math.pow(hydro.cb, 1.8) * humpFactor + 0.0006 * Math.pow(Fn, 1.5);
  }
  const waveDragKn = 0.5 * rho * Cw * Math.pow(params.beam, 1.5) * V * V;

  // Viscous pressure drag
  const formFactor = 0.12 + 0.11 * params.transomBeamRatio + 0.08 * hydro.cp;
  const viscousDragKn = formFactor * frictionDragKn;

  const totalDragKn = frictionDragKn + waveDragKn + viscousDragKn;

  // 2. Dynamic Trim and Lift
  const deadriseRad = (params.deadrise * Math.PI) / 180;
  const liftSlope = 0.04 * (1 - Math.sin(deadriseRad));
  const trimDeg = Math.min(6.5, Fn * 8 * (1 - hydro.cb * 0.4) + (params.nurbsDeformZ || 0) * 1.5);
  const liftKn = 0.5 * rho * liftSlope * (trimDeg * Math.PI / 180) * (params.length * params.beam) * V * V * 0.005;

  // 3. Wave profile elevations along the hull
  const numWavePoints = detail === 'high' ? 40 : detail === 'medium' ? 25 : 15;
  const waveElevations: { x: number; z: number }[] = [];
  const bowWaveFactor = 0.28 * Math.pow(Fn, 1.2) * (1 + (params.nurbsBulb || 0) * 0.05);
  
  for (let idx = 0; idx <= numWavePoints; idx++) {
    const fraction = idx / numWavePoints;
    const x = fraction * params.length;
    // Wave profile along length
    const waveZ = params.draft + bowWaveFactor * Math.sin(fraction * Math.PI * 3.5 - Fn * Math.PI) * Math.cos(fraction * Math.PI) * params.draft * 0.5;
    waveElevations.push({ x, z: Math.max(0, waveZ) });
  }

  // 4. Pressure distribution along stations
  const pressures: { x: number; z: number; pressureKpa: number }[] = [];
  const numPressurePoints = detail === 'high' ? 30 : detail === 'medium' ? 18 : 10;
  for (let s = 0; s <= numPressurePoints; s++) {
    const u = s / numPressurePoints;
    const x = u * params.length;
    const stagnationFactor = Math.max(0, Math.sin((u - 0.4) * Math.PI / 1.2));
    const dynPressureKpa = 0.5 * rho * V * V * 0.01 * (u > 0.8 ? 1.5 * stagnationFactor : 0.4 * (1 - stagnationFactor));
    const hydroStaticPressureKpa = rho * g * params.draft * 0.5;
    
    pressures.push({
      x,
      z: params.draft * 0.4,
      pressureKpa: Math.max(0.1, hydroStaticPressureKpa + dynPressureKpa)
    });
  }

  return {
    waveElevations,
    pressures,
    liftKn: Math.max(0, liftKn),
    trimDeg: Math.max(0, trimDeg),
    dragKn: {
      friction: Math.max(0.1, frictionDragKn),
      wave: Math.max(0.1, waveDragKn),
      viscous: Math.max(0.1, viscousDragKn),
      total: Math.max(0.3, totalDragKn)
    },
    detailLevels: ['Low (Grid 15x10)', 'Medium (Grid 25x18)', 'High (Grid 40x30)']
  };
}
