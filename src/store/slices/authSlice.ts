import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { AuthService, WorkerProfileData } from '../../services/authService';

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'error';

interface AuthState {
  status: AuthStatus;
  profile: WorkerProfileData | null;
  errorMsg: string;
}

const initialState: AuthState = {
  status: 'idle',
  profile: null,
  errorMsg: '',
};

// Async thunk: verify PIN against WatermelonDB, resolve with profile on success.
export const loginThunk = createAsyncThunk<
  WorkerProfileData,
  { workerId: string; pin: string },
  { rejectValue: string }
>(
  'auth/login',
  async ({ workerId, pin }, { rejectWithValue }) => {
    try {
      const profile = await AuthService.verifyPin(workerId, pin);
      if (!profile) return rejectWithValue('Invalid CHW ID or PIN. Check your credentials card.');
      return profile;
    } catch (err: any) {
      return rejectWithValue('Login failed — database error. Try again.');
    }
  },
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logoutAuth(state) {
      state.status = 'idle';
      state.profile = null;
      state.errorMsg = '';
    },
    clearAuthError(state) {
      state.errorMsg = '';
    },
  },
  extraReducers: builder => {
    builder
      .addCase(loginThunk.pending, state => {
        state.status = 'loading';
        state.errorMsg = '';
      })
      .addCase(loginThunk.fulfilled, (state, action: PayloadAction<WorkerProfileData>) => {
        state.status = 'authenticated';
        state.profile = action.payload;
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.status = 'error';
        state.errorMsg = action.payload ?? 'Unknown error';
      });
  },
});

export const { logoutAuth, clearAuthError } = authSlice.actions;
export default authSlice.reducer;
