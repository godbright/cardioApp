import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { Patient } from '../../types';

export interface DashboardStats {
  totalPatients: number;
  screenedToday: number;
  // Heart sound breakdown
  hs_normal: number;
  hs_abnormalPending: number;
  hs_abnormalConfirmed: number;
  hs_inconclusive: number;
  hs_none: number;
  // PCG breakdown
  pcg_captured: number;
  pcg_none: number;
  // ECG breakdown
  ecg_captured: number;
  ecg_none: number;
  // Sync queue
  syncPending: number;
  syncFailed: number;
  computedAt: number;
}

const empty: DashboardStats = {
  totalPatients: 0,
  screenedToday: 0,
  hs_normal: 0,
  hs_abnormalPending: 0,
  hs_abnormalConfirmed: 0,
  hs_inconclusive: 0,
  hs_none: 0,
  pcg_captured: 0,
  pcg_none: 0,
  ecg_captured: 0,
  ecg_none: 0,
  syncPending: 0,
  syncFailed: 0,
  computedAt: 0,
};

interface DashboardState {
  stats: DashboardStats;
  loading: boolean;
}

const initialState: DashboardState = {
  stats: empty,
  loading: false,
};

// Computes stats from the in-memory patient list (AppContext) for now.
// When WatermelonDB is fully populated, swap in a direct DB query here.
export const refreshDashboard = createAsyncThunk<DashboardStats, Patient[]>(
  'dashboard/refresh',
  async (patients) => {
    const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    // "Today" in the seed data uses the display string format; adapt as needed.
    const todayKeywords = ['Today', todayStr];

    let screenedToday = 0;
    let hs_normal = 0, hs_pending = 0, hs_confirmed = 0, hs_inconcl = 0, hs_none = 0;
    let pcg_cap = 0, pcg_none = 0;
    let ecg_cap = 0, ecg_none = 0;
    let syncPending = 0;

    for (const p of patients) {
      if (todayKeywords.some(k => p.lastExam?.includes(k) || p.lastExam === 'Today')) {
        screenedToday++;
      }
      switch (p.hs) {
        case 'normal':             hs_normal++;    break;
        case 'abnormal-pending':   hs_pending++;   syncPending++; break;
        case 'abnormal-confirmed': hs_confirmed++; break;
        case 'inconclusive':       hs_inconcl++;   break;
        default:                   hs_none++;      break;
      }
      if (p.hs && p.hs !== 'none') { pcg_cap++; } else { pcg_none++; }
      if (p.hr === 'ecg-captured') { ecg_cap++; } else { ecg_none++; }
    }

    return {
      totalPatients: patients.length,
      screenedToday,
      hs_normal,
      hs_abnormalPending: hs_pending,
      hs_abnormalConfirmed: hs_confirmed,
      hs_inconclusive: hs_inconcl,
      hs_none,
      pcg_captured: pcg_cap,
      pcg_none,
      ecg_captured: ecg_cap,
      ecg_none,
      syncPending,
      syncFailed: 0,
      computedAt: Date.now(),
    };
  },
);

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(refreshDashboard.pending, state => { state.loading = true; })
      .addCase(refreshDashboard.fulfilled, (state, action: PayloadAction<DashboardStats>) => {
        state.stats = action.payload;
        state.loading = false;
      })
      .addCase(refreshDashboard.rejected, state => { state.loading = false; });
  },
});

export default dashboardSlice.reducer;
