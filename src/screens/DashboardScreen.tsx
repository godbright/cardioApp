import React, { useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Header from '../components/Header';
import { useApp } from '../context/AppContext';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { refreshDashboard } from '../store/slices/dashboardSlice';
import { Colors } from '../theme/colors';
import {
  UserIcon, HeartIcon, ActivityIcon, CheckCircleIcon,
  AlertTriangleIcon, ClockIcon, WifiOffIcon,
} from '../components/Icons';
import { useStrings } from '../i18n/useStrings';

// ─── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number | string;
  sub?: string;
  accent: string;
  icon: React.ReactElement;
  wide?: boolean;
}

function StatCard({ label, value, sub, accent, icon, wide }: StatCardProps) {
  return (
    <View style={[styles.statCard, wide && styles.statCardWide]}>
      <View style={styles.statTopRow}>
        <Text style={styles.statLabel}>{label}</Text>
        <View style={[styles.statIcon, { backgroundColor: accent + '1A' }]}>
          {React.cloneElement(icon, { size: 18, color: accent })}
        </View>
      </View>
      <Text style={[styles.statValue, { color: Colors.textHeading }]}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

// ─── Result bar ───────────────────────────────────────────────────────────────

interface ResultBarProps {
  label: string;
  count: number;
  total: number;
  color: string;
}

function ResultBar({ label, count, total, color }: ResultBarProps) {
  const pct = total > 0 ? count / total : 0;
  return (
    <View style={styles.barRow}>
      <View style={styles.barMeta}>
        <Text style={styles.barLabel}>{label}</Text>
        <Text style={[styles.barCount, { color }]}>{count}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { state } = useApp();
  const dispatch = useAppDispatch();
  const { stats, loading } = useAppSelector(s => s.dashboard);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isLandscape = width > 600;
  const S = useStrings();

  useEffect(() => {
    dispatch(refreshDashboard(state.patients));
  }, [state.patients, dispatch]);

  const workerName = state.worker ?? 'Health Worker';
  const profile    = useAppSelector(s => s.auth.profile);
  const siteId     = profile?.siteId ?? '—';

  const hsTotal = stats.hs_normal + stats.hs_abnormalPending + stats.hs_abnormalConfirmed + stats.hs_inconclusive;

  return (
    <View style={styles.root}>
      <Header title={S.dashboard.title} canBack />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* Welcome banner */}
        <View style={styles.banner}>
          <View>
            <Text style={styles.bannerGreeting}>Welcome, {workerName}</Text>
            <Text style={styles.bannerSite}>{siteId} — {S.dashboard.siteData}</Text>
          </View>
          <TouchableOpacity style={styles.refreshBtn} onPress={() => dispatch(refreshDashboard(state.patients))}>
            <Text style={styles.refreshBtnText}>{loading ? S.dashboard.refreshing : S.dashboard.refresh}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Top stats row ── */}
        <View style={[styles.row, isLandscape && styles.rowLandscape]}>
          <StatCard
            label={S.dashboard.totalPatients}
            value={stats.totalPatients}
            accent={Colors.navy}
            icon={<UserIcon />}
          />
          <StatCard
            label={S.dashboard.screenedToday}
            value={stats.screenedToday}
            accent={Colors.teal}
            icon={<HeartIcon />}
          />
          <StatCard
            label={S.dashboard.flaggedStage2}
            value={stats.hs_abnormalConfirmed}
            sub={S.dashboard.flaggedSub}
            accent={Colors.red}
            icon={<AlertTriangleIcon />}
          />
          <StatCard
            label={S.dashboard.awaitingConfirm}
            value={stats.hs_abnormalPending}
            sub={S.dashboard.awaitingConfirmSub}
            accent={Colors.amber}
            icon={<ClockIcon />}
          />
        </View>

        {/* ── Heart Sound results ── */}
        <View style={[styles.panel, isLandscape && styles.panelHalf]}>
          <Text style={styles.panelTitle}>{S.dashboard.heartSoundResults}</Text>
          <Text style={styles.panelSub}>{hsTotal} {S.dashboard.capturesStage1}</Text>

          <ResultBar label={S.status.normal}            count={stats.hs_normal}            total={stats.totalPatients} color={Colors.green}  />
          <ResultBar label={S.status.abnormalConfirmed} count={stats.hs_abnormalConfirmed} total={stats.totalPatients} color={Colors.red}   />
          <ResultBar label={S.status.abnormalPending}   count={stats.hs_abnormalPending}   total={stats.totalPatients} color={Colors.amber} />
          <ResultBar label={S.status.inconclusive}      count={stats.hs_inconclusive}      total={stats.totalPatients} color={Colors.textMute} />
          <ResultBar label={S.dashboard.notYetScreened} count={stats.hs_none}              total={stats.totalPatients} color={Colors.border} />
        </View>

        {/* ── PCG + ECG + Sync row ── */}
        <View style={[styles.row, isLandscape && styles.rowHalf]}>

          {/* PCG panel */}
          <View style={[styles.panel, styles.panelFlex]}>
            <View style={styles.statTopRow}>
              <Text style={styles.statLabel}>{S.dashboard.pcgCaptures}</Text>
              <View style={[styles.statIcon, { backgroundColor: Colors.navy + '1A' }]}>
                <HeartIcon size={18} color={Colors.navy} />
              </View>
            </View>
            <Text style={[styles.bigNum, { color: Colors.textHeading }]}>{stats.pcg_captured}</Text>
            <Text style={styles.panelSub}>{stats.pcg_none} {S.dashboard.withoutPcg}</Text>
          </View>

          {/* ECG panel */}
          <View style={[styles.panel, styles.panelFlex]}>
            <View style={styles.statTopRow}>
              <Text style={styles.statLabel}>{S.dashboard.ecgCaptures}</Text>
              <View style={[styles.statIcon, { backgroundColor: Colors.teal + '1A' }]}>
                <ActivityIcon size={18} color={Colors.teal} />
              </View>
            </View>
            <Text style={[styles.bigNum, { color: Colors.textHeading }]}>{stats.ecg_captured}</Text>
            <Text style={styles.panelSub}>{stats.ecg_none} {S.dashboard.withoutEcg}</Text>
          </View>

          {/* Sync queue panel */}
          {(() => {
            const syncAccent = stats.syncPending > 0 ? Colors.amber : Colors.green;
            const SyncIcon   = stats.syncPending > 0 ? WifiOffIcon : CheckCircleIcon;
            return (
              <View style={[styles.panel, styles.panelFlex]}>
                <View style={styles.statTopRow}>
                  <Text style={styles.statLabel}>{S.dashboard.syncQueue}</Text>
                  <View style={[styles.statIcon, { backgroundColor: syncAccent + '1A' }]}>
                    <SyncIcon size={18} color={syncAccent} />
                  </View>
                </View>
                <Text style={[styles.bigNum, { color: Colors.textHeading }]}>
                  {stats.syncPending > 0 ? stats.syncPending : S.common.clear}
                </Text>
                <Text style={styles.panelSub}>
                  {stats.syncPending > 0 ? S.dashboard.waitingConn : S.dashboard.allSynced}
                </Text>
                {stats.syncFailed > 0 && (
                  <Text style={[styles.panelSub, { color: Colors.red, marginTop: 4 }]}>
                    {stats.syncFailed} {S.dashboard.syncFailed}
                  </Text>
                )}
              </View>
            );
          })()}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bgWarm,
  },
  scroll: { flex: 1 },
  content: {
    padding: 20,
    gap: 16,
  },

  // ── Banner ──
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.navy,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  bannerGreeting: {
    fontSize: 17,
    fontFamily: 'IBMPlexSans-SemiBold', fontWeight: '600',
    color: Colors.white,
  },
  bannerSite: {
    fontSize: 13,
    color: Colors.textReversed,
    marginTop: 3,
  },
  refreshBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  refreshBtnText: {
    fontSize: 13,
    color: Colors.white,
    fontFamily: 'IBMPlexSans-Regular', fontWeight: '400',
  },

  // ── Rows ──
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  rowLandscape: {
    flexWrap: 'nowrap',
  },
  rowHalf: {
    gap: 12,
  },

  // ── Stat card ──
  statCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 18,
    gap: 0,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  statCardWide: {
    flex: 2,
  },
  statTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 32,
    fontFamily: 'IBMPlexSans-Bold',
    fontWeight: '700',
    letterSpacing: -1,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: 'IBMPlexSans-Medium',
    fontWeight: '500',
    color: Colors.textMute,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    flex: 1,
    marginRight: 8,
    marginTop: 2,
  },
  statSub: {
    fontSize: 12,
    color: Colors.textMute,
    fontFamily: 'IBMPlexSans-Regular',
    fontWeight: '400',
    lineHeight: 16,
  },

  // ── Panel ──
  panel: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  panelHalf: {
    flex: 1,
  },
  panelFlex: {
    flex: 1,
  },
  panelTitle: {
    fontSize: 15,
    fontFamily: 'IBMPlexSans-SemiBold', fontWeight: '600',
    color: Colors.textDark,
  },
  panelSub: {
    fontSize: 12,
    color: Colors.textMute,
  },
  bigNum: {
    fontSize: 36,
    fontFamily: 'IBMPlexMono-Regular',
    letterSpacing: -0.5,
  },

  // ── Bar ──
  barRow: {
    gap: 5,
  },
  barMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  barLabel: {
    fontSize: 13,
    color: Colors.textMid,
  },
  barCount: {
    fontSize: 13,
    fontFamily: 'IBMPlexMono-Regular',
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.bgCanvas,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },

});
