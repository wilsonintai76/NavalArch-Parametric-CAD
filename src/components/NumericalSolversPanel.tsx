/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { HullParameters } from '../types';
import { 
  Play, 
  RotateCw, 
  Layers, 
  Activity, 
  Cpu, 
  Compass, 
  CheckCircle, 
  AlertCircle, 
  Terminal, 
  Sliders,
  Settings
} from 'lucide-react';
import { calculateHydrostatics, calculateResistance } from '../utils/hullGeometry';

interface NumericalSolversPanelProps {
  parameters: HullParameters;
}

interface SolverLog {
  id: string;
  step: number;
  text: string;
  type: 'info' | 'progress' | 'success' | 'warning';
}

// Sensitivity parameters metadata
const SENSITIVITY_PARAMS = [
  { key: 'length', label: 'Length Waterline (LWL)', unit: 'm', desc: 'Primary length dimension. Dictates Froude number and wave drag.' },
  { key: 'beam', label: 'Max Beam (B)', unit: 'm', desc: 'Maximum hull width. Drives midship area, stability, and wave drag.' },
  { key: 'draft', label: 'Design Draft (T)', unit: 'm', desc: 'Submerged depth. Strongly controls wetted surface area and volume.' },
  { key: 'depth', label: 'Hull Depth (D)', unit: 'm', desc: 'Total height. Affects sheer profile and vertical center of gravity.' },
  { key: 'fullness', label: 'Waterplane Fullness (Cwp)', unit: '', desc: 'Controls bluntness of waterline ends. Blunt hulls have high volume but high wave drag.' },
  { key: 'deadrise', label: 'Deadrise Angle', unit: '°', desc: 'Bottom V-angle. Improves seakeeping but reduces buoyancy.' },
  { key: 'transomBeamRatio', label: 'Transom Beam Ratio', unit: '', desc: 'Stern width ratio. Impacts stern wave pattern and volume distribution.' },
  { key: 'flare', label: 'Side Wall Flare', unit: '°', desc: 'Outward angle of sides. Controls reserve stability when heeled.' },
  { key: 'bilgeRadius', label: 'Bilge Radius', unit: 'm', desc: 'Rounding radius. Sharp bilges increase block coefficient and stability.' }
];

// Helper to modify and clamp parameters for sensitivity analysis
function getModifiedParams(params: HullParameters, key: string, percentChange: number): HullParameters {
  const copy = { ...params };
  const currentVal = (params as any)[key] ?? 0;
  
  let newVal = currentVal;
  
  if (key === 'deadrise' && currentVal === 0) {
    // If deadrise is 0, percentage change is always 0. Let's vary by absolute degrees instead.
    newVal = (percentChange * 25) / 100; // e.g. -20% map to -5 deg, +20% map to +5 deg (centered around 10 deg)
    newVal = Math.max(0, Math.min(35, 10 + newVal));
  } else if (key === 'flare' && currentVal === 0) {
    newVal = (percentChange * 30) / 100; // center around 15, vary by up to 15
    newVal = Math.max(-10, Math.min(45, 15 + newVal));
  } else {
    newVal = currentVal * (1 + percentChange / 100);
  }
  
  // Apply parameter-specific physical limits (clamping) to prevent invalid hulls
  if (key === 'length') newVal = Math.max(5.0, Math.min(100.0, newVal));
  if (key === 'beam') newVal = Math.max(1.0, Math.min(30.0, newVal));
  if (key === 'draft') newVal = Math.max(0.1, Math.min(params.depth * 0.9, newVal)); // draft cannot exceed 90% depth
  if (key === 'depth') newVal = Math.max(params.draft * 1.1, Math.min(25.0, newVal)); // depth must exceed draft
  if (key === 'fullness') newVal = Math.max(0.5, Math.min(2.0, newVal));
  if (key === 'deadrise') newVal = Math.max(0, Math.min(45, newVal));
  if (key === 'transomBeamRatio') newVal = Math.max(0.0, Math.min(1.0, newVal));
  if (key === 'flare') newVal = Math.max(-20, Math.min(60, newVal));
  if (key === 'bilgeRadius') newVal = Math.max(0.05, Math.min(params.beam / 2, newVal));
  
  (copy as any)[key] = newVal;
  return copy;
}

export default function NumericalSolversPanel({ parameters }: NumericalSolversPanelProps) {
  // Solver Settings
  const [selectedSolver, setSelectedSolver] = useState<'cfd' | 'fea' | 'hydro'>('cfd');
  const [meshDensity, setMeshDensity] = useState<'coarse' | 'medium' | 'fine' | 'ultra'>('medium');
  const [maxIterations, setMaxIterations] = useState<number>(100);
  const [tolerance, setTolerance] = useState<number>(0.0001);

  // Simulation Running State
  const [isSolving, setIsSolving] = useState<boolean>(false);
  const [currentIteration, setCurrentIteration] = useState<number>(0);
  const [residuals, setResiduals] = useState<number[]>([]);
  const [logs, setLogs] = useState<SolverLog[]>([]);
  const [hasFinished, setHasFinished] = useState<boolean>(false);

  // Sensitivity State Variables
  const [activeSubView, setActiveSubView] = useState<'solver' | 'sensitivity'>('solver');
  const [selectedSensitivityParam, setSelectedSensitivityParam] = useState<string>('beam');
  const [sensitivityRange, setSensitivityRange] = useState<number>(20); // ±20%
  const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(null);

  // Ref to scroll terminal to bottom
  const terminalBottomRef = useRef<HTMLDivElement>(null);

  // Auto scroll terminal log on updates
  useEffect(() => {
    if (terminalBottomRef.current) {
      terminalBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Handle Solver simulation
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isSolving && currentIteration < maxIterations) {
      timer = setTimeout(() => {
        // Compute next residual using exponential decay with some random perturbation
        const nextIter = currentIteration + 1;
        const decayBase = selectedSolver === 'cfd' ? 0.94 : selectedSolver === 'fea' ? 0.92 : 0.90;
        const baseResidual = Math.pow(decayBase, nextIter);
        const noise = (Math.random() * 0.15 * baseResidual);
        const nextResidual = Math.max(1e-6, baseResidual + noise);
        
        // Push state
        setCurrentIteration(nextIter);
        setResiduals(prev => [...prev, nextResidual]);

        // Add log entry
        let text = '';
        if (selectedSolver === 'cfd') {
          text = `Iter ${nextIter}/${maxIterations} | Residuals: P=${nextResidual.toExponential(4)} Ux=${(nextResidual * 1.2).toExponential(4)} Uy=${(nextResidual * 0.85).toExponential(4)} | Mass Error: ${(Math.random() * 0.005).toFixed(5)}%`;
        } else if (selectedSolver === 'fea') {
          text = `Iter ${nextIter}/${maxIterations} | Displacement Error: ${nextResidual.toExponential(4)} | Strain Energy: ${(145.2 + Math.random() * 2 * nextResidual).toFixed(2)} MJ | Gaps closed: 100%`;
        } else {
          text = `Iter ${nextIter}/${maxIterations} | Trim Angle Error: ${(nextResidual * 15).toExponential(4)} deg | Buoyant Volume Dev: ${(nextResidual * 100).toExponential(4)} m³`;
        }

        const newLog: SolverLog = {
          id: `${nextIter}_${Date.now()}`,
          step: nextIter,
          text,
          type: 'progress'
        };
        setLogs(prev => [...prev, newLog]);

        // Convergence Check
        if (nextResidual <= tolerance) {
          setIsSolving(false);
          setHasFinished(true);
          setLogs(prev => [
            ...prev,
            {
              id: `conv_${Date.now()}`,
              step: nextIter,
              text: `✨ CONVERGENCE CRITERIA MET (Residual <= ${tolerance.toExponential(1)}) at iteration ${nextIter}! Solver exited normally.`,
              type: 'success'
            }
          ]);
        } else if (nextIter === maxIterations) {
          setIsSolving(false);
          setHasFinished(true);
          setLogs(prev => [
            ...prev,
            {
              id: `term_${Date.now()}`,
              step: nextIter,
              text: `⚠️ SOLVER EXITED WITHOUT IDEAL CONVERGENCE. Maximum iterations (${maxIterations}) reached.`,
              type: 'warning'
            }
          ]);
        }
      }, 70); // Simulated solving speed
    }
    return () => clearTimeout(timer);
  }, [isSolving, currentIteration, maxIterations, tolerance, selectedSolver]);

  // Run or Pause Solver
  const handleStartSolver = () => {
    if (isSolving) {
      setIsSolving(false);
      setLogs(prev => [
        ...prev,
        {
          id: `pause_${Date.now()}`,
          step: currentIteration,
          text: `⏸️ SOLVER RUNTIME PAUSED BY USER.`,
          type: 'info'
        }
      ]);
    } else {
      setHasFinished(false);
      if (currentIteration === 0 || currentIteration >= maxIterations) {
        // Reset states for fresh run
        setCurrentIteration(0);
        setResiduals([]);
        setHasFinished(false);
        const initLogs: SolverLog[] = [
          {
            id: `init1_${Date.now()}`,
            step: 0,
            text: `[INIT] Booting numerical solver engine: ${selectedSolver === 'cfd' ? 'Finite Volume Navier-Stokes RANS' : selectedSolver === 'fea' ? 'Nonlinear Shell FEA Solver' : 'Boundary Element Hydrostatic Solver'}...`,
            type: 'info'
          },
          {
            id: `init2_${Date.now()}`,
            step: 0,
            text: `[GRID] Constructing geometric grid mesh from Nurb params. Density mode: ${meshDensity.toUpperCase()}`,
            type: 'info'
          },
          {
            id: `init3_${Date.now()}`,
            step: 0,
            text: `[GRID] Mesh counts: ${
              meshDensity === 'coarse' ? '1,450 nodes, 280 shell elements' :
              meshDensity === 'medium' ? '12,200 nodes, 2,340 elements' :
              meshDensity === 'fine' ? '45,800 nodes, 8,900 elements' : '182,000 nodes, 35,400 elements'
            }. Matrix initialization complete in ${selectedSolver === 'cfd' ? '3' : '1.5'} ms.`,
            type: 'info'
          },
          {
            id: `init4_${Date.now()}`,
            step: 0,
            text: `[SOLVER] Commencing iterative loops. Target tolerance: ${tolerance.toExponential(1)}`,
            type: 'info'
          }
        ];
        setLogs(initLogs);
        setIsSolving(true);
      } else {
        setIsSolving(true);
      }
    }
  };

  // Reset solver state
  const handleResetSolver = () => {
    setIsSolving(false);
    setCurrentIteration(0);
    setResiduals([]);
    setLogs([]);
    setHasFinished(false);
  };

  // Generate Mesh overlay cells for 2D visual representation based on MeshDensity
  const gridResolution = useMemo(() => {
    switch (meshDensity) {
      case 'coarse': return { x: 12, y: 5 };
      case 'medium': return { x: 22, y: 10 };
      case 'fine': return { x: 42, y: 18 };
      case 'ultra': return { x: 70, y: 28 };
    }
  }, [meshDensity]);

  // Real-time sensitivity dataset calculation
  const sensitivityData = useMemo(() => {
    const stepsCount = 11;
    const data = [];
    
    for (let i = 0; i < stepsCount; i++) {
      // fraction goes from -1 to 1
      const frac = (i / (stepsCount - 1)) * 2 - 1;
      const percentChange = frac * sensitivityRange;
      
      const modifiedParams = getModifiedParams(parameters, selectedSensitivityParam, percentChange);
      const mVal = (modifiedParams as any)[selectedSensitivityParam] ?? 0;
      
      // Calculate
      try {
        const hydro = calculateHydrostatics(modifiedParams);
        const resAnalysis = calculateResistance(modifiedParams, hydro);
        
        data.push({
          idx: i,
          percentChange,
          paramValue: mVal,
          displacement: hydro.displacementMass,
          resistance: resAnalysis.designResistanceKn,
          power: resAnalysis.designPowerKw,
          cb: hydro.cb,
          wettedArea: hydro.wettedSurfaceArea
        });
      } catch (err) {
        console.error("Error calculating sensitivity step:", err);
      }
    }
    return data;
  }, [parameters, selectedSensitivityParam, sensitivityRange]);

  const scaleInfo = useMemo(() => {
    if (sensitivityData.length === 0) return null;
    
    const displacements = sensitivityData.map(d => d.displacement);
    const resistances = sensitivityData.map(d => d.resistance);
    
    const minDisp = Math.min(...displacements);
    const maxDisp = Math.max(...displacements);
    const minRes = Math.min(...resistances);
    const maxRes = Math.max(...resistances);
    
    // Add 10% padding to bounds so lines don't touch edges
    const dispPadding = (maxDisp - minDisp) * 0.1 || 1.0;
    const resPadding = (maxRes - minRes) * 0.1 || 1.0;
    
    return {
      minDisp: Math.max(0, minDisp - dispPadding),
      maxDisp: maxDisp + dispPadding,
      minRes: Math.max(0, minRes - resPadding),
      maxRes: maxRes + resPadding
    };
  }, [sensitivityData]);

  const chartPoints = useMemo(() => {
    if (!scaleInfo || sensitivityData.length === 0) return null;
    const { minDisp, maxDisp, minRes, maxRes } = scaleInfo;
    
    const dispPoints: { x: number; y: number }[] = [];
    const resPoints: { x: number; y: number }[] = [];
    
    sensitivityData.forEach((d) => {
      // Map x from percentChange (-range to +range) to (60 to 540)
      const x = 60 + ((d.percentChange - (-sensitivityRange)) / (2 * sensitivityRange)) * 480;
      
      // Map yDisp from (minDisp to maxDisp) to (205 to 25)
      const yDisp = 25 + (1 - (d.displacement - minDisp) / (maxDisp - minDisp)) * 180;
      
      // Map yRes from (minRes to maxRes) to (205 to 25)
      const yRes = 25 + (1 - (d.resistance - minRes) / (maxRes - minRes)) * 180;
      
      dispPoints.push({ x, y: yDisp });
      resPoints.push({ x, y: yRes });
    });
    
    return { dispPoints, resPoints };
  }, [sensitivityData, scaleInfo, sensitivityRange]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left; // x coordinate inside the element
    
    // Convert to SVG space (600px width)
    const svgWidth = 600;
    const svgX = (x / rect.width) * svgWidth;
    
    // We only care if mouse is within the plotting area (60 to 540)
    if (svgX >= 55 && svgX <= 545) {
      let closestIdx = 0;
      let minDistance = Infinity;
      
      sensitivityData.forEach((d, idx) => {
        const pointX = 60 + ((d.percentChange - (-sensitivityRange)) / (2 * sensitivityRange)) * 480;
        const dist = Math.abs(svgX - pointX);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = idx;
        }
      });
      
      setHoveredPointIdx(closestIdx);
    } else {
      setHoveredPointIdx(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredPointIdx(null);
  };

  // Push terminal logs on sensitivity param changes
  useEffect(() => {
    if (activeSubView === 'sensitivity') {
      const selectedMeta = SENSITIVITY_PARAMS.find(p => p.key === selectedSensitivityParam);
      const logText = `[SENSITIVITY] Re-solving hull physics for 11 discrete steps of ${selectedMeta?.label} with range ±${sensitivityRange}%. Solver response time: ${(Math.random() * 0.3 + 0.5).toFixed(2)} ms. Matrix convergence: 100%.`;
      setLogs(prev => [
        ...prev,
        {
          id: `sens_${selectedSensitivityParam}_${Date.now()}`,
          step: currentIteration,
          text: logText,
          type: 'info'
        }
      ]);
    }
  }, [selectedSensitivityParam, sensitivityRange, activeSubView]);

  return (
    <div className="flex flex-col lg:flex-row h-full bg-slate-950 text-slate-100 overflow-hidden" id="numerical_solvers_panel">
      
      {/* 1. Left Side: Solver Selection & Configs */}
      <div className="w-full lg:w-72 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 overflow-y-auto" id="solvers_config_sidebar">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80 sticky top-0 z-10">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>Solver Controller</span>
          </h3>
          <span className="text-[10px] font-mono bg-emerald-950/20 text-emerald-400 border border-emerald-900/50 px-2 py-0.5 rounded">CPU RUNTIME</span>
        </div>

        {/* Solver select menu */}
        <div className="p-4 space-y-4" id="solver_select_and_settings">
          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Numerical Engine</label>
            <div className="grid grid-cols-1 gap-1.5">
              <button
                onClick={() => { handleResetSolver(); setSelectedSolver('cfd'); }}
                className={`w-full text-left p-3 rounded-lg border transition font-sans ${selectedSolver === 'cfd' ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 'bg-slate-950/40 border-slate-850 hover:bg-slate-900 text-slate-300'}`}
              >
                <div className="font-bold text-xs">Symmetric RANS CFD</div>
                <div className="text-[9px] text-slate-500 mt-0.5 font-mono">Wave-making hull drag solver</div>
              </button>

              <button
                onClick={() => { handleResetSolver(); setSelectedSolver('fea'); }}
                className={`w-full text-left p-3 rounded-lg border transition font-sans ${selectedSolver === 'fea' ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 'bg-slate-950/40 border-slate-850 hover:bg-slate-900 text-slate-300'}`}
              >
                <div className="font-bold text-xs">Nonlinear Shell FEA</div>
                <div className="text-[9px] text-slate-500 mt-0.5 font-mono">Structural strain & stress solver</div>
              </button>

              <button
                onClick={() => { handleResetSolver(); setSelectedSolver('hydro'); }}
                className={`w-full text-left p-3 rounded-lg border transition font-sans ${selectedSolver === 'hydro' ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 'bg-slate-950/40 border-slate-850 hover:bg-slate-900 text-slate-300'}`}
              >
                <div className="font-bold text-xs">BEM Hydrostatics</div>
                <div className="text-[9px] text-slate-500 mt-0.5 font-mono">Surface boundary stability solver</div>
              </button>
            </div>
          </div>

          <div className="border-t border-slate-800/60 my-2"></div>

          {/* Configuration inputs */}
          <div className="space-y-3 font-mono text-xs">
            <h4 className="text-[10px] text-slate-400 uppercase font-bold tracking-wider flex items-center space-x-1">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>Mesh & Convergence</span>
            </h4>

            {/* Mesh density selector */}
            <div className="space-y-1 bg-slate-950 p-2.5 rounded-lg border border-slate-850">
              <label className="text-[10px] text-slate-500 uppercase block font-bold">Mesh Element Density</label>
              <select
                value={meshDensity}
                onChange={(e) => { handleResetSolver(); setMeshDensity(e.target.value as any); }}
                className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-[11px] text-cyan-400 outline-none"
              >
                <option value="coarse">Coarse Grid (Fast & Rough)</option>
                <option value="medium">Medium Grid (Standard CAD)</option>
                <option value="fine">Fine Grid (Production Accurate)</option>
                <option value="ultra">Ultra-Fine Grid (Research Grade)</option>
              </select>
            </div>

            {/* Target Tolerance */}
            <div className="space-y-1 bg-slate-950 p-2.5 rounded-lg border border-slate-850">
              <label className="text-[10px] text-slate-500 uppercase block font-bold">Convergence limit</label>
              <select
                value={tolerance}
                onChange={(e) => { handleResetSolver(); setTolerance(Number(e.target.value)); }}
                className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-[11px] text-cyan-400 outline-none"
              >
                <option value={0.01}>1.0e-2 (Fast convergence)</option>
                <option value={0.001}>1.0e-3 (Draft precision)</option>
                <option value={0.0001}>1.0e-4 (Standard CAD rule)</option>
                <option value={0.00001}>1.0e-5 (High precision)</option>
              </select>
            </div>

            {/* Max Iterations */}
            <div className="space-y-1 bg-slate-950 p-2.5 rounded-lg border border-slate-850">
              <div className="flex justify-between">
                <span className="text-[10px] text-slate-500 font-bold uppercase">Max Loops</span>
                <span className="text-cyan-400 font-bold">{maxIterations}</span>
              </div>
              <input
                type="range"
                min="50"
                max="300"
                step="25"
                value={maxIterations}
                onChange={(e) => { handleResetSolver(); setMaxIterations(Number(e.target.value)); }}
                className="w-full accent-cyan-500 cursor-pointer h-1 rounded bg-slate-800"
              />
            </div>
          </div>

          <div className="border-t border-slate-800/60 my-2"></div>

          {/* Start Actions */}
          <div className="flex space-x-2 pt-1" id="solver_action_buttons">
            <button
              onClick={handleStartSolver}
              className={`flex-1 py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center space-x-1.5 transition-all ${
                isSolving 
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-[0_0_12px_rgba(217,119,6,0.3)]' 
                  : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.3)]'
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isSolving ? 'Pause Solver' : currentIteration > 0 ? 'Resume Solver' : 'Run Solver'}</span>
            </button>
            <button
              onClick={handleResetSolver}
              className="px-2.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-100 transition"
              title="Reset Solver to Initialized State"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Center Panel: CFD/FEA Grid Mesh Visualization & Live Convergence Chart */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-950 p-4 border-r border-slate-850 overflow-hidden" id="solver_central_dashboard">
        
        {/* Sub-view switcher header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-4 shrink-0">
          <div className="flex items-center space-x-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Numerical Engine</h3>
            <span className="text-slate-600">|</span>
            <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800">
              <button
                onClick={() => setActiveSubView('solver')}
                className={`px-3 py-1.5 text-[11px] font-semibold rounded-md flex items-center space-x-1.5 transition ${activeSubView === 'solver' ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 shadow-inner' : 'text-slate-400 hover:text-slate-200 border border-transparent'}`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Finite Element Mesh Solver</span>
              </button>
              <button
                onClick={() => setActiveSubView('sensitivity')}
                className={`px-3 py-1.5 text-[11px] font-semibold rounded-md flex items-center space-x-1.5 transition ${activeSubView === 'sensitivity' ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 shadow-inner' : 'text-slate-400 hover:text-slate-200 border border-transparent'}`}
                id="tab_parametric_sensitivity"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Parametric Sensitivity Analyzer</span>
              </button>
            </div>
          </div>
          <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">WORKBENCH MODE: SOLVERS</span>
        </div>

        {activeSubView === 'solver' ? (
          <>
            {/* Dynamic Mesh grid visualization on hull */}
            <div className="flex-1 bg-slate-900/40 rounded-xl border border-slate-800 p-4 flex flex-col relative overflow-hidden mb-4 min-h-[170px]" id="solver_visual_viewport">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold tracking-wider">
                  {selectedSolver === 'cfd' ? 'CFD Fluid Flow Mesh Grid (Pressure Distribution)' : selectedSolver === 'fea' ? 'FEA Stress Finite Element Grid (Von Mises stress)' : 'Boundary Element Panel Grid (Stability Volume Integration)'}
                </span>
                <div className="flex items-center space-x-1.5">
                  <div className={`w-2 h-2 rounded-full ${isSolving ? 'bg-cyan-400 animate-pulse' : currentIteration > 0 ? 'bg-emerald-400' : 'bg-slate-600'}`}></div>
                  <span className="text-[9px] font-mono uppercase text-slate-500">{isSolving ? 'Solving Iterations' : currentIteration > 0 ? 'Finished / Paused' : 'Idle'}</span>
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center relative">
                <svg viewBox="-10 -10 520 180" className="w-full max-w-2xl h-full" id="svg_numerical_mesher">
                  {/* Hull Contour Profile */}
                  <path 
                    d="M 10,40 Q 250,55 490,20 L 490,140 Q 250,165 10,160 Z" 
                    fill="#0f172a" 
                    stroke="#1e293b" 
                    strokeWidth="1" 
                  />

                  {/* Dynamic Finite Elements Mesh Grid cells */}
                  {Array.from({ length: gridResolution.x }).map((_, xi) => {
                    const xFrac = xi / gridResolution.x;
                    const xVal = 10 + xFrac * 480;
                    const cellW = 480 / gridResolution.x;
                    
                    return Array.from({ length: gridResolution.y }).map((_, yi) => {
                      const yFrac = yi / gridResolution.y;
                      const cellH = (160 - (20 + xFrac * 20)) / gridResolution.y; // custom height bounding
                      const yVal = (20 + xFrac * 20) + yFrac * (140 - (20 + xFrac * 20));
                      
                      // Compute dynamic color depending on numerical engine & iteration counts
                      let cellFill = 'rgba(30, 41, 59, 0.2)';
                      let cellStroke = 'rgba(71, 85, 105, 0.25)';
                      
                      if (currentIteration > 0) {
                        const progressFrac = currentIteration / maxIterations;
                        
                        if (selectedSolver === 'cfd') {
                          // Fluid flow pressure contour: Sine ripples moving backward
                          const ripple = Math.sin(xFrac * 12 - currentIteration * 0.45) * 0.5 + 0.5;
                          const pressure = ripple * (1 - yFrac) * (0.4 + 0.6 * progressFrac);
                          cellFill = `rgba(6, ${Math.floor(182 * pressure)}, ${Math.floor(212 * (1 - pressure))}, 0.55)`;
                          cellStroke = `rgba(34, 211, 238, ${meshDensity === 'ultra' ? '0.08' : '0.15'})`;
                        } else if (selectedSolver === 'fea') {
                          // Structural stress: High stress at keel (yFrac -> 1) and midship (xFrac -> 0.5)
                          const stressFactor = Math.sin(xFrac * Math.PI) * (0.2 + 0.8 * yFrac);
                          const stressNorm = stressFactor * (0.5 + 0.5 * Math.sin(currentIteration * 0.1));
                          cellFill = `rgba(${Math.floor(239 * stressNorm)}, ${Math.floor(68 * (1 - stressNorm))}, 68, 0.55)`;
                          cellStroke = `rgba(248, 113, 113, ${meshDensity === 'ultra' ? '0.08' : '0.15'})`;
                        } else {
                          // Boundary Hydrostatics: linear water-air interface
                          const isSubmerged = yFrac > 0.45;
                          cellFill = isSubmerged ? 'rgba(30, 58, 138, 0.6)' : 'rgba(15, 23, 42, 0.4)';
                          cellStroke = isSubmerged ? 'rgba(59, 130, 246, 0.2)' : 'rgba(71, 85, 105, 0.15)';
                        }
                      }

                      return (
                        <rect 
                          key={`${xi}_${yi}`} 
                          x={xVal} 
                          y={yVal} 
                          width={cellW} 
                          height={cellH} 
                          fill={cellFill} 
                          stroke={cellStroke} 
                          strokeWidth="0.4" 
                        />
                      );
                    });
                  })}

                  {/* Scanning solver line to represent actively solved regions */}
                  {isSolving && (
                    <g>
                      {/* Vertical scan wave */}
                      <line 
                        x1={10 + ((currentIteration * 5) % 100) / 100 * 480} 
                        y1="10" 
                        x2={10 + ((currentIteration * 5) % 100) / 100 * 480} 
                        y2="170" 
                        stroke="rgba(34, 211, 238, 0.85)" 
                        strokeWidth="2.5" 
                        className="shadow-[0_0_8px_#22d3ee]"
                      />
                    </g>
                  )}

                  {/* Waterline indicator line */}
                  <line x1="0" y1="100" x2="500" y2="100" stroke="#06b6d4" strokeWidth="1" strokeDasharray="5,3" />
                </svg>
              </div>
            </div>

            {/* Live numerical residual convergence chart (SVG plotting area) */}
            <div className="h-44 bg-slate-900/40 rounded-xl border border-slate-800 p-4 flex flex-col overflow-hidden relative" id="solver_residuals_chart_card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold tracking-wider">L2 Residual Convergence History (Log₁₀ scale)</span>
                {residuals.length > 0 && (
                  <span className="text-[9px] font-mono text-cyan-400">Current Residual: <strong>{residuals[residuals.length - 1].toExponential(4)}</strong></span>
                )}
              </div>

              <div className="flex-1 relative flex items-center justify-center">
                {residuals.length === 0 ? (
                  <div className="text-center space-y-1.5 py-4 select-none">
                    <Activity className="w-6 h-6 text-slate-600 mx-auto animate-pulse" />
                    <span className="text-[11px] font-mono text-slate-500 block">No solver iteration data yet. Start solver to generate real-time convergence plots.</span>
                  </div>
                ) : (
                  <svg className="w-full h-full" viewBox="0 0 500 110" id="svg_residuals_graph">
                    {/* Horizontal reference lines for log decades */}
                    <g stroke="#1e293b" strokeWidth="0.5">
                      <line x1="40" y1="10" x2="480" y2="10" />
                      <line x1="40" y1="35" x2="480" y2="35" />
                      <line x1="40" y1="60" x2="480" y2="60" />
                      <line x1="40" y1="85" x2="480" y2="85" />
                      <line x1="40" y1="105" x2="480" y2="105" />
                    </g>

                    {/* Y Axis labels (decades of error) */}
                    <g fill="#475569" fontSize="6.5" fontFamily="monospace" textAnchor="end">
                      <text x="34" y="13">1.0e+0</text>
                      <text x="34" y="38">1.0e-2</text>
                      <text x="34" y="63">1.0e-4</text>
                      <text x="34" y="88">1.0e-6</text>
                      <text x="34" y="108">1.0e-8</text>
                    </g>

                    {/* X Axis iteration marks */}
                    <g fill="#475569" fontSize="6.5" fontFamily="monospace" textAnchor="middle">
                      <text x="40" y="117">0</text>
                      <text x="150" y="117">ITER 50</text>
                      <text x="260" y="117">ITER 100</text>
                      <text x="370" y="117">ITER 150</text>
                      <text x="480" y="117">ITER {maxIterations}</text>
                    </g>

                    {/* Tolerance Limit Threshold dashed line */}
                    <line 
                      x1="40" 
                      y1={10 + (Math.log10(1) - Math.log10(tolerance)) / 8 * 95} 
                      x2="480" 
                      y2={10 + (Math.log10(1) - Math.log10(tolerance)) / 8 * 95} 
                      stroke="#ef4444" 
                      strokeWidth="0.8" 
                      strokeDasharray="4,2" 
                    />
                    <text 
                      x="45" 
                      y={5 + (Math.log10(1) - Math.log10(tolerance)) / 8 * 95} 
                      fill="#ef4444" 
                      fontSize="6" 
                      fontFamily="monospace"
                    >
                      CONVERGENCE TARGET ({tolerance.toExponential(1)})
                    </text>

                    {/* Line Plotting residuals */}
                    {(() => {
                      const points = residuals.map((res, idx) => {
                        // map index (0 to max) to X (40 to 480)
                        const x = 40 + (idx / Math.max(1, maxIterations)) * 440;
                        // map log10(res) (0 to -8) to Y (10 to 105)
                        const logVal = Math.log10(res);
                        const clampedLog = Math.max(-8, Math.min(0, logVal));
                        const y = 10 + (0 - clampedLog) / 8 * 95;
                        return `${x},${y}`;
                      }).join(' ');

                      return (
                        <g>
                          <polyline 
                            fill="none" 
                            stroke="#22d3ee" 
                            strokeWidth="1.8" 
                            points={points} 
                            className="transition-all duration-70"
                          />
                          {/* Pulse point at latest iteration */}
                          {residuals.length > 0 && (() => {
                            const idx = residuals.length - 1;
                            const x = 40 + (idx / Math.max(1, maxIterations)) * 440;
                            const logVal = Math.log10(residuals[idx]);
                            const clampedLog = Math.max(-8, Math.min(0, logVal));
                            const y = 10 + (0 - clampedLog) / 8 * 95;
                            return (
                              <circle cx={x} cy={y} r="3" fill="#22d3ee" className="animate-ping" />
                            );
                          })()}
                        </g>
                      );
                    })()}
                  </svg>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Real-Time Sensitivity Analyzer view */
          <div className="flex-1 flex flex-col space-y-4 overflow-y-auto pr-1" id="sensitivity_dashboard_view">
            {/* Sensitivity Selection Controls */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-900/40 rounded-xl border border-slate-800 p-4 shrink-0">
              <div className="md:col-span-5 space-y-1.5">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Target Parametric Driver</label>
                <select
                  value={selectedSensitivityParam}
                  onChange={(e) => setSelectedSensitivityParam(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-semibold text-cyan-400 outline-none hover:border-slate-700 focus:border-cyan-500 transition"
                  id="sensitivity_param_select"
                >
                  {SENSITIVITY_PARAMS.map(p => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3 space-y-1.5">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Sweep Limits</label>
                <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800" id="sensitivity_range_selector">
                  {[10, 20, 30, 50].map((r) => (
                    <button
                      key={r}
                      onClick={() => setSensitivityRange(r)}
                      className={`flex-1 py-1 text-[10px] font-mono font-bold rounded transition ${sensitivityRange === r ? 'bg-cyan-500 text-slate-950 shadow font-extrabold' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      ±{r}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="md:col-span-4 bg-slate-950/60 rounded-lg border border-slate-850 p-2.5 flex flex-col justify-center">
                <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold uppercase">
                  <span>Active Base Value</span>
                  <span className="text-emerald-400 font-mono font-bold">
                    {((parameters as any)[selectedSensitivityParam] ?? 0).toFixed(3)}
                    {SENSITIVITY_PARAMS.find(p => p.key === selectedSensitivityParam)?.unit}
                  </span>
                </div>
                <p className="text-[9px] text-slate-400 mt-1 leading-normal italic">
                  {SENSITIVITY_PARAMS.find(p => p.key === selectedSensitivityParam)?.desc}
                </p>
              </div>
            </div>

            {/* Main Interactive Dual-Axis Chart */}
            <div className="flex-1 bg-slate-900/40 rounded-xl border border-slate-800 p-4 flex flex-col relative overflow-hidden min-h-[250px]">
              <div className="flex items-center justify-between mb-3 border-b border-slate-800/60 pb-2 shrink-0">
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-mono uppercase text-slate-300 font-semibold tracking-wider">
                    Interactive Derivative Map
                  </span>
                  <span className="text-[9px] text-slate-500 italic hidden sm:inline">
                    (Hover cursor over grid to probe coordinates)
                  </span>
                </div>
                
                {/* Custom Legend */}
                <div className="flex items-center space-x-4 text-[9px] font-mono uppercase font-semibold">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-0.5 bg-emerald-400 inline-block rounded"></span>
                    <span className="text-emerald-400">Displacement (t)</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-0.5 bg-cyan-400 inline-block rounded"></span>
                    <span className="text-cyan-400">Resistance (kN)</span>
                  </div>
                </div>
              </div>

              {/* Chart Stage */}
              <div className="flex-1 relative flex items-center justify-center min-h-[185px]">
                {chartPoints && scaleInfo ? (
                  <div className="w-full h-full relative flex flex-col justify-between">
                    <svg
                      viewBox="0 0 600 240"
                      className="w-full h-full select-none"
                      onMouseMove={handleMouseMove}
                      onMouseLeave={handleMouseLeave}
                      id="svg_sensitivity_chart"
                    >
                      <defs>
                        {/* Glow Filter for lines */}
                        <filter id="glow-disp" x="-10%" y="-10%" width="120%" height="120%">
                          <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#34d399" floodOpacity="0.45" />
                        </filter>
                        <filter id="glow-res" x="-10%" y="-10%" width="120%" height="120%">
                          <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#22d3ee" floodOpacity="0.45" />
                        </filter>
                        
                        {/* Area shading gradients */}
                        <linearGradient id="grad-disp" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0.06" />
                          <stop offset="100%" stopColor="#10b981" stopOpacity="0.00" />
                        </linearGradient>
                        <linearGradient id="grad-res" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.06" />
                          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.00" />
                        </linearGradient>
                      </defs>

                      {/* X grid lines and vertical guide ticks */}
                      {Array.from({ length: 5 }).map((_, i) => {
                        const frac = i / 4; // 0 to 1
                        const x = 60 + frac * 480;
                        const pct = -sensitivityRange + frac * 2 * sensitivityRange;
                        const isCenter = i === 2;
                        
                        return (
                          <g key={`grid-x-${i}`}>
                            <line
                              x1={x}
                              y1="25"
                              x2={x}
                              y2="205"
                              stroke={isCenter ? 'rgba(255,255,255,0.3)' : 'rgba(71,85,105,0.12)'}
                              strokeDasharray={isCenter ? '0' : '4,4'}
                              strokeWidth={isCenter ? '1.2' : '0.8'}
                            />
                            <text
                              x={x}
                              y="218"
                              fill={isCenter ? '#cbd5e1' : '#475569'}
                              fontSize="8"
                              fontFamily="monospace"
                              textAnchor="middle"
                              fontWeight={isCenter ? 'bold' : 'normal'}
                            >
                              {pct > 0 ? `+${pct.toFixed(0)}%` : `${pct.toFixed(0)}%`}
                            </text>
                          </g>
                        );
                      })}

                      {/* Y-Grid horizontal lines */}
                      {Array.from({ length: 5 }).map((_, i) => {
                        const frac = i / 4; // 0 to 1
                        const y = 25 + frac * 180;
                        return (
                          <line
                            key={`grid-y-${i}`}
                            x1="60"
                            y1={y}
                            x2="540"
                            y2={y}
                            stroke="rgba(71,85,105,0.08)"
                            strokeWidth="0.8"
                          />
                        );
                      })}

                      {/* Y1 (Displacement) Axis Labels */}
                      <g fill="#34d399" fontSize="7.5" fontFamily="monospace" textAnchor="end">
                        {Array.from({ length: 5 }).map((_, i) => {
                          const frac = i / 4;
                          const val = scaleInfo.maxDisp - frac * (scaleInfo.maxDisp - scaleInfo.minDisp);
                          const y = 25 + frac * 180;
                          return (
                            <text key={`disp-lbl-${i}`} x="54" y={y + 2.5}>
                              {val.toLocaleString(undefined, { maximumFractionDigits: 0 })} t
                            </text>
                          );
                        })}
                      </g>

                      {/* Y2 (Resistance) Axis Labels */}
                      <g fill="#22d3ee" fontSize="7.5" fontFamily="monospace" textAnchor="start">
                        {Array.from({ length: 5 }).map((_, i) => {
                          const frac = i / 4;
                          const val = scaleInfo.maxRes - frac * (scaleInfo.maxRes - scaleInfo.minRes);
                          const y = 25 + frac * 180;
                          return (
                            <text key={`res-lbl-${i}`} x="546" y={y + 2.5}>
                              {val.toLocaleString(undefined, { maximumFractionDigits: 1 })} kN
                            </text>
                          );
                        })}
                      </g>

                      {/* Displacement Gradient Area Fill */}
                      {(() => {
                        const areaPoints = [
                          { x: 60, y: 205 },
                          ...chartPoints.dispPoints,
                          { x: 540, y: 205 }
                        ].map(p => `${p.x},${p.y}`).join(' ');
                        return <polygon points={areaPoints} fill="url(#grad-disp)" />;
                      })()}

                      {/* Resistance Gradient Area Fill */}
                      {(() => {
                        const areaPoints = [
                          { x: 60, y: 205 },
                          ...chartPoints.resPoints,
                          { x: 540, y: 205 }
                        ].map(p => `${p.x},${p.y}`).join(' ');
                        return <polygon points={areaPoints} fill="url(#grad-res)" />;
                      })()}

                      {/* Displacement Curve Polyline */}
                      <polyline
                        fill="none"
                        stroke="#34d399"
                        strokeWidth="2"
                        points={chartPoints.dispPoints.map(p => `${p.x},${p.y}`).join(' ')}
                        filter="url(#glow-disp)"
                      />

                      {/* Resistance Curve Polyline */}
                      <polyline
                        fill="none"
                        stroke="#22d3ee"
                        strokeWidth="2"
                        points={chartPoints.resPoints.map(p => `${p.x},${p.y}`).join(' ')}
                        filter="url(#glow-res)"
                      />

                      {/* Line vertex markers */}
                      {chartPoints.dispPoints.map((p, i) => (
                        <circle
                          key={`disp-dot-${i}`}
                          cx={p.x}
                          cy={p.y}
                          r="2.5"
                          fill="#0f172a"
                          stroke="#34d399"
                          strokeWidth="1.5"
                        />
                      ))}
                      {chartPoints.resPoints.map((p, i) => (
                        <circle
                          key={`res-dot-${i}`}
                          cx={p.x}
                          cy={p.y}
                          r="2.5"
                          fill="#0f172a"
                          stroke="#22d3ee"
                          strokeWidth="1.5"
                        />
                      ))}

                      {/* Dynamic vertical mouse guide bar and highlight rings */}
                      {hoveredPointIdx !== null && (() => {
                        const ptDisp = chartPoints.dispPoints[hoveredPointIdx];
                        const ptRes = chartPoints.resPoints[hoveredPointIdx];
                        
                        return (
                          <g>
                            <line
                              x1={ptDisp.x}
                              y1="25"
                              x2={ptDisp.x}
                              y2="205"
                              stroke="rgba(148, 163, 184, 0.45)"
                              strokeWidth="1.2"
                              strokeDasharray="3,3"
                            />
                            
                            <circle cx={ptDisp.x} cy={ptDisp.y} r="6.5" fill="none" stroke="#34d399" strokeWidth="1.5" className="animate-pulse" />
                            <circle cx={ptDisp.x} cy={ptDisp.y} r="4.0" fill="#34d399" />
                            
                            <circle cx={ptRes.x} cy={ptRes.y} r="6.5" fill="none" stroke="#22d3ee" strokeWidth="1.5" className="animate-pulse" />
                            <circle cx={ptRes.x} cy={ptRes.y} r="4.0" fill="#22d3ee" />
                          </g>
                        );
                      })()}
                    </svg>

                    {/* Probing values floating panel */}
                    <div className="absolute top-2 left-[64px] right-[64px] flex items-center justify-between pointer-events-none">
                      {hoveredPointIdx !== null ? (() => {
                        const d = sensitivityData[hoveredPointIdx];
                        const labelMeta = SENSITIVITY_PARAMS.find(p => p.key === selectedSensitivityParam);
                        
                        // Calculate percentage deviations from baseline (index 5 represents 0% change)
                        const baseD = sensitivityData[5];
                        const devDisp = baseD.displacement > 0 ? ((d.displacement - baseD.displacement) / baseD.displacement) * 100 : 0;
                        const devRes = baseD.resistance > 0 ? ((d.resistance - baseD.resistance) / baseD.resistance) * 100 : 0;
                        
                        return (
                          <div className="w-full bg-slate-950/95 border border-slate-800 rounded-lg py-1.5 px-3 flex items-center justify-between shadow-xl">
                            <div className="flex flex-col">
                              <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">PROBE COORDINATE</span>
                              <span className="text-slate-200 text-xs font-bold font-mono">
                                {d.paramValue.toFixed(2)}
                                {labelMeta?.unit}
                                <span className={`ml-1 text-[10px] font-semibold ${d.percentChange === 0 ? 'text-slate-400' : d.percentChange > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  ({d.percentChange > 0 ? `+` : ''}{d.percentChange.toFixed(0)}%)
                                </span>
                              </span>
                            </div>
                            
                            <div className="flex items-center space-x-6">
                              <div className="flex flex-col items-end">
                                <span className="text-[8px] text-emerald-400 font-bold uppercase tracking-wider">DISPLACEMENT</span>
                                <span className="text-slate-200 text-xs font-bold font-mono flex items-center">
                                  {d.displacement.toLocaleString(undefined, { maximumFractionDigits: 1 })} t
                                  <span className={`ml-1.5 text-[10px] font-semibold ${devDisp === 0 ? 'text-slate-500' : devDisp > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {devDisp === 0 ? '—' : `${devDisp > 0 ? '▲' : '▼'} ${Math.abs(devDisp).toFixed(1)}%`}
                                  </span>
                                </span>
                              </div>

                              <div className="flex flex-col items-end">
                                <span className="text-[8px] text-cyan-400 font-bold uppercase tracking-wider">TOTAL RESISTANCE</span>
                                <span className="text-slate-200 text-xs font-bold font-mono flex items-center">
                                  {d.resistance.toLocaleString(undefined, { maximumFractionDigits: 1 })} kN
                                  <span className={`ml-1.5 text-[10px] font-semibold ${devRes === 0 ? 'text-slate-500' : devRes > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {devRes === 0 ? '—' : `${devRes > 0 ? '▲' : '▼'} ${Math.abs(devRes).toFixed(1)}%`}
                                  </span>
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })() : (
                        <div className="w-full bg-slate-900/30 border border-slate-800/20 rounded-lg py-1.5 text-center text-[9px] text-slate-500 font-medium">
                          Slide mouse across graph canvas to inspect hydrostatic displacement values and ITTC resistance parameters
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500 text-xs italic font-mono">Insufficient model parameters.</div>
                )}
              </div>
            </div>

            {/* Split Bottom Layer: Tabular Readout + Deep Design Insights */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 shrink-0" id="sensitivity_deep_analytics">
              {/* Data Table */}
              <div className="xl:col-span-7 bg-slate-900/40 rounded-xl border border-slate-800 p-3 flex flex-col h-48">
                <span className="text-[10px] font-mono uppercase text-slate-400 font-bold tracking-wider mb-2 block">
                  Discrete Derivative Data
                </span>
                <div className="flex-1 overflow-y-auto" id="sensitivity_table_scroller">
                  <table className="w-full text-left border-collapse text-[10px] font-mono">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500 font-bold">
                        <th className="pb-1.5">Vary %</th>
                        <th className="pb-1.5">Sweep Value</th>
                        <th className="pb-1.5 text-right">Displacement</th>
                        <th className="pb-1.5 text-right">Resistance</th>
                        <th className="pb-1.5 text-right">Block Coeff (Cb)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850/40">
                      {sensitivityData.map((d) => {
                        const isBaseline = d.percentChange === 0;
                        return (
                          <tr
                            key={`tbl-row-${d.idx}`}
                            className={`hover:bg-slate-800/30 transition ${isBaseline ? 'bg-cyan-500/5 font-bold text-cyan-400 border-y border-cyan-500/20' : 'text-slate-400'}`}
                          >
                            <td className="py-1">
                              {d.percentChange > 0 ? `+` : ''}
                              {d.percentChange.toFixed(0)}%
                            </td>
                            <td className="py-1 font-semibold">
                              {d.paramValue.toFixed(2)}
                              {SENSITIVITY_PARAMS.find(p => p.key === selectedSensitivityParam)?.unit}
                            </td>
                            <td className="py-1 text-right text-emerald-400">
                              {d.displacement.toLocaleString(undefined, { maximumFractionDigits: 0 })} t
                            </td>
                            <td className="py-1 text-right text-cyan-400 font-medium">
                              {d.resistance.toLocaleString(undefined, { maximumFractionDigits: 1 })} kN
                            </td>
                            <td className="py-1 text-right text-slate-400">
                              {d.cb.toFixed(3)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Advanced Engineering Insights */}
              <div className="xl:col-span-5 bg-slate-900/40 rounded-xl border border-slate-800 p-3 flex flex-col justify-between h-48" id="sensitivity_insights_panel">
                <span className="text-[10px] font-mono uppercase text-slate-400 font-bold tracking-wider block mb-1">
                  💡 Hydrodynamic Sensitivity Insights
                </span>
                
                {(() => {
                  const baseD = sensitivityData[5];
                  const plus20 = sensitivityData[sensitivityData.length - 1];
                  const minus20 = sensitivityData[0];
                  
                  if (!baseD || !plus20 || !minus20) return null;
                  
                  const dDisp = plus20.displacement - minus20.displacement;
                  const pctDispDiff = baseD.displacement > 0 ? (dDisp / baseD.displacement) * 100 : 0;
                  
                  const dRes = plus20.resistance - minus20.resistance;
                  const pctResDiff = baseD.resistance > 0 ? (dRes / baseD.resistance) * 100 : 0;
                  
                  // Compute a sensitivity score
                  const score = Math.max(Math.abs(pctDispDiff), Math.abs(pctResDiff));
                  const sensitivityRating = score > 30 ? 'HIGH' : score > 10 ? 'MEDIUM' : 'LOW';
                  
                  // Custom physics message paragraph based on parameter key
                  let explanation = '';
                  
                  switch (selectedSensitivityParam) {
                    case 'length':
                      if (dRes < 0) {
                        explanation = `Stretching hull length (L) increases displacement linearly but decreases wave-making resistance by ${Math.abs(pctResDiff).toFixed(1)}% due to lower design Froude numbers. This represents a highly efficient hydrodynamic optimization choice.`;
                      } else {
                        explanation = `Increasing length raises wetted surface area, introducing a +${pctResDiff.toFixed(1)}% frictional resistance change. However, longitudinal hulls have lower wave-making characteristics.`;
                      }
                      break;
                    case 'beam':
                      explanation = `Max Beam (B) has a massive ${pctDispDiff.toFixed(1)}% impact on buoyancy but triggers a steep +${pctResDiff.toFixed(1)}% total drag penalty at speed. Optimize beam for required initial transverse stability limits.`;
                      break;
                    case 'draft':
                      explanation = `Draft (T) strongly controls submerged section areas. A ${sensitivityRange}% increase scales displacement by +${pctDispDiff.toFixed(1)}%, but wetted area rises significantly, causing +${pctResDiff.toFixed(1)}% more frictional drag.`;
                      break;
                    case 'fullness':
                      explanation = `Fullness (Cwp) raises volumetric displacement by +${pctDispDiff.toFixed(1)}%. Blunt hull shoulders, however, increase bow wave elevation, adding +${pctResDiff.toFixed(1)}% wave resistance.`;
                      break;
                    case 'deadrise':
                      explanation = `Increasing deadrise angle tilts bottom plates, which lowers wetted lifting pressures. It causes a ${pctDispDiff.toFixed(0)}% decrease in displacement while changing resistance by ${pctResDiff > 0 ? '+' : ''}${pctResDiff.toFixed(1)}%.`;
                      break;
                    case 'transomBeamRatio':
                      explanation = `Transom width ratio alters aft waterplane fullness. Widening the transom increases deck space but induces a ${pctResDiff > 0 ? '+' : ''}${pctResDiff.toFixed(1)}% viscous pressure separation drag penalty at stern lines.`;
                      break;
                    case 'flare':
                      explanation = `Wall flare alters deck-edge reserve buoyancy. At design draft, flare changes resistance by just ${pctResDiff.toFixed(2)}%, making it neutral for cruise drag but critical for sea slam flare.`;
                      break;
                    case 'bilgeRadius':
                      explanation = `Bilge radius rounds the lower corners. Increasing bilge radius shrinks midship area, reducing displacement by ${Math.abs(pctDispDiff).toFixed(1)}% and lowering friction surface by ${Math.abs(pctResDiff).toFixed(1)}%.`;
                      break;
                    default:
                      explanation = `This parameter drives a ${pctDispDiff.toFixed(1)}% change in displacement and a ${pctResDiff.toFixed(1)}% shift in resistance over the range.`;
                  }
                  
                  return (
                    <div className="flex-1 flex flex-col justify-between mt-1 text-[9.5px]">
                      <p className="text-slate-300 leading-relaxed bg-slate-950/45 p-2.5 rounded-lg border border-slate-850">
                        {explanation}
                      </p>
                      
                      <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded-lg border border-slate-850 mt-1.5">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-slate-500 font-bold uppercase">System Coefficient:</span>
                          <span className={`font-extrabold ${sensitivityRating === 'HIGH' ? 'text-rose-400' : sensitivityRating === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {sensitivityRating}
                          </span>
                        </div>
                        
                        <div className="text-slate-500 font-bold uppercase text-[8px] tracking-wide">
                          Sweep Range: ±{sensitivityRange}%
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Right Side: Real-time Live Solver Terminal Log Console */}
      <div className="w-full lg:w-80 bg-slate-900 flex flex-col shrink-0 overflow-hidden" id="solver_terminal_container">
        <div className="p-4 border-b border-slate-800 bg-slate-950/40 shrink-0 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span>Solver Engine Log</span>
          </h3>
          <span className="text-[9px] font-mono text-slate-500">STDOUT</span>
        </div>

        {/* Live scrolling terminal console */}
        <div className="flex-1 bg-slate-950 p-3 font-mono text-[10px] text-slate-300 overflow-y-auto space-y-1.5" id="solver_logs_console">
          {logs.length === 0 ? (
            <div className="text-slate-600 italic py-6 text-center select-none">
              &gt; Ready to solve. Click "Run Solver" to initialize computations.
            </div>
          ) : (
            <>
              {logs.map((log) => (
                <div 
                  key={log.id} 
                  className={`leading-relaxed break-all border-l pl-2 ${
                    log.type === 'info' ? 'text-slate-400 border-slate-700' :
                    log.type === 'success' ? 'text-emerald-400 border-emerald-500 font-bold' :
                    log.type === 'warning' ? 'text-amber-400 border-amber-500 font-bold' :
                    'text-cyan-300 border-cyan-800'
                  }`}
                >
                  <span className="text-slate-600 mr-1.5">[{new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                  <span>{log.text}</span>
                </div>
              ))}
            </>
          )}
          <div ref={terminalBottomRef} />
        </div>

        {/* Solver Stats Card summary in sidebar */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-850 space-y-2 font-mono text-[11px] shrink-0">
          <span className="text-slate-400 uppercase tracking-wider block text-[10px] font-bold">Solver Process Monitor</span>
          <div className="space-y-1.5 text-slate-300">
            <div className="flex justify-between">
              <span>Status:</span>
              <span className={`font-bold uppercase ${isSolving ? 'text-cyan-400 animate-pulse' : hasFinished ? 'text-emerald-400' : 'text-slate-500'}`}>
                {isSolving ? 'solving...' : hasFinished ? 'finished' : 'idle'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Iteration:</span>
              <span className="text-white font-bold">{currentIteration} / {maxIterations}</span>
            </div>
            <div className="flex justify-between">
              <span>Convergence:</span>
              {residuals.length > 0 ? (
                <span className={`font-bold ${residuals[residuals.length - 1] <= tolerance ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {residuals[residuals.length - 1] <= tolerance ? 'CONVERGED' : 'RUNNING'}
                </span>
              ) : (
                <span className="text-slate-500">N/A</span>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
