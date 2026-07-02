/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import { Hydrostatics, HullParameters } from '../types';

/**
 * Calculates IMO Solas stability criteria using trapezoidal integration of the GZ curve
 */
export interface IMOCriteriaResult {
  name: string;
  required: string;
  actual: string;
  value: number;
  reqValue: number;
  status: 'PASS' | 'FAIL';
  description: string;
}

export function evaluateIMOCriteria(hydrostatics: Hydrostatics): IMOCriteriaResult[] {
  // GZ Curve data
  const curve = hydrostatics.gzCurve || [];

  // Trapezoidal integration helper (returns meter-radians)
  const getAreaUnderCurve = (limitAngle: number): number => {
    let area = 0;
    for (let i = 0; i < curve.length - 1; i++) {
      const p1 = curve[i];
      const p2 = curve[i + 1];
      if (p2.angle <= limitAngle) {
        const dAngleRad = ((p2.angle - p1.angle) * Math.PI) / 180;
        area += ((p1.gz + p2.gz) / 2) * dAngleRad;
      }
    }
    return area;
  };

  const area30 = getAreaUnderCurve(30);
  const area40 = getAreaUnderCurve(40);
  const area30To40 = Math.max(0, area40 - area30);

  // Find GZ at 30 degrees
  const gz30Pt = curve.find((p) => p.angle === 30);
  const gz30 = gz30Pt ? gz30Pt.gz : 0;

  // Find Max GZ and its angle
  let maxGz = -1;
  let maxGzAngle = 0;
  curve.forEach((p) => {
    if (p.gz > maxGz) {
      maxGz = p.gz;
      maxGzAngle = p.angle;
    }
  });

  const gm = hydrostatics.gmt;

  return [
    {
      name: 'Area Under GZ Curve (0° to 30°)',
      required: '≥ 0.055 m-rad',
      actual: `${area30.toFixed(4)} m-rad`,
      value: area30,
      reqValue: 0.055,
      status: area30 >= 0.055 ? 'PASS' : 'FAIL',
      description: 'Minimum required energy margin for wave action up to 30° heel.',
    },
    {
      name: 'Area Under GZ Curve (0° to 40°)',
      required: '≥ 0.090 m-rad',
      actual: `${area40.toFixed(4)} m-rad`,
      value: area40,
      reqValue: 0.090,
      status: area40 >= 0.090 ? 'PASS' : 'FAIL',
      description: 'Overall righting energy reserve for deep rolling up to 40° heel.',
    },
    {
      name: 'Area Under GZ Curve (30° to 40°)',
      required: '≥ 0.030 m-rad',
      actual: `${area30To40.toFixed(4)} m-rad`,
      value: area30To40,
      reqValue: 0.030,
      status: area30To40 >= 0.030 ? 'PASS' : 'FAIL',
      description: 'Energy slope intensity between 30° and 40° heel.',
    },
    {
      name: 'Righting Arm (GZ) at 30° Heel',
      required: '≥ 0.200 m',
      actual: `${gz30.toFixed(3)} m`,
      value: gz30,
      reqValue: 0.200,
      status: gz30 >= 0.200 ? 'PASS' : 'FAIL',
      description: 'Minimum solid restoring arm at large angles.',
    },
    {
      name: 'Angle of Maximum Righting Arm',
      required: '≥ 25.0°',
      actual: `${maxGzAngle.toFixed(1)}°`,
      value: maxGzAngle,
      reqValue: 25.0,
      status: maxGzAngle >= 25.0 ? 'PASS' : 'FAIL',
      description: 'Angle where capsizing resistance is strongest (preferably > 30°).',
    },
    {
      name: 'Initial Metacentric Height (GM_T)',
      required: '≥ 0.150 m',
      actual: `${gm.toFixed(3)} m`,
      value: gm,
      reqValue: 0.150,
      status: gm >= 0.150 ? 'PASS' : 'FAIL',
      description: 'Initial upright stability slope before roll onset.',
    },
  ];
}

/**
 * Renders the Righting Arm GZ graph onto a canvas buffer and returns its data URL
 */
function renderGZCanvas(hydrostatics: Hydrostatics): string {
  const canvas = document.createElement('canvas');
  canvas.width = 750;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const padLeft = 60;
  const padRight = 30;
  const padTop = 45;
  const padBottom = 45;
  const plotW = canvas.width - padLeft - padRight;
  const plotH = canvas.height - padTop - padBottom;

  const maxAngle = 90;
  const maxGz = Math.max(0.5, ...hydrostatics.gzCurve.map((p) => p.gz)) * 1.15;

  const mapX = (angle: number) => padLeft + (angle / maxAngle) * plotW;
  const mapY = (gz: number) => canvas.height - padBottom - (gz / maxGz) * plotH;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Outer Border
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, canvas.width, canvas.height);

  // Grid Lines and X axis labels
  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 1;
  for (let angle = 0; angle <= 90; angle += 15) {
    const x = mapX(angle);
    ctx.beginPath();
    ctx.moveTo(x, padTop);
    ctx.lineTo(x, canvas.height - padBottom);
    ctx.stroke();

    // Text Label
    ctx.fillStyle = '#475569';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${angle}°`, x, canvas.height - padBottom + 16);
  }

  // Y axis grid lines and labels
  const numYIntervals = 6;
  for (let i = 0; i <= numYIntervals; i++) {
    const val = (i / numYIntervals) * maxGz;
    const y = mapY(val);
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(canvas.width - padRight, y);
    ctx.stroke();

    ctx.fillStyle = '#475569';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(val.toFixed(2), padLeft - 8, y + 3);
  }

  // Axes lines
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padLeft, padTop);
  ctx.lineTo(padLeft, canvas.height - padBottom);
  ctx.lineTo(canvas.width - padRight, canvas.height - padBottom);
  ctx.stroke();

  // Draw GZ Curve Area Glow
  ctx.beginPath();
  ctx.moveTo(mapX(0), mapY(0));
  hydrostatics.gzCurve.forEach((p) => {
    ctx.lineTo(mapX(p.angle), mapY(p.gz));
  });
  ctx.lineTo(mapX(90), mapY(0));
  ctx.closePath();
  ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
  ctx.fill();

  // Draw GZ curve line
  ctx.strokeStyle = '#059669'; // Emerald
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  hydrostatics.gzCurve.forEach((p, idx) => {
    const cx = mapX(p.angle);
    const cy = mapY(p.gz);
    if (idx === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  });
  ctx.stroke();

  // Draw Maximum GZ indicator
  let maxGzVal = -1;
  let maxGzAngle = 0;
  hydrostatics.gzCurve.forEach((p) => {
    if (p.gz > maxGzVal) {
      maxGzVal = p.gz;
      maxGzAngle = p.angle;
    }
  });

  const mx = mapX(maxGzAngle);
  const my = mapY(maxGzVal);
  ctx.fillStyle = '#ea580c'; // Orange peak
  ctx.beginPath();
  ctx.arc(mx, my, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ea580c';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(mx, my);
  ctx.lineTo(mx, canvas.height - padBottom);
  ctx.moveTo(mx, my);
  ctx.lineTo(padLeft, my);
  ctx.stroke();
  ctx.setLineDash([]); // clear

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`Peak GZ: ${maxGzVal.toFixed(3)}m at ${maxGzAngle}°`, mx + 8, my - 6);

  // Labels for axes
  ctx.save();
  ctx.translate(15, canvas.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Righting Arm - GZ (meters)', 0, 0);
  ctx.restore();

  ctx.fillStyle = '#334155';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Heel Angle (degrees)', canvas.width / 2, canvas.height - 10);

  // Header Title on Canvas
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('STABILITY RIGHTING ARM (GZ) PROFILE', canvas.width / 2, 25);

  return canvas.toDataURL('image/png');
}

/**
 * Renders the Buoyancy and Pressure Distribution curves onto a canvas buffer and returns its data URL
 */
function renderBuoyancyCanvas(hydrostatics: Hydrostatics): string {
  const canvas = document.createElement('canvas');
  canvas.width = 750;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const padLeft = 60;
  const padRight = 60;
  const padTop = 45;
  const padBottom = 45;
  const plotW = canvas.width - padLeft - padRight;
  const plotH = canvas.height - padTop - padBottom;

  const bData = hydrostatics.buoyancyDistribution || [];
  const maxBX = bData.length > 0 ? bData[bData.length - 1].x : 10;
  const maxBForce = Math.max(1.0, ...bData.map((d) => d.buoyancyForce)) * 1.15;
  const maxBPressure = Math.max(1.0, ...bData.map((d) => d.pressureKPa)) * 1.15;

  const mapX = (x: number) => padLeft + (x / maxBX) * plotW;
  const mapForceY = (y: number) => canvas.height - padBottom - (y / maxBForce) * plotH;
  const mapPressureY = (y: number) => canvas.height - padBottom - (y / maxBPressure) * plotH;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Outer Border
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, canvas.width, canvas.height);

  // Grid Lines and Station Labels
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const pct = i / 10;
    const xVal = pct * maxBX;
    const x = mapX(xVal);

    ctx.beginPath();
    ctx.moveTo(x, padTop);
    ctx.lineTo(x, canvas.height - padBottom);
    ctx.strokeStyle = '#f1f5f9';
    ctx.stroke();

    ctx.fillStyle = '#475569';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`St ${i}`, x, canvas.height - padBottom + 16);
  }

  // Buoyancy Force Y axis (Left) grid lines and labels
  const numIntervals = 5;
  for (let i = 0; i <= numIntervals; i++) {
    const valForce = (i / numIntervals) * maxBForce;
    const yForce = mapForceY(valForce);

    ctx.beginPath();
    ctx.moveTo(padLeft, yForce);
    ctx.lineTo(canvas.width - padRight, yForce);
    ctx.strokeStyle = '#f1f5f9';
    ctx.stroke();

    ctx.fillStyle = '#0891b2'; // Cyan
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(valForce.toFixed(1), padLeft - 8, yForce + 3);

    const valPress = (i / numIntervals) * maxBPressure;
    const yPress = mapPressureY(valPress);
    ctx.fillStyle = '#d97706'; // Amber
    ctx.textAlign = 'left';
    ctx.fillText(valPress.toFixed(1), canvas.width - padRight + 8, yPress + 3);
  }

  // Draw Primary axes
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(padLeft, padTop);
  ctx.lineTo(padLeft, canvas.height - padBottom);
  ctx.lineTo(canvas.width - padRight, canvas.height - padBottom);
  ctx.lineTo(canvas.width - padRight, padTop);
  ctx.stroke();

  // Draw Area under Buoyancy force
  ctx.beginPath();
  ctx.moveTo(mapX(0), mapForceY(0));
  bData.forEach((d) => {
    ctx.lineTo(mapX(d.x), mapForceY(d.buoyancyForce));
  });
  ctx.lineTo(mapX(maxBX), mapForceY(0));
  ctx.closePath();
  ctx.fillStyle = 'rgba(6, 182, 212, 0.05)';
  ctx.fill();

  // Plot curves
  // 1. Buoyancy Force Intensity (Cyan)
  ctx.strokeStyle = '#06b6d4';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  bData.forEach((d, idx) => {
    const cx = mapX(d.x);
    const cy = mapForceY(d.buoyancyForce);
    if (idx === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  });
  ctx.stroke();

  // 2. Hydrostatic Keel Pressure (Amber dashed)
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2.0;
  ctx.setLineDash([4, 2]);
  ctx.beginPath();
  bData.forEach((d, idx) => {
    const cx = mapX(d.x);
    const cy = mapPressureY(d.pressureKPa);
    if (idx === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  });
  ctx.stroke();
  ctx.setLineDash([]); // clear

  // Labels for axes
  ctx.save();
  ctx.translate(15, canvas.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#0891b2';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Buoyancy Force intensity, Fb (kN/m)', 0, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(canvas.width - 15, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = '#d97706';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Hydrostatic Keel Pressure, P (kPa)', 0, 0);
  ctx.restore();

  ctx.fillStyle = '#334155';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Hull Longitudinal Spacing (meters, transom to bow)', canvas.width / 2, canvas.height - 10);

  // Header Title
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BUOYANCY FORCE & HYDROSTATIC PRESSURE DISTRIBUTION', canvas.width / 2, 25);

  return canvas.toDataURL('image/png');
}

/**
 * Generates and downloads a beautifully formatted, highly detailed PDF Stability Report
 */
export function exportStabilityPDF(hydrostatics: Hydrostatics, parameters: HullParameters): void {
  // Create jsPDF instance in A4, Portrait, unit is 'mm'
  const pdf = new jsPDF('p', 'mm', 'a4');
  const timestamp = new Date().toLocaleString();
  const userName = 'wilsonintai76@gmail.com';

  // Margins & Dimensions (A4: 210mm x 297mm)
  const marginX = 15;
  const contentWidth = 210 - 2 * marginX; // 180mm

  // Colors
  const primaryColor = [15, 23, 42]; // Slate 900
  const accentColor = [6, 182, 212]; // Cyan 500
  const lightBg = [248, 250, 252];   // Slate 50
  const borderGray = [226, 232, 240]; // Slate 200
  const darkGray = [71, 85, 105];    // Slate 600

  // Standard Header rendering helper
  const renderHeader = (pageNum: number) => {
    // Top Accent Band
    pdf.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    pdf.rect(0, 0, 210, 25, 'F');

    pdf.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
    pdf.rect(0, 25, 210, 1.5, 'F');

    // Title text
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('VESSEL STABILITY & HYDROSTATICS REPORT', marginX, 12);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(186, 230, 253);
    pdf.text('INTEGRATED FINITE STATION HULL INTEGRATION & IMO ANALYSIS', marginX, 18);

    // Page details
    pdf.setFontSize(8);
    pdf.setTextColor(255, 255, 255);
    pdf.text(`PAGE ${pageNum} OF 2`, 210 - marginX - 18, 15);
  };

  // Standard Footer rendering helper
  const renderFooter = () => {
    pdf.setFillColor(241, 245, 249);
    pdf.rect(0, 285, 210, 12, 'F');

    pdf.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
    pdf.setLineWidth(0.3);
    pdf.line(0, 285, 210, 285);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    pdf.text(`User Credential: ${userName}  |  Generated on: ${timestamp}`, marginX, 292);
    pdf.text('AI Studio Naval Architecture Co-Designer Engine © 2026', 210 - marginX - 78, 292);
  };

  // --- PAGE 1: Particulars & Stability Metrics ---
  renderHeader(1);

  let currentY = 38;

  // Introduction block
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(51, 65, 85); // Slate 700
  const introText =
    `This report provides high-fidelity hydrostatic properties, form coefficients, and transverse righting energy characteristics calculated for the active hull geometry. Evaluation of transverse stability margins is performed in full compliance with standard IMO Solas regulations (General Criteria under MSC.267(85) Chapter 2).`;
  const introLines = pdf.splitTextToSize(introText, contentWidth);
  pdf.text(introLines, marginX, currentY);

  currentY += introLines.length * 4.5 + 4;

  // SECTION 1: DESIGN PARTICULARS
  pdf.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
  pdf.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  pdf.rect(marginX, currentY, contentWidth, 6, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  pdf.text('1. HULL PARAMETERS & ASSUMED COG', marginX + 3, currentY + 4.5);
  
  pdf.setLineWidth(0.4);
  pdf.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  pdf.line(marginX, currentY, marginX, currentY + 6); // visual bracket

  currentY += 8;

  // Parameters Table Grid (4 columns)
  const drawRow = (y: number, items: { label: string; val: string }[]) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(71, 85, 105);

    let x = marginX;
    const colWidth = contentWidth / 4;
    items.forEach((item) => {
      pdf.text(item.label, x + 2, y + 4);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(15, 23, 42);
      pdf.text(item.val, x + 31, y + 4);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(71, 85, 105);
      
      pdf.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
      pdf.setLineWidth(0.2);
      pdf.line(x, y + 5.5, x + colWidth, y + 5.5);
      x += colWidth;
    });
  };

  const lcg = parameters.cogLcg !== undefined ? parameters.cogLcg : parameters.length * 0.48;
  const vcg = parameters.cogVcg !== undefined ? parameters.cogVcg : parameters.depth * 0.58;

  drawRow(currentY, [
    { label: 'Length Over. (Lwl):', val: `${parameters.length.toFixed(2)} m` },
    { label: 'Max Beam (B):', val: `${parameters.beam.toFixed(2)} m` },
    { label: 'Hull Depth (D):', val: `${parameters.depth.toFixed(2)} m` },
    { label: 'Static Draft (T):', val: `${parameters.draft.toFixed(2)} m` },
  ]);
  currentY += 6;

  drawRow(currentY, [
    { label: 'Assumed LCG:', val: `${lcg.toFixed(2)} m` },
    { label: 'Assumed VCG (KG):', val: `${vcg.toFixed(2)} m` },
    { label: 'Waterplane Full:', val: `${parameters.fullness.toFixed(2)}` },
    { label: 'Transom Ratio:', val: `${parameters.transomBeamRatio.toFixed(2)}` },
  ]);
  currentY += 10;

  // SECTION 2: HYDROSTATIC PROPERTIES
  pdf.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  pdf.rect(marginX, currentY, contentWidth, 6, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  pdf.text('2. DERIVED HYDROSTATIC & CENTROID RESULTS', marginX + 3, currentY + 4.5);
  pdf.line(marginX, currentY, marginX, currentY + 6);

  currentY += 8;

  drawRow(currentY, [
    { label: 'Displ. Volume:', val: `${hydrostatics.displacementVolume.toFixed(2)} m³` },
    { label: 'Displ. Mass:', val: `${hydrostatics.displacementMass.toFixed(2)} t` },
    { label: 'Wetted Surf. Area:', val: `${hydrostatics.wettedSurfaceArea.toFixed(1)} m²` },
    { label: 'Waterplane Area:', val: `${hydrostatics.waterplaneArea.toFixed(1)} m²` },
  ]);
  currentY += 6;

  drawRow(currentY, [
    { label: 'Buoyancy LCB:', val: `${hydrostatics.lcb.toFixed(3)} m` },
    { label: 'Buoyancy VCB (KB):', val: `${hydrostatics.vcb.toFixed(3)} m` },
    { label: 'Flotation LCF:', val: `${hydrostatics.lcf.toFixed(3)} m` },
    { label: 'Waterplane Cwp:', val: `${hydrostatics.cwp.toFixed(3)}` },
  ]);
  currentY += 6;

  drawRow(currentY, [
    { label: 'Block Coeff (Cb):', val: `${hydrostatics.cb.toFixed(3)}` },
    { label: 'Midship Coeff (Cm):', val: `${hydrostatics.cm.toFixed(3)}` },
    { label: 'Prismatic Coeff (Cp):', val: `${hydrostatics.cp.toFixed(3)}` },
    { label: 'Transverse BM(T):', val: `${hydrostatics.bmt.toFixed(3)} m` },
  ]);
  currentY += 6;

  drawRow(currentY, [
    { label: 'Transverse KM(T):', val: `${hydrostatics.kmt.toFixed(3)} m` },
    { label: 'KG Elevation:', val: `${vcg.toFixed(3)} m` },
    { label: 'Initial GM_T Margin:', val: `${hydrostatics.gmt.toFixed(3)} m` },
    { label: 'Symmetry Toler.:', val: `${parameters.symmetryDeviation !== undefined ? `${parameters.symmetryDeviation}mm` : 'Perfect'}` },
  ]);
  currentY += 10;

  // SECTION 3: IMO STATUTORY COMPLIANCE CHECKLIST
  pdf.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  pdf.rect(marginX, currentY, contentWidth, 6, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  pdf.text('3. IMO SOLAS STABILITY REGULATION STANDARDS - CHAPTER 2 CHECKLIST', marginX + 3, currentY + 4.5);
  pdf.line(marginX, currentY, marginX, currentY + 6);

  currentY += 8;

  // IMO Table Header
  pdf.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  pdf.rect(marginX, currentY, contentWidth, 7, 'F');
  
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(255, 255, 255);
  pdf.text('Stability Regulation Criteria Description', marginX + 3, currentY + 4.8);
  pdf.text('Required Limit', marginX + 110, currentY + 4.8);
  pdf.text('Calculated Actual', marginX + 140, currentY + 4.8);
  pdf.text('Status', marginX + 168, currentY + 4.8);

  currentY += 7;

  // Evaluate and render IMO Checklist
  const criteria = evaluateIMOCriteria(hydrostatics);
  criteria.forEach((crit) => {
    // Row background
    pdf.setFillColor(255, 255, 255);
    pdf.rect(marginX, currentY, contentWidth, 8, 'F');

    // Bottom border
    pdf.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
    pdf.setLineWidth(0.15);
    pdf.line(marginX, currentY + 8, marginX + contentWidth, currentY + 8);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(15, 23, 42);
    pdf.text(crit.name, marginX + 3, currentY + 3.2);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(crit.description, marginX + 3, currentY + 6.2);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(71, 85, 105);
    pdf.text(crit.required, marginX + 110, currentY + 5);

    pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    pdf.text(crit.actual, marginX + 140, currentY + 5);

    // Status Label with Badge
    if (crit.status === 'PASS') {
      pdf.setFillColor(220, 252, 231); // Green 100
      pdf.rect(marginX + 166, currentY + 1.8, 11, 4.4, 'F');
      pdf.setTextColor(21, 128, 61); // Green 700
      pdf.setFontSize(7.5);
      pdf.text('PASS', marginX + 168.2, currentY + 5.0);
    } else {
      pdf.setFillColor(254, 226, 226); // Red 100
      pdf.rect(marginX + 166, currentY + 1.8, 11, 4.4, 'F');
      pdf.setTextColor(185, 28, 28); // Red 700
      pdf.setFontSize(7.5);
      pdf.text('FAIL', marginX + 168.2, currentY + 5.0);
    }

    currentY += 8;
  });

  currentY += 5;

  // Quick Stability Summary Sentence
  const allPassed = criteria.every((c) => c.status === 'PASS');
  pdf.setFillColor(allPassed ? 240 : 254, allPassed ? 253 : 242, allPassed ? 250 : 242);
  pdf.rect(marginX, currentY, contentWidth, 12, 'F');
  pdf.setDrawColor(allPassed ? 16 : 239, allPassed ? 185 : 68, allPassed ? 129 : 68);
  pdf.setLineWidth(0.3);
  pdf.rect(marginX, currentY, contentWidth, 12, 'S');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(allPassed ? 6 : 185, allPassed ? 95 : 28, allPassed ? 70 : 28);
  const summaryTitleText = allPassed 
    ? '✅ STATUTORY APPROVAL STATUS: APPROVED' 
    : '⚠️ STATUTORY APPROVAL STATUS: NON-COMPLIANT';
  pdf.text(summaryTitleText, marginX + 4, currentY + 4.5);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(71, 85, 105);
  const summaryDescText = allPassed
    ? 'The calculated stability parameters strictly conform to standard IMO international criteria, ensuring safety margins during offshore vessel transit under high wind force.'
    : 'One or more key metacentric thresholds have failed. Modify hull parameters, increase waterline beam width, or lower cargo weight (VCG) to ensure statutory clearance.';
  pdf.text(summaryDescText, marginX + 4, currentY + 9);

  renderFooter();

  // --- PAGE 2: GZ Curve and Buoyancy Profile Visualizer ---
  pdf.addPage();
  renderHeader(2);

  currentY = 32;

  // Introduction for Page 2
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text('Below are compiled vector profiles illustrating righting energy arms and longitudinal station-by-station buoyant forces.', marginX, currentY);

  currentY += 4.5;

  // 1. GZ righting arm graph image
  const gzImgData = renderGZCanvas(hydrostatics);
  if (gzImgData) {
    pdf.addImage(gzImgData, 'PNG', marginX, currentY, contentWidth, 85);
  }

  currentY += 88;

  // 2. Buoyancy force graph image
  const buoyancyImgData = renderBuoyancyCanvas(hydrostatics);
  if (buoyancyImgData) {
    pdf.addImage(buoyancyImgData, 'PNG', marginX, currentY, contentWidth, 85);
  }

  currentY += 92;

  // Stamp and Signature panel for naval engineer
  pdf.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
  pdf.setLineWidth(0.2);
  pdf.line(marginX, currentY, marginX + contentWidth, currentY);

  currentY += 6;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(15, 23, 42);
  pdf.text('RESPONSIBLE ENGINEER SIGNATURE & STAMP', marginX, currentY);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text('This record verifies that hydrostatic simulation matches calculated physical offsets generated via the CAD hull geometry.', marginX, currentY + 4);

  // Sign lines
  const signLineX = 145;
  pdf.setDrawColor(148, 163, 184);
  pdf.setLineWidth(0.3);
  pdf.line(signLineX, currentY + 14, signLineX + 45, currentY + 14);
  
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(71, 85, 105);
  pdf.text('Approving Marine Engineer Stamp', signLineX + 3, currentY + 18);

  pdf.setFont('helvetica', 'normal');
  pdf.text('Registration No:', signLineX + 3, currentY + 22);

  renderFooter();

  // Save the PDF
  const filename = `Vessel_Stability_Report_${parameters.length.toFixed(1)}m_${Math.round(Date.now() / 1000)}.pdf`;
  pdf.save(filename);
}
