import { useLocalSearchParams } from 'expo-router';
import { AdminContestationDetailScreen } from '@/features/admin/screens/AdminContestationDetailScreen';

export default function AdminContestationUserRoute() {
	const { userId } = useLocalSearchParams<{ userId: string }>();
	const id = Number(userId);
	if (!Number.isFinite(id)) return null;
	return <AdminContestationDetailScreen userId={id} />;
}
