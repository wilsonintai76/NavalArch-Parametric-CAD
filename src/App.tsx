/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { HullParameters, VersionCommit, ScriptLog, ProductivityMetric } from './types';
import { calculateHydrostatics, calculateResistance, exportToDXF, exportToOBJ, exportOffsetTable } from './utils/hullGeometry';
import ViewportsContainer from './components/ViewportsContainer';
import ParamsPanel from './components/ParamsPanel';
import HydrostaticsPanel from './components/HydrostaticsPanel';
import ResistancePanel from './components/ResistancePanel';
import ScriptingPanel from './components/ScriptingPanel';
import AnalyticsPanel from './components/AnalyticsPanel';
import ApiPanel from './components/ApiPanel';
import StructureTreePanel from './components/StructureTreePanel';
import NumericalSolversPanel from './components/NumericalSolversPanel';
import { Ship, Download, FileText, Share2, HelpCircle, HardDrive, ShieldAlert, Cpu, ChevronDown, ChevronUp } from 'lucide-react';

// Pre-defined ship design files
interface PresetShip {
  fileName: string;
  name: string;
  type: string;
  params: HullParameters;
}

const PRESET_VESSELS: PresetShip[] = [
  {
    fileName: 'frigate_120m.hull',
    name: 'Naval Destroyer (FFG-120)',
    type: 'Combatant / Fine Vessel',
    params: {
      length: 120,
      beam: 14.5,
      draft: 4.5,
      depth: 8.5,
      deadrise: 12,
      bilgeRadius: 2.5,
      sheerBow: 2.8,
      sheerStern: 1.4,
      bowRake: 26,
      transomBeamRatio: 0.8,
      fullness: 1.15,
      flare: 18.0
    }
  },
  {
    fileName: 'trawler_18m.hull',
    name: 'North Sea Fishing Trawler',
    type: 'High-Displacement Hull',
    params: {
      length: 18.5,
      beam: 5.6,
      draft: 1.9,
      depth: 3.6,
      deadrise: 6,
      bilgeRadius: 1.1,
      sheerBow: 1.65,
      sheerStern: 0.9,
      bowRake: 14,
      transomBeamRatio: 0.55,
      fullness: 1.4,
      flare: 12.0
    }
  },
  {
    fileName: 'containership_180m.hull',
    name: 'Panamax Cargo Carrier',
    type: 'Full Block Carrier',
    params: {
      length: 180,
      beam: 32.2,
      draft: 11.5,
      depth: 16.5,
      deadrise: 2,
      bilgeRadius: 3.8,
      sheerBow: 3.9,
      sheerStern: 1.1,
      bowRake: 16,
      transomBeamRatio: 0.95,
      fullness: 1.8,
      flare: 10.0
    }
  },
  {
    fileName: 'patrol_boat_32m.hull',
    name: 'Coastal Patrol Cutter',
    type: 'High-Speed Interceptor',
    params: {
      length: 32,
      beam: 6.2,
      draft: 1.4,
      depth: 3.0,
      deadrise: 16,
      bilgeRadius: 0.8,
      sheerBow: 1.4,
      sheerStern: 0.75,
      bowRake: 22,
      transomBeamRatio: 0.85,
      fullness: 0.9,
      flare: 20.0
    }
  }
];

export default function App() {
  const [activePresetIdx, setActivePresetIdx] = React.useState<number>(() => {
    try {
      const savedPreset = localStorage.getItem('naval_architect_preset_idx');
      if (savedPreset !== null) {
        const parsed = parseInt(savedPreset, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed < PRESET_VESSELS.length) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Error reading activePresetIdx from localStorage', e);
    }
    return 0;
  });

  const [parameters, setParameters] = React.useState<HullParameters>(() => {
    try {
      const savedParams = localStorage.getItem('naval_architect_params');
      if (savedParams !== null) {
        const parsed = JSON.parse(savedParams);
        if (parsed && typeof parsed === 'object' && typeof parsed.length === 'number') {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Error reading parameters from localStorage', e);
    }
    return PRESET_VESSELS[0].params;
  });

  const [wasRecovered, setWasRecovered] = React.useState<boolean>(() => {
    try {
      const savedParams = localStorage.getItem('naval_architect_params');
      return savedParams !== null;
    } catch {
      return false;
    }
  });

  const [lastSavedTime, setLastSavedTime] = React.useState<string>('');

  // Auto-save parametric state to localStorage on changes
  React.useEffect(() => {
    try {
      localStorage.setItem('naval_architect_params', JSON.stringify(parameters));
      localStorage.setItem('naval_architect_preset_idx', activePresetIdx.toString());
      setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (e) {
      console.error('Failed to auto-save to localStorage', e);
    }
  }, [parameters, activePresetIdx]);
  
  // Tab control
  const [activeTab, setActiveTab] = useState<'hydrostatics' | 'resistance' | 'scripting' | 'analytics' | 'api'>('hydrostatics');
  const [workbenchMode, setWorkbenchMode] = useState<'modeling' | 'structure' | 'solvers'>('modeling');

  // Workspace layout space toggles to maximize the CAD viewports on demand
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(true);
  
  // Collaboration & Role configurations
  const [userRole, setUserRole] = useState<'Admin' | 'Designer' | 'Viewer'>('Designer');

  // Commits & Version Control History (Stored state)
  const [commits, setCommits] = useState<VersionCommit[]>([
    {
      id: 'a3d4f8b',
      title: 'Hull Lengthening & Flare optimization',
      description: 'Increased length waterlines and adjusted bow flare to improve high-speed sea-keeping and spray deflection.',
      timestamp: '11:42 AM',
      author: 'David Mercer',
      parameters: {
        ...PRESET_VESSELS[0].params,
        length: 125.0,
        beam: 14.8,
        bowRake: 28.0,
        flare: 21.0
      }
    },
    {
      id: 'e6b2c9a',
      title: 'Draft Reduction for Coastal Access',
      description: 'Reduced design draft to 4.2m to access shallow harbor entries; fullness adjusted to compensate displacement.',
      timestamp: '09:15 AM',
      author: 'Sarah Jenkins',
      parameters: {
        ...PRESET_VESSELS[0].params,
        draft: 4.2,
        fullness: 1.25,
        deadrise: 14.0,
        sheerBow: 3.0
      }
    },
    {
      id: 'c8f7a1e',
      title: 'Initial Hull Blueprint',
      description: 'Parametric seed loaded from destroyer classification curves.',
      timestamp: '08:05 AM',
      author: 'Sarah Jenkins',
      parameters: PRESET_VESSELS[0].params
    }
  ]);

  // Analytics Metrics Timeline
  const [metrics, setMetrics] = useState<ProductivityMetric[]>([
    { date: '28 Jun', iterations: 3, dragReductionPct: 0.0, stabilitySafetyIndex: 10.0, activeTimeMin: 45 },
    { date: '29 Jun', iterations: 6, dragReductionPct: 4.2, stabilitySafetyIndex: 12.5, activeTimeMin: 90 },
    { date: '30 Jun', iterations: 9, dragReductionPct: 8.5, stabilitySafetyIndex: 14.2, activeTimeMin: 120 },
    { date: '01 Jul', iterations: 12, dragReductionPct: 11.2, stabilitySafetyIndex: 15.6, activeTimeMin: 145 }
  ]);

  // Real-time calculations computed on parameter changes
  const hydrostatics = useMemo(() => calculateHydrostatics(parameters), [parameters]);
  const resistance = useMemo(() => calculateResistance(parameters, hydrostatics), [parameters, hydrostatics]);

  const handleParameterChange = (newVals: Partial<HullParameters>) => {
    if (userRole === 'Viewer') return;
    setParameters(prev => {
      const next = { ...prev, ...newVals };
      return next;
    });

    // Record dynamic iteration metric increment (throttle simulation)
    if (Math.random() > 0.8) {
      setMetrics(prev => {
        const last = prev[prev.length - 1];
        return [
          ...prev.slice(0, -1),
          { ...last, iterations: last.iterations + 1, dragReductionPct: last.dragReductionPct + 0.2 }
        ];
      });
    }
  };

  const handleReset = () => {
    if (userRole === 'Viewer') return;
    setParameters(PRESET_VESSELS[activePresetIdx].params);
    setWasRecovered(false);
  };

  const handleLoadVessel = (idx: number) => {
    setActivePresetIdx(idx);
    setParameters(PRESET_VESSELS[idx].params);
    setWasRecovered(false);
  };

  // Restores vessel parameters from prior commit in the version history tree
  const handleRestoreCommit = (params: HullParameters) => {
    if (userRole === 'Viewer') return;
    setParameters(params);
  };

  // Add commit
  const handleAddCommit = (title: string, desc: string) => {
    const commitId = Math.random().toString(16).substring(2, 9);
    const newCommit: VersionCommit = {
      id: commitId,
      title,
      description: desc,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      author: 'You (' + userRole + ')',
      parameters: { ...parameters }
    };
    setCommits(prev => [newCommit, ...prev]);
  };

  const handleScriptExecute = (newParams: HullParameters, logs: ScriptLog[]) => {
    setParameters(newParams);
    handleAddCommit('Script Execution', 'Automatically compiled via python automation script.');
  };

  // Real-file exporting triggers
  const handleExportDXF = () => {
    const dxf = exportToDXF(parameters);
    triggerDownload(dxf, `${PRESET_VESSELS[activePresetIdx].fileName.split('.')[0]}_lines.dxf`, 'text/plain');
  };

  const handleExportOBJ = () => {
    const obj = exportToOBJ(parameters);
    triggerDownload(obj, `${PRESET_VESSELS[activePresetIdx].fileName.split('.')[0]}_mesh.obj`, 'text/plain');
  };

  const handleExportCSV = () => {
    const csv = exportOffsetTable(parameters);
    triggerDownload(csv, `${PRESET_VESSELS[activePresetIdx].fileName.split('.')[0]}_offsets.csv`, 'text/csv');
  };

  const triggerDownload = (content: string, fileName: string, contentType: string) => {
    const a = document.createElement('a');
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans" id="app_root">
      {/* Top Application Header */}
      <header className="h-12 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900 shrink-0">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-cyan-500 rounded-sm flex items-center justify-center font-bold text-slate-950 text-xs shadow-[0_0_8px_rgba(59,130,246,0.3)]">NA</div>
            <span className="font-bold text-sm tracking-tight text-white flex items-center space-x-2">
              <span>NAVAL ARCHITECT PRO</span>
              <span className="text-cyan-400 font-mono text-[10px] bg-slate-850 px-1.5 py-0.5 rounded border border-slate-800">v4.2.0</span>
            </span>
          </div>
          <div className="hidden lg:flex space-x-4 text-[10px] font-bold uppercase tracking-wider">
            <button
              onClick={() => setWorkbenchMode('modeling')}
              className={`pb-3 mt-1 px-1 border-b-2 transition-all cursor-pointer ${workbenchMode === 'modeling' ? 'text-white border-cyan-500 font-bold' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
              id="tab_modeling"
            >
              Modeling & Parametrics
            </button>
            <button
              onClick={() => setWorkbenchMode('structure')}
              className={`pb-3 mt-1 px-1 border-b-2 transition-all cursor-pointer ${workbenchMode === 'structure' ? 'text-white border-cyan-500 font-bold' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
              id="tab_structure"
            >
              Structure Tree
            </button>
            <button
              onClick={() => setWorkbenchMode('solvers')}
              className={`pb-3 mt-1 px-1 border-b-2 transition-all cursor-pointer ${workbenchMode === 'solvers' ? 'text-white border-cyan-500 font-bold' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
              id="tab_solvers"
            >
              Numerical Solvers
            </button>
          </div>

          {/* Real-Time Layout Space Maximizer (Visual Deck Toggles) */}
          {workbenchMode === 'modeling' && (
            <div className="hidden lg:flex items-center space-x-1 bg-slate-950 p-1 rounded-md border border-slate-800 ml-4 shadow-inner" id="layout_space_maximizer">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider font-mono px-1.5">Workspace:</span>
              <button
                onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
                className={`px-2 py-0.5 text-[9px] font-bold font-mono rounded transition cursor-pointer ${isLeftSidebarOpen ? 'bg-cyan-500/15 text-cyan-400 font-semibold' : 'text-slate-500 hover:text-slate-300'}`}
                title="Toggle Left Blueprints Sidebar"
              >
                Blueprints
              </button>
              <button
                onClick={() => setIsBottomPanelOpen(!isBottomPanelOpen)}
                className={`px-2 py-0.5 text-[9px] font-bold font-mono rounded transition cursor-pointer ${isBottomPanelOpen ? 'bg-cyan-500/15 text-cyan-400 font-semibold' : 'text-slate-500 hover:text-slate-300'}`}
                title="Toggle Bottom Analytics Deck"
              >
                Analytics
              </button>
              <button
                onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
                className={`px-2 py-0.5 text-[9px] font-bold font-mono rounded transition cursor-pointer ${isRightSidebarOpen ? 'bg-cyan-500/15 text-cyan-400 font-semibold' : 'text-slate-500 hover:text-slate-300'}`}
                title="Toggle Right Parametric Parameters Sidebar"
              >
                Parameters
              </button>
            </div>
          )}
        </div>

        {/* CAD Exports & Actions bar */}
        <div className="flex items-center space-x-4" id="cad_actions_bar">
          {/* Local CAD Sandbox state indicator */}
          <div className="flex items-center space-x-2 px-3 py-1 bg-cyan-950/20 border border-cyan-900/40 rounded-full">
            <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
            <span className="text-[9px] text-cyan-400 font-mono uppercase tracking-wider font-semibold">Local CAD Engine</span>
          </div>

          {/* Local Storage Auto-saved status indicator */}
          {lastSavedTime && (
            <div className="flex items-center space-x-2 px-3 py-1 bg-cyan-950/25 border border-cyan-800/40 rounded-full" title="Automatically saved to local storage">
              <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full"></div>
              <span className="text-[9px] text-cyan-400 font-mono uppercase tracking-wider font-semibold">
                Saved {lastSavedTime}
              </span>
            </div>
          )}

          {/* Active Preset indicator */}
          <span className="text-xs text-slate-400 font-mono hidden md:inline bg-slate-950 px-3 py-1.5 rounded border border-slate-800">
            Active: <strong className="text-slate-100">{PRESET_VESSELS[activePresetIdx].fileName}</strong>
          </span>

          <div className="flex items-center space-x-1.5 bg-slate-950 p-1 rounded-md border border-slate-800">
            <button
              onClick={handleExportDXF}
              className="px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:text-slate-100 rounded transition flex items-center space-x-1"
              id="btn_export_dxf"
              title="Export Lines Plan to DXF CAD Format"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>DXF</span>
            </button>
            <button
              onClick={handleExportOBJ}
              className="px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:text-slate-100 rounded transition flex items-center space-x-1"
              id="btn_export_obj"
              title="Export 3D Hull Mesh to OBJ Format"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>OBJ</span>
            </button>
            <button
              onClick={handleExportCSV}
              className="px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:text-slate-100 rounded transition flex items-center space-x-1"
              id="btn_export_csv"
              title="Export Station Offsets Table to CSV"
            >
              <FileText className="w-3.5 h-3.5 text-cyan-400" />
              <span>CSV Offsets</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workbench Shell */}
      <div className="flex-1 flex overflow-hidden">
        {workbenchMode === 'structure' ? (
          <StructureTreePanel parameters={parameters} onParameterChange={handleParameterChange} />
        ) : workbenchMode === 'solvers' ? (
          <NumericalSolversPanel parameters={parameters} onParameterChange={handleParameterChange} />
        ) : (
          <>
            {/* Left Sidebar: CAD Models List */}
            {isLeftSidebarOpen && (
              <aside className="w-64 bg-slate-900/60 border-r border-slate-800 flex flex-col justify-between shrink-0 hidden lg:flex" id="left_preset_sidebar">
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Hull Blueprints</span>
                    </h2>
                    <span className="text-[10px] font-mono text-slate-500">ROOT/.</span>
                  </div>

                  <div className="space-y-1.5" id="presets_list">
                    {PRESET_VESSELS.map((vessel, i) => (
                      <button
                        key={vessel.fileName}
                        onClick={() => handleLoadVessel(i)}
                        className={`w-full text-left p-3 rounded-lg border transition flex items-start space-x-2.5 ${activePresetIdx === i ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 'bg-slate-950/40 border-slate-850 hover:bg-slate-900 text-slate-300'}`}
                      >
                        <Ship className="w-4 h-4 shrink-0 mt-0.5 text-cyan-400" />
                        <div className="overflow-hidden">
                          <span className="font-semibold text-xs block truncate">{vessel.name}</span>
                          <span className="text-[9px] font-mono text-slate-500 block">{vessel.fileName}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quick Stats card */}
                <div className="p-4 bg-slate-950/50 border-t border-slate-850/50 space-y-3 font-mono text-[11px]">
                  <span className="text-slate-400 uppercase tracking-wider block text-[10px] font-bold">Project Status</span>
                  <div className="space-y-1.5 text-slate-300">
                    <div className="flex justify-between">
                      <span>Total Displacement:</span>
                      <span className="text-emerald-400 font-bold">{hydrostatics.displacementMass.toFixed(0)} t</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Resistance Class:</span>
                      <span className="text-cyan-400">{resistance.designPowerKw < 5000 ? 'Low Drag' : 'Standard'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Active Model:</span>
                      <span className="text-slate-100">{PRESET_VESSELS[activePresetIdx].fileName}</span>
                    </div>
                  </div>
                </div>
              </aside>
            )}

            {/* Center Workspace (Viewports on Top, Tabs on Bottom) */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
              {wasRecovered && (
                <div className="bg-cyan-950/60 border-b border-cyan-800/50 px-4 py-2 flex items-center justify-between text-xs text-cyan-200" id="recovery_banner">
                  <div className="flex items-center space-x-2.5">
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400"></span>
                    </span>
                    <span>
                      <strong>Design Recovered:</strong> We restored your unsaved hull parameters from your last session.
                    </span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => {
                        handleReset();
                        setWasRecovered(false);
                        try {
                          localStorage.removeItem('naval_architect_params');
                          localStorage.removeItem('naval_architect_preset_idx');
                        } catch {}
                      }}
                      className="px-2.5 py-1 bg-slate-900 hover:bg-slate-850 border border-slate-700 rounded font-bold text-slate-200 transition-all text-[10px] uppercase tracking-wider"
                    >
                      Discard & Reset
                    </button>
                    <button
                      onClick={() => setWasRecovered(false)}
                      className="text-cyan-400 hover:text-cyan-200 font-bold text-[10px] uppercase tracking-wider px-1"
                    >
                      Keep Design
                    </button>
                  </div>
                </div>
              )}
              {/* Top Panel: Split Viewports CAD Grid */}
              <div className="flex-1 p-4 overflow-hidden relative">
                <ViewportsContainer
                  parameters={parameters}
                  onParameterChange={handleParameterChange}
                  collaborators={[]}
                  hydrostatics={hydrostatics}
                />
              </div>

              {/* Bottom Panel: Interactive Analytics & Tool Tabs */}
              <div className={`${isBottomPanelOpen ? 'h-2/5 min-h-[300px]' : 'h-11 shrink-0'} bg-slate-900 border-t border-slate-800 flex flex-col overflow-hidden shrink-0 transition-all duration-200`} id="bottom_deck_panel">
                {/* Bottom Nav bar */}
                <div className="flex items-center justify-between px-6 bg-slate-850 border-b border-slate-800 shrink-0 overflow-x-auto h-11">
                  <div className="flex space-x-1 py-1" id="analysis_deck_tabs">
                    {[
                      { id: 'hydrostatics', label: 'Hydrostatics & Stability' },
                      { id: 'resistance', label: 'Drag & Power Analysis' },
                      { id: 'scripting', label: 'Python Scripting IDE' },
                      { id: 'analytics', label: 'Productivity KPI' },
                      { id: 'api', label: 'API & Webhooks' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveTab(tab.id as any);
                          setIsBottomPanelOpen(true);
                        }}
                        className={`px-4 py-2 text-xs font-semibold rounded-t transition border-b-2 ${activeTab === tab.id && isBottomPanelOpen ? 'text-cyan-400 border-cyan-400 bg-slate-900' : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-900/50'}`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Warnings regarding read-only state and expand/collapse control */}
                  <div className="flex items-center space-x-3">
                    {userRole === 'Viewer' && (
                      <div className="flex items-center space-x-1 text-[10px] text-amber-400 font-mono bg-amber-500/10 px-2 py-1 rounded border border-amber-500/15">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>VIEWER MODE (Read-Only)</span>
                      </div>
                    )}

                    {/* Minimize / Expand Button */}
                    <button
                      onClick={() => setIsBottomPanelOpen(!isBottomPanelOpen)}
                      className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition flex items-center space-x-1"
                      title={isBottomPanelOpen ? "Collapse Analytics Deck" : "Expand Analytics Deck"}
                    >
                      {isBottomPanelOpen ? (
                        <>
                          <ChevronDown className="w-4 h-4 text-cyan-400" />
                          <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">Collapse</span>
                        </>
                      ) : (
                        <>
                          <ChevronUp className="w-4 h-4 text-cyan-400 animate-pulse" />
                          <span className="text-[10px] font-mono text-cyan-400 hidden sm:inline">Expand Deck</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Bottom Panel Content Drawer */}
                {isBottomPanelOpen && (
                  <div className="flex-1 overflow-hidden p-1">
                    {activeTab === 'hydrostatics' && (
                      <HydrostaticsPanel
                        hydrostatics={hydrostatics}
                        parameters={parameters}
                        onParameterChange={handleParameterChange}
                      />
                    )}
                    {activeTab === 'resistance' && <ResistancePanel analysis={resistance} parameters={parameters} />}
                    {activeTab === 'scripting' && <ScriptingPanel parameters={parameters} onScriptExecute={handleScriptExecute} />}
                    {activeTab === 'analytics' && <AnalyticsPanel metrics={metrics} stabilityScore={hydrostatics.gmt * 10} dragReductionScore={15 - resistance.designResistanceKn / 100} />}
                    {activeTab === 'api' && <ApiPanel parameters={parameters} hydrostatics={hydrostatics} />}
                  </div>
                )}
              </div>
            </div>

            {/* Right Sidebar: Persistent Sliders (Standard CAD layout) */}
            {isRightSidebarOpen && (
              <aside className="w-80 bg-slate-900/60 border-l border-slate-800 shrink-0 hidden xl:block animate-fade-in" id="right_parametric_sidebar">
                <ParamsPanel
                  parameters={parameters}
                  onParameterChange={handleParameterChange}
                  onReset={handleReset}
                  activeRole={userRole}
                />
              </aside>
            )}
          </>
        )}
      </div>
    </div>
  );
}
