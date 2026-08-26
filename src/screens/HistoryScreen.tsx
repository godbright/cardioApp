import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert,
} from 'react-native';
import { useApp } from '../context/AppContext';
import Header from '../components/Header';
import {
  SearchIcon, FilterIcon, PlusIcon, ChevronDown,
  ChevronRight, CheckIcon, XIcon, DownloadIcon, GridIcon,
} from '../components/Icons';
import { Colors } from '../theme/colors';
import { useOrientation } from '../hooks/useOrientation';
import { useStrings } from '../i18n/useStrings';
import type { UIStrings } from '../i18n/strings';
import type { Patient, FilterOption } from '../types';

const ROWS_PER_PAGE = 8;

// ─── Status helpers ───────────────────────────────────────────────────────────

function hsInfo(code: string, S: UIStrings) {
  if (code === 'normal')             return { dot: Colors.green,      text: S.status.normal,            color: Colors.green };
  if (code === 'abnormal-pending')   return { dot: Colors.red,        text: S.status.abnormalPending,   color: Colors.red };
  if (code === 'abnormal-confirmed') return { dot: Colors.red,        text: S.status.abnormalConfirmed, color: Colors.red };
  if (code === 'inconclusive')       return { dot: Colors.amber,      text: S.status.inconclusive,      color: Colors.amber };
  return { dot: Colors.statusNone, text: S.status.notCaptured, color: Colors.textLight };
}

function hrInfo(code: string, S: UIStrings) {
  if (code === 'captured') return { dot: Colors.textDark, text: S.status.captured,    color: Colors.textDark };
  return { dot: '#CBD2D9',            text: S.status.notCaptured, color: Colors.textLight };
}

function StatusDot({ code, isHr, S }: { code: string; isHr?: boolean; S: UIStrings }) {
  const info = isHr ? hrInfo(code, S) : hsInfo(code, S);
  return (
    <View style={dotStyles.row}>
      <View style={[dotStyles.dot, { backgroundColor: info.dot }]} />
      <Text style={[dotStyles.text, { color: info.color }]}>{info.text}</Text>
    </View>
  );
}
const dotStyles = StyleSheet.create({
  row:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot:  { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  text: { fontSize: 14, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400' },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const { state, dispatch, newPatient, openPatient } = useApp();
  const { patients, selected, filter, page } = state;
  const { isPortrait } = useOrientation();
  const S = useStrings();

  const [search, setSearch]         = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // Count for the "Awaiting sync" badge
  const awaitingCount = useMemo(
    () => patients.filter(p => p.hs === 'abnormal-pending').length,
    [patients],
  );

  const FILTER_OPTIONS: { value: FilterOption; label: string; dot: string; count?: number }[] = useMemo(
    () => [
      { value: 'all',                label: S.history.filterAll,      dot: Colors.navy },
      { value: 'abnormal-confirmed', label: S.history.filterAbnormal, dot: Colors.red },
      { value: 'abnormal-pending',   label: S.status.abnormalPending, dot: Colors.red, count: awaitingCount },
      { value: 'normal',             label: S.status.normal,          dot: Colors.green },
      { value: 'none',               label: S.status.notCaptured,     dot: Colors.statusNone },
    ],
    [awaitingCount, S],
  );

  const filtered = useMemo(() => {
    let list = patients;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
      );
    }
    if (filter !== 'all') {
      list = list.filter(p => p.hs === filter || p.hr === filter);
    }
    return list;
  }, [patients, search, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const safePage   = Math.min(page, totalPages - 1);
  const pageRows   = filtered.slice(safePage * ROWS_PER_PAGE, (safePage + 1) * ROWS_PER_PAGE);
  const firstRow   = filtered.length === 0 ? 0 : safePage * ROWS_PER_PAGE + 1;
  const lastRow    = Math.min((safePage + 1) * ROWS_PER_PAGE, filtered.length);

  const selectedIds    = Object.keys(selected);
  const selectedCount  = selectedIds.length;
  const pageIds        = pageRows.map(p => p.id);
  const allPageChecked = pageIds.length > 0 && pageIds.every(id => selected[id]);

  function toggleAll()        { dispatch({ type: 'SELECT_ALL', ids: pageIds, select: !allPageChecked }); }
  function toggleRow(id: string) { dispatch({ type: 'TOGGLE_SELECT', id }); }
  function setFilter(f: FilterOption) {
    dispatch({ type: 'PATCH', patch: { filter: f, page: 0 } });
    setFilterOpen(false);
  }
  function setPage(n: number) { dispatch({ type: 'SET_FIELD', key: 'page', value: n }); }
  function handleExport(fmt: 'txt' | 'csv') {
    const rows = selectedIds.map(id => patients.find(p => p.id === id)).filter(Boolean) as Patient[];
    const body = fmt === 'csv'
      ? ['ID,Name,Age,Sex,Last Exam,Auscultation,Heart Rhythm',
         ...rows.map(p => `${p.id},${p.name},${p.age},${p.sex},${p.lastExam},${p.hs},${p.hr}`)].join('\n')
      : rows.map(p => `${p.id}  ${p.name}  Age ${p.age}${p.sex}  ${p.lastExam}`).join('\n');
    Alert.alert(`Export ${fmt.toUpperCase()}`, body);
    setExportOpen(false);
  }

  const activeOpt = FILTER_OPTIONS.find(o => o.value === filter) ?? FILTER_OPTIONS[0];

  return (
    <View style={styles.root}>
      <Header title={S.history.title} />

      <View style={styles.content}>
        {/* ── Toolbar ──────────────────────────────────── */}
        <View style={styles.toolbar}>
          {/* Search */}
          <View style={styles.searchBox}>
            <SearchIcon size={16} color={Colors.textLight} />
            <TextInput
              style={styles.searchInput}
              placeholder={S.history.searchHint}
              placeholderTextColor={Colors.textLight}
              value={search}
              onChangeText={t => { setSearch(t); setPage(0); }}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <XIcon size={14} color={Colors.textLight} />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter + New Patient */}
          <View style={styles.toolbarActions}>
            <View style={styles.dropdownAnchor}>
              <TouchableOpacity
                style={styles.filterBtn}
                onPress={() => { setFilterOpen(o => !o); setExportOpen(false); }}
              >
                <FilterIcon size={14} color={Colors.textMid} />
                {!isPortrait && <Text style={styles.filterLabel}>{S.common.filterLabel} </Text>}
                <Text style={styles.filterValue}>{activeOpt.label}</Text>
                {activeOpt.count ? <Text style={styles.filterCount}>{activeOpt.count}</Text> : null}
                <ChevronDown size={14} color={Colors.textMid} />
              </TouchableOpacity>

              {filterOpen && (
                <View style={[styles.dropdown, styles.dropdownRight]}>
                  {FILTER_OPTIONS.map(opt => {
                    const isActive = opt.value === filter;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[styles.dropdownItem, isActive && styles.dropdownItemActive]}
                        onPress={() => setFilter(opt.value)}
                      >
                        <View style={[styles.dropdownDot, { backgroundColor: opt.dot }]} />
                        <Text style={[styles.dropdownText, isActive && styles.dropdownTextActive]}>
                          {opt.label}
                        </Text>
                        {opt.count ? (
                          <Text style={styles.dropdownCount}>{opt.count}</Text>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            <TouchableOpacity style={styles.newBtn} onPress={newPatient}>
              <PlusIcon size={15} color={Colors.white} />
              <Text style={styles.newBtnText}>{S.common.newPatient}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Selection bar ──────────────────────────── */}
        {selectedCount > 0 && (
          <View style={styles.selBar}>
            <View style={styles.selCheckBox}>
              <CheckIcon size={12} color={Colors.white} />
            </View>
            <Text style={styles.selCount}>{selectedCount} {S.common.selected}</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={styles.selClearBtn} onPress={() => dispatch({ type: 'CLEAR_SELECTED' })}>
              <Text style={styles.selClearText}>{S.common.clear}</Text>
            </TouchableOpacity>
            <View style={styles.dropdownAnchor}>
              <TouchableOpacity
                style={styles.extractBtn}
                onPress={() => { setExportOpen(o => !o); setFilterOpen(false); }}
              >
                <DownloadIcon size={14} color={Colors.navy} />
                <Text style={styles.extractBtnText}>{S.session.extractRecord}</Text>
                <ChevronDown size={13} color={Colors.navy} />
              </TouchableOpacity>
              {exportOpen && (
                <View style={[styles.dropdown, styles.dropdownRight]}>
                  <TouchableOpacity style={styles.dropdownItem} onPress={() => handleExport('txt')}>
                    <GridIcon size={13} color={Colors.textMid} />
                    <Text style={styles.dropdownText}>{S.common.exportTxt}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dropdownItem} onPress={() => handleExport('csv')}>
                    <GridIcon size={13} color={Colors.textMid} />
                    <Text style={styles.dropdownText}>{S.common.exportCsv}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── Table card ─────────────────────────────── */}
        <View style={styles.tableCard}>
          {/* Header row */}
          <View style={styles.tableHead}>
            <TouchableOpacity style={styles.checkCell} onPress={toggleAll}>
              <View style={[styles.checkbox, allPageChecked && styles.checkboxOn]}>
                {allPageChecked && <CheckIcon size={10} color={Colors.white} />}
              </View>
            </TouchableOpacity>
            <Text style={[styles.th, styles.colPat, isPortrait && styles.colPatPortrait]}>{S.history.colPatient}</Text>
            {!isPortrait && <Text style={[styles.th, styles.colExam]}>{S.history.colLastExam}</Text>}
            <Text style={[styles.th, styles.colHs]}>{S.common.auscultation}</Text>
            {!isPortrait && <Text style={[styles.th, styles.colHr]}>{S.history.colHeartRhythm}</Text>}
            <View style={styles.colChevron} />
          </View>

          {/* Data rows */}
          <ScrollView style={{ flex: 1 }}>
            {pageRows.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>{S.history.noResults}</Text>
              </View>
            ) : pageRows.map((p, idx) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.dataRow, idx < pageRows.length - 1 && styles.dataRowBorder]}
                onPress={() => openPatient(p)}
                activeOpacity={0.7}
              >
                <TouchableOpacity
                  style={styles.checkCell}
                  onPress={e => { e.stopPropagation?.(); toggleRow(p.id); }}
                >
                  <View style={[styles.checkbox, selected[p.id] && styles.checkboxOn]}>
                    {selected[p.id] && <CheckIcon size={10} color={Colors.white} />}
                  </View>
                </TouchableOpacity>

                <View style={[styles.tdCell, styles.colPat, isPortrait && styles.colPatPortrait]}>
                  <Text style={styles.patName}>{p.name}</Text>
                  <Text style={styles.patMeta}>
                    {p.id} · {p.age}y · {p.sex}
                    {isPortrait ? `  ·  ${p.lastExam}` : ''}
                  </Text>
                </View>

                {!isPortrait && (
                  <Text style={[styles.tdText, styles.colExam]}>{p.lastExam}</Text>
                )}

                <View style={[styles.tdCell, styles.colHs]}>
                  <StatusDot code={p.hs} S={S} />
                </View>

                {!isPortrait && (
                  <View style={[styles.tdCell, styles.colHr]}>
                    <StatusDot code={p.hr} isHr S={S} />
                  </View>
                )}

                <View style={styles.colChevron}>
                  <ChevronRight size={16} color={Colors.textLight} />
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Pagination */}
          <View style={styles.pagination}>
            <Text style={styles.pageCount}>
              {filtered.length === 0 ? S.common.noRecords : `${firstRow}–${lastRow} of ${filtered.length}`}
            </Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              style={[styles.pageBtn, safePage === 0 && styles.pageBtnOff]}
              onPress={() => safePage > 0 && setPage(safePage - 1)}
              disabled={safePage === 0}
            >
              <Text style={[styles.pageBtnText, safePage === 0 && styles.pageBtnTextOff]}>{S.common.previous}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pageBtn, safePage >= totalPages - 1 && styles.pageBtnOff]}
              onPress={() => safePage < totalPages - 1 && setPage(safePage + 1)}
              disabled={safePage >= totalPages - 1}
            >
              <Text style={[styles.pageBtnText, safePage >= totalPages - 1 && styles.pageBtnTextOff]}>{S.common.next}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Colors.bgWarm },
  content: { flex: 1, padding: 20, gap: 14 },

  // Toolbar
  toolbar:        { flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 10, elevation: 10 },
  toolbarActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchBox: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    height: 44, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: 9, paddingHorizontal: 14, backgroundColor: Colors.white,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textDark },

  // Filter button
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    height: 44, paddingHorizontal: 16, borderRadius: 9,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white,
  },
  filterLabel: { fontSize: 14, color: Colors.textMid },
  filterValue: { fontSize: 14, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.textDark },
  filterCount: {
    fontSize: 11, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.white,
    backgroundColor: Colors.amber, borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden',
  },

  // Dropdown
  dropdownAnchor: { position: 'relative' },
  dropdown: {
    position: 'absolute', top: 48, left: 0, zIndex: 200,
    backgroundColor: Colors.white, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, minWidth: 220,
    shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.borderFaint,
  },
  dropdownItemActive: { backgroundColor: '#F5F7FF' },
  dropdownDot:  { width: 9, height: 9, borderRadius: 5, flexShrink: 0 },
  dropdownText: { flex: 1, fontSize: 14, color: Colors.textDark },
  dropdownTextActive: { fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.navy },
  dropdownCount: {
    fontSize: 11, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.white,
    backgroundColor: Colors.amber, borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden',
  },

  // New patient
  dashBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    height: 44, paddingHorizontal: 18,
    borderWidth: 1.5, borderColor: Colors.navy, borderRadius: 9,
    backgroundColor: Colors.navy + '12',
  },
  dashBtnText: { fontSize: 14, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.navy },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    height: 44, paddingHorizontal: 20,
    backgroundColor: Colors.navy, borderRadius: 9,
  },
  newBtnText: { fontSize: 14, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.white },

  // Selection bar — dark navy strip
  selBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.navy, borderRadius: 9,
    zIndex: 20, elevation: 20,
  },
  selCheckBox: {
    width: 26, height: 26, borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  selCount:    { fontSize: 14, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.white },
  selClearBtn: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8,
    backgroundColor: Colors.white,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  selClearText: { fontSize: 13, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.textDark },
  extractBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    height: 38, paddingHorizontal: 14,
    borderRadius: 8, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white,
  },
  extractBtnText: { fontSize: 13, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.navy },

  // Table card
  tableCard: {
    flex: 1, backgroundColor: Colors.white,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },

  // Header row
  tableHead: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  th: {
    fontSize: 11, fontFamily: 'IBMPlexMono-Regular', fontWeight: '400', color: Colors.textMid,
    letterSpacing: 2, textTransform: 'uppercase', paddingVertical: 14,
  },

  // Data rows
  dataRow: {
    flexDirection: 'row', alignItems: 'center',
    minHeight: 60, backgroundColor: Colors.white,
  },
  dataRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.borderFaint },
  checkCell: { width: 52, alignItems: 'center', justifyContent: 'center' },
  checkbox: {
    width: 18, height: 18, borderRadius: 4,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white,
  },
  checkboxOn: { backgroundColor: Colors.navy, borderColor: Colors.navy },
  tdCell: { justifyContent: 'center', paddingVertical: 12 },
  tdText: { fontSize: 14, color: Colors.textMid, paddingVertical: 12 },
  colPat:        { flex: 2.5, paddingRight: 12 },
  colPatPortrait: { flex: 3 },
  colExam:       { flex: 1,   paddingRight: 12 },
  colHs:         { flex: 1.8, paddingRight: 12 },
  colHr:         { flex: 1.4, paddingRight: 12 },
  colChevron: { width: 44, alignItems: 'center' },
  patName: { fontSize: 14, fontFamily: 'IBMPlexSans-Regular', fontWeight: '700', color: Colors.textDark },
  patMeta: { fontSize: 12, color: Colors.textLight, marginTop: 3 },
  emptyRow: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 15, color: Colors.textLight },

  // Pagination
  pagination: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 13,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  pageCount:           { fontSize: 13, color: Colors.textMid },
  pageBtn:             { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: Colors.border, marginLeft: 8 },
  pageBtnOff:          { borderColor: Colors.borderLight },
  pageBtnText:         { fontSize: 14, color: Colors.textDark },
  pageBtnTextOff:      { color: Colors.border },
  dropdownRight:       { right: 0 },
});
