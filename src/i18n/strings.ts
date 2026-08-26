/**
 * UI text catalog — all on-screen strings that a health worker reads.
 * Structured to mirror the screen sections where each string appears.
 * TTS (spoken) strings live in services/tts.ts; this file covers displayed text only.
 *
 * Languages: en (English), rw (Kinyarwanda), fr (French), sw (Kiswahili)
 * Confirmed language list provisional — see CLAUDE.md Open Questions.
 */

export type SupportedLang = 'en' | 'rw' | 'fr' | 'sw';

export interface UIStrings {
  // ── Shared ───────────────────────────────────────────────────────────────
  common: {
    settings:     string;
    cancel:       string;
    close:        string;
    done:         string;
    retry:        string;
    edit:         string;
    delete:       string;
    download:     string;
    newPatient:   string;
    search:       string;
    yes:          string;
    no:           string;
    unknown:      string;
    or:           string;
    previous:     string;
    next:         string;
    clear:        string;
    noRecords:    string;
    selected:     string;
    dashboard:    string;
    exportTxt:    string;
    exportCsv:    string;
    filterLabel:  string;
    auscultation: string;
  };

  // ── Status labels ────────────────────────────────────────────────────────
  status: {
    normal:              string;
    abnormalPending:     string;
    abnormalConfirmed:   string;
    inconclusive:        string;
    captured:            string;
    notCaptured:         string;
    awaitingSync:        string;
  };

  // ── Language screen ───────────────────────────────────────────────────────
  language: {
    title:    string;
    subtitle: string;
    footnote: string;
  };

  // ── History / Queue ────────────────────────────────────────────────────────
  history: {
    title:           string;
    searchHint:      string;
    colPatient:      string;
    colHeartSound:   string;
    colHeartRhythm:  string;
    colLastExam:     string;
    filterAll:       string;
    filterAbnormal:  string;
    filterPending:   string;
    noResults:       string;
  };

  // ── Patient form ──────────────────────────────────────────────────────────
  patient: {
    newTitle:        string;
    editTitle:       string;
    formSubtitle:    string;
    fullName:        string;
    fullNameHint:    string;
    studyCode:       string;
    ageYears:        string;
    sex:             string;
    sexFemale:       string;
    sexMale:         string;
    sexOther:        string;
    rhdLabel:        string;
    vitals:          string;
    vitalsOptional:  string;
    heightCm:        string;
    weightKg:        string;
    bloodPressure:   string;
    createBtn:       string;
    saveBtn:         string;
    deleteBtn:          string;
    deleteTitle:        string;
    deleteNote:         string;
    deleteConfirmTitle: string;
    deleteConfirmBody:  string;
    unsavedTitle:       string;
    unsavedBody:        string;
    discardBtn:         string;
    returningTitle:  string;
    returningSub:    string;
    searchHint:      string;
    noPatients:      string;
    noMatch:         string;
    dangerZone:      string;
  };

  // ── Position select ────────────────────────────────────────────────────────
  positionSelect: {
    titlePcg:           string;
    titleEcg:           string;
    subtitle:           string;
    progressSuffixPcg:  string;
    progressSuffixEcg:  string;
    capturedBadge:      string;
    exitTitle:          string;
    exitBodyPcg:        string;
    exitBodyEcg:        string;
    exitContinue:       string;
    exitConfirm:        string;
  };

  // ── Capture screen ────────────────────────────────────────────────────────
  capture: {
    heartSound:        string;
    heartRhythm:       string;
    // Stepper
    stepPosition:      string;
    stepAcquire:       string;
    stepRecord:        string;
    stepScreen:        string;
    // Rail card labels
    sectionPosition:   string;
    sectionQuality:    string;
    sectionPosture:    string;
    sectionStep:       string;
    // Quality labels
    qualityGood:       string;
    qualityImproving:  string;
    qualityWeak:       string;
    // Record states
    tapToRecord:       string;
    waitingSignal:     string;
    recordingNow:      string;
    analysing:         string;
    tapSub:            string;
    tapSubEcg:         string;
    // Postures
    postureSitting:    string;
    postureSupine:     string;
    postureLeft:       string;
    postureNote:       string;
    // Bluetooth gate
    connectTitle:      string;
    connectSub:        string;
    retryBtn:          string;
    connConnected:     string;
    connReconnecting:  string;
    connNotFound:      string;
  };

  // ── Result screen ─────────────────────────────────────────────────────────
  result: {
    normalTitle:           string;
    normalSub:             string;
    abnormalPendingTitle:  string;
    abnormalPendingSub:    string;
    abnormalConfTitle:     string;
    abnormalConfSub:       string;
    inconclusiveTitle:     string;
    inconclusiveSub:       string;
    ecgTitle:              string;
    ecgSub:                string;
    returnBtn:             string;
    captureAgainBtn:       string;
    stage2Awaiting:        string;
    stage2Complete:        string;
    confidence:            string;
    headlineNormal:        string;
    headlineAbnormal:      string;
    headlineInconc:        string;
    backToSession:         string;
    repositionRecord:      string;
    stage2CloudConf:       string;
    confirmedAsSuspected:  string;
    queuedAwaiting:        string;
    queuedNote:            string;
    storedLocally:         string;
    tryAgain:              string;
    backToOverview:        string;
    nextValve:             string;
    nextLead:              string;
    doneHs:                string;
    doneEcg:               string;
  };

  // ── Session hub ────────────────────────────────────────────────────────────
  session: {
    title:           string;
    editDetails:     string;
    finishSession:   string;
    patientDetails:  string;
    lastExam:        string;
    captured:        string;
    extractRecord:   string;
    extractNote:     string;
    extractSummary:  string;
    extractCsv:      string;
    heartSound:      string;
    heartSoundDesc:  string;
    heartSoundTags:  string[];
    heartRhythm:     string;
    heartRhythmDesc: string;
    heartRhythmTags: string[];
    startCapture:    string;
    captureAgain:    string;
    viewMeasure:     string;
    stage1Label:     string;
    rhythmLabel:     string;
    skipGuide:       string;
  };

  // ── Measurements screen ────────────────────────────────────────────────────
  measurements: {
    heartSound:      string;
    heartRhythm:     string;
    session:         string;
    capturedTrace:   string;
    scale:           string;
    intervalTitle:   string;
    normalRange:     string;
    inRange:         string;
    outOfRange:      string;
    murmurAnalysis:  string;
    rhythmAnalysis:  string;
    sessionSummary:  string;
    playback:        string;
    normalSpeed:     string;
    halfSpeed:       string;
    downloadRaw:     string;
  };

  // ── Patient screening history ─────────────────────────────────────────────
  patientHistory: {
    title:           string;
    currentSession:  string;
    previousSession: string;
    sessionCount:    string;
    captureCount:    string;
    noHistory:       string;
    heartSound:      string;
    heartRhythm:     string;
    stage2Confirmed: string;
    stage2Pending:   string;
    viewBtn:         string;
    confidence:      string;
    model:           string;
    site:            string;
    lead:            string;
    posture:         string;
  };

  // ── Settings ──────────────────────────────────────────────────────────────
  settings: {
    title:           string;
    language:        string;
    bluetooth:       string;
    videoGuides:     string;
    videoGuidesOn:   string;
    videoGuidesOff:  string;
    syncStatus:      string;
    appVersion:      string;
    noDevice:        string;
    disconnect:      string;
    connect:         string;
    pairedDevices:   string;
    findDevices:     string;
    scanning:        string;
    scanNote:        string;
    noDevicesFound:  string;
    scan:            string;
    stop:            string;
    refresh:         string;
    connSync:        string;
    connOnlineNote:  string;
    connOfflineNote: string;
    videoGuidesNote: string;
    resetLaunch:     string;
    resetLaunchNote: string;
    reset:           string;
    account:         string;
    signedInAs:      string;
    signOut:         string;
  };

  // ── Side navigation drawer ────────────────────────────────────────────────
  sidenav: {
    appName:     string;
    patients:    string;
    dashboard:   string;
    settings:    string;
    logout:      string;
  };

  // ── Dashboard ─────────────────────────────────────────────────────────────
  dashboard: {
    title:              string;
    refresh:            string;
    refreshing:         string;
    siteData:           string;
    totalPatients:      string;
    screenedToday:      string;
    flaggedStage2:      string;
    flaggedSub:         string;
    awaitingConfirm:    string;
    awaitingConfirmSub: string;
    heartSoundResults:  string;
    capturesStage1:     string;
    notYetScreened:     string;
    pcgCaptures:        string;
    withoutPcg:         string;
    ecgCaptures:        string;
    withoutEcg:         string;
    syncQueue:          string;
    waitingConn:        string;
    allSynced:          string;
    syncFailed:         string;
  };
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

const STRINGS: Record<SupportedLang, UIStrings> = {

  // ── English ────────────────────────────────────────────────────────────────
  en: {
    common: {
      settings:   'Settings',
      cancel:     'Cancel',
      close:      'Close',
      done:       'Done',
      retry:      'Retry',
      edit:       'Edit',
      delete:     'Delete',
      download:   'Download',
      newPatient: 'New patient',
      search:     'Search',
      yes:        'Yes',
      no:         'No',
      unknown:      'Unknown',
      or:           'or',
      previous:     'Previous',
      next:         'Next',
      clear:        'Clear',
      noRecords:    'No records',
      selected:     'selected',
      dashboard:    'Dashboard',
      exportTxt:    'Plain text (.txt)',
      exportCsv:    'Spreadsheet (.csv)',
      filterLabel:  'Filter:',
      auscultation: 'Auscultation',
    },
    status: {
      normal:            'Normal',
      abnormalPending:   'Abnormal — queued',
      abnormalConfirmed: 'Abnormal — confirmed',
      inconclusive:      'Inconclusive',
      captured:          'Captured',
      notCaptured:       'Not captured',
      awaitingSync:      'Awaiting sync',
    },
    language: {
      title:    'Choose your language',
      subtitle: 'Set once — voice guidance speaks in your language.',
      footnote: 'Changeable anytime in Settings · pilot languages provisional',
    },
    history: {
      title:          'Patient history',
      searchHint:     'Search name or code…',
      colPatient:     'Patient',
      colHeartSound:  'Heart sound',
      colHeartRhythm: 'Heart rhythm',
      colLastExam:    'Last exam',
      filterAll:      'All patients',
      filterAbnormal: 'Abnormal',
      filterPending:  'Pending sync',
      noResults:      'No patients match this filter.',
    },
    patient: {
      newTitle:       'New patient record',
      editTitle:      'Edit patient record',
      formSubtitle:   'Field set provisional — pending clinical-team & IRB confirmation.',
      fullName:       'Full name',
      fullNameHint:   "Patient's given & family name",
      studyCode:      'Study code',
      ageYears:       'Age (years)',
      sex:            'Sex',
      sexFemale:      'Female',
      sexMale:        'Male',
      sexOther:       'Other',
      rhdLabel:       'Known prior RHD / cardiac diagnosis',
      vitals:         'VITALS',
      vitalsOptional: '· optional',
      heightCm:       'Height (cm)',
      weightKg:       'Weight (kg)',
      bloodPressure:  'Blood pressure (mmHg)',
      createBtn:      'Create & start session',
      saveBtn:        'Save changes',
      deleteBtn:          'Delete patient',
      deleteTitle:        'Delete this patient record',
      deleteNote:         'Removes the patient and all captured data. Cannot be undone.',
      deleteConfirmTitle: 'Delete patient record?',
      deleteConfirmBody:  'This will permanently remove all captured data for',
      unsavedTitle:       'Unsaved changes',
      unsavedBody:        'You have unsaved changes. Save before leaving?',
      discardBtn:         'Discard',
      returningTitle: 'Returning patient',
      returningSub:   'Attach this session to an existing record.',
      searchHint:     'Search name or code…',
      noPatients:     'No patients on record yet.',
      noMatch:        'No match — register as a new patient.',
      dangerZone:     'DANGER ZONE',
    },
    positionSelect: {
      titlePcg:           'Select valve site',
      titleEcg:           'Select ECG lead',
      subtitle:           'Each site uses specific positioning guidance and a dedicated guide video.',
      progressSuffixPcg:  'valve sites captured',
      progressSuffixEcg:  'leads captured',
      capturedBadge:      'Captured',
      exitTitle:          'Exit modality?',
      exitBodyPcg:        'Progress saved. You can capture the remaining valve sites from the patient overview.',
      exitBodyEcg:        'Progress saved. You can capture the remaining leads from the patient overview.',
      exitContinue:       'Continue capturing',
      exitConfirm:        'Exit to overview',
    },
    capture: {
      heartSound:       'Heart Sound (PCG)',
      heartRhythm:      'Heart Rhythm (ECG)',
      stepPosition:     'Position',
      stepAcquire:      'Acquire',
      stepRecord:       'Record',
      stepScreen:       'Screen',
      sectionPosition:  'POSITION',
      sectionQuality:   'SIGNAL QUALITY',
      sectionPosture:   'PATIENT POSITION',
      sectionStep:      'STEP',
      qualityGood:      'Sufficient for recording',
      qualityImproving: 'Improving — hold steady',
      qualityWeak:      'Signal too weak — reposition sensor',
      tapToRecord:      'Tap to record',
      waitingSignal:    'Waiting for signal…',
      recordingNow:     'Recording…',
      analysing:        'Analysing…',
      tapSub:           'Captures about 4 seconds of heart sound.',
      tapSubEcg:        'Captures about 30 seconds of ECG rhythm.',
      postureSitting:   'Sitting',
      postureSupine:    'Supine',
      postureLeft:      'Left lateral',
      postureNote:      'Recorded with this signal',
      connectTitle:     'Connect your CardioSleeve to continue',
      connectSub:       'The CardioSleeve must be connected before capture can begin. Auto-reconnecting in the background…',
      retryBtn:         'Retry connection',
      connConnected:    'Connected',
      connReconnecting: 'Reconnecting…',
      connNotFound:     'Not connected',
    },
    result: {
      normalTitle:          'Normal',
      normalSub:            'Heart sounds are within expected range. You may continue to the next patient.',
      abnormalPendingTitle: 'Abnormal — pending',
      abnormalPendingSub:   'An abnormal heart sound was detected. The recording has been queued for Stage 2 confirmation.',
      abnormalConfTitle:    'Abnormal — confirmed',
      abnormalConfSub:      'Stage 2 confirms an abnormal finding. Aortic stenosis is suspected. Please refer this patient.',
      inconclusiveTitle:    'Inconclusive',
      inconclusiveSub:   'Signal quality was insufficient. Please reposition the sensor and capture again.',
      ecgTitle:             'ECG captured',
      ecgSub:               'Heart rhythm recorded successfully and stored with this session.',
      returnBtn:            'Return to patient',
      captureAgainBtn:      'Capture again',
      stage2Awaiting:       'Awaiting connectivity for Stage 2 confirmation',
      stage2Complete:       'Stage 2 confirmation received',
      confidence:           'Model confidence',
      headlineNormal:        'Normal heart sounds',
      headlineAbnormal:      'Abnormal sound detected',
      headlineInconc:        'Recording not usable',
      backToSession:         'Back to session',
      repositionRecord:      'Reposition and re-record',
      stage2CloudConf:       'Stage 2 cloud confirmation',
      confirmedAsSuspected:  'Confirmed — AS suspected',
      queuedAwaiting:        'Queued — awaiting connectivity',
      queuedNote:            'Recording is queued and will sync when connectivity returns. The patient record will update automatically.',
      storedLocally:         'Stored locally',
      tryAgain:              'Try Again',
      backToOverview:        'Back to Overview',
      nextValve:             'Next valve',
      nextLead:              'Next lead',
      doneHs:                'Heart Sound Complete',
      doneEcg:               'ECG Complete',
    },
    session: {
      title:           'Patient session',
      editDetails:     'Edit details',
      finishSession:   'Finish session',
      patientDetails:  'PATIENT DETAILS',
      lastExam:        'LAST EXAM',
      captured:        'CAPTURED',
      extractRecord:   'Extract record',
      extractNote:     'Demographics & screening results for referral or pilot data.',
      extractSummary:  'Summary',
      extractCsv:      'Data (CSV)',
      heartSound:      'Heart Sound (PCG)',
      heartSoundDesc:  'Auscultation across the heart valve sites — drives the on-device model.',
      heartSoundTags:  ['4 valve sites', '~30 sec', 'Voice-guided'],
      heartRhythm:     'Heart Rhythm (ECG)',
      heartRhythmDesc: 'ECG lead capture — recorded and stored with this session.',
      heartRhythmTags: ['3 leads', '~30 sec', 'Stored locally'],
      startCapture:    'Start capture',
      captureAgain:    'Capture again',
      viewMeasure:     'View measurements',
      stage1Label:     'STAGE 1 SCREENING',
      rhythmLabel:     'RHYTHM CAPTURE',
      skipGuide:       'Skip guide and start',
    },
    measurements: {
      heartSound:     'Heart sound measurements',
      heartRhythm:    'Heart rhythm measurements',
      session:        'SESSION',
      capturedTrace:  'CAPTURED TRACE',
      scale:          '25 mm/s · 10 mm/mV',
      intervalTitle:  'INTERVAL ANALYSIS',
      normalRange:    'Normal range',
      inRange:        'In range',
      outOfRange:     'Out of range',
      murmurAnalysis: 'MURMUR ANALYSIS',
      rhythmAnalysis: 'RHYTHM ANALYSIS',
      sessionSummary: 'SESSION SUMMARY',
      playback:       'RECORDING PLAYBACK',
      normalSpeed:    'Normal-speed audio',
      halfSpeed:      'Half-speed audio',
      downloadRaw:    'Download data',
    },
    patientHistory: {
      title:           'Screening history',
      currentSession:  'CURRENT SESSION',
      previousSession: 'PREVIOUS SESSION',
      sessionCount:    'sessions',
      captureCount:    'captures total',
      noHistory:       'No previous sessions on record.',
      heartSound:      'Heart Sound (PCG)',
      heartRhythm:     'Heart Rhythm (ECG)',
      stage2Confirmed: 'Stage 2 confirmed',
      stage2Pending:   'Awaiting Stage 2',
      viewBtn:         'View',
      confidence:      'Confidence',
      model:           'Model',
      site:            'Site',
      lead:            'Lead',
      posture:         'Posture',
    },
    settings: {
      title:           'Settings',
      language:        'Language',
      bluetooth:       'CardioSleeve Bluetooth',
      videoGuides:     'Positioning video guides',
      videoGuidesOn:   'Enabled',
      videoGuidesOff:  'Disabled',
      syncStatus:      'Sync status',
      appVersion:      'App version',
      noDevice:        'No device connected',
      disconnect:      'Disconnect',
      connect:         'Connect',
      pairedDevices:   'Paired devices',
      findDevices:     'Find new devices',
      scanning:        'Scanning… (up to 12 s)',
      scanNote:        'Put the CardioSleeve into discoverable mode before scanning.',
      noDevicesFound:  'No devices found yet. Tap Scan to search.',
      scan:            'Scan',
      stop:            'Stop',
      refresh:         'Refresh',
      connSync:        'Connectivity & sync',
      connOnlineNote:  'Online — queued recordings will sync shortly.',
      connOfflineNote: 'Offline — abnormal recordings queue until connectivity returns.',
      videoGuidesNote: 'Play a placement clip before each capture.',
      resetLaunch:     'Reset first-launch (demo)',
      resetLaunchNote: 'Show the language selection screen again.',
      reset:           'Reset',
      account:         'Account',
      signedInAs:      'SIGNED IN AS',
      signOut:         'Sign out',
    },
    sidenav: {
      appName:   'CardioSleeve',
      patients:  'Patient List',
      dashboard: 'Dashboard',
      settings:  'Settings',
      logout:    'Log out',
    },
    dashboard: {
      title:              'Dashboard',
      refresh:            'Refresh',
      refreshing:         'Refreshing…',
      siteData:           'Local screening data',
      totalPatients:      'Total Patients',
      screenedToday:      'Screened Today',
      flaggedStage2:      'Flagged (Stage 2)',
      flaggedSub:         'Confirmed AS suspicion',
      awaitingConfirm:    'Awaiting Confirm',
      awaitingConfirmSub: 'Abnormal, not yet synced',
      heartSoundResults:  'Heart Sound Results',
      capturesStage1:     'captures with Stage 1 result',
      notYetScreened:     'Not yet screened',
      pcgCaptures:        'PCG Captures',
      withoutPcg:         'patients without PCG',
      ecgCaptures:        'ECG Captures',
      withoutEcg:         'patients without ECG',
      syncQueue:          'Sync Queue',
      waitingConn:        'Waiting for connectivity',
      allSynced:          'All recordings synced',
      syncFailed:         'failed — tap to retry',
    },
  },

  // ── Kinyarwanda ────────────────────────────────────────────────────────────
  rw: {
    common: {
      settings:   'Igenamiterere',
      cancel:     'Kureka',
      close:      'Funga',
      done:       'Birangiye',
      retry:      'Gerageza nanone',
      edit:       'Hindura',
      delete:     'Siba',
      download:   'Kurura',
      newPatient: 'Umurwayi mushya',
      search:     'Shakisha',
      yes:        'Yego',
      no:         'Oya',
      unknown:      'Ntizwi',
      or:           'cyangwa',
      previous:     'Ibanze',
      next:         'Ikurikira',
      clear:        'Siba',
      noRecords:    'Nta makuru',
      selected:     'byatoranijwe',
      dashboard:    'Ikibaho',
      exportTxt:    'Inyandiko isanzwe (.txt)',
      exportCsv:    'Itsinda (.csv)',
      filterLabel:  'Sungura:',
      auscultation: 'Gutumatuma',
    },
    status: {
      normal:            'Bisanzwe',
      abnormalPending:   'Bitari bisanzwe — bitegereje',
      abnormalConfirmed: 'Bitari bisanzwe — byemejwe',
      inconclusive:      'Ntibirashobotse',
      captured:          'Bafashwe',
      notCaptured:       'Ntibafashwe',
      awaitingSync:      'Bitegereje guhuza',
    },
    language: {
      title:    'Hitamo ururimi',
      subtitle: 'Ihitamo rimwe — amajwi azavuga mu rurimi rwawe.',
      footnote: 'Ushobora guhindura igihe cyose muri Igenamiterere · ururimi rw\'ikizamini ruri ku nzira',
    },
    history: {
      title:          'Amateka y\'abarwayi',
      searchHint:     'Shakisha izina cyangwa kode…',
      colPatient:     'Umurwayi',
      colHeartSound:  'Amajwi y\'umutima',
      colHeartRhythm: 'Inzira y\'umutima',
      colLastExam:    'Isuzuma rya nyuma',
      filterAll:      'Abarwayi bose',
      filterAbnormal: 'Bitari bisanzwe',
      filterPending:  'Bitegereje guhuza',
      noResults:      'Nta murwayi uhuye n\'iki gisubizo.',
    },
    patient: {
      newTitle:       'Inyandiko nshya y\'umurwayi',
      editTitle:      'Hindura inyandiko y\'umurwayi',
      formSubtitle:   'Inzego z\'amakuru biri ku nzira — bitegereje kwemezwa n\'itsinda rya klininiki na IRB.',
      fullName:       'Amazina yose',
      fullNameHint:   'Amazina y\'inzibacyuho n\'imiryango y\'umurwayi',
      studyCode:      'Kode y\'ubushakashatsi',
      ageYears:       'Imyaka',
      sex:            'Igitsina',
      sexFemale:      'Umugore',
      sexMale:        'Umugabo',
      sexOther:       'Ikindi',
      rhdLabel:       'Ubwyanzu bw\'indwara y\'umutima izwi (RHD)',
      vitals:         'IBIPIMO BYA NGOMBWA',
      vitalsOptional: '· bikenewe',
      heightCm:       'Uburebure (cm)',
      weightKg:       'Ibiro (kg)',
      bloodPressure:  'Umuvuduko w\'amaraso (mmHg)',
      createBtn:      'Fungura ikiganiro',
      saveBtn:        'Bika impinduka',
      deleteBtn:          'Siba umurwayi',
      deleteTitle:        'Siba iyi nyandiko y\'umurwayi',
      deleteNote:         'Ikuraho umurwayi n\'amakuru yose yafashwe. Ntishobora gusubizwa.',
      deleteConfirmTitle: 'Siba dosiye y\'umurwayi?',
      deleteConfirmBody:  'Bizakuraho burundu amakuru yose yafashwe ya',
      unsavedTitle:       'Impinduka zitabitswe',
      unsavedBody:        'Ufite impinduka zitabitswe. Bika mbere yo kuva?',
      discardBtn:         'Reka',
      returningTitle: 'Umurwayi wasubiye',
      returningSub:   'Huza iki kiganiro n\'inyandiko isanzwe.',
      searchHint:     'Shakisha izina cyangwa kode…',
      noPatients:     'Nta murwayi wanditswe.',
      noMatch:        'Nta huye — andika nk\'umurwayi mushya.',
      dangerZone:     'AHANTU HANZITARI',
    },
    positionSelect: {
      titlePcg:           'Hitamo ahantu h\'ibibhaga',
      titleEcg:           'Hitamo umukururo wa ECG',
      subtitle:           'Ahantu hose hifashishwa amabwiriza akwiye no videyo ihuye nayo.',
      progressSuffixPcg:  'urubuga rwafashwe',
      progressSuffixEcg:  'inzira zafashwe',
      capturedBadge:      'Byafashwe',
      exitTitle:          'Gusohoka mu buryo?',
      exitBodyPcg:        'Intambwe zashyizwe. Urubuga rushobora gufatwa bavuyemo ku isuzuma ry\'umurwayi.',
      exitBodyEcg:        'Intambwe zashyizwe. Inzira zisigaye zishobora gufatwa bavuyemo ku isuzuma.',
      exitContinue:       'Komeza gufata',
      exitConfirm:        'Sohoka ku isuzuma',
    },
    capture: {
      heartSound:       'Amajwi y\'Umutima (PCG)',
      heartRhythm:      'Inzira y\'Umutima (ECG)',
      stepPosition:     'Ahantu',
      stepAcquire:      'Gufata',
      stepRecord:       'Inyandiko',
      stepScreen:       'Gupima',
      sectionPosition:  'AHANTU',
      sectionQuality:   'UBWIZA BW\'IKIMENYETSO',
      sectionPosture:   'IMYANYA Y\'UMURWAYI',
      sectionStep:      'INTAMBWE',
      qualityGood:      'Ihagije kurekoroda',
      qualityImproving: 'Biriyongera — hagaze',
      qualityWeak:      'Ikimenyetso kiri bugufi — simbura igikoresho',
      tapToRecord:      'Kanda kurekoroda',
      waitingSignal:    'Gutegereza ikimenyetso…',
      recordingNow:     'Irimo gurekoroda…',
      analysing:        'Irimo gusesengura…',
      tapSub:           'Ifata ingano ya heganya enye z\'amajwi y\'umutima.',
      tapSubEcg:        'Ifata amasegonda 30 y\'inzira ya ECG.',
      postureSitting:   'Yicaye',
      postureSupine:    'Nkuruje',
      postureLeft:      'Uruhande rw\'ibumoso',
      postureNote:      'Yanditswe n\'iki kimenyetso',
      connectTitle:     'Huza CardioSleeve yawe kugira ukomeze',
      connectSub:       'CardioSleeve igomba guhuzwa mbere yo gutangira gufata. Irimo guhuza mu nyuma…',
      retryBtn:         'Gerageza guhuza nanone',
      connConnected:    'Yahuye',
      connReconnecting: 'Irimo guhuza…',
      connNotFound:     'Ntiyahuye',
    },
    result: {
      normalTitle:          'Bisanzwe',
      normalSub:            'Amajwi y\'umutima ari mu rugero rwemerwa. Ushobora gukomeza ku murwayi ukurikira.',
      abnormalPendingTitle: 'Bitari bisanzwe — bitegereje',
      abnormalPendingSub:   'Ijwi ritari rya gisanzwe ryabonetse. Inyandiko yashyizwe mu murongo wo kwemezwa mu ntera ya 2.',
      abnormalConfTitle:    'Bitari bisanzwe — byemejwe',
      abnormalConfSub:      'Intera ya 2 yemeje ikintu kitari gisanzwe. Gucishijwe kw\'imitsi y\'aorte birakekwa. Kohereza uyu murwayi.',
      inconclusiveTitle:    'Ntibirashobotse',
      inconclusiveSub:   'Ubwiza bw\'ikimenyetso ntabwo bwahagije. Simbura igikoresho hanyuma ugerageze nanone.',
      ecgTitle:             'ECG yafashwe',
      ecgSub:               'Inzira y\'umutima yanditswe neza ikabikwa muri iki kiganiro.',
      returnBtn:            'Subira ku murwayi',
      captureAgainBtn:      'Fata nanone',
      stage2Awaiting:       'Bitegereje guhuza kw\'internet kugira kwemezwa kwa Ntera 2',
      stage2Complete:       'Kwemezwa kwa Ntera 2 byabonetse',
      confidence:           'Ikizere cy\'icyitegererezo',
      headlineNormal:        'Amajwi y\'umutima asanzwe',
      headlineAbnormal:      'Ijwi ritari rya gisanzwe ryabonetse',
      headlineInconc:        'Inyandiko ntishobotse gukoreshwa',
      backToSession:         'Subira ku kiganiro',
      repositionRecord:      'Simbura hanyuma ugerageze nanone',
      stage2CloudConf:       'Kwemezwa kwa Ntera 2 mu gikapu',
      confirmedAsSuspected:  'Byemejwe — gucishwa kw\'imitsi birakekwa',
      queuedAwaiting:        'Bitegereje — bitegereje guhuza',
      queuedNote:            'Inyandiko irimo itegereje kandi izohuza igihe guhuza kwagarutse. Inyandiko y\'umurwayi izavuguruka vuba.',
      storedLocally:         'Ibitswe hano',
      tryAgain:              'Gerageza Nanone',
      backToOverview:        'Garuka ku Isuzuma',
      nextValve:             'Site ikurikiraho',
      nextLead:              'Inzira ikurikiraho',
      doneHs:                'Amajwi y\'Umutima Yashojwe',
      doneEcg:               'ECG Yarangiye',
    },
    session: {
      title:           'Ikiganiro cy\'umurwayi',
      editDetails:     'Hindura amakuru',
      finishSession:   'Rangiza ikiganiro',
      patientDetails:  'AMAKURU Y\'UMURWAYI',
      lastExam:        'ISUZUMA RYA NYUMA',
      captured:        'BAFASHWE',
      extractRecord:   'Kurura inyandiko',
      extractNote:     'Amakuru y\'imikorere n\'ibisubizo byo gusuzuma kugira ngo bisohore cyangwa bikurikire ubushakashatsi.',
      extractSummary:  'Incamake',
      extractCsv:      'Amakuru (CSV)',
      heartSound:      'Amajwi y\'Umutima (PCG)',
      heartSoundDesc:  'Gutumatuma mu nsi z\'ibihimba by\'umutima — itera inzitizi ya kuri telefoni.',
      heartSoundTags:  ['Insi 4', '~30 seg', 'Ivugwa n\'ijwi'],
      heartRhythm:     'Inzira y\'Umutima (ECG)',
      heartRhythmDesc: 'Gufata umukururo wa ECG — wanditswe ikabikwa muri iki kiganiro.',
      heartRhythmTags: ['Imikururo 3', '~30 seg', 'Ibikwa hano'],
      startCapture:    'Tangira gufata',
      captureAgain:    'Fata nanone',
      viewMeasure:     'Reba ibipimo',
      stage1Label:     'ISUZUMA RYA 1',
      rhythmLabel:     'GUFATA INZIRA',
      skipGuide:       'Simbuka videyo utangire',
    },
    measurements: {
      heartSound:     'Ibipimo by\'amajwi y\'umutima',
      heartRhythm:    'Ibipimo by\'inzira y\'umutima',
      session:        'IKIGANIRO',
      capturedTrace:  'IGIKORESHO CYAFASHWE',
      scale:          '25 mm/s · 10 mm/mV',
      intervalTitle:  'ISESENGURA RY\'IBIHE',
      normalRange:    'Rugero rwa bisanzwe',
      inRange:        'Mu rugero',
      outOfRange:     'Hanze y\'urugero',
      murmurAnalysis: 'ISESENGURA RY\'IJWI',
      rhythmAnalysis: 'ISESENGURA RY\'INZIRA',
      sessionSummary: 'INCAMAKE Y\'IKIGANIRO',
      playback:       'GUSUBIRAMO INYANDIKO',
      normalSpeed:    'Amajwi ya gisanzwe',
      halfSpeed:      'Amajwi ya bisa kimwe n\'ingano',
      downloadRaw:    'Kurura amakuru mbisi',
    },
    patientHistory: {
      title:           'Amateka yo gusuzuma',
      currentSession:  'IKIGANIRO CY\'UBU',
      previousSession: 'IKIGANIRO CYABANJE',
      sessionCount:    'ibiganiro',
      captureCount:    'ibifashwe byose',
      noHistory:       'Nta biganiro byabanje byanditswe.',
      heartSound:      'Amajwi y\'Umutima (PCG)',
      heartRhythm:     'Inzira y\'Umutima (ECG)',
      stage2Confirmed: 'Intera ya 2 yemeje',
      stage2Pending:   'Itegereje Intera 2',
      viewBtn:         'Reba',
      confidence:      'Ikizere',
      model:           'Icyitegererezo',
      site:            'Ahantu',
      lead:            'Umukururo',
      posture:         'Imyanya',
    },
    settings: {
      title:           'Igenamiterere',
      language:        'Ururimi',
      bluetooth:       'CardioSleeve Bluetooth',
      videoGuides:     'Videyo y\'amabwiriza y\'aho gutumatuma',
      videoGuidesOn:   'Gufungura',
      videoGuidesOff:  'Gufunga',
      syncStatus:      'Imimerere yo guhuza',
      appVersion:      'Verisiyo y\'porogaramu',
      noDevice:        'Nta gikoresho gihuzwa',
      disconnect:      'Futanura',
      connect:         'Huza',
      pairedDevices:   'Ibikoresho bihurijwe',
      findDevices:     'Shakisha ibikoresho bishya',
      scanning:        'Irimo gushakisha… (kugeza 12 seg)',
      scanNote:        'Shyira CardioSleeve mu buryo bwo gushakishwa mbere yo gushakisha.',
      noDevicesFound:  'Nta bikoresho byabonetse. Kanda Shakisha.',
      scan:            'Shakisha',
      stop:            'Hagarika',
      refresh:         'Vugurura',
      connSync:        'Guhuza & Gukora',
      connOnlineNote:  'Online — inyandiko zitegereje zizohuza vuba.',
      connOfflineNote: 'Offline — inyandiko zitari bisanzwe zizategereza kugeza guhuza kwagarutse.',
      videoGuidesNote: 'Kina videyo yo gutumatuma mbere yo gufata buri kimwe.',
      resetLaunch:     'Subiramo intangiriro (demo)',
      resetLaunchNote: 'Erekana ikibazo cyo guhitamo ururimi nanone.',
      reset:           'Subiramo',
      account:         'Konti',
      signedInAs:      'WINJIYE NKA',
      signOut:         'Sohoka',
    },
    sidenav: {
      appName:   'CardioSleeve',
      patients:  'Urutonde rw\'abarwayi',
      dashboard: 'Ikibaho',
      settings:  'Igenamiterere',
      logout:    'Sohoka',
    },
    dashboard: {
      title:              'Ikibaho',
      refresh:            'Vugurura',
      refreshing:         'Irimo guvugurura…',
      siteData:           'Amakuru yo gusuzuma',
      totalPatients:      'Abarwayi bose',
      screenedToday:      'Basuzumwe uyu munsi',
      flaggedStage2:      'Bafatiriwe (Ntera 2)',
      flaggedSub:         'Gucishijwa kw\'imitsi byemejwe',
      awaitingConfirm:    'Bitegereje kwemezwa',
      awaitingConfirmSub: 'Bitari bisanzwe, ntibiri huze',
      heartSoundResults:  'Ibisubizo by\'amajwi y\'umutima',
      capturesStage1:     'bifashwe bifite ibisubizo bya Ntera 1',
      notYetScreened:     'Ntibacyasuzumwa',
      pcgCaptures:        'Ibifashwe bya PCG',
      withoutPcg:         'abarwayi badafite PCG',
      ecgCaptures:        'Ibifashwe bya ECG',
      withoutEcg:         'abarwayi badafite ECG',
      syncQueue:          'Inzira yo guhuza',
      waitingConn:        'Bitegereje guhuza',
      allSynced:          'Inyandiko zose zahuye',
      syncFailed:         'byanze — kanda ongera ugerageze',
    },
  },

  // ── Français ───────────────────────────────────────────────────────────────
  fr: {
    common: {
      settings:   'Paramètres',
      cancel:     'Annuler',
      close:      'Fermer',
      done:       'Terminé',
      retry:      'Réessayer',
      edit:       'Modifier',
      delete:     'Supprimer',
      download:   'Télécharger',
      newPatient: 'Nouveau patient',
      search:     'Rechercher',
      yes:        'Oui',
      no:         'Non',
      unknown:      'Inconnu',
      or:           'ou',
      previous:     'Précédent',
      next:         'Suivant',
      clear:        'Effacer',
      noRecords:    'Aucune donnée',
      selected:     'sélectionné(s)',
      dashboard:    'Tableau de bord',
      exportTxt:    'Texte brut (.txt)',
      exportCsv:    'Tableur (.csv)',
      filterLabel:  'Filtrer :',
      auscultation: 'Auscultation',
    },
    status: {
      normal:            'Normal',
      abnormalPending:   'Anormal — en attente',
      abnormalConfirmed: 'Anormal — confirmé',
      inconclusive:      'Non concluant',
      captured:          'Capturé',
      notCaptured:       'Non capturé',
      awaitingSync:      'En attente de synchronisation',
    },
    language: {
      title:    'Choisissez votre langue',
      subtitle: 'Réglé une fois — les instructions vocales parlent dans votre langue.',
      footnote: 'Modifiable à tout moment dans Paramètres · langues pilotes provisoires',
    },
    history: {
      title:          'Historique des patients',
      searchHint:     'Rechercher nom ou code…',
      colPatient:     'Patient',
      colHeartSound:  'Son cardiaque (PCG)',
      colHeartRhythm: 'Rythme cardiaque (ECG)',
      colLastExam:    'Dernier examen',
      filterAll:      'Tous les patients',
      filterAbnormal: 'Anormal',
      filterPending:  'Sync en attente',
      noResults:      'Aucun patient ne correspond à ce filtre.',
    },
    patient: {
      newTitle:       'Nouveau dossier patient',
      editTitle:      'Modifier le dossier patient',
      formSubtitle:   'Champs provisoires — en attente de validation de l\'équipe clinique et de l\'IRB.',
      fullName:       'Nom complet',
      fullNameHint:   'Prénom et nom de famille du patient',
      studyCode:      'Code d\'étude',
      ageYears:       'Âge (ans)',
      sex:            'Sexe',
      sexFemale:      'Féminin',
      sexMale:        'Masculin',
      sexOther:       'Autre',
      rhdLabel:       'RHD / diagnostic cardiaque antérieur connu',
      vitals:         'CONSTANTES',
      vitalsOptional: '· optionnel',
      heightCm:       'Taille (cm)',
      weightKg:       'Poids (kg)',
      bloodPressure:  'Pression artérielle (mmHg)',
      createBtn:      'Créer & démarrer la session',
      saveBtn:        'Enregistrer les modifications',
      deleteBtn:          'Supprimer le patient',
      deleteTitle:        'Supprimer ce dossier patient',
      deleteNote:         'Supprime le patient et toutes les données capturées. Irréversible.',
      deleteConfirmTitle: 'Supprimer le dossier patient ?',
      deleteConfirmBody:  'Cela supprimera définitivement toutes les données capturées pour',
      unsavedTitle:       'Modifications non enregistrées',
      unsavedBody:        'Vous avez des modifications non enregistrées. Enregistrer avant de quitter ?',
      discardBtn:         'Abandonner',
      returningTitle: 'Patient connu',
      returningSub:   'Associer cette session à un dossier existant.',
      searchHint:     'Rechercher nom ou code…',
      noPatients:     'Aucun patient enregistré.',
      noMatch:        'Aucun résultat — enregistrer comme nouveau patient.',
      dangerZone:     'ZONE DANGEREUSE',
    },
    positionSelect: {
      titlePcg:           'Sélectionner le site valvulaire',
      titleEcg:           'Sélectionner la dérivation ECG',
      subtitle:           'Chaque site utilise des instructions de positionnement spécifiques et une vidéo dédiée.',
      progressSuffixPcg:  'sites valvulaires capturés',
      progressSuffixEcg:  'dérivations capturées',
      capturedBadge:      'Capturé',
      exitTitle:          'Quitter la modalité?',
      exitBodyPcg:        'Progression sauvegardée. Vous pouvez capturer les sites valvulaires restants depuis l\'aperçu patient.',
      exitBodyEcg:        'Progression sauvegardée. Vous pouvez capturer les dérivations restantes depuis l\'aperçu patient.',
      exitContinue:       'Continuer la capture',
      exitConfirm:        'Quitter vers l\'aperçu',
    },
    capture: {
      heartSound:       'Son cardiaque (PCG)',
      heartRhythm:      'Rythme cardiaque (ECG)',
      stepPosition:     'Position',
      stepAcquire:      'Acquérir',
      stepRecord:       'Enregistrer',
      stepScreen:       'Dépister',
      sectionPosition:  'POSITION',
      sectionQuality:   'QUALITÉ DU SIGNAL',
      sectionPosture:   'POSITION DU PATIENT',
      sectionStep:      'ÉTAPE',
      qualityGood:      'Suffisant pour l\'enregistrement',
      qualityImproving: 'En amélioration — restez immobile',
      qualityWeak:      'Signal trop faible — repositionner le capteur',
      tapToRecord:      'Appuyer pour enregistrer',
      waitingSignal:    'Attente du signal…',
      recordingNow:     'Enregistrement…',
      analysing:        'Analyse…',
      tapSub:           'Capture environ 4 secondes de son cardiaque.',
      tapSubEcg:        'Capture environ 30 secondes de rythme ECG.',
      postureSitting:   'Assis(e)',
      postureSupine:    'Allongé(e)',
      postureLeft:      'Décubitus latéral gauche',
      postureNote:      'Enregistré avec ce signal',
      connectTitle:     'Connectez votre CardioSleeve pour continuer',
      connectSub:       'Le CardioSleeve doit être connecté avant de commencer la capture. Reconnexion automatique en arrière-plan…',
      retryBtn:         'Réessayer la connexion',
      connConnected:    'Connecté',
      connReconnecting: 'Reconnexion…',
      connNotFound:     'Non connecté',
    },
    result: {
      normalTitle:          'Normal',
      normalSub:            'Les bruits cardiaques sont dans la plage attendue. Vous pouvez passer au patient suivant.',
      abnormalPendingTitle: 'Anormal — en attente',
      abnormalPendingSub:   'Un son anormal a été détecté. L\'enregistrement est en file d\'attente pour confirmation Stage 2.',
      abnormalConfTitle:    'Anormal — confirmé',
      abnormalConfSub:      'Le Stage 2 confirme un résultat anormal. Une sténose aortique est suspectée. Veuillez orienter ce patient.',
      inconclusiveTitle:    'Non concluant',
      inconclusiveSub:   'La qualité du signal était insuffisante. Repositionnez le capteur et recommencez.',
      ecgTitle:             'ECG capturé',
      ecgSub:               'Le rythme cardiaque a été enregistré avec succès et stocké dans cette session.',
      returnBtn:            'Retour au patient',
      captureAgainBtn:      'Capturer à nouveau',
      stage2Awaiting:       'En attente de connectivité pour la confirmation Stage 2',
      stage2Complete:       'Confirmation Stage 2 reçue',
      confidence:           'Confiance du modèle',
      headlineNormal:        'Sons cardiaques normaux',
      headlineAbnormal:      'Son anormal détecté',
      headlineInconc:        'Enregistrement inutilisable',
      backToSession:         'Retour à la session',
      repositionRecord:      'Repositionner et ré-enregistrer',
      stage2CloudConf:       'Confirmation cloud Étape 2',
      confirmedAsSuspected:  'Confirmé — SA suspectée',
      queuedAwaiting:        'En attente — en attente de connectivité',
      queuedNote:            'L\'enregistrement est en file d\'attente et se synchronisera au retour de la connectivité. Le dossier patient sera mis à jour automatiquement.',
      storedLocally:         'Stocké localement',
      tryAgain:              'Réessayer',
      backToOverview:        'Retour à l\'aperçu',
      nextValve:             'Site suivant',
      nextLead:              'Dérivation suivante',
      doneHs:                'Sons Cardiaques Terminés',
      doneEcg:               'ECG Terminé',
    },
    session: {
      title:           'Session patient',
      editDetails:     'Modifier les détails',
      finishSession:   'Terminer la session',
      patientDetails:  'DÉTAILS DU PATIENT',
      lastExam:        'DERNIER EXAMEN',
      captured:        'CAPTURÉ',
      extractRecord:   'Extraire le dossier',
      extractNote:     'Données démographiques & résultats de dépistage pour orientation ou données pilotes.',
      extractSummary:  'Résumé',
      extractCsv:      'Données (CSV)',
      heartSound:      'Son cardiaque (PCG)',
      heartSoundDesc:  'Auscultation des sites valvulaires cardiaques — alimente le modèle embarqué.',
      heartSoundTags:  ['4 sites valvulaires', '~30 sec', 'Guidé par la voix'],
      heartRhythm:     'Rythme cardiaque (ECG)',
      heartRhythmDesc: 'Capture de dérivation ECG — enregistré et stocké dans cette session.',
      heartRhythmTags: ['3 dérivations', '~30 sec', 'Stocké localement'],
      startCapture:    'Démarrer la capture',
      captureAgain:    'Capturer à nouveau',
      viewMeasure:     'Voir les mesures',
      stage1Label:     'DÉPISTAGE ÉTAPE 1',
      rhythmLabel:     'CAPTURE DU RYTHME',
      skipGuide:       'Ignorer le guide et démarrer',
    },
    measurements: {
      heartSound:     'Mesures du son cardiaque',
      heartRhythm:    'Mesures du rythme cardiaque',
      session:        'SESSION',
      capturedTrace:  'TRACÉ CAPTURÉ',
      scale:          '25 mm/s · 10 mm/mV',
      intervalTitle:  'ANALYSE DES INTERVALLES',
      normalRange:    'Plage normale',
      inRange:        'Dans la plage',
      outOfRange:     'Hors plage',
      murmurAnalysis: 'ANALYSE DU SOUFFLE',
      rhythmAnalysis: 'ANALYSE DU RYTHME',
      sessionSummary: 'RÉSUMÉ DE SESSION',
      playback:       'ÉCOUTE DE L\'ENREGISTREMENT',
      normalSpeed:    'Audio à vitesse normale',
      halfSpeed:      'Audio à demi-vitesse',
      downloadRaw:    'Télécharger les données brutes',
    },
    patientHistory: {
      title:           'Historique de dépistage',
      currentSession:  'SESSION EN COURS',
      previousSession: 'SESSION PRÉCÉDENTE',
      sessionCount:    'sessions',
      captureCount:    'captures au total',
      noHistory:       'Aucune session précédente enregistrée.',
      heartSound:      'Son cardiaque (PCG)',
      heartRhythm:     'Rythme cardiaque (ECG)',
      stage2Confirmed: 'Étape 2 confirmée',
      stage2Pending:   'En attente étape 2',
      viewBtn:         'Voir',
      confidence:      'Confiance',
      model:           'Modèle',
      site:            'Site',
      lead:            'Dérivation',
      posture:         'Posture',
    },
    settings: {
      title:           'Paramètres',
      language:        'Langue',
      bluetooth:       'Bluetooth CardioSleeve',
      videoGuides:     'Vidéos de guidage de positionnement',
      videoGuidesOn:   'Activé',
      videoGuidesOff:  'Désactivé',
      syncStatus:      'État de synchronisation',
      appVersion:      'Version de l\'application',
      noDevice:        'Aucun appareil connecté',
      disconnect:      'Déconnecter',
      connect:         'Connecter',
      pairedDevices:   'Appareils jumelés',
      findDevices:     'Rechercher de nouveaux appareils',
      scanning:        'Recherche… (jusqu\'à 12 s)',
      scanNote:        'Mettez le CardioSleeve en mode découvrable avant de rechercher.',
      noDevicesFound:  'Aucun appareil trouvé. Appuyez sur Rechercher.',
      scan:            'Rechercher',
      stop:            'Arrêter',
      refresh:         'Actualiser',
      connSync:        'Connectivité & sync',
      connOnlineNote:  'En ligne — les enregistrements en attente seront synchronisés prochainement.',
      connOfflineNote: 'Hors ligne — les enregistrements anormaux seront mis en file d\'attente jusqu\'au retour de la connectivité.',
      videoGuidesNote: 'Lire un clip de placement avant chaque capture.',
      resetLaunch:     'Réinitialiser le premier lancement (démo)',
      resetLaunchNote: 'Afficher à nouveau l\'écran de sélection de langue.',
      reset:           'Réinitialiser',
      account:         'Compte',
      signedInAs:      'CONNECTÉ EN TANT QUE',
      signOut:         'Se déconnecter',
    },
    sidenav: {
      appName:   'CardioSleeve',
      patients:  'Liste des patients',
      dashboard: 'Tableau de bord',
      settings:  'Paramètres',
      logout:    'Se déconnecter',
    },
    dashboard: {
      title:              'Tableau de bord',
      refresh:            'Actualiser',
      refreshing:         'Actualisation…',
      siteData:           'Données de dépistage locales',
      totalPatients:      'Total patients',
      screenedToday:      'Dépistés aujourd\'hui',
      flaggedStage2:      'Signalés (Étape 2)',
      flaggedSub:         'Suspicion SA confirmée',
      awaitingConfirm:    'En attente de confirmation',
      awaitingConfirmSub: 'Anormal, non encore synchronisé',
      heartSoundResults:  'Résultats des sons cardiaques',
      capturesStage1:     'captures avec résultat Étape 1',
      notYetScreened:     'Pas encore dépisté',
      pcgCaptures:        'Captures PCG',
      withoutPcg:         'patients sans PCG',
      ecgCaptures:        'Captures ECG',
      withoutEcg:         'patients sans ECG',
      syncQueue:          'File de synchronisation',
      waitingConn:        'En attente de connectivité',
      allSynced:          'Tous les enregistrements synchronisés',
      syncFailed:         'échoué — appuyer pour réessayer',
    },
  },

  // ── Kiswahili ──────────────────────────────────────────────────────────────
  sw: {
    common: {
      settings:   'Mipangilio',
      cancel:     'Ghairi',
      close:      'Funga',
      done:       'Imekamilika',
      retry:      'Jaribu tena',
      edit:       'Hariri',
      delete:     'Futa',
      download:   'Pakua',
      newPatient: 'Mgonjwa mpya',
      search:     'Tafuta',
      yes:        'Ndio',
      no:         'Hapana',
      unknown:      'Haijulikani',
      or:           'au',
      previous:     'Iliyopita',
      next:         'Inayofuata',
      clear:        'Futa',
      noRecords:    'Hakuna rekodi',
      selected:     'zimechaguliwa',
      dashboard:    'Dashibodi',
      exportTxt:    'Maandishi wazi (.txt)',
      exportCsv:    'Jedwali (.csv)',
      filterLabel:  'Chuja:',
      auscultation: 'Auscultation',
    },
    status: {
      normal:            'Kawaida',
      abnormalPending:   'Isiyo ya kawaida — inasubiriwa',
      abnormalConfirmed: 'Isiyo ya kawaida — imethibitishwa',
      inconclusive:      'Haijulikani',
      captured:          'Imepigwa',
      notCaptured:       'Haijapigwa',
      awaitingSync:      'Inasubiriwa usawazishaji',
    },
    language: {
      title:    'Chagua lugha yako',
      subtitle: 'Wekwa mara moja — mwongozo wa sauti unazungumza kwa lugha yako.',
      footnote: 'Inaweza kubadilishwa wakati wowote katika Mipangilio · lugha za majaribio ni za muda',
    },
    history: {
      title:          'Historia ya wagonjwa',
      searchHint:     'Tafuta jina au kode…',
      colPatient:     'Mgonjwa',
      colHeartSound:  'Sauti ya moyo',
      colHeartRhythm: 'Rhythm ya moyo',
      colLastExam:    'Uchunguzi wa mwisho',
      filterAll:      'Wagonjwa wote',
      filterAbnormal: 'Isiyo ya kawaida',
      filterPending:  'Inasubiriwa usawazishaji',
      noResults:      'Hakuna mgonjwa anayelingana na kichujio hiki.',
    },
    patient: {
      newTitle:       'Rekodi mpya ya mgonjwa',
      editTitle:      'Hariri rekodi ya mgonjwa',
      formSubtitle:   'Sehemu za data ni za muda — zinasubiriwa uthibitisho wa timu ya kliniki na IRB.',
      fullName:       'Jina kamili',
      fullNameHint:   'Jina la kwanza na la familia la mgonjwa',
      studyCode:      'Kode ya utafiti',
      ageYears:       'Umri (miaka)',
      sex:            'Jinsia',
      sexFemale:      'Mke',
      sexMale:        'Mume',
      sexOther:       'Nyingine',
      rhdLabel:       'RHD / utambuzi wa moyo unaojulikana awali',
      vitals:         'ALAMA ZA UHAI',
      vitalsOptional: '· si lazima',
      heightCm:       'Urefu (cm)',
      weightKg:       'Uzito (kg)',
      bloodPressure:  'Msongo wa damu (mmHg)',
      createBtn:      'Unda & anza kikao',
      saveBtn:        'Hifadhi mabadiliko',
      deleteBtn:          'Futa mgonjwa',
      deleteTitle:        'Futa rekodi hii ya mgonjwa',
      deleteNote:         'Inaondoa mgonjwa na data zote zilizopigwa. Haiwezi kurudishwa.',
      deleteConfirmTitle: 'Futa rekodi ya mgonjwa?',
      deleteConfirmBody:  'Hii itafuta kabisa data zote zilizopigwa za',
      unsavedTitle:       'Mabadiliko hayajahifadhiwa',
      unsavedBody:        'Una mabadiliko ambayo hayajahifadhiwa. Hifadhi kabla ya kutoka?',
      discardBtn:         'Acha',
      returningTitle: 'Mgonjwa anayerudi',
      returningSub:   'Unganisha kikao hiki na rekodi iliyopo.',
      searchHint:     'Tafuta jina au kode…',
      noPatients:     'Hakuna wagonjwa waliosajiliwa bado.',
      noMatch:        'Hakuna mechi — sajili kama mgonjwa mpya.',
      dangerZone:     'ENEO LA HATARI',
    },
    positionSelect: {
      titlePcg:           'Chagua tovuti ya valve',
      titleEcg:           'Chagua mwelekeo wa ECG',
      subtitle:           'Kila tovuti hutumia mwongozo maalum wa kuweka na video iliyoundwa kwa hiyo.',
      progressSuffixPcg:  'maeneo ya valve yaliyokamatwa',
      progressSuffixEcg:  'mwelekeo uliokamatwa',
      capturedBadge:      'Imekamilika',
      exitTitle:          'Toka kwa modali?',
      exitBodyPcg:        'Maendeleo yamehifadhiwa. Unaweza kukamata maeneo mengine ya valve kutoka muhtasarini wa mgonjwa.',
      exitBodyEcg:        'Maendeleo yamehifadhiwa. Unaweza kukamata mwelekeo mwingine kutoka muhtasarini wa mgonjwa.',
      exitContinue:       'Endelea kukamata',
      exitConfirm:        'Toka muhtasarini',
    },
    capture: {
      heartSound:       'Sauti ya Moyo (PCG)',
      heartRhythm:      'Rhythm ya Moyo (ECG)',
      stepPosition:     'Nafasi',
      stepAcquire:      'Pata',
      stepRecord:       'Rekodi',
      stepScreen:       'Uchunguzi',
      sectionPosition:  'NAFASI',
      sectionQuality:   'UBORA WA ISHARA',
      sectionPosture:   'NAFASI YA MGONJWA',
      sectionStep:      'HATUA',
      qualityGood:      'Inatosha kwa kurekodi',
      qualityImproving: 'Inaboresha — simama bado',
      qualityWeak:      'Ishara ni dhaifu sana — weka upya sensoro',
      tapToRecord:      'Gonga kurekodi',
      waitingSignal:    'Kusubiri ishara…',
      recordingNow:     'Inarekodiwa…',
      analysing:        'Inachambua…',
      tapSub:           'Inachukua takriban sekunde 4 za sauti ya moyo.',
      tapSubEcg:        'Inachukua takriban sekunde 30 za rhythm ya ECG.',
      postureSitting:   'Amekaa',
      postureSupine:    'Amelala',
      postureLeft:      'Upande wa kushoto',
      postureNote:      'Ilirekodiwa na ishara hii',
      connectTitle:     'Unganisha CardioSleeve yako kuendelea',
      connectSub:       'CardioSleeve lazima iwe imeunganishwa kabla ya kupiga kuanza. Inaunganisha upya nyuma ya mwisho…',
      retryBtn:         'Jaribu kuunganisha tena',
      connConnected:    'Imeunganishwa',
      connReconnecting: 'Inaunganisha upya…',
      connNotFound:     'Haijaunganyishwa',
    },
    result: {
      normalTitle:          'Kawaida',
      normalSub:            'Sauti za moyo ziko ndani ya mipaka inayotarajiwa. Unaweza kuendelea kwa mgonjwa mwingine.',
      abnormalPendingTitle: 'Isiyo ya kawaida — inasubiriwa',
      abnormalPendingSub:   'Sauti isiyo ya kawaida iligunduliwa. Rekodi imewekwa kwenye foleni ya uthibitisho wa Hatua 2.',
      abnormalConfTitle:    'Isiyo ya kawaida — imethibitishwa',
      abnormalConfSub:      'Hatua 2 inathibitisha matokeo yasiyo ya kawaida. Stenosis ya aortic inashukiwa. Tafadhali mpeleke mgonjwa huyu.',
      inconclusiveTitle:    'Haijulikani',
      inconclusiveSub:   'Ubora wa ishara haukutosha. Tafadhali weka upya sensoro na jaribu tena.',
      ecgTitle:             'ECG imepigwa',
      ecgSub:               'Rhythm ya moyo imerekodiwa kwa mafanikio na kuhifadhiwa katika kikao hiki.',
      returnBtn:            'Rudi kwa mgonjwa',
      captureAgainBtn:      'Piga tena',
      stage2Awaiting:       'Inasubiriwa muunganisho kwa uthibitisho wa Hatua 2',
      stage2Complete:       'Uthibitisho wa Hatua 2 umepokelewa',
      confidence:           'Imani ya modeli',
      headlineNormal:        'Sauti za moyo ni za kawaida',
      headlineAbnormal:      'Sauti isiyo ya kawaida iligunduliwa',
      headlineInconc:        'Rekodi haiwezi kutumika',
      backToSession:         'Rudi kwenye kikao',
      repositionRecord:      'Weka upya na urekodi tena',
      stage2CloudConf:       'Uthibitisho wa wingu wa Hatua 2',
      confirmedAsSuspected:  'Imethibitishwa — stenosis ya aortic inashukiwa',
      queuedAwaiting:        'Inasubiriwa — inasubiriwa muunganisho',
      queuedNote:            'Rekodi iko kwenye foleni na itasawazishwa muunganisho utaporeudi. Rekodi ya mgonjwa itasasishwa kiotomatiki.',
      storedLocally:         'Imehifadhiwa hapa',
      tryAgain:              'Jaribu Tena',
      backToOverview:        'Rudi Muhtasarini',
      nextValve:             'Valve inayofuata',
      nextLead:              'Mwelekeo unaofuata',
      doneHs:                'Sauti ya Moyo Imekamilika',
      doneEcg:               'ECG Imekamilika',
    },
    session: {
      title:           'Kikao cha mgonjwa',
      editDetails:     'Hariri maelezo',
      finishSession:   'Maliza kikao',
      patientDetails:  'MAELEZO YA MGONJWA',
      lastExam:        'UCHUNGUZI WA MWISHO',
      captured:        'IMEPIGWA',
      extractRecord:   'Toa rekodi',
      extractNote:     'Idadi ya watu & matokeo ya uchunguzi kwa rufaa au data za majaribio.',
      extractSummary:  'Muhtasari',
      extractCsv:      'Data (CSV)',
      heartSound:      'Sauti ya Moyo (PCG)',
      heartSoundDesc:  'Auscultation katika maeneo ya valve ya moyo — inaendesha modeli iliyopo kwenye kifaa.',
      heartSoundTags:  ['Maeneo 4 ya valve', '~sekunde 30', 'Inaongozwa na sauti'],
      heartRhythm:     'Rhythm ya Moyo (ECG)',
      heartRhythmDesc: 'Kupiga mwelekeo wa ECG — imerekodiwa na kuhifadhiwa katika kikao hiki.',
      heartRhythmTags: ['Mwelekeo 3', '~sekunde 30', 'Imehifadhiwa hapa'],
      startCapture:    'Anza kupiga',
      captureAgain:    'Piga tena',
      viewMeasure:     'Ona vipimo',
      stage1Label:     'UCHUNGUZI WA HATUA 1',
      rhythmLabel:     'KUPIGA RHYTHM',
      skipGuide:       'Ruka mwongozo na uanze',
    },
    measurements: {
      heartSound:     'Vipimo vya sauti ya moyo',
      heartRhythm:    'Vipimo vya rhythm ya moyo',
      session:        'KIKAO',
      capturedTrace:  'MSTARI ULIOPIGWA',
      scale:          '25 mm/s · 10 mm/mV',
      intervalTitle:  'UCHAMBUZI WA VIPINDI',
      normalRange:    'Mipaka ya kawaida',
      inRange:        'Ndani ya mipaka',
      outOfRange:     'Nje ya mipaka',
      murmurAnalysis: 'UCHAMBUZI WA MURMUR',
      rhythmAnalysis: 'UCHAMBUZI WA RHYTHM',
      sessionSummary: 'MUHTASARI WA KIKAO',
      playback:       'UCHEZAJI WA REKODI',
      normalSpeed:    'Sauti ya kasi ya kawaida',
      halfSpeed:      'Sauti ya nusu kasi',
      downloadRaw:    'Pakua data ghafi',
    },
    patientHistory: {
      title:           'Historia ya uchunguzi',
      currentSession:  'KIKAO CHA SASA',
      previousSession: 'KIKAO KILICHOPITA',
      sessionCount:    'vikao',
      captureCount:    'picha jumla',
      noHistory:       'Hakuna vikao vya awali vilivyorekodiwa.',
      heartSound:      'Sauti ya Moyo (PCG)',
      heartRhythm:     'Rhythm ya Moyo (ECG)',
      stage2Confirmed: 'Hatua 2 imethibitishwa',
      stage2Pending:   'Inasubiriwa Hatua 2',
      viewBtn:         'Tazama',
      confidence:      'Uhakika',
      model:           'Mfano',
      site:            'Tovuti',
      lead:            'Mwelekeo',
      posture:         'Mkao',
    },
    settings: {
      title:           'Mipangilio',
      language:        'Lugha',
      bluetooth:       'Bluetooth ya CardioSleeve',
      videoGuides:     'Video za mwongozo wa kuweka',
      videoGuidesOn:   'Imewashwa',
      videoGuidesOff:  'Imezimwa',
      syncStatus:      'Hali ya usawazishaji',
      appVersion:      'Toleo la programu',
      noDevice:        'Hakuna kifaa kilichounganishwa',
      disconnect:      'Tenganisha',
      connect:         'Unganisha',
      pairedDevices:   'Vifaa vilivyounganishwa',
      findDevices:     'Tafuta vifaa vipya',
      scanning:        'Inatafuta… (hadi sekunde 12)',
      scanNote:        'Weka CardioSleeve katika hali ya kutafutika kabla ya kutafuta.',
      noDevicesFound:  'Hakuna vifaa vilivyopatikana. Gonga Tafuta.',
      scan:            'Tafuta',
      stop:            'Simama',
      refresh:         'Onyesha upya',
      connSync:        'Muunganisho & usawazishaji',
      connOnlineNote:  'Mtandaoni — rekodi zinazosubiriwa zitasawazishwa hivi karibuni.',
      connOfflineNote: 'Nje ya mtandao — rekodi zisizo za kawaida zitasubiriwa hadi muunganisho urudi.',
      videoGuidesNote: 'Cheza klipu ya uwekaji kabla ya kila kupiga.',
      resetLaunch:     'Restarisha uzinduzi wa kwanza (demo)',
      resetLaunchNote: 'Onyesha tena skrini ya kuchagua lugha.',
      reset:           'Restarisha',
      account:         'Akaunti',
      signedInAs:      'UMEINGIA KAMA',
      signOut:         'Toka',
    },
    sidenav: {
      appName:   'CardioSleeve',
      patients:  'Orodha ya wagonjwa',
      dashboard: 'Dashibodi',
      settings:  'Mipangilio',
      logout:    'Toka',
    },
    dashboard: {
      title:              'Dashibodi',
      refresh:            'Onyesha upya',
      refreshing:         'Inasasisha…',
      siteData:           'Data ya uchunguzi wa ndani',
      totalPatients:      'Jumla ya wagonjwa',
      screenedToday:      'Waliochunguzwa leo',
      flaggedStage2:      'Waliobainishwa (Hatua 2)',
      flaggedSub:         'Tashwishi ya AS imethibitishwa',
      awaitingConfirm:    'Inasubiriwa uthibitisho',
      awaitingConfirmSub: 'Isiyo ya kawaida, haijasawazishwa',
      heartSoundResults:  'Matokeo ya sauti za moyo',
      capturesStage1:     'picha zenye matokeo ya Hatua 1',
      notYetScreened:     'Bado hawajachunguzwa',
      pcgCaptures:        'Picha za PCG',
      withoutPcg:         'wagonjwa bila PCG',
      ecgCaptures:        'Picha za ECG',
      withoutEcg:         'wagonjwa bila ECG',
      syncQueue:          'Foleni ya usawazishaji',
      waitingConn:        'Inasubiriwa muunganisho',
      allSynced:          'Rekodi zote zimesawazishwa',
      syncFailed:         'zilishindwa — gonga kujaribu tena',
    },
  },
};

export function getStrings(lang: string | null): UIStrings {
  const l = (lang ?? 'en') as SupportedLang;
  return STRINGS[l] ?? STRINGS.en;
}
