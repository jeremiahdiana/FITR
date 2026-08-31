import { StatusBar } from 'expo-status-bar';
import { StripeProvider } from '@stripe/stripe-react-native';
import AppNavigator from './navigation/AppNavigator';
import { usePushToken } from './hooks/usePushToken';

const STRIPE_PUBLISHABLE_KEY = 'pk_live_51TCFxpK7dAcnXOS7tFROqFVozfOlweqU36xiCxelfXUNvqpslLN50rAG160R8jfmHn2KkjCzq0JD1uIR3iq1Ec2N00Mmoc6iHP';

function AppContent() {
  usePushToken(); // registers push token when expo-notifications is installed
  return (
    <>
      <StatusBar style="light" />
      <AppNavigator />
    </>
  );
}

export default function App() {
  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} merchantIdentifier="merchant.com.joinfitr">
      <AppContent />
    </StripeProvider>
  );
}
