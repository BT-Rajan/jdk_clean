import { Pressable } from 'react-native';
import { DarkTheme, DrawerActions, LinkingOptions, NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '../context/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { QuickQuoteScreen } from '../screens/QuickQuoteScreen';
import { ClientsListScreen } from '../screens/ClientsListScreen';
import { ClientFormScreen } from '../screens/ClientFormScreen';
import { ClientHistoryScreen } from '../screens/ClientHistoryScreen';
import { MyHistoryScreen } from '../screens/MyHistoryScreen';
import { DrawerContent } from './DrawerContent';
import { HeaderTitle } from './HeaderTitle';
import { useLocale } from '../i18n/LocaleContext';
import { colors, fonts, whiteAlpha } from '../theme';

export type ClientsStackParamList = {
  ClientsList: undefined;
  ClientForm: { customerId?: number };
  ClientHistory: { customerId: number; customerName: string };
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

const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.ink900 },
  headerTintColor: colors.white,
  headerTitleStyle: { fontFamily: fonts.sansSemibold, fontSize: 16 },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.ink950 },
};

const ClientsStack = createNativeStackNavigator<ClientsStackParamList>();
function ClientsStackNavigator() {
  const { t } = useLocale();
  return (
    <ClientsStack.Navigator screenOptions={stackScreenOptions}>
      <ClientsStack.Screen
        name="ClientsList"
        component={ClientsListScreen}
        options={({ navigation }) => ({
          title: t('clients', 'title'),
          // The outer Drawer.Screen for "Clients" has headerShown: false
          // (this stack's own header takes over, so its per-screen
          // titles/back-chevron work normally) -- this button is how the
          // drawer stays reachable from a screen whose header the drawer
          // itself no longer renders. Standard react-navigation pattern
          // for a stack nested inside a drawer.
          headerLeft: () => (
            <Pressable
              onPress={() => navigation.getParent()?.dispatch(DrawerActions.openDrawer())}
              hitSlop={10}
              style={{ paddingHorizontal: 4 }}
            >
              <Feather name="menu" size={22} color={colors.white} />
            </Pressable>
          ),
        })}
      />
      <ClientsStack.Screen name="ClientForm" component={ClientFormScreen} />
      <ClientsStack.Screen name="ClientHistory" component={ClientHistoryScreen} options={{ title: t('clientHistory', 'title') }} />
    </ClientsStack.Navigator>
  );
}

const Drawer = createDrawerNavigator();

function AuthenticatedShell() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink900 },
        headerTintColor: colors.white,
        headerShadowVisible: false,
        headerTitle: () => <HeaderTitle />,
        drawerStyle: { backgroundColor: colors.ink900, width: 260 },
        sceneContainerStyle: { backgroundColor: colors.ink950 },
      }}
    >
      <Drawer.Screen name="Home" component={HomeScreen} />
      <Drawer.Screen name="Enquiry" component={QuickQuoteScreen} />
      <Drawer.Screen name="Clients" component={ClientsStackNavigator} options={{ headerShown: false }} />
      <Drawer.Screen name="History" component={MyHistoryScreen} />
    </Drawer.Navigator>
  );
}

// Maps screens to URL paths so the browser (and, for an installed PWA,
// the phone's own back button/gesture -- Android routes that to the
// frontmost web app's history even with no visible browser chrome) can
// step back through in-app navigation the normal way, instead of just
// leaving the app. Without this, React Navigation keeps its state
// entirely in-memory on web and never touches browser history at all.
const linking: LinkingOptions<any> = {
  prefixes: [],
  config: {
    screens: {
      Home: '',
      Enquiry: 'enquiry',
      History: 'history',
      Clients: {
        screens: {
          ClientsList: 'clients',
          ClientForm: 'clients/edit/:customerId?',
          ClientHistory: 'clients/:customerId/history',
        },
      },
    },
  },
};

export function RootNavigator() {
  const { isReady, isAuthenticated } = useAuth();
  const navRef = useNavigationContainerRef();
  if (!isReady) return null;

  return (
    <NavigationContainer
      ref={navRef}
      theme={navTheme}
      linking={linking}
      documentTitle={{
        // React Navigation's web title otherwise falls back to the
        // current screen's `options.title`, which is `undefined` on the
        // (title-less) login screen -- shows as a literal "undefined"
        // browser tab title, so give it an explicit default.
        formatter: (options) => (options?.title ? `${options.title} — JDK Quick Quote` : 'JDK Quick Quote'),
      }}
    >
      {isAuthenticated ? <AuthenticatedShell /> : <LoginScreen />}
    </NavigationContainer>
  );
}
