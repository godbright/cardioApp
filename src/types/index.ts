// ─── Patient & session data ───────────────────────────────────────────────────

export type HeartSoundStatus =
  | 'none'
  | 'normal'
  | 'abnormal-pending'
  | 'abnormal-confirmed'
  | 'inconclusive';

export type HeartRhythmStatus = 'none' | 'ecg-captured';

export interface Patient {
  id: string;
  name: string;
  age: number;
  sex: 'M' | 'F' | 'O' | '';
  lastExam: string;
  hs: HeartSoundStatus;
  hr: HeartRhythmStatus;
  rhd?: 'yes' | 'no' | 'unknown' | '';
  height?: number | null;
  weight?: number | null;
  bpSys?: number | null;
  bpDia?: number | null;
  hsPosture?: Posture;
  hrPosture?: Posture;
  hsSite?: string;
  hrLead?: string;
  hsConfidence?: string;
  hsModel?: string;
}

// ─── Capture flow ─────────────────────────────────────────────────────────────

export type Modality = 'pcg' | 'ecg';

export type CapturePhase =
  | 'gate'
  | 'positioning'
  | 'ready'
  | 'recording'
  | 'analyzing';

export type Posture = 'sitting' | 'supine' | 'left-lateral';

export interface CaptureResult {
  kind: 'normal' | 'abnormal' | 'inconclusive' | 'ecg';
  online?: boolean;
  confidence?: string;
  model?: string;
}

// ─── Bluetooth ────────────────────────────────────────────────────────────────

export type BluetoothStatus = 'connected' | 'reconnecting' | 'notfound';

// ─── App navigation views ─────────────────────────────────────────────────────

export type AppView =
  | 'language'
  | 'provisioning'
  | 'login'
  | 'history'
  | 'dashboard'
  | 'patient'
  | 'hub'
  | 'patientHistory'
  | 'position'
  | 'capture'
  | 'result'
  | 'measure'
  | 'settings';

// ─── App state ────────────────────────────────────────────────────────────────

export interface AppState {
  view: AppView;
  lang: string | null;
  worker: string | null;
  deviceId: string;
  deviceSiteId: string;
  loginId: string;
  loginPin: string;
  conn: BluetoothStatus;
  deviceName: string;
  search: string;
  page: number;
  editing: boolean;
  selected: Record<string, boolean>;
  filter: FilterOption;
  filterOpen: boolean;
  exportOpen: boolean;
  currentPatient: Patient | null;
  modality: Modality | null;
  site: string | null;
  capturePhase: CapturePhase;
  quality: number;
  recProgress: number;
  result: CaptureResult | null;
  showGuide: boolean;
  confirmDelete: boolean;
  measureModality: Modality | null;
  measureTab: string | null;
  measureReturnTo: AppView;
  audioPlaying: number | null;
  posture: Posture;
  videoGuidesEnabled: boolean;
  connectivity: 'online' | 'offline';
  sideNavOpen: boolean;
  sessionCapturedSites: string[];   // PCG valve sites captured in this pass
  sessionCapturedLeads: string[];   // ECG leads captured in this pass
  // form fields
  formName: string;
  formAge: string;
  formSex: string;
  formRhd: string;
  formHeight: string;
  formWeight: string;
  formBpSys: string;
  formBpDia: string;
  formError: string;
  patients: Patient[];
}

// ─── Filter ───────────────────────────────────────────────────────────────────

export type FilterOption =
  | 'all'
  | 'abnormal-confirmed'
  | 'abnormal-pending'
  | 'normal'
  | 'inconclusive'
  | 'none';

// ─── Status view model ───────────────────────────────────────────────────────

export interface StatusVM {
  label: string;
  color: string;
  dot: string;
}

// ─── Auscultation sites (placeholders — clinical team to confirm) ─────────────

export interface SiteCard {
  id: string;
  tag: string;
  label: string;
  instr: string;
}

// ─── ECG leads (placeholders — pending Rijuven SDK) ──────────────────────────

export interface LeadCard {
  id: string;
  tag: string;
  label: string;
  instr: string;
}

// ─── Measurement detail ───────────────────────────────────────────────────────

export interface MeasureTab {
  id: string;
  label: string;
  subLabel: string;
  dot: string;
}

export interface MeasureMetrics {
  abn: boolean;
  verdict: string;
  // ECG
  bpm?: number;
  rr?: number;
  pr?: number;
  qrs?: number;
  qt?: number;
  qtc?: number;
  // PCG
  hr?: number;
  rrSd?: number;
  sys?: number;
  dia?: number;
  conf?: number;
}

// ─── Navigation stack params ─────────────────────────────────────────────────

export type RootStackParamList = {
  Language: undefined;
  Login: undefined;
  History: undefined;
  Patient: undefined;
  SessionHub: undefined;
  PositionSelect: undefined;
  Guide: undefined;
  Capture: undefined;
  Result: undefined;
  Measurements: undefined;
  Settings: undefined;
};
