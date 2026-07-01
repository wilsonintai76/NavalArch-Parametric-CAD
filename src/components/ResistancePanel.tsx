/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ResistanceAnalysis } from '../types';
import { Gauge, Zap, Waves, Activity, Sparkles } from 'lucide-react';

interface ResistancePanelProps {
  analysis: ResistanceAnalysis;
}

export default function ResistancePanel({ analysis }: ResistancePanelProps) {
  const [selectedSpeed, setSelectedSpeed] = useState<number>(analysis.designSpeedKnots);
  const [activeChart, setActiveChart] = useState<'resistance' | 'power'>('resistance');

  const speedData = analysis.curves;
  const currentVal = speedData.find(c => c.speedKnots === selectedSpeed) || speedData[14];

  // SVG dimensions
  const width = 450;
  const height = 200;
  const padding = 45;

  const maxSpeed = 30;
  const maxResistance = Math.max(10, ...speedData.map(d => d.rt)) * 1.1;
  const maxPower = Math.max(100, ...speedData.map(d => d.pe)) * 1.1;

  const mapX = (x: number) => padding + (x / maxSpeed) * (width - 2 * padding);
  const mapY = (y: number, maxVal: number) => height - padding - (y / maxVal) * (height - 2 * padding);

  // Generate curves SVG paths
  const rtPathStr = speedData
    .map(d => `${mapX(d.speedKnots).toFixed(1)},${mapY(d.rt, maxResistance).toFixed(1)}`)
    .join(' ');

  const rfPathStr = speedData
    .map(d => `${mapX(d.speedKnots).toFixed(1)},${mapY(d.rf, maxResistance).toFixed(1)}`)
    .join(' ');

  const rwPathStr = speedData
    .map(d => `${mapX(d.speedKnots).toFixed(1)},${mapY(d.rw, maxResistance).toFixed(1)}`)
    .join(' ');

  const pePathStr = speedData
    .map(d => `${mapX(d.speedKnots).toFixed(1)},${mapY(d.pe, maxPower).toFixed(1)}`)
    .join(' ');

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-700 rounded-lg p-5 text-slate-200" id="resistance_panel">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
        <div className="flex items-center space-x-2">
          <Waves className="w-5 h-5 text-blue-400 animate-pulse" />
          <h2 className="font-semibold text-base text-slate-100 tracking-tight">Real-time Resistance & Hydrodynamics</h2>
        </div>
        <div className="flex bg-slate-950 p-0.5 rounded border border-slate-800 text-[10px] font-mono">
          <button
            onClick={() => setActiveChart('resistance')}
            className={`px-2.5 py-1 rounded transition ${activeChart === 'resistance' ? 'bg-blue-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Drag (kN)
          </button>
          <button
            onClick={() => setActiveChart('power')}
            className={`px-2.5 py-1 rounded transition ${activeChart === 'power' ? 'bg-blue-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Power (kW)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 overflow-y-auto pr-1 flex-1">
        {/* Sliders and speed indicators */}
        <div className="space-y-4">
          <div className="bg-slate-950 p-4 rounded border border-slate-800 space-y-3">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-slate-400 uppercase tracking-wider">Evaluate Operational Speed</span>
              <span className="text-blue-400 font-bold text-base">{selectedSpeed} Knots</span>
            </div>
            
            <input
              type="range"
              min="1"
              max="30"
              value={selectedSpeed}
              onChange={(e) => setSelectedSpeed(parseInt(e.target.value))}
              className="w-full accent-blue-500 cursor-ew-resize"
              id="slider_speed"
            />
            
            <div className="flex justify-between text-[9px] text-slate-500 font-mono">
              <span>1 KN</span>
              <span>15 KN (Cruising)</span>
              <span>30 KN</span>
            </div>
          </div>

          {/* Speed indicators */}
          <div className="grid grid-cols-2 gap-3" id="speed_coefficients">
            <div className="bg-slate-950 p-3 rounded border border-slate-850">
              <span className="text-[9px] uppercase font-mono text-slate-400 block mb-1">Froude Number (Fn)</span>
              <span className="text-sm font-bold font-mono text-amber-400">{currentVal.froudeNumber.toFixed(3)}</span>
              <span className="text-[9px] text-slate-500 block mt-0.5">
                {currentVal.froudeNumber < 0.4 ? 'Displacement Regime' : 'Semi-displacement'}
              </span>
            </div>
            <div className="bg-slate-950 p-3 rounded border border-slate-850">
              <span className="text-[9px] uppercase font-mono text-slate-400 block mb-1">Reynolds Number (Rn)</span>
              <span className="text-sm font-bold font-mono text-teal-400">{(currentVal.froudeNumber * 2.3e8).toExponential(2)}</span>
              <span className="text-[9px] text-slate-500 block mt-0.5">Turbulent Boundary Layer</span>
            </div>
          </div>

          {/* Drag forces breakdown */}
          <div className="bg-slate-950 p-4 rounded border border-slate-850 space-y-2.5">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center justify-between">
              <span>Holtrop Drag Breakdown</span>
              <span className="text-[10px] text-slate-500 font-normal">ITTC-57 Reference</span>
            </h3>
            
            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-slate-900">
                <span className="text-slate-400">Frictional Resistance (Rf)</span>
                <span className="text-slate-200">{currentVal.rf.toFixed(2)} kN</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-900">
                <span className="text-slate-400">Wave Resistance (Rw)</span>
                <span className="text-purple-400">{currentVal.rw.toFixed(2)} kN</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-900 font-bold text-slate-100">
                <span>Total Resistance (Rt)</span>
                <span className="text-blue-400">{currentVal.rt.toFixed(2)} kN</span>
              </div>
            </div>
          </div>
        </div>

        {/* SVG Curve Plot */}
        <div className="flex flex-col justify-between" id="resistance_svg_plot">
          <div className="bg-slate-950 p-4 rounded border border-slate-800 flex-1 flex flex-col justify-between min-h-[220px]">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold uppercase tracking-wider font-mono text-slate-200">
                {activeChart === 'resistance' ? 'Total & Wave Resistance (kN)' : 'Effective Propulsion Power (kW)'}
              </span>
              <span className="text-[9px] text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/10 flex items-center space-x-1">
                <Activity className="w-3 h-3 text-emerald-400" />
                <span>Real-time solver</span>
              </span>
            </div>

            <div className="relative flex-1 flex items-center justify-center">
               <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                {/* Horizontal grid lines */}
                {[0, 5, 10, 15, 20, 25, 30].map(val => (
                  <g key={`x-grid-${val}`}>
                    <line
                      x1={mapX(val)}
                      y1={padding}
                      x2={mapX(val)}
                      y2={height - padding}
                      stroke="#1C2029"
                      strokeWidth="1"
                    />
                    <text
                      x={mapX(val)}
                      y={height - padding + 15}
                      fill="#64748b"
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {val}
                    </text>
                  </g>
                ))}

                {activeChart === 'resistance' ? (
                  // Resistance chart ticks
                  [50, 100, 200, 400, 600, 800].map(val => {
                    if (val > maxResistance) return null;
                    return (
                      <g key={`y-grid-${val}`}>
                        <line
                          x1={padding}
                          y1={mapY(val, maxResistance)}
                          x2={width - padding}
                          y2={mapY(val, maxResistance)}
                          stroke="#1C2029"
                          strokeWidth="1"
                        />
                        <text
                          x={padding - 8}
                          y={mapY(val, maxResistance) + 3}
                          fill="#64748b"
                          fontSize="9"
                          fontFamily="monospace"
                          textAnchor="end"
                        >
                          {val}
                        </text>
                      </g>
                    );
                  })
                ) : (
                  // Power chart ticks
                  [2000, 5000, 10000, 15000, 20000, 30000].map(val => {
                    if (val > maxPower) return null;
                    return (
                      <g key={`y-grid-${val}`}>
                        <line
                          x1={padding}
                          y1={mapY(val, maxPower)}
                          x2={width - padding}
                          y2={mapY(val, maxPower)}
                          stroke="#1C2029"
                          strokeWidth="1"
                        />
                        <text
                          x={padding - 8}
                          y={mapY(val, maxPower) + 3}
                          fill="#64748b"
                          fontSize="9"
                          fontFamily="monospace"
                          textAnchor="end"
                        >
                          {val}
                        </text>
                      </g>
                    );
                  })
                )}

                {/* Axes */}
                <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#475569" strokeWidth="1.5" />
                <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#475569" strokeWidth="1.5" />

                {activeChart === 'resistance' ? (
                  <>
                    {/* Frictional Line (Faded Slate) */}
                    <polyline points={rfPathStr} fill="none" stroke="#64748b" strokeWidth="1.5" strokeDasharray="3,3" />
                    {/* Wave Line (Purple) */}
                    <polyline points={rwPathStr} fill="none" stroke="#a855f7" strokeWidth="1.5" strokeDasharray="3,3" />
                    {/* Total Resistance (Solid Blue) */}
                    <polyline points={rtPathStr} fill="none" stroke="#3b82f6" strokeWidth="3" />
                    
                    {/* Design point highlight */}
                    <circle cx={mapX(selectedSpeed)} cy={mapY(currentVal.rt, maxResistance)} r="5" fill="#f59e0b" />
                    <line x1={mapX(selectedSpeed)} y1={padding} x2={mapX(selectedSpeed)} y2={height - padding} stroke="#f59e0b" strokeWidth="1" strokeDasharray="4,4" />
                  </>
                ) : (
                  <>
                    {/* Power Line (Solid Amber) */}
                    <polyline points={pePathStr} fill="none" stroke="#f59e0b" strokeWidth="3" />
                    
                    {/* Design point highlight */}
                    <circle cx={mapX(selectedSpeed)} cy={mapY(currentVal.pe, maxPower)} r="5" fill="#ef4444" />
                    <line x1={mapX(selectedSpeed)} y1={padding} x2={mapX(selectedSpeed)} y2={height - padding} stroke="#ef4444" strokeWidth="1" strokeDasharray="4,4" />
                  </>
                )}
              </svg>
            </div>

            {/* Power Output details */}
            <div className="flex justify-between items-center bg-slate-900 px-3 py-2 rounded text-xs font-mono mt-2 border border-slate-800">
              <div className="flex items-center space-x-1 text-slate-300">
                <Zap className="w-3.5 h-3.5 text-yellow-500" />
                <span>Effective Power required:</span>
              </div>
              <span className="text-yellow-500 font-bold text-sm">{(currentVal.pe).toFixed(1)} kW</span>
            </div>
          </div>

          <div className="bg-slate-950 px-4 py-2.5 rounded border border-slate-800 mt-3 text-xs font-mono flex items-center justify-between">
            <div className="flex items-center space-x-1 text-purple-400">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Design Cruise Speed: {analysis.designSpeedKnots} knots</span>
            </div>
            <span className="text-slate-300">Power at cruise: <strong className="text-emerald-400">{analysis.designPowerKw.toFixed(1)} kW</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}
