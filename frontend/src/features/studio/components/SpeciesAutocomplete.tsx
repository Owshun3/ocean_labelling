import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';
import { Species, SpeciesService } from '@/services/api/SpeciesService';
import { RankBadge } from '@/shared/components/RankBadge';

interface Props {
	value: { id?: number; name: string } | null;
	onPick: (species: { id?: number; name: string; isNew: boolean }) => void;
}

const DEBOUNCE_MS = 300;

export const SpeciesAutocomplete: React.FC<Props> = ({ value, onPick }) => {
	const service = useMemo(() => new SpeciesService(), []);
	const [text, setText]               = useState(value?.name ?? '');
	const [results, setResults]         = useState<Species[]>([]);
	const [isOpen, setIsOpen]           = useState(false);
	const [loading, setLoading]         = useState(false);
	const debounceRef = useRef<any>(null);
	const containerRef = useRef<View>(null);

	useEffect(() => {
		setText(value?.name ?? '');
	}, [value?.id, value?.name]);

	useEffect(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		const trimmed = text.trim();
		if (!isOpen || trimmed.length === 0) {
			setResults([]);
			setLoading(false);
			return;
		}
		debounceRef.current = setTimeout(async () => {
			setLoading(true);
			try {
				const list = await service.search(trimmed);
				setResults(list);
			} catch {
				setResults([]);
			} finally {
				setLoading(false);
			}
		}, DEBOUNCE_MS);
		return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
	}, [text, isOpen, service]);

	const trimmed   = text.trim();
	const exactHit  = results.find((r) => r.name.toLowerCase() === trimmed.toLowerCase());
	const showProposeNew = trimmed.length > 0 && !exactHit;

	const pickExisting = (s: Species) => {
		setText(s.name);
		setIsOpen(false);
		onPick({ id: s.id, name: s.name, isNew: false });
	};

	const pickAsNew = () => {
		setIsOpen(false);
		onPick({ name: trimmed, isNew: true });
	};

	return (
		<View ref={containerRef} style={styles.wrap}>
			<TextInput
				value={text}
				onChangeText={(t) => { setText(t); setIsOpen(true); }}
				onFocus={() => setIsOpen(true)}
				onBlur={() => setTimeout(() => setIsOpen(false), 150)}
				placeholder="Cherche une espèce…"
				placeholderTextColor={COLORS.text.placeholder}
				style={styles.input}
				autoCapitalize="none"
			/>

			{isOpen && (results.length > 0 || showProposeNew) && (
				<View style={styles.dropdown}>
					{loading ? <Text style={styles.loadingText}>Recherche…</Text> : null}

					{results.map((r) => (
						<Pressable
							key={r.id}
							onPress={() => pickExisting(r)}
							style={({ hovered }: any) => [styles.dropdownItem, hovered && styles.dropdownItemHover]}
						>
							<View style={styles.itemMain}>
								<Text style={styles.itemName}>
									{r.name}
									{r.polynesian_name ? <Text style={styles.itemPoly}> · {r.polynesian_name}</Text> : null}
								</Text>
								{r.scientific_name ? (
									<Text style={styles.itemScientific}>{r.scientific_name}</Text>
								) : null}
								{r.status === 'pending' && r.proposer ? (
									<View style={styles.proposerRow}>
										<Text style={styles.proposerText}>
											proposée par {r.proposer.username ?? '?'}
										</Text>
										<RankBadge actions={r.proposer.actions_validated_total} size="sm" />
									</View>
								) : null}
							</View>
							{r.status === 'pending' ? (
								<Text style={styles.pendingTag}>en attente de validation</Text>
							) : null}
						</Pressable>
					))}

					{showProposeNew ? (
						<Pressable
							onPress={pickAsNew}
							style={({ hovered }: any) => [styles.dropdownItem, styles.proposeItem, hovered && styles.dropdownItemHover]}
						>
							<View style={styles.newBadge}><Text style={styles.newBadgeText}>NOUVELLE</Text></View>
							<Text style={styles.proposeText}>
								Proposer « {trimmed} » (sera soumise pour validation)
							</Text>
						</Pressable>
					) : null}
				</View>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	wrap: { position: 'relative', zIndex: 100 },
	input: {
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
		fontSize: 13, color: COLORS.text.primary, backgroundColor: COLORS.background.main,
	},
	dropdown: {
		position: 'absolute', top: '100%', left: 0, right: 0,
		marginTop: 4,
		backgroundColor: COLORS.background.card,
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		zIndex: 1000,
		maxHeight: 280,
		overflow: 'hidden',
	},
	loadingText: { fontSize: 11, color: COLORS.text.placeholder, padding: SPACING.sm, fontStyle: 'italic' },
	dropdownItem: {
		flexDirection: 'row', alignItems: 'flex-start', gap: 6,
		paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
		borderBottomWidth: 1, borderBottomColor: COLORS.border,
	},
	dropdownItemHover: { backgroundColor: COLORS.background.main },
	itemMain:  { flex: 1, gap: 2 },
	itemName:  { fontSize: 13, color: COLORS.text.primary, fontWeight: '500' },
	itemPoly:  { fontSize: 12, color: COLORS.text.secondary, fontWeight: '400' },
	itemScientific: { fontSize: 11, color: COLORS.text.placeholder, fontStyle: 'italic' },
	proposerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
	proposerText: { fontSize: 10, color: COLORS.text.secondary, fontStyle: 'italic' },
	pendingTag: { fontSize: 10, color: COLORS.warning, fontWeight: '600', textTransform: 'uppercase' },
	proposeItem: { backgroundColor: `${COLORS.warning}11` },
	proposeText: { fontSize: 12, color: COLORS.text.primary, flex: 1 },
	newBadge: {
		paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3,
		backgroundColor: COLORS.warning,
	},
	newBadgeText: { fontSize: 9, color: COLORS.text.inverse, fontWeight: '700' },
});
