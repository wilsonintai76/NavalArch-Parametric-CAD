/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from 'react';
import { HullParameters } from '../types';
import { 
  generateHullMesh, 
  getSheer, 
  getKeelHeight, 
  getWaterlineHalfBeam, 
  getDeckHalfBeam, 
  Point3D,
  calculateHydrostatics,
  calculateSimplifiedCFD,
  getStationPoints
} from '../utils/hullGeometry';
import { Maximize2, Minimize2, Move, Rotate3d, Compass, Eye, Scissors, Wind, RefreshCw, Layers, Scale, Waves, Activity } from 'lucide-react';

const MATERIALS: Record<string, { name: string; yield: number; density: number; modulus: number }> = {
  steel: { name: 'Mild Steel A36', yield: 250, density: 7850, modulus: 200 },
  highsteel: { name: 'High-Tensile AH36', yield: 355, density: 7850, modulus: 210 },
  aluminum: { name: 'Marine Al 5083', yield: 145, density: 2660, modulus: 70 },
  composite: { name: 'Carbon Fiber / Epoxy', yield: 450, density: 1600, modulus: 135 }
};

const LOAD_CASES: Record<string, { name: string; bendingFactor: number; pressureFactor: number; slammingFactor: number }> = {
  stillwater: { name: 'Still Water Sagging', bendingFactor: 1.0, pressureFactor: 1.0, slammingFactor: 0.1 },
  hogging: { name: 'Peak Wave Hogging', bendingFactor: 2.4, pressureFactor: 1.1, slammingFactor: 0.4 },
  sagging: { name: 'Peak Wave Sagging', bendingFactor: 2.1, pressureFactor: 1.2, slammingFactor: 0.3 },
  slamming: { name: 'Dynamic Head Seas Bow Slamming', bendingFactor: 1.6, pressureFactor: 1.0, slammingFactor: 2.5 }
};

interface ViewportsContainerProps {
  parameters: HullParameters;
  onParameterChange: (params: Partial<HullParameters>) => void;
  collaborators?: { name: string; color: string; activePanel: string }[];
}

export default function ViewportsContainer({
  parameters,
  onParameterChange,
  collaborators = []
}: ViewportsContainerProps) {
  const [activeViewport, setActiveViewport] = useState<'all' | '3d' | 'plan' | 'profile' | 'body'>('all');

  // Multi-Mode Visualization States
  const [visMode, setVisMode] = useState<'shaded' | 'wireframe' | 'slicing' | 'flow' | 'buoyancy' | 'stress'>('shaded');
  const [buoyancyDensity, setBuoyancyDensity] = useState<number>(1025);
  const [buoyancyScale, setBuoyancyScale] = useState<'pressure' | 'force'>('pressure');
  const [slicePlane, setSlicePlane] = useState<'X' | 'Y' | 'Z'>('X');
  const [slicePosition, setSlicePosition] = useState<number>(50); // 0 to 100%
  const [cfdSpeedKnots, setCfdSpeedKnots] = useState<number>(18);
  const [cfdDetail, setCfdDetail] = useState<'low' | 'medium' | 'high'>('medium');

  const [stressMaterial, setStressMaterial] = useState<'steel' | 'highsteel' | 'aluminum' | 'composite'>('steel');
  const [stressLoadCase, setStressLoadCase] = useState<'stillwater' | 'hogging' | 'sagging' | 'slamming'>('hogging');

  // Animation frame hook for dynamic particle flow simulations
  const [animationFrame, setAnimationFrame] = useState(0);
  useEffect(() => {
    let frameId: number;
    const tick = () => {
      setAnimationFrame(prev => prev + 1);
      frameId = requestAnimationFrame(tick);
    };
    if (visMode === 'flow') {
      frameId = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(frameId);
  }, [visMode]);

  // 3D Viewport navigation states
  const [pitch, setPitch] = useState<number>(-0.4); // radians
  const [yaw, setYaw] = useState<number>(0.65);    // radians
  const [zoom, setZoom] = useState<number>(1.2);
  const [isDragging3D, setIsDragging3D] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Mesh data
  const mesh = generateHullMesh(parameters, 15, 20);

  // References to canvas elements
  const canvas3D = useRef<HTMLCanvasElement>(null);
  const canvasPlan = useRef<HTMLCanvasElement>(null);
  const canvasProfile = useRef<HTMLCanvasElement>(null);
  const canvasBody = useRef<HTMLCanvasElement>(null);

  // Dragging interaction states for 2D plans
  const [activeHandle, setActiveHandle] = useState<{ view: string; id: string } | null>(null);

  // 3D Mouse Event Handlers
  const handleMouseDown3D = (e: React.MouseEvent) => {
    setIsDragging3D(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove3D = (e: React.MouseEvent) => {
    if (!isDragging3D) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setYaw(prev => prev + dx * 0.007);
    setPitch(prev => Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, prev - dy * 0.007)));
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp3D = () => {
    setIsDragging3D(false);
  };

  const handleWheel3D = (e: React.WheelEvent) => {
    setZoom(prev => Math.max(0.4, Math.min(3.0, prev - e.deltaY * 0.001)));
  };

  // Redraw canvases when parameters or view configurations change
  useEffect(() => {
    drawAllViewports();
  }, [
    parameters, 
    pitch, 
    yaw, 
    zoom, 
    activeViewport, 
    visMode, 
    slicePlane, 
    slicePosition, 
    cfdSpeedKnots, 
    cfdDetail, 
    animationFrame,
    buoyancyDensity,
    buoyancyScale,
    stressMaterial,
    stressLoadCase
  ]);

  const drawAllViewports = () => {
    if (activeViewport === 'all' || activeViewport === '3d') draw3D();
    if (activeViewport === 'all' || activeViewport === 'plan') drawPlan();
    if (activeViewport === 'all' || activeViewport === 'profile') drawProfile();
    if (activeViewport === 'all' || activeViewport === 'body') drawBody();
  };

  // --- RENDERING 3D PERSPECTIVE ---
  const draw3D = () => {
    const canvas = canvas3D.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Responsive sizing
    const rect = canvas.parentElement?.getBoundingClientRect();
    canvas.width = rect?.width || 500;
    canvas.height = rect?.height || 350;

    const width = canvas.width;
    const height = canvas.height;

    // Clear background
    ctx.fillStyle = '#161920'; // Geometric Balance Panel Background
    ctx.fillRect(0, 0, width, height);

    // Draw Grid Floor
    ctx.strokeStyle = '#1C2029';
    ctx.lineWidth = 1;
    const gridScale = 50 * zoom;
    for (let x = -width; x < width * 2; x += gridScale) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = -height; y < height * 2; y += gridScale) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 3D Projection Pipeline
    const cx = width / 2;
    const cy = height * 0.6;
    const scale = Math.min(width, height) * 0.05 * zoom;
    const dVal = 100; // viewing distance

    const project = (pt: Point3D) => {
      // Shift origin to vessel center of gravity
      const xShift = pt.x - parameters.length / 2;
      const yShift = pt.y;
      const zShift = pt.z - parameters.depth / 2;

      // Rotation around Z (Yaw)
      const x1 = xShift * Math.cos(yaw) - yShift * Math.sin(yaw);
      const y1 = xShift * Math.sin(yaw) + yShift * Math.cos(yaw);

      // Rotation around X (Pitch)
      const z2 = zShift * Math.cos(pitch) - y1 * Math.sin(pitch);
      const y2 = zShift * Math.sin(pitch) + y1 * Math.cos(pitch);

      // Perspective projection
      const dist = y2 + dVal;
      const sx = cx + (x1 / dist) * scale * 100;
      const sy = cy - (z2 / dist) * scale * 100;

      return { x: sx, y: sy, z: z2, d: dist };
    };

    // Draw Coordinate Axes
    const axesLength = parameters.length * 0.7;
    const axisO = project({ x: 0, y: 0, z: 0 });
    const axisX = project({ x: axesLength, y: 0, z: 0 });
    const axisY = project({ x: 0, y: parameters.beam, z: 0 });
    const axisZ = project({ x: 0, y: 0, z: parameters.depth });

    // X Axis (Longitudinal - Red)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(axisO.x, axisO.y);
    ctx.lineTo(axisX.x, axisX.y);
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.fillText('X (L)', axisX.x + 5, axisX.y);

    // Y Axis (Transverse - Green)
    ctx.strokeStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(axisO.x, axisO.y);
    ctx.lineTo(axisY.x, axisY.y);
    ctx.stroke();
    ctx.fillStyle = '#22c55e';
    ctx.fillText('Y (B)', axisY.x + 5, axisY.y);

    // Z Axis (Vertical - Blue)
    ctx.strokeStyle = '#3b82f6';
    ctx.beginPath();
    ctx.moveTo(axisO.x, axisO.y);
    ctx.lineTo(axisZ.x, axisZ.y);
    ctx.stroke();
    ctx.fillStyle = '#3b82f6';
    ctx.fillText('Z (D)', axisZ.x + 5, axisZ.y);

    // Helper function for panel stress calculation
    const getPanelStress = (avgX: number, avgY: number, avgZ: number, uVal: number) => {
      const material = MATERIALS[stressMaterial] || MATERIALS.steel;
      const loadCase = LOAD_CASES[stressLoadCase] || LOAD_CASES.hogging;
      
      const xNorm = avgX / parameters.length; // 0 (stern) to 1 (bow)

      // 1. Longitudinal Bending Stress (MPa)
      const momentShape = Math.sin(Math.PI * xNorm);
      const slenderness = parameters.length / parameters.depth;
      const bendingStressBase = Math.pow(slenderness / 10, 1.8) * 85.0 * loadCase.bendingFactor;
      
      const neutralAxisZ = parameters.depth * 0.45;
      const zDistanceNormalized = Math.abs(avgZ - neutralAxisZ) / (parameters.depth * 0.55);
      
      const longitudinalStress = bendingStressBase * momentShape * zDistanceNormalized * (parameters.draft / 4.0);

      // 2. Hydrostatic local panel stress (MPa)
      const pressureHead = Math.max(0, parameters.draft - avgZ);
      const hydrostaticStress = pressureHead * 14.5 * loadCase.pressureFactor * Math.sin(Math.PI * xNorm);

      // 3. Dynamic Wave Slamming / Bow Impact Stress (MPa)
      const bowFactor = Math.max(0, (xNorm - 0.7) / 0.3);
      const flareRad = (parameters.flare * Math.PI) / 180;
      const speedSq = Math.pow(cfdSpeedKnots, 1.8);
      
      const slammingStress = bowFactor * Math.sin(flareRad) * speedSq * 0.15 * loadCase.slammingFactor * (1.0 - Math.abs(avgZ - parameters.draft) / parameters.depth);

      // 4. Stress Concentration
      let scf = 1.0;
      if (parameters.nurbsDeformX !== undefined) scf += Math.abs(parameters.nurbsDeformX) * 0.35;
      if (parameters.nurbsDeformY !== undefined) scf += Math.abs(parameters.nurbsDeformY) * 0.35;
      if (parameters.nurbsDeformZ !== undefined) {
        const isKeelRegion = avgZ < parameters.depth * 0.2;
        scf += Math.abs(parameters.nurbsDeformZ) * (isKeelRegion ? 0.6 : 0.2);
      }
      if (parameters.nurbsBulb !== undefined && parameters.nurbsBulb > 4) {
        const inBulbZone = Math.abs(xNorm - 0.88) < 0.1;
        if (inBulbZone) scf += (parameters.nurbsBulb - 4) * 0.12;
      }

      const vonMises = Math.sqrt(
        longitudinalStress * longitudinalStress +
        hydrostaticStress * hydrostaticStress +
        slammingStress * slammingStress
      ) * scf;

      return {
        total: Math.max(1.0, vonMises),
        longitudinal: longitudinalStress,
        hydrostatic: hydrostaticStress,
        slamming: slammingStress
      };
    };

    const getStressColor = (ratio: number) => {
      const r = Math.max(0, Math.min(1.2, ratio));
      let red = 0, green = 0, blue = 0;
      if (r < 0.25) {
        const f = r / 0.25;
        red = 0;
        green = Math.floor(255 * f);
        blue = 255;
      } else if (r < 0.5) {
        const f = (r - 0.25) / 0.25;
        red = 0;
        green = 255;
        blue = Math.floor(255 * (1 - f));
      } else if (r < 0.75) {
        const f = (r - 0.5) / 0.25;
        red = Math.floor(255 * f);
        green = 255;
        blue = 0;
      } else if (r < 1.0) {
        const f = (r - 0.75) / 0.25;
        red = 255;
        green = Math.floor(255 * (1 - f));
        blue = 0;
      } else {
        const f = Math.min(1.0, (r - 1.0) / 0.2);
        red = Math.floor(255 - 105 * f);
        green = 0;
        blue = Math.floor(150 * f);
      }
      return `rgba(${red}, ${green}, ${blue}, 0.85)`;
    };

    let maxStressVal = 0;

    // Render Submerged Shaded Hull Panels (with depth sorting for basic rendering)
    const panels: { v1: any, v2: any, v3: any, v4: any, avgDepth: number, isSubmerged: boolean, u: number, avgX: number, avgY: number, avgZ: number, normalZ: number }[] = [];
    const numStations = mesh.length;
    const numPoints = mesh[0].length;

    for (let s = 0; s < numStations - 1; s++) {
      const u = s / (numStations - 1);
      for (let p = 0; p < numPoints - 1; p++) {
        const pt1 = mesh[s][p];
        const pt2 = mesh[s][p + 1];
        const pt3 = mesh[s + 1][p + 1];
        const pt4 = mesh[s + 1][p];

        const avgX = (pt1.x + pt2.x + pt3.x + pt4.x) / 4;
        const avgY = (pt1.y + pt2.y + pt3.y + pt4.y) / 4;
        const avgZ = (pt1.z + pt2.z + pt3.z + pt4.z) / 4;

        // Calculate normal vector vertical component (for buoyancy)
        const dx_p = pt2.x - pt1.x;
        const dy_p = pt2.y - pt1.y;
        const dz_p = pt2.z - pt1.z;
        const qx_p = pt4.x - pt1.x;
        const qy_p = pt4.y - pt1.y;
        const qz_p = pt4.z - pt1.z;
        const nx = dy_p * qz_p - dz_p * qy_p;
        const ny = dz_p * qx_p - dx_p * qz_p;
        const nz = dx_p * qy_p - dy_p * qx_p;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        const normalZ = len > 0 ? Math.abs(nz / len) : 0;

        // Starboard Side Panel
        const p1 = project(pt1);
        const p2 = project(pt2);
        const p3 = project(pt3);
        const p4 = project(pt4);

        const avgDepth = (p1.d + p2.d + p3.d + p4.d) / 4;
        const isSubmerged = pt1.z <= parameters.draft;

        panels.push({ v1: p1, v2: p2, v3: p3, v4: p4, avgDepth, isSubmerged, u, avgX, avgY, avgZ, normalZ });

        // Port Side Panel (Mirror Y)
        const p1p = project({ ...pt1, y: -pt1.y });
        const p2p = project({ ...pt2, y: -pt2.y });
        const p3p = project({ ...pt3, y: -pt3.y });
        const p4p = project({ ...pt4, y: -pt4.y });

        panels.push({ v1: p1p, v2: p2p, v3: p3p, v4: p4p, avgDepth, isSubmerged, u, avgX, avgY: -avgY, avgZ, normalZ });
      }
    }

    // Depth sort panels (back to front)
    panels.sort((a, b) => b.avgDepth - a.avgDepth);

    // Draw panels based on selected visualization mode
    panels.forEach(p => {
      ctx.beginPath();
      ctx.moveTo(p.v1.x, p.v1.y);
      ctx.lineTo(p.v2.x, p.v2.y);
      ctx.lineTo(p.v3.x, p.v3.y);
      ctx.lineTo(p.v4.x, p.v4.y);
      ctx.closePath();

      // Check current visual mode
      if (visMode === 'stress') {
        const stress = getPanelStress(p.avgX ?? 0, p.avgY ?? 0, p.avgZ ?? 0, p.u);
        if (stress.total > maxStressVal) {
          maxStressVal = stress.total;
        }
        const yieldStrength = MATERIALS[stressMaterial]?.yield || 250;
        const ratio = stress.total / yieldStrength;
        ctx.fillStyle = getStressColor(ratio);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 0.4;
        ctx.stroke();
      } else if (visMode === 'wireframe') {
        // Wireframe: no fill, only clear outlines
        ctx.strokeStyle = p.isSubmerged ? '#0e7490' : '#475569';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      } else if (visMode === 'slicing') {
        // Slicing: translucent glass-like hull panels
        ctx.fillStyle = 'rgba(71, 85, 105, 0.12)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      } else if (visMode === 'flow') {
        // Flow: Colored pressure contour heat map
        // Bow (u near 1.0) gets high stagnation pressure (Red), Midship gets low pressure (Blue/Cyan), Stern recovers
        const u = p.u;
        let fillCol = 'rgb(14, 116, 144)';
        if (u > 0.8) {
          // Bow stagnation zone (red to yellow gradient)
          const factor = (u - 0.8) / 0.2;
          fillCol = `rgb(${Math.floor(220 + 35 * factor)}, ${Math.floor(40 + 150 * (1 - factor))}, 30)`;
        } else if (u > 0.45) {
          // Transition zone (cyan to green)
          const factor = (u - 0.45) / 0.35;
          fillCol = `rgb(${Math.floor(34 * (1 - factor))}, ${Math.floor(190 + 20 * factor)}, ${Math.floor(210 - 50 * factor)})`;
        } else {
          // Midship/Aft suction and wake recovery zone (blue/indigo)
          const factor = u / 0.45;
          fillCol = `rgb(${Math.floor(15 + 40 * factor)}, ${Math.floor(30 + 100 * factor)}, ${Math.floor(180 + 50 * (1 - factor))})`;
        }
        ctx.fillStyle = fillCol;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 0.4;
        ctx.stroke();
      } else if (visMode === 'buoyancy') {
        // Buoyancy / Pressure heatmap
        if (!p.isSubmerged) {
          // Above waterline: neutral, slightly translucent dark color
          ctx.fillStyle = 'rgba(71, 85, 105, 0.15)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
          ctx.lineWidth = 0.4;
          ctx.stroke();
        } else {
          // Under waterline
          const draft = parameters.draft;
          const zDepth = Math.max(0, draft - p.avgZ);
          
          // Hydrostatic pressure in kPa: P = rho * g * h / 1000
          const density = buoyancyDensity || 1025;
          const pressureKPa = (density * 9.81 * zDepth) / 1000;
          
          // Buoyant force contribution: pressure * normalZ
          const buoyancyVal = pressureKPa * (p.normalZ || 0);
          
          // Normalize for color mapping
          // Max draft pressure
          const maxZDepth = draft;
          const maxPressureKPa = (density * 9.81 * maxZDepth) / 1000;
          
          let ratio = 0;
          if (buoyancyScale === 'pressure') {
            ratio = maxPressureKPa > 0 ? pressureKPa / maxPressureKPa : 0;
          } else {
            // buoyancy force (max buoyancy at vertical normal is max pressure)
            ratio = maxPressureKPa > 0 ? buoyancyVal / maxPressureKPa : 0;
          }
          
          // Clamp ratio between 0 and 1
          ratio = Math.max(0, Math.min(1, ratio));
          
          // Color map: Rainbow or Thermal (Blue -> Cyan -> Green -> Yellow -> Red)
          let r = 0, g_col = 0, b = 0;
          if (ratio < 0.25) {
            // Blue to Cyan
            const f = ratio / 0.25;
            r = 0;
            g_col = Math.floor(180 * f);
            b = 255;
          } else if (ratio < 0.5) {
            // Cyan to Green
            const f = (ratio - 0.25) / 0.25;
            r = 0;
            g_col = 255;
            b = Math.floor(255 * (1 - f));
          } else if (ratio < 0.75) {
            // Green to Yellow
            const f = (ratio - 0.5) / 0.25;
            r = Math.floor(255 * f);
            g_col = 255;
            b = 0;
          } else {
            // Yellow to Red
            const f = (ratio - 0.75) / 0.25;
            r = 255;
            g_col = Math.floor(255 * (1 - f));
            b = 0;
          }
          
          ctx.fillStyle = `rgba(${r}, ${g_col}, ${b}, 0.85)`;
          ctx.fill();
          
          // Subtle wireframe outlines for panels
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
          ctx.lineWidth = 0.4;
          ctx.stroke();
        }
      } else {
        // Standard shaded rendering with ambient lighting calculation
        const baseCol = p.isSubmerged ? [14, 116, 144] : [71, 85, 105]; // teal vs slate
        const brightness = Math.max(0.4, Math.min(1.0, 1.2 - (p.avgDepth - dVal) / 200));
        ctx.fillStyle = `rgba(${Math.floor(baseCol[0] * brightness)}, ${Math.floor(baseCol[1] * brightness)}, ${Math.floor(baseCol[2] * brightness)}, 0.85)`;
        ctx.fill();

        // Mesh Wireframe lines
        ctx.strokeStyle = p.isSubmerged ? '#0e7490' : '#475569';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    });

    // Draw Buoyancy Heatmap color legend
    if (visMode === 'buoyancy') {
      const density = buoyancyDensity || 1025;
      const maxPressureKPa = (density * 9.81 * parameters.draft) / 1000;
      
      const legendX = 25;
      const legendY = height - 130;
      const legendWidth = 15;
      const legendHeight = 85;
      
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(buoyancyScale === 'pressure' ? 'HYDROSTATIC PRESSURE' : 'LOCAL BUOYANT FORCE', legendX, legendY - 18);
      ctx.fillText(buoyancyScale === 'pressure' ? 'Depth Pressure (kPa)' : 'Upward Vector Lift (kN/m²)', legendX, legendY - 8);
      
      const grad = ctx.createLinearGradient(0, legendY + legendHeight, 0, legendY);
      grad.addColorStop(0, 'rgb(0, 0, 255)');       // 0%
      grad.addColorStop(0.25, 'rgb(0, 180, 255)');  // 25%
      grad.addColorStop(0.5, 'rgb(0, 255, 0)');     // 50%
      grad.addColorStop(0.75, 'rgb(255, 255, 0)');   // 75%
      grad.addColorStop(1, 'rgb(255, 0, 0)');       // 100%
      
      ctx.fillStyle = grad;
      ctx.fillRect(legendX, legendY, legendWidth, legendHeight);
      
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1;
      ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);
      
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      
      ctx.fillText(`${maxPressureKPa.toFixed(1)} kPa`, legendX + legendWidth + 8, legendY + 7);
      ctx.fillText(`${(maxPressureKPa / 2).toFixed(1)} kPa`, legendX + legendWidth + 8, legendY + legendHeight / 2 + 3);
      ctx.fillText(`0.0 kPa`, legendX + legendWidth + 8, legendY + legendHeight - 1);
    }

    if (visMode === 'stress') {
      const yieldStrength = MATERIALS[stressMaterial]?.yield || 250;
      
      const legendX = 25;
      const legendY = height - 130;
      const legendWidth = 15;
      const legendHeight = 85;
      
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('VON MISES EQUIVALENT STRESS', legendX, legendY - 18);
      ctx.fillText(`${MATERIALS[stressMaterial]?.name || 'Mild Steel'} (Yield: ${yieldStrength} MPa)`, legendX, legendY - 8);
      
      const grad = ctx.createLinearGradient(0, legendY + legendHeight, 0, legendY);
      grad.addColorStop(0, 'rgb(0, 0, 255)');       // 0%
      grad.addColorStop(0.21, 'rgb(0, 255, 255)');  // 25%
      grad.addColorStop(0.42, 'rgb(0, 255, 0)');     // 50%
      grad.addColorStop(0.63, 'rgb(255, 255, 0)');   // 75%
      grad.addColorStop(0.84, 'rgb(255, 0, 0)');     // 100%
      grad.addColorStop(1.0, 'rgb(150, 0, 150)');   // 120%+
      
      ctx.fillStyle = grad;
      ctx.fillRect(legendX, legendY, legendWidth, legendHeight);
      
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1;
      ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);
      
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      
      ctx.fillText(`${(yieldStrength * 1.2).toFixed(0)} MPa`, legendX + legendWidth + 8, legendY + 7);
      ctx.fillText(`${yieldStrength.toFixed(0)} MPa (Yield)`, legendX + legendWidth + 8, legendY + legendHeight * 0.16 + 3);
      ctx.fillText(`${(yieldStrength * 0.75).toFixed(0)} MPa`, legendX + legendWidth + 8, legendY + legendHeight * 0.37 + 3);
      ctx.fillText(`${(yieldStrength * 0.5).toFixed(0)} MPa`, legendX + legendWidth + 8, legendY + legendHeight * 0.58 + 3);
      ctx.fillText(`${(yieldStrength * 0.25).toFixed(0)} MPa`, legendX + legendWidth + 8, legendY + legendHeight * 0.79 + 3);
      ctx.fillText(`0.0 MPa`, legendX + legendWidth + 8, legendY + legendHeight - 1);

      // HUD overlay inside canvas
      const safetyFactor = maxStressVal > 0 ? yieldStrength / maxStressVal : 10;
      
      const hudX = width - 240;
      const hudY = 15;
      const hudW = 225;
      const hudH = 110;
      
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(hudX, hudY, hudW, hudH);
      ctx.strokeStyle = safetyFactor < 1.0 ? '#ef4444' : safetyFactor < 1.5 ? '#eab308' : '#1e293b';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(hudX, hudY, hudW, hudH);
      
      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('STRUCTURAL STRESS ANALYZER (FEA)', hudX + 12, hudY + 18);
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hudX + 12, hudY + 24);
      ctx.lineTo(hudX + hudW - 12, hudY + 24);
      ctx.stroke();
      
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px monospace';
      ctx.fillText('PEAK VON MISES:', hudX + 12, hudY + 38);
      ctx.fillStyle = maxStressVal > yieldStrength ? '#f87171' : maxStressVal > yieldStrength * 0.75 ? '#facc15' : '#38bdf8';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`${maxStressVal.toFixed(1)} MPa`, hudX + 120, hudY + 38);
      
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px monospace';
      ctx.fillText('SAFETY FACTOR:', hudX + 12, hudY + 53);
      ctx.fillStyle = safetyFactor < 1.0 ? '#f87171' : safetyFactor < 1.5 ? '#facc15' : '#34d399';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`${safetyFactor.toFixed(2)}x`, hudX + 120, hudY + 53);
      
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px monospace';
      ctx.fillText('MATERIAL:', hudX + 12, hudY + 68);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '9px monospace';
      ctx.fillText(MATERIALS[stressMaterial]?.name || 'Steel', hudX + 120, hudY + 68);
      
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px monospace';
      ctx.fillText('LOAD CASE:', hudX + 12, hudY + 83);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '9px monospace';
      ctx.fillText(LOAD_CASES[stressLoadCase]?.name || 'Hogging', hudX + 120, hudY + 83);
      
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px monospace';
      ctx.fillText('INTEGRITY:', hudX + 12, hudY + 98);
      if (safetyFactor < 1.0) {
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText('❌ COLLAPSE RISK - REDESIGN HULL', hudX + 120, hudY + 98);
      } else if (safetyFactor < 1.5) {
        ctx.fillStyle = '#eab308';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText('⚠️ MARGINAL - ENHANCE DECK/KEEL', hudX + 120, hudY + 98);
      } else {
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText('✅ SAFE STRUCTURAL MARGIN', hudX + 120, hudY + 98);
      }
    }

    // Draw Waterline Plane Overlay (Design Draft)
    if (visMode !== 'slicing') {
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)'; // Cyan waterline
      ctx.lineWidth = 1.0;
      for (let s = 0; s < numStations - 1; s++) {
        const u1 = s / (numStations - 1);
        const u2 = (s + 1) / (numStations - 1);
        const wlY1 = getWaterlineHalfBeam(u1, parameters.beam, parameters.transomBeamRatio, parameters.fullness);
        const wlY2 = getWaterlineHalfBeam(u2, parameters.beam, parameters.transomBeamRatio, parameters.fullness);

        // Starboard waterline line
        const ptStar1 = project({ x: u1 * parameters.length, y: wlY1, z: parameters.draft });
        const ptStar2 = project({ x: u2 * parameters.length, y: wlY2, z: parameters.draft });
        ctx.beginPath();
        ctx.moveTo(ptStar1.x, ptStar1.y);
        ctx.lineTo(ptStar2.x, ptStar2.y);
        ctx.stroke();

        // Port waterline line
        const ptPort1 = project({ x: u1 * parameters.length, y: -wlY1, z: parameters.draft });
        const ptPort2 = project({ x: u2 * parameters.length, y: -wlY2, z: parameters.draft });
        ctx.beginPath();
        ctx.moveTo(ptPort1.x, ptPort1.y);
        ctx.lineTo(ptPort2.x, ptPort2.y);
        ctx.stroke();
      }
    }

    // --- Dynamic Cross-Section Slicing Plane ---
    if (visMode === 'slicing') {
      if (slicePlane === 'X') {
        const uCut = slicePosition / 100;
        const cutPoints = getStationPoints(uCut, parameters, 40);
        ctx.beginPath();
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#22d3ee'; // Neon Cyan
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 10;
        
        // Starboard half
        cutPoints.forEach((pt, idx) => {
          const proj = project(pt);
          if (idx === 0) ctx.moveTo(proj.x, proj.y);
          else ctx.lineTo(proj.x, proj.y);
        });
        // Port half
        for (let idx = cutPoints.length - 1; idx >= 0; idx--) {
          const pt = cutPoints[idx];
          const proj = project({ ...pt, y: -pt.y });
          ctx.lineTo(proj.x, proj.y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.shadowBlur = 0; // reset
        
        // Draw cutting plane grid visualizer
        const projGridTop = project({ x: uCut * parameters.length, y: parameters.beam * 0.8, z: parameters.depth * 1.2 });
        const projGridBottom = project({ x: uCut * parameters.length, y: -parameters.beam * 0.8, z: -parameters.depth * 0.2 });
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(projGridBottom.x, projGridTop.y, Math.abs(projGridTop.x - projGridBottom.x) || 100, Math.abs(projGridBottom.y - projGridTop.y) || 100);
      } else if (slicePlane === 'Z') {
        const zCut = (slicePosition / 100) * parameters.depth;
        ctx.beginPath();
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#a855f7'; // Neon Purple
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 10;
        
        // Starboard
        for (let s = 0; s < numStations; s++) {
          const u = s / (numStations - 1);
          const station = mesh[s];
          let yVal = 0;
          for (let p = 0; p < station.length - 1; p++) {
            const p1 = station[p];
            const p2 = station[p + 1];
            if ((p1.z <= zCut && p2.z >= zCut) || (p1.z >= zCut && p2.z <= zCut)) {
              const frac = (zCut - p1.z) / (p2.z - p1.z || 1);
              yVal = p1.y + frac * (p2.y - p1.y);
              break;
            }
          }
          const proj = project({ x: u * parameters.length, y: yVal, z: zCut });
          if (s === 0) ctx.moveTo(proj.x, proj.y);
          else ctx.lineTo(proj.x, proj.y);
        }
        // Port
        for (let s = numStations - 1; s >= 0; s--) {
          const u = s / (numStations - 1);
          const station = mesh[s];
          let yVal = 0;
          for (let p = 0; p < station.length - 1; p++) {
            const p1 = station[p];
            const p2 = station[p + 1];
            if ((p1.z <= zCut && p2.z >= zCut) || (p1.z >= zCut && p2.z <= zCut)) {
              const frac = (zCut - p1.z) / (p2.z - p1.z || 1);
              yVal = p1.y + frac * (p2.y - p1.y);
              break;
            }
          }
          const proj = project({ x: u * parameters.length, y: -yVal, z: zCut });
          ctx.lineTo(proj.x, proj.y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (slicePlane === 'Y') {
        const yCut = (slicePosition / 100) * (parameters.beam * 0.5);
        
        // Starboard Buttock Cut
        ctx.beginPath();
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#f43f5e'; // Neon Rose
        ctx.shadowColor = '#f43f5e';
        ctx.shadowBlur = 10;
        for (let s = 0; s < numStations; s++) {
          const u = s / (numStations - 1);
          const station = mesh[s];
          let zVal = getKeelHeight(u, parameters.depth);
          for (let p = 0; p < station.length - 1; p++) {
            const p1 = station[p];
            const p2 = station[p + 1];
            if ((p1.y <= yCut && p2.y >= yCut) || (p1.y >= yCut && p2.y <= yCut)) {
              const frac = (yCut - p1.y) / (p2.y - p1.y || 1);
              zVal = p1.z + frac * (p2.z - p1.z);
              break;
            }
          }
          const proj = project({ x: u * parameters.length, y: yCut, z: zVal });
          if (s === 0) ctx.moveTo(proj.x, proj.y);
          else ctx.lineTo(proj.x, proj.y);
        }
        ctx.stroke();

        // Port Buttock Cut
        ctx.beginPath();
        for (let s = 0; s < numStations; s++) {
          const u = s / (numStations - 1);
          const station = mesh[s];
          let zVal = getKeelHeight(u, parameters.depth);
          for (let p = 0; p < station.length - 1; p++) {
            const p1 = station[p];
            const p2 = station[p + 1];
            if ((p1.y <= yCut && p2.y >= yCut) || (p1.y >= yCut && p2.y <= yCut)) {
              const frac = (yCut - p1.y) / (p2.y - p1.y || 1);
              zVal = p1.z + frac * (p2.z - p1.z);
              break;
            }
          }
          const proj = project({ x: u * parameters.length, y: -yCut, z: zVal });
          if (s === 0) ctx.moveTo(proj.x, proj.y);
          else ctx.lineTo(proj.x, proj.y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    // --- CFD Flow Streamlines Mode ---
    if (visMode === 'flow') {
      ctx.lineWidth = 1.8;
      const phase = (Date.now() * 0.002) % 1.0; // flow particles move backwards
      
      // Draw 5 levels of surface flow streamlines
      [0.2, 0.4, 0.6, 0.8].forEach((fracZ, lineIdx) => {
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)'; // translucent blue-cyan lines
        
        // Trace streamline points
        const streamPoints: Point3D[] = [];
        for (let s = 0; s < numStations; s++) {
          const u = s / (numStations - 1);
          const station = mesh[s];
          const pt = station[Math.floor(fracZ * (station.length - 1))];
          streamPoints.push(pt);
        }
        
        // Draw Starboard Line
        ctx.beginPath();
        streamPoints.forEach((pt, s) => {
          const proj = project(pt);
          if (s === 0) ctx.moveTo(proj.x, proj.y);
          else ctx.lineTo(proj.x, proj.y);
        });
        ctx.stroke();

        // Draw Port Line
        ctx.beginPath();
        streamPoints.forEach((pt, s) => {
          const proj = project({ ...pt, y: -pt.y });
          if (s === 0) ctx.moveTo(proj.x, proj.y);
          else ctx.lineTo(proj.x, proj.y);
        });
        ctx.stroke();

        // Draw animated particles flowing along stream paths
        const numParticles = 4;
        for (let p = 0; p < numParticles; p++) {
          const progress = (phase + p / numParticles) % 1.0;
          const stationIndex = Math.floor((1 - progress) * (numStations - 1));
          const pt = streamPoints[Math.max(0, Math.min(numStations - 1, stationIndex))];
          
          // Starboard particle
          const projStar = project(pt);
          ctx.fillStyle = '#22d3ee';
          ctx.beginPath();
          ctx.arc(projStar.x, projStar.y, 3, 0, Math.PI * 2);
          ctx.fill();

          // Port particle
          const projPort = project({ ...pt, y: -pt.y });
          ctx.fillStyle = '#22d3ee';
          ctx.beginPath();
          ctx.arc(projPort.x, projPort.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // --- Advanced Stability & Hydrostatics Overlay (Translucent Waterplane Area, KB, KG, Metacenter) ---
    const hydro = calculateHydrostatics(parameters);

    // 1. Draw Translucent Waterplane Area Surface
    ctx.fillStyle = 'rgba(6, 182, 212, 0.16)'; // translucent cyan
    ctx.beginPath();
    for (let s = 0; s < numStations; s++) {
      const u = s / (numStations - 1);
      const wlY = getWaterlineHalfBeam(u, parameters.beam, parameters.transomBeamRatio, parameters.fullness);
      const proj = project({ x: u * parameters.length, y: wlY, z: parameters.draft });
      if (s === 0) ctx.moveTo(proj.x, proj.y);
      else ctx.lineTo(proj.x, proj.y);
    }
    for (let s = numStations - 1; s >= 0; s--) {
      const u = s / (numStations - 1);
      const wlY = getWaterlineHalfBeam(u, parameters.beam, parameters.transomBeamRatio, parameters.fullness);
      const proj = project({ x: u * parameters.length, y: -wlY, z: parameters.draft });
      ctx.lineTo(proj.x, proj.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 2. Compute Hydrostatic Center of Buoyancy (B), Center of Gravity (G), Metacenter (M)
    const ptCoB = { x: hydro.lcb, y: 0, z: hydro.vcb };
    const ptCoG = { x: parameters.length * 0.48, y: 0, z: parameters.depth * 0.58 };
    const ptMeta = { x: hydro.lcb, y: 0, z: hydro.vcb + hydro.bmt };

    const projB = project(ptCoB);
    const projG = project(ptCoG);
    const projM = project(ptMeta);

    // Connection Metacentric axis line (Buoyancy to Metacenter)
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)'; // emerald line
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(projB.x, projB.y);
    ctx.lineTo(projM.x, projM.y);
    ctx.stroke();

    // Draw CoB target (Green)
    ctx.fillStyle = '#10b981';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(projB.x, projB.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px monospace';
    ctx.fillText('B (CoB)', projB.x + 8, projB.y + 3);

    // Draw CoG target (Red)
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(projG.x, projG.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillText('G (CoG)', projG.x + 8, projG.y + 3);

    // Draw Metacenter target (Amber)
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(projM.x, projM.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillText('M (Meta)', projM.x + 8, projM.y + 3);

    // Compass Overlay & Active Users indicators
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px font-mono, ui-monospace, monospace';
    ctx.fillText(`YAW: ${(yaw * 180 / Math.PI).toFixed(0)}° | PITCH: ${(pitch * 180 / Math.PI).toFixed(0)}°`, 15, 25);
    ctx.fillText(`ZOOM: ${zoom.toFixed(1)}x`, 15, 40);
    ctx.fillText(`MODE: ${visMode.toUpperCase()}`, 15, 55);

    // Collaboration Indicators
    const workingOn3D = collaborators.filter(c => c.activePanel === '3d');
    if (workingOn3D.length > 0) {
      workingOn3D.forEach((c, idx) => {
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.arc(width - 25, 25 + idx * 15, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '10px sans-serif';
        ctx.fillText(c.name, width - 110, 28 + idx * 15);
      });
    }
  };

  // --- RENDERING PLAN VIEW (TOP) ---
  const drawPlan = () => {
    const canvas = canvasPlan.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    canvas.width = rect?.width || 500;
    canvas.height = rect?.height || 220;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#161920';
    ctx.fillRect(0, 0, width, height);

    // Transformation scales
    const pad = 30;
    const scX = (width - 2 * pad) / parameters.length;
    const scY = (height - 2 * pad) / (parameters.beam * 1.2);

    const mapX = (x: number) => pad + x * scX;
    const mapY = (y: number) => height / 2 + y * scY;

    // Draw Grid Lines
    ctx.strokeStyle = '#1C2029';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= parameters.length; x += parameters.length / 10) {
      ctx.beginPath();
      ctx.moveTo(mapX(x), 0);
      ctx.lineTo(mapX(x), height);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, mapY(0));
    ctx.lineTo(width, mapY(0));
    ctx.stroke();

    // 1. Draw Waterline half-breadth (Cyan)
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mapX(0), mapY(0));
    for (let x = 0; x <= parameters.length; x += 0.5) {
      const u = x / parameters.length;
      const bWl = getWaterlineHalfBeam(u, parameters.beam, parameters.transomBeamRatio, parameters.fullness);
      ctx.lineTo(mapX(x), mapY(bWl));
    }
    // Port side (mirror)
    for (let x = parameters.length; x >= 0; x -= 0.5) {
      const u = x / parameters.length;
      const bWl = getWaterlineHalfBeam(u, parameters.beam, parameters.transomBeamRatio, parameters.fullness);
      ctx.lineTo(mapX(x), mapY(-bWl));
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(6, 182, 212, 0.1)';
    ctx.fill();
    ctx.stroke();

    // 2. Draw Deck lines (White)
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mapX(0), mapY(getDeckHalfBeam(0, parameters.beam, parameters.transomBeamRatio, parameters.fullness)));
    for (let x = 0; x <= parameters.length; x += 0.5) {
      const u = x / parameters.length;
      const bDeck = getDeckHalfBeam(u, parameters.beam, parameters.transomBeamRatio, parameters.fullness);
      ctx.lineTo(mapX(x), mapY(bDeck));
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(mapX(0), mapY(-getDeckHalfBeam(0, parameters.beam, parameters.transomBeamRatio, parameters.fullness)));
    for (let x = 0; x <= parameters.length; x += 0.5) {
      const u = x / parameters.length;
      const bDeck = getDeckHalfBeam(u, parameters.beam, parameters.transomBeamRatio, parameters.fullness);
      ctx.lineTo(mapX(x), mapY(-bDeck));
    }
    ctx.stroke();

    // Draw Parametric Handles / Control Points for Interactive Dragging
    const handleBeamX = parameters.length * 0.5; // Midship beam handle
    const handleBeamY = parameters.beam / 2;
    const handleTransomY = (parameters.beam / 2) * parameters.transomBeamRatio;

    const handles = [
      { id: 'beam', x: mapX(handleBeamX), y: mapY(handleBeamY), label: 'Max Beam' },
      { id: 'transom', x: mapX(0), y: mapY(handleTransomY), label: 'Transom' },
      { id: 'length', x: mapX(parameters.length), y: mapY(0), label: 'Bow (L)' }
    ];

    handles.forEach(h => {
      ctx.fillStyle = '#f59e0b'; // Amber handles
      ctx.beginPath();
      ctx.arc(h.x, h.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px font-sans';
      ctx.fillText(h.label, h.x - 20, h.y - 10);
    });

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '12px font-sans, system-ui';
    ctx.fillText('PLAN VIEW (WATERLINES / DECK)', 15, 20);
  };

  // --- RENDERING PROFILE VIEW (SIDE) ---
  const drawProfile = () => {
    const canvas = canvasProfile.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    canvas.width = rect?.width || 500;
    canvas.height = rect?.height || 220;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#161920';
    ctx.fillRect(0, 0, width, height);

    // Transformation scales
    const pad = 30;
    const scX = (width - 2 * pad) / parameters.length;
    // vertical depth and sheers
    const maxZ = parameters.depth + Math.max(parameters.sheerBow, parameters.sheerStern) * 1.5;
    const scZ = (height - 2 * pad) / maxZ;

    const mapX = (x: number) => pad + x * scX;
    const mapZ = (z: number) => height - pad - z * scZ;

    // Draw Grid lines
    ctx.strokeStyle = '#1C2029';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= parameters.length; x += parameters.length / 10) {
      ctx.beginPath();
      ctx.moveTo(mapX(x), 0);
      ctx.lineTo(mapX(x), height);
      ctx.stroke();
    }
    for (let z = 0; z <= maxZ; z += parameters.depth / 4) {
      ctx.beginPath();
      ctx.moveTo(0, mapZ(z));
      ctx.lineTo(width, mapZ(z));
      ctx.stroke();
    }

    // 1. Draw Submerged Section (Teal shaded)
    ctx.fillStyle = 'rgba(14, 116, 144, 0.15)';
    ctx.beginPath();
    ctx.moveTo(mapX(0), mapZ(parameters.draft)); // Waterline start
    for (let x = 0; x <= parameters.length; x += 0.5) {
      const u = x / parameters.length;
      const zk = getKeelHeight(u, parameters.depth);
      ctx.lineTo(mapX(x), mapZ(Math.min(parameters.draft, zk)));
    }
    ctx.lineTo(mapX(parameters.length), mapZ(parameters.draft));
    ctx.closePath();
    ctx.fill();

    // 2. Draw Keel Profile Line (Yellow/Orange)
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let x = 0; x <= parameters.length; x += 0.5) {
      const u = x / parameters.length;
      const zk = getKeelHeight(u, parameters.depth);
      ctx.lineTo(mapX(x), mapZ(zk));
    }
    ctx.stroke();

    // 3. Draw Sheer Deck Line (White)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= parameters.length; x += 0.5) {
      const u = x / parameters.length;
      const deckZ = parameters.depth + getSheer(u, parameters.sheerBow, parameters.sheerStern);
      ctx.lineTo(mapX(x), mapZ(deckZ));
    }
    ctx.stroke();

    // 4. Draw Design Waterline (Blue dashed)
    ctx.strokeStyle = '#06b6d4';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mapX(0), mapZ(parameters.draft));
    ctx.lineTo(mapX(parameters.length), mapZ(parameters.draft));
    ctx.stroke();
    ctx.setLineDash([]); // Reset

    // 5. Raked Bow stem line drawing
    const bowRakeRad = (parameters.bowRake * Math.PI / 180);
    const bowDeckZ = parameters.depth + parameters.sheerBow;
    const bowXAtDeck = parameters.length + bowDeckZ * Math.tan(bowRakeRad);
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(mapX(parameters.length), mapZ(getKeelHeight(1.0, parameters.depth)));
    ctx.lineTo(mapX(bowXAtDeck), mapZ(bowDeckZ));
    ctx.stroke();

    // Draw Parametric Handles / Control Points
    const handles = [
      { id: 'draft', x: mapX(parameters.length * 0.5), y: mapZ(0), label: 'Draft (T)' },
      { id: 'sheerStern', x: mapX(0), y: mapZ(parameters.depth + parameters.sheerStern), label: 'Sheer Stern' },
      { id: 'sheerBow', x: mapX(bowXAtDeck), y: mapZ(bowDeckZ), label: 'Sheer Bow / Rake' },
      { id: 'depth', x: mapX(parameters.length * 0.5), y: mapZ(parameters.depth), label: 'Depth (D)' }
    ];

    handles.forEach(h => {
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(h.x, h.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px font-sans';
      ctx.fillText(h.label, h.x + 10, h.y + 4);
    });

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '12px font-sans, system-ui';
    ctx.fillText('PROFILE VIEW (SIDE / SHEER / KEEL)', 15, 20);
  };

  // --- RENDERING BODY PLAN VIEW (FRONT/STATIONS) ---
  const drawBody = () => {
    const canvas = canvasBody.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    canvas.width = rect?.width || 500;
    canvas.height = rect?.height || 220;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#161920';
    ctx.fillRect(0, 0, width, height);

    // Scaling
    const pad = 25;
    const scX = (width - 2 * pad) / (parameters.beam * 1.3);
    const scZ = (height - 2 * pad) / (parameters.depth * 1.4);

    const mapY = (y: number) => width / 2 + y * scX;
    const mapZ = (z: number) => height - pad - z * scZ;

    // Draw grid & Centerline
    ctx.strokeStyle = '#1C2029';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();

    for (let z = 0; z <= parameters.depth * 1.3; z += parameters.depth / 4) {
      ctx.beginPath();
      ctx.moveTo(0, mapZ(z));
      ctx.lineTo(width, mapZ(z));
      ctx.stroke();
    }

    // Draw waterlines grid lines
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, mapZ(parameters.draft));
    ctx.lineTo(width, mapZ(parameters.draft));
    ctx.stroke();
    ctx.setLineDash([]); // Reset

    // Render stations
    // Standard Body Plan: Aft stations (0 to 0.5L) on Left, Forward stations (0.5L to L) on Right
    mesh.forEach((station, sIdx) => {
      const u = sIdx / (mesh.length - 1);
      const isForward = u >= 0.5;

      ctx.beginPath();
      station.forEach((pt, pIdx) => {
        // Draw to left for aft, right for forward
        const yCoord = isForward ? pt.y : -pt.y;
        if (pIdx === 0) {
          ctx.moveTo(mapY(yCoord), mapZ(pt.z));
        } else {
          ctx.lineTo(mapY(yCoord), mapZ(pt.z));
        }
      });

      // Highlight Midship and Ends
      if (sIdx === 0 || sIdx === mesh.length - 1) {
        ctx.strokeStyle = '#f87171'; // Red for transom / bow tip
        ctx.lineWidth = 1.5;
      } else if (Math.abs(u - 0.5) < 0.05) {
        ctx.strokeStyle = '#f59e0b'; // Amber midship
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = isForward ? '#38bdf8' : '#818cf8'; // Forward vs Aft stations
        ctx.lineWidth = 1;
      }
      ctx.stroke();
    });

    // Draw Bilge Radius Handles
    // Draw on the midship station (around 50% length)
    const midIdx = Math.floor(mesh.length / 2);
    const midStation = mesh[midIdx];
    const bilgePoint = midStation[Math.floor(midStation.length * 0.25)]; // approximate bilge point

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(mapY(bilgePoint.y), mapZ(bilgePoint.z), 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px font-sans';
    ctx.fillText('Bilge Control', mapY(bilgePoint.y) + 10, mapZ(bilgePoint.z) - 5);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '12px font-sans, system-ui';
    ctx.fillText('BODY PLAN (TRANSVERSE STATIONS)', 15, 20);
    ctx.font = '10px font-mono';
    ctx.fillText('LEFT: AFT STATIONS | RIGHT: FWD STATIONS', 15, 35);
  };

  // Click & Drag parameter editing logic on canvases
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>, view: string) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (view === 'plan') {
      const scX = (canvas.width - 60) / parameters.length;
      const scY = (canvas.height - 60) / (parameters.beam * 1.2);
      const mapX = (val: number) => 30 + val * scX;
      const mapY = (val: number) => canvas.height / 2 + val * scY;

      // Check handles
      const handleBeamX = mapX(parameters.length * 0.5);
      const handleBeamY = mapY(parameters.beam / 2);
      const handleTransomY = mapY((parameters.beam / 2) * parameters.transomBeamRatio);
      const handleLengthX = mapX(parameters.length);

      if (Math.hypot(x - handleBeamX, y - handleBeamY) < 12) {
        setActiveHandle({ view: 'plan', id: 'beam' });
      } else if (Math.hypot(x - mapX(0), y - handleTransomY) < 12) {
        setActiveHandle({ view: 'plan', id: 'transom' });
      } else if (Math.hypot(x - handleLengthX, y - mapY(0)) < 12) {
        setActiveHandle({ view: 'plan', id: 'length' });
      }
    } else if (view === 'profile') {
      const maxZ = parameters.depth + Math.max(parameters.sheerBow, parameters.sheerStern) * 1.5;
      const scX = (canvas.width - 60) / parameters.length;
      const scZ = (canvas.height - 60) / maxZ;

      const mapX = (val: number) => 30 + val * scX;
      const mapZ = (val: number) => canvas.height - 30 - val * scZ;

      const bowRakeRad = (parameters.bowRake * Math.PI / 180);
      const bowDeckZ = parameters.depth + parameters.sheerBow;
      const bowXAtDeck = parameters.length + bowDeckZ * Math.tan(bowRakeRad);

      const handleDraftY = mapZ(0);
      const handleDraftX = mapX(parameters.length * 0.5);
      const handleSheerStern = mapZ(parameters.depth + parameters.sheerStern);
      const handleSheerBow = mapZ(bowDeckZ);
      const handleDepth = mapZ(parameters.depth);

      if (Math.hypot(x - handleDraftX, y - handleDraftY) < 12) {
        setActiveHandle({ view: 'profile', id: 'draft' });
      } else if (Math.hypot(x - mapX(0), y - handleSheerStern) < 12) {
        setActiveHandle({ view: 'profile', id: 'sheerStern' });
      } else if (Math.hypot(x - mapX(bowXAtDeck), y - handleSheerBow) < 12) {
        setActiveHandle({ view: 'profile', id: 'sheerBow' });
      } else if (Math.hypot(x - handleDraftX, y - handleDepth) < 12) {
        setActiveHandle({ view: 'profile', id: 'depth' });
      }
    } else if (view === 'body') {
      const scX = (canvas.width - 50) / (parameters.beam * 1.3);
      const scZ = (canvas.height - 50) / (parameters.depth * 1.4);
      const mapY = (val: number) => canvas.width / 2 + val * scX;
      const mapZ = (val: number) => canvas.height - 25 - val * scZ;

      const midIdx = Math.floor(mesh.length / 2);
      const midStation = mesh[midIdx];
      const bilgePoint = midStation[Math.floor(midStation.length * 0.25)];

      const handleX = mapY(bilgePoint.y);
      const handleY = mapZ(bilgePoint.z);

      if (Math.hypot(x - handleX, y - handleY) < 12) {
        setActiveHandle({ view: 'body', id: 'bilge' });
      }
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activeHandle) return;
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeHandle.view === 'plan') {
      const scX = (canvas.width - 60) / parameters.length;
      const scY = (canvas.height - 60) / (parameters.beam * 1.2);

      if (activeHandle.id === 'beam') {
        const halfBeam = (y - canvas.height / 2) / scY;
        onParameterChange({ beam: Math.max(2, Math.min(35, halfBeam * 2)) });
      } else if (activeHandle.id === 'transom') {
        const halfTransomY = (y - canvas.height / 2) / scY;
        const beamFraction = halfTransomY / (parameters.beam / 2);
        onParameterChange({ transomBeamRatio: Math.max(0.05, Math.min(1.0, beamFraction)) });
      } else if (activeHandle.id === 'length') {
        const length = (x - 30) / scX;
        onParameterChange({ length: Math.max(10, Math.min(180, length)) });
      }
    } else if (activeHandle.view === 'profile') {
      const maxZ = parameters.depth + Math.max(parameters.sheerBow, parameters.sheerStern) * 1.5;
      const scX = (canvas.width - 60) / parameters.length;
      const scZ = (canvas.height - 60) / maxZ;

      if (activeHandle.id === 'draft') {
        // approximate keel depth or draft
        const draft = (canvas.height - 30 - y) / scZ;
        onParameterChange({ draft: Math.max(0.2, Math.min(parameters.depth - 0.2, draft)) });
      } else if (activeHandle.id === 'sheerStern') {
        const sternHeight = (canvas.height - 30 - y) / scZ;
        onParameterChange({ sheerStern: Math.max(0.0, Math.min(4.0, sternHeight - parameters.depth)) });
      } else if (activeHandle.id === 'sheerBow') {
        const bowHeight = (canvas.height - 30 - y) / scZ;
        const currentBowHeight = parameters.depth + parameters.sheerBow;
        // Check difference in X for rake
        const targetX = (x - 30) / scX;
        const deltaX = targetX - parameters.length;
        const bowRakeDegrees = Math.max(0, Math.min(40, (Math.atan2(deltaX, bowHeight) * 180) / Math.PI));
        
        onParameterChange({
          sheerBow: Math.max(0.0, Math.min(5.0, bowHeight - parameters.depth)),
          bowRake: bowRakeDegrees
        });
      } else if (activeHandle.id === 'depth') {
        const depth = (canvas.height - 30 - y) / scZ;
        onParameterChange({ depth: Math.max(1.0, Math.min(20.0, depth)) });
      }
    } else if (activeHandle.view === 'body') {
      const scX = (canvas.width - 50) / (parameters.beam * 1.3);
      const widthPercent = (x - canvas.width / 2) / scX;
      // drag bilge outwards/inwards changes bilgeRadius
      const bRad = (widthPercent / (parameters.beam / 2)) * 3;
      onParameterChange({ bilgeRadius: Math.max(0.1, Math.min(4.5, bRad)) });
    }
  };

  const handleCanvasMouseUp = () => {
    setActiveHandle(null);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-700 rounded-lg overflow-hidden" id="cad_viewports">
      {/* CAD Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-850 border-b border-slate-700 text-slate-200">
        <div className="flex items-center space-x-2">
          <Rotate3d className="w-5 h-5 text-cyan-400" />
          <span className="font-semibold text-sm tracking-tight text-slate-100">Interactive Design Viewports</span>
        </div>
        <div className="flex items-center space-x-1.5 bg-slate-900 rounded-md p-1 border border-slate-700">
          <button
            onClick={() => setActiveViewport('all')}
            className={`px-2.5 py-1 text-xs rounded font-medium transition ${activeViewport === 'all' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-400 hover:text-slate-200'}`}
            id="btn_view_quad"
          >
            Quad-View
          </button>
          <button
            onClick={() => setActiveViewport('3d')}
            className={`px-2.5 py-1 text-xs rounded font-medium transition ${activeViewport === '3d' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-400 hover:text-slate-200'}`}
            id="btn_view_3d"
          >
            3D View
          </button>
          <button
            onClick={() => setActiveViewport('plan')}
            className={`px-2.5 py-1 text-xs rounded font-medium transition ${activeViewport === 'plan' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-400 hover:text-slate-200'}`}
            id="btn_view_plan"
          >
            Plan
          </button>
          <button
            onClick={() => setActiveViewport('profile')}
            className={`px-2.5 py-1 text-xs rounded font-medium transition ${activeViewport === 'profile' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-400 hover:text-slate-200'}`}
            id="btn_view_profile"
          >
            Profile
          </button>
          <button
            onClick={() => setActiveViewport('body')}
            className={`px-2.5 py-1 text-xs rounded font-medium transition ${activeViewport === 'body' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-400 hover:text-slate-200'}`}
            id="btn_view_stations"
          >
            Body Plan
          </button>
        </div>
      </div>

      {/* Simulation & Visualization Controls Sub-Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-slate-900 border-b border-slate-700/80 text-xs">
        {/* Render Mode Toggle */}
        <div className="flex items-center space-x-2">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Render Mode:</span>
          <div className="flex bg-slate-950 p-0.5 rounded border border-slate-800">
            <button
              onClick={() => setVisMode('shaded')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded transition-all ${visMode === 'shaded' ? 'bg-cyan-950 text-cyan-400 font-semibold border border-cyan-800/50' : 'text-slate-400 hover:text-slate-200'}`}
              title="Smooth Shaded Model"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Shaded</span>
            </button>
            <button
              onClick={() => setVisMode('wireframe')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded transition-all ${visMode === 'wireframe' ? 'bg-cyan-950 text-cyan-400 font-semibold border border-cyan-800/50' : 'text-slate-400 hover:text-slate-200'}`}
              title="Structural Station Wireframe"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Wireframe</span>
            </button>
            <button
              onClick={() => setVisMode('slicing')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded transition-all ${visMode === 'slicing' ? 'bg-cyan-950 text-cyan-400 font-semibold border border-cyan-800/50' : 'text-slate-400 hover:text-slate-200'}`}
              title="Dynamic Cross-Section Slicing Plane"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Cutting Slices</span>
            </button>
            <button
              onClick={() => setVisMode('flow')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded transition-all ${visMode === 'flow' ? 'bg-cyan-950 text-cyan-400 font-semibold border border-cyan-800/50' : 'text-slate-400 hover:text-slate-200'}`}
              title="Real-Time Hydrodynamics CFD Solver"
            >
              <Wind className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
              <span>CFD Flow</span>
            </button>
            <button
              onClick={() => setVisMode('buoyancy')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded transition-all ${visMode === 'buoyancy' ? 'bg-cyan-950 text-cyan-400 font-semibold border border-cyan-800/50' : 'text-slate-400 hover:text-slate-200'}`}
              title="Real-Time Hydrostatic Buoyancy & Pressure Distribution"
              id="btn_buoyancy_mode"
            >
              <Scale className="w-3.5 h-3.5 text-cyan-400" />
              <span>Buoyancy Heatmap</span>
            </button>
            <button
              onClick={() => setVisMode('stress')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded transition-all ${visMode === 'stress' ? 'bg-cyan-950 text-cyan-400 font-semibold border border-cyan-800/50' : 'text-slate-400 hover:text-slate-200'}`}
              title="Structural Stress & FEA Equivalent Stress Heatmap"
              id="btn_stress_mode"
            >
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>Stress Heatmap</span>
            </button>
          </div>
        </div>

        {/* Dynamic Controls depending on mode */}
        {visMode === 'slicing' && (
          <div className="flex items-center space-x-3 bg-slate-950 px-3 py-1.5 rounded border border-slate-800 text-slate-300 animate-fadeIn">
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] text-purple-400 uppercase font-bold font-mono">Plane:</span>
              <div className="flex bg-slate-900 rounded p-0.5 border border-slate-800">
                {(['X', 'Y', 'Z'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setSlicePlane(p)}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded ${slicePlane === p ? 'bg-purple-950 text-purple-400 border border-purple-800/30' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    {p === 'X' ? 'Station (X)' : p === 'Y' ? 'Buttock (Y)' : 'Waterline (Z)'}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <span className="text-[10px] text-purple-400 uppercase font-bold font-mono">Position:</span>
              <input
                type="range"
                min="0"
                max="100"
                value={slicePosition}
                onChange={(e) => setSlicePosition(Number(e.target.value))}
                className="w-24 accent-purple-500 cursor-pointer h-1 rounded bg-slate-800"
              />
              <span className="font-mono text-[11px] text-purple-300 w-8 text-right">{slicePosition}%</span>
            </div>
          </div>
        )}

        {visMode === 'flow' && (
          <div className="flex items-center space-x-4 bg-slate-950 px-3 py-1.5 rounded border border-slate-800 text-slate-300 animate-fadeIn">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] text-cyan-400 uppercase font-bold font-mono">Flow Speed:</span>
              <input
                type="range"
                min="1"
                max="45"
                value={cfdSpeedKnots}
                onChange={(e) => setCfdSpeedKnots(Number(e.target.value))}
                className="w-24 accent-cyan-500 cursor-pointer h-1 rounded bg-slate-800"
              />
              <span className="font-mono text-[11px] text-cyan-300 w-12 text-right">{cfdSpeedKnots} kn</span>
            </div>

            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] text-cyan-400 uppercase font-bold font-mono">Solver Grid:</span>
              <select
                value={cfdDetail}
                onChange={(e) => setCfdDetail(e.target.value as any)}
                className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[11px] text-cyan-300 font-mono"
              >
                <option value="low">Low (15x10)</option>
                <option value="medium">Medium (25x18)</option>
                <option value="high">High (40x30)</option>
              </select>
            </div>
          </div>
        )}

        {visMode === 'buoyancy' && (
          <div className="flex items-center space-x-4 bg-slate-950 px-3 py-1.5 rounded border border-slate-800 text-slate-300 animate-fadeIn" id="buoyancy_controls_toolbar">
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] text-cyan-400 uppercase font-bold font-mono">Fluid Density:</span>
              <select
                value={buoyancyDensity}
                onChange={(e) => setBuoyancyDensity(Number(e.target.value))}
                className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[11px] text-cyan-300 font-mono"
              >
                <option value="1025">Saltwater (1025 kg/m³)</option>
                <option value="1000">Freshwater (1000 kg/m³)</option>
                <option value="1030">Dead Sea (1030 kg/m³)</option>
              </select>
            </div>

            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] text-cyan-400 uppercase font-bold font-mono">Heatmap Metric:</span>
              <div className="flex bg-slate-900 rounded p-0.5 border border-slate-800">
                {(['pressure', 'force'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setBuoyancyScale(s)}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded ${buoyancyScale === s ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/30' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    {s === 'pressure' ? 'Pressure (P)' : 'Buoyant Force (Fb)'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {visMode === 'stress' && (
          <div className="flex flex-wrap items-center gap-4 bg-slate-950 px-3 py-1.5 rounded border border-slate-800 text-slate-300 animate-fadeIn" id="stress_controls_toolbar">
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] text-cyan-400 uppercase font-bold font-mono">Structural Material:</span>
              <select
                value={stressMaterial}
                onChange={(e) => setStressMaterial(e.target.value as any)}
                className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[11px] text-cyan-300 font-mono outline-none"
              >
                <option value="steel">Mild Steel A36 (250 MPa)</option>
                <option value="highsteel">High-Tensile AH36 (355 MPa)</option>
                <option value="aluminum">Marine Aluminum 5083 (145 MPa)</option>
                <option value="composite">Carbon Fiber / Epoxy (450 MPa)</option>
              </select>
            </div>

            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] text-cyan-400 uppercase font-bold font-mono">Load Scenario:</span>
              <select
                value={stressLoadCase}
                onChange={(e) => setStressLoadCase(e.target.value as any)}
                className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[11px] text-cyan-300 font-mono outline-none"
              >
                <option value="stillwater">Still Water (Pure Hydrostatic)</option>
                <option value="hogging">Wave Hogging (Crest at Midship)</option>
                <option value="sagging">Wave Sagging (Trough at Midship)</option>
                <option value="slamming">High-Speed Sea Slamming (Bow Impact)</option>
              </select>
            </div>
            
            <div className="hidden sm:flex items-center space-x-1.5">
              <span className="text-[10px] text-cyan-400 uppercase font-bold font-mono">Vessel Speed:</span>
              <input
                type="range"
                min="0"
                max="45"
                value={cfdSpeedKnots}
                onChange={(e) => setCfdSpeedKnots(Number(e.target.value))}
                className="w-20 accent-cyan-500 cursor-pointer h-1 rounded bg-slate-800"
              />
              <span className="font-mono text-[11px] text-cyan-300 w-10 text-right">{cfdSpeedKnots} kn</span>
            </div>
          </div>
        )}

        {/* Live CFD Feedback overlay in flow mode */}
        {visMode === 'flow' && (
          <div className="hidden lg:flex items-center space-x-3 text-[10px] bg-slate-950/40 px-2.5 py-1 rounded border border-slate-800/40 text-slate-400">
            <span>Fn: <strong className="text-cyan-400 font-mono">{(cfdSpeedKnots * 0.5144 / Math.sqrt(9.81 * parameters.length)).toFixed(3)}</strong></span>
            <span>Trim: <strong className="text-cyan-400 font-mono">{(cfdSpeedKnots * 0.5144 / Math.sqrt(9.81 * parameters.length) * 8 * 0.7).toFixed(1)}°</strong></span>
            <span>Est. Drag: <strong className="text-cyan-400 font-mono">{(0.5 * 1.025 * 0.003 * 350 * Math.pow(cfdSpeedKnots * 0.5144, 2)).toFixed(1)} kN</strong></span>
          </div>
        )}

        {/* Live Buoyancy Feedback overlay in buoyancy mode */}
        {visMode === 'buoyancy' && (
          <div className="hidden lg:flex items-center space-x-3 text-[10px] bg-slate-950/40 px-2.5 py-1 rounded border border-slate-800/40 text-slate-400">
            <span>Max Keel Press: <strong className="text-cyan-400 font-mono">{((buoyancyDensity * 9.81 * parameters.draft) / 1000).toFixed(2)} kPa</strong></span>
            <span>Design Draft: <strong className="text-cyan-400 font-mono">{parameters.draft.toFixed(2)} m</strong></span>
            <span>Displ. Force: <strong className="text-cyan-400 font-mono">{(9.81 * (parameters.length * parameters.beam * parameters.draft * 0.55 * buoyancyDensity) / 1000).toFixed(1)} kN</strong></span>
          </div>
        )}

        {/* Live Stress Feedback overlay in stress mode */}
        {visMode === 'stress' && (
          <div className="hidden lg:flex items-center space-x-3 text-[10px] bg-slate-950/40 px-2.5 py-1 rounded border border-slate-800/40 text-slate-400">
            <span>Material E-Modulus: <strong className="text-cyan-400 font-mono">{MATERIALS[stressMaterial]?.modulus || 200} GPa</strong></span>
            <span>Density: <strong className="text-cyan-400 font-mono">{MATERIALS[stressMaterial]?.density || 7850} kg/m³</strong></span>
            <span>L/D Ratio: <strong className="text-cyan-400 font-mono">{(parameters.length / parameters.depth).toFixed(2)}</strong></span>
            {(parameters.length / parameters.depth) > 20 && (
              <span className="text-amber-400 animate-pulse font-bold font-mono">⚠️ High Slenderness</span>
            )}
          </div>
        )}
      </div>

      {/* Grid Container */}
      <div className="flex-1 overflow-hidden bg-slate-950">
        {activeViewport === 'all' ? (
          <div className="grid grid-cols-2 grid-rows-2 h-full gap-1 p-1 bg-slate-800">
            {/* 3D Viewport */}
            <div className="relative group bg-slate-950 overflow-hidden rounded">
              <canvas
                ref={canvas3D}
                onMouseDown={handleMouseDown3D}
                onMouseMove={handleMouseMove3D}
                onMouseUp={handleMouseUp3D}
                onMouseLeave={handleMouseUp3D}
                onWheel={handleWheel3D}
                className="w-full h-full cursor-grab active:cursor-grabbing"
                id="canvas_3d_quad"
              />
              <div className="absolute top-2.5 right-2.5 bg-slate-900/80 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-mono text-slate-300 border border-slate-700/50 flex items-center space-x-1">
                <Compass className="w-3.5 h-3.5 text-cyan-400" />
                <span>PERSPECTIVE 3D</span>
              </div>
            </div>

            {/* Plan Viewport */}
            <div className="relative bg-slate-950 overflow-hidden rounded">
              <canvas
                ref={canvasPlan}
                onMouseDown={(e) => handleCanvasMouseDown(e, 'plan')}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
                className="w-full h-full cursor-crosshair"
                id="canvas_plan_quad"
              />
              <div className="absolute top-2.5 right-2.5 bg-slate-900/80 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-mono text-slate-300 border border-slate-700/50 flex items-center space-x-1">
                <Move className="w-3.5 h-3.5 text-amber-500" />
                <span>PLAN VIEW (X-Y)</span>
              </div>
            </div>

            {/* Profile Viewport */}
            <div className="relative bg-slate-950 overflow-hidden rounded">
              <canvas
                ref={canvasProfile}
                onMouseDown={(e) => handleCanvasMouseDown(e, 'profile')}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
                className="w-full h-full cursor-crosshair"
                id="canvas_profile_quad"
              />
              <div className="absolute top-2.5 right-2.5 bg-slate-900/80 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-mono text-slate-300 border border-slate-700/50 flex items-center space-x-1">
                <Move className="w-3.5 h-3.5 text-amber-500" />
                <span>PROFILE VIEW (X-Z)</span>
              </div>
            </div>

            {/* Body Viewport */}
            <div className="relative bg-slate-950 overflow-hidden rounded">
              <canvas
                ref={canvasBody}
                onMouseDown={(e) => handleCanvasMouseDown(e, 'body')}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
                className="w-full h-full cursor-crosshair"
                id="canvas_body_quad"
              />
              <div className="absolute top-2.5 right-2.5 bg-slate-900/80 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-mono text-slate-300 border border-slate-700/50 flex items-center space-x-1">
                <Move className="w-3.5 h-3.5 text-amber-500" />
                <span>BODY PLAN (Y-Z)</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full w-full relative">
            {activeViewport === '3d' && (
              <canvas
                ref={canvas3D}
                onMouseDown={handleMouseDown3D}
                onMouseMove={handleMouseMove3D}
                onMouseUp={handleMouseUp3D}
                onMouseLeave={handleMouseUp3D}
                onWheel={handleWheel3D}
                className="w-full h-full cursor-grab active:cursor-grabbing"
                id="canvas_3d_solo"
              />
            )}
            {activeViewport === 'plan' && (
              <canvas
                ref={canvasPlan}
                onMouseDown={(e) => handleCanvasMouseDown(e, 'plan')}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
                className="w-full h-full cursor-crosshair"
                id="canvas_plan_solo"
              />
            )}
            {activeViewport === 'profile' && (
              <canvas
                ref={canvasProfile}
                onMouseDown={(e) => handleCanvasMouseDown(e, 'profile')}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
                className="w-full h-full cursor-crosshair"
                id="canvas_profile_solo"
              />
            )}
            {activeViewport === 'body' && (
              <canvas
                ref={canvasBody}
                onMouseDown={(e) => handleCanvasMouseDown(e, 'body')}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
                className="w-full h-full cursor-crosshair"
                id="canvas_body_solo"
              />
            )}
          </div>
        )}
      </div>

      {/* Guide Bar */}
      <div className="px-4 py-1.5 bg-slate-850 border-t border-slate-700 flex justify-between items-center text-[11px] text-slate-400">
        <span>🖱️ Drag left-mouse to rotate 3D, scroll to zoom.</span>
        <span className="text-amber-500 font-semibold font-mono">● Drag orange dots directly in Plans to reshape the hull.</span>
      </div>
    </div>
  );
}
