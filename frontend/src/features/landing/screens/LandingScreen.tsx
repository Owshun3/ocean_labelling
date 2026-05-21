import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Linking } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { usePublicSettings } from '@/shared/hooks/usePublicSettings';
import { clearSessionAlive, clearUserProfile } from '@/services/api/authStorage';
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
	| { kind: 'bold'; text: string }
	| { kind: 'link'; text: string; href: string };

function parseInline(line: string): Segment[] {
	const out: Segment[] = [];
	const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
	let last = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(line)) !== null) {
		if (m.index > last) out.push({ kind: 'text', text: line.slice(last, m.index) });
		if (m[3] !== undefined) out.push({ kind: 'bold', text: m[3] });
		else                    out.push({ kind: 'link', text: m[1], href: m[2] });
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

export const LandingScreen: React.FC = () => {
	const router = useRouter();
	const settings = usePublicSettings();
	const platformName  = settings['platform.name']           || 'la plateforme';
	const welcomeTitle  = settings['landing.welcome_title']   || `Bienvenue sur ${platformName}`;
	const body          = String(settings['landing.body'] || '');

	const blocks = useMemo(() => parseMarkdown(body), [body]);

	// Quitter le mode invité : un guest qui clique "Se connecter" ou "Créer un compte"
	// veut abandonner sa session anonyme. Sans clearSessionAlive() + clearUserProfile()
	// avant la navigation, le gate dans app/_layout.tsx rabat (auth)/* vers /landing —
	// boucle infinie. Le guest doit redevenir "anonyme" pour entrer dans (auth)/*.
	const leaveGuestThenGoTo = (href: Href) => {
		clearSessionAlive();
		clearUserProfile();
		router.replace(href);
	};

	const handleNavInternal = (target: string) => {
		if (target === 'register' || target === '/register') leaveGuestThenGoTo('/(auth)/register' as Href);
		else if (target === 'login' || target === '/login')  leaveGuestThenGoTo('/(auth)/login' as Href);
	};

	const handleLogout = () => leaveGuestThenGoTo('/(auth)/login' as Href);

	const renderSegments = (segments: Segment[]) => segments.map((s, i) => {
		if (s.kind === 'link') {
			const isInternal = s.href === 'register' || s.href === 'login' || s.href.startsWith('/register') || s.href.startsWith('/login');
			return (
				<Text
					key={i}
					style={styles.link}
					onPress={() => isInternal ? handleNavInternal(s.href) : Linking.openURL(s.href).catch(() => {})}
				>{s.text}</Text>
			);
		}
		if (s.kind === 'bold') return <Text key={i} style={styles.bold}>{s.text}</Text>;
		return <Text key={i}>{s.text}</Text>;
	});

	return (
		<View style={[styles.container, styles.content]}>
			<View style={styles.guestBanner}>
				<Text style={styles.guestBannerText}>Mode invité — accès en lecture seule.</Text>
				<Pressable onPress={handleLogout} style={styles.logoutBtn}>
					<Text style={styles.logoutBtnText}>Se déconnecter</Text>
				</Pressable>
			</View>

			<View style={styles.hero}>
				<Text style={styles.platformName}>{platformName}</Text>
				<Text style={styles.welcomeTitle}>{welcomeTitle}</Text>
			</View>

			{blocks.length === 0 ? (
				<Text style={styles.emptyText}>Aucun contenu d'accueil n'a été configuré pour cette plateforme.</Text>
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

			<View style={styles.ctaRow}>
				<Pressable
					onPress={() => leaveGuestThenGoTo('/(auth)/register' as Href)}
					style={({ hovered, pressed }: any) => [
						styles.ctaPrimary, (hovered || pressed) && styles.ctaActive,
					]}
				>
					<Text style={styles.ctaPrimaryText}>Créer un compte</Text>
				</Pressable>
				<Pressable
					onPress={() => leaveGuestThenGoTo('/(auth)/login' as Href)}
					style={({ hovered, pressed }: any) => [
						styles.ctaSecondary, (hovered || pressed) && styles.ctaActive,
					]}
				>
					<Text style={styles.ctaSecondaryText}>Se connecter</Text>
				</Pressable>
			</View>

			<ScrollView style={styles.tutorialWrap} contentContainerStyle={styles.tutorialContent} horizontal showsHorizontalScrollIndicator={false}>
				<TutorialCard
					step="1"
					title="Téléverser"
					body="L'utilisateur dépose une photo ou une vidéo via une interface simple. Les métadonnées GPS sont retirées du fichier au passage."
				/>
				<TutorialCard
					step="2"
					title="Modérer"
					body="Un modérateur valide la qualité et la pertinence du média avant qu'il n'entre dans le flux d'annotation."
				/>
				<TutorialCard
					step="3"
					title="Annoter"
					body="Plusieurs annotateurs tracent indépendamment des boîtes englobantes autour des espèces visibles, et renseignent leur nom."
				/>
				<TutorialCard
					step="4"
					title="Curer"
					body="Un curator compare les annotations, choisit la meilleure ou la corrige, et certifie la version finale."
				/>
				<TutorialCard
					step="5"
					title="Exporter"
					body="Les chercheurs accrédités demandent un export Datumaro filtré ; après validation, ils téléchargent un jeu de données prêt à l'emploi."
				/>
			</ScrollView>
		</View>
	);
};

const TutorialCard: React.FC<{ step: string; title: string; body: string }> = ({ step, title, body }) => (
	<View style={styles.card}>
		<Text style={styles.cardStep}>Étape {step}</Text>
		<Text style={styles.cardTitle}>{title}</Text>
		<Text style={styles.cardBody}>{body}</Text>
	</View>
);

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: COLORS.background.main },
	content: { padding: SPACING.xl, maxWidth: 900, alignSelf: 'center', width: '100%', gap: SPACING.sm },

	guestBanner: {
		flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
		paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
		backgroundColor: COLORS.background.card, borderRadius: 8,
		borderWidth: 1, borderColor: COLORS.border,
		marginBottom: SPACING.md,
	},
	guestBannerText: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontStyle: 'italic' },
	logoutBtn: { paddingHorizontal: SPACING.sm, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border },
	logoutBtnText: { fontSize: 12, color: COLORS.text.primary, fontWeight: '600' },

	hero: { gap: SPACING.xs, marginBottom: SPACING.md },
	platformName: { ...TYPOGRAPHY.title, fontSize: 40, lineHeight: 46, color: COLORS.primary },
	welcomeTitle: { ...TYPOGRAPHY.h1, fontSize: 22, color: COLORS.text.secondary, fontWeight: '600' },

	h1: { ...TYPOGRAPHY.h1, fontSize: 22, marginTop: SPACING.lg, marginBottom: SPACING.xs },
	h2: { ...TYPOGRAPHY.h2, fontSize: 17, color: COLORS.primary, marginTop: SPACING.md, marginBottom: SPACING.xs },
	paragraph: { ...TYPOGRAPHY.body, color: COLORS.text.primary, lineHeight: 22 },

	liRow: { flexDirection: 'row', gap: SPACING.sm, paddingLeft: SPACING.sm },
	liBullet: { ...TYPOGRAPHY.body, color: COLORS.primary, lineHeight: 22 },
	liText:   { ...TYPOGRAPHY.body, color: COLORS.text.primary, lineHeight: 22, flex: 1 },

	link: { color: COLORS.primary, textDecorationLine: 'underline' },
	bold: { fontWeight: '700' },

	emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary, fontStyle: 'italic', textAlign: 'center', padding: SPACING.lg },

	ctaRow: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.lg, marginBottom: SPACING.lg, flexWrap: 'wrap' },
	ctaPrimary: { backgroundColor: COLORS.primary, paddingVertical: 12, paddingHorizontal: SPACING.lg, borderRadius: 8, minWidth: 200, alignItems: 'center' },
	ctaPrimaryText: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 14 },
	ctaSecondary: { backgroundColor: COLORS.background.card, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 12, paddingHorizontal: SPACING.lg, borderRadius: 8, minWidth: 200, alignItems: 'center' },
	ctaSecondaryText: { color: COLORS.text.primary, fontWeight: '600', fontSize: 14 },
	ctaActive: { opacity: 0.85 },

	tutorialWrap: { marginTop: SPACING.md },
	tutorialContent: { gap: SPACING.md, paddingBottom: SPACING.sm },
	card: {
		width: 240,
		backgroundColor: COLORS.background.card, borderRadius: 10,
		borderWidth: 1, borderColor: COLORS.border,
		padding: SPACING.md, gap: 6,
	},
	cardStep:  { fontSize: 11, color: COLORS.primary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
	cardTitle: { ...TYPOGRAPHY.h2, fontSize: 16 },
	cardBody:  { ...TYPOGRAPHY.body, fontSize: 13, color: COLORS.text.secondary, lineHeight: 19 },
});
