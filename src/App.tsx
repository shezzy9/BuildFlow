/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StoreProvider, useStore } from './context/StoreContext';
import { LandingPage } from './components/screens/LandingPage';
import { LoginScreen } from './components/screens/LoginScreen';
import { AppShell } from './components/layout/AppShell';
import { DashboardScreen } from './components/screens/DashboardScreen';
import {
  ProductsCatalogueScreen,
  ProductFormScreen,
} from './components/screens/ProductsScreen';
import { InventoryScreen } from './components/screens/InventoryScreen';
import { PurchasesScreen } from './components/screens/PurchasesScreen';
import {
  SalesAndBillingScreen,
  InvoiceDetailScreen,
} from './components/screens/SalesAndInvoiceScreen';
import {
  SuppliersScreen,
  CustomersScreen,
  ReportsScreen,
  TeamScreen,
  SettingsScreen,
} from './components/screens/DirectoryAndAdminScreens';
import { ToastContainer } from './components/ui/Primitives';

const AppRouter: React.FC = () => {
  const { screen, toasts, removeToast } = useStore();

  return (
    <>
      {screen === 'landing' && <LandingPage />}
      {screen === 'login' && <LoginScreen />}
      {screen !== 'landing' && screen !== 'login' && (
        <AppShell>
          {screen === 'dashboard' && <DashboardScreen />}
          {screen === 'products' && <ProductsCatalogueScreen />}
          {screen === 'product-form' && <ProductFormScreen />}
          {screen === 'inventory' && <InventoryScreen />}
          {(screen === 'purchase-entry' || screen === 'purchase-history') && (
            <PurchasesScreen />
          )}
          {(screen === 'pos-billing' || screen === 'sales-history') && (
            <SalesAndBillingScreen />
          )}
          {screen === 'invoice-detail' && <InvoiceDetailScreen />}
          {screen === 'suppliers' && <SuppliersScreen />}
          {screen === 'customers' && <CustomersScreen />}
          {screen === 'reports' && <ReportsScreen />}
          {screen === 'team' && <TeamScreen />}
          {screen === 'settings' && <SettingsScreen />}
        </AppShell>
      )}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </>
  );
};

export default function App() {
  return (
    <StoreProvider>
      <AppRouter />
    </StoreProvider>
  );
}
