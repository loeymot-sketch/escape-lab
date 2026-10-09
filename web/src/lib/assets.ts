import bloodSmearHero from '../assets/blood-smear-hero.webp';
import chemistryPanel from '../assets/chemistry-panel.svg';

export type ScientificAsset = {
  id: string;
  label: string;
  status: 'illustrative' | 'validated';
  src: string;
  /** Natural size of the artwork. The image is always rendered at this aspect ratio so percentages map 1:1. */
  width: number;
  height: number;
  /** Text version of an image whose content is itself a table of values (R36 B36-001). Only offered where it cannot give the answer away. */
  textAlternative?: AssetTextAlternative;
};

export type AssetTextRow = {
  test: string;
  result: string;
  unit: string;
  reference: string;
  flag: string;
  /** Centre of this result cell, in percent of the artwork: the point the server receives when the row is chosen instead of a click. */
  x: number;
  y: number;
};

export type AssetTextAlternative = {
  caption: string;
  /** Specimen indices drawn above the table, in reading order. */
  indices: string[];
  rows: AssetTextRow[];
};

/** The catalogue is deliberately explicit: placeholder imagery is never presented as validated science. */
export const SCIENTIFIC_ASSETS: Record<string, ScientificAsset> = {
  'smear-schistocyte-01': { id: 'smear-schistocyte-01', label: 'Stylised blood smear', status: 'illustrative', src: bloodSmearHero, width: 1672, height: 941 },
  'panel-hemolysis-01': {
    id: 'panel-hemolysis-01', label: 'Stylised chemistry panel', status: 'illustrative', src: chemistryPanel, width: 1600, height: 900,
    // Transcribed from the text of chemistry-panel.svg (assets.test.ts compares every cell with the SVG). The values are the picture's own: nothing is added, reordered or interpreted.
    textAlternative: {
      caption: 'Chemistry panel with specimen indices (illustrative training image, not a real report)',
      indices: ['Hemolysis index 3+', 'Icterus index 0', 'Lipemia index 0'],
      rows: [
        { test: 'Sodium', result: '139', unit: 'mmol/L', reference: '135 - 145', flag: '', x: 55, y: 36.1 },
        { test: 'Potassium', result: '6.4', unit: 'mmol/L', reference: '3.5 - 5.1', flag: 'H', x: 55, y: 43.9 },
        { test: 'Chloride', result: '103', unit: 'mmol/L', reference: '98 - 107', flag: '', x: 55, y: 51.7 },
        { test: 'Bicarbonate', result: '24', unit: 'mmol/L', reference: '22 - 29', flag: '', x: 55, y: 59.4 },
        { test: 'Urea', result: '5.1', unit: 'mmol/L', reference: '2.5 - 7.8', flag: '', x: 55, y: 67.2 },
        { test: 'Creatinine', result: '78', unit: 'µmol/L', reference: '55 - 100', flag: '', x: 55, y: 75 },
        { test: 'Glucose', result: '5.4', unit: 'mmol/L', reference: '3.9 - 5.6', flag: '', x: 55, y: 82.8 },
        { test: 'Calcium', result: '2.35', unit: 'mmol/L', reference: '2.15 - 2.55', flag: '', x: 55, y: 90.6 },
      ],
    },
  },
};
