import { Redirect, useLocalSearchParams } from 'expo-router';
import { getUserProfile } from '@/services/api/authStorage';
import { CuratorStudioScreen } from '@/features/curator/screens/CuratorStudioScreen';

const ALLOWED_ROLES = ['admin', 'moderator', 'curator', 'chercheur'];

export default function CuratorStudioRoute() {
	const profile = getUserProfile();
	const role = profile?.appRole ?? '';
	if (!profile || !ALLOWED_ROLES.includes(role)) return <Redirect href="/(main)" />;

	const params = useLocalSearchParams<{ taskId: string; jobId: string }>();
	const taskId = Number(params.taskId);
	const jobId  = Number(params.jobId);
	if (!Number.isFinite(taskId) || !Number.isFinite(jobId)) {
		return <Redirect href="/(main)/curator" />;
	}

	return <CuratorStudioScreen taskId={taskId} jobId={jobId} />;
}
