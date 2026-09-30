/**
 * ChairsideProtocolApp.tsx — Clinical Workbench
 * ---------------------------------------------------------------------------
 * Interactive chairside clinical protocol reference and decision-support
 * workbench. Stack: React 18 + TypeScript + Tailwind CSS (v3.3+) + lucide-react.
 *
 * Tailwind setup
 *   - Dark mode is class-based so the in-app theme switch works:
 *       v3: tailwind.config.js → `darkMode: 'class'`
 *       v4: `@custom-variant dark (&:where(.dark, .dark *));`
 *   - Uses only default Tailwind colors (stone, amber, orange, emerald, teal,
 *     yellow, pink, rose, sky) plus a few arbitrary values (e.g. #FDFBF7).
 *
 * File layout
 *   1. Schema ............... Procedure types
 *   2. Procedure data ....... All datasets + manual-schema adapter (unchanged)
 *   3. Utilities & hooks .... Search, timers, clipboard, audio, storage, theme
 *   4. Clinical engines ..... Pure functions: tooth map, anesthesia, LA dosing,
 *                             AAE endo diagnosis, vitals triage, prophylaxis,
 *                             cementation protocols, denture zones & PIP
 *   5. Design system ........ Warm tokens, primitives, accessible flyout
 *   6. SVG diagrams ......... Static schematics + interactive border-molding maps
 *   7. Workbench tools ...... Odontogram, LA calculator, cementation matrix,
 *                             endo wizard, medical risk, denture tools
 *   8. Procedure workspace .. Procedure view, operatory mode, pearls/notes
 *   9. App shell ............ Floating header, library, SOAP flyout, dock
 *
 * Content conventions
 *   - Supervisory sign-offs are expressed as universal "Clinical Checkpoints".
 *   - Protocols reflect current evidence-based practice.
 *   - Decision tools are chairside aids, not substitutes for clinical judgment,
 *     the patient's physicians, or current manufacturer IFUs and guidelines.
 * ---------------------------------------------------------------------------
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  Baby,
  Bell,
  BellOff,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardCopy,
  Clock,
  Crown,
  FileText,
  Gem,
  HeartPulse,
  Info,
  Keyboard,
  Layers,
  LayoutGrid,
  ListChecks,
  Maximize2,
  Menu,
  Minus,
  Monitor,
  Moon,
  Package,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Ruler,
  ScanLine,
  Scissors,
  Search,
  ShieldCheck,
  Smile,
  Snowflake,
  Star,
  Stethoscope,
  StickyNote,
  Sun,
  Syringe,
  Timer,
  Trash2,
  Wrench,
  X,
  Zap,
} from 'lucide-react';


/* ========================================================================== */
/* 1. SCHEMA                                                                  */
/* ========================================================================== */

export type CategoryId =
  | 'exams'
  | 'perio'
  | 'restorative'
  | 'fixed'
  | 'removable'
  | 'implants'
  | 'pediatrics'
  | 'surgery';

export interface CdtCode {
  code: string;
  descriptor: string;
}

export interface TrayItem {
  id: string;
  label: string;
  detail?: string;
}

export interface TrayGroup {
  id: string;
  title: string;
  kind: 'cassette' | 'burs' | 'consumables';
  items: TrayItem[];
}

export type TimerTone = 'etch' | 'prime' | 'cure' | 'set';

export interface TimerPreset {
  id: string;
  label: string;
  seconds: number;
  tone: TimerTone;
  material?: string;
  note?: string;
}

export interface ProtocolStep {
  id: string;
  title: string;
  /** One-line summary; the collapsed card falls back to the first detail line. */
  summary?: string;
  details: string[];
  /** Renders as an amber-bordered "Caution" callout. */
  warning?: string;
  /** Practical chairside tip. */
  tip?: string;
  /** Renders as an amber "Clinical Checkpoint" callout. */
  checkpoint?: string;
  /** Evidence-based modernization note. */
  ebdNote?: string;
  /** Timer presets that can be launched from this step. */
  timerIds?: string[];
}

export interface PrepSpecRow {
  parameter: string;
  minimum: string;
  ideal: string;
  instrument: string;
  verification: string;
}

/** Generic specification table (first column renders as the row header). */
export interface SpecTable {
  title: string;
  note?: string;
  columns: string[];
  rows: string[][];
}

export type WidgetKey = 'pedsDose';

export type DiagramKey =
  | 'classII-section'
  | 'sectional-matrix'
  | 'crown-section'
  | 'two-cord'
  | 'max-border'
  | 'mand-border';

export type SoapFieldType = 'text' | 'number' | 'select' | 'surfaces' | 'textarea';

export interface SoapField {
  key: string;
  label: string;
  type: SoapFieldType;
  options?: string[];
  placeholder?: string;
  defaultValue?: string;
  step?: number;
}

export interface Procedure {
  id: string;
  title: string;
  shortTitle: string;
  category: CategoryId;
  cdtCodes: CdtCode[];
  /** Minutes; `label` (e.g. "2 visits · ~45 min each") is shown when present. */
  chairTime: { min: number; max: number; label?: string };
  summary: string;
  keyBurs: string[];
  keyMaterials: string[];
  tray: TrayGroup[];
  timers: TimerPreset[];
  steps: ProtocolStep[];
  specTables: SpecTable[];
  diagrams: DiagramKey[];
  soap: { fields: SoapField[]; template: string };
  /** Optional lab work authorization; uses the same {{field}} tokens as the SOAP template. */
  labRx?: string;
  /** Patient-facing post-operative instructions. */
  postOp?: string[];
  /** Extra search keywords. */
  tags?: string[];
  widgets?: WidgetKey[];
  evidence: string[];
}

/* ========================================================================== */
/* 2. PROCEDURES DATA                                                         */
/* ========================================================================== */

const LA_AGENTS = [
  '2% lidocaine 1:100,000 epi',
  '4% articaine 1:100,000 epi',
  '4% articaine 1:200,000 epi',
  '3% mepivacaine plain',
  '0.5% bupivacaine 1:200,000 epi',
];

const INJECTIONS = [
  'IANB + long buccal',
  'Buccal infiltration',
  'Buccal + palatal infiltration',
  'PSA + palatal',
  'MSA / ASA',
  'PDL (supplemental)',
  'Intraosseous (supplemental)',
];

const ISOLATION = [
  'Rubber dam (clamp, inverted)',
  'Isolite / Isodry',
  'OptraGate + cotton rolls',
  'Cotton rolls + dry angles',
];

function baseSoapFields(defaults: { surfaces?: string; isolation?: string } = {}): SoapField[] {
  return [
    { key: 'tooth', label: 'Tooth #', type: 'text', placeholder: 'e.g. 30' },
    { key: 'surfaces', label: 'Surfaces', type: 'surfaces', defaultValue: defaults.surfaces ?? '' },
    { key: 'anesthetic', label: 'Local anesthetic', type: 'select', options: LA_AGENTS, defaultValue: LA_AGENTS[0] },
    { key: 'carpules', label: 'Carpules (1.7 mL)', type: 'number', step: 0.5, defaultValue: '1' },
    { key: 'injection', label: 'Injection technique', type: 'select', options: INJECTIONS, defaultValue: INJECTIONS[0] },
    { key: 'isolation', label: 'Isolation', type: 'select', options: ISOLATION, defaultValue: defaults.isolation ?? ISOLATION[0] },
  ];
}

function prepTable(t: { title: string; note?: string; rows: PrepSpecRow[] }): SpecTable {
  return {
    title: t.title,
    note: t.note,
    columns: ['Parameter', 'Minimum', 'Ideal', 'Instrument', 'Verification'],
    rows: t.rows.map((r) => [r.parameter, r.minimum, r.ideal, r.instrument, r.verification]),
  };
}

const classIIComposite: Procedure = {
  id: 'class-ii-composite',
  title: 'Class II Posterior Composite Restoration',
  shortTitle: 'Class II Composite',
  category: 'restorative',
  cdtCodes: [
    { code: 'D2392', descriptor: 'Resin-based composite, two surfaces, posterior' },
    { code: 'D2393', descriptor: 'Resin-based composite, three surfaces, posterior' },
    { code: 'D2394', descriptor: 'Resin-based composite, four or more surfaces, posterior' },
  ],
  chairTime: { min: 45, max: 75 },
  summary:
    'Direct posterior composite for proximal caries: sectional matrix (Garrison Composi-Tight 3D Fusion), selective enamel etch with a universal adhesive, Gluma dentin desensitization and centripetal incremental layering.',
  keyBurs: [
    '#330 carbide (FG)',
    '#245 carbide (FG)',
    '#2 round carbide (RA)',
    '#4 round carbide (RA)',
    '#7406 12-fluted finishing carbide',
    '#7901 12-fluted finishing carbide',
    '8862-012 fine flame diamond',
  ],
  keyMaterials: [
    '35–37% phosphoric acid gel',
    'Gluma Desensitizer (Kulzer)',
    'Scotchbond Universal Plus (3M)',
    'Clearfil Universal Bond Quick (Kuraray)',
    'Filtek Supreme Ultra (3M)',
    'Filtek One Bulk Fill (3M)',
    'Biodentine (Septodont)',
    'Vitrebond Plus (3M)',
    'Garrison Composi-Tight 3D Fusion',
    'Sof-Lex discs & strips (3M)',
  ],
  tray: [
    {
      id: 'cassette',
      title: 'Sterilization Cassette',
      kind: 'cassette',
      items: [
        { id: 'c-basic', label: 'Mirror, explorer, UNC-15 probe, cotton pliers' },
        { id: 'c-rd', label: 'Rubber dam frame, punch, clamp forceps' },
        { id: 'c-clamps', label: 'Clamps', detail: 'W8A / #2A (molar), #2 (premolar)' },
        { id: 'c-spoon', label: 'Spoon excavator (double-ended)' },
        { id: 'c-hatchet', label: 'Enamel hatchet 10-7-14' },
        { id: 'c-gmt', label: 'Gingival margin trimmers', detail: 'mesial / distal pair' },
        { id: 'c-comp', label: 'Composite placement instrument (non-stick)' },
        { id: 'c-ball', label: 'Ball burnisher' },
        { id: 'c-ringf', label: 'Garrison ring placement forceps' },
        { id: 'c-art', label: 'Miller articulating forceps' },
      ],
    },
    {
      id: 'burs',
      title: 'Bur Block',
      kind: 'burs',
      items: [
        { id: 'b-330', label: '#330 carbide (FG)', detail: 'outline / access — head ≈1.5 mm' },
        { id: 'b-245', label: '#245 carbide (FG)', detail: 'box walls — head 3.0 mm, Ø 0.8 mm' },
        { id: 'b-2', label: '#2 round carbide (RA)', detail: 'caries, near pulp' },
        { id: 'b-4', label: '#4 round carbide (RA)', detail: 'caries, peripheral' },
        { id: 'b-7406', label: '#7406 12-fluted carbide', detail: 'occlusal anatomy' },
        { id: 'b-7901', label: '#7901 12-fluted carbide', detail: 'grooves / margins' },
        { id: 'b-8862', label: '8862-012 fine flame diamond', detail: 'embrasures / margins' },
        { id: 'b-pol', label: 'Polishers', detail: 'Enhance / PoGo or equivalent' },
      ],
    },
    {
      id: 'consumables',
      title: 'Chairside Consumables',
      kind: 'consumables',
      items: [
        { id: 'k-dam', label: 'Rubber dam sheet (medium) + floss ligature' },
        { id: 'k-fusion', label: 'Composi-Tight 3D Fusion rings', detail: 'narrow / wide / tall' },
        { id: 'k-bands', label: 'Sectional bands', detail: '4.5 / 5.5 / 6.5 mm' },
        { id: 'k-wedges', label: 'Fusion wedges (assorted) + wedge guard' },
        { id: 'k-etch', label: '35–37% phosphoric acid gel' },
        { id: 'k-gluma', label: 'Gluma Desensitizer' },
        { id: 'k-bond', label: 'Universal adhesive + microbrushes' },
        { id: 'k-flow', label: 'Flowable composite (matched shade)' },
        { id: 'k-comp', label: 'Nanohybrid composite', detail: 'body/dentin + enamel shades' },
        { id: 'k-liner', label: 'Standby: Biodentine / Vitrebond Plus' },
        { id: 'k-sof', label: 'Sof-Lex discs + finishing strips' },
        { id: 'k-art', label: 'Articulating paper (≤40 µm) + floss' },
        { id: 'k-light', label: 'LED curing light (radiometer-verified)' },
      ],
    },
  ],
  timers: [
    { id: 'etch', label: 'Selective enamel etch', seconds: 15, tone: 'etch', material: '35–37% H₃PO₄', note: 'Enamel margins only' },
    { id: 'gluma', label: 'Gluma dwell', seconds: 45, tone: 'prime', material: 'Gluma Desensitizer', note: '30–60 s on dentin' },
    { id: 'scrub', label: 'Adhesive scrub', seconds: 20, tone: 'prime', material: 'Universal adhesive', note: 'Active agitation' },
    { id: 'thin', label: 'Air-thin adhesive', seconds: 5, tone: 'prime', note: 'Until film no longer moves' },
    { id: 'cure', label: 'Light cure (increment)', seconds: 20, tone: 'cure', note: '≥1,000 mW/cm², tip ≤1 mm' },
    { id: 'postcure', label: 'Post-cure B & L', seconds: 20, tone: 'cure', note: 'After matrix removal' },
  ],
  steps: [
    {
      id: 's1',
      title: 'Pre-operative assessment & shade',
      summary: 'Confirm diagnosis, pulpal status and consent; select shade before dehydration.',
      details: [
        'Review medical history and vitals; confirm caries risk category and lesion depth on current bitewings.',
        'Record baseline pulp testing (cold) and percussion for deep lesions.',
        'Select shade on hydrated, cleaned teeth under neutral light before anesthesia and isolation.',
        'Mark pre-operative centric stops with articulating paper so margins avoid heavy contacts.',
      ],
      checkpoint: 'Diagnosis, radiographs, pulpal status and informed consent verified; shade recorded before isolation.',
    },
    {
      id: 's2',
      title: 'Local anesthesia',
      summary: 'Profound anesthesia appropriate to arch and tooth.',
      details: [
        'Mandibular molars: IANB + long buccal; supplement with 4% articaine buccal infiltration as needed.',
        'Maxillary / mandibular premolars: buccal infiltration (articaine), palatal as indicated.',
        'Aspirate, inject slowly, and calculate maximum recommended dose by weight.',
      ],
    },
    {
      id: 's3',
      title: 'Pre-wedge & rubber dam isolation',
      summary: 'Isolate one tooth distal and two to three teeth mesial; pre-wedge the proximal site.',
      details: [
        'Punch, clamp (W8A / #2A molar, #2 premolar), ligate the clamp with floss, and invert the dam into the sulci.',
        'Place a wedge (or wedge guard) in the affected embrasure to pre-separate and protect the adjacent tooth and dam.',
      ],
      checkpoint: 'Isolation verified: dam inverted, no leakage, adjacent tooth protected before cutting.',
    },
    {
      id: 's4',
      title: 'Outline form & proximal box',
      summary: '#330 / #245 high-speed with water; conservative, caries-dictated outline.',
      details: [
        'Enter at the pit adjacent to the involved marginal ridge; pulpal depth 1.5–2.0 mm (≈0.2–0.5 mm into dentin).',
        'Extend along the central groove only as caries dictates; keep isthmus as narrow as possible.',
        'Drop the proximal box, leaving a thin enamel shell against the adjacent tooth; fracture it with an enamel hatchet.',
        'Achieve ≈0.5 mm clearance buccal, lingual and gingival from the adjacent contact.',
      ],
    },
    {
      id: 's5',
      title: 'Selective carious tissue removal',
      summary: 'Hard dentin at the periphery; firm/leathery dentin allowed over the pulp.',
      details: [
        'Clear the DEJ and peripheral walls to hard dentin with #4 round carbide (RA) and spoon excavator.',
        'Near the pulp, stop at firm (leathery) dentin with #2 round carbide at low speed to avoid exposure.',
        'Caries-detector dye is optional; tactile hardness is the primary endpoint.',
      ],
      ebdNote:
        'Selective removal to firm dentin in deep lesions of vital, asymptomatic teeth reduces pulp exposure risk (ICCC consensus).',
      checkpoint:
        'Periphery caries-free (enamel/DEJ); pulpal status re-evaluated. Exposure in a vital tooth → direct pulp cap with a hydraulic calcium silicate (Biodentine / MTA).',
    },
    {
      id: 's6',
      title: 'Refine walls & margins',
      summary: 'Hand-instrument margins; rounded internal line angles.',
      details: [
        'Plane the gingival floor flat with gingival margin trimmers; remove loose enamel rods.',
        'Keep 90° cavosurface margins (butt joint); no occlusal bevel on posterior composite.',
        'Round axiopulpal and internal line angles to reduce stress concentration.',
        'If the gingival margin is deeply subgingival, consider deep margin elevation with the same matrix system.',
      ],
    },
    {
      id: 's7',
      title: 'Pulp protection (only if indicated)',
      summary: 'Liner only where remaining dentin thickness is critically thin.',
      details: [
        'RDT > 0.5 mm: no liner; the adhesive seals dentin.',
        'RDT < 0.5 mm: spot-place Biodentine (hydraulic calcium silicate) or Vitrebond Plus (RMGI).',
        'Keep liners small and confined to the deepest area to preserve bondable dentin.',
      ],
      ebdNote: 'Calcium hydroxide liners (e.g., Dycal) are no longer recommended routinely under bonded composites.',
    },
    {
      id: 's8',
      title: 'Sectional matrix assembly',
      summary: 'Garrison Composi-Tight 3D Fusion band, wedge and ring.',
      details: [
        'Select band height (4.5 / 5.5 / 6.5 mm) so it extends apical to the gingival floor.',
        'Insert a Fusion wedge from the wider embrasure (usually lingual) to seal the gingival margin.',
        'Seat the Fusion ring over the wedge with tines in the B/L embrasures.',
        'Burnish the band against the adjacent contact with a ball burnisher.',
      ],
      checkpoint: 'Gingival seal confirmed with explorer (no step/gap); band contour and contact proximity verified.',
    },
    {
      id: 's9',
      title: 'Selective enamel etch',
      summary: 'Phosphoric acid on enamel margins only, 15 s.',
      details: [
        'Apply 35–37% phosphoric acid gel to enamel margins only; avoid dentin.',
        'Rinse thoroughly (≥10 s); remove excess water — do not desiccate dentin.',
      ],
      ebdNote: 'Selective enamel etching improves enamel bond durability with universal adhesives without over-etching dentin.',
      timerIds: ['etch'],
    },
    {
      id: 's10',
      title: 'Gluma dentin desensitization',
      summary: 'Glutaraldehyde/HEMA on dentin to reduce post-operative sensitivity.',
      details: [
        'Apply Gluma Desensitizer to dentin with a microbrush; dwell 30–60 s (45 s standard).',
        'Air-dry until the film disappears, rinse per the Kulzer IFU, then gently dry.',
      ],
      timerIds: ['gluma'],
    },
    {
      id: 's11',
      title: 'Universal adhesive',
      summary: 'Scrub 20 s, air-thin, light-cure.',
      details: [
        'Actively scrub universal adhesive (e.g., Scotchbond Universal Plus / Clearfil Universal Bond Quick) for 20 s.',
        'Air-thin ≈5 s with gentle, oil-free air until the film no longer moves.',
        'Light-cure 20 s (or per IFU) with the tip as close as possible.',
      ],
      checkpoint: 'Curing light output verified with radiometer (≥1,000 mW/cm²); bonded surface glossy and uniform.',
      timerIds: ['scrub', 'thin', 'cure'],
    },
    {
      id: 's12',
      title: 'Proximal wall (centripetal build-up)',
      summary: 'Convert the Class II to a Class I.',
      details: [
        'Optional 0.5–1.0 mm flowable layer on the gingival floor (snow-plow technique, cured with the next increment).',
        'Build the proximal wall against the band in enamel shade to the height of the marginal ridge; cure 20 s.',
      ],
      timerIds: ['cure'],
    },
    {
      id: 's13',
      title: 'Incremental layering',
      summary: '≤2 mm oblique increments; dentin then enamel shade.',
      details: [
        'Place oblique increments ≤2 mm (or per bulk-fill IFU, e.g., Filtek One Bulk Fill up to 5 mm).',
        'Sculpt cusp by cusp to minimize C-factor; final enamel layer ≈0.5–1.0 mm.',
        'Cure each increment 20 s.',
      ],
      timerIds: ['cure'],
    },
    {
      id: 's14',
      title: 'Matrix removal & post-cure',
      summary: 'Remove ring, wedge, band; cure proximally.',
      details: ['Remove ring, then wedge, then band.', 'Additional 20 s light cure from buccal and lingual.'],
      timerIds: ['postcure'],
    },
    {
      id: 's15',
      title: 'Finish, polish & occlusion',
      summary: '12-fluted carbides, discs, strips, polishers.',
      details: [
        'Remove flash and refine anatomy with #7406 and #7901 12-fluted carbides; embrasures with 8862-012.',
        'Contour proximal margins with Sof-Lex discs and finishing strips.',
        'Remove the dam; check MIP and excursions with articulating paper and adjust.',
        'Polish with Enhance / PoGo (or equivalent).',
      ],
      checkpoint:
        'Contact verified with floss (firm snap, no shredding); no overhang with explorer; occlusion in MIP and excursions confirmed.',
    },
    {
      id: 's16',
      title: 'Post-operative instructions & note',
      summary: 'Sensitivity expectations, when to call, document.',
      details: [
        'Explain transient thermal/biting sensitivity; advise calling if it lingers or worsens.',
        'Complete the procedure note (SOAP drawer).',
      ],
    },
  ],
  specTables: [prepTable({
    title: 'Class II composite — preparation tolerances',
    note: 'Adhesive preparations are caries-dictated; values are guides, not targets for extension.',
    rows: [
      {
        parameter: 'Pulpal (occlusal) depth',
        minimum: '1.5 mm',
        ideal: '1.5–2.0 mm (0.2–0.5 mm into dentin)',
        instrument: '#330 / #245 carbide',
        verification: '#245 head = 3.0 mm; #330 head ≈1.5 mm as gauge',
      },
      {
        parameter: 'Isthmus width',
        minimum: 'Caries-dictated',
        ideal: '≤ ¼–⅓ intercuspal distance',
        instrument: '#330 carbide',
        verification: 'Visual; preserve marginal ridges and cusps',
      },
      {
        parameter: 'Axial wall',
        minimum: '0.2 mm into dentin',
        ideal: '≈0.5 mm pulpal to DEJ, convex',
        instrument: '#245 carbide',
        verification: 'Parallels external proximal contour',
      },
      {
        parameter: 'Proximal clearance (B / L / G)',
        minimum: 'Contact broken',
        ideal: '≈0.5 mm from adjacent tooth',
        instrument: 'Enamel hatchet 10-7-14',
        verification: 'Explorer passes freely',
      },
      {
        parameter: 'Gingival floor',
        minimum: 'Flat, sound margin',
        ideal: '≈1.0 mm M-D, in enamel where possible',
        instrument: 'Gingival margin trimmers',
        verification: 'Explorer: smooth, no loose rods',
      },
      {
        parameter: 'Cavosurface margin',
        minimum: '90° butt joint',
        ideal: '90°, no occlusal bevel',
        instrument: '#245 carbide / hand instruments',
        verification: 'Visual under magnification',
      },
      {
        parameter: 'Internal line angles',
        minimum: 'No sharp angles',
        ideal: 'Rounded',
        instrument: '#330 / #245 geometry',
        verification: 'Visual',
      },
      {
        parameter: 'Remaining dentin thickness',
        minimum: '0.5 mm (else liner)',
        ideal: '> 1.0 mm',
        instrument: '—',
        verification: 'Radiograph + clinical judgment',
      },
    ],
  })],
  diagrams: ['classII-section', 'sectional-matrix'],
  soap: {
    fields: [
      ...baseSoapFields({ surfaces: 'MO' }),
      {
        key: 'pulpStatus',
        label: 'Pre-op pulpal status',
        type: 'select',
        options: ['normal pulp (cold responsive, non-lingering)', 'reversible pulpitis', 'deep lesion, asymptomatic'],
        defaultValue: 'normal pulp (cold responsive, non-lingering)',
      },
      {
        key: 'cariesRemoval',
        label: 'Caries removal',
        type: 'select',
        options: ['nonselective to hard dentin', 'selective to firm dentin over pulp'],
        defaultValue: 'nonselective to hard dentin',
      },
      {
        key: 'liner',
        label: 'Liner / pulp protection',
        type: 'select',
        options: ['none', 'Biodentine (hydraulic calcium silicate)', 'Vitrebond Plus (RMGI)', 'direct pulp cap — Biodentine'],
        defaultValue: 'none',
      },
      {
        key: 'adhesive',
        label: 'Universal adhesive',
        type: 'select',
        options: ['Scotchbond Universal Plus', 'Clearfil Universal Bond Quick', 'Prime&Bond Universal'],
        defaultValue: 'Scotchbond Universal Plus',
      },
      {
        key: 'composite',
        label: 'Composite',
        type: 'select',
        options: ['Filtek Supreme Ultra', 'Filtek One Bulk Fill', 'Tetric EvoCeram'],
        defaultValue: 'Filtek Supreme Ultra',
      },
      { key: 'shade', label: 'Shade', type: 'text', placeholder: 'e.g. A2B / A2E', defaultValue: 'A2' },
      { key: 'chiefComplaint', label: 'Chief complaint', type: 'text', placeholder: 'e.g. none / food trap' },
      { key: 'nextVisit', label: 'Next visit', type: 'text', placeholder: 'e.g. #31 DO composite' },
    ],
    template: `S: Patient presents for planned restoration of tooth #{{tooth}}. Medical history reviewed and updated; no contraindications to treatment identified. Chief complaint: {{chiefComplaint}}.

O: Caries #{{tooth}} {{surfaces}} confirmed clinically and radiographically. Pre-operative pulpal status: {{pulpStatus}}.

A: Carious lesion #{{tooth}} {{surfaces}}, restorable with direct resin composite.

P: Informed consent obtained after discussion of risks, benefits and alternatives, including no treatment.
- LA: {{carpules}} carpule(s) {{anesthetic}} via {{injection}}; aspiration negative, no adverse reaction.
- Isolation: {{isolation}}.
- Preparation: caries removal {{cariesRemoval}}; margins refined, internal line angles rounded.
- Pulp protection: {{liner}}.
- Matrix: sectional band, wedge and separating ring; gingival seal verified.
- Adhesion: selective enamel etch 37% H3PO4 15 s, rinsed; Gluma Desensitizer 45 s; {{adhesive}} scrubbed 20 s, air-thinned, light-cured 20 s.
- Restoration: {{composite}}, shade {{shade}}, placed incrementally; each increment light-cured 20 s; post-cure 20 s buccal and lingual.
- Finish: contacts verified with floss, no overhang detected, occlusion adjusted in MIP and excursions, polished.
- Patient tolerated procedure well. Post-operative instructions given.

NV: {{nextVisit}}`,
  },
  evidence: [
    'Schwendicke F, et al. Managing carious lesions: consensus recommendations on carious tissue removal. Adv Dent Res. 2016;28(2):58–67.',
    'Duncan HF, et al. European Society of Endodontology position statement: management of deep caries and the exposed pulp. Int Endod J. 2019;52(7):923–934.',
    'Van Meerbeek B, et al. From Buonocore’s pioneering acid-etch technique to self-adhering restoratives. J Adhes Dent. 2020;22(1):7–34.',
    'Manufacturer IFUs: Kulzer Gluma Desensitizer; 3M Scotchbond Universal Plus; Garrison Composi-Tight 3D Fusion.',
  ],
};

const emaxCrown: Procedure = {
  id: 'emax-crown-prep',
  title: 'Lithium Disilicate (IPS e.max) Crown — Preparation & Provisionalization',
  shortTitle: 'e.max Crown Prep + Provisional',
  category: 'fixed',
  cdtCodes: [
    { code: 'D2740', descriptor: 'Crown, porcelain/ceramic' },
    { code: 'D2950', descriptor: 'Core buildup, including any pins when required (if indicated)' },
  ],
  chairTime: { min: 90, max: 120 },
  summary:
    'Full-coverage monolithic lithium disilicate preparation to IPS e.max reduction specifications, optional immediate dentin sealing, two-cord retraction with PVS impression (or intraoral scan) and a bis-acryl provisional on non-eugenol cement.',
  keyBurs: [
    '856-018 round-end taper diamond',
    '856-025 round-end taper diamond',
    '8856-025 fine round-end taper diamond',
    '8862-012 fine flame diamond',
    'Carbide acrylic trimmer (HP)',
  ],
  keyMaterials: [
    'IPS e.max CAD / Press (Ivoclar)',
    'Ultrapak cord #000 & #1 (Ultradent)',
    'ViscoStat Clear (Ultradent)',
    'Aquasil Ultra+ PVS (Dentsply Sirona)',
    'Blu-Mousse bite registration (Parkell)',
    'Integrity Multi•Cure bis-acryl (Dentsply Sirona)',
    'Protemp 4 bis-acryl (3M)',
    'Sil-Tech putty (Ivoclar)',
    'Gluma Desensitizer (Kulzer)',
    'TempBond NE (Kerr)',
    'IPS Natural Die Material shade guide (Ivoclar)',
  ],
  tray: [
    {
      id: 'cassette',
      title: 'Sterilization Cassette',
      kind: 'cassette',
      items: [
        { id: 'c-basic', label: 'Mirror, explorer, UNC-15 probe, cotton pliers' },
        { id: 'c-packer', label: 'Cord packers (fine, serrated)', detail: 'Ultrapak-style' },
        { id: 'c-scissors', label: 'Crown & bridge scissors' },
        { id: 'c-art', label: 'Miller articulating forceps' },
        { id: 'c-guns', label: 'Impression dispensers (light body + heavy body / putty)' },
        { id: 'c-trays', label: 'Rigid full-arch stock trays (or triple tray)' },
        { id: 'c-plastic', label: 'Plastic filling instrument / scaler (flash removal)' },
        { id: 'c-cal', label: 'Iwanson thickness gauge' },
      ],
    },
    {
      id: 'burs',
      title: 'Bur Block',
      kind: 'burs',
      items: [
        { id: 'b-856-018', label: '856-018 diamond', detail: 'axial reduction, contact break' },
        { id: 'b-856-025', label: '856-025 diamond', detail: 'depth grooves, occlusal, rounded shoulder' },
        { id: 'b-8856', label: '8856-025 fine diamond', detail: 'margin & wall finishing' },
        { id: 'b-8862', label: '8862-012 fine flame diamond', detail: 'interproximal access' },
        { id: 'b-hp', label: 'Carbide acrylic trimmer (HP)', detail: 'provisional trimming' },
        { id: 'b-disc', label: 'Provisional finishing discs + rubber wheel' },
      ],
    },
    {
      id: 'consumables',
      title: 'Chairside Consumables',
      kind: 'consumables',
      items: [
        { id: 'k-shade', label: 'Shade guide (VITA) + IPS Natural Die Material guide' },
        { id: 'k-putty', label: 'Sil-Tech putty (pre-op matrix / reduction guide)' },
        { id: 'k-cord', label: 'Ultrapak #000 & #1 cord' },
        { id: 'k-visco', label: 'ViscoStat Clear (aluminum chloride) + dento-infusor' },
        { id: 'k-pvs', label: 'Aquasil Ultra+ light body + heavy body/putty' },
        { id: 'k-tadh', label: 'PVS tray adhesive' },
        { id: 'k-bite', label: 'Blu-Mousse bite registration' },
        { id: 'k-opp', label: 'Opposing impression material' },
        { id: 'k-bis', label: 'Bis-acryl (Integrity Multi•Cure / Protemp 4) + tips' },
        { id: 'k-ids', label: 'Universal adhesive (IDS) + petroleum jelly separator' },
        { id: 'k-gluma', label: 'Gluma Desensitizer' },
        { id: 'k-temp', label: 'TempBond NE (non-eugenol)' },
        { id: 'k-glove', label: 'Nitrile gloves only (latex inhibits PVS set)' },
        { id: 'k-art', label: 'Articulating paper + floss' },
      ],
    },
  ],
  timers: [
    { id: 'ids-cure', label: 'IDS light cure', seconds: 20, tone: 'cure', material: 'Universal adhesive' },
    { id: 'cord', label: 'Retraction cord dwell', seconds: 300, tone: 'set', material: 'ViscoStat Clear', note: '3–5 min' },
    { id: 'pvs', label: 'PVS intraoral set', seconds: 360, tone: 'set', material: 'Aquasil Ultra+', note: 'Verify vs IFU' },
    { id: 'gluma', label: 'Gluma dwell', seconds: 45, tone: 'prime', material: 'Gluma Desensitizer', note: 'Skip if IDS done' },
    { id: 'bisacryl', label: 'Bis-acryl elastic phase', seconds: 120, tone: 'set', material: 'Integrity / Protemp 4', note: 'Remove at rubbery stage' },
  ],
  steps: [
    {
      id: 's1',
      title: 'Pre-operative assessment & shade',
      summary: 'Pulp, periodontium, occlusion and shade before any cutting.',
      details: [
        'Confirm pulpal and periapical status (cold test, percussion, PA radiograph) and periodontal health.',
        'Evaluate occlusion: functional cusps, excursive contacts, parafunction.',
        'Select shade on hydrated teeth before anesthesia; photograph with shade tab in frame.',
        'Existing restorations/caries: remove and build up (D2950 if indicated) before final reduction.',
      ],
      checkpoint: 'Diagnosis, consent, radiographs and shade (with photo) verified before preparation.',
    },
    {
      id: 's2',
      title: 'Pre-op matrix & reduction guide',
      summary: 'Putty index captures the original (or corrected) contour.',
      details: [
        'Take a Sil-Tech putty index including one tooth mesial and distal (or vacuum-form on a diagnostic wax-up).',
        'Trim flash; section a second index mid-buccolingually to serve as a reduction guide.',
      ],
    },
    {
      id: 's3',
      title: 'Local anesthesia',
      summary: 'Profound pulpal and soft-tissue anesthesia for retraction.',
      details: ['Include palatal/lingual soft tissue anesthesia for comfortable cord placement.'],
    },
    {
      id: 's4',
      title: 'Depth orientation grooves',
      summary: 'Controlled depth before bulk reduction.',
      details: [
        'Occlusal: grooves on cuspal inclines — 1.5 mm non-functional, 2.0 mm functional cusps with 856-025.',
        'Axial: 856-025 sunk to ≈½ its diameter (≈1.2 mm) mid-buccal and mid-lingual.',
        'Mark groove floors with pencil to track reduction.',
      ],
    },
    {
      id: 's5',
      title: 'Occlusal reduction & functional cusp bevel',
      summary: 'Follow cuspal planes; 45° functional cusp bevel.',
      details: [
        'Reduce following the geometric inclined planes — do not flatten.',
        'Place a ≈45° functional cusp bevel (palatal maxillary / buccal mandibular).',
        'Maintain 1.0 mm absolute minimum for adhesive cementation; 1.5 mm for self-adhesive/conventional cements.',
      ],
    },
    {
      id: 's6',
      title: 'Axial reduction & margin',
      summary: '1.2–1.5 mm axial, 1.0 mm rounded shoulder / heavy chamfer.',
      details: [
        'Break contacts with 856-018 or 8862-012; protect the adjacent tooth with a metal matrix band.',
        'Axial walls 5–6° each (10–12° total occlusal convergence).',
        'Establish a continuous 1.0 mm rounded shoulder / heavy chamfer; supragingival or equigingival preferred.',
        'Axial wall height ≥4 mm (molars), ≥3 mm (premolars); add grooves/boxes if short.',
      ],
    },
    {
      id: 's7',
      title: 'Verify reduction',
      summary: 'Reduction guide, gauge and interocclusal clearance.',
      details: [
        'Seat the sectioned putty index to confirm uniform clearance.',
        'Check interocclusal clearance in MIP and excursions (e.g., 2.0 mm reduction gauge).',
        'Inspect for undercuts from occlusal (single-eye view).',
      ],
      checkpoint:
        'Reduction meets matrix values; no undercuts; TOC ≤12°; all line angles rounded; margin continuous and ≥1.0 mm wide.',
    },
    {
      id: 's8',
      title: 'Refine & smooth',
      summary: 'Fine diamond for smooth walls and a crisp margin.',
      details: [
        'Refine walls and margin with 8856-025; eliminate lips, sharp angles and knife edges.',
        'Round transitions between occlusal and axial surfaces.',
      ],
    },
    {
      id: 's9',
      title: 'Immediate dentin sealing (recommended)',
      summary: 'Seal freshly cut dentin before impression.',
      details: [
        'Selective enamel protection; apply universal adhesive to exposed dentin, scrub 20 s, air-thin, cure 20 s.',
        'Optional thin flowable layer to smooth undercuts; cure, then remove the oxygen-inhibited layer with pumice/alcohol.',
        'Refresh margins with 8856-025 so no adhesive remains on the finish line.',
      ],
      ebdNote: 'IDS improves bond strength of adhesively cemented ceramics and reduces post-operative sensitivity.',
      timerIds: ['ids-cure'],
    },
    {
      id: 's10',
      title: 'Two-cord retraction',
      summary: '#000 first (stays), #1 with ViscoStat Clear on top.',
      details: [
        'Pack #000 Ultrapak into the base of the sulcus circumferentially; trim ends to abut.',
        'Pack #1 Ultrapak saturated in ViscoStat Clear (aluminum chloride) over it.',
        'Dwell 3–5 min; avoid ferric sulfate on ceramic cases (staining, bond interference).',
      ],
      checkpoint: 'Finish line visible 360° with hemostasis before impressing or scanning.',
      timerIds: ['cord'],
    },
    {
      id: 's11',
      title: 'Final impression (PVS) or digital scan',
      summary: 'Dual-viscosity PVS; nitrile gloves only.',
      details: [
        'Paint tray adhesive and allow it to dry per IFU.',
        'Remove the #1 cord moist (spray water) while the tray is loaded; leave #000 in place.',
        'Inject Aquasil Ultra+ light body into the sulcus first, tip submerged; air-blow lightly and re-cover.',
        'Seat the loaded heavy-body tray; hold without movement for the full set time.',
        'Digital alternative: intraoral scan immediately after #1 cord removal.',
      ],
      checkpoint:
        'Impression inspected under magnification: continuous margin capture with material apical to the finish line; no voids, pulls, tears or tray show-through.',
      timerIds: ['pvs'],
    },
    {
      id: 's12',
      title: 'Opposing, bite, stump shade & lab Rx',
      summary: 'Everything the lab needs for a monolithic restoration.',
      details: [
        'Opposing impression/scan and Blu-Mousse bite registration in MIP.',
        'Record stump shade with the IPS Natural Die Material guide (critical for lithium disilicate translucency).',
        'Rx: IPS e.max CAD / Press monolithic, translucency (HT / MT / LT), shade, stump shade, contact and occlusal preferences.',
      ],
    },
    {
      id: 's13',
      title: 'Provisional fabrication (bis-acryl)',
      summary: 'Matrix technique with Integrity Multi•Cure / Protemp 4.',
      details: [
        'If IDS was placed, coat the prep with petroleum jelly (bis-acryl bonds to fresh resin).',
        'If IDS was not placed, apply Gluma 45 s to exposed dentin.',
        'Fill the putty matrix from the occlusal of the prep tooth, tip submerged; seat fully.',
        'Remove at the elastic (rubbery) phase — ≈2 min for most bis-acryls — then let it complete set extraorally.',
      ],
      timerIds: ['gluma', 'bisacryl'],
    },
    {
      id: 's14',
      title: 'Trim, contour & polish',
      summary: 'Accurate margins, open embrasures, smooth surface.',
      details: [
        'Mark margins with pencil; trim flash with a carbide acrylic trimmer (HP).',
        'Establish cleansable embrasures and proximal contacts; polish or apply a light-cured glaze.',
      ],
    },
    {
      id: 's15',
      title: 'Cement provisional & verify',
      summary: 'Non-eugenol temporary cement.',
      details: [
        'Cement with TempBond NE (eugenol can inhibit resin cement polymerization at final cementation).',
        'Remove excess after set — floss with a knot through contacts, explorer at margins.',
        'Adjust occlusion in MIP and excursions.',
      ],
      checkpoint:
        'Provisional margins sealed; no subgingival cement; contacts present; occlusion verified in MIP and excursions.',
    },
    {
      id: 's16',
      title: 'Post-operative instructions & note',
      summary: 'Provisional care and documentation.',
      details: [
        'Avoid sticky/hard foods; floss by pulling through rather than lifting.',
        'Call if the provisional loosens, fractures or sensitivity persists.',
        'Complete the procedure note (SOAP drawer).',
      ],
    },
  ],
  specTables: [prepTable({
    title: 'Monolithic lithium disilicate crown — reduction tolerances',
    note: 'Minimums assume adhesive cementation; use ideal values for self-adhesive or conventional cements.',
    rows: [
      {
        parameter: 'Occlusal reduction',
        minimum: '1.0 mm (adhesive) / 1.5 mm',
        ideal: '1.5 mm non-functional, 2.0 mm functional',
        instrument: '856-025 depth grooves',
        verification: 'Reduction guide, 2.0 mm gauge',
      },
      {
        parameter: 'Functional cusp bevel',
        minimum: '1.5 mm clearance',
        ideal: '≈45°, 1.5–2.0 mm',
        instrument: '856-025',
        verification: 'Excursive clearance check',
      },
      {
        parameter: 'Axial reduction',
        minimum: '1.0 mm',
        ideal: '1.2–1.5 mm (posterior 1.5 mm)',
        instrument: '856-018 / 856-025',
        verification: 'Sectioned putty index',
      },
      {
        parameter: 'Margin',
        minimum: '1.0 mm',
        ideal: '1.0 mm rounded shoulder / heavy chamfer',
        instrument: '856-025 → 8856-025',
        verification: 'Continuous, no lip, no bevel',
      },
      {
        parameter: 'Total occlusal convergence',
        minimum: '≤20° (max)',
        ideal: '10–12° (5–6° per wall)',
        instrument: 'Bur held at constant angle',
        verification: 'Single-eye occlusal view',
      },
      {
        parameter: 'Axial wall height',
        minimum: '3 mm premolar',
        ideal: '≥4 mm molar',
        instrument: '—',
        verification: 'Probe; add grooves/boxes if short',
      },
      {
        parameter: 'Internal line angles',
        minimum: 'No sharp angles',
        ideal: 'Rounded everywhere',
        instrument: '8856-025',
        verification: 'Visual + explorer',
      },
      {
        parameter: 'Margin location',
        minimum: '≤0.5 mm subgingival',
        ideal: 'Supra- / equigingival',
        instrument: 'Two-cord retraction',
        verification: 'Visible 360° pre-impression',
      },
      {
        parameter: 'Contraindicated features',
        minimum: '—',
        ideal: 'None: no feather/knife edge, undercut, bevel or lip',
        instrument: '—',
        verification: 'Visual under magnification',
      },
    ],
  })],
  diagrams: ['crown-section', 'two-cord'],
  soap: {
    fields: [
      ...baseSoapFields({ surfaces: 'MODBL', isolation: 'OptraGate + cotton rolls' }),
      { key: 'shade', label: 'Shade', type: 'text', placeholder: 'e.g. A2', defaultValue: 'A2' },
      { key: 'stumpShade', label: 'Stump shade (ND)', type: 'text', placeholder: 'e.g. ND3' },
      {
        key: 'restoration',
        label: 'Restoration',
        type: 'select',
        options: ['IPS e.max CAD monolithic (MT)', 'IPS e.max CAD monolithic (LT)', 'IPS e.max Press monolithic (LT)', 'IPS e.max CAD monolithic (HT)'],
        defaultValue: 'IPS e.max CAD monolithic (MT)',
      },
      {
        key: 'buildup',
        label: 'Core',
        type: 'select',
        options: ['no buildup required', 'composite core buildup (D2950)', 'existing sound restoration retained'],
        defaultValue: 'no buildup required',
      },
      {
        key: 'sealing',
        label: 'Dentin sealing',
        type: 'select',
        options: ['immediate dentin sealing with universal adhesive', 'Gluma Desensitizer 45 s'],
        defaultValue: 'immediate dentin sealing with universal adhesive',
      },
      {
        key: 'impression',
        label: 'Impression',
        type: 'select',
        options: ['PVS dual-viscosity, full-arch (Aquasil Ultra+)', 'PVS dual-viscosity, triple tray', 'intraoral digital scan'],
        defaultValue: 'PVS dual-viscosity, full-arch (Aquasil Ultra+)',
      },
      {
        key: 'provisional',
        label: 'Provisional',
        type: 'select',
        options: ['Integrity Multi-Cure bis-acryl', 'Protemp 4 bis-acryl', 'Luxatemp Ultra bis-acryl'],
        defaultValue: 'Integrity Multi-Cure bis-acryl',
      },
      { key: 'nextVisit', label: 'Next visit', type: 'text', placeholder: 'e.g. Try-in / adhesive cementation 2 wk' },
    ],
    template: `S: Patient presents for crown preparation of tooth #{{tooth}}. Medical history reviewed and updated; no contraindications to treatment identified.

O: Tooth #{{tooth}} pulpal and periodontal status assessed as suitable for full-coverage restoration. Pre-operative shade {{shade}}.

A: Tooth #{{tooth}} requires full-coverage restoration: {{restoration}}.

P: Informed consent obtained after discussion of risks, benefits and alternatives, including no treatment.
- LA: {{carpules}} carpule(s) {{anesthetic}} via {{injection}}; aspiration negative, no adverse reaction.
- Isolation: {{isolation}}.
- Core: {{buildup}}.
- Preparation: occlusal 1.5–2.0 mm with functional cusp bevel, axial 1.2–1.5 mm, 1.0 mm rounded shoulder margin, 10–12° TOC, rounded line angles; verified with reduction guide.
- Dentin: {{sealing}}.
- Retraction: two-cord (#000 / #1 Ultrapak, ViscoStat Clear).
- Impression: {{impression}}; margins verified. Opposing and bite registration taken. Stump shade {{stumpShade}}.
- Lab Rx: {{restoration}}, shade {{shade}}, stump shade {{stumpShade}}.
- Provisional: {{provisional}}, trimmed and polished, cemented with TempBond NE; excess removed, contacts and occlusion verified.
- Patient tolerated procedure well. Provisional care instructions given.

NV: {{nextVisit}}`,
  },
  evidence: [
    'Goodacre CJ, Campagni WV, Aquilino SA. Tooth preparations for complete crowns: an art form based on scientific principles. J Prosthet Dent. 2001;85(4):363–376.',
    'Magne P. Immediate dentin sealing: a fundamental procedure for indirect bonded restorations. J Esthet Restor Dent. 2005;17(3):144–154.',
    'Ivoclar. IPS e.max clinical guide — preparation guidelines and minimum layer thicknesses (current edition).',
    'Manufacturer IFUs: Ultradent Ultrapak / ViscoStat Clear; Dentsply Sirona Aquasil Ultra+ and Integrity Multi•Cure; Kerr TempBond NE.',
  ],
};

/* -------------------------------------------------------------------------- */
/* 2b. RESTORATIVE DATASET (manual schema) + adapter                          */
/*                                                                            */
/* Embedded verbatim from restorative-procedures.js. Depths, bevels, cure /   */
/* etch / scrub times, trituration settings, CDT codes and brands are from    */
/* the source manual; spec rows tagged "Std ref" are textbook values not in   */
/* the manual. `normalizeManualProcedure` maps this schema onto `Procedure`.  */
/* -------------------------------------------------------------------------- */

interface ManualSoapField {
  id: string;
  label: string;
  type: 'text' | 'select' | 'textarea';
  options?: string[];
  value?: string;
}

interface ManualStep {
  id: string;
  title: string;
  body: string[];
  checkpoint?: string;
  ebd?: string;
  warn?: string;
  tip?: string;
  timers?: string[];
}

interface ManualProcedure {
  id: string;
  kind: 'procedure';
  title: string;
  category: string;
  duration: string;
  summary: string;
  cdt: { code: string; label: string }[];
  tags: string[];
  tray: { group: string; items: string[] }[];
  timers: { id: string; label: string; seconds: number; note?: string }[];
  steps: ManualStep[];
  matrices?: { title: string; columns: string[]; rows: string[][]; note?: string }[];
  postOp?: string[];
  widgets?: WidgetKey[];
  /** Named schematics; mapped to DiagramKey via FIGURE_TO_DIAGRAM. */
  figures?: string[];
  labRx?: string;
  soap: { fields: ManualSoapField[]; template: string };
}

const ANESTHETICS: string[] = LA_AGENTS;

const RESTORATIVE_PROCEDURES: ManualProcedure[] = [
  /* ============================================================ AMALGAM I */
  {
    id: "class-i-amalgam",
    kind: "procedure",
    title: "Class I Amalgam",
    category: "operative",
    duration: "~75 min",
    summary:
      "Direct amalgam restoration of an occlusal pit-and-fissure lesion: minimum 1.5 mm pulpal depth, occlusally convergent buccal and lingual walls, Gluma dentin sealer, triturated capsule condensed and carved to anatomy.",
    cdt: [
      { code: "D2140", label: "Amalgam, 1 surface, primary or permanent" },
      { code: "D2150", label: "Amalgam, 2 surfaces (O + buccal/lingual pit extension)" },
    ],
    tags: ["amalgam", "Class I", "#245", "#330", "Gluma", "Consepsis", "Vitrebond", "TheraCal", "Biodentine", "Isodry", "rubber dam", "5T", "Cleoid-Discoid", "Hollenback", "ball burnisher", "condenser", "amalgamator", "3600 cpm", "selective caries removal"],
    tray: [
      { group: "Instrument kits", items: ["Amalgam kit (carrier, small & large condensers, ball & anatomic burnishers, 5T, Cleoid-Discoid, ½ Hollenback)", "Rubber dam kit (clamps, frame, punch, forceps)", "Isodry mouthpiece (size to patient)", "Amalgamator", "Amalgam well"] },
      { group: "Rotary", items: ["High-speed & slow-speed handpieces", "Restorative burs: #330, #245, #2/#4/#6 round (slow speed)", "Composite finishing burs (occlusal adjustment)"] },
      { group: "Materials", items: ["Amalgam capsules (pre-dosed)", "Gluma desensitizer (dentin sealer)", "Consepsis (2% chlorhexidine)", "Vitrebond (RMGI liner) + mixing pad", "Calcium silicate liner (TheraCal LC or Biodentine)", "Microbrushes"] },
      { group: "Chairside disposables", items: ["Anesthetic, needle, topical 20% benzocaine", "Articulating paper", "Floss (ligate clamp)", "Rubber dam sheet", "Wet cotton rolls"] },
    ],
    timers: [
      { id: "consepsis", label: "Consepsis scrub", seconds: 10 },
      { id: "vitrebond", label: "RMGI liner cure", seconds: 20 },
      { id: "gluma", label: "Gluma scrub", seconds: 45 },
      { id: "gluma-wait", label: "Gluma dwell", seconds: 15 },
      { id: "gluma-rinse", label: "Gluma rinse", seconds: 15 },
      { id: "triturate", label: "Triturate capsule", seconds: 10, note: "9–12 s, medium speed (3600 cpm)" },
    ],
    steps: [
      { id: "a1", title: "Pre-op verification", body: [
          "Review medical history, medications, allergies and vitals.",
          "Confirm tooth, surfaces and diagnosis against the approved treatment plan and current bitewing.",
        ],
        warn: "FDA (2020): avoid amalgam when appropriate in higher-risk groups (pregnant or nursing patients, those planning pregnancy, children under 6, neurological disease, impaired renal function, known mercury sensitivity). Offer resin or glass-ionomer alternatives.",
        checkpoint: "Start check: confirm tooth number, surfaces, radiographic lesion depth, material choice and planned isolation before anesthesia." },
      { id: "a2", title: "Record pre-op occlusion", body: [
          "Before anesthesia, mark contacts with articulating paper on the target tooth and both adjacent teeth (or the other teeth on that side).",
          "Sketch the contact map. At the end, compare post-op contacts against it, especially on adjacent teeth.",
        ] },
      { id: "a3", title: "Local anesthesia", body: ["Topical 20% benzocaine, 1–2 min.", "Mandibular: IANB + long buccal. Maxillary: buccal infiltration ± palatal.", "Aspirate before every deposit; inject slowly."] },
      { id: "a4", title: "Isolate", body: ["Rubber dam or Isodry.", "Ligate the rubber dam clamp with floss before placement."] },
      { id: "a5", title: "Preparation & caries removal", body: [
          "Outline with #245 (or #330) held parallel to the long axis of the tooth; extend only into carious or deeply stained fissures.",
          "Pulpal depth at least 1.5 mm; deeper only where caries extends deeper.",
          "Buccal and lingual walls converge occlusally. Flat pulpal floor with rounded internal line angles.",
          "Do not undermine the marginal ridges.",
          "Slow-speed round bur for dentin: infected dentin comes out wet, cheesy and clumpy; sound dentin cuts dry, chalky and dusty.",
          "Removing an old composite: dry thoroughly or scratch with an explorer. Composite scratches, tooth does not.",
        ],
        ebd: "Deep lesions: selective caries removal. Periphery (DEJ) to hard dentin for a sealed margin; leave firm/leathery dentin over the pulp rather than risk exposure.",
        checkpoint: "Preparation review: outline, 1.5 mm minimum depth, occlusal convergence, intact marginal ridges, hard periphery and pulpal proximity." },
      { id: "a6", title: "Disinfect", body: ["Consepsis (2% chlorhexidine) scrub 10 s, rinse 5 s, gently air-dry leaving dentin moist."], timers: ["consepsis"] },
      { id: "a7", title: "Liner or pulp protection (if indicated)", body: [
          "RMGI liner (Vitrebond): when remaining dentin is too thin to shield the pulp. Mix on pad, apply 0.5 mm to the deepest area of the pulpal floor, light-cure 20 s, then Gluma.",
          "Indirect pulp cap (firm dentin left over a near-exposure) or small mechanical (non-carious) exposure: hydraulic calcium silicate (TheraCal LC, Biodentine or MTA) only over the area of pulpal proximity, cover with Vitrebond, then Gluma.",
        ],
        ebd: "Hydraulic calcium silicates replace calcium hydroxide (Dycal) for indirect and direct pulp capping: better seal, no dissolution under the restoration, more predictable dentin bridge.",
        warn: "Carious pulp exposure: stop and reassess pulpal diagnosis before proceeding.",
        timers: ["vitrebond"] },
      { id: "a8", title: "Dentin sealer (Gluma)", body: [
          "Always indicated under amalgam.",
          "Very thin layer, scrubbing motion 45 s → wait 15 s → air-dry → rinse 15 s → blot-dry leaving dentin moist (HVE over the tooth, quick light air; glossy, no pooling).",
        ],
        timers: ["gluma", "gluma-wait", "gluma-rinse"] },
      { id: "a9", title: "Triturate & deliver", body: [
          "Depress the capsule plunger; triturate 9–12 s at medium speed (3600 cpm).",
          "Empty into the amalgam well. A good mix is consistent, shiny and smooth; dull, crumbly or dry means discard and remix.",
          "Carry increments into the preparation and overfill; cavosurface margins must be well covered.",
        ],
        timers: ["triturate"] },
      { id: "a10", title: "Condense", body: [
          "Small condenser first, with firm pressure against the pulpal floor and into the line angles.",
          "Then large condenser over the whole preparation. HVE to remove mercury-rich excess.",
          "Large ball burnisher across the restoration to pre-carve and establish fossa and ridge contour while continuing to condense.",
        ] },
      { id: "a11", title: "Carve & burnish", body: [
          "5T for initial carving, resting on tooth and restoration together to expose the margins.",
          "Cleoid-Discoid, ½ Hollenback and anatomic burnisher to carve anatomy.",
          "Smooth with a wet cotton roll once mostly set.",
        ] },
      { id: "a12", title: "Check occlusion", body: [
          "Remove dam or Isodry.",
          "Articulating paper with gentle closure; a hard bite can fracture unset amalgam.",
          "If high, adjust gently (carver or light high-speed touch). Compare to the pre-op contact map.",
        ],
        checkpoint: "Final restoration review: margins, anatomy, occlusion matching the pre-op map. Then complete the note and codes." },
    ],
    matrices: [
      { title: "Class I amalgam preparation", columns: ["Parameter", "Specification", "Source"], rows: [
          ["Pulpal depth", "≥ 1.5 mm; deeper only where caries extends", "Manual"],
          ["Buccal / lingual walls", "Converge occlusally", "Manual"],
          ["Pulpal floor", "Flat, rounded internal line angles", "Manual"],
          ["Marginal ridges", "Not undermined", "Manual"],
          ["Remaining marginal ridge", "≥ 1.6 mm premolar, ≥ 2.0 mm molar", "Std ref"],
          ["Isthmus width", "≤ ¼ intercuspal distance", "Std ref"],
          ["Cavosurface angle", "~90° butt joint (no bevel)", "Std ref"],
          ["RMGI liner", "0.5 mm, cure 20 s, deepest area only", "Manual"],
          ["Trituration", "9–12 s, medium, 3600 cpm", "Manual"],
        ],
        note: "A #245 bur head is ~3 mm long; half its length ≈ the 1.5 mm initial pulpal depth." },
    ],
    postOp: ["Numbness lasts 2–4 h; avoid chewing on that side until it wears off.", "Avoid chewing hard foods on the new filling for 24 h while amalgam reaches full strength.", "Mild cold sensitivity for a few days is normal.", "Call if the bite feels high or sensitivity increases or lingers."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "41" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "tooth", label: "Tooth #", type: "text", value: "19" },
        { id: "surfaces", label: "Surfaces", type: "text", value: "O" },
        { id: "cc", label: "Chief complaint", type: "text", value: "none, routine restorative care" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "120/78, 72 bpm" },
        { id: "dx", label: "Diagnosis", type: "text", value: "primary occlusal caries into dentin" },
        { id: "anesthetic", label: "Anesthetic", type: "select", options: ANESTHETICS, value: ANESTHETICS[0] },
        { id: "carps", label: "Carpules", type: "text", value: "1" },
        { id: "block", label: "Injection", type: "text", value: "left IANB and long buccal" },
        { id: "iso", label: "Isolation", type: "select", options: ["rubber dam", "Isodry (size M)", "cotton rolls and dry angles"], value: "Isodry (size M)" },
        { id: "removal", label: "Caries removal", type: "select", options: ["Nonselective removal to hard dentin; no pulpal proximity.", "Selective removal: periphery to hard dentin, firm dentin retained pulpally to avoid exposure.", "Removed existing failing restoration; recurrent caries excavated to hard dentin."], value: "Nonselective removal to hard dentin; no pulpal proximity." },
        { id: "liner", label: "Liner", type: "select", options: ["No liner indicated.", "RMGI liner (Vitrebond) 0.5 mm in deepest area, cured 20 s.", "Indirect pulp cap with calcium silicate (TheraCal LC) over area of pulpal proximity, covered with RMGI liner (Vitrebond)."], value: "No liner indicated." },
        { id: "nv", label: "Next visit", type: "text", value: "#30 O amalgam" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for #{{tooth}}-{{surfaces}} amalgam restoration. CC: "{{cc}}".
Medical history reviewed: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O:
#{{tooth}}: clinical and radiographic findings consistent with {{dx}}. Pre-op occlusal contacts recorded with articulating paper.

A:
#{{tooth}}-{{surfaces}}: {{dx}}.

P:
Topical 20% benzocaine applied. {{carps}} carpule(s) {{anesthetic}} administered as {{block}}; aspiration negative.
Isolation: {{iso}}. {{removal}} Preparation refined to ideal form (≥1.5 mm pulpal depth, occlusally convergent B/L walls, marginal ridges intact).
Disinfected with 2% chlorhexidine 10 s, rinsed. {{liner}}
Gluma dentin sealer applied 45 s, dwell 15 s, air-dried, rinsed, dentin left moist.
Amalgam triturated 9–12 s at 3600 cpm; delivered, overfilled and condensed. Excess removed; carved and burnished to anatomic form.
Occlusion evaluated with articulating paper and adjusted to match pre-op contacts.
Post-op instructions given: numbness, sensitivity, injection-site soreness, uneven bite, no hard chewing for 24 h. Patient tolerated procedure well.

NV: {{nv}}`,
    },
  },

  /* ============================================================ AMALGAM II */
  {
    id: "class-ii-amalgam",
    kind: "procedure",
    title: "Class II Amalgam",
    category: "operative",
    duration: "~90 min",
    summary:
      "Direct amalgam restoration of a proximal-occlusal lesion: pre-wedging, minimum 1.5 mm pulpal depth, proximal box, Tofflemire universal matrix with wooden wedge, Gluma dentin sealer, and condensation into the box before the occlusal.",
    cdt: [
      { code: "D2150", label: "Amalgam, 2 surfaces, primary or permanent" },
      { code: "D2160", label: "Amalgam, 3 surfaces, primary or permanent" },
      { code: "D2161", label: "Amalgam, 4 or more surfaces, primary or permanent" },
    ],
    tags: ["amalgam", "Class II", "MO", "DO", "MOD", "#245", "#330", "Tofflemire", "universal matrix", "wooden wedge", "pre-wedge", "Gluma", "Consepsis", "Vitrebond", "TheraCal", "Biodentine", "proximal box", "axiopulpal", "5T", "Cleoid-Discoid", "Hollenback", "3600 cpm"],
    tray: [
      { group: "Instrument kits", items: ["Amalgam kit (carrier, small & large condensers, ball & anatomic burnishers, 5T, Cleoid-Discoid, ½ Hollenback)", "Tofflemire retainer + universal matrix bands", "Rubber dam kit (clamps, frame, punch, forceps)", "Isodry mouthpiece (size to patient)", "Amalgamator", "Amalgam well"] },
      { group: "Rotary", items: ["High-speed & slow-speed handpieces", "Restorative burs: #330, #245, #2/#4/#6 round (slow speed)", "Composite finishing burs (occlusal adjustment)"] },
      { group: "Materials", items: ["Amalgam capsules (pre-dosed)", "Gluma desensitizer (dentin sealer)", "Consepsis (2% chlorhexidine)", "Vitrebond (RMGI liner) + mixing pad", "Calcium silicate liner (TheraCal LC or Biodentine)", "Microbrushes"] },
      { group: "Matrix", items: ["Wooden wedges (pre-wedge and final)", "Wedget cord", "Burnisher for band contouring"] },
      { group: "Chairside disposables", items: ["Anesthetic, needle, topical 20% benzocaine", "Articulating paper", "Floss (ligate clamp; test contact)", "Rubber dam sheet", "Wet cotton rolls"] },
    ],
    timers: [
      { id: "consepsis", label: "Consepsis scrub", seconds: 10 },
      { id: "vitrebond", label: "RMGI liner cure", seconds: 20 },
      { id: "gluma", label: "Gluma scrub", seconds: 45 },
      { id: "gluma-wait", label: "Gluma dwell", seconds: 15 },
      { id: "gluma-rinse", label: "Gluma rinse", seconds: 15 },
      { id: "triturate", label: "Triturate capsule", seconds: 10, note: "9–12 s, medium speed (3600 cpm)" },
    ],
    steps: [
      { id: "b1", title: "Pre-op verification", body: [
          "Review medical history, medications, allergies and vitals.",
          "Confirm tooth, surfaces and diagnosis against the approved treatment plan and current bitewing.",
        ],
        warn: "FDA (2020): avoid amalgam when appropriate in higher-risk groups (pregnant or nursing patients, those planning pregnancy, children under 6, neurological disease, impaired renal function, known mercury sensitivity).",
        checkpoint: "Start check: confirm tooth number, surfaces, radiographic lesion depth, material choice and planned isolation before anesthesia." },
      { id: "b2", title: "Record pre-op occlusion", body: [
          "Before anesthesia, mark contacts with articulating paper on the target tooth and both adjacent teeth.",
          "Sketch the contact map; compare post-op contacts against it, especially on adjacent teeth.",
        ] },
      { id: "b3", title: "Local anesthesia", body: ["Topical 20% benzocaine, 1–2 min.", "Mandibular: IANB + long buccal. Maxillary: buccal infiltration ± palatal.", "Aspirate before every deposit."] },
      { id: "b4", title: "Isolate", body: ["Rubber dam (preferred for proximal boxes) or Isodry.", "Ligate the clamp with floss before placement."] },
      { id: "b5", title: "Pre-wedge", body: ["Wooden wedge in the involved embrasure before cutting: separates the teeth, protects papilla and dam, and makes a tight contact easier to restore.", "MOD: pre-wedge mesial and distal."] },
      { id: "b6", title: "Preparation & caries removal", body: [
          "Occlusal outline with #245 (or #330) parallel to the long axis; pulpal depth at least 1.5 mm, deeper only where caries extends.",
          "Buccal and lingual walls converge occlusally. Proximal walls parallel or slightly divergent.",
          "Flat pulpal floor with rounded line angles; bevel (round) the axiopulpal line angle.",
          "Proximal box: isolate the proximal enamel with a thin ditch cut just inside the DEJ, leaving a shell of enamel against the adjacent tooth; break it out with a hand instrument so the adjacent tooth is not nicked.",
          "Do not undermine a marginal ridge that is not being restored.",
          "Slow-speed round bur for dentin: infected dentin is wet, cheesy and clumpy; sound dentin is dry, chalky and dusty.",
        ],
        ebd: "Deep lesions: selective caries removal. Hard dentin at the periphery and gingival floor; firm dentin may be retained over the pulp.",
        checkpoint: "Preparation review: 1.5 mm pulpal depth, occlusal convergence, box clearance from the adjacent tooth, rounded axiopulpal angle, hard periphery." },
      { id: "b7", title: "Matrix & wedge", body: [
          "Tofflemire retainer + universal matrix band + wooden wedge, then burnish the band to the adjacent contact.",
          "Closed end of the Tofflemire retainer toward the occlusal surface of the teeth.",
          "The band is narrower gingivally and wider occlusally.",
          "Wedge seals the gingival margin; check with an explorer that the band is tight against the gingival floor.",
        ] },
      { id: "b8", title: "Disinfect", body: ["Consepsis scrub 10 s, rinse 5 s, gently air-dry leaving dentin moist."], timers: ["consepsis"] },
      { id: "b9", title: "Liner or pulp protection (if indicated)", body: [
          "RMGI liner (Vitrebond): 0.5 mm on the deepest area, light-cure 20 s, then Gluma.",
          "Indirect pulp cap or small mechanical exposure: hydraulic calcium silicate (TheraCal LC, Biodentine or MTA) over the area of pulpal proximity only, cover with Vitrebond, then Gluma.",
          "Keep liners off the gingival floor margin and cavosurface walls.",
        ],
        ebd: "Hydraulic calcium silicates replace calcium hydroxide (Dycal) for pulp capping.",
        timers: ["vitrebond"] },
      { id: "b10", title: "Dentin sealer (Gluma)", body: [
          "Always indicated under amalgam.",
          "Thin layer, scrub 45 s → wait 15 s → air-dry → rinse 15 s → blot-dry leaving dentin moist (glossy, no pooling).",
        ],
        timers: ["gluma", "gluma-wait", "gluma-rinse"] },
      { id: "b11", title: "Triturate, deliver & condense", body: [
          "Triturate 9–12 s at medium speed (3600 cpm). A good mix is shiny and smooth; discard dull or crumbly mixes.",
          "Fill the proximal box first: small condenser into the gingival floor and box line angles, pressing toward the band to build the contact.",
          "Then condense the occlusal with the small, then large condenser. Overfill; margins well covered.",
          "HVE to remove excess. Large ball burnisher to pre-carve while continuing to condense.",
        ],
        timers: ["triturate"] },
      { id: "b12", title: "Carve & remove matrix", body: [
          "Carve the marginal ridge with an explorer tip along the band to match the height of the adjacent ridge.",
          "Remove the wedge, loosen and remove the retainer, then slide the band out buccally or lingually (not occlusally) to protect the new ridge.",
          "5T for initial carving, keeping the blade on tooth and restoration to expose margins. Cleoid-Discoid, ½ Hollenback and anatomic burnisher for anatomy.",
          "Explorer along the gingival margin to detect and remove any overhang. Smooth with a wet cotton roll once mostly set.",
        ] },
      { id: "b13", title: "Check contact & occlusion", body: [
          "Remove dam or Isodry.",
          "Floss the contact: it should snap through, not shred.",
          "Articulating paper with gentle closure; adjust high spots gently. Compare to the pre-op contact map.",
        ],
        checkpoint: "Final restoration review: contact, marginal ridge height, no gingival overhang, occlusion matching pre-op. Then complete the note and codes." },
    ],
    matrices: [
      { title: "Class II amalgam preparation", columns: ["Parameter", "Specification", "Source"], rows: [
          ["Pulpal depth", "≥ 1.5 mm; deeper only where caries extends", "Manual"],
          ["Buccal / lingual walls", "Converge occlusally", "Manual"],
          ["Proximal walls", "Parallel or slightly divergent", "Manual"],
          ["Pulpal floor / axiopulpal", "Flat floor, rounded line angles, beveled axiopulpal", "Manual"],
          ["Axial wall depth", "0.2–0.5 mm inside the DEJ", "Std ref"],
          ["Gingival floor clearance", "~0.5 mm from the adjacent tooth", "Std ref"],
          ["B / L proximal clearance", "Just clear of contact (≈0.2–0.5 mm)", "Std ref"],
          ["Cavosurface angle", "~90° (no bevel)", "Std ref"],
          ["Trituration", "9–12 s, medium, 3600 cpm", "Manual"],
        ] },
    ],
    postOp: ["Numbness lasts 2–4 h; avoid chewing on that side until it wears off.", "No hard chewing on the new filling for 24 h.", "Floss normally; call if floss catches or shreds.", "Mild cold sensitivity for a few days is normal. Call if the bite feels high."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "46" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "male" },
        { id: "tooth", label: "Tooth #", type: "text", value: "19" },
        { id: "surfaces", label: "Surfaces", type: "text", value: "MOD" },
        { id: "cc", label: "Chief complaint", type: "text", value: "old filling is broken" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "126/80, 70 bpm" },
        { id: "dx", label: "Diagnosis", type: "text", value: "failing restoration with recurrent caries, MOD" },
        { id: "anesthetic", label: "Anesthetic", type: "select", options: ANESTHETICS, value: ANESTHETICS[0] },
        { id: "carps", label: "Carpules", type: "text", value: "1" },
        { id: "block", label: "Injection", type: "text", value: "left IANB and long buccal" },
        { id: "iso", label: "Isolation", type: "select", options: ["rubber dam", "Isodry (size M)", "cotton rolls and dry angles"], value: "rubber dam" },
        { id: "removal", label: "Caries removal", type: "select", options: ["Nonselective removal to hard dentin; no pulpal proximity.", "Selective removal: periphery to hard dentin, firm dentin retained pulpally to avoid exposure.", "Removed existing failing restoration; recurrent caries excavated to hard dentin."], value: "Removed existing failing restoration; recurrent caries excavated to hard dentin." },
        { id: "liner", label: "Liner", type: "select", options: ["No liner indicated.", "RMGI liner (Vitrebond) 0.5 mm in deepest area, cured 20 s.", "Indirect pulp cap with calcium silicate (TheraCal LC) over area of pulpal proximity, covered with RMGI liner (Vitrebond)."], value: "No liner indicated." },
        { id: "nv", label: "Next visit", type: "text", value: "#30 DO amalgam" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for #{{tooth}}-{{surfaces}} amalgam restoration. CC: "{{cc}}".
Medical history reviewed: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O:
#{{tooth}}: clinical and radiographic findings consistent with {{dx}}. Pre-op occlusal contacts recorded with articulating paper.

A:
#{{tooth}}-{{surfaces}}: {{dx}}.

P:
Topical 20% benzocaine applied. {{carps}} carpule(s) {{anesthetic}} administered as {{block}}; aspiration negative.
Isolation: {{iso}}. Pre-wedged. {{removal}} Preparation refined to ideal form.
Disinfected with 2% chlorhexidine 10 s, rinsed. {{liner}}
Gluma dentin sealer applied 45 s, dwell 15 s, air-dried, rinsed, dentin left moist.
Tofflemire retainer with universal matrix band and wooden wedge placed and burnished.
Amalgam triturated 9–12 s at 3600 cpm; delivered, overfilled and condensed (proximal box first). Marginal ridge carved; matrix removed; carved and burnished to anatomic form. No gingival overhang detected.
Interproximal contact evaluated with floss and adjusted to ideal. Occlusion evaluated with articulating paper and adjusted to match pre-op contacts.
Post-op instructions given: numbness, sensitivity, injection-site soreness, uneven bite, no hard chewing for 24 h. Patient tolerated procedure well.

NV: {{nv}}`,
    },
  },

  /* ========================================================= COMPOSITE I */
  {
    id: "class-i-composite",
    kind: "procedure",
    title: "Class I Posterior Composite",
    category: "operative",
    duration: "~75 min",
    summary:
      "Direct resin restoration of an occlusal lesion: conservative caries-driven outline, selective enamel etch with Scotchbond Universal, optional Gluma, and incremental nanofill layering with a 60 s final cure.",
    cdt: [
      { code: "D2391", label: "Resin-based composite, 1 surface, posterior" },
    ],
    tags: ["composite", "Class I", "occlusal", "#330", "#245", "selective etch", "Scotchbond Universal", "Gluma", "Consepsis", "Vitrebond", "TheraCal", "Biodentine", "nanofill", "Renamel", "Isodry", "rubber dam", "Shofu", "Jiffy brush", "C-factor"],
    tray: [
      { group: "Instrument kits", items: ["Composite kit", "Rubber dam kit (clamps, frame, punch, forceps)", "Composite gun", "LED curing light (verify output)", "Vita shade guide", "Isodry mouthpiece (size to patient)"] },
      { group: "Rotary", items: ["High-speed & slow-speed handpieces", "Restorative burs: #330, #245, #2/#4/#6 round (slow speed)", "Composite finishing diamonds / carbides"] },
      { group: "Materials", items: ["35% phosphoric acid etch", "Scotchbond Universal adhesive", "Gluma desensitizer", "Consepsis (2% chlorhexidine)", "Vitrebond (RMGI liner) + mixing pad", "Calcium silicate liner (TheraCal LC or Biodentine)", "Renamel Nanofill composite in selected shade", "Microbrushes"] },
      { group: "Finishing", items: ["Shofu polishers", "Jiffy brush"] },
      { group: "Chairside disposables", items: ["Anesthetic, needle, topical 20% benzocaine", "Articulating paper", "Floss (ligate clamp)", "Rubber dam sheet", "Wedget cord"] },
    ],
    timers: [
      { id: "consepsis", label: "Consepsis scrub", seconds: 10 },
      { id: "vitrebond", label: "RMGI liner cure", seconds: 20 },
      { id: "etch", label: "Enamel etch", seconds: 15, note: "Selective etch: enamel only, 15 s" },
      { id: "gluma", label: "Gluma scrub", seconds: 45 },
      { id: "gluma-wait", label: "Gluma dwell", seconds: 15 },
      { id: "bond", label: "Universal adhesive scrub", seconds: 20 },
      { id: "airthin", label: "Air-thin adhesive", seconds: 5 },
      { id: "cure-bond", label: "Cure adhesive", seconds: 10 },
      { id: "cure-inc", label: "Cure increment", seconds: 20, note: "20–40 s depending on increment size" },
      { id: "cure-final", label: "Final cure", seconds: 60 },
    ],
    steps: [
      { id: "k1", title: "Pre-op verification", body: ["Review medical history, medications, allergies and vitals.", "Confirm tooth, surfaces and diagnosis against the approved treatment plan and current bitewing."], checkpoint: "Start check: confirm tooth number, surfaces, radiographic lesion depth and planned isolation before anesthesia." },
      { id: "k2", title: "Record pre-op occlusion", body: ["Before anesthesia, mark contacts with articulating paper on the target tooth and both adjacent teeth.", "Sketch the contact map; compare post-op contacts against it."] },
      { id: "k3", title: "Local anesthesia", body: ["Topical 20% benzocaine, 1–2 min.", "Mandibular: IANB + long buccal. Maxillary: buccal infiltration ± palatal."] },
      { id: "k4", title: "Shade selection", body: ["Select shade before isolation while teeth are hydrated; dehydrated enamel reads lighter.", "Check under operatory, ambient and natural light."] },
      { id: "k5", title: "Isolate", body: ["Rubber dam or Isodry. Ligate the clamp with floss."] },
      { id: "k6", title: "Preparation & caries removal", body: [
          "Caries-driven outline with #330 or #245; no extension for prevention. Adjacent sound fissures are sealed, not cut.",
          "Slow-speed round bur for dentin: infected dentin is wet, cheesy and clumpy; sound dentin is dry, chalky and dusty.",
          "Removing an old composite: dry thoroughly or scratch with an explorer. Composite scratches, tooth does not.",
        ],
        ebd: "Selective caries removal in deep lesions: hard dentin at the periphery, firm dentin retained over the pulp.",
        checkpoint: "Preparation review: caries removal complete at the periphery, pulpal proximity assessed; refine until accepted." },
      { id: "k7", title: "Disinfect", body: ["Consepsis scrub 10 s, rinse 5 s, gently air-dry leaving dentin moist."], timers: ["consepsis"] },
      { id: "k8", title: "Liner or pulp protection (if indicated)", body: [
          "RMGI liner (Vitrebond): when remaining dentin is too thin to shield the pulp. Apply 0.5 mm to the pulpal floor, light-cure 20 s.",
          "Indirect pulp cap or small mechanical exposure: hydraulic calcium silicate (TheraCal LC, Biodentine or MTA) over the area of pulpal proximity only, covered with Vitrebond.",
        ],
        ebd: "Hydraulic calcium silicates replace calcium hydroxide (Dycal) for pulp capping.",
        timers: ["vitrebond"] },
      { id: "k9", title: "Selective etch · desensitize · bond", body: [
          "Etch enamel margins only with 35% phosphoric acid, 15 s. Rinse 5 s. Leave dentin moist and glossy, not pooled.",
          "Gluma (optional desensitizer): thin layer, scrub 45 s, dwell 15 s, air-dry, rinse, blot-dry. Sequence: etch → Gluma → bond.",
          "Scotchbond Universal: vigorous scrub 20 s, air-thin 5 s, light-cure 10 s.",
          "Contaminated: re-etch enamel 5 s, rinse, dry, re-bond, cure.",
        ],
        ebd: "Universal adhesive in self-etch mode on dentin with selective enamel etch: best enamel bond without over-etching dentin.",
        timers: ["etch", "gluma", "gluma-wait", "bond", "airthin", "cure-bond"] },
      { id: "k10", title: "Incremental layering", body: [
          "Renamel Nanofill in oblique increments ≤2 mm, each bonded to as few opposing walls as possible (reduces C-factor stress).",
          "Cure each increment 20–40 s depending on size.",
          "Sculpt cusp inclines and fossae with the last increment. Final cure 60 s.",
        ],
        timers: ["cure-inc", "cure-final"] },
      { id: "k11", title: "Check occlusion", body: ["Remove dam or Isodry.", "Articulating paper in centric and excursions; compare to the pre-op map."] },
      { id: "k12", title: "Finish & polish", body: ["Composite finishing burs, then Shofu and Jiffy brush."], checkpoint: "Final restoration review: margins, anatomy, occlusion. Then complete the note and codes." },
    ],
    matrices: [
      { title: "Class I composite parameters", columns: ["Parameter", "Specification"], rows: [
          ["Enamel etch (35% H₃PO₄)", "15 s, enamel only; rinse 5 s"],
          ["Gluma (optional)", "Scrub 45 s → dwell 15 s → dry → rinse"],
          ["Adhesive", "Scrub 20 s → air-thin 5 s → cure 10 s"],
          ["Increment thickness", "≤ 2 mm, oblique"],
          ["Cure per increment", "20–40 s"],
          ["Final cure", "60 s"],
          ["RMGI liner", "0.5 mm, cure 20 s, deepest area only"],
        ] },
    ],
    postOp: ["Numbness lasts 2–4 h; avoid chewing on that side until it wears off.", "The filling is fully set now; normal eating is fine once numbness is gone.", "Mild cold sensitivity for a few days is normal.", "Call if the bite feels high or sensitivity increases or lingers."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "29" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "tooth", label: "Tooth #", type: "text", value: "19" },
        { id: "surfaces", label: "Surfaces", type: "text", value: "O" },
        { id: "cc", label: "Chief complaint", type: "text", value: "none, routine restorative care" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "116/74, 68 bpm" },
        { id: "dx", label: "Diagnosis", type: "text", value: "primary occlusal caries into dentin" },
        { id: "anesthetic", label: "Anesthetic", type: "select", options: ANESTHETICS, value: ANESTHETICS[0] },
        { id: "carps", label: "Carpules", type: "text", value: "1" },
        { id: "block", label: "Injection", type: "text", value: "left IANB and long buccal" },
        { id: "iso", label: "Isolation", type: "select", options: ["rubber dam", "Isodry (size M)", "cotton rolls and dry angles"], value: "Isodry (size M)" },
        { id: "removal", label: "Caries removal", type: "select", options: ["Nonselective removal to hard dentin; no pulpal proximity.", "Selective removal: periphery to hard dentin, firm dentin retained pulpally to avoid exposure.", "Removed existing failing restoration; recurrent caries excavated to hard dentin."], value: "Nonselective removal to hard dentin; no pulpal proximity." },
        { id: "liner", label: "Liner", type: "select", options: ["No liner indicated.", "RMGI liner (Vitrebond) 0.5 mm in deepest area, cured 20 s.", "Indirect pulp cap with calcium silicate (TheraCal LC) over area of pulpal proximity, covered with RMGI liner (Vitrebond)."], value: "No liner indicated." },
        { id: "gluma", label: "Desensitizer", type: "select", options: ["Gluma desensitizer applied 45 s, dwell 15 s, air-dried, rinsed, dentin left moist.", "No desensitizer used."], value: "Gluma desensitizer applied 45 s, dwell 15 s, air-dried, rinsed, dentin left moist." },
        { id: "shade", label: "Shade", type: "text", value: "A2" },
        { id: "nv", label: "Next visit", type: "text", value: "#30 O composite" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for #{{tooth}}-{{surfaces}} composite restoration. CC: "{{cc}}".
Medical history reviewed: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O:
#{{tooth}}: clinical and radiographic findings consistent with {{dx}}. Pre-op occlusal contacts recorded with articulating paper.

A:
#{{tooth}}-{{surfaces}}: {{dx}}.

P:
Topical 20% benzocaine applied. {{carps}} carpule(s) {{anesthetic}} administered as {{block}}; aspiration negative.
Isolation: {{iso}}. {{removal}} Preparation refined to final form.
Disinfected with 2% chlorhexidine 10 s, rinsed. {{liner}}
Selective enamel etch with 35% phosphoric acid 15 s, rinsed 5 s, dentin left moist. {{gluma}} Scotchbond Universal actively scrubbed 20 s, air-thinned 5 s, light-cured 10 s.
Renamel Nanofill composite, shade {{shade}}, placed in increments of 2 mm or less, each cured 20–40 s; final cure 60 s.
Occlusion evaluated with articulating paper and adjusted to match pre-op contacts. Finished with finishing burs; polished with Shofu and Jiffy brush.
Post-op instructions given: numbness, sensitivity, injection-site soreness, uneven bite. Patient tolerated procedure well.

NV: {{nv}}`,
    },
  },

  /* ======================================================== COMPOSITE II */
  {
    id: "class-ii-composite",
    kind: "procedure",
    title: "Class II Posterior Composite",
    category: "operative",
    duration: "~90 min",
    summary:
      "Direct resin restoration of a proximal-occlusal lesion using pre-wedging, a sectional matrix with separator ring (or Tofflemire), selective enamel etch with a universal adhesive, and incremental nanofill layering.",
    cdt: [
      { code: "D2392", label: "Resin-based composite, 2 surfaces, posterior" },
      { code: "D2393", label: "Resin-based composite, 3 surfaces, posterior" },
      { code: "D2394", label: "Resin-based composite, 4+ surfaces, posterior" },
    ],
    tags: ["Garrison", "sectional matrix", "separator ring", "Tofflemire", "wedge", "pre-wedge", "#330", "#245", "Scotchbond Universal", "Gluma", "Consepsis", "Vitrebond", "nanofill", "Renamel", "Isodry", "rubber dam", "TheraCal", "Biodentine", "Shofu", "Cosmedent", "#12 scalpel", "MOD", "MO", "DO"],
    tray: [
      { group: "Instrument kits", items: ["Composite kit", "Rubber dam kit (clamps, frame, punch, forceps)", "Sectional matrix kit with separator ring(s), 1–2", "Tofflemire retainer + universal bands (alternative)", "Composite gun", "LED curing light (verify output)", "Vita shade guide", "Isodry mouthpiece (size to patient)"] },
      { group: "Rotary", items: ["High-speed & slow-speed handpieces", "Restorative burs: #330, #245, #2/#4/#6 round (slow speed)", "Composite finishing diamonds / carbides", "Cosmedent discs"] },
      { group: "Materials", items: ["35% phosphoric acid etch", "Scotchbond Universal adhesive", "Gluma desensitizer", "Consepsis (2% chlorhexidine)", "Vitrebond (RMGI liner) + mixing pad", "Calcium silicate liner (TheraCal LC or Biodentine)", "Renamel Nanofill composite in selected shade", "Microbrushes"] },
      { group: "Matrix & finishing", items: ["Sectional matrix bands", "Plastic wedges", "Wooden wedges (pre-wedging)", "Wedget cord", "Finishing strips", "#12 scalpel blade", "Shofu polishers, Jiffy brush"] },
      { group: "Chairside disposables", items: ["Anesthetic, needle, topical 20% benzocaine", "Articulating paper", "Floss (ligate clamp and ring)", "Rubber dam sheet"] },
    ],
    timers: [
      { id: "consepsis", label: "Consepsis scrub", seconds: 10 },
      { id: "vitrebond", label: "RMGI liner cure", seconds: 20 },
      { id: "etch", label: "Enamel etch", seconds: 15, note: "Selective etch: enamel only, 15 s" },
      { id: "gluma", label: "Gluma scrub", seconds: 45 },
      { id: "gluma-wait", label: "Gluma dwell", seconds: 15 },
      { id: "bond", label: "Universal adhesive scrub", seconds: 20 },
      { id: "airthin", label: "Air-thin adhesive", seconds: 5 },
      { id: "cure-bond", label: "Cure adhesive", seconds: 10 },
      { id: "cure-inc", label: "Cure increment", seconds: 20, note: "20–40 s depending on increment size" },
      { id: "cure-final", label: "Final cure", seconds: 60 },
    ],
    steps: [
      { id: "s1", title: "Pre-op verification", body: ["Review medical history, medications, allergies and vitals.", "Confirm tooth, surfaces and diagnosis against the approved treatment plan and current bitewing."], checkpoint: "Start check: confirm tooth number, surfaces, radiographic depth of the lesion and planned isolation before anesthesia." },
      { id: "s2", title: "Record pre-op occlusion", body: ["Before anesthesia, mark centric contacts with articulating paper on the target tooth and both adjacent teeth.", "Sketch the contact map. Compare post-op contacts against it, especially on adjacent teeth."] },
      { id: "s3", title: "Local anesthesia", body: ["Topical 20% benzocaine, 1–2 min.", "Mandibular molars/premolars: IANB + long buccal. Maxillary: buccal infiltration ± palatal.", "Aspirate before every deposit; inject slowly."] },
      { id: "s4", title: "Shade selection", body: ["Select shade before isolation while teeth are hydrated. Dehydrated enamel reads lighter.", "Check under operatory light, ambient light and natural light."] },
      { id: "s5", title: "Isolate", body: ["Rubber dam (preferred for deep proximal boxes) or Isodry.", "Ligate the clamp with floss before placement."] },
      { id: "s6", title: "Pre-wedge", body: ["Place a wooden wedge in the involved embrasure before cutting. Pre-wedging separates the teeth, protects the papilla and dam, and makes a tight contact easier to restore.", "MOD: pre-wedge mesial and distal."] },
      { id: "s7", title: "Preparation & caries removal", body: [
          "Outline with #330/#245. Keep the proximal box as narrow as caries allows; break the contact gingivally only as far as the lesion requires.",
          "Remove caries at the periphery (DEJ and cavosurface) to hard dentin for a sealed margin.",
          "Slow-speed round bur for dentin: infected dentin comes out wet, cheesy and clumpy; sound dentin cuts dry, chalky and dusty.",
          "Old composite vs tooth: dry thoroughly or scratch with an explorer. Composite scratches, tooth does not.",
        ],
        ebd: "Deep lesions: selective caries removal. Leave firm (leathery) dentin over the pulp rather than risk exposure. Peripheral dentin must be hard.",
        checkpoint: "Verify caries excavation (hard periphery, firm pulpal floor) and pulpal proximity before proceeding to the matrix." },
      { id: "s8", title: "Matrix & separator ring", body: [
          "Remove the pre-wedge. Seat a sectional band with the concave (smiling) edge toward occlusal.",
          "Place a plastic wedge firmly from the widest embrasure, then the separator ring. Ligate the ring with floss.",
          "Burnish the band into the contact area of the adjacent tooth.",
          "MOD: use two rings, or restore one proximal wall at a time, then fill occlusal last.",
          "Alternative: Tofflemire retainer + universal band + wooden wedge. Closed end of the retainer toward occlusal; band narrower gingivally, wider occlusally.",
        ] },
      { id: "s9", title: "Disinfect", body: ["Consepsis (2% chlorhexidine) scrub 10 s, rinse 5 s, gently air-dry leaving dentin moist."], timers: ["consepsis"] },
      { id: "s10", title: "Liner or pulp protection (if indicated)", body: [
          "RMGI liner (Vitrebond): when remaining dentin is too thin to shield the pulp. Mix on pad, apply 0.5 mm to the deepest area, light-cure 20 s.",
          "Indirect pulp cap (firm dentin left over near-exposure): hydraulic calcium silicate (TheraCal LC, Biodentine) only over the area of pulpal proximity, then RMGI.",
          "Keep liners off enamel margins and cavosurface walls.",
        ],
        ebd: "Prefer hydraulic calcium silicates (MTA, Biodentine, TheraCal LC) over pure calcium hydroxide (Dycal) for pulp capping: better seal, less dissolution, more predictable dentin bridge.",
        warn: "Pulp exposure: stop and reassess. Permanent tooth with a small exposure in healthy pulp: direct pulp cap with MTA/Biodentine.",
        timers: ["vitrebond"] },
      { id: "s11", title: "Selective etch · desensitize · bond", body: [
          "Etch enamel margins only with 35% phosphoric acid, 15 s. Rinse 5 s. Remove excess water with HVE; leave dentin glossy and moist, never desiccated or pooled.",
          "Gluma (optional desensitizer): thin layer, scrub 45 s, dwell 15 s, air-dry, rinse, blot-dry leaving dentin moist. Sequence: etch → Gluma → bond.",
          "Scotchbond Universal: active scrub 20 s on all surfaces, air-thin 5 s until the film stops moving, light-cure 10 s.",
          "Contaminated with saliva or blood: re-etch enamel 5 s, rinse, dry, re-bond, cure.",
        ],
        ebd: "Universal adhesive in self-etch mode on dentin with selective enamel etch gives the best enamel bond without over-etching dentin. Active scrubbing improves dentin infiltration.",
        timers: ["etch", "gluma", "gluma-wait", "bond", "airthin", "cure-bond"] },
      { id: "s12", title: "Incremental layering", body: [
          "Build the proximal wall first against the matrix, converting the Class II into a Class I.",
          "Renamel Nanofill in oblique increments ≤2 mm. Cure each increment 20–40 s depending on thickness.",
          "Sculpt occlusal anatomy with the last increment. Final cure 60 s, including from buccal and lingual after matrix removal.",
        ],
        timers: ["cure-inc", "cure-final"] },
      { id: "s13", title: "Remove matrix · check contact & occlusion", body: ["Remove ring, wedge and band. Remove dam or Isodry.", "Floss: contact should snap through, not shred. Check for gingival overhang with an explorer.", "Articulating paper in centric and excursions. Compare to the pre-op contact map."] },
      { id: "s14", title: "Finish & polish", body: ["Proximal: #12 blade and finishing strips for gingival flash.", "Occlusal: finishing diamonds/carbides, then Shofu, Cosmedent discs, Jiffy brush."], checkpoint: "Final restoration review: margins, contact, contour, occlusion. Then complete the note and codes." },
    ],
    matrices: [
      { title: "Class II layering parameters", columns: ["Parameter", "Specification"], rows: [
          ["Enamel etch (35% H₃PO₄)", "15 s, enamel only; rinse 5 s"],
          ["Dentin condition", "Moist, glossy, no pooling"],
          ["Adhesive application", "Active scrub 20 s → air-thin 5 s → cure 10 s"],
          ["Increment thickness", "≤ 2 mm, oblique"],
          ["Cure per increment", "20–40 s"],
          ["Final cure", "60 s, plus buccal/lingual after matrix removal"],
          ["RMGI liner", "0.5 mm, cure 20 s, deepest area only"],
        ] },
    ],
    postOp: ["Numbness lasts 2–4 h; avoid chewing on that side until it wears off.", "Mild cold sensitivity for a few days is normal.", "Injection site may be sore for 1–2 days.", "Call if the bite feels high or sensitivity increases or lingers."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "34" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "tooth", label: "Tooth #", type: "text", value: "19" },
        { id: "surfaces", label: "Surfaces", type: "text", value: "MO" },
        { id: "cc", label: "Chief complaint", type: "text", value: "food gets stuck between my teeth" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "118/76, 72 bpm" },
        { id: "dx", label: "Diagnosis", type: "text", value: "primary caries into dentin, MO" },
        { id: "anesthetic", label: "Anesthetic", type: "select", options: ANESTHETICS, value: ANESTHETICS[0] },
        { id: "carps", label: "Carpules", type: "text", value: "1" },
        { id: "block", label: "Injection", type: "text", value: "left IANB and long buccal" },
        { id: "iso", label: "Isolation", type: "select", options: ["rubber dam", "Isodry (size M)", "cotton rolls and dry angles"], value: "rubber dam" },
        { id: "removal", label: "Caries removal", type: "select", options: ["Nonselective removal to hard dentin; no pulpal proximity.", "Selective removal: periphery to hard dentin, firm dentin retained pulpally to avoid exposure.", "Removed existing failing restoration; recurrent caries excavated to hard dentin."], value: "Nonselective removal to hard dentin; no pulpal proximity." },
        { id: "matrix", label: "Matrix", type: "select", options: ["Sectional matrix, plastic wedge and separator ring placed and burnished.", "Tofflemire retainer with universal band and wooden wedge placed and burnished."], value: "Sectional matrix, plastic wedge and separator ring placed and burnished." },
        { id: "liner", label: "Liner", type: "select", options: ["No liner indicated.", "RMGI liner (Vitrebond) 0.5 mm in deepest area, cured 20 s.", "Indirect pulp cap with calcium silicate (TheraCal LC) over area of pulpal proximity, covered with RMGI liner."], value: "No liner indicated." },
        { id: "shade", label: "Shade", type: "text", value: "A2" },
        { id: "nv", label: "Next visit", type: "text", value: "#30 DO composite" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for #{{tooth}}-{{surfaces}} composite restoration. CC: "{{cc}}".
Medical history reviewed: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O:
#{{tooth}}: clinical and radiographic findings consistent with {{dx}}. Pre-op occlusal contacts recorded with articulating paper.

A:
#{{tooth}}-{{surfaces}}: {{dx}}.

P:
Topical 20% benzocaine applied. {{carps}} carpule(s) {{anesthetic}} administered as {{block}}; aspiration negative.
Isolation: {{iso}}. Pre-wedged. {{removal}} Preparation refined to final form.
{{matrix}} Disinfected with 2% chlorhexidine 10 s, rinsed. {{liner}}
Selective enamel etch with 35% phosphoric acid 15 s, rinsed, dentin left moist. Gluma desensitizer applied. Scotchbond Universal actively scrubbed 20 s, air-thinned 5 s, light-cured 10 s.
Renamel Nanofill composite, shade {{shade}}, placed in increments of 2 mm or less, each cured 20–40 s; final cure 60 s.
Contact verified with floss; no overhang detected. Occlusion and excursions evaluated with articulating paper and adjusted. Finished and polished.
Post-op instructions given: numbness, sensitivity, injection-site soreness, uneven bite. Patient tolerated procedure well.

NV: {{nv}}`,
    },
  },

  /* ======================================================= COMPOSITE III */
  {
    id: "class-iii-composite",
    kind: "procedure",
    title: "Class III Anterior Composite",
    category: "operative",
    duration: "~60–75 min",
    summary:
      "Direct resin restoration of an anterior proximal lesion without incisal-angle involvement: lingual access when possible, 0.25–0.5 mm enamel bevel at 45°, mylar strip and wedge, selective etch, Renamel Microfill, and disc sequence polish.",
    cdt: [
      { code: "D2330", label: "Resin-based composite, 1 surface, anterior" },
      { code: "D2331", label: "Resin-based composite, 2 surfaces, anterior" },
      { code: "D2332", label: "Resin-based composite, 3 surfaces, anterior" },
    ],
    tags: ["composite", "Class III", "anterior", "lingual approach", "bevel", "45°", "mylar strip", "wooden wedge", "microfill", "Renamel", "Scotchbond Universal", "Gluma", "Consepsis", "Vitrebond", "Cosmedent discs", "Flexibuff", "Enamelize", "#330", "#2 round"],
    tray: [
      { group: "Instrument kits", items: ["Composite kit", "Rubber dam kit (clamps, frame, punch, forceps)", "Composite gun", "LED curing light (verify output)", "Vita shade guide", "Isodry mouthpiece (size to patient)"] },
      { group: "Rotary", items: ["High-speed & slow-speed handpieces", "Restorative burs: #330, #2/#4 round, fine flame diamond (bevel)", "Composite finishing diamonds / carbides"] },
      { group: "Materials", items: ["35% phosphoric acid etch", "Scotchbond Universal adhesive", "Gluma desensitizer", "Consepsis (2% chlorhexidine)", "Vitrebond (RMGI liner) + mixing pad", "Calcium silicate liner (TheraCal LC or Biodentine)", "Renamel Microfill composite in selected shade", "Microbrushes"] },
      { group: "Matrix & finishing", items: ["Clear mylar strips", "Wooden wedges", "Wedget cord", "Finishing strips", "#12 scalpel blade", "Cosmedent discs (gray, blue, yellow, pink)", "Flexibuff + Enamelize paste", "Shofu polishers, Jiffy brush"] },
      { group: "Chairside disposables", items: ["Anesthetic, needle, topical 20% benzocaine", "Articulating paper", "Floss", "Rubber dam sheet"] },
    ],
    timers: [
      { id: "consepsis", label: "Consepsis scrub", seconds: 10 },
      { id: "vitrebond", label: "RMGI liner cure", seconds: 20 },
      { id: "etch", label: "Enamel etch", seconds: 15, note: "Selective etch: enamel only, 15 s" },
      { id: "gluma", label: "Gluma scrub", seconds: 45 },
      { id: "gluma-wait", label: "Gluma dwell", seconds: 15 },
      { id: "bond", label: "Universal adhesive scrub", seconds: 20 },
      { id: "airthin", label: "Air-thin adhesive", seconds: 5 },
      { id: "cure-bond", label: "Cure adhesive", seconds: 10 },
      { id: "cure-inc", label: "Cure increment", seconds: 20, note: "20–40 s depending on increment size" },
      { id: "cure-final", label: "Final cure", seconds: 60 },
    ],
    steps: [
      { id: "t1", title: "Pre-op verification", body: ["Review medical history, medications, allergies and vitals.", "Confirm tooth, surfaces and diagnosis against the approved treatment plan and radiographs."], checkpoint: "Start check: confirm tooth number, surfaces, lesion extent and planned isolation before anesthesia." },
      { id: "t2", title: "Record pre-op occlusion", body: ["Before anesthesia, mark contacts on the target tooth and adjacent teeth, including protrusive guidance.", "Sketch the contact map; compare post-op."] },
      { id: "t3", title: "Local anesthesia", body: ["Maxillary anterior: buccal infiltration ± palatal (nasopalatine) as needed.", "Mandibular anterior: labial infiltration or incisive block."] },
      { id: "t4", title: "Shade selection", body: ["Select shade before isolation while teeth are hydrated; check under operatory, ambient and natural light."] },
      { id: "t5", title: "Isolate", body: ["Rubber dam or Isodry. Ligate the clamp with floss."] },
      { id: "t6", title: "Pre-wedge", body: ["Wooden wedge in the involved embrasure before preparation to separate the teeth and protect the papilla."] },
      { id: "t7", title: "Preparation & caries removal", body: [
          "Prepare from the lingual whenever possible to preserve facial enamel and esthetics.",
          "Break the gingival and lingual contacts. The facial contact is usually broken but need not be. Preserve the incisal contact unless caries involves it.",
          "Bevel enamel margins 0.25–0.5 mm at 45°.",
          "Two adjacent lesions: prepare the larger → prepare the smaller → restore the smaller → restore the larger.",
          "Slow-speed round bur for dentin: infected dentin is wet, cheesy and clumpy; sound dentin is dry, chalky and dusty.",
          "Removing an old composite: dry thoroughly or scratch with an explorer.",
        ],
        checkpoint: "Preparation review: access, contact breaks, 0.25–0.5 mm 45° bevel, caries removal; refine until accepted." },
      { id: "t8", title: "Matrix & wedge", body: ["Clear mylar strip + wooden wedge."] },
      { id: "t9", title: "Disinfect", body: ["Consepsis scrub 10 s, rinse 5 s, gently air-dry leaving dentin moist."], timers: ["consepsis"] },
      { id: "t10", title: "Liner or pulp protection (if indicated)", body: [
          "Keep any liner or base off the facial wall to preserve esthetics.",
          "RMGI liner (Vitrebond): 0.5 mm on the deepest (axial) area, light-cure 20 s.",
          "Indirect pulp cap or small mechanical exposure: hydraulic calcium silicate (TheraCal LC, Biodentine or MTA) over the area of pulpal proximity only, covered with Vitrebond.",
        ],
        ebd: "Hydraulic calcium silicates replace calcium hydroxide (Dycal) for pulp capping. In anteriors prefer tooth-colored, non-staining options (Biodentine, TheraCal LC); grey MTA can discolor.",
        timers: ["vitrebond"] },
      { id: "t11", title: "Selective etch · desensitize · bond", body: [
          "Etch enamel (including the bevel) with 35% phosphoric acid, 15 s. Rinse 5 s. Dentin moist, glossy, no pooling.",
          "Gluma (optional): scrub 45 s, dwell 15 s, air-dry, rinse, blot-dry. Sequence: etch → Gluma → bond.",
          "Scotchbond Universal: scrub 20 s, air-thin 5 s, light-cure 10 s.",
          "Contaminated: re-etch 5 s, rinse, dry, re-bond, cure.",
        ],
        timers: ["etch", "gluma", "gluma-wait", "bond", "airthin", "cure-bond"] },
      { id: "t12", title: "Place composite", body: [
          "Renamel Microfill in increments, pulling the mylar strip tight around the tooth to form the contour and contact.",
          "Cure each increment 20–40 s; final cure 60 s (from facial and lingual).",
        ],
        timers: ["cure-inc", "cure-final"] },
      { id: "t13", title: "Check contact & occlusion", body: ["Remove dam or Isodry.", "Floss the contact.", "Articulating paper in centric and protrusion."] },
      { id: "t14", title: "Finish & polish", body: [
          "#12 blade and finishing strips for proximal flash; composite finishing burs for contour.",
          "Discs: gray → blue → yellow → pink, then Flexibuff with Enamelize paste. Shofu and Jiffy brush as needed.",
        ],
        checkpoint: "Final restoration review: margins, contact, contour, shade match, occlusion. Then complete the note and codes." },
    ],
    matrices: [
      { title: "Class III parameters", columns: ["Parameter", "Specification", "Source"], rows: [
          ["Access", "Lingual whenever possible", "Manual"],
          ["Enamel bevel", "0.25–0.5 mm at 45°", "Manual"],
          ["Contacts broken", "Gingival + lingual (facial usually); preserve incisal", "Manual"],
          ["Enamel etch", "15 s, enamel only", "Manual / EBD"],
          ["Cure per increment", "20–40 s; final 60 s", "Manual"],
          ["Disc sequence", "Gray → blue → yellow → pink → Flexibuff + Enamelize", "Manual"],
        ] },
    ],
    postOp: ["Numbness lasts 2–4 h.", "Mild cold sensitivity for a few days is normal.", "Coffee, tea and red wine can stain composite margins in the first 48 h; limit if possible.", "Call if the bite feels high or sensitivity lingers."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "38" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "tooth", label: "Tooth #", type: "text", value: "8" },
        { id: "surfaces", label: "Surfaces", type: "text", value: "ML" },
        { id: "cc", label: "Chief complaint", type: "text", value: "dark spot between my front teeth" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "118/76, 72 bpm" },
        { id: "dx", label: "Diagnosis", type: "text", value: "proximal caries into dentin, ML" },
        { id: "anesthetic", label: "Anesthetic", type: "select", options: ANESTHETICS, value: ANESTHETICS[0] },
        { id: "carps", label: "Carpules", type: "text", value: "1" },
        { id: "block", label: "Injection", type: "text", value: "buccal infiltration above #8 and palatal infiltration" },
        { id: "iso", label: "Isolation", type: "select", options: ["rubber dam", "Isodry (size M)", "cotton rolls and retraction"], value: "rubber dam" },
        { id: "removal", label: "Caries removal", type: "select", options: ["Nonselective removal to hard dentin; no pulpal proximity.", "Selective removal: periphery to hard dentin, firm dentin retained pulpally to avoid exposure.", "Removed existing failing restoration; recurrent caries excavated to hard dentin."], value: "Nonselective removal to hard dentin; no pulpal proximity." },
        { id: "liner", label: "Liner", type: "select", options: ["No liner indicated.", "RMGI liner (Vitrebond) 0.5 mm on axial wall (off facial wall), cured 20 s.", "Indirect pulp cap with calcium silicate (TheraCal LC) over area of pulpal proximity, covered with RMGI liner."], value: "No liner indicated." },
        { id: "shade", label: "Shade", type: "text", value: "A2" },
        { id: "nv", label: "Next visit", type: "text", value: "#9 M composite" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for #{{tooth}}-{{surfaces}} composite restoration. CC: "{{cc}}".
Medical history reviewed: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O:
#{{tooth}}: clinical and radiographic findings consistent with {{dx}}. Pre-op centric and protrusive contacts recorded.

A:
#{{tooth}}-{{surfaces}}: {{dx}}.

P:
Topical 20% benzocaine applied. {{carps}} carpule(s) {{anesthetic}} administered as {{block}}; aspiration negative.
Isolation: {{iso}}. Pre-wedged. Lingual access. {{removal}} Enamel margins beveled 0.25–0.5 mm at 45°.
Clear mylar strip and wooden wedge placed. Disinfected with 2% chlorhexidine 10 s, rinsed. {{liner}}
Selective enamel etch with 35% phosphoric acid 15 s, rinsed, dentin left moist. Gluma desensitizer applied. Scotchbond Universal scrubbed 20 s, air-thinned 5 s, light-cured 10 s.
Renamel Microfill composite, shade {{shade}}, placed in increments, each cured 20–40 s; final cure 60 s.
Contact verified with floss. Occlusion (centric and protrusive) evaluated and adjusted. Finished with finishing burs and strips; polished with Cosmedent disc sequence, Flexibuff with Enamelize, Shofu and Jiffy brush.
Post-op instructions given: numbness, sensitivity, injection-site soreness, staining foods. Patient tolerated procedure well.

NV: {{nv}}`,
    },
  },

  /* ======================================================== COMPOSITE IV */
  {
    id: "class-iv-composite",
    kind: "procedure",
    title: "Class IV Anterior Composite",
    category: "operative",
    duration: "~90 min",
    summary:
      "Direct resin restoration of an anterior proximal lesion or fracture involving the incisal angle: wide 0.5–2.0 mm facial bevel, palatal-shell layering against a mylar strip or silicone index, selective etch, and full disc-sequence polish.",
    cdt: [
      { code: "D2335", label: "Resin-based composite, 4+ surfaces or involving incisal angle, anterior" },
    ],
    tags: ["composite", "Class IV", "incisal angle", "fracture", "wide bevel", "layering", "palatal shell", "silicone index", "microfill", "nanofill", "Renamel", "Scotchbond Universal", "Gluma", "Consepsis", "Vitrebond", "Cosmedent discs", "Flexibuff", "Enamelize", "mylar strip"],
    tray: [
      { group: "Instrument kits", items: ["Composite kit", "Rubber dam kit (clamps, frame, punch, forceps)", "Composite gun", "LED curing light (verify output)", "Vita shade guide", "Isodry mouthpiece (size to patient)"] },
      { group: "Rotary", items: ["High-speed & slow-speed handpieces", "Restorative burs: #330, #2/#4 round, flame diamond (bevel)", "Composite finishing diamonds / carbides"] },
      { group: "Materials", items: ["35% phosphoric acid etch", "Scotchbond Universal adhesive", "Gluma desensitizer", "Consepsis (2% chlorhexidine)", "Vitrebond (RMGI liner) + mixing pad", "Calcium silicate liner (TheraCal LC or Biodentine)", "Renamel Microfill (enamel/facial) and Nanofill (palatal shell/body) in selected shades", "Putty for palatal index (optional, from wax-up or intraoral mock-up)", "Microbrushes"] },
      { group: "Matrix & finishing", items: ["Clear mylar strips", "Wooden wedges", "Wedget cord", "Finishing strips", "#12 scalpel blade", "Cosmedent discs (gray, blue, yellow, pink)", "Flexibuff + Enamelize paste", "Shofu polishers, Jiffy brush"] },
      { group: "Chairside disposables", items: ["Anesthetic, needle, topical 20% benzocaine", "Articulating paper", "Floss", "Rubber dam sheet"] },
    ],
    timers: [
      { id: "consepsis", label: "Consepsis scrub", seconds: 10 },
      { id: "vitrebond", label: "RMGI liner cure", seconds: 20 },
      { id: "etch", label: "Enamel etch", seconds: 15, note: "Selective etch: enamel only, 15 s" },
      { id: "gluma", label: "Gluma scrub", seconds: 45 },
      { id: "gluma-wait", label: "Gluma dwell", seconds: 15 },
      { id: "bond", label: "Universal adhesive scrub", seconds: 20 },
      { id: "airthin", label: "Air-thin adhesive", seconds: 5 },
      { id: "cure-bond", label: "Cure adhesive", seconds: 10 },
      { id: "cure-inc", label: "Cure increment", seconds: 20, note: "20–40 s depending on increment size" },
      { id: "cure-final", label: "Final cure", seconds: 60 },
    ],
    steps: [
      { id: "f1", title: "Pre-op verification", body: ["Review medical history, medications, allergies and vitals.", "Trauma cases: record pulp vitality testing and a periapical radiograph before restoring."], checkpoint: "Start check: confirm tooth, surfaces, pulp status (trauma) and planned isolation before anesthesia." },
      { id: "f2", title: "Record pre-op occlusion", body: ["Mark centric, protrusive and lateral contacts on the target and adjacent teeth; sketch them.", "The restored incisal angle must not carry heavy protrusive load."] },
      { id: "f3", title: "Local anesthesia", body: ["Maxillary anterior: buccal infiltration ± palatal.", "Mandibular anterior: labial infiltration or incisive block."] },
      { id: "f4", title: "Shade selection & palatal index", body: [
          "Select dentin and enamel shades before isolation while hydrated; check in several light sources.",
          "Optional: make a putty palatal index from a wax-up or a free-hand intraoral mock-up to guide the palatal shell.",
        ] },
      { id: "f5", title: "Isolate", body: ["Rubber dam or Isodry. Ligate the clamp with floss."] },
      { id: "f6", title: "Pre-wedge", body: ["Wooden wedge in the involved embrasure before preparation."] },
      { id: "f7", title: "Preparation & caries removal", body: [
          "Remove caries and unsupported, fractured enamel.",
          "Create a wide facial bevel, 0.5–2.0 mm, to maximize esthetics and bonded retention.",
          "Two adjacent lesions: prepare the larger → prepare the smaller → restore the smaller → restore the larger.",
          "Removing an old composite: dry thoroughly or scratch with an explorer.",
        ],
        checkpoint: "Preparation review: caries and unsupported enamel removed, 0.5–2.0 mm facial bevel; refine until accepted." },
      { id: "f8", title: "Matrix & wedge", body: ["Clear mylar strip + wooden wedge (or palatal index for the lingual shell, then mylar for the proximal)."] },
      { id: "f9", title: "Disinfect", body: ["Consepsis scrub 10 s, rinse 5 s, gently air-dry leaving dentin moist."], timers: ["consepsis"] },
      { id: "f10", title: "Liner or pulp protection (if indicated)", body: [
          "RMGI liner (Vitrebond): 0.5 mm on the deepest area, off the facial wall, light-cure 20 s.",
          "Near-exposure or small exposure (common in trauma): hydraulic calcium silicate (Biodentine, TheraCal LC) over the area of pulpal proximity only.",
        ],
        ebd: "Hydraulic calcium silicates replace calcium hydroxide (Dycal). In anteriors prefer non-staining options; grey MTA can discolor.",
        timers: ["vitrebond"] },
      { id: "f11", title: "Selective etch · desensitize · bond", body: [
          "Etch enamel and bevel with 35% phosphoric acid, 15 s. Rinse 5 s. Dentin moist, glossy, no pooling.",
          "Gluma (optional): scrub 45 s, dwell 15 s, air-dry, rinse, blot-dry. Sequence: etch → Gluma → bond.",
          "Scotchbond Universal: scrub 20 s, air-thin 5 s, light-cure 10 s.",
          "Contaminated: re-etch 5 s, rinse, dry, re-bond, cure.",
        ],
        timers: ["etch", "gluma", "gluma-wait", "bond", "airthin", "cure-bond"] },
      { id: "f12", title: "Layer the restoration", body: [
          "Palatal shell: thin enamel layer against the palatal index or mylar strip, cure.",
          "Proximal wall: against the mylar strip, cure.",
          "Dentin body: build internal mamelons short of the incisal edge, cure.",
          "Facial enamel: final thin layer of Renamel Microfill over the bevel, cure.",
          "Cure each increment 20–40 s; final cure 60 s from facial and lingual.",
        ],
        ebd: "Microfills polish best but are weakest under load. Use a nanofill (or nanohybrid) for the palatal shell and incisal edge, and microfill as the final facial enamel layer.",
        timers: ["cure-inc", "cure-final"] },
      { id: "f13", title: "Check contact & occlusion", body: ["Remove dam or Isodry.", "Floss the contact.", "Articulating paper in centric, protrusion and lateral excursions; relieve heavy contact on the restored angle."] },
      { id: "f14", title: "Finish & polish", body: [
          "#12 blade and finishing strips for proximal flash; finishing burs for primary and secondary anatomy.",
          "Discs: gray → blue → yellow → pink, then Flexibuff with Enamelize paste. Shofu and Jiffy brush as needed.",
        ],
        checkpoint: "Final restoration review: incisal outline, embrasures, contact, shade and value, protrusive load. Then complete the note and codes." },
    ],
    matrices: [
      { title: "Class IV parameters", columns: ["Parameter", "Specification", "Source"], rows: [
          ["Facial bevel", "Wide, 0.5–2.0 mm", "Manual"],
          ["Enamel etch", "15 s, enamel only", "Manual / EBD"],
          ["Layering", "Palatal shell → proximal wall → dentin body → facial enamel", "Std ref"],
          ["Cure per increment", "20–40 s; final 60 s", "Manual"],
          ["Disc sequence", "Gray → blue → yellow → pink → Flexibuff + Enamelize", "Manual"],
        ] },
    ],
    postOp: ["Numbness lasts 2–4 h.", "Do not bite into hard foods (apples, crusty bread) with the restored tooth; cut food into pieces.", "Avoid habits: nail biting, chewing ice, pens or toothpicks.", "Wear a mouthguard for contact sports.", "Coffee, tea and red wine can stain margins in the first 48 h."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "24" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "male" },
        { id: "tooth", label: "Tooth #", type: "text", value: "9" },
        { id: "surfaces", label: "Surfaces", type: "text", value: "MIFL" },
        { id: "cc", label: "Chief complaint", type: "text", value: "chipped my front tooth" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "122/78, 70 bpm" },
        { id: "dx", label: "Diagnosis", type: "text", value: "enamel-dentin fracture of the mesio-incisal angle; pulp responsive to cold, no lingering" },
        { id: "anesthetic", label: "Anesthetic", type: "select", options: ANESTHETICS, value: ANESTHETICS[0] },
        { id: "carps", label: "Carpules", type: "text", value: "1" },
        { id: "block", label: "Injection", type: "text", value: "buccal infiltration above #9 and palatal infiltration" },
        { id: "iso", label: "Isolation", type: "select", options: ["rubber dam", "Isodry (size M)", "cotton rolls and retraction"], value: "rubber dam" },
        { id: "liner", label: "Liner", type: "select", options: ["No liner indicated.", "RMGI liner (Vitrebond) 0.5 mm on deepest area (off facial wall), cured 20 s.", "Indirect pulp cap with calcium silicate (Biodentine) over area of pulpal proximity, covered with RMGI liner."], value: "No liner indicated." },
        { id: "shade", label: "Shades", type: "text", value: "A2 dentin / A1 enamel" },
        { id: "nv", label: "Next visit", type: "text", value: "#9 vitality recheck in 6–8 weeks" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for #{{tooth}}-{{surfaces}} composite restoration. CC: "{{cc}}".
Medical history reviewed: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O:
#{{tooth}}: {{dx}}. Pre-op centric, protrusive and lateral contacts recorded.

A:
#{{tooth}}-{{surfaces}}: {{dx}}.

P:
Topical 20% benzocaine applied. {{carps}} carpule(s) {{anesthetic}} administered as {{block}}; aspiration negative.
Isolation: {{iso}}. Pre-wedged. Caries and unsupported enamel removed; wide facial bevel (0.5–2.0 mm) placed.
Clear mylar strip and wooden wedge placed. Disinfected with 2% chlorhexidine 10 s, rinsed. {{liner}}
Selective enamel etch with 35% phosphoric acid 15 s, rinsed, dentin left moist. Gluma desensitizer applied. Scotchbond Universal scrubbed 20 s, air-thinned 5 s, light-cured 10 s.
Composite layered (palatal shell, proximal wall, dentin body, facial Renamel Microfill enamel), shades {{shade}}; each increment cured 20–40 s, final cure 60 s.
Contact verified with floss. Centric, protrusive and lateral contacts evaluated and adjusted. Finished with finishing burs and strips; polished with Cosmedent disc sequence, Flexibuff with Enamelize, Shofu and Jiffy brush.
Post-op instructions given: numbness, sensitivity, no incising hard foods, parafunctional habits, mouthguard for sports. Patient tolerated procedure well.

NV: {{nv}}`,
    },
  },

  /* ========================================================= COMPOSITE V */
  {
    id: "class-v-composite",
    kind: "procedure",
    title: "Class V Cervical Composite",
    category: "operative",
    duration: "~60 min",
    summary:
      "Direct resin restoration of a cervical lesion (carious or non-carious): beveled enamel margins, retentive groove and coves when the gingival margin is in cementum/dentin, retraction cord with Hemodent, optional RMGI sandwich (Ketac Nano), and nanofill or microfill by esthetics.",
    cdt: [
      { code: "D2330", label: "Resin-based composite, 1 surface, anterior" },
      { code: "D2391", label: "Resin-based composite, 1 surface, posterior" },
    ],
    tags: ["composite", "Class V", "cervical", "NCCL", "abfraction", "abrasion", "retraction cord", "#0 cord", "Hemodent", "sandwich technique", "Ketac Nano", "RMGI", "cavity conditioner", "retentive groove", "1/4 round", "microfill", "nanofill", "Renamel", "Scotchbond Universal"],
    tray: [
      { group: "Instrument kits", items: ["Composite kit", "Cord packer", "Composite gun", "LED curing light (verify output)", "Vita shade guide", "Isodry mouthpiece (size to patient)"] },
      { group: "Rotary", items: ["High-speed & slow-speed handpieces", "Restorative burs: #330, #2 round, ¼ round (retentive groove/coves), fine diamond (bevel, roughen sclerotic dentin)", "Composite finishing diamonds / carbides"] },
      { group: "Materials", items: ["35% phosphoric acid etch", "Scotchbond Universal adhesive", "Gluma desensitizer", "Consepsis (2% chlorhexidine)", "Vitrebond (RMGI liner) + mixing pad", "Ketac Nano + cavity conditioner (sandwich technique)", "Renamel Nanofill or Microfill in selected shade", "Retraction cords (#0) + Hemodent in dappen dish", "Microbrushes"] },
      { group: "Finishing", items: ["Shofu polishers", "Jiffy brush", "Finishing strips"] },
      { group: "Chairside disposables", items: ["Anesthetic, needle, topical 20% benzocaine", "Cotton rolls"] },
    ],
    timers: [
      { id: "cord", label: "Cord dwell (Hemodent)", seconds: 120 },
      { id: "consepsis", label: "Consepsis scrub", seconds: 10 },
      { id: "vitrebond", label: "RMGI liner cure", seconds: 20 },
      { id: "cond", label: "Cavity conditioner (sandwich)", seconds: 15 },
      { id: "cond-cure", label: "Cure conditioner", seconds: 10 },
      { id: "rmgi-cure", label: "Cure Ketac Nano", seconds: 20 },
      { id: "etch", label: "Enamel etch", seconds: 15, note: "Selective etch: enamel only, 15 s" },
      { id: "gluma", label: "Gluma scrub", seconds: 45 },
      { id: "gluma-wait", label: "Gluma dwell", seconds: 15 },
      { id: "bond", label: "Universal adhesive scrub", seconds: 20 },
      { id: "airthin", label: "Air-thin adhesive", seconds: 5 },
      { id: "cure-bond", label: "Cure adhesive", seconds: 10 },
      { id: "cure-inc", label: "Cure increment", seconds: 20, note: "20–40 s depending on increment size" },
      { id: "cure-final", label: "Final cure", seconds: 60 },
    ],
    steps: [
      { id: "v1", title: "Pre-op verification", body: ["Review medical history, medications, allergies and vitals.", "Classify the lesion: carious vs non-carious (abrasion, erosion, abfraction). Address the cause (brushing technique, diet, parafunction)."], checkpoint: "Start check: confirm tooth, lesion type, margin location and planned isolation/retraction before anesthesia." },
      { id: "v2", title: "Local anesthesia", body: ["Infiltration at the tooth; add a block for mandibular molars."] },
      { id: "v3", title: "Shade selection", body: ["Select shade while hydrated. Cervical areas are usually more chromatic than the incisal third."] },
      { id: "v4", title: "Retraction & isolation", body: ["Pack a #0 retraction cord soaked in Hemodent (from a dappen dish) if the gingival margin is at or below the gingiva.", "Isodry or cotton rolls; a #212 clamp is an option for deep cervical margins."], timers: ["cord"] },
      { id: "v5", title: "Preparation", body: [
          "Carious: remove caries; slow-speed round bur for dentin (infected dentin wet, cheesy, clumpy; sound dentin dry, chalky, dusty).",
          "Non-carious: no excavation needed; roughen sclerotic dentin surface with a diamond bur.",
          "Bevel all enamel margins.",
          "If the gingival margin is in cementum or dentin: place a retentive groove gingivally and 2 retentive coves at the incisal point angles (¼ round bur).",
          "Removing an old composite: dry thoroughly or scratch with an explorer.",
        ],
        ebd: "With a well-applied universal adhesive and roughened sclerotic dentin, mechanical retention is optional in NCCLs; retention grooves remain a reasonable adjunct when margins are entirely in dentin/cementum.",
        checkpoint: "Preparation review: margin location, enamel bevel, retention features where the gingival margin is in dentin/cementum." },
      { id: "v6", title: "Disinfect", body: ["Consepsis scrub 10 s, rinse 5 s, gently air-dry leaving dentin moist."], timers: ["consepsis"] },
      { id: "v7", title: "Liner or RMGI sandwich (if indicated)", body: [
          "RMGI liner (Vitrebond): 0.5 mm on the deepest area, light-cure 20 s.",
          "Sandwich technique (high caries risk, gingival margin in dentin/cementum): do not etch or bond first.",
          "Cavity conditioner on a microbrush, 15 s → lightly air-dry without water rinse → light-cure 10 s.",
          "Ketac Nano (RMGI) as the bottom layer of the sandwich, like a base under the composite. Light-cure 20 s.",
          "Then etch, bond and place composite as normal.",
        ],
        ebd: "Open-sandwich RMGI at dentin/cementum margins adds fluoride release and a lower-shrinkage gingival seal in high-caries-risk patients.",
        timers: ["vitrebond", "cond", "cond-cure", "rmgi-cure"] },
      { id: "v8", title: "Selective etch · desensitize · bond", body: [
          "Etch enamel margins with 35% phosphoric acid, 15 s. Rinse 5 s. Dentin moist, glossy, no pooling.",
          "Gluma (optional, useful for sensitive NCCLs): scrub 45 s, dwell 15 s, air-dry, rinse, blot-dry. Sequence: etch → Gluma → bond.",
          "Scotchbond Universal: scrub 20 s, air-thin 5 s, light-cure 10 s.",
          "Contaminated: re-etch 5 s, rinse, dry, re-bond, cure.",
        ],
        ebd: "Mild self-etch mode on dentin gives the best clinical retention in NCCLs; restrict phosphoric acid to enamel.",
        timers: ["etch", "gluma", "gluma-wait", "bond", "airthin", "cure-bond"] },
      { id: "v9", title: "Place composite", body: [
          "Renamel Nanofill or Microfill (by esthetics) in increments; start at the gingival margin.",
          "Cure each increment 20–40 s; final cure 60 s.",
        ],
        timers: ["cure-inc", "cure-final"] },
      { id: "v10", title: "Finish & polish", body: ["Remove the cord.", "Composite finishing burs, then Shofu and Jiffy brush. Confirm a smooth gingival margin with an explorer."], checkpoint: "Final restoration review: gingival margin adaptation, contour, shade. Then complete the note and codes." },
    ],
    matrices: [
      { title: "Class V parameters", columns: ["Parameter", "Specification", "Source"], rows: [
          ["Enamel margins", "Beveled", "Manual"],
          ["Retention (margin in dentin/cementum)", "Gingival groove + 2 incisal coves", "Manual"],
          ["Retraction", "#0 cord soaked in Hemodent", "Manual"],
          ["Cavity conditioner (sandwich)", "15 s → air-dry, no water → cure 10 s", "Manual"],
          ["Ketac Nano layer", "Cure 20 s", "Manual"],
          ["Retentive groove depth", "~0.25 mm (half a ¼ round bur head)", "Std ref"],
        ] },
    ],
    postOp: ["Numbness lasts 2–4 h.", "Gum may be tender from the retraction cord for 1–2 days.", "Brush with a soft brush and gentle technique; avoid horizontal scrubbing.", "Call if sensitivity lingers."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "57" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "tooth", label: "Tooth #", type: "text", value: "5" },
        { id: "surfaces", label: "Surfaces", type: "text", value: "B" },
        { id: "cc", label: "Chief complaint", type: "text", value: "sensitive near the gumline" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "128/82, 74 bpm" },
        { id: "dx", label: "Diagnosis", type: "text", value: "non-carious cervical lesion (abrasion/abfraction) with dentin hypersensitivity" },
        { id: "anesthetic", label: "Anesthetic", type: "select", options: ANESTHETICS, value: ANESTHETICS[0] },
        { id: "carps", label: "Carpules", type: "text", value: "0.5" },
        { id: "block", label: "Injection", type: "text", value: "buccal infiltration above #5" },
        { id: "prep", label: "Preparation", type: "select", options: ["Non-carious lesion; no excavation required. Sclerotic dentin roughened with diamond bur; enamel margins beveled.", "Caries excavated to hard dentin; enamel margins beveled.", "Removed existing failing restoration; recurrent caries excavated; enamel margins beveled."], value: "Non-carious lesion; no excavation required. Sclerotic dentin roughened with diamond bur; enamel margins beveled." },
        { id: "retention", label: "Retention", type: "select", options: ["Gingival retentive groove and M, D incisal retentive coves placed.", "No mechanical retention placed (margins in enamel or adhesive retention only)."], value: "Gingival retentive groove and M, D incisal retentive coves placed." },
        { id: "base", label: "Liner / sandwich", type: "select", options: ["No liner indicated.", "RMGI liner (Vitrebond) 0.5 mm in deepest area, cured 20 s.", "Sandwich technique: cavity conditioner 15 s, air-dried, cured 10 s; Ketac Nano RMGI placed as base, cured 20 s."], value: "No liner indicated." },
        { id: "material", label: "Composite", type: "select", options: ["Renamel Nanofill", "Renamel Microfill"], value: "Renamel Microfill" },
        { id: "shade", label: "Shade", type: "text", value: "A3" },
        { id: "nv", label: "Next visit", type: "text", value: "#12 B composite" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for #{{tooth}}-{{surfaces}} composite restoration. CC: "{{cc}}".
Medical history reviewed: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O:
#{{tooth}}-{{surfaces}}: {{dx}}.

A:
#{{tooth}}-{{surfaces}}: {{dx}}.

P:
Topical 20% benzocaine applied. {{carps}} carpule(s) {{anesthetic}} administered as {{block}}; aspiration negative.
Isodry placed. #0 retraction cord soaked in Hemodent placed. {{prep}} {{retention}}
Disinfected with 2% chlorhexidine 10 s, rinsed. {{base}}
Selective enamel etch with 35% phosphoric acid 15 s, rinsed, dentin left moist. Gluma desensitizer applied. Scotchbond Universal scrubbed 20 s, air-thinned 5 s, light-cured 10 s.
{{material}} composite, shade {{shade}}, placed in increments, each cured 20–40 s; final cure 60 s. Cord removed.
Finished with finishing burs; polished with Shofu and Jiffy brush. Gingival margin smooth to explorer.
Post-op instructions given: numbness, sensitivity, injection-site and gingival soreness, gentle brushing technique. Patient tolerated procedure well.

NV: {{nv}}`,
    },
  },

  /* ================================================== COMPOSITE VENEERS */
  {
    id: "composite-veneers",
    kind: "procedure",
    title: "Direct Composite Veneers",
    category: "operative",
    duration: "~60 min per tooth",
    summary:
      "Chairside resin veneers for shape, shade or diastema correction: enamel-conserving 0.3–0.5 mm facial reduction with a flame diamond, interproximal finish hidden in the contact, feathered/beveled gingival finish, enamel etch and single-increment microfill.",
    cdt: [
      { code: "D2960", label: "Labial veneer (resin laminate), direct" },
    ],
    tags: ["veneer", "composite veneer", "diastema closure", "peg lateral", "flame diamond", "depth guide", "0.3 mm", "0.5 mm", "enamel etch", "microfill", "Renamel", "Scotchbond Universal", "mylar strip", "retraction cord", "Hemodent", "Cosmedent discs", "Flexibuff", "Enamelize", "protrusion"],
    tray: [
      { group: "Instrument kits", items: ["Composite kit", "Prophy handpiece + prophy angle", "Composite gun", "LED curing light (verify output)", "Vita shade guide", "Cord packer"] },
      { group: "Rotary", items: ["High-speed & slow-speed handpieces", "Depth-guide diamond (0.3/0.5 mm)", "Flame-shaped diamond (facial, interproximal, gingival)", "Composite finishing diamonds / carbides"] },
      { group: "Materials", items: ["Fluoride-free pumice", "35% phosphoric acid etch", "Scotchbond Universal adhesive", "Renamel Microfill in selected shade(s)", "Retraction cords + Hemodent in dappen dish", "Microbrushes"] },
      { group: "Matrix & finishing", items: ["Clear mylar strips", "Wooden wedges", "Finishing strips", "#12 scalpel blade", "Cosmedent discs (gray, blue, yellow, pink)", "Flexibuff + Enamelize paste", "Shofu polishers, Jiffy brush"] },
      { group: "Chairside disposables", items: ["Anesthetic, needle, topical 20% benzocaine", "Articulating paper", "Floss", "Cheek retractor"] },
    ],
    timers: [
      { id: "etch-enamel", label: "Etch (enamel only)", seconds: 30, note: "30 s when the prep is entirely in enamel" },
      { id: "etch", label: "Etch (enamel + dentin exposed)", seconds: 15, note: "Selective: 15 s on enamel, keep off dentin" },
      { id: "bond", label: "Universal adhesive scrub", seconds: 20 },
      { id: "airthin", label: "Air-thin adhesive", seconds: 5 },
      { id: "cure-bond", label: "Cure adhesive", seconds: 10 },
      { id: "cure-inc", label: "Cure increment", seconds: 20, note: "20–40 s depending on increment size" },
      { id: "cure-final", label: "Final cure", seconds: 60 },
    ],
    steps: [
      { id: "w1", title: "Pre-op verification & records", body: ["Review medical history and vitals.", "Pre-op photographs (retracted, smile, profile). Review the wax-up or mock-up and the patient's agreed outcome."], checkpoint: "Start check: confirm teeth, planned shape/shade outcome and records before anesthesia." },
      { id: "w2", title: "Record pre-op occlusion", body: ["Mark centric, protrusive and lateral contacts on the target and adjacent teeth; sketch them."] },
      { id: "w3", title: "Local anesthesia", body: ["Maxillary anterior: buccal infiltrations ± palatal.", "Minimal-prep or no-prep cases may not need anesthesia beyond cord placement."] },
      { id: "w4", title: "Clean", body: ["Fluoride-free pumice with a prophy angle; rinse thoroughly."] },
      { id: "w5", title: "Shade selection", body: [
          "Shade guide to narrow the options.",
          "Without etching or bonding, place trial amounts of candidate shades on the tooth, cure and evaluate; then flick off.",
          "Check under room light, overhead light and natural light.",
        ] },
      { id: "w6", title: "Retraction", body: ["Place gingival retraction cords soaked in Hemodent as needed."] },
      { id: "w7", title: "Preparation", body: [
          "Tooth may need little or no prep (diastema closure, peg laterals).",
          "Flame-shaped diamond; keep the prep in enamel whenever possible for the strongest bond.",
          "Facial: reduce 0.3–0.5 mm using a depth guide; less gingivally, more incisally.",
          "Interproximal: hide the finish line within the contact (beyond the visible mesiofacial and distofacial line angles). Preserve the contact unless the shape or position of a group of teeth must change, or caries/existing restorations extend into it.",
          "Gingival: feather-edge/beveled finish line; wide facial bevels for a seamless tooth–composite transition.",
        ],
        ebd: "Additive, enamel-preserving preparation (guided by a wax-up or mock-up) gives the most durable bond and keeps future options open.",
        checkpoint: "Preparation review: reduction depth (0.3–0.5 mm), finish lines hidden in contacts, gingival bevel, enamel preserved." },
      { id: "w8", title: "Matrix & wedge", body: ["Clear mylar matrix + wooden wedge."] },
      { id: "w9", title: "Etch & bond", body: [
          "All-enamel prep: etch 30 s with 35% phosphoric acid. If dentin is exposed: selective enamel etch 15 s, keep acid off dentin. Rinse and dry; dentin moist, glossy, no pooling.",
          "Scotchbond Universal: vigorous scrub 20 s, air-thin 5 s, light-cure 10 s.",
          "Contaminated: re-etch 5 s, rinse, dry, re-bond, cure.",
        ],
        timers: ["etch-enamel", "etch", "bond", "airthin", "cure-bond"] },
      { id: "w10", title: "Place composite", body: [
          "Renamel Microfill; veneers are usually thin enough that one increment works and looks best (no junction lines).",
          "If thicker, increments cured 20–40 s each. Final cure 60 s.",
        ],
        timers: ["cure-inc", "cure-final"] },
      { id: "w11", title: "Check contact & occlusion", body: ["Remove cords.", "Floss each contact.", "Articulating paper in centric and especially protrusion; heavy protrusive contact fractures veneers."] },
      { id: "w12", title: "Finish & polish", body: [
          "Finishing burs for outline and texture; #12 blade and strips for proximal flash.",
          "Discs: gray → blue → yellow → pink, then Flexibuff with Enamelize paste. Shofu and Jiffy brush as needed.",
          "Repeat the sequence for each tooth. Post-op photographs.",
        ],
        checkpoint: "Final restoration review: symmetry, contacts, gingival margins, shade and value, protrusive clearance. Then complete the note and codes." },
    ],
    matrices: [
      { title: "Composite veneer preparation", columns: ["Parameter", "Specification", "Source"], rows: [
          ["Bur", "Flame-shaped diamond", "Manual"],
          ["Facial reduction", "0.3–0.5 mm with depth guide; less gingival, more incisal", "Manual"],
          ["Interproximal finish", "Hidden within the contact; contact preserved when possible", "Manual"],
          ["Gingival finish", "Feather edge / beveled; wide facial bevel", "Manual"],
          ["Etch", "30 s enamel-only; 15 s selective if dentin exposed", "Manual / EBD"],
          ["Placement", "Single increment where thickness allows; final cure 60 s", "Manual"],
        ] },
    ],
    postOp: ["No incising into hard foods (apples, hard sandwiches/bread); cut food into pieces.", "No habits: chewing ice, nail biting, toothpicks.", "Mouthguard required for sports.", "Night guard required if you grind your teeth.", "Composite can stain: limit coffee, tea, red wine and tobacco; routine polishing at recalls."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "31" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "teeth", label: "Teeth", type: "text", value: "#8, #9" },
        { id: "cc", label: "Chief complaint", type: "text", value: "I don't like the gap between my front teeth" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "114/72, 68 bpm" },
        { id: "dx", label: "Diagnosis / indication", type: "text", value: "midline diastema, esthetic concern" },
        { id: "anesthetic", label: "Anesthetic", type: "select", options: ANESTHETICS, value: ANESTHETICS[0] },
        { id: "carps", label: "Carpules", type: "text", value: "1" },
        { id: "block", label: "Injection", type: "text", value: "buccal and palatal infiltrations in anterior maxilla" },
        { id: "prep", label: "Preparation", type: "select", options: ["Minimal preparation within enamel (0.3–0.5 mm facial) with wide facial bevel.", "No preparation (additive only); enamel roughened.", "Preparation extended into dentin in areas of existing restorations."], value: "Minimal preparation within enamel (0.3–0.5 mm facial) with wide facial bevel." },
        { id: "etch", label: "Etch", type: "select", options: ["Enamel etched 30 s with 35% phosphoric acid.", "Selective enamel etch 15 s with 35% phosphoric acid; dentin left moist."], value: "Enamel etched 30 s with 35% phosphoric acid." },
        { id: "shade", label: "Shade", type: "text", value: "A1" },
        { id: "nv", label: "Next visit", type: "text", value: "Occlusal guard records" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for {{teeth}} direct composite veneers. CC: "{{cc}}".
Medical history reviewed: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O:
{{teeth}}: {{dx}}. Pre-op photographs taken. Pre-op centric, protrusive and lateral contacts recorded.

A:
{{teeth}}: {{dx}}; indicated for direct resin veneers per approved treatment plan.

P:
Topical 20% benzocaine applied. {{carps}} carpule(s) {{anesthetic}} administered as {{block}}; aspiration negative.
Teeth cleaned with fluoride-free pumice. Shade {{shade}} selected with cured trial placement. Retraction cords soaked in Hemodent placed.
{{prep}} Interproximal finish lines placed within contacts. Clear mylar strip and wedge placed.
{{etch}} Rinsed and dried. Scotchbond Universal scrubbed 20 s, air-thinned 5 s, light-cured 10 s.
Renamel Microfill composite, shade {{shade}}, placed and sculpted; final cure 60 s. Repeated for each tooth. Cords removed.
Contacts verified with floss. Centric and protrusive contacts evaluated and adjusted. Finished with finishing burs and strips; polished with Cosmedent disc sequence, Flexibuff with Enamelize, Shofu and Jiffy brush. Post-op photographs taken.
Post-op instructions given: numbness, sensitivity, no incising hard foods, habits, mouthguard for sports, night guard if bruxing. Patient satisfied with result.

NV: {{nv}}`,
    },
  },

  /* ============================================ RMGI (KETAC NANO + SANDWICH) */
  {
    id: "rmgi-ketac-nano",
    kind: "procedure",
    title: "RMGI Restoration (Ketac Nano) & Sandwich Technique",
    category: "operative",
    duration: "~45–60 min",
    summary:
      "Light-cured resin-modified glass ionomer for non-stress-bearing areas (Class V, root caries, high-caries-risk patients), used as a full restoration or as the dentin/cementum base under composite (sandwich). No etch or bond: cavity conditioner, capsule activation, ≤2 mm increments cured 20 s.",
    cdt: [
      { code: "D2330", label: "Resin-based composite, 1 surface, anterior (glass ionomers are reported with resin codes)" },
      { code: "D2391", label: "Resin-based composite, 1 surface, posterior (glass ionomers are reported with resin codes)" },
    ],
    tags: ["RMGI", "resin-modified glass ionomer", "Ketac Nano", "cavity conditioner", "primer", "sandwich technique", "Class V", "root caries", "fluoride release", "high caries risk", "light cure", "capsule", "working time"],
    tray: [
      { group: "Instrument kits", items: ["Composite kit", "Ketac Nano capsule gun", "Cord packer", "LED curing light (verify output)", "Vita shade guide", "Isodry mouthpiece (size to patient)"] },
      { group: "Rotary", items: ["High-speed & slow-speed handpieces", "Restorative burs: #330, #2 round, ¼ round (retention), fine diamond", "Composite finishing diamonds / carbides"] },
      { group: "Materials", items: ["Ketac Nano capsules (selected shade)", "GI cavity conditioner / primer + dappen dish", "Consepsis (2% chlorhexidine)", "Vitrebond (RMGI liner) + mixing pad", "Retraction cords (#0) + Hemodent in dappen dish", "For sandwich: 35% phosphoric acid, Scotchbond Universal, composite", "Microbrushes"] },
      { group: "Finishing", items: ["Shofu polishers", "Jiffy brush"] },
      { group: "Chairside disposables", items: ["Anesthetic, needle, topical 20% benzocaine", "Cotton rolls"] },
    ],
    timers: [
      { id: "cord", label: "Cord dwell (Hemodent)", seconds: 120 },
      { id: "consepsis", label: "Consepsis scrub", seconds: 10 },
      { id: "cond", label: "Cavity conditioner scrub", seconds: 15 },
      { id: "cond-dry", label: "Air-dry conditioner (no rinse)", seconds: 10 },
      { id: "cond-cure", label: "Cure conditioner", seconds: 10 },
      { id: "extrude", label: "Extrude after activation", seconds: 90, note: "Must be extruded within 90 s of activation" },
      { id: "working", label: "Working time", seconds: 150, note: "Begins to set at 2 min 30 s" },
      { id: "sticky-wait", label: "Wait if too sticky", seconds: 60 },
      { id: "rmgi-cure", label: "Cure each increment", seconds: 20 },
    ],
    steps: [
      { id: "r1", title: "Pre-op verification & case selection", body: [
          "Indications: Class V and root-surface lesions, high-caries-risk or xerostomic patients, margins in cementum/dentin, limited isolation, non-stress-bearing areas.",
          "Not for occlusal load-bearing restorations or incisal edges.",
        ],
        checkpoint: "Start check: confirm tooth, lesion, material choice (full RMGI vs sandwich) and isolation plan before anesthesia." },
      { id: "r2", title: "Anesthesia, shade & retraction", body: ["Infiltration at the tooth.", "Select the Ketac Nano shade.", "#0 cord soaked in Hemodent if the margin is subgingival."], timers: ["cord"] },
      { id: "r3", title: "Preparation", body: [
          "Remove caries; roughen sclerotic dentin in NCCLs with a diamond.",
          "Margins may be butt-joint; RMGI does not need an enamel bevel. Retention groove/coves if the margin is entirely in dentin/cementum.",
        ],
        checkpoint: "Preparation review: caries removal, margin form, retention where indicated." },
      { id: "r4", title: "Disinfect & liner", body: ["Consepsis scrub 10 s, rinse 5 s, gently dry leaving dentin moist.", "Vitrebond 0.5 mm in the deepest area only if needed, cure 20 s."], timers: ["consepsis"] },
      { id: "r5", title: "Apply cavity conditioner", body: [
          "Do not etch or bond.",
          "Place a drop of conditioner in a dappen dish. Microbrush into the prep for 15 s.",
          "Lightly air-dry for 10 s without water (do not rinse).",
          "Light-cure 10 s.",
        ],
        timers: ["cond", "cond-dry", "cond-cure"] },
      { id: "r6", title: "Activate & load capsule", body: [
          "Activate by fully extending the nozzle; nozzle and capsule must form a straight 180° line.",
          "Load into the Ketac Nano gun. Pump slowly until material appears; discard the first increment.",
        ] },
      { id: "r7", title: "Extrude & shape", body: [
          "Extrude directly into the cavity within 90 s of activation; working time is 2 min 30 s. Multiple increments may need multiple capsules.",
          "Increments smaller than 2 mm.",
          "Contour with hand instruments; dip instruments in conditioner/primer to prevent sticking. If too sticky or wet, wait 60 s, then shape.",
        ],
        timers: ["extrude", "working", "sticky-wait"] },
      { id: "r8", title: "Cure", body: ["Light-cure each increment 20 s.", "Finish immediately after curing; no waiting needed."], timers: ["rmgi-cure"] },
      { id: "r9", title: "Sandwich variant (under composite)", body: [
          "Follow r5–r8 to place Ketac Nano as the bottom layer (like a base) covering the dentin/cementum gingival wall.",
          "Then selective enamel etch (15 s), Scotchbond Universal (scrub 20 s, air-thin 5 s, cure 10 s), and composite in increments (20–40 s each, 60 s final).",
        ] },
      { id: "r10", title: "Finish & polish", body: ["Remove cord.", "Composite finishing burs, then Shofu and Jiffy brush."], checkpoint: "Final restoration review: margin adaptation, contour, surface finish. Then complete the note and codes." },
    ],
    matrices: [
      { title: "Ketac Nano handling", columns: ["Parameter", "Specification"], rows: [
          ["Etch / bond", "None (conditioner only)"],
          ["Conditioner", "15 s scrub → air-dry 10 s, no rinse → cure 10 s"],
          ["Activation", "Nozzle fully extended, straight 180°"],
          ["Extrusion window", "Within 90 s of activation"],
          ["Working time", "2 min 30 s"],
          ["Increment", "< 2 mm"],
          ["Cure", "20 s per increment; finish immediately"],
        ] },
    ],
    postOp: ["Numbness lasts 2–4 h.", "This filling releases fluoride; keep using fluoride toothpaste.", "Brush gently with a soft brush at the gumline.", "Call if sensitivity lingers."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "68" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "male" },
        { id: "tooth", label: "Tooth #", type: "text", value: "6" },
        { id: "surfaces", label: "Surfaces", type: "text", value: "F" },
        { id: "cc", label: "Chief complaint", type: "text", value: "none, routine restorative care" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review; xerostomia from medications" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "132/84, 76 bpm" },
        { id: "dx", label: "Diagnosis", type: "text", value: "root-surface caries, cervical, high caries risk" },
        { id: "anesthetic", label: "Anesthetic", type: "select", options: ANESTHETICS, value: ANESTHETICS[0] },
        { id: "carps", label: "Carpules", type: "text", value: "0.5" },
        { id: "block", label: "Injection", type: "text", value: "buccal infiltration above #6" },
        { id: "technique", label: "Technique", type: "select", options: ["Full RMGI restoration.", "Sandwich: Ketac Nano base under composite."], value: "Full RMGI restoration." },
        { id: "shade", label: "Shade", type: "text", value: "A3" },
        { id: "nv", label: "Next visit", type: "text", value: "#11 F RMGI; 5000 ppm fluoride toothpaste reviewed" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for #{{tooth}}-{{surfaces}} RMGI restoration. CC: "{{cc}}".
Medical history reviewed: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O:
#{{tooth}}-{{surfaces}}: {{dx}}.

A:
#{{tooth}}-{{surfaces}}: {{dx}}. Technique: {{technique}}

P:
Topical 20% benzocaine applied. {{carps}} carpule(s) {{anesthetic}} administered as {{block}}; aspiration negative.
Isodry placed. #0 retraction cord soaked in Hemodent placed. Caries excavated to hard dentin; preparation refined to final form.
Disinfected with 2% chlorhexidine 10 s, rinsed, dentin left moist.
GI cavity conditioner applied 15 s, air-dried 10 s without rinsing, light-cured 10 s.
Ketac Nano RMGI, shade {{shade}}, activated and extruded within 90 s, placed in increments under 2 mm, each light-cured 20 s.
Cord removed. Finished with finishing burs; polished with Shofu and Jiffy brush.
Post-op instructions given: numbness, sensitivity, injection-site soreness, fluoride toothpaste. Patient tolerated procedure well.

NV: {{nv}}`,
    },
  },

  /* ================================================== GLASS IONOMER (FUJI IX) */
  {
    id: "gi-fuji-ix",
    kind: "procedure",
    title: "Glass Ionomer Restoration (Fuji IX)",
    category: "operative",
    duration: "~30–45 min",
    summary:
      "Packable, high-viscosity, self-curing conventional glass ionomer for primary teeth, interim therapeutic restorations (ITR/ART) and high-caries-risk or poorly isolated sites. Conditioner 10 s with rinse, 10 s trituration, 2 min working time, 6 min set before finishing. No light cure.",
    cdt: [
      { code: "D2941", label: "Interim therapeutic restoration, primary dentition" },
      { code: "D2391", label: "Resin-based composite, 1 surface, posterior (definitive GI; reported with resin codes)" },
      { code: "D2330", label: "Resin-based composite, 1 surface, anterior (definitive GI; reported with resin codes)" },
    ],
    tags: ["glass ionomer", "GI", "Fuji IX", "GC", "high-viscosity", "packable", "self-cure", "auto-cure", "ITR", "ART", "interim therapeutic restoration", "primary teeth", "pediatric", "cavity conditioner", "polyacrylic acid", "G-Coat Plus", "fluoride release"],
    tray: [
      { group: "Instrument kits", items: ["Composite or pediatric restorative kit", "Fuji IX capsule applier", "Amalgamator", "Spoon excavators (ART)"] },
      { group: "Rotary", items: ["High-speed & slow-speed handpieces", "#330 and #2/#4 round (if hand instruments are not used)", "Composite finishing burs"] },
      { group: "Materials", items: ["Fuji IX capsules", "GI cavity conditioner (polyacrylic acid)", "Surface protectant (G-Coat Plus, varnish or unfilled resin)", "Cotton-tipped applicators", "Petroleum jelly (optional)"] },
      { group: "Chairside disposables", items: ["Cotton rolls / Isodry", "Articulating paper", "Floss"] },
    ],
    timers: [
      { id: "cond", label: "Cavity conditioner", seconds: 10 },
      { id: "triturate", label: "Triturate capsule", seconds: 10 },
      { id: "working", label: "Working time", seconds: 120 },
      { id: "set", label: "Set before finishing", seconds: 360, note: "6 min from start of mixing" },
      { id: "coat-cure", label: "Cure surface coat", seconds: 20 },
    ],
    steps: [
      { id: "g1", title: "Case selection", body: [
          "Primary teeth, interim therapeutic restorations (ITR/ART) in young or pre-cooperative children, high-caries-risk patients, root caries, and sites where moisture control is limited.",
          "Not for load-bearing permanent restorations long-term: flexural strength is low.",
        ],
        checkpoint: "Start check: confirm tooth, interim vs definitive intent, and isolation plan." },
      { id: "g2", title: "Isolation & caries removal", body: [
          "Cotton rolls or Isodry; local anesthesia only if needed.",
          "Remove soft caries at the periphery; hand excavation is acceptable (ART).",
        ],
        ebd: "ITR/ART with high-viscosity GI arrests lesions and reduces bacterial load in young or pre-cooperative children and high-risk patients (AAPD).",
        checkpoint: "Preparation review: periphery caries-free, cavity accessible for condensation." },
      { id: "g3", title: "Condition", body: [
          "Do not etch or bond.",
          "Apply cavity conditioner 10 s → rinse → lightly air-dry; do not desiccate (surface stays moist).",
          "No light cure needed.",
        ],
        timers: ["cond"] },
      { id: "g4", title: "Triturate & load", body: ["Depress the capsule plunger.", "Triturate 10 s in the amalgamator.", "Load the capsule into the Fuji IX applier."], timers: ["triturate"] },
      { id: "g5", title: "Apply within 2 min", body: ["Working time 2 min.", "Extrude directly into the cavity, slightly overfilling."], timers: ["working"] },
      { id: "g6", title: "Shape & set", body: [
          "Contour with hand instruments, or press-finger / moist cotton-tipped applicator to adapt and shape.",
          "Self-cures; no light cure required.",
          "Wait 6 min from the start of mixing before finishing with burs.",
        ],
        timers: ["set"] },
      { id: "g7", title: "Protect & check", body: [
          "Coat with G-Coat Plus (or varnish/unfilled resin) and light-cure the coat 20 s to protect from early moisture and desiccation.",
          "Check occlusion; relieve high spots.",
        ],
        ebd: "A surface protectant during early maturation improves GI surface hardness and wear resistance.",
        timers: ["coat-cure"],
        checkpoint: "Final review: adaptation, occlusion, surface protected. Then complete the note and codes." },
    ],
    matrices: [
      { title: "Fuji IX handling", columns: ["Parameter", "Specification"], rows: [
          ["Etch / bond", "None"],
          ["Conditioner", "10 s → rinse → moist, not desiccated"],
          ["Trituration", "10 s"],
          ["Working time", "2 min"],
          ["Set before finishing", "6 min from start of mix"],
          ["Light cure", "Not required (self-cure)"],
        ],
        note: "Fuji IX is a conventional (not resin-modified) glass ionomer." },
    ],
    postOp: ["No eating for 1 h.", "This filling releases fluoride; brush twice daily with fluoride toothpaste.", "Interim restorations need recall and replacement as planned."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "4" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "guardian", label: "Guardian", type: "text", value: "mother" },
        { id: "tooth", label: "Tooth #", type: "text", value: "A" },
        { id: "surfaces", label: "Surfaces", type: "text", value: "O" },
        { id: "mhx", label: "Medical history", type: "text", value: "reviewed with guardian; no changes" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "dx", label: "Diagnosis", type: "text", value: "cavitated caries into dentin, high caries risk" },
        { id: "intent", label: "Intent", type: "select", options: ["Interim therapeutic restoration (ITR).", "Definitive glass ionomer restoration."], value: "Interim therapeutic restoration (ITR)." },
        { id: "anes", label: "Anesthesia", type: "select", options: ["No local anesthesia required.", "Topical 20% benzocaine; local anesthetic administered per weight-based maximum."], value: "No local anesthesia required." },
        { id: "frankl", label: "Behavior (Frankl)", type: "select", options: ["F1 (definitely negative)", "F2 (negative)", "F3 (positive)", "F4 (definitely positive)"], value: "F3 (positive)" },
        { id: "nv", label: "Next visit", type: "text", value: "3-month recall; re-evaluate ITR" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents with {{guardian}} for #{{tooth}}-{{surfaces}} glass ionomer restoration.
Medical history: {{mhx}}. Allergies: {{allergies}}. Guardian consent obtained.

O:
#{{tooth}}-{{surfaces}}: {{dx}}.

A:
#{{tooth}}-{{surfaces}}: {{dx}}. {{intent}}

P:
{{anes}} Isolation with cotton rolls. Soft caries removed at the periphery.
GI cavity conditioner applied 10 s, rinsed, lightly dried (not desiccated).
Fuji IX capsule triturated 10 s and placed within 2 min working time; adapted and contoured. Allowed to self-cure 6 min from start of mix, then finished.
Surface protectant applied and light-cured 20 s. Occlusion checked and adjusted.
Post-op instructions given to guardian: no eating for 1 h, fluoride toothpaste, recall for ITR evaluation.
Behavior: {{frankl}}.

NV: {{nv}}`,
    },
  },

  /* ============================================================= SEALANTS */
  {
    id: "pit-fissure-sealants",
    kind: "procedure",
    title: "Pit & Fissure Sealants",
    category: "operative",
    duration: "~10 min per quadrant",
    summary:
      "Resin-based sealant on caries-free or non-cavitated enamel-lesion pits and fissures: dry-field isolation (Isodry), fluoride-free pumice, 30 s enamel etch, optional universal adhesive, UltraSeal XT Plus cured 20 s.",
    cdt: [
      { code: "D1351", label: "Sealant, per tooth" },
    ],
    tags: ["sealant", "pit and fissure", "UltraSeal XT Plus", "Ultradent", "Isodry", "pumice", "fluoride-free", "etch 30 s", "Scotchbond Universal", "non-cavitated", "incipient", "prevention", "pediatric", "molars"],
    tray: [
      { group: "Instrument kits", items: ["Composite kit (or pediatric restorative kit)", "Prophy handpiece + prophy angle", "LED curing light (verify output)", "Isodry mouthpiece (size to patient)"] },
      { group: "Rotary", items: ["Composite finishing burs (occlusal adjustment)"] },
      { group: "Materials", items: ["Fluoride-free prophy pumice", "35% phosphoric acid etch", "Scotchbond Universal adhesive", "Ultradent UltraSeal XT Plus sealant + tips", "Microbrushes / explorer"] },
      { group: "Chairside disposables", items: ["Articulating paper", "Cotton rolls, dry angles"] },
    ],
    timers: [
      { id: "etch", label: "Enamel etch", seconds: 30 },
      { id: "rinse", label: "Rinse", seconds: 15 },
      { id: "bond", label: "Adhesive scrub (optional)", seconds: 20 },
      { id: "airthin", label: "Air-thin adhesive", seconds: 5 },
      { id: "cure-bond", label: "Cure adhesive", seconds: 10 },
      { id: "cure-sealant", label: "Cure sealant", seconds: 20 },
    ],
    steps: [
      { id: "q1", title: "Case selection", body: [
          "Seal caries-free pits and fissures to prevent caries.",
          "Seal non-cavitated carious lesions limited to enamel to arrest them.",
          "Pediatric: review age, medical and dental history, behavior and isolation plan before seating; confirm changes with the guardian; nitrous oxide if planned.",
        ],
        ebd: "ADA/AAPD guideline: resin-based sealants on permanent molars in children and adolescents reduce caries incidence, and sealing non-cavitated lesions arrests progression. Use glass-ionomer sealant when a dry field is not achievable.",
        checkpoint: "Start check: confirm teeth, surfaces are caries-free or non-cavitated, and isolation plan." },
      { id: "q2", title: "Isolate", body: ["Totally dry field required.", "Isodry is ideal: avoids anesthesia for a rubber dam clamp."] },
      { id: "q3", title: "Clean", body: ["Fluoride-free pumice with a prophy cup.", "Rinse and dry thoroughly."] },
      { id: "q4", title: "Etch", body: ["Etch enamel with 35% phosphoric acid, 30 s.", "Rinse 15 s. Dry lightly; do not desiccate. Etched enamel looks frosty/chalky.", "If contaminated with saliva: re-etch 5 s, rinse, dry."], timers: ["etch", "rinse"] },
      { id: "q5", title: "Bond (optional)", body: ["Scotchbond Universal: vigorous scrub 20 s, air-thin 5 s, light-cure 10 s.", "Recommended when moisture control is marginal."], timers: ["bond", "airthin", "cure-bond"] },
      { id: "q6", title: "Apply sealant", body: [
          "UltraSeal XT Plus: manipulate with the sealant brush tip, microbrush or explorer into pits and fissures (buccal pit of mandibular molars, lingual groove of maxillary molars).",
          "Material is thick; apply a thin layer to avoid occlusal interference and work out bubbles.",
          "Light-cure 20 s.",
        ],
        timers: ["cure-sealant"] },
      { id: "q7", title: "Check excess & occlusion", body: [
          "Explorer around all margins; most common excess is distal of mandibular molars, near or under the gingiva.",
          "Articulating paper; adjust any high spots with a finishing bur.",
          "Explorer tug test: sealant should not lift.",
        ],
        checkpoint: "Final review: full coverage of pits and fissures, retention, no excess, no occlusal interference. Then complete the note and codes." },
    ],
    matrices: [
      { title: "Sealant protocol", columns: ["Parameter", "Specification"], rows: [
          ["Pumice", "Fluoride-free"],
          ["Etch", "35% phosphoric acid, 30 s"],
          ["Rinse", "15 s; dry, do not desiccate"],
          ["Adhesive (optional)", "Scrub 20 s → air-thin 5 s → cure 10 s"],
          ["Sealant cure", "20 s"],
        ] },
    ],
    postOp: ["Eat and drink normally right away.", "The bite may feel slightly different for a day.", "Sealants are checked at every recall and repaired if worn or lost."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "9" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "accomp", label: "Accompanied by", type: "text", value: "mother" },
        { id: "teeth", label: "Teeth", type: "text", value: "#3, #14, #19, #30" },
        { id: "mhx", label: "Medical history", type: "text", value: "reviewed; no changes" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "dx", label: "Indication", type: "select", options: ["caries-free pits and fissures, moderate/high caries risk", "non-cavitated enamel lesions in pits and fissures"], value: "caries-free pits and fissures, moderate/high caries risk" },
        { id: "iso", label: "Isolation", type: "select", options: ["Isodry (size P)", "Isodry (size M)", "cotton rolls and dry angles"], value: "Isodry (size P)" },
        { id: "bond", label: "Adhesive", type: "select", options: ["Scotchbond Universal applied 20 s, air-thinned 5 s, cured 10 s.", "No adhesive used."], value: "Scotchbond Universal applied 20 s, air-thinned 5 s, cured 10 s." },
        { id: "n2o", label: "Nitrous oxide", type: "select", options: ["No nitrous oxide.", "Nitrous oxide/oxygen titrated to effect; 100% oxygen 5 min at completion."], value: "No nitrous oxide." },
        { id: "nv", label: "Next visit", type: "text", value: "6-month recall" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents with {{accomp}} for sealants {{teeth}}.
Medical history: {{mhx}}. Allergies: {{allergies}}.

O:
{{teeth}}: {{dx}}.

A:
{{teeth}}: indicated for pit and fissure sealants.

P:
{{n2o}}
Teeth cleaned with fluoride-free pumice and prophy angle. Isolation: {{iso}}. Etched with 35% phosphoric acid 30 s, rinsed 15 s, gently dried. {{bond}}
Ultradent UltraSeal XT Plus applied to occlusal surfaces, buccal pits of mandibular molars and lingual grooves of maxillary molars; light-cured 20 s. Repeated for {{teeth}}.
Margins checked for excess. Occlusion evaluated with articulating paper; patient not occluding on sealant.

NV: {{nv}}`,
    },
  },

  /* ================================================================== PRR */
  {
    id: "preventive-resin-restoration",
    kind: "procedure",
    title: "Preventive Resin Restoration (PRR)",
    category: "pediatric",
    duration: "~30–45 min",
    summary:
      "Minimal pit-limited preparation (usually 1.0–1.5 mm) removing only carious enamel and dentin, restored with nanofill composite and sealed over the remaining fissure system with UltraSeal XT Plus.",
    cdt: [
      { code: "D2391", label: "Resin-based composite, 1 surface, posterior (lesion into dentin)" },
      { code: "D1352", label: "Preventive resin restoration, moderate/high caries risk, permanent tooth (enamel-only prep)" },
      { code: "D9230", label: "Nitrous oxide / analgesia, anxiolysis (if used)" },
    ],
    tags: ["PRR", "preventive resin restoration", "sealant", "UltraSeal XT Plus", "nanofill", "Renamel", "Scotchbond Universal", "selective etch", "1/4 round", "#330", "pits", "minimal intervention", "Isodry", "slit dam", "nitrous oxide", "pediatric", "Frankl"],
    tray: [
      { group: "Instrument kits", items: ["Pediatric composite kit", "Pediatric rubber dam kit (or Isodry)", "Composite gun", "LED curing light (verify output)", "Nitrous oxide nasal hood", "Pediatric patient goggles"] },
      { group: "Rotary", items: ["High-speed & slow-speed handpieces", "Pediatric burs: ¼ round, #330, #2 round (slow speed)", "Composite finishing burs"] },
      { group: "Materials", items: ["35% phosphoric acid etch", "Scotchbond Universal adhesive", "Renamel Nanofill composite in selected shade", "Ultradent UltraSeal XT Plus sealant", "Microbrushes"] },
      { group: "Chairside disposables", items: ["Anesthetic, short 30G needle, topical", "Rubber dam sheet, floss ligature, wedget", "Isodry (size P)", "Articulating paper", "Shofu polishers"] },
    ],
    timers: [
      { id: "etch", label: "Enamel etch", seconds: 15, note: "Etch the whole occlusal surface (for sealant) + enamel margins" },
      { id: "bond", label: "Universal adhesive scrub", seconds: 20 },
      { id: "airthin", label: "Air-thin adhesive", seconds: 5 },
      { id: "cure-bond", label: "Cure adhesive", seconds: 10 },
      { id: "cure-inc", label: "Cure increment", seconds: 20, note: "20–40 s depending on increment size" },
      { id: "cure-final", label: "Final cure", seconds: 60 },
      { id: "cure-sealant", label: "Cure sealant", seconds: 20, note: "10 s on high-output mode" },
      { id: "o2", label: "100% O₂ after nitrous", seconds: 300 },
    ],
    steps: [
      { id: "pr1", title: "Case presentation (before seating)", body: [
          "Review age, weight, medical history, significant dental history and behavior.",
          "State the restorative plan and sequence (multiple teeth), anesthesia plan (agent, injection, volume against weight-based maximum, nitrous oxide) and isolation plan.",
          "Note treatment plan date and date of last radiographs.",
        ],
        checkpoint: "Pre-treatment clearance: plan, anesthesia dose and isolation approved before the patient is seated." },
      { id: "pr2", title: "Guardian check-in & weigh", body: ["Ask the guardian about changes to health, medications and allergies.", "Explain the visit and expected wait time.", "Weigh the patient; confirm maximum anesthetic dose (dose calculator below)."] },
      { id: "pr3", title: "Nitrous oxide (if planned)", body: ["Start 100% O₂, titrate N₂O to effect.", "Flow sized to the child's minute volume."] },
      { id: "pr4", title: "Local anesthesia", body: ["One carpule is the working limit; recheck against weight before giving more.", "Mandibular: IANB + long buccal. Maxillary: buccal infiltration."] },
      { id: "pr5", title: "Isolate", body: ["Isodry, or rubber dam ligated with floss.", "Speed tip: punch two holes ½ in apart and cut between them for a slit dam."] },
      { id: "pr6", title: "Minimal preparation", body: [
          "Remove caries with high-speed then slow-speed burs (¼ round / #330, then slow-speed round).",
          "Remove only carious enamel and dentin; the smallest possible preparation.",
          "Depth usually 1.0–1.5 mm, pits only. Do not extend into grooves unless they are carious.",
          "Infected dentin is cheesy and clumpy; sound dentin is chalky and dusty.",
        ],
        warn: "Caries larger than expected or near the pulp: stop and re-plan (Class I composite, indirect pulp therapy).",
        checkpoint: "Preparation review: pit-limited, 1.0–1.5 mm, caries removed." },
      { id: "pr7", title: "Etch & bond", body: [
          "Etch the entire occlusal enamel (for the sealant) and enamel margins with 35% phosphoric acid, 15 s; keep acid off dentin. Rinse, dry; dentin moist, glossy, no pooling.",
          "Scotchbond Universal: vigorous scrub 20 s, air-thin 5 s, light-cure 10 s.",
          "Contaminated: re-etch 5 s, rinse, dry, re-bond, cure.",
        ],
        ebd: "Selective enamel etch with universal adhesive in self-etch mode on dentin.",
        timers: ["etch", "bond", "airthin", "cure-bond"] },
      { id: "pr8", title: "Restore & seal", body: [
          "Renamel Nanofill in increments, cure 20–40 s each; often one increment is enough for the small prep. Final cure 60 s.",
          "Place UltraSeal XT Plus over the composite and remaining pits and fissures; cure 20 s (10 s on high).",
        ],
        timers: ["cure-inc", "cure-final", "cure-sealant"] },
      { id: "pr9", title: "Check & polish", body: ["Remove Isodry or dam.", "Articulating paper; adjust.", "Finish and polish."], checkpoint: "Final restoration review: sealed margins, sealant coverage, occlusion. Then complete the note and codes." },
      { id: "pr10", title: "Recovery & release", body: ["100% O₂ for 5 min after nitrous.", "Release to guardian: child is still numb, watch for lip and cheek biting."], timers: ["o2"] },
    ],
    matrices: [
      { title: "PRR parameters", columns: ["Parameter", "Specification"], rows: [
          ["Preparation depth", "Usually 1.0–1.5 mm"],
          ["Extent", "Carious pits only; grooves only if carious"],
          ["Etch", "Entire occlusal enamel, 15 s"],
          ["Composite cure", "20–40 s per increment; final 60 s"],
          ["Sealant cure", "20 s (10 s high output)"],
          ["Coding", "Most payers do not reimburse a restoration and a sealant on the same tooth the same day; report the restoration"],
        ] },
    ],
    widgets: ["pedsDose"],
    postOp: ["Your child is still numb: watch for lip, cheek and tongue biting for 2–3 h.", "Soft foods until numbness wears off.", "Normal brushing tonight with fluoride toothpaste."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "8" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "guardian", label: "Guardian", type: "text", value: "mother" },
        { id: "weight", label: "Weight (kg)", type: "text", value: "26" },
        { id: "tooth", label: "Tooth #", type: "text", value: "30" },
        { id: "surfaces", label: "Surfaces", type: "text", value: "O" },
        { id: "mhx", label: "Medical history", type: "text", value: "reviewed with guardian; no changes" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "dx", label: "Diagnosis", type: "text", value: "pit caries into outer dentin; remaining fissures sound" },
        { id: "n2o", label: "Nitrous oxide", type: "select", options: ["No nitrous oxide.", "Nitrous oxide titrated to 40% N₂O / 60% O₂ at 4 L/min; 100% O₂ 5 min at completion."], value: "No nitrous oxide." },
        { id: "anesthetic", label: "Anesthetic", type: "select", options: ANESTHETICS, value: ANESTHETICS[0] },
        { id: "carps", label: "Carpules", type: "text", value: "1" },
        { id: "block", label: "Injection", type: "text", value: "right IANB and long buccal" },
        { id: "iso", label: "Isolation", type: "select", options: ["Isodry (size P)", "rubber dam (slit technique)"], value: "Isodry (size P)" },
        { id: "shade", label: "Shade", type: "text", value: "A2" },
        { id: "frankl", label: "Behavior (Frankl)", type: "select", options: ["F1 (definitely negative)", "F2 (negative)", "F3 (positive)", "F4 (definitely positive)"], value: "F4 (definitely positive)" },
        { id: "nv", label: "Next visit", type: "text", value: "6-month recall" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents with {{guardian}} for #{{tooth}}-{{surfaces}} preventive resin restoration. Weight {{weight}} kg.
Medical history: {{mhx}}. Allergies: {{allergies}}. Guardian consent obtained.

O:
#{{tooth}}: {{dx}}.

A:
#{{tooth}}-{{surfaces}}: {{dx}}; indicated for PRR.

P:
{{n2o}}
Topical 20% benzocaine applied. {{carps}} carpule(s) {{anesthetic}} administered as {{block}}; aspiration negative; dose within weight-based maximum.
Isolation: {{iso}}. Minimal pit-limited preparation (1.0–1.5 mm); carious enamel and dentin removed only.
Occlusal enamel etched with 35% phosphoric acid 15 s, rinsed, gently dried. Scotchbond Universal scrubbed 20 s, air-thinned 5 s, light-cured 10 s.
Renamel Nanofill composite, shade {{shade}}, placed and cured 20–40 s; final cure 60 s. Ultradent UltraSeal XT Plus applied over restoration and remaining pits and fissures, light-cured 20 s.
Finished and polished. Occlusion evaluated with articulating paper and adjusted.
Patient released to guardian in good condition; guardian informed patient is still numb, monitor lip and soft-tissue biting.
Behavior: {{frankl}}.

NV: {{nv}}`,
    },
  },

  /* ======================================================= OCCLUSAL GUARD */
  {
    id: "occlusal-guard",
    kind: "procedure",
    title: "Occlusal Guard (Hard, Full-Arch Maxillary)",
    category: "operative",
    duration: "2 visits · ~45 min each",
    summary:
      "Maxillary full-arch flat-plane hard acrylic guard. Visit 1: alginate impressions poured in Microstone, facebow and bite registration, mounting with ≥1 mm excursive clearance. Visit 2: delivery adjusted to bilateral centric contacts, canine guidance and minimal incisal guidance with posterior disclusion.",
    cdt: [
      { code: "D9944", label: "Occlusal guard, hard appliance, full arch" },
    ],
    tags: ["occlusal guard", "night guard", "bruxism", "flat plane", "hard acrylic", "dual layer", "facebow", "Regisil", "alginate", "Microstone", "incisal pin", "canine guidance", "freedom in centric", "point-to-flat-plane", "posterior disclusion", "intraoral scan"],
    tray: [
      { group: "Visit 1 · Records", items: ["Exam kit", "Stock impression trays (sized)", "Alginate + water measure", "Alginate bowl + spatula", "Tray adhesive spray", "Facebow + bite fork", "Regisil (PVS bite registration) + gun", "Microstone"] },
      { group: "Visit 2 · Delivery", items: ["Exam kit", "Occlusal guard from lab (disinfected)", "Lab handpiece + acrylic lab burs", "Horseshoe articulating paper", "Pumice / rag wheel for polishing adjustments"] },
      { group: "Chairside disposables", items: ["Patient goggles", "Gauze", "Printed post-op instructions"] },
    ],
    timers: [
      { id: "pour", label: "Pour window (alginate)", seconds: 600, note: "Pour immediately; distortion increases beyond ~10 min" },
    ],
    steps: [
      { id: "og1", title: "Visit 1 · Pre-op", body: [
          "Review medical history and vitals.",
          "Document bruxism signs (wear facets, TMJ/muscle findings) and the indication for the guard.",
        ],
        checkpoint: "Start check: confirm indication, TMJ/muscle screening and arch (maxillary) before records." },
      { id: "og2", title: "Visit 1 · Facebow & bite", body: ["Take a facebow record.", "Also take a Regisil bite registration if hand articulation of the casts will not be possible."] },
      { id: "og3", title: "Visit 1 · Impressions", body: [
          "Alginate impressions of both arches.",
          "Pour immediately in Microstone.",
        ],
        ebd: "An intraoral scan of both arches with a digital bite is an accurate alternative to alginate and removes pour-time distortion.",
        timers: ["pour"],
        checkpoint: "Records review: impressions free of voids and pulls, facebow and bite verified." },
      { id: "og4", title: "Mounting (lab)", body: [
          "Close the incisal pin to –2 mm before mounting.",
          "Mount the maxillary cast with the facebow.",
          "Mount the mandibular cast in MI by hand articulation or bite registration.",
          "Open the incisal pin until there is 1 mm clearance between canines and posterior teeth during excursive movements.",
          "Send the laboratory authorization with mounted casts (articulator optional).",
        ] },
      { id: "og5", title: "Visit 2 · Seat & centric", body: [
          "Seat the guard; patient closes to MI on articulating paper.",
          "Adjust with lab burs to equal, distributed bilateral posterior and anterior contacts.",
        ] },
      { id: "og6", title: "Visit 2 · Excursions", body: [
          "Lateral: canine guidance only. Remove any posterior contacts in lateral movements.",
          "Protrusive: minimal incisal guidance (no heavy contacts) but enough to disclude the posterior teeth.",
        ] },
      { id: "og7", title: "Visit 2 · Insertion training & instructions", body: [
          "Teach insertion and removal; confirm the patient can do both unaided.",
          "Give printed post-op instructions.",
        ],
        checkpoint: "Delivery review: bilateral centric contacts, canine guidance, posterior disclusion in protrusion, patient inserts and removes unaided. Then complete the note and codes." },
    ],
    matrices: [
      { title: "Occlusal guard specifications", columns: ["Parameter", "Specification"], rows: [
          ["Design", "Maxillary full-arch flat plane, dual-layer acrylic"],
          ["Incisal pin before mounting", "–2 mm"],
          ["Excursive clearance", "≥ 1 mm between canine tips and all posterior teeth (pin ≈ +3 mm)"],
          ["Centric contacts", "Point-to-flat-plane (mandibular buccal cusps and incisal edges)"],
          ["Freedom in centric", "1–2 mm"],
          ["Lateral excursion", "Canine guidance"],
          ["Protrusion", "Minimal incisal guidance with posterior disclusion"],
        ] },
    ],
    labRx: `DENTAL LABORATORY WORK AUTHORIZATION
Appliance: Maxillary full-arch flat-plane occlusal guard, hard
Material: Dual-layer acrylic
Vertical: Raise VDO to create at least 1 mm space between the tips of the canines and all posterior teeth during eccentric movements (pin +3 mm).
Please achieve:
 (a) Point-to-flat-plane contact in centric (buccal cusps and incisal edges of mandibular teeth)
 (b) 1–2 mm of freedom in centric
 (c) Minimal incisal guidance, but enough to disclude posterior teeth in protrusion
 (d) Canine guidance during lateral excursion
Patient: {{age}} y/o {{sex}}
Enclosures: {{enclosures}}
Return by: ______   Prescriber signature / license #: ______`,
    postOp: [
      "Wear the guard to bed every night.",
      "Brush your teeth before putting the guard in.",
      "You may salivate more than usual at first. If it keeps you awake, wear it for a few hours after dinner while awake to get used to it.",
      "Every morning: rinse with cold water and brush the guard gently with a toothbrush and toothpaste.",
      "Store it dry in its case, away from pets and heat.",
      "Bring the guard to every recall visit.",
    ],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "36" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "visit", label: "Visit", type: "select", options: ["Records", "Delivery"], value: "Records" },
        { id: "cc", label: "Chief complaint", type: "text", value: "I grind my teeth at night" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "118/74, 66 bpm" },
        { id: "findings", label: "Findings", type: "text", value: "generalized attrition facets, masseter hypertrophy; TMJ without pain or limitation" },
        { id: "records", label: "Records taken", type: "select", options: ["Alginate impressions of both arches poured in Microstone; facebow record taken.", "Alginate impressions poured in Microstone; facebow and Regisil bite registration taken.", "Intraoral scans of both arches with digital bite; facebow record taken.", "Records previously taken; casts mounted and appliance fabricated by laboratory."], value: "Alginate impressions of both arches poured in Microstone; facebow record taken." },
        { id: "delivery", label: "Delivery", type: "select", options: ["Not applicable (records visit).", "Guard tried in and adjusted with lab burs to: (1) bilateral centric contacts, (2) posterior disclusion with minimal incisal guidance in protrusion, (3) canine guidance in lateral movements. Patient inserted and removed guard unaided. Use and care instructions given; printed post-op instructions provided."], value: "Not applicable (records visit)." },
        { id: "enclosures", label: "Lab enclosures", type: "text", value: "Mounted maxillary and mandibular casts, facebow transfer, bite registration" },
        { id: "nv", label: "Next visit", type: "text", value: "Occlusal guard delivery" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for occlusal guard ({{visit}}). CC: "{{cc}}".
Medical history reviewed: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O:
{{findings}}.

A:
Sleep bruxism / parafunction; indicated for maxillary full-arch hard occlusal guard.

P:
{{records}}
{{delivery}}

NV: {{nv}}`,
    },
  },
];

function inferTimerTone(id: string, label: string): TimerTone {
  const s = `${id} ${label}`.toLowerCase();
  if (/cure|curing/.test(s)) return 'cure';
  if (/cord|triturat|working|extrude|set|pour|o₂|sticky|seat|pip|adhesive dry/.test(s)) return 'set';
  if (/etch|conditioner/.test(s)) return 'etch';
  if (/gluma|bond|adhesive|scrub|consepsis|primer?\b|air-thin|\bthin\b|rinse|dwell|wait/.test(s)) return 'prime';
  return 'set';
}

function trayKind(group: string): TrayGroup['kind'] {
  const g = group.toLowerCase();
  if (/rotary|bur/.test(g)) return 'burs';
  if (/kit|instrument|visit/.test(g)) return 'cassette';
  return 'consumables';
}

function parseChairTime(duration: string): Procedure['chairTime'] {
  const m = duration.match(/(\d+)\s*(?:[–-]\s*(\d+))?\s*min/);
  const min = m ? Number(m[1]) : 0;
  const max = m && m[2] ? Number(m[2]) : min;
  return { min, max, label: duration };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Reference content from the original Class II entry, merged into the manual version. */
const RESTORATIVE_EXTRAS: Record<string, Partial<Pick<Procedure, 'diagrams' | 'evidence' | 'specTables' | 'keyBurs'>>> = {
  'class-ii-composite': {
    diagrams: classIIComposite.diagrams,
    evidence: classIIComposite.evidence.slice(0, 3),
    specTables: classIIComposite.specTables.map((t) => ({ ...t, title: 'Class II preparation tolerances (reference)' })),
  },
};

const MANUAL_CATEGORY: Record<string, CategoryId> = {
  operative: 'restorative',
  restorative: 'restorative',
  fixed: 'fixed',
  removable: 'removable',
  implants: 'implants',
  digital: 'implants',
  pediatric: 'pediatrics',
  pediatrics: 'pediatrics',
  perio: 'perio',
  surgery: 'surgery',
  exams: 'exams',
  diagnostics: 'exams',
  diagnostic: 'exams',
};

const FIGURE_TO_DIAGRAM: Record<string, DiagramKey> = {
  crownPrep: 'crown-section',
  maxBorder: 'max-border',
  mandBorder: 'mand-border',
};

function normalizeManualProcedure(m: ManualProcedure, categoryOverride?: CategoryId): Procedure {
  const extras = RESTORATIVE_EXTRAS[m.id] ?? {};
  const timerIds = new Set(m.timers.map((t) => t.id));
  const trayBurs = m.tray.flatMap((g) => g.items).filter((i) => /\bburs?\b|diamond|carbide/i.test(i));
  return {
    id: m.id,
    title: m.title,
    shortTitle: m.title,
    category: categoryOverride ?? MANUAL_CATEGORY[m.category] ?? 'restorative',
    cdtCodes: m.cdt.map((c) => ({ code: c.code, descriptor: c.label })),
    chairTime: parseChairTime(m.duration),
    summary: m.summary,
    keyBurs: [...new Set([...m.tags.filter((t) => /^#|bur|round/i.test(t)), ...trayBurs, ...(extras.keyBurs ?? [])])],
    keyMaterials: [],
    tags: m.tags,
    tray: m.tray.map((g, gi) => ({
      id: `${gi}-${slug(g.group)}`,
      title: g.group,
      kind: trayKind(g.group),
      items: g.items.map((label, ii) => ({ id: `${gi}-${ii}`, label })),
    })),
    timers: m.timers.map((t) => ({ id: t.id, label: t.label, seconds: t.seconds, note: t.note, tone: inferTimerTone(t.id, t.label) })),
    steps: m.steps.map((s) => ({
      id: s.id,
      title: s.title,
      details: s.body,
      checkpoint: s.checkpoint,
      ebdNote: s.ebd,
      warning: s.warn,
      tip: s.tip,
      timerIds: s.timers?.filter((id) => timerIds.has(id)),
    })),
    specTables: [
      ...(m.matrices ?? []).map((t) => ({ title: t.title, note: t.note, columns: t.columns, rows: t.rows })),
      ...(extras.specTables ?? []),
    ],
    diagrams: [
      ...new Set([
        ...(extras.diagrams ?? []),
        ...(m.figures ?? []).flatMap((f) => (FIGURE_TO_DIAGRAM[f] ? [FIGURE_TO_DIAGRAM[f]] : [])),
      ]),
    ],
    soap: {
      fields: m.soap.fields.map((f) => ({ key: f.id, label: f.label, type: f.type, options: f.options, defaultValue: f.value })),
      template: m.soap.template,
    },
    labRx: m.labRx,
    postOp: m.postOp,
    widgets: m.widgets,
    evidence: extras.evidence ?? [],
  };
}

/* -------------------------------------------------------------------------- */
/* 2c. FIXED PROSTHODONTICS & DIGITAL DATASET (manual schema)                 */
/*                                                                            */
/* Embedded verbatim from fixed-digital-procedures.js. Reduction depths,      */
/* taper (6–10°), cavosurface angles, cord sizes, set/etch/prime/cure times,  */
/* scan limits, crystallization time and brands are from the source manual;   */
/* the manual names burs by shape only, so no bur numbers are added. Spec     */
/* rows tagged "Std ref" are textbook values. Categories come from each       */
/* entry (fixed → Fixed Prosth, implants → Implants & Digital).               */
/* -------------------------------------------------------------------------- */

const FIXED_DIGITAL_PROCEDURES: ManualProcedure[] = [
  /* ========================================================= CORE BUILDUP */
  {
    id: "core-buildup",
    kind: "procedure",
    title: "Core Buildup",
    category: "fixed",
    duration: "~75 min",
    summary:
      "Direct resin foundation for a tooth planned for full coverage: complete removal of caries and unsound restorations, matrix and wedge, selective etch with Scotchbond Universal, and a core in a contrasting shade (Bisco Light-Core blue/white or a much lighter/darker nanofill) so tooth and core are easy to tell apart at the crown prep.",
    cdt: [
      { code: "D2950", label: "Core buildup, including any pins when required" },
    ],
    tags: ["core buildup", "foundation", "Bisco Light-Core", "Bisco blue", "Bisco white", "contrasting shade", "nanofill", "Renamel", "Garrison", "sectional matrix", "Tofflemire", "Scotchbond Universal", "Gluma", "Consepsis", "Vitrebond", "TheraCal", "Biodentine", "ferrule", "ParaPost"],
    tray: [
      { group: "Case records", items: ["Diagnostic cast (for a provisional putty later)", "Wax-up if the tooth shape is not ideal"] },
      { group: "Instrument kits", items: ["Composite kit", "Rubber dam kit (clamps, frame, punch, forceps)", "Sectional matrix kit with separator ring(s), 1–2", "Tofflemire retainer + universal bands (alternative)", "Composite gun", "LED curing light (verify output)", "Vita shade guide", "Isodry mouthpiece"] },
      { group: "Rotary", items: ["High-speed & slow-speed handpieces", "Restorative burs; slow-speed round burs for caries", "Composite finishing burs"] },
      { group: "Materials", items: ["Core material: Bisco Light-Core (blue or white) or nanofill in a markedly lighter/darker shade", "35% phosphoric acid etch", "Scotchbond Universal adhesive", "Gluma desensitizer", "Consepsis (2% chlorhexidine)", "Vitrebond (RMGI liner) + mixing pad", "Calcium silicate liner (TheraCal LC or Biodentine)", "Retraction cords + Hemodent in dappen dish", "Microbrushes"] },
      { group: "Matrix & finishing", items: ["Sectional matrix bands", "Plastic and wooden wedges", "Wedget cord", "Shofu polishers"] },
      { group: "Chairside disposables", items: ["Anesthetic, needle, topical 20% benzocaine", "Articulating paper", "Floss", "Rubber dam sheet"] },
    ],
    timers: [
      { id: "consepsis", label: "Consepsis scrub", seconds: 10 },
      { id: "vitrebond", label: "RMGI liner cure", seconds: 20 },
      { id: "etch", label: "Enamel etch", seconds: 15, note: "Selective etch: enamel only, 15 s" },
      { id: "gluma", label: "Gluma scrub", seconds: 45 },
      { id: "gluma-wait", label: "Gluma dwell", seconds: 15 },
      { id: "bond", label: "Universal adhesive scrub", seconds: 20 },
      { id: "airthin", label: "Air-thin adhesive", seconds: 5 },
      { id: "cure-bond", label: "Cure adhesive", seconds: 10 },
      { id: "cure-inc", label: "Cure increment", seconds: 20, note: "20–40 s depending on increment size" },
      { id: "cure-final", label: "Final cure", seconds: 60 },
    ],
    steps: [
      { id: "cb1", title: "Confirm a cast is on hand", body: ["A diagnostic cast is needed to make the provisional putty at the crown prep.", "If the tooth shape is not ideal, wax up the cast, or take an impression after the buildup."], checkpoint: "Start check: confirm tooth, restorability (sound tooth structure for a ferrule), crown material and radiographs before anesthesia." },
      { id: "cb2", title: "Record pre-op occlusion", body: ["Before anesthesia, mark contacts on the target tooth and both adjacent teeth; sketch the map for post-op comparison."] },
      { id: "cb3", title: "Local anesthesia", body: ["Topical 20% benzocaine; IANB + long buccal for mandibular molars, infiltration for maxillary."] },
      { id: "cb4", title: "Shade selection", body: [
          "Select the shade for the final crown now; re-confirm it at later visits.",
          "Select a core shade that is drastically lighter or darker than the tooth so the core/tooth boundary is obvious at the crown prep.",
        ] },
      { id: "cb5", title: "Isolate & pre-wedge", body: ["Rubber dam or Isodry; ligate the clamp with floss.", "Pre-wedge the involved embrasures (mesial and distal for MOD)."] },
      { id: "cb6", title: "Remove caries & unsound restorations", body: [
          "Remove the existing restoration completely, unless it is sound and well bonded; decide deliberately rather than by habit.",
          "Slow-speed round bur for dentin: infected dentin is wet, cheesy and clumpy; sound dentin is dry, chalky and dusty.",
          "Old composite vs tooth: dry thoroughly or scratch with an explorer.",
        ],
        ebd: "Plan for a 1.5–2.0 mm ferrule of sound tooth structure apical to the core at the future margin; without it, consider crown lengthening, orthodontic extrusion or a different plan.",
        checkpoint: "Caries removal review: all caries and unsound restoration removed; remaining tooth structure and ferrule assessed." },
      { id: "cb7", title: "Matrix & wedge", body: [
          "Sectional band (smiling toward occlusal) → plastic wedge → separator ring → burnish. Ligate the ring with floss. Two rings for MOD.",
          "Or Tofflemire retainer + universal band + wooden wedge, closed end toward occlusal; band narrower gingivally, wider occlusally.",
        ] },
      { id: "cb8", title: "Disinfect", body: ["Consepsis scrub 10 s, rinse 5 s, gently dry leaving dentin moist."], timers: ["consepsis"] },
      { id: "cb9", title: "Liner or pulp protection (if indicated)", body: [
          "RMGI liner (Vitrebond): 0.5 mm on the deepest area, light-cure 20 s.",
          "Indirect pulp cap or small mechanical exposure: hydraulic calcium silicate (TheraCal LC, Biodentine or MTA) over the area of pulpal proximity only, covered with Vitrebond.",
        ],
        ebd: "Hydraulic calcium silicates replace calcium hydroxide (Dycal) for pulp capping.",
        timers: ["vitrebond"] },
      { id: "cb10", title: "Selective etch · desensitize · bond", body: [
          "Etch enamel with 35% phosphoric acid, 15 s; rinse 5 s; dentin moist and glossy.",
          "Gluma (optional): scrub 45 s, dwell 15 s, air-dry, rinse, blot-dry. Sequence: etch → Gluma → bond.",
          "Scotchbond Universal: scrub 20 s, air-thin 5 s, light-cure 10 s.",
          "Contaminated: re-etch 5 s, rinse, dry, re-bond, cure.",
        ],
        timers: ["etch", "gluma", "gluma-wait", "bond", "airthin", "cure-bond"] },
      { id: "cb11", title: "Build the core", body: [
          "Bisco Light-Core (blue or white) or nanofill in the contrasting shade, in increments; cure each 20–40 s.",
          "Final cure 60 s.",
          "Shape toward an ideal crown-prep form so reduction later is even.",
        ],
        timers: ["cure-inc", "cure-final"] },
      { id: "cb12", title: "Check contact & occlusion, finish", body: ["Remove dam or Isodry.", "Articulating paper; floss contacts.", "Composite finishing burs and Shofu."], checkpoint: "Buildup review: core bonded and well adapted, contacts and occlusion acceptable, contrast visible. Then complete the note and codes." },
    ],
    matrices: [
      { title: "Core buildup parameters", columns: ["Parameter", "Specification", "Source"], rows: [
          ["Core shade", "Drastically lighter or darker than tooth (Bisco blue/white)", "Manual"],
          ["Enamel etch", "15 s, enamel only", "Manual / EBD"],
          ["Cure per increment", "20–40 s; final 60 s", "Manual"],
          ["RMGI liner", "0.5 mm, cure 20 s", "Manual"],
          ["Ferrule", "1.5–2.0 mm sound tooth structure apical to core", "Std ref"],
        ] },
    ],
    postOp: ["Numbness lasts 2–4 h.", "The buildup is a foundation, not a final restoration: keep the crown appointment.", "Mild cold sensitivity for a few days is normal. Call if the bite feels high."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "52" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "tooth", label: "Tooth #", type: "text", value: "19" },
        { id: "crown", label: "Planned crown", type: "select", options: ["PFM crown", "lithium disilicate (e.max) crown", "full cast crown", "monolithic zirconia crown"], value: "PFM crown" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "124/80, 72 bpm" },
        { id: "dx", label: "Findings", type: "text", value: "failing MOD amalgam with recurrent caries; insufficient remaining tooth structure for a direct restoration" },
        { id: "anesthetic", label: "Anesthetic", type: "select", options: ANESTHETICS, value: ANESTHETICS[0] },
        { id: "carps", label: "Carpules", type: "text", value: "1" },
        { id: "block", label: "Injection", type: "text", value: "left IANB and long buccal" },
        { id: "iso", label: "Isolation", type: "select", options: ["rubber dam", "Isodry (size M)"], value: "Isodry (size M)" },
        { id: "liner", label: "Liner", type: "select", options: ["No liner indicated.", "RMGI liner (Vitrebond) 0.5 mm in deepest area, cured 20 s.", "Indirect pulp cap with calcium silicate (TheraCal LC) over area of pulpal proximity, covered with RMGI liner."], value: "No liner indicated." },
        { id: "core", label: "Core material", type: "select", options: ["Bisco Light-Core (blue)", "Bisco Light-Core (white)", "Renamel Nanofill in contrasting shade"], value: "Bisco Light-Core (blue)" },
        { id: "shade", label: "Crown shade", type: "text", value: "A2" },
        { id: "nv", label: "Next visit", type: "text", value: "#19 crown preparation" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for #{{tooth}} core buildup prior to {{crown}}.
Medical history reviewed: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O:
#{{tooth}}: {{dx}}. Pre-op occlusal contacts recorded.

A:
#{{tooth}}: requires core buildup for {{crown}} per approved treatment plan.

P:
Topical 20% benzocaine applied. {{carps}} carpule(s) {{anesthetic}} administered as {{block}}; aspiration negative.
Isolation: {{iso}}. Pre-wedged. Existing restoration removed; caries excavated to hard dentin.
Sectional matrix, wedge and separator ring placed and burnished. Disinfected with 2% chlorhexidine 10 s, rinsed. {{liner}}
Selective enamel etch with 35% phosphoric acid 15 s, rinsed, dentin left moist. Gluma desensitizer applied. Scotchbond Universal scrubbed 20 s, air-thinned 5 s, light-cured 10 s.
Core built with {{core}} in increments, each cured 20–40 s; final cure 60 s.
Contacts verified with floss; occlusion evaluated and adjusted. Finished with finishing burs and Shofu.
Shade {{shade}} selected for #{{tooth}} {{crown}}; patient confirmed with hand mirror.
Post-op instructions given: numbness, sensitivity, injection-site soreness, uneven bite.

NV: {{nv}}`,
    },
  },

  /* ======================================================= CROWN PREPARATION */
  {
    id: "crown-preparation",
    kind: "procedure",
    title: "Crown Preparation (PFM · All-Ceramic · Full Cast/Zirconia)",
    category: "fixed",
    duration: "~2 h",
    summary:
      "Full-coverage preparation sized to the crown material: flame-diamond proximal reduction, depth-cut occlusal and axial reduction, functional cusp bevel, 6–10° taper, supragingival or equigingival finish line, followed by provisional fabrication and cementation over Gluma.",
    cdt: [
      { code: "D2750", label: "Crown, porcelain fused to high noble metal" },
      { code: "D2740", label: "Crown, porcelain/ceramic" },
      { code: "D2790", label: "Crown, full cast high noble metal" },
    ],
    tags: ["crown prep", "PFM", "all-ceramic", "e.max", "lithium disilicate", "zirconia", "full cast", "depth cuts", "flame diamond", "functional cusp bevel", "chamfer", "deep chamfer", "taper", "6–10°", "Integrity", "UltraTemp", "TempBond NE", "Gluma", "putty matrix"],
    tray: [
      { group: "Case records", items: ["Mounted diagnostic casts with wax-up", "Putty matrix made from the cast (before seating)"] },
      { group: "Instrument kits", items: ["Fixed prosthodontics kit", "Integrity gun + mixing tips", "Composite gun", "LED curing light", "Vita shade guide"] },
      { group: "Rotary", items: ["High-speed & slow-speed handpieces", "Fixed prosth diamonds: flame-shaped (proximal), depth-cutting, round-end tapered (chamfer), football (occlusal/lingual)", "Fine-grit finishing diamonds", "Extra-oral provisional burs / acrylic trimmers", "Composite finishing burs"] },
      { group: "Materials", items: ["Integrity bis-acryl (shade matched)", "Flowable composite (provisional repair)", "Gluma desensitizer", "UltraTemp + tips or TempBond NE + mixing pad", "Retraction cord #0 + Hemodent in dappen dish", "Lab putty + activator", "Vaseline", "Microbrushes"] },
      { group: "Chairside disposables", items: ["Anesthetic, needle, topical", "Articulating paper", "Floss"] },
    ],
    timers: [
      { id: "integrity-seat", label: "Integrity: seat within", seconds: 45 },
      { id: "integrity-set", label: "Integrity: remove at firm-elastic", seconds: 45, note: "Labeled 2–3 min; realistically ~45 s — judge by the bled sample" },
      { id: "gluma-prov", label: "Gluma scrub on prep", seconds: 15 },
      { id: "gluma-prov-wait", label: "Gluma dwell before air-dry", seconds: 30 },
      { id: "bite-roll", label: "Bite on cotton roll", seconds: 120 },
    ],
    steps: [
      { id: "cp1", title: "Make the putty matrix (before seating)", body: ["Putty index of the cast or wax-up, trimmed to seat on at least one tooth either side of the prep."] },
      { id: "cp2", title: "Pre-op occlusion", body: ["Before anesthesia, mark centric and excursive contacts on the target and adjacent teeth; sketch the map."], checkpoint: "Start check: confirm tooth, crown material, buildup status, and radiographs before anesthesia." },
      { id: "cp3", title: "Anesthesia & shade", body: ["Deliver local anesthetic.", "Select the final crown shade under overhead, ambient and natural light before the tooth dehydrates."] },
      { id: "cp4", title: "Proximal reduction", body: ["Initial interproximal reduction with a flame-shaped diamond, protecting the adjacent tooth (a matrix band helps)."] },
      { id: "cp5", title: "Occlusal reduction", body: ["Depth cuts first, following cuspal inclines, then connect.", "Depth per material (see matrix)."] },
      { id: "cp6", title: "Axial reduction", body: [
          "Depth cuts first with a round-end tapered diamond, then connect.",
          "Total occlusal convergence 6–10°.",
          "Keep the finish line supragingival or equigingival; it can always be lowered later.",
        ] },
      { id: "cp7", title: "Functional cusp bevel & refinement", body: [
          "Functional cusp bevel on the working cusps (maxillary lingual, mandibular buccal).",
          "Final axial and occlusal modifications. Round all internal angles, smooth the finish line with fine diamonds.",
          "PFM: metal collar zone (lingual) may be a chamfer; porcelain zones need a deep chamfer.",
        ],
        checkpoint: "Preparation review before the provisional: reduction depths, taper, continuous finish line, rounded internal angles, adequate clearance in MI and excursions." },
      { id: "cp8", title: "Fabricate provisional", body: ["Integrity bis-acryl from the putty matrix (see Provisional Fabrication).", "Place a #0 cord soaked in Hemodent first if margins are subgingival."], timers: ["integrity-seat", "integrity-set"], checkpoint: "Provisional review before cementation: margins, contacts, occlusion, contour." },
      { id: "cp9", title: "Cement provisional", body: [
          "Gluma on the prep of every vital tooth: scrub 15 s, wait 30 s, air-dry. Skip for endodontically treated teeth.",
          "UltraTemp or TempBond NE; fill 80–90%, covering margins.",
          "Remove excess at half-set; floss down and up while holding the crown; cotton roll 2 min.",
          "Remove all cords. Check occlusion.",
        ],
        timers: ["gluma-prov", "gluma-prov-wait", "bite-roll"],
        warn: "Retained subgingival cement causes inflammation; explore every sulcus before dismissal.",
        checkpoint: "Post-cementation review: no excess cement, cords removed, occlusion and contacts acceptable. Then complete the note and codes." },
    ],
    matrices: [
      { title: "Reduction by crown material", columns: ["Parameter", "Full cast / zirconia", "PFM", "All-ceramic (not zirconia)"], rows: [
          ["Axial reduction", "1.00–1.25 mm", "1.25–1.50 mm", "1.25–1.50 mm"],
          ["Occlusal reduction", "1.25–1.50 mm", "1.5–2.0 mm", "1.5–2.0 mm"],
          ["Finish line", "Chamfer 0.5–0.8 mm", "Deep chamfer 1.0–1.25 mm", "Deep chamfer 1.0–1.25 mm"],
          ["Total convergence", "6–10°", "6–10°", "6–10°"],
        ],
        note: "Metal: strongest, least reduction, usually limited to molars. PFM: balance of strength and esthetics. Lithium disilicate: strength with translucency, anterior or posterior. Feldspathic: most translucent, weakest (veneers only). Zirconia: strongest ceramic, most opaque." },
      { title: "Provisional materials", columns: ["Class", "Product"], rows: [
          ["Bis-acryl", "Integrity"],
          ["PMMA", "Jet Set 4"],
          ["PEMA", "Snap"],
        ] },
    ],
    figures: ["crownPrep"],
    postOp: ["The provisional is held with temporary cement: avoid sticky and hard foods; floss by pulling the floss out to the side.", "Temperature sensitivity for a few days is common.", "If the provisional comes off, keep it and call; do not leave the tooth uncovered."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "52" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "tooth", label: "Tooth #", type: "text", value: "19" },
        { id: "crown", label: "Crown type", type: "select", options: ["PFM crown", "all-ceramic (lithium disilicate) crown", "full cast crown", "monolithic zirconia crown"], value: "PFM crown" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "124/80, 72 bpm" },
        { id: "anesthetic", label: "Anesthetic", type: "select", options: ANESTHETICS, value: ANESTHETICS[0] },
        { id: "carps", label: "Carpules", type: "text", value: "1.5" },
        { id: "block", label: "Injection", type: "text", value: "left IANB and long buccal" },
        { id: "reduction", label: "Reduction", type: "select", options: ["occlusal 1.5–2.0 mm, axial 1.25–1.5 mm, deep chamfer 1.0–1.25 mm", "occlusal 1.25–1.5 mm, axial 1.0–1.25 mm, chamfer 0.5–0.8 mm"], value: "occlusal 1.5–2.0 mm, axial 1.25–1.5 mm, deep chamfer 1.0–1.25 mm" },
        { id: "cement", label: "Temp cement", type: "select", options: ["UltraTemp", "TempBond NE"], value: "UltraTemp" },
        { id: "shade", label: "Shade", type: "text", value: "A2" },
        { id: "nv", label: "Next visit", type: "text", value: "#19 crown final impression" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for #{{tooth}} {{crown}} preparation and provisional.
Medical history reviewed: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O:
Pre-op centric and excursive contacts recorded with articulating paper.

A:
#{{tooth}}: indicated for {{crown}} per approved treatment plan.

P:
Topical 20% benzocaine applied. {{carps}} carpule(s) {{anesthetic}} administered as {{block}}; aspiration negative.
Crown preparation completed to ideal form: {{reduction}}, functional cusp bevel, 6–10° total convergence, internal angles rounded.
#0 retraction cord soaked in Hemodent placed. Provisional fabricated with Integrity shade {{shade}} from putty matrix; adjusted to ideal contour with satisfactory marginal adaptation.
Gluma applied to preparation. Provisional cemented with {{cement}}. Cord removed. Excess cement removed; contacts flossed. Occlusal and excursive contacts evaluated and adjusted.
Shade {{shade}} selected for #{{tooth}} {{crown}}; patient confirmed with hand mirror.
Post-op instructions given: provisional care, sticky/hard foods, flossing technique, sensitivity, what to do if provisional dislodges.

NV: {{nv}}`,
    },
  },

  /* ================================================== PROVISIONAL FABRICATION */
  {
    id: "provisional-fabrication",
    kind: "procedure",
    title: "Provisional Fabrication (Integrity vs. Jet Set 4) & Cementation",
    category: "fixed",
    duration: "~20–40 min",
    summary:
      "Indirect-direct provisional from a putty matrix. Integrity (bis-acryl) for single units: fast, low heat, easy repair with flowable. Jet Set 4 (PMMA) for multi-unit bridges: soupy → doughy → rubbery stages, cold-water rinse at initial set. Cemented over Gluma with UltraTemp or TempBond NE.",
    cdt: [
      { code: "D2799", label: "Interim crown (only when a separate interim episode; routine provisionals are included in the crown fee)" },
    ],
    tags: ["provisional", "temporary crown", "Integrity", "bis-acryl", "Jet Set 4", "PMMA", "Snap", "PEMA", "putty matrix", "firm elastic", "doughy stage", "rubbery stage", "salt and pepper", "flowable repair", "UltraTemp", "TempBond NE", "Gluma", "air-inhibited layer"],
    tray: [
      { group: "Case records", items: ["Putty matrix from cast or wax-up"] },
      { group: "Instrument kits", items: ["Fixed prosthodontics kit", "Integrity gun + mixing tips", "Composite gun", "LED curing light", "Vita shade guide"] },
      { group: "Rotary", items: ["Extra-oral provisional burs / acrylic trimmers", "Coarse and fine diamond discs", "Composite finishing burs", "Lab handpiece"] },
      { group: "Materials", items: ["Integrity bis-acryl (shade matched) — or Jet Set 4 powder + monomer, dappen dish, eyedropper, spatula", "Flowable composite (repairs)", "Vaseline", "Alcohol gauze", "Gluma desensitizer", "UltraTemp + tips or TempBond NE + mixing pad", "Retraction cord #0 + Hemodent", "Pumice + rag wheel; Shofu, discs, Enamelize"] },
      { group: "Chairside disposables", items: ["Articulating paper", "Floss", "Cotton rolls", "Gauze"] },
    ],
    timers: [
      { id: "integrity-seat", label: "Integrity: seat within", seconds: 45 },
      { id: "integrity-set", label: "Integrity: firm-elastic removal", seconds: 45, note: "Labeled 2–3 min from mix; realistically ~45 s" },
      { id: "integrity-trim", label: "Integrity: full set before trimming", seconds: 180, note: "Labeled 6–7 min; realistically 2–3 min" },
      { id: "cure-flow", label: "Cure flowable repair (intraoral)", seconds: 20, note: "10 s on high; then 20–40 s extraoral" },
      { id: "gluma-prov", label: "Gluma scrub on prep", seconds: 15 },
      { id: "gluma-prov-wait", label: "Gluma dwell before air-dry", seconds: 30 },
      { id: "bite-roll", label: "Bite on cotton roll", seconds: 120 },
    ],
    steps: [
      { id: "pv1", title: "Choose the material", body: [
          "Integrity (bis-acryl): single crowns and onlays. Easiest to use, least exothermic, repairs with flowable.",
          "Jet Set 4 (PMMA): multi-unit bridges and long-term provisionals; relines well but is harder to handle and exothermic.",
        ],
        checkpoint: "Confirm preparation is accepted and matrix seats fully before mixing." },
      { id: "pv2", title: "Prepare the field", body: ["Place a retraction cord as needed to see subgingival margins.", "Vaseline on the prep and adjacent soft tissue."] },
      { id: "pv3", title: "Integrity · load & seat", body: [
          "Dispense and discard a pea-size amount of base and catalyst before attaching the mix tip (even flow).",
          "Attach the tip and bleed a small amount onto the tray; this sample shows the set.",
          "Inject into the putty, deepest part first, then gingival areas, keeping the tip immersed to avoid bubbles.",
          "Seat within 45 s with gentle pressure.",
        ],
        timers: ["integrity-seat"] },
      { id: "pv4", title: "Integrity · remove & reseat", body: [
          "Remove at the firm-elastic stage (judge from the bled sample; ~45 s in practice).",
          "If it stays on the prep, tease off with gauze or an explorer; hemostats and pliers distort it.",
          "Quickly reseat and have the patient close into MI.",
        ],
        timers: ["integrity-set"] },
      { id: "pv5", title: "Integrity · repair voids", body: [
          "Trim gross excess with scissors, lab burs or a coarse diamond disc.",
          "Roughen the area with a bur, re-vaseline the prep, reseat, add flowable composite; for interproximal voids add flowable to the crown and reseat.",
          "Feather excess beyond the margins. Cure 20 s intraorally (10 s high), then 20–40 s out of the mouth.",
        ],
        timers: ["cure-flow"] },
      { id: "pv6", title: "Integrity · trim & polish", body: [
          "Trim after full set (~2–3 min in practice).",
          "Gingival embrasures: bur or disc parallel to the emergence profile, apical to the contact.",
          "Proximal: open facial and lingual embrasures to convex contours; do not touch the contact itself (creates an open contact).",
          "Facial/lingual: outer surface of the bur parallel to the emergence profile.",
          "Wipe the tacky air-inhibited layer with alcohol gauze. Pumice + rag wheel, then Shofu, discs, Enamelize; optional light-cured gloss varnish.",
        ],
        timers: ["integrity-trim"] },
      { id: "pv7", title: "Jet Set 4 · mix & load", body: [
          "Fill a dappen dish ¾ full with powder; add monomer with an eyedropper; mix with a spatula.",
          "Soupy stage: a string lifts ~½ in before breaking. Pour into the matrix.",
        ] },
      { id: "pv8", title: "Jet Set 4 · seat & cycle", body: [
          "Doughy stage (surface sheen gone): invert the matrix and seat, pressing only where unprepared teeth are underneath.",
          "Rubbery stage (leftover acrylic snaps cleanly): remove; if it stays on the prep, lift with an explorer into the putty. Reseat quickly; patient closes into MI.",
          "Initial set (becoming warm): remove, rinse in cold water, reinsert for final set. Do not let it set on a vital tooth.",
        ],
        warn: "PMMA polymerization is exothermic; keep removing and cooling to protect the pulp." },
      { id: "pv9", title: "Jet Set 4 · trim, margins & polish", body: [
          "Trim margins and axial contours with a diamond disc. Check contacts and occlusion.",
          "Margin reline: vaseline on the prep, salt-and-pepper powder and liquid. Never paint all margins at once; it can lock onto the prep.",
          "Polish with acrylic points and wheels on slow speed; final gloss with wet fine pumice and rag wheel, light pressure.",
        ] },
      { id: "pv10", title: "Cement", body: [
          "Gluma on the prep (vital teeth): scrub thin layer 15 s, wait 30 s, air-dry. Skip for endodontically treated teeth.",
          "Recementation: remove all old temporary cement first.",
          "Optional: vaseline on the outer surface only (not intaglio or margins) for easier cleanup.",
          "TempBond NE: equal pastes on a pad, mix. UltraTemp: new tip, dispense directly into the provisional.",
          "Fill 80–90%, covering the margins. Seat.",
          "At half-set (goopy or crumbly), clean excess; floss down and up while holding the crown.",
          "Anterior: hold in place. Posterior: bite on a cotton roll 2 min.",
          "Adjust occlusion.",
        ],
        timers: ["gluma-prov", "gluma-prov-wait", "bite-roll"],
        checkpoint: "Provisional review: marginal adaptation, contacts, occlusion, no retained cement, cords removed." },
    ],
    matrices: [
      { title: "Integrity vs. Jet Set 4", columns: ["Property", "Integrity (bis-acryl)", "Jet Set 4 (PMMA)"], rows: [
          ["Best use", "Single crowns, onlays", "Multi-unit bridges, long-term, reline"],
          ["Handling", "Cartridge + mix tip", "Powder/liquid in dappen dish"],
          ["Seat timing", "Within 45 s", "At doughy stage (sheen gone)"],
          ["Remove at", "Firm-elastic (~45 s)", "Rubbery stage (clean snap)"],
          ["Heat", "Low", "Exothermic; rinse in cold water at initial set"],
          ["Repair", "Flowable composite, cure 20 s + 20–40 s", "Salt-and-pepper acrylic"],
          ["Trim", "After full set (~2–3 min)", "After final set"],
        ] },
    ],
    postOp: ["Avoid sticky and hard foods on the provisional.", "Floss by pulling the floss out to the side, not up through the contact.", "If it comes off, keep it and call; do not leave the tooth uncovered."],
    soap: {
      fields: [
        { id: "tooth", label: "Tooth #", type: "text", value: "19" },
        { id: "material", label: "Material", type: "select", options: ["Integrity bis-acryl", "Jet Set 4 PMMA"], value: "Integrity bis-acryl" },
        { id: "shade", label: "Shade", type: "text", value: "A2" },
        { id: "cord", label: "Cord", type: "select", options: ["#0 retraction cord soaked in Hemodent placed.", "No retraction cord required."], value: "#0 retraction cord soaked in Hemodent placed." },
        { id: "gluma", label: "Desensitizer", type: "select", options: ["Gluma applied to preparation 15 s, dwell 30 s, air-dried.", "Gluma omitted (endodontically treated tooth)."], value: "Gluma applied to preparation 15 s, dwell 30 s, air-dried." },
        { id: "cement", label: "Temp cement", type: "select", options: ["UltraTemp", "TempBond NE"], value: "UltraTemp" },
      ],
      template: `P (provisional):
#{{tooth}}: {{cord}} Provisional fabricated from putty matrix using {{material}}, shade {{shade}}. Adjusted to ideal contour with satisfactory marginal adaptation; polished.
{{gluma}} Cemented with {{cement}}. Cords removed. Excess cement removed; contacts evaluated with floss and adjusted to ideal. Occlusal and excursive contacts evaluated with articulating paper and adjusted to ideal.`,
    },
  },

  /* ================================================== CROWN FINAL IMPRESSION */
  {
    id: "crown-final-impression",
    kind: "procedure",
    title: "Crown Final Impression (Two-Cord PVS)",
    category: "fixed",
    duration: "~60 min",
    summary:
      "Conventional PVS final impression: provisional removed with a sickle scaler, prep cleaned and refined, #00 bottom cord (no tail) + larger top cord (half visible, tailed), top cord pulled immediately before light-body syringing, heavy-body tray held a full 6 min.",
    cdt: [
      { code: "D2750", label: "Crown, porcelain fused to high noble metal" },
      { code: "D2740", label: "Crown, porcelain/ceramic" },
      { code: "D2790", label: "Crown, full cast high noble metal" },
    ],
    tags: ["final impression", "PVS", "polyvinyl siloxane", "two-cord", "double cord", "#00", "#0", "#1", "Hemodent", "light body", "heavy body", "tray adhesive", "sickle scaler", "die trim", "lab authorization", "PFM"],
    tray: [
      { group: "Case records", items: ["Mounted diagnostic casts", "Putty matrix (in case the provisional must be remade)"] },
      { group: "Instrument kits", items: ["Fixed prosthodontics kit (cord packer)", "Sickle scaler (anterior sickle)", "PVS dispensing guns ×2", "Integrity gun + tips", "Composite gun", "Vita shade guide", "LED curing light"] },
      { group: "Rotary", items: ["Fixed prosth diamonds (refinement)", "Extra-oral provisional burs", "Composite finishing burs"] },
      { group: "Materials", items: ["Retraction cords #00, #0, #1 + Hemodent in dappen dish", "Stock impression trays (sized)", "PVS tray adhesive + clean brushes + dappen dish", "Heavy-body PVS + tips", "Light-body PVS + intraoral tips", "UltraTemp + tips or TempBond NE", "Integrity, flowable composite, lab putty (backup)", "Vaseline"] },
      { group: "Chairside disposables", items: ["Anesthetic, needle, topical", "Floss", "Cotton-tipped applicators", "Paper towels for patient"] },
    ],
    timers: [
      { id: "adhesive-dry", label: "Tray adhesive dry", seconds: 300 },
      { id: "cord-dwell", label: "Cord dwell (Hemodent)", seconds: 300 },
      { id: "pvs-set", label: "PVS set (full)", seconds: 360 },
      { id: "bite-roll", label: "Bite on cotton roll (recement)", seconds: 120 },
    ],
    steps: [
      { id: "fi1", title: "Pre-op", body: ["Review medical history and vitals.", "Anesthesia only if packing cord or the patient is sensitive."], checkpoint: "Start check: confirm tooth, crown material, shade plan and lab authorization details before anesthesia." },
      { id: "fi2", title: "Shade", body: ["Select/confirm shade under overhead, ambient and natural light."] },
      { id: "fi3", title: "Tray & adhesive", body: [
          "Size the tray.",
          "Apply adhesive with a clean brush each time, from a dappen dish. Never double-dip: a brush that touched the tray carries saliva into the bottle.",
          "Thin layer only (pooling or dripping is too much). Let it dry, up to 5 min.",
        ],
        timers: ["adhesive-dry"] },
      { id: "fi4", title: "Remove provisional & clean", body: [
          "Wedge a sharp sickle scaler into the provisional margin at several points until it pops off. A hemostat works but may damage a provisional you plan to reuse.",
          "Remove temporary cement with a scaler or fixed prosth burs. Refine the prep if needed.",
        ] },
      { id: "fi5", title: "Pack two cords", body: [
          "Cords soaked in Hemodent.",
          "Bottom cord (#00): entirely below the margin, cut with no tail. Controls seepage and bleeding; stays in during the impression.",
          "Top cord (#0 or #1): over the first, half its width in the sulcus, visible all the way around. Any spot where it submerges collapses when removed. Leave a tail.",
        ],
        timers: ["cord-dwell"] },
      { id: "fi6", title: "Take the impression", body: [
          "Brief the patient: chin down, paper towels ready, suction ready. Have an assistant.",
          "Assistant loads the tray with heavy body (a small amount; maxillary: U-shape, palate not needed).",
          "Thoroughly dry prep and adjacent teeth. Remove the top cord quickly.",
          "Light body with the micro-tip into the sulcus, then around the whole prep in one direction only, tip kept in the material.",
          "Seat the tray. Hold still for the full 6 min.",
          "Remove the impression. Remove the bottom cord.",
        ],
        timers: ["pvs-set"],
        checkpoint: "Impression acceptance: margin captured 360° with material beyond it, no voids, pulls, tears or tray show-through at the prep." },
      { id: "fi7", title: "Recement provisional", body: ["Remove old cement from the provisional, Gluma on vital preps, recement, clean excess, check occlusion."], timers: ["bite-roll"] },
      { id: "fi8", title: "Send to lab", body: ["Disinfect the impression per protocol.", "Send with the lab authorization (die trim first, or definitive fabrication)."], checkpoint: "Lab authorization verified: tooth, material, alloy, shade, margin/collar design, enclosures." },
    ],
    matrices: [
      { title: "Two-cord technique", columns: ["Cord", "Size", "Position", "Tail", "During impression"], rows: [
          ["Bottom", "#00", "Entirely below the margin", "No tail", "Stays in"],
          ["Top", "#0 or #1 (larger)", "Half in sulcus, visible 360°", "Leave tail", "Removed just before syringing"],
        ] },
    ],
    labRx: `DENTAL LABORATORY WORK AUTHORIZATION
Restoration: {{crown}}, tooth #{{tooth}}
Instructions: {{lab_instr}}
Shade: {{shade}}
Enclosures: PVS final impression, opposing model, bite registration
Return by: ______   Prescriber signature / license #: ______`,
    postOp: ["Gums may be sore from the retraction cords for 1–2 days; warm saltwater rinses help.", "The provisional stays on until delivery: avoid sticky and hard foods."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "52" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "tooth", label: "Tooth #", type: "text", value: "19" },
        { id: "crown", label: "Crown type", type: "select", options: ["PFM crown, high-noble alloy", "full cast crown, high-noble alloy", "all-ceramic (lithium disilicate) crown"], value: "PFM crown, high-noble alloy" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "122/78, 70 bpm" },
        { id: "anesthetic", label: "Anesthetic", type: "select", options: ANESTHETICS, value: ANESTHETICS[0] },
        { id: "carps", label: "Carpules", type: "text", value: "1" },
        { id: "block", label: "Injection", type: "text", value: "left IANB and long buccal" },
        { id: "cords", label: "Cords", type: "select", options: ["#00 and #0", "#00 and #1"], value: "#00 and #0" },
        { id: "cement", label: "Temp cement", type: "select", options: ["UltraTemp", "TempBond NE"], value: "UltraTemp" },
        { id: "shade", label: "Shade", type: "text", value: "A2" },
        { id: "lab_instr", label: "Lab instructions", type: "textarea", value: "Pour impression and fabricate crown. Occlusal and interproximal contacts in porcelain. 1–2 mm metal collar on the lingual margin; no metal collar on the buccal margin." },
        { id: "nv", label: "Next visit", type: "text", value: "#19 crown delivery" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for #{{tooth}} {{crown}} final impression.
Medical history reviewed: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O:
#{{tooth}}: provisional intact; gingiva healthy around preparation.

A:
#{{tooth}}: ready for final impression.

P:
Topical 20% benzocaine applied. {{carps}} carpule(s) {{anesthetic}} administered as {{block}}; aspiration negative.
Provisional removed; temporary cement removed. Preparation refined to ideal.
Retraction cords {{cords}} soaked in Hemodent placed (two-cord technique). Top cord removed; final impression taken with light-body and heavy-body PVS, 6 min set. Margins captured 360°, verified. Bottom cord removed.
Provisional recemented with {{cement}} over Gluma; excess removed, contacts flossed, occlusion adjusted.
Shade {{shade}} confirmed; patient confirmed with hand mirror. Impression and lab authorization sent to laboratory.

NV: {{nv}}`,
    },
  },

  /* ================================================ CROWN DELIVERY / EQUILIBRATION */
  {
    id: "crown-delivery",
    kind: "procedure",
    title: "Crown Delivery & Occlusal Equilibration",
    category: "fixed",
    duration: "~60 min",
    summary:
      "Try-in and cementation of a laboratory crown: contacts adjusted first, intaglio checked with Occlude spray or Fit-Checker, seating confirmed by marginal ridges and bitewing, centric and excursive equilibration extraorally, then RelyX or FujiCem cementation with meticulous excess removal and ceramic polishing.",
    cdt: [
      { code: "D2750", label: "Crown, porcelain fused to high noble metal" },
      { code: "D2740", label: "Crown, porcelain/ceramic" },
      { code: "D2790", label: "Crown, full cast high noble metal" },
    ],
    tags: ["crown delivery", "cementation", "seat", "try-in", "equilibration", "occlusal adjustment", "Occlude", "Fit-Checker", "intaglio", "bitewing", "RelyX", "FujiCem", "RMGI cement", "self-adhesive resin", "zirconia", "APC", "MDP", "ceramic polishing", "Cavicide"],
    tray: [
      { group: "Case records", items: ["Crown from lab (on its cast)"] },
      { group: "Instrument kits", items: ["Fixed prosthodontics kit", "RelyX kit / FujiCem dispenser", "Sickle scaler", "Radiograph sensor & holder", "Prophy handpiece + angle"] },
      { group: "Rotary", items: ["Intraoral ceramic burs (fine diamonds) / intraoral metal burs", "Ceramic polishing system (coarse → fine)", "Composite finishing burs"] },
      { group: "Materials", items: ["Articulating paper (two colors)", "Occlude spray or Fit-Checker", "Fluoride-free pumice", "Cement: RelyX (resin) or FujiCem (RMGI)", "Retraction cord + Hemodent (if needed)", "Microbrushes"] },
      { group: "If the crown does not fit", items: ["PVS guns, heavy/light body, tray + adhesive", "Integrity + gun, flowable, UltraTemp/TempBond", "Extra-oral provisional burs", "Vita shade guide, curing light"] },
      { group: "Chairside disposables", items: ["Gauze throat pack", "Floss", "Dry angles, cotton rolls"] },
    ],
    timers: [
      { id: "disinfect-1", label: "Cavicide soak", seconds: 300 },
      { id: "disinfect-2", label: "Chlorhexidine soak", seconds: 300 },
      { id: "cement-tack", label: "Cement to tacky/semi-set", seconds: 90, note: "1–2 min" },
      { id: "bite-roll", label: "Bite on cotton roll", seconds: 180 },
    ],
    steps: [
      { id: "cd1", title: "Before seating the patient", body: [
          "Check the crown on the cast: margins and interproximal contacts.",
          "Disinfect: Cavicide 5 min, rinse; chlorhexidine 5 min, rinse.",
        ],
        timers: ["disinfect-1", "disinfect-2"] },
      { id: "cd2", title: "Pre-op occlusion", body: ["Before anesthesia, mark contacts on the provisional and adjacent teeth; sketch the map (adjacent teeth must match at the end)."], checkpoint: "Start check: confirm tooth, crown material/shade matches the plan, and lab quality on the cast." },
      { id: "cd3", title: "Remove provisional", body: [
          "Fingers first. Then a hemostat with light force (you may need to reuse it).",
          "If still stuck, gently loosen at the margins with a sickle scaler, then the hemostat.",
          "Remove all temporary cement with a scaler (not a bur: it alters the prep). Pumice with a prophy cup. Pack a cord if the margin is hard to see.",
        ] },
      { id: "cd4", title: "Try-in", body: [
          "Gauze throat pack.",
          "Floss contacts while holding the crown down with a finger.",
          "Explore margins.",
          "Marginal ridges level with the adjacent teeth indicate full seating.",
        ] },
      { id: "cd5", title: "If it doesn't seat", body: [
          "Contacts first: the most common cause. Mark with articulating paper, adjust the crown, retry.",
          "Then the intaglio: light coat of Occlude spray (or Fit-Checker paste-paste mixed equally) inside the crown, seat, read the show-through or marks on the prep, relieve with burs, repeat.",
        ],
        warn: "If contacts are open, margins open, or seating cannot be achieved, do not cement: re-impress and remake." },
      { id: "cd6", title: "Esthetics", body: ["Patient approves shape, size and color before anything is cemented."] },
      { id: "cd7", title: "Radiograph", body: ["Bitewing (posterior) to confirm full seating and closed margins before cementation. Not needed for anteriors."], checkpoint: "Pre-cementation review: seating, margins (visual, tactile, radiographic), contacts, esthetics approved." },
      { id: "cd8", title: "Equilibrate occlusion", body: [
          "Centric: articulating paper in MI; adjust until the crown contacts evenly and the adjacent teeth hold the same marks as the pre-op map.",
          "Excursions: second color for lateral and protrusive; remove working and nonworking interferences on the crown.",
          "Adjust extraorally with ceramic (or metal) burs before cementation.",
        ],
        ebd: "Adjust zirconia and lithium disilicate with fine diamonds under water spray, then polish with a dedicated ceramic polishing sequence; a polished ceramic surface wears opposing enamel less than an unpolished adjusted one." },
      { id: "cd9", title: "Polish adjusted areas", body: ["Intraoral ceramic polishing burs in the correct coarse → fine sequence."] },
      { id: "cd10", title: "Cement", body: [
          "RelyX or FujiCem (follow the cement's instructions for any crown/tooth surface treatment).",
          "Clean the prep with pumice, rinse, lightly dry leaving dentin moist. Isolate with dry angles, cotton rolls, suction.",
          "Fill the crown ½ to ⅔, covering the margins. Seat.",
          "Wait 1–2 min to tacky/semi-set; flick off excess with a scaler or explorer.",
          "Floss up and down several times while holding the crown, then pull floss through.",
          "Patient bites on a cotton roll 3 min.",
        ],
        ebd: "Match cement to material: PFM/metal — RMGI (FujiCem) or self-adhesive resin. Zirconia — air-abrade the intaglio (alumina), MDP primer, self-adhesive or MDP resin cement. Lithium disilicate — see Digital Delivery (HF + silane, resin cement).",
        timers: ["cement-tack", "bite-roll"],
        warn: "Retained subgingival cement is a leading cause of peri-crown inflammation; explore every surface." },
      { id: "cd11", title: "Verify", body: ["Margins clean and closed.", "Contacts with floss.", "Centric and excursive contacts; final touch-ups and re-polish."], checkpoint: "Final delivery review: no cement remnants, margins, contacts, occlusion matching the pre-op map. Then complete the note and codes." },
    ],
    matrices: [
      { title: "Delivery checklist", columns: ["Check", "Method", "Standard"], rows: [
          ["Contacts", "Floss, holding the crown", "Snaps through, not open or shredding"],
          ["Seating", "Marginal ridge heights, bitewing", "Level with adjacent; no radiographic gap"],
          ["Intaglio", "Occlude spray / Fit-Checker", "Even film, no show-through"],
          ["Centric", "Articulating paper in MI", "Even contact; adjacent teeth unchanged"],
          ["Excursions", "Second-color paper", "No working/nonworking interferences"],
          ["Cement fill", "—", "½–⅔ of crown, margins covered"],
        ] },
    ],
    postOp: ["No sticky foods for 24 h.", "Call if the bite feels uneven or there is pain.", "Floss daily around the crown; it can still get decay at the margins."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "52" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "tooth", label: "Tooth #", type: "text", value: "19" },
        { id: "crown", label: "Crown type", type: "select", options: ["PFM crown", "full cast crown", "monolithic zirconia crown", "lithium disilicate crown"], value: "PFM crown" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "120/78, 70 bpm" },
        { id: "anes", label: "Anesthesia", type: "select", options: ["No anesthesia required.", "Local anesthetic administered for patient comfort; aspiration negative."], value: "No anesthesia required." },
        { id: "adjust", label: "Adjustments", type: "select", options: ["No adjustments required.", "Interproximal contacts adjusted with bur; occlusal and excursive contacts adjusted extraorally with ceramic burs and polished.", "Intaglio relieved using Occlude spray; contacts and occlusion adjusted and polished."], value: "Interproximal contacts adjusted with bur; occlusal and excursive contacts adjusted extraorally with ceramic burs and polished." },
        { id: "cement", label: "Cement", type: "select", options: ["RelyX", "FujiCem (RMGI)"], value: "RelyX" },
        { id: "nv", label: "Next visit", type: "text", value: "Recall / next restorative" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for #{{tooth}} {{crown}} delivery.
Medical history reviewed: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O:
Pre-op occlusal contacts recorded. Crown verified on cast; disinfected (Cavicide 5 min, chlorhexidine 5 min).

A:
#{{tooth}}: {{crown}} ready for delivery.

P:
{{anes}} Provisional removed; temporary cement removed with scaler. Tooth cleaned with pumice and prophy angle.
Try-in: marginal adaptation satisfactory, verified visually, tactilely and radiographically (1 BW). Interproximal contacts satisfactory with floss. Patient approved shade and shape. {{adjust}}
Isolated with dry angles and cotton rolls. Crown cemented with {{cement}} per manufacturer's instructions. Excess cement removed; floss passed through contacts.
Margins and contacts re-verified. Centric and excursive contacts evaluated and equilibrated; adjacent-tooth contacts match pre-op. Ceramic polished.
Patient satisfied with bite and esthetics. Post-op instructions given: 24 h set, no sticky foods, uneven bite, pain.

NV: {{nv}}`,
    },
  },

  /* ========================================================= CROWN REMOVAL */
  {
    id: "crown-removal",
    kind: "procedure",
    title: "Crown Removal (Sectioning)",
    category: "fixed",
    duration: "~20–30 min",
    summary:
      "Removal of a failing crown by sectioning: putty made in advance for the provisional, existing shade recorded, airway protected with Isodry, crown cut buccally and occlusally to tooth structure with a crown-removing bur, split with a crown spreader, then radiograph and continue treatment.",
    cdt: [
      { code: "D2999", label: "Unspecified restorative procedure, by report (crown removal is often not separately reportable)" },
    ],
    tags: ["crown removal", "sectioning", "crown-removing bur", "crown spreader", "crown remover", "Isodry", "airway protection", "aspiration", "zirconia", "PFM", "recurrent caries"],
    tray: [
      { group: "Case records", items: ["Putty matrix from the cast (for the provisional)"] },
      { group: "Instrument kits", items: ["Fixed prosthodontics kit", "Crown spreader / crown remover", "Radiograph sensor & holder", "Isodry mouthpiece"] },
      { group: "Rotary", items: ["High-speed handpiece", "Crown-removing burs (anterior or posterior; carbide for metal, coarse diamond for ceramic/zirconia)", "Fixed prosth diamonds"] },
      { group: "Materials", items: ["Retraction cord + Hemodent in dappen dish", "Provisional materials (Integrity, cement)"] },
      { group: "Chairside disposables", items: ["Anesthetic, needle, topical", "Gauze", "Patient goggles"] },
    ],
    timers: [],
    steps: [
      { id: "cr1", title: "Prepare", body: ["Make the provisional putty from the cast before the patient is seated."], checkpoint: "Start check: confirm tooth, reason for removal, radiographs and the plan for what follows (buildup, RCT, extraction)." },
      { id: "cr2", title: "Anesthesia & shade", body: ["Deliver local anesthetic.", "Record the shade of the existing crown for reference; choose the new crown shade under overhead, ambient and natural light."] },
      { id: "cr3", title: "Retraction & airway protection", body: ["Retraction cord as needed to see the subgingival margin.", "Isodry is ideal to keep fragments out of the throat; gauze works but is harder to manage."], warn: "Porcelain and zirconia fragments can be aspirated. Keep the airway protected throughout." },
      { id: "cr4", title: "Section", body: ["Cut through the buccal and occlusal of the crown to tooth structure with a crown-removing bur. Stop at the metal/core; do not gouge the tooth.", "Zirconia: coarse diamond with copious water; cuts slowly."] },
      { id: "cr5", title: "Spread & remove", body: [
          "Place the crown spreader in the cut and rotate gently to split the halves apart.",
          "If it will not release, section part of the lingual as well.",
        ] },
      { id: "cr6", title: "Radiograph & continue", body: ["Radiograph to see the tooth structure under the crown.", "Continue: excavate caries, core buildup, provisional, RCT or extraction as indicated."], checkpoint: "Post-removal review: remaining tooth structure, caries, restorability and next step confirmed." },
    ],
    postOp: ["Numbness lasts 2–4 h.", "Care for the provisional: avoid sticky and hard foods."],
    soap: {
      fields: [
        { id: "tooth", label: "Tooth #", type: "text", value: "19" },
        { id: "crown", label: "Existing crown", type: "text", value: "PFM" },
        { id: "reason", label: "Reason", type: "text", value: "recurrent caries at the distal margin" },
        { id: "shade", label: "Existing shade", type: "text", value: "A2" },
        { id: "anesthetic", label: "Anesthetic", type: "select", options: ANESTHETICS, value: ANESTHETICS[0] },
        { id: "carps", label: "Carpules", type: "text", value: "1" },
        { id: "block", label: "Injection", type: "text", value: "left IANB and long buccal" },
        { id: "next", label: "Continued treatment", type: "text", value: "Caries excavated; core buildup and provisional placed." },
      ],
      template: `P (crown removal):
#{{tooth}} existing {{crown}} crown removed due to {{reason}}. Existing crown shade {{shade}} recorded.
Topical 20% benzocaine applied. {{carps}} carpule(s) {{anesthetic}} administered as {{block}}; aspiration negative.
Isolated with Isodry to protect the airway. Crown sectioned buccally and occlusally with crown-removing burs and removed with crown spreader. 1 BW radiograph taken.
{{next}}`,
    },
  },

  /* ================================================ DIGITAL PREP & SCAN */
  {
    id: "digital-prep-scan",
    kind: "procedure",
    title: "Digital Prep & Scan (TRIOS) — Inlay · Onlay · Crown",
    category: "implants",
    duration: "~2 h",
    summary:
      "Chairside prep for a milled e.max CAD restoration: two putties (provisional + reduction guide), photos, rubber dam isolation, material-specific prep, Integrity or Telio provisional, two-cord retraction, and a TRIOS scan (opposing → prep arch → lock/trim/rescan prep → bite) under 1000 images.",
    cdt: [
      { code: "D2610", label: "Inlay, porcelain/ceramic, 1 surface" },
      { code: "D2620", label: "Inlay, porcelain/ceramic, 2 surfaces" },
      { code: "D2630", label: "Inlay, porcelain/ceramic, 3+ surfaces" },
      { code: "D2642", label: "Onlay, porcelain/ceramic, 2 surfaces" },
      { code: "D2643", label: "Onlay, porcelain/ceramic, 3 surfaces" },
      { code: "D2644", label: "Onlay, porcelain/ceramic, 4+ surfaces" },
      { code: "D2740", label: "Crown, porcelain/ceramic" },
    ],
    tags: ["digital", "TRIOS", "intraoral scanner", "CAD/CAM", "e.max CAD", "lithium disilicate", "inlay", "onlay", "crown", "HT", "LT", "Telio", "Integrity", "lock tool", "trim", "two-cord", "#1 cord", "#2 cord", "isthmus", "cavosurface 100–120°", "butt joint", "heavy chamfer", "reduction guide"],
    tray: [
      { group: "Case records", items: ["Mounted casts with wax-up", "Two putties: provisional matrix + reduction guide"] },
      { group: "Instrument kits", items: ["Fixed prosthodontics kit", "Rubber dam kit", "Radiograph sensor & holder", "Integrity gun + tips", "Composite gun", "LED curing light", "Extraoral camera, cheek retractors, mirrors", "Vita shade guide (HT/LT)"] },
      { group: "Rotary", items: ["High-speed & slow-speed handpieces", "Digital prep burs / fixed prosth diamonds (round-end, flat-end tapered)", "Fine finishing diamonds", "Extra-oral provisional burs, lab burs", "e.max intraoral and extraoral burs"] },
      { group: "Materials", items: ["Integrity (crown/onlay provisionals)", "Telio (inlay provisionals)", "Gluma desensitizer", "UltraTemp + tips or TempBond NE", "Retraction cords (#00/#0 bottom; #1–#2 top) + Hemodent", "Lab putty + activator", "Vaseline", "Microbrushes"] },
      { group: "Scanner", items: ["TRIOS scanner with clean, heated tip", "Scanning powder not required"] },
      { group: "Chairside disposables", items: ["Anesthetic, needle, topical", "Articulating paper", "Floss"] },
    ],
    timers: [
      { id: "cord-dwell", label: "Cord dwell (Hemodent)", seconds: 300 },
      { id: "telio-cure", label: "Cure Telio", seconds: 20 },
      { id: "gluma-prov", label: "Gluma scrub on prep", seconds: 15 },
      { id: "gluma-prov-wait", label: "Gluma dwell before air-dry", seconds: 30 },
      { id: "bite-roll", label: "Bite on cotton roll", seconds: 120 },
    ],
    steps: [
      { id: "ds1", title: "Before seating: putties, shade, photos", body: [
          "Make two putties from the cast: one for the provisional, one as a reduction guide.",
          "Shade under overhead, ambient and natural light. High translucency (HT) for inlays/onlays; low translucency (LT) for crowns.",
          "Pre-op photographs.",
        ] },
      { id: "ds2", title: "Pre-op occlusion & anesthesia", body: ["Mark and sketch contacts on target and adjacent teeth before anesthesia.", "Deliver local anesthetic."], checkpoint: "Start check: confirm tooth, restoration type (inlay/onlay/crown), material (e.max CAD) and shade before anesthesia." },
      { id: "ds3", title: "Isolate", body: ["Rubber dam whenever possible; Isodry in selected cases."] },
      { id: "ds4", title: "Prepare", body: [
          "Inlay/onlay: clear margins, 1.5 mm pulpal depth, 1.5 mm isthmus, axial walls diverging 6–10° to occlusal, 100–120° proximal cavosurface, rounded internal angles (especially axiopulpal).",
          "Onlay: reduce cusps 1.5–2.0 mm; butt joint or heavy chamfer on reduced cusps.",
          "Crown: 1.25–1.5 mm axial, 1.5–2.0 mm occlusal, 1.0–1.25 mm chamfer, finish line 0.5 mm supragingival, 6–10° taper, very rounded and smooth.",
          "Check clearance with the reduction-guide putty.",
        ],
        ebd: "Rounded, smooth internal geometry and no feather edges or undercuts improve both scanner capture and milling accuracy; supragingival margins scan and bond most predictably.",
        checkpoint: "Preparation review: dimensions per restoration type, smooth rounded geometry, no undercuts, margins clearly defined." },
      { id: "ds5", title: "Provisional", body: [
          "Crowns and onlays: Integrity from the provisional putty (see Provisional Fabrication).",
          "Inlays: Telio — twist to dispense, condense into the prep, shape with instruments, light-cure 20 s.",
        ],
        timers: ["telio-cure"] },
      { id: "ds6", title: "Pack cords", body: [
          "Soaked in Hemodent.",
          "Bottom cord: entirely below the margin, no tail.",
          "Top cord: at least #1, ideally #2; half its thickness in the sulcus, visible 360°, with a tail.",
        ],
        timers: ["cord-dwell"] },
      { id: "ds7", title: "Set up the case in TRIOS", body: [
          "Open the scanning software and select the operator.",
          "Existing patient: search and select, then New Case. New patient: enter patient ID, name and date of birth, then New Case.",
          "Select the laboratory/milling destination. Select the tooth on the model.",
          "Anatomy: restoration type (crown, inlay, onlay), material e.max CAD, shade.",
          "Enter a delivery date (required field). Next.",
        ] },
      { id: "ds8", title: "Scan", body: [
          "Opposing arch first. Maxillary: occlusal → buccal → lingual. Mandibular: occlusal → lingual → buccal.",
          "Prep arch next.",
          "Stay under ~1000 images per arch; 2000 is the absolute maximum (erase and rescan if over).",
          "With cords: use Lock to color everything except the prep, Trim to erase the prep, remove the top cord intraorally, and immediately rescan the prep.",
          "Turn colors off to judge the margin. Confirm interproximal contacts and occlusal clearance are captured. Mark the tooth.",
          "Fill any areas the software flags.",
          "Bite scan last (distal to mesial); the software auto-occludes.",
        ],
        checkpoint: "Scan acceptance: continuous margin 360°, contacts and clearance captured, bite aligned, image count within limits. Then send." },
      { id: "ds9", title: "Cement provisional", body: [
          "Gluma on vital preps: scrub 15 s, wait 30 s, air-dry.",
          "Cement, clean excess, remove all cords, check occlusion. Optional post-op photos.",
        ],
        timers: ["gluma-prov", "gluma-prov-wait", "bite-roll"],
        checkpoint: "Provisional review: no excess cement, cords removed, occlusion acceptable. Then complete the note and codes." },
    ],
    matrices: [
      { title: "Digital prep guidelines", columns: ["Parameter", "Inlay", "Onlay", "Crown"], rows: [
          ["Margins", "Clear, defined", "Clear, defined", "0.5 mm supragingival"],
          ["Pulpal / occlusal depth", "≥ 1.5 mm pulpal", "≥ 1.5 mm pulpal; cusps 1.5–2.0 mm", "1.5–2.0 mm occlusal"],
          ["Isthmus", "≥ 1.5 mm", "≥ 1.5 mm", "—"],
          ["Axial walls / taper", "Diverge 6–10° to occlusal", "Diverge 6–10° to occlusal", "1.25–1.5 mm axial, 6–10° taper"],
          ["Proximal cavosurface", "100–120°", "100–120°", "—"],
          ["Finish line", "—", "Butt joint or heavy chamfer on reduced cusps", "1.0–1.25 mm chamfer"],
          ["Internal angles", "Rounded (esp. axiopulpal)", "Rounded (esp. axiopulpal)", "Very rounded & smooth"],
          ["Translucency", "HT", "HT", "LT"],
        ] },
      { title: "TRIOS scan protocol", columns: ["Step", "Detail"], rows: [
          ["1 · Opposing", "Max: O → B → L · Mand: O → L → B"],
          ["2 · Prep arch", "Full arch or quadrant"],
          ["3 · Lock / trim / rescan", "Lock all but prep → trim prep → pull top cord → rescan prep"],
          ["4 · Bite", "Distal → mesial; auto-occlude"],
          ["Image limit", "~1000 ideal; 2000 absolute max"],
        ] },
    ],
    figures: ["crownPrep"],
    postOp: ["Avoid sticky and hard foods on the provisional.", "Telio inlay provisionals are soft: chew on the other side.", "Temperature sensitivity for a few days is common."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "45" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "tooth", label: "Tooth #", type: "text", value: "19" },
        { id: "surfaces", label: "Surfaces", type: "text", value: "MODB" },
        { id: "type", label: "Restoration", type: "select", options: ["e.max CAD inlay", "e.max CAD onlay", "e.max CAD crown"], value: "e.max CAD onlay" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "118/76, 70 bpm" },
        { id: "anesthetic", label: "Anesthetic", type: "select", options: ANESTHETICS, value: ANESTHETICS[0] },
        { id: "carps", label: "Carpules", type: "text", value: "1" },
        { id: "block", label: "Injection", type: "text", value: "left IANB and long buccal" },
        { id: "iso", label: "Isolation", type: "select", options: ["rubber dam", "Isodry (size M)"], value: "rubber dam" },
        { id: "cords", label: "Retraction", type: "select", options: ["#00 and #1 cords soaked in Hemodent (two-cord technique).", "#00 and #2 cords soaked in Hemodent (two-cord technique).", "No retraction required (supragingival margins)."], value: "No retraction required (supragingival margins)." },
        { id: "prov", label: "Provisional", type: "select", options: ["Provisional fabricated with Integrity; adjusted, polished, cemented with UltraTemp over Gluma. Excess removed; contacts flossed.", "Inlay provisionalized with Telio, shaped and light-cured 20 s; patient not occluding on Telio."], value: "Provisional fabricated with Integrity; adjusted, polished, cemented with UltraTemp over Gluma. Excess removed; contacts flossed." },
        { id: "shade", label: "Shade", type: "text", value: "HT-A2" },
        { id: "nv", label: "Next visit", type: "text", value: "#19 e.max onlay delivery" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for #{{tooth}}-{{surfaces}} {{type}} preparation and digital scan.
Medical history reviewed: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O:
Pre-op photographs taken. Pre-op occlusal and excursive contacts recorded.

A:
#{{tooth}}-{{surfaces}}: indicated for {{type}} per approved treatment plan.

P:
Topical 20% benzocaine applied. {{carps}} carpule(s) {{anesthetic}} administered as {{block}}; aspiration negative.
Isolation: {{iso}}. Preparation completed to digital prep guidelines; clearance verified with reduction putty. {{cords}}
Prep arch, opposing arch and bite scanned with TRIOS intraoral scanner. Margins, occlusal clearance and interproximal contacts verified on scan; case sent for design and milling.
{{prov}} Occlusal and excursive contacts evaluated and adjusted.
Shade {{shade}} selected; patient confirmed with hand mirror.
Post-op instructions given: provisional care, sensitivity.

NV: {{nv}}`,
    },
  },

  /* ============================================ DIGITAL DELIVERY (E.MAX BONDING) */
  {
    id: "digital-delivery-emax",
    kind: "procedure",
    title: "Digital Delivery — e.max Try-in, Crystallization & Adhesive Cementation",
    category: "implants",
    duration: "~90 min (incl. 25 min crystallization)",
    summary:
      "Delivery of a milled e.max CAD inlay, onlay or crown: sprue removal, pre-crystallization try-in and adjustment, 25 min crystallization, then adhesive bonding — Ivoclean 20 s, 5% HF (IPS Ceramic Etching Gel) 20 s, Clearfil Ceramic Primer 60 s on the restoration; pumice, Consepsis and A+B primer 30 s on the tooth; Panavia cement cured 20 s per surface.",
    cdt: [
      { code: "D2610", label: "Inlay, porcelain/ceramic, 1 surface" },
      { code: "D2620", label: "Inlay, porcelain/ceramic, 2 surfaces" },
      { code: "D2630", label: "Inlay, porcelain/ceramic, 3+ surfaces" },
      { code: "D2642", label: "Onlay, porcelain/ceramic, 2 surfaces" },
      { code: "D2643", label: "Onlay, porcelain/ceramic, 3 surfaces" },
      { code: "D2644", label: "Onlay, porcelain/ceramic, 4+ surfaces" },
      { code: "D2740", label: "Crown, porcelain/ceramic" },
    ],
    tags: ["e.max", "lithium disilicate", "crystallization", "blue state", "sprue", "Ivoclean", "hydrofluoric acid", "5% HF", "IPS Ceramic Etching Gel", "silane", "MDP", "Clearfil Ceramic Primer", "Panavia", "resin cement", "Oxyguard", "tack cure", "Fit-Checker", "pick-n-stick", "adhesive cementation", "Telio"],
    tray: [
      { group: "Case records", items: ["Milled restoration (pre-crystallized)", "Mounted casts, putty matrix (in case of remake)"] },
      { group: "Instrument kits", items: ["Fixed prosthodontics kit", "Perio kit (sickle scaler)", "Sharp hatchet (Telio removal)", "Radiograph sensor & holder", "Prophy handpiece + angle", "Extraoral camera, retractors, mirrors", "Isodry mouthpiece", "Pick-n-stick"] },
      { group: "Rotary", items: ["Diamond disc (sprue sectioning) and pink/red smoothing disc", "e.max extraoral and intraoral adjustment burs", "e.max polishing burs (sequence)", "Fixed prosth diamonds, lab burs"] },
      { group: "Materials", items: ["Ivoclean", "IPS Ceramic Etching Gel (5% HF)", "Clearfil Ceramic Primer (silane + MDP)", "Panavia cement kit (tooth primer A + B, paste A + B, Oxyguard)", "Consepsis", "Fluoride-free pumice", "Fit-Checker / Occlude spray", "Cavicide", "Retraction cords + Hemodent", "Dappen dishes, mixing pad, microbrushes"] },
      { group: "Chairside disposables", items: ["Articulating paper (two colors)", "Floss", "Dry angles, cotton rolls"] },
    ],
    timers: [
      { id: "cavicide", label: "Cavicide soak", seconds: 60 },
      { id: "crystallize", label: "Crystallization firing", seconds: 1500 },
      { id: "ivoclean", label: "Ivoclean", seconds: 20 },
      { id: "hf", label: "5% HF etch (e.max)", seconds: 20 },
      { id: "ceramic-primer", label: "Clearfil Ceramic Primer", seconds: 60 },
      { id: "tooth-primer", label: "Tooth primer A+B", seconds: 30 },
      { id: "tack", label: "Tack cure", seconds: 3, note: "2–5 s, then remove excess at gel stage" },
      { id: "cure-surface", label: "Cure per surface", seconds: 20 },
    ],
    steps: [
      { id: "dd1", title: "Before seating", body: ["Collect the restoration and disinfect it with Cavicide."] },
      { id: "dd2", title: "Pre-op occlusion", body: ["Mark and sketch contacts on target and adjacent teeth before anesthesia."], checkpoint: "Start check: confirm tooth, restoration type, shade and that the milled unit matches the design." },
      { id: "dd3", title: "Remove sprue", body: [
          "Hold the restoration, not the block, so the restoration cannot fly off.",
          "Section the sprue with a diamond disc without touching the restoration.",
          "Smooth the remaining stub with the pink/red disc.",
        ] },
      { id: "dd4", title: "Isolate & remove provisional", body: [
          "Isodry keeps the field dry and guards against aspiration.",
          "Integrity: fingers → gentle hemostat → sickle scaler at the margins if needed. Scale off cement.",
          "Telio: wiggle out with a sharp hatchet; usually one piece.",
          "Pumice with a prophy angle (fluoride-free; not prophy paste).",
        ] },
      { id: "dd5", title: "Try-in (pre-crystallization)", body: [
          "Floss contacts while holding the restoration.",
          "Explore margins.",
          "If it does not seat: contacts first (articulating paper, adjust restoration). Then mark the intaglio with articulating paper over the prep or Fit-Checker spray, and relieve the prep: round sharp edges and marked areas.",
          "Esthetics approved by the patient.",
          "Bitewing (PA for anteriors) to confirm seating and closed margins.",
        ],
        checkpoint: "Pre-crystallization review: seating, margins (clinical and radiographic), contacts, esthetics." },
      { id: "dd6", title: "Adjust occlusion & contours", body: [
          "Centric with one color, excursions with a second.",
          "Adjust extraorally with ceramic burs; adjust contours as needed.",
          "Polish with e.max polishing burs in sequence before crystallizing.",
        ] },
      { id: "dd7", title: "Clean & crystallize", body: [
          "Remove all articulating marks.",
          "Cavicide 1 min, rinse, hold in water.",
          "Crystallization firing: 25 min.",
          "Re-try: confirm contacts, margins and occlusion.",
        ],
        timers: ["cavicide", "crystallize"] },
      { id: "dd8", title: "Treat the restoration", body: [
          "Air-dry completely. Inlays/onlays: hold with a pick-n-stick on the occlusal.",
          "Ivoclean 20 s → rinse well → dry (removes saliva and phosphate contamination from try-in).",
          "IPS Ceramic Etching Gel (5% HF) 20 s on the intaglio → rinse well → dry. Creates micro-retention in the glass phase.",
          "Clearfil Ceramic Primer (silane + MDP) 60 s → dry.",
        ],
        warn: "Hydrofluoric acid: gloves, eye protection, keep off skin and soft tissue, rinse into HVE, neutralize waste per protocol.",
        ebd: "For lithium disilicate: 5% HF for 20 s followed by a silane-containing primer is the evidence-based surface treatment; do not air-abrade (it weakens glass ceramics).",
        timers: ["ivoclean", "hf", "ceramic-primer"] },
      { id: "dd9", title: "Treat the tooth", body: [
          "Isolate.",
          "Pumice with a prophy cup (fluoride-free), then Consepsis.",
          "Mix equal drops of tooth primer A and B; apply 30 s; gently dry.",
        ],
        ebd: "Optional selective enamel etch (35% phosphoric acid, 15 s on enamel margins) before the self-etch primer improves enamel bond for inlays and onlays.",
        timers: ["tooth-primer"] },
      { id: "dd10", title: "Cement with Panavia", body: [
          "Mix equal Paste A and Paste B with the plastic spatula.",
          "Apply to the intaglio with a microbrush. Seat.",
          "Remove excess cement (tack-cure 2–5 s and remove at gel stage if preferred).",
          "Apply Oxyguard over the margins to block oxygen inhibition.",
          "Light-cure 20 s per surface.",
        ],
        ebd: "Tack-curing then removing excess at the gel stage, and Oxyguard over the margins, give complete margin polymerization with less cement flash to remove after full cure.",
        timers: ["tack", "cure-surface"] },
      { id: "dd11", title: "Verify & polish", body: [
          "Margins, contacts with floss, centric and excursive contacts; adjust as needed.",
          "Re-polish anything adjusted.",
        ],
        checkpoint: "Final delivery review: no cement remnants, margins sealed, contacts, occlusion matching pre-op. Then complete the note and codes." },
    ],
    matrices: [
      { title: "Adhesive protocol · e.max (lithium disilicate)", columns: ["Surface", "Step", "Time"], rows: [
          ["Restoration", "Ivoclean → rinse → dry", "20 s"],
          ["Restoration", "IPS Ceramic Etching Gel (5% HF) → rinse → dry", "20 s"],
          ["Restoration", "Clearfil Ceramic Primer (silane + MDP) → dry", "60 s"],
          ["Tooth", "Pumice (fluoride-free) → Consepsis", "—"],
          ["Tooth", "Primer A + B mixed → dry", "30 s"],
          ["Cement", "Panavia A + B → seat → remove excess → Oxyguard", "—"],
          ["Cure", "Each surface", "20 s"],
          ["Crystallization", "Firing", "25 min"],
        ] },
    ],
    postOp: ["No sticky foods for 24 h.", "Call if the bite feels uneven or there is pain.", "Night guard if you grind your teeth; ceramic can chip under heavy clenching."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "45" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "tooth", label: "Tooth #", type: "text", value: "19" },
        { id: "surfaces", label: "Surfaces", type: "text", value: "MODB" },
        { id: "type", label: "Restoration", type: "select", options: ["e.max CAD inlay", "e.max CAD onlay", "e.max CAD crown"], value: "e.max CAD onlay" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "118/76, 70 bpm" },
        { id: "anes", label: "Anesthesia", type: "select", options: ["No anesthesia required.", "Local anesthetic administered for patient comfort; aspiration negative."], value: "No anesthesia required." },
        { id: "prov", label: "Provisional", type: "select", options: ["Integrity provisional removed; temporary cement removed with scaler.", "Telio provisional removed with hatchet."], value: "Integrity provisional removed; temporary cement removed with scaler." },
        { id: "adjust", label: "Adjustments", type: "select", options: ["No adjustments required.", "Interproximal contacts adjusted with bur; occlusal and excursive contacts adjusted extraorally and polished.", "Preparation relieved at marked areas; contacts and occlusion adjusted and polished."], value: "Interproximal contacts adjusted with bur; occlusal and excursive contacts adjusted extraorally and polished." },
        { id: "nv", label: "Next visit", type: "text", value: "Recall" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for #{{tooth}}-{{surfaces}} {{type}} delivery.
Medical history reviewed: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O:
Pre-op occlusal contacts recorded. Restoration disinfected; sprue removed and smoothed.

A:
#{{tooth}}-{{surfaces}}: {{type}} ready for delivery.

P:
{{anes}} Isodry placed. {{prov}} Tooth cleaned with fluoride-free pumice.
Pre-crystallization try-in: marginal adaptation satisfactory, verified visually, tactilely and radiographically (1 BW). Contacts satisfactory with floss. Patient approved shade and shape. {{adjust}} Polished; crystallized (25 min); re-tried and verified.
Restoration: Ivoclean 20 s, rinsed, dried; IPS Ceramic Etching Gel (5% HF) 20 s, rinsed, dried; Clearfil Ceramic Primer 60 s, dried.
Tooth: pumice, Consepsis; Panavia tooth primer A+B 30 s, dried.
Cemented with Panavia per manufacturer's instructions; excess removed; Oxyguard applied; light-cured 20 s per surface.
Margins and contacts verified. Centric and excursive contacts evaluated and adjusted; ceramic polished. Patient satisfied with bite and esthetics.
Post-op instructions given: 24 h set, no sticky foods, uneven bite, pain.

NV: {{nv}}`,
    },
  },

  /* ============================================ IMPLANT-LEVEL IMPRESSION */
  {
    id: "implant-level-impression",
    kind: "procedure",
    title: "Implant-Level Impression (Closed Tray) & Master Cast",
    category: "implants",
    duration: "~60 min + lab",
    summary:
      "Closed-tray PVS impression of a single implant for a custom abutment and crown: identify implant system and platform from the surgical note, remove healing abutment, hand-tighten the impression coping, verify seating radiographically, medium/heavy-body PVS for 6 min, replace the healing abutment, then pour with an implant replica and soft-tissue moulage in Type IV stone.",
    cdt: [
      { code: "D6057", label: "Custom fabricated abutment, includes placement" },
      { code: "D6058", label: "Abutment-supported porcelain/ceramic crown" },
    ],
    tags: ["implant", "implant-level impression", "closed tray", "open tray", "impression coping", "transfer coping", "implant replica", "analog", "healing abutment", "Straumann", "hand driver", "soft tissue moulage", "Silky Rock", "Type IV stone", "custom abutment", "titanium", "scan body", "Regisil", "PVS"],
    tray: [
      { group: "Case records", items: ["Surgical note: implant system, platform/diameter, position", "Diagnostic casts (tray sizing)"] },
      { group: "Instrument kits", items: ["Restorative kit", "Implant restorative kit (hand driver for the system)", "Impression coping (closed tray) + cap if the system uses one", "Implant replica (analog) matching the platform", "Radiograph sensor & holder", "Vita shade guide"] },
      { group: "Materials", items: ["Stock impression trays (upper & lower)", "PVS tray adhesive + clean brushes + dappen dish", "Heavy-body and medium-body PVS + tips", "Alginate, water measure, bowl, spatula, alginate spray adhesive", "Regisil + tip (bite registration)", "Soft-tissue moulage, vaseline", "Type IV stone (Silky Rock)"] },
      { group: "Chairside disposables", items: ["Gauze throat pack", "Floss (tether the driver)", "Paper towels for patient"] },
    ],
    timers: [
      { id: "adhesive-dry", label: "Tray adhesive dry", seconds: 300 },
      { id: "pvs-set", label: "PVS set (full)", seconds: 360 },
      { id: "pour", label: "Pour alginate within", seconds: 900, note: "Pour within 15 min" },
    ],
    steps: [
      { id: "ii1", title: "Before seating: components & trays", body: [
          "From the surgical note, confirm implant brand and size; gather the matching impression coping, implant replica and driver.",
          "Size trays on the diagnostic casts. PVS adhesive with a clean brush from a dappen dish, thin layer, dry up to 5 min. Alginate spray adhesive on the opposing tray.",
        ],
        timers: ["adhesive-dry"] },
      { id: "ii2", title: "Evaluate tissue & space", body: ["Peri-implant tissue health around the healing abutment (no inflammation, bleeding or suppuration).", "Restorative space; decide whether opposing enameloplasty is needed."], checkpoint: "Start check: implant system and platform confirmed, osseointegration and tissue health acceptable, restorative space adequate." },
      { id: "ii3", title: "Shade", body: ["Select the crown shade under overhead, ambient and natural light."] },
      { id: "ii4", title: "Remove healing abutment", body: ["Gauze throat pack. Tether the hand driver with floss.", "Unscrew the healing abutment counterclockwise."], warn: "Every loose implant component near the airway is tethered or covered by a throat pack." },
      { id: "ii5", title: "Seat impression coping", body: ["Thread by hand until mostly seated, then gently hand-tighten with the driver.", "Work promptly: peri-implant soft tissue collapses within minutes without the abutment."] },
      { id: "ii6", title: "Verify seating", body: ["PA or bitewing with the beam perpendicular to the implant–coping junction; there should be no gap."], ebd: "A radiograph taken perpendicular to the implant platform is the reliable way to confirm complete coping seating; angled films can hide a gap.", checkpoint: "Coping seating verified radiographically before the impression." },
      { id: "ii7", title: "Take the impression", body: [
          "Straumann: snap the coping cap on in the buccolingual direction.",
          "Brief the patient (chin down, towels, suction); have an assistant.",
          "Assistant loads heavy-body PVS. Dry the coping and adjacent teeth.",
          "Syringe medium-body PVS into the sulcus around the coping.",
          "Seat the tray; hold the full 6 min.",
          "Remove and inspect: coping impression crisp, no voids around it.",
        ],
        ebd: "Closed tray suits single, near-parallel implants. Use open tray for multiple or divergent implants. A digital scan body with an intraoral scan is an accurate alternative for single units.",
        timers: ["pvs-set"],
        checkpoint: "Impression acceptance: coping position captured, sulcus detail complete, no voids or pulls." },
      { id: "ii8", title: "Replace healing abutment", body: ["Unscrew and remove the impression coping.", "Replace the healing abutment with the hand driver; hand-tight, do not over-tighten."], checkpoint: "Healing abutment fully seated and hand-tight." },
      { id: "ii9", title: "Opposing & bite", body: ["Alginate of the opposing arch at the very end; pour within 15 min.", "Bite registration with Regisil."], timers: ["pour"] },
      { id: "ii10", title: "Pour the master cast", body: [
          "Attach the impression coping to the implant replica; seat the assembly back into the impression.",
          "Light coat of vaseline on the PVS and the gingival third of the replica.",
          "Soft-tissue moulage around the gingival third of the replica; control spread onto adjacent teeth with a microbrush. Let it set.",
          "Pour in Type IV stone (Silky Rock). Trim. Remove the coping.",
          "Mount master and diagnostic casts the same way.",
          "Send the laboratory authorization for the custom abutment.",
        ] },
    ],
    matrices: [
      { title: "Closed vs. open tray", columns: ["Factor", "Closed tray (transfer)", "Open tray (pick-up)"], rows: [
          ["Best for", "Single, near-parallel implants", "Multiple or divergent implants, full arch"],
          ["Coping", "Stays in mouth; reinserted into impression", "Picked up in impression via tray window"],
          ["Accuracy", "Good for single units", "Higher for multiple units"],
          ["Patient comfort", "Easier", "Needs limited-access tray"],
        ] },
    ],
    labRx: `DENTAL LABORATORY WORK AUTHORIZATION
Please fabricate a custom abutment for #{{tooth}}.
Implant: {{system}}, diameter {{diameter}} mm
Abutment type: {{abutment}}
Emergence profile: Default
Planned crown: {{crown_plan}}
Shade: {{shade}}
Enclosures: Implant-level PVS impression with coping and replica, master cast with soft-tissue moulage, opposing cast, bite registration
Return by: ______   Prescriber signature / license #: ______`,
    postOp: ["The healing cap stays in place; brush it gently like a tooth.", "Call if the healing cap loosens or feels high."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "58" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "tooth", label: "Implant site #", type: "text", value: "13" },
        { id: "system", label: "Implant system", type: "text", value: "Straumann" },
        { id: "diameter", label: "Diameter (mm)", type: "text", value: "3.6" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "126/80, 72 bpm" },
        { id: "tissue", label: "Tissue", type: "text", value: "peri-implant tissue healthy, no inflammation or bleeding; restorative space adequate without enameloplasty" },
        { id: "abutment", label: "Abutment", type: "select", options: ["Titanium custom abutment", "Zirconia custom abutment on titanium base"], value: "Titanium custom abutment" },
        { id: "crown_plan", label: "Planned crown", type: "text", value: "cement-retained all-ceramic e.max CAD/CAM crown" },
        { id: "shade", label: "Shade", type: "text", value: "A2" },
        { id: "nv", label: "Next visit", type: "text", value: "#13 custom abutment and crown delivery" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for #{{tooth}} implant-level impression ({{system}}, {{diameter}} mm).
Medical history reviewed: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O:
#{{tooth}}: {{tissue}}.

A:
#{{tooth}}: osseointegrated implant ready for restorative impression.

P:
Gauze throat pack placed; hand driver tethered with floss. Healing abutment removed. Closed-tray impression coping hand-tightened onto implant. 1 PA taken to verify complete seating.
Final impression taken with medium-body and heavy-body PVS, 6 min set; coping position and sulcus detail verified. Impression coping removed; healing abutment replaced hand-tight.
Alginate impression of opposing arch taken and poured within 15 min. Bite registration taken with Regisil.
Shade {{shade}} selected; patient confirmed with hand mirror.
Master cast poured with implant replica and soft-tissue moulage in Type IV stone; casts mounted. Laboratory authorization sent for {{abutment}}; planned {{crown_plan}}.

NV: {{nv}}`,
    },
  },
];

/* -------------------------------------------------------------------------- */
/* 2d. REMOVABLE PROSTHODONTICS DATASET (manual schema)                       */
/*                                                                            */
/* Embedded verbatim from removable-procedures.js. Complete-denture values    */
/* (tray extension, 130 °F bath, compound width, #8 relief hole, set times,   */
/* VDO, rim heights, facebow, PIP, reline) and brands are from the source     */
/* manual. RPD surveying / prep / framework specs are standard references     */
/* marked "Std ref". Figures maxBorder / mandBorder map to the zone diagrams. */
/* -------------------------------------------------------------------------- */

/* Shared signature block appended to every lab authorization */
const LAB_SIG = `Return by: ______
Prescriber: ______________________   License #: __________   Signature: ______________________
Date: ______   Case pan / enclosures verified: ☐`;

const REMOVABLE_PROCEDURES: ManualProcedure[] = [
  /* ============================================= CD #1 · EXAM & PRELIMINARY IMPRESSIONS */
  {
    id: "cd-1-exam-preliminary-impressions",
    kind: "procedure",
    title: "Complete Dentures #1 · Exam, Diagnosis & Preliminary Impressions",
    category: "removable",
    duration: "~90 min",
    summary:
      "Edentulous comprehensive exam: medication and medical history, vitals, EOE/IOE and oral cancer screening, pre-prosthetic surgery screen, photos, treatment plan and consent, alginate preliminary impressions with cheek retractors (seat posterior, roll anterior), and expectation management.",
    cdt: [
      { code: "D0150", label: "Comprehensive oral evaluation, new or established patient" },
      { code: "D0350", label: "2D oral/facial photographic images" },
      { code: "D0470", label: "Diagnostic casts" },
      { code: "D1320", label: "Tobacco counseling (if applicable)" },
      { code: "D5110", label: "Complete denture, maxillary (planned)" },
      { code: "D5120", label: "Complete denture, mandibular (planned)" },
    ],
    tags: ["complete denture", "F/F", "edentulous", "COE", "diagnostic impression", "preliminary impression", "alginate", "cheek retractor", "pre-prosthetic surgery", "epulis fissuratum", "tuberosity", "tori", "papillary hyperplasia", "implant overdenture", "IOD", "consent", "expectations", "custom tray"],
    tray: [
      { group: "Instrument kits", items: ["Exam kit", "Cheek retractors", "Intraoral/extraoral camera", "Blood pressure cuff"] },
      { group: "Materials", items: ["Alginate, water measure", "Alginate bowl + spatula", "Edentulous stock trays (sized)", "Alginate spray adhesive", "Utility/boxing wax (tray extension)"] },
      { group: "Paperwork", items: ["Medical history and medication list", "Denture consent form", "Treatment plan"] },
    ],
    timers: [
      { id: "pour", label: "Pour alginate within", seconds: 900, note: "Pour promptly; within 15 min" },
    ],
    steps: [
      { id: "e1", title: "History & vitals", body: [
          "Update medications and allergies; complete medical history review.",
          "Record tobacco use; provide cessation counseling if applicable.",
          "Blood pressure and pulse (glucose if indicated).",
          "Chief complaint and denture history (current/previous dentures, what the patient likes and dislikes about them).",
        ],
        checkpoint: "Start check: medical history, medications, vitals and the day's plan reviewed before the exam." },
      { id: "e2", title: "Extraoral & intraoral exam", body: [
          "EOE: soft tissue, swelling, asymmetry, lymph nodes. TMJ: deviation, crepitus, locking.",
          "IOE: ridge form and resorption, palatal vault, soft-tissue health, saliva quality, tongue size/position.",
          "Oral cancer screening: lips, buccal mucosa, tongue (dorsal/lateral/ventral), floor of mouth, palate, oropharynx.",
        ] },
      { id: "e3", title: "Pre-prosthetic surgery screen", body: [
          "Hyperplastic replacement of resorbed ridges; epulis fissuratum; papillomatosis; inflammatory papillary hyperplasia.",
          "Unfavorable frenum attachments; enlarged maxillary tuberosities; limited restorative space.",
          "Bony prominences, undercuts and ridges (tori, exostoses); jaw-size discrepancies.",
          "Mental foramen pressure from resorption; need for vestibuloplasty.",
        ],
        warn: "Refer for pre-prosthetic surgery before impressions when any of these would compromise stability, support or comfort." },
      { id: "e4", title: "Photos & treatment plan", body: [
          "Intraoral and extraoral photographs.",
          "Present options: conventional F/F, implant-retained overdenture, immediate/interim prostheses. Costs, visit count and timeline.",
        ],
        ebd: "A two-implant mandibular overdenture is widely recommended as a first-choice standard of care for the edentulous mandible (McGill/York consensus); discuss it with every F/F patient.",
        checkpoint: "Treatment plan approved and signed; informed consent obtained." },
      { id: "e5", title: "Preliminary impressions", body: [
          "These casts become the custom trays, so they must capture the full denture-bearing area.",
          "Extend the stock tray with wax where needed to capture the tuberosity or retromolar pad.",
          "Cheek retractors held by the patient: out and up for maxillary, out and down for mandibular.",
          "Load alginate, seat posterior first, then roll anteriorly.",
          "Pour promptly.",
        ],
        timers: ["pour"],
        checkpoint: "Impression acceptance: tuberosities/hamular notches, vibrating-line area, retromolar pads, full vestibular depth captured without voids." },
      { id: "e6", title: "Manage expectations", body: [
          "Dentures are not natural teeth; chewing efficiency is a fraction of a natural dentition.",
          "Expect difficulty speaking or eating at first, food under dentures, looseness (especially mandibular), possible adhesive use, extra saliva, sore spots.",
          "Review the denture consent form now, especially for first-time denture wearers.",
        ] },
    ],
    labRx: `DENTAL LABORATORY WORK AUTHORIZATION
Patient: {{patient_id}}   Age/Sex: {{age}} {{sex}}
Case: Complete dentures — maxillary and mandibular
Enclosed: Maxillary and mandibular preliminary casts (outline drawn in pencil)
Instructions: Fabricate maxillary and mandibular custom impression trays in light-cured tray resin.
 • Borders 2–3 mm short of the vestibular depth (outline on cast); relieve frena.
 • Maxillary posterior border just beyond the vibrating line.
 • Single-layer wax spacer (~2 mm) with tissue stops; midline handle not interfering with lip.
Return: Trays for border molding and final impression.
${LAB_SIG}`,
    postOp: ["Bring your current dentures (if any) to every visit.", "The next visit (border molding) is long; bring something to read."],
    soap: {
      fields: [
        { id: "patient_id", label: "Patient ID", type: "text", value: "______" },
        { id: "age", label: "Age", type: "text", value: "71" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "cc", label: "Chief complaint", type: "text", value: "my old dentures are loose and I can't chew" },
        { id: "mhx", label: "Medical history", type: "text", value: "hypertension controlled with lisinopril; no changes" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "132/84, 74 bpm" },
        { id: "denture_hx", label: "Denture history", type: "text", value: "edentulous 12 years; current F/F 8 years old" },
        { id: "exam", label: "Exam findings", type: "textarea", value: "EOE WNL; TMJ WNL; IOE WNL, no soft-tissue pathology. Oral cancer screening negative. Moderately resorbed ridges; U-shaped palate." },
        { id: "preprosth", label: "Pre-prosthetic", type: "select", options: ["Residual ridges suitable for F/F; no pre-prosthetic intervention needed.", "Pre-prosthetic surgery indicated before impressions (see referral)."], value: "Residual ridges suitable for F/F; no pre-prosthetic intervention needed." },
        { id: "nv", label: "Next visit", type: "text", value: "Border molding and final impressions with custom trays" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for complete denture evaluation. CC: "{{cc}}".
Medical history: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.
Denture history: {{denture_hx}}.

O:
{{exam}}
Photographs taken.

A:
Completely edentulous maxilla and mandible. {{preprosth}}
Implant-retained overdenture option discussed.

P:
Preliminary alginate impressions taken with cheek retraction; poured for custom trays.
Treatment options, costs and timeline reviewed. Advantages, limitations and expectations of complete dentures discussed. Questions answered; verbal and written consent obtained.

NV: {{nv}}`,
    },
  },

  /* ============================================= CD #2 · BORDER MOLDING & FINAL IMPRESSION */
  {
    id: "cd-2-border-molding-final-impression",
    kind: "procedure",
    title: "Complete Dentures #2 · Border Molding & Final Impression",
    category: "removable",
    duration: "~2.5 h",
    summary:
      "Custom-tray adjustment (2–3 mm short of the vestibule, frena relieved, posterior border just past the vibrating line), zone-by-zone greenstick border molding tempered in a 130 °F bath, then light-body PVS final impressions with border movements after 30 s and a full 6 min set.",
    cdt: [
      { code: "D5110", label: "Complete denture, maxillary (in progress)" },
      { code: "D5120", label: "Complete denture, mandibular (in progress)" },
    ],
    tags: ["border molding", "greenstick", "compound", "custom tray", "vibrating line", "posterior palatal seal", "Thompson stick", "Hanau torch", "water bath 130°F", "retromylohyoid", "buccal shelf", "coronoid", "light-body PVS", "final impression", "#8 round bur", "relief hole"],
    tray: [
      { group: "Case records", items: ["Custom trays (verified before the visit)"] },
      { group: "Instrument kits", items: ["Exam kit", "Waxing kit", "Lab handpiece + lab burs (incl. #8 round)", "Water bath", "Hanau torch", "PVS dispensing guns", "Cheek retractors"] },
      { group: "Materials", items: ["Greenstick compound", "Thompson (indelible) stick", "#11 scalpel blades", "Light- or medium-body PVS ×2 + tips", "PVS tray adhesive + clean brushes + dappen dish", "Tongue depressors", "Matches / torch fuel"] },
    ],
    timers: [
      { id: "adhesive-dry", label: "Tray adhesive dry", seconds: 300 },
      { id: "move-delay", label: "Start border movements after", seconds: 30 },
      { id: "pvs-set", label: "PVS set (full)", seconds: 360 },
    ],
    steps: [
      { id: "b1", title: "Before the visit", body: ["Trays verified 1–2 days before.", "Warn the patient the visit is long."], checkpoint: "Start check: custom trays verified; water bath set to 130 °F." },
      { id: "b2", title: "Adjust tray extensions", body: [
          "Borders 2–3 mm short of vestibular depth: the edge of your fingertip should fit around the entire border. Reduce with lab burs where it doesn't.",
          "Relieve frena: pulling lips and cheeks must not move the tray.",
          "Patient says \"ah\"; mark the vibrating line with a Thompson stick; the maxillary tray should end just beyond it (mark visible on the tray).",
        ],
        checkpoint: "Tray extensions verified before border molding." },
      { id: "b3", title: "Border mold with greenstick", body: [
          "Dry the tray completely, or the compound will snap off.",
          "Rotate the stick through the Hanau flame constantly; when it begins to bend, roll it onto the tray border (maxillary posterior palatal zone: onto the intaglio, not the edge).",
          "Shape tall and narrow with wet fingers. Temper in the 130 °F bath.",
          "Retract with a mirror, rotate the tray in without disturbing the compound, then have the patient perform the zone movements (see matrix).",
          "Molded compound turns shorter, rolled and matte. Shiny or show-through areas: reheat to glassy, temper, reinsert, repeat.",
          "Remove compound that dripped into the intaglio (a heated scalpel helps); thin buccolingual bulk.",
          "Check symmetry and smoothness. Trim to 3–4 mm wide (trim excess vertically on the buccal; do not trim the intaglio side except drips).",
        ],
        checkpoint: "Border molding review: complete, symmetrical, matte, no show-through; ready for final impression." },
      { id: "b4", title: "Prepare trays", body: [
          "Remove wax spacers.",
          "Relief hole in the center of the maxillary palate (rugae area, midline) with a #8 round bur.",
          "Tray adhesive with a new brush each time, no double-dipping. Let dry.",
        ],
        timers: ["adhesive-dry"] },
      { id: "b5", title: "Final impressions", body: [
          "Warn the patient: 6 full minutes; towel and suction ready.",
          "Thin (~2 mm) layer of light-body PVS in the tray and over the compound; roll it up and over the borders with a tongue depressor.",
          "Patient holds cheek retractors. Seat carefully.",
          "After 30 s, have the patient repeat the border-molding movements.",
          "Hold for the full 6 min. Repeat for the other arch.",
        ],
        timers: ["move-delay", "pvs-set"],
        checkpoint: "Final impression acceptance: continuous rolled borders, no tray show-through on tissue-bearing areas, posterior palatal zone captured, no voids." },
    ],
    matrices: [
      { title: "Border-molding zones & patient movements", columns: ["Arch", "Zone", "Movement"], rows: [
          ["Maxillary", "Tuberosity / distobuccal (coronoid)", "Suck on finger; move jaw side to side"],
          ["Maxillary", "Buccal & labial vestibule", "Suck on finger; smile; gently massage lip and cheek"],
          ["Maxillary", "Posterior palatal seal", "Suck on finger; swallow"],
          ["Mandibular", "Buccal vestibule (buccal shelf)", "Suck on finger; smile; open & close; massage cheek"],
          ["Mandibular", "Labial vestibule", "Gently massage lip"],
          ["Mandibular", "Lingual (incl. retromylohyoid)", "Push tongue against handle; tongue to corners of mouth; lick upper lip; swallow"],
        ] },
      { title: "Tray & impression specs", columns: ["Parameter", "Specification"], rows: [
          ["Tray extension", "2–3 mm short of vestibule"],
          ["Water bath", "130 °F"],
          ["Compound width after trim", "3–4 mm"],
          ["Maxillary relief hole", "#8 round bur, midline rugae area"],
          ["Light-body layer", "~2 mm"],
          ["Border movements", "After 30 s"],
          ["Set time", "6 min"],
        ] },
    ],
    figures: ["maxBorder", "mandBorder"],
    labRx: `DENTAL LABORATORY WORK AUTHORIZATION
Patient: {{patient_id}}   Age/Sex: {{age}} {{sex}}
Case: Complete dentures — maxillary and mandibular
Enclosed: Border-molded maxillary and mandibular final impressions (PVS in custom trays)
Instructions:
 • Bead, box and pour master casts in Type III stone; preserve full border roll and land area.
 • Transfer posterior palatal seal area from the impression; score post-dam per marked vibrating line.
 • Fabricate stabilized record bases (light-cured or autopolymerizing resin) with maxillary and mandibular wax occlusion rims:
   maxillary rim ~22 mm anterior height from vestibule, mandibular rim to ⅔ retromolar pad height.
Return: Record bases with wax rims on master casts for jaw-relation records.
${LAB_SIG}`,
    postOp: ["Keep wearing your current dentures (if any) until the new ones are delivered."],
    soap: {
      fields: [
        { id: "patient_id", label: "Patient ID", type: "text", value: "______" },
        { id: "age", label: "Age", type: "text", value: "71" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "130/82, 72 bpm" },
        { id: "pvs", label: "Impression material", type: "select", options: ["light-body PVS", "medium-body PVS"], value: "light-body PVS" },
        { id: "nv", label: "Next visit", type: "text", value: "Wax rim try-in, jaw relation records, facebow, tooth selection" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for F/F border molding and final impressions.
Medical history: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O:
Tissues healthy; no sore spots or pathology.

A:
Edentulous arches ready for final impressions.

P:
Custom trays tried in and adjusted to ideal extension (2–3 mm short of vestibule, frena relieved, maxillary border just past the vibrating line).
Maxillary and mandibular trays border molded with greenstick compound, zone by zone with functional movements; compound trimmed to 3–4 mm.
Wax spacers removed; maxillary palatal relief hole placed. Final impressions taken with {{pvs}}; border movements after 30 s; 6 min set. Impressions verified.
Impressions sent for master casts, record bases and wax rims.

NV: {{nv}}`,
    },
  },

  /* ============================================= CD #3 · WAX RIMS, VDO, FOX PLANE, FACEBOW */
  {
    id: "cd-3-wax-rims-jaw-relations",
    kind: "procedure",
    title: "Complete Dentures #3 · Wax Rims, VDO, Fox Plane, Facebow & Tooth Selection",
    category: "removable",
    duration: "~2.5 h",
    summary:
      "Maxillary rim first (incisal display, 'fifty-five'/'E' phonetics, lip support, Fox plane parallel to interpupillary and ala-tragus lines), mandibular rim to VDO = VDR – 2 mm with 1 mm sibilant space, midline/canine/smile lines, keyhole-notched rims, facebow to a 43 mm reference point, CR record with Regisil in the keyholes, and denture tooth selection.",
    cdt: [
      { code: "D5110", label: "Complete denture, maxillary (in progress)" },
      { code: "D5120", label: "Complete denture, mandibular (in progress)" },
    ],
    tags: ["wax rims", "occlusion rims", "VDR", "VDO", "freeway space", "interocclusal distance", "incisal display", "lip length", "fifty-five", "F/V sounds", "Mississippi", "sibilant", "lip support", "nasolabial angle", "buccal corridor", "Fox plane", "ala-tragus", "Camper's line", "interpupillary", "facebow", "bite fork", "43 mm", "centric relation", "Regisil", "keyhole", "Portrait", "tooth mold", "intercanine distance", "high smile line"],
    tray: [
      { group: "Case records", items: ["Record bases with wax rims on master casts (verified before visit)"] },
      { group: "Instrument kits", items: ["Exam kit", "Waxing kit", "Lab handpiece + lab burs", "Fox plane", "Hanau torch", "Facebow + bite fork", "Regisil gun", "Vita and gingival shade guides", "Denture tooth mold guide (Portrait)", "Hot plate, stone spatula"] },
      { group: "Materials", items: ["Extra-hard baseplate wax", "Regisil + tips", "Thompson stick / marker", "Ruler", "Scalpel", "Floss (midline)", "Tongue depressors", "Cotton rolls"] },
    ],
    timers: [],
    steps: [
      { id: "w1", title: "Measure VDR", body: [
          "Dots on the nose tip and chin tip. Patient sits upright, head off the headrest.",
          "Bring to rest: say \"M\" / \"mom\"; lick lips and swallow; close slowly until the lips just touch.",
          "Measure dot-to-dot at rest (VDR).",
        ],
        checkpoint: "Start check: record bases seat and are stable; VDR measured reproducibly." },
      { id: "w2", title: "Maxillary rim · incisal display", body: ["Measure lip length (base of nose to upper lip edge) and set display at rest per the tables (by lip length, and by age and sex)."] },
      { id: "w3", title: "Maxillary rim · edge position, phonetics, support", body: [
          "\"Fifty-five\": rim's incisal edge contacts the vermilion border of the lower lip.",
          "\"E\": incisal edge halfway between upper and lower lip.",
          "Lip support: not overfull, not collapsed; women generally less support (larger nasolabial angle). Both vermilion borders visible at closure.",
          "Buccal corridors appropriate.",
        ] },
      { id: "w4", title: "Maxillary rim · occlusal plane (Fox plane)", body: [
          "Fox plane against the rim.",
          "Frontal view: parallel to the interpupillary line.",
          "Profile: parallel to the ala-tragus line (tongue depressor from base of nose to center of tragus for comparison).",
        ] },
      { id: "w5", title: "Mandibular rim · VDO", body: [
          "Adjust the mandibular rim to meet the maxillary rim evenly at VDO = VDR – 2 mm.",
          "\"Emma\" and \"Mississippi\": rims must not touch; ~1 mm apart on sibilants.",
          "Maxillary rim 1–2 mm overjet over the mandibular rim.",
          "Posteriorly the mandibular rim sits at ⅔ the height of the retromolar pad.",
        ],
        checkpoint: "Rim review: display, phonetics, lip support, occlusal plane, VDO with 2 mm interocclusal distance." },
      { id: "w6", title: "Mark the maxillary rim", body: ["Midline: floss held vertically; check forehead, nasal bridge, nose tip, philtrum, chin.", "Canine lines at the alae.", "High smile line with the patient smiling."] },
      { id: "w7", title: "Facebow", body: [
          "Cut one large keyhole notch on each side of both rims.",
          "Prepare the facebow: loosen all screws, open the earpieces, attach the transfer assembly.",
          "Mark the anterior reference point 43 mm above the lateral incisor edge of the rim.",
          "Regisil on the bite fork; seat against the maxillary rim with midlines aligned; stabilize with cotton rolls (patient bites).",
          "Slide the fork into the transfer assembly; seat earpieces; align the pointer to the reference mark.",
          "Tighten every screw very firmly (they slip otherwise). Remove after the Regisil sets.",
        ] },
      { id: "w8", title: "Centric relation record", body: [
          "Rehearse closing into CR with both rims in.",
          "With the patient closed in CR, inject Regisil into the keyholes only.",
        ],
        ebd: "Keyhole injection at a stable CR closure avoids the uneven, incomplete closure that full-rim bite material can cause.",
        checkpoint: "Jaw relation review: CR reproducible, rims seated, facebow rigid." },
      { id: "w9", title: "Select denture teeth", body: [
          "Mold from pre-extraction photos/casts, the old denture, or face shape.",
          "Measure maxillary intercanine distance and high smile line; choose the anterior mold and corresponding mandibular mold.",
          "Shade by preference: whiter vs. natural; typically A2/B2 or A3/B3 compared side by side. Choose gingival shade.",
          "Complete the tooth order.",
        ] },
    ],
    matrices: [
      { title: "Incisal display at rest — by lip length", columns: ["Lip length", "Display"], rows: [
          ["10–20 mm", "3–4 mm"], ["20–25 mm", "2 mm"], ["25–30 mm", "1 mm"], ["30+ mm", "0 mm"],
        ] },
      { title: "Incisal display at rest — by age & sex", columns: ["Age", "Male", "Female"], rows: [
          ["< 45 yr", "1 mm", "2 mm"], ["45–65 yr", "0 mm", "1 mm"], ["65+ yr", "–1 mm", "0 mm"],
        ] },
      { title: "Jaw relation targets", columns: ["Parameter", "Target"], rows: [
          ["VDO", "VDR – 2 mm"],
          ["Sibilant space (\"Mississippi\")", "~1 mm, rims not touching"],
          ["Overjet (rims)", "1–2 mm"],
          ["Mandibular posterior rim height", "⅔ retromolar pad"],
          ["Occlusal plane", "∥ interpupillary (frontal), ∥ ala-tragus (profile)"],
          ["Facebow reference point", "43 mm above lateral incisor edge"],
        ] },
    ],
    labRx: `DENTAL LABORATORY WORK AUTHORIZATION
Patient: {{patient_id}}   Age/Sex: {{age}} {{sex}}
Case: Complete dentures — maxillary and mandibular
Enclosed: Master casts, record bases with wax rims (midline, canine lines, high smile line marked), facebow transfer, CR record (Regisil in keyholes)
Articulator: Semi-adjustable; mount maxillary cast by facebow, mandibular by CR record.
Teeth: {{tooth_brand}} — maxillary anterior mold {{mold_max}}, mandibular anterior mold {{mold_mand}}, shade {{shade}}
Posterior teeth: {{posterior}}
Denture base: gingival shade {{gingival}}
Instructions: Set maxillary and mandibular anterior teeth to the rim contours, midline and incisal display marked; minimal festooning.
Return: Anterior wax set-up on the articulator for try-in.
${LAB_SIG}`,
    postOp: [],
    soap: {
      fields: [
        { id: "patient_id", label: "Patient ID", type: "text", value: "______" },
        { id: "age", label: "Age", type: "text", value: "71" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "128/80, 72 bpm" },
        { id: "vdr", label: "VDR (mm)", type: "text", value: "68" },
        { id: "vdo", label: "VDO (mm)", type: "text", value: "66" },
        { id: "icd", label: "Intercanine distance (mm)", type: "text", value: "50.0" },
        { id: "smile", label: "High smile line (mm)", type: "text", value: "10.0" },
        { id: "tooth_brand", label: "Tooth system", type: "text", value: "Portrait" },
        { id: "mold_max", label: "Maxillary anterior mold", type: "text", value: "32E" },
        { id: "mold_mand", label: "Mandibular anterior mold", type: "text", value: "C" },
        { id: "posterior", label: "Posterior teeth / scheme", type: "select", options: ["Monoplane (0°), balancing ramps", "Lingualized: maxillary lingual cusps into mandibular fossae", "20° semi-anatomic, bilateral balanced"], value: "Lingualized: maxillary lingual cusps into mandibular fossae" },
        { id: "shade", label: "Tooth shade", type: "text", value: "B1" },
        { id: "gingival", label: "Gingival shade", type: "text", value: "Original (OR)" },
        { id: "nv", label: "Next visit", type: "text", value: "Anterior wax try-in" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for F/F wax rim try-in and jaw relation records.
Medical history: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O:
Record bases seated and stable.

A:
Ready for jaw relation records.

P:
Maxillary rim adjusted for incisal display, phonetics ("fifty-five", "E"), lip support and buccal corridors. Occlusal plane set with Fox plane parallel to interpupillary and ala-tragus lines.
Midline (patient approves), canine lines and high smile line marked. VDR {{vdr}} mm; mandibular rim adjusted to VDO {{vdo}} mm (VDR – 2 mm); sibilant space ~1 mm; 1–2 mm overjet.
Facebow record taken (43 mm reference point). CR record taken with Regisil injected into keyhole notches.
Tooth selection: intercanine distance {{icd}} mm, high smile line {{smile}} mm → {{tooth_brand}} maxillary mold {{mold_max}}, mandibular mold {{mold_mand}}; shade {{shade}}; gingival shade {{gingival}}. Posterior scheme: {{posterior}}. Patient satisfied with selections.

NV: {{nv}}`,
    },
  },

  /* ============================================= CD #4 · ANTERIOR TRY-IN */
  {
    id: "cd-4-anterior-try-in",
    kind: "procedure",
    title: "Complete Dentures #4 · Anterior Wax Try-in",
    category: "removable",
    duration: "~90 min",
    summary:
      "Verify the mounting (CR relationship in the mouth matches the articulator; remount if not), VDR = VDO + 2 mm with a 1–2 mm close, then evaluate incisal display, 'fifty-five'/'E' and sibilant phonetics, lip support, smile curve, occlusal plane and midline with the patient's approval.",
    cdt: [
      { code: "D5110", label: "Complete denture, maxillary (in progress)" },
      { code: "D5120", label: "Complete denture, mandibular (in progress)" },
    ],
    tags: ["anterior try-in", "wax try-in", "verify mounting", "remount", "VDR", "VDO", "incisal display", "smile line", "phonetics", "sibilant", "lip support", "midline", "esthetics", "posterior palatal seal"],
    tray: [
      { group: "Case records", items: ["Trial dentures on the articulator"] },
      { group: "Instrument kits", items: ["Exam kit", "Waxing kit", "Lab handpiece + lab burs", "Fox plane / occlusal plane", "Hanau torch", "Hot plate, stone spatula"] },
      { group: "Materials", items: ["Extra-hard baseplate wax", "Thompson stick / marker", "Ruler", "Tongue depressors", "Hand mirror"] },
    ],
    timers: [],
    steps: [
      { id: "at1", title: "Verify mounting", body: [
          "Seat both trial dentures; guide the patient to CR.",
          "The maxillomandibular relationship must match the articulator exactly. If not, retake the CR record and remount.",
        ],
        checkpoint: "Start check: set-up approved before the visit; mounting verified in the mouth." },
      { id: "at2", title: "Verify VDR / VDO", body: [
          "Measure VDR (nose and chin dots, patient upright): \"M\", lick and swallow, or slow close to lip contact.",
          "Closing from VDR to VDO should be 1–2 mm.",
          "\"Emma\" and \"Mississippi\": teeth and rims do not touch; ~1 mm on sibilants.",
        ] },
      { id: "at3", title: "Esthetics & phonetics", body: [
          "Incisal display per the tables (lip length; age and sex).",
          "\"Fifty-five\": maxillary incisal edges touch the lower lip vermilion. \"E\": edges halfway between the lips.",
          "Sibilants: maxillary and mandibular incisal edges end-to-end with ~1 mm space, not touching.",
          "Lip support, visible vermilion at closure, buccal corridors.",
          "Anterior teeth follow the curvature of the lower lip in a smile. Occlusal plane parallel to the interpupillary line.",
          "Palatal contour concave, mimicking tissue; a convex base distorts speech.",
        ] },
      { id: "at4", title: "Midline & approval", body: ["Maxillary and mandibular midlines; get the patient's verbal approval.", "Confirm posterior palatal seal area."], checkpoint: "Anterior set-up approved by clinician and patient: display, phonetics, support, midline, plane." },
    ],
    matrices: [
      { title: "Try-in checks", columns: ["Check", "Target"], rows: [
          ["Mounting", "Mouth = articulator in CR; otherwise remount"],
          ["VDR vs VDO", "VDR = VDO + 2 mm (1–2 mm close)"],
          ["\"Fifty-five\"", "Maxillary incisal edge on lower-lip vermilion"],
          ["\"E\"", "Edge halfway between lips"],
          ["Sibilants", "End-to-end incisors, ~1 mm apart"],
          ["Smile", "Incisal curve follows lower lip"],
        ] },
    ],
    labRx: `DENTAL LABORATORY WORK AUTHORIZATION
Patient: {{patient_id}}   Age/Sex: {{age}} {{sex}}
Case: Complete dentures — maxillary and mandibular
Enclosed: Mounted casts with approved anterior set-up
Posterior teeth: {{posterior_mold}}; occlusal scheme: {{scheme}}
Instructions: Set posterior teeth over the residual ridges to the approved anterior set-up and occlusal plane; do not alter anterior positions or VDO. Minimal festooning.
Return: Complete wax set-up on the articulator for posterior try-in.
${LAB_SIG}`,
    postOp: [],
    soap: {
      fields: [
        { id: "patient_id", label: "Patient ID", type: "text", value: "______" },
        { id: "age", label: "Age", type: "text", value: "71" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "128/80, 72 bpm" },
        { id: "adjust", label: "Adjustments", type: "text", value: "#8 and #9 lengthened 1 mm for display; midline shifted 0.5 mm right" },
        { id: "posterior_mold", label: "Posterior mold", type: "text", value: "Portrait posterior, lingualized" },
        { id: "scheme", label: "Occlusal scheme", type: "select", options: ["Lingualized", "Monoplane with balancing ramps", "Bilateral balanced (semi-anatomic)"], value: "Lingualized" },
        { id: "nv", label: "Next visit", type: "text", value: "Posterior (final) wax try-in" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for F/F anterior wax try-in.
Medical history: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O / A:
Trial dentures seated; mounting verified in CR (matches articulator). VDR/VDO verified with 1–2 mm closure; sibilant space ~1 mm.

P:
Evaluated midline, incisal display and edge position ("fifty-five", "E"), lip support, smile curve and occlusal plane. Adjustments: {{adjust}}.
Fricative and sibilant sounds evaluated and satisfactory. Posterior palatal seal area confirmed.
Patient evaluated tooth shape, shade and position with a mirror and approves anterior set-up and midline.

NV: {{nv}}`,
    },
  },

  /* ============================================= CD #5 · POSTERIOR TRY-IN */
  {
    id: "cd-5-posterior-try-in",
    kind: "procedure",
    title: "Complete Dentures #5 · Posterior (Final) Wax Try-in & Consent",
    category: "removable",
    duration: "~90 min",
    summary:
      "Re-verify mounting, VDO, phonetics, esthetics and midline, then check occlusion with horseshoe articulating paper: ≥2 posterior teeth per side in centric and in lateral, ≥1 anterior + 1 posterior per side in protrusion. The patient signs the denture consent — the last chance for changes — before processing.",
    cdt: [
      { code: "D5110", label: "Complete denture, maxillary (in progress)" },
      { code: "D5120", label: "Complete denture, mandibular (in progress)" },
    ],
    tags: ["posterior try-in", "final wax try-in", "balanced occlusion", "lingualized", "horseshoe articulating paper", "lateral", "protrusive", "consent", "processing", "festoon", "posterior palatal seal"],
    tray: [
      { group: "Case records", items: ["Complete wax set-up on the articulator"] },
      { group: "Instrument kits", items: ["Exam kit", "Waxing kit", "Lab handpiece + lab burs", "Fox plane / occlusal plane", "Hanau torch", "Hot plate"] },
      { group: "Materials", items: ["Horseshoe articulating paper (two colors)", "Extra-hard baseplate wax", "Thompson stick", "Ruler", "Hand mirror", "Denture consent form"] },
    ],
    timers: [],
    steps: [
      { id: "pt1", title: "Re-verify everything from the anterior try-in", body: [
          "Mounting in CR matches the articulator (else remount).",
          "VDR = VDO + 2 mm; 1–2 mm closure; \"Emma\"/\"Mississippi\" with ~1 mm space.",
          "Incisal display, \"fifty-five\", \"E\", lip support, buccal corridors, smile curve, occlusal plane appropriately canted, concave palatal contour.",
          "Midlines approved.",
        ],
        checkpoint: "Start check: posterior set-up approved before the visit; mounting and VDO re-verified." },
      { id: "pt2", title: "Occlusion", body: [
          "Centric (one color): at least 2 posterior teeth per side with firm contact.",
          "Lateral (other color): at least 2 posterior teeth per side in contact.",
          "Protrusion: at least 1 anterior + 1 posterior contact on each side.",
        ],
        checkpoint: "Occlusion review: centric, lateral and protrusive contact criteria met." },
      { id: "pt3", title: "Patient approval & consent", body: [
          "Review tooth color, shape, position and midline with the patient using a mirror.",
          "Confirm there is nothing the patient wants changed: this is the last chance before processing.",
          "Go over the denture consent form aloud; patient signs.",
        ],
        warn: "Do not send for processing without signed consent and explicit patient approval of esthetics." },
    ],
    matrices: [
      { title: "Minimum occlusal contacts", columns: ["Position", "Requirement"], rows: [
          ["Centric", "≥ 2 posterior teeth per side"],
          ["Lateral excursion", "≥ 2 posterior teeth per side"],
          ["Protrusion", "≥ 1 anterior + 1 posterior per side"],
        ] },
    ],
    labRx: `DENTAL LABORATORY WORK AUTHORIZATION
Patient: {{patient_id}}   Age/Sex: {{age}} {{sex}}
Case: Complete dentures — maxillary and mandibular
Enclosed: Mounted casts with approved final wax set-up (patient-approved, consent on file)
Denture base: heat-cured acrylic, gingival shade {{gingival}}
Instructions:
 • Festoon, flask, pack and process maxillary and mandibular complete dentures.
 • Place posterior palatal seal as scored on the master cast.
 • Laboratory remount after processing; correct processing errors to restore the approved occlusion and incisal pin contact.
 • Finish and polish; do not polish intaglio surfaces.
 • Fabricate remount index / jig for clinical remount.
Return: Processed dentures on remounted casts for delivery.
${LAB_SIG}`,
    postOp: [],
    soap: {
      fields: [
        { id: "patient_id", label: "Patient ID", type: "text", value: "______" },
        { id: "age", label: "Age", type: "text", value: "71" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "126/78, 70 bpm" },
        { id: "gingival", label: "Gingival shade", type: "text", value: "Original (OR)" },
        { id: "nv", label: "Next visit", type: "text", value: "F/F delivery" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for F/F posterior (final) wax try-in.
Medical history: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O / A:
Trial dentures seated; mounting in CR and VDO re-verified.

P:
Confirmed midline, incisal edge position, lip support, phonetics, esthetics and occlusal plane; adjusted to ideal.
Occlusion: centric, lateral and protrusive contacts adjusted to meet minimum contact criteria.
Patient evaluated trial dentures with a mirror and approved tooth size, shape, color, position and midline. Denture consent explained; signed consent obtained.
Trial dentures sent for processing (gingival shade {{gingival}}).

NV: {{nv}}`,
    },
  },

  /* ============================================= CD #6 · DELIVERY (PIP) */
  {
    id: "cd-6-delivery",
    kind: "procedure",
    title: "Complete Dentures #6 · Delivery (PIP, Borders, Occlusion)",
    category: "removable",
    duration: "~90 min",
    summary:
      "Check for sharp spots, seat and get first impressions; verify posterior palatal extension against the vibrating line; check borders; relieve intaglio pressure with thin, directional pressure-indicating paste (light pressure on first molars, ~5 s, repeat until clean); equilibrate with horseshoe paper; polish externally only; give care instructions.",
    cdt: [
      { code: "D5110", label: "Complete denture, maxillary" },
      { code: "D5120", label: "Complete denture, mandibular" },
    ],
    tags: ["denture delivery", "insertion", "PIP", "pressure indicating paste", "Mizzy spray", "vibrating line", "posterior palatal seal", "border extension", "horseshoe articulating paper", "balanced occlusion", "clinical remount", "rag wheel", "pumice", "denture care", "home care instructions"],
    tray: [
      { group: "Case records", items: ["Processed dentures from the lab", "Articulator / remount index"] },
      { group: "Instrument kits", items: ["Exam kit", "Lab handpiece + acrylic burs"] },
      { group: "Materials", items: ["Pressure-indicating paste (PIP) + brush", "PIP remover", "Mizzy spray (optional)", "Disclosing wax", "Thompson stick", "Horseshoe articulating paper (two colors)", "Pumice + rag wheel", "Hand mirror"] },
      { group: "Patient kit", items: ["Denture brush", "Denture case", "Denture cleanser", "Adhesive (if needed)", "Printed care instructions"] },
    ],
    timers: [
      { id: "pip-dwell", label: "PIP seat (light pressure)", seconds: 5 },
    ],
    steps: [
      { id: "dv1", title: "Inspect & seat", body: [
          "Before insertion, remove sharp or rough spots and processing nodules.",
          "Insert; ask about immediate pain, sharpness or tightness.",
          "Hand mirror: esthetics (be encouraging).",
        ],
        checkpoint: "Start check: dentures inspected; processing verified against the approved set-up." },
      { id: "dv2", title: "Posterior palatal extension", body: [
          "Dentures out; patient says \"ah\"; mark the vibrating line with a wet Thompson stick.",
          "Seat the denture and read the extension past the line.",
          "Reduce any overextension and bevel to a feather edge toward the posterior border.",
        ] },
      { id: "dv3", title: "Border extension", body: ["Gently pull the cheeks; lift the tongue slightly: the denture must not move.", "Run a finger along the borders for impingement or overextension."] },
      { id: "dv4", title: "PIP evaluation", body: [
          "Dry the denture. Brush a thin PIP layer on the intaglio, strokes all in one direction (strokes must be visible).",
          "Optional: Mizzy spray on the ridge so PIP doesn't stick to mucosa (ropy saliva: spray, swish, suction). A dry mouth makes PIP stick.",
          "Insert with the patient; light finger pressure on the first molars only, no biting, ~5 s. Remove.",
          "Read show-through (pressure). Leave PIP on; relieve high spots with acrylic burs; re-coat the adjusted area; repeat until even.",
          "Massive show-through = too much pressure or too long: clean, re-coat, repeat.",
          "Target a specific complaint by coating only that area.",
        ],
        timers: ["pip-dwell"] },
      { id: "dv5", title: "Occlusion", body: [
          "Horseshoe paper in centric, lateral and protrusive.",
          "Goals: even bilateral contact on multiple/all posterior teeth; in protrusion 1 posterior per side + anterior contact.",
          "Adjust one arch only for control; re-mark and repeat.",
        ],
        ebd: "Small discrepancies are often easier and more accurate to correct with a clinical remount on the articulator than by intraoral grinding.",
        checkpoint: "Delivery review: intaglio pressure relieved, borders and palatal extension correct, balanced contacts achieved." },
      { id: "dv6", title: "Polish & instruct", body: [
          "Pumice and rag wheel on external surfaces only; never polish the intaglio.",
          "Review care instructions verbally and in print; give the patient kit.",
          "Wear the dentures until the 24-hour visit so sore spots can be found.",
        ] },
    ],
    matrices: [
      { title: "PIP technique", columns: ["Parameter", "Specification"], rows: [
          ["Layer", "Thin; brush strokes visible, one direction"],
          ["Seating force", "Light finger pressure on first molars; no biting"],
          ["Dwell", "~5 s"],
          ["Read", "Show-through = pressure → relieve"],
          ["Repeat", "Re-coat adjusted area until even"],
        ] },
    ],
    postOp: [
      "Wear the dentures until your follow-up visit tomorrow (about 24 hours) so we can find sore spots.",
      "After that, take them out at night to rest your gums; store them in water or a soaking solution, never dry.",
      "Clean the dentures daily with a denture brush and a non-abrasive denture cleanser (not toothpaste). Rinse after meals.",
      "Brush your gums and tongue with a soft brush daily.",
      "Start with soft foods cut into small pieces; chew on both sides at once. Speech improves with practice (read aloud).",
      "Sore spots are expected; do not adjust the dentures yourself. Call if pain is severe.",
      "Recall yearly: gums change shape and dentures need relines over time.",
    ],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "71" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "126/78, 70 bpm" },
        { id: "pip", label: "Intaglio", type: "select", options: ["Evaluated with PIP; no adjustment needed.", "Evaluated with PIP; pressure areas relieved with acrylic burs until even."], value: "Evaluated with PIP; pressure areas relieved with acrylic burs until even." },
        { id: "occl", label: "Occlusion", type: "select", options: ["Balanced occlusion and articulation with protrusive contact; no adjustment needed.", "Teeth adjusted to achieve balanced occlusion, bilateral balanced articulation and protrusive contact."], value: "Teeth adjusted to achieve balanced occlusion, bilateral balanced articulation and protrusive contact." },
        { id: "nv", label: "Next visit", type: "text", value: "24-hour post-delivery adjustment" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for F/F delivery.
Medical history: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O / A:
Dentures inspected; sharp areas removed. F/F seated; patient approves esthetics and reports comfort with no immediate concerns.

P:
Posterior palatal extension verified against the vibrating line; borders checked for extension and stability.
{{pip}}
{{occl}}
External surfaces polished with pumice and rag wheel.
Care instructions reviewed verbally and given in print; denture brush, case and cleanser provided. Instructed to wear dentures until tomorrow's follow-up. Patient understands.

NV: {{nv}}`,
    },
  },

  /* ============================================= CD #7 · 24-HOUR ADJUSTMENT */
  {
    id: "cd-7-24hr-adjustment",
    kind: "procedure",
    title: "Complete Dentures #7 · 24-Hour Adjustment",
    category: "removable",
    duration: "~45 min",
    summary:
      "Interview and full ridge palpation, Thompson-stick transfer of visible sore spots, PIP relief, disclosing wax (≤2 mm) for border overextension, posterior palatal extension and conservative occlusal refinement, then external polish.",
    cdt: [
      { code: "D5410", label: "Adjust complete denture, maxillary (often included within 6 months of delivery)" },
      { code: "D5411", label: "Adjust complete denture, mandibular (often included within 6 months of delivery)" },
    ],
    tags: ["denture adjustment", "24-hour follow-up", "sore spot", "Thompson stick", "PIP", "disclosing wax", "overextension", "border", "vibrating line", "occlusion", "ulcer"],
    tray: [
      { group: "Instrument kits", items: ["Exam kit", "Lab handpiece + acrylic burs", "Hanau torch"] },
      { group: "Materials", items: ["PIP + brush, PIP remover", "Mizzy spray", "Disclosing wax", "Thompson stick", "Horseshoe articulating paper", "Cotton-tipped applicators", "Pumice + rag wheel"] },
    ],
    timers: [
      { id: "transfer", label: "Seat to transfer mark / PIP", seconds: 5 },
    ],
    steps: [
      { id: "a1", title: "Interview & examine", body: [
          "Ask about sore spots, looseness, chewing, speech.",
          "Dentures out; full IOE. Palpate the entire maxillary and mandibular ridges: patients can be sore without a visible lesion.",
        ],
        checkpoint: "Start check: complaints recorded and sore areas located before adjusting." },
      { id: "a2", title: "Transfer sore spots", body: [
          "Mark the sore spot gently with a wet Thompson stick; keep the cheeks retracted.",
          "Seat the denture gently ~5 s; remove; relieve the marked intaglio area.",
        ],
        timers: ["transfer"] },
      { id: "a3", title: "PIP", body: [
          "Thin, directional layer; optional Mizzy spray; light pressure on first molars ~5 s; relieve show-through; re-coat and repeat.",
          "For a specific complaint: coat that area and have the patient make the motion that hurts (opening wide, moving cheeks).",
          "Remove PIP with PIP remover, gauze, applicators and water.",
        ] },
      { id: "a4", title: "Disclosing wax on borders", body: [
          "Roll thin ropes; mold onto the borders, no more than 2 mm thick.",
          "Seat; patient performs border movements while you manipulate the cheeks. Remove.",
          "Show-through = overextension; relieve; re-apply; repeat until clean.",
        ] },
      { id: "a5", title: "Palatal extension & borders", body: ["Re-check the vibrating line and bevel any overextension to a feather edge.", "Pull cheeks and lift tongue: the denture should not move; finger along borders."] },
      { id: "a6", title: "Occlusion (conservative)", body: [
          "At 24 hours, adjust occlusion minimally; the intaglio usually needs most of the attention.",
          "Horseshoe paper; reduce high teeth; aim for even bilateral posterior contact and protrusive balance.",
        ] },
      { id: "a7", title: "Polish", body: ["Pumice and rag wheel, external surfaces only."], checkpoint: "Adjustment review: sore areas relieved, borders and extension correct, occlusion stable; follow-up scheduled." },
    ],
    matrices: [
      { title: "Disclosing media", columns: ["Medium", "Shows", "Specification"], rows: [
          ["Thompson stick", "Visible sore spot location", "Wet stick on lesion; seat ~5 s"],
          ["PIP", "Intaglio pressure", "Thin directional layer; ~5 s light pressure"],
          ["Disclosing wax", "Border overextension", "≤ 2 mm ropes; functional movements"],
        ] },
    ],
    postOp: ["Sore spots stay tender for a few days after adjustment while they heal.", "Remove dentures at night from now on.", "Warm saltwater rinses soothe sore areas.", "Call for a further adjustment if a spot doesn't improve in 2–3 days."],
    soap: {
      fields: [
        { id: "cc", label: "Chief complaint", type: "text", value: "sore spot on the lower front gum" },
        { id: "ioe", label: "IOE", type: "text", value: "2 mm ulceration buccal to anterior mandibular ridge; tender to palpation" },
        { id: "wax", label: "Borders", type: "select", options: ["Borders evaluated with disclosing wax; no overextension.", "Border overextension identified with disclosing wax and relieved."], value: "Borders evaluated with disclosing wax; no overextension." },
        { id: "occl", label: "Occlusion", type: "select", options: ["Occlusion stable; no adjustment.", "Minor occlusal adjustment for even bilateral contact."], value: "Occlusion stable; no adjustment." },
        { id: "nv", label: "Next visit", type: "text", value: "1-week follow-up" },
      ],
      template: `S:
Patient presents for F/F 24-hour adjustment. CC: "{{cc}}".

O:
IOE: {{ioe}}. Full ridge palpation completed.

A:
Localized denture-bearing tissue irritation.

P:
Sore spot marked with Thompson stick, transferred to intaglio and relieved. PIP applied; intaglio pressure areas relieved until even.
{{wax}} Posterior palatal extension verified. {{occl}}
Polished with pumice and rag wheel. Patient reports improvement; advised sore areas will take a few days to heal.

NV: {{nv}}`,
    },
  },

  /* ============================================= CD #8 · LAB RELINE */
  {
    id: "cd-8-lab-reline",
    kind: "procedure",
    title: "Complete Denture #8 · Laboratory Reline (Closed-Mouth Impression)",
    category: "removable",
    duration: "~60 min",
    summary:
      "Adjust and verify the existing denture (sore spots, PIP, palatal seal, borders, occlusion), clean it, note its correct orientation, relieve the intaglio 0.5 mm, shorten flanges 1 mm, palatal relief hole (maxillary only), then a 1–2 mm light-body PVS wash with the patient closed in CR and border molding. Match the original gingival shade.",
    cdt: [
      { code: "D5750", label: "Reline complete maxillary denture (laboratory)" },
      { code: "D5751", label: "Reline complete mandibular denture (laboratory)" },
    ],
    tags: ["reline", "lab reline", "hard reline", "closed-mouth impression", "functional impression", "light-body PVS", "relief", "flange reduction", "relief hole", "gingival shade", "heat-cured acrylic", "interim denture", "loose denture"],
    tray: [
      { group: "Instrument kits", items: ["Exam kit", "Spatula", "Lab handpiece + acrylic burs", "PVS gun", "Gingival shade guide", "Hanau torch", "Ultrasonic cleaner (heavy deposits)"] },
      { group: "Materials", items: ["Light-body PVS + tips ×2", "PVS adhesive + clean brushes + dappen dish", "PIP + remover", "Thompson stick", "Horseshoe articulating paper", "Cotton-tipped applicators"] },
    ],
    timers: [
      { id: "adhesive-dry", label: "Adhesive dry", seconds: 300 },
      { id: "pvs-set", label: "PVS set", seconds: 360 },
    ],
    steps: [
      { id: "r1", title: "Before the visit", body: ["Ask the patient to bring any previous or interim denture to wear while this one is at the lab."] },
      { id: "r2", title: "Evaluate & adjust the denture", body: [
          "CC, IOE, full ridge palpation.",
          "Thompson stick / PIP relief; posterior palatal seal; border extension; occlusion.",
          "Verify VDO, overjet, overbite, occlusion and articulation: a reline cannot fix a wrong VDO or tooth position.",
        ],
        checkpoint: "Start check: tissues healthy (no inflammation or hyperplasia), VDO and occlusion acceptable; denture suitable for reline rather than remake." },
      { id: "r3", title: "Clean & note orientation", body: ["Clean thoroughly (ultrasonic if heavily soiled).", "Try in and note incisal display and orientation; the impression must be taken in exactly this position or VDO and phonetics change."] },
      { id: "r4", title: "Prepare the intaglio", body: [
          "Relieve the intaglio uniformly 0.5 mm with acrylic burs.",
          "Shorten flanges 1 mm uniformly.",
          "One relief hole in the center of the palate (maxillary only; none mandibular).",
          "Adhesive; let dry.",
        ],
        timers: ["adhesive-dry"] },
      { id: "r5", title: "Impression", body: [
          "Thin (1–2 mm) light-body PVS in the denture; roll it up and over the flanges with the spatula.",
          "Seat in the noted orientation; patient closes into CR against the opposing arch.",
          "Border mold with functional movements. Full set.",
          "Verify midline and VDO are unchanged.",
        ],
        timers: ["pvs-set"],
        checkpoint: "Impression acceptance: even wash, no denture base show-through on tissue-bearing areas, borders rolled, VDO and midline unchanged." },
      { id: "r6", title: "Shade & send", body: ["Find the original gingival shade in the case records; otherwise match with the gingival shade guide.", "Adjust the interim denture for comfort; advise a soft diet."] },
    ],
    matrices: [
      { title: "Reline preparation", columns: ["Step", "Specification"], rows: [
          ["Intaglio relief", "0.5 mm uniform"],
          ["Flange reduction", "1 mm uniform"],
          ["Relief hole", "Palatal center, maxillary only"],
          ["Light-body layer", "1–2 mm"],
          ["Closure", "Patient closed in CR, border molded"],
        ] },
    ],
    labRx: `DENTAL LABORATORY WORK AUTHORIZATION
Patient: {{patient_id}}   Age/Sex: {{age}} {{sex}}
Case: Laboratory reline — {{arch}} complete denture
Enclosed: Patient's denture with closed-mouth PVS reline impression{{opposing}}
Instructions:
 • Pour impression in the denture; reline with heat-cured acrylic resin, gingival shade {{gingival}}.
 • Maintain existing VDO, tooth positions and occlusion (jig/articulate before processing).
 • Add posterior palatal seal as indicated on the impression (maxillary).
 • Finish and polish; do not polish the intaglio.
Return: Relined denture for delivery. Turnaround requested: ______ (patient without denture)
${LAB_SIG}`,
    postOp: ["Wear your interim denture while this one is at the lab; soft diet.", "At delivery we'll check fit and sore spots again, like a new denture."],
    soap: {
      fields: [
        { id: "patient_id", label: "Patient ID", type: "text", value: "______" },
        { id: "age", label: "Age", type: "text", value: "66" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "male" },
        { id: "arch", label: "Arch", type: "select", options: ["maxillary", "mandibular"], value: "maxillary" },
        { id: "cc", label: "Chief complaint", type: "text", value: "upper denture feels loose" },
        { id: "ioe", label: "IOE", type: "text", value: "tissues healthy; ridge resorption since immediate denture 8 months ago" },
        { id: "opposing", label: "Opposing", type: "select", options: [" (opposing natural dentition)", ", opposing denture enclosed", ", opposing cast enclosed"], value: " (opposing natural dentition)" },
        { id: "gingival", label: "Gingival shade", type: "text", value: "L199-OR" },
        { id: "nv", label: "Next visit", type: "text", value: "Delivery of relined denture" },
      ],
      template: `S:
Patient presents for {{arch}} complete denture laboratory reline. CC: "{{cc}}".

O:
IOE: {{ioe}}.

A:
Poorly fitting {{arch}} complete denture due to ridge resorption; VDO, overjet, overbite and occlusion acceptable. Suitable for reline.

P:
Sore areas adjusted (Thompson stick, PIP); posterior palatal seal, borders and occlusion evaluated.
Denture cleaned. Intaglio relieved 0.5 mm; flanges shortened 1 mm; palatal relief hole placed (maxillary only).
Closed-mouth impression with light-body PVS in CR; border molded. Midline and VDO verified unchanged.
Gingival shade {{gingival}} confirmed. Denture and impression sent to lab for heat-cured reline.
Patient instructed to use interim denture meanwhile; interim adjusted for comfort; soft diet advised.

NV: {{nv}}`,
    },
  },

  /* ============================================= RPD · SURVEYING & DESIGN */
  {
    id: "rpd-survey-design",
    kind: "procedure",
    title: "RPD · Surveying, Design & Framework Prescription",
    category: "removable",
    duration: "~60 min (laboratory step)",
    summary:
      "On mounted diagnostic casts: choose the path of insertion (guiding planes, retention, interference, esthetics), tripod the cast, mark heights of contour, gauge undercuts for each clasp material, plan rests, guide planes and height-of-contour modifications, and write the framework prescription.",
    cdt: [
      { code: "D5213", label: "Maxillary partial denture, cast metal framework with resin bases" },
      { code: "D5214", label: "Mandibular partial denture, cast metal framework with resin bases" },
    ],
    tags: ["RPD", "removable partial denture", "surveyor", "surveying", "path of insertion", "tilt", "tripod", "height of contour", "undercut gauge", "0.01 in", "0.02 in", "Kennedy classification", "Applegate", "major connector", "lingual bar", "lingual plate", "rests", "guide planes", "RPI", "circumferential clasp", "wrought wire", "Vitallium", "survey crown"],
    tray: [
      { group: "Case records", items: ["Mounted diagnostic casts (facebow + bite record)", "Duplicate diagnostic cast (practice preparations)", "Preliminary design sheet", "Radiographs, perio charting"] },
      { group: "Instruments", items: ["Dental surveyor with analyzing rod, carbon marker, undercut gauges (0.01, 0.02, 0.03 in), wax trimmer", "Colored pencils (red/blue design convention)", "Tripod marker"] },
    ],
    timers: [],
    steps: [
      { id: "sv1", title: "Prerequisites", body: [
          "Complete phase 1 (disease control) and phase 2 (restorative, endodontic, periodontal) before RPD appointments.",
          "Mount diagnostic casts: maxillary by facebow; mandibular by hand articulation or bite registration on wax rims.",
        ],
        checkpoint: "Design readiness: disease control complete, casts mounted, abutment prognosis confirmed." },
      { id: "sv2", title: "Classify & plan support", body: [
          "Kennedy class and modifications (Applegate rules).",
          "Distal extensions (Class I/II): plan for tissue support, stress-releasing clasp design (e.g., RPI/RPA), and possibly an altered cast.",
        ] },
      { id: "sv3", title: "Survey the cast", body: [
          "Start with the occlusal plane horizontal; tilt anteroposteriorly and laterally to find a path that creates parallel guiding planes, usable retentive undercuts, removes interferences and serves esthetics.",
          "Tripod the cast (three widely spaced marks at one vertical height) so the tilt can be reproduced.",
          "Mark heights of contour on abutments and soft tissue with the carbon marker.",
          "Gauge retentive undercuts per clasp material (see matrix).",
        ] },
      { id: "sv4", title: "Plan mouth preparation", body: [
          "Guide planes on proximal surfaces adjacent to edentulous spaces.",
          "Rest seats on every abutment (distal-extension: mesial rests preferred).",
          "Height-of-contour modifications: lower to allow reciprocal arms at the junction of the middle and gingival thirds; create or reduce undercuts.",
          "Identify teeth needing survey crowns; wax them up.",
          "Practice all preparations on a duplicate cast first.",
        ] },
      { id: "sv5", title: "Draw the design", body: [
          "Major connector (rigid; mandibular lingual bar needs enough vestibular depth, otherwise lingual plate).",
          "Minor connectors, rests, retentive and reciprocal elements, denture base retention (mesh/loops), tissue stops.",
          "Transfer the design to the master cast and the prescription.",
        ],
        checkpoint: "Design review: support, stability, retention, and rigid connectors address every abutment and edentulous area." },
    ],
    matrices: [
      { title: "Retentive undercut by clasp material", columns: ["Clasp", "Undercut", "Source"], rows: [
          ["Cast cobalt-chromium (circumferential/I-bar)", "0.01 in (0.25 mm)", "Std ref"],
          ["Cast gold", "0.015–0.02 in", "Std ref"],
          ["18-gauge wrought wire", "0.02 in (0.5 mm)", "Manual (lab example) / Std ref"],
        ] },
      { title: "Mandibular major connector selection", columns: ["Condition", "Choice", "Source"], rows: [
          ["Floor of mouth ≥ ~8 mm below gingival margins", "Lingual bar (≥ 4 mm tall, ≥ 3–4 mm below gingival margin)", "Std ref"],
          ["Shallow floor of mouth, mobile anteriors, planned additions", "Lingual plate", "Std ref"],
        ] },
    ],
    labRx: `DENTAL LABORATORY WORK AUTHORIZATION
Patient: {{patient_id}}   Age/Sex: {{age}} {{sex}}
Case: {{arch}} removable partial denture — cast framework
Enclosed: Master cast (design drawn), duplicate/diagnostic cast, opposing cast, mounting record; survey tilt tripoded on cast
Alloy: {{alloy}}
Major connector: {{major}}
Rest seats: {{rests}}
Guide planes: {{guides}}
Clasps: {{clasps}}
Denture base retention: {{retention}}
Tissue stops as marked on cast. Block out and relieve per surveyed path; do not alter the path of insertion.
Return: Framework on master cast for try-in.
${LAB_SIG}`,
    postOp: [],
    soap: {
      fields: [
        { id: "patient_id", label: "Patient ID", type: "text", value: "______" },
        { id: "age", label: "Age", type: "text", value: "63" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "arch", label: "Arch", type: "select", options: ["Mandibular", "Maxillary"], value: "Mandibular" },
        { id: "kennedy", label: "Kennedy class", type: "text", value: "Class I" },
        { id: "alloy", label: "Alloy", type: "text", value: "Vitallium (cobalt-chromium)" },
        { id: "major", label: "Major connector", type: "text", value: "Lingual bar" },
        { id: "rests", label: "Rest seats", type: "text", value: "#21-MO, #28-DO" },
        { id: "guides", label: "Guide planes", type: "text", value: "#21-D, #28-D" },
        { id: "clasps", label: "Clasps", type: "textarea", value: "#21: 18-gauge wrought wire circumferential clasp engaging 0.02 in MB undercut; 18-gauge wrought wire reciprocal arm on lingual. #28: 18-gauge wrought wire circumferential clasp engaging 0.02 in MB undercut; 18-gauge wrought wire reciprocal arm on lingual." },
        { id: "retention", label: "Base retention", type: "text", value: "Retentive loops #18, 19, 20, 29, 30" },
      ],
      template: `Design note:
{{arch}} RPD, Kennedy {{kennedy}}. Casts surveyed; path of insertion selected and tripoded.
Design: {{major}}; rests {{rests}}; guide planes {{guides}}; clasps {{clasps}}; base retention {{retention}}. Alloy: {{alloy}}.
Mouth preparation practiced on duplicate cast.`,
    },
  },

  /* ============================================= RPD · MOUTH PREPARATION */
  {
    id: "rpd-mouth-preparation",
    kind: "procedure",
    title: "RPD · Mouth Preparation (Guide Planes, Rest Seats, Contour Modification)",
    category: "removable",
    duration: "~60–90 min",
    summary:
      "Enamel-confined abutment preparation to the surveyed design: guide planes parallel to the path of insertion, spoon-shaped occlusal rests with the marginal ridge lowered ~1.5 mm, cingulum or incisal rests on anteriors, and height-of-contour modifications — verified the same day with an alginate cast in fast-set stone on the surveyor.",
    cdt: [
      { code: "D5213", label: "Maxillary partial denture, cast metal framework (mouth prep included)" },
      { code: "D5214", label: "Mandibular partial denture, cast metal framework (mouth prep included)" },
    ],
    tags: ["RPD", "mouth preparation", "guide plane", "guiding plane", "rest seat", "occlusal rest", "cingulum rest", "incisal rest", "enameloplasty", "height of contour", "recontour", "surveyor", "Snap stone", "fluoride varnish", "round diamond", "cylindrical diamond"],
    tray: [
      { group: "Case records", items: ["Surveyed diagnostic cast with design", "Duplicate cast with practice preparations"] },
      { group: "Instrument kits", items: ["Restorative/fixed prosth kit", "Surveyor", "Alginate bowl + spatula, stock trays"] },
      { group: "Rotary", items: ["Cylindrical (flat-end) diamond for guide planes", "#6 and #8 round diamonds/carbides for occlusal rests", "Inverted-cone / round-end tapered diamond for cingulum rests", "Fine finishing diamonds, rubber polishing points"] },
      { group: "Materials", items: ["Alginate", "Fast-set stone (Snap stone)", "Fluoride varnish", "Anesthetic (if dentin exposure is possible)"] },
    ],
    timers: [
      { id: "pour", label: "Pour alginate within", seconds: 900 },
    ],
    steps: [
      { id: "mp1", title: "Review the design", body: ["Mount the practice cast; confirm each planned guide plane, rest and contour change and its bur."], checkpoint: "Start check: design approved; practice preparations on the duplicate cast reviewed." },
      { id: "mp2", title: "Height-of-contour modification", body: [
          "Recontour first (it changes guide-plane and rest geometry).",
          "Lower heights of contour so reciprocal arms sit at the junction of the middle and gingival thirds; reduce or create undercuts per the design.",
          "Stay within enamel.",
        ] },
      { id: "mp3", title: "Guide planes", body: [
          "Cylindrical diamond held parallel to the chosen path of insertion (visualize the surveyor's analyzing rod).",
          "Occlusogingival height ~2–4 mm (about ⅓ of the crown); buccolingual width following the tooth curvature.",
          "Flat and smooth; stay in enamel.",
        ] },
      { id: "mp4", title: "Occlusal rest seats", body: [
          "Round diamond (#6 or #8) after the guide plane.",
          "Rounded triangular (spoon) outline, apex toward the center of the occlusal surface; ≥2.5 mm across the marginal ridge; width ~⅓ (molar) to ½ (premolar) of the buccolingual width.",
          "Lower the marginal ridge ~1.5 mm for metal thickness; floor inclines apically toward the center (angle with the minor connector < 90°).",
          "No sharp line angles.",
        ] },
      { id: "mp5", title: "Anterior rests (if designed)", body: [
          "Cingulum rest (canines preferred): inverted-V or U seat, ~2.5–3 mm mesiodistal, ~2 mm labiolingual, ~1.5 mm deep, floor toward the cingulum.",
          "Incisal rest (when cingulum rest isn't possible): ~2.5 mm wide, ~1.5 mm deep notch.",
        ] },
      { id: "mp6", title: "Finish & protect", body: ["Smooth all preparations with fine diamonds and rubber points.", "Apply fluoride varnish to prepared enamel."], ebd: "Enameloplasty exposes unprotected enamel; polishing and topical fluoride reduce caries risk at prepared sites." },
      { id: "mp7", title: "Verify on the surveyor", body: [
          "Alginate impression; pour in fast-set stone.",
          "Survey: guide planes parallel to the path, rest depth adequate, contours as designed. Correct and re-verify the same visit.",
        ],
        timers: ["pour"],
        checkpoint: "Preparation verification: all guide planes, rests and contour modifications confirmed on the surveyed stone cast." },
    ],
    matrices: [
      { title: "Rest seat & guide plane dimensions", columns: ["Feature", "Specification", "Source"], rows: [
          ["Guide plane height", "~2–4 mm occlusogingival (~⅓ crown)", "Std ref"],
          ["Guide plane orientation", "Parallel to path of insertion", "Std ref"],
          ["Occlusal rest outline", "Rounded triangular, apex toward center", "Std ref"],
          ["Occlusal rest length", "≥ 2.5 mm across marginal ridge", "Std ref"],
          ["Occlusal rest width", "~⅓ molar / ~½ premolar B-L width", "Std ref"],
          ["Marginal ridge reduction", "~1.5 mm", "Std ref"],
          ["Rest floor", "Inclined toward center; < 90° to minor connector", "Std ref"],
          ["Cingulum rest", "~2.5–3 mm M-D, ~2 mm L, ~1.5 mm deep", "Std ref"],
          ["Incisal rest", "~2.5 mm wide, ~1.5 mm deep", "Std ref"],
          ["Verification", "Alginate → fast-set (Snap) stone → surveyor", "Manual"],
        ] },
    ],
    postOp: ["Prepared teeth may feel slightly different to your tongue; this is normal.", "Mild cold sensitivity may occur for a few days.", "Keep up excellent brushing and fluoride use around the prepared teeth."],
    soap: {
      fields: [
        { id: "arch", label: "Arch", type: "select", options: ["mandibular", "maxillary"], value: "mandibular" },
        { id: "guides", label: "Guide planes", type: "text", value: "#21-D, #28-D" },
        { id: "rests", label: "Rest seats", type: "text", value: "#21-MO, #28-DO" },
        { id: "hoc", label: "Contour modifications", type: "text", value: "#21-L and #28-L height of contour lowered for reciprocal arms" },
        { id: "anes", label: "Anesthesia", type: "select", options: ["No anesthesia required (enamel only).", "Local anesthetic administered; aspiration negative."], value: "No anesthesia required (enamel only)." },
        { id: "nv", label: "Next visit", type: "text", value: "Border molding and final impression for RPD" },
      ],
      template: `P (RPD mouth preparation, {{arch}}):
{{anes}} Height-of-contour modifications: {{hoc}}.
Guide planes prepared parallel to the path of insertion: {{guides}}. Rest seats prepared: {{rests}}. All preparations confined to enamel, smoothed and polished; fluoride varnish applied.
Alginate impression poured in fast-set stone; preparations verified on the surveyor.

NV: {{nv}}`,
    },
  },

  /* ============================================= RPD · FRAMEWORK TRY-IN & ALTERED CAST */
  {
    id: "rpd-framework-tryin-altered-cast",
    kind: "procedure",
    title: "RPD · Framework Try-in & Altered-Cast Impression",
    category: "removable",
    duration: "~90 min",
    summary:
      "Seat the cast framework with a disclosing medium, relieve binding until rests seat fully without force, verify major-connector tissue relationship, clasp position and occlusion; for distal-extension (Kennedy I/II) cases, border mold custom trays attached to the framework and make a tissue-supported altered-cast impression while holding the framework seated on its rests.",
    cdt: [
      { code: "D5213", label: "Maxillary partial denture, cast metal framework (in progress)" },
      { code: "D5214", label: "Mandibular partial denture, cast metal framework (in progress)" },
    ],
    tags: ["RPD", "framework try-in", "cast framework", "disclosing medium", "fit checker", "PIP", "rest seating", "binding", "major connector", "lingual bar", "clasp", "occlusion", "altered cast", "corrected cast", "Applegate", "distal extension", "Kennedy Class I", "Kennedy Class II", "functional impression", "border molding", "denture teeth selection"],
    tray: [
      { group: "Case records", items: ["Framework on master cast", "Mounted diagnostic casts", "Framework custom trays (acrylic on retentive meshwork) — altered cast only"] },
      { group: "Instrument kits", items: ["Exam kit", "Lab handpiece", "High-speed handpiece", "Hanau torch, water bath (altered cast)"] },
      { group: "Rotary", items: ["Carbide/green stones for cobalt-chromium adjustment", "Rubber metal polishers", "Acrylic burs"] },
      { group: "Materials", items: ["Disclosing medium (Fit-Checker, PIP or disclosing spray)", "Articulating paper / shimstock", "Greenstick compound", "Light-body PVS + adhesive", "Denture tooth shade and mold guides"] },
    ],
    timers: [
      { id: "pvs-set", label: "PVS set", seconds: 360 },
    ],
    steps: [
      { id: "ft1", title: "Inspect on the cast", body: ["Framework fully seated on the master cast; no porosity, sharp edges or distortion; design followed."], checkpoint: "Start check: framework matches the prescription and seats on the master cast." },
      { id: "ft2", title: "Seat with disclosing medium", body: [
          "Thin disclosing medium on the tissue surfaces of rests, minor connectors, clasp shoulders and proximal plates.",
          "Seat along the path of insertion with finger pressure on the rests only; never force.",
          "Relieve metal where the medium is displaced (binding); repeat until the framework seats completely.",
        ],
        warn: "Forcing a binding framework can fracture clasps or traumatize abutments; relieve until it seats passively." },
      { id: "ft3", title: "Verify seating & connectors", body: [
          "Every rest fully seated in its seat (no rocking; explorer at the rest–seat junction).",
          "Major connector: rigid, correct relation to the gingival margins, no impingement; lingual bar clears the floor of mouth in function.",
          "Clasp tips in the planned undercuts; reciprocal arms contact on seating.",
        ] },
      { id: "ft4", title: "Occlusion", body: ["Articulating paper and shimstock: the framework must not hold the teeth apart; relieve rests or connectors in occlusal interference.", "Polish adjusted metal."], checkpoint: "Framework acceptance: passive complete seating, rests seated, connectors correct, no occlusal interference." },
      { id: "ft5", title: "Altered-cast impression (distal extension)", body: [
          "Indicated for mandibular Kennedy Class I/II distal extensions to record the edentulous ridge in its supporting form, related to the seated framework.",
          "Custom trays are attached to the framework's retentive meshwork; adjust 2 mm short of the vestibule.",
          "Border mold the trays with greenstick compound (buccal shelf, retromolar pad, retromylohyoid).",
          "Light-body PVS in the trays; seat the framework and hold it down on the rests with finger pressure only — do not press on the trays and do not let the patient bite.",
          "Functional movements; full set.",
        ],
        ebd: "The altered-cast technique records the distal-extension ridge while the framework is fully seated on its rests, reducing rotation of the base around the fulcrum line in function.",
        timers: ["pvs-set"],
        checkpoint: "Altered-cast impression acceptance: rests fully seated, borders rolled, no voids, trays not displaced." },
      { id: "ft6", title: "Denture teeth selection", body: ["Select mold and shade to harmonize with remaining teeth, if not already done."] },
    ],
    matrices: [
      { title: "Framework try-in checks", columns: ["Check", "Standard", "Source"], rows: [
          ["Seating", "Passive, complete, no force", "Std ref"],
          ["Rests", "Fully seated, no rocking", "Std ref"],
          ["Binding", "Relieved where disclosing medium is displaced", "Std ref"],
          ["Major connector", "Rigid; clears gingiva and floor of mouth", "Std ref"],
          ["Occlusion", "Framework does not hold teeth apart", "Std ref"],
          ["Altered cast", "Finger pressure on rests only; no biting", "Std ref"],
        ] },
    ],
    labRx: `DENTAL LABORATORY WORK AUTHORIZATION
Patient: {{patient_id}}   Age/Sex: {{age}} {{sex}}
Case: {{arch}} removable partial denture — {{stage}}
Enclosed: Framework {{enclosure}}, mounted opposing cast, mounting record
Instructions:
 {{instructions}}
Denture teeth: mold {{mold}}, shade {{shade}}. Base shade: {{base}}.
Return: {{return_for}}
${LAB_SIG}`,
    postOp: [],
    soap: {
      fields: [
        { id: "patient_id", label: "Patient ID", type: "text", value: "______" },
        { id: "age", label: "Age", type: "text", value: "63" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "arch", label: "Arch", type: "select", options: ["Mandibular", "Maxillary"], value: "Mandibular" },
        { id: "stage", label: "Stage", type: "select", options: ["altered cast and framework wax rims", "framework wax rims (no altered cast)"], value: "altered cast and framework wax rims" },
        { id: "enclosure", label: "Enclosure", type: "select", options: ["with altered-cast impression in attached trays, and master cast", "on master cast"], value: "with altered-cast impression in attached trays, and master cast" },
        { id: "instructions", label: "Lab instructions", type: "textarea", value: "Section the distal-extension edentulous areas from the master cast; seat framework with impression and repour altered cast in Type III stone. Fabricate wax occlusion rims on the framework for jaw-relation records." },
        { id: "fit", label: "Framework fit", type: "select", options: ["Framework seated passively with disclosing medium; no adjustment required.", "Binding areas identified with disclosing medium and relieved; framework seats completely."], value: "Binding areas identified with disclosing medium and relieved; framework seats completely." },
        { id: "mold", label: "Tooth mold", type: "text", value: "Trubyte posterior F30 10°" },
        { id: "shade", label: "Tooth shade", type: "text", value: "81" },
        { id: "base", label: "Base shade", type: "text", value: "Original (OR)" },
        { id: "return_for", label: "Return for", type: "text", value: "Altered master cast with framework wax rims for bite registration" },
        { id: "nv", label: "Next visit", type: "text", value: "Bite registration on framework wax rims" },
      ],
      template: `P ({{arch}} RPD framework try-in):
{{fit}} All rests fully seated; major connector rigid and clear of gingiva and floor of mouth; clasps in planned undercuts. Occlusion verified; framework does not hold teeth apart. Adjusted metal polished.
Stage: {{stage}}. Altered-cast impression (if indicated): custom trays border molded with greenstick; light-body PVS with framework held on rests by finger pressure only.
Denture teeth selected: mold {{mold}}, shade {{shade}}; base {{base}}.
Case sent to laboratory.

NV: {{nv}}`,
    },
  },
];

/* -------------------------------------------------------------------------- */
/* 2e. PEDIATRICS, DIAGNOSTICS & PERIODONTICS DATASET (manual schema)         */
/*                                                                            */
/* Embedded verbatim from peds-diagnostics-procedures.js. SSC, pulpotomy,     */
/* strip crown, SDF, pediatric LA, endo-testing and perio values and brands   */
/* are from the source manual; pulpotomy recoded to D3220 and SRP to          */
/* D4341/D4342. Categories: pediatric → Pediatrics, diagnostics → Diagnostics */
/* /Exams, perio → Periodontics.                                              */
/* -------------------------------------------------------------------------- */

const PEDS_DIAGNOSTIC_PROCEDURES: ManualProcedure[] = [
  /* ================================================ PEDS COMPOSITE */
  {
    id: "peds-composite",
    kind: "procedure",
    title: "Pediatric Composite Restorations (Class I–V, Primary Teeth)",
    category: "pediatric",
    duration: "~45–60 min",
    summary:
      "Primary-tooth resin restorations: strict case selection (lesion <50% into dentin, one proximal surface, within line angles; otherwise SSC), no slot preps and no MODs, facial-access Class III with a retentive facial extension, sealant over posterior composites, and weight-based anesthesia with a short 30G needle.",
    cdt: [
      { code: "D2391", label: "Resin-based composite, 1 surface, posterior" },
      { code: "D2392", label: "Resin-based composite, 2 surfaces, posterior" },
      { code: "D2330", label: "Resin-based composite, 1 surface, anterior" },
      { code: "D2331", label: "Resin-based composite, 2 surfaces, anterior" },
      { code: "D2335", label: "Resin-based composite, 4+ surfaces or incisal angle, anterior" },
      { code: "D9230", label: "Nitrous oxide / anxiolysis (if used)" },
    ],
    tags: ["pediatric", "primary teeth", "composite", "Class I", "Class II", "Class III", "Class IV", "Class V", "SSC indications", "slot prep", "MOD", "facial access", "sealant over composite", "gold matrix", "sectional matrix", "#14 clamp", "slit dam", "Isodry size P", "nitrous oxide", "Frankl", "sandwich", "Ketac Nano"],
    tray: [
      { group: "Instrument kits", items: ["Pediatric restorative kit", "Composite kit", "Pediatric rubber dam kit (#14 primary molar, #14A permanent molar)", "Sectional matrix kit + separator ring / gold matrix band", "Composite gun", "LED curing light", "Nitrous oxide nasal hood"] },
      { group: "Rotary", items: ["High-speed & slow-speed handpieces", "Pediatric and restorative burs (#330, #2/#4 round)", "Composite finishing burs"] },
      { group: "Materials", items: ["35% phosphoric acid etch", "Scotchbond Universal", "Renamel Nanofill (posterior) / Microfill (anterior)", "Pit-and-fissure sealant", "Vitrebond; calcium silicate liner (TheraCal LC)", "Ketac Nano + conditioner (Class V sandwich)", "Clear mylar strips, wooden and plastic wedges", "Shofu, Jiffy brush, finishing strips, #12 blade, Cosmedent discs"] },
      { group: "Chairside disposables", items: ["Topical, short 30G needle, carpules", "Isodry (size P)", "Wedget", "Articulating paper, floss"] },
    ],
    timers: [
      { id: "etch", label: "Enamel etch", seconds: 15 },
      { id: "bond", label: "Universal adhesive scrub", seconds: 20 },
      { id: "airthin", label: "Air-thin adhesive", seconds: 5 },
      { id: "cure-bond", label: "Cure adhesive", seconds: 10 },
      { id: "cure-inc", label: "Cure increment", seconds: 20, note: "20–40 s depending on increment" },
      { id: "cure-final", label: "Final cure", seconds: 60 },
      { id: "cure-sealant", label: "Cure sealant", seconds: 20, note: "10 s on high" },
      { id: "o2", label: "100% O₂ after nitrous", seconds: 300 },
    ],
    steps: [
      { id: "pc1", title: "Case presentation (before seating)", body: [
          "Age, weight, medical history, significant dental history, behavior.",
          "Restorative plan and sequence; anesthesia plan (agent, injection, volume vs weight maximum, nitrous); isolation plan; treatment-plan date and last radiographs.",
        ],
        checkpoint: "Pre-treatment clearance: composite (not SSC) is indicated, anesthesia dose and isolation approved before the patient is seated." },
      { id: "pc2", title: "Guardian check-in & weigh", body: [
          "Confirm changes to health, medications, allergies.",
          "Explain the visit and wait time. Warn that a deeper or larger lesion may need an SSC and/or pulpotomy.",
          "Weigh the patient.",
        ] },
      { id: "pc3", title: "Nitrous & anesthesia", body: [
          "Nitrous oxide if planned (see contraindications in Pediatric Anesthesia).",
          "Short 30G needle, even for IANB, except larger teens.",
          "One carpule is the working limit before re-verifying the weight-based maximum.",
        ] },
      { id: "pc4", title: "Shade & isolation", body: [
          "Select shade.",
          "Isodry (size P), or rubber dam ligated with floss (#14 clamp on primary molars).",
          "Slit dam: punch two holes ½ in apart and cut between them for fast placement.",
        ] },
      { id: "pc5", title: "Preparation by class", body: [
          "Class I: conservative, caries-driven.",
          "Class II: pre-wedge. No slot preps — a small occlusal extension improves success. No MODs: mesial + distal caries → SSC.",
          "Class III: usually facial access (lingual if caries is lingual). Box into the proximal, extend onto the facial for retention (1 mm deep if caries-free) with a 0.5–2.0 mm bevel.",
          "Class IV: wide 0.5–2.0 mm bevel. Consider a strip crown instead when multiple surfaces are involved.",
          "Class V: wide 0.5–2.0 mm bevel.",
          "Two adjacent lesions: prepare larger → prepare smaller → restore smaller → restore larger.",
        ],
        warn: "Larger than expected or close to the pulp: stop and re-plan (SSC, pulpotomy).",
        checkpoint: "Preparation review: caries removed, outline within line angles, retention form appropriate to the class." },
      { id: "pc6", title: "Matrix", body: ["Class II: sectional band (smiling toward occlusal) + plastic wedge + ring, or gold matrix band; burnish.", "Class III/IV: clear mylar strip + wooden wedge."] },
      { id: "pc7", title: "Liner / pulp protection", body: [
          "Vitrebond 0.5 mm when remaining dentin is thin; cure 20 s.",
          "Indirect pulp therapy (deep lesion, no exposure): calcium silicate (TheraCal LC) or RMGI over the deepest area.",
          "Class V sandwich: conditioner 15 s → air-dry, no rinse → cure 10 s; Ketac Nano base, cure 10 s on high; then etch/bond/composite.",
        ],
        ebd: "Indirect pulp therapy with an RMGI or calcium silicate liner has high success in primary teeth; calcium hydroxide (Dycal) is no longer the preferred liner. Carious exposure in a primary tooth → pulpotomy, not a direct pulp cap." },
      { id: "pc8", title: "Selective etch & bond", body: [
          "Etch enamel 15 s with 35% phosphoric acid; rinse 5 s; dentin moist.",
          "Scotchbond Universal: scrub 20 s, air-thin 5 s, cure 10 s. Contaminated: re-etch 5 s.",
        ],
        timers: ["etch", "bond", "airthin", "cure-bond"] },
      { id: "pc9", title: "Place composite", body: [
          "Posterior: Renamel Nanofill in increments, 20–40 s each; final 60 s.",
          "Anterior: Renamel Microfill. Class V: nanofill or microfill by esthetics.",
        ],
        timers: ["cure-inc", "cure-final"] },
      { id: "pc10", title: "Seal (posterior)", body: ["Sealant over the composite and remaining fissures; thin layer; cure 20 s (10 s high)."], timers: ["cure-sealant"] },
      { id: "pc11", title: "Check, finish, release", body: [
          "Remove isolation; articulating paper; floss contacts.",
          "Finishing burs, Shofu, Jiffy brush (discs and strips for anteriors).",
          "100% O₂ 5 min after nitrous. Release to guardian: numb, watch for lip and cheek biting.",
        ],
        timers: ["o2"],
        checkpoint: "Final review: margins, contacts, occlusion, sealant coverage; patient released in good condition." },
    ],
    matrices: [
      { title: "Composite vs. SSC in primary molars", columns: ["Composite if…", "SSC if…"], rows: [
          ["Lesion < 50% into dentin", "Caries on 3+ surfaces (incl. B or L)"],
          ["Prep within the line angles", "Proximal caries beyond the line angles"],
          ["Only one proximal surface", "Mesial and distal caries (no MODs)"],
          ["< 50% of tooth structure involved", "Recurrent caries under a Class II"],
          ["No decalcification beyond the outline", "Large 1–2 surface lesion with long time to exfoliation or very high risk"],
          ["Limited gingival extent", "Pulp therapy needed"],
        ] },
    ],
    widgets: ["pedsDose"],
    postOp: ["Your child is numb for 2–3 hours: watch for lip, cheek and tongue biting.", "Soft foods until the numbness wears off.", "Brush twice daily with fluoride toothpaste; limit sugary drinks and snacks."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "6" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "guardian", label: "Guardian", type: "text", value: "mother" },
        { id: "weight", label: "Weight (kg)", type: "text", value: "21" },
        { id: "tooth", label: "Tooth", type: "text", value: "A" },
        { id: "surfaces", label: "Surfaces", type: "text", value: "MO" },
        { id: "mhx", label: "Medical history", type: "text", value: "reviewed with guardian; no changes; no medications; immunizations up to date" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "n2o", label: "Nitrous oxide", type: "select", options: ["No nitrous oxide.", "Nitrous oxide titrated to 40% N₂O / 60% O₂ at 4 L/min; 100% O₂ for 5 min at completion."], value: "Nitrous oxide titrated to 40% N₂O / 60% O₂ at 4 L/min; 100% O₂ for 5 min at completion." },
        { id: "anesthetic", label: "Anesthetic", type: "select", options: ANESTHETICS, value: ANESTHETICS[0] },
        { id: "carps", label: "Carpules", type: "text", value: "1" },
        { id: "block", label: "Injection", type: "text", value: "right IANB and long buccal" },
        { id: "iso", label: "Isolation", type: "select", options: ["Isodry (size P)", "rubber dam (#14 clamp, slit technique)"], value: "Isodry (size P)" },
        { id: "matrix", label: "Matrix", type: "select", options: ["Sectional matrix, wedge and ring placed and burnished.", "Gold matrix band placed and burnished.", "Clear mylar strip and wedge placed.", "No matrix required."], value: "Sectional matrix, wedge and ring placed and burnished." },
        { id: "material", label: "Composite", type: "select", options: ["Renamel Nanofill", "Renamel Microfill"], value: "Renamel Nanofill" },
        { id: "sealant", label: "Sealant", type: "select", options: ["Sealant placed over restoration and remaining fissures, cured 20 s.", "No sealant (anterior restoration)."], value: "Sealant placed over restoration and remaining fissures, cured 20 s." },
        { id: "shade", label: "Shade", type: "text", value: "A1" },
        { id: "frankl", label: "Behavior (Frankl)", type: "select", options: ["F1 (definitely negative)", "F2 (negative)", "F3 (positive)", "F4 (definitely positive)"], value: "F4 (definitely positive)" },
        { id: "nv", label: "Next visit", type: "text", value: "6-month recall" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents with {{guardian}} for #{{tooth}}-{{surfaces}} composite. Weight {{weight}} kg.
Medical history: {{mhx}}. Allergies: {{allergies}}. Guardian consent obtained.

O / A:
#{{tooth}}-{{surfaces}}: caries into dentin, within composite indications.

P:
{{n2o}}
Topical 20% benzocaine applied. {{carps}} carpule(s) {{anesthetic}} administered as {{block}}; aspiration negative; within weight-based maximum.
Isolation: {{iso}}. Caries excavated; preparation completed to ideal form. {{matrix}}
Enamel etched with 35% phosphoric acid 15 s, rinsed, dentin left moist. Scotchbond Universal scrubbed 20 s, air-thinned 5 s, cured 10 s.
{{material}} composite, shade {{shade}}, placed in increments, each cured 20–40 s; final cure 60 s. {{sealant}}
Finished and polished. Contacts and occlusion evaluated and adjusted.
Patient released to guardian in good condition; guardian informed patient is numb, monitor lip and soft-tissue biting.
Behavior: {{frankl}}.

NV: {{nv}}`,
    },
  },

  /* ================================================ SSC */
  {
    id: "peds-ssc",
    kind: "procedure",
    title: "Stainless Steel Crown (SSC) — Preparation, Crimping & Cementation",
    category: "pediatric",
    duration: "~45–60 min",
    summary:
      "Full-coverage restoration of a primary (or permanent) molar: football-diamond occlusal reduction 1.5–2.0 mm, knife-edge proximal slices with 0.5 mm clearance and 4–10° convergence, 30–40° buccal/lingual bevels, snap-fit crown trimmed and crimped subgingivally, FujiCem at 80% fill seated with a bite stick.",
    cdt: [
      { code: "D2930", label: "Prefabricated stainless steel crown, primary tooth" },
      { code: "D2931", label: "Prefabricated stainless steel crown, permanent tooth" },
      { code: "D9230", label: "Nitrous oxide / anxiolysis (if used)" },
    ],
    tags: ["SSC", "stainless steel crown", "primary molar", "football diamond", "knife-edge", "proximal slice", "crimping", "contouring pliers", "#114", "#137", "crown scissors", "FujiCem", "bite stick", "Hall technique", "throat pack"],
    tray: [
      { group: "Instrument kits", items: ["Pediatric restorative kit", "Band & crown kit (crown scissors, contouring #114 and crimping #137 pliers, bite stick)", "Pediatric rubber dam kit", "Radiograph sensor & holder", "Nitrous oxide nasal hood"] },
      { group: "Rotary", items: ["High-speed & slow-speed handpieces", "Football diamond (occlusal)", "Thin tapered diamond (proximal slices)", "Slow-speed round burs (caries)", "Green stone / rubber wheel (crown edge smoothing)"] },
      { group: "Materials", items: ["SSC kit (sized crowns)", "FujiCem (RMGI) + tips", "Composite or Fuji IX (buildup if needed)", "Microbrushes"] },
      { group: "Chairside disposables", items: ["Topical, short 30G needle, carpules", "Isodry (size P) / rubber dam", "Gauze throat pack", "Articulating paper, floss, cotton rolls"] },
    ],
    timers: [
      { id: "cement-gel", label: "Cement to gel stage", seconds: 90 },
      { id: "cotton-bite", label: "Bite on cotton roll", seconds: 180 },
      { id: "o2", label: "100% O₂ after nitrous", seconds: 300 },
    ],
    steps: [
      { id: "ss1", title: "Case presentation & consent", body: [
          "Age, weight, history, behavior; plan, sequence, anesthesia, isolation.",
          "Guardian: warn that a deep lesion may also need a pulpotomy. Weigh the patient.",
        ],
        checkpoint: "Pre-treatment clearance: SSC indication confirmed (see matrix), anesthesia dose and isolation approved." },
      { id: "ss2", title: "Nitrous, anesthesia, isolation", body: ["Nitrous if planned. Short 30G needle; one-carpule working limit before re-checking weight maximum.", "Isodry or slit rubber dam ligated with floss."] },
      { id: "ss3", title: "Occlusal reduction", body: ["Football diamond: 1.5–2.0 mm clearance from the opposing tooth, following the general occlusal anatomy."] },
      { id: "ss4", title: "Proximal reduction", body: [
          "Knife-edge finish line at or slightly below the gingival margin — no shoulder, no ledge.",
          "0.5 mm clearance: an explorer passes freely through the contact.",
          "Total convergence 4–10° (2–5° per side), following the rounded tooth form.",
        ] },
      { id: "ss5", title: "Buccal/lingual & corners", body: [
          "Usually no B/L reduction except caries removal.",
          "30–40° bevel on the occlusal-buccal and occlusal-lingual to restore cusp-tip position after occlusal reduction. Round all corners.",
          "Buildup rarely needed (cement fills the space); if needed, composite or Fuji IX.",
        ],
        warn: "Larger than expected or near the pulp: stop and assess for pulpotomy.",
        checkpoint: "Preparation review: 1.5–2.0 mm occlusal, 0.5 mm proximal knife-edge, no ledges, rounded corners." },
      { id: "ss6", title: "Select, trim & crimp", body: [
          "Throat pack if Isodry or dam isn't in place.",
          "Choose the crown matching the mesiodistal width; seat lingual first and roll to buccal. It should snap on and need firm pressure.",
          "Trim with crown scissors so margins sit ~1 mm subgingival (use gingival blanching as a guide).",
          "Contour the gingival third (#114) and crimp the margin (#137) so it springs into the cervical constriction. Smooth trimmed edges.",
          "SSCs can't be adjusted for occlusion; discrepancies under 0.5 mm are tolerated in the primary dentition.",
        ],
        checkpoint: "Crown fit review: snap-on retention, marginal adaptation, occlusion, contacts." },
      { id: "ss7", title: "Radiograph (permanent teeth)", body: ["Permanent-tooth SSC: bitewing with the crown seated before cementation to check margins and extension. Not required for primary teeth."] },
      { id: "ss8", title: "Cement", body: [
          "Fill the crown 80% with FujiCem.",
          "Seat lingual, roll to buccal; patient bites on a bite stick to fully seat.",
          "Remove excess with microbrushes; floss both contacts.",
          "Patient bites on a cotton roll 3 min.",
        ],
        timers: ["cement-gel", "cotton-bite"] },
      { id: "ss9", title: "Recovery & release", body: ["100% O₂ 5 min after nitrous. Release to guardian with soft-tissue precautions."], timers: ["o2"], checkpoint: "Final review: excess cement cleared, occlusion acceptable, patient released in good condition." },
    ],
    matrices: [
      { title: "SSC preparation", columns: ["Surface", "Specification"], rows: [
          ["Occlusal", "1.5–2.0 mm clearance (football diamond), follow anatomy"],
          ["Proximal", "0.5 mm clearance; explorer passes freely"],
          ["Convergence", "4–10° total (2–5° per side)"],
          ["Finish line", "Knife-edge at or slightly subgingival; no ledge"],
          ["Buccal / lingual", "Usually none; 30–40° occlusal bevel"],
          ["Occlusal tolerance", "< 0.5 mm (primary dentition adapts)"],
          ["Cement", "FujiCem, crown 80% full; bite stick; 3 min cotton roll"],
        ] },
      { title: "SSC indications", columns: ["Indication"], rows: [
          ["Caries on 3+ surfaces (including buccal or lingual)"],
          ["Proximal caries beyond the line angles"],
          ["Recurrent caries on a Class II restoration"],
          ["Large 1–2 surface lesion with long time to exfoliation or very high caries risk"],
          ["After pulp therapy (full coverage improves pulpotomy success)"],
        ] },
    ],
    widgets: ["pedsDose"],
    postOp: ["Numb for 2–3 hours: watch for lip and cheek biting.", "The gum around the crown may be sore or bleed a little for a few days; keep brushing it.", "Avoid sticky candy (it can pull the crown off).", "The crown falls out with the baby tooth."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "5" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "male" },
        { id: "guardian", label: "Guardian", type: "text", value: "mother" },
        { id: "weight", label: "Weight (kg)", type: "text", value: "19" },
        { id: "tooth", label: "Tooth", type: "text", value: "A" },
        { id: "mhx", label: "Medical history", type: "text", value: "reviewed with guardian; no changes" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "n2o", label: "Nitrous oxide", type: "select", options: ["No nitrous oxide.", "Nitrous oxide titrated to 40% N₂O / 60% O₂ at 4 L/min; 100% O₂ for 5 min at completion."], value: "Nitrous oxide titrated to 40% N₂O / 60% O₂ at 4 L/min; 100% O₂ for 5 min at completion." },
        { id: "anesthetic", label: "Anesthetic", type: "select", options: ANESTHETICS, value: ANESTHETICS[0] },
        { id: "carps", label: "Carpules", type: "text", value: "1" },
        { id: "block", label: "Injection", type: "text", value: "right IANB and long buccal" },
        { id: "iso", label: "Isolation", type: "select", options: ["Isodry (size P)", "bite block and rubber dam"], value: "bite block and rubber dam" },
        { id: "size", label: "SSC size", type: "text", value: "5" },
        { id: "bw", label: "Radiograph", type: "select", options: ["No radiograph required (primary tooth).", "1 BW taken to confirm crown margins before cementation."], value: "No radiograph required (primary tooth)." },
        { id: "frankl", label: "Behavior (Frankl)", type: "select", options: ["F1 (definitely negative)", "F2 (negative)", "F3 (positive)", "F4 (definitely positive)"], value: "F3 (positive)" },
        { id: "nv", label: "Next visit", type: "text", value: "6-month recall" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents with {{guardian}} for #{{tooth}} stainless steel crown. Weight {{weight}} kg.
Medical history: {{mhx}}. Allergies: {{allergies}}. Guardian consent obtained.

O / A:
#{{tooth}}: multisurface caries; SSC indicated.

P:
{{n2o}}
Topical 20% benzocaine applied. {{carps}} carpule(s) {{anesthetic}} administered as {{block}}; aspiration negative; within weight-based maximum.
Isolation: {{iso}}. Caries excavated. Crown preparation completed (occlusal 1.5–2.0 mm, proximal knife-edge 0.5 mm, 30–40° B/L bevels).
SSC size {{size}} tried in, trimmed, contoured and crimped to ideal fit; occlusion confirmed. {{bw}}
Cemented with FujiCem, seated with bite stick. Excess cement removed; contacts flossed. Occlusion re-confirmed.
Patient released to guardian in good condition; guardian informed patient is numb, monitor lip and soft-tissue biting.
Behavior: {{frankl}}.

NV: {{nv}}`,
    },
  },

  /* ================================================ PULPOTOMY */
  {
    id: "peds-pulpotomy-viscostat-irm",
    kind: "procedure",
    title: "Primary Molar Pulpotomy (Viscostat / IRM) + SSC",
    category: "pediatric",
    duration: "~75–90 min",
    summary:
      "Vital primary molar pulpotomy under rubber dam: #330 to exposure, fissure bur (169/55/56 or straight diamond) to fully unroof, coronal amputation without cutting apically, saline-pellet hemostasis check, Viscostat (ferric sulfate) 10 s, IRM seal to the prep level, then SSC preparation and cementation.",
    cdt: [
      { code: "D3220", label: "Therapeutic pulpotomy (excluding final restoration)" },
      { code: "D2930", label: "Prefabricated stainless steel crown, primary tooth" },
      { code: "D9230", label: "Nitrous oxide / anxiolysis (if used)" },
    ],
    tags: ["pulpotomy", "primary molar", "Viscostat", "ferric sulfate", "IRM", "MTA", "Biodentine", "hemostasis", "#330", "#169", "#55", "#56", "unroof", "coronal pulp", "rubber dam", "SSC", "FujiCem", "reversible pulpitis", "carious exposure"],
    tray: [
      { group: "Instrument kits", items: ["Pediatric restorative kit", "Band & crown kit", "Pediatric rubber dam kit (#14 clamp)", "Radiograph sensor & holder", "Nitrous oxide nasal hood", "Spoon excavators"] },
      { group: "Rotary", items: ["#330 carbide (access to exposure)", "#169, #55, #56 or straight diamond (unroofing)", "Slow-speed round burs (coronal amputation)", "Football and tapered diamonds (SSC prep)", "Endo burs"] },
      { group: "Materials", items: ["Sterile saline + cotton pellets", "Viscostat (20% ferric sulfate) unit-dose", "MTA or Biodentine (preferred alternative)", "IRM powder + liquid, mixing pad", "SSC kit", "FujiCem + tips", "Microbrushes"] },
      { group: "Chairside disposables", items: ["Topical, short 30G needle, carpules", "Rubber dam sheet, floss", "Bite block", "Throat pack gauze", "Articulating paper, floss, cotton rolls"] },
    ],
    timers: [
      { id: "saline", label: "Saline pellet pressure", seconds: 120, note: "1–2 min; bleeding should stop" },
      { id: "viscostat", label: "Viscostat contact", seconds: 10 },
      { id: "cotton-bite", label: "Bite on cotton roll", seconds: 180 },
      { id: "o2", label: "100% O₂ after nitrous", seconds: 300 },
    ],
    steps: [
      { id: "pp1", title: "Case selection", body: [
          "Indicated: vital pulp with carious exposure, small mechanical exposure, or provoked pain with a large lesion (reversible or limited irreversible pulpitis of the coronal pulp).",
          "Contraindicated: history of spontaneous pain, soft-tissue swelling, necrotic pulp, furcation radiolucency or root resorption, excessive bleeding after amputation.",
          "Direct pulp caps are not used for carious exposures of primary teeth; pulpotomy is indicated. Necrotic primary teeth are extracted (or pulpectomy per plan).",
        ],
        checkpoint: "Pre-treatment clearance: vital pulp, no spontaneous pain, swelling, sinus tract, furcation radiolucency or resorption on a current radiograph." },
      { id: "pp2", title: "Presentation, guardian, anesthesia", body: ["Present plan, anesthesia and isolation; guardian warned about possible extraction if the pulp proves non-vital; weigh.", "Nitrous if planned; short 30G needle; one-carpule working limit before re-checking weight maximum."] },
      { id: "pp3", title: "Rubber dam (required)", body: ["Rubber dam for pulpotomies (not Isodry); ligate the clamp. Slit-dam technique speeds placement."] },
      { id: "pp4", title: "Caries removal & access", body: [
          "Remove all caries.",
          "Access through the occlusal table toward the most prominent pulp horn with a #330 until exposure.",
        ] },
      { id: "pp5", title: "Unroof", body: ["Fissure bur (#169, #55, #56) or straight diamond: remove the whole roof so the entire chamber is visible, with straight-line access."] },
      { id: "pp6", title: "Amputate coronal pulp", body: [
          "Slow-speed round bur: rest it on the chamber floor without rotating, lift slightly, then rotate and move laterally and coronally — never apically.",
          "Or spoon excavator: less perforation risk, more risk of pulling radicular tissue.",
          "Chamber floor clearly visible with no residual tissue; bleeding only from the orifices.",
        ] },
      { id: "pp7", title: "Hemostasis check", body: [
          "Cotton pellets soaked in saline in the chamber with light pressure.",
          "Remove and check: hemostasis should be achieved. Profuse bleeding = residual coronal tissue (re-amputate) or inflamed radicular pulp (pulpectomy/extraction).",
        ],
        timers: ["saline"],
        checkpoint: "Hemostasis confirmed at the orifices before medicament." },
      { id: "pp8", title: "Medicament", body: [
          "Viscostat (20% ferric sulfate) on a cotton pellet in the chamber 10 s; rinse thoroughly.",
          "Alternative: MTA or Biodentine placed directly over the orifices.",
        ],
        ebd: "Current pediatric guidance favors MTA or Biodentine as the pulpotomy agent with the highest long-term success; ferric sulfate remains acceptable. Formocresol is no longer preferred.",
        timers: ["viscostat"] },
      { id: "pp9", title: "IRM seal", body: ["Mix IRM thick and condense into the chamber to about the level of the preparation, well adapted to the floor to seal completely."], checkpoint: "IRM adaptation and chamber seal verified." },
      { id: "pp10", title: "SSC prep, fit & cement", body: [
          "Occlusal 1.5–2.0 mm (football diamond); proximal knife-edge 0.5 mm, 4–10° convergence; 30–40° B/L bevels; round corners.",
          "Throat pack. Select, snap on lingual → buccal, trim, contour and crimp.",
          "FujiCem 80% fill; seat lingual → buccal; bite stick; clean with microbrushes; floss; cotton roll 3 min.",
        ],
        ebd: "Place the definitive full-coverage restoration at the same visit; coronal seal is a major determinant of pulpotomy success.",
        timers: ["cotton-bite"],
        checkpoint: "Crown fit and cementation review: marginal adaptation, occlusion, excess cement removed." },
      { id: "pp11", title: "Recovery & release", body: ["100% O₂ 5 min after nitrous. Release with soft-tissue precautions."], timers: ["o2"] },
    ],
    matrices: [
      { title: "Pulpotomy decision points", columns: ["Finding", "Action"], rows: [
          ["Hemostasis within 1–2 min of saline pellet", "Proceed: Viscostat 10 s (or MTA/Biodentine) → IRM → SSC"],
          ["Persistent bleeding, all coronal tissue removed", "Radicular pulp inflamed → pulpectomy or extraction"],
          ["No bleeding / necrotic tissue", "Non-vital → extraction (or pulpectomy per plan)"],
          ["Spontaneous pain, swelling, furcation RL, resorption", "Pulpotomy contraindicated"],
        ] },
    ],
    widgets: ["pedsDose"],
    postOp: ["Numb for 2–3 hours: watch for lip and cheek biting.", "Some tenderness for a day or two is normal; children's ibuprofen or acetaminophen by weight.", "Call for swelling, fever or pain that gets worse.", "Recall with radiographs to monitor the tooth."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "6" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "guardian", label: "Guardian", type: "text", value: "mother" },
        { id: "weight", label: "Weight (kg)", type: "text", value: "21" },
        { id: "tooth", label: "Tooth", type: "text", value: "A" },
        { id: "mhx", label: "Medical history", type: "text", value: "reviewed with guardian; no changes" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "dx", label: "Diagnosis", type: "text", value: "deep caries with provoked pain only; no swelling, sinus tract or furcation radiolucency; reversible pulpitis" },
        { id: "n2o", label: "Nitrous oxide", type: "select", options: ["No nitrous oxide.", "Nitrous oxide titrated to 40% N₂O / 60% O₂ at 4 L/min; 100% O₂ for 5 min at completion."], value: "Nitrous oxide titrated to 40% N₂O / 60% O₂ at 4 L/min; 100% O₂ for 5 min at completion." },
        { id: "anesthetic", label: "Anesthetic", type: "select", options: ANESTHETICS, value: ANESTHETICS[0] },
        { id: "carps", label: "Carpules", type: "text", value: "1" },
        { id: "block", label: "Injection", type: "text", value: "right IANB and long buccal" },
        { id: "medicament", label: "Medicament", type: "select", options: ["Viscostat (ferric sulfate) on cotton pellet 10 s, rinsed thoroughly", "MTA placed over canal orifices", "Biodentine placed over canal orifices"], value: "Viscostat (ferric sulfate) on cotton pellet 10 s, rinsed thoroughly" },
        { id: "size", label: "SSC size", type: "text", value: "5" },
        { id: "frankl", label: "Behavior (Frankl)", type: "select", options: ["F1 (definitely negative)", "F2 (negative)", "F3 (positive)", "F4 (definitely positive)"], value: "F4 (definitely positive)" },
        { id: "nv", label: "Next visit", type: "text", value: "6-month recall with radiograph" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents with {{guardian}} for #{{tooth}} pulpotomy and SSC. Weight {{weight}} kg.
Medical history: {{mhx}}. Allergies: {{allergies}}. Guardian consent obtained.

O / A:
#{{tooth}}: {{dx}}. Pulpotomy indicated.

P:
{{n2o}}
Topical 20% benzocaine applied. {{carps}} carpule(s) {{anesthetic}} administered as {{block}}; aspiration negative; within weight-based maximum.
Bite block and rubber dam placed. Caries removed completely. Pulp chamber accessed and fully unroofed; coronal pulp amputated. Hemostasis achieved with saline-moistened cotton pellet and confirmed at orifices. {{medicament}}. IRM placed and adapted to chamber floor.
SSC preparation completed; SSC size {{size}} tried in, trimmed and crimped; occlusion confirmed. Cemented with FujiCem, seated with bite stick; excess removed; contacts flossed.
Patient released to guardian in good condition; guardian informed patient is numb, monitor lip and soft-tissue biting.
Behavior: {{frankl}}.

NV: {{nv}}`,
    },
  },

  /* ================================================ STRIP CROWN */
  {
    id: "peds-strip-crown",
    kind: "procedure",
    title: "Composite Strip Crown (Primary Anterior)",
    category: "pediatric",
    duration: "~45 min per tooth",
    summary:
      "Full-coverage resin crown on a primary incisor using a celluloid crown form: 1 mm proximal and facial knife-edge reduction, 0.5 mm lingual clearance, 1.5 mm incisal reduction with rounded corners, trimmed crown form filled with microfill, cured 40 s, stripped and finished, out of occlusion in all excursions.",
    cdt: [
      { code: "D2390", label: "Resin-based composite crown, anterior" },
      { code: "D9230", label: "Nitrous oxide / anxiolysis (if used)" },
    ],
    tags: ["strip crown", "celluloid crown form", "primary incisor", "early childhood caries", "ECC", "knife-edge", "incisal reduction", "vent hole", "microfill", "Renamel", "zirconia crown", "D2390"],
    tray: [
      { group: "Instrument kits", items: ["Pediatric restorative kit", "Pediatric rubber dam kit", "Composite gun", "LED curing light", "Vita shade guide", "Nitrous oxide nasal hood", "Crown scissors"] },
      { group: "Rotary", items: ["Tapered and flame diamonds (proximal/facial)", "Wheel or football diamond (lingual/incisal)", "Slow-speed round burs (caries)", "Composite finishing burs"] },
      { group: "Materials", items: ["Celluloid strip crown forms (sized)", "35% phosphoric acid etch", "Scotchbond Universal", "Renamel Microfill", "Shofu, Enamelize, discs, finishing strips, #12 blade"] },
      { group: "Chairside disposables", items: ["Topical, short 30G needle, carpules", "Isodry (size P) / rubber dam", "Wedget", "Articulating paper, floss"] },
    ],
    timers: [
      { id: "etch", label: "Enamel etch", seconds: 15 },
      { id: "bond", label: "Universal adhesive scrub", seconds: 20 },
      { id: "airthin", label: "Air-thin adhesive", seconds: 5 },
      { id: "cure-bond", label: "Cure adhesive", seconds: 10 },
      { id: "cure-crown", label: "Cure through crown form", seconds: 40 },
      { id: "o2", label: "100% O₂ after nitrous", seconds: 300 },
    ],
    steps: [
      { id: "sc1", title: "Presentation, guardian, anesthesia", body: ["Plan, sequence, anesthesia and isolation presented; guardian warned a pulpotomy may be needed; weigh.", "Nitrous if planned; short 30G needle; one-carpule working limit before re-checking weight maximum."], checkpoint: "Pre-treatment clearance: enough tooth structure to retain a bonded crown; no pulpal pathology." },
      { id: "sc2", title: "Shade & isolation", body: ["Select shade.", "Isodry (may interfere anteriorly) or rubber dam ligated with floss; slit dam for speed."] },
      { id: "sc3", title: "Preparation", body: [
          "Remove caries.",
          "Proximal: 1 mm, knife-edge at or slightly subgingival, 4–10° total convergence, follow tooth form; no shoulder or ledge.",
          "Facial: 1 mm, knife-edge, follow tooth form.",
          "Lingual: 0.5 mm clearance from the opposing tooth.",
          "Incisal: 1.5 mm; round the incisal corners.",
        ],
        warn: "Near the pulp or larger than expected: stop and assess for pulp therapy.",
        checkpoint: "Preparation review: dimensions, knife-edge margins, rounded corners." },
      { id: "sc4", title: "Fit the crown form", body: [
          "Select shape and size; trim the gingival edge with crown scissors to follow the gingival contour.",
          "Punch a small vent hole at an incisal corner to let air and excess escape.",
          "If the form won't fit, reduce the tooth more even if dimensions already look ideal.",
        ],
        checkpoint: "Crown form fit review before bonding." },
      { id: "sc5", title: "Etch & bond", body: ["Etch enamel 15 s; rinse; dentin moist.", "Scotchbond Universal: scrub 20 s, air-thin 5 s, cure 10 s. Contaminated: re-etch 5 s."], timers: ["etch", "bond", "airthin", "cure-bond"] },
      { id: "sc6", title: "Fill, seat & cure", body: [
          "Fill the crown form with Renamel Microfill without voids.",
          "Seat on the tooth; remove extruded excess at the margins.",
          "Light-cure 40 s (facial and lingual).",
        ],
        timers: ["cure-crown"] },
      { id: "sc7", title: "Strip, finish & check", body: [
          "Remove the celluloid form with an explorer or #12 blade.",
          "Finish and polish, especially the gingival margins (discs, strips, Shofu, Enamelize).",
          "The crown must be out of contact in centric, protrusion and lateral movements.",
        ],
        timers: ["o2"],
        checkpoint: "Final review: smooth gingival margins, no occlusal contact in any excursion, patient released in good condition." },
    ],
    matrices: [
      { title: "Strip crown preparation", columns: ["Surface", "Reduction"], rows: [
          ["Proximal", "1 mm, knife-edge, 4–10° total convergence"],
          ["Facial", "1 mm, knife-edge"],
          ["Lingual", "0.5 mm clearance from opposing"],
          ["Incisal", "1.5 mm, rounded corners"],
          ["Cure", "40 s through crown form"],
          ["Occlusion", "No contact in centric, protrusion or laterals"],
        ] },
    ],
    widgets: ["pedsDose"],
    postOp: ["Numb for 2–3 hours: watch for lip biting.", "Avoid biting hard foods with the front teeth; cut food into pieces.", "Brush the gumline around the crowns carefully twice a day; limit sugary drinks, especially bottles or sippy cups at night."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "3" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "guardian", label: "Guardian", type: "text", value: "mother" },
        { id: "weight", label: "Weight (kg)", type: "text", value: "14" },
        { id: "tooth", label: "Tooth", type: "text", value: "F" },
        { id: "mhx", label: "Medical history", type: "text", value: "reviewed with guardian; no changes" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "n2o", label: "Nitrous oxide", type: "select", options: ["No nitrous oxide.", "Nitrous oxide titrated to 40% N₂O / 60% O₂ at 4 L/min; 100% O₂ for 5 min at completion."], value: "Nitrous oxide titrated to 40% N₂O / 60% O₂ at 4 L/min; 100% O₂ for 5 min at completion." },
        { id: "anesthetic", label: "Anesthetic", type: "select", options: ANESTHETICS, value: ANESTHETICS[0] },
        { id: "carps", label: "Carpules", type: "text", value: "0.5" },
        { id: "block", label: "Injection", type: "text", value: "labial infiltration above #F" },
        { id: "shade", label: "Shade", type: "text", value: "A1" },
        { id: "frankl", label: "Behavior (Frankl)", type: "select", options: ["F1 (definitely negative)", "F2 (negative)", "F3 (positive)", "F4 (definitely positive)"], value: "F3 (positive)" },
        { id: "nv", label: "Next visit", type: "text", value: "#E strip crown" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents with {{guardian}} for #{{tooth}} composite strip crown. Weight {{weight}} kg.
Medical history: {{mhx}}. Allergies: {{allergies}}. Guardian consent obtained.

O / A:
#{{tooth}}: multisurface caries (early childhood caries); full-coverage resin crown indicated.

P:
{{n2o}}
Topical 20% benzocaine applied. {{carps}} carpule(s) {{anesthetic}} administered as {{block}}; aspiration negative; within weight-based maximum.
Isodry placed. Caries excavated. Crown preparation completed (1 mm proximal and facial knife-edge, 0.5 mm lingual clearance, 1.5 mm incisal, rounded corners).
Strip crown form selected, trimmed and vented. Enamel etched with 35% phosphoric acid 15 s, rinsed. Scotchbond Universal scrubbed 20 s, air-thinned 5 s, cured 10 s.
Crown form loaded with Renamel Microfill, shade {{shade}}, seated, excess removed, cured 40 s. Form removed; finished and polished with attention to gingival margins.
Occlusion checked: no contact in centric, protrusion or lateral excursions. Contacts evaluated with floss.
Patient released to guardian in good condition; guardian informed patient is numb, monitor lip biting.
Behavior: {{frankl}}.

NV: {{nv}}`,
    },
  },

  /* ================================================ SDF */
  {
    id: "peds-sdf",
    kind: "procedure",
    title: "Silver Diamine Fluoride (38% SDF) Application",
    category: "pediatric",
    duration: "~10 min",
    summary:
      "Non-invasive caries arrest: informed consent with photos of black staining, petroleum jelly on lips, cotton-roll isolation, dry completely, thin coat from one drop in a dappen dish, 60 s to dry, blot excess, rinse.",
    cdt: [
      { code: "D1354", label: "Application of caries arresting medicament, per tooth" },
    ],
    tags: ["SDF", "silver diamine fluoride", "38%", "caries arrest", "non-restorative", "early childhood caries", "black staining", "informed consent", "D1354", "fluoride varnish", "minimal intervention", "high caries risk"],
    tray: [
      { group: "Materials", items: ["38% SDF", "Dappen dish (light-protected)", "Microbrushes", "Petroleum jelly", "Cotton rolls, gauze", "Photos of SDF staining (consent)"] },
    ],
    timers: [
      { id: "sdf-dry", label: "SDF contact / dry", seconds: 60 },
    ],
    steps: [
      { id: "sd1", title: "Case selection & consent", body: [
          "Indications: high caries risk, cavitated lesions without pulpal involvement, children who can't tolerate conventional care, difficult-to-treat lesions, or as interim arrest.",
          "Contraindications: silver allergy; ulcerative gingivitis or stomatitis; signs of pulpal involvement (spontaneous pain, abscess, swelling).",
          "Show the guardian photos: arrested lesions stain black permanently; transient soft-tissue/skin staining is possible; lesions may not arrest and may later need restoration.",
        ],
        checkpoint: "Informed consent documented after photos shown; no silver allergy; no pulpal symptoms." },
      { id: "sd2", title: "Prepare", body: ["One drop of SDF in a dappen dish.", "Thick layer of petroleum jelly on the lips and perioral skin."], warn: "SDF stains skin, clothing and surfaces; protect the patient with a bib and keep it off counters." },
      { id: "sd3", title: "Isolate & dry", body: ["Cotton rolls (or hand retraction).", "Dry the lesion completely with gauze, then air."] },
      { id: "sd4", title: "Apply", body: ["Microbrush a thin coat onto the lesion only; very little is needed.", "Leave 60 s to dry."], timers: ["sdf-dry"] },
      { id: "sd5", title: "Remove excess & rinse", body: ["Blot remaining wet SDF with a cotton roll.", "Rinse and suction."], ebd: "AAPD guidance: limit to about one drop per 10 kg body weight per visit; reapplication at 6-month intervals (or more often initially) improves arrest rates. Fluoride varnish may be applied afterward.", checkpoint: "Application documented by tooth and surface; reapplication interval scheduled." },
    ],
    matrices: [
      { title: "SDF protocol", columns: ["Parameter", "Specification"], rows: [
          ["Concentration", "38% SDF"],
          ["Amount", "1 drop in dappen dish; thin coat per lesion"],
          ["Dose ceiling", "~1 drop per 10 kg per visit (AAPD)"],
          ["Contact time", "60 s to dry"],
          ["Soft-tissue protection", "Petroleum jelly on lips"],
          ["Reapplication", "Every 6 months (or per risk)"],
        ] },
    ],
    postOp: ["The treated spots will turn dark or black; this means the decay is stopping.", "A metallic taste for a short time is normal.", "Any staining on skin fades in 1–2 weeks; on clothing it is permanent.", "Keep brushing twice daily with fluoride toothpaste; return for reapplication."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "3" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "male" },
        { id: "guardian", label: "Guardian", type: "text", value: "mother" },
        { id: "weight", label: "Weight (kg)", type: "text", value: "15" },
        { id: "teeth", label: "Teeth / surfaces", type: "text", value: "#A-O, #J-O" },
        { id: "fv", label: "Fluoride varnish", type: "select", options: ["Fluoride varnish applied to remaining teeth.", "No fluoride varnish today."], value: "Fluoride varnish applied to remaining teeth." },
        { id: "nv", label: "Next visit", type: "text", value: "SDF reapplication in 6 months" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents with {{guardian}} for SDF application. Weight {{weight}} kg. No silver allergy.

O / A:
{{teeth}}: cavitated caries without signs of pulpal involvement; high caries risk.

P:
Discussed SDF with guardian and patient, including permanent black staining of carious lesions (photos shown), possible transient soft-tissue staining, and possible failure to arrest with future need for restoration. Guardian consented.
Petroleum jelly applied to lips. Isolated with cotton rolls; teeth dried thoroughly. 38% SDF applied to {{teeth}} with microbrush; allowed 60 s to dry. Excess removed; rinsed and suctioned. {{fv}}

NV: {{nv}}`,
    },
  },

  /* ================================================ PEDS ANESTHESIA */
  {
    id: "peds-local-anesthesia",
    kind: "procedure",
    title: "Pediatric Local Anesthesia — Maximum Dose Calculation",
    category: "pediatric",
    duration: "~5 min",
    summary:
      "Weigh every child, calculate the weight-based maximum (lidocaine 4.4 mg/kg) and convert it to carpules before injecting; use a short 30G needle even for IANB; one-carpule working limit before re-verifying; screen nitrous oxide contraindications.",
    cdt: [
      { code: "D9230", label: "Nitrous oxide / analgesia, anxiolysis (if used)" },
    ],
    tags: ["pediatric", "local anesthetic", "maximum dose", "mg/kg", "4.4 mg/kg", "lidocaine", "articaine", "mepivacaine", "prilocaine", "carpule", "weight", "30G", "short needle", "IANB", "nitrous oxide contraindications", "toxicity", "soft-tissue injury"],
    tray: [
      { group: "Equipment", items: ["Scale (weigh every visit)", "Short 30G needles", "Topical 20% benzocaine", "Carpules (agent per plan)", "Nitrous oxide nasal hood (if planned)"] },
    ],
    timers: [
      { id: "topical", label: "Topical anesthetic", seconds: 60 },
    ],
    steps: [
      { id: "la1", title: "Weigh & calculate", body: [
          "Weigh the child at every visit.",
          "Max dose (mg) = weight (kg) × mg/kg for the agent, never above the absolute maximum.",
          "Max carpules = max dose ÷ mg per carpule (1.8 mL). Round down.",
          "Example: 20 kg child, 2% lidocaine → 20 × 4.4 = 88 mg ÷ 36 mg = 2.4 carpules.",
        ],
        checkpoint: "Anesthesia plan cleared: agent, injection sites, calculated maximum mg and carpules recorded before injection." },
      { id: "la2", title: "Choose agent & needle", body: [
          "Short 30G needle, even for IANB, except larger teens (≈12+).",
          "Articaine is not recommended under age 4.",
          "Treat one quadrant at a time; avoid bilateral IANBs in young children.",
        ],
        ebd: "Children's mandibular foramen sits lower relative to the occlusal plane; inject IANB slightly lower than in adults. Buccal infiltration with articaine is often effective for primary mandibular molars in children over 4." },
      { id: "la3", title: "Inject", body: ["Topical 1–2 min.", "Aspirate before every deposit; inject slowly; tell-show-do language.", "One carpule is the working limit before re-verifying against the calculated maximum."], timers: ["topical"] },
      { id: "la4", title: "Nitrous oxide screen", body: [
          "Contraindications: middle-ear infection, nasal obstruction, COPD, active nausea/vomiting, claustrophobia or severe emotional disturbance, bleomycin therapy, MTHFR deficiency, cobalamin (B₁₂) deficiency, nitrous oxide use in the past 7 days.",
        ] },
      { id: "la5", title: "Soft-tissue safety", body: ["Warn the guardian about lip, cheek and tongue biting; place a cotton roll if needed.", "Document agent, volume, site and aspiration."], warn: "Signs of toxicity (drowsiness, slurred speech, twitching, seizures): stop, call for help, support airway, oxygen, activate emergency response." },
    ],
    matrices: [
      { title: "Pediatric maximum doses (1.8 mL carpule)", columns: ["Agent", "mg/kg", "Absolute max", "mg per carpule", "Source"], rows: [
          ["Lidocaine 2% + epi", "4.4", "300 mg", "36", "Manual / AAPD"],
          ["Mepivacaine 3% plain", "4.4", "300 mg", "54", "AAPD"],
          ["Articaine 4% + epi", "7.0", "500 mg", "72", "AAPD (not < 4 yr)"],
          ["Prilocaine 4%", "6.0", "400 mg", "72", "AAPD"],
          ["Bupivacaine 0.5%", "1.3", "90 mg", "9", "AAPD (not recommended for young children)"],
        ],
        note: "Formula: max mg = kg × mg/kg (cap at absolute max); carpules = max mg ÷ mg per carpule, rounded down." },
      { title: "Quick lidocaine 2% table (4.4 mg/kg)", columns: ["Weight", "Max mg", "Max carpules"], rows: [
          ["10 kg", "44", "1.2"], ["15 kg", "66", "1.8"], ["20 kg", "88", "2.4"], ["25 kg", "110", "3.1"], ["30 kg", "132", "3.7"], ["40 kg", "176", "4.9"],
        ] },
    ],
    widgets: ["pedsDose"],
    postOp: ["Numb for 2–3 hours: supervise so your child doesn't bite or chew the lip, cheek or tongue.", "Soft foods only until the numbness is gone."],
    soap: {
      fields: [
        { id: "weight", label: "Weight (kg)", type: "text", value: "20" },
        { id: "anesthetic", label: "Anesthetic", type: "select", options: ANESTHETICS, value: ANESTHETICS[0] },
        { id: "maxmg", label: "Calculated max (mg)", type: "text", value: "88" },
        { id: "carps", label: "Carpules given", type: "text", value: "1" },
        { id: "block", label: "Injection", type: "text", value: "right IANB and long buccal" },
        { id: "needle", label: "Needle", type: "select", options: ["short 30G", "short 27G", "long 27G (adolescent)"], value: "short 30G" },
      ],
      template: `Anesthesia:
Weight {{weight}} kg; calculated maximum {{maxmg}} mg for {{anesthetic}}. Topical 20% benzocaine applied. {{carps}} carpule(s) administered as {{block}} with {{needle}} needle; aspiration negative; total dose within weight-based maximum. Guardian advised on soft-tissue precautions.`,
    },
  },

  /* ================================================ COMPREHENSIVE ORAL EXAM */
  {
    id: "comprehensive-oral-exam",
    kind: "procedure",
    title: "Comprehensive Oral Evaluation (New Patient)",
    category: "diagnostics",
    duration: "2–3 visits (~2–3 h each)",
    summary:
      "New-patient workup in three parts: periodontal evaluation (full charting, staging/grading, prognosis, perio plan, mounting records), restorative evaluation (EOE/IOE, oral cancer screening, odontogram, caries risk, endo testing, photos), and treatment-plan presentation with signed consent.",
    cdt: [
      { code: "D0150", label: "Comprehensive oral evaluation, new or established patient" },
      { code: "D0180", label: "Comprehensive periodontal evaluation (periodontal patients, alternative to D0150)" },
      { code: "D0601", label: "Caries risk assessment — low" },
      { code: "D0602", label: "Caries risk assessment — moderate" },
      { code: "D0603", label: "Caries risk assessment — high" },
      { code: "D0470", label: "Diagnostic casts" },
      { code: "D0350", label: "2D oral/facial photographic images" },
      { code: "D0460", label: "Pulp vitality tests" },
      { code: "D1320", label: "Tobacco counseling" },
    ],
    tags: ["COE", "comprehensive exam", "new patient", "D0150", "D0180", "perio charting", "staging", "grading", "prognosis", "caries risk", "CAMBRA", "EOE", "IOE", "oral cancer screening", "odontogram", "endo testing", "facebow", "diagnostic casts", "treatment plan", "informed consent", "implant consult"],
    tray: [
      { group: "Instrument kits", items: ["Exam kit (mirror, explorer, probe)", "Cheek retractors + intraoral mirrors", "Camera", "Facebow + bite fork, Regisil gun", "Endo testing: Endo-Ice, cotton pellets, EPT"] },
      { group: "Materials", items: ["Alginate, bowl, spatula, trays, spray adhesive", "Regisil + tips", "Disclosing solution (optional)"] },
      { group: "Records", items: ["Current FMX + panoramic (or diagnostic outside films)", "Medical history, medication list", "Caries risk form", "Blood pressure cuff"] },
    ],
    timers: [
      { id: "pour", label: "Pour alginate within", seconds: 900 },
    ],
    steps: [
      { id: "co1", title: "Records before the exam", body: [
          "Radiographs: FMX and panoramic (or diagnostic-quality outside films).",
          "Chart missing teeth from the radiographs.",
        ],
        ebd: "Prescribe radiographs by individual need per the ADA/FDA selection criteria rather than fixed intervals." },
      { id: "co2", title: "History & vitals", body: [
          "Medications and allergies; full medical history review with date.",
          "Chief complaint; dental history (last visit, home care).",
          "Tobacco use; cessation counseling.",
          "Blood pressure and pulse (glucose if indicated).",
        ],
        checkpoint: "Start check: medical history, medications, vitals and any contraindications to care reviewed." },
      { id: "co3", title: "Part 1 · Periodontal evaluation", body: [
          "Full chart: probing depths, bleeding on probing, free gingival margin/recession, mucogingival defects, mobility, furcations.",
          "Radiographic bone loss pattern, calculus, crown:root ratios.",
          "Diagnosis (2018 AAP/EFP stage, grade, extent), per-tooth prognosis, periodontal treatment plan (SRP, re-evaluation, referral).",
          "Optional plaque disclosure.",
        ],
        checkpoint: "Periodontal findings, diagnosis and plan reviewed." },
      { id: "co4", title: "Part 2 · Restorative evaluation", body: [
          "Dental history; caries risk assessment (low / moderate / high).",
          "EOE (soft tissue, swelling, asymmetry, lymph nodes), TMJ (deviation, crepitus, locking), IOE, oral cancer screening (lips, buccal mucosa, tongue, floor of mouth, palate, oropharynx).",
          "Odontogram tooth by tooth: caries, fractures, decalcification, open contacts/margins, overhangs, abfraction/abrasion, existing restorations.",
          "Occlusal assessment. Endo testing of suspect teeth. Intraoral photographs.",
          "Implant candidates: arrange an implant consultation before the plan is finalized.",
        ],
        checkpoint: "Restorative findings, caries risk and endo test results reviewed." },
      { id: "co5", title: "Mounting records & casts", body: [
          "Facebow for any case needing mounted casts; bite registration if hand articulation isn't possible (wax rims if no posterior occlusion).",
          "Diagnostic impressions at the end of the visit; pour within 15 min.",
        ],
        timers: ["pour"] },
      { id: "co6", title: "Part 3 · Treatment plan presentation", body: [
          "Before the visit: mounted casts and wax-ups (surveyed and designed if an RPD is planned); complete phased plan reviewed.",
          "Present options, sequence (disease control → restorative → prosthetic → maintenance), costs and timeline; advantages and disadvantages of each.",
          "Discuss specific uncertainties (e.g., restorability after crown removal, deep caries near the pulp).",
          "Patient signs the plan; give a printed copy.",
        ],
        checkpoint: "Treatment plan approved and signed; informed consent documented." },
    ],
    matrices: [
      { title: "COE sequence", columns: ["Part", "Core content", "Output"], rows: [
          ["Records", "FMX + pan", "Radiographic findings"],
          ["1 · Periodontal", "Full charting, radiographic bone levels", "Stage/grade, prognosis, perio plan"],
          ["2 · Restorative", "EOE/IOE, cancer screen, odontogram, caries risk, endo tests, photos", "Findings, diagnoses, casts"],
          ["3 · Treatment plan", "Phased options, costs, timeline", "Signed plan and consent"],
        ] },
    ],
    postOp: [],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "44" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "cc", label: "Chief complaint", type: "text", value: "I want to fix my teeth" },
        { id: "mhx", label: "Medical history", type: "text", value: "type 2 diabetes (HbA1c 6.8%), metformin" },
        { id: "allergies", label: "Allergies", type: "text", value: "penicillin (rash)" },
        { id: "bp", label: "BP / pulse", type: "text", value: "128/82, 76 bpm" },
        { id: "dental_hx", label: "Dental history", type: "text", value: "last visit 4 years ago; brushes 2x/day, flosses rarely" },
        { id: "tobacco", label: "Tobacco", type: "select", options: ["Never user.", "Former user.", "Current user; cessation counseling provided."], value: "Never user." },
        { id: "perio", label: "Periodontal findings", type: "textarea", value: "Generalized 4–5 mm PD with BOP 38%; localized 6 mm #3, #14, #19; generalized horizontal bone loss to coronal third; moderate subgingival calculus." },
        { id: "perio_dx", label: "Periodontal diagnosis", type: "text", value: "Generalized Stage III, Grade B periodontitis" },
        { id: "exam", label: "EOE / IOE / cancer screen", type: "text", value: "EOE, TMJ and IOE WNL; oral cancer screening negative" },
        { id: "hard", label: "Hard-tissue findings", type: "textarea", value: "#3-MO and #14-DO caries into dentin; #19 failing MOD amalgam with recurrent caries; #30 missing." },
        { id: "risk", label: "Caries risk", type: "select", options: ["low", "moderate", "high"], value: "high" },
        { id: "pulp", label: "Endo testing / pulpal dx", type: "text", value: "#19 cold 2 s/2 s, percussion –; normal pulp" },
        { id: "plan", label: "Plan summary", type: "textarea", value: "Phase 1: SRP 4 quadrants, OHI, re-evaluation 4–6 weeks. Phase 2: #3-MO, #14-DO composites; #19 buildup and crown. Phase 3: #30 implant consult. Phase 4: periodontal maintenance every 3 months." },
        { id: "nv", label: "Next visit", type: "text", value: "SRP UR/LR" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for comprehensive oral evaluation. CC: "{{cc}}".
Medical history: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.
Dental history: {{dental_hx}}. Tobacco: {{tobacco}}

O:
FMX and panoramic radiographs reviewed.
Periodontal: {{perio}}
{{exam}}.
Hard tissue: {{hard}}
Endo testing: {{pulp}}.

A:
Periodontal: {{perio_dx}}.
Caries risk: {{risk}}.
Pulpal: see endo testing.

P:
Diagnostic impressions, facebow and bite registration taken; intraoral photographs taken.
Treatment plan: {{plan}}
All options, sequence, costs and timelines reviewed; advantages and disadvantages discussed; questions answered. Verbal and written consent obtained; patient signed treatment plan.

NV: {{nv}}`,
    },
  },

  /* ================================================ PERIODIC ORAL EXAM */
  {
    id: "periodic-oral-exam",
    kind: "procedure",
    title: "Periodic Oral Evaluation & Prophylaxis (Recall)",
    category: "diagnostics",
    duration: "~2 h",
    summary:
      "Recall visit for an established patient: updated history, caries risk and tobacco screen, radiographs by risk, EOE/IOE and cancer screen, odontogram update and new plan if needed, periodontal charting at least yearly, and prophylaxis (ultrasonic, floss, hand instruments, explorer check, polish) with OHI and nutrition counseling.",
    cdt: [
      { code: "D0120", label: "Periodic oral evaluation, established patient" },
      { code: "D1110", label: "Prophylaxis, adult" },
      { code: "D1120", label: "Prophylaxis, child" },
      { code: "D0274", label: "Bitewings, four radiographic images" },
      { code: "D0601", label: "Caries risk assessment — low" },
      { code: "D0602", label: "Caries risk assessment — moderate" },
      { code: "D0603", label: "Caries risk assessment — high" },
      { code: "D1206", label: "Topical fluoride varnish" },
      { code: "D1330", label: "Oral hygiene instructions" },
      { code: "D1310", label: "Nutritional counseling" },
      { code: "D1320", label: "Tobacco counseling" },
    ],
    tags: ["POE", "recall", "periodic exam", "D0120", "prophy", "D1110", "bitewings", "caries risk", "perio charting yearly", "Cavitron", "ultrasonic", "ODU 11/12 explorer", "OHI", "nutritional counseling", "fluoride varnish", "pediatric recall", "anticipatory guidance"],
    tray: [
      { group: "Instrument kits", items: ["Exam kit", "Radiograph sensor & holder", "Perio kit (scalers, curettes, 11/12 ODU explorer)", "Ultrasonic scaler insert", "Implant maintenance instruments (if implants)", "Prophy handpiece"] },
      { group: "Materials", items: ["Prophy angles + paste", "Floss", "Fluoride varnish", "Toothbrush/model for OHI", "Take-home kit"] },
    ],
    timers: [],
    steps: [
      { id: "pe1", title: "History, risk & radiographs", body: [
          "Update medical history, medications, allergies; vitals.",
          "Caries risk assessment; tobacco screen and counseling.",
          "Radiographs as indicated (bitewings commonly yearly for moderate/high risk; FMX periodically).",
        ],
        ebd: "Per the ADA/FDA selection criteria, recall bitewings for adults range from 6–18 months (high risk) to 24–36 months (low risk); individualize.",
        checkpoint: "Start check: history reviewed and radiographs justified before exposure." },
      { id: "pe2", title: "Examination", body: [
          "EOE, TMJ, IOE, oral cancer screening.",
          "Odontogram update from clinical and radiographic findings.",
          "Periodontal charting at least yearly for prophylaxis patients (every visit for maintenance patients).",
        ] },
      { id: "pe3", title: "New treatment plan (if needed)", body: ["Plan any new findings; review options and obtain approval and signature."], checkpoint: "Findings and any new plan reviewed and approved." },
      { id: "pe4", title: "Prophylaxis", body: [
          "Rubber cup first for heavy plaque; ultrasonic scaler; floss interproximals; finish with hand instruments.",
          "Check with the 11/12 ODU explorer at line angles, the CEJ and under contacts.",
          "Polish after the work is checked so paste debris doesn't mask calculus.",
        ],
        checkpoint: "Prophylaxis review: no residual calculus at line angles, CEJ, contacts." },
      { id: "pe5", title: "Prevention & counseling", body: [
          "OHI with demonstration; nutritional counseling; tobacco cessation.",
          "Fluoride varnish by risk (children and moderate/high-risk adults).",
          "Pediatric recall: weigh; anticipatory guidance to the guardian (no juice under age 1; sugary drinks at most once daily with meals in a small 4–8 oz cup; limit between-meal snacks; supervised brushing twice daily and flossing where teeth touch); apply varnish after the exam and cleaning are checked; first panoramic around age 7 when indicated.",
        ] },
    ],
    matrices: [
      { title: "Recall scheduling", columns: ["Patient", "Cleaning", "Perio chart", "Exam"], rows: [
          ["Gingivitis / health", "D1110 every 6 months", "Yearly", "D0120 every 6 months"],
          ["Controlled periodontitis", "D4910 every 3–4 months", "Every visit", "D0120 every 6 months"],
          ["Child", "D1120 every 6 months + varnish", "As indicated", "D0120 every 6 months"],
        ] },
    ],
    postOp: [],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "37" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "male" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "120/78, 70 bpm" },
        { id: "home", label: "Home care", type: "text", value: "brushes 2x/day, flosses 1x/week" },
        { id: "risk", label: "Caries risk", type: "select", options: ["low", "moderate", "high"], value: "moderate" },
        { id: "rads", label: "Radiographs", type: "select", options: ["4 bitewings taken.", "No radiographs indicated today."], value: "4 bitewings taken." },
        { id: "exam", label: "EOE / IOE / cancer screen", type: "text", value: "EOE, TMJ and IOE WNL; oral cancer screening negative" },
        { id: "perio", label: "Periodontal", type: "text", value: "PD 1–3 mm, localized BOP, generalized mild marginal gingivitis" },
        { id: "findings", label: "New findings", type: "text", value: "#30-DO incipient enamel lesion; no other new findings" },
        { id: "plan", label: "Plan", type: "text", value: "Monitor #30-DO; fluoride varnish; no restorative treatment needed" },
        { id: "nv", label: "Next visit", type: "text", value: "6-month recall" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for periodic oral evaluation and prophylaxis.
Medical history: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}. Home care: {{home}}.

O:
{{exam}}. {{rads}}
Periodontal: {{perio}}.
Hard tissue: {{findings}}.

A:
Caries risk: {{risk}}. Gingival/periodontal status as above.

P:
Supragingival and subgingival plaque and calculus removed with ultrasonic and hand instruments; flossed; polished.
OHI with demonstration, nutritional counseling and tobacco screening completed.
Plan: {{plan}}. Findings and options reviewed with patient; consent obtained for any new treatment.

NV: {{nv}}`,
    },
  },

  /* ================================================ PERIO MAINTENANCE */
  {
    id: "perio-maintenance",
    kind: "procedure",
    title: "Periodontal Maintenance (Supportive Periodontal Therapy)",
    category: "perio",
    duration: "~60–90 min",
    summary:
      "Recall care for patients with treated, controlled periodontitis: full periodontal charting every visit, interval adjustment, ultrasonic and hand debridement with localized root planing of active sites, explorer check, polish, and reinforced OHI and risk-factor counseling.",
    cdt: [
      { code: "D4910", label: "Periodontal maintenance" },
      { code: "D0120", label: "Periodic oral evaluation (every 6 months, if due)" },
      { code: "D1330", label: "Oral hygiene instructions" },
      { code: "D1320", label: "Tobacco counseling" },
    ],
    tags: ["periodontal maintenance", "D4910", "supportive periodontal therapy", "recall interval", "3 months", "4 months", "perio charting", "BOP", "Cavitron", "ultrasonic", "localized SRP", "ODU 11/12", "O'Leary plaque index", "implant maintenance"],
    tray: [
      { group: "Instrument kits", items: ["Perio kit (probe, scalers, curettes, 11/12 ODU explorer)", "Ultrasonic insert", "Implant maintenance instruments", "Prophy handpiece"] },
      { group: "Materials", items: ["Prophy angles + paste", "Floss", "Disclosing solution", "Local anesthetic (for localized SRP)", "Take-home aids (interdental brushes)"] },
    ],
    timers: [],
    steps: [
      { id: "pm1", title: "Eligibility", body: ["Only for patients whose periodontitis was treated (SRP and re-evaluation completed) and is now controlled (probing depths generally <5 mm without bleeding)."], checkpoint: "Start check: history and vitals updated; patient confirmed as a maintenance (not prophylaxis) patient." },
      { id: "pm2", title: "Full periodontal charting", body: [
          "Every visit: probing depths + BOP, free gingival margin, mobility, furcations, mucogingival defects.",
          "Compare with the previous chart; flag sites with ≥2 mm deepening or new BOP.",
          "Adjust the maintenance interval (usually 3–4 months) to stability.",
          "Optional plaque disclosure (O'Leary index).",
        ],
        checkpoint: "Charting review: changes from baseline identified; interval confirmed." },
      { id: "pm3", title: "Debridement", body: [
          "Rubber cup first for heavy plaque; ultrasonic; floss; hand instruments.",
          "Localized root planing of residual pockets (≥5 mm with BOP); anesthetize those sites if needed.",
          "Explorer check at line angles, CEJ and under contacts. Polish after the check.",
        ],
        ebd: "Sites that remain ≥5 mm with bleeding at maintenance carry higher risk of progression; re-treat locally or refer for surgical therapy rather than repeating supragingival care alone.",
        checkpoint: "Debridement review before polishing." },
      { id: "pm4", title: "Counseling", body: ["OHI targeted to high-plaque sites (interdental brushes for open embrasures).", "Risk factors: tobacco cessation, glycemic control for diabetic patients.", "Refer to a periodontist for progressing sites."] },
    ],
    matrices: [
      { title: "Maintenance vs. prophylaxis", columns: ["", "Prophylaxis (D1110)", "Periodontal maintenance (D4910)"], rows: [
          ["Patient", "Health or gingivitis, no bone loss", "Treated, controlled periodontitis"],
          ["Interval", "~6 months", "3–4 months"],
          ["Perio chart", "Yearly", "Every visit"],
          ["Instrumentation", "Supragingival ± shallow subgingival", "Sub- and supragingival; localized root planing"],
        ] },
    ],
    postOp: ["Gums may be tender for a day; warm saltwater rinses help.", "Keep your 3–4 month schedule: periodontitis is controlled, not cured."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "58" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "124/78, 72 bpm" },
        { id: "chart", label: "Charting", type: "textarea", value: "PD generally 2–4 mm; localized 5 mm #3-DB and #14-MB with BOP; BOP 12% (was 18%); no mobility; class I furcation #19-B unchanged." },
        { id: "plaque", label: "Plaque / home care", type: "text", value: "O'Leary 24%; brushes 2x/day, interdental brushes 3x/week" },
        { id: "status", label: "Assessment", type: "select", options: ["Periodontitis stable; continue current interval.", "Localized sites of instability; localized root planing performed; interval shortened.", "Progressing sites; referral to periodontist."], value: "Periodontitis stable; continue current interval." },
        { id: "anes", label: "Anesthesia", type: "select", options: ["No anesthesia required.", "Local anesthetic administered at localized root-planing sites; aspiration negative."], value: "No anesthesia required." },
        { id: "interval", label: "Interval", type: "select", options: ["3 months", "4 months"], value: "3 months" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for periodontal maintenance.
Medical history: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O:
Periodontal chart updated: {{chart}}
Plaque/home care: {{plaque}}.

A:
{{status}}

P:
{{anes}} Supragingival and subgingival plaque and calculus removed with ultrasonic and hand instruments; localized root planing at residual pocket sites as needed; flossed; polished.
OHI targeted to high-plaque sites; risk-factor counseling completed.

NV: Periodontal maintenance in {{interval}}`,
    },
  },

  /* ================================================ SRP */
  {
    id: "scaling-root-planing",
    kind: "procedure",
    title: "Scaling & Root Planing (SRP) + Re-evaluation",
    category: "perio",
    duration: "~90 min per 2 quadrants",
    summary:
      "Non-surgical periodontal therapy for periodontitis with bone loss: quadrant-based anesthesia (IANB vs infiltration/mental block; PSA/MSA/ASA + greater palatine), ultrasonic then hand instrumentation, explorer check, OHI and post-op care, then re-evaluation charting 4–6 weeks after the last quadrant.",
    cdt: [
      { code: "D4341", label: "Periodontal scaling and root planing, 4+ teeth per quadrant" },
      { code: "D4342", label: "Periodontal scaling and root planing, 1–3 teeth per quadrant" },
      { code: "D4355", label: "Full-mouth debridement to enable evaluation (if calculus prevents charting)" },
      { code: "D0170", label: "Re-evaluation, limited, problem focused (4–6 weeks after SRP)" },
      { code: "D1330", label: "Oral hygiene instructions" },
      { code: "D1320", label: "Tobacco counseling" },
    ],
    tags: ["SRP", "scaling and root planing", "D4341", "D4342", "deep cleaning", "periodontitis", "IANB", "mental block", "PSA", "MSA", "ASA", "greater palatine", "Cavitron", "ultrasonic", "Gracey", "ODU 11/12", "re-evaluation", "D0170", "ibuprofen", "acetaminophen"],
    tray: [
      { group: "Instrument kits", items: ["Perio kit (probe, scalers, Gracey curettes, 11/12 ODU explorer)", "Ultrasonic insert", "Implant maintenance instruments"] },
      { group: "Materials", items: ["Topical, anesthetic, needles", "Prophy angle + paste (heavy plaque)", "Floss", "OHI take-home kit"] },
    ],
    timers: [
      { id: "topical", label: "Topical anesthetic", seconds: 60 },
    ],
    steps: [
      { id: "sr1", title: "Plan the visit", body: [
          "Review the chart and bitewings; usually two quadrants per visit (same side), one if calculus is heavy.",
          "Mixed cases: SRP for quadrants with pockets >5 mm/bone loss, prophylaxis for the rest.",
        ],
        checkpoint: "Start check: diagnosis, quadrants, anesthesia plan and history reviewed." },
      { id: "sr2", title: "Anesthesia", body: [
          "Mandibular: IANB when 3+ teeth need SRP; buccal infiltrations or a mental block for 1–2 anterior/premolar teeth (articaine infiltration works well).",
          "Maxillary: buccal and palatal infiltrations; full quadrant — PSA + MSA + ASA and greater palatine.",
        ],
        timers: ["topical"] },
      { id: "sr3", title: "Instrumentation", body: [
          "Rubber cup first for heavy plaque; ultrasonic; floss interproximals.",
          "Finish with hand instruments, working every root surface to the base of the pocket.",
          "Explorer check (11/12 ODU) at line angles, CEJ and under contacts.",
        ],
        checkpoint: "Instrumentation review: root surfaces smooth, no detectable calculus." },
      { id: "sr4", title: "Home care & post-op", body: [
          "OHI with demonstration, nutritional counseling, tobacco cessation.",
          "Post-op: don't eat until numbness wears off; gums may be sore; bleeding 30–60 min and more than usual for 2–3 days; sensitivity after calculus removal.",
          "Analgesia: ibuprofen 400 mg every 6 h or acetaminophen 1000 mg every 8 h as needed.",
        ] },
      { id: "sr5", title: "Re-evaluation (4–6 weeks after last quadrant)", body: [
          "No instrumentation at this visit: evaluate only.",
          "Full chart: PD, BOP, recession, mobility, furcation; O'Leary plaque index.",
          "Improved → periodontal maintenance at a set interval (usually 3–4 months). Not improved → re-treat or refer to a periodontist.",
        ],
        ebd: "Systemic antibiotics are not routine adjuncts to SRP; reserve them for specific diagnoses (e.g., Grade C/necrotizing disease) per current periodontal guidelines.",
        checkpoint: "Re-evaluation: response documented and maintenance interval or referral decided." },
    ],
    matrices: [
      { title: "Coding & sequence", columns: ["Situation", "Code"], rows: [
          ["4+ teeth with pockets/bone loss in a quadrant", "D4341"],
          ["1–3 teeth in a quadrant", "D4342"],
          ["Calculus prevents a comprehensive evaluation", "D4355 first, then evaluate"],
          ["4–6 weeks after the last quadrant", "D0170 re-evaluation (no cleaning)"],
          ["Controlled afterwards", "D4910 every 3–4 months"],
        ] },
    ],
    postOp: ["Don't eat until the numbness wears off.", "Gums may be sore; bleeding for 30–60 min and a little more than usual for 2–3 days is normal.", "Teeth may be temperature-sensitive for a few weeks; use sensitivity toothpaste.", "Ibuprofen 400 mg every 6 h or acetaminophen 1000 mg every 8 h as needed.", "Resume brushing and interdental cleaning tonight, gently."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "44" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "quads", label: "Quadrants", type: "text", value: "UR, LR" },
        { id: "mhx", label: "Medical history", type: "text", value: "no changes since last review" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse", type: "text", value: "126/80, 74 bpm" },
        { id: "dx", label: "Diagnosis", type: "text", value: "Generalized Stage III, Grade B periodontitis" },
        { id: "anesthetic", label: "Anesthetic", type: "select", options: ANESTHETICS, value: ANESTHETICS[0] },
        { id: "carps", label: "Carpules", type: "text", value: "2" },
        { id: "block", label: "Injections", type: "text", value: "right IANB and long buccal; buccal and palatal infiltrations UR" },
        { id: "home", label: "Home care", type: "text", value: "brushes 2x/day, flosses 1x/week; heavy plaque lingual of mandibular molars" },
        { id: "nv", label: "Next visit", type: "text", value: "SRP UL, LL; re-evaluation 4–6 weeks after" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for SRP {{quads}}.
Medical history: {{mhx}}. Allergies: {{allergies}}. BP/pulse: {{bp}}.

O / A:
{{dx}}; see periodontal chart.

P:
Topical 20% benzocaine applied. {{carps}} carpule(s) {{anesthetic}} administered as {{block}}; aspiration negative.
SRP {{quads}}: supragingival and subgingival plaque and calculus removed with ultrasonic and hand instruments; root surfaces planed; explorer check completed. Flossed.
Home care: {{home}}. OHI with demonstration, nutritional counseling and tobacco screening completed.
Post-op instructions given: numbness, sore gums, bleeding, sensitivity, ibuprofen/acetaminophen regimen.

NV: {{nv}}`,
    },
  },

  /* ================================================ URGENT CARE / ENDO DX */
  {
    id: "urgent-care-endo-diagnosis",
    kind: "procedure",
    title: "Urgent Care — Limited Exam & Endodontic Diagnostic Testing",
    category: "diagnostics",
    duration: "~60–90 min",
    summary:
      "Problem-focused evaluation: set expectations, structured pain history (onset, provocation, relief, frequency, intensity, location, symptoms), vitals, EOE/IOE, endodontic tests on the target and two control teeth (percussion, palpation, bite, probing, mobility, cold, EPT), targeted radiographs, AAE pulpal and apical diagnoses, and a definitive plan or referral.",
    cdt: [
      { code: "D0140", label: "Limited oral evaluation, problem focused" },
      { code: "D0220", label: "Intraoral periapical, first image" },
      { code: "D0230", label: "Intraoral periapical, each additional image" },
      { code: "D0270", label: "Bitewing, single image" },
      { code: "D0330", label: "Panoramic image (third molars / pericoronitis)" },
      { code: "D0460", label: "Pulp vitality tests" },
      { code: "D9110", label: "Palliative treatment of dental pain, per visit (if performed)" },
    ],
    tags: ["urgent care", "emergency", "limited exam", "D0140", "endo testing", "cold test", "Endo-Ice", "EPT", "percussion", "palpation", "bite test", "Tooth Slooth", "mobility", "probing", "reversible pulpitis", "irreversible pulpitis", "necrosis", "apical periodontitis", "apical abscess", "pericoronitis", "AAE diagnosis", "analgesics", "antibiotics"],
    tray: [
      { group: "Instrument kits", items: ["Exam kit (mirror, explorer, perio probe)", "Radiograph sensor & holder", "Electric pulp tester + tip + conductor (toothpaste)", "Endo-Ice + large cotton pellets + cotton pliers", "Bite stick / Tooth Slooth", "Blood pressure cuff, glucose meter"] },
    ],
    timers: [],
    steps: [
      { id: "uc1", title: "Set expectations", body: [
          "Today is to evaluate and diagnose; definitive treatment may be at another visit.",
          "Focus on the most urgent complaint.",
          "Third-molar complaints: explain that consultation and surgery may be scheduled weeks to months out.",
        ] },
      { id: "uc2", title: "Pain history", body: [
          "Onset & provocation: hot, cold, biting, spontaneous, lingering, postural, recent dental work.",
          "Relief: what helps; analgesic type, dose, frequency, last dose.",
          "Frequency and duration.",
          "Intensity: 0–10, wakes at night, character (throbbing, sharp, dull).",
          "Associated symptoms: swelling, tenderness, bleeding, bad taste. Can the patient localize it?",
        ],
        checkpoint: "Triage: presence of extraoral swelling, fever, trismus, airway or swallowing difficulty identified immediately." },
      { id: "uc3", title: "History & vitals", body: ["Update medical history, medications, allergies.", "Blood pressure, pulse (glucose if indicated; temperature if infection suspected)."], warn: "Swelling spreading to the floor of mouth, neck or periorbital region, difficulty breathing or swallowing, or systemic toxicity → emergency department referral." },
      { id: "uc4", title: "Clinical exam & endo testing", body: [
          "EOE and IOE of the area.",
          "Test the suspect tooth and at least two controls (adjacent and contralateral), controls first.",
          "Percussion and palpation (– to +++), bite test, probing depths (note narrow deep defects), mobility (0–3).",
          "Cold test: isolate and dry, Endo-Ice on a large pellet on the middle third; record seconds to response / seconds of lingering.",
          "EPT when cold is equivocal (record number; 80 = no response).",
        ],
        ebd: "Cold testing is the most reliable single pulp sensibility test; always compare with control teeth and confirm equivocal results with a second test.",
        checkpoint: "Findings and planned radiographs reviewed before exposure." },
      { id: "uc5", title: "Radiographs", body: ["Usually a PA + BW of the area; panoramic for third-molar or pericoronitis complaints."] },
      { id: "uc6", title: "Diagnose", body: [
          "Pulpal diagnosis and apical diagnosis (AAE terminology; see matrices).",
          "Pericoronitis: mild (local redness, swelling, soreness), moderate (guarded opening, muscle inflammation, pus), severe (trismus <20 mm, fever, malaise, facial swelling).",
          "If the tooth is to be saved, confirm restorability and periodontal prognosis.",
        ],
        checkpoint: "Diagnosis, prognosis and options reviewed with the supervising clinician." },
      { id: "uc7", title: "Treat or refer", body: [
          "Definitive or palliative care today (e.g., pulpectomy/pulpotomy, incision and drainage, extraction), or refer.",
          "Analgesia: ibuprofen 400–600 mg with acetaminophen 500–1000 mg, alternating or combined, within daily limits.",
          "Antibiotics only for spreading infection or systemic involvement, as an adjunct to source control.",
        ],
        ebd: "ADA 2019 guideline: antibiotics are not recommended for symptomatic irreversible pulpitis or localized apical abscess without systemic signs; definitive dental treatment is the priority. ADA 2024 guideline: NSAID ± acetaminophen is first-line for dental pain; avoid opioids when possible." },
    ],
    matrices: [
      { title: "Cold test interpretation", columns: ["Result (response / linger)", "Consistent with"], rows: [
          ["~2 s / ~2 s, not painful", "Normal pulp"],
          ["~0.5 s / ~3 s, sharp, does not linger", "Reversible pulpitis"],
          ["~0.5 s / ≥20 s, painful, lingers", "Symptomatic irreversible pulpitis"],
          ["No response (NR)", "Pulp necrosis (confirm: calcified canals, recession, previous RCT)"],
          ["False positive", "Pellet touching adjacent tooth or gingiva; anxious anticipation"],
          ["False negative", "Calcified chamber, too little refrigerant"],
        ] },
      { title: "Periapical & supporting tests", columns: ["Test", "Detects", "Record", "Also consider"], rows: [
          ["Percussion", "PDL inflammation", "– / + / ++ / +++", "High restoration, parafunction, trauma, perio disease, sinusitis, orthodontics"],
          ["Bite test", "PDL inflammation; replicates chewing pain", "– / + / ++ / +++ (cusp)", "Cracked tooth, faulty restoration"],
          ["Palpation", "Periosteal inflammation", "– / + / ++ / +++ and location", "Abscess (fluctuance), mucosal lesions, sinus"],
          ["Mobility", "Loss of support", "0; 1 (<1 mm BL); 2 (≥1 mm BL); 3 (≥1 mm BL + vertical)", "Perio disease, trauma, parafunction, fracture"],
          ["Probing", "Fracture / sinus tract", "mm per site", "Narrow deep defect → crack/fracture or sinus tract"],
          ["EPT", "Pulp sensibility", "Number; 80 = no response", "False negative with calcification"],
        ] },
      { title: "AAE pulpal diagnoses", columns: ["Diagnosis", "Key findings"], rows: [
          ["Normal pulp", "Asymptomatic; normal cold response that doesn't linger"],
          ["Reversible pulpitis", "Provoked sharp pain that subsides quickly; no spontaneous pain"],
          ["Symptomatic irreversible pulpitis", "Lingering thermal pain; spontaneous or referred pain possible"],
          ["Asymptomatic irreversible pulpitis", "No symptoms, but deep caries/trauma will expose the pulp"],
          ["Pulp necrosis", "No response to cold or EPT"],
        ] },
      { title: "AAE apical diagnoses", columns: ["Diagnosis", "Key findings"], rows: [
          ["Normal apical tissues", "Not tender to percussion or palpation; normal PDL"],
          ["Symptomatic apical periodontitis", "Tender to percussion ± palpation; ± widened PDL or RL"],
          ["Asymptomatic apical periodontitis", "Apical radiolucency; no symptoms"],
          ["Acute apical abscess", "Rapid onset, spontaneous pain, tenderness, swelling, pus"],
          ["Chronic apical abscess", "Gradual onset, little pain, sinus tract drainage"],
          ["Condensing osteitis", "Diffuse radiopacity at apex; usually asymptomatic"],
        ] },
    ],
    postOp: ["Take pain relievers as directed; don't exceed the daily limit on the label.", "Go to an emergency room for swelling that spreads toward the eye or neck, trouble breathing or swallowing, or high fever.", "Keep your follow-up or referral appointment even if the pain improves."],
    soap: {
      fields: [
        { id: "age", label: "Age", type: "text", value: "36" },
        { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "female" },
        { id: "cc", label: "Chief complaint", type: "text", value: "my lower left tooth hurts with cold and keeps me up at night" },
        { id: "mhx", label: "Medical history", type: "text", value: "noncontributory" },
        { id: "meds", label: "Medications", type: "text", value: "ibuprofen 400 mg q6h for 3 days, last dose 4 h ago" },
        { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
        { id: "bp", label: "BP / pulse / temp", type: "text", value: "132/84, 88 bpm, 98.4 °F" },
        { id: "hpi", label: "HPI", type: "textarea", value: "Onset 5 days ago; cold provokes sharp pain that lingers ~30 s; spontaneous throbbing at night 7/10; partial relief with ibuprofen; no swelling or bad taste; patient localizes to #19." },
        { id: "ioe", label: "IOE", type: "text", value: "#19 large distal caries; no swelling or sinus tract" },
        { id: "target", label: "Target tooth", type: "text", value: "#19" },
        { id: "t_perc", label: "Target: percussion", type: "select", options: ["–", "+", "++", "+++"], value: "+" },
        { id: "t_palp", label: "Target: palpation", type: "select", options: ["–", "+", "++", "+++"], value: "–" },
        { id: "t_bite", label: "Target: bite test", type: "select", options: ["–", "+", "++", "+++", "not performed"], value: "–" },
        { id: "t_probe", label: "Target: probing (mm)", type: "text", value: "3" },
        { id: "t_mob", label: "Target: mobility", type: "select", options: ["0", "1", "2", "3"], value: "0" },
        { id: "t_cold", label: "Target: cold", type: "text", value: "0.5 s / 25 s" },
        { id: "t_ept", label: "Target: EPT", type: "text", value: "not performed" },
        { id: "control1", label: "Control 1", type: "text", value: "#18: perc –, palp –, probing 3 mm, mobility 0, cold 2 s / 2 s" },
        { id: "control2", label: "Control 2", type: "text", value: "#30: perc –, palp –, probing 3 mm, mobility 0, cold 2 s / 2 s" },
        { id: "rads", label: "Radiographs", type: "text", value: "PA and BW #19: distal caries approximating pulp; widened apical PDL; no periapical radiolucency" },
        { id: "pulp_dx", label: "Pulpal diagnosis", type: "select", options: ["Normal pulp", "Reversible pulpitis", "Symptomatic irreversible pulpitis", "Asymptomatic irreversible pulpitis", "Pulp necrosis", "Previously treated", "Previously initiated therapy"], value: "Symptomatic irreversible pulpitis" },
        { id: "apical_dx", label: "Apical diagnosis", type: "select", options: ["Normal apical tissues", "Symptomatic apical periodontitis", "Asymptomatic apical periodontitis", "Acute apical abscess", "Chronic apical abscess", "Condensing osteitis"], value: "Symptomatic apical periodontitis" },
        { id: "plan", label: "Plan", type: "textarea", value: "Options reviewed: RCT with buildup and crown vs extraction (with replacement options) vs no treatment. Restorability and periodontal prognosis favorable. Patient elects RCT; pulpectomy scheduled. Analgesia: ibuprofen 600 mg + acetaminophen 500 mg every 6 h as needed. No antibiotics indicated (no systemic signs)." },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for urgent care. CC: "{{cc}}".
Medical history: {{mhx}}. Medications: {{meds}}. Allergies: {{allergies}}. Vitals: {{bp}}.
HPI: {{hpi}}

O:
IOE: {{ioe}}.
Endodontic testing:
- {{target}} (target): percussion {{t_perc}}, palpation {{t_palp}}, bite {{t_bite}}, probing {{t_probe}} mm, mobility {{t_mob}}, cold {{t_cold}}, EPT {{t_ept}}
- {{control1}} (control)
- {{control2}} (control)
Radiographs: {{rads}}.

A:
{{target}}: {{pulp_dx}}; {{apical_dx}}.

P:
{{plan}}
Post-op instructions and emergency precautions given.`,
    },
  },
];

/* -------------------------------------------------------------------------- */
/* 2f. ORAL SURGERY DATASET (manual schema)                                   */
/*                                                                            */
/* Embedded from oral-surgery-procedures.js (the dataset's SURGERY_CATEGORY   */
/* is omitted: Oral Surgery already exists in CATEGORIES). Anesthesia sets,   */
/* time-out, elevation/forceps technique, 5 s luxation holds, forceps numbers */
/* and suture specs are from the source manual; root-tip and open-extraction  */
/* specifics are standard references marked "Std ref".                       */
/* -------------------------------------------------------------------------- */

/* Shared blocks reused by all three objects -------------------------------- */
const OS_PREOP_BODY = [
  "Medical history, medications (anticoagulants/antiplatelets, antiresorptives/antiangiogenics, steroids), allergies.",
  "Blood pressure and pulse (glucose if diabetic) before and after surgery.",
  "Antibiotic prophylaxis only for qualifying cardiac conditions (see matrix); confirm the dose was taken 30–60 min before.",
  "Current diagnostic periapical of the tooth (roots, curvature, proximity to sinus/IAN canal, ankylosis).",
];
const OS_PREOP_EBD =
  "Anticoagulants: do not routinely stop warfarin if INR is within the therapeutic range (≤ 3.5 for simple extractions; check within 24–72 h); DOACs are generally continued, with local hemostatic measures. Antiresorptives (AAOMS 2022): MRONJ risk is low in osteoporosis patients and routine drug holidays are not supported; coordinate with the prescriber, and never interrupt denosumab without them. Oncology patients on IV antiresorptives or antiangiogenics: avoid extraction when possible (e.g., crown removal and endodontic treatment of the retained roots).";

const OS_CONSENT_BODY = [
  "Explain expected pain and swelling (analgesics reviewed at the end), bleeding (gauze sent home), sore jaw or mouth corners.",
  "Risks: dry socket, infection, damage to adjacent teeth/restorations, retained root fragment that may be left if removal would be too traumatic, sinus communication (maxillary posteriors), altered sensation of lip/tongue (mandibular posteriors).",
  "Supervising surgeon and patient sign the consent; name the procedure (e.g., \"Ext #12, #13\").",
];

const OS_POSTOP = [
  "Bite firmly on gauze for 30–45 minutes; replace with moist gauze if bleeding continues. A moist black-tea bag also helps.",
  "For 24–72 hours: no spitting, rinsing vigorously, drinking through a straw, smoking or vaping.",
  "Ice on the face 20 minutes on / 20 minutes off for the first 24 hours; sleep with your head elevated.",
  "Soft, cool foods today; chew on the other side. Stay hydrated.",
  "From tomorrow: gentle warm saltwater rinses after meals; brush other teeth normally, carefully near the site.",
  "Pain: ibuprofen 400–600 mg with acetaminophen 500–1000 mg every 6 hours as needed, within daily limits (unless your doctor says otherwise).",
  "Call for bleeding that won't stop with pressure, increasing pain after day 2–3 (possible dry socket), fever, spreading swelling, or numbness that persists.",
];

const OS_SHARED_MATRICES: NonNullable<ManualProcedure['matrices']> = [
  { title: "Forceps selection", columns: ["No.", "Name", "Teeth", "Source"], rows: [
      ["150", "Maxillary universal", "Incisors, canines, premolars", "Manual"],
      ["150A", "—", "Maxillary premolars", "Manual"],
      ["89", "Maxillary anatomical (right)", "#1, #2, #3", "Manual"],
      ["90", "Maxillary anatomical (left)", "#14, #15, #16", "Manual"],
      ["151", "Mandibular universal", "Incisors, canines, premolars", "Manual"],
      ["151A", "—", "Mandibular premolars", "Manual"],
      ["English Ash", "—", "Mandibular incisors", "Manual"],
      ["17", "Mandibular anatomical", "Molars", "Manual"],
      ["87", "Cowhorn", "Molars (engages furcation)", "Manual"],
    ] },
  { title: "Profound anesthesia", columns: ["Arch", "Injections"], rows: [
      ["Maxillary", "Buccal infiltration + greater palatine (or palatal infiltration / nasopalatine anteriorly) + PDL"],
      ["Mandibular", "IANB + mental + lingual + long buccal + PDL"],
    ] },
  { title: "Endocarditis prophylaxis (AHA 2021) — 30–60 min before", columns: ["Situation", "Adult", "Child"], rows: [
      ["Oral", "Amoxicillin 2 g", "50 mg/kg"],
      ["Penicillin allergy, oral", "Cephalexin 2 g (no anaphylaxis/angioedema/urticaria history), or azithromycin/clarithromycin 500 mg, or doxycycline 100 mg", "Cephalexin 50 mg/kg, azithromycin/clarithromycin 15 mg/kg, doxycycline < 45 kg 2.2 mg/kg / > 45 kg 100 mg"],
      ["Unable to take oral", "Ampicillin 2 g IM/IV or cefazolin/ceftriaxone 1 g IM/IV", "Ampicillin 50 mg/kg or cefazolin/ceftriaxone 50 mg/kg IM/IV"],
    ],
    note: "Qualifying conditions: prosthetic valve or valve repair material; previous infective endocarditis; unrepaired cyanotic CHD; repaired CHD with prosthetic material in the first 6 months or with residual defects; cardiac transplant with valvulopathy. Clindamycin is no longer recommended. Prosthetic joints: prophylaxis generally not indicated; defer to the orthopedic surgeon for medically complex patients. If missed, the dose may be given up to 2 h after the procedure." },
];

const osSoapCommon = (): ManualSoapField[] => ([
  { id: "age", label: "Age", type: "text", value: "52" },
  { id: "sex", label: "Sex", type: "select", options: ["female", "male", "patient"], value: "male" },
  { id: "mhx", label: "Medical history", type: "text", value: "hypertension (lisinopril); no anticoagulants or antiresorptives" },
  { id: "allergies", label: "Allergies", type: "text", value: "NKDA" },
  { id: "bp_pre", label: "Pre-op BP / pulse", type: "text", value: "134/84, 76 bpm" },
  { id: "bp_post", label: "Post-op BP / pulse", type: "text", value: "130/82, 74 bpm" },
  { id: "premed", label: "Premedication", type: "select", options: ["No antibiotic prophylaxis indicated.", "Patient took amoxicillin 2 g 1 h before the appointment for endocarditis prophylaxis as prescribed.", "Patient took azithromycin 500 mg 1 h before the appointment for endocarditis prophylaxis as prescribed."], value: "No antibiotic prophylaxis indicated." },
  { id: "anesthetic", label: "Anesthetic", type: "select", options: ANESTHETICS, value: ANESTHETICS[0] },
  { id: "carps", label: "Carpules", type: "text", value: "2" },
]);

const ORAL_SURGERY_PROCEDURES: ManualProcedure[] = [
  /* ================================================ SIMPLE EXTRACTION */
  {
    id: "simple-extraction",
    kind: "procedure",
    title: "Simple (Closed) Extraction",
    category: "surgery",
    duration: "~45–60 min",
    summary:
      "Forceps extraction of an erupted tooth: consent, profound anesthesia, time-out, circumferential soft-tissue release with a #9 Molt, straight-elevator luxation at the mesio- or distobuccal line angle, forceps seated as apically as possible with slow sustained buccal and lingual pressure (5 s holds), then irrigation, socket compression, bone smoothing, figure-8 3-0 chromic gut and gauze pressure.",
    cdt: [
      { code: "D7140", label: "Extraction, erupted tooth or exposed root (elevation and/or forceps removal)" },
    ],
    tags: ["extraction", "simple extraction", "closed extraction", "exodontia", "forceps", "150", "151", "17", "87 cowhorn", "#9 Molt", "straight elevator", "Potts", "luxation", "Minnesota retractor", "time-out", "figure-8 suture", "chromic gut 3-0", "bone file", "rongeur", "socket compression", "dry socket", "D7140"],
    tray: [
      { group: "Instruments", items: ["#9 Molt periosteal elevator", "Minnesota retractor", "Straight elevators (small/medium/large), Potts elevator", "Forceps per tooth (see matrix)", "Surgical curette", "Bone file", "Rongeurs", "Needle holder, Adson tissue forceps, suture scissors", "Root-tip picks (in case of fracture)"] },
      { group: "Materials", items: ["Local anesthetic, long and short needles, topical", "Sterile saline + plastic irrigation syringe", "3-0 chromic gut on a ⅜-circle cutting needle", "Sterile gauze 2×2 (and take-home gauze)", "Hemostatic agent (gelatin sponge / oxidized cellulose) as needed", "Signed surgical consent"] },
      { group: "Safety", items: ["Blood pressure cuff (pre- and post-op)", "High-volume suction + surgical aspirator tip", "Gauze throat screen", "Patient eye protection"] },
    ],
    timers: [
      { id: "hold", label: "Luxation hold", seconds: 5, note: "Slow, sustained pressure; buccal then lingual" },
      { id: "gauze", label: "Gauze pressure", seconds: 1800, note: "30–45 min" },
    ],
    steps: [
      { id: "se1", title: "Pre-op assessment", body: OS_PREOP_BODY, ebd: OS_PREOP_EBD, checkpoint: "Start check: medical history, medications, vitals, prophylaxis status and radiograph reviewed; extraction indicated and planned." },
      { id: "se2", title: "Informed consent", body: OS_CONSENT_BODY },
      { id: "se3", title: "Profound anesthesia", body: [
          "Maxillary: buccal infiltration + greater palatine (or palatal/nasopalatine anteriorly) + PDL.",
          "Mandibular: IANB + mental + lingual + long buccal + PDL.",
          "Aspirate before every deposit.",
        ] },
      { id: "se4", title: "Time-out", body: [
          "Supervising surgeon present; patient points to the tooth or teeth; confirm against the chart and radiograph.",
          "Multiple teeth: maxillary posterior → anterior, then mandibular posterior → anterior.",
        ],
        checkpoint: "Time-out completed: correct patient, tooth, side and procedure confirmed aloud." },
      { id: "se5", title: "Release soft tissue", body: [
          "Retract with the Minnesota retractor.",
          "Test anesthesia with the #9 Molt: pressure only, no sharp sensation.",
          "Pointed end into the sulcus, push apically, sweep laterally around the whole tooth, including the papillae.",
        ] },
      { id: "se6", title: "Elevate", body: [
          "Straight elevator perpendicular to the tooth at the mesiobuccal or distobuccal line angle, concave face toward the tooth being extracted, convex face toward the adjacent tooth.",
          "Angle the tip apically; rotate apical-out / occlusal-in while applying apical pressure to advance into the PDL and expand the socket.",
          "Use the Potts elevator for better angulation posteriorly. Never lever against an adjacent tooth you intend to keep.",
        ] },
      { id: "se7", title: "Deliver with forceps", body: [
          "Underhand (palm-up) grip. Beak tips beneath the loosened soft tissue, on root surface, as apical as possible — then further.",
          "Push buccally until resistance, hold 5 s with slow, steady, heavy force (no wiggling).",
          "Push lingually until resistance (less force), hold 5 s.",
          "Reseat more apically as the socket expands; repeat. Rotate single conical roots (anteriors, mandibular premolars).",
          "Common errors: forceps not apical enough; too little force for too short a time.",
        ],
        timers: ["hold"],
        warn: "Protect the opposing arch with a finger or retractor when the tooth releases; support the mandible during mandibular extractions." },
      { id: "se8", title: "Inspect tooth & socket", body: [
          "Check that all roots are intact; if a fragment remains, see Root Tip Removal.",
          "Irrigate with sterile saline.",
          "Curette only if there is granulation tissue or a periapical radiolucency; otherwise leave the socket walls alone.",
          "Compress the buccal and lingual plates with thumb and forefinger.",
          "Palpate for sharp bone: bone file (pull stroke) or rongeurs.",
        ],
        checkpoint: "Socket review: complete removal, no sharp bone, no sinus communication (maxillary posteriors), bleeding filling the socket." },
      { id: "se9", title: "Suture & hemostasis", body: [
          "3-0 chromic gut on a ⅜-circle cutting needle held ⅔ from the tip; buccal to lingual.",
          "Figure-8: distobuccal → distolingual → mesiobuccal → mesiolingual → surgeon's knot (over, under, over).",
          "Folded gauze over the socket; firm biting pressure.",
        ],
        timers: ["gauze"] },
      { id: "se10", title: "Discharge", body: [
          "Post-op blood pressure.",
          "Verbal and written post-op instructions; take-home gauze.",
          "Analgesic plan; antibiotics only if a specific indication exists.",
        ],
        ebd: "ADA 2024: ibuprofen with acetaminophen is first-line after extraction and outperforms opioids; prescribe opioids only when NSAIDs are contraindicated, in the smallest quantity. Chlorhexidine 0.12% rinse (or gel) around the procedure reduces alveolar osteitis risk; routine antibiotics are not indicated for simple extractions in healthy patients.",
        checkpoint: "Discharge review: hemostasis achieved, post-op vitals recorded, instructions understood." },
    ],
    matrices: OS_SHARED_MATRICES,
    postOp: OS_POSTOP,
    soap: {
      fields: [
        ...osSoapCommon(),
        { id: "teeth", label: "Tooth / teeth", type: "text", value: "#12, #13" },
        { id: "reason", label: "Indication", type: "text", value: "non-restorable due to caries" },
        { id: "block", label: "Injections", type: "text", value: "buccal infiltration and greater palatine block, PDL injections" },
        { id: "forceps", label: "Forceps", type: "text", value: "#150" },
        { id: "curette", label: "Curettage", type: "select", options: ["Socket not curetted (no granulation tissue or PA lesion).", "Socket gently curetted to remove granulation tissue."], value: "Socket not curetted (no granulation tissue or PA lesion)." },
        { id: "suture", label: "Sutures", type: "select", options: ["3-0 chromic gut, figure-8.", "3-0 chromic gut, simple interrupted.", "No sutures required."], value: "3-0 chromic gut, figure-8." },
        { id: "rx", label: "Rx / analgesia", type: "text", value: "Ibuprofen 600 mg + acetaminophen 500 mg every 6 h as needed; chlorhexidine 0.12% rinse from 24 h" },
        { id: "nv", label: "Next visit", type: "text", value: "Post-op check in 1 week" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for extraction of {{teeth}}. Indication: {{reason}}.
Medical history: {{mhx}}. Allergies: {{allergies}}. Pre-op BP/pulse: {{bp_pre}}.
{{premed}}

O:
Periapical radiograph reviewed: root morphology and adjacent structures noted.

A:
{{teeth}}: {{reason}}; simple extraction indicated.

P:
Risks, benefits and alternatives reviewed; surgical consent signed by patient and supervising surgeon.
Topical 20% benzocaine applied. {{carps}} carpule(s) {{anesthetic}} administered as {{block}}; aspiration negative; profound anesthesia confirmed.
Time-out completed with supervising surgeon; patient confirmed teeth.
Soft tissue released with #9 Molt. Teeth luxated with straight elevator and delivered with {{forceps}} forceps; roots intact.
Sockets irrigated with sterile saline. {{curette}} Sockets compressed; sharp bone smoothed. {{suture}}
Hemostasis achieved with gauze pressure. Post-op BP/pulse: {{bp_post}}.
Verbal and written post-op instructions given; gauze provided. {{rx}}.

NV: {{nv}}`,
    },
  },

  /* ================================================ ROOT TIP REMOVAL */
  {
    id: "root-tip-extraction",
    kind: "procedure",
    title: "Root Tip / Retained Root Removal",
    category: "surgery",
    duration: "~20–60 min",
    summary:
      "Retrieval of a fractured or retained root: radiograph first, good light, suction and a dry field, then (in order of escalation) root-tip pick or small straight elevator in the PDL space, Cryer elevator from an adjacent empty socket for molar roots, small rongeurs, and an open (flap + bone window) approach — or a documented decision to leave a small, deep, uninfected fragment.",
    cdt: [
      { code: "D7140", label: "Extraction, exposed root (elevation and/or forceps removal)" },
      { code: "D7250", label: "Removal of residual tooth roots (cutting procedure) — requires flap/bone removal" },
    ],
    tags: ["root tip", "retained root", "fractured root", "root-tip pick", "Cryer elevator", "Potts", "straight elevator", "rongeur", "open window", "leave the root", "maxillary sinus", "oroantral communication", "IAN canal", "D7250", "D7140"],
    tray: [
      { group: "Instruments", items: ["Root-tip picks (straight and angled)", "Small straight elevators (e.g., #301), Potts", "Cryer elevators (left and right)", "Small-tipped rongeurs", "#9 Molt, Minnesota retractor", "Surgical curette, bone file", "Needle holder, Adson forceps, scissors", "Surgical kit for open approach (#15 blade, surgical handpiece, burs)"] },
      { group: "Materials", items: ["Sterile saline + irrigation syringe", "3-0 chromic gut, ⅜-circle cutting needle", "Gauze, hemostatic agent", "Radiograph sensor"] },
      { group: "Safety", items: ["Surgical suction tip", "Throat screen", "Good fiberoptic light / loupes"] },
    ],
    timers: [
      { id: "gauze", label: "Gauze pressure", seconds: 1800, note: "30–45 min" },
    ],
    steps: [
      { id: "rt1", title: "Pre-op assessment", body: OS_PREOP_BODY, ebd: OS_PREOP_EBD, checkpoint: "Start check: history, vitals, prophylaxis status reviewed; radiograph shows root size, position and relation to sinus/IAN canal." },
      { id: "rt2", title: "Consent & anesthesia", body: [...OS_CONSENT_BODY, "Profound anesthesia as for extraction (see matrix)."] },
      { id: "rt3", title: "Time-out & visualization", body: [
          "Time-out with the supervising surgeon.",
          "Light, surgical suction and saline irrigation to see the fragment. Most failures are visibility failures.",
        ],
        checkpoint: "Time-out completed; fragment located clinically and radiographically." },
      { id: "rt4", title: "Closed retrieval", body: [
          "Root-tip pick or small straight elevator into the PDL space between root and bone; tease the fragment out with small controlled movements.",
          "Never push apically on the fragment (risk of displacement into the sinus or IAN canal).",
          "Small rongeurs can grasp and remove a fragment once it is mobile.",
        ] },
      { id: "rt5", title: "Cryer elevator (molars)", body: [
          "When one root of a multirooted tooth remains beside an empty socket: tip of the Cryer into the empty socket, point engaged in the interseptal bone.",
          "Rotational force lifts the interseptal bone together with the remaining root.",
        ] },
      { id: "rt6", title: "Open approach (if closed fails)", body: [
          "Full-thickness flap (see Surgical Extraction).",
          "Remove buccal bone over the root with a round or fissure bur under sterile saline, or create a window at the apex; elevate the root toward the window.",
        ],
        warn: "Use a surgical handpiece that does not exhaust air into the field; an air-driven high-speed handpiece can cause subcutaneous emphysema." },
      { id: "rt7", title: "Decide whether to leave it", body: [
          "A fragment may be left when it is small, deeply embedded, not infected, and removal risks the sinus, IAN, or excessive bone loss.",
          "If left: inform the patient, radiograph, document size and location, and recall for follow-up.",
        ],
        checkpoint: "Retained-fragment decision made with the supervising surgeon, explained to the patient and documented with a radiograph." },
      { id: "rt8", title: "Sinus check (maxillary posteriors)", body: [
          "If a communication is suspected: gentle nose-blow test with nostrils pinched (bubbling or air through the socket).",
          "Small (≈ ≤2 mm): clot, figure-8 suture, sinus precautions. Moderate (≈2–6 mm): figure-8 over a collagen plug/hemostatic agent, sinus precautions, consider antibiotics and decongestant. Large (≈ ≥7 mm) or a root displaced into the sinus: refer for primary flap closure/retrieval.",
        ],
        warn: "Do not probe a suspected communication or attempt retrieval through it; this enlarges the opening and can push the root further into the sinus." },
      { id: "rt9", title: "Close & discharge", body: ["Irrigate, smooth bone, suture 3-0 chromic gut, gauze pressure.", "Post-op radiograph if a fragment was retained or an open approach was used.", "Post-op BP; instructions; sinus precautions if applicable (no nose-blowing, sneeze with mouth open, no straws, 1–2 weeks)."], timers: ["gauze"] },
    ],
    matrices: [
      { title: "Escalation ladder", columns: ["Step", "Instrument / technique", "Source"], rows: [
          ["1", "Root-tip pick or small straight elevator in the PDL space", "Manual"],
          ["2", "Cryer elevator from adjacent empty socket (molars)", "Manual"],
          ["3", "Small-tipped rongeurs on a mobile fragment", "Manual"],
          ["4", "Open approach: flap + buccal bone removal / apical window", "Std ref"],
          ["5", "Leave small, deep, uninfected fragment; document and recall", "Manual (consent) / Std ref"],
        ] },
      { title: "Oroantral communication size", columns: ["Size", "Management", "Source"], rows: [
          ["≈ ≤ 2 mm", "Clot, figure-8 suture, sinus precautions", "Std ref"],
          ["≈ 2–6 mm", "Figure-8 over collagen/hemostatic plug, sinus precautions, consider antibiotic + decongestant", "Std ref"],
          ["≈ ≥ 7 mm or root in sinus", "Refer for flap closure / retrieval", "Std ref"],
        ] },
      ...OS_SHARED_MATRICES.slice(1),
    ],
    postOp: [
      ...OS_POSTOP,
      "If told you have sinus precautions: don't blow your nose, sneeze with your mouth open, and avoid straws and heavy lifting for 1–2 weeks.",
    ],
    soap: {
      fields: [
        ...osSoapCommon(),
        { id: "tooth", label: "Tooth / site", type: "text", value: "#30 mesial root" },
        { id: "context", label: "Context", type: "select", options: ["Root fractured during extraction.", "Retained root from a previous extraction.", "Root remnant after crown fracture (caries)."], value: "Root fractured during extraction." },
        { id: "block", label: "Injections", type: "text", value: "right IANB, lingual, long buccal, PDL" },
        { id: "technique", label: "Technique", type: "select", options: ["Removed closed with root-tip pick in the PDL space.", "Removed with Cryer elevator engaging interseptal bone from the adjacent socket.", "Removed with small rongeurs once mobile.", "Open approach: full-thickness flap, buccal bone removed under sterile saline, root elevated.", "Fragment (≈2 mm, apical third, uninfected) left in situ to avoid injury to adjacent structures; patient informed."], value: "Removed with Cryer elevator engaging interseptal bone from the adjacent socket." },
        { id: "sinus", label: "Sinus", type: "select", options: ["Not applicable (mandibular).", "No oroantral communication (negative nose-blow test).", "Small oroantral communication; figure-8 suture and sinus precautions."], value: "Not applicable (mandibular)." },
        { id: "postpa", label: "Post-op radiograph", type: "select", options: ["Post-op PA confirms complete removal.", "Post-op PA documents retained fragment.", "No post-op radiograph needed."], value: "Post-op PA confirms complete removal." },
        { id: "rx", label: "Rx / analgesia", type: "text", value: "Ibuprofen 600 mg + acetaminophen 500 mg every 6 h as needed" },
        { id: "nv", label: "Next visit", type: "text", value: "Post-op check in 1 week" },
      ],
      template: `S:
{{age}} y/o {{sex}} — {{tooth}}. {{context}}
Medical history: {{mhx}}. Allergies: {{allergies}}. Pre-op BP/pulse: {{bp_pre}}.
{{premed}}

O / A:
Retained root fragment {{tooth}} identified clinically and radiographically.

P:
Consent reviewed and signed. {{carps}} carpule(s) {{anesthetic}} administered as {{block}}; aspiration negative. Time-out completed.
{{technique}}
Socket irrigated with sterile saline and inspected; sharp bone smoothed. {{sinus}} Sutured with 3-0 chromic gut; hemostasis with gauze pressure.
{{postpa}} Post-op BP/pulse: {{bp_post}}.
Verbal and written post-op instructions given. {{rx}}.

NV: {{nv}}`,
    },
  },

  /* ================================================ SURGICAL EXTRACTION */
  {
    id: "surgical-extraction",
    kind: "procedure",
    title: "Surgical (Open) Extraction — Flap, Bone Removal & Sectioning",
    category: "surgery",
    duration: "~60–90 min",
    summary:
      "Extraction of an erupted tooth that won't deliver with forceps (divergent or dilacerated roots, ankylosis, dense bone, heavy restorations, fractured crown): full-thickness envelope or triangular flap, conservative buccal bone removal and root sectioning with a surgical bur under sterile saline, delivery of individual roots, debridement, and tension-free flap closure.",
    cdt: [
      { code: "D7210", label: "Extraction, erupted tooth requiring removal of bone and/or sectioning of tooth, including elevation of mucoperiosteal flap if indicated" },
    ],
    tags: ["surgical extraction", "open extraction", "flap", "envelope flap", "triangular flap", "releasing incision", "#15 blade", "mucoperiosteal", "bone removal", "sectioning", "#701", "#702", "#8 round", "surgical handpiece", "purchase point", "Cryer", "Potts", "sinus", "IAN", "D7210"],
    tray: [
      { group: "Instruments", items: ["#3 scalpel handle + #15 blades", "#9 Molt periosteal elevator", "Minnesota and Seldin/Austin retractors", "Straight elevators, Potts, Cryer (left/right)", "Forceps per tooth (see matrix)", "Root-tip picks", "Surgical curette, bone file, rongeurs", "Needle holder, Adson forceps, suture scissors"] },
      { group: "Rotary", items: ["Surgical handpiece that does not exhaust air into the field (electric/surgical motor)", "Fissure burs (#701, #702) for sectioning", "Round burs (#6, #8) for bone removal and purchase points", "Sterile saline irrigation"] },
      { group: "Materials", items: ["Local anesthetic, needles, topical", "3-0 chromic gut on ⅜-circle cutting needle", "Sterile gauze, hemostatic agent, collagen plug", "Sterile saline + syringe", "Signed surgical consent"] },
      { group: "Safety", items: ["Blood pressure cuff (pre- and post-op)", "Surgical suction", "Throat screen", "Eye protection"] },
    ],
    timers: [
      { id: "hold", label: "Luxation hold", seconds: 5 },
      { id: "gauze", label: "Gauze pressure", seconds: 1800, note: "30–45 min" },
    ],
    steps: [
      { id: "sx1", title: "Pre-op assessment & planning", body: [
          ...OS_PREOP_BODY,
          "Plan the open approach from the radiograph: root number, divergence, curvature, hypercementosis, ankylosis, bone density, proximity to sinus/IAN/mental foramen.",
        ],
        ebd: OS_PREOP_EBD,
        checkpoint: "Start check: history, vitals, prophylaxis status and radiograph reviewed; surgical plan (flap design, sectioning pattern) stated." },
      { id: "sx2", title: "Consent, anesthesia, time-out", body: [...OS_CONSENT_BODY, "Profound anesthesia (see matrix).", "Time-out with the supervising surgeon; patient confirms the tooth."], checkpoint: "Time-out completed: correct patient, tooth, side and procedure." },
      { id: "sx3", title: "Flap", body: [
          "Envelope flap: sulcular incision with a #15 blade, one tooth mesial and one tooth distal, through the papillae to bone.",
          "Triangular (three-corner) flap when more access is needed: add a vertical releasing incision at the line angle of the mesial adjacent tooth (never over the mid-root or the mental foramen), angled so the base is wider than the free margin.",
          "Reflect full-thickness with the #9 Molt (pointed end for papillae, broad end to reflect); keep the retractor on bone.",
        ] },
      { id: "sx4", title: "Bone removal", body: [
          "Remove only enough buccal bone to expose the furcation or to make a purchase point: round or fissure bur on the surgical handpiece with copious sterile saline.",
          "Preserve the lingual/palatal plate and the crest where possible (future implant or ridge).",
        ],
        warn: "Never use an air-driven high-speed handpiece that exhausts into the surgical field (risk of subcutaneous and fascial-space emphysema)." },
      { id: "sx5", title: "Section the tooth", body: [
          "Mandibular molar: bucco-lingual cut through the furcation into mesial and distal halves.",
          "Maxillary molar: separate the mesiobuccal, distobuccal and palatal roots (horizontal crown removal first if needed).",
          "Cut about ¾ of the way through, then split with a straight elevator rotated in the cut; don't cut through the lingual/palatal plate.",
        ] },
      { id: "sx6", title: "Deliver roots", body: [
          "Elevate each root along its own path; forceps or Cryer once one root socket is empty (tip into the empty socket, rotate to lift interseptal bone and root).",
          "Remaining fragments: see Root Tip Removal.",
        ],
        timers: ["hold"] },
      { id: "sx7", title: "Debride & inspect", body: [
          "Irrigate generously under the flap with sterile saline.",
          "Curette granulation tissue or PA lesion only; remove bone chips and tooth fragments.",
          "Smooth sharp edges with a bone file (pull stroke) or rongeurs. Compress the socket gently.",
          "Maxillary posteriors: check for oroantral communication.",
        ],
        checkpoint: "Surgical site review before closure: all roots removed, no debris under the flap, smooth bone, sinus intact." },
      { id: "sx8", title: "Close", body: [
          "Reposition the flap passively (no tension). Papillae first with simple interrupted sutures, then the releasing incision.",
          "3-0 chromic gut on a ⅜-circle cutting needle held ⅔ from the tip; surgeon's knot; knots off the incision line.",
          "Gauze pressure.",
        ],
        timers: ["gauze"] },
      { id: "sx9", title: "Discharge", body: ["Post-op blood pressure.", "Verbal and written instructions; expect more swelling (peaks at 48–72 h).", "Analgesic plan; follow-up in about 1 week."], ebd: "ADA 2024: ibuprofen plus acetaminophen is first-line and usually sufficient after surgical extraction; a short course of an opioid is reserved for when NSAIDs are contraindicated. A single preoperative dose of dexamethasone may reduce swelling after more extensive surgery (per surgeon).", checkpoint: "Discharge review: hemostasis, post-op vitals, instructions understood, follow-up booked." },
    ],
    matrices: [
      { title: "Flap design", columns: ["Flap", "Incision", "Use", "Source"], rows: [
          ["Envelope", "Sulcular, 1 tooth mesial + 1 tooth distal, through papillae", "Most single-tooth surgical extractions", "Std ref"],
          ["Triangular (three-corner)", "Envelope + vertical release at mesial line angle of adjacent tooth", "Apical access, root tips, more exposure", "Std ref"],
          ["Rules", "Full thickness; base wider than margin; releases over bone, not over a defect, mid-root, or mental foramen", "All flaps", "Std ref"],
        ] },
      { title: "Sectioning patterns", columns: ["Tooth", "Cut", "Source"], rows: [
          ["Mandibular molar", "Bucco-lingual through furcation → M and D halves", "Std ref"],
          ["Maxillary molar", "Separate MB, DB and P roots", "Std ref"],
          ["Cut depth", "~¾ through, then split with elevator; spare lingual/palatal plate", "Std ref"],
          ["Bur / handpiece", "#701/#702 fissure or #6/#8 round on non-air-exhausting surgical handpiece, sterile saline", "Std ref"],
        ] },
      ...OS_SHARED_MATRICES,
    ],
    postOp: [
      ...OS_POSTOP,
      "Swelling and bruising usually peak 2–3 days after surgery, then settle over a week.",
      "Stitches dissolve in 1–2 weeks; small bone edges may work their way out as the site heals.",
    ],
    soap: {
      fields: [
        ...osSoapCommon(),
        { id: "tooth", label: "Tooth", type: "text", value: "#19" },
        { id: "reason", label: "Indication", type: "text", value: "non-restorable fractured crown; divergent roots" },
        { id: "block", label: "Injections", type: "text", value: "left IANB, lingual, long buccal, PDL" },
        { id: "flap", label: "Flap", type: "select", options: ["Full-thickness envelope flap from #18 to #20.", "Full-thickness triangular flap with mesial releasing incision.", "No flap; tooth sectioned through the occlusal."], value: "Full-thickness envelope flap from #18 to #20." },
        { id: "bone", label: "Bone removal / sectioning", type: "text", value: "Minimal buccal bone removed; tooth sectioned bucco-lingually through the furcation with #701 on surgical handpiece under sterile saline" },
        { id: "delivery", label: "Delivery", type: "text", value: "Mesial and distal roots elevated and delivered separately; distal with Cryer from mesial socket" },
        { id: "sinus", label: "Sinus", type: "select", options: ["Not applicable (mandibular).", "No oroantral communication (negative nose-blow test).", "Small oroantral communication; figure-8 suture and sinus precautions."], value: "Not applicable (mandibular)." },
        { id: "suture", label: "Closure", type: "text", value: "Flap repositioned; 3 simple interrupted 3-0 chromic gut sutures" },
        { id: "rx", label: "Rx / analgesia", type: "text", value: "Ibuprofen 600 mg + acetaminophen 500 mg every 6 h as needed; chlorhexidine 0.12% rinse from 24 h" },
        { id: "nv", label: "Next visit", type: "text", value: "Post-op check in 1 week" },
      ],
      template: `S:
{{age}} y/o {{sex}} presents for surgical extraction of {{tooth}}. Indication: {{reason}}.
Medical history: {{mhx}}. Allergies: {{allergies}}. Pre-op BP/pulse: {{bp_pre}}.
{{premed}}

O:
Periapical radiograph reviewed: root morphology and relation to adjacent structures noted.

A:
{{tooth}}: {{reason}}; surgical extraction indicated.

P:
Risks, benefits and alternatives reviewed; surgical consent signed by patient and supervising surgeon.
Topical 20% benzocaine applied. {{carps}} carpule(s) {{anesthetic}} administered as {{block}}; aspiration negative; profound anesthesia confirmed. Time-out completed.
{{flap}} {{bone}}. {{delivery}}; roots confirmed complete.
Site irrigated with sterile saline; debrided; sharp bone smoothed. {{sinus}}
{{suture}}. Hemostasis achieved with gauze pressure. Post-op BP/pulse: {{bp_post}}.
Verbal and written post-op instructions given; gauze provided. {{rx}}.

NV: {{nv}}`,
    },
  },
];

export const proceduresData: Procedure[] = [
  // Restorative dataset: all entries filed under Restorative (including PRR and occlusal guard).
  ...RESTORATIVE_PROCEDURES.map((m) => normalizeManualProcedure(m, 'restorative')),
  // Fixed & digital dataset: category taken from each entry.
  ...FIXED_DIGITAL_PROCEDURES.map((m) => normalizeManualProcedure(m)),
  // Removable dataset: complete dentures #1–8 and RPD sequence.
  ...REMOVABLE_PROCEDURES.map((m) => normalizeManualProcedure(m)),
  // Pediatrics, diagnostics/exams and periodontics dataset.
  ...PEDS_DIAGNOSTIC_PROCEDURES.map((m) => normalizeManualProcedure(m)),
  // Oral surgery dataset.
  ...ORAL_SURGERY_PROCEDURES.map((m) => normalizeManualProcedure(m)),
  // One-visit e.max summary (prep + IDS + impression + provisional), kept alongside the visit-by-visit entries.
  emaxCrown,
];


/* ========================================================================== */
/* 3. UTILITIES & HOOKS                                                       */
/* ========================================================================== */

type AccentKey = 'honey' | 'eucalyptus' | 'sage' | 'terracotta' | 'cocoa' | 'brass' | 'blossom' | 'plum';

const CATEGORIES: { id: CategoryId; label: string; icon: LucideIcon; accent: AccentKey }[] = [
  { id: 'exams', label: 'Diagnostics/Exams', icon: Stethoscope, accent: 'honey' },
  { id: 'perio', label: 'Periodontics', icon: Activity, accent: 'eucalyptus' },
  { id: 'restorative', label: 'Restorative', icon: Layers, accent: 'sage' },
  { id: 'fixed', label: 'Fixed Prosth', icon: Crown, accent: 'terracotta' },
  { id: 'removable', label: 'Removable Prosth', icon: Smile, accent: 'cocoa' },
  { id: 'implants', label: 'Implants & Digital', icon: ScanLine, accent: 'brass' },
  { id: 'pediatrics', label: 'Pediatrics', icon: Baby, accent: 'blossom' },
  { id: 'surgery', label: 'Oral Surgery', icon: Scissors, accent: 'plum' },
];

const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<
  CategoryId,
  (typeof CATEGORIES)[number]
>;

interface AccentStyle {
  badge: string;
  solid: string;
  dot: string;
  text: string;
  soft: string;
  icon: string;
}

/** Full literal class strings so Tailwind can see every class. */
const ACCENT: Record<AccentKey, AccentStyle> = {
  honey: {
    badge: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
    solid: 'bg-amber-600 text-white ring-amber-600 dark:bg-amber-500 dark:text-stone-950 dark:ring-amber-500',
    dot: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-300',
    soft: 'border-amber-500 bg-amber-50/70 dark:bg-amber-500/10',
    icon: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  },
  eucalyptus: {
    badge: 'bg-teal-50 text-teal-800 ring-teal-700/20 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-400/20',
    solid: 'bg-teal-800 text-white ring-teal-800 dark:bg-teal-500 dark:text-stone-950 dark:ring-teal-500',
    dot: 'bg-teal-600',
    text: 'text-teal-800 dark:text-teal-300',
    soft: 'border-teal-600 bg-teal-50/70 dark:bg-teal-500/10',
    icon: 'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300',
  },
  sage: {
    badge: 'bg-emerald-50 text-emerald-800 ring-emerald-700/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
    solid: 'bg-emerald-700 text-white ring-emerald-700 dark:bg-emerald-500 dark:text-stone-950 dark:ring-emerald-500',
    dot: 'bg-emerald-600',
    text: 'text-emerald-800 dark:text-emerald-300',
    soft: 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-500/10',
    icon: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  terracotta: {
    badge: 'bg-orange-50 text-orange-800 ring-orange-700/20 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-400/20',
    solid: 'bg-orange-700 text-white ring-orange-700 dark:bg-orange-500 dark:text-stone-950 dark:ring-orange-500',
    dot: 'bg-orange-600',
    text: 'text-orange-800 dark:text-orange-300',
    soft: 'border-orange-600 bg-orange-50/70 dark:bg-orange-500/10',
    icon: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
  },
  cocoa: {
    badge: 'bg-stone-100 text-stone-800 ring-stone-600/20 dark:bg-stone-500/15 dark:text-stone-200 dark:ring-stone-400/20',
    solid: 'bg-stone-700 text-white ring-stone-700 dark:bg-stone-300 dark:text-stone-950 dark:ring-stone-300',
    dot: 'bg-stone-500',
    text: 'text-stone-700 dark:text-stone-300',
    soft: 'border-stone-500 bg-stone-100/80 dark:bg-stone-500/10',
    icon: 'bg-stone-200 text-stone-800 dark:bg-stone-500/20 dark:text-stone-200',
  },
  brass: {
    badge: 'bg-yellow-50 text-yellow-800 ring-yellow-700/20 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-400/20',
    solid: 'bg-yellow-700 text-white ring-yellow-700 dark:bg-yellow-500 dark:text-stone-950 dark:ring-yellow-500',
    dot: 'bg-yellow-600',
    text: 'text-yellow-800 dark:text-yellow-300',
    soft: 'border-yellow-600 bg-yellow-50/70 dark:bg-yellow-500/10',
    icon: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300',
  },
  blossom: {
    badge: 'bg-pink-50 text-pink-800 ring-pink-700/20 dark:bg-pink-500/10 dark:text-pink-300 dark:ring-pink-400/20',
    solid: 'bg-pink-700 text-white ring-pink-700 dark:bg-pink-400 dark:text-stone-950 dark:ring-pink-400',
    dot: 'bg-pink-500',
    text: 'text-pink-800 dark:text-pink-300',
    soft: 'border-pink-500 bg-pink-50/70 dark:bg-pink-500/10',
    icon: 'bg-pink-100 text-pink-800 dark:bg-pink-500/15 dark:text-pink-300',
  },
  plum: {
    badge: 'bg-rose-50 text-rose-900 ring-rose-800/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20',
    solid: 'bg-rose-800 text-white ring-rose-800 dark:bg-rose-400 dark:text-stone-950 dark:ring-rose-400',
    dot: 'bg-rose-700',
    text: 'text-rose-900 dark:text-rose-300',
    soft: 'border-rose-700 bg-rose-50/70 dark:bg-rose-500/10',
    icon: 'bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-300',
  },
};

const TONE: Record<TimerTone, { label: string; ring: string; badge: string }> = {
  etch: {
    label: 'Etch / condition',
    ring: 'stroke-orange-600 dark:stroke-orange-400',
    badge: 'bg-orange-50 text-orange-800 ring-orange-700/20 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-400/20',
  },
  prime: {
    label: 'Prime / bond',
    ring: 'stroke-emerald-600 dark:stroke-emerald-400',
    badge: 'bg-emerald-50 text-emerald-800 ring-emerald-700/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  },
  cure: {
    label: 'Light cure',
    ring: 'stroke-amber-500 dark:stroke-amber-400',
    badge: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
  },
  set: {
    label: 'Set / dwell',
    ring: 'stroke-stone-500 dark:stroke-stone-300',
    badge: 'bg-stone-100 text-stone-700 ring-stone-500/20 dark:bg-stone-500/15 dark:text-stone-300 dark:ring-stone-400/20',
  },
};

const SURFACE_ORDER = ['M', 'O', 'I', 'D', 'B', 'F', 'L'];

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function formatChairShort(c: Procedure['chairTime']): string {
  return c.min === c.max ? `${c.min}m` : `${c.min}–${c.max}m`;
}

function formatChairLong(c: Procedure['chairTime']): string {
  return c.label ?? `${c.min}–${c.max} min`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m} min`;
}

interface MatchResult {
  ok: boolean;
  reason?: string;
}

function matchProcedure(p: Procedure, query: string): MatchResult {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { ok: true };
  const fields = [
    { label: '', text: `${p.title} ${p.shortTitle}` },
    ...p.cdtCodes.map((c) => ({ label: `CDT ${c.code}`, text: `${c.code} ${c.descriptor}` })),
    ...p.keyBurs.map((b) => ({ label: `Bur: ${b}`, text: b })),
    ...p.keyMaterials.map((m) => ({ label: `Material: ${m}`, text: m })),
    ...(p.tags ?? []).map((t) => ({ label: `Tag: ${t}`, text: t })),
    ...p.tray.flatMap((g) => g.items.map((i) => ({ label: `Tray: ${i.label}`, text: `${i.label} ${i.detail ?? ''}` }))),
  ].map((f) => ({ ...f, lc: f.text.toLowerCase() }));
  const haystack = fields.map((f) => f.lc).join(' | ');
  if (!tokens.every((t) => haystack.includes(t))) return { ok: false };
  if (tokens.every((t) => fields[0].lc.includes(t))) return { ok: true };
  const hit = fields.find((f) => f.label && tokens.some((t) => f.lc.includes(t)));
  return { ok: true, reason: hit?.label };
}

function fillTemplate(template: string, values: Record<string, string>): string {
  return template
    .replace(/\{\{(\w+)\}\}/g, (_, key: string) => (values[key] ?? '').trim() || '[—]')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function missingTemplateKeys(template: string, values: Record<string, string>): string[] {
  const keys = new Set<string>();
  template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(values[key] ?? '').trim()) keys.add(key);
    return '';
  });
  return [...keys];
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function playAlert(): void {
  try {
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.25, 0.5].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = ctx.currentTime + offset;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.start(t);
      osc.stop(t + 0.2);
    });
    window.setTimeout(() => void ctx.close(), 1000);
    navigator.vibrate?.([120, 80, 120]);
  } catch {
    /* audio unavailable — the visual alert still shows */
  }
}

function scrollToId(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

interface TimerState {
  total: number;
  remaining: number;
  running: boolean;
  endAt: number | null;
  done: boolean;
}

function idleTimer(p: TimerPreset): TimerState {
  return { total: p.seconds, remaining: p.seconds, running: false, endAt: null, done: false };
}

/** Drift-free countdown timers (wall-clock based) for a set of presets. */
function useTimers(presets: TimerPreset[], onComplete: (preset: TimerPreset) => void) {
  const [timers, setTimers] = useState<Record<string, TimerState>>(() =>
    Object.fromEntries(presets.map((p) => [p.id, idleTimer(p)])),
  );
  const anyRunning = Object.values(timers).some((t) => t.running);

  useEffect(() => {
    if (!anyRunning) return undefined;
    const handle = window.setInterval(() => {
      const now = Date.now();
      setTimers((prev) => {
        let changed = false;
        const next: Record<string, TimerState> = { ...prev };
        for (const [id, t] of Object.entries(prev)) {
          if (!t.running || t.endAt === null) continue;
          changed = true;
          const remaining = Math.max(0, (t.endAt - now) / 1000);
          next[id] =
            remaining <= 0 ? { ...t, remaining: 0, running: false, endAt: null, done: true } : { ...t, remaining };
        }
        return changed ? next : prev;
      });
    }, 200);
    return () => window.clearInterval(handle);
  }, [anyRunning]);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const notified = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const p of presets) {
      const t = timers[p.id];
      if (!t) continue;
      if (t.done && !notified.current.has(p.id)) {
        notified.current.add(p.id);
        onCompleteRef.current(p);
      } else if (!t.done) {
        notified.current.delete(p.id);
      }
    }
  }, [timers, presets]);

  const start = useCallback((id: string) => {
    setTimers((prev) => {
      const t = prev[id];
      if (!t || t.running) return prev;
      const base = t.done || t.remaining <= 0 ? t.total : t.remaining;
      return { ...prev, [id]: { ...t, running: true, done: false, remaining: base, endAt: Date.now() + base * 1000 } };
    });
  }, []);

  const pause = useCallback((id: string) => {
    setTimers((prev) => {
      const t = prev[id];
      if (!t || !t.running || t.endAt === null) return prev;
      return { ...prev, [id]: { ...t, running: false, endAt: null, remaining: Math.max(0, (t.endAt - Date.now()) / 1000) } };
    });
  }, []);

  const toggle = useCallback((id: string) => {
    setTimers((prev) => {
      const t = prev[id];
      if (!t) return prev;
      if (t.running && t.endAt !== null) {
        return { ...prev, [id]: { ...t, running: false, endAt: null, remaining: Math.max(0, (t.endAt - Date.now()) / 1000) } };
      }
      const base = t.done || t.remaining <= 0 ? t.total : t.remaining;
      return { ...prev, [id]: { ...t, running: true, done: false, remaining: base, endAt: Date.now() + base * 1000 } };
    });
  }, []);

  const reset = useCallback((id: string) => {
    setTimers((prev) => {
      const t = prev[id];
      if (!t) return prev;
      return { ...prev, [id]: { ...t, running: false, endAt: null, done: false, remaining: t.total } };
    });
  }, []);

  const resetAll = useCallback(() => {
    setTimers((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([id, t]) => [id, { ...t, running: false, endAt: null, done: false, remaining: t.total }]),
      ),
    );
  }, []);

  return { timers, start, pause, toggle, reset, resetAll };
}

type TimerApi = ReturnType<typeof useTimers>;

function useElementHeight<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState(140);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => setHeight(el.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, height];
}

const STORAGE_PREFIX = 'chairside.';

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T): boolean {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Browser-persisted state. Falls back to in-memory state when storage is unavailable. */
function useLocalStorage<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readStorage(key, initial));
  useEffect(() => {
    writeStorage(key, value);
  }, [key, value]);
  return [value, setValue];
}

type ThemeChoice = 'light' | 'dark' | 'system';

function useTheme(): [ThemeChoice, (t: ThemeChoice) => void, boolean] {
  const [choice, setChoice] = useLocalStorage<ThemeChoice>('theme', 'system');
  const [systemDark, setSystemDark] = useState(() => {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return undefined;
    }
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq?.removeEventListener('change', onChange);
  }, []);
  const dark = choice === 'dark' || (choice === 'system' && systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  }, [dark]);
  return [choice, setChoice, dark];
}


/* ========================================================================== */
/* 4. CLINICAL ENGINES (pure functions & reference data)                      */
/* ========================================================================== */

/* ----------------------------- Tooth map -------------------------------- */

type Dentition = 'adult' | 'primary';
type ToothType = 'molar' | 'premolar' | 'canine' | 'lateral' | 'central';
type ToothScope = 'perm-ant' | 'perm-post' | 'prim-ant' | 'prim-post';

interface ToothInfo {
  id: string;
  primary: boolean;
  arch: 'maxillary' | 'mandibular';
  side: 'right' | 'left';
  type: ToothType;
  name: string;
  scope: ToothScope;
}

const ADULT_UPPER = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16'];
const ADULT_LOWER = ['32', '31', '30', '29', '28', '27', '26', '25', '24', '23', '22', '21', '20', '19', '18', '17'];
const PRIMARY_UPPER = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const PRIMARY_LOWER = ['T', 'S', 'R', 'Q', 'P', 'O', 'N', 'M', 'L', 'K'];

/** Quadrant order from the midline outward. */
const ADULT_QUADRANT: { type: ToothType; ordinal: string }[] = [
  { type: 'central', ordinal: 'central incisor' },
  { type: 'lateral', ordinal: 'lateral incisor' },
  { type: 'canine', ordinal: 'canine' },
  { type: 'premolar', ordinal: 'first premolar' },
  { type: 'premolar', ordinal: 'second premolar' },
  { type: 'molar', ordinal: 'first molar' },
  { type: 'molar', ordinal: 'second molar' },
  { type: 'molar', ordinal: 'third molar' },
];
const PRIMARY_QUADRANT: { type: ToothType; ordinal: string }[] = [
  { type: 'central', ordinal: 'central incisor' },
  { type: 'lateral', ordinal: 'lateral incisor' },
  { type: 'canine', ordinal: 'canine' },
  { type: 'molar', ordinal: 'first molar' },
  { type: 'molar', ordinal: 'second molar' },
];

function toothInfo(raw: string | null | undefined): ToothInfo | null {
  if (!raw) return null;
  const id = raw.trim().toUpperCase().replace(/^#/, '');
  const n = Number(id);
  let arch: ToothInfo['arch'];
  let side: ToothInfo['side'];
  let fromMidline: number;
  let primary = false;
  if (Number.isInteger(n) && n >= 1 && n <= 32) {
    if (n <= 8) [arch, side, fromMidline] = ['maxillary', 'right', 8 - n];
    else if (n <= 16) [arch, side, fromMidline] = ['maxillary', 'left', n - 9];
    else if (n <= 24) [arch, side, fromMidline] = ['mandibular', 'left', 24 - n];
    else [arch, side, fromMidline] = ['mandibular', 'right', n - 25];
  } else if (/^[A-T]$/.test(id)) {
    primary = true;
    const i = id.charCodeAt(0) - 65; // A = 0
    if (i <= 4) [arch, side, fromMidline] = ['maxillary', 'right', 4 - i];
    else if (i <= 9) [arch, side, fromMidline] = ['maxillary', 'left', i - 5];
    else if (i <= 14) [arch, side, fromMidline] = ['mandibular', 'left', 14 - i];
    else [arch, side, fromMidline] = ['mandibular', 'right', i - 15];
  } else {
    return null;
  }
  const q = (primary ? PRIMARY_QUADRANT : ADULT_QUADRANT)[fromMidline];
  const anterior = q.type === 'central' || q.type === 'lateral' || q.type === 'canine';
  const archWord = arch === 'maxillary' ? 'Maxillary' : 'Mandibular';
  return {
    id,
    primary,
    arch,
    side,
    type: q.type,
    name: `${primary ? 'Primary ' + archWord.toLowerCase() : archWord} ${side} ${q.ordinal}`,
    scope: primary ? (anterior ? 'prim-ant' : 'prim-post') : anterior ? 'perm-ant' : 'perm-post',
  };
}

/** Which tooth groups each tooth-specific procedure applies to. Others are not tooth-specific. */
const TOOTH_SCOPE: Record<string, ToothScope[]> = {
  'class-i-amalgam': ['perm-post'],
  'class-ii-amalgam': ['perm-post'],
  'class-i-composite': ['perm-post'],
  'class-ii-composite': ['perm-post'],
  'class-iii-composite': ['perm-ant'],
  'class-iv-composite': ['perm-ant'],
  'class-v-composite': ['perm-ant', 'perm-post'],
  'composite-veneers': ['perm-ant'],
  'rmgi-ketac-nano': ['perm-ant', 'perm-post'],
  'gi-fuji-ix': ['perm-ant', 'perm-post', 'prim-ant', 'prim-post'],
  'pit-fissure-sealants': ['perm-post', 'prim-post'],
  'preventive-resin-restoration': ['perm-post'],
  'core-buildup': ['perm-ant', 'perm-post'],
  'crown-preparation': ['perm-ant', 'perm-post'],
  'provisional-fabrication': ['perm-ant', 'perm-post'],
  'crown-final-impression': ['perm-ant', 'perm-post'],
  'crown-delivery': ['perm-ant', 'perm-post'],
  'crown-removal': ['perm-ant', 'perm-post'],
  'digital-prep-scan': ['perm-ant', 'perm-post'],
  'digital-delivery-emax': ['perm-ant', 'perm-post'],
  'implant-level-impression': ['perm-ant', 'perm-post'],
  'emax-crown-prep': ['perm-ant', 'perm-post'],
  'urgent-care-endo-diagnosis': ['perm-ant', 'perm-post'],
  'simple-extraction': ['perm-ant', 'perm-post', 'prim-ant', 'prim-post'],
  'root-tip-extraction': ['perm-ant', 'perm-post', 'prim-ant', 'prim-post'],
  'surgical-extraction': ['perm-ant', 'perm-post'],
  'rpd-mouth-preparation': ['perm-ant', 'perm-post'],
  'peds-composite': ['prim-ant', 'prim-post'],
  'peds-ssc': ['prim-post'],
  'peds-pulpotomy-viscostat-irm': ['prim-post'],
  'peds-strip-crown': ['prim-ant'],
  'peds-sdf': ['prim-ant', 'prim-post', 'perm-ant', 'perm-post'],
  'peds-local-anesthesia': ['prim-ant', 'prim-post'],
};

function appliesToTooth(procedureId: string, tooth: ToothInfo | null): boolean {
  if (!tooth) return true;
  return TOOTH_SCOPE[procedureId]?.includes(tooth.scope) ?? false;
}

/* --------------------------- Anesthesia by tooth ------------------------ */

interface AnesthesiaSuggestion {
  primary: string;
  palatalOrLingual: string;
  notes: string[];
  /** Short phrase for SOAP "Injection" fields. */
  soap: string;
}

function anesthesiaFor(t: ToothInfo): AnesthesiaSuggestion {
  const side = t.side;
  if (t.arch === 'maxillary') {
    if (t.primary) {
      return {
        primary: 'Buccal (supraperiosteal) infiltration over the apex',
        palatalOrLingual: 'Palatal infiltration (nasopalatine for incisors) for extraction, SSC clamp or palatal tissue',
        notes: ['Thin maxillary cortical bone makes infiltration reliable in primary teeth.', 'Use a short 30G needle; calculate the weight-based maximum first.'],
        soap: `${side} maxillary buccal infiltration`,
      };
    }
    if (t.type === 'molar') {
      return {
        primary: 'Buccal infiltration over the apices, or PSA block (add MSA/infiltration for the MB root of the first molar)',
        palatalOrLingual: 'Greater palatine block for extraction, rubber-dam clamp or palatal tissue',
        notes: ['Articaine buccal infiltration often gives palatal diffusion but is not a substitute for a palatal injection for extraction.'],
        soap: `${side} maxillary buccal infiltration and greater palatine block`,
      };
    }
    if (t.type === 'premolar') {
      return {
        primary: 'Buccal infiltration over the apex, or MSA block',
        palatalOrLingual: 'Greater palatine block or palatal infiltration for extraction, clamp or palatal tissue',
        notes: [],
        soap: `${side} maxillary buccal infiltration and palatal infiltration`,
      };
    }
    return {
      primary: 'Labial infiltration over the apex, or ASA (infraorbital) block for multiple anteriors',
      palatalOrLingual: 'Nasopalatine block or palatal infiltration for extraction, clamp or palatal tissue',
      notes: ['Midline teeth may need crossover innervation from the contralateral side.'],
      soap: `${side} maxillary labial infiltration and nasopalatine block`,
    };
  }
  // Mandibular
  if (t.primary) {
    if (t.type === 'molar') {
      return {
        primary: 'IANB + long buccal',
        palatalOrLingual: 'Lingual nerve is anesthetized with the IANB',
        notes: ['4% articaine buccal infiltration is an alternative for primary molars (not recommended under 4 y).', 'Mandibular foramen sits lower in children: inject at or slightly below the occlusal plane.'],
        soap: `${side} IANB and long buccal`,
      };
    }
    return {
      primary: 'Labial infiltration over the apex',
      palatalOrLingual: 'Lingual infiltration for extraction',
      notes: [],
      soap: `${side} mandibular labial infiltration`,
    };
  }
  if (t.type === 'molar') {
    return {
      primary: 'IANB + long buccal',
      palatalOrLingual: 'Lingual nerve is anesthetized with the IANB (confirm lingual soft tissue for extraction)',
      notes: ['Supplement with 4% articaine buccal infiltration, PDL or intraosseous if pulpal anesthesia is incomplete (common with irreversible pulpitis).'],
      soap: `${side} IANB and long buccal`,
    };
  }
  if (t.type === 'premolar') {
    return {
      primary: 'IANB (or mental–incisive block for restorative work) + long buccal if buccal soft tissue is involved',
      palatalOrLingual: 'Lingual nerve is anesthetized with the IANB; add lingual infiltration after a mental block for extraction',
      notes: ['Protect the mental foramen region (between premolar apices) during surgery.'],
      soap: `${side} IANB and long buccal`,
    };
  }
  return {
    primary: 'Incisive (mental) block or labial infiltration with 4% articaine; IANB for the canine',
    palatalOrLingual: 'Lingual infiltration for extraction or subgingival work',
    notes: ['Crossover innervation at the midline: add contralateral labial infiltration for central incisors.'],
    soap: `${side} mandibular labial infiltration and incisive block`,
  };
}

/* ------------------------- Local anesthetic dosing ---------------------- */

interface DoseLimits {
  mgPerKg: number;
  maxMg: number;
  note?: string;
  notRecommended?: boolean;
}

interface LaAgent {
  id: string;
  name: string;
  /** mg of anesthetic per mL. */
  mgPerMl: number;
  /** mg of epinephrine per mL (1:100,000 = 0.01). */
  epiMgPerMl: number;
  adult: DoseLimits;
  pediatric: DoseLimits;
}

/**
 * Adult: manufacturer (FDA-label) maximums. Pediatric: AAPD values as used in
 * the manual's pediatric dose table (peds-local-anesthesia).
 * Bupivacaine uses the US 1.3 mg/kg (90 mg max) value rather than 2.0 mg/kg.
 */
const LA_DOSING: LaAgent[] = [
  {
    id: 'lido',
    name: '2% lidocaine 1:100,000 epi',
    mgPerMl: 20,
    epiMgPerMl: 0.01,
    adult: { mgPerKg: 7.0, maxMg: 500, note: 'Label maximum (3.2 mg/lb). Many clinicians use 4.4 mg/kg / 300 mg as a conservative ceiling.' },
    pediatric: { mgPerKg: 4.4, maxMg: 300 },
  },
  {
    id: 'arti100',
    name: '4% articaine 1:100,000 epi',
    mgPerMl: 40,
    epiMgPerMl: 0.01,
    adult: { mgPerKg: 7.0, maxMg: 500 },
    pediatric: { mgPerKg: 7.0, maxMg: 500, note: 'Not recommended under 4 years.' },
  },
  {
    id: 'arti200',
    name: '4% articaine 1:200,000 epi',
    mgPerMl: 40,
    epiMgPerMl: 0.005,
    adult: { mgPerKg: 7.0, maxMg: 500 },
    pediatric: { mgPerKg: 7.0, maxMg: 500, note: 'Not recommended under 4 years.' },
  },
  {
    id: 'mepi',
    name: '3% mepivacaine plain',
    mgPerMl: 30,
    epiMgPerMl: 0,
    adult: { mgPerKg: 6.6, maxMg: 400 },
    pediatric: { mgPerKg: 4.4, maxMg: 300 },
  },
  {
    id: 'prilo',
    name: '4% prilocaine plain',
    mgPerMl: 40,
    epiMgPerMl: 0,
    adult: { mgPerKg: 8.0, maxMg: 600, note: 'Avoid with methemoglobinemia risk.' },
    pediatric: { mgPerKg: 6.0, maxMg: 400, note: 'Avoid with methemoglobinemia risk.' },
  },
  {
    id: 'bupi',
    name: '0.5% bupivacaine 1:200,000 epi',
    mgPerMl: 5,
    epiMgPerMl: 0.005,
    adult: { mgPerKg: 1.3, maxMg: 90, note: 'Long-acting; for prolonged procedures or post-op pain control.' },
    pediatric: { mgPerKg: 1.3, maxMg: 90, notRecommended: true, note: 'Not recommended for children (prolonged soft-tissue anesthesia, self-injury).' },
  },
];

const EPI_LIMIT_MG = { healthy: 0.2, cardiac: 0.04 } as const;

const LB_PER_KG = 2.20462;

function floorTenth(n: number): number {
  return Math.floor(n * 10 + 1e-9) / 10;
}

interface DoseInput {
  weightKg: number;
  population: 'adult' | 'pediatric';
  health: 'healthy' | 'cardiac';
  cartridgeMl: number;
}

interface AgentDose {
  agent: LaAgent;
  limits: DoseLimits;
  maxMg: number;
  mgPerCarpule: number;
  epiPerCarpule: number;
  carpulesByDrug: number;
  carpulesByEpi: number;
  maxCarpules: number;
  limitedBy: 'drug' | 'epinephrine';
}

function agentDose(agent: LaAgent, input: DoseInput): AgentDose {
  const limits = input.population === 'adult' ? agent.adult : agent.pediatric;
  const maxMg = Math.min(input.weightKg * limits.mgPerKg, limits.maxMg);
  const mgPerCarpule = agent.mgPerMl * input.cartridgeMl;
  const epiPerCarpule = agent.epiMgPerMl * input.cartridgeMl;
  const carpulesByDrug = floorTenth(maxMg / mgPerCarpule);
  const carpulesByEpi = epiPerCarpule > 0 ? floorTenth(EPI_LIMIT_MG[input.health] / epiPerCarpule) : Infinity;
  const maxCarpules = Math.min(carpulesByDrug, carpulesByEpi);
  return {
    agent,
    limits,
    maxMg,
    mgPerCarpule,
    epiPerCarpule,
    carpulesByDrug,
    carpulesByEpi,
    maxCarpules,
    limitedBy: carpulesByEpi < carpulesByDrug ? 'epinephrine' : 'drug',
  };
}

interface DoseLogEntry {
  id: string;
  agentId: string;
  carpules: number;
}

interface DoseTally {
  /** Sum of each agent's mg ÷ that agent's maximum (combined-agent fraction). */
  fractionUsed: number;
  epiUsedMg: number;
  epiLimitMg: number;
  mgByAgent: Record<string, number>;
}

function tallyDoses(log: DoseLogEntry[], input: DoseInput): DoseTally {
  let fractionUsed = 0;
  let epiUsedMg = 0;
  const mgByAgent: Record<string, number> = {};
  for (const entry of log) {
    const agent = LA_DOSING.find((a) => a.id === entry.agentId);
    if (!agent) continue;
    const d = agentDose(agent, input);
    const mg = entry.carpules * d.mgPerCarpule;
    mgByAgent[agent.id] = (mgByAgent[agent.id] ?? 0) + mg;
    fractionUsed += d.maxMg > 0 ? mg / d.maxMg : 0;
    epiUsedMg += entry.carpules * d.epiPerCarpule;
  }
  return { fractionUsed, epiUsedMg, epiLimitMg: EPI_LIMIT_MG[input.health], mgByAgent };
}

function remainingCarpules(agent: LaAgent, input: DoseInput, tally: DoseTally): number {
  const d = agentDose(agent, input);
  const byDrug = floorTenth((Math.max(0, 1 - tally.fractionUsed) * d.maxMg) / d.mgPerCarpule);
  const byEpi = d.epiPerCarpule > 0 ? floorTenth(Math.max(0, tally.epiLimitMg - tally.epiUsedMg) / d.epiPerCarpule) : Infinity;
  return Math.max(0, Math.min(byDrug, byEpi));
}

/* ------------------------ AAE endodontic diagnosis ---------------------- */

interface EndoFindings {
  history: 'none' | 'treated' | 'initiated';
  cold: 'normal' | 'exaggerated' | 'lingering' | 'none';
  spontaneous: boolean;
  deepCaries: boolean;
  percussion: 'neg' | 'pos' | 'strong';
  palpation: 'neg' | 'pos';
  probing: 'normal' | 'isolated';
  radiograph: 'normal' | 'widened' | 'parl' | 'condensing';
  swelling: 'none' | 'sinus' | 'swelling';
}

const DEFAULT_ENDO: EndoFindings = {
  history: 'none',
  cold: 'normal',
  spontaneous: false,
  deepCaries: false,
  percussion: 'neg',
  palpation: 'neg',
  probing: 'normal',
  radiograph: 'normal',
  swelling: 'none',
};

type PulpDx =
  | 'Normal pulp'
  | 'Reversible pulpitis'
  | 'Symptomatic irreversible pulpitis'
  | 'Asymptomatic irreversible pulpitis'
  | 'Pulp necrosis'
  | 'Previously treated'
  | 'Previously initiated therapy';

type ApicalDx =
  | 'Normal apical tissues'
  | 'Symptomatic apical periodontitis'
  | 'Asymptomatic apical periodontitis'
  | 'Acute apical abscess'
  | 'Chronic apical abscess'
  | 'Condensing osteitis';

interface CdtOption {
  code: string;
  label: string;
}

interface EndoResult {
  pulp: PulpDx;
  apical: ApicalDx;
  rationale: string[];
  warnings: string[];
  diagnosticCodes: CdtOption[];
  treatment: CdtOption[];
}

function rctCode(t: ToothInfo | null): CdtOption[] {
  if (!t) {
    return [
      { code: 'D3310', label: 'Endodontic therapy, anterior tooth' },
      { code: 'D3320', label: 'Endodontic therapy, premolar tooth' },
      { code: 'D3330', label: 'Endodontic therapy, molar tooth' },
    ];
  }
  if (t.type === 'molar') return [{ code: 'D3330', label: 'Endodontic therapy, molar tooth' }];
  if (t.type === 'premolar') return [{ code: 'D3320', label: 'Endodontic therapy, premolar tooth' }];
  return [{ code: 'D3310', label: 'Endodontic therapy, anterior tooth' }];
}

function retreatCode(t: ToothInfo | null): CdtOption[] {
  if (!t) {
    return [
      { code: 'D3346', label: 'Retreatment of previous root canal therapy, anterior' },
      { code: 'D3347', label: 'Retreatment of previous root canal therapy, premolar' },
      { code: 'D3348', label: 'Retreatment of previous root canal therapy, molar' },
    ];
  }
  if (t.type === 'molar') return [{ code: 'D3348', label: 'Retreatment of previous root canal therapy, molar' }];
  if (t.type === 'premolar') return [{ code: 'D3347', label: 'Retreatment of previous root canal therapy, premolar' }];
  return [{ code: 'D3346', label: 'Retreatment of previous root canal therapy, anterior' }];
}

function diagnoseEndo(f: EndoFindings, tooth: ToothInfo | null): EndoResult {
  const rationale: string[] = [];
  const warnings: string[] = [];
  let pulp: PulpDx;
  if (f.history === 'treated') {
    pulp = 'Previously treated';
    rationale.push('Tooth has been endodontically treated and obturated.');
  } else if (f.history === 'initiated') {
    pulp = 'Previously initiated therapy';
    rationale.push('Pulpotomy or pulpectomy was previously started but not completed.');
  } else if (f.cold === 'none') {
    pulp = 'Pulp necrosis';
    rationale.push('No response to cold.');
    warnings.push('Confirm with EPT and control teeth: calcified canals, recent trauma, immature apices and full-coverage crowns can give false negatives.');
  } else if (f.cold === 'lingering' || f.spontaneous) {
    pulp = 'Symptomatic irreversible pulpitis';
    rationale.push(f.cold === 'lingering' ? 'Cold response lingers after the stimulus is removed.' : 'History of spontaneous pain.');
  } else if (f.cold === 'exaggerated') {
    pulp = 'Reversible pulpitis';
    rationale.push('Heightened cold response that resolves within seconds; no spontaneous pain.');
  } else if (f.deepCaries) {
    pulp = 'Asymptomatic irreversible pulpitis';
    rationale.push('Normal cold response without symptoms, but deep caries would likely result in exposure on removal.');
  } else {
    pulp = 'Normal pulp';
    rationale.push('Cold response is normal and transient (resolves in 1–2 s); no spontaneous pain.');
  }

  const tender = f.percussion !== 'neg' || f.palpation === 'pos';
  let apical: ApicalDx;
  if (f.swelling === 'swelling') {
    apical = 'Acute apical abscess';
    rationale.push('Swelling with pain: rapid-onset apical inflammatory reaction.');
  } else if (f.swelling === 'sinus') {
    apical = 'Chronic apical abscess';
    rationale.push('Sinus tract present with little or no discomfort. Trace it with a gutta-percha cone and a radiograph.');
  } else if (f.radiograph === 'condensing') {
    apical = 'Condensing osteitis';
    rationale.push('Diffuse radiopaque lesion at the apex (localized bony reaction to low-grade inflammation).');
  } else if (tender) {
    apical = 'Symptomatic apical periodontitis';
    rationale.push(`Pain on ${f.percussion !== 'neg' ? 'percussion' : 'palpation'}${f.radiograph === 'parl' ? ', with apical radiolucency' : ''}.`);
  } else if (f.radiograph === 'parl') {
    apical = 'Asymptomatic apical periodontitis';
    rationale.push('Apical radiolucency without clinical symptoms.');
  } else if (f.radiograph === 'widened' && (pulp === 'Pulp necrosis' || pulp === 'Previously treated')) {
    apical = 'Asymptomatic apical periodontitis';
    rationale.push('Widened apical PDL space with a non-vital or treated pulp (early apical change).');
  } else {
    apical = 'Normal apical tissues';
    rationale.push('Not sensitive to percussion or palpation; apical lamina dura intact.');
    if (f.radiograph === 'widened') warnings.push('Widened PDL with a vital pulp and no symptoms: consider occlusal trauma; monitor.');
  }

  const vital = pulp === 'Normal pulp' || pulp === 'Reversible pulpitis';
  if (vital && (apical === 'Asymptomatic apical periodontitis' || apical === 'Acute apical abscess' || apical === 'Chronic apical abscess')) {
    warnings.push('Findings conflict: apical pathology of pulpal origin usually means a necrotic pulp. Retest (cold + EPT, control teeth) and consider a non-endodontic lesion or a different tooth.');
  }
  if (f.probing === 'isolated') {
    warnings.push('Isolated narrow deep probing: suspect vertical root fracture or a sinus tract draining through the PDL. Evaluate with transillumination, bite test and CBCT before treatment planning.');
  }
  if (f.percussion === 'strong' && vital) {
    warnings.push('Marked percussion sensitivity with a vital pulp: rule out cracked tooth, high restoration or periodontal abscess.');
  }

  const diagnosticCodes: CdtOption[] = [
    { code: 'D0140', label: 'Limited oral evaluation, problem focused' },
    { code: 'D0220', label: 'Intraoral periapical, first radiographic image' },
    { code: 'D0460', label: 'Pulp vitality tests' },
  ];

  const treatment: CdtOption[] = [];
  const primary = tooth?.primary ?? false;
  if (pulp === 'Normal pulp' || pulp === 'Reversible pulpitis') {
    treatment.push({ code: 'D2940', label: 'Protective restoration (then definitive restoration)' });
  } else if (pulp === 'Previously treated') {
    if (apical !== 'Normal apical tissues') {
      treatment.push(...retreatCode(tooth));
      treatment.push({ code: 'D3410–D3426', label: 'Apicoectomy (by tooth / root), if retreatment is not feasible' });
    } else {
      treatment.push({ code: '—', label: 'No endodontic treatment indicated; evaluate the coronal restoration' });
    }
  } else if (primary) {
    if (pulp === 'Pulp necrosis' || apical !== 'Normal apical tissues') {
      treatment.push(
        tooth && (tooth.type === 'molar')
          ? { code: 'D3240', label: 'Pulpal therapy (resorbable filling), posterior primary tooth' }
          : { code: 'D3230', label: 'Pulpal therapy (resorbable filling), anterior primary tooth' },
      );
      treatment.push({ code: 'D7140', label: 'Extraction, erupted tooth' });
    } else {
      treatment.push({ code: 'D3220', label: 'Therapeutic pulpotomy (coronal pulp removal)' });
    }
  } else {
    if (pulp === 'Symptomatic irreversible pulpitis' || pulp === 'Previously initiated therapy') {
      treatment.push({ code: 'D3221', label: 'Pulpal debridement (emergency relief)' });
    }
    treatment.push(...rctCode(tooth));
    treatment.push({ code: 'D7140', label: 'Extraction, erupted tooth (alternative)' });
  }
  if (apical === 'Acute apical abscess') {
    treatment.unshift({ code: 'D7510', label: 'Incision and drainage of abscess, intraoral soft tissue (if fluctuant)' });
    warnings.push('ADA 2019: antibiotics only with systemic involvement (fever, malaise, lymphadenopathy, trismus, spreading swelling) as an adjunct to definitive treatment.');
  }
  return { pulp, apical, rationale, warnings, diagnosticCodes, treatment };
}

/* ---------------------------- Vitals triage ----------------------------- */

type RiskLevel = 'green' | 'yellow' | 'red';

interface TriageResult {
  level: RiskLevel;
  title: string;
  detail: string;
}

function triageBP(sys: number | null, dia: number | null): TriageResult | null {
  if (sys === null || dia === null || !Number.isFinite(sys) || !Number.isFinite(dia)) return null;
  if (sys >= 180 || dia >= 110) {
    return {
      level: 'red',
      title: 'Defer elective care',
      detail: 'BP ≥ 180/110. Recheck after 5 min rest. Refer for same-day medical evaluation; call EMS if chest pain, severe headache, neurologic deficit, dyspnea or visual change. Emergency dental care only (pain/infection) with medical consultation.',
    };
  }
  if (sys >= 160 || dia >= 100) {
    return {
      level: 'yellow',
      title: 'Caution — recheck',
      detail: 'Stage 2, ≥ 160/100. Recheck; routine non-surgical care may proceed if confirmed below 180/110. Limit epinephrine to cardiac dose (0.04 mg), use stress reduction, refer to physician promptly.',
    };
  }
  if (sys >= 140 || dia >= 90) {
    return { level: 'green', title: 'Routine care — refer', detail: 'Stage 2 hypertension (≥ 140/90). Treat; refer to physician for evaluation.' };
  }
  if (sys >= 130 || dia >= 80) {
    return { level: 'green', title: 'Routine care', detail: 'Stage 1 hypertension (130–139 / 80–89). Treat; advise physician follow-up.' };
  }
  if (sys >= 120) {
    return { level: 'green', title: 'Routine care', detail: 'Elevated (120–129 / < 80). Treat; lifestyle counseling.' };
  }
  return { level: 'green', title: 'Routine care', detail: 'Normal (< 120 / < 80).' };
}

function triageGlucose(mgdl: number | null): TriageResult | null {
  if (mgdl === null || !Number.isFinite(mgdl)) return null;
  if (mgdl < 70) {
    return {
      level: 'red',
      title: 'Hypoglycemia — treat first',
      detail: '< 70 mg/dL. Give 15 g fast-acting carbohydrate (if conscious), recheck in 15 min; repeat until ≥ 70 mg/dL and the patient has eaten. Do not start treatment until corrected.',
    };
  }
  if (mgdl > 300) {
    return { level: 'red', title: 'Defer elective care', detail: '> 300 mg/dL. Defer elective treatment; refer to physician (risk of ketoacidosis / hyperosmolar state, poor healing).' };
  }
  if (mgdl > 200) {
    return { level: 'yellow', title: 'Caution', detail: '201–300 mg/dL. Non-surgical care may proceed; defer elective surgery, keep appointments short, confirm medication and meal were taken.' };
  }
  return { level: 'green', title: 'Routine care', detail: '70–200 mg/dL.' };
}

function triageA1c(pct: number | null): TriageResult | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  if (pct > 10) {
    return { level: 'red', title: 'Poor control', detail: '> 10%. Defer elective surgical care; medical consultation. Higher infection and delayed-healing risk.' };
  }
  if (pct >= 8) {
    return { level: 'yellow', title: 'Suboptimal control', detail: '8–10%. Routine care; coordinate with physician before surgery; monitor healing and periodontal status.' };
  }
  if (pct >= 7) {
    return { level: 'green', title: 'Fair control', detail: '7–7.9%. Routine care.' };
  }
  return { level: 'green', title: 'Good control', detail: '< 7%. Routine care.' };
}

/* ------------------- Endocarditis / joint prophylaxis ------------------- */

interface ProphylaxisInput {
  conditions: string[];
  joint: 'none' | 'routine' | 'compromised';
  invasive: boolean;
  allergy: 'none' | 'mild' | 'severe';
  canTakeOral: boolean;
  child: boolean;
  weightKg: number | null;
}

const CARDIAC_CONDITIONS: { id: string; label: string; qualifies: boolean; note?: string }[] = [
  { id: 'valve', label: 'Prosthetic cardiac valve (incl. transcatheter) or prosthetic material used for valve repair', qualifies: true },
  { id: 'ie', label: 'Previous infective endocarditis', qualifies: true },
  { id: 'cyanotic', label: 'Unrepaired cyanotic congenital heart disease (incl. palliative shunts and conduits)', qualifies: true },
  { id: 'chd6', label: 'Congenital heart defect completely repaired with prosthetic material or device, first 6 months', qualifies: true },
  { id: 'chdResidual', label: 'Repaired CHD with residual defect at or adjacent to a prosthetic patch or device', qualifies: true },
  { id: 'transplant', label: 'Cardiac transplant recipient with cardiac valvulopathy', qualifies: true },
  {
    id: 'lvad',
    label: 'Ventricular assist device (LVAD) or implantable heart',
    qualifies: false,
    note: 'Not on the AHA 2021 list; consult the patient’s cardiologist (many VAD teams request prophylaxis).',
  },
];

interface Regimen {
  drug: string;
  adult: string;
  child: string;
}

interface ProphylaxisResult {
  indicated: boolean;
  consult: string[];
  regimens: Regimen[];
  notes: string[];
}

function mgPerKgDose(mgPerKg: number, maxMg: number, kg: number | null): string {
  if (kg === null || !Number.isFinite(kg) || kg <= 0) return `${mgPerKg} mg/kg (max ${maxMg >= 1000 ? maxMg / 1000 + ' g' : maxMg + ' mg'})`;
  const dose = Math.min(mgPerKg * kg, maxMg);
  return `${mgPerKg} mg/kg → ${dose >= 1000 ? (dose / 1000).toFixed(2).replace(/\.?0+$/, '') + ' g' : Math.round(dose) + ' mg'}`;
}

function prophylaxisPlan(input: ProphylaxisInput): ProphylaxisResult {
  const consult: string[] = [];
  const notes: string[] = [];
  const qualifying = CARDIAC_CONDITIONS.filter((c) => c.qualifies && input.conditions.includes(c.id));
  for (const c of CARDIAC_CONDITIONS) if (!c.qualifies && input.conditions.includes(c.id) && c.note) consult.push(c.note);
  if (input.joint === 'compromised') {
    consult.push('Prosthetic joint with immunocompromise or prior joint infection: prophylaxis is generally not indicated (ADA 2015); defer to the orthopedic surgeon, who should provide the regimen if they recommend one.');
  } else if (input.joint === 'routine') {
    notes.push('Prosthetic joint, otherwise healthy: antibiotic prophylaxis is generally not recommended (ADA 2015 / AAOS).');
  }
  const indicated = qualifying.length > 0 && input.invasive;
  if (qualifying.length > 0 && !input.invasive) {
    notes.push('Qualifying cardiac condition, but prophylaxis is only for procedures that manipulate gingival tissue or the periapical region, or perforate the oral mucosa.');
  }
  const kg = input.child ? input.weightKg : null;
  const regimens: Regimen[] = [];
  if (indicated) {
    if (!input.canTakeOral) {
      if (input.allergy === 'none') regimens.push({ drug: 'Ampicillin IM/IV', adult: '2 g', child: mgPerKgDose(50, 2000, kg) });
      if (input.allergy !== 'severe') regimens.push({ drug: 'Cefazolin or ceftriaxone IM/IV', adult: '1 g', child: mgPerKgDose(50, 1000, kg) });
      if (input.allergy === 'severe') notes.push('Unable to take oral medication with a history of anaphylaxis, angioedema or urticaria to penicillin: consult the physician for a parenteral alternative.');
    } else if (input.allergy === 'none') {
      regimens.push({ drug: 'Amoxicillin PO', adult: '2 g', child: mgPerKgDose(50, 2000, kg) });
    } else {
      if (input.allergy === 'mild') regimens.push({ drug: 'Cephalexin PO', adult: '2 g', child: mgPerKgDose(50, 2000, kg) });
      regimens.push({ drug: 'Azithromycin or clarithromycin PO', adult: '500 mg', child: mgPerKgDose(15, 500, kg) });
      regimens.push({
        drug: 'Doxycycline PO',
        adult: '100 mg',
        child: kg !== null && kg > 0 ? (kg < 45 ? `2.2 mg/kg → ${Math.round(2.2 * kg)} mg` : '100 mg') : '< 45 kg: 2.2 mg/kg; > 45 kg: 100 mg',
      });
      if (input.allergy === 'severe') notes.push('History of anaphylaxis, angioedema or urticaria with penicillin: avoid cephalosporins.');
    }
    notes.push('Single dose 30–60 min before the procedure; if inadvertently missed, it may be given up to 2 h after.');
    notes.push('Clindamycin is no longer recommended (AHA 2021) because of C. difficile risk.');
  }
  return { indicated, consult, regimens, notes };
}

/* ------------------------ Cementation protocols ------------------------- */

interface ProtocolStepLite {
  text: string;
  seconds?: number;
  label?: string;
}

interface SubstrateProtocol {
  id: string;
  name: string;
  subtitle: string;
  accent: AccentKey;
  warnings: string[];
  intaglio: ProtocolStepLite[];
  tooth: ProtocolStepLite[];
  cements: { name: string; when: string }[];
  products: string[];
}

const SUBSTRATES: SubstrateProtocol[] = [
  {
    id: 'lds',
    name: 'Lithium disilicate',
    subtitle: 'IPS e.max CAD / Press',
    accent: 'terracotta',
    warnings: [
      'Etch 20 s only: longer HF exposure over-etches and weakens lithium disilicate.',
      'HF is hazardous: extraoral use only, with calcium gluconate gel available.',
    ],
    intaglio: [
      { text: 'Try in with water or try-in paste; verify margins, contacts and shade. Adjust, then re-polish or re-glaze.' },
      { text: 'Etch the intaglio with 5% hydrofluoric acid.', seconds: 20, label: '5% HF etch' },
      { text: 'Rinse thoroughly, dry. If it was lab-etched before try-in, clean with Ivoclean instead of re-etching.', seconds: 20, label: 'Ivoclean' },
      { text: 'Rinse, dry. Apply a silane-containing primer (Monobond Plus or Clearfil Ceramic Primer Plus), let react, air-dry.', seconds: 60, label: 'Silane primer' },
    ],
    tooth: [
      { text: 'Isolate; clean the prep with pumice. Selective enamel etch where enamel is present.' },
      { text: 'Apply the cement system’s tooth primer / universal adhesive per IFU (e.g., Panavia V5 Tooth Primer, Adhese Universal).' },
    ],
    cements: [
      { name: 'Adhesive resin cement (dual-cure)', when: 'Default for crowns, onlays, thin or minimally retentive preps: Panavia V5, Variolink Esthetic DC.' },
      { name: 'Self-adhesive resin cement', when: 'Full-coverage crowns with retentive preps: RelyX Universal, RelyX Unicem 2.' },
      { name: 'Light-cure resin cement', when: 'Thin veneers only (≤ ~1.5 mm) where light reaches the cement.' },
    ],
    products: ['IPS Ceramic Etching Gel (5% HF)', 'Ivoclean', 'Monobond Plus', 'Panavia V5', 'Variolink Esthetic'],
  },
  {
    id: 'zirconia',
    name: 'Zirconia',
    subtitle: '3Y / 4Y / 5Y-TZP',
    accent: 'brass',
    warnings: [
      'Do NOT use hydrofluoric acid: it does not etch zirconia.',
      'Do not clean with phosphoric acid after try-in: phosphate from saliva or etchant binds zirconia and blocks MDP bonding. Use Ivoclean.',
    ],
    intaglio: [
      { text: 'Try in; adjust; re-polish or re-glaze adjusted areas.' },
      { text: 'Clean with Ivoclean (removes saliva phosphate contamination).', seconds: 20, label: 'Ivoclean' },
      { text: 'Airborne-particle abrasion with 50 µm Al₂O₃ at ~1–2 bar, ~10 mm, until uniformly matte (often done by the lab before try-in).' },
      { text: 'Apply a 10-MDP primer (Z-Prime Plus, Clearfil Ceramic Primer Plus or Monobond Plus), air-dry.', seconds: 60, label: 'MDP primer' },
    ],
    tooth: [
      { text: 'Clean the prep with pumice; keep dentin moist, not desiccated.' },
      { text: 'Tooth primer or adhesive only if required by the chosen cement system.' },
    ],
    cements: [
      { name: 'Self-adhesive or MDP resin cement', when: 'Default: RelyX Universal, RelyX Unicem 2, Panavia SA Cement Universal.' },
      { name: 'Adhesive resin cement', when: 'Short or over-tapered preps, resin-bonded bridges.' },
      { name: 'RMGI (FujiCem, RelyX Luting Plus)', when: 'Only with good retention form: prep height ≥ 4 mm and taper < 10°.' },
    ],
    products: ['Ivoclean', 'Z-Prime Plus', 'Clearfil Ceramic Primer Plus', 'RelyX Universal', 'Panavia SA Cement Universal'],
  },
  {
    id: 'metal',
    name: 'PFM / full cast gold',
    subtitle: 'Metal-ceramic and cast alloys',
    accent: 'honey',
    warnings: ['Conventional cements need adequate retention form; use resin cement for short or over-tapered preps.'],
    intaglio: [
      { text: 'Try in; adjust contacts and occlusion; polish.' },
      { text: 'Clean the intaglio: airborne-particle abrasion (50 µm Al₂O₃) or pumice slurry; rinse and dry.' },
    ],
    tooth: [
      { text: 'Clean the prep with pumice; rinse. Leave dentin moist — do not desiccate (post-op sensitivity).' },
    ],
    cements: [
      { name: 'RMGI', when: 'Default: FujiCem 2, RelyX Luting Plus.' },
      { name: 'Zinc phosphate', when: 'Long-span or highly retentive restorations; mix incrementally on a cool slab.' },
      { name: 'Self-adhesive resin cement', when: 'Short clinical crowns or compromised retention.' },
    ],
    products: ['FujiCem 2', 'RelyX Luting Plus', 'Zinc phosphate', 'RelyX Universal'],
  },
  {
    id: 'feldspathic',
    name: 'Feldspathic porcelain',
    subtitle: 'Veneers & feldspathic restorations',
    accent: 'sage',
    warnings: [
      'HF is hazardous: extraoral use only, with calcium gluconate gel available.',
      'Etched veneers are fragile until bonded: handle with a sticky-tip applicator.',
    ],
    intaglio: [
      { text: 'Try in with water-soluble try-in paste; confirm shade and fit; clean off the paste completely.' },
      { text: 'Etch with 9% (9–9.6%) hydrofluoric acid, 60–90 s per IFU.', seconds: 90, label: '9% HF etch' },
      { text: 'Rinse; remove etching precipitate (per IFU, e.g., phosphoric-acid scrub or ultrasonic bath in water); dry.' },
      { text: 'Apply silane, let react 60 s, dry with warm air.', seconds: 60, label: 'Silane' },
    ],
    tooth: [
      { text: 'Isolate (retraction cord or rubber dam); pumice.' },
      { text: 'Etch enamel with 35–37% phosphoric acid 15–30 s, rinse, dry.', seconds: 15, label: 'Enamel etch' },
      { text: 'Apply adhesive per IFU; air-thin (commonly left uncured until seating so it does not affect fit).' },
    ],
    cements: [
      { name: 'Light-cure resin cement', when: 'Default for veneers: Variolink Esthetic LC, RelyX Veneer, NX3 LC.' },
      { name: 'Dual-cure adhesive resin cement', when: 'Thicker or more opaque feldspathic restorations.' },
    ],
    products: ['Porcelain Etch 9% HF', 'Silane', 'Variolink Esthetic LC', 'RelyX Veneer'],
  },
];

/* ---------------------- Border-molding zones & PIP ---------------------- */

interface BorderZone {
  id: string;
  n: number;
  arch: 'maxillary' | 'mandibular';
  name: string;
  anatomy: string;
  movements: string[];
  source: string;
}

const BORDER_ZONES: BorderZone[] = [
  {
    id: 'mx1',
    n: 1,
    arch: 'maxillary',
    name: 'Labial flange & labial frenum',
    anatomy: 'Labial vestibule from canine to canine; the frenum notch must be relieved.',
    movements: ['Suck on finger', 'Smile', 'Gently massage the lip', 'Lift the lip out and move it side to side (frenum)'],
    source: 'Manual (frenum movement: Std ref)',
  },
  {
    id: 'mx2',
    n: 2,
    arch: 'maxillary',
    name: 'Buccal frenum',
    anatomy: 'Premolar region; frenum moves anteroposteriorly with the orbicularis and buccinator.',
    movements: ['Suck on finger', 'Smile', 'Pull the cheek out and down, then move it forward and back'],
    source: 'Manual + Std ref',
  },
  {
    id: 'mx3',
    n: 3,
    arch: 'maxillary',
    name: 'Buccal vestibule',
    anatomy: 'Molar region buccal flange, bounded by the buccinator.',
    movements: ['Suck on finger', 'Smile', 'Gently massage the cheek'],
    source: 'Manual',
  },
  {
    id: 'mx4',
    n: 4,
    arch: 'maxillary',
    name: 'Tuberosity / distobuccal (coronoid)',
    anatomy: 'Distobuccal flange width is limited by the coronoid process; the hamular notch marks the posterior limit.',
    movements: ['Suck on finger', 'Move the jaw side to side', 'Open wide (coronoid thins the flange)'],
    source: 'Manual (open wide: Std ref)',
  },
  {
    id: 'mx5',
    n: 5,
    arch: 'maxillary',
    name: 'Posterior palatal seal',
    anatomy: 'Tray ends just beyond the vibrating line, hamular notch to hamular notch. Compound goes onto the intaglio, not the edge.',
    movements: ['Say “ah” to mark the vibrating line (Thompson stick)', 'Suck on finger', 'Swallow'],
    source: 'Manual',
  },
  {
    id: 'md1',
    n: 1,
    arch: 'mandibular',
    name: 'Labial flange & labial frenum',
    anatomy: 'Labial vestibule, mentalis activity; relieve the frenum.',
    movements: ['Gently massage the lip', 'Pull the lip out and up, move side to side (frenum)'],
    source: 'Manual (frenum movement: Std ref)',
  },
  {
    id: 'md2',
    n: 2,
    arch: 'mandibular',
    name: 'Buccal frenum',
    anatomy: 'Premolar region.',
    movements: ['Suck on finger', 'Smile', 'Pull the cheek out and up, then forward and back'],
    source: 'Manual + Std ref',
  },
  {
    id: 'md3',
    n: 3,
    arch: 'mandibular',
    name: 'Buccal shelf & masseteric notch',
    anatomy: 'Primary stress-bearing area; distobuccal corner is shaped by the masseter.',
    movements: ['Suck on finger', 'Smile', 'Open and close', 'Massage the cheek', 'Close against resistance (masseter)'],
    source: 'Manual (masseter: Std ref)',
  },
  {
    id: 'md4',
    n: 4,
    arch: 'mandibular',
    name: 'Retromolar pad',
    anatomy: 'Tray covers the pad; the posterior border is limited by the pterygomandibular raphe.',
    movements: ['Open wide (raphe)', 'Close'],
    source: 'Std ref',
  },
  {
    id: 'md5',
    n: 5,
    arch: 'mandibular',
    name: 'Retromylohyoid (distolingual)',
    anatomy: 'Distolingual flange, shaped by the superior constrictor and palatoglossus; S-curve contour.',
    movements: ['Push the tongue against the tray handle', 'Tongue to the corners of the mouth', 'Protrude the tongue', 'Swallow'],
    source: 'Manual (protrusion: Std ref)',
  },
  {
    id: 'md6',
    n: 6,
    arch: 'mandibular',
    name: 'Lingual flange — mylohyoid & lingual frenum',
    anatomy: 'Anterior and middle lingual flange; floor-of-mouth muscles and lingual frenum.',
    movements: ['Push the tongue against the tray handle', 'Lick the upper lip', 'Tongue to the corners of the mouth', 'Swallow'],
    source: 'Manual',
  },
];

interface PipProblem {
  id: string;
  arch: 'maxillary' | 'mandibular' | 'both';
  symptom: string;
  cause: string;
  fix: string[];
  zones: string[];
}

const PIP_PROBLEMS: PipProblem[] = [
  {
    id: 'smile',
    arch: 'maxillary',
    symptom: 'Dislodges when smiling or on lip/cheek movement',
    cause: 'Frenal notch too shallow or narrow, or labial/buccal flange overextended.',
    fix: [
      'Disclosing wax (≤ 2 mm) on the border; repeat the smile / cheek movements.',
      'Deepen and widen the frenal notch (rounded V) where the wax is displaced.',
      'Shorten the flange only where overextension is confirmed — overshortening loses the seal.',
    ],
    zones: ['mx1', 'mx2'],
  },
  {
    id: 'openwide',
    arch: 'maxillary',
    symptom: 'Drops when opening wide or moving the jaw sideways',
    cause: 'Distobuccal flange too thick against the coronoid process.',
    fix: ['Disclosing wax on the distobuccal flange; open wide and move side to side.', 'Thin (do not shorten) the flange where the coronoid displaces the wax.'],
    zones: ['mx4'],
  },
  {
    id: 'hamular',
    arch: 'maxillary',
    symptom: 'Sore at the hamular notch',
    cause: 'Posterior border extends past the notch onto the pterygomandibular raphe, or excessive post-dam depth there.',
    fix: ['Mark the notch with a Thompson stick and transfer to the denture.', 'Reduce length and post-dam depth at the notch only; keep the seal continuous across the palate.'],
    zones: ['mx5'],
  },
  {
    id: 'palate',
    arch: 'maxillary',
    symptom: 'Rocks on the palate / show-through at the midline',
    cause: 'Contact on the midpalatal raphe or a torus.',
    fix: ['PIP with light seating pressure on the first molars (~5 s).', 'Relieve the show-through over the raphe/torus; re-coat and repeat until even.'],
    zones: [],
  },
  {
    id: 'tongue',
    arch: 'mandibular',
    symptom: 'Lifts when the tongue moves',
    cause: 'Lingual flange overextended (lingual frenum, mylohyoid or retromylohyoid area).',
    fix: ['Disclosing wax on the lingual border; protrude the tongue, lick the upper lip, swallow.', 'Reduce where the wax is displaced; relieve the lingual frenum notch.'],
    zones: ['md5', 'md6'],
  },
  {
    id: 'mylohyoid',
    arch: 'mandibular',
    symptom: 'Excess show-through at the mylohyoid ridge',
    cause: 'Pressure on the sharp mylohyoid ridge.',
    fix: ['Leave PIP on; relieve the intaglio lightly over the ridge with an acrylic bur.', 'Re-coat the adjusted area and re-seat until the film is thin and even.'],
    zones: ['md6'],
  },
  {
    id: 'crest',
    arch: 'both',
    symptom: 'Localized sore spot / show-through on the ridge',
    cause: 'Pressure spot (bony spicule, knife-edge ridge, processing error).',
    fix: ['Relieve only the show-through spot; re-coat and repeat.', 'Do not broadly relieve primary support areas (buccal shelf, horizontal palate) unless symptomatic.', 'Massive show-through everywhere = too much pressure or dwell: clean, re-coat, repeat.'],
    zones: [],
  },
  {
    id: 'undercut',
    arch: 'both',
    symptom: 'PIP streaked off on insertion',
    cause: 'Undercut along the path of insertion (tuberosity, canine eminence, mylohyoid).',
    fix: ['Relieve the streaked area along the path of insertion; change the insertion path if possible.', 'Judge pressure only on the seated denture, not on insertion streaks.'],
    zones: [],
  },
  {
    id: 'mental',
    arch: 'mandibular',
    symptom: 'Sore or numb lip over the mental foramen',
    cause: 'Pressure on the mental nerve on a resorbed ridge.',
    fix: ['Locate the foramen by palpation/radiograph; relieve the intaglio over it.'],
    zones: ['md2'],
  },
];


/* ========================================================================== */
/* 5. DESIGN SYSTEM                                                           */
/* ========================================================================== */

/** Warm design tokens. Full literal class strings (Tailwind-visible). */
const T = {
  page: 'bg-[#FDFBF7] text-stone-900 dark:bg-stone-950 dark:text-stone-100',
  card: 'rounded-2xl border border-stone-200/80 bg-white/75 shadow-sm shadow-stone-900/[0.03] backdrop-blur-md dark:border-stone-800 dark:bg-stone-900/60 dark:shadow-none',
  cardHover:
    'transition duration-200 hover:-translate-y-0.5 hover:border-amber-300/70 hover:shadow-md hover:shadow-amber-900/[0.06] dark:hover:border-amber-500/40',
  glass: 'border border-stone-200/80 bg-[#FDFBF7]/80 backdrop-blur-md dark:border-stone-800 dark:bg-stone-950/75',
  strong: 'text-stone-900 dark:text-stone-50',
  body: 'text-stone-700 dark:text-stone-300',
  muted: 'text-stone-500 dark:text-stone-400',
  faint: 'text-stone-400 dark:text-stone-500',
  divider: 'border-stone-200/80 dark:border-stone-800',
  subtle: 'bg-stone-100/70 dark:bg-stone-800/50',
  input:
    'w-full rounded-xl border border-stone-200 bg-white/90 px-3 text-sm text-stone-900 placeholder:text-stone-400 shadow-inner shadow-stone-900/[0.02] focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/25 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-amber-500',
  btnPrimary:
    'inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-3.5 text-sm font-semibold text-amber-50 shadow-sm transition hover:bg-stone-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400 dark:disabled:bg-stone-700 dark:disabled:text-stone-400',
  btnAccent:
    'inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-3.5 text-sm font-semibold text-white shadow-sm shadow-amber-900/20 transition hover:bg-amber-500 active:scale-[0.98] dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400',
  btnGhost:
    'inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 text-sm font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 active:scale-[0.98] dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-50',
  btnOutline:
    'inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white/70 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-300 hover:bg-white active:scale-[0.98] dark:border-stone-700 dark:bg-stone-900/60 dark:text-stone-200 dark:hover:bg-stone-800',
  focus: 'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FDFBF7] dark:focus-visible:ring-offset-stone-950',
  tableHead: 'border-y border-stone-200/80 bg-stone-100/60 text-[11px] uppercase tracking-wider text-stone-500 dark:border-stone-800 dark:bg-stone-800/40 dark:text-stone-400',
  row: 'align-top transition hover:bg-amber-50/40 dark:hover:bg-stone-800/40',
  eyebrow: 'text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400',
} as const;

const RISK_STYLE: Record<RiskLevel, { card: string; dot: string; label: string }> = {
  green: {
    card: 'border-emerald-300/70 bg-emerald-50/80 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100',
    dot: 'bg-emerald-500',
    label: 'Routine',
  },
  yellow: {
    card: 'border-amber-300/80 bg-amber-50/80 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
    dot: 'bg-amber-500',
    label: 'Caution',
  },
  red: {
    card: 'border-rose-300/80 bg-rose-50/80 text-rose-950 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100',
    dot: 'bg-rose-600',
    label: 'Defer / act',
  },
};

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset', className)}>
      {children}
    </span>
  );
}

function CdtBadge({ code }: { code: string }) {
  return (
    <Badge className="bg-stone-100 font-mono text-stone-700 ring-stone-400/25 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-600/40">
      {code}
    </Badge>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded-md border border-stone-300 bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-stone-600 shadow-[0_1px_0_rgba(0,0,0,0.08)] dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300">
      {children}
    </kbd>
  );
}

function SectionCard({
  id,
  icon: Icon,
  title,
  subtitle,
  right,
  children,
  bodyClassName,
}: {
  id?: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section id={id} className={cx('scroll-mt-44', T.card)}>
      <div className={cx('flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4', T.divider)}>
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100/80 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
            <Icon className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <div>
            <h2 className={cx('text-sm font-semibold', T.strong)}>{title}</h2>
            {subtitle && <p className={cx('text-xs', T.muted)}>{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      <div className={bodyClassName ?? 'p-5'}>{children}</div>
    </section>
  );
}

function CheckpointCallout({ text }: { text: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-amber-300/80 bg-gradient-to-br from-amber-50 to-orange-50/60 p-3.5 dark:border-amber-500/30 dark:from-amber-500/10 dark:to-orange-500/5">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">Clinical Checkpoint</p>
        <p className="mt-0.5 text-sm leading-snug text-amber-950 dark:text-amber-100">{text}</p>
      </div>
    </div>
  );
}

function CautionCallout({ text, title = 'Caution' }: { text: string; title?: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-rose-200 border-l-4 border-l-rose-700 bg-rose-50/70 p-3.5 dark:border-rose-500/30 dark:border-l-rose-400 dark:bg-rose-500/10">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700 dark:text-rose-300" aria-hidden />
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">{title}</p>
        <p className="mt-0.5 text-sm leading-snug text-rose-950 dark:text-rose-100">{text}</p>
      </div>
    </div>
  );
}

function NoteCallout({ label, text }: { label: string; text: string }) {
  return (
    <div className={cx('flex gap-2.5 rounded-xl border p-3 text-sm', T.divider, T.subtle, T.body)}>
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden />
      <p>
        <span className={cx('font-semibold', T.strong)}>{label}: </span>
        {text}
      </p>
    </div>
  );
}

function Segmented<V extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
}: {
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: string; icon?: LucideIcon }[];
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl bg-stone-100 p-1 dark:bg-stone-800/70">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-lg font-medium transition',
              size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              on
                ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-950 dark:text-amber-300'
                : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100',
              T.focus,
            )}
          >
            {o.icon && <o.icon className="h-3.5 w-3.5" aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function FieldLabel({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className={cx('mb-1 block text-xs font-medium', T.muted)}>{label}</span>
      {children}
    </label>
  );
}

function ChoiceChips<V extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: string; tone?: 'neutral' | 'warn' | 'alert' }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === value;
        const tone = o.tone ?? 'neutral';
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'rounded-xl border px-3 py-1.5 text-left text-sm font-medium transition active:scale-[0.98]',
              on
                ? tone === 'alert'
                  ? 'border-rose-700 bg-rose-800 text-white dark:border-rose-400 dark:bg-rose-400 dark:text-stone-950'
                  : tone === 'warn'
                    ? 'border-amber-600 bg-amber-600 text-white dark:border-amber-400 dark:bg-amber-400 dark:text-stone-950'
                    : 'border-stone-900 bg-stone-900 text-amber-50 dark:border-amber-400 dark:bg-amber-400 dark:text-stone-950'
                : 'border-stone-200 bg-white/70 text-stone-700 hover:border-stone-300 hover:bg-white dark:border-stone-700 dark:bg-stone-900/60 dark:text-stone-300 dark:hover:bg-stone-800',
              T.focus,
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx('flex w-full items-start gap-3 rounded-xl p-2 text-left transition hover:bg-stone-100/70 dark:hover:bg-stone-800/50', T.focus)}
    >
      <span
        className={cx(
          'relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition',
          checked ? 'bg-amber-600 dark:bg-amber-500' : 'bg-stone-300 dark:bg-stone-700',
        )}
      >
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
      <span>
        <span className={cx('block text-sm font-medium', T.strong)}>{label}</span>
        {description && <span className={cx('block text-xs', T.muted)}>{description}</span>}
      </span>
    </button>
  );
}

function Meter({ value, label, detail }: { value: number; label: string; detail: string }) {
  const pct = Math.max(0, Math.min(1, value));
  const color = value >= 1 ? 'bg-rose-600' : value >= 0.8 ? 'bg-amber-500' : 'bg-emerald-600';
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className={cx('text-xs font-semibold uppercase tracking-wider', T.muted)}>{label}</span>
        <span className={cx('font-mono text-sm tabular-nums', T.strong)}>{detail}</span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct * 100)}
      >
        <div className={cx('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}

function CopyButton({ text, label = 'Copy', className }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'err'>('idle');
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyToClipboard(text);
        setState(ok ? 'ok' : 'err');
        window.setTimeout(() => setState('idle'), 1800);
      }}
      className={cx(T.btnGhost, 'h-8 text-xs', className)}
    >
      {state === 'ok' ? <ClipboardCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> : <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />}
      {state === 'ok' ? 'Copied' : state === 'err' ? 'Copy failed' : label}
    </button>
  );
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Accessible slide-over panel: focus moves in, Tab is trapped, Esc closes, focus returns. */
function Flyout({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  children,
  footer,
  width = 'max-w-2xl',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useMemo(() => `flyout-${title.replace(/\W+/g, '-').toLowerCase()}`, [title]);

  useEffect(() => {
    if (!open) return undefined;
    returnFocus.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => panelRef.current?.focus(), 30);
    return () => {
      window.clearTimeout(t);
      returnFocus.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    const el = rootRef.current as (HTMLDivElement & { inert?: boolean }) | null;
    if (el) el.inert = !open;
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div ref={rootRef} className={cx('fixed inset-0 z-50', !open && 'pointer-events-none')} aria-hidden={!open}>
      <div
        className={cx('absolute inset-0 bg-stone-950/30 backdrop-blur-[2px] transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cx(
          'absolute inset-y-0 right-0 flex w-full flex-col border-l shadow-2xl shadow-stone-950/20 outline-none transition-transform duration-300 ease-out',
          'border-stone-200 bg-[#FDFBF7] dark:border-stone-800 dark:bg-stone-950',
          width,
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className={cx('flex items-start justify-between gap-3 border-b px-5 py-4', T.divider)}>
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-700 text-white shadow-sm shadow-orange-900/20">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 id={titleId} className={cx('text-base font-semibold', T.strong)}>
                {title}
              </h2>
              {subtitle && <p className={cx('text-xs', T.muted)}>{subtitle}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} className={cx(T.btnGhost, 'h-9 w-9 !px-0', T.focus)} aria-label={`Close ${title}`}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className={cx('border-t px-5 py-3.5', T.divider)}>{footer}</div>}
      </div>
    </div>
  );
}

/* ========================================================================== */
/* 6. SVG DIAGRAMS                                                            */
/* ========================================================================== */

function Callout({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={9} className="fill-amber-500 stroke-white dark:stroke-stone-900" strokeWidth={2} />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className="fill-white dark:fill-stone-900 text-[10px] font-bold">
        {n}
      </text>
    </g>
  );
}

function SvgLabel({ x, y, children, anchor = 'start' }: { x: number; y: number; children: string; anchor?: 'start' | 'middle' | 'end' }) {
  return (
    <text x={x} y={y} textAnchor={anchor} className="fill-stone-500 dark:fill-stone-400 text-[10px] font-medium uppercase tracking-wide">
      {children}
    </text>
  );
}

function ClassIISectionSvg() {
  return (
    <svg viewBox="0 0 480 330" className="h-auto w-full" role="img" aria-label="Mesiodistal section of a Class II MO composite preparation">
      <rect width="480" height="330" className="fill-white dark:fill-stone-900" />
      <rect x="0" y="250" width="480" height="80" className="fill-rose-50 dark:fill-rose-950/40" />
      <path d="M0 250 H480" className="stroke-rose-300" strokeDasharray="4 4" />
      {/* adjacent tooth */}
      <path d="M480 78 C452 84 432 104 424 136 C416 176 418 222 428 262 L436 330 L480 330 Z" className="fill-stone-100 dark:fill-stone-800/70 stroke-stone-400 dark:stroke-stone-500" strokeWidth={1.5} />
      {/* prepared tooth */}
      <path
        d="M92 262 C68 200 68 120 110 80 Q145 92 180 96 Q210 86 240 86 Q270 86 300 96 Q335 92 370 80 C412 120 414 200 390 262 L372 322 L330 322 L302 276 L180 276 L152 322 L110 322 Z"
        className="fill-stone-50 dark:fill-stone-800 stroke-stone-500 dark:stroke-stone-400"
        strokeWidth={1.5}
      />
      <path
        d="M106 258 C88 200 90 132 120 100 Q150 110 180 114 Q210 106 240 106 Q270 106 300 114 Q330 110 360 100 C394 132 396 200 376 258"
        className="fill-none stroke-stone-400 dark:stroke-stone-500"
        strokeDasharray="5 4"
      />
      <path d="M186 248 L186 198 Q188 170 204 166 L210 152 L218 166 L262 166 L272 148 L280 166 Q298 170 300 198 L300 248 Z" className="fill-rose-100 dark:fill-rose-900/40 stroke-rose-300" />
      {/* preparation void */}
      <path
        d="M190 94 L194 124 Q195 130 201 130 L332 130 Q338 130 338 136 L338 208 Q338 214 344 214 L404 214 C409 175 401 110 370 80 Q335 92 300 96 Q270 86 240 86 Q214 86 190 94 Z"
        className="fill-white dark:fill-stone-900"
      />
      <path
        d="M190 94 L194 124 Q195 130 201 130 L332 130 Q338 130 338 136 L338 208 Q338 214 344 214 L404 214"
        className="fill-none stroke-emerald-600"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <SvgLabel x={112} y={196}>DEJ</SvgLabel>
      <SvgLabel x={243} y={214} anchor="middle">Pulp</SvgLabel>
      <SvgLabel x={454} y={180} anchor="middle">Adj.</SvgLabel>
      <SvgLabel x={8} y={244}>Gingival crest</SvgLabel>
      <SvgLabel x={8} y={20}>Mesiodistal section · MO</SvgLabel>
      <Callout x={232} y={112} n={1} />
      <Callout x={356} y={172} n={2} />
      <Callout x={372} y={230} n={3} />
      <Callout x={324} y={146} n={4} />
      <Callout x={180} y={78} n={5} />
      <Callout x={292} y={140} n={6} />
    </svg>
  );
}

function SectionalMatrixSvg() {
  return (
    <svg viewBox="0 0 480 260" className="h-auto w-full" role="img" aria-label="Occlusal view of sectional matrix, wedge and ring assembly">
      <rect width="480" height="260" className="fill-white dark:fill-stone-900" />
      <SvgLabel x={240} y={16} anchor="middle">Buccal</SvgLabel>
      <SvgLabel x={240} y={256} anchor="middle">Lingual</SvgLabel>
      <ellipse cx={150} cy={130} rx={78} ry={66} className="fill-stone-100 dark:fill-stone-800/70 stroke-stone-400 dark:stroke-stone-500" strokeWidth={1.5} />
      <rect x={252} y={46} width={176} height={168} rx={52} className="fill-stone-50 dark:fill-stone-800 stroke-stone-500 dark:stroke-stone-400" strokeWidth={1.5} />
      <path
        d="M252 104 L308 104 Q318 104 326 112 L372 118 Q386 130 372 142 L326 148 Q318 156 308 156 L252 156 Z"
        className="fill-emerald-50 dark:fill-emerald-900/30 stroke-emerald-600"
        strokeWidth={2}
      />
      <SvgLabel x={300} y={134} anchor="middle">MO prep</SvgLabel>
      <SvgLabel x={196} y={134} anchor="middle">Adjacent</SvgLabel>
      {/* sectional band */}
      <path d="M266 58 C240 86 240 174 266 202" className="fill-none stroke-stone-800 dark:stroke-stone-200" strokeWidth={3} strokeLinecap="round" />
      {/* wedge from lingual */}
      <path d="M226 252 L254 252 L240 172 Z" className="fill-teal-300 dark:fill-teal-700 stroke-teal-700 dark:stroke-teal-400" strokeWidth={1.5} />
      {/* separating ring */}
      <path d="M237 56 C120 -18 120 278 237 204" className="fill-none stroke-stone-500 dark:stroke-stone-400" strokeWidth={6} strokeLinecap="round" opacity={0.85} />
      <circle cx={237} cy={56} r={7} className="fill-stone-600 dark:fill-stone-300" />
      <circle cx={237} cy={204} r={7} className="fill-stone-600 dark:fill-stone-300" />
      <Callout x={260} y={82} n={1} />
      <Callout x={266} y={232} n={2} />
      <Callout x={168} y={40} n={3} />
      <Callout x={222} y={150} n={4} />
    </svg>
  );
}

function CrownSectionSvg() {
  return (
    <svg viewBox="0 0 480 340" className="h-auto w-full" role="img" aria-label="Buccolingual section of a molar prepared for a lithium disilicate crown">
      <rect width="480" height="340" className="fill-white dark:fill-stone-900" />
      <rect x="0" y="262" width="480" height="78" className="fill-rose-50 dark:fill-rose-950/40" />
      <path d="M0 262 H480" className="stroke-rose-300" strokeDasharray="4 4" />
      {/* original contour */}
      <path
        d="M110 272 C86 210 84 140 112 100 L150 68 Q178 90 205 98 L240 102 L275 98 Q302 90 330 68 L368 100 C396 140 394 210 370 272"
        className="fill-none stroke-stone-400 dark:stroke-stone-500"
        strokeDasharray="6 4"
        strokeWidth={1.5}
      />
      {/* prepared tooth */}
      <path
        d="M110 272 L128 272 Q134 272 134 266 L144 146 Q146 120 172 106 Q205 122 240 124 Q275 122 306 108 L334 140 L344 266 Q344 272 350 272 L370 272 L362 322 L318 322 L300 290 L180 290 L162 322 L118 322 Z"
        className="fill-stone-100 dark:fill-stone-800/70 stroke-stone-600 dark:stroke-stone-300"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path
        d="M110 272 L128 272 Q134 272 134 266 M344 266 Q344 272 350 272 L370 272"
        className="fill-none stroke-emerald-600"
        strokeWidth={3}
      />
      <path d="M192 262 L192 202 Q194 180 210 176 L216 164 L224 176 L256 176 L264 164 L270 176 Q286 180 288 202 L288 262 Z" className="fill-rose-100 dark:fill-rose-900/40 stroke-rose-300" />
      {/* taper reference */}
      <path d="M134 266 V140" className="stroke-teal-500" strokeDasharray="2 3" />
      {/* axial height bracket */}
      <path d="M384 140 H392 V268 H384" className="fill-none stroke-stone-500 dark:stroke-stone-400" strokeWidth={1.5} />
      <SvgLabel x={8} y={20}>Buccolingual section · maxillary molar</SvgLabel>
      <SvgLabel x={8} y={330}>Buccal</SvgLabel>
      <SvgLabel x={472} y={330} anchor="end">Palatal (functional)</SvgLabel>
      <SvgLabel x={240} y={222} anchor="middle">Pulp</SvgLabel>
      <Callout x={240} y={112} n={1} />
      <Callout x={340} y={110} n={2} />
      <Callout x={110} y={196} n={3} />
      <Callout x={120} y={288} n={4} />
      <Callout x={364} y={186} n={5} />
      <Callout x={168} y={130} n={6} />
      <Callout x={406} y={206} n={7} />
    </svg>
  );
}

function TwoCordSvg() {
  return (
    <svg viewBox="0 0 480 260" className="h-auto w-full" role="img" aria-label="Two-cord gingival retraction at the finish line">
      <rect width="480" height="260" className="fill-white dark:fill-stone-900" />
      <path d="M40 10 L200 10 L200 146 Q200 152 206 152 L220 152 L220 260 L40 260 Z" className="fill-stone-50 dark:fill-stone-800 stroke-stone-500 dark:stroke-stone-400" strokeWidth={1.5} />
      <path d="M200 138 Q200 152 212 152 L220 152" className="fill-none stroke-emerald-600" strokeWidth={3} />
      <path d="M240 96 Q250 86 272 88 L480 88 L480 260 L222 260 L222 214 Q240 206 240 186 Z" className="fill-rose-100 dark:fill-rose-900/40 stroke-rose-300" strokeWidth={1.5} />
      <circle cx={229} cy={200} r={4} className="fill-stone-800 dark:fill-stone-200" />
      <circle cx={230} cy={180} r={8} className="fill-teal-300 dark:fill-teal-700 stroke-teal-700 dark:stroke-teal-300" strokeWidth={1.5} />
      <SvgLabel x={120} y={80} anchor="middle">Prepared axial wall</SvgLabel>
      <SvgLabel x={130} y={222} anchor="middle">Unprepared root</SvgLabel>
      <SvgLabel x={352} y={78} anchor="middle">Free gingival margin</SvgLabel>
      <SvgLabel x={360} y={180} anchor="middle">Gingiva</SvgLabel>
      <Callout x={206} y={214} n={1} />
      <Callout x={258} y={170} n={2} />
      <Callout x={184} y={152} n={3} />
      <Callout x={230} y={126} n={4} />
    </svg>
  );
}

/** Zone stroke used on the border-molding maps (color keyed in each legend). */
function ZoneStroke({ d, className }: { d: string; className: string }) {
  return <path d={d} className={cx('fill-none', className)} strokeWidth={7} strokeLinecap="round" opacity={0.85} />;
}

function FrenumMark({ x, y }: { x: number; y: number }) {
  return <circle cx={x} cy={y} r={4.5} className="fill-white dark:fill-stone-900 stroke-rose-500" strokeWidth={2} />;
}

function MaxBorderSvg() {
  const labial = 'M104 70 C140 28 220 28 256 70';
  const buccalL = 'M60 220 C62 160 74 108 104 70';
  const buccalR = 'M256 70 C286 108 298 160 300 220';
  const tubL = 'M70 290 C62 265 58 245 60 220';
  const tubR = 'M300 220 C302 245 298 265 290 290';
  const pps = 'M290 290 Q180 314 70 290';
  return (
    <svg viewBox="0 0 360 330" className="h-auto w-full" role="img" aria-label="Maxillary custom tray border-molding zones, intaglio view">
      <rect width="360" height="330" className="fill-white dark:fill-stone-900" />
      <SvgLabel x={180} y={14} anchor="middle">Anterior</SvgLabel>
      <path
        d="M70 290 C62 265 58 245 60 220 C62 160 74 108 104 70 C140 28 220 28 256 70 C286 108 298 160 300 220 C302 245 298 265 290 290 Q180 314 70 290 Z"
        className="fill-stone-100 dark:fill-stone-800/70 stroke-stone-400 dark:stroke-stone-500"
        strokeWidth={1.5}
      />
      {/* ridge crest */}
      <path d="M100 282 C92 230 92 170 112 125 C130 90 150 72 180 70 C210 72 230 90 248 125 C268 170 268 230 260 282" className="fill-none stroke-stone-400 dark:stroke-stone-500" strokeDasharray="5 4" />
      <SvgLabel x={180} y={210} anchor="middle">Palate</SvgLabel>
      <ZoneStroke d={labial} className="stroke-teal-600" />
      <ZoneStroke d={buccalL} className="stroke-emerald-500" />
      <ZoneStroke d={buccalR} className="stroke-emerald-500" />
      <ZoneStroke d={tubL} className="stroke-amber-500" />
      <ZoneStroke d={tubR} className="stroke-amber-500" />
      <ZoneStroke d={pps} className="stroke-rose-400" />
      {/* frena and hamular notches */}
      <FrenumMark x={180} y={38} />
      <FrenumMark x={80} y={128} />
      <FrenumMark x={280} y={128} />
      <circle cx={70} cy={290} r={3.5} className="fill-stone-700 dark:fill-stone-300" />
      <circle cx={290} cy={290} r={3.5} className="fill-stone-700 dark:fill-stone-300" />
      {/* relief hole */}
      <circle cx={180} cy={128} r={5} className="fill-white dark:fill-stone-900 stroke-stone-700 dark:stroke-stone-300" strokeWidth={1.5} />
      <SvgLabel x={180} y={112} anchor="middle">Rugae</SvgLabel>
      <Callout x={210} y={20} n={1} />
      <Callout x={40} y={150} n={2} />
      <Callout x={40} y={262} n={3} />
      <Callout x={180} y={320} n={4} />
      <Callout x={200} y={138} n={5} />
      <Callout x={120} y={40} n={6} />
    </svg>
  );
}

function MandBorderSvg() {
  const labial = 'M90 95 C120 55 150 42 180 42 C210 42 240 55 270 95';
  const buccalL = 'M66 285 C50 220 52 150 90 95';
  const buccalR = 'M270 95 C308 150 310 220 294 285';
  const lingualAnt = 'M215 135 C200 115 190 110 180 110 C170 110 160 115 145 135 C120 170 114 205 110 230';
  const lingualAntR = 'M250 230 C246 205 240 170 215 135';
  const rmhL = 'M110 230 C107 255 105 275 104 290';
  const rmhR = 'M256 290 C255 275 253 255 250 230';
  return (
    <svg viewBox="0 0 360 330" className="h-auto w-full" role="img" aria-label="Mandibular custom tray border-molding zones, intaglio view">
      <rect width="360" height="330" className="fill-white dark:fill-stone-900" />
      <SvgLabel x={180} y={14} anchor="middle">Anterior</SvgLabel>
      <path
        d="M66 285 C50 220 52 150 90 95 C120 55 150 42 180 42 C210 42 240 55 270 95 C308 150 310 220 294 285 C300 300 290 312 276 312 C262 312 256 302 256 290 C255 275 253 255 250 230 C246 205 240 170 215 135 C200 115 190 110 180 110 C170 110 160 115 145 135 C120 170 114 205 110 230 C107 255 105 275 104 290 C104 302 98 312 84 312 C70 312 60 300 66 285 Z"
        className="fill-stone-100 dark:fill-stone-800/70 stroke-stone-400 dark:stroke-stone-500"
        strokeWidth={1.5}
      />
      {/* retromolar pads */}
      <ellipse cx={82} cy={294} rx={16} ry={13} className="fill-rose-100 dark:fill-rose-900/40 stroke-rose-300" strokeDasharray="3 3" />
      <ellipse cx={278} cy={294} rx={16} ry={13} className="fill-rose-100 dark:fill-rose-900/40 stroke-rose-300" strokeDasharray="3 3" />
      {/* ridge crest */}
      <path d="M86 286 C80 230 80 170 108 118 C130 84 155 74 180 74 C205 74 230 84 252 118 C280 170 280 230 274 286" className="fill-none stroke-stone-400 dark:stroke-stone-500" strokeDasharray="5 4" />
      <SvgLabel x={180} y={200} anchor="middle">Tongue space</SvgLabel>
      <ZoneStroke d={labial} className="stroke-teal-600" />
      <ZoneStroke d={buccalL} className="stroke-emerald-500" />
      <ZoneStroke d={buccalR} className="stroke-emerald-500" />
      <ZoneStroke d={lingualAnt} className="stroke-amber-500" />
      <ZoneStroke d={lingualAntR} className="stroke-amber-500" />
      <ZoneStroke d={rmhL} className="stroke-orange-600" />
      <ZoneStroke d={rmhR} className="stroke-orange-600" />
      <FrenumMark x={180} y={42} />
      <FrenumMark x={70} y={140} />
      <FrenumMark x={290} y={140} />
      <FrenumMark x={180} y={110} />
      <Callout x={216} y={28} n={1} />
      <Callout x={34} y={200} n={2} />
      <Callout x={180} y={134} n={3} />
      <Callout x={130} y={262} n={4} />
      <Callout x={82} y={322} n={5} />
      <Callout x={140} y={36} n={6} />
    </svg>
  );
}

const DIAGRAMS: Record<DiagramKey, { title: string; caption: string; legend: string[]; Render: () => React.ReactElement }> = {
  'classII-section': {
    title: 'Class II box — mesiodistal section',
    caption: 'Emerald line = prepared walls. Dashed = DEJ.',
    Render: ClassIISectionSvg,
    legend: [
      'Pulpal floor 1.5–2.0 mm deep (≈0.2–0.5 mm into dentin); flat, follows occlusal contour.',
      'Axial wall ≈0.5 mm pulpal to DEJ; convex, parallel to the external proximal contour.',
      'Gingival floor flat, ≈1.0 mm M-D, ≈0.5 mm clearance from the adjacent tooth; in enamel where possible.',
      'Rounded axiopulpal / internal line angles (inherent #330 / #245 geometry).',
      '90° cavosurface (butt joint); no occlusal bevel on posterior composite.',
      'Mesial pulp horn — estimate RDT; < 0.5 mm → hydraulic calcium silicate liner.',
    ],
  },
  'sectional-matrix': {
    title: 'Sectional matrix assembly — occlusal view',
    caption: 'Composi-Tight 3D Fusion band, wedge and ring on an MO preparation.',
    Render: SectionalMatrixSvg,
    legend: [
      'Sectional band (4.5 / 5.5 / 6.5 mm) extending apical to the gingival floor.',
      'Fusion wedge from the wider (usually lingual) embrasure — seals the gingival margin and pre-separates.',
      'Fusion ring seated over the wedge; tines in B/L embrasures separate teeth to offset band thickness.',
      'Burnish the band to the adjacent contact with a ball burnisher for anatomic contact form.',
    ],
  },
  'crown-section': {
    title: 'e.max crown prep — buccolingual section',
    caption: 'Dashed = original contour. Emerald = 1.0 mm rounded shoulder. Blue dotted = vertical reference.',
    Render: CrownSectionSvg,
    legend: [
      'Occlusal reduction 1.5 mm non-functional / 2.0 mm functional (1.0 mm absolute minimum, adhesive cementation).',
      'Functional cusp bevel ≈45°, 1.5–2.0 mm clearance in excursions.',
      'Axial reduction 1.2–1.5 mm, uniform, no undercuts.',
      'Margin 1.0 mm rounded shoulder / heavy chamfer — no bevel, lip or knife edge.',
      'Total occlusal convergence 10–12° (≈5–6° per wall).',
      'All internal line angles rounded (ceramic stress risers).',
      'Axial wall height ≥4 mm (molar), ≥3 mm (premolar).',
    ],
  },
  'two-cord': {
    title: 'Two-cord retraction at the finish line',
    caption: 'Vertical section through the sulcus.',
    Render: TwoCordSvg,
    legend: [
      '#000 Ultrapak packed first at the sulcus base — stays in during the impression.',
      '#1 Ultrapak saturated in ViscoStat Clear — lateral displacement; removed moist just before light-body injection.',
      'Finish line (emerald) must be visible 360° before impressing or scanning.',
      'Light-body PVS must flow apical to the finish line to capture emergence profile.',
    ],
  },
  'max-border': {
    title: 'Maxillary tray — border-molding zones',
    caption: 'Intaglio view, anterior at top. Colored bands = zones; open rose circles = frena to relieve.',
    Render: MaxBorderSvg,
    legend: [
      'Labial vestibule (teal): suck on finger; smile; gently massage lip.',
      'Buccal vestibule (emerald): suck on finger; smile; gently massage cheek.',
      'Tuberosity / distobuccal — coronoid (amber): suck on finger; move jaw side to side.',
      'Posterior palatal seal (rose): tray ends just beyond the vibrating line; compound onto the intaglio, not the edge; suck on finger; swallow. Dark dots = hamular notches.',
      'Relief hole: #8 round bur, midline rugae area.',
      'Frena relieved so lip and cheek pulls do not move the tray; borders 2–3 mm short of the vestibule; compound trimmed to 3–4 mm wide.',
    ],
  },
  'mand-border': {
    title: 'Mandibular tray — border-molding zones',
    caption: 'Intaglio view, anterior at top. Colored bands = zones; open rose circles = frena to relieve.',
    Render: MandBorderSvg,
    legend: [
      'Labial vestibule (teal): gently massage lip.',
      'Buccal vestibule / buccal shelf (emerald): suck on finger; smile; open & close; massage cheek.',
      'Lingual flange (amber): push tongue against handle; tongue to corners of mouth; lick upper lip; swallow.',
      'Retromylohyoid, distolingual (orange): same lingual movements; captures the distolingual flange contour.',
      'Retromolar pad (rose, dashed): covered by the tray; mandibular rim later set to ⅔ pad height.',
      'Frena relieved (labial, buccal, lingual); borders 2–3 mm short of the vestibule; compound trimmed to 3–4 mm wide.',
    ],
  },
};


/* ========================================================================== */
/* 7. WORKBENCH TOOLS                                                         */
/* ========================================================================== */

/* ------------------------------ Odontogram ------------------------------ */

const TOOTH_WEIGHT: Record<ToothType, number> = { molar: 1.32, premolar: 0.96, canine: 0.96, lateral: 0.8, central: 0.96 };
const TOOTH_SIZE: Record<ToothType, [number, number]> = {
  molar: [40, 38],
  premolar: [30, 34],
  canine: [27, 38],
  lateral: [23, 33],
  central: [27, 35],
};

function archLayout(ids: string[], upper: boolean, cxp: number, cyp: number, rx: number, ry: number, scale: number) {
  const infos = ids.map((id) => toothInfo(id)).filter((t): t is ToothInfo => t !== null);
  const weights = infos.map((t) => TOOTH_WEIGHT[t.type]);
  const total = weights.reduce((a, b) => a + b, 0);
  const span = 166;
  const startDeg = 180 - (180 - span) / 2;
  let acc = 0;
  return infos.map((t, i) => {
    const mid = acc + weights[i] / 2;
    acc += weights[i];
    const deg = startDeg - (span * mid) / total;
    const th = (deg * Math.PI) / 180;
    const x = cxp + rx * Math.cos(th);
    const y = upper ? cyp - ry * Math.sin(th) : cyp + ry * Math.sin(th);
    const [w, h] = TOOTH_SIZE[t.type];
    return { t, x, y, rot: upper ? 90 - deg : deg - 90, w: w * scale, h: h * scale };
  });
}

function OdontogramArch({ dentition, selected, onSelect }: { dentition: Dentition; selected: string | null; onSelect: (id: string) => void }) {
  const adult = dentition === 'adult';
  const upper = archLayout(adult ? ADULT_UPPER : PRIMARY_UPPER, true, 320, 205, adult ? 262 : 196, adult ? 158 : 122, adult ? 1 : 1.1);
  const lower = archLayout(adult ? ADULT_LOWER : PRIMARY_LOWER, false, 320, 235, adult ? 262 : 196, adult ? 158 : 122, adult ? 1 : 1.1);
  const renderTooth = ({ t, x, y, rot, w, h }: ReturnType<typeof archLayout>[number]) => {
    const on = selected === t.id;
    const select = () => onSelect(t.id);
    return (
      <g
        key={t.id}
        role="button"
        tabIndex={0}
        aria-pressed={on}
        aria-label={`Tooth ${t.id}, ${t.name}`}
        onClick={select}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            select();
          }
        }}
        className="group cursor-pointer outline-none"
        transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
      >
        <rect
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          rx={t.type === 'molar' ? 11 : 9}
          transform={`rotate(${rot.toFixed(1)})`}
          className={cx(
            'transition-colors duration-150',
            on
              ? 'fill-amber-500 stroke-amber-700 dark:fill-amber-400 dark:stroke-amber-200'
              : 'fill-white stroke-stone-300 group-hover:fill-amber-100 group-hover:stroke-amber-400 group-focus-visible:stroke-amber-600 dark:fill-stone-800 dark:stroke-stone-600 dark:group-hover:fill-amber-500/20',
          )}
          strokeWidth={on ? 2.5 : 1.5}
        />
        {t.type === 'molar' && !on && (
          <path d="M-6 -3 L0 3 L6 -3" transform={`rotate(${rot.toFixed(1)})`} className="fill-none stroke-stone-200 dark:stroke-stone-700" strokeWidth={1.2} />
        )}
        <text
          textAnchor="middle"
          dominantBaseline="central"
          className={cx('pointer-events-none select-none text-[11px] font-bold tabular-nums', on ? 'fill-white dark:fill-stone-950' : 'fill-stone-600 dark:fill-stone-300')}
        >
          {t.id}
        </text>
      </g>
    );
  };
  return (
    <svg viewBox="0 0 640 440" className="h-auto w-full" role="group" aria-label={`${adult ? 'Permanent' : 'Primary'} dentition chart`}>
      <text x={320} y={150} textAnchor="middle" className="fill-stone-400 text-[11px] font-semibold uppercase tracking-[0.2em] dark:fill-stone-500">
        Maxillary
      </text>
      <text x={320} y={300} textAnchor="middle" className="fill-stone-400 text-[11px] font-semibold uppercase tracking-[0.2em] dark:fill-stone-500">
        Mandibular
      </text>
      <line x1={70} y1={220} x2={570} y2={220} className="stroke-stone-200 dark:stroke-stone-800" strokeDasharray="4 6" />
      <text x={24} y={224} className="fill-stone-400 text-[10px] font-medium uppercase tracking-wider dark:fill-stone-500">
        Pt right
      </text>
      <text x={616} y={224} textAnchor="end" className="fill-stone-400 text-[10px] font-medium uppercase tracking-wider dark:fill-stone-500">
        Pt left
      </text>
      {upper.map(renderTooth)}
      {lower.map(renderTooth)}
    </svg>
  );
}

function OdontogramPanel({
  procedures,
  tooth,
  onTooth,
  filterOn,
  onFilter,
  onOpenProcedure,
}: {
  procedures: Procedure[];
  tooth: ToothInfo | null;
  onTooth: (id: string | null) => void;
  filterOn: boolean;
  onFilter: (v: boolean) => void;
  onOpenProcedure: (id: string) => void;
}) {
  const [dentition, setDentition] = useState<Dentition>(tooth?.primary ? 'primary' : 'adult');
  useEffect(() => {
    if (tooth) setDentition(tooth.primary ? 'primary' : 'adult');
  }, [tooth]);
  const matches = tooth ? procedures.filter((p) => appliesToTooth(p.id, tooth)) : [];
  const la = tooth ? anesthesiaFor(tooth) : null;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Dentition"
          value={dentition}
          onChange={setDentition}
          options={[
            { value: 'adult', label: 'Permanent 1–32' },
            { value: 'primary', label: 'Primary A–T' },
          ]}
        />
        {tooth && (
          <button type="button" onClick={() => onTooth(null)} className={cx(T.btnOutline, 'h-9', T.focus)}>
            <X className="h-4 w-4" aria-hidden />
            Clear #{tooth.id}
          </button>
        )}
      </div>

      <div className={cx(T.card, 'p-2 sm:p-4')}>
        <OdontogramArch dentition={dentition} selected={tooth?.id ?? null} onSelect={(id) => onTooth(id)} />
      </div>

      {!tooth ? (
        <p className={cx('rounded-xl border border-dashed p-4 text-center text-sm', T.divider, T.muted)}>
          Select a tooth to set it across the workbench: SOAP notes, anesthesia guidance, endo codes and the procedure library.
        </p>
      ) : (
        <>
          <div className={cx(T.card, 'p-4')}>
            <p className={T.eyebrow}>Active tooth</p>
            <p className={cx('mt-1 text-2xl font-semibold tracking-tight', T.strong)}>
              #{tooth.id} <span className={cx('text-base font-medium', T.muted)}>{tooth.name}</span>
            </p>
            <div className="mt-3">
              <Toggle checked={filterOn} onChange={onFilter} label="Filter the procedure library to this tooth" description={`${matches.length} tooth-specific procedures`} />
            </div>
          </div>

          {la && (
            <div className={cx(T.card, 'p-4')}>
              <div className="flex items-center gap-2">
                <Syringe className="h-4 w-4 text-amber-700 dark:text-amber-300" aria-hidden />
                <h3 className={cx('text-sm font-semibold', T.strong)}>Suggested anesthesia</h3>
              </div>
              <dl className="mt-3 space-y-2.5 text-sm">
                <div>
                  <dt className={cx('text-xs font-semibold uppercase tracking-wider', T.muted)}>Primary</dt>
                  <dd className={T.body}>{la.primary}</dd>
                </div>
                <div>
                  <dt className={cx('text-xs font-semibold uppercase tracking-wider', T.muted)}>{tooth.arch === 'maxillary' ? 'Palatal' : 'Lingual'}</dt>
                  <dd className={T.body}>{la.palatalOrLingual}</dd>
                </div>
              </dl>
              {la.notes.length > 0 && (
                <ul className={cx('mt-3 space-y-1 text-xs', T.muted)}>
                  {la.notes.map((n) => (
                    <li key={n} className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" aria-hidden />
                      {n}
                    </li>
                  ))}
                </ul>
              )}
              <p className={cx('mt-3 rounded-lg px-2.5 py-1.5 font-mono text-xs', T.subtle, T.body)}>SOAP: {la.soap}</p>
            </div>
          )}

          <div className={cx(T.card, 'p-4')}>
            <h3 className={cx('text-sm font-semibold', T.strong)}>Procedures for #{tooth.id}</h3>
            {matches.length === 0 ? (
              <p className={cx('mt-2 text-sm', T.muted)}>No tooth-specific procedures for this tooth type.</p>
            ) : (
              <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {matches.map((p) => {
                  const cat = CATEGORY_BY_ID[p.category];
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => onOpenProcedure(p.id)}
                        className={cx('flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition hover:bg-amber-50 dark:hover:bg-stone-800', T.focus)}
                      >
                        <span className={cx('h-2 w-2 shrink-0 rounded-full', ACCENT[cat.accent].dot)} aria-hidden />
                        <span className={cx('flex-1 truncate', T.body)}>{p.shortTitle}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------- LA dose calculator --------------------------- */

function LADoseCalculator({ defaultPopulation = 'adult', compact = false }: { defaultPopulation?: 'adult' | 'pediatric'; compact?: boolean }) {
  const [weightText, setWeightText] = useState('');
  const [unit, setUnit] = useState<'kg' | 'lb'>(defaultPopulation === 'pediatric' ? 'kg' : 'lb');
  const [population, setPopulation] = useState<'adult' | 'pediatric'>(defaultPopulation);
  const [health, setHealth] = useState<'healthy' | 'cardiac'>('healthy');
  const [cartridgeMl, setCartridgeMl] = useState<'1.7' | '1.8'>('1.8');
  const [log, setLog] = useState<DoseLogEntry[]>([]);
  const [addAgent, setAddAgent] = useState(LA_DOSING[0].id);
  const [addCarps, setAddCarps] = useState(1);

  const raw = Number.parseFloat(weightText);
  const weightKg = Number.isFinite(raw) && raw > 0 ? (unit === 'kg' ? raw : raw / LB_PER_KG) : null;
  const valid = weightKg !== null && weightKg <= 250;
  const input: DoseInput | null = valid ? { weightKg: weightKg as number, population, health, cartridgeMl: Number(cartridgeMl) } : null;
  const tally = input ? tallyDoses(log, input) : null;

  const addEntry = () => {
    if (addCarps <= 0) return;
    setLog((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, agentId: addAgent, carpules: addCarps }]);
  };

  return (
    <div className="space-y-5">
      <div className={cx('grid gap-4', compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2')}>
        <FieldLabel label="Patient weight">
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.5}
              value={weightText}
              onChange={(e) => setWeightText(e.target.value)}
              placeholder={unit}
              aria-label={`Weight in ${unit}`}
              className={cx(T.input, 'h-11 text-lg font-semibold tabular-nums')}
            />
            <Segmented
              label="Weight unit"
              value={unit}
              onChange={setUnit}
              options={[
                { value: 'lb', label: 'lb' },
                { value: 'kg', label: 'kg' },
              ]}
            />
          </div>
          {weightKg !== null && (
            <span className={cx('mt-1 block text-xs tabular-nums', T.muted)}>
              = {weightKg.toFixed(1)} kg · {(weightKg * LB_PER_KG).toFixed(0)} lb
            </span>
          )}
        </FieldLabel>
        <div className="space-y-3">
          <FieldLabel label="Population">
            <Segmented
              label="Population"
              value={population}
              onChange={setPopulation}
              options={[
                { value: 'adult', label: 'Adult' },
                { value: 'pediatric', label: 'Pediatric', icon: Baby },
              ]}
            />
          </FieldLabel>
          <FieldLabel label="Health status (epinephrine ceiling)">
            <Segmented
              label="Health status"
              value={health}
              onChange={setHealth}
              options={[
                { value: 'healthy', label: 'Healthy · 0.2 mg' },
                { value: 'cardiac', label: 'Cardiac risk · 0.04 mg', icon: HeartPulse },
              ]}
            />
          </FieldLabel>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className={cx('text-xs font-medium', T.muted)}>Cartridge volume</span>
        <Segmented
          size="sm"
          label="Cartridge volume"
          value={cartridgeMl}
          onChange={setCartridgeMl}
          options={[
            { value: '1.8', label: '1.8 mL (conservative)' },
            { value: '1.7', label: '1.7 mL (US)' },
          ]}
        />
      </div>

      {!input ? (
        <p className={cx('rounded-xl border border-dashed p-4 text-center text-sm', T.divider, T.muted)}>
          {weightText ? 'Enter a weight between 0 and 250 kg (550 lb).' : 'Enter the patient’s weight to calculate maximum doses.'}
        </p>
      ) : (
        <>
          <div className="-mx-5 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className={T.tableHead}>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Agent</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">mg/kg · cap</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Max mg</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Max carpules</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200/70 dark:divide-stone-800">
                {LA_DOSING.map((agent) => {
                  const d = agentDose(agent, input);
                  const rem = tally ? remainingCarpules(agent, input, tally) : d.maxCarpules;
                  const blocked = d.limits.notRecommended;
                  return (
                    <tr key={agent.id} className={cx(T.row, blocked && 'opacity-60')}>
                      <th scope="row" className={cx('px-4 py-3 font-medium', T.strong)}>
                        {agent.name}
                        {d.limits.note && <span className={cx('block text-xs font-normal', blocked ? 'text-rose-700 dark:text-rose-300' : T.muted)}>{d.limits.note}</span>}
                      </th>
                      <td className={cx('whitespace-nowrap px-3 py-3 tabular-nums', T.muted)}>
                        {d.limits.mgPerKg.toFixed(1)} · {d.limits.maxMg} mg
                      </td>
                      <td className={cx('px-3 py-3 font-mono tabular-nums', T.strong)}>{Math.round(d.maxMg)}</td>
                      <td className="px-3 py-3">
                        <span className="rounded-lg bg-stone-900 px-2 py-1 font-mono text-base font-bold tabular-nums text-amber-50 dark:bg-amber-500 dark:text-stone-950">
                          {blocked ? '—' : d.maxCarpules.toFixed(1)}
                        </span>
                        {!blocked && d.limitedBy === 'epinephrine' && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-rose-800 dark:text-rose-300">
                            <HeartPulse className="h-3 w-3" aria-hidden />
                            epi-limited
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cx(
                            'font-mono text-base font-bold tabular-nums',
                            blocked ? T.faint : rem <= 0 ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-800 dark:text-emerald-300',
                          )}
                        >
                          {blocked ? '—' : rem.toFixed(1)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={cx(T.card, 'space-y-4 p-4')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className={cx('text-sm font-semibold', T.strong)}>Administered this visit</h3>
              {log.length > 0 && (
                <button type="button" onClick={() => setLog([])} className={cx(T.btnGhost, 'h-8 text-xs')}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  Clear log
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <FieldLabel label="Agent" className="min-w-[220px] flex-1">
                <select value={addAgent} onChange={(e) => setAddAgent(e.target.value)} className={cx(T.input, 'h-10')}>
                  {LA_DOSING.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <FieldLabel label="Carpules">
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setAddCarps((c) => Math.max(0.5, c - 0.5))} className={cx(T.btnOutline, 'h-10 w-10 !px-0', T.focus)} aria-label="Decrease">
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className={cx('w-12 text-center font-mono text-lg font-bold tabular-nums', T.strong)}>{addCarps.toFixed(1)}</span>
                  <button type="button" onClick={() => setAddCarps((c) => Math.min(10, c + 0.5))} className={cx(T.btnOutline, 'h-10 w-10 !px-0', T.focus)} aria-label="Increase">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </FieldLabel>
              <button type="button" onClick={addEntry} className={cx(T.btnAccent, 'h-10', T.focus)}>
                <Plus className="h-4 w-4" aria-hidden />
                Log
              </button>
            </div>
            {log.length > 0 && (
              <ul className="space-y-1">
                {log.map((e) => {
                  const a = LA_DOSING.find((x) => x.id === e.agentId);
                  const d = a ? agentDose(a, input) : null;
                  return (
                    <li key={e.id} className={cx('flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm', T.subtle)}>
                      <span className={T.body}>
                        <span className="font-mono font-semibold tabular-nums">{e.carpules.toFixed(1)}</span> × {a?.name}
                        {d && <span className={cx('ml-2 text-xs tabular-nums', T.muted)}>{(e.carpules * d.mgPerCarpule).toFixed(0)} mg</span>}
                      </span>
                      <button type="button" onClick={() => setLog((prev) => prev.filter((x) => x.id !== e.id))} className={cx(T.btnGhost, 'h-7 w-7 !px-0')} aria-label="Remove entry">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {tally && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Meter
                  value={tally.fractionUsed}
                  label="Combined anesthetic dose"
                  detail={`${Math.round(tally.fractionUsed * 100)}% of max`}
                />
                <Meter
                  value={tally.epiUsedMg / tally.epiLimitMg}
                  label="Epinephrine"
                  detail={`${tally.epiUsedMg.toFixed(3)} / ${tally.epiLimitMg} mg`}
                />
              </div>
            )}
          </div>
        </>
      )}
      <p className={cx('text-xs leading-relaxed', T.muted)}>
        Carpules are rounded down to 0.1. Combined agents are counted as a fraction of each agent’s maximum, so the total stays within the lowest applicable limit.
        Adult values are manufacturer maximums; pediatric values follow the manual’s AAPD table. Reduce doses for sedation, hepatic/renal disease and the elderly.
      </p>
    </div>
  );
}

/* ------------------------ Cementation matrix ---------------------------- */

function StepTimerChip({ id, preset, api }: { id: string; preset: TimerPreset; api: TimerApi }) {
  const s = api.timers[id];
  if (!s) return null;
  return (
    <button
      type="button"
      onClick={() => api.toggle(id)}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold transition active:scale-[0.97]',
        s.running
          ? 'border-stone-900 bg-stone-900 text-amber-50 dark:border-amber-400 dark:bg-amber-400 dark:text-stone-950'
          : s.done
            ? 'animate-pulse border-rose-400 bg-rose-50 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200'
            : 'border-stone-200 bg-white text-stone-700 hover:border-amber-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200',
        T.focus,
      )}
      aria-label={`${s.running ? 'Pause' : 'Start'} ${preset.label}`}
    >
      {s.running ? <Pause className="h-3 w-3" aria-hidden /> : <Play className="h-3 w-3" aria-hidden />}
      {preset.label}
      <span className="font-mono tabular-nums">{s.done ? 'done' : formatClock(s.remaining)}</span>
    </button>
  );
}

function ProtocolList({ steps, prefix, api, presets }: { steps: ProtocolStepLite[]; prefix: string; api: TimerApi; presets: Record<string, TimerPreset> }) {
  return (
    <ol className="space-y-2.5">
      {steps.map((s, i) => {
        const tid = `${prefix}-${i}`;
        return (
          <li key={tid} className="flex gap-3">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-stone-900 text-[11px] font-bold text-amber-50 dark:bg-amber-500 dark:text-stone-950">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cx('text-sm leading-relaxed', T.body)}>{s.text}</p>
              {presets[tid] && (
                <div className="mt-1.5">
                  <StepTimerChip id={tid} preset={presets[tid]} api={api} />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SubstrateDetail({ substrate, soundOn }: { substrate: SubstrateProtocol; soundOn: boolean }) {
  const presetList = useMemo<TimerPreset[]>(
    () =>
      [
        ...substrate.intaglio.map((s, i) => ({ s, id: `r-${i}` })),
        ...substrate.tooth.map((s, i) => ({ s, id: `t-${i}` })),
      ]
        .filter(({ s }) => s.seconds)
        .map(({ s, id }) => ({ id, label: s.label ?? 'Timer', seconds: s.seconds as number, tone: 'etch' as TimerTone })),
    [substrate],
  );
  const presets = useMemo(() => Object.fromEntries(presetList.map((p) => [p.id, p])), [presetList]);
  const soundRef = useRef(soundOn);
  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);
  const api = useTimers(presetList, () => {
    if (soundRef.current) playAlert();
  });
  const [height, setHeight] = useState('');
  const [taper, setTaper] = useState('');
  const h = Number.parseFloat(height);
  const tp = Number.parseFloat(taper);
  const retentionKnown = Number.isFinite(h) && Number.isFinite(tp);
  const rmgiOk = retentionKnown && h >= 4 && tp < 10;

  return (
    <div className="space-y-4">
      {substrate.warnings.map((w) => (
        <CautionCallout key={w} text={w} title="Warning" />
      ))}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={cx(T.card, 'p-4')}>
          <h3 className={cx('mb-3 text-sm font-semibold', T.strong)}>Restoration intaglio</h3>
          <ProtocolList steps={substrate.intaglio} prefix="r" api={api} presets={presets} />
        </div>
        <div className={cx(T.card, 'p-4')}>
          <h3 className={cx('mb-3 text-sm font-semibold', T.strong)}>Tooth</h3>
          <ProtocolList steps={substrate.tooth} prefix="t" api={api} presets={presets} />
        </div>
      </div>
      <div className={cx(T.card, 'p-4')}>
        <h3 className={cx('mb-3 text-sm font-semibold', T.strong)}>Cement selection</h3>
        <ul className="space-y-2">
          {substrate.cements.map((c) => (
            <li key={c.name} className="flex gap-3">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden />
              <p className={cx('text-sm', T.body)}>
                <span className={cx('font-semibold', T.strong)}>{c.name}: </span>
                {c.when}
              </p>
            </li>
          ))}
        </ul>
        {substrate.id === 'zirconia' && (
          <div className={cx('mt-4 rounded-xl border p-3', T.divider, T.subtle)}>
            <p className={cx('text-xs font-semibold uppercase tracking-wider', T.muted)}>RMGI eligibility check</p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <FieldLabel label="Prep height (mm)">
                <input type="number" min={0} step={0.5} value={height} onChange={(e) => setHeight(e.target.value)} className={cx(T.input, 'h-9 w-28 tabular-nums')} />
              </FieldLabel>
              <FieldLabel label="Total taper (°)">
                <input type="number" min={0} step={1} value={taper} onChange={(e) => setTaper(e.target.value)} className={cx(T.input, 'h-9 w-28 tabular-nums')} />
              </FieldLabel>
              {retentionKnown && (
                <Badge
                  className={
                    rmgiOk
                      ? 'bg-emerald-50 text-emerald-800 ring-emerald-700/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                      : 'bg-rose-50 text-rose-800 ring-rose-700/20 dark:bg-rose-500/10 dark:text-rose-300'
                  }
                >
                  {rmgiOk ? 'Retentive — RMGI acceptable' : 'Low retention — use resin cement'}
                </Badge>
              )}
            </div>
          </div>
        )}
        <p className={cx('mt-4 text-xs', T.muted)}>Products: {substrate.products.join(' · ')}</p>
      </div>
    </div>
  );
}

function CementationPanel({ soundOn }: { soundOn: boolean }) {
  const [id, setId] = useState(SUBSTRATES[0].id);
  const substrate = SUBSTRATES.find((s) => s.id === id) ?? SUBSTRATES[0];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5">
        {SUBSTRATES.map((s) => {
          const on = s.id === id;
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              onClick={() => setId(s.id)}
              className={cx(
                'rounded-2xl border p-3.5 text-left transition active:scale-[0.98]',
                on ? cx(ACCENT[s.accent].soft, 'border-2 shadow-sm') : 'border-stone-200 bg-white/70 hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900/50',
                T.focus,
              )}
            >
              <span className={cx('grid h-8 w-8 place-items-center rounded-xl', ACCENT[s.accent].icon)}>
                <Gem className="h-4 w-4" aria-hidden />
              </span>
              <p className={cx('mt-2 text-sm font-semibold', T.strong)}>{s.name}</p>
              <p className={cx('text-xs', T.muted)}>{s.subtitle}</p>
            </button>
          );
        })}
      </div>
      <SubstrateDetail key={substrate.id} substrate={substrate} soundOn={soundOn} />
      <p className={cx('text-xs', T.muted)}>Follow the specific cement system’s IFU for primer pairing, working time and cure mode.</p>
    </div>
  );
}

/* --------------------------- AAE endo wizard ---------------------------- */

const ENDO_LABELS = {
  cold: { normal: 'Normal (1–2 s)', exaggerated: 'Exaggerated, non-lingering', lingering: 'Lingering (> 10 s)', none: 'No response' },
  percussion: { neg: '(−)', pos: '(+)', strong: '(+++)' },
  palpation: { neg: '(−)', pos: '(+)' },
  probing: { normal: 'Normal / WNL', isolated: 'Isolated deep pocket' },
  radiograph: { normal: 'Normal PDL', widened: 'Widened PDL', parl: 'Periapical radiolucency', condensing: 'Condensing osteitis' },
  swelling: { none: 'None', sinus: 'Sinus tract', swelling: 'Swelling' },
  history: { none: 'Untreated', treated: 'Previously treated (RCT)', initiated: 'Therapy initiated' },
} as const;

function EndoPanel({ tooth }: { tooth: ToothInfo | null }) {
  const [f, setF] = useState<EndoFindings>(DEFAULT_ENDO);
  const set = <K extends keyof EndoFindings>(k: K, v: EndoFindings[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const r = diagnoseEndo(f, tooth);
  const summary = `${tooth ? `Tooth #${tooth.id}` : 'Tooth'} — Pulpal diagnosis: ${r.pulp}. Apical diagnosis: ${r.apical}.
Findings: cold ${ENDO_LABELS.cold[f.cold].toLowerCase()}${f.spontaneous ? ', spontaneous pain' : ''}; percussion ${ENDO_LABELS.percussion[f.percussion]}; palpation ${ENDO_LABELS.palpation[f.palpation]}; probing ${ENDO_LABELS.probing[f.probing].toLowerCase()}; radiograph ${ENDO_LABELS.radiograph[f.radiograph].toLowerCase()}; ${ENDO_LABELS.swelling[f.swelling].toLowerCase()}.`;
  const row = (label: string, icon: LucideIcon, control: React.ReactNode) => {
    const Icon = icon;
    return (
      <div className={cx('border-b py-3 last:border-b-0', T.divider)}>
        <p className={cx('mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider', T.muted)}>
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {label}
        </p>
        {control}
      </div>
    );
  };
  return (
    <div className="space-y-5">
      <div className={cx('sticky -top-5 z-10 -mx-5 -mt-5 border-b px-5 pb-4 pt-5', T.glass)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-gradient-to-br from-stone-900 to-stone-800 p-4 text-amber-50 dark:from-stone-800 dark:to-stone-900">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">Pulpal</p>
            <p className="mt-1 text-lg font-semibold leading-tight">{r.pulp}</p>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-orange-700 to-rose-800 p-4 text-orange-50">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-200">Apical</p>
            <p className="mt-1 text-lg font-semibold leading-tight">{r.apical}</p>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className={cx('text-xs', T.muted)}>{tooth ? `Codes for #${tooth.id} (${tooth.name.toLowerCase()})` : 'Select a tooth for tooth-specific codes'}</p>
          <div className="flex gap-1">
            <CopyButton text={summary} label="Copy Dx" />
            <button type="button" onClick={() => setF(DEFAULT_ENDO)} className={cx(T.btnGhost, 'h-8 text-xs')}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className={cx(T.card, 'px-4')}>
        {row(
          'Treatment history',
          FileText,
          <ChoiceChips
            label="Treatment history"
            value={f.history}
            onChange={(v) => set('history', v)}
            options={(Object.keys(ENDO_LABELS.history) as EndoFindings['history'][]).map((k) => ({ value: k, label: ENDO_LABELS.history[k] }))}
          />,
        )}
        {f.history === 'none' &&
          row(
            'Cold test (Endo-Ice)',
            Snowflake,
            <div className="space-y-2">
              <ChoiceChips
                label="Cold test"
                value={f.cold}
                onChange={(v) => set('cold', v)}
                options={[
                  { value: 'normal', label: ENDO_LABELS.cold.normal },
                  { value: 'exaggerated', label: ENDO_LABELS.cold.exaggerated, tone: 'warn' },
                  { value: 'lingering', label: ENDO_LABELS.cold.lingering, tone: 'alert' },
                  { value: 'none', label: ENDO_LABELS.cold.none, tone: 'alert' },
                ]}
              />
              <div className="grid gap-1 sm:grid-cols-2">
                <Toggle checked={f.spontaneous} onChange={(v) => set('spontaneous', v)} label="Spontaneous / referred pain" />
                <Toggle checked={f.deepCaries} onChange={(v) => set('deepCaries', v)} label="Deep caries, exposure expected" description="Asymptomatic" />
              </div>
            </div>,
          )}
        {row(
          'Percussion',
          Zap,
          <ChoiceChips
            label="Percussion"
            value={f.percussion}
            onChange={(v) => set('percussion', v)}
            options={[
              { value: 'neg', label: '(−)' },
              { value: 'pos', label: '(+)', tone: 'warn' },
              { value: 'strong', label: '(+++)', tone: 'alert' },
            ]}
          />,
        )}
        {row(
          'Palpation',
          Activity,
          <ChoiceChips
            label="Palpation"
            value={f.palpation}
            onChange={(v) => set('palpation', v)}
            options={[
              { value: 'neg', label: '(−)' },
              { value: 'pos', label: '(+)', tone: 'warn' },
            ]}
          />,
        )}
        {row(
          'Probing / mobility',
          Ruler,
          <ChoiceChips
            label="Probing"
            value={f.probing}
            onChange={(v) => set('probing', v)}
            options={[
              { value: 'normal', label: ENDO_LABELS.probing.normal },
              { value: 'isolated', label: ENDO_LABELS.probing.isolated, tone: 'alert' },
            ]}
          />,
        )}
        {row(
          'Radiographic apex',
          ScanLine,
          <ChoiceChips
            label="Radiographic apex"
            value={f.radiograph}
            onChange={(v) => set('radiograph', v)}
            options={[
              { value: 'normal', label: ENDO_LABELS.radiograph.normal },
              { value: 'widened', label: ENDO_LABELS.radiograph.widened, tone: 'warn' },
              { value: 'parl', label: ENDO_LABELS.radiograph.parl, tone: 'alert' },
              { value: 'condensing', label: ENDO_LABELS.radiograph.condensing, tone: 'warn' },
            ]}
          />,
        )}
        {row(
          'Swelling / sinus tract',
          AlertTriangle,
          <ChoiceChips
            label="Swelling"
            value={f.swelling}
            onChange={(v) => set('swelling', v)}
            options={[
              { value: 'none', label: 'None' },
              { value: 'sinus', label: 'Sinus tract', tone: 'warn' },
              { value: 'swelling', label: 'Swelling', tone: 'alert' },
            ]}
          />,
        )}
      </div>

      {r.warnings.map((w) => (
        <CautionCallout key={w} text={w} title="Check" />
      ))}

      <div className={cx(T.card, 'p-4')}>
        <h3 className={cx('text-sm font-semibold', T.strong)}>Why</h3>
        <ul className="mt-2 space-y-1">
          {r.rationale.map((x) => (
            <li key={x} className={cx('flex gap-2 text-sm', T.body)}>
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden />
              {x}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { title: 'Diagnostic codes', items: r.diagnosticCodes },
          { title: 'Treatment options', items: r.treatment },
        ].map((block) => (
          <div key={block.title} className={cx(T.card, 'p-4')}>
            <h3 className={cx('text-sm font-semibold', T.strong)}>{block.title}</h3>
            <ul className="mt-2 space-y-1.5">
              {block.items.map((c) => (
                <li key={c.code + c.label} className="flex items-start gap-2 text-sm">
                  <span className="shrink-0">
                    <CdtBadge code={c.code} />
                  </span>
                  <span className={T.body}>{c.label}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className={cx('text-xs', T.muted)}>AAE diagnostic terminology. Always test control teeth, and confirm with at least two tests before irreversible treatment.</p>
    </div>
  );
}

/* ---------------------------- Medical risk ------------------------------ */

function TriageCard({ label, result }: { label: string; result: TriageResult | null }) {
  if (!result) {
    return (
      <div className={cx('rounded-2xl border border-dashed p-4', T.divider)}>
        <p className={cx('text-xs font-semibold uppercase tracking-wider', T.muted)}>{label}</p>
        <p className={cx('mt-1 text-sm', T.faint)}>Enter values</p>
      </div>
    );
  }
  const s = RISK_STYLE[result.level];
  return (
    <div className={cx('rounded-2xl border p-4', s.card)} role="status">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</p>
        <span className="inline-flex items-center gap-1.5 text-xs font-bold">
          <span className={cx('h-2.5 w-2.5 rounded-full', s.dot)} aria-hidden />
          {s.label}
        </span>
      </div>
      <p className="mt-1 text-lg font-semibold">{result.title}</p>
      <p className="mt-1 text-sm leading-snug opacity-90">{result.detail}</p>
    </div>
  );
}

function num(s: string): number | null {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function MedicalRiskPanel() {
  const [tab, setTab] = useState<'vitals' | 'prophylaxis'>('vitals');
  const [sys, setSys] = useState('');
  const [dia, setDia] = useState('');
  const [glucose, setGlucose] = useState('');
  const [a1c, setA1c] = useState('');
  const [conditions, setConditions] = useState<string[]>([]);
  const [joint, setJoint] = useState<ProphylaxisInput['joint']>('none');
  const [invasive, setInvasive] = useState(true);
  const [allergy, setAllergy] = useState<ProphylaxisInput['allergy']>('none');
  const [oral, setOral] = useState(true);
  const [child, setChild] = useState(false);
  const [childKg, setChildKg] = useState('');

  const bp = triageBP(num(sys), num(dia));
  const glu = triageGlucose(num(glucose));
  const hb = triageA1c(num(a1c));
  const levels = [bp, glu, hb].filter((x): x is TriageResult => x !== null).map((x) => x.level);
  const overall: RiskLevel | null = levels.length ? (levels.includes('red') ? 'red' : levels.includes('yellow') ? 'yellow' : 'green') : null;

  const plan = prophylaxisPlan({ conditions, joint, invasive, allergy, canTakeOral: oral, child, weightKg: child ? num(childKg) : null });
  const rxText = plan.regimens.map((r) => `${r.drug}: ${child ? r.child : r.adult} single dose 30–60 min before procedure`).join('\n');

  return (
    <div className="space-y-5">
      <Segmented
        label="Medical risk section"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'vitals', label: 'Vitals screener', icon: Activity },
          { value: 'prophylaxis', label: 'Antibiotic prophylaxis', icon: ShieldCheck },
        ]}
      />
      {tab === 'vitals' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <FieldLabel label="Systolic (mmHg)">
              <input type="number" inputMode="numeric" value={sys} onChange={(e) => setSys(e.target.value)} className={cx(T.input, 'h-11 text-lg font-semibold tabular-nums')} />
            </FieldLabel>
            <FieldLabel label="Diastolic (mmHg)">
              <input type="number" inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} className={cx(T.input, 'h-11 text-lg font-semibold tabular-nums')} />
            </FieldLabel>
            <FieldLabel label="Glucose (mg/dL)">
              <input type="number" inputMode="numeric" value={glucose} onChange={(e) => setGlucose(e.target.value)} className={cx(T.input, 'h-11 text-lg font-semibold tabular-nums')} />
            </FieldLabel>
            <FieldLabel label="HbA1c (%)">
              <input type="number" inputMode="decimal" step={0.1} value={a1c} onChange={(e) => setA1c(e.target.value)} className={cx(T.input, 'h-11 text-lg font-semibold tabular-nums')} />
            </FieldLabel>
          </div>
          {overall && (
            <div className={cx('flex items-center gap-3 rounded-2xl border px-4 py-3', RISK_STYLE[overall].card)}>
              <span className={cx('h-3.5 w-3.5 rounded-full', RISK_STYLE[overall].dot)} aria-hidden />
              <p className="text-sm font-semibold">
                Overall: {overall === 'green' ? 'Proceed with routine care' : overall === 'yellow' ? 'Proceed with caution — recheck' : 'Defer elective care / act now'}
              </p>
            </div>
          )}
          <div className="grid gap-3">
            <TriageCard label="Blood pressure" result={bp} />
            <TriageCard label="Blood glucose" result={glu} />
            <TriageCard label="HbA1c" result={hb} />
          </div>
          <p className={cx('text-xs', T.muted)}>
            Chairside screening aid based on AHA/ACC 2017 BP categories and common dental-practice cutoffs. Take BP seated after 5 min rest with the correct cuff size; confirm abnormal readings.
          </p>
        </>
      ) : (
        <>
          <div className={cx(T.card, 'p-3')}>
            <p className={cx('px-2 pb-1 text-xs font-semibold uppercase tracking-wider', T.muted)}>Cardiac conditions (AHA 2021)</p>
            {CARDIAC_CONDITIONS.map((c) => (
              <Toggle
                key={c.id}
                checked={conditions.includes(c.id)}
                onChange={(v) => setConditions((prev) => (v ? [...prev, c.id] : prev.filter((x) => x !== c.id)))}
                label={c.label}
                description={c.qualifies ? undefined : 'Not a standard AHA indication — consult'}
              />
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldLabel label="Prosthetic joint">
              <ChoiceChips
                label="Prosthetic joint"
                value={joint}
                onChange={setJoint}
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'routine', label: 'Healthy' },
                  { value: 'compromised', label: 'Compromised', tone: 'warn' },
                ]}
              />
            </FieldLabel>
            <FieldLabel label="Penicillin allergy">
              <ChoiceChips
                label="Penicillin allergy"
                value={allergy}
                onChange={setAllergy}
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'mild', label: 'Yes (non-severe)', tone: 'warn' },
                  { value: 'severe', label: 'Anaphylaxis / angioedema / urticaria', tone: 'alert' },
                ]}
              />
            </FieldLabel>
          </div>
          <div className="grid gap-1 sm:grid-cols-3">
            <Toggle checked={invasive} onChange={setInvasive} label="Invasive procedure" description="Gingival/periapical manipulation or mucosal perforation" />
            <Toggle checked={oral} onChange={setOral} label="Can take oral medication" />
            <Toggle checked={child} onChange={setChild} label="Pediatric patient" />
          </div>
          {child && (
            <FieldLabel label="Child weight (kg)" className="max-w-[200px]">
              <input type="number" value={childKg} onChange={(e) => setChildKg(e.target.value)} className={cx(T.input, 'h-10 tabular-nums')} />
            </FieldLabel>
          )}

          <div className={cx('rounded-2xl border p-4', plan.indicated ? RISK_STYLE.yellow.card : RISK_STYLE.green.card)}>
            <p className="text-lg font-semibold">{plan.indicated ? 'Endocarditis prophylaxis indicated' : 'Endocarditis prophylaxis not indicated'}</p>
            {plan.indicated && plan.regimens.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wider opacity-70">
                      <th scope="col" className="py-1 pr-3 font-semibold">Regimen</th>
                      <th scope="col" className="py-1 pr-3 font-semibold">{child ? 'Child' : 'Adult'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.regimens.map((r) => (
                      <tr key={r.drug}>
                        <td className="py-1.5 pr-3 font-medium">{r.drug}</td>
                        <td className="py-1.5 pr-3 font-mono tabular-nums">{child ? r.child : r.adult}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2">
                  <CopyButton text={rxText} label="Copy regimen" />
                </div>
              </div>
            )}
          </div>
          {plan.consult.map((c) => (
            <CautionCallout key={c} text={c} title="Consult" />
          ))}
          {plan.notes.map((n) => (
            <NoteCallout key={n} label="Note" text={n} />
          ))}
          <p className={cx('text-xs', T.muted)}>AHA 2021 scientific statement on prevention of viridans group streptococcal infective endocarditis; ADA 2015 prosthetic joint guidance.</p>
        </>
      )}
    </div>
  );
}

/* ---------------------------- Denture tools ----------------------------- */

interface ZoneGeometry {
  paths: string[];
  badges: [number, number][];
  stroke: string;
}

const MAX_ZONE_GEOMETRY: Record<string, ZoneGeometry> = {
  mx1: { paths: ['M104 70 C140 28 220 28 256 70'], badges: [[180, 24]], stroke: 'stroke-teal-600 dark:stroke-teal-400' },
  mx2: { paths: ['M66 150 C72 118 86 90 104 70', 'M256 70 C274 90 288 118 294 150'], badges: [[62, 100], [298, 100]], stroke: 'stroke-emerald-600 dark:stroke-emerald-400' },
  mx3: { paths: ['M60 220 C59 195 61 170 66 150', 'M294 150 C299 170 301 195 300 220'], badges: [[40, 186], [320, 186]], stroke: 'stroke-yellow-600 dark:stroke-yellow-400' },
  mx4: { paths: ['M70 290 C62 265 58 245 60 220', 'M300 220 C302 245 298 265 290 290'], badges: [[42, 260], [318, 260]], stroke: 'stroke-orange-600 dark:stroke-orange-400' },
  mx5: { paths: ['M290 290 Q180 314 70 290'], badges: [[180, 322]], stroke: 'stroke-rose-600 dark:stroke-rose-400' },
};

const MAND_ZONE_GEOMETRY: Record<string, ZoneGeometry> = {
  md1: { paths: ['M90 95 C120 55 150 42 180 42 C210 42 240 55 270 95'], badges: [[180, 24]], stroke: 'stroke-teal-600 dark:stroke-teal-400' },
  md2: { paths: ['M70 130 C76 115 82 104 90 95', 'M270 95 C278 104 284 115 290 130'], badges: [[56, 100], [304, 100]], stroke: 'stroke-emerald-600 dark:stroke-emerald-400' },
  md3: { paths: ['M66 285 C52 240 52 175 70 130', 'M290 130 C308 175 308 240 294 285'], badges: [[34, 208], [326, 208]], stroke: 'stroke-yellow-600 dark:stroke-yellow-400' },
  md4: {
    paths: ['M66 285 C60 300 70 312 84 312 C98 312 104 302 104 290', 'M256 290 C256 302 262 312 276 312 C290 312 300 300 294 285'],
    badges: [[84, 330], [276, 330]],
    stroke: 'stroke-pink-600 dark:stroke-pink-400',
  },
  md5: { paths: ['M104 290 C105 275 107 255 110 230', 'M250 230 C253 255 255 275 256 290'], badges: [[130, 262], [230, 262]], stroke: 'stroke-orange-600 dark:stroke-orange-400' },
  md6: {
    paths: ['M110 230 C114 205 120 170 145 135 C160 115 170 110 180 110 C190 110 200 115 215 135 C240 170 246 205 250 230'],
    badges: [[180, 134]],
    stroke: 'stroke-amber-600 dark:stroke-amber-400',
  },
};

const MAX_OUTLINE =
  'M70 290 C62 265 58 245 60 220 C59 195 61 170 66 150 C72 118 86 90 104 70 C140 28 220 28 256 70 C274 90 288 118 294 150 C299 170 301 195 300 220 C302 245 298 265 290 290 Q180 314 70 290 Z';
const MAND_OUTLINE =
  'M66 285 C52 240 52 175 70 130 C76 115 82 104 90 95 C120 55 150 42 180 42 C210 42 240 55 270 95 C278 104 284 115 290 130 C308 175 308 240 294 285 C300 300 290 312 276 312 C262 312 256 302 256 290 C255 275 253 255 250 230 C246 205 240 170 215 135 C200 115 190 110 180 110 C170 110 160 115 145 135 C120 170 114 205 110 230 C107 255 105 275 104 290 C104 302 98 312 84 312 C70 312 60 300 66 285 Z';

function BorderMap({ arch, selected, onSelect }: { arch: 'maxillary' | 'mandibular'; selected: string | null; onSelect: (id: string) => void }) {
  const geometry = arch === 'maxillary' ? MAX_ZONE_GEOMETRY : MAND_ZONE_GEOMETRY;
  const zones = BORDER_ZONES.filter((z) => z.arch === arch);
  return (
    <svg viewBox="0 0 360 345" className="h-auto w-full" role="group" aria-label={`${arch} border-molding zones`}>
      <text x={180} y={10} textAnchor="middle" className="fill-stone-400 text-[9px] font-semibold uppercase tracking-[0.2em] dark:fill-stone-500">
        Anterior
      </text>
      <path d={arch === 'maxillary' ? MAX_OUTLINE : MAND_OUTLINE} className="fill-stone-100 stroke-stone-300 dark:fill-stone-800/70 dark:stroke-stone-600" strokeWidth={1.5} />
      {arch === 'maxillary' ? (
        <>
          <text x={180} y={200} textAnchor="middle" className="fill-stone-400 text-[10px] font-medium uppercase tracking-wider dark:fill-stone-500">
            Palate
          </text>
          <circle cx={70} cy={290} r={3.5} className="fill-stone-600 dark:fill-stone-300" />
          <circle cx={290} cy={290} r={3.5} className="fill-stone-600 dark:fill-stone-300" />
        </>
      ) : (
        <>
          <ellipse cx={84} cy={296} rx={15} ry={12} className="fill-rose-100 stroke-rose-300 dark:fill-rose-900/40 dark:stroke-rose-700" strokeDasharray="3 3" />
          <ellipse cx={276} cy={296} rx={15} ry={12} className="fill-rose-100 stroke-rose-300 dark:fill-rose-900/40 dark:stroke-rose-700" strokeDasharray="3 3" />
          <text x={180} y={210} textAnchor="middle" className="fill-stone-400 text-[10px] font-medium uppercase tracking-wider dark:fill-stone-500">
            Tongue space
          </text>
        </>
      )}
      {zones.map((z) => {
        const g = geometry[z.id];
        const on = selected === z.id;
        const dim = selected !== null && !on;
        const choose = () => onSelect(z.id);
        return (
          <g
            key={z.id}
            role="button"
            tabIndex={0}
            aria-pressed={on}
            aria-label={`Zone ${z.n}: ${z.name}`}
            onClick={choose}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                choose();
              }
            }}
            className="group cursor-pointer outline-none"
          >
            {g.paths.map((d) => (
              <path key={`hit-${d}`} d={d} className="fill-none stroke-transparent" strokeWidth={24} strokeLinecap="round" />
            ))}
            {g.paths.map((d) => (
              <path
                key={d}
                d={d}
                className={cx('fill-none transition-all duration-200', g.stroke, dim ? 'opacity-25' : 'opacity-90', 'group-hover:opacity-100')}
                strokeWidth={on ? 11 : 7}
                strokeLinecap="round"
              />
            ))}
            {g.badges.map(([bx, by]) => (
              <g key={`${bx}-${by}`}>
                <circle
                  cx={bx}
                  cy={by}
                  r={on ? 12 : 10}
                  className={cx(
                    'transition-all group-focus-visible:stroke-amber-500',
                    on ? 'fill-stone-900 stroke-amber-400 dark:fill-amber-400 dark:stroke-stone-950' : 'fill-white stroke-stone-300 dark:fill-stone-900 dark:stroke-stone-600',
                  )}
                  strokeWidth={2}
                />
                <text
                  x={bx}
                  y={by}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={cx('pointer-events-none text-[11px] font-bold', on ? 'fill-amber-300 dark:fill-stone-950' : 'fill-stone-700 dark:fill-stone-200')}
                >
                  {z.n}
                </text>
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function DentureToolsPanel() {
  const [tab, setTab] = useState<'border' | 'pip'>('border');
  const [arch, setArch] = useState<'maxillary' | 'mandibular'>('maxillary');
  const [zoneId, setZoneId] = useState<string | null>('mx1');
  const [problemId, setProblemId] = useState<string>(PIP_PROBLEMS[0].id);
  const [pipArch, setPipArch] = useState<'all' | 'maxillary' | 'mandibular'>('all');
  const zone = BORDER_ZONES.find((z) => z.id === zoneId) ?? null;
  const problem = PIP_PROBLEMS.find((p) => p.id === problemId) ?? PIP_PROBLEMS[0];
  const visibleProblems = PIP_PROBLEMS.filter((p) => pipArch === 'all' || p.arch === pipArch || p.arch === 'both');

  const goToZone = (id: string) => {
    const z = BORDER_ZONES.find((x) => x.id === id);
    if (!z) return;
    setArch(z.arch);
    setZoneId(id);
    setTab('border');
  };

  return (
    <div className="space-y-5">
      <Segmented
        label="Denture tool"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'border', label: 'Border molding zones' },
          { value: 'pip', label: 'PIP troubleshooter' },
        ]}
      />
      {tab === 'border' ? (
        <>
          <Segmented
            label="Arch"
            value={arch}
            onChange={(a) => {
              setArch(a);
              setZoneId(a === 'maxillary' ? 'mx1' : 'md1');
            }}
            options={[
              { value: 'maxillary', label: 'Maxillary · 5 zones' },
              { value: 'mandibular', label: 'Mandibular · 6 zones' },
            ]}
          />
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className={cx(T.card, 'p-3')}>
              <BorderMap arch={arch} selected={zoneId} onSelect={setZoneId} />
              <p className={cx('mt-1 text-center text-[11px]', T.muted)}>Intaglio view · tap a zone</p>
            </div>
            <div className="space-y-3">
              {zone && (
                <div className={cx(T.card, 'p-4')}>
                  <p className={T.eyebrow}>Zone {zone.n}</p>
                  <h3 className={cx('mt-0.5 text-lg font-semibold', T.strong)}>{zone.name}</h3>
                  <p className={cx('mt-1 text-sm', T.body)}>{zone.anatomy}</p>
                  <p className={cx('mt-3 text-xs font-semibold uppercase tracking-wider', T.muted)}>Patient movements</p>
                  <ol className="mt-1.5 space-y-1.5">
                    {zone.movements.map((m, i) => (
                      <li key={m} className="flex items-start gap-2.5">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-500 text-xs font-bold text-white dark:text-stone-950">{i + 1}</span>
                        <span className={cx('text-sm font-medium', T.strong)}>{m}</span>
                      </li>
                    ))}
                  </ol>
                  <p className={cx('mt-3 text-[11px]', T.faint)}>Source: {zone.source}</p>
                </div>
              )}
              <ul className="grid gap-1">
                {BORDER_ZONES.filter((z) => z.arch === arch).map((z) => (
                  <li key={z.id}>
                    <button
                      type="button"
                      onClick={() => setZoneId(z.id)}
                      aria-pressed={z.id === zoneId}
                      className={cx(
                        'flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm transition',
                        z.id === zoneId ? 'bg-stone-900 text-amber-50 dark:bg-amber-500 dark:text-stone-950' : cx('hover:bg-stone-100 dark:hover:bg-stone-800', T.body),
                        T.focus,
                      )}
                    >
                      <span className="w-5 text-center font-mono text-xs font-bold">{z.n}</span>
                      {z.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <NoteCallout label="Manual technique" text="Tray 2–3 mm short of the vestibule; greenstick tempered in a 130 °F bath; compound trimmed to 3–4 mm wide; border movements repeated 30 s into the light-body impression." />
        </>
      ) : (
        <>
          <Segmented
            label="Arch filter"
            size="sm"
            value={pipArch}
            onChange={setPipArch}
            options={[
              { value: 'all', label: 'All' },
              { value: 'maxillary', label: 'Maxillary' },
              { value: 'mandibular', label: 'Mandibular' },
            ]}
          />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <ul className="space-y-1.5">
              {visibleProblems.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setProblemId(p.id)}
                    aria-pressed={p.id === problem.id}
                    className={cx(
                      'w-full rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition active:scale-[0.99]',
                      p.id === problem.id
                        ? 'border-orange-600 bg-orange-50 text-orange-950 dark:border-orange-400 dark:bg-orange-500/10 dark:text-orange-100'
                        : 'border-stone-200 bg-white/70 text-stone-700 hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900/50 dark:text-stone-300',
                      T.focus,
                    )}
                  >
                    {p.symptom}
                    <span className={cx('mt-0.5 block text-[11px] font-normal capitalize', T.muted)}>{p.arch === 'both' ? 'Either arch' : p.arch}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className={cx(T.card, 'h-fit p-4')}>
              <p className={T.eyebrow}>Likely cause</p>
              <p className={cx('mt-1 text-sm font-medium', T.strong)}>{problem.cause}</p>
              <p className={cx('mt-4 text-xs font-semibold uppercase tracking-wider', T.muted)}>Adjustment</p>
              <ol className="mt-1.5 space-y-2">
                {problem.fix.map((f, i) => (
                  <li key={f} className="flex gap-2.5">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-stone-900 text-[10px] font-bold text-amber-50 dark:bg-amber-500 dark:text-stone-950">{i + 1}</span>
                    <span className={cx('text-sm', T.body)}>{f}</span>
                  </li>
                ))}
              </ol>
              {problem.zones.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {problem.zones.map((zid) => {
                    const z = BORDER_ZONES.find((x) => x.id === zid);
                    return z ? (
                      <button key={zid} type="button" onClick={() => goToZone(zid)} className={cx(T.btnOutline, 'h-8 text-xs', T.focus)}>
                        View {z.arch === 'maxillary' ? 'max' : 'mand'} zone {z.n}
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          </div>
          <NoteCallout label="Manual technique" text="Thin, directional PIP brushed in one direction; seat with light pressure on the first molars ~5 s; read show-through, relieve with acrylic burs, re-coat and repeat. Use disclosing wax (≤ 2 mm) for borders." />
        </>
      )}
    </div>
  );
}


/* ========================================================================== */
/* 8. PROCEDURE WORKSPACE                                                     */
/* ========================================================================== */

const TRAY_ICON: Record<TrayGroup['kind'], LucideIcon> = { cassette: Package, burs: Wrench, consumables: Layers };

function TraySetup({ procedure }: { procedure: Procedure }) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const allIds = useMemo(() => procedure.tray.flatMap((g) => g.items.map((i) => `${g.id}:${i.id}`)), [procedure]);
  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const pct = allIds.length ? Math.round((checked.size / allIds.length) * 100) : 0;
  return (
    <SectionCard
      id="tray"
      icon={Package}
      title="Tray setup"
      subtitle={`${checked.size} of ${allIds.length} staged`}
      right={
        <div className="flex items-center gap-2">
          <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800 sm:block">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <button type="button" onClick={() => setChecked(new Set(allIds))} className={cx(T.btnGhost, 'h-8 text-xs', T.focus)}>
            Stage all
          </button>
          <button type="button" onClick={() => setChecked(new Set())} className={cx(T.btnGhost, 'h-8 text-xs', T.focus)}>
            Reset
          </button>
        </div>
      }
    >
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {procedure.tray.map((group) => {
          const Icon = TRAY_ICON[group.kind];
          const groupDone = group.items.every((i) => checked.has(`${group.id}:${i.id}`));
          return (
            <div key={group.id}>
              <div className="mb-2 flex items-center gap-2">
                <Icon className="h-4 w-4 text-amber-700 dark:text-amber-400" aria-hidden />
                <h3 className={cx('text-xs font-semibold uppercase tracking-wider', T.muted)}>{group.title}</h3>
                {groupDone && <Check className="h-4 w-4 text-emerald-600" aria-label="complete" />}
              </div>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const key = `${group.id}:${item.id}`;
                  const on = checked.has(key);
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggle(key)}
                        className={cx('flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-amber-50/70 dark:hover:bg-stone-800/60', T.focus)}
                      >
                        <span
                          className={cx(
                            'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border transition',
                            on ? 'border-emerald-700 bg-emerald-700 text-white dark:border-emerald-500 dark:bg-emerald-500' : 'border-stone-300 bg-white dark:border-stone-600 dark:bg-stone-900',
                          )}
                        >
                          {on && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0">
                          <span className={cx('block text-sm', on ? 'text-stone-400 line-through dark:text-stone-500' : T.body)}>{item.label}</span>
                          {item.detail && <span className={cx('block text-xs', T.muted)}>{item.detail}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function ProtocolSteps({
  procedure,
  timerStates,
  onLaunchTimer,
  done,
  onToggleDone,
}: {
  procedure: Procedure;
  timerStates: Record<string, TimerState>;
  onLaunchTimer: (id: string) => void;
  done: Set<string>;
  onToggleDone: (id: string) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set([procedure.steps[0]?.id].filter(Boolean) as string[]));
  const timerById = useMemo(() => Object.fromEntries(procedure.timers.map((t) => [t.id, t])), [procedure]);
  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allOpen = open.size === procedure.steps.length;
  return (
    <SectionCard
      id="protocol"
      icon={ListChecks}
      title="Chairside protocol"
      subtitle={`${done.size} of ${procedure.steps.length} steps complete`}
      right={
        <button type="button" onClick={() => setOpen(allOpen ? new Set() : new Set(procedure.steps.map((s) => s.id)))} className={cx(T.btnGhost, 'h-8 text-xs', T.focus)}>
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      }
    >
      <ol className="space-y-2.5">
        {procedure.steps.map((step, index) => {
          const isOpen = open.has(step.id);
          const isDone = done.has(step.id);
          return (
            <li
              key={step.id}
              className={cx(
                'rounded-2xl border transition',
                isDone ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/20 dark:bg-emerald-500/5' : 'border-stone-200/80 bg-white/60 dark:border-stone-800 dark:bg-stone-900/40',
              )}
            >
              <div className="flex items-start gap-3 p-3.5">
                <button
                  type="button"
                  onClick={() => onToggleDone(step.id)}
                  aria-label={isDone ? `Mark step ${index + 1} incomplete` : `Mark step ${index + 1} complete`}
                  className={cx(
                    'grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums ring-1 ring-inset transition active:scale-95',
                    isDone
                      ? 'bg-emerald-700 text-white ring-emerald-700 dark:bg-emerald-500 dark:text-stone-950'
                      : 'bg-[#FDFBF7] text-stone-700 ring-stone-300 hover:ring-amber-500 dark:bg-stone-900 dark:text-stone-200 dark:ring-stone-700',
                    T.focus,
                  )}
                >
                  {isDone ? <Check className="h-4 w-4" strokeWidth={3} /> : index + 1}
                </button>
                <button type="button" onClick={() => toggleOpen(step.id)} aria-expanded={isOpen} className={cx('flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left', T.focus)}>
                  <div className="min-w-0 flex-1">
                    <p className={cx('text-sm font-semibold', isDone ? T.muted : T.strong)}>{step.title}</p>
                    {(step.summary || !isOpen) && (
                      <p className={cx('mt-0.5 text-xs', T.muted, !step.summary && 'line-clamp-1')}>{step.summary ?? step.details[0]}</p>
                    )}
                    {(step.checkpoint || step.warning || (step.timerIds?.length ?? 0) > 0) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {step.checkpoint && (
                          <Badge className="bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/10 dark:text-amber-300">
                            <ShieldCheck className="h-3 w-3" aria-hidden />
                            Checkpoint
                          </Badge>
                        )}
                        {step.warning && (
                          <Badge className="bg-rose-50 text-rose-800 ring-rose-700/25 dark:bg-rose-500/10 dark:text-rose-300">
                            <AlertTriangle className="h-3 w-3" aria-hidden />
                            Caution
                          </Badge>
                        )}
                        {step.timerIds?.map((tid) =>
                          timerById[tid] ? (
                            <Badge key={tid} className={TONE[timerById[tid].tone].badge}>
                              <Timer className="h-3 w-3" aria-hidden />
                              {formatDuration(timerById[tid].seconds)}
                            </Badge>
                          ) : null,
                        )}
                      </div>
                    )}
                  </div>
                  <ChevronDown className={cx('mt-1 h-4 w-4 shrink-0 text-stone-400 transition-transform', isOpen && 'rotate-180')} aria-hidden />
                </button>
              </div>
              {isOpen && (
                <div className="space-y-3 px-3.5 pb-4 sm:pl-[60px]">
                  <ul className="space-y-1.5">
                    {step.details.map((d) => (
                      <li key={d} className={cx('flex gap-2 text-sm leading-relaxed', T.body)}>
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-500" aria-hidden />
                        {d}
                      </li>
                    ))}
                  </ul>
                  {step.warning && <CautionCallout text={step.warning} />}
                  {step.tip && <NoteCallout label="Tip" text={step.tip} />}
                  {step.ebdNote && <NoteCallout label="Evidence update" text={step.ebdNote} />}
                  {step.checkpoint && <CheckpointCallout text={step.checkpoint} />}
                  {step.timerIds && step.timerIds.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {step.timerIds.map((tid) => {
                        const preset = timerById[tid];
                        const state = timerStates[tid];
                        if (!preset || !state) return null;
                        return (
                          <button
                            key={tid}
                            type="button"
                            onClick={() => onLaunchTimer(tid)}
                            className={cx(
                              'inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition active:scale-[0.97]',
                              state.running
                                ? 'border-stone-900 bg-stone-900 text-amber-50 dark:border-amber-400 dark:bg-amber-400 dark:text-stone-950'
                                : state.done
                                  ? 'border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200'
                                  : 'border-stone-200 bg-white text-stone-700 hover:border-amber-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200',
                              T.focus,
                            )}
                          >
                            <Play className="h-3.5 w-3.5" aria-hidden />
                            {preset.label}
                            <span className="font-mono tabular-nums">{state.running ? formatClock(state.remaining) : state.done ? 'done' : formatClock(preset.seconds)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}

function TimerRing({ state, tone, size }: { state: TimerState; tone: TimerTone; size: number }) {
  const stroke = Math.max(5, size / 12);
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const progress = state.total ? state.remaining / state.total : 0;
  const warning = state.running && state.remaining <= Math.min(5, state.total * 0.25);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" style={{ width: size, height: size }} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} className="fill-none stroke-stone-200 dark:stroke-stone-800" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        className={cx('fill-none transition-[stroke-dashoffset] duration-200', state.done ? 'stroke-rose-600' : warning ? 'stroke-amber-500' : TONE[tone].ring)}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - progress)}
      />
    </svg>
  );
}

function TimerCard({ preset, state, api }: { preset: TimerPreset; state: TimerState; api: TimerApi }) {
  const warning = state.running && state.remaining <= Math.min(5, state.total * 0.25);
  return (
    <div
      id={`timer-${preset.id}`}
      className={cx(
        'flex items-center gap-3 rounded-2xl border p-3 transition',
        state.done
          ? 'animate-pulse border-rose-300 bg-rose-50 ring-2 ring-rose-300 dark:border-rose-500/40 dark:bg-rose-500/10 dark:ring-rose-500/40'
          : warning
            ? 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10'
            : state.running
              ? 'border-stone-300 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900'
              : 'border-stone-200/80 bg-white/50 dark:border-stone-800 dark:bg-stone-900/40',
      )}
      role="timer"
      aria-live={state.done ? 'assertive' : 'off'}
    >
      <div className="relative shrink-0">
        <TimerRing state={state} tone={preset.tone} size={64} />
        <span
          className={cx(
            'absolute inset-0 grid place-items-center font-mono text-sm font-bold tabular-nums',
            state.done ? 'text-rose-700 dark:text-rose-300' : warning ? 'text-amber-700 dark:text-amber-300' : T.strong,
          )}
        >
          {state.done ? <Bell className="h-5 w-5" aria-label="Complete" /> : formatClock(state.remaining)}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className={cx('truncate text-sm font-semibold', T.strong)}>{preset.label}</p>
        <p className={cx('truncate text-xs', T.muted)}>{state.done ? 'Complete — proceed' : [preset.material, preset.note].filter(Boolean).join(' · ') || TONE[preset.tone].label}</p>
        <div className="mt-2 flex items-center gap-1.5">
          <button type="button" onClick={() => api.toggle(preset.id)} className={cx(T.btnPrimary, 'h-7 px-2.5 text-xs', T.focus)}>
            {state.running ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
            {state.running ? 'Pause' : state.remaining < state.total && !state.done ? 'Resume' : state.done ? 'Restart' : 'Start'}
          </button>
          <button type="button" onClick={() => api.reset(preset.id)} className={cx(T.btnOutline, 'h-7 w-7 !px-0', T.focus)} aria-label={`Reset ${preset.label}`}>
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <Badge className={cx('ml-auto', TONE[preset.tone].badge)}>{formatDuration(preset.seconds)}</Badge>
        </div>
      </div>
    </div>
  );
}

function TimerRail({ presets, api }: { presets: TimerPreset[]; api: TimerApi }) {
  return (
    <section id="timers" className={cx('scroll-mt-44', T.card)}>
      <div className={cx('flex items-center justify-between border-b px-4 py-3', T.divider)}>
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-amber-700 dark:text-amber-400" aria-hidden />
          <h2 className={cx('text-sm font-semibold', T.strong)}>Chairside timers</h2>
        </div>
        <button type="button" onClick={api.resetAll} className={cx(T.btnGhost, 'h-7 text-xs', T.focus)}>
          <RotateCcw className="h-3 w-3" aria-hidden />
          Reset all
        </button>
      </div>
      <div className="grid gap-2.5 p-3 sm:grid-cols-2 xl:grid-cols-1">
        {presets.map((p) => {
          const state = api.timers[p.id];
          return state ? <TimerCard key={p.id} preset={p} state={state} api={api} /> : null;
        })}
      </div>
      <p className={cx('border-t px-4 py-2.5 text-[11px] leading-snug', T.divider, T.muted)}>Times reflect common IFU values — confirm against the product in hand.</p>
    </section>
  );
}

function SpecCell({ column, value }: { column: string; value: string }) {
  const c = column.toLowerCase();
  if (c === 'ideal' || c === 'specification') {
    return <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">{value}</span>;
  }
  if (c === 'minimum') return <span className="font-medium text-orange-800 dark:text-orange-300">{value}</span>;
  if (c === 'instrument') return <span className={cx('font-mono text-xs', T.body)}>{value}</span>;
  if (c === 'source') {
    return (
      <Badge
        className={
          value.toLowerCase().startsWith('manual')
            ? 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300'
            : 'bg-stone-100 text-stone-600 ring-stone-500/20 dark:bg-stone-800 dark:text-stone-300'
        }
      >
        {value}
      </Badge>
    );
  }
  return <span className={T.body}>{value}</span>;
}

function SpecTables({ tables }: { tables: SpecTable[] }) {
  return (
    <SectionCard id="matrix" icon={Ruler} title="Specifications" subtitle={tables.length === 1 ? tables[0].title : `${tables.length} tables`}>
      <div className="space-y-7">
        {tables.map((table) => (
          <div key={table.title}>
            {tables.length > 1 && <h3 className={cx('mb-2 text-xs font-semibold uppercase tracking-wider', T.muted)}>{table.title}</h3>}
            {table.note && (
              <p className={cx('mb-3 flex items-start gap-2 text-xs', T.muted)}>
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
                {table.note}
              </p>
            )}
            <div className="-mx-5 overflow-x-auto">
              <table className={cx('w-full border-collapse text-left text-sm', table.columns.length > 3 && 'min-w-[720px]')}>
                <thead>
                  <tr className={T.tableHead}>
                    {table.columns.map((col, ci) => (
                      <th key={col} scope="col" className={cx('py-2.5 font-semibold', ci === 0 || ci === table.columns.length - 1 ? 'px-5' : 'px-3')}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200/70 dark:divide-stone-800">
                  {table.rows.map((row) => (
                    <tr key={row.join('|')} className={T.row}>
                      {row.map((cell, ci) =>
                        ci === 0 ? (
                          <th key={ci} scope="row" className={cx('w-1/3 px-5 py-3 font-medium', T.strong)}>
                            {cell}
                          </th>
                        ) : (
                          <td key={ci} className={cx('py-3', ci === row.length - 1 ? 'px-5' : 'px-3')}>
                            <SpecCell column={table.columns[ci] ?? ''} value={cell} />
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function DiagramGallery({ keys }: { keys: DiagramKey[] }) {
  return (
    <SectionCard id="diagrams" icon={Layers} title="Clinical schematics" subtitle="Numbered callouts keyed to the legend">
      <div className="grid gap-5 lg:grid-cols-2">
        {keys.map((k) => {
          const d = DIAGRAMS[k];
          return (
            <figure key={k} className={cx('overflow-hidden rounded-2xl border', T.divider)}>
              <div className={cx('border-b px-4 py-2.5', T.divider, T.subtle)}>
                <p className={cx('text-sm font-semibold', T.strong)}>{d.title}</p>
                <p className={cx('text-xs', T.muted)}>{d.caption}</p>
              </div>
              <div className="bg-white p-2 dark:bg-stone-900">
                <d.Render />
              </div>
              <figcaption className={cx('border-t px-4 py-3', T.divider)}>
                <ol className="space-y-1.5">
                  {d.legend.map((item, i) => (
                    <li key={item} className={cx('flex gap-2 text-xs leading-snug', T.body)}>
                      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-amber-500 text-[10px] font-bold text-white">{i + 1}</span>
                      {item}
                    </li>
                  ))}
                </ol>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </SectionCard>
  );
}

function PostOpCard({ items }: { items: string[] }) {
  return (
    <SectionCard
      id="postop"
      icon={FileText}
      title="Post-operative instructions"
      subtitle="Patient-facing — review aloud and hand over"
      right={<CopyButton text={items.map((i) => `• ${i}`).join('\n')} />}
    >
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className={cx('flex gap-2 text-sm leading-relaxed', T.body)}>
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

/** Personal chairside notes, saved to this browser. */
function PearlsCard({ procedureId }: { procedureId: string }) {
  const key = `notes.${procedureId}`;
  const [text, setText] = useState(() => readStorage<string>(key, ''));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'unavailable'>('idle');
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    setStatus('saving');
    const t = window.setTimeout(() => setStatus(writeStorage(key, text) ? 'saved' : 'unavailable'), 450);
    return () => window.clearTimeout(t);
  }, [key, text]);
  return (
    <SectionCard
      id="pearls"
      icon={StickyNote}
      title="My chairside pearls"
      subtitle="Private notes — saved in this browser only"
      right={
        <span className={cx('text-xs', status === 'unavailable' ? 'text-rose-700 dark:text-rose-300' : T.muted)} aria-live="polite">
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'unavailable' ? 'Browser storage unavailable — not saved' : ''}
        </span>
      }
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Your own tips: preferred shade layering, a trick for this matrix system, what to prep ahead…"
        className={cx(T.input, 'min-h-[110px] resize-y py-2.5 leading-relaxed')}
        aria-label="My chairside pearls"
      />
      <p className={cx('mt-2 text-[11px]', T.faint)}>Do not enter patient identifiers.</p>
    </SectionCard>
  );
}

/* --------------------------- Operatory mode ----------------------------- */

function OperatoryMode({
  procedure,
  api,
  done,
  onToggleDone,
  tooth,
  onClose,
}: {
  procedure: Procedure;
  api: TimerApi;
  done: Set<string>;
  onToggleDone: (id: string) => void;
  tooth: ToothInfo | null;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(() => {
    const firstOpen = procedure.steps.findIndex((s) => !done.has(s.id));
    return firstOpen === -1 ? 0 : firstOpen;
  });
  const [timerIdx, setTimerIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const step = procedure.steps[index];
  const timerById = useMemo(() => Object.fromEntries(procedure.timers.map((t) => [t.id, t])), [procedure]);
  const stepTimers = (step?.timerIds ?? []).map((id) => timerById[id]).filter((t): t is TimerPreset => Boolean(t));
  const activeTimer = stepTimers[Math.min(timerIdx, Math.max(0, stepTimers.length - 1))];
  const activeState = activeTimer ? api.timers[activeTimer.id] : undefined;
  const cat = CATEGORY_BY_ID[procedure.category];

  useEffect(() => setTimerIdx(0), [index]);

  useEffect(() => {
    document.documentElement.dataset.operatory = '1';
    rootRef.current?.focus();
    return () => {
      delete document.documentElement.dataset.operatory;
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    };
  }, []);

  const goFullscreen = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    else void el.requestFullscreen?.().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        setIndex((i) => Math.min(procedure.steps.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      } else if (e.key === ' ') {
        e.preventDefault();
        if (activeTimer) api.toggle(activeTimer.id);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setTimerIdx((i) => (stepTimers.length ? (i + 1) % stepTimers.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setTimerIdx((i) => (stepTimers.length ? (i - 1 + stepTimers.length) % stepTimers.length : 0));
      } else if (e.key === 'r' || e.key === 'R') {
        if (activeTimer) api.reset(activeTimer.id);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (step) onToggleDone(step.id);
      } else if (e.key === 'f' || e.key === 'F') {
        goFullscreen();
      } else if (e.key === 'Escape') {
        if (!document.fullscreenElement) onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [procedure.steps.length, activeTimer, stepTimers.length, api, step, onToggleDone, onClose, goFullscreen]);

  if (!step) return null;
  const isDone = done.has(step.id);
  const warning = activeState?.running && activeState.remaining <= Math.min(5, activeState.total * 0.25);

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Operatory mode: ${procedure.title}`}
      className="fixed inset-0 z-[60] flex flex-col bg-[radial-gradient(ellipse_at_top,_#292524_0%,_#0c0a09_60%)] text-stone-100 outline-none"
    >
      <header className="flex items-center gap-4 border-b border-stone-800 px-6 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
            {cat.label}
            {tooth && <span className="ml-3 rounded-md bg-amber-500 px-1.5 py-0.5 font-mono text-stone-950">#{tooth.id}</span>}
          </p>
          <p className="truncate text-lg font-semibold text-stone-100 lg:text-xl">{procedure.title}</p>
        </div>
        <div className="hidden items-center gap-1 lg:flex" aria-hidden>
          {procedure.steps.map((s, i) => (
            <span
              key={s.id}
              className={cx('h-2 rounded-full transition-all', i === index ? 'w-8 bg-amber-400' : done.has(s.id) ? 'w-2 bg-emerald-500' : 'w-2 bg-stone-700')}
            />
          ))}
        </div>
        <button type="button" onClick={goFullscreen} className="inline-flex h-11 items-center gap-2 rounded-xl border border-stone-700 px-3 text-sm font-medium text-stone-200 hover:bg-stone-800">
          <Maximize2 className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Full screen</span>
        </button>
        <button type="button" onClick={onClose} className="inline-flex h-11 items-center gap-2 rounded-xl bg-stone-100 px-4 text-sm font-semibold text-stone-900 hover:bg-white">
          <X className="h-4 w-4" aria-hidden />
          Exit
        </button>
      </header>

      <main className="grid flex-1 gap-8 overflow-y-auto px-6 py-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-12">
        <div className="min-w-0">
          <p className="font-mono text-2xl font-semibold tabular-nums text-amber-400">
            Step {index + 1} <span className="text-stone-500">/ {procedure.steps.length}</span>
            {isDone && <span className="ml-4 rounded-lg bg-emerald-600 px-2 py-0.5 text-base text-white">Done</span>}
          </p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-stone-50 lg:text-6xl">{step.title}</h1>
          <ul className="mt-8 space-y-4">
            {step.details.map((d) => (
              <li key={d} className="flex gap-4 text-xl leading-relaxed text-stone-200 lg:text-2xl">
                <span className="mt-3 h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden />
                {d}
              </li>
            ))}
          </ul>
          {step.warning && (
            <div className="mt-8 flex gap-4 rounded-2xl border-l-8 border-rose-500 bg-rose-500/10 p-5">
              <AlertTriangle className="h-8 w-8 shrink-0 text-rose-400" aria-hidden />
              <p className="text-xl leading-snug text-rose-100">{step.warning}</p>
            </div>
          )}
          {step.checkpoint && (
            <div className="mt-6 flex gap-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5">
              <ShieldCheck className="h-8 w-8 shrink-0 text-amber-400" aria-hidden />
              <div>
                <p className="text-sm font-bold uppercase tracking-widest text-amber-300">Clinical Checkpoint</p>
                <p className="mt-1 text-xl leading-snug text-amber-50">{step.checkpoint}</p>
              </div>
            </div>
          )}
        </div>

        <aside className="flex flex-col items-center gap-5 lg:sticky lg:top-0">
          {activeTimer && activeState ? (
            <>
              <div
                className={cx(
                  'relative grid place-items-center rounded-full',
                  activeState.done && 'animate-pulse ring-8 ring-rose-500/40',
                  warning && 'ring-8 ring-amber-500/30',
                )}
              >
                <TimerRing state={activeState} tone={activeTimer.tone} size={300} />
                <div className="absolute inset-0 grid place-items-center text-center">
                  <div>
                    <p className={cx('font-mono text-7xl font-bold tabular-nums', activeState.done ? 'text-rose-400' : warning ? 'text-amber-300' : 'text-stone-50')}>
                      {activeState.done ? 'DONE' : formatClock(activeState.remaining)}
                    </p>
                    <p className="mt-1 text-lg font-medium text-stone-300">{activeTimer.label}</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => api.toggle(activeTimer.id)}
                  className="inline-flex h-14 min-w-[160px] items-center justify-center gap-2 rounded-2xl bg-amber-500 px-6 text-lg font-bold text-stone-950 shadow-lg shadow-amber-900/40 hover:bg-amber-400 active:scale-[0.98]"
                >
                  {activeState.running ? <Pause className="h-6 w-6" aria-hidden /> : <Play className="h-6 w-6" aria-hidden />}
                  {activeState.running ? 'Pause' : activeState.done ? 'Restart' : 'Start'}
                </button>
                <button
                  type="button"
                  onClick={() => api.reset(activeTimer.id)}
                  className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-stone-700 text-stone-200 hover:bg-stone-800"
                  aria-label="Reset timer"
                >
                  <RotateCcw className="h-6 w-6" />
                </button>
              </div>
              {stepTimers.length > 1 && (
                <div className="flex flex-wrap justify-center gap-2">
                  {stepTimers.map((t, i) => {
                    const s = api.timers[t.id];
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTimerIdx(i)}
                        className={cx(
                          'rounded-xl border px-3 py-2 text-sm font-semibold transition',
                          i === timerIdx ? 'border-amber-400 bg-amber-400/15 text-amber-200' : 'border-stone-700 text-stone-300 hover:bg-stone-800',
                        )}
                      >
                        {t.label} <span className="ml-1 font-mono tabular-nums">{s?.running ? formatClock(s.remaining) : formatDuration(t.seconds)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="w-full rounded-3xl border border-dashed border-stone-700 p-8 text-center">
              <Timer className="mx-auto h-10 w-10 text-stone-600" aria-hidden />
              <p className="mt-3 text-lg text-stone-400">No timed material in this step</p>
            </div>
          )}
        </aside>
      </main>

      <footer className="flex flex-wrap items-center gap-4 border-t border-stone-800 px-6 py-4">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="inline-flex h-14 items-center gap-2 rounded-2xl border border-stone-700 px-6 text-lg font-semibold text-stone-100 hover:bg-stone-800 disabled:opacity-30"
        >
          <ChevronLeft className="h-6 w-6" aria-hidden />
          Previous
        </button>
        <button
          type="button"
          onClick={() => onToggleDone(step.id)}
          className={cx(
            'inline-flex h-14 items-center gap-2 rounded-2xl px-6 text-lg font-semibold',
            isDone ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'border border-emerald-600/60 text-emerald-300 hover:bg-emerald-600/15',
          )}
        >
          <Check className="h-6 w-6" aria-hidden />
          {isDone ? 'Completed' : 'Mark done'}
        </button>
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(procedure.steps.length - 1, i + 1))}
          disabled={index === procedure.steps.length - 1}
          className="inline-flex h-14 items-center gap-2 rounded-2xl bg-stone-100 px-6 text-lg font-semibold text-stone-900 hover:bg-white disabled:opacity-30"
        >
          Next
          <ChevronRight className="h-6 w-6" aria-hidden />
        </button>
        <div className="ml-auto hidden flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-400 xl:flex">
          <span className="inline-flex items-center gap-1.5">
            <Keyboard className="h-4 w-4" aria-hidden />
          </span>
          <span>
            <span className="rounded-md border border-stone-600 bg-stone-800 px-1.5 py-0.5 font-mono text-xs text-stone-200">← →</span> step
          </span>
          <span>
            <span className="rounded-md border border-stone-600 bg-stone-800 px-1.5 py-0.5 font-mono text-xs text-stone-200">Space</span> start/stop
          </span>
          <span>
            <span className="rounded-md border border-stone-600 bg-stone-800 px-1.5 py-0.5 font-mono text-xs text-stone-200">↑ ↓</span> timer
          </span>
          <span>
            <span className="rounded-md border border-stone-600 bg-stone-800 px-1.5 py-0.5 font-mono text-xs text-stone-200">R</span> reset
          </span>
          <span>
            <span className="rounded-md border border-stone-600 bg-stone-800 px-1.5 py-0.5 font-mono text-xs text-stone-200">Enter</span> done
          </span>
          <span>
            <span className="rounded-md border border-stone-600 bg-stone-800 px-1.5 py-0.5 font-mono text-xs text-stone-200">F</span> full screen
          </span>
          <span>
            <span className="rounded-md border border-stone-600 bg-stone-800 px-1.5 py-0.5 font-mono text-xs text-stone-200">Esc</span> exit
          </span>
        </div>
      </footer>
    </div>
  );
}

/* ---------------------------- Procedure view ---------------------------- */

const SECTION_LINKS = [
  { id: 'tray', label: 'Tray', icon: Package },
  { id: 'protocol', label: 'Protocol', icon: ListChecks },
  { id: 'timers', label: 'Timers', icon: Timer },
  { id: 'matrix', label: 'Specs', icon: Ruler },
  { id: 'diagrams', label: 'Diagrams', icon: Layers },
  { id: 'postop', label: 'Post-op', icon: FileText },
  { id: 'pearls', label: 'Pearls', icon: StickyNote },
  { id: 'evidence', label: 'Evidence', icon: BookOpen },
];

function sectionAvailable(p: Procedure, id: string): boolean {
  switch (id) {
    case 'timers':
      return p.timers.length > 0;
    case 'matrix':
      return p.specTables.length > 0;
    case 'diagrams':
      return p.diagrams.length > 0;
    case 'postop':
      return (p.postOp?.length ?? 0) > 0;
    case 'evidence':
      return p.evidence.length > 0;
    default:
      return true;
  }
}

function ProcedureView({
  procedure,
  soundOn,
  stickyTop,
  onBack,
  favorite,
  onToggleFavorite,
  tooth,
  onOpenSoap,
  operatoryNonce = 0,
}: {
  procedure: Procedure;
  soundOn: boolean;
  stickyTop: number;
  onBack: () => void;
  favorite: boolean;
  onToggleFavorite: () => void;
  tooth: ToothInfo | null;
  onOpenSoap: () => void;
  /** Incremented by the utility dock to open operatory mode. */
  operatoryNonce?: number;
}) {
  const cat = CATEGORY_BY_ID[procedure.category];
  const soundRef = useRef(soundOn);
  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);
  const handleComplete = useCallback(() => {
    if (soundRef.current) playAlert();
  }, []);
  const timerApi = useTimers(procedure.timers, handleComplete);
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [operatory, setOperatory] = useState(false);
  const initialNonce = useRef(operatoryNonce);
  useEffect(() => {
    if (operatoryNonce !== initialNonce.current) setOperatory(true);
  }, [operatoryNonce]);
  const toggleDone = useCallback((id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const launchTimer = useCallback(
    (id: string) => {
      timerApi.start(id);
      document.getElementById(`timer-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    [timerApi],
  );
  const toothRelevant = tooth && TOOTH_SCOPE[procedure.id] ? appliesToTooth(procedure.id, tooth) : null;

  return (
    <div className="px-4 pb-32 pt-6 lg:px-8">
      <button type="button" onClick={onBack} className={cx('mb-3 inline-flex items-center gap-1 rounded-lg py-1 pr-2 text-sm font-medium', T.muted, 'hover:text-stone-900 dark:hover:text-stone-100', T.focus)}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
        All {cat.label} procedures
      </button>
      <header className={cx(T.card, 'relative overflow-hidden p-6')}>
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-gradient-to-br from-amber-200/50 to-orange-300/20 blur-3xl dark:from-amber-500/10 dark:to-orange-600/5" aria-hidden />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={ACCENT[cat.accent].badge}>
              <cat.icon className="h-3 w-3" aria-hidden />
              {cat.label}
            </Badge>
            <Badge className="bg-white/70 text-stone-600 ring-stone-400/25 dark:bg-stone-800 dark:text-stone-300">
              <Clock className="h-3 w-3" aria-hidden />
              {formatChairLong(procedure.chairTime)}
            </Badge>
            {tooth && toothRelevant !== null && (
              <Badge
                className={
                  toothRelevant
                    ? 'bg-amber-500 text-white ring-amber-600 dark:text-stone-950'
                    : 'bg-rose-50 text-rose-800 ring-rose-700/20 dark:bg-rose-500/10 dark:text-rose-300'
                }
              >
                #{tooth.id} {toothRelevant ? 'active' : '— not typical for this tooth'}
              </Badge>
            )}
          </div>
          <div className="mt-3 flex items-start justify-between gap-4">
            <h1 className={cx('text-2xl font-semibold tracking-tight sm:text-3xl', T.strong)}>{procedure.title}</h1>
            <button
              type="button"
              onClick={onToggleFavorite}
              aria-pressed={favorite}
              aria-label={favorite ? 'Unpin from favorites' : 'Pin to favorites'}
              className={cx(
                'grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition active:scale-95',
                favorite ? 'border-amber-400 bg-amber-50 text-amber-600 dark:border-amber-500/50 dark:bg-amber-500/15 dark:text-amber-300' : 'border-stone-200 text-stone-400 hover:text-amber-600 dark:border-stone-700',
                T.focus,
              )}
            >
              <Star className={cx('h-5 w-5', favorite && 'fill-current')} />
            </button>
          </div>
          <p className={cx('mt-2 max-w-3xl text-sm leading-relaxed', T.body)}>{procedure.summary}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {procedure.cdtCodes.map((c) => (
              <span key={c.code} className={cx('inline-flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs', T.divider, 'bg-white/60 dark:bg-stone-900/60')}>
                <span className={cx('font-mono font-semibold', T.strong)}>{c.code}</span>
                <span className={T.muted}>{c.descriptor}</span>
              </span>
            ))}
          </div>
          <div className={cx('mt-5 flex flex-wrap items-center gap-2 border-t pt-4', T.divider)}>
            <button type="button" onClick={() => setOperatory(true)} className={cx(T.btnAccent, 'h-10', T.focus)}>
              <Maximize2 className="h-4 w-4" aria-hidden />
              Operatory mode
            </button>
            <button type="button" onClick={onOpenSoap} className={cx(T.btnOutline, 'h-10', T.focus)}>
              <FileText className="h-4 w-4" aria-hidden />
              SOAP note
            </button>
            <nav className="ml-auto flex flex-wrap gap-0.5" aria-label="Sections">
              {SECTION_LINKS.filter((s) => sectionAvailable(procedure, s.id)).map((s) => (
                <button key={s.id} type="button" onClick={() => scrollToId(s.id)} className={cx(T.btnGhost, 'h-8 text-xs', T.focus)}>
                  <s.icon className="h-3.5 w-3.5" aria-hidden />
                  {s.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <div className={cx('mt-6 grid gap-6', procedure.timers.length > 0 && 'xl:grid-cols-[minmax(0,1fr)_330px]')}>
        {procedure.timers.length > 0 && (
          <aside className="self-start xl:sticky xl:col-start-2 xl:row-start-1" style={{ top: stickyTop + 20 }}>
            <TimerRail presets={procedure.timers} api={timerApi} />
          </aside>
        )}
        <div className="min-w-0 space-y-6 xl:col-start-1 xl:row-start-1">
          <TraySetup procedure={procedure} />
          {procedure.widgets?.includes('pedsDose') && (
            <SectionCard id="peds-dose" icon={Syringe} title="Local anesthetic maximum dose" subtitle="Pediatric defaults · weight-based">
              <LADoseCalculator defaultPopulation="pediatric" compact />
            </SectionCard>
          )}
          <ProtocolSteps procedure={procedure} timerStates={timerApi.timers} onLaunchTimer={launchTimer} done={done} onToggleDone={toggleDone} />
          {procedure.specTables.length > 0 && <SpecTables tables={procedure.specTables} />}
          {procedure.diagrams.length > 0 && <DiagramGallery keys={procedure.diagrams} />}
          {procedure.postOp && procedure.postOp.length > 0 && <PostOpCard items={procedure.postOp} />}
          <PearlsCard procedureId={procedure.id} />
          {procedure.evidence.length > 0 && (
            <SectionCard id="evidence" icon={BookOpen} title="Evidence & references" subtitle="Protocol basis — verify against current IFUs">
              <ol className={cx('list-decimal space-y-1.5 pl-5 text-sm', T.body)}>
                {procedure.evidence.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ol>
            </SectionCard>
          )}
        </div>
      </div>

      {operatory && (
        <OperatoryMode procedure={procedure} api={timerApi} done={done} onToggleDone={toggleDone} tooth={tooth} onClose={() => setOperatory(false)} />
      )}
    </div>
  );
}


/* ========================================================================== */
/* 9. APP SHELL                                                               */
/* ========================================================================== */

type ToolId = 'odontogram' | 'dose' | 'cement' | 'endo' | 'medical' | 'denture';

const TOOLS: { id: ToolId; label: string; short: string; icon: LucideIcon; subtitle: string }[] = [
  { id: 'odontogram', label: 'Tooth chart', short: 'Tooth', icon: LayoutGrid, subtitle: 'Set the active tooth across the workbench' },
  { id: 'dose', label: 'Local anesthetic dose', short: 'LA dose', icon: Syringe, subtitle: 'Weight-based maximums, remaining dose and epinephrine' },
  { id: 'cement', label: 'Substrate & cementation', short: 'Cement', icon: Gem, subtitle: 'Conditioning protocol and cement selection by material' },
  { id: 'endo', label: 'Endodontic diagnosis', short: 'Endo Dx', icon: Zap, subtitle: 'AAE pulpal and apical diagnosis with CDT codes' },
  { id: 'medical', label: 'Medical risk & prophylaxis', short: 'Med risk', icon: HeartPulse, subtitle: 'Vitals triage and AHA/ADA antibiotic prophylaxis' },
  { id: 'denture', label: 'Complete denture tools', short: 'Dentures', icon: Smile, subtitle: 'Border-molding zones and PIP troubleshooting' },
];

/* ------------------------------- Header --------------------------------- */

function ThemeSwitch({ value, onChange }: { value: ThemeChoice; onChange: (t: ThemeChoice) => void }) {
  const opts: { v: ThemeChoice; icon: LucideIcon; label: string }[] = [
    { v: 'light', icon: Sun, label: 'Light theme' },
    { v: 'dark', icon: Moon, label: 'Dark theme' },
    { v: 'system', icon: Monitor, label: 'System theme' },
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className="hidden items-center rounded-xl bg-stone-100 p-0.5 dark:bg-stone-800/70 md:flex">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          aria-label={o.label}
          title={o.label}
          onClick={() => onChange(o.v)}
          className={cx(
            'grid h-8 w-8 place-items-center rounded-lg transition',
            value === o.v ? 'bg-white text-amber-600 shadow-sm dark:bg-stone-950 dark:text-amber-300' : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100',
            T.focus,
          )}
        >
          <o.icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

function AppHeader({
  query,
  onQuery,
  searchRef,
  resultCount,
  soundOn,
  onToggleSound,
  onOpenSoap,
  soapEnabled,
  onOpenIndex,
  showIndexButton,
  activeCategory,
  onCategory,
  counts,
  theme,
  onTheme,
  tooth,
  onToothClick,
  onClearTooth,
  favorites,
  onOpenProcedure,
}: {
  query: string;
  onQuery: (q: string) => void;
  searchRef: React.RefObject<HTMLInputElement>;
  resultCount: number;
  soundOn: boolean;
  onToggleSound: () => void;
  onOpenSoap: () => void;
  soapEnabled: boolean;
  onOpenIndex: () => void;
  showIndexButton: boolean;
  activeCategory: CategoryId | 'all';
  onCategory: (c: CategoryId | 'all') => void;
  counts: Record<CategoryId, number>;
  theme: ThemeChoice;
  onTheme: (t: ThemeChoice) => void;
  tooth: ToothInfo | null;
  onToothClick: () => void;
  onClearTooth: () => void;
  favorites: Procedure[];
  onOpenProcedure: (id: string) => void;
}) {
  return (
    <div className={cx('rounded-2xl shadow-lg shadow-stone-900/[0.04]', T.glass)}>
      <div className="flex h-16 items-center gap-2.5 px-3 sm:px-4">
        {showIndexButton && (
          <button type="button" onClick={onOpenIndex} className={cx(T.btnGhost, 'h-9 w-9 !px-0 lg:hidden', T.focus)} aria-label="Open procedure index">
            <Menu className="h-5 w-5" />
          </button>
        )}
        <button type="button" onClick={() => onCategory('all')} className={cx('flex items-center gap-2.5 rounded-xl', T.focus)} aria-label="Chairside home">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-amber-500 via-orange-600 to-rose-800 text-white shadow-sm shadow-orange-900/30">
            <Stethoscope className="h-5 w-5" aria-hidden />
          </span>
          <span className="hidden text-left leading-tight lg:block">
            <span className={cx('block text-sm font-semibold tracking-tight', T.strong)}>Chairside</span>
            <span className={cx('block text-[11px]', T.muted)}>Clinical workbench</span>
          </span>
        </button>

        <div className="relative mx-auto w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                onQuery('');
                e.currentTarget.blur();
              }
            }}
            type="search"
            placeholder="Search procedure, CDT, bur or material…"
            className={cx(T.input, 'h-10 pl-9 pr-16')}
            aria-label="Search procedures"
          />
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
            {query ? (
              <>
                <span className={cx('text-[11px] tabular-nums', T.muted)}>{resultCount}</span>
                <button type="button" onClick={() => onQuery('')} className="rounded p-1 text-stone-400 hover:text-stone-700" aria-label="Clear search">
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <span className="hidden sm:inline">
                <Kbd>/</Kbd>
              </span>
            )}
          </div>
        </div>

        {tooth ? (
          <div className="hidden items-center rounded-xl border border-amber-300 bg-amber-50 pl-1 dark:border-amber-500/40 dark:bg-amber-500/10 sm:flex">
            <button type="button" onClick={onToothClick} className={cx('flex items-center gap-2 rounded-lg px-2 py-1', T.focus)} title={tooth.name}>
              <span className="rounded-md bg-amber-500 px-1.5 font-mono text-sm font-bold text-white dark:text-stone-950">#{tooth.id}</span>
              <span className="hidden max-w-[150px] truncate text-xs font-medium text-amber-900 dark:text-amber-200 xl:inline">{tooth.name}</span>
            </button>
            <button type="button" onClick={onClearTooth} className="grid h-8 w-7 place-items-center text-amber-700 hover:text-amber-950 dark:text-amber-300" aria-label="Clear active tooth">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button type="button" onClick={onToothClick} className={cx(T.btnOutline, 'hidden h-9 sm:inline-flex', T.focus)}>
            <LayoutGrid className="h-4 w-4" aria-hidden />
            <span className="hidden md:inline">Tooth</span>
          </button>
        )}

        <ThemeSwitch value={theme} onChange={onTheme} />
        <button
          type="button"
          onClick={onToggleSound}
          className={cx(T.btnGhost, 'h-9 w-9 !px-0', T.focus)}
          aria-label={soundOn ? 'Mute timer alerts' : 'Unmute timer alerts'}
          title={soundOn ? 'Timer sound on' : 'Timer sound off'}
        >
          {soundOn ? <Bell className="h-[18px] w-[18px]" /> : <BellOff className="h-[18px] w-[18px]" />}
        </button>
        <button
          type="button"
          onClick={onOpenSoap}
          disabled={!soapEnabled}
          title={soapEnabled ? 'Open SOAP note' : 'Open a procedure to write its note'}
          className={cx(T.btnPrimary, 'h-9', T.focus)}
        >
          <FileText className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">SOAP</span>
        </button>
      </div>

      <div className={cx('border-t px-3 py-2 sm:px-4', T.divider)}>
        <nav className="flex gap-1 overflow-x-auto rounded-full bg-stone-100/80 p-1 [scrollbar-width:none] dark:bg-stone-900/80" aria-label="Categories">
          <CategoryChip label="All" active={activeCategory === 'all'} accent="honey" onClick={() => onCategory('all')} />
          {CATEGORIES.map((c) => (
            <CategoryChip
              key={c.id}
              label={c.label}
              icon={c.icon}
              count={counts[c.id]}
              accent={c.accent}
              active={activeCategory === c.id}
              onClick={() => onCategory(c.id)}
            />
          ))}
        </nav>
        {favorites.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]" aria-label="Pinned procedures">
            <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" aria-hidden />
            {favorites.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenProcedure(p.id)}
                className={cx(
                  'shrink-0 rounded-full border border-amber-200 bg-amber-50/80 px-2.5 py-1 text-xs font-medium text-amber-900 transition hover:border-amber-400 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
                  T.focus,
                )}
              >
                {p.shortTitle}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryChip({
  label,
  icon: Icon,
  count,
  accent,
  active,
  onClick,
}: {
  label: string;
  icon?: LucideIcon;
  count?: number;
  accent: AccentKey;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-[0.97]',
        active ? cx(ACCENT[accent].solid, 'shadow-sm') : 'text-stone-600 hover:bg-white hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100',
        T.focus,
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {label}
      {count !== undefined && (
        <span className={cx('rounded-full px-1.5 text-[10px] tabular-nums', active ? 'bg-white/25' : 'bg-stone-200/80 text-stone-500 dark:bg-stone-800 dark:text-stone-400')}>{count}</span>
      )}
    </button>
  );
}

/* ------------------------------- Library -------------------------------- */

function ProcedureIndex({
  procedures,
  matches,
  activeId,
  onSelect,
  query,
  activeCategory,
  favorites,
}: {
  procedures: Procedure[];
  matches: Map<string, MatchResult>;
  activeId: string;
  onSelect: (id: string) => void;
  query: string;
  activeCategory: CategoryId | 'all';
  favorites: Set<string>;
}) {
  const groups = CATEGORIES.filter((c) => activeCategory === 'all' || c.id === activeCategory).map((c) => ({ ...c, items: procedures.filter((p) => p.category === c.id) }));
  const visible = groups.filter((g) => g.items.length);
  return (
    <div className="p-3">
      <p className={cx('px-2 pb-2', T.eyebrow)}>Procedure index</p>
      {visible.length === 0 && <div className={cx('rounded-xl border border-dashed p-4 text-center text-sm', T.divider, T.muted)}>No procedures{query ? ` match “${query}”` : ''}.</div>}
      <div className="space-y-4">
        {visible.map((g) => (
          <div key={g.id}>
            <div className="flex items-center gap-2 px-2 pb-1.5">
              <span className={cx('h-1.5 w-1.5 rounded-full', ACCENT[g.accent].dot)} />
              <p className={cx('text-xs font-semibold', T.body)}>{g.label}</p>
            </div>
            <ul className="space-y-0.5">
              {g.items.map((p) => {
                const active = p.id === activeId;
                const reason = matches.get(p.id)?.reason;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(p.id)}
                      aria-current={active ? 'page' : undefined}
                      className={cx('w-full rounded-xl border-l-2 px-3 py-2 text-left transition', active ? ACCENT[g.accent].soft : 'border-transparent hover:bg-stone-100/80 dark:hover:bg-stone-800/60', T.focus)}
                    >
                      <p className={cx('flex items-center gap-1.5 text-sm font-medium', active ? T.strong : T.body)}>
                        {favorites.has(p.id) && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500" aria-label="Pinned" />}
                        <span className="truncate">{p.shortTitle}</span>
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {p.cdtCodes.slice(0, 2).map((c) => (
                          <CdtBadge key={c.code} code={c.code} />
                        ))}
                        <span className={cx('ml-auto inline-flex items-center gap-1 text-[11px]', T.faint)}>
                          <Clock className="h-3 w-3" aria-hidden />
                          {formatChairShort(p.chairTime)}
                        </span>
                      </div>
                      {reason && <p className="mt-1 truncate text-[11px] text-amber-700 dark:text-amber-400">Match · {reason}</p>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProcedureCard({
  procedure,
  reason,
  onOpen,
  favorite,
  onToggleFavorite,
}: {
  procedure: Procedure;
  reason?: string;
  onOpen: (id: string) => void;
  favorite: boolean;
  onToggleFavorite: (id: string) => void;
}) {
  const cat = CATEGORY_BY_ID[procedure.category];
  const checkpoints = procedure.steps.filter((s) => s.checkpoint).length;
  return (
    <div className={cx('group relative flex h-full flex-col p-5', T.card, T.cardHover)}>
      <div className="flex items-start gap-3 pr-9">
        <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', ACCENT[cat.accent].icon)}>
          <cat.icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <h3 className={cx('text-base font-semibold leading-snug', T.strong)}>
          <button type="button" onClick={() => onOpen(procedure.id)} className="text-left after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-amber-500/60">
            {procedure.title}
          </button>
        </h3>
      </div>
      <button
        type="button"
        onClick={() => onToggleFavorite(procedure.id)}
        aria-pressed={favorite}
        aria-label={favorite ? `Unpin ${procedure.shortTitle}` : `Pin ${procedure.shortTitle}`}
        className={cx(
          'absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-lg transition',
          favorite ? 'text-amber-500' : 'text-stone-300 opacity-0 hover:text-amber-500 group-hover:opacity-100 focus-visible:opacity-100 dark:text-stone-600',
          T.focus,
        )}
      >
        <Star className={cx('h-4 w-4', favorite && 'fill-current')} />
      </button>
      <div className="mt-3 flex flex-wrap gap-1">
        {procedure.cdtCodes.slice(0, 4).map((c) => (
          <CdtBadge key={c.code} code={c.code} />
        ))}
        {procedure.cdtCodes.length > 4 && <Badge className="bg-stone-50 text-stone-500 ring-stone-400/20 dark:bg-stone-800 dark:text-stone-400 dark:ring-stone-600/40">+{procedure.cdtCodes.length - 4}</Badge>}
      </div>
      <p className={cx('mt-3 line-clamp-3 text-sm leading-relaxed', T.body)}>{procedure.summary}</p>
      {reason && <p className="mt-2 truncate text-[11px] text-amber-700 dark:text-amber-400">Match · {reason}</p>}
      <div className="mt-auto pt-4">
        <div className={cx('flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-3 text-xs', T.divider, T.muted)}>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {formatChairLong(procedure.chairTime)}
          </span>
          <span className="inline-flex items-center gap-1">
            <ListChecks className="h-3.5 w-3.5" aria-hidden />
            {procedure.steps.length} steps
          </span>
          {procedure.timers.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Timer className="h-3.5 w-3.5" aria-hidden />
              {procedure.timers.length}
            </span>
          )}
          {checkpoints > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              {checkpoints}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryOverview({
  category,
  procedures,
  matches,
  query,
  onOpen,
  onCategory,
  onClearSearch,
  favorites,
  onToggleFavorite,
  tooth,
  toothFilter,
  onToothFilter,
}: {
  category: CategoryId | 'all';
  procedures: Procedure[];
  matches: Map<string, MatchResult>;
  query: string;
  onOpen: (id: string) => void;
  onCategory: (c: CategoryId | 'all') => void;
  onClearSearch: () => void;
  favorites: Set<string>;
  onToggleFavorite: (id: string) => void;
  tooth: ToothInfo | null;
  toothFilter: boolean;
  onToothFilter: (v: boolean) => void;
}) {
  const cat = category === 'all' ? null : CATEGORY_BY_ID[category];
  const Icon = cat ? cat.icon : BookOpen;
  const groups = (cat ? [cat] : CATEGORIES).map((c) => ({ ...c, items: procedures.filter((p) => p.category === c.id) })).filter((g) => cat || g.items.length > 0);
  const total = procedures.length;
  return (
    <div className="mx-auto max-w-6xl px-4 pb-32 pt-8 lg:px-8">
      <div className="flex items-start gap-4">
        <span className={cx('grid h-14 w-14 shrink-0 place-items-center rounded-2xl shadow-sm', cat ? ACCENT[cat.accent].solid : 'bg-gradient-to-br from-amber-500 via-orange-600 to-rose-800 text-white')}>
          <Icon className="h-7 w-7" aria-hidden />
        </span>
        <div>
          <p className={T.eyebrow}>{cat ? 'Category' : 'Protocol library'}</p>
          <h1 className={cx('text-3xl font-semibold tracking-tight', T.strong)}>{cat ? cat.label : 'All procedures'}</h1>
          <p className={cx('mt-0.5 text-sm', T.muted)}>
            {total} procedure{total === 1 ? '' : 's'}
            {query && <> matching “{query}”</>}
            {tooth && toothFilter && <> for #{tooth.id}</>}
          </p>
        </div>
      </div>

      {tooth && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300/80 bg-amber-50/80 px-4 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10">
          <span className="rounded-md bg-amber-500 px-1.5 font-mono text-sm font-bold text-white dark:text-stone-950">#{tooth.id}</span>
          <span className="text-sm text-amber-950 dark:text-amber-100">{tooth.name}</span>
          <button type="button" onClick={() => onToothFilter(!toothFilter)} className={cx('ml-auto', T.btnOutline, 'h-8 text-xs', T.focus)}>
            {toothFilter ? 'Show all procedures' : `Only procedures for #${tooth.id}`}
          </button>
        </div>
      )}

      {total === 0 ? (
        <div className={cx('mt-10 rounded-2xl border border-dashed p-10 text-center', T.divider)}>
          <p className={cx('text-sm font-medium', T.body)}>
            {query ? `No ${cat ? cat.label + ' ' : ''}procedures match “${query}”.` : tooth && toothFilter ? `No ${cat ? cat.label + ' ' : ''}procedures for #${tooth.id}.` : `No ${cat?.label ?? ''} protocols yet.`}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {query && (
              <button type="button" onClick={onClearSearch} className={cx(T.btnOutline, 'h-9', T.focus)}>
                Clear search
              </button>
            )}
            {cat && (
              <button type="button" onClick={() => onCategory('all')} className={cx(T.btnPrimary, 'h-9', T.focus)}>
                Browse all
              </button>
            )}
          </div>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.id} className="mt-9" aria-label={g.label}>
            {!cat && (
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={cx('h-2 w-2 rounded-full', ACCENT[g.accent].dot)} aria-hidden />
                  <h2 className={cx('text-sm font-semibold', T.strong)}>{g.label}</h2>
                  <span className="rounded-full bg-stone-200/70 px-1.5 text-[11px] tabular-nums text-stone-600 dark:bg-stone-800 dark:text-stone-400">{g.items.length}</span>
                </div>
                <button type="button" onClick={() => onCategory(g.id)} className={cx(T.btnGhost, 'h-8 text-xs', T.focus)}>
                  View category
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            )}
            {g.items.length === 0 ? (
              <p className={cx('rounded-2xl border border-dashed p-6 text-center text-sm', T.divider, T.muted)}>No procedures here{tooth && toothFilter ? ` for #${tooth.id}` : ''}.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {g.items.map((p) => (
                  <ProcedureCard key={p.id} procedure={p} reason={matches.get(p.id)?.reason} onOpen={onOpen} favorite={favorites.has(p.id)} onToggleFavorite={onToggleFavorite} />
                ))}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}

/* ------------------------------ SOAP note ------------------------------- */

const TOOTH_FIELD_KEYS = ['tooth', 'teeth'];
const INJECTION_FIELD_KEYS = ['block', 'injection'];

function applyToothToValues(values: Record<string, string>, procedure: Procedure, tooth: ToothInfo): Record<string, string> {
  const templates = procedure.soap.template + (procedure.labRx ?? '');
  const next = { ...values };
  for (const f of procedure.soap.fields) {
    if (TOOTH_FIELD_KEYS.includes(f.key) && f.type === 'text') {
      next[f.key] = new RegExp(`#\\{\\{${f.key}\\}\\}`).test(templates) ? tooth.id : `#${tooth.id}`;
    }
    if (INJECTION_FIELD_KEYS.includes(f.key) && f.type === 'text') {
      next[f.key] = anesthesiaFor(tooth).soap;
    }
  }
  return next;
}

function initialSoapValues(procedure: Procedure, tooth: ToothInfo | null): Record<string, string> {
  const base = Object.fromEntries(procedure.soap.fields.map((f) => [f.key, f.defaultValue ?? '']));
  return tooth ? applyToothToValues(base, procedure, tooth) : base;
}

function SoapFlyout({ procedure, open, onClose, tooth }: { procedure: Procedure; open: boolean; onClose: () => void; tooth: ToothInfo | null }) {
  const [values, setValues] = useState<Record<string, string>>(() => initialSoapValues(procedure, tooth));
  const [tab, setTab] = useState<'soap' | 'lab'>('soap');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  useEffect(() => {
    if (tooth) setValues((prev) => applyToothToValues(prev, procedure, tooth));
  }, [tooth, procedure]);
  const template = tab === 'lab' && procedure.labRx ? procedure.labRx : procedure.soap.template;
  const note = useMemo(() => fillTemplate(template, values), [template, values]);
  const missing = useMemo(() => missingTemplateKeys(template, values), [template, values]);
  const labelFor = (key: string) => procedure.soap.fields.find((f) => f.key === key)?.label ?? key;
  const set = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));
  const handleCopy = async () => {
    const ok = await copyToClipboard(note);
    setCopyState(ok ? 'copied' : 'error');
    window.setTimeout(() => setCopyState('idle'), 2000);
  };
  const toothKeys = procedure.soap.fields.filter((f) => TOOTH_FIELD_KEYS.includes(f.key) || INJECTION_FIELD_KEYS.includes(f.key)).map((f) => f.key);

  return (
    <Flyout
      open={open}
      onClose={onClose}
      title={tab === 'lab' ? 'Lab Rx' : 'SOAP note'}
      subtitle={`${procedure.shortTitle} · identifier-free template`}
      icon={FileText}
      footer={
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setValues(initialSoapValues(procedure, tooth))} className={cx(T.btnOutline, 'h-11', T.focus)}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            Reset
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className={cx(
              'inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[0.99]',
              copyState === 'copied'
                ? 'bg-emerald-700 text-white'
                : copyState === 'error'
                  ? 'bg-rose-700 text-white'
                  : 'bg-stone-900 text-amber-50 hover:bg-stone-800 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400',
              T.focus,
            )}
          >
            {copyState === 'copied' ? <ClipboardCheck className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
            {copyState === 'copied' ? 'Copied to clipboard' : copyState === 'error' ? 'Copy failed — select text manually' : tab === 'lab' ? 'Copy Lab Rx to Clipboard' : 'Copy Clean Note to Clipboard'}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {procedure.labRx && (
          <Segmented
            label="Document"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'soap', label: 'SOAP note' },
              { value: 'lab', label: 'Lab Rx' },
            ]}
          />
        )}
        {tooth && toothKeys.length > 0 && (
          <p className="flex items-center gap-2 rounded-xl border border-amber-300/70 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            <span className="rounded bg-amber-500 px-1 font-mono font-bold text-white dark:text-stone-950">#{tooth.id}</span>
            Tooth{toothKeys.some((k) => INJECTION_FIELD_KEYS.includes(k)) ? ' and injection' : ''} filled from the active tooth.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {procedure.soap.fields.map((f) => {
            const inputCls = cx(T.input, 'h-10', toothKeys.includes(f.key) && tooth && 'border-amber-300 dark:border-amber-500/40');
            return (
              <FieldLabel key={f.key} label={f.label} className={f.type === 'surfaces' || f.type === 'textarea' ? 'sm:col-span-2' : undefined}>
                {f.type === 'select' && (
                  <select value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} className={inputCls}>
                    {f.options?.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                )}
                {(f.type === 'text' || f.type === 'number') && (
                  <input
                    type={f.type}
                    step={f.step}
                    min={f.type === 'number' ? 0 : undefined}
                    value={values[f.key] ?? ''}
                    placeholder={f.placeholder}
                    onChange={(e) => set(f.key, e.target.value)}
                    className={inputCls}
                  />
                )}
                {f.type === 'textarea' && (
                  <textarea rows={3} value={values[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} className={cx(T.input, 'py-2')} />
                )}
                {f.type === 'surfaces' && (
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Surfaces">
                    {SURFACE_ORDER.map((s) => {
                      const current = values[f.key] ?? '';
                      const on = current.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={on}
                          onClick={() => {
                            const next = on ? current.replace(s, '') : current + s;
                            set(f.key, SURFACE_ORDER.filter((x) => next.includes(x)).join(''));
                          }}
                          className={cx(
                            'h-10 w-11 rounded-xl font-mono text-sm font-bold ring-1 ring-inset transition',
                            on ? 'bg-emerald-700 text-white ring-emerald-700 dark:bg-emerald-500 dark:text-stone-950' : 'bg-white text-stone-600 ring-stone-200 hover:bg-stone-50 dark:bg-stone-900 dark:text-stone-300 dark:ring-stone-700',
                            T.focus,
                          )}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                )}
              </FieldLabel>
            );
          })}
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <p className={cx('text-xs font-semibold uppercase tracking-wider', T.muted)}>Preview</p>
            {missing.length > 0 ? (
              <span className="inline-flex items-center gap-1 text-right text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {missing.length} blank: {missing.map(labelFor).join(', ')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" aria-hidden />
                Complete
              </span>
            )}
          </div>
          <pre className={cx('max-h-[440px] overflow-auto whitespace-pre-wrap rounded-2xl border p-4 font-mono text-xs leading-relaxed', T.divider, 'bg-white/80 text-stone-800 dark:bg-stone-900 dark:text-stone-200')}>
            {note}
          </pre>
        </div>
      </div>
    </Flyout>
  );
}

/* ---------------------------- Utility dock ------------------------------ */

function UtilityDock({ onOpen, active, operatoryAvailable, onOperatory }: { onOpen: (t: ToolId) => void; active: ToolId | null; operatoryAvailable: boolean; onOperatory: () => void }) {
  return (
    <nav aria-label="Chairside utility dock" className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-3">
      <div className={cx('pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-2xl p-1 sm:gap-1 sm:p-1.5 shadow-xl shadow-stone-900/10 [scrollbar-width:none]', T.glass)}>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onOpen(t.id)}
            aria-pressed={active === t.id}
            className={cx(
              'group flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-1.5 py-1.5 text-[10px] font-medium transition active:scale-95 min-[400px]:px-2 min-[400px]:text-[11px] sm:flex-row sm:gap-1.5 sm:px-3 sm:py-2 sm:text-xs',
              active === t.id ? 'bg-stone-900 text-amber-50 dark:bg-amber-500 dark:text-stone-950' : 'text-stone-600 hover:bg-white hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800',
              T.focus,
            )}
            title={t.label}
          >
            <t.icon className="h-[18px] w-[18px] text-amber-600 group-hover:text-amber-700 group-aria-pressed:text-amber-300 dark:text-amber-400 dark:group-aria-pressed:text-stone-950" aria-hidden />
            {t.short}
          </button>
        ))}
        {operatoryAvailable && (
          <>
            <span className="mx-1 h-8 w-px shrink-0 bg-stone-200 dark:bg-stone-700" aria-hidden />
            <button
              type="button"
              onClick={onOperatory}
              className={cx('flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-700 px-3 py-2 text-xs font-semibold text-white shadow-sm active:scale-95', T.focus)}
            >
              <Maximize2 className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Operatory</span>
            </button>
          </>
        )}
      </div>
    </nav>
  );
}

/* --------------------------------- App ---------------------------------- */

export default function ChairsideProtocolApp({ procedures = proceduresData }: { procedures?: Procedure[] }) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryId | 'all'>('all');
  const [activeId, setActiveId] = useState(procedures[0]?.id ?? '');
  const [view, setView] = useState<'overview' | 'procedure'>('overview');
  const [soapOpen, setSoapOpen] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  const [tool, setTool] = useState<ToolId | null>(null);
  const [soundOn, setSoundOn] = useLocalStorage('sound', true);
  const [theme, setTheme] = useTheme();
  const [favoriteIds, setFavoriteIds] = useLocalStorage<string[]>('favorites', []);
  const [toothId, setToothId] = useLocalStorage<string | null>('tooth', null);
  const [toothFilter, setToothFilter] = useState(true);
  const [operatoryNonce, setOperatoryNonce] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const [headerRef, headerHeight] = useElementHeight<HTMLElement>();

  const tooth = useMemo(() => toothInfo(toothId), [toothId]);
  const favorites = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const favoriteProcedures = useMemo(() => favoriteIds.map((id) => procedures.find((p) => p.id === id)).filter((p): p is Procedure => Boolean(p)), [favoriteIds, procedures]);
  const toggleFavorite = useCallback((id: string) => setFavoriteIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])), [setFavoriteIds]);

  const matches = useMemo(() => new Map(procedures.map((p) => [p.id, matchProcedure(p, query)])), [procedures, query]);
  const toothOk = useCallback((p: Procedure) => !(tooth && toothFilter) || appliesToTooth(p.id, tooth), [tooth, toothFilter]);
  const filtered = useMemo(
    () => procedures.filter((p) => matches.get(p.id)?.ok && toothOk(p) && (activeCategory === 'all' || p.category === activeCategory)),
    [procedures, matches, activeCategory, toothOk],
  );
  const counts = useMemo(() => {
    const c = Object.fromEntries(CATEGORIES.map((cat) => [cat.id, 0])) as Record<CategoryId, number>;
    procedures.forEach((p) => {
      if (matches.get(p.id)?.ok && toothOk(p)) c[p.category] += 1;
    });
    return c;
  }, [procedures, matches, toothOk]);

  const active = procedures.find((p) => p.id === activeId) ?? procedures[0];
  const showOverview = view === 'overview' || !active;

  useEffect(() => {
    if (view === 'procedure' && query && filtered.length && !filtered.some((p) => p.id === activeId)) setActiveId(filtered[0].id);
  }, [view, query, filtered, activeId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.documentElement.dataset.operatory) return;
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape') {
        setSoapOpen(false);
        setIndexOpen(false);
        setTool(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selectCategory = (c: CategoryId | 'all') => {
    setActiveCategory(c);
    setView('overview');
    setSoapOpen(false);
    setIndexOpen(false);
    window.scrollTo({ top: 0 });
  };
  const selectProcedure = (id: string) => {
    setActiveId(id);
    setView('procedure');
    setIndexOpen(false);
    setTool(null);
    window.scrollTo({ top: 0 });
  };
  const backToCategory = () => {
    if (active) setActiveCategory(active.category);
    setView('overview');
    window.scrollTo({ top: 0 });
  };
  const chooseTooth = (id: string | null) => {
    setToothId(id);
    if (id) setToothFilter(true);
  };

  const index = (
    <ProcedureIndex procedures={filtered} matches={matches} activeId={active?.id ?? ''} onSelect={selectProcedure} query={query} activeCategory={activeCategory} favorites={favorites} />
  );
  const toolMeta = TOOLS.find((t) => t.id === tool);

  return (
    <div className={cx('min-h-screen font-sans antialiased [font-feature-settings:"cv11","ss01"]', T.page)}>
      <div className="pointer-events-none fixed inset-0 -z-0 bg-[radial-gradient(60rem_40rem_at_100%_-10%,rgba(251,191,36,0.10),transparent),radial-gradient(50rem_30rem_at_-10%_10%,rgba(194,65,12,0.06),transparent)] dark:bg-[radial-gradient(60rem_40rem_at_100%_-10%,rgba(245,158,11,0.07),transparent)]" aria-hidden />
      <header ref={headerRef} className="sticky top-0 z-30 px-3 pt-3">
        <AppHeader
          query={query}
          onQuery={setQuery}
          searchRef={searchRef}
          resultCount={filtered.length}
          soundOn={soundOn}
          onToggleSound={() => setSoundOn((s) => !s)}
          onOpenSoap={() => setSoapOpen(true)}
          soapEnabled={!showOverview}
          onOpenIndex={() => setIndexOpen(true)}
          showIndexButton={!showOverview}
          activeCategory={activeCategory}
          onCategory={selectCategory}
          counts={counts}
          theme={theme}
          onTheme={setTheme}
          tooth={tooth}
          onToothClick={() => setTool('odontogram')}
          onClearTooth={() => chooseTooth(null)}
          favorites={favoriteProcedures}
          onOpenProcedure={selectProcedure}
        />
      </header>

      <div className="relative mx-auto flex max-w-[1600px]">
        {!showOverview && (
          <aside className="sticky hidden w-72 shrink-0 overflow-y-auto lg:block" style={{ top: headerHeight + 8, height: `calc(100vh - ${headerHeight + 8}px)` }}>
            <div className="pb-28">{index}</div>
          </aside>
        )}
        <main className="min-w-0 flex-1">
          {showOverview || !active ? (
            <CategoryOverview
              category={activeCategory}
              procedures={filtered}
              matches={matches}
              query={query}
              onOpen={selectProcedure}
              onCategory={selectCategory}
              onClearSearch={() => setQuery('')}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              tooth={tooth}
              toothFilter={toothFilter}
              onToothFilter={setToothFilter}
            />
          ) : (
            <ProcedureView
              key={active.id}
              procedure={active}
              soundOn={soundOn}
              stickyTop={headerHeight}
              onBack={backToCategory}
              favorite={favorites.has(active.id)}
              onToggleFavorite={() => toggleFavorite(active.id)}
              tooth={tooth}
              onOpenSoap={() => setSoapOpen(true)}
              operatoryNonce={operatoryNonce}
            />
          )}
        </main>
      </div>

      <UtilityDock onOpen={(t) => setTool(t)} active={tool} operatoryAvailable={!showOverview} onOperatory={() => setOperatoryNonce((n) => n + 1)} />

      {/* Mobile index drawer */}
      <div className={cx('fixed inset-0 z-40 lg:hidden', !indexOpen && 'pointer-events-none')} aria-hidden={!indexOpen}>
        <div className={cx('absolute inset-0 bg-stone-950/30 transition-opacity', indexOpen ? 'opacity-100' : 'opacity-0')} onClick={() => setIndexOpen(false)} />
        <div className={cx('absolute inset-y-0 left-0 w-80 max-w-[85vw] overflow-y-auto shadow-2xl transition-transform duration-300', 'bg-[#FDFBF7] dark:bg-stone-950', indexOpen ? 'translate-x-0' : '-translate-x-full')}>
          <div className={cx('flex items-center justify-between border-b px-4 py-3', T.divider)}>
            <p className={cx('text-sm font-semibold', T.strong)}>Procedures</p>
            <button type="button" onClick={() => setIndexOpen(false)} className={cx(T.btnGhost, 'h-9 w-9 !px-0')} aria-label="Close index">
              <X className="h-5 w-5" />
            </button>
          </div>
          {index}
        </div>
      </div>

      {active && <SoapFlyout key={active.id} procedure={active} open={soapOpen && !showOverview} onClose={() => setSoapOpen(false)} tooth={tooth} />}

      <Flyout open={tool === 'odontogram'} onClose={() => setTool(null)} title="Tooth chart" subtitle={TOOLS[0].subtitle} icon={LayoutGrid}>
        <OdontogramPanel procedures={procedures} tooth={tooth} onTooth={chooseTooth} filterOn={toothFilter} onFilter={setToothFilter} onOpenProcedure={selectProcedure} />
      </Flyout>
      <Flyout open={tool === 'dose'} onClose={() => setTool(null)} title="Local anesthetic dose" subtitle={TOOLS[1].subtitle} icon={Syringe} width="max-w-3xl">
        <LADoseCalculator />
      </Flyout>
      <Flyout open={tool === 'cement'} onClose={() => setTool(null)} title="Substrate & cementation" subtitle={TOOLS[2].subtitle} icon={Gem} width="max-w-3xl">
        <CementationPanel soundOn={soundOn} />
      </Flyout>
      <Flyout open={tool === 'endo'} onClose={() => setTool(null)} title="Endodontic diagnosis" subtitle={TOOLS[3].subtitle} icon={Zap}>
        <EndoPanel tooth={tooth} />
      </Flyout>
      <Flyout open={tool === 'medical'} onClose={() => setTool(null)} title="Medical risk & prophylaxis" subtitle={TOOLS[4].subtitle} icon={HeartPulse}>
        <MedicalRiskPanel />
      </Flyout>
      <Flyout open={tool === 'denture'} onClose={() => setTool(null)} title="Complete denture tools" subtitle={TOOLS[5].subtitle} icon={Smile} width="max-w-3xl">
        <DentureToolsPanel />
      </Flyout>
      {toolMeta && <span className="sr-only" aria-live="polite">{toolMeta.label} opened</span>}
    </div>
  );
}

