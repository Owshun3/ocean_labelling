import { Redirect, useLocalSearchParams } from 'expo-router';
import { getUserProfile } from '@/services/api/authStorage';
import { CuratorPostValidationScreen } from '@/features/curator/screens/CuratorPostValidationScreen';

const ALLOWED_ROLES = ['admin', 'moderator', 'curator', 'chercheur'];

export default function CuratorDoneRoute() {
	const profile = getUserProfile();
	const role = profile?.appRole ?? '';
	if (!profile || !ALLOWED_ROLES.includes(role)) {
		return <Redirect href="/(main)" />;
	}
	const params = useLocalSearchParams<{ taskId?: string }>();
	const completedTaskId = Number(params.taskId);
	return <CuratorPostValidationScreen completedTaskId={Number.isFinite(completedTaskId) ? completedTaskId : null} />;
}
