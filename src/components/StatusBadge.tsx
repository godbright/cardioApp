import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import type { HeartSoundStatus, HeartRhythmStatus } from '../types';

interface StatusBadgeProps {
  code: HeartSoundStatus | HeartRhythmStatus | string;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ code, size = 'md' }: StatusBadgeProps) {
  const { statusVM } = useApp();
  const vm = statusVM(code);
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: vm.color }]} />
      <Text style={[styles.label, size === 'sm' && styles.labelSm, { color: vm.color }]}>
        {vm.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', gap: 9 },
  dot:     { width: 8, height: 8, borderRadius: 4 },
  label:   { fontSize: 14, fontWeight: '500' },
  labelSm: { fontSize: 12 },
});
