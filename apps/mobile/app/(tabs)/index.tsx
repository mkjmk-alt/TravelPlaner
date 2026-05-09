import { Redirect } from 'expo-router';

export default function Index() {
  // We redirect to /map as the primary view
  return <Redirect href="/map" />;
}
