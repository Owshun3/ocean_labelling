import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Linking } from 'react-native';
import { usePublicSettings } from '@/shared/hooks/usePublicSettings';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

type Block =
	| { kind: 'h1'; text: string }
	| { kind: 'h2'; text: string }
	| { kind: 'li'; segments: Segment[] }
	| { kind: 'p';  segments: Segment[] };

type Segment =
	| { kind: 'text'; text: string }
	| { kind: 'link'; text: string; href: string };

function parseInline(line: string): Segment[] {
	const out: Segment[] = [];
	const re = /\[([^\]]+)\]\(([^)]+)\)/g;
	let last = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(line)) !== null) {
		if (m.index > last) out.push({ kind: 'text', text: line.slice(last, m.index) });
		out.push({ kind: 'link', text: m[1], href: m[2] });
		last = m.index + m[0].length;
	}
	if (last < line.length) out.push({ kind: 'text', text: line.slice(last) });
	if (out.length === 0) out.push({ kind: 'text', text: line });
	return out;
}

function parseMarkdown(src: string): Block[] {
	const lines = src.split('\n');
	const blocks: Block[] = [];
	let paragraph: string[] = [];

	const flush = () => {
		if (paragraph.length > 0) {
			blocks.push({ kind: 'p', segments: parseInline(paragraph.join(' ')) });
			paragraph = [];
		}
	};

	for (const raw of lines) {
		const line = raw.trim();
		if (line.length === 0) { flush(); continue; }
		if (line.startsWith('## ')) { flush(); blocks.push({ kind: 'h2', text: line.slice(3).trim() }); continue; }
		if (line.startsWith('# '))  { flush(); blocks.push({ kind: 'h1', text: line.slice(2).trim() }); continue; }
		if (line.startsWith('- '))  { flush(); blocks.push({ kind: 'li', segments: parseInline(line.slice(2).trim()) }); continue; }
		paragraph.push(line);
	}
	flush();
	return blocks;
}

const renderSegments = (segments: Segment[]) => segments.map((s, i) =>
	s.kind === 'link'
		? <Text key={i} style={styles.link} onPress={() => Linking.openURL(s.href).catch(() => {})}>{s.text}</Text>
		: <Text key={i}>{s.text}</Text>
);

export const PrivacyPolicyScreen: React.FC = () => {
	const settings = usePublicSettings();
	const source = String(settings['platform.privacy_policy'] || '');
	const platformName = settings['platform.name'] || 'la plateforme';
	const contactEmail = settings['platform.contact_email'] || '';

	const blocks = useMemo(() => parseMarkdown(source), [source]);

	return (
		<ScrollView style={styles.container} contentContainerStyle={styles.content}>
			<View style={styles.header}>
				<Text style={styles.kicker}>{platformName}</Text>
				<Text style={styles.title}>Politique de confidentialité</Text>
				{contactEmail ? (
					<Pressable onPress={() => Linking.openURL(`mailto:${contactEmail}`).catch(() => {})}>
						<Text style={styles.contactLine}>Contact RGPD : {contactEmail}</Text>
					</Pressable>
				) : null}
			</View>

			{blocks.length === 0 ? (
				<Text style={styles.emptyText}>Aucune politique de confidentialité n'a été configurée pour cette plateforme.</Text>
			) : null}

			{blocks.map((b, i) => {
				if (b.kind === 'h1') return <Text key={i} style={styles.h1}>{b.text}</Text>;
				if (b.kind === 'h2') return <Text key={i} style={styles.h2}>{b.text}</Text>;
				if (b.kind === 'li') return (
					<View key={i} style={styles.liRow}>
						<Text style={styles.liBullet}>•</Text>
						<Text style={styles.liText}>{renderSegments(b.segments)}</Text>
					</View>
				);
				return <Text key={i} style={styles.paragraph}>{renderSegments(b.segments)}</Text>;
			})}
		</ScrollView>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: COLORS.background.main },
	content: { padding: SPACING.xl, maxWidth: 760, alignSelf: 'center', width: '100%', gap: SPACING.sm },

	header: { gap: SPACING.xs, marginBottom: SPACING.md },
	kicker: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
	title:  { ...TYPOGRAPHY.title, fontSize: 32, lineHeight: 38 },
	contactLine: { ...TYPOGRAPHY.body, color: COLORS.primary, fontStyle: 'italic' },

	h1: { ...TYPOGRAPHY.h1, fontSize: 22, marginTop: SPACING.lg, marginBottom: SPACING.xs },
	h2: { ...TYPOGRAPHY.h2, fontSize: 17, color: COLORS.primary, marginTop: SPACING.md, marginBottom: SPACING.xs },

	paragraph: { ...TYPOGRAPHY.body, color: COLORS.text.primary, lineHeight: 22 },

	liRow: { flexDirection: 'row', gap: SPACING.sm, paddingLeft: SPACING.sm },
	liBullet: { ...TYPOGRAPHY.body, color: COLORS.primary, lineHeight: 22 },
	liText:   { ...TYPOGRAPHY.body, color: COLORS.text.primary, lineHeight: 22, flex: 1 },

	link: { color: COLORS.primary, textDecorationLine: 'underline' },

	emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary, fontStyle: 'italic', textAlign: 'center', padding: SPACING.lg },
});
