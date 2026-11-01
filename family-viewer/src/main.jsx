import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { I18nProvider } from './i18n/I18nContext.jsx';
import { initI18n } from './i18n/index.js';
import './styles.css';
import './family.css';
import './ancestry.css';
import './cloud.css';

initI18n();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);
