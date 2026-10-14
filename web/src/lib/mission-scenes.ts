import hematologyInvestigation from '../assets/mission-hematology-investigation.webp';
import hematologySample from '../assets/mission-hematology-sample.webp';
import hematologySmear from '../assets/mission-hematology-smear.webp';
import microbiologyCulture from '../assets/mission-microbiology-culture.webp';
import microbiologyStain from '../assets/mission-microbiology-stain.webp';
import biochemistryAcidBase from '../assets/mission-biochemistry-acid-base.webp';
import biochemistryKidney from '../assets/mission-biochemistry-kidney.webp';
import biochemistryPanel from '../assets/mission-biochemistry-panel.webp';
import masterScene from '../assets/lab-master.webp';

export type MissionScene = { src: string; alt: string; label: string };

/** Illustrative framing only; correctness remains exclusively server-controlled. */
const scene = (src: string, label: string): MissionScene => ({ src, alt: 'Illustrative laboratory scene', label });
const SCENES: Record<string, MissionScene> = {
  'hem-01': scene(hematologySmear, 'Hematology evidence scene'),
  'hem-02': scene(hematologySample, 'Pre-analytical sample scene'),
  'hem-03': scene(hematologyInvestigation, 'Hematology investigation scene'),
  'mic-01': scene(microbiologyStain, 'Microbiology stain scene'),
  'mic-02': scene(microbiologyStain, 'Microbiology stain scene'),
  'mic-03': scene(microbiologyCulture, 'Microbiology culture scene'),
  'bio-01': scene(biochemistryKidney, 'Biochemistry kidney scene'),
  'bio-02': scene(biochemistryPanel, 'Biochemistry panel scene'),
  'bio-03': scene(biochemistryAcidBase, 'Acid-base scene'),
  'master-1': scene(masterScene, 'Master case scene'),
  'master-2': scene(masterScene, 'Master board scene'),
  'master-3': scene(masterScene, 'Master console scene'),
  'master-4': scene(masterScene, 'Master exit scene'),
};

export const missionScene = (stepId: string) => {
  const family = stepId.startsWith('master-s') ? `master-${stepId.at(-1)}` : stepId.split('-s')[0];
  return SCENES[family];
};
