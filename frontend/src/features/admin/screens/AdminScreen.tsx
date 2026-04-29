import React, { useEffect, useMemo, useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	FlatList,
	Platform,
	StyleSheet,
	Text,
	View,
} from 'react-native';
import { AppApiService, AppRole, UserWithRole } from '@/services/api/AppApiService';
import { getUserProfile } from '@/services/api/authStorage';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

const ROLES: AppRole[] = ['admin', 'curator', 'moderator', 'annotator', 'guest'];

const ROLE_LABELS: Record<AppRole, string> = {
	admin: 'Administrateur',
	curator: 'Curateur',
	moderator: 'Modérateur',
	annotator: 'Annotateur',
	guest: 'Invité',
};

const ROLE_COLORS: Record<AppRole, string> = {
	admin: '#dc2626',
	curator: '#7c3aed',
	moderator: '#0284c7',
	annotator: '#16a34a',
	guest: '#9ca3af',
};

function RoleSelect({ user, onSave }: { user: UserWithRole; onSave: (role: AppRole) => Promise<void> }) {
	const [saving, setSaving] = useState(false);

	if (Platform.OS !== 'web') return <Text style={{ color: COLORS.text.secondary }}>Web only</Text>;

	return (
		<View style={styles.roleCell}>
			<select
				value={user.role}
				disabled={saving}
				onChange={async (e) => {
					setSaving(true);
					await onSave(e.target.value as AppRole);
					setSaving(false);
				}}
				style={{
					padding: '4px 8px',
					borderRadius: 4,
					border: `1px solid ${COLORS.border}`,
					backgroundColor: COLORS.background.card,
					color: ROLE_COLORS[user.role],
					fontWeight: '600',
					cursor: saving ? 'wait' : 'pointer',
				} as any}
			>
				{ROLES.map(r => (
					<option key={r} value={r}>{ROLE_LABELS[r]}</option>
				))}
			</select>
		</View>
	);
}

export const AdminScreen: React.FC = () => {
	const [users, setUsers] = useState<UserWithRole[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const service = useMemo(() => new AppApiService(), []);
	const currentProfile = getUserProfile();

	useEffect(() => {
		service.listUsers()
			.then(setUsers)
			.catch(err => setError(err?.response?.data?.error ?? err.message))
			.finally(() => setLoading(false));
	}, []);

	const handleRoleChange = async (userId: number, role: AppRole) => {
		try {
			await service.setUserRole(userId, role);
			setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
		} catch (err: any) {
			const msg = err?.response?.data?.error ?? 'Impossible de modifier le rôle.';
			if (Platform.OS === 'web') window.alert(msg);
			else Alert.alert('Erreur', msg);
		}
	};

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
			</View>
		);
	}

	return (
		<View style={styles.container}>
			<Text style={styles.title}>Gestion des comptes</Text>
			<Text style={styles.subtitle}>{users.length} compte(s) enregistré(s)</Text>

			<View style={styles.tableHeader}>
				<Text style={[styles.colUsername, styles.headerCell]}>Identifiant</Text>
				<Text style={[styles.colEmail, styles.headerCell]}>Email</Text>
				<Text style={[styles.colRole, styles.headerCell]}>Rôle</Text>
				<Text style={[styles.colStatus, styles.headerCell]}>Statut</Text>
			</View>

			<FlatList
				data={users}
				keyExtractor={u => String(u.id)}
				renderItem={({ item }) => (
					<View style={[
						styles.row,
						item.id === currentProfile?.id && styles.rowSelf,
					]}>
						<View style={styles.colUsername}>
							<Text style={styles.username}>{item.username}</Text>
							{item.is_superuser && (
								<Text style={styles.superuserBadge}>superuser</Text>
							)}
						</View>
						<Text style={[styles.colEmail, styles.cell]}>{item.email || '—'}</Text>
						<RoleSelect
							user={item}
							onSave={(role) => handleRoleChange(item.id, role)}
						/>
						<View style={styles.colStatus}>
							<View style={[
								styles.statusDot,
								{ backgroundColor: item.is_active ? COLORS.status?.success ?? '#16a34a' : '#9ca3af' },
							]} />
							<Text style={styles.cell}>{item.is_active ? 'Actif' : 'Inactif'}</Text>
						</View>
					</View>
				)}
				ItemSeparatorComponent={() => <View style={styles.separator} />}
			/>
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, padding: SPACING.lg },
	center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
	title: { ...TYPOGRAPHY.h1, marginBottom: SPACING.xs },
	subtitle: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, marginBottom: SPACING.lg },
	errorText: { ...TYPOGRAPHY.body, color: '#dc2626' },

	tableHeader: {
		flexDirection: 'row',
		paddingVertical: SPACING.sm,
		paddingHorizontal: SPACING.md,
		backgroundColor: COLORS.background.main,
		borderRadius: 6,
		marginBottom: SPACING.sm,
	},
	headerCell: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase' },

	row: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: SPACING.sm,
		paddingHorizontal: SPACING.md,
		backgroundColor: COLORS.background.card,
		borderRadius: 6,
	},
	rowSelf: { borderWidth: 1, borderColor: COLORS.primary },
	separator: { height: SPACING.xs },

	colUsername: { flex: 2 },
	colEmail: { flex: 3 },
	colRole: { flex: 2 },
	colStatus: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
	roleCell: { flex: 2 },

	username: { ...TYPOGRAPHY.body, fontWeight: '600' },
	cell: { ...TYPOGRAPHY.body, color: COLORS.text.primary },
	superuserBadge: {
		fontSize: 10,
		color: '#dc2626',
		fontWeight: '700',
		textTransform: 'uppercase',
	},
	statusDot: { width: 8, height: 8, borderRadius: 4 },
});
