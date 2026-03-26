import React from 'react';
import ReactDOM from 'react-dom/client';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import App from './App';
import { MANIFEST_URL } from './constants';

// Suppress TonConnect SDK analytics errors which are often caused by network restrictions
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const firstArg = args[0];
  const isTonError = typeof firstArg === 'string' && 
    (firstArg.includes('[TON_CONNECT_SDK]') || firstArg.includes('analytics'));
  
  const isFetchError = args.some(arg => 
    (typeof arg === 'string' && (arg.includes('Failed to fetch') || arg.includes('TypeError'))) ||
    (arg instanceof Error && (arg.message.includes('Failed to fetch') || arg.message.includes('TypeError')))
  );

  if (isTonError || (isFetchError && args.some(arg => typeof arg === 'string' && arg.includes('TonConnect')))) {
    return;
  }
  originalConsoleError.apply(console, args);
};

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <TonConnectUIProvider 
      manifestUrl={MANIFEST_URL}
      actionsConfiguration={{
        twaReturnUrl: 'https://t.me/SlotAlchemyCryptoBot/playSlot'
      }}
      enableAndroidCustomScheme={true}
    >
      <App />
    </TonConnectUIProvider>
  </React.StrictMode>
);