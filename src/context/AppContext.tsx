import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { AUSCULTATION_SITES, ECG_LEADS } from '../constants/sites';
import { DEMO_MODE } from '../demo';
import { SettingsService } from '../services/settingsService';
import { loadAllPatients, savePatient as dbSavePatient, softDeletePatient as dbSoftDeletePatient } from '../services/patientService';
import { saveCapture as dbSaveCapture, closeSession as dbCloseSession } from '../services/captureService';
import { onStage2Result, triggerFlush } from '../services/syncQueue';
import { store } from '../store';
import { logoutAuth } from '../store/slices/authSlice';
import type {
  AppState,
  AppView,
  Patient,
  Modality,
  CaptureResult,
  CapturePhase,
  Posture,
  FilterOption,
  BluetoothStatus,
} from '../types';

// No seed patients — the list starts empty and is populated by real screening sessions.

// ─── Initial state ────────────────────────────────────────────────────────────

const INITIAL_STATE: AppState = {
  view: 'language',
  lang: null,
  worker: null,
  deviceId: '',
  deviceSiteId: '',
  loginId: '',
  loginPin: '',
  conn: DEMO_MODE ? 'connected' : 'notfound',
  deviceName: DEMO_MODE ? 'CardioSleeve Demo' : '',
  search: '',
  page: 0,
  editing: false,
  selected: {},
  filter: 'all',
  filterOpen: false,
  exportOpen: false,
  currentPatient: null,
  modality: null,
  site: null,
  capturePhase: 'positioning',
  quality: 0,
  recProgress: 0,
  result: null,
  showGuide: false,
  confirmDelete: false,
  measureModality: null,
  measureTab: null,
  measureReturnTo: 'hub',
  audioPlaying: null,
  posture: 'sitting',
  videoGuidesEnabled: true,
  connectivity: 'offline',
  sideNavOpen: false,
  sessionCapturedSites: [],
  sessionCapturedLeads: [],
  formName: '',
  formAge: '',
  formSex: '',
  formRhd: '',
  formHeight: '',
  formWeight: '',
  formBpSys: '',
  formBpDia: '',
  formError: '',
  patients: [],
};

// ─── Action types ─────────────────────────────────────────────────────────────

type Action =
  | { type: 'SET_VIEW'; view: AppView }
  | { type: 'SET_LANG'; lang: string }
  | { type: 'SET_WORKER'; worker: string | null }
  | { type: 'SET_FIELD'; key: keyof AppState; value: AppState[keyof AppState] }
  | { type: 'SET_PATIENTS'; patients: Patient[] }
  | { type: 'UPSERT_PATIENT'; patient: Patient }
  | { type: 'DELETE_PATIENT'; id: string }
  | { type: 'SET_CURRENT_PATIENT'; patient: Patient | null }
  | { type: 'SET_CONN'; status: BluetoothStatus }
  | { type: 'SET_CAPTURE_PHASE'; phase: CapturePhase }
  | { type: 'SET_QUALITY'; quality: number; recProgress?: number }
  | { type: 'SET_RESULT'; result: CaptureResult | null }
  | { type: 'TOGGLE_SELECT'; id: string }
  | { type: 'CLEAR_SELECTED' }
  | { type: 'SELECT_ALL'; ids: string[]; select: boolean }
  | { type: 'OPEN_SIDE_NAV' }
  | { type: 'CLOSE_SIDE_NAV' }
  | { type: 'PATCH'; patch: Partial<AppState> };

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, view: action.view };
    case 'SET_LANG':
      return { ...state, lang: action.lang };
    case 'SET_WORKER':
      return { ...state, worker: action.worker };
    case 'SET_FIELD':
      return { ...state, [action.key]: action.value };
    case 'SET_PATIENTS':
      return { ...state, patients: action.patients };
    case 'UPSERT_PATIENT': {
      const exists = state.patients.some(p => p.id === action.patient.id);
      return {
        ...state,
        patients: exists
          ? state.patients.map(p => p.id === action.patient.id ? action.patient : p)
          : [action.patient, ...state.patients],
      };
    }
    case 'DELETE_PATIENT': {
      const sel = { ...state.selected };
      delete sel[action.id];
      return {
        ...state,
        patients: state.patients.filter(p => p.id !== action.id),
        selected: sel,
        currentPatient: state.currentPatient?.id === action.id ? null : state.currentPatient,
      };
    }
    case 'SET_CURRENT_PATIENT':
      return { ...state, currentPatient: action.patient };
    case 'SET_CONN':
      return { ...state, conn: action.status };
    case 'SET_CAPTURE_PHASE':
      return { ...state, capturePhase: action.phase };
    case 'SET_QUALITY':
      return { ...state, quality: action.quality, recProgress: action.recProgress ?? state.recProgress };
    case 'SET_RESULT':
      return { ...state, result: action.result };
    case 'TOGGLE_SELECT': {
      const sel = { ...state.selected };
      if (sel[action.id]) { delete sel[action.id]; } else { sel[action.id] = true; }
      return { ...state, selected: sel };
    }
    case 'CLEAR_SELECTED':
      return { ...state, selected: {} };
    case 'SELECT_ALL': {
      const sel = { ...state.selected };
      action.ids.forEach(id => { if (action.select) { sel[id] = true; } else { delete sel[id]; } });
      return { ...state, selected: sel };
    }
    case 'OPEN_SIDE_NAV':
      return { ...state, sideNavOpen: true };
    case 'CLOSE_SIDE_NAV':
      return { ...state, sideNavOpen: false };
    case 'PATCH':
      return { ...state, ...action.patch };
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  // Convenience action creators
  navigate: (view: AppView) => void;
  pickLang: (code: string) => void;
  signIn: (id?: string, pin?: string) => void;
  logout: () => void;
  goBack: () => void;
  nextCode: () => string;
  newPatient: () => void;
  editPatient: () => void;
  savePatient: () => void;
  openPatient: (p: Patient) => void;
  startModality: (m: Modality) => void;
  selectSite: (siteId: string) => void;
  startCaptureFromGuide: () => void;
  beginCapture: (siteId: string) => void;
  onCancel: () => void;
  onRecord: () => void;
  setPosture: (p: Posture) => void;
  finishCapture: (s1?: { verdict: 'normal' | 'abnormal' | 'inconclusive'; confidence: string; model: string }) => void;
  applyAndReturn: () => void;   // kept for back-compat; prefer nextCapture / returnToHub
  nextCapture: () => void;
  returnToHub: () => void;
  retryCapture: () => void;
  finishSession: () => void;
  doneWithPatient: () => void;
  openMeasure: (m: Modality, returnTo?: AppView) => void;
  openPatientHistory: () => void;
  askDelete: () => void;
  cancelDelete: () => void;
  deletePatient: () => void;
  toggleVideo: () => void;
  resetLaunch: () => void;
  statusVM: (code: string) => { label: string; color: string };
  openSideNav: () => void;
  closeSideNav: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  // Load persisted data from WatermelonDB once on mount.
  // Settings and patients load in parallel — they write to independent parts of state.
  useEffect(() => {
    SettingsService.getAll().then(settings => {
      const lang         = settings.language;
      const videoGuides  = settings.videoGuidesEnabled !== 'false';
      const deviceSiteId = settings.siteId?.trim() ?? '';
      const deviceId     = settings.deviceId?.trim() ?? '';
      if (lang) {
        // Language already set — skip language screen. Route to provisioning if the
        // device hasn't been set up yet, otherwise straight to login.
        const view = deviceId ? 'login' : 'provisioning';
        dispatch({ type: 'PATCH', patch: { lang, videoGuidesEnabled: videoGuides, deviceSiteId, deviceId, view } });
      } else {
        dispatch({ type: 'PATCH', patch: { videoGuidesEnabled: videoGuides, deviceSiteId, deviceId } });
      }
    }).catch(() => {
      // DB not ready on first launch — stay on language screen.
    });

    loadAllPatients().then(patients => {
      dispatch({ type: 'SET_PATIENTS', patients });
    }).catch(e => {
      console.warn('[AppContext] Failed to load patients from DB:', e);
    });

    // When the sync worker receives a Stage 2 confirmation, reload the patient
    // list so 'abnormal-pending' → 'abnormal-confirmed' is reflected immediately.
    onStage2Result(() => {
      loadAllPatients()
        .then(patients => dispatch({ type: 'SET_PATIENTS', patients }))
        .catch(e => console.warn('[AppContext] Stage 2 reload failed:', e));
    });
  }, []);

  const navigate = useCallback((view: AppView) => dispatch({ type: 'SET_VIEW', view }), []);

  const pickLang = useCallback((code: string) => {
    // After language is chosen, go to provisioning if the device hasn't been set up yet.
    const nextView = !state.deviceId ? 'provisioning' : state.worker ? 'history' : 'login';
    dispatch({ type: 'PATCH', patch: { lang: code, view: nextView } });
    SettingsService.setLanguage(code).catch(() => {});
  }, [state.worker, state.deviceId]);

  const signIn = useCallback((idParam?: string, _pin?: string) => {
    const id = (idParam ?? state.loginId ?? '').trim();
    if (!id) return;
    dispatch({ type: 'PATCH', patch: { worker: id, view: 'history', loginPin: '' } });
  }, [state.loginId]);

  const logout = useCallback(() => {
    store.dispatch(logoutAuth());
    dispatch({ type: 'PATCH', patch: { worker: null, view: 'login', currentPatient: null, loginId: '', loginPin: '', selected: {} } });
  }, []);

  const goBack = useCallback(() => {
    const v = state.view;
    if (v === 'measure') {
      navigate(state.measureReturnTo);
    } else if (v === 'position') {
      const isPcg  = state.modality === 'pcg';
      const done   = isPcg ? state.sessionCapturedSites : state.sessionCapturedLeads;
      const total  = isPcg ? AUSCULTATION_SITES.length  : ECG_LEADS.length;
      if (done.length > 0 && done.length < total) {
        Alert.alert(
          isPcg ? 'Exit Heart Sound?' : 'Exit ECG Capture?',
          isPcg
            ? `You've captured ${done.length} of ${total} valve sites. Progress is saved — you can continue from the patient overview.`
            : `You've captured ${done.length} of ${total} leads. Progress is saved — you can continue from the patient overview.`,
          [
            { text: 'Continue capturing', style: 'cancel' },
            { text: 'Exit to overview', onPress: () => navigate('hub') },
          ],
        );
      } else {
        navigate('hub');
      }
    } else if (v === 'patientHistory') {
      navigate('hub');
    } else if (v === 'hub' || v === 'patient') {
      navigate('history');
    } else if (v === 'dashboard' || v === 'settings') {
      navigate('history');
    } else {
      navigate('history');
    }
  }, [state.view, state.modality, state.sessionCapturedSites, state.sessionCapturedLeads, state.measureReturnTo, navigate]);

  const nextCode = useCallback((): string => {
    let max = 0;
    state.patients.forEach(p => {
      const n = parseInt(String(p.id).replace(/\D/g, ''), 10);
      if (!isNaN(n) && n > max) max = n;
    });
    // Use the provisioned site ID (e.g. "CHUK") so codes read "CHUK-001".
    // Falls back to "PT" if the device hasn't been provisioned yet.
    const prefix = state.deviceSiteId || 'PT';
    return `${prefix}-${String(max + 1).padStart(3, '0')}`;
  }, [state.patients, state.deviceSiteId]);

  const newPatient = useCallback(() => {
    dispatch({ type: 'PATCH', patch: { view: 'patient', editing: false, formName: '', formAge: '', formSex: '', formRhd: '', formHeight: '', formWeight: '', formBpSys: '', formBpDia: '', formError: '' } });
  }, []);

  const editPatient = useCallback(() => {
    const p = state.currentPatient;
    if (!p) return;
    dispatch({ type: 'PATCH', patch: { view: 'patient', editing: true, formName: p.name || '', formAge: p.age ? String(p.age) : '', formSex: p.sex || '', formRhd: p.rhd || '', formHeight: p.height ? String(p.height) : '', formWeight: p.weight ? String(p.weight) : '', formBpSys: p.bpSys ? String(p.bpSys) : '', formBpDia: p.bpDia ? String(p.bpDia) : '', formError: '' } });
  }, [state.currentPatient]);

  const savePatient = useCallback(() => {
    const name = (state.formName || '').trim();
    if (!name || !state.formAge || !state.formSex) {
      dispatch({ type: 'SET_FIELD', key: 'formError', value: 'Full name, age, and sex are required to create a record.' });
      return;
    }
    const num = (v: string) => v ? parseInt(v, 10) : null;
    const vitals = { height: num(state.formHeight), weight: num(state.formWeight), bpSys: num(state.formBpSys), bpDia: num(state.formBpDia) };
    const authProfile = store.getState().auth.profile;
    const workerId    = authProfile?.workerId ?? state.worker ?? '';
    const siteId      = authProfile?.siteId   ?? '';

    if (state.editing && state.currentPatient) {
      const updated: Patient = { ...state.currentPatient, name, age: parseInt(state.formAge, 10), sex: (state.formSex || state.currentPatient.sex) as Patient['sex'], rhd: (state.formRhd || state.currentPatient.rhd) as Patient['rhd'], ...vitals };
      dispatch({ type: 'UPSERT_PATIENT', patient: updated });
      dispatch({ type: 'PATCH', patch: { currentPatient: updated, view: 'hub', formError: '' } });
      dbSavePatient(updated, workerId, siteId).catch(e => console.error('[DB] savePatient update:', e));
    } else {
      const id = nextCode();
      const p: Patient = { id, name, age: parseInt(state.formAge, 10), sex: state.formSex as Patient['sex'] || '', rhd: state.formRhd as Patient['rhd'] || '', lastExam: 'Today', hs: 'none', hr: 'none', ...vitals };
      dispatch({ type: 'UPSERT_PATIENT', patient: p });
      dispatch({ type: 'PATCH', patch: { currentPatient: p, view: 'hub', page: 0, formError: '' } });
      dbSavePatient(p, workerId, siteId).catch(e => console.error('[DB] savePatient create:', e));
    }
  }, [state, nextCode]);

  const openPatient = useCallback((p: Patient) => {
    dispatch({ type: 'PATCH', patch: { currentPatient: p, view: 'hub' } });
  }, []);

  const startModality = useCallback((m: Modality) => {
    dispatch({
      type: 'PATCH',
      patch: {
        modality: m,
        site: null,
        view: 'position',
        sessionCapturedSites: m === 'pcg' ? [] : state.sessionCapturedSites,
        sessionCapturedLeads: m === 'ecg' ? [] : state.sessionCapturedLeads,
      },
    });
  }, [state.sessionCapturedSites, state.sessionCapturedLeads]);

  const selectSite = useCallback((siteId: string) => {
    if (state.videoGuidesEnabled) {
      dispatch({ type: 'PATCH', patch: { site: siteId, showGuide: true } });
    } else {
      dispatch({ type: 'PATCH', patch: { site: siteId } });
      // beginCapture called inline
      const connected = state.conn === 'connected';
      dispatch({ type: 'PATCH', patch: { view: 'capture', quality: 26, recProgress: 0, capturePhase: connected ? 'positioning' : 'gate' } });
    }
  }, [state.videoGuidesEnabled, state.conn]);

  const startCaptureFromGuide = useCallback(() => {
    const connected = state.conn === 'connected';
    dispatch({ type: 'PATCH', patch: { showGuide: false, view: 'capture', quality: 26, recProgress: 0, capturePhase: connected ? 'positioning' : 'gate' } });
  }, [state.conn]);

  const beginCapture = useCallback((siteId: string) => {
    const connected = state.conn === 'connected';
    dispatch({ type: 'PATCH', patch: { view: 'capture', site: siteId, quality: 26, recProgress: 0, capturePhase: connected ? 'positioning' : 'gate' } });
  }, [state.conn]);

  const onCancel = useCallback(() => navigate('hub'), [navigate]);

  const onRecord = useCallback(() => {
    if (state.capturePhase === 'ready') {
      dispatch({ type: 'SET_CAPTURE_PHASE', phase: 'recording' });
    }
  }, [state.capturePhase]);

  const setPosture = useCallback((p: Posture) => {
    if (state.capturePhase === 'recording' || state.capturePhase === 'analyzing') return;
    dispatch({ type: 'SET_FIELD', key: 'posture', value: p });
  }, [state.capturePhase]);

  const finishCapture = useCallback((
    s1?: { verdict: 'normal' | 'abnormal' | 'inconclusive'; confidence: string; model: string },
  ) => {
    const m = state.modality;
    let result: CaptureResult;
    if (m === 'ecg') {
      result = { kind: 'ecg' };
    } else if (s1) {
      // Real Stage 1 result from TFLite inference.
      if (s1.verdict === 'normal') {
        result = { kind: 'normal', confidence: s1.confidence, model: s1.model };
      } else if (s1.verdict === 'inconclusive') {
        result = { kind: 'inconclusive' };
      } else {
        result = { kind: 'abnormal', online: state.connectivity === 'online', confidence: s1.confidence, model: s1.model };
      }
    } else {
      // Dev/prototype simulation — cycle through outcomes so the full UI is testable.
      const OUTCOMES: Array<CaptureResult> = [
        { kind: 'abnormal', online: state.connectivity === 'online', confidence: '0.86', model: 'v0.4.1' },
        { kind: 'normal', confidence: '0.92', model: 'v0.4.1' },
        { kind: 'inconclusive' },
      ];
      result = OUTCOMES[Math.floor(Math.random() * OUTCOMES.length)];
    }
    dispatch({ type: 'PATCH', patch: { view: 'result', result } });
  }, [state.modality, state.connectivity]);

  // ── Core save logic ─────────────────────────────────────────────────────────
  // Persists the current result to DB and updates the patient record in state.
  // opts.addToProgress — add the captured site/lead to the session progress arrays.
  //   False for inconclusive "Try Again" (save to DB for audit but don't mark done).
  // opts.updatePatientStatus — write the result code back to patient.hs / patient.hr.
  //   False for inconclusive retries (patient status stays as-is until CHW gives up).
  const _commitResult = useCallback((opts: { addToProgress?: boolean; updatePatientStatus?: boolean } = {}) => {
    const { addToProgress = true, updatePatientStatus = true } = opts;
    const r  = state.result;
    const m  = state.modality;
    const siteId = state.site ?? '';

    let code: string;
    if (m === 'ecg') { code = 'ecg-captured'; }
    else if (r?.kind === 'normal')    { code = 'normal'; }
    else if (r?.kind === 'abnormal')  { code = r.online ? 'abnormal-confirmed' : 'abnormal-pending'; }
    else                              { code = 'inconclusive'; }

    const cp = state.currentPatient;
    if (cp) {
      if (updatePatientStatus) {
        const updated: Patient = { ...cp, lastExam: 'Today' };
        if (m === 'ecg') {
          updated.hr = code as Patient['hr'];
          updated.hrPosture = state.posture;
          updated.hrLead = siteId || undefined;
        } else {
          updated.hs = code as Patient['hs'];
          updated.hsPosture = state.posture;
          updated.hsSite = siteId || undefined;
          updated.hsConfidence = r?.confidence;
          updated.hsModel = r?.model;
        }
        dispatch({ type: 'UPSERT_PATIENT', patient: updated });
        dispatch({ type: 'SET_CURRENT_PATIENT', patient: updated });
      }

      const authProfile  = store.getState().auth.profile;
      const workerId     = authProfile?.workerId ?? state.worker ?? '';
      const dbSiteId     = authProfile?.siteId   ?? '';
      const stage1Verdict: 'normal' | 'abnormal' | 'inconclusive' | undefined =
        m === 'ecg'                ? undefined      :
        r?.kind === 'normal'       ? 'normal'       :
        r?.kind === 'abnormal'     ? 'abnormal'     :
        r?.kind === 'inconclusive' ? 'inconclusive' : undefined;

      dbSaveCapture({
        patientStudyCode: cp.id,
        modality:         m ?? 'pcg',
        site:             siteId,
        posture:          state.posture,
        workerId,
        siteId:           dbSiteId,
        verdict:          stage1Verdict,
        confidence:       r?.confidence ? parseFloat(r.confidence) : undefined,
        modelVersion:     r?.model,
      }).then(() => triggerFlush()).catch(e => console.error('[DB] saveCapture:', e));
    }

    if (addToProgress && siteId) {
      if (m === 'ecg') {
        const next = [...new Set([...state.sessionCapturedLeads, siteId])];
        dispatch({ type: 'PATCH', patch: { sessionCapturedLeads: next } });
      } else {
        const next = [...new Set([...state.sessionCapturedSites, siteId])];
        dispatch({ type: 'PATCH', patch: { sessionCapturedSites: next } });
      }
    }
  }, [state]);

  // After a successful (non-inconclusive) capture: save + go to position select for the next one.
  const nextCapture = useCallback(() => {
    _commitResult({ addToProgress: true, updatePatientStatus: true });
    dispatch({ type: 'PATCH', patch: { view: 'position', result: null } });
  }, [_commitResult]);

  // Save + return to the patient hub (used after all positions done, or manual "Back to Overview").
  const returnToHub = useCallback(() => {
    _commitResult({ addToProgress: true, updatePatientStatus: true });
    navigate('hub');
  }, [_commitResult, navigate]);

  // Inconclusive "Try Again": save to DB for audit, do NOT mark site done or update patient status.
  const retryCapture = useCallback(() => {
    _commitResult({ addToProgress: false, updatePatientStatus: false });
    dispatch({ type: 'PATCH', patch: { view: 'position', result: null } });
  }, [_commitResult]);

  // Save + close session + return to patient list.
  const finishSession = useCallback(() => {
    _commitResult({ addToProgress: true, updatePatientStatus: true });
    if (state.currentPatient) {
      dbCloseSession(state.currentPatient.id).catch(e => console.error('[DB] closeSession:', e));
    }
    dispatch({ type: 'PATCH', patch: { view: 'history', currentPatient: null, sessionCapturedSites: [], sessionCapturedLeads: [] } });
  }, [_commitResult, state.currentPatient]);

  // Legacy alias — kept so any call sites not yet updated still compile.
  const applyAndReturn = returnToHub;

  const doneWithPatient = useCallback(() => {
    if (state.currentPatient) {
      dbCloseSession(state.currentPatient.id).catch(e => console.error('[DB] closeSession:', e));
    }
    dispatch({ type: 'PATCH', patch: { view: 'history', currentPatient: null, sessionCapturedSites: [], sessionCapturedLeads: [] } });
  }, [state.currentPatient]);

  const openMeasure = useCallback((m: Modality, returnTo: AppView = 'hub') => {
    const tab = m === 'ecg' ? 'L1' : 'aortic';
    dispatch({ type: 'PATCH', patch: { view: 'measure', measureModality: m, measureTab: tab, measureReturnTo: returnTo, audioPlaying: null } });
  }, []);

  const openPatientHistory = useCallback(() => {
    dispatch({ type: 'SET_VIEW', view: 'patientHistory' });
  }, []);

  const askDelete = useCallback(() => dispatch({ type: 'SET_FIELD', key: 'confirmDelete', value: true }), []);
  const cancelDelete = useCallback(() => dispatch({ type: 'SET_FIELD', key: 'confirmDelete', value: false }), []);

  const deletePatient = useCallback(() => {
    const cp = state.currentPatient;
    if (!cp) return;
    dispatch({ type: 'DELETE_PATIENT', id: cp.id });
    dispatch({ type: 'PATCH', patch: { confirmDelete: false, view: 'history', page: 0 } });
    dbSoftDeletePatient(cp.id).catch(e => console.error('[DB] softDeletePatient:', e));
  }, [state.currentPatient]);

  const toggleVideo = useCallback(() => {
    const next = !state.videoGuidesEnabled;
    dispatch({ type: 'SET_FIELD', key: 'videoGuidesEnabled', value: next });
    SettingsService.setVideoGuidesEnabled(next).catch(() => {});
  }, [state.videoGuidesEnabled]);


  const resetLaunch = useCallback(() => {
    dispatch({ type: 'PATCH', patch: { lang: null, view: 'language' } });
  }, []);

  const openSideNav  = useCallback(() => dispatch({ type: 'OPEN_SIDE_NAV' }), []);
  const closeSideNav = useCallback(() => dispatch({ type: 'CLOSE_SIDE_NAV' }), []);

  const statusVM = useCallback((code: string) => {
    switch (code) {
      case 'normal':             return { label: 'Normal',           color: '#2E8B57' };
      case 'abnormal-confirmed': return { label: 'Abnormal',         color: '#C8423A' };
      case 'abnormal-pending':   return { label: 'Awaiting confirm', color: '#D9A441' };
      case 'inconclusive':       return { label: 'Inconclusive',     color: '#D9A441' };
      case 'ecg-captured':       return { label: 'Captured',         color: '#0E7C86' };
      default:                   return { label: 'Not recorded',     color: '#CBD2D9' };
    }
  }, []);

  const value: AppContextValue = {
    state, dispatch,
    navigate, pickLang, signIn, logout, goBack, nextCode,
    newPatient, editPatient, savePatient, openPatient,
    startModality, selectSite, startCaptureFromGuide, beginCapture,
    onCancel, onRecord, setPosture, finishCapture,
    applyAndReturn, nextCapture, returnToHub, retryCapture, finishSession,
    doneWithPatient, openMeasure, openPatientHistory,
    askDelete, cancelDelete, deletePatient,
    toggleVideo, resetLaunch, statusVM,
    openSideNav, closeSideNav,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
