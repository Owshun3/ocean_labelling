import { StyleSheet } from 'react-native';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

export const filterStyles = StyleSheet.create({
	container: {
		backgroundColor: COLORS.background.card,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: COLORS.border,
		marginBottom: SPACING.sm,
		overflow: 'hidden',
	},
	topBar: {
		flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
		padding: SPACING.sm, flexWrap: 'wrap',
	},
	searchWrap: {
		flex: 1, minWidth: 180,
		flexDirection: 'row', alignItems: 'center',
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		paddingHorizontal: SPACING.sm,
		backgroundColor: COLORS.background.main,
	},
	searchIcon: { marginRight: 8, alignItems: 'center', justifyContent: 'center' },
	searchInput: {
		flex: 1, ...TYPOGRAPHY.body, fontSize: 13,
		paddingVertical: 6, paddingHorizontal: SPACING.sm,
		color: COLORS.text.primary,
	},

	summaryBtn: {
		flexDirection: 'row', alignItems: 'center', gap: 6,
		paddingHorizontal: SPACING.sm, paddingVertical: 6,
		borderRadius: 6, borderWidth: 1, borderColor: COLORS.border,
		backgroundColor: COLORS.background.main,
	},
	summaryBtnOn: { borderColor: COLORS.primary, backgroundColor: COLORS.background.card },
	summaryBtnLabel: { fontSize: 13, color: COLORS.text.primary, fontWeight: '600' },
	summaryBtnLabelMuted: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '600' },
	caret: { fontSize: 10, color: COLORS.text.secondary },
	badge: {
		minWidth: 18, height: 18, borderRadius: 9,
		paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center',
		backgroundColor: COLORS.primary,
	},
	badgeText: { fontSize: 10, color: COLORS.text.inverse, fontWeight: '700' },
	countText: { fontSize: 12, color: COLORS.text.secondary, fontWeight: '600', marginLeft: 'auto' },

	panel: {
		paddingHorizontal: SPACING.sm,
		paddingBottom: SPACING.sm,
		borderTopWidth: 1, borderTopColor: COLORS.border,
		gap: SPACING.sm,
		paddingTop: SPACING.sm,
	},
	panelFields: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, alignItems: 'flex-start' },

	field: { gap: 4, minWidth: 140 },
	fieldLabel: { fontSize: 10, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
	textInput: {
		...TYPOGRAPHY.body, fontSize: 13,
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		paddingHorizontal: SPACING.sm, paddingVertical: 6,
		backgroundColor: COLORS.background.main, color: COLORS.text.primary,
		minWidth: 160,
	},
	textInputError: { borderColor: COLORS.danger, borderWidth: 2 },
	rangeHint: { fontSize: 10, color: COLORS.text.placeholder, textAlign: 'center', marginTop: 2 },
	errorText: { fontSize: 11, color: COLORS.danger, marginTop: 4 },

	chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
	chip: {
		paddingHorizontal: SPACING.sm, paddingVertical: 4,
		borderRadius: 99, borderWidth: 1, borderColor: COLORS.border,
		backgroundColor: COLORS.background.main,
	},
	chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	chipText: { fontSize: 12, color: COLORS.text.primary, fontWeight: '500' },
	chipTextOn: { color: COLORS.text.inverse, fontWeight: '700' },

	dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
	dateSep: { color: COLORS.text.placeholder, fontSize: 13 },
	muted: { ...TYPOGRAPHY.caption, color: COLORS.text.placeholder, fontStyle: 'italic' },

	sortLayout: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.lg },
	sortCriteria: { gap: 4, minWidth: 200 },
	sortDirection: { gap: 4, minWidth: 180 },
	radioList: { gap: 4 },
	radioRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
	radioDot: {
		width: 14, height: 14, borderRadius: 7,
		borderWidth: 2, borderColor: COLORS.border,
		backgroundColor: COLORS.background.main,
	},
	radioDotOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
	radioLabel: { fontSize: 13, color: COLORS.text.primary },
	radioLabelOn: { fontWeight: '700' },

	dirButtons: { flexDirection: 'row', gap: 4 },
	dirBtn: {
		paddingHorizontal: SPACING.sm, paddingVertical: 6,
		borderRadius: 6, borderWidth: 1, borderColor: COLORS.border,
		backgroundColor: COLORS.background.main,
	},
	dirBtnOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	dirBtnText: { fontSize: 12, color: COLORS.text.primary, fontWeight: '600' },
	dirBtnTextOn: { color: COLORS.text.inverse },

	clearBtn: { paddingHorizontal: SPACING.sm, paddingVertical: 6, borderRadius: 6, backgroundColor: COLORS.danger, borderWidth: 1, borderColor: COLORS.danger },
	clearBtnText: { fontSize: 12, color: COLORS.text.inverse, fontWeight: '700' },
});

export const dateInputStyle = {
	borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
	padding: 6, fontSize: 13,
	backgroundColor: COLORS.background.main, color: COLORS.text.primary,
} as any;
