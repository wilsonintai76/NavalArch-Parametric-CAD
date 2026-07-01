/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
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
  HardDrive
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

export default function StructureTreePanel({ parameters, onParameterChange }: StructureTreePanelProps) {
  // Local structural options
  const [frameSpacing, setFrameSpacing] = useState<number>(0.8); // meters
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

    // Frames calculation
    const totalFrames = Math.floor(L / frameSpacing);
    const frameWeight = (totalFrames * (B + D * 2) * 0.085 * material.density) / 1000; // approximation of web frame volume

    // Bulkheads calculation
    const bulkheadArea = B * D * 0.75; // average section area
    const bulkheadWeight = (bulkheadCount * bulkheadArea * 0.012 * material.density) / 1000;

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
    const safetyIndex = sectionModulus / Math.max(0.00001, requiredModulus);

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
  }, [parameters, frameSpacing, bottomPlatingThickness, sidePlatingThickness, deckPlatingThickness, bulkheadCount, selectedMaterial]);

  // Bulkhead locations list
  const bulkheadsList = useMemo(() => {
    const list = [];
    const step = parameters.length / (bulkheadCount + 1);
    for (let i = 1; i <= bulkheadCount; i++) {
      const pos = step * i;
      list.push({
        id: `bulkhead_${i}`,
        name: `Watertight Bulkhead #${i}`,
        position: pos.toFixed(1) + ' m',
        thickness: '12 mm',
        status: pos < parameters.length * 0.15 ? 'Collision' : 'Watertight',
        stress: (140 - Math.abs(pos - parameters.length / 2) * 0.5).toFixed(1) + ' MPa'
      });
    }
    return list;
  }, [parameters.length, bulkheadCount]);

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
                    <Folder className="w-3.5 h-3.5 text-amber-500 fill-amber-500/10" />
                    <span>Transverse Bulkheads</span>
                  </div>

                  {expandedNodes.bulkheads && (
                    <div className="pl-4 border-l border-slate-800 ml-2.5 mt-0.5 space-y-0.5">
                      {bulkheadsList.map((bh, i) => (
                        <div 
                          key={bh.id}
                          onClick={() => setSelectedItem(bh.id)}
                          className={`flex items-center space-x-2 p-1 rounded cursor-pointer ${selectedItem === bh.id ? 'bg-cyan-500/10 text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                          <File className="w-3.5 h-3.5 text-indigo-400" />
                          <span>{bh.name}</span>
                        </div>
                      ))}
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
              {Array.from({ length: Math.min(25, structuralMetrics.totalFrames) }).map((_, idx) => {
                const step = 500 / Math.min(25, structuralMetrics.totalFrames);
                const xVal = step * idx + step / 2;
                // Exclude bulkhead overlaps
                const overlapsBulkhead = Array.from({ length: bulkheadCount }).some((_, bIdx) => {
                  const bhX = (500 / (bulkheadCount + 1)) * (bIdx + 1);
                  return Math.abs(xVal - bhX) < 4;
                });
                if (overlapsBulkhead) return null;

                const yDeck = 40 + (xVal / 500) * 10;
                const yKeel = 160;
                const isSelected = selectedItem.startsWith('frames_midship');
                return (
                  <line 
                    key={idx}
                    x1={xVal} 
                    y1={yDeck + 2} 
                    x2={xVal} 
                    y2={yKeel - 1} 
                    stroke={isSelected ? 'rgba(34, 211, 238, 0.7)' : '#334155'} 
                    strokeWidth={isSelected ? '1.5' : '0.5'} 
                  />
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

            {selectedItem.startsWith('bulkhead_') && (
              <>
                <div className="text-cyan-400 font-bold border-b border-slate-800 pb-1.5 uppercase">{bulkheadsList.find(b => b.id === selectedItem)?.name || 'Bulkhead'}</div>
                <div className="flex justify-between"><span>Position:</span><span className="text-white">{bulkheadsList.find(b => b.id === selectedItem)?.position}</span></div>
                <div className="flex justify-between"><span>Thickness:</span><span className="text-white">12 mm</span></div>
                <div className="flex justify-between"><span>Function:</span><span className="text-indigo-400 font-semibold">{bulkheadsList.find(b => b.id === selectedItem)?.status}</span></div>
                <div className="flex justify-between"><span>Local Stress:</span><span className="text-slate-300">{bulkheadsList.find(b => b.id === selectedItem)?.stress}</span></div>
                <div className="flex justify-between"><span>Safety Factor:</span><span className="text-emerald-400 font-bold">2.88x (Safe)</span></div>
                <div className="text-[10px] text-slate-500 italic mt-2">Transverse watertight dividing plate. Confers extreme torsional stiffness to the hull structure and divides flooding zones.</div>
              </>
            )}

            {selectedItem === 'frames_midship' && (
              <>
                <div className="text-cyan-400 font-bold border-b border-slate-800 pb-1.5 uppercase">Transverse Web Frames</div>
                <div className="flex justify-between"><span>Spacing:</span><span className="text-white font-bold">{frameSpacing} m</span></div>
                <div className="flex justify-between"><span>Total Frames:</span><span className="text-white font-bold">{structuralMetrics.totalFrames}</span></div>
                <div className="flex justify-between"><span>Web Depth:</span><span className="text-slate-300">450 mm</span></div>
                <div className="flex justify-between"><span>Estimated Weight:</span><span className="text-emerald-400 font-bold">{structuralMetrics.frameWeight.toFixed(1)} t</span></div>
                <div className="flex justify-between"><span>Safety Factor:</span><span className="text-emerald-400 font-bold">2.68x (Safe)</span></div>
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

            {/* Frame Spacing slider */}
            <div className="space-y-1 bg-slate-950 p-3 rounded-lg border border-slate-850">
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-400 font-bold">FRAME SPACING</span>
                <span className="text-cyan-400 font-bold">{frameSpacing.toFixed(2)} m</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.05"
                value={frameSpacing}
                onChange={(e) => setFrameSpacing(Number(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer h-1 rounded bg-slate-800"
              />
              <span className="text-[9px] text-slate-500 italic block">Rule range: 0.50m - 1.50m. Smaller spacing increases web weight but reduces buckling.</span>
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

            {/* Bulkhead count */}
            <div className="space-y-1 bg-slate-950 p-3 rounded-lg border border-slate-850">
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-400 font-bold">WATERTIGHT BULKHEADS</span>
                <span className="text-cyan-400 font-bold">{bulkheadCount}</span>
              </div>
              <input
                type="range"
                min="3"
                max="12"
                step="1"
                value={bulkheadCount}
                onChange={(e) => setBulkheadCount(Number(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer h-1 rounded bg-slate-800"
              />
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
