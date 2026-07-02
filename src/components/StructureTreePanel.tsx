/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { HullParameters } from '../types';
import { 
  Folder, 
  File, 
  ChevronRight, 
  ChevronDown, 
  Layers, 
  Settings, 
  Scale, 
  AlertTriangle, 
  CheckCircle, 
  ShieldAlert,
  Info,
  Sliders,
  HardDrive,
  Compass,
  ShieldCheck,
  Sparkles,
  Eye,
  EyeOff,
  PlusCircle
} from 'lucide-react';

interface StructureTreePanelProps {
  parameters: HullParameters;
  onParameterChange?: (newVals: Partial<HullParameters>) => void;
}

// Predefined materials matching the ones used in ViewportsContainer
const MATERIALS = {
  steel: { name: 'Mild Steel A36', yield: 250, density: 7850, modulus: 200 },
  highsteel: { name: 'High-Tensile AH36', yield: 355, density: 7850, modulus: 210 },
  aluminum: { name: 'Marine Al 5083', yield: 145, density: 2660, modulus: 70 },
  composite: { name: 'Carbon Fiber / Epoxy', yield: 450, density: 1600, modulus: 135 }
};

const FRAME_PROFILES = {
  'T-Profile 300x150': { name: 'Welded T-Profile 300x150x10/12', area: 0.0051, depth: 300, label: 'High Rigidity' },
  'T-Profile 400x200': { name: 'Welded T-Profile 400x200x12/16', area: 0.0078, depth: 400, label: 'Extreme Rigidity' },
  'L-Profile 250x90': { name: 'Rolled L-Profile 250x90x10', area: 0.0033, depth: 250, label: 'Medium Rigidity' },
  'Bulb Flat 200x10': { name: 'HP Bulb Flat 200x10', area: 0.0021, depth: 200, label: 'Standard Marine' },
  'Flat Bar 150x12': { name: 'Flat Bar 150x12', area: 0.0018, depth: 150, label: 'Light Weight' }
};

export default function StructureTreePanel({ parameters, onParameterChange }: StructureTreePanelProps) {
  // Local structural options derived from global parameters or defaults
  const frameSpacing = parameters.frameSpacing ?? 0.8;
  const frameAngle = parameters.frameAngle ?? 0;
  const frameProfile = (parameters.frameProfile as keyof typeof FRAME_PROFILES) ?? 'T-Profile 300x150';
  const frameThickness = parameters.frameThickness ?? 12;
  const showFrameOverlay = parameters.showFrameOverlay ?? true;
  const frameOverlayColor = parameters.frameOverlayColor ?? 'cyan';

  const [hoveredFrameIdx, setHoveredFrameIdx] = useState<number | null>(null);

  const [bottomPlatingThickness, setBottomPlatingThickness] = useState<number>(16); // mm
  const [sidePlatingThickness, setSidePlatingThickness] = useState<number>(12); // mm
  const [deckPlatingThickness, setDeckPlatingThickness] = useState<number>(10); // mm
  const [bulkheadCount, setBulkheadCount] = useState<number>(6);
  const [selectedMaterial, setSelectedMaterial] = useState<keyof typeof MATERIALS>('steel');

  // Assembly tree UI states
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    root: true,
    plating: true,
    frames: true,
    bulkheads: true,
    girders: true
  });
  const [selectedItem, setSelectedItem] = useState<string>('plating_bottom');

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  // Dynamic structural calculations
  const structuralMetrics = useMemo(() => {
    const L = parameters.length;
    const B = parameters.beam;
    const D = parameters.depth;
    const T = parameters.draft;
    const material = MATERIALS[selectedMaterial];

    // Estimated shell surface area
    const bottomArea = L * B * 0.85;
    const sideArea = L * D * 2.1;
    const deckArea = L * B * 0.92;

    // Weight of plating (tonnes = Area * thickness(m) * density(kg/m3) / 1000)
    const bottomWeight = (bottomArea * (bottomPlatingThickness / 1000) * material.density) / 1000;
    const sideWeight = (sideArea * (sidePlatingThickness / 1000) * material.density) / 1000;
    const deckWeight = (deckArea * (deckPlatingThickness / 1000) * material.density) / 1000;
    const platingWeight = bottomWeight + sideWeight + deckWeight;

    // Frames calculation (accounting for angle/tilt and custom profile area)
    const totalFrames = Math.floor(L / frameSpacing);
    const angleFactor = 1 / Math.max(0.707, Math.cos((frameAngle * Math.PI) / 180)); // prevent division by zero or excessive weight spikes
    const profileArea = FRAME_PROFILES[frameProfile]?.area || 0.0051;
    const thicknessFactor = frameThickness / 12; // relative to a 12mm baseline web plate
    const frameWeight = (totalFrames * (B + D * 2) * angleFactor * profileArea * thicknessFactor * material.density) / 1000;

    // Bulkheads calculation
    const bhCount = (parameters.bulkheads || []).length;
    const bulkheadArea = B * D * 0.75; // average section area
    const bulkheadWeight = (bhCount * bulkheadArea * 0.012 * material.density) / 1000;

    // Keel & longitudinal girders
    const keelWeight = (L * 1.2 * 0.024 * material.density) / 1000;

    const totalWeight = platingWeight + frameWeight + bulkheadWeight + keelWeight;

    // Section modulus approximation (I/y in m^3)
    const bottomAreaEquivalent = bottomArea * (bottomPlatingThickness / 1000);
    const deckAreaEquivalent = deckArea * (deckPlatingThickness / 1000);
    const neutralAxisZ = (bottomAreaEquivalent * 0 + deckAreaEquivalent * D) / (bottomAreaEquivalent + deckAreaEquivalent || 1);
    const inertia = (bottomAreaEquivalent * Math.pow(neutralAxisZ, 2)) + (deckAreaEquivalent * Math.pow(D - neutralAxisZ, 2));
    const sectionModulus = inertia / Math.max(0.1, D - neutralAxisZ);

    // Structural safety scoring
    // Section modulus required by class rules (I/y_req is proportional to L^2 * B)
    const requiredModulus = Math.pow(L, 2) * B * 0.000018; // rule of thumb
    
    // Slight angle penalty for excessive framing tilt (cant frames reduce pure vertical girder stiffness slightly)
    const anglePenalty = Math.max(0.85, 1 - Math.abs(frameAngle) / 300);
    const safetyIndex = (sectionModulus / Math.max(0.00001, requiredModulus)) * anglePenalty;

    return {
      platingWeight,
      frameWeight,
      bulkheadWeight,
      keelWeight,
      totalWeight,
      sectionModulus,
      requiredModulus,
      safetyIndex,
      totalFrames,
      neutralAxisZ
    };
  }, [parameters, frameSpacing, bottomPlatingThickness, sidePlatingThickness, deckPlatingThickness, selectedMaterial, frameAngle, frameProfile, frameThickness]);

  // Synchronize/initialize bulkheads list inside parameters if not present or empty
  useEffect(() => {
    if (!parameters.bulkheads || parameters.bulkheads.length === 0) {
      const initialBh = [];
      const count = 5;
      const step = parameters.length / (count + 1);
      for (let i = 1; i <= count; i++) {
        const pos = parseFloat((step * i).toFixed(1));
        initialBh.push({
          id: `bh_transverse_${i}_${Math.random().toString(36).substr(2, 6)}`,
          type: 'transverse' as const,
          position: pos,
          thickness: 12,
          stress: parseFloat((140 - Math.abs(pos - parameters.length / 2) * 0.5).toFixed(1))
        });
      }
      // Add two longitudinal bulkheads
      initialBh.push({
        id: `bh_longitudinal_1_${Math.random().toString(36).substr(2, 6)}`,
        type: 'longitudinal' as const,
        position: parseFloat((-parameters.beam * 0.2).toFixed(2)),
        thickness: 12,
        stress: 72.5
      });
      initialBh.push({
        id: `bh_longitudinal_2_${Math.random().toString(36).substr(2, 6)}`,
        type: 'longitudinal' as const,
        position: parseFloat((parameters.beam * 0.2).toFixed(2)),
        thickness: 12,
        stress: 72.5
      });
      onParameterChange?.({ bulkheads: initialBh });
    }
  }, [parameters.length, parameters.beam]);

  const bulkheadsList = useMemo(() => {
    return parameters.bulkheads || [];
  }, [parameters.bulkheads]);

  const transverseBulkheads = useMemo(() => {
    return bulkheadsList.filter(b => b.type === 'transverse');
  }, [bulkheadsList]);

  const longitudinalBulkheads = useMemo(() => {
    return bulkheadsList.filter(b => b.type === 'longitudinal');
  }, [bulkheadsList]);

  const activeBh = useMemo(() => {
    return bulkheadsList.find(b => b.id === selectedItem);
  }, [bulkheadsList, selectedItem]);

  // Sync selected bulkhead to global parameters for clash detection in 3D viewport
  useEffect(() => {
    if (selectedItem && (selectedItem.startsWith('bh_') || bulkheadsList.some(b => b.id === selectedItem))) {
      onParameterChange?.({ selectedBulkheadId: selectedItem });
    } else {
      onParameterChange?.({ selectedBulkheadId: undefined });
    }
  }, [selectedItem, onParameterChange, bulkheadsList]);

  // Handle click in SVG diagram to select item
  const handleSvgClick = (itemId: string) => {
    setSelectedItem(itemId);
  };

  return (
    <div className="flex flex-col lg:flex-row h-full bg-slate-950 text-slate-100 overflow-hidden" id="structure_tree_panel">
      {/* 1. Left Side: Interactive CAD Hierarchical Tree */}
      <div className="w-full lg:w-72 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 overflow-y-auto" id="cad_tree_sidebar">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80 sticky top-0 z-10">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>Vessel Assembly Tree</span>
          </h3>
          <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">CAD</span>
        </div>

        <div className="p-3 text-[11px] font-mono space-y-1 select-none">
          {/* Root node */}
          <div>
            <div 
              onClick={() => toggleExpand('root')}
              className={`flex items-center space-x-1 p-1 hover:bg-slate-850 rounded cursor-pointer ${selectedItem === 'root' ? 'bg-cyan-500/10 text-cyan-400' : 'text-slate-300'}`}
            >
              {expandedNodes.root ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <Folder className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
              <span className="font-semibold">{parameters.length.toFixed(0)}m Hull Assembly</span>
            </div>

            {expandedNodes.root && (
              <div className="pl-4 border-l border-slate-800 ml-2.5 mt-0.5 space-y-1">
                
                {/* Plating Node */}
                <div>
                  <div 
                    onClick={() => toggleExpand('plating')}
                    className="flex items-center space-x-1 p-1 hover:bg-slate-850 rounded cursor-pointer text-slate-300"
                  >
                    {expandedNodes.plating ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    <Folder className="w-3.5 h-3.5 text-amber-500 fill-amber-500/10" />
                    <span>Shell & Deck Plating</span>
                  </div>

                  {expandedNodes.plating && (
                    <div className="pl-4 border-l border-slate-800 ml-2.5 mt-0.5 space-y-0.5">
                      <div 
                        onClick={() => setSelectedItem('plating_bottom')}
                        className={`flex items-center space-x-2 p-1 rounded cursor-pointer ${selectedItem === 'plating_bottom' ? 'bg-cyan-500/10 text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        <File className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Bottom Shell Plating</span>
                      </div>
                      <div 
                        onClick={() => setSelectedItem('plating_side')}
                        className={`flex items-center space-x-2 p-1 rounded cursor-pointer ${selectedItem === 'plating_side' ? 'bg-cyan-500/10 text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        <File className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Side Shell Plating</span>
                      </div>
                      <div 
                        onClick={() => setSelectedItem('plating_deck')}
                        className={`flex items-center space-x-2 p-1 rounded cursor-pointer ${selectedItem === 'plating_deck' ? 'bg-cyan-500/10 text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        <File className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Strength Deck Plate</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Transverse Bulkheads Node */}
                <div>
                  <div 
                    onClick={() => toggleExpand('bulkheads')}
                    className="flex items-center space-x-1 p-1 hover:bg-slate-850 rounded cursor-pointer text-slate-300"
                  >
                    {expandedNodes.bulkheads ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    <Folder className="w-3.5 h-3.5 text-indigo-500 fill-indigo-500/10" />
                    <span>Transverse Bulkheads</span>
                  </div>

                  {expandedNodes.bulkheads && (
                    <div className="pl-4 border-l border-slate-800 ml-2.5 mt-0.5 space-y-0.5">
                      {transverseBulkheads.map((bh, i) => (
                        <div 
                          key={bh.id}
                          onClick={() => setSelectedItem(bh.id)}
                          className={`flex items-center space-x-2 p-1 rounded cursor-pointer ${selectedItem === bh.id ? 'bg-indigo-500/10 text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                          <File className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Trans. BH #{i+1} ({bh.position.toFixed(1)}m)</span>
                        </div>
                      ))}
                      {transverseBulkheads.length === 0 && (
                        <div className="text-[10px] text-slate-500 pl-5 italic">No transverse bulkheads</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Longitudinal Bulkheads Node */}
                <div>
                  <div 
                    onClick={() => toggleExpand('long_bulkheads')}
                    className="flex items-center space-x-1 p-1 hover:bg-slate-850 rounded cursor-pointer text-slate-300"
                  >
                    {expandedNodes.long_bulkheads ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    <Folder className="w-3.5 h-3.5 text-rose-500 fill-rose-500/10" />
                    <span>Longitudinal Bulkheads</span>
                  </div>

                  {expandedNodes.long_bulkheads && (
                    <div className="pl-4 border-l border-slate-800 ml-2.5 mt-0.5 space-y-0.5">
                      {longitudinalBulkheads.map((bh, i) => (
                        <div 
                          key={bh.id}
                          onClick={() => setSelectedItem(bh.id)}
                          className={`flex items-center space-x-2 p-1 rounded cursor-pointer ${selectedItem === bh.id ? 'bg-rose-500/10 text-rose-400 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                          <File className="w-3.5 h-3.5 text-rose-400" />
                          <span>Long. BH #{i+1} (Y = {bh.position.toFixed(2)}m)</span>
                        </div>
                      ))}
                      {longitudinalBulkheads.length === 0 && (
                        <div className="text-[10px] text-slate-500 pl-5 italic">No longitudinal bulkheads</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Transverse Framing Node */}
                <div>
                  <div 
                    onClick={() => toggleExpand('frames')}
                    className="flex items-center space-x-1 p-1 hover:bg-slate-850 rounded cursor-pointer text-slate-300"
                  >
                    {expandedNodes.frames ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    <Folder className="w-3.5 h-3.5 text-amber-500 fill-amber-500/10" />
                    <span>Transverse Framing</span>
                  </div>

                  {expandedNodes.frames && (
                    <div className="pl-4 border-l border-slate-800 ml-2.5 mt-0.5 space-y-0.5">
                      <div 
                        onClick={() => setSelectedItem('frames_midship')}
                        className={`flex items-center space-x-2 p-1 rounded cursor-pointer ${selectedItem === 'frames_midship' ? 'bg-cyan-500/10 text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        <File className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Web Frames (x{structuralMetrics.totalFrames})</span>
                      </div>
                      <div 
                        onClick={() => setSelectedItem('frames_stiffeners')}
                        className={`flex items-center space-x-2 p-1 rounded cursor-pointer ${selectedItem === 'frames_stiffeners' ? 'bg-cyan-500/10 text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        <File className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Side Plating Stiffeners</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Girders & Keel Node */}
                <div>
                  <div 
                    onClick={() => toggleExpand('girders')}
                    className="flex items-center space-x-1 p-1 hover:bg-slate-850 rounded cursor-pointer text-slate-300"
                  >
                    {expandedNodes.girders ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    <Folder className="w-3.5 h-3.5 text-amber-500 fill-amber-500/10" />
                    <span>Keel & Longitudinals</span>
                  </div>

                  {expandedNodes.girders && (
                    <div className="pl-4 border-l border-slate-800 ml-2.5 mt-0.5 space-y-0.5">
                      <div 
                        onClick={() => setSelectedItem('keel_plate')}
                        className={`flex items-center space-x-2 p-1 rounded cursor-pointer ${selectedItem === 'keel_plate' ? 'bg-cyan-500/10 text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        <File className="w-3.5 h-3.5 text-amber-400" />
                        <span>Center Keel Plate</span>
                      </div>
                      <div 
                        onClick={() => setSelectedItem('longitudinal_girders')}
                        className={`flex items-center space-x-2 p-1 rounded cursor-pointer ${selectedItem === 'longitudinal_girders' ? 'bg-cyan-500/10 text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        <File className="w-3.5 h-3.5 text-amber-400" />
                        <span>Bottom Long. Girders</span>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Center Panel: Structural Interactive Blueprints CAD Viewer */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-950 p-4 border-r border-slate-850 overflow-hidden" id="cad_canvas_container">
        {/* Profile / Longitudinal View */}
        <div className="flex-1 bg-slate-900/40 rounded-xl border border-slate-800 p-4 flex flex-col relative overflow-hidden mb-4 min-h-[160px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold tracking-wider">Hull Structural Elevation Profile (Longitudinal section)</span>
            <span className="text-[9px] font-mono text-emerald-400 border border-emerald-900/50 bg-emerald-950/20 px-1.5 py-0.5 rounded">AUTO-UPDATED BY PARAMETRICS</span>
          </div>
          
          <div className="flex-1 flex items-center justify-center relative">
            <svg viewBox="-20 -20 540 200" className="w-full max-w-2xl h-full" id="svg_elevation_structure">
              {/* Reference Grid */}
              <g stroke="#1e293b" strokeWidth="0.5" strokeDasharray="3,3">
                <line x1="0" y1="0" x2="500" y2="0" />
                <line x1="0" y1="40" x2="500" y2="40" />
                <line x1="0" y1="80" x2="500" y2="80" />
                <line x1="0" y1="120" x2="500" y2="120" />
                <line x1="0" y1="160" x2="500" y2="160" />
                {Array.from({ length: 11 }).map((_, i) => (
                  <line key={i} x1={i * 50} y1="-10" x2={i * 50} y2="170" />
                ))}
              </g>

              {/* Waterline indicator */}
              <line 
                x1="0" 
                y1={160 - (parameters.draft / parameters.depth) * 120} 
                x2="500" 
                y2={160 - (parameters.draft / parameters.depth) * 120} 
                stroke="rgba(6, 182, 212, 0.4)" 
                strokeWidth="1.5" 
                strokeDasharray="4,2" 
              />
              <text 
                x="15" 
                y={150 - (parameters.draft / parameters.depth) * 120} 
                fill="#22d3ee" 
                fontSize="7" 
                fontFamily="monospace"
              >
                DESIGN WATERLINE (T = {parameters.draft.toFixed(2)}m)
              </text>

              {/* Deck Profile line */}
              <path 
                d={`M 0,40 Q 250,55 500,20`} 
                fill="none" 
                stroke={selectedItem.startsWith('plating_deck') ? '#22d3ee' : '#cbd5e1'} 
                strokeWidth={selectedItem.startsWith('plating_deck') ? '3.5' : '1.8'} 
                className="cursor-pointer hover:stroke-cyan-400 transition-all"
                onClick={() => handleSvgClick('plating_deck')}
              />

              {/* Keel Line */}
              <path 
                d={`M 0,160 Q 250,165 500,145`} 
                fill="none" 
                stroke={selectedItem.startsWith('keel_plate') ? '#22d3ee' : '#475569'} 
                strokeWidth={selectedItem.startsWith('keel_plate') ? '4' : '2'} 
                className="cursor-pointer hover:stroke-cyan-400 transition-all"
                onClick={() => handleSvgClick('keel_plate')}
              />

              {/* Bulkheads (Watertight partitions) */}
              {Array.from({ length: bulkheadCount }).map((_, idx) => {
                const xVal = (500 / (bulkheadCount + 1)) * (idx + 1);
                // Simple deck-keel interpolation
                const yDeck = 40 + (xVal / 500) * (idx * 0.5) + (xVal < 250 ? (250 - xVal) / 20 : (xVal - 250) / 28);
                const yKeel = 160 + (xVal < 250 ? (xVal / 250) * 2 : 2 - (xVal - 250) / 100);
                const isSelected = selectedItem === `bulkhead_${idx + 1}`;
                return (
                  <g key={idx} className="cursor-pointer" onClick={() => handleSvgClick(`bulkhead_${idx + 1}`)}>
                    <line 
                      x1={xVal} 
                      y1={yDeck} 
                      x2={xVal} 
                      y2={yKeel} 
                      stroke={isSelected ? '#22d3ee' : '#818cf8'} 
                      strokeWidth={isSelected ? '3.5' : '1.5'} 
                      className="hover:stroke-cyan-400 transition-all"
                    />
                    <circle cx={xVal} cy={(yDeck + yKeel) / 2} r="3.5" fill={isSelected ? '#22d3ee' : '#312e81'} stroke="#818cf8" strokeWidth="1" />
                    <text x={xVal - 14} y={yDeck - 5} fill="#818cf8" fontSize="6" fontFamily="monospace">BH {idx + 1}</text>
                  </g>
                );
              })}

              {/* Transverse frames (Stiffeners drawn as thin vertical gray lines) */}
              {showFrameOverlay && Array.from({ length: structuralMetrics.totalFrames }).map((_, idx) => {
                const frameNumber = idx + 1;
                const x_meters = frameNumber * frameSpacing;
                if (x_meters >= parameters.length) return null;

                const xVal = (x_meters / parameters.length) * 500;

                // Exclude bulkhead overlaps
                const overlapsBulkhead = Array.from({ length: bulkheadCount }).some((_, bIdx) => {
                  const bhX = (500 / (bulkheadCount + 1)) * (bIdx + 1);
                  return Math.abs(xVal - bhX) < 4.5;
                });
                if (overlapsBulkhead) return null;

                const t = xVal / 500;
                // Bezier-based Deck and Keel Y coordinates
                const yDeck = (1 - t) * (1 - t) * 40 + 2 * (1 - t) * t * 55 + t * t * 20;
                const yKeel = (1 - t) * (1 - t) * 160 + 2 * (1 - t) * t * 165 + t * t * 145;
                const yMid = (yDeck + yKeel) / 2;
                const h = yKeel - yDeck;

                // Angle/tilt calculation
                const rad = (frameAngle * Math.PI) / 180;
                const dx = (h / 2) * Math.sin(rad);
                const dy = (h / 2) * Math.cos(rad);

                const xTop = xVal + dx;
                const yTop = yMid - dy;
                const xBottom = xVal - dx;
                const yBottom = yMid + dy;

                const isSelected = selectedItem.startsWith('frames');
                const isHovered = hoveredFrameIdx === frameNumber;
                
                // Overlay color theme mapping
                const themeColors = {
                  cyan: { main: '#22d3ee', faded: 'rgba(34, 211, 238, 0.65)' },
                  amber: { main: '#fbbf24', faded: 'rgba(251, 191, 36, 0.65)' },
                  emerald: { main: '#34d399', faded: 'rgba(52, 211, 153, 0.65)' }
                };
                const activeColor = themeColors[frameOverlayColor as keyof typeof themeColors] || themeColors.cyan;

                return (
                  <g key={frameNumber}>
                    <line 
                      x1={xTop} 
                      y1={yTop + 1} 
                      x2={xBottom} 
                      y2={yBottom - 1} 
                      stroke={isHovered ? '#f59e0b' : isSelected ? activeColor.main : activeColor.faded} 
                      strokeWidth={isHovered ? '2.5' : isSelected ? '1.5' : '0.8'} 
                      className="cursor-pointer transition-all"
                      onMouseEnter={() => setHoveredFrameIdx(frameNumber)}
                      onMouseLeave={() => setHoveredFrameIdx(null)}
                      onClick={() => handleSvgClick('frames_midship')}
                    />
                    {isHovered && (
                      <g style={{ pointerEvents: 'none' }}>
                        {/* Interactive HUD bubble near the frame midpoint */}
                        <rect 
                          x={Math.max(10, Math.min(370, xVal - 60))} 
                          y={Math.max(10, yMid - 60)} 
                          width="120" 
                          height="50" 
                          rx="4" 
                          fill="rgba(15, 23, 42, 0.95)" 
                          stroke="#f59e0b" 
                          strokeWidth="1" 
                          filter="drop-shadow(0px 2px 4px rgba(0,0,0,0.5))"
                        />
                        <text x={Math.max(16, Math.min(376, xVal - 54))} y={Math.max(10, yMid - 60) + 12} fill="#f59e0b" fontSize="7" fontFamily="monospace" fontWeight="bold">
                          FRAME ST. #{frameNumber}
                        </text>
                        <text x={Math.max(16, Math.min(376, xVal - 54))} y={Math.max(10, yMid - 60) + 21} fill="#e2e8f0" fontSize="6.5" fontFamily="monospace">
                          POS: {x_meters.toFixed(2)}m (AFT)
                        </text>
                        <text x={Math.max(16, Math.min(376, xVal - 54))} y={Math.max(10, yMid - 60) + 30} fill="#94a3b8" fontSize="6" fontFamily="monospace">
                          TILT: {frameAngle}° / {frameProfile.split(' ')[0]}
                        </text>
                        <text x={Math.max(16, Math.min(376, xVal - 54))} y={Math.max(10, yMid - 60) + 39} fill="#34d399" fontSize="6.5" fontFamily="monospace">
                          SPAN: {((h / 120) * parameters.depth).toFixed(2)}m
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Labels */}
              <text x="5" y="195" fill="#475569" fontSize="7" fontFamily="monospace">STERN (AFT PEAK)</text>
              <text x="430" y="195" fill="#475569" fontSize="7" fontFamily="monospace">BOW (FORE PEAK)</text>
              <text x="220" y="195" fill="#475569" fontSize="7" fontFamily="monospace">MIDSHIP FRAME SECTION</text>
            </svg>
          </div>
        </div>

        {/* Midship Transverse Cross Section View */}
        <div className="flex-1 bg-slate-900/40 rounded-xl border border-slate-800 p-4 flex flex-col relative overflow-hidden min-h-[160px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold tracking-wider">Midship Structural Cross Section (Transverse Web Frame)</span>
            <span className="text-[9px] font-mono text-cyan-400">DETAIL IN BREADTH</span>
          </div>

          <div className="flex-1 flex items-center justify-center relative">
            <svg viewBox="-120 -20 240 180" className="w-full max-w-sm h-full" id="svg_cross_section_structure">
              {/* Symmetry midline */}
              <line x1="0" y1="-10" x2="0" y2="155" stroke="#334155" strokeWidth="0.5" strokeDasharray="5,3" />

              {/* Structural plating boundaries */}
              {/* Strength deck plating (horizontal) */}
              <line 
                x1="-100" 
                y1="0" 
                x2="100" 
                y2="0" 
                stroke={selectedItem === 'plating_deck' ? '#22d3ee' : '#cbd5e1'} 
                strokeWidth={selectedItem === 'plating_deck' ? '4' : '1.8'} 
                className="cursor-pointer hover:stroke-cyan-400"
                onClick={() => handleSvgClick('plating_deck')}
              />

              {/* Bottom shell plating */}
              <path 
                d="M -100,0 C -105,70 -70,140 -20,150 L 0,152 L 20,150 C 70,140 105,70 100,0" 
                fill="none" 
                stroke={selectedItem === 'plating_bottom' || selectedItem === 'plating_side' ? '#22d3ee' : '#94a3b8'} 
                strokeWidth={selectedItem === 'plating_bottom' || selectedItem === 'plating_side' ? '3.5' : '1.8'} 
                className="cursor-pointer hover:stroke-cyan-400"
                onClick={() => handleSvgClick('plating_bottom')}
              />

              {/* Center Keel bracket & plate */}
              <rect 
                x="-12" 
                y="135" 
                width="24" 
                height="17" 
                fill="none" 
                stroke={selectedItem === 'keel_plate' ? '#22d3ee' : '#64748b'} 
                strokeWidth={selectedItem === 'keel_plate' ? '3' : '1.5'} 
                className="cursor-pointer hover:stroke-cyan-400"
                onClick={() => handleSvgClick('keel_plate')}
              />

              {/* Side Web Frame brackets */}
              <path 
                d="M -90,0 L -90,40 L -75,0 Z" 
                fill="none" 
                stroke={selectedItem.startsWith('frames') ? '#34d399' : '#334155'} 
                strokeWidth="1" 
              />
              <path 
                d="M 90,0 L 90,40 L 75,0 Z" 
                fill="none" 
                stroke={selectedItem.startsWith('frames') ? '#34d399' : '#334155'} 
                strokeWidth="1" 
              />

              {/* Longitudinal Girders */}
              <line x1="-50" y1="110" x2="-50" y2="140" stroke={selectedItem === 'longitudinal_girders' ? '#22d3ee' : '#475569'} strokeWidth="2" className="cursor-pointer" onClick={() => handleSvgClick('longitudinal_girders')} />
              <line x1="50" y1="110" x2="50" y2="140" stroke={selectedItem === 'longitudinal_girders' ? '#22d3ee' : '#475569'} strokeWidth="2" className="cursor-pointer" onClick={() => handleSvgClick('longitudinal_girders')} />

              {/* Section indicators */}
              <text x="-95" y="-6" fill="#cbd5e1" fontSize="5" fontFamily="monospace">STRENGTH DECK PLATE</text>
              <text x="-118" y="70" fill="#94a3b8" fontSize="5" fontFamily="monospace">SIDE SHELL ({sidePlatingThickness}mm)</text>
              <text x="-48" y="152" fill="#94a3b8" fontSize="5" fontFamily="monospace">BOTTOM PLATE ({bottomPlatingThickness}mm)</text>
              <text x="8" y="142" fill="#64748b" fontSize="5" fontFamily="monospace">CENTER KEEL PLATE</text>
            </svg>
          </div>
        </div>
      </div>

      {/* 3. Right Panel: Inspector and Real-time Calculator Settings */}
      <div className="w-full lg:w-80 bg-slate-900 flex flex-col shrink-0 overflow-y-auto" id="structure_inspector_sidebar">
        
        {/* Selected Part Details Inspector */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/40">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center space-x-1.5">
            <Info className="w-4 h-4 text-cyan-400" />
            <span>Part Inspector</span>
          </h3>

          <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 space-y-3 font-mono text-xs">
            {selectedItem === 'plating_bottom' && (
              <>
                <div className="text-cyan-400 font-bold border-b border-slate-800 pb-1.5 uppercase">Bottom Shell Plating</div>
                <div className="flex justify-between"><span>Thickness:</span><span className="text-white font-bold">{bottomPlatingThickness} mm</span></div>
                <div className="flex justify-between"><span>Material:</span><span className="text-white">{MATERIALS[selectedMaterial].name}</span></div>
                <div className="flex justify-between"><span>Local Area:</span><span className="text-slate-300">{(parameters.length * parameters.beam * 0.85).toFixed(1)} m²</span></div>
                <div className="flex justify-between"><span>Estimated Weight:</span><span className="text-emerald-400 font-bold">{((parameters.length * parameters.beam * 0.85 * (bottomPlatingThickness / 1000) * MATERIALS[selectedMaterial].density) / 1000).toFixed(1)} t</span></div>
                <div className="flex justify-between"><span>Safety Factor:</span><span className="text-emerald-400 font-bold">2.45x (Safe)</span></div>
                <div className="text-[10px] text-slate-500 italic mt-2">Forms the watertight flat bottom structure of the ship hull. Sized to withstand hydrostatic pressure heads and docking load distributions.</div>
              </>
            )}

            {selectedItem === 'plating_side' && (
              <>
                <div className="text-cyan-400 font-bold border-b border-slate-800 pb-1.5 uppercase">Side Shell Plating</div>
                <div className="flex justify-between"><span>Thickness:</span><span className="text-white font-bold">{sidePlatingThickness} mm</span></div>
                <div className="flex justify-between"><span>Material:</span><span className="text-white">{MATERIALS[selectedMaterial].name}</span></div>
                <div className="flex justify-between"><span>Local Area:</span><span className="text-slate-300">{(parameters.length * parameters.depth * 2.1).toFixed(1)} m²</span></div>
                <div className="flex justify-between"><span>Estimated Weight:</span><span className="text-emerald-400 font-bold">{((parameters.length * parameters.depth * 2.1 * (sidePlatingThickness / 1000) * MATERIALS[selectedMaterial].density) / 1000).toFixed(1)} t</span></div>
                <div className="flex justify-between"><span>Safety Factor:</span><span className="text-emerald-400 font-bold">2.12x (Safe)</span></div>
                <div className="text-[10px] text-slate-500 italic mt-2">Encloses the ship sides from the bilge to the deck sheer level. Thickest at the shear strake near midship.</div>
              </>
            )}

            {selectedItem === 'plating_deck' && (
              <>
                <div className="text-cyan-400 font-bold border-b border-slate-800 pb-1.5 uppercase">Strength Deck Plate</div>
                <div className="flex justify-between"><span>Thickness:</span><span className="text-white font-bold">{deckPlatingThickness} mm</span></div>
                <div className="flex justify-between"><span>Material:</span><span className="text-white">{MATERIALS[selectedMaterial].name}</span></div>
                <div className="flex justify-between"><span>Local Area:</span><span className="text-slate-300">{(parameters.length * parameters.beam * 0.92).toFixed(1)} m²</span></div>
                <div className="flex justify-between"><span>Estimated Weight:</span><span className="text-emerald-400 font-bold">{((parameters.length * parameters.beam * 0.92 * (deckPlatingThickness / 1000) * MATERIALS[selectedMaterial].density) / 1000).toFixed(1)} t</span></div>
                <div className="flex justify-between"><span>Safety Factor:</span><span className="text-amber-400 font-bold">1.54x (Marginal)</span></div>
                <div className="text-[10px] text-slate-500 italic mt-2">The topmost continuous watertight plate that completes the hull girder. High-stress region during hogging/sagging bending cycles.</div>
              </>
            )}

            {activeBh && (
              <>
                <div className="text-cyan-400 font-bold border-b border-slate-800 pb-1.5 uppercase flex justify-between items-center">
                  <span>{activeBh.type === 'transverse' ? 'Transverse BH' : 'Longitudinal BH'}</span>
                  <span className="text-[10px] text-slate-500">ID: {activeBh.id.substring(3, 10)}</span>
                </div>
                <div className="flex justify-between"><span>Type:</span><span className="text-white font-bold capitalize">{activeBh.type}</span></div>
                <div className="flex justify-between">
                  <span>Position:</span>
                  <span className="text-white font-bold">
                    {activeBh.type === 'transverse' ? `${activeBh.position.toFixed(1)} m` : `Y = ${activeBh.position.toFixed(2)} m`}
                  </span>
                </div>
                <div className="flex justify-between"><span>Thickness:</span><span className="text-white font-bold">{activeBh.thickness} mm</span></div>
                <div className="flex justify-between">
                  <span>Function:</span>
                  <span className={activeBh.type === 'transverse' && activeBh.position < parameters.length * 0.15 ? 'text-rose-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                    {activeBh.type === 'transverse' && activeBh.position < parameters.length * 0.15 ? 'Collision' : 'Watertight'}
                  </span>
                </div>
                <div className="flex justify-between"><span>Local Stress:</span><span className="text-amber-400 font-bold">{(activeBh.stress || 85).toFixed(1)} MPa</span></div>
                <div className="flex justify-between"><span>Safety Factor:</span><span className="text-emerald-400 font-bold">{(250 / (activeBh.stress || 85)).toFixed(2)}x (Safe)</span></div>
                
                {/* Sliders specifically inside Inspector for selected item! */}
                <div className="border-t border-slate-800 pt-3 mt-3 space-y-3 font-sans">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Configure Bulkhead</div>
                  
                  <div>
                    <div className="flex justify-between text-xs mb-1 font-mono">
                      <span className="text-slate-400">Position</span>
                      <span className="text-cyan-400 font-bold">
                        {activeBh.type === 'transverse' ? `${activeBh.position.toFixed(1)} m` : `${activeBh.position.toFixed(2)} m`}
                      </span>
                    </div>
                    <input 
                      type="range"
                      min={activeBh.type === 'transverse' ? "0" : (-parameters.beam / 2).toFixed(2)}
                      max={activeBh.type === 'transverse' ? parameters.length.toFixed(1) : (parameters.beam / 2).toFixed(2)}
                      step={activeBh.type === 'transverse' ? "0.1" : "0.05"}
                      value={activeBh.position}
                      onChange={(e) => {
                        const newPos = parseFloat(e.target.value);
                        const updated = (parameters.bulkheads || []).map(b => 
                          b.id === activeBh.id ? { 
                            ...b, 
                            position: newPos,
                            // Dynamic stress calculation based on position
                            stress: b.type === 'transverse' 
                              ? parseFloat((140 - Math.abs(newPos - parameters.length / 2) * 0.5).toFixed(1))
                              : parseFloat((95 - Math.abs(newPos) * 5.0).toFixed(1))
                          } : b
                        );
                        onParameterChange?.({ 
                          bulkheads: updated,
                          isMovingBulkhead: true
                        });
                      }}
                      onMouseUp={() => onParameterChange?.({ isMovingBulkhead: false })}
                      onTouchEnd={() => onParameterChange?.({ isMovingBulkhead: false })}
                      className="w-full accent-cyan-500 bg-slate-800 rounded-lg appearance-none h-1.5 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1 font-mono">
                      <span className="text-slate-400">Thickness</span>
                      <span className="text-cyan-400 font-bold">{activeBh.thickness} mm</span>
                    </div>
                    <input 
                      type="range"
                      min="6"
                      max="30"
                      step="1"
                      value={activeBh.thickness}
                      onChange={(e) => {
                        const newTh = parseInt(e.target.value);
                        const updated = (parameters.bulkheads || []).map(b => 
                          b.id === activeBh.id ? { ...b, thickness: newTh } : b
                        );
                        onParameterChange?.({ 
                          bulkheads: updated,
                          isMovingBulkhead: true
                        });
                      }}
                      onMouseUp={() => onParameterChange?.({ isMovingBulkhead: false })}
                      onTouchEnd={() => onParameterChange?.({ isMovingBulkhead: false })}
                      className="w-full accent-cyan-500 bg-slate-800 rounded-lg appearance-none h-1.5 cursor-pointer"
                    />
                  </div>

                  <button
                    onClick={() => {
                      const updated = (parameters.bulkheads || []).filter(b => b.id !== activeBh.id);
                      onParameterChange?.({ bulkheads: updated });
                      setSelectedItem('root');
                    }}
                    className="w-full mt-2 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg font-bold text-xs transition-colors flex items-center justify-center space-x-1.5 font-sans"
                  >
                    <span>🗑️ Delete Bulkhead</span>
                  </button>
                </div>
              </>
            )}

            {selectedItem === 'frames_midship' && (
              <>
                <div className="text-cyan-400 font-bold border-b border-slate-800 pb-1.5 uppercase">Transverse Web Frames</div>
                <div className="flex justify-between"><span>Spacing:</span><span className="text-white font-bold">{frameSpacing} m</span></div>
                <div className="flex justify-between"><span>Total Frames:</span><span className="text-white font-bold">{structuralMetrics.totalFrames}</span></div>
                <div className="flex justify-between"><span>Web Profile:</span><span className="text-white font-bold">{frameProfile}</span></div>
                <div className="flex justify-between"><span>Web Thickness:</span><span className="text-white">{frameThickness} mm</span></div>
                <div className="flex justify-between"><span>Orientation Angle:</span><span className={`font-bold ${Math.abs(frameAngle) > 0 ? 'text-amber-400' : 'text-slate-300'}`}>{frameAngle}° {frameAngle === 0 ? '(Perpendicular)' : frameAngle > 0 ? '(Cant Forward)' : '(Cant Aft)'}</span></div>
                <div className="flex justify-between"><span>Estimated Weight:</span><span className="text-emerald-400 font-bold">{structuralMetrics.frameWeight.toFixed(1)} t</span></div>
                <div className="flex justify-between"><span>Safety Factor:</span><span className="text-emerald-400 font-bold">{(2.68 * (frameThickness / 12) * (Math.max(0.75, 1 - Math.abs(frameAngle)/150))).toFixed(2)}x (Safe)</span></div>
                <div className="text-[10px] text-slate-500 italic mt-2">Ring frame stiffeners distributed transversely to support the shell plate panels and resist crushing pressures.</div>
              </>
            )}

            {selectedItem === 'frames_stiffeners' && (
              <>
                <div className="text-cyan-400 font-bold border-b border-slate-800 pb-1.5 uppercase">Side Plating Stiffeners</div>
                <div className="flex justify-between"><span>Section:</span><span className="text-white">HP Flat Bar 120x8</span></div>
                <div className="flex justify-between"><span>Spacing:</span><span className="text-slate-300">0.75 m</span></div>
                <div className="flex justify-between"><span>Yield Limit:</span><span className="text-slate-300">{MATERIALS[selectedMaterial].yield} MPa</span></div>
                <div className="flex justify-between"><span>Safety Factor:</span><span className="text-emerald-400 font-bold">3.10x (Safe)</span></div>
                <div className="text-[10px] text-slate-500 italic mt-2">Longitudinal stiffeners welded on side shell plating to resist local buckling under high bending loads.</div>
              </>
            )}

            {selectedItem === 'keel_plate' && (
              <>
                <div className="text-cyan-400 font-bold border-b border-slate-800 pb-1.5 uppercase">Center Keel Plate</div>
                <div className="flex justify-between"><span>Plating Thickness:</span><span className="text-white font-bold">22 mm</span></div>
                <div className="flex justify-between"><span>Plating Width:</span><span className="text-slate-300">1200 mm</span></div>
                <div className="flex justify-between"><span>Total Weight:</span><span className="text-emerald-400 font-bold">{structuralMetrics.keelWeight.toFixed(1)} t</span></div>
                <div className="flex justify-between"><span>Safety Factor:</span><span className="text-emerald-400 font-bold">4.20x (Excellent)</span></div>
                <div className="text-[10px] text-slate-500 italic mt-2">The heavy backbone center-line structural plate. Anchors keel girders and withstands bottom impact or grounding loads.</div>
              </>
            )}

            {selectedItem === 'longitudinal_girders' && (
              <>
                <div className="text-cyan-400 font-bold border-b border-slate-800 pb-1.5 uppercase">Longitudinal Girders</div>
                <div className="flex justify-between"><span>Number of Girders:</span><span className="text-white">4 (2 per side)</span></div>
                <div className="flex justify-between"><span>Web Plate:</span><span className="text-slate-300">10 mm thickness</span></div>
                <div className="flex justify-between"><span>Primary Stress:</span><span className="text-slate-300">45 MPa</span></div>
                <div className="flex justify-between"><span>Safety Factor:</span><span className="text-emerald-400 font-bold">3.65x (Safe)</span></div>
                <div className="text-[10px] text-slate-500 italic mt-2">Longitudinal vertical webs placed parallel to the keel. Essential for maintaining general longitudinal bending stiffness.</div>
              </>
            )}

            {selectedItem === 'root' && (
              <>
                <div className="text-cyan-400 font-bold border-b border-slate-800 pb-1.5 uppercase">Hull Assembly Structure</div>
                <div className="flex justify-between"><span>Vessel Length:</span><span className="text-white">{parameters.length.toFixed(1)} m</span></div>
                <div className="flex justify-between"><span>Total Structural Weight:</span><span className="text-emerald-400 font-bold">{structuralMetrics.totalWeight.toFixed(1)} t</span></div>
                <div className="flex justify-between"><span>General Safety Index:</span><span className="text-white">{structuralMetrics.safetyIndex.toFixed(2)}x</span></div>
                <div className="text-[10px] text-slate-500 italic mt-2">Select any component in the assembly tree on the left to inspect detailed properties or edit settings.</div>
              </>
            )}
          </div>
        </div>

        {/* Real-time Structural Parameter Sliders */}
        <div className="p-4 flex-1 space-y-4" id="scantling_settings_sliders">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span>Structural Settings</span>
          </h3>

          <div className="space-y-4 font-mono text-xs">
            {/* Scantling Material Selector */}
            <div className="space-y-1.5 bg-slate-950 p-3 rounded-lg border border-slate-850">
              <label className="text-[11px] text-slate-400 uppercase font-bold block">Hull Material Spec</label>
              <select
                value={selectedMaterial}
                onChange={(e) => setSelectedMaterial(e.target.value as any)}
                className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-cyan-400 outline-none"
              >
                <option value="steel">Mild Steel A36 (Yield: 250 MPa)</option>
                <option value="highsteel">High-Tensile AH36 (Yield: 355 MPa)</option>
                <option value="aluminum">Marine Aluminum 5083 (Yield: 145 MPa)</option>
                <option value="composite">Carbon Fiber Epoxy (Yield: 450 MPa)</option>
              </select>
            </div>

            {/* Structural Framing Editor Section */}
            <div className="bg-slate-950 p-3 rounded-lg border border-cyan-900/30 space-y-3.5" id="structural_framing_editor">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span className="text-[11px] text-cyan-400 font-bold uppercase tracking-wide flex items-center space-x-1">
                  <Compass className="w-3.5 h-3.5" />
                  <span>Structural Framing</span>
                </span>
                <span className="text-[9px] font-mono text-slate-500">STATIONS</span>
              </div>

              {/* Frame Spacing slider */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-[10px] text-slate-400">FRAME SPACING</span>
                  <span className="text-cyan-400 font-bold">{frameSpacing.toFixed(2)} m</span>
                </div>
                <input
                  type="range"
                  min="0.4"
                  max="1.8"
                  step="0.05"
                  value={frameSpacing}
                  onChange={(e) => onParameterChange?.({ frameSpacing: Number(e.target.value) })}
                  className="w-full accent-cyan-500 cursor-pointer h-1 rounded bg-slate-800"
                />
                <span className="text-[8px] text-slate-500 block italic leading-none">
                  Recommended range: 0.50m - 1.50m.
                </span>
              </div>

              {/* Frame Orientation Angle slider */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-[10px] text-slate-400">ORIENTATION ANGLE</span>
                  <span className={`font-bold ${frameAngle === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>{frameAngle}°</span>
                </div>
                <input
                  type="range"
                  min="-45"
                  max="45"
                  step="5"
                  value={frameAngle}
                  onChange={(e) => onParameterChange?.({ frameAngle: Number(e.target.value) })}
                  className="w-full accent-cyan-500 cursor-pointer h-1 rounded bg-slate-800"
                />
                <div className="flex justify-between text-[8px] text-slate-500">
                  <span>Cant Aft (-45°)</span>
                  <span>Perp (0°)</span>
                  <span>Cant Fwd (45°)</span>
                </div>
              </div>

              {/* Frame Profile Dropdown */}
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 block uppercase">Frame Web Profile</span>
                <select
                  value={frameProfile}
                  onChange={(e) => onParameterChange?.({ frameProfile: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-[11px] text-cyan-400 font-mono outline-none"
                >
                  {Object.entries(FRAME_PROFILES).map(([key, prof]) => (
                    <option key={key} value={key}>
                      {key} ({prof.label})
                    </option>
                  ))}
                </select>
              </div>

              {/* Frame Thickness slider */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-[10px] text-slate-400">WEB THICKNESS</span>
                  <span className="text-cyan-400 font-bold">{frameThickness} mm</span>
                </div>
                <input
                  type="range"
                  min="6"
                  max="30"
                  step="1"
                  value={frameThickness}
                  onChange={(e) => onParameterChange?.({ frameThickness: Number(e.target.value) })}
                  className="w-full accent-cyan-500 cursor-pointer h-1 rounded bg-slate-800"
                />
              </div>

              {/* Visual Overlay settings */}
              <div className="flex items-center justify-between border-t border-slate-900 pt-2 text-[10px]">
                <span className="text-slate-400 flex items-center space-x-1">
                  {showFrameOverlay ? <Eye className="w-3.5 h-3.5 text-cyan-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                  <span>Hull Overlay Visuals</span>
                </span>
                <div className="flex items-center space-x-1.5">
                  <input
                    type="checkbox"
                    checked={showFrameOverlay}
                    onChange={(e) => onParameterChange?.({ showFrameOverlay: e.target.checked })}
                    className="w-3.5 h-3.5 accent-cyan-500 rounded cursor-pointer"
                  />
                  {showFrameOverlay && (
                    <select
                      value={frameOverlayColor}
                      onChange={(e) => onParameterChange?.({ frameOverlayColor: e.target.value })}
                      className="bg-slate-900 text-cyan-400 border border-slate-800 rounded px-1 text-[9px]"
                    >
                      <option value="cyan">Cyan</option>
                      <option value="amber">Amber</option>
                      <option value="emerald">Green</option>
                    </select>
                  )}
                </div>
              </div>

              {/* Angle/Spacing Warning alerts */}
              {Math.abs(frameAngle) > 20 && (
                <div className="p-1.5 bg-amber-500/10 border border-amber-500/20 rounded text-[9px] text-amber-300 flex items-start space-x-1 leading-normal">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>Cant frames exceed 20° tilt. This requires specialized diagonal bracket connections at the keel to counter shear strain.</span>
                </div>
              )}
              {frameSpacing > 1.4 && (
                <div className="p-1.5 bg-rose-500/10 border border-rose-500/20 rounded text-[9px] text-rose-300 flex items-start space-x-1 leading-normal">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                  <span>Wide frame spacing ({frameSpacing}m) increases shell buckling risk under high seas. Recommend thickness increase.</span>
                </div>
              )}
            </div>

            {/* Bottom Plating slider */}
            <div className="space-y-1 bg-slate-950 p-3 rounded-lg border border-slate-850">
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-400 font-bold">BOTTOM PLATING</span>
                <span className="text-cyan-400 font-bold">{bottomPlatingThickness} mm</span>
              </div>
              <input
                type="range"
                min="10"
                max="30"
                step="1"
                value={bottomPlatingThickness}
                onChange={(e) => setBottomPlatingThickness(Number(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer h-1 rounded bg-slate-800"
              />
            </div>

            {/* Side Plating slider */}
            <div className="space-y-1 bg-slate-950 p-3 rounded-lg border border-slate-850">
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-400 font-bold">SIDE PLATING</span>
                <span className="text-cyan-400 font-bold">{sidePlatingThickness} mm</span>
              </div>
              <input
                type="range"
                min="8"
                max="25"
                step="1"
                value={sidePlatingThickness}
                onChange={(e) => setSidePlatingThickness(Number(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer h-1 rounded bg-slate-800"
              />
            </div>

            {/* Deck Plating slider */}
            <div className="space-y-1 bg-slate-950 p-3 rounded-lg border border-slate-850">
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-400 font-bold">DECK PLATING</span>
                <span className="text-cyan-400 font-bold">{deckPlatingThickness} mm</span>
              </div>
              <input
                type="range"
                min="6"
                max="20"
                step="1"
                value={deckPlatingThickness}
                onChange={(e) => setDeckPlatingThickness(Number(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer h-1 rounded bg-slate-800"
              />
            </div>

            {/* Dynamic Bulkheads Builder Section */}
            <div className="bg-slate-950 p-3 rounded-lg border border-indigo-900/30 space-y-3.5" id="bulkhead_builder_settings">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span className="text-[11px] text-indigo-400 font-bold uppercase tracking-wide flex items-center space-x-1">
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Bulkhead CAD Builder</span>
                </span>
                <span className="text-[9px] font-mono text-slate-500">DYNAMIC</span>
              </div>

              <div className="grid grid-cols-2 gap-2 font-sans">
                <button
                  type="button"
                  onClick={() => {
                    const newId = `bh_transverse_${Date.now()}`;
                    const defaultPos = parseFloat((parameters.length * 0.5).toFixed(1));
                    const newBh = {
                      id: newId,
                      type: 'transverse' as const,
                      position: defaultPos,
                      thickness: 12,
                      stress: 85.0
                    };
                    const updated = [...(parameters.bulkheads || []), newBh];
                    onParameterChange?.({ bulkheads: updated });
                    setSelectedItem(newId);
                  }}
                  className="py-1.5 px-2 bg-indigo-600/25 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/20 font-bold text-[10px] rounded transition-colors flex items-center justify-center space-x-1"
                >
                  <span>➕ Transverse BH</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const newId = `bh_longitudinal_${Date.now()}`;
                    const newBh = {
                      id: newId,
                      type: 'longitudinal' as const,
                      position: 0.0,
                      thickness: 12,
                      stress: 60.0
                    };
                    const updated = [...(parameters.bulkheads || []), newBh];
                    onParameterChange?.({ bulkheads: updated });
                    setSelectedItem(newId);
                  }}
                  className="py-1.5 px-2 bg-rose-600/25 hover:bg-rose-600/40 text-rose-300 border border-rose-500/20 font-bold text-[10px] rounded transition-colors flex items-center justify-center space-x-1"
                >
                  <span>➕ Longitudinal BH</span>
                </button>
              </div>

              <div className="text-[9px] text-slate-500 italic leading-snug">
                Add transverse or longitudinal dividing plates. Click any bulkhead item in the assembly tree above to configure its spacing, thickness or delete it.
              </div>
            </div>
          </div>
        </div>

        {/* Real-time structural summary report */}
        <div className="p-4 bg-slate-950/60 border-t border-slate-850 space-y-3 font-mono text-[11px]">
          <span className="text-slate-400 uppercase tracking-wider block text-[10px] font-bold">Structural Report</span>
          <div className="space-y-1.5 text-slate-300">
            <div className="flex justify-between">
              <span>Total Metal Weight:</span>
              <span className="text-emerald-400 font-bold">{structuralMetrics.totalWeight.toFixed(1)} t</span>
            </div>
            <div className="flex justify-between">
              <span>Bending Inertia (I_xx):</span>
              <span className="text-cyan-400 font-bold">{structuralMetrics.sectionModulus.toFixed(4)} m⁴</span>
            </div>
            <div className="flex justify-between">
              <span>Safety Margins:</span>
              <span className={`font-bold ${structuralMetrics.safetyIndex < 1.0 ? 'text-rose-400 animate-pulse' : structuralMetrics.safetyIndex < 1.4 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {structuralMetrics.safetyIndex.toFixed(2)}x {structuralMetrics.safetyIndex < 1.0 ? 'FAILED' : structuralMetrics.safetyIndex < 1.4 ? 'MARGINAL' : 'SAFE'}
              </span>
            </div>
          </div>
          
          {structuralMetrics.safetyIndex < 1.0 && (
            <div className="flex items-start space-x-1.5 p-2 bg-rose-500/10 border border-rose-500/20 rounded text-[9px] text-rose-300 leading-normal">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>Section modulus fails minimum class rule criteria. Increase bottom plating or deck plating thickness to restore structural envelope.</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
