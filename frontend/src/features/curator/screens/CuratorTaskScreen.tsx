import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CuratorService, CuratorJob, CuratorTask, MergeStatus, QualityConflict, QualityReport } from '@/services/api/CuratorService';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

interface Props {
  task: CuratorTask;
  onBack: () => void;
}

/* ── Sous-composants ────────────────────────────────────────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function JobRow({ job }: { job: CuratorJob }) {
  const stateColor: Record<string, string> = {
    'completed': COLORS.status?.validated ?? '#10b981',
    'in progress': COLORS.primary,
    'new': COLORS.status?.pending ?? '#f59e0b',
    'rejected': COLORS.status?.error ?? '#ef4444',
  };
  const color = stateColor[job.state] ?? COLORS.text.secondary;

  return (
    <View style={styles.jobRow}>
      <View style={styles.jobLeft}>
        <Text style={styles.jobId}>Job #{job.id}</Text>
        <Text style={styles.jobAssignee}>{job.assignee?.username ?? 'Non assigné'}</Text>
      </View>
      <View style={[styles.jobBadge, { backgroundColor: color + '22' }]}>
        <Text style={[styles.jobBadgeText, { color }]}>{job.state}</Text>
      </View>
    </View>
  );
}

function ConflictRow({ conflict }: { conflict: QualityConflict }) {
  const isError = conflict.severity === 'error';
  const color = isError ? (COLORS.status?.error ?? '#ef4444') : (COLORS.warning ?? '#f59e0b');
  return (
    <View style={styles.conflictRow}>
      <View style={[styles.severityDot, { backgroundColor: color }]} />
      <Text style={styles.conflictType}>{conflict.type.replace(/_/g, ' ')}</Text>
      <Text style={styles.conflictFrame}>frame {conflict.frame}</Text>
    </View>
  );
}

function ActionButton({
  label, onPress, color, disabled, loading,
}: {
  label: string; onPress: () => void; color?: string; disabled?: boolean; loading?: boolean;
}) {
  const bg = disabled ? COLORS.border : (color ?? COLORS.primary);
  return (
    <Pressable
      style={[styles.actionBtn, { backgroundColor: bg }]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading
        ? <ActivityIndicator size="small" color="#fff" />
        : <Text style={styles.actionBtnText}>{label}</Text>}
    </Pressable>
  );
}

/* ── Screen principal ───────────────────────────────────────────────────────── */

export const CuratorTaskScreen: React.FC<Props> = ({ task, onBack }) => {
  const service = useMemo(() => new CuratorService(), []);

  const [jobs, setJobs] = useState<CuratorJob[]>(task.jobs);
  const [quality, setQuality] = useState<{ report: QualityReport | null; conflicts: QualityConflict[]; conflicts_count: number } | null>(null);
  const [mergeStatus, setMergeStatus] = useState<MergeStatus | null>(null);

  const [loadingQuality, setLoadingQuality] = useState(false);
  const [loadingMerge, setLoadingMerge] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);

  const [qualityError, setQualityError] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const cvatUiUrl = process.env.EXPO_PUBLIC_CVAT_UI_URL ?? 'http://localhost:8888';

  const fetchQuality = useCallback(async () => {
    setLoadingQuality(true);
    setQualityError(null);
    try {
      const data = await service.getQuality(task.id);
      setQuality(data);
    } catch (err: any) {
      setQualityError(err?.response?.data?.error ?? err.message);
    } finally {
      setLoadingQuality(false);
    }
  }, [service, task.id]);

  useEffect(() => { fetchQuality(); }, [fetchQuality]);

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    setQualityError(null);
    try {
      await service.generateQualityReport(task.id);
      /* Le rapport est async — on attend 3s puis on rafraîchit */
      await new Promise(r => setTimeout(r, 3000));
      await fetchQuality();
    } catch (err: any) {
      setQualityError(err?.response?.data?.error ?? err.message);
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleMerge = async () => {
    setLoadingMerge(true);
    setMergeError(null);
    try {
      const merge = await service.triggerMerge(task.id);
      setMergeStatus(merge);
      const final = await service.pollMergeUntilDone(merge.id, (s) => {
        setMergeStatus(prev => prev ? { ...prev, status: s as any } : prev);
      });
      setMergeStatus(final);
      /* Rafraîchir les jobs pour voir le job merged créé */
      const updatedJobs = await service.getTaskJobs(task.id);
      setJobs(updatedJobs);
    } catch (err: any) {
      setMergeError(err?.response?.data?.error ?? err.message);
    } finally {
      setLoadingMerge(false);
    }
  };

  const handleOpenMergedJob = () => {
    if (!mergeStatus?.target_job?.id) return;
    const returnUrl = encodeURIComponent(window.location.href);
    window.open(`${cvatUiUrl}/tasks/${task.id}/jobs/${mergeStatus.target_job.id}?appReturn=${returnUrl}`, '_blank');
  };

  const handleOpenJob = (job: CuratorJob) => {
    const returnUrl = encodeURIComponent(window.location.href);
    window.open(`${cvatUiUrl}/tasks/${task.id}/jobs/${job.id}?appReturn=${returnUrl}`, '_blank');
  };

  const completedJobs = jobs.filter(j => j.state === 'completed');
  const canMerge = completedJobs.length >= 2 && !loadingMerge;
  const mergeFinished = mergeStatus?.status === 'finished';
  const mergeFailed = mergeStatus?.status === 'failed';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── En-tête ── */}
      <Pressable style={styles.backRow} onPress={onBack}>
        <Text style={styles.backText}>← Retour</Text>
      </Pressable>

      <Text style={styles.taskTitle}>{task.name}</Text>
      <Text style={styles.taskMeta}>
        {jobs.length} job{jobs.length !== 1 ? 's' : ''} · {completedJobs.length} complété{completedJobs.length !== 1 ? 's' : ''}
      </Text>

      {/* ── Jobs des annotateurs ── */}
      <SectionTitle>Jobs des annotateurs</SectionTitle>
      <View style={styles.card}>
        {jobs.length === 0 && <Text style={styles.emptyText}>Aucun job.</Text>}
        {jobs.map((job, i) => (
          <View key={job.id}>
            <Pressable onPress={() => handleOpenJob(job)}>
              <JobRow job={job} />
            </Pressable>
            {i < jobs.length - 1 && <View style={styles.separator} />}
          </View>
        ))}
      </View>

      {/* ── Qualité ── */}
      <View style={styles.sectionHeader}>
        <SectionTitle>Qualité & conflits</SectionTitle>
        <ActionButton
          label="Générer rapport"
          onPress={handleGenerateReport}
          disabled={generatingReport || loadingQuality}
          loading={generatingReport}
          color={COLORS.secondary ?? '#5856D6'}
        />
      </View>

      {loadingQuality && <ActivityIndicator size="small" color={COLORS.primary} style={styles.loader} />}

      {qualityError && <Text style={styles.errorText}>Erreur qualité : {qualityError}</Text>}

      {quality && !loadingQuality && (
        <View style={styles.card}>
          {quality.report ? (
            <View style={styles.qualitySummary}>
              <View style={styles.qualityStat}>
                <Text style={styles.qualityStatValue}>{quality.conflicts_count}</Text>
                <Text style={styles.qualityStatLabel}>conflits</Text>
              </View>
              <View style={styles.qualityStat}>
                <Text style={styles.qualityStatValue}>{quality.report.summary?.valid_count ?? '—'}</Text>
                <Text style={styles.qualityStatLabel}>valides</Text>
              </View>
              <View style={styles.qualityStat}>
                <Text style={styles.qualityStatValue}>
                  {new Date(quality.report.created_date).toLocaleDateString('fr-FR')}
                </Text>
                <Text style={styles.qualityStatLabel}>dernier rapport</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.emptyText}>Aucun rapport — cliquez sur "Générer rapport".</Text>
          )}

          {quality.conflicts.length > 0 && (
            <View style={styles.conflictList}>
              <Text style={styles.conflictListTitle}>Détail des conflits</Text>
              {quality.conflicts.slice(0, 20).map(c => (
                <ConflictRow key={c.id} conflict={c} />
              ))}
              {quality.conflicts_count > 20 && (
                <Text style={styles.moreText}>… et {quality.conflicts_count - 20} autres</Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* ── Fusion consensus ── */}
      <SectionTitle>Fusion par consensus</SectionTitle>

      {completedJobs.length < 2 && (
        <Text style={styles.infoText}>
          Au moins 2 jobs complétés sont nécessaires pour déclencher une fusion ({completedJobs.length} actuellement).
        </Text>
      )}

      {mergeError && <Text style={styles.errorText}>Erreur merge : {mergeError}</Text>}

      {mergeStatus && (
        <View style={[styles.mergeStatusBox, mergeFailed && styles.mergeStatusFailed]}>
          <Text style={styles.mergeStatusText}>
            Statut : <Text style={{ fontWeight: '700' }}>{mergeStatus.status}</Text>
          </Text>
        </View>
      )}

      <View style={styles.mergeActions}>
        <ActionButton
          label={loadingMerge ? 'Fusion en cours…' : 'Lancer la fusion'}
          onPress={handleMerge}
          disabled={!canMerge || mergeFinished}
          loading={loadingMerge}
          color={COLORS.warning ?? '#f59e0b'}
        />
        {mergeFinished && mergeStatus?.target_job && (
          <ActionButton
            label="Ouvrir le résultat"
            onPress={handleOpenMergedJob}
            color={COLORS.success ?? '#34C759'}
          />
        )}
      </View>

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2 },

  backRow: { marginBottom: SPACING.md },
  backText: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: '600' },

  taskTitle: { ...TYPOGRAPHY.h1, marginBottom: SPACING.xs },
  taskMeta: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, marginBottom: SPACING.lg },

  sectionTitle: { ...TYPOGRAPHY.h2, marginBottom: SPACING.sm, marginTop: SPACING.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.lg, marginBottom: SPACING.sm },

  card: {
    backgroundColor: COLORS.background.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },

  jobRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.md },
  jobLeft: { gap: 2 },
  jobId: { ...TYPOGRAPHY.body, fontWeight: '600' },
  jobAssignee: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary },
  jobBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: 99 },
  jobBadgeText: { ...TYPOGRAPHY.caption, fontWeight: '700' },
  separator: { height: 1, backgroundColor: COLORS.border, marginHorizontal: SPACING.md },

  qualitySummary: { flexDirection: 'row', justifyContent: 'space-around', padding: SPACING.md },
  qualityStat: { alignItems: 'center', gap: 2 },
  qualityStatValue: { ...TYPOGRAPHY.h2, color: COLORS.primary },
  qualityStatLabel: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary },

  conflictList: { borderTopWidth: 1, borderTopColor: COLORS.border, padding: SPACING.md },
  conflictListTitle: { ...TYPOGRAPHY.caption, fontWeight: '700', color: COLORS.text.secondary, marginBottom: SPACING.sm, textTransform: 'uppercase' },
  conflictRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 4 },
  severityDot: { width: 8, height: 8, borderRadius: 4 },
  conflictType: { ...TYPOGRAPHY.caption, flex: 1, textTransform: 'capitalize' },
  conflictFrame: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary },
  moreText: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, marginTop: SPACING.xs },

  loader: { marginVertical: SPACING.md },
  errorText: { ...TYPOGRAPHY.caption, color: '#dc2626', marginVertical: SPACING.xs },
  infoText: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, marginBottom: SPACING.sm },
  emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary, padding: SPACING.md },

  mergeStatusBox: {
    backgroundColor: COLORS.primary + '18',
    borderRadius: 8,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  mergeStatusFailed: { backgroundColor: '#ef444418' },
  mergeStatusText: { ...TYPOGRAPHY.caption, color: COLORS.text.primary },

  mergeActions: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },

  actionBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 130,
    minHeight: 36,
  },
  actionBtnText: { ...TYPOGRAPHY.body, color: '#fff', fontWeight: '600' },
});
