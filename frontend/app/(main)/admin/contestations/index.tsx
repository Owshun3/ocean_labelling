import { Redirect } from 'expo-router';
export default function AdminContestationsLegacyRoute() {
	return <Redirect href={'/(main)/admin/requests' as any} />;
}
