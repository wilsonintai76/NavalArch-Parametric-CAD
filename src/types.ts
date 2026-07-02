/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BulkheadConfig {
  id: string;
  type: 'longitudinal' | 'transverse';
  position: number; // distance from stern for transverse, or offset from centerline for longitudinal
  thickness: number; // in mm, e.g. 12
  stress?: number; // peak stress in MPa
}

export interface HullParameters {
  length: number;          // Length Waterline (m)
  beam: number;            // Max Beam (m)
  draft: number;           // Design Draft (m)
  depth: number;           // Depth to deck (m)
  deadrise: number;        // Deadrise angle (degrees)
  bilgeRadius: number;     // Bilge radius (m)
  sheerBow: number;        // Sheer height at bow (m)
  sheerStern: number;      // Sheer height at stern (m)
  bowRake: number;         // Bow rake angle (degrees)
  transomBeamRatio: number;// Transom width ratio (0 to 1)
  fullness: number;        // Waterplane fullness parameter (0.5 to 2.0)
  flare: number;           // Side wall flare (degrees)
  // Advanced NURBS and Custom Mesh Modeling
  nurbsBulb?: number;      // Bulbous bow volume/intensity (0 to 10)
  nurbsChine?: number;     // Hard chine transition factor (0 to 1)
  nurbsDeformX?: number;   // Local longitudinal morphing factor (-1 to 1)
  nurbsDeformY?: number;   // Local transverse flare deformation (-1 to 1)
  nurbsDeformZ?: number;   // Keel curvature profile bend (-1 to 1)
  // Live Visualization Modes & Cutting Slices
  visMode?: 'shaded' | 'wireframe' | 'slicing' | 'flow';
  slicePlane?: 'X' | 'Y' | 'Z';
  slicePosition?: number;  // 0 to 100% of dimension
  // CFD Simulation parameters
  cfdDetail?: 'low' | 'medium' | 'high';
  cfdSpeedKnots?: number;
  // Symmetry Check calibration properties
  symmetryDeviation?: number; // Simulated max deviation (mm)
  symmetryTolerance?: number; // Selected manufacturing tolerance threshold (mm)
  // Dynamic Bulkheads configurable via StructureTreePanel and rendered in 3D Viewport
  bulkheads?: BulkheadConfig[];
  // Custom gravity center overrides
  cogLcg?: number;         // Custom Longitudinal Center of Gravity (m from stern)
  cogVcg?: number;         // Custom Vertical Center of Gravity (m above keel)
  // Structural Framing properties
  frameSpacing?: number;      // Transverse frame spacing (m)
  frameAngle?: number;        // Transverse frame orientation/angle (degrees)
  frameProfile?: string;      // Transverse frame profile name
  frameThickness?: number;    // Transverse frame web thickness (mm)
  showFrameOverlay?: boolean; // Show frame stations visual overlay
  frameOverlayColor?: string; // Color of the visual overlay
  // Selected state for bulkheads (Clash Detection)
  selectedBulkheadId?: string;
  isMovingBulkhead?: boolean;
}

export interface Hydrostatics {
  displacementVolume: number; // m^3
  displacementMass: number;   // tonnes (saltwater, density = 1.025)
  wettedSurfaceArea: number;  // m^2
  waterplaneArea: number;     // m^2
  lcb: number;                // Longitudinal Center of Buoyancy (m from stern)
  vcb: number;                // Vertical Center of Buoyancy (m above keel)
  lcf: number;                // Longitudinal Center of Floatation (m from stern)
  kbt: number;                // KB (VCB) (m)
  bmt: number;                // Transverse Metacentric Radius (m)
  kmt: number;                // Transverse Metacentric Height (KB + BM_T) (m)
  gmt: number;                // Transverse Metacentric Height GM (KM - KG) (m, assuming KG = 0.6 * depth)
  cb: number;                 // Block Coefficient
  cp: number;                 // Prismatic Coefficient
  cm: number;                 // Midship Coefficient
  cwp: number;                // Waterplane Coefficient
  gzCurve: { angle: number; gz: number }[]; // GZ values from 0 to 90 degrees
  buoyancyDistribution: { x: number; buoyancyForce: number; pressureKPa: number }[]; // Buoyancy and pressure at stations
}

export interface ResistanceResult {
  speedKnots: number;
  froudeNumber: number;
  rf: number; // Frictional resistance (kN)
  rw: number; // Wave resistance (kN)
  rt: number; // Total resistance (kN)
  pe: number; // Effective power (kW)
}

export interface ResistanceAnalysis {
  curves: ResistanceResult[];
  designSpeedKnots: number;
  designResistanceKn: number;
  designPowerKw: number;
}

export interface ScriptLog {
  type: 'info' | 'success' | 'error' | 'input';
  text: string;
  timestamp: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: 'Admin' | 'Designer' | 'Viewer';
  status: 'active' | 'idle' | 'offline';
  cursorX?: number; // percentage 0-100
  cursorY?: number; // percentage 0-100
  activePanel?: string;
  color: string;
}

export interface VersionCommit {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  author: string;
  parameters: HullParameters;
}

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  lastTriggered?: string;
  lastResponseCode?: number;
}

export interface ProductivityMetric {
  date: string;
  iterations: number;
  dragReductionPct: number;
  stabilitySafetyIndex: number;
  activeTimeMin: number;
}
