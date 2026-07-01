/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { WebhookConfig, HullParameters, Hydrostatics } from '../types';
import { Network, Plus, Trash2, Globe, Key, AlertCircle, Play } from 'lucide-react';

interface ApiPanelProps {
  parameters: HullParameters;
  hydrostatics: Hydrostatics;
}

export default function ApiPanel({ parameters, hydrostatics }: ApiPanelProps) {
  const [tokens, setTokens] = useState<string[]>([
    'nv_pro_live_e58bc12a97cf11e5',
    'nv_pro_sandbox_7a0df47b85e01'
  ]);
  const [newTokenName, setNewTokenName] = useState('');
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([
    {
      id: '1',
      name: 'Hydrodynamics Class Solver',
      url: 'https://api.veritas-marine.com/v1/hydro-receiver',
      secret: 'whsec_908f7b76d78a9',
      events: ['hull.updated', 'hydrostatics.compiled'],
      active: true,
      lastTriggered: '08:12 AM',
      lastResponseCode: 200
    }
  ]);

  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookName, setWebhookName] = useState('');
  const [simulatedResponse, setSimulatedResponse] = useState<any | null>(null);

  const handleGenerateToken = (e: React.FormEvent) => {
    e.preventDefault();
    const hex = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    setTokens(prev => [...prev, `nv_pro_live_${hex}`]);
    setNewTokenName('');
  };

  const handleDeleteToken = (idx: number) => {
    setTokens(prev => prev.filter((_, i) => i !== idx));
  };

  const handleAddWebhook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookUrl || !webhookName) return;

    const newWb: WebhookConfig = {
      id: Math.random().toString(),
      name: webhookName,
      url: webhookUrl,
      secret: `whsec_${Math.floor(Math.random() * 1000000).toString(16)}`,
      events: ['hull.updated'],
      active: true
    };

    setWebhooks(prev => [...prev, newWb]);
    setWebhookUrl('');
    setWebhookName('');
  };

  const handleTriggerWebhook = (wb: WebhookConfig) => {
    // Generate realistic payload
    const payload = {
      event: 'hull.updated',
      timestamp: new Date().toISOString(),
      webhook_id: wb.id,
      webhook_secret_signature: wb.secret,
      data: {
        dimensions: {
          length_wl_m: parameters.length,
          beam_max_m: parameters.beam,
          draft_design_m: parameters.draft,
          depth_deck_m: parameters.depth
        },
        geometry_coefficients: {
          deadrise_deg: parameters.deadrise,
          bilge_radius_m: parameters.bilgeRadius,
          flare_deg: parameters.flare,
          bow_rake_deg: parameters.bowRake
        },
        calculated_hydrostatics: {
          displacement_m3: hydrostatics.displacementVolume,
          displacement_tonnes: hydrostatics.displacementMass,
          waterplane_area_m2: hydrostatics.waterplaneArea,
          wetted_surface_area_m2: hydrostatics.wettedSurfaceArea,
          lcb_from_stern_m: hydrostatics.lcb,
          vcb_above_keel_m: hydrostatics.vcb,
          metacentric_height_gmt_m: hydrostatics.gmt,
          block_coefficient_cb: hydrostatics.cb,
          prismatic_coefficient_cp: hydrostatics.cp
        }
      }
    };

    setSimulatedResponse(payload);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-700 rounded-lg p-5 text-slate-200" id="api_panel">
      {/* Title */}
      <div className="flex items-center space-x-2 border-b border-slate-700 pb-3 mb-4 shrink-0">
        <Network className="w-5 h-5 text-purple-400 animate-pulse" />
        <h2 className="font-semibold text-base text-slate-100 tracking-tight">Extensions & Webhook Integration Manager</h2>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 overflow-y-auto pr-1 flex-1">
        {/* Left: Token generator & lists */}
        <div className="space-y-4">
          <div className="bg-slate-950 p-4 rounded border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-200 flex items-center space-x-1.5">
              <Key className="w-4 h-4 text-purple-400" />
              <span>Third-party API Extension Tokens</span>
            </h3>
            <p className="text-[10px] text-slate-400 font-sans">
              Authenticate Windows, Linux, or custom Python automation daemons with this workstation instance.
            </p>

            <form onSubmit={handleGenerateToken} className="flex space-x-2 pt-1">
              <input
                type="text"
                placeholder="Extension Name (e.g. Linux_CFD_Broker)"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500 font-sans"
                id="input_token_name"
              />
              <button
                type="submit"
                className="bg-purple-600 hover:bg-purple-500 text-slate-100 font-bold px-3 py-1.5 text-xs rounded transition flex items-center space-x-1"
                id="btn_create_token"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create</span>
              </button>
            </form>

            <div className="space-y-2 pt-1" id="tokens_list">
              {tokens.map((tok, i) => (
                <div key={i} className="flex justify-between items-center bg-slate-900 px-3 py-2 rounded border border-slate-850 text-xs font-mono">
                  <span className="text-slate-300 select-all">{tok}</span>
                  <button
                    onClick={() => handleDeleteToken(i)}
                    className="text-rose-400 hover:text-rose-300 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Webhook Register */}
          <div className="bg-slate-950 p-4 rounded border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-200 flex items-center space-x-1.5">
              <Globe className="w-4 h-4 text-cyan-400" />
              <span>Real-time Sync Webhooks</span>
            </h3>
            
            <form onSubmit={handleAddWebhook} className="space-y-2.5 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Webhook Name"
                  value={webhookName}
                  onChange={(e) => setWebhookName(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  id="input_webhook_name"
                />
                <input
                  type="text"
                  placeholder="Endpoint URL (https://...)"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  id="input_webhook_url"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 font-bold py-1.5 text-xs rounded transition"
                id="btn_add_webhook"
              >
                Add Real-time Webhook Receiver
              </button>
            </form>
          </div>
        </div>

        {/* Right: Webhooks triggers & simulated JSON responses */}
        <div className="flex flex-col space-y-3">
          <div className="bg-slate-950 p-4 rounded border border-slate-800 flex-1 flex flex-col overflow-hidden">
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-200 mb-3 flex items-center justify-between">
              <span>Active Webhook Triggers</span>
              <span className="text-[10px] text-slate-500">JSON Endpoint Testing</span>
            </h3>

            <div className="space-y-2.5 flex-1 overflow-y-auto pr-1" id="active_webhooks">
              {webhooks.map(wb => (
                <div key={wb.id} className="bg-slate-900 p-3 rounded border border-slate-850 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-200">{wb.name}</span>
                    <button
                      onClick={() => handleTriggerWebhook(wb)}
                      className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 text-[10px] font-mono px-2 py-1 rounded flex items-center space-x-1 transition"
                      id={`btn_test_webhook_${wb.id}`}
                    >
                      <Play className="w-3 h-3 fill-purple-400" />
                      <span>Test Trigger</span>
                    </button>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 break-all">{wb.url}</div>
                  <div className="flex justify-between items-center text-[9px] text-slate-500 font-mono">
                    <span>Secret: {wb.secret}</span>
                    {wb.lastResponseCode && (
                      <span className="text-emerald-400 font-bold bg-emerald-500/5 px-1 rounded border border-emerald-500/10">
                        HTTP {wb.lastResponseCode} ({wb.lastTriggered})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Test response renderer */}
            {simulatedResponse && (
              <div className="mt-4 bg-slate-900 rounded p-3 border border-slate-800 flex flex-col h-[180px] overflow-hidden" id="webhook_payload_display">
                <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono mb-1.5 shrink-0">
                  <span>POST Webhook Payload sent:</span>
                  <button
                    onClick={() => setSimulatedResponse(null)}
                    className="hover:text-slate-200 text-[9px] transition"
                  >
                    Clear Payload
                  </button>
                </div>
                <pre className="flex-1 overflow-y-auto font-mono text-[10px] text-emerald-400 leading-relaxed bg-slate-950 p-2.5 rounded border border-slate-850">
                  {JSON.stringify(simulatedResponse, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
