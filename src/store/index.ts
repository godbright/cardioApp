import { configureStore } from '@reduxjs/toolkit';
import authReducer      from './slices/authSlice';
import dashboardReducer from './slices/dashboardSlice';

export const store = configureStore({
  reducer: {
    auth:      authReducer,
    dashboard: dashboardReducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: {
        // WatermelonDB models are not plain objects — exclude them from the
        // serializable check to avoid spurious warnings.
        ignoredActions: ['auth/login/fulfilled'],
      },
    }),
});

export type RootState   = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
