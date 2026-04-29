import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CuratorService, CuratorTask } from '@/services/api/CuratorService';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

interface Props {
  onSelectTask: (task: CuratorTask) => void;
}

function TaskStatusBadge({ completedCount, total }: { completedCount: number; total: number }) {
  const allDone = total > 0 && completedCount === total;
  const none = completedCount === 0;
  const color = allDone ? COLORS.status?.validated ?? '#10b981'
    : none ? COLORS.status?.pending ?? '#f59e0b'
    : COLORS.primary;
  const label = total === 0 ? 'Aucun job'
    : allDone ? 'Tous complétés'
    : `${completedCount}/${total} complétés`;
  return (
    <View style={[styles.badge, { backgroundColor: color + '22' }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function TaskCard({ task, onPress }: { task: CuratorTask; onPress: () => void }) {
  const date = task.updated_date
    ? new Date(task.updated_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.taskName} numberOfLines={1}>{task.name}</Text>
        <TaskStatusBadge completedCount={task.completed_count} total={task.jobs_count} />
      </View>
      <View style={styles.cardMeta}>
        <Text style={styles.metaText}>{task.jobs_count} job{task.jobs_count !== 1 ? 's' : ''}</Text>
        <Text style={styles.metaDot}>·</Text>
        <Text style={styles.metaText}>Mis à jour {date}</Text>
      </View>
    </Pressable>
  );
}

export const CuratorHubScreen: React.FC<Props> = ({ onSelectTask }) => {
  const [tasks, setTasks] = useState<CuratorTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const service = useMemo(() => new CuratorService(), []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    service.getTasks()
      .then(setTasks)
      .catch(err => setError(err?.response?.data?.error ?? err.message))
      .finally(() => setLoading(false));
  }, [service]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Erreur : {error}</Text>
        <Pressable style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryText}>Réessayer</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Curation</Text>
        <Text style={styles.subtitle}>{tasks.length} tâche{tasks.length !== 1 ? 's' : ''}</Text>
      </View>

      {tasks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Aucune tâche disponible pour la curation.</Text>
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={t => String(t.id)}
          renderItem={({ item }) => (
            <TaskCard task={item} onPress={() => onSelectTask(item)} />
          )}
          ItemSeparatorComponent={() => <View style={{ height: SPACING.sm }} />}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: SPACING.lg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACING.md },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.sm, marginBottom: SPACING.lg },
  title: { ...TYPOGRAPHY.h1 },
  subtitle: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary },
  list: { paddingBottom: SPACING.lg },

  card: {
    backgroundColor: COLORS.background.card,
    borderRadius: 10,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardPressed: { opacity: 0.75 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.sm },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.xs },

  taskName: { ...TYPOGRAPHY.body, fontWeight: '600', flex: 1 },
  metaText: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary },
  metaDot: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary },

  badge: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: 99 },
  badgeText: { ...TYPOGRAPHY.caption, fontWeight: '700' },

  errorText: { ...TYPOGRAPHY.body, color: '#dc2626' },
  retryBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
  },
  retryText: { ...TYPOGRAPHY.body, color: '#fff', fontWeight: '600' },

  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },
});
