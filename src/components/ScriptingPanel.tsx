/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { HullParameters, ScriptLog } from '../types';
import { SCRIPT_EXAMPLES, executePythonScript } from '../utils/pythonInterpreter';
import { Terminal, Play, RotateCcw, FileCode, CheckCircle, AlertTriangle } from 'lucide-react';

interface ScriptingPanelProps {
  parameters: HullParameters;
  onScriptExecute: (newParams: HullParameters, logs: ScriptLog[]) => void;
}

export default function ScriptingPanel({ parameters, onScriptExecute }: ScriptingPanelProps) {
  const [selectedExample, setSelectedExample] = useState<number>(0);
  const [code, setCode] = useState<string>(SCRIPT_EXAMPLES[0].code);
  const [terminalLogs, setTerminalLogs] = useState<ScriptLog[]>([
    {
      type: 'info',
      text: 'NavalArch Python Automation Engine [v1.2.5]',
      timestamp: new Date().toLocaleTimeString()
    },
    {
      type: 'info',
      text: 'Type python script or load an automation example to begin.',
      timestamp: new Date().toLocaleTimeString()
    }
  ]);

  const handleLoadExample = (idx: number) => {
    setSelectedExample(idx);
    setCode(SCRIPT_EXAMPLES[idx].code);
  };

  const handleRunScript = () => {
    // Append input trigger log
    const inputLog: ScriptLog = {
      type: 'input',
      text: '>>> python script.py',
      timestamp: new Date().toLocaleTimeString()
    };

    setTerminalLogs(prev => [...prev, inputLog]);

    // Execute script
    const result = executePythonScript(code, parameters);
    
    // Add outputs
    setTerminalLogs(prev => [...prev, ...result.logs]);

    if (result.updatedParameters) {
      onScriptExecute(result.updatedParameters, result.logs);
    }
  };

  const handleClearTerminal = () => {
    setTerminalLogs([
      {
        type: 'info',
        text: 'Terminal cleared.',
        timestamp: new Date().toLocaleTimeString()
      }
    ]);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-700 rounded-lg p-5 text-slate-200" id="scripting_panel">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
        <div className="flex items-center space-x-2">
          <Terminal className="w-5 h-5 text-teal-400 animate-pulse" />
          <h2 className="font-semibold text-base text-slate-100 tracking-tight">Python Scripting API (Automation)</h2>
        </div>
        <div className="flex items-center space-x-2">
          <label className="text-[10px] text-slate-400 font-mono">Template:</label>
          <select
            value={selectedExample}
            onChange={(e) => handleLoadExample(parseInt(e.target.value))}
            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 font-mono focus:outline-none focus:ring-1 focus:ring-teal-500"
            id="dropdown_script_templates"
          >
            {SCRIPT_EXAMPLES.map((ex, i) => (
              <option key={i} value={i}>
                {ex.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 flex-1 overflow-hidden">
        {/* Editor Block */}
        <div className="flex flex-col bg-slate-950 rounded border border-slate-800 overflow-hidden" id="python_editor">
          <div className="flex items-center justify-between bg-slate-900/80 px-4 py-2 border-b border-slate-800 text-xs font-mono text-slate-400">
            <span className="flex items-center space-x-1.5">
              <FileCode className="w-4 h-4 text-teal-500" />
              <span>script.py</span>
            </span>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCode(SCRIPT_EXAMPLES[selectedExample].code)}
                className="hover:text-slate-200 flex items-center space-x-1 transition text-[10px]"
                title="Reset code"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
              <button
                onClick={handleRunScript}
                className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold px-3 py-1 rounded flex items-center space-x-1 transition text-[10px] shadow"
                id="btn_run_script"
              >
                <Play className="w-3.5 h-3.5 fill-slate-950" />
                <span>Run Script</span>
              </button>
            </div>
          </div>

          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="flex-1 w-full p-4 bg-slate-950 text-slate-100 font-mono text-xs leading-relaxed focus:outline-none focus:ring-0 resize-none overflow-y-auto"
            spellCheck="false"
            id="textarea_python_code"
          />
        </div>

        {/* Console logs */}
        <div className="flex flex-col bg-slate-950 rounded border border-slate-800 overflow-hidden" id="python_console">
          <div className="flex items-center justify-between bg-slate-900/80 px-4 py-2 border-b border-slate-800 text-xs font-mono text-slate-400">
            <span className="flex items-center space-x-1.5">
              <Terminal className="w-4 h-4 text-emerald-500" />
              <span>Console Output</span>
            </span>
            <button
              onClick={handleClearTerminal}
              className="hover:text-slate-200 text-[10px] transition"
              id="btn_clear_console"
            >
              Clear Console
            </button>
          </div>

          {/* Logs scrollable container */}
          <div className="flex-1 p-4 overflow-y-auto space-y-1.5 font-mono text-xs leading-relaxed text-slate-300">
            {terminalLogs.map((log, i) => {
              let color = 'text-slate-300';
              if (log.type === 'success') color = 'text-emerald-400 font-semibold';
              if (log.type === 'error') color = 'text-rose-400 font-semibold bg-rose-500/5 p-1 rounded border border-rose-500/10 block whitespace-pre-wrap';
              if (log.type === 'input') color = 'text-teal-400 font-bold';

              return (
                <div key={i} className={`flex items-start ${log.type === 'error' ? 'flex-col' : 'space-x-1'}`}>
                  {log.type !== 'error' && (
                    <span className="text-[10px] text-slate-600 select-none shrink-0">
                      [{log.timestamp}]
                    </span>
                  )}
                  <span className={color}>{log.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* Help bar */}
      <div className="mt-3 bg-slate-950 p-2 rounded border border-slate-850 flex items-center justify-between text-xs text-slate-400 font-mono">
        <span className="flex items-center space-x-1 text-emerald-400 text-[11px]">
          <CheckCircle className="w-3.5 h-3.5" />
          <span>Automation bindings complete: Length, Beam, Draft, Bilge, and Sheer attributes writable.</span>
        </span>
        <span className="text-[10px] text-slate-500">API Documentation loaded</span>
      </div>
    </div>
  );
}
