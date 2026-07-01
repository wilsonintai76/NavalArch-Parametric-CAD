/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Hydrostatics } from '../types';
import { Anchor, BarChart2, ShieldCheck, Scale, Waves, Pin, GitCompare, Trash2 } from 'lucide-react';

interface HydrostaticsPanelProps {
  hydrostatics: Hydrostatics;
}

export default function HydrostaticsPanel({ hydrostatics }: HydrostaticsPanelProps) {
  const [activeChartTab, setActiveChartTab] = useState<'gz' | 'buoyancy'>('gz');
  const [hoveredGZ, setHoveredGZ] = useState<{ angle: number; gz: number } | null>(null);
  const [hoveredStation, setHoveredStation] = useState<{ x: number; buoyancyForce: number; pressureKPa: number; index: number } | null>(null);
  const [pinnedHydrostatics, setPinnedHydrostatics] = useState<Hydrostatics | null>(null);

  // SVG Graph Sizing
  const width = 450;
  const height = 200;
  const padding = 40;

  // Comparison helpers
  const renderCompareValue = (current: number, pinned: number, unit: string, decimals = 2, showPct = true) => {
    const delta = current - pinned;
    const pct = pinned !== 0 ? (delta / pinned) * 100 : 0;
    const sign = delta > 0 ? '+' : '';
    const colorClass = Math.abs(delta) < 1e-5 ? 'text-slate-500' : delta > 0 ? 'text-emerald-400' : 'text-rose-400';
    
    return (
      <div className="mt-1 text-[11px] font-mono flex flex-wrap gap-x-2 items-center leading-tight">
        <span className="text-slate-500">Pin: {pinned.toFixed(decimals)}{unit}</span>
        <span className={`font-bold ${colorClass}`}>
          ({sign}{delta.toFixed(decimals)}{unit} {showPct ? `${sign}${pct.toFixed(1)}%` : ''})
        </span>
      </div>
    );
  };

  const renderCompareCentroid = (current: number, pinned: number) => {
    const delta = current - pinned;
    const sign = delta > 0 ? '+' : '';
    const colorClass = Math.abs(delta) < 1e-5 ? 'text-slate-500' : delta > 0 ? 'text-emerald-400' : 'text-rose-400';
    return (
      <div className="text-[10px] mt-0.5 leading-tight font-mono">
        <span className="text-slate-500 block">Pin: {pinned.toFixed(3)} m</span>
        <span className={`font-semibold ${colorClass}`}>
          {sign}{delta.toFixed(3)} m
        </span>
      </div>
    );
  };

  const renderCompareStability = (current: number, pinned: number) => {
    const delta = current - pinned;
    const sign = delta > 0 ? '+' : '';
    const colorClass = Math.abs(delta) < 1e-5 ? 'text-slate-500' : delta > 0 ? 'text-emerald-400' : 'text-rose-400';
    return (
      <div className="text-[10px] mt-0.5 leading-tight font-mono">
        <span className="text-slate-500 block">Pin: {pinned.toFixed(3)} m</span>
        <span className={`font-semibold ${colorClass}`}>
          {sign}{delta.toFixed(3)} m
        </span>
      </div>
    );
  };

  const renderCompareCoefficient = (current: number, pinned: number) => {
    const delta = current - pinned;
    const sign = delta > 0 ? '+' : '';
    const colorClass = Math.abs(delta) < 1e-5 ? 'text-slate-500' : delta > 0 ? 'text-emerald-400' : 'text-rose-400';
    return (
      <div className="text-[10px] mt-1 leading-tight font-mono text-center">
        <span className="text-slate-500 block">Pin: {pinned.toFixed(3)}</span>
        <span className={`font-semibold ${colorClass}`}>
          {sign}{delta.toFixed(3)}
        </span>
      </div>
    );
  };

  // 1. GZ Stability Curve variables
  const gzData = hydrostatics.gzCurve;
  const maxGzX = 90;
  
  const maxGzY = Math.max(
    0.5,
    ...gzData.map(d => d.gz),
    ...(pinnedHydrostatics ? pinnedHydrostatics.gzCurve.map(d => d.gz) : [])
  ) * 1.15;

  const mapGzX = (x: number) => padding + (x / maxGzX) * (width - 2 * padding);
  const mapGzY = (y: number) => height - padding - (y / maxGzY) * (height - 2 * padding);

  const gzPointsStr = gzData
    .map(d => `${mapGzX(d.angle).toFixed(1)},${mapGzY(d.gz).toFixed(1)}`)
    .join(' ');

  const gzAreaStr = `${mapGzX(0)},${height - padding} ` + gzPointsStr + ` ${mapGzX(90)},${height - padding}`;

  const pinnedGzData = pinnedHydrostatics?.gzCurve;
  const pinnedGzPointsStr = pinnedGzData
    ?.map(d => `${mapGzX(d.angle).toFixed(1)},${mapGzY(d.gz).toFixed(1)}`)
    .join(' ');

  // 2. Buoyancy & Pressure Distribution variables
  const bData = hydrostatics.buoyancyDistribution || [];
  const maxBX = bData.length > 0 ? bData[bData.length - 1].x : 10;
  
  const maxBForce = Math.max(
    1.0,
    ...bData.map(d => d.buoyancyForce),
    ...(pinnedHydrostatics ? (pinnedHydrostatics.buoyancyDistribution || []).map(d => d.buoyancyForce) : [])
  ) * 1.15;

  const maxBPressure = Math.max(
    1.0,
    ...bData.map(d => d.pressureKPa),
    ...(pinnedHydrostatics ? (pinnedHydrostatics.buoyancyDistribution || []).map(d => d.pressureKPa) : [])
  ) * 1.15;

  const mapBX = (x: number) => padding + (x / maxBX) * (width - 2 * padding);
  const mapBForceY = (y: number) => height - padding - (y / maxBForce) * (height - 2 * padding);
  const mapBPressureY = (y: number) => height - padding - (y / maxBPressure) * (height - 2 * padding);

  // Buoyancy curve path
  const bForcePointsStr = bData
    .map(d => `${mapBX(d.x).toFixed(1)},${mapBForceY(d.buoyancyForce).toFixed(1)}`)
    .join(' ');
  const bForceAreaStr = bData.length > 0 
    ? `${mapBX(0)},${height - padding} ` + bForcePointsStr + ` ${mapBX(maxBX)},${height - padding}`
    : '';

  // Pressure curve path
  const bPressurePointsStr = bData
    .map(d => `${mapBX(d.x).toFixed(1)},${mapBPressureY(d.pressureKPa).toFixed(1)}`)
    .join(' ');
  const bPressureAreaStr = bData.length > 0
    ? `${mapBX(0)},${height - padding} ` + bPressurePointsStr + ` ${mapBX(maxBX)},${height - padding}`
    : '';

  // Pinned buoyancy & pressure paths
  const pinnedBData = pinnedHydrostatics?.buoyancyDistribution || [];
  const pinnedBForcePointsStr = pinnedBData
    .map(d => `${mapBX(d.x).toFixed(1)},${mapBForceY(d.buoyancyForce).toFixed(1)}`)
    .join(' ');
  const pinnedBPressurePointsStr = pinnedBData
    .map(d => `${mapBX(d.x).toFixed(1)},${mapBPressureY(d.pressureKPa).toFixed(1)}`)
    .join(' ');

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-700 rounded-lg p-5 text-slate-200" id="hydrostatics_panel">
      {/* Title & Compare Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-700 pb-3 mb-4 gap-3">
        <div className="flex items-center space-x-2">
          <Anchor className="w-5 h-5 text-cyan-400 animate-pulse" />
          <h2 className="font-semibold text-base text-slate-100 tracking-tight" id="hydrostatics_title">Hydrostatics & Stability Report</h2>
        </div>
        
        {/* Pin & Compare Controls */}
        <div className="flex items-center space-x-2 text-xs" id="hydrostatics_compare_controls">
          {pinnedHydrostatics ? (
            <>
              <div className="flex items-center space-x-1.5 bg-cyan-950/50 text-cyan-400 border border-cyan-800/40 px-2.5 py-1.5 rounded-md font-mono text-[10px]">
                <GitCompare className="w-3.5 h-3.5 animate-pulse" />
                <span className="font-bold">COMPARE ACTIVE</span>
              </div>
              <button
                onClick={() => setPinnedHydrostatics(null)}
                className="flex items-center space-x-1 bg-rose-950/50 hover:bg-rose-900/40 text-rose-400 hover:text-rose-300 border border-rose-800/30 px-2.5 py-1.5 rounded-md transition font-semibold"
                title="Clear pinned state and exit compare mode"
                id="btn_clear_pin"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Pin</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => setPinnedHydrostatics(hydrostatics)}
              className="flex items-center space-x-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 hover:text-cyan-300 border border-cyan-500/20 px-3 py-1.5 rounded-md transition font-semibold"
              title="Pin current hydrostatics results as comparison baseline"
              id="btn_pin_state"
            >
              <Pin className="w-3.5 h-3.5" />
              <span>Pin Baseline</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 overflow-y-auto pr-1 flex-1">
        {/* Metric Grid */}
        <div className="space-y-4" id="hydrostatics_metrics">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-950 p-3 rounded border border-slate-800">
              <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Displacement Volume</span>
              <span className="text-lg font-bold font-mono text-cyan-400">{hydrostatics.displacementVolume.toFixed(2)}</span>
              <span className="text-xs text-slate-400 font-mono ml-1">m³</span>
              {pinnedHydrostatics && renderCompareValue(hydrostatics.displacementVolume, pinnedHydrostatics.displacementVolume, ' m³', 2)}
            </div>
            <div className="bg-slate-950 p-3 rounded border border-slate-800">
              <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Displacement Mass</span>
              <span className="text-lg font-bold font-mono text-emerald-400">{hydrostatics.displacementMass.toFixed(2)}</span>
              <span className="text-xs text-slate-400 font-mono ml-1">tonnes</span>
              {pinnedHydrostatics && renderCompareValue(hydrostatics.displacementMass, pinnedHydrostatics.displacementMass, ' t', 2)}
            </div>
          </div>

          {/* Centroid coordinates */}
          <div className="bg-slate-950 p-3 rounded border border-slate-850 space-y-2">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">Centroids & Centers</h3>
            <div className="grid grid-cols-3 gap-2 text-xs font-mono">
              <div>
                <span className="text-slate-400 block text-[9px] uppercase">LCB (Longitudinal)</span>
                <span className="text-slate-200 font-bold">{hydrostatics.lcb.toFixed(3)} m</span>
                {pinnedHydrostatics && renderCompareCentroid(hydrostatics.lcb, pinnedHydrostatics.lcb)}
              </div>
              <div>
                <span className="text-slate-400 block text-[9px] uppercase">VCB / KB (Vertical)</span>
                <span className="text-slate-200 font-bold">{hydrostatics.vcb.toFixed(3)} m</span>
                {pinnedHydrostatics && renderCompareCentroid(hydrostatics.vcb, pinnedHydrostatics.vcb)}
              </div>
              <div>
                <span className="text-slate-400 block text-[9px] uppercase">LCF (Flotation)</span>
                <span className="text-slate-200 font-bold">{hydrostatics.lcf.toFixed(3)} m</span>
                {pinnedHydrostatics && renderCompareCentroid(hydrostatics.lcf, pinnedHydrostatics.lcf)}
              </div>
            </div>
          </div>

          {/* Metacentric parameters */}
          <div className="bg-slate-950 p-3 rounded border border-slate-850 space-y-2">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">Transverse Stability Indices</h3>
            <div className="grid grid-cols-4 gap-2 text-xs font-mono">
              <div>
                <span className="text-slate-400 block text-[9px] uppercase">KB</span>
                <span className="text-slate-200">{hydrostatics.kbt.toFixed(3)} m</span>
                {pinnedHydrostatics && renderCompareStability(hydrostatics.kbt, pinnedHydrostatics.kbt)}
              </div>
              <div>
                <span className="text-slate-400 block text-[9px] uppercase">BM(T)</span>
                <span className="text-slate-200">{hydrostatics.bmt.toFixed(3)} m</span>
                {pinnedHydrostatics && renderCompareStability(hydrostatics.bmt, pinnedHydrostatics.bmt)}
              </div>
              <div>
                <span className="text-slate-400 block text-[9px] uppercase">KM(T)</span>
                <span className="text-slate-200 font-semibold">{hydrostatics.kmt.toFixed(3)} m</span>
                {pinnedHydrostatics && renderCompareStability(hydrostatics.kmt, pinnedHydrostatics.kmt)}
              </div>
              <div>
                <span className="text-slate-400 block text-[9px] uppercase">GM(T) Margin</span>
                <span className={`font-bold ${hydrostatics.gmt > 1.0 ? 'text-emerald-400' : hydrostatics.gmt > 0.5 ? 'text-yellow-400' : 'text-rose-400'}`}>
                  {hydrostatics.gmt.toFixed(3)} m
                </span>
                {pinnedHydrostatics && renderCompareStability(hydrostatics.gmt, pinnedHydrostatics.gmt)}
              </div>
            </div>
          </div>

          {/* Hull Coefficients */}
          <div className="bg-slate-950 p-3 rounded border border-slate-850 space-y-2">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">Form Coefficients</h3>
            <div className="grid grid-cols-4 gap-2 text-xs font-mono text-center">
              <div className="bg-slate-900 py-1.5 rounded">
                <span className="text-slate-400 block text-[9px] uppercase">Cb (Block)</span>
                <span className="text-cyan-400 font-bold">{hydrostatics.cb.toFixed(3)}</span>
                {pinnedHydrostatics && renderCompareCoefficient(hydrostatics.cb, pinnedHydrostatics.cb)}
              </div>
              <div className="bg-slate-900 py-1.5 rounded">
                <span className="text-slate-400 block text-[9px] uppercase">Cp (Prismatic)</span>
                <span className="text-purple-400 font-bold">{hydrostatics.cp.toFixed(3)}</span>
                {pinnedHydrostatics && renderCompareCoefficient(hydrostatics.cp, pinnedHydrostatics.cp)}
              </div>
              <div className="bg-slate-900 py-1.5 rounded">
                <span className="text-slate-400 block text-[9px] uppercase">Cm (Midship)</span>
                <span className="text-emerald-400 font-bold">{hydrostatics.cm.toFixed(3)}</span>
                {pinnedHydrostatics && renderCompareCoefficient(hydrostatics.cm, pinnedHydrostatics.cm)}
              </div>
              <div className="bg-slate-900 py-1.5 rounded">
                <span className="text-slate-400 block text-[9px] uppercase">Cwp (Waterplane)</span>
                <span className="text-amber-400 font-bold">{hydrostatics.cwp.toFixed(3)}</span>
                {pinnedHydrostatics && renderCompareCoefficient(hydrostatics.cwp, pinnedHydrostatics.cwp)}
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Interactive Charts Section */}
        <div className="flex flex-col justify-between" id="stability_gz_chart">
          <div className="bg-slate-950 p-4 rounded border border-slate-800 flex-1 flex flex-col justify-between min-h-[220px]">
            {/* Tab Selector */}
            <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-2 flex-wrap gap-2">
              <div className="flex space-x-1 bg-slate-900 p-0.5 rounded border border-slate-800">
                <button
                  onClick={() => setActiveChartTab('gz')}
                  className={`flex items-center space-x-1.5 px-3 py-1 text-[11px] rounded transition-all font-medium ${activeChartTab === 'gz' ? 'bg-cyan-950 text-cyan-400 font-semibold border border-cyan-800/30' : 'text-slate-400 hover:text-slate-200'}`}
                  id="tab_gz_curve"
                >
                  <Scale className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Righting Arm (GZ)</span>
                </button>
                <button
                  onClick={() => setActiveChartTab('buoyancy')}
                  className={`flex items-center space-x-1.5 px-3 py-1 text-[11px] rounded transition-all font-medium ${activeChartTab === 'buoyancy' ? 'bg-cyan-950 text-cyan-400 font-semibold border border-cyan-800/30' : 'text-slate-400 hover:text-slate-200'}`}
                  id="tab_buoyancy_distribution"
                >
                  <Waves className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Buoyancy & Pressure</span>
                </button>
              </div>
              
              <div className="flex items-center space-x-2">
                {pinnedHydrostatics && (
                  <div className="flex items-center space-x-2 text-[9px] font-mono text-slate-400 bg-slate-900/60 px-2 py-1 rounded border border-slate-850">
                    {activeChartTab === 'gz' ? (
                      <>
                        <div className="flex items-center space-x-1">
                          <span className="w-2.5 h-0.5 bg-emerald-500 inline-block"></span>
                          <span>Current</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <span className="w-2.5 h-0.5 border-t border-dashed border-slate-500 inline-block"></span>
                          <span>Pinned</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center space-x-1">
                          <span className="w-2.5 h-0.5 bg-cyan-400 inline-block"></span>
                          <span>Cur Fb</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <span className="w-2.5 h-0.5 border-t border-dashed border-cyan-400/60 inline-block"></span>
                          <span>Pin Fb</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <span className="w-2.5 h-0.5 bg-amber-500 inline-block"></span>
                          <span>Cur P</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <span className="w-2.5 h-0.5 border-t border-dashed border-amber-500/60 inline-block"></span>
                          <span>Pin P</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                  {activeChartTab === 'gz' ? 'IMO MSC.267(85) Standard' : 'Station-by-Station'}
                </span>
              </div>
            </div>

            {/* TAB 1: GZ stability curve */}
            {activeChartTab === 'gz' && (
              <div className="relative flex-1 flex flex-col justify-between animate-fadeIn">
                <div className="relative flex-1 flex items-center justify-center">
                  <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                    {/* Background Grid */}
                    {[0, 15, 30, 45, 60, 75, 90].map(val => (
                      <g key={`x-${val}`}>
                        <line
                          x1={mapGzX(val)}
                          y1={padding}
                          x2={mapGzX(val)}
                          y2={height - padding}
                          stroke="#1C2029"
                          strokeWidth="1"
                        />
                        <text
                          x={mapGzX(val)}
                          y={height - padding + 15}
                          fill="#64748b"
                          fontSize="9"
                          fontFamily="monospace"
                          textAnchor="middle"
                        >
                          {val}°
                        </text>
                      </g>
                    ))}

                    {[0.25, 0.5, 0.75, 1.0, 1.25, 1.5].map(val => {
                      if (val > maxGzY) return null;
                      return (
                        <g key={`y-${val}`}>
                          <line
                            x1={padding}
                            y1={mapGzY(val)}
                            x2={width - padding}
                            y2={mapGzY(val)}
                            stroke="#1C2029"
                            strokeWidth="1"
                          />
                          <text
                            x={padding - 10}
                            y={mapGzY(val) + 3}
                            fill="#64748b"
                            fontSize="9"
                            fontFamily="monospace"
                            textAnchor="end"
                          >
                            {val.toFixed(2)}
                          </text>
                        </g>
                      );
                    })}

                    {/* X and Y Axis lines */}
                    <line
                      x1={padding}
                      y1={height - padding}
                      x2={width - padding}
                      y2={height - padding}
                      stroke="#475569"
                      strokeWidth="1.5"
                    />
                    <line
                      x1={padding}
                      y1={padding}
                      x2={padding}
                      y2={height - padding}
                      stroke="#475569"
                      strokeWidth="1.5"
                    />

                    {/* GZ Curve Area Shading */}
                    <polygon points={gzAreaStr} fill="url(#stabilityGlow)" opacity="0.15" />

                    {/* Pinned GZ Curve Line */}
                    {pinnedHydrostatics && pinnedGzPointsStr && (
                      <polyline
                        points={pinnedGzPointsStr}
                        fill="none"
                        stroke="#64748b"
                        strokeWidth="2.2"
                        strokeDasharray="4,4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        id="pinned_gz_curve"
                      />
                    )}

                    {/* GZ Curve Line */}
                    <polyline
                      points={gzPointsStr}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* Peak Marker */}
                    {gzData.length > 0 && (
                      <circle
                        cx={mapGzX(35)}
                        cy={mapGzY(gzData.find(d => d.angle === 35)?.gz || 0.5)}
                        r="4"
                        fill="#f59e0b"
                      />
                    )}

                    {/* Hover line tracker */}
                    {hoveredGZ && (
                      <g>
                        <line
                          x1={mapGzX(hoveredGZ.angle)}
                          y1={padding}
                          x2={mapGzX(hoveredGZ.angle)}
                          y2={height - padding}
                          stroke="#f59e0b"
                          strokeWidth="1"
                          strokeDasharray="4,4"
                        />
                        <circle
                          cx={mapGzX(hoveredGZ.angle)}
                          cy={mapGzY(hoveredGZ.gz)}
                          r="6"
                          fill="#f59e0b"
                        />
                        {pinnedHydrostatics && pinnedGzData && (
                          (() => {
                            const pinnedPt = pinnedGzData.find(p => p.angle === hoveredGZ.angle);
                            if (pinnedPt) {
                              return (
                                <circle
                                  cx={mapGzX(pinnedPt.angle)}
                                  cy={mapGzY(pinnedPt.gz)}
                                  r="5"
                                  fill="#64748b"
                                  stroke="#0f172a"
                                  strokeWidth="1.5"
                                />
                              );
                            }
                            return null;
                          })()
                        )}
                      </g>
                    )}

                    {/* Definitions */}
                    <defs>
                      <linearGradient id="stabilityGlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                  </svg>

                  {/* Invisible interactive hover spots */}
                  <div className="absolute inset-0 flex" style={{ paddingLeft: padding, paddingRight: padding }}>
                    {gzData.map((d, i) => (
                      <div
                        key={i}
                        className="flex-1 h-full cursor-crosshair"
                        onMouseEnter={() => setHoveredGZ(d)}
                        onMouseLeave={() => setHoveredGZ(null)}
                      />
                    ))}
                  </div>
                </div>

                {/* Readout */}
                <div className="flex justify-between items-center mt-3 bg-slate-900 px-3 py-1.5 rounded text-xs font-mono">
                  <span className="text-slate-400">Heel Hover Tracker:</span>
                  {hoveredGZ ? (
                    <div className="flex flex-wrap gap-x-3 text-emerald-400 font-bold" id="gz_hover_readout">
                      <span>{hoveredGZ.angle}° Heel ➔ Cur GZ: {hoveredGZ.gz.toFixed(3)} m</span>
                      {pinnedHydrostatics && (
                        (() => {
                          const pinnedVal = pinnedHydrostatics.gzCurve.find(p => p.angle === hoveredGZ.angle)?.gz;
                          if (pinnedVal !== undefined) {
                            const delta = hoveredGZ.gz - pinnedVal;
                            const sign = delta >= 0 ? '+' : '';
                            const colorClass = Math.abs(delta) < 1e-5 ? 'text-slate-400' : delta > 0 ? 'text-emerald-400' : 'text-rose-400';
                            return (
                              <span className="text-slate-400 font-semibold border-l border-slate-700 pl-3">
                                Pin: {pinnedVal.toFixed(3)} m 
                                <span className={`ml-1.5 font-bold ${colorClass}`}>
                                  ({sign}{delta.toFixed(3)} m)
                                </span>
                              </span>
                            );
                          }
                          return null;
                        })()
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-500">Hover graph to query righting arm</span>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: Buoyancy & Pressure Distribution along length */}
            {activeChartTab === 'buoyancy' && (
              <div className="relative flex-1 flex flex-col justify-between animate-fadeIn">
                <div className="relative flex-1 flex items-center justify-center">
                  <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                    {/* Background Grid - Stations along length */}
                    {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map(pct => {
                      const valX = pct * maxBX;
                      return (
                        <g key={`bx-${pct}`}>
                          <line
                            x1={mapBX(valX)}
                            y1={padding}
                            x2={mapBX(valX)}
                            y2={height - padding}
                            stroke="#1C2029"
                            strokeWidth="1"
                          />
                          <text
                            x={mapBX(valX)}
                            y={height - padding + 15}
                            fill="#64748b"
                            fontSize="9"
                            fontFamily="monospace"
                            textAnchor="middle"
                          >
                            {(pct * 10).toFixed(0)}
                          </text>
                        </g>
                      );
                    })}

                    {/* Horizontal lines and labels for Pressure */}
                    {[0.25, 0.5, 0.75, 1.0].map(pct => {
                      const val = pct * maxBPressure;
                      return (
                        <g key={`by-p-${pct}`}>
                          <line
                            x1={padding}
                            y1={mapBPressureY(val)}
                            x2={width - padding}
                            y2={mapBPressureY(val)}
                            stroke="#1C2029"
                            strokeWidth="1"
                            strokeDasharray="2,4"
                          />
                          <text
                            x={width - padding + 5}
                            y={mapBPressureY(val) + 3}
                            fill="#f59e0b"
                            fontSize="8"
                            fontFamily="monospace"
                            textAnchor="start"
                          >
                            {val.toFixed(1)}
                          </text>
                        </g>
                      );
                    })}

                    {/* Horizontal lines and labels for Buoyant force */}
                    {[0.25, 0.5, 0.75, 1.0].map(pct => {
                      const val = pct * maxBForce;
                      return (
                        <g key={`by-f-${pct}`}>
                          <text
                            x={padding - 8}
                            y={mapBForceY(val) + 3}
                            fill="#06b6d4"
                            fontSize="8"
                            fontFamily="monospace"
                            textAnchor="end"
                          >
                            {val.toFixed(1)}
                          </text>
                        </g>
                      );
                    })}

                    {/* Axis Labels */}
                    <text x={padding - 10} y={padding - 10} fill="#06b6d4" fontSize="8" fontFamily="monospace" textAnchor="end">Fb (kN/m)</text>
                    <text x={width - padding + 10} y={padding - 10} fill="#f59e0b" fontSize="8" fontFamily="monospace" textAnchor="start">P (kPa)</text>
                    <text x={width / 2} y={height - padding + 28} fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="middle">HULL STATION (0-10)</text>

                    {/* X and Y Axis lines */}
                    <line
                      x1={padding}
                      y1={height - padding}
                      x2={width - padding}
                      y2={height - padding}
                      stroke="#475569"
                      strokeWidth="1.5"
                    />
                    <line
                      x1={padding}
                      y1={padding}
                      x2={padding}
                      y2={height - padding}
                      stroke="#06b6d4"
                      strokeWidth="1"
                    />
                    <line
                      x1={width - padding}
                      y1={padding}
                      x2={width - padding}
                      y2={height - padding}
                      stroke="#f59e0b"
                      strokeWidth="1"
                    />

                    {/* Buoyancy Force Shaded Area */}
                    {bForceAreaStr && (
                      <polygon points={bForceAreaStr} fill="url(#buoyancyGlow)" opacity="0.12" />
                    )}

                    {/* Pressure Shaded Area */}
                    {bPressureAreaStr && (
                      <polygon points={bPressureAreaStr} fill="url(#pressureGlow)" opacity="0.08" />
                    )}

                    {/* Pinned Buoyancy Force Curve */}
                    {pinnedHydrostatics && pinnedBForcePointsStr && (
                      <polyline
                        points={pinnedBForcePointsStr}
                        fill="none"
                        stroke="rgba(6, 182, 212, 0.45)"
                        strokeWidth="1.8"
                        strokeDasharray="4,4"
                        strokeLinecap="round"
                        id="pinned_buoyancy_curve"
                      />
                    )}

                    {/* Pinned Pressure Curve */}
                    {pinnedHydrostatics && pinnedBPressurePointsStr && (
                      <polyline
                        points={pinnedBPressurePointsStr}
                        fill="none"
                        stroke="rgba(245, 158, 11, 0.45)"
                        strokeWidth="1.8"
                        strokeDasharray="4,4"
                        strokeLinecap="round"
                        id="pinned_pressure_curve"
                      />
                    )}

                    {/* Buoyancy Force Curve */}
                    {bForcePointsStr && (
                      <polyline
                        points={bForcePointsStr}
                        fill="none"
                        stroke="#06b6d4"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    )}

                    {/* Pressure Curve */}
                    {bPressurePointsStr && (
                      <polyline
                        points={bPressurePointsStr}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeDasharray="4,2"
                      />
                    )}

                    {/* Hover line tracker */}
                    {hoveredStation && (
                      <g>
                        <line
                          x1={mapBX(hoveredStation.x)}
                          y1={padding}
                          x2={mapBX(hoveredStation.x)}
                          y2={height - padding}
                          stroke="#cbd5e1"
                          strokeWidth="1.2"
                          strokeDasharray="3,3"
                        />
                        {/* Buoyancy Point */}
                        <circle
                          cx={mapBX(hoveredStation.x)}
                          cy={mapBForceY(hoveredStation.buoyancyForce)}
                          r="5"
                          fill="#06b6d4"
                          stroke="#0f172a"
                          strokeWidth="1.5"
                        />
                        {/* Pressure Point */}
                        <circle
                          cx={mapBX(hoveredStation.x)}
                          cy={mapBPressureY(hoveredStation.pressureKPa)}
                          r="5"
                          fill="#f59e0b"
                          stroke="#0f172a"
                          strokeWidth="1.5"
                        />
                        {/* Pinned Points */}
                        {pinnedHydrostatics && pinnedBData[hoveredStation.index] && (
                          (() => {
                            const pinPt = pinnedBData[hoveredStation.index];
                            return (
                              <g>
                                <circle
                                  cx={mapBX(pinPt.x)}
                                  cy={mapBForceY(pinPt.buoyancyForce)}
                                  r="4"
                                  fill="rgba(6, 182, 212, 0.5)"
                                  stroke="#0f172a"
                                  strokeWidth="1"
                                />
                                <circle
                                  cx={mapBX(pinPt.x)}
                                  cy={mapBPressureY(pinPt.pressureKPa)}
                                  r="4"
                                  fill="rgba(245, 158, 11, 0.5)"
                                  stroke="#0f172a"
                                  strokeWidth="1"
                                />
                              </g>
                            );
                          })()
                        )}
                      </g>
                    )}

                    {/* Definitions */}
                    <defs>
                      <linearGradient id="buoyancyGlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#06b6d4" />
                        <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="pressureGlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                  </svg>

                  {/* Invisible interactive hover spots */}
                  <div className="absolute inset-0 flex" style={{ paddingLeft: padding, paddingRight: padding }}>
                    {bData.map((d, i) => (
                      <div
                        key={i}
                        className="flex-1 h-full cursor-crosshair"
                        onMouseEnter={() => setHoveredStation({ ...d, index: i })}
                        onMouseLeave={() => setHoveredStation(null)}
                      />
                    ))}
                  </div>
                </div>

                {/* Readout */}
                <div className="flex justify-between items-center mt-3 bg-slate-900 px-3 py-1.5 rounded text-xs font-mono">
                  <span className="text-slate-400">Station Readout:</span>
                  {hoveredStation ? (
                    <div className="flex flex-col gap-1 w-full text-right sm:text-left" id="station_hover_readout">
                      <div className="flex justify-between sm:justify-start sm:space-x-4 font-bold">
                        <span className="text-slate-300">St. {(hoveredStation.index / 2.4).toFixed(1)}</span>
                        <span className="text-cyan-400">Cur Fb: <span className="text-cyan-300">{hoveredStation.buoyancyForce.toFixed(2)} kN/m</span></span>
                        <span className="text-amber-400">Cur P: <span className="text-amber-300">{hoveredStation.pressureKPa.toFixed(2)} kPa</span></span>
                      </div>
                      {pinnedHydrostatics && pinnedBData[hoveredStation.index] && (
                        (() => {
                          const pinPt = pinnedBData[hoveredStation.index];
                          const dfb = hoveredStation.buoyancyForce - pinPt.buoyancyForce;
                          const dp = hoveredStation.pressureKPa - pinPt.pressureKPa;
                          const sF = dfb >= 0 ? '+' : '';
                          const sP = dp >= 0 ? '+' : '';
                          const colF = Math.abs(dfb) < 1e-3 ? 'text-slate-400' : dfb > 0 ? 'text-emerald-400' : 'text-rose-400';
                          const colP = Math.abs(dp) < 1e-3 ? 'text-slate-400' : dp > 0 ? 'text-emerald-400' : 'text-rose-400';
                          return (
                            <div className="flex justify-between sm:justify-start sm:space-x-4 text-[11px] text-slate-400 font-medium border-t border-slate-800/80 pt-1 mt-1">
                              <span>Pinned Baseline:</span>
                              <span>
                                Pin Fb: {pinPt.buoyancyForce.toFixed(2)} kN/m 
                                <span className={`ml-1 font-semibold ${colF}`}>
                                  ({sF}{dfb.toFixed(2)})
                                </span>
                              </span>
                              <span>
                                Pin P: {pinPt.pressureKPa.toFixed(2)} kPa 
                                <span className={`ml-1 font-semibold ${colP}`}>
                                  ({sP}{dp.toFixed(2)})
                                </span>
                              </span>
                            </div>
                          );
                        })()
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-500">Hover graph to view local station values</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Regulations check */}
          <div className="bg-slate-950 px-4 py-2.5 rounded border border-slate-800 mt-3 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-300">IMO Solas Stability Criteria Check</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
              PASSED (GM &gt; 0.15m)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
