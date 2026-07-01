/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { HullParameters } from '../types';
import { Sliders, RefreshCw, AlertCircle, Sparkles, Scale, Info, ChevronDown, ChevronUp, Anchor, ShieldAlert } from 'lucide-react';
import { generateHullMesh, calculateHydrostatics } from '../utils/hullGeometry';

const MATERIALS: Record<string, {
  name: string;
  density: number; // kg/m^3
  desc: string;
  defaultThicknessFactor: number; // mm per meter of length
  baseThickness: number; // mm
}> = {
  steel: {
    name: 'Marine Structural Steel (A36)',
    density: 7850,
    desc: 'Heavy, highly durable, standard for commercial ships.',
    defaultThicknessFactor: 0.08,
    baseThickness: 3.0
  },
  aluminum: {
    name: 'Marine Aluminium (5083-H116)',
    density: 2660,
    desc: 'Lightweight, corrosion-resistant, perfect for fast crafts.',
    defaultThicknessFactor: 0.11,
    baseThickness: 4.0
  },
  carbon_fiber: {
    name: 'Carbon Fiber / Epoxy Composite',
    density: 1550,
    desc: 'Ultra-lightweight, extremely stiff, high-performance racing.',
    defaultThicknessFactor: 0.06,
    baseThickness: 2.0
  }
};

interface StructuralEstimation {
  hullPlatingArea: number;
  deckArea: number;
  hullWeightTonnes: number;
  deckWeightTonnes: number;
  totalWeightTonnes: number;
  hullLcg: number;
  hullVcg: number;
  deckLcg: number;
  deckVcg: number;
  totalLcg: number;
  totalVcg: number;
}

function estimateStructure(
  params: HullParameters,
  materialKey: 'steel' | 'aluminum' | 'carbon_fiber',
  thicknessMm: number,
  overheadFactor: number
): StructuralEstimation {
  const numStations = 15;
  const numPoints = 20;
  const mesh = generateHullMesh(params, numStations, numPoints);
  
  let totalHullArea = 0;
  let totalDeckArea = 0;
  
  let hullWeightedX = 0;
  let hullWeightedZ = 0;
  
  let deckWeightedX = 0;
  let deckWeightedZ = 0;
  
  const dx = params.length / (numStations - 1);
  
  const stationGirths: number[] = [];
  const stationHullVCGs: number[] = [];
  const stationXs: number[] = [];
  const stationDeckYs: number[] = [];
  const stationDeckZs: number[] = [];
  
  for (let s = 0; s < numStations; s++) {
    const station = mesh[s];
    const x = station[0].x;
    stationXs.push(x);
    
    let girth = 0;
    let weightedZ = 0;
    for (let i = 0; i < station.length - 1; i++) {
      const p1 = station[i];
      const p2 = station[i + 1];
      const dy = p2.y - p1.y;
      const dz = p2.z - p1.z;
      const segGirth = Math.sqrt(dy * dy + dz * dz);
      girth += segGirth;
      weightedZ += segGirth * (0.5 * (p1.z + p2.z));
    }
    
    stationGirths.push(girth * 2);
    stationHullVCGs.push(girth > 0 ? weightedZ / girth : 0);
    
    const deckPoint = station[station.length - 1];
    stationDeckYs.push(deckPoint.y * 2);
    stationDeckZs.push(deckPoint.z);
  }
  
  for (let s = 0; s < numStations - 1; s++) {
    const segmentX = 0.5 * (stationXs[s] + stationXs[s + 1]);
    
    const avgHullGirth = 0.5 * (stationGirths[s] + stationGirths[s + 1]);
    const segmentHullArea = avgHullGirth * dx;
    totalHullArea += segmentHullArea;
    
    const segmentHullVCG = 0.5 * (stationHullVCGs[s] + stationHullVCGs[s + 1]);
    hullWeightedX += segmentHullArea * segmentX;
    hullWeightedZ += segmentHullArea * segmentHullVCG;
    
    const avgDeckWidth = 0.5 * (stationDeckYs[s] + stationDeckYs[s + 1]);
    const segmentDeckArea = avgDeckWidth * dx;
    totalDeckArea += segmentDeckArea;
    
    const segmentDeckVCG = 0.5 * (stationDeckZs[s] + stationDeckZs[s + 1]);
    deckWeightedX += segmentDeckArea * segmentX;
    deckWeightedZ += segmentDeckArea * segmentDeckVCG;
  }
  
  const hullLcg = totalHullArea > 0 ? hullWeightedX / totalHullArea : params.length * 0.48;
  const hullVcg = totalHullArea > 0 ? hullWeightedZ / totalHullArea : params.depth * 0.45;
  
  const deckLcg = totalDeckArea > 0 ? deckWeightedX / totalDeckArea : params.length * 0.48;
  const deckVcg = totalDeckArea > 0 ? deckWeightedZ / totalDeckArea : params.depth;
  
  const densityT = MATERIALS[materialKey].density / 1000;
  const thicknessM = thicknessMm / 1000;
  
  const hullWeightTonnes = totalHullArea * thicknessM * densityT * overheadFactor;
  const deckWeightTonnes = totalDeckArea * thicknessM * densityT * overheadFactor;
  const totalWeightTonnes = hullWeightTonnes + deckWeightTonnes;
  
  const totalLcg = totalWeightTonnes > 0
    ? (hullWeightTonnes * hullLcg + deckWeightTonnes * deckLcg) / totalWeightTonnes
    : hullLcg;
    
  const totalVcg = totalWeightTonnes > 0
    ? (hullWeightTonnes * hullVcg + deckWeightTonnes * deckVcg) / totalWeightTonnes
    : hullVcg;
    
  return {
    hullPlatingArea: totalHullArea,
    deckArea: totalDeckArea,
    hullWeightTonnes,
    deckWeightTonnes,
    totalWeightTonnes,
    hullLcg,
    hullVcg,
    deckLcg,
    deckVcg,
    totalLcg,
    totalVcg
  };
}

interface ParamsPanelProps {
  parameters: HullParameters;
  onParameterChange: (params: Partial<HullParameters>) => void;
  onReset: () => void;
  activeRole: 'Admin' | 'Designer' | 'Viewer';
}

export default function ParamsPanel({
  parameters,
  onParameterChange,
  onReset,
  activeRole
}: ParamsPanelProps) {
  const isReadOnly = activeRole === 'Viewer';

  // Material property calculator states
  const [materialKey, setMaterialKey] = useState<'steel' | 'aluminum' | 'carbon_fiber'>('steel');
  const [isAutoThickness, setIsAutoThickness] = useState<boolean>(true);
  const [customThicknessMm, setCustomThicknessMm] = useState<number>(8);
  const [overheadFactor, setOverheadFactor] = useState<number>(1.45);
  const [isCalcExpanded, setIsCalcExpanded] = useState<boolean>(true);

  // Synchronize custom thickness manually when material changes
  useEffect(() => {
    const recommended = Math.round(
      MATERIALS[materialKey].baseThickness + parameters.length * MATERIALS[materialKey].defaultThicknessFactor
    );
    setCustomThicknessMm(recommended);
  }, [materialKey, parameters.length]);

  const handleChange = (key: keyof HullParameters, value: number) => {
    if (isReadOnly) return;
    onParameterChange({ [key]: value });
  };

  // Group config details
  const groups = [
    {
      title: 'Principal Dimensions',
      desc: 'Overall vessel scale & displacement ratios',
      fields: [
        { key: 'length', label: 'Length overall (Lwl)', min: 10, max: 180, step: 1, unit: 'm' },
        { key: 'beam', label: 'Maximum Beam (B)', min: 2, max: 35, step: 0.1, unit: 'm' },
        { key: 'draft', label: 'Design Draft (T)', min: 0.3, max: Math.min(10, parameters.depth - 0.2), step: 0.05, unit: 'm' },
        { key: 'depth', label: 'Hull Depth (D)', min: 1, max: 20, step: 0.1, unit: 'm' }
      ]
    },
    {
      title: 'Section Geometry',
      desc: 'Bottom slope, bilge compactness, and flare',
      fields: [
        { key: 'deadrise', label: 'Deadrise Angle', min: 0, max: 25, step: 0.5, unit: '°' },
        { key: 'bilgeRadius', label: 'Bilge Corner tight/slack', min: 0.1, max: 4.5, step: 0.05, unit: 'm' },
        { key: 'flare', label: 'Side Wall Flare', min: 0, max: 30, step: 0.5, unit: '°' }
      ]
    },
    {
      title: 'Bow, Stern, Sheer',
      desc: 'Stem curvature, transom profile, and deck sheer',
      fields: [
        { key: 'bowRake', label: 'Bow Rake angle', min: 0, max: 40, step: 0.5, unit: '°', lockedBy: 'Sarah Jenkins' },
        { key: 'sheerBow', label: 'Sheer Rise at Bow', min: 0, max: 4.5, step: 0.05, unit: 'm', lockedBy: 'Sarah Jenkins' },
        { key: 'sheerStern', label: 'Sheer Rise at Stern', min: 0, max: 2.5, step: 0.05, unit: 'm' },
        { key: 'transomBeamRatio', label: 'Transom Width factor', min: 0.1, max: 1.0, step: 0.02, unit: '' },
        { key: 'fullness', label: 'Waterplane Fullness', min: 0.5, max: 2.0, step: 0.05, unit: '' }
      ]
    },
    {
      title: 'NURBS & Custom Mesh Surfacing',
      desc: 'Local deformations, hard-chine controls, and bulbous bow volumetric parameters',
      fields: [
        { key: 'nurbsBulb', label: 'Bulbous Bow Vol', min: 0, max: 10, step: 0.5, unit: '' },
        { key: 'nurbsChine', label: 'Hard Chine transition', min: 0, max: 1.0, step: 0.05, unit: '' },
        { key: 'nurbsDeformX', label: 'X-axis Morphing (Pinch)', min: -1.0, max: 1.0, step: 0.05, unit: '' },
        { key: 'nurbsDeformY', label: 'Y-axis Flare bulge', min: -1.0, max: 1.0, step: 0.05, unit: '' },
        { key: 'nurbsDeformZ', label: 'Keel Curvature (Sag/Hog)', min: -1.0, max: 1.0, step: 0.05, unit: '' }
      ]
    }
  ];

  // Compute effective thickness and run structural estimations
  const autoThicknessMm = Math.round(
    MATERIALS[materialKey].baseThickness + parameters.length * MATERIALS[materialKey].defaultThicknessFactor
  );
  const effectiveThicknessMm = isAutoThickness ? autoThicknessMm : customThicknessMm;

  const est = estimateStructure(parameters, materialKey, effectiveThicknessMm, overheadFactor);
  const hydro = calculateHydrostatics(parameters);

  // Comparison with Hydrostatics
  const dispMass = hydro.displacementMass; // tonnes
  const isTooHeavy = est.totalWeightTonnes > dispMass;
  const reserveBuoyancy = Math.max(0, dispMass - est.totalWeightTonnes);
  const structuralPercentage = dispMass > 0 ? (est.totalWeightTonnes / dispMass) * 100 : 0;

  // GM calculation
  const actualGM = hydro.kmt - est.totalVcg;

  let stabilityStatus = {
    label: 'Unknown',
    color: 'text-slate-400',
    bg: 'bg-slate-900',
    border: 'border-slate-800'
  };
  if (actualGM > 1.5) {
    stabilityStatus = {
      label: 'Excessive Stability (Rapid Roll)',
      color: 'text-teal-400',
      bg: 'bg-teal-950/20',
      border: 'border-teal-800/40'
    };
  } else if (actualGM >= 0.5) {
    stabilityStatus = {
      label: 'Optimal Stability (Safe)',
      color: 'text-emerald-400',
      bg: 'bg-emerald-950/20',
      border: 'border-emerald-800/40'
    };
  } else if (actualGM > 0.1) {
    stabilityStatus = {
      label: 'Low Stability (Caution)',
      color: 'text-amber-400',
      bg: 'bg-amber-950/20',
      border: 'border-amber-850/40'
    };
  } else {
    stabilityStatus = {
      label: 'Unstable (Capsize Risk)',
      color: 'text-red-400',
      bg: 'bg-red-950/20',
      border: 'border-red-900/40'
    };
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-700 rounded-lg p-5 text-slate-200 overflow-y-auto" id="parameters_panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-4 shrink-0">
        <div className="flex items-center space-x-2">
          <Sliders className="w-5 h-5 text-cyan-400" />
          <h2 className="font-semibold text-base text-slate-100 tracking-tight">Parametric Hull Controllers</h2>
        </div>
        {!isReadOnly && (
          <button
            onClick={onReset}
            className="flex items-center space-x-1 px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800 rounded transition"
            id="btn_reset_hull"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Hull</span>
          </button>
        )}
      </div>

      {/* Warnings & Messages */}
      {isReadOnly && (
        <div className="mb-4 bg-amber-500/10 text-amber-400 border border-amber-500/20 p-3 rounded flex items-start space-x-2 text-xs font-mono">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <strong className="block mb-0.5">Read-Only Mode Active</strong>
            You are currently logged in as a <strong>Viewer</strong>. Switch your role in the Collaboration panel to make modifications.
          </div>
        </div>
      )}

      {/* Sliders loop */}
      <div className="space-y-5 flex-1" id="sliders_form">
        {groups.map((grp, gIdx) => (
          <div key={gIdx} className="bg-slate-950 p-4 rounded border border-slate-850 space-y-3">
            <div>
              <h3 className="text-xs font-bold font-mono uppercase text-slate-200 tracking-wide flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>{grp.title}</span>
              </h3>
              <p className="text-[10px] text-slate-400 font-sans mt-0.5">{grp.desc}</p>
            </div>

            <div className="space-y-4 pt-1">
              {grp.fields.map(fld => {
                const rawVal = (parameters as any)[fld.key];
                const val = rawVal !== undefined ? rawVal : 0;
                const isFieldLocked = fld.lockedBy && !isReadOnly;

                return (
                  <div key={fld.key} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-slate-300 flex items-center space-x-1">
                        <span>{fld.label}</span>
                        {isFieldLocked && (
                          <span className="text-[8px] uppercase px-1 py-0.2 bg-red-500/20 text-red-400 border border-red-500/10 rounded">
                            Locked by {fld.lockedBy}
                          </span>
                        )}
                      </span>
                      <span className="text-slate-400 font-bold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                        {val.toFixed(2)}{fld.unit}
                      </span>
                    </div>

                    <div className="flex items-center space-x-3">
                      <button
                        disabled={isReadOnly || isFieldLocked}
                        onClick={() => handleChange(fld.key as any, Math.max(fld.min, val - fld.step))}
                        className="bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 font-bold px-1.5 py-0.5 text-xs rounded disabled:opacity-30"
                      >
                        -
                      </button>

                      <input
                        type="range"
                        min={fld.min}
                        max={fld.max}
                        step={fld.step}
                        value={val}
                        disabled={isReadOnly || isFieldLocked}
                        onChange={(e) => handleChange(fld.key as any, parseFloat(e.target.value))}
                        className="flex-1 accent-cyan-500 cursor-ew-resize disabled:opacity-40"
                        id={`slider_param_${fld.key}`}
                      />

                      <button
                        disabled={isReadOnly || isFieldLocked}
                        onClick={() => handleChange(fld.key as any, Math.min(fld.max, val + fld.step))}
                        className="bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 font-bold px-1.5 py-0.5 text-xs rounded disabled:opacity-30"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Material & Weight Calculator Section */}
      <div className="border-t border-slate-800 pt-5 mt-5" id="material_calculator_section">
        <button
          onClick={() => setIsCalcExpanded(!isCalcExpanded)}
          className="w-full flex items-center justify-between py-1 text-xs font-bold font-mono uppercase tracking-wide text-slate-100 hover:text-cyan-400 transition"
        >
          <div className="flex items-center space-x-2">
            <Scale className="w-4 h-4 text-cyan-400" />
            <span>Material & CoG Calculator</span>
          </div>
          {isCalcExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {isCalcExpanded && (
          <div className="mt-4 space-y-4">
            {/* Material Selector */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Select Construction Material</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['steel', 'aluminum', 'carbon_fiber'] as const).map(mat => (
                  <button
                    key={mat}
                    onClick={() => setMaterialKey(mat)}
                    className={`px-1 py-1.5 rounded text-[10px] font-bold border transition text-center uppercase tracking-wider ${
                      materialKey === mat
                        ? 'bg-cyan-950 border-cyan-500 text-cyan-400'
                        : 'bg-slate-950 border-slate-850 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {mat === 'steel' ? 'Steel' : mat === 'aluminum' ? 'Alum.' : 'Carbon'}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 leading-normal font-sans pt-1">
                {MATERIALS[materialKey].desc} (Density: <strong className="text-slate-300 font-mono">{MATERIALS[materialKey].density} kg/m³</strong>)
              </p>
            </div>

            {/* Thickness Control */}
            <div className="space-y-2 bg-slate-950 p-3 rounded border border-slate-850">
              <div className="flex justify-between items-center">
                <span className="text-xs font-mono text-slate-300">Plate Thickness</span>
                <label className="flex items-center space-x-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAutoThickness}
                    onChange={(e) => setIsAutoThickness(e.target.checked)}
                    className="rounded border-slate-800 text-cyan-500 focus:ring-0 bg-slate-900 w-3 h-3 cursor-pointer"
                  />
                  <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider">Auto (Class Rules)</span>
                </label>
              </div>

              {isAutoThickness ? (
                <div className="flex items-center justify-between bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded text-[10px]">
                  <span className="text-slate-400">Class recommended thickness:</span>
                  <strong className="font-mono text-cyan-400 text-xs">{effectiveThicknessMm} mm</strong>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-mono text-slate-400">
                    <span>Manual Override:</span>
                    <strong className="text-slate-200 text-xs">{customThicknessMm} mm</strong>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    step="1"
                    value={customThicknessMm}
                    onChange={(e) => setCustomThicknessMm(parseInt(e.target.value, 10))}
                    className="w-full accent-cyan-500 cursor-ew-resize h-1 bg-slate-800 rounded"
                  />
                </div>
              )}
            </div>

            {/* Framing Overhead */}
            <div className="space-y-1.5 bg-slate-950 p-3 rounded border border-slate-850">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-300">Stiffening Multiplier</span>
                <strong className="text-cyan-400 font-bold">{(overheadFactor).toFixed(2)}x</strong>
              </div>
              <input
                type="range"
                min="1.0"
                max="2.0"
                step="0.05"
                value={overheadFactor}
                onChange={(e) => setOverheadFactor(parseFloat(e.target.value))}
                className="w-full accent-cyan-500 cursor-ew-resize h-1 bg-slate-800 rounded"
              />
              <p className="text-[9px] text-slate-400 font-sans italic leading-tight">
                Simulates internal framing, weld lines, stringers, and structural margin.
              </p>
            </div>

            {/* Weights Breakdown Dashboard */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold font-mono uppercase text-slate-400 tracking-wider">Weight Distribution</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-950 p-2.5 rounded border border-slate-850">
                  <div className="text-[9px] text-slate-400 font-mono uppercase tracking-wider">Hull Plating</div>
                  <div className="mt-1 flex items-baseline space-x-1">
                    <span className="text-sm font-bold font-mono text-slate-100">{est.hullWeightTonnes.toFixed(1)}</span>
                    <span className="text-[9px] text-slate-400 font-mono">t</span>
                  </div>
                  <div className="text-[8px] text-slate-500 font-mono mt-0.5">{est.hullPlatingArea.toFixed(0)} m² surface</div>
                </div>

                <div className="bg-slate-950 p-2.5 rounded border border-slate-850">
                  <div className="text-[9px] text-slate-400 font-mono uppercase tracking-wider">Deck Plating</div>
                  <div className="mt-1 flex items-baseline space-x-1">
                    <span className="text-sm font-bold font-mono text-slate-100">{est.deckWeightTonnes.toFixed(1)}</span>
                    <span className="text-[9px] text-slate-400 font-mono">t</span>
                  </div>
                  <div className="text-[8px] text-slate-500 font-mono mt-0.5">{est.deckArea.toFixed(0)} m² deck</div>
                </div>
              </div>

              {/* Total Summary */}
              <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                    <Anchor className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Total Weight (Lightship)</span>
                  </span>
                  <div className="flex items-baseline space-x-0.5">
                    <span className="text-base font-extrabold font-mono text-cyan-400">{est.totalWeightTonnes.toFixed(2)}</span>
                    <span className="text-[10px] text-cyan-400 font-mono uppercase">t</span>
                  </div>
                </div>

                <hr className="border-slate-850" />

                {/* CoG positions */}
                <div className="space-y-1 text-[11px] font-mono text-slate-400">
                  <div className="flex justify-between">
                    <span>LCG (from transom):</span>
                    <strong className="text-slate-200">{est.totalLcg.toFixed(2)} m</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>VCG / KG (above keel):</span>
                    <strong className="text-slate-200">{est.totalVcg.toFixed(2)} m</strong>
                  </div>
                </div>

                {/* Reserve buoyancy & ratio compare */}
                <hr className="border-slate-850" />
                <div className="space-y-1 text-[11px] font-sans">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Design Displacement:</span>
                    <strong className="font-mono text-slate-200">{dispMass.toFixed(2)} t</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Structural Weight ratio:</span>
                    <strong className={`font-mono ${isTooHeavy ? 'text-red-400 font-bold' : 'text-slate-200'}`}>
                      {structuralPercentage.toFixed(1)}%
                    </strong>
                  </div>
                  {isTooHeavy ? (
                    <div className="text-[10px] text-red-400 mt-1.5 bg-red-950/15 border border-red-900/30 p-2 rounded leading-normal font-mono flex items-start space-x-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>SINKING HAZARD: Structure is heavier than displaced seawater mass! Improve beam/length or select aluminum/carbon.</span>
                    </div>
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Available Payload Capacity:</span>
                      <strong className="font-mono text-emerald-400">{reserveBuoyancy.toFixed(2)} t</strong>
                    </div>
                  )}
                </div>

                {/* Stability Assessment */}
                <hr className="border-slate-850" />
                <div className="space-y-1 font-sans">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Est. Metacentric Height (GM):</span>
                    <strong className={`font-mono ${actualGM > 0.5 ? 'text-emerald-400' : actualGM > 0.1 ? 'text-amber-400' : 'text-red-400'} font-bold`}>
                      {actualGM.toFixed(3)} m
                    </strong>
                  </div>
                  <div className={`p-2 rounded border text-[10px] font-mono leading-normal mt-1.5 ${stabilityStatus.bg} ${stabilityStatus.border} ${stabilityStatus.color}`}>
                    <strong className="block mb-0.5">Status: {stabilityStatus.label}</strong>
                    {actualGM > 1.5 && "High righting energy. Highly stable but may experience sharp rolling cycles."}
                    {actualGM >= 0.5 && actualGM <= 1.5 && "Perfect balance. Combines comfortable motion periods with solid safety recovery curves."}
                    {actualGM > 0.1 && actualGM < 0.5 && "Marginal stability. Recommend choosing a lighter material or widening the hull beam."}
                    {actualGM <= 0.1 && "Dangerous top-heaviness! Extremely high capsize hazard. Lightship needs ballast or width extension."}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
