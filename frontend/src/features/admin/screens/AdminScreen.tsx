import React, { useEffect, useMemo, useState } from 'react';
import {
	ActivityIndicator,
	FlatList,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	View,
} from 'react-native';
import { AppApiService, AppRole, AccountState, UserWithRole } from '@/services/api/AppApiService';
import { getUserProfile } from '@/services/api/authStorage';
import { BanModal } from '@/features/moderation/components/BanModal';
import { CreateAccountModal } from '../components/CreateAccountModal';
import { formatRemaining } from '@/services/api/banInterceptor';
import { toast } from '@/shared/toast/Toast';
import { RankBadge } from '@/shared/components/RankBadge';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

// Rôles assignables via l'UI : 'admin' est exclu (réservé aux superusers CVAT,
// rang de fait, non attribuable). 'guest' n'est pas une promotion utile non plus.
const ASSIGNABLE_ROLES: AppRole[] = ['moderator', 'curator', 'chercheur', 'annotator'];

const ROLE_LABELS: Record<AppRole, string> = {
	admin: 'Administrateur',
	moderator: 'Modérateur',
	curator: 'Curateur',
	chercheur: 'Chercheur',
	annotator: 'Annotateur',
	guest: 'Invité',
};

const ROLE_COLORS: Record<AppRole, string> = {
	admin: '#dc2626',
	moderator: '#0284c7',
	curator: '#7c3aed',
	chercheur: '#0ea5e9',
	annotator: '#16a34a',
	guest: '#9ca3af',
};

const STATES: AccountState[] = ['active', 'disabled', 'banned'];

const STATE_LABELS: Record<AccountState, string> = {
	active: 'Activé',
	disabled: 'Désactivé',
	banned: 'Banni',
};

const STATE_COLORS: Record<AccountState, string> = {
	active: '#16a34a',
	disabled: '#9ca3af',
	banned: '#dc2626',
};

interface StateSelectProps {
	user: UserWithRole;
	onSetActive: (isActive: boolean) => Promise<void>;
	onRequestBan: () => void;
}

function StateSelect({ user, onSetActive, onRequestBan }: StateSelectProps) {
	const [saving, setSaving] = useState(false);

	if (Platform.OS !== 'web') return <Text style={{ color: COLORS.text.secondary }}>Web only</Text>;

	return (
		<View style={styles.stateCell}>
			<select
				value={user.state}
				disabled={saving}
				onChange={async (e) => {
					const next = e.target.value as AccountState;
					if (next === user.state) return;
					if (next === 'banned') {
						onRequestBan();
						return;
					}
					setSaving(true);
					try {
						await onSetActive(next === 'active');
						toast.success(next === 'active' ? 'Compte activé.' : 'Compte désactivé.');
					} catch (err: any) {
						toast.error(err?.response?.data?.error ?? 'Impossible de modifier l\'état du compte.');
					} finally {
						setSaving(false);
					}
				}}
				style={{
					padding: '4px 8px',
					borderRadius: 4,
					border: `1px solid ${COLORS.border}`,
					backgroundColor: COLORS.background.card,
					color: STATE_COLORS[user.state],
					fontWeight: '600',
					cursor: saving ? 'wait' : 'pointer',
				} as any}
			>
				{STATES.map((s) => (
					<option key={s} value={s}>{STATE_LABELS[s]}</option>
				))}
			</select>
			{user.state === 'banned' && user.ban ? (
				<Text style={styles.banSubLine}>
					{user.ban.expires_at ? `restant : ${formatRemaining(user.ban.expires_at)}` : 'permanent'}
				</Text>
			) : null}
		</View>
	);
}

function RoleSelect({ user, onSave }: { user: UserWithRole; onSave: (role: AppRole) => Promise<void> }) {
	const [saving, setSaving] = useState(false);
	const [localRole, setLocalRole] = useState<AppRole>(user.role);

	useEffect(() => { setLocalRole(user.role); }, [user.role]);

	if (Platform.OS !== 'web') return <Text style={{ color: COLORS.text.secondary }}>Web only</Text>;

	// Le superuser CVAT est administrateur de fait — le rôle est verrouillé.
	if (user.is_superuser) {
		return (
			<View style={styles.roleCell}>
				<View style={[styles.lockedRole, { borderColor: ROLE_COLORS.admin }]}>
					<Text style={[styles.lockedRoleText, { color: ROLE_COLORS.admin }]}>
						{ROLE_LABELS.admin}
					</Text>
					<Text style={styles.lockedHint}>verrouillé</Text>
				</View>
			</View>
		);
	}

	return (
		<View style={styles.roleCell}>
			<select
				value={localRole}
				disabled={saving}
				onChange={async (e) => {
					const newRole = e.target.value as AppRole;
					const prevRole = localRole;
					setLocalRole(newRole);
					setSaving(true);
					try {
						await onSave(newRole);
						toast.success(`Rôle modifié : ${ROLE_LABELS[newRole]}.`);
					} catch (err: any) {
						setLocalRole(prevRole);
						toast.error(err?.response?.data?.error ?? 'Impossible de modifier le rôle.');
					} finally {
						setSaving(false);
					}
				}}
				style={{
					padding: '4px 8px',
					borderRadius: 4,
					border: `1px solid ${COLORS.border}`,
					backgroundColor: COLORS.background.card,
					color: ROLE_COLORS[localRole],
					fontWeight: '600',
					cursor: saving ? 'wait' : 'pointer',
				} as any}
			>
				{ASSIGNABLE_ROLES.map(r => (
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
	const [banTarget, setBanTarget] = useState<UserWithRole | null>(null);
	const [banSubmitting, setBanSubmitting] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
	const [createSubmitting, setCreateSubmitting] = useState(false);
	const service = useMemo(() => new AppApiService(), []);
	const currentProfile = getUserProfile();

	const reload = () => service.listUsers().then(setUsers);

	useEffect(() => {
		service.listUsers()
			.then(setUsers)
			.catch(err => setError(err?.response?.data?.error ?? err.message))
			.finally(() => setLoading(false));
	}, []);

	const handleRoleChange = async (userId: number, role: AppRole) => {
		await service.setUserRole(userId, role);
		setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
	};

	const handleSetActive = async (userId: number, isActive: boolean) => {
		await service.setUserActive(userId, isActive);
		await reload();
	};

	const handleCreateAccount = async (input: { username: string; password: string; email: string; first_name: string; last_name: string; role: AppRole }) => {
		setCreateSubmitting(true);
		try {
			const created = await service.createUser(input);
			toast.success(`Compte ${created.username} créé (${created.role}).`);
			setCreateOpen(false);
			await reload();
		} catch (err: any) {
			toast.error(err?.response?.data?.error ?? err?.message ?? 'Création impossible.');
		} finally {
			setCreateSubmitting(false);
		}
	};

	const handleConfirmBan = async (durationDays: number | null, reason: string) => {
		if (!banTarget) return;
		setBanSubmitting(true);
		try {
			await service.banUser(banTarget.id, durationDays, reason);
			toast.success(`Utilisateur banni : ${banTarget.username}.`);
			setBanTarget(null);
			await reload();
		} catch (err: any) {
			toast.error(err?.response?.data?.error ?? 'Bannissement impossible.');
		} finally {
			setBanSubmitting(false);
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
			<View style={styles.topBar}>
				<View style={{ flex: 1 }}>
					<Text style={styles.title}>Gestion des comptes</Text>
					<Text style={styles.subtitle}>{users.length} compte(s) enregistré(s)</Text>
				</View>
				<Pressable onPress={() => setCreateOpen(true)} style={styles.createBtn}>
					<Text style={styles.createBtnText}>+ Créer un compte</Text>
				</Pressable>
			</View>

			<View style={styles.tableHeader}>
				<Text style={[styles.colUsername, styles.headerCell]}>Identifiant</Text>
				<Text style={[styles.colEmail, styles.headerCell]}>Email</Text>
				<Text style={[styles.colRole, styles.headerCell]}>Rôle</Text>
				<Text style={[styles.colStatus, styles.headerCell]}>Compte</Text>
			</View>

			<FlatList
				data={users}
				keyExtractor={u => String(u.id)}
				extraData={users}
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
							<RankBadge actions={item.actions_validated_total ?? 0} size="sm" withCount />
						</View>
						<Text style={[styles.colEmail, styles.cell]}>{item.email || '—'}</Text>
						<RoleSelect
							user={item}
							onSave={(role) => handleRoleChange(item.id, role)}
						/>
						<StateSelect
							user={item}
							onSetActive={(isActive) => handleSetActive(item.id, isActive)}
							onRequestBan={() => setBanTarget(item)}
						/>
					</View>
				)}
				ItemSeparatorComponent={() => <View style={styles.separator} />}
			/>

			<BanModal
				visible={!!banTarget}
				userLabel={banTarget ? `${banTarget.username}#${banTarget.id}` : ''}
				submitting={banSubmitting}
				onCancel={() => setBanTarget(null)}
				onConfirm={handleConfirmBan}
			/>

			<CreateAccountModal
				visible={createOpen}
				submitting={createSubmitting}
				onCancel={() => setCreateOpen(false)}
				onConfirm={handleCreateAccount}
			/>
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, padding: SPACING.lg },
	center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
	topBar: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md },
	createBtn: { backgroundColor: COLORS.primary, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6 },
	createBtnText: { color: COLORS.text.inverse, fontWeight: '700' },
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
	colStatus: { flex: 2 },
	roleCell: { flex: 2 },
	stateCell: { flex: 2 },
	lockedRole: {
		flexDirection: 'row', alignItems: 'baseline', gap: SPACING.xs,
		paddingHorizontal: SPACING.sm, paddingVertical: 4,
		borderRadius: 4, borderWidth: 1, alignSelf: 'flex-start',
		backgroundColor: COLORS.background.card,
	},
	lockedRoleText: { fontWeight: '700', fontSize: 13 },
	lockedHint: { ...TYPOGRAPHY.caption, color: COLORS.text.placeholder, fontStyle: 'italic' },
	banSubLine: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, marginTop: 2 },

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
