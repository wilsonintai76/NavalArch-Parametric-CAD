/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { TeamMember, VersionCommit, HullParameters } from '../types';
import { Users, GitBranch, Shield, Send, Lock, Unlock, RefreshCw, Check, GitCompare } from 'lucide-react';

interface CollaborationPanelProps {
  parameters: HullParameters;
  onRestoreCommit: (params: HullParameters) => void;
  activeRole: 'Admin' | 'Designer' | 'Viewer';
  onRoleChange: (role: 'Admin' | 'Designer' | 'Viewer') => void;
  commits: VersionCommit[];
  onAddCommit: (title: string, description: string) => void;
}

const PARAM_METADATA: {
  key: keyof HullParameters;
  label: string;
  unit: string;
  category: string;
}[] = [
  { key: 'length', label: 'Length Waterline', unit: 'm', category: 'Main Dimensions' },
  { key: 'beam', label: 'Maximum Beam', unit: 'm', category: 'Main Dimensions' },
  { key: 'draft', label: 'Design Draft', unit: 'm', category: 'Main Dimensions' },
  { key: 'depth', label: 'Deck Depth', unit: 'm', category: 'Main Dimensions' },
  { key: 'deadrise', label: 'Deadrise Angle', unit: '°', category: 'Hull Section Shape' },
  { key: 'bilgeRadius', label: 'Bilge Radius', unit: 'm', category: 'Hull Section Shape' },
  { key: 'sheerBow', label: 'Sheer Height (Bow)', unit: 'm', category: 'Profile Sheer' },
  { key: 'sheerStern', label: 'Sheer Height (Stern)', unit: 'm', category: 'Profile Sheer' },
  { key: 'bowRake', label: 'Bow Rake Angle', unit: '°', category: 'Profile Bow/Transom' },
  { key: 'transomBeamRatio', label: 'Transom Beam Ratio', unit: '', category: 'Profile Bow/Transom' },
  { key: 'fullness', label: 'Waterplane Fullness', unit: '', category: 'Waterplane Form' },
  { key: 'flare', label: 'Hull Side Flare', unit: '°', category: 'Waterplane Form' },
  { key: 'nurbsBulb', label: 'Bulbous Bow Intensity', unit: '', category: 'Advanced Sculpting' },
  { key: 'nurbsChine', label: 'Chine Sharpness', unit: '', category: 'Advanced Sculpting' },
  { key: 'nurbsDeformX', label: 'Longitudinal Deform (X)', unit: '', category: 'Advanced Sculpting' },
  { key: 'nurbsDeformY', label: 'Transverse Flare Deform (Y)', unit: '', category: 'Advanced Sculpting' },
  { key: 'nurbsDeformZ', label: 'Keel Curvature (Z)', unit: '', category: 'Advanced Sculpting' },
];

export default function CollaborationPanel({
  parameters,
  onRestoreCommit,
  activeRole,
  onRoleChange,
  commits,
  onAddCommit
}: CollaborationPanelProps) {
  const [chatMessage, setChatMessage] = useState('');
  const [chatLogs, setChatLogs] = useState([
    {
      author: 'Sarah (Lead Architect)',
      text: 'Draft at 2.2m seems optimal, but check the GZ righting arm value at 30° heel.',
      time: '08:14 AM',
      color: '#38bdf8'
    },
    {
      author: 'David (Hydrodynamics Specialist)',
      text: 'I ran the Holtrop-Mennen solver, total resistance at 18 knots looks high. Could we increase the bow rake slightly to ease entry?',
      time: '08:18 AM',
      color: '#818cf8'
    }
  ]);

  const [activeMembers, setActiveMembers] = useState<TeamMember[]>([
    { id: '1', name: 'Sarah Jenkins', role: 'Designer', status: 'active', color: '#38bdf8' },
    { id: '2', name: 'David Mercer', role: 'Designer', status: 'active', color: '#818cf8' },
    { id: '3', name: 'Elena Rostova', role: 'Admin', status: 'idle', color: '#a855f7' }
  ]);

  // Simulated locks
  const [locks, setLocks] = useState({
    bow: { locked: true, by: 'Sarah Jenkins' },
    stern: { locked: false, by: '' }
  });

  // Version Diffing States
  const [activeSubTab, setActiveSubTab] = useState<'history' | 'diff'>('history');
  const [selectedCommitIds, setSelectedCommitIds] = useState<string[]>([]);
  const [showCommitForm, setShowCommitForm] = useState(false);
  const [commitTitle, setCommitTitle] = useState('');
  const [commitDesc, setCommitDesc] = useState('');

  const [vAId, setVAId] = useState<string>('');
  const [vBId, setVBId] = useState<string>('');

  // Auto-select commits if dropdowns empty
  React.useEffect(() => {
    if (commits.length > 0) {
      if (!vAId) setVAId(commits[0].id);
      if (!vBId) setVBId(commits[1]?.id || commits[0].id);
    }
  }, [commits]);

  // Sync selection checkboxes with dropdowns
  React.useEffect(() => {
    if (selectedCommitIds.length === 2) {
      setVAId(selectedCommitIds[0]);
      setVBId(selectedCommitIds[1]);
    } else if (selectedCommitIds.length === 1) {
      setVAId(selectedCommitIds[0]);
    }
  }, [selectedCommitIds]);

  const handleToggleSelectCommit = (id: string) => {
    setSelectedCommitIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id);
      }
      if (prev.length >= 2) {
        return [prev[1], id];
      }
      return [...prev, id];
    });
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;

    const newMsg = {
      author: `You (${activeRole})`,
      text: chatMessage,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      color: '#10b981'
    };

    setChatLogs(prev => [...prev, newMsg]);
    setChatMessage('');

    // Trigger simulated reply after 2s
    setTimeout(() => {
      const replies = [
        "Good call on that modification!",
        "I'm reviewing the hydrostatic coefficient changes now.",
        "Perfect, the stability index shows a 12% improvement.",
        "Excellent. Let's tag this as the new design release.",
        "Agreed. Let's make sure the CAD lines export looks correct."
      ];
      const randomReply = replies[Math.floor(Math.random() * replies.length)];
      setChatLogs(prev => [...prev, {
        author: 'Sarah (Lead Architect)',
        text: randomReply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        color: '#38bdf8'
      }]);
    }, 2000);
  };

  const handleToggleLock = (part: 'bow' | 'stern') => {
    if (activeRole === 'Viewer') return;
    setLocks(prev => ({
      ...prev,
      [part]: {
        locked: !prev[part].locked,
        by: !prev[part].locked ? 'You' : ''
      }
    }));
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-700 rounded-lg p-5 text-slate-200" id="collaboration_panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
        <div className="flex items-center space-x-2">
          <Users className="w-5 h-5 text-indigo-400 animate-pulse" />
          <h2 className="font-semibold text-base text-slate-100 tracking-tight">Collaboration Hub & RBAC</h2>
        </div>
        
        {/* Role Selector */}
        <div className="flex items-center space-x-2 bg-slate-950 px-2 py-1 rounded border border-slate-800">
          <Shield className="w-3.5 h-3.5 text-indigo-400" />
          <label className="text-[10px] font-mono text-slate-400">My Role:</label>
          <select
            value={activeRole}
            onChange={(e) => onRoleChange(e.target.value as any)}
            className="bg-slate-900 text-slate-200 text-[11px] font-bold font-mono outline-none focus:ring-0"
            id="rbac_role_select"
          >
            <option value="Admin">Admin (Read-Write-Manage)</option>
            <option value="Designer">Designer (Read-Write)</option>
            <option value="Viewer">Viewer (Read-Only)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 overflow-hidden flex-1">
        {/* Left Col: Live Team & Locks */}
        <div className="bg-slate-950 rounded border border-slate-800 p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-300 flex items-center justify-between">
              <span>Active Collaborators</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/10">3 Online</span>
            </h3>
            
            <div className="space-y-2.5" id="collaborators_list">
              {activeMembers.map(m => (
                <div key={m.id} className="flex items-center justify-between bg-slate-900 px-3 py-2 rounded border border-slate-850">
                  <div className="flex items-center space-x-2.5">
                    <span className="w-2.5 h-2.5 rounded-full block animate-pulse" style={{ backgroundColor: m.color }} />
                    <span className="text-xs font-semibold text-slate-200">{m.name}</span>
                  </div>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 bg-slate-800 rounded text-slate-400 uppercase">
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Real-time sync locks */}
          <div className="bg-slate-900/60 p-3 rounded border border-slate-850 space-y-3">
            <h4 className="text-[10px] uppercase font-bold font-mono tracking-wider text-slate-400 flex items-center space-x-1">
              <Lock className="w-3.5 h-3.5 text-indigo-400" />
              <span>Co-Authoring Parameter Locks</span>
            </h4>
            
            <div className="space-y-2 text-xs font-mono" id="collaboration_locks">
              <div className="flex justify-between items-center bg-slate-950 px-2.5 py-1.5 rounded border border-slate-900">
                <span className="text-slate-300">Bow Rake & Flare</span>
                <button
                  onClick={() => handleToggleLock('bow')}
                  className={`flex items-center space-x-1.5 text-[10px] px-2 py-0.5 rounded ${locks.bow.locked ? 'bg-red-500/10 text-red-400 border border-red-500/15' : 'bg-slate-800 text-slate-400'}`}
                >
                  {locks.bow.locked ? (
                    <>
                      <Lock className="w-3 h-3" />
                      <span>Locked ({locks.bow.by})</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3 h-3" />
                      <span>Lock Parameter</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex justify-between items-center bg-slate-950 px-2.5 py-1.5 rounded border border-slate-900">
                <span className="text-slate-300">Stern Transom Ratio</span>
                <button
                  onClick={() => handleToggleLock('stern')}
                  className={`flex items-center space-x-1.5 text-[10px] px-2 py-0.5 rounded ${locks.stern.locked ? 'bg-red-500/10 text-red-400 border border-red-500/15' : 'bg-slate-800 text-slate-400'}`}
                >
                  {locks.stern.locked ? (
                    <>
                      <Lock className="w-3 h-3" />
                      <span>Locked ({locks.stern.by})</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3 h-3" />
                      <span>Lock Parameter</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Center Col: Git Commit History & Diff Viewer */}
        <div className="bg-slate-950 rounded border border-slate-800 p-4 flex flex-col justify-between overflow-hidden">
          <div className="space-y-3 overflow-hidden flex flex-col h-full">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-300 flex items-center space-x-1.5">
                <GitBranch className="w-4 h-4 text-indigo-400" />
                <span>Sync & Version Tree</span>
              </h3>
              <div className="flex space-x-1 bg-slate-900 p-0.5 rounded border border-slate-800">
                <button
                  onClick={() => setActiveSubTab('history')}
                  className={`px-2.5 py-0.5 text-[9px] rounded transition-all font-semibold uppercase font-mono ${activeSubTab === 'history' ? 'bg-indigo-950 text-indigo-400 border border-indigo-900/35' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Version Tree
                </button>
                <button
                  onClick={() => setActiveSubTab('diff')}
                  className={`px-2.5 py-0.5 text-[9px] rounded transition-all font-semibold uppercase font-mono flex items-center space-x-1 ${activeSubTab === 'diff' ? 'bg-indigo-950 text-indigo-400 border border-indigo-900/35' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  <GitCompare className="w-2.5 h-2.5" />
                  <span>Parameter Diff {selectedCommitIds.length > 0 && `(${selectedCommitIds.length}/2)`}</span>
                </button>
              </div>
            </div>

            {activeSubTab === 'history' && (
              <div className="flex-1 flex flex-col justify-between overflow-hidden h-full" id="version_tree_tab">
                {/* Selection helper banner */}
                <div className="bg-slate-900/60 p-2 rounded border border-slate-850/50 flex items-center justify-between text-[10px] text-slate-400">
                  <span className="font-mono">
                    {selectedCommitIds.length === 0 && 'Select 2 commits to view a numerical diff'}
                    {selectedCommitIds.length === 1 && 'Select 1 more commit to compare'}
                    {selectedCommitIds.length === 2 && '2 commits selected for comparison'}
                  </span>
                  {selectedCommitIds.length === 2 ? (
                    <button
                      onClick={() => setActiveSubTab('diff')}
                      className="px-2 py-0.5 bg-indigo-500 hover:bg-indigo-400 text-slate-950 rounded font-bold uppercase text-[9px] font-mono transition"
                    >
                      Compare
                    </button>
                  ) : selectedCommitIds.length > 0 ? (
                    <button
                      onClick={() => setSelectedCommitIds([])}
                      className="text-[9px] font-mono text-rose-400 hover:text-rose-300 underline"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>

                {/* Commit Scrollable */}
                <div className="flex-1 overflow-y-auto pr-1 space-y-3 mt-3" id="version_commits">
                  {commits.map((commit) => {
                    const isSelected = selectedCommitIds.includes(commit.id);
                    return (
                      <div
                        key={commit.id}
                        className="relative pl-6 pb-2 border-l border-slate-800 last:border-0"
                      >
                        {/* Visual Node */}
                        <div className="absolute left-[-4.5px] top-4 w-2 h-2 rounded-full bg-indigo-500 border-2 border-slate-950 z-10 shadow" />
                        
                        <div className="flex items-start space-x-2.5 bg-slate-900 p-3 rounded border border-slate-850 hover:border-indigo-500 transition duration-150">
                          {/* Selection Checkbox */}
                          <button
                            onClick={() => handleToggleSelectCommit(commit.id)}
                            className={`mt-0.5 shrink-0 w-4.5 h-4.5 rounded border flex items-center justify-center transition-all ${
                              isSelected
                                ? 'bg-indigo-600 border-indigo-500 text-slate-100 shadow-[0_0_8px_rgba(99,102,241,0.4)]'
                                : 'border-slate-800 hover:border-slate-600 text-transparent bg-slate-950'
                            }`}
                            title="Select for comparison"
                          >
                            <Check className="w-3 h-3 stroke-[3]" />
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start mb-1">
                              <h4 className="text-xs font-bold text-slate-100 truncate">{commit.title}</h4>
                              <span className="text-[9px] font-mono text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/10 shrink-0">
                                {commit.id}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 mb-2">{commit.description}</p>
                            <div className="flex justify-between items-center">
                              <span className="text-[9px] text-slate-500 font-mono">by {commit.author} • {commit.timestamp}</span>
                              <button
                                onClick={() => onRestoreCommit(commit.parameters)}
                                className="text-[10px] font-mono font-bold text-indigo-400 hover:text-indigo-300 transition flex items-center space-x-1 shrink-0 ml-2"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Restore</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Commit current state form */}
                <div className="mt-3 pt-3 border-t border-slate-800">
                  {showCommitForm ? (
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      if (!commitTitle.trim()) return;
                      onAddCommit(commitTitle, commitDesc || 'No description provided.');
                      setCommitTitle('');
                      setCommitDesc('');
                      setShowCommitForm(false);
                    }} className="space-y-2">
                      <input
                        type="text"
                        placeholder="Commit Title (e.g., Bow Flare Mod)"
                        value={commitTitle}
                        onChange={(e) => setCommitTitle(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                        required
                      />
                      <input
                        type="text"
                        placeholder="Commit Description (optional)"
                        value={commitDesc}
                        onChange={(e) => setCommitDesc(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                      />
                      <div className="flex space-x-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setShowCommitForm(false)}
                          className="px-2.5 py-1 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-slate-200 rounded text-[10px] font-bold font-mono"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-slate-100 rounded text-[10px] font-bold font-mono"
                        >
                          Save Version
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      onClick={() => {
                        if (activeRole === 'Viewer') return;
                        setShowCommitForm(true);
                      }}
                      disabled={activeRole === 'Viewer'}
                      className="w-full py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 hover:border-indigo-500/30 rounded text-xs font-semibold font-mono transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
                    >
                      <GitBranch className="w-3.5 h-3.5" />
                      <span>Commit Current Parameters</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {activeSubTab === 'diff' && (
              <div className="flex-1 flex flex-col justify-between overflow-hidden h-full" id="version_diff_tab">
                {/* Selector Dropdowns */}
                <div className="grid grid-cols-2 gap-2 mb-3 bg-slate-900/40 p-2 rounded border border-slate-800">
                  <div>
                    <label className="text-[9px] font-mono text-slate-400 uppercase block mb-1">Base Version (A)</label>
                    <select
                      value={vAId}
                      onChange={(e) => {
                        setVAId(e.target.value);
                        setSelectedCommitIds(prev => {
                          const other = prev.find(id => id !== e.target.value) || vBId;
                          return [e.target.value, other].filter(id => id !== e.target.value || id === e.target.value);
                        });
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 font-mono outline-none"
                    >
                      {commits.map(c => (
                        <option key={c.id} value={c.id}>
                          [{c.id}] {c.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-mono text-slate-400 uppercase block mb-1">Compare Version (B)</label>
                    <select
                      value={vBId}
                      onChange={(e) => {
                        setVBId(e.target.value);
                        setSelectedCommitIds(prev => {
                          const other = prev.find(id => id !== e.target.value) || vAId;
                          return [other, e.target.value].filter(id => id !== e.target.value || id === e.target.value);
                        });
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 font-mono outline-none"
                    >
                      {commits.map(c => (
                        <option key={c.id} value={c.id}>
                          [{c.id}] {c.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Diff table scrollable */}
                <div className="flex-1 overflow-y-auto pr-1">
                  {(() => {
                    const finalCommitA = commits.find(c => c.id === vAId) || commits[0];
                    const finalCommitB = commits.find(c => c.id === vBId) || commits[1] || commits[0];

                    if (!finalCommitA || !finalCommitB) {
                      return (
                        <div className="text-center py-8 text-slate-500 font-mono text-xs">
                          Create some commits to compare differences.
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-4">
                        {/* Summary panel */}
                        <div className="bg-slate-900/60 p-2.5 rounded border border-slate-850 text-[10px] space-y-1.5 font-mono text-slate-400">
                          <div className="flex justify-between">
                            <span>A: <strong className="text-slate-200">{finalCommitA.title}</strong></span>
                            <span>{finalCommitA.timestamp}</span>
                          </div>
                          <div className="flex justify-between border-t border-slate-800/60 pt-1.5">
                            <span>B: <strong className="text-slate-200">{finalCommitB.title}</strong></span>
                            <span>{finalCommitB.timestamp}</span>
                          </div>
                        </div>

                        {/* Comparative Table */}
                        <table className="w-full text-left font-mono text-[10px] border-collapse">
                          <thead>
                            <tr className="border-b border-slate-850 text-[9px] text-slate-400 uppercase">
                              <th className="py-1 px-1.5 font-semibold">Parameter</th>
                              <th className="py-1 text-right font-semibold">A ({finalCommitA.id})</th>
                              <th className="py-1 text-right font-semibold">B ({finalCommitB.id})</th>
                              <th className="py-1 text-right font-semibold">Delta</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              let lastCategory = '';
                              return PARAM_METADATA.map((p) => {
                                const valA = (finalCommitA.parameters[p.key] ?? 0) as number;
                                const valB = (finalCommitB.parameters[p.key] ?? 0) as number;
                                const diff = valB - valA;
                                const absDiff = Math.abs(diff);
                                const hasDiff = absDiff > 0.001;

                                const showCategoryHeader = p.category !== lastCategory;
                                if (showCategoryHeader) {
                                  lastCategory = p.category;
                                }

                                return (
                                  <React.Fragment key={p.key}>
                                    {showCategoryHeader && (
                                      <tr className="bg-slate-900/40">
                                        <td colSpan={4} className="py-1 px-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-wider font-sans border-t border-slate-800/40 mt-1 first:mt-0">
                                          {p.category}
                                        </td>
                                      </tr>
                                    )}
                                    <tr className="border-b border-slate-900/40 hover:bg-slate-900/20 transition">
                                      <td className="py-1 px-1.5 text-slate-300 font-sans text-[11px]">{p.label}</td>
                                      <td className="py-1 text-right text-slate-200">{valA.toFixed(2)}{p.unit}</td>
                                      <td className="py-1 text-right text-slate-200">{valB.toFixed(2)}{p.unit}</td>
                                      <td className={`py-1 pr-1.5 text-right font-bold ${!hasDiff ? 'text-slate-500' : diff > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {hasDiff ? `${diff > 0 ? '+' : ''}${diff.toFixed(2)}${p.unit}` : '—'}
                                      </td>
                                    </tr>
                                  </React.Fragment>
                                );
                              });
                            })()}
                          </tbody>
                        </table>

                        {/* Interactive Restore buttons */}
                        <div className="pt-2 border-t border-slate-850 flex space-x-2">
                          <button
                            onClick={() => onRestoreCommit(finalCommitA.parameters)}
                            className="flex-1 py-1.5 px-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 rounded text-[10px] font-bold font-mono transition flex items-center justify-center space-x-1"
                          >
                            <RefreshCw className="w-3 h-3 text-slate-400" />
                            <span>Restore A</span>
                          </button>
                          <button
                            onClick={() => onRestoreCommit(finalCommitB.parameters)}
                            className="flex-1 py-1.5 px-2 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/25 text-indigo-400 rounded text-[10px] font-bold font-mono transition flex items-center justify-center space-x-1"
                          >
                            <RefreshCw className="w-3 h-3 text-indigo-400" />
                            <span>Restore B</span>
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Team Chat room */}
        <div className="bg-slate-950 rounded border border-slate-800 p-4 flex flex-col justify-between h-full">
          <div className="space-y-3 flex-1 flex flex-col overflow-hidden">
            <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-300">
              Team Co-Design Chat
            </h3>

            {/* Chat Box Scrollable */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-3 p-3 bg-slate-900 rounded border border-slate-850" id="team_chat_logs">
              {chatLogs.map((log, i) => (
                <div key={i} className="text-xs space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-bold font-mono" style={{ color: log.color }}>
                      {log.author}
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">{log.time}</span>
                  </div>
                  <p className="text-slate-300 bg-slate-950/40 px-2 py-1.5 rounded leading-relaxed border border-slate-850">
                    {log.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSendChat} className="mt-3 flex items-center space-x-2">
            <input
              type="text"
              placeholder={activeRole === 'Viewer' ? 'Viewer mode is read-only...' : 'Discuss design modifications...'}
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              disabled={activeRole === 'Viewer'}
              className="flex-1 bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
              id="input_chat_msg"
            />
            <button
              type="submit"
              disabled={activeRole === 'Viewer'}
              className="bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold p-1.5 rounded transition disabled:opacity-50"
            >
              <Send className="w-4 h-4 fill-slate-950" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
