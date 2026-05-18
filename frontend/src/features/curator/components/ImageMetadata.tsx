import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ProposalsPayload } from '@/services/api/CuratorService';
import { COLORS } from '@/shared/theme/colors';

interface Props {
	metadata: ProposalsPayload['metadata'];
	task:     ProposalsPayload['task'];
}

function fmtDate(s: string | null | undefined): string {
	if (!s) return 'Non disponible';
	try {
		return new Date(s).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
	} catch { return s; }
}

function fmtGps(lat: number | null | undefined, lng: number | null | undefined): string {
	if (lat == null || lng == null) return 'Non disponible';
	return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function fmtFrameTime(ms: number | null | undefined): string {
	if (ms == null || ms < 0) return 'Non disponible';
	const m = Math.floor(ms / 60000);
	const s = Math.floor((ms % 60000) / 1000);
	const cs = Math.floor((ms % 1000) / 10);
	return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function fmtSourceVideo(meta: ProposalsPayload['metadata']): string {
	if (!meta || meta.source_video_id == null) return 'Non disponible';
	if (meta.source_video_deleted) return 'Supprimée';
	return meta.source_video_filename || `Vidéo #${meta.source_video_id}`;
}

function fmtSourceFrame(meta: ProposalsPayload['metadata']): string {
	if (!meta || meta.source_video_id == null) return 'Non disponible';
	if (meta.source_video_deleted) return 'Supprimée';
	return fmtFrameTime(meta.source_frame_time_ms);
}

export const ImageMetadata: React.FC<Props> = ({ metadata, task }) => (
	<View style={styles.wrap}>
		<Text style={styles.heading}>Métadonnées image</Text>
		<Row label="Fichier"      value={task.name} />
		<Row label="GPS"          value={fmtGps(metadata?.gps_latitude, metadata?.gps_longitude)} />
		<Row label="Prise de vue" value={fmtDate(metadata?.taken_at)} />
		<Row label="Dépôt"        value={fmtDate(task.created_date)} />
		<Row label="Dimensions"
		     value={metadata?.image_width && metadata?.image_height ? `${metadata.image_width} × ${metadata.image_height} px` : 'Non disponible'} />
		<Row label="Appareil"
		     value={[metadata?.camera_make, metadata?.camera_model].filter(Boolean).join(' ') || 'Non disponible'} />
		<Row label="Vidéo d'origine" value={fmtSourceVideo(metadata)} />
		<Row label="Frame"           value={fmtSourceFrame(metadata)} />
	</View>
);

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
	<View style={styles.row}>
		<Text style={styles.rowLabel}>{label}</Text>
		<Text style={styles.rowValue} numberOfLines={2}>{value}</Text>
	</View>
);

const styles = StyleSheet.create({
	wrap: { gap: 4 },
	heading: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase' },
	row: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
	rowLabel: { fontSize: 11, color: COLORS.text.secondary, width: 80 },
	rowValue: { fontSize: 12, color: COLORS.text.primary, flex: 1 },
});
