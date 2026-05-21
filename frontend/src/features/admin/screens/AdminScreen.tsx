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
import { FilterSortBar, useFilteredAndSorted } from '@/shared/components/filters';
import type { FilterField, FilterSortState, SortOption, FieldExtractors } from '@/shared/components/filters';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

// Rôles assignables via l'UI : 'admin' est exclu (réservé aux superusers CVAT,
// rang de fait, non attribuable).
const ASSIGNABLE_ROLES: AppRole[] = ['moderator', 'curator', 'chercheur', 'annotator', 'guest'];

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

const ACCOUNTS_SORTS: SortOption[] = [
	{ key: 'username',                label: 'Nom (A-Z)',             defaultDirection: 'asc' },
	{ key: 'last_seen_at',            label: 'Dernière activité',     defaultDirection: 'desc' },
	{ key: 'actions_validated_total', label: 'Actions validées',      defaultDirection: 'desc' },
	{ key: 'date_joined',             label: 'Date d\'inscription',   defaultDirection: 'desc' },
];

const DEFAULT_STATE: FilterSortState = {
	filters: {},
	sort: { key: 'username', direction: 'asc' },
};

const ACCOUNTS_EXTRACTORS: FieldExtractors<UserWithRole> = {
	identity:                 (u) => `${u.username || ''} ${u.email || ''}`.toLowerCase(),
	role:                     (u) => u.role,
	state:                    (u) => u.state,
	online:                   (u) => (u.active_sessions ?? 0) > 0,
	username:                 (u) => (u.username || '').toLowerCase(),
	last_seen_at:             (u) => u.last_seen_at ?? null,
	actions_validated_total:  (u) => u.actions_validated_total ?? 0,
	date_joined:              (u) => u.date_joined ?? null,
};

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

function SessionCell({ user }: { user: UserWithRole }) {
	const online = (user.active_sessions ?? 0) > 0;
	const lastSeen = user.last_seen_at ? new Date(user.last_seen_at) : null;
	const subtitle = online
		? `${user.active_sessions} session${(user.active_sessions ?? 0) > 1 ? 's' : ''}`
		: (lastSeen ? `dernière activité ${formatRelative(lastSeen)}` : '—');
	return (
		<View style={styles.colSession}>
			<View style={styles.sessionRow}>
				<View style={[styles.sessionDot, online ? styles.sessionDotOn : styles.sessionDotOff]} />
				<Text style={[styles.sessionLabel, online && styles.sessionLabelOn]}>
					{online ? 'Connecté' : 'Hors-ligne'}
				</Text>
			</View>
			<Text style={styles.sessionSub}>{subtitle}</Text>
		</View>
	);
}

function formatRelative(d: Date): string {
	const diff = Date.now() - d.getTime();
	const m = Math.floor(diff / 60000);
	if (m < 1)    return 'à l\'instant';
	if (m < 60)   return `il y a ${m} min`;
	const h = Math.floor(m / 60);
	if (h < 24)   return `il y a ${h} h`;
	const day = Math.floor(h / 24);
	if (day < 30) return `il y a ${day} j`;
	return d.toLocaleDateString('fr-FR');
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
	const [filterState, setFilterState] = useState<FilterSortState>(DEFAULT_STATE);
	const service = useMemo(() => new AppApiService(), []);
	const currentProfile = getUserProfile();

	const presentRoles = useMemo(() => {
		const set = new Set(users.map((u) => u.role).filter(Boolean));
		return Array.from(set).map((r) => ({ value: r, label: ROLE_LABELS[r] ?? r }));
	}, [users]);

	const filters = useMemo<FilterField[]>(() => [
		{ kind: 'text',  key: 'identity', label: 'Rechercher', placeholder: 'Identifiant ou email…' },
		{ kind: 'chips', key: 'role',     label: 'Rôle',       multi: true, options: presentRoles },
		{ kind: 'chips', key: 'state',    label: 'État',       multi: true, options: STATES.map((s) => ({ value: s, label: STATE_LABELS[s] })) },
		{ kind: 'bool',  key: 'online',   label: 'Connexion',  trueLabel: 'En ligne', falseLabel: 'Hors-ligne' },
	], [presentRoles]);

	const filtered = useFilteredAndSorted(users, filters, ACCOUNTS_SORTS, filterState, ACCOUNTS_EXTRACTORS);

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
					<Text style={styles.subtitle}>
						{users.length} compte(s) enregistré(s) · {users.filter((u) => (u.active_sessions ?? 0) > 0).length} actuellement connecté(s)
					</Text>
				</View>
				<Pressable onPress={() => setCreateOpen(true)} style={styles.createBtn}>
					<Text style={styles.createBtnText}>+ Créer un compte</Text>
				</Pressable>
			</View>

			<FilterSortBar
				filters={filters}
				sorts={ACCOUNTS_SORTS}
				value={filterState}
				onChange={setFilterState}
				defaultState={DEFAULT_STATE}
				totalCount={users.length}
				resultCount={filtered.length}
				searchKey="identity"
			/>

			<View style={styles.tableHeader}>
				<Text style={[styles.colUsername, styles.headerCell]}>Identifiant</Text>
				<Text style={[styles.colEmail, styles.headerCell]}>Email</Text>
				<Text style={[styles.colSession, styles.headerCell]}>Session</Text>
				<Text style={[styles.colRole, styles.headerCell]}>Rôle</Text>
				<Text style={[styles.colStatus, styles.headerCell]}>Compte</Text>
			</View>

			<FlatList
				data={filtered}
				keyExtractor={u => String(u.id)}
				extraData={filtered}
				ListEmptyComponent={
					<View style={styles.empty}><Text style={styles.emptyText}>Aucun compte ne correspond aux filtres.</Text></View>
				}
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
						<SessionCell user={item} />
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
	colSession: { flex: 2 },
	colRole: { flex: 2 },
	colStatus: { flex: 2 },
	roleCell: { flex: 2 },
	stateCell: { flex: 2 },
	sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	sessionDot: { width: 8, height: 8, borderRadius: 4 },
	sessionDotOn:  { backgroundColor: '#16a34a' },
	sessionDotOff: { backgroundColor: '#9ca3af' },
	sessionLabel: { fontSize: 12, color: COLORS.text.secondary, fontWeight: '600' },
	sessionLabelOn: { color: '#16a34a' },
	sessionSub: { ...TYPOGRAPHY.caption, color: COLORS.text.placeholder, fontStyle: 'italic' },
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

	empty: { padding: SPACING.xl, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed' as any, borderRadius: 8 },
	emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },
});
