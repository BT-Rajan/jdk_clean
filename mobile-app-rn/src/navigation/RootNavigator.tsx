import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { QuickQuoteScreen } from '../screens/QuickQuoteScreen';
import { ClientsListScreen } from '../screens/ClientsListScreen';
import { ClientFormScreen } from '../screens/ClientFormScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { colors, fonts, whiteAlpha } from '../theme';

export type ClientsStackParamList = {
  ClientsList: undefined;
  ClientForm: { customerId?: number };
};

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.ink950,
    card: colors.ink900,
    text: colors.white,
    border: whiteAlpha(0.1),
    primary: colors.gold400,
  },
};

const screenOptions = {
  headerStyle: { backgroundColor: colors.ink900 },
  headerTintColor: colors.white,
  headerTitleStyle: { fontFamily: fonts.sansSemibold, fontSize: 16 },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.ink950 },
};

const QuickQuoteStack = createNativeStackNavigator();
function QuickQuoteStackNavigator() {
  return (
    <QuickQuoteStack.Navigator screenOptions={screenOptions}>
      <QuickQuoteStack.Screen name="QuickQuote" component={QuickQuoteScreen} options={{ title: 'Quick Quote' }} />
    </QuickQuoteStack.Navigator>
  );
}

const ClientsStack = createNativeStackNavigator<ClientsStackParamList>();
function ClientsStackNavigator() {
  return (
    <ClientsStack.Navigator screenOptions={screenOptions}>
      <ClientsStack.Screen name="ClientsList" component={ClientsListScreen} options={{ title: 'Clients' }} />
      <ClientsStack.Screen name="ClientForm" component={ClientFormScreen} />
    </ClientsStack.Navigator>
  );
}

const AccountStack = createNativeStackNavigator();
function AccountStackNavigator() {
  return (
    <AccountStack.Navigator screenOptions={screenOptions}>
      <AccountStack.Screen name="Account" component={AccountScreen} options={{ title: 'Account' }} />
    </AccountStack.Navigator>
  );
}

const Tab = createBottomTabNavigator();
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.ink900, borderTopColor: whiteAlpha(0.08) },
        tabBarActiveTintColor: colors.gold400,
        tabBarInactiveTintColor: whiteAlpha(0.4),
        tabBarLabelStyle: { fontFamily: fonts.sansMedium, fontSize: 11 },
      }}
    >
      <Tab.Screen name="QuickQuoteTab" component={QuickQuoteStackNavigator} options={{ title: 'Quick Quote' }} />
      <Tab.Screen name="ClientsTab" component={ClientsStackNavigator} options={{ title: 'Clients' }} />
      <Tab.Screen name="AccountTab" component={AccountStackNavigator} options={{ title: 'Account' }} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { isReady, isAuthenticated } = useAuth();
  if (!isReady) return null;

  return (
    <NavigationContainer theme={navTheme}>
      {isAuthenticated ? <MainTabs /> : <LoginScreen />}
    </NavigationContainer>
  );
}
