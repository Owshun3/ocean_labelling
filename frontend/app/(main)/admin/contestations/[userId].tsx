import { useLocalSearchParams } from 'expo-router';
import { AdminContestationDetailScreen } from '@/features/admin/screens/AdminContestationDetailScreen';
import type { ContestationKind } from '@/services/api/AdminService';

export default function AdminContestationUserRoute() {
	const params = useLocalSearchParams<{ userId: string; kind?: string }>();
	const id = Number(params.userId);
	if (!Number.isFinite(id)) return null;
	const kind: ContestationKind = params.kind === 'annotation' ? 'annotation' : 'media';
	return <AdminContestationDetailScreen userId={id} kind={kind} />;
}
