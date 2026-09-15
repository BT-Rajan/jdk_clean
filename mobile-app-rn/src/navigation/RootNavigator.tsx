import { Pressable } from 'react-native';
import { DarkTheme, DrawerActions, LinkingOptions, NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '../context/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ProductCatalogScreen } from '../screens/ProductCatalogScreen';
import { ClientsListScreen } from '../screens/ClientsListScreen';
import { ClientFormScreen } from '../screens/ClientFormScreen';
import { ClientHistoryScreen } from '../screens/ClientHistoryScreen';
import { QuotationsListScreen } from '../screens/quotations/QuotationsListScreen';
import { NewQuotationScreen } from '../screens/quotations/NewQuotationScreen';
import { QuotationDetailScreen } from '../screens/quotations/QuotationDetailScreen';
import { FeasibilityDetailScreen } from '../screens/quotations/FeasibilityDetailScreen';
import { OrdersListScreen } from '../screens/orders/OrdersListScreen';
import { OrderFormScreen } from '../screens/orders/OrderFormScreen';
import { OrderDetailScreen } from '../screens/orders/OrderDetailScreen';
import { DeliveryNoteFormScreen } from '../screens/orders/DeliveryNoteFormScreen';
import { DeliveryNoteDetailScreen } from '../screens/orders/DeliveryNoteDetailScreen';
import { MyHistoryScreen } from '../screens/MyHistoryScreen';
import { DrawerContent } from './DrawerContent';
import { HeaderTitle, DetailHeaderTitle } from './HeaderTitle';
import { useLocale } from '../i18n/LocaleContext';
import { colors, fonts, whiteAlpha } from '../theme';

export type ClientsStackParamList = {
  ClientsList: undefined;
  ClientForm: { customerId?: number };
  ClientHistory: { customerId: number; customerName: string };
};

export type QuotationsStackParamList = {
  QuotationsList: undefined;
  // customerId/productId -- preset when arriving here from a Client's
  // activity hub or a Product Catalog row's "Start Quotation" action,
  // so the journey can begin from either of those screens instead of
  // only from the Quotations tab itself.
  NewQuotation: { customerId?: number; productId?: number } | undefined;
  QuotationDetail: { quotationId: number; startInEdit?: boolean };
  FeasibilityDetail: { feasibilityId: number };
};

export type OrdersStackParamList = {
  OrdersList: undefined;
  // Edit-only -- an order can only be created via the quotation flow
  // (see OrderFormScreen's own comment), so this always needs an
  // existing draft order's id.
  OrderForm: { orderId: number };
  OrderDetail: { orderId: number };
  DeliveryNoteForm: { orderId: number; orderNumber: string };
  DeliveryNoteDetail: { deliveryNoteId: number };
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
  // Default for every screen in these stacks: small logo + the screen's
  // own `title`. The three list screens below override this back to
  // the full HeaderTitle brand lockup; every other (detail) screen in
  // these stacks -- ClientForm, ClientHistory, NewQuotation,
  // QuotationDetail, FeasibilityDetail, OrderForm, OrderDetail,
  // DeliveryNoteForm, DeliveryNoteDetail -- picks this up automatically,
  // so none of them can end up logo-less again.
  headerTitle: (props: { children?: string }) => <DetailHeaderTitle {...props} />,
};

// Every top-level Drawer.Screen below that renders its own nested stack
// has headerShown: false on the *outer* Drawer.Screen -- the inner
// stack's own header takes over instead (so per-screen titles/back-
// chevrons work normally), which is why each of these needs its own
// menu button wired back to the drawer: it's otherwise unreachable from
// a screen whose header the drawer itself no longer renders. Standard
// react-navigation pattern for a stack nested inside a drawer.
function DrawerMenuButton({ navigation }: { navigation: any }) {
  return (
    <Pressable
      onPress={() => navigation.getParent()?.dispatch(DrawerActions.openDrawer())}
      hitSlop={10}
      style={{ paddingHorizontal: 4 }}
    >
      <Feather name="menu" size={22} color={colors.white} />
    </Pressable>
  );
}

const ClientsStack = createNativeStackNavigator<ClientsStackParamList>();
function ClientsStackNavigator() {
  const { t } = useLocale();
  return (
    <ClientsStack.Navigator screenOptions={stackScreenOptions}>
      <ClientsStack.Screen
        name="ClientsList"
        component={ClientsListScreen}
        options={({ navigation }) => ({
          // Branded logo/wordmark header, same as the drawer's own
          // top-level screens (Home/ProductCatalog/History) -- the
          // screen's own name lives in ClientsListScreen's in-body
          // PageHeader instead, same split those screens already use.
          headerTitle: () => <HeaderTitle />,
          headerLeft: () => <DrawerMenuButton navigation={navigation} />,
        })}
      />
      <ClientsStack.Screen name="ClientForm" component={ClientFormScreen} />
      <ClientsStack.Screen name="ClientHistory" component={ClientHistoryScreen} options={{ title: t('clientHistory', 'title') }} />
    </ClientsStack.Navigator>
  );
}

const QuotationsStack = createNativeStackNavigator<QuotationsStackParamList>();
function QuotationsStackNavigator() {
  const { t } = useLocale();
  return (
    <QuotationsStack.Navigator screenOptions={stackScreenOptions}>
      <QuotationsStack.Screen
        name="QuotationsList"
        component={QuotationsListScreen}
        options={({ navigation }) => ({
          // See ClientsList's options above: branded header here, the
          // page's own title stays in QuotationsListScreen's PageHeader.
          headerTitle: () => <HeaderTitle />,
          headerLeft: () => <DrawerMenuButton navigation={navigation} />,
        })}
      />
      <QuotationsStack.Screen name="NewQuotation" component={NewQuotationScreen} options={{ title: t('newQuotation', 'title') }} />
      <QuotationsStack.Screen
        name="QuotationDetail"
        component={QuotationDetailScreen}
        options={{ title: t('quotationDetail', 'title') }}
      />
      <QuotationsStack.Screen
        name="FeasibilityDetail"
        component={FeasibilityDetailScreen}
        options={{ title: t('feasibilityDetail', 'title') }}
      />
    </QuotationsStack.Navigator>
  );
}

const OrdersStack = createNativeStackNavigator<OrdersStackParamList>();
function OrdersStackNavigator() {
  const { t } = useLocale();
  return (
    <OrdersStack.Navigator screenOptions={stackScreenOptions}>
      <OrdersStack.Screen
        name="OrdersList"
        component={OrdersListScreen}
        options={({ navigation }) => ({
          // See ClientsList's options above: branded header here, the
          // page's own title stays in OrdersListScreen's PageHeader.
          headerTitle: () => <HeaderTitle />,
          headerLeft: () => <DrawerMenuButton navigation={navigation} />,
        })}
      />
      <OrdersStack.Screen name="OrderForm" component={OrderFormScreen} />
      <OrdersStack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: t('orderDetail', 'title') }} />
      <OrdersStack.Screen
        name="DeliveryNoteForm"
        component={DeliveryNoteFormScreen}
        options={{ title: t('deliveryNoteForm', 'title') }}
      />
      <OrdersStack.Screen
        name="DeliveryNoteDetail"
        component={DeliveryNoteDetailScreen}
        options={{ title: t('deliveryNoteDetail', 'title') }}
      />
    </OrdersStack.Navigator>
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
      <Drawer.Screen name="ProductCatalog" component={ProductCatalogScreen} />
      <Drawer.Screen name="Clients" component={ClientsStackNavigator} options={{ headerShown: false }} />
      <Drawer.Screen name="Quotations" component={QuotationsStackNavigator} options={{ headerShown: false }} />
      <Drawer.Screen name="Orders" component={OrdersStackNavigator} options={{ headerShown: false }} />
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
      ProductCatalog: 'products',
      History: 'history',
      Clients: {
        screens: {
          ClientsList: 'clients',
          ClientForm: 'clients/edit/:customerId?',
          ClientHistory: 'clients/:customerId/history',
        },
      },
      Quotations: {
        screens: {
          QuotationsList: 'quotations',
          NewQuotation: 'quotations/new',
          QuotationDetail: 'quotations/:quotationId',
          FeasibilityDetail: 'feasibility/:feasibilityId',
        },
      },
      Orders: {
        screens: {
          OrdersList: 'orders',
          OrderForm: 'orders/edit/:orderId',
          OrderDetail: 'orders/:orderId',
          DeliveryNoteForm: 'orders/:orderId/delivery-notes/new',
          DeliveryNoteDetail: 'delivery-notes/:deliveryNoteId',
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
