import type { SiteCard, LeadCard } from '../types';

export const AUSCULTATION_SITES: SiteCard[] = [
  {
    id: 'aortic',
    tag: 'AS site',
    label: 'Aortic area',
    instr: 'Right of the upper chest, beside the breastbone (2nd intercostal space).',
  },
  {
    id: 'pulmonary',
    tag: 'Secondary',
    label: 'Pulmonary area',
    instr: 'Left of the upper chest, beside the breastbone (2nd intercostal space).',
  },
  {
    id: 'tricuspid',
    tag: 'Right heart',
    label: 'Tricuspid area',
    instr: 'Lower left sternal border, 4th intercostal space.',
  },
  {
    id: 'mitral',
    tag: 'Apex',
    label: 'Mitral area',
    instr: 'Lower left chest at the apex (5th ICS, midclavicular line).',
  },
];

export const ECG_LEADS: LeadCard[] = [
  {
    id: 'L1',
    tag: 'Standard',
    label: 'Lead I',
    instr: 'Right arm (−) to left arm (+) — records lateral activity; first lead of the frontal plane',
  },
  {
    id: 'L2',
    tag: 'Standard',
    label: 'Lead II',
    instr: 'Right arm (−) to left leg (+) — best view of inferior wall; commonly used for rhythm monitoring',
  },
  {
    id: 'L3',
    tag: 'Standard',
    label: 'Lead III',
    instr: 'Left arm (−) to left leg (+) — completes the Einthoven triangle; inferior wall',
  },
  {
    id: 'aVR',
    tag: 'Augmented',
    label: 'Lead aVR',
    instr: 'Augmented voltage right — looks at the heart from the right shoulder; inverted in normal rhythm',
  },
  {
    id: 'aVL',
    tag: 'Augmented',
    label: 'Lead aVL',
    instr: 'Augmented voltage left — lateral wall; high lateral MI territory',
  },
  {
    id: 'aVF',
    tag: 'Augmented',
    label: 'Lead aVF',
    instr: 'Augmented voltage foot — inferior wall; pairs with L2 and L3',
  },
];

export function getSiteById(id: string): SiteCard | LeadCard | undefined {
  return [...AUSCULTATION_SITES, ...ECG_LEADS].find(s => s.id === id);
}
