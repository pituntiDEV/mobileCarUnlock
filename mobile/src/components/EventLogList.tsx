import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { theme } from '../styles/theme';
import { UnlockEvent } from '../types';

interface EventLogListProps {
  events: UnlockEvent[];
  onClear: () => void;
}

export const EventLogList: React.FC<EventLogListProps> = ({ events, onClear }) => {
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toTimeString().split(' ')[0];
  };

  const getBadgeStyle = (type: string) => {
    switch (type) {
      case 'SUCCESS':
        return {
          bg: theme.colors.successGlow,
          border: theme.colors.success,
          text: theme.colors.success,
        };
      case 'COOLDOWN':
        return {
          bg: theme.colors.warningGlow,
          border: theme.colors.warning,
          text: theme.colors.warning,
        };
      default:
        return {
          bg: theme.colors.errorGlow,
          border: theme.colors.error,
          text: theme.colors.error,
        };
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Historial de Eventos</Text>
        {events.length > 0 && (
          <TouchableOpacity onPress={onClear} activeOpacity={0.7}>
            <Text style={styles.clearText}>Limpiar</Text>
          </TouchableOpacity>
        )}
      </View>

      {events.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Sin eventos recientes</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(_, index) => index.toString()}
          scrollEnabled={false}
          renderItem={({ item }) => {
            const badge = getBadgeStyle(item.type);
            return (
              <View style={styles.eventRow}>
                <View style={styles.eventLeft}>
                  <View
                    style={[
                      styles.typeBadge,
                      { backgroundColor: badge.bg, borderColor: badge.border },
                    ]}
                  >
                    <Text style={[styles.typeText, { color: badge.text }]}>
                      {item.type}
                    </Text>
                  </View>
                  <View style={styles.textColumn}>
                    <Text style={styles.eventMessage} numberOfLines={1}>
                      {item.message}
                    </Text>
                    <Text style={styles.eventTime}>
                      {formatTime(item.timestamp)}
                    </Text>
                  </View>
                </View>

                {item.rssi !== 0 && (
                  <View style={styles.rssiBadge}>
                    <Text style={styles.rssiText}>{item.rssi} dBm</Text>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  title: {
    ...theme.typography.title,
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  clearText: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },
  emptyContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
  },
  eventRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  eventLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    marginRight: 10,
  },
  typeText: {
    ...theme.typography.mono,
    fontSize: 10,
    fontWeight: '700',
  },
  textColumn: {
    flex: 1,
  },
  eventMessage: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    fontSize: 13,
  },
  eventTime: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  rssiBadge: {
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
  },
  rssiText: {
    ...theme.typography.mono,
    fontSize: 11,
    color: theme.colors.primary,
  },
});
