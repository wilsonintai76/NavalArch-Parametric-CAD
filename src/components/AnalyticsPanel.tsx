/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ProductivityMetric } from '../types';
import { BarChart3, TrendingUp, Cpu, Award } from 'lucide-react';

interface AnalyticsPanelProps {
  metrics: ProductivityMetric[];
  stabilityScore: number;
  dragReductionScore: number;
}

export default function AnalyticsPanel({
  metrics,
  stabilityScore,
  dragReductionScore
}: AnalyticsPanelProps) {
  const width = 450;
  const height = 140;
  const padding = 25;

  const maxVal = Math.max(5, ...metrics.map(m => m.iterations)) * 1.15;
  const mapX = (idx: number) => padding + (idx / (metrics.length - 1)) * (width - 2 * padding);
  const mapY = (val: number) => height - padding - (val / maxVal) * (height - 2 * padding);

  // Line coordinates
  const linePoints = metrics
    .map((m, idx) => `${mapX(idx).toFixed(1)},${mapY(m.iterations).toFixed(1)}`)
    .join(' ');

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-700 rounded-lg p-5 text-slate-200" id="analytics_panel">
      {/* Title */}
      <div className="flex items-center space-x-2 border-b border-slate-700 pb-3 mb-4 shrink-0">
        <BarChart3 className="w-5 h-5 text-emerald-400 animate-pulse" />
        <h2 className="font-semibold text-base text-slate-100 tracking-tight">Advanced Design Productivity Analytics</h2>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 flex-1 overflow-y-auto pr-1">
        {/* Statistics cards */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-950 p-4 rounded border border-slate-800 flex flex-col justify-between">
              <span className="text-[10px] uppercase font-mono text-slate-400">Drag Reduction Index</span>
              <div className="flex items-baseline space-x-1.5 mt-2">
                <span className="text-2xl font-black text-cyan-400 font-mono">+{dragReductionScore.toFixed(1)}%</span>
              </div>
              <p className="text-[9px] text-slate-500 mt-1">Relative to initial flat bottom baseline hull</p>
            </div>

            <div className="bg-slate-950 p-4 rounded border border-slate-800 flex flex-col justify-between">
              <span className="text-[10px] uppercase font-mono text-slate-400">Stability Margin Index</span>
              <div className="flex items-baseline space-x-1.5 mt-2">
                <span className="text-2xl font-black text-emerald-400 font-mono">+{stabilityScore.toFixed(1)}%</span>
              </div>
              <p className="text-[9px] text-slate-500 mt-1">Safety cushion relative to SOLAS min limits</p>
            </div>
          </div>

          {/* Efficiency ratings */}
          <div className="bg-slate-950 p-4 rounded border border-slate-850 space-y-3">
            <h3 className="text-xs font-bold text-slate-300 font-mono uppercase tracking-wider flex items-center space-x-1.5">
              <Award className="w-4 h-4 text-emerald-400" />
              <span>Vessel Performance Optimization Class</span>
            </h3>
            
            {/* Horizontal progress bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>Hydrodynamic Efficiency</span>
                <span className="text-emerald-400 font-bold">Class-A (89%)</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div className="bg-emerald-500 h-full rounded-full transition-all duration-300" style={{ width: '89%' }} />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>Hull Volume to Drag Ratio</span>
                <span className="text-cyan-400 font-bold">Optimal (94%)</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div className="bg-cyan-500 h-full rounded-full transition-all duration-300" style={{ width: '94%' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Charting Col */}
        <div className="space-y-3 flex flex-col justify-between">
          <div className="bg-slate-950 p-4 rounded border border-slate-800 flex-1 flex flex-col justify-between min-h-[160px]">
            <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>Model Iterations Timeline</span>
              <TrendingUp className="w-4 h-4 text-indigo-400" />
            </h3>

            {/* SVG Iterations Plot */}
            <div className="relative flex-1 flex items-center justify-center mt-2">
              <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                {/* Horizontal lines */}
                {[0, 2, 4, 6, 8, 10].map(val => (
                  <g key={`y-${val}`}>
                    <line x1={padding} y1={mapY(val)} x2={width - padding} y2={mapY(val)} stroke="#1C2029" strokeWidth="1" />
                    <text x={padding - 8} y={mapY(val) + 3} fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="end">{val}</text>
                  </g>
                ))}

                {/* X labels */}
                {metrics.map((m, idx) => (
                  <text
                    key={idx}
                    x={mapX(idx)}
                    y={height - padding + 15}
                    fill="#64748b"
                    fontSize="8"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {m.date}
                  </text>
                ))}

                <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#1C2029" strokeWidth="1" />

                {/* Line Path */}
                <polyline points={linePoints} fill="none" stroke="#3b82f6" strokeWidth="2.5" />
                
                {/* Points markers */}
                {metrics.map((m, idx) => (
                  <circle key={idx} cx={mapX(idx)} cy={mapY(m.iterations)} r="4" fill="#60a5fa" stroke="#161920" strokeWidth="1" />
                ))}
              </svg>
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded border border-slate-800 flex items-center space-x-2 text-xs font-mono text-slate-400">
            <Cpu className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>AI sweeps automatically optimization thresholds against classification requirements.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
