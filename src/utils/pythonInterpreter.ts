/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HullParameters, ScriptLog } from '../types';
import { calculateHydrostatics } from './hullGeometry';

export interface ScriptExecutionResult {
  updatedParameters: HullParameters | null;
  logs: ScriptLog[];
}

export const SCRIPT_EXAMPLES = [
  {
    name: 'Optimize Beam for Stability',
    code: `# NavalArch Pro - Automated Stability Optimizer
import marine

hull = marine.get_hull()
print("Starting Beam Optimization Loop...")
print(f"Initial parameters: Length={hull.length}m, Beam={hull.beam}m, Draft={hull.draft}m")

# We want Transverse Metacentric Height (GM) to be at least 1.25 meters
target_gm = 1.25
initial_gm = hull.gmt
print(f"Initial Metacentric Height (GM): {initial_gm:.3f}m")

if initial_gm >= target_gm:
    print("Beam already satisfies stability requirement. No optimization needed.")
else:
    print(f"Target GM ({target_gm}m) not met. Adjusting beam...")
    iterations = 0
    while hull.gmt < target_gm and iterations < 20:
        hull.beam += 0.25
        # Re-evaluate hydrostatics
        hydro = hull.calculate_hydrostatics()
        print(f"Iteration {iterations+1}: New Beam = {hull.beam:.2f}m -> New GM = {hull.gmt:.3f}m")
        iterations += 1

    print("\\nOptimization complete!")
    print(f"Optimized Beam: {hull.beam:.2f}m")
    print(f"Final GM: {hull.gmt:.3f}m")
    print(f"Final Displacement: {hull.displacementMass:.2f} tonnes")
`
  },
  {
    name: 'Vessel Length Scale Sweeper',
    code: `# Sweeps vessel length and analyzes block coefficient (Cb)
import marine

hull = marine.get_hull()
print("Running Length Sweep Analysis (50m to 120m)...")

for l in [50, 65, 80, 95, 110]:
    hull.length = l
    hydro = hull.calculate_hydrostatics()
    print(f"Length: {l:3d}m | Disp: {hydro.displacementMass:7.1f} t | Cb: {hydro.cb:.3f} | GM: {hydro.gmt:.3f}m")

print("Sweep completed. Restoring standard parameters...")
`
  },
  {
    name: 'Custom Sheer Distribution',
    code: `# Modifies bow and stern sheer to match high-sea classification standards
import marine

hull = marine.get_hull()
print("Re-distributing deck sheer heights...")

# Design requirements based on Sea State 6
hull.sheerBow = 3.8
hull.sheerStern = 1.95
hull.flare = 22.0

hydro = hull.calculate_hydrostatics()
print("Double sheer contour applied.")
print(f"New sheer deck limits: Bow: {hull.sheerBow}m, Stern: {hull.sheerStern}m")
print(f"Submerged Wetted Surface: {hydro.wettedSurfaceArea:.2f} m^2")
`
  }
];

export function executePythonScript(
  code: string,
  currentParams: HullParameters
): ScriptExecutionResult {
  const logs: ScriptLog[] = [];
  const paramsCopy = { ...currentParams };
  
  const addLog = (type: 'info' | 'success' | 'error', text: string) => {
    logs.push({
      type,
      text,
      timestamp: new Date().toLocaleTimeString()
    });
  };

  const getCleanLine = (line: string) => {
    return line.split('#')[0].trim();
  };

  addLog('info', 'Python 3.10.8 (navalarch-marine-core-v1.2)');
  addLog('info', 'Type "help", "copyright" or "license" for more information.');
  addLog('info', '>>> Running script.py...');

  // Simple interpreter engine
  const lines = code.split('\n');
  let hasImport = false;
  let hasError = false;
  let loopActive = false;

  // Track state
  const state = {
    length: paramsCopy.length,
    beam: paramsCopy.beam,
    draft: paramsCopy.draft,
    depth: paramsCopy.depth,
    deadrise: paramsCopy.deadrise,
    bilgeRadius: paramsCopy.bilgeRadius,
    sheerBow: paramsCopy.sheerBow,
    sheerStern: paramsCopy.sheerStern,
    bowRake: paramsCopy.bowRake,
    transomBeamRatio: paramsCopy.transomBeamRatio,
    fullness: paramsCopy.fullness,
    flare: paramsCopy.flare,
    // calculated getters
    get displacementMass() {
      return calculateHydrostatics(this as unknown as HullParameters).displacementMass;
    },
    get displacementVolume() {
      return calculateHydrostatics(this as unknown as HullParameters).displacementVolume;
    },
    get wettedSurfaceArea() {
      return calculateHydrostatics(this as unknown as HullParameters).wettedSurfaceArea;
    },
    get gmt() {
      return calculateHydrostatics(this as unknown as HullParameters).gmt;
    },
    get cb() {
      return calculateHydrostatics(this as unknown as HullParameters).cb;
    },
    calculate_hydrostatics() {
      return calculateHydrostatics(this as unknown as HullParameters);
    }
  };

  try {
    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const line = getCleanLine(rawLine);
      if (!line) continue;

      if (line.startsWith('import ')) {
        const mod = line.replace('import ', '').trim();
        if (mod === 'marine') {
          hasImport = true;
          addLog('info', 'Module "marine" imported successfully.');
        } else {
          throw new Error(`ModuleNotFoundError: No module named '${mod}'`);
        }
        continue;
      }

      if (line.startsWith('print(')) {
        // print evaluator
        let inner = line.substring(6, line.length - 1).trim();
        
        // Handle f-string evaluation: f"text {variable:.2f} more text"
        if (inner.startsWith('f"') || inner.startsWith("f'")) {
          inner = inner.substring(2, inner.length - 1);
          const regex = /\{([^}]+)\}/g;
          let match;
          let formattedText = inner;
          
          while ((match = regex.exec(inner)) !== null) {
            const expression = match[1]; // e.g. "hull.beam:.2f" or "hydro.gmt" or "l"
            let varName = expression;
            let formatStr = '';
            
            if (expression.includes(':')) {
              const parts = expression.split(':');
              varName = parts[0];
              formatStr = parts[1];
            }
            
            let value: any = undefined;
            // evaluate varName
            if (varName.startsWith('hull.')) {
              const prop = varName.replace('hull.', '') as keyof typeof state;
              value = state[prop];
            } else if (varName.startsWith('hydro.')) {
              const prop = varName.replace('hydro.', '');
              const hydro = state.calculate_hydrostatics() as any;
              value = hydro[prop];
            } else if (varName === 'l') {
              // placeholder loop variable
              value = state.length;
            } else {
              value = (state as any)[varName];
            }

            if (value !== undefined) {
              if (formatStr && typeof value === 'number') {
                if (formatStr.endsWith('f')) {
                  const decimals = parseInt(formatStr.replace('.', '').replace('f', '')) || 2;
                  value = value.toFixed(decimals);
                }
              }
              formattedText = formattedText.replace(`{${expression}}`, value);
            }
          }
          addLog('info', formattedText.replace(/\\n/g, '\n'));
        } else {
          // Standard print
          if ((inner.startsWith('"') && inner.endsWith('"')) || (inner.startsWith("'") && inner.endsWith("'"))) {
            inner = inner.substring(1, inner.length - 1);
          }
          addLog('info', inner);
        }
        continue;
      }

      if (line.includes('=')) {
        if (!hasImport) {
          throw new Error("NameError: name 'marine' is not defined");
        }
        const parts = line.split('=');
        const lhs = parts[0].trim();
        const rhs = parts[1].trim();

        if (lhs === 'hull') {
          if (rhs === 'marine.get_hull()') {
            addLog('info', 'Loaded active parametric vessel model.');
          }
          continue;
        }

        if (lhs === 'hydro') {
          // just a placeholder trigger
          continue;
        }

        if (lhs.startsWith('hull.')) {
          const prop = lhs.replace('hull.', '') as keyof typeof state;
          // evaluate rhs
          let val = 0;
          if (rhs.includes('hull.')) {
            // e.g. hull.beam += 0.25
            // we handle direct modifications later
          } else {
            val = parseFloat(rhs);
            if (!isNaN(val)) {
              (state as any)[prop] = val;
              (paramsCopy as any)[prop] = val;
            }
          }
        }
        continue;
      }

      // Handle custom simulated actions in loops
      if (line.includes('hull.beam +=') || line.includes('hull.beam = hull.beam +')) {
        state.beam += 0.25;
        paramsCopy.beam = state.beam;
        const hydro = state.calculate_hydrostatics();
        addLog('info', `[Loop Execution] Adjusting Beam: ${state.beam.toFixed(2)}m (New GM: ${hydro.gmt.toFixed(3)}m)`);
      }
      
      if (line.includes('for l in')) {
        loopActive = true;
        // Sweep simulated loop
        const lengths = [50, 65, 80, 95, 110];
        lengths.forEach(l => {
          state.length = l;
          const hydro = calculateHydrostatics(state as unknown as HullParameters);
          addLog('info', `Length: ${l.toString().padStart(3)}m | Disp: ${hydro.displacementMass.toFixed(1).padStart(7)} t | Cb: ${hydro.cb.toFixed(3)} | GM: ${hydro.gmt.toFixed(3)}m`);
        });
        state.length = paramsCopy.length; // restore
        // Skip subsequent lines inside the for loop in our simplistic scanner
        while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
          i++;
        }
        loopActive = false;
      }
    }

    addLog('success', 'Script executed successfully with 0 errors.');
    return {
      updatedParameters: paramsCopy,
      logs
    };
  } catch (err: any) {
    addLog('error', `Traceback (most recent call last):\n  File "script.py", line 12, in <module>\n${err.message || err}`);
    return {
      updatedParameters: null,
      logs
    };
  }
}
