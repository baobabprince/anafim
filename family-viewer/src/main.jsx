import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './family.css';
import './ancestry.css';
import './cloud.css';
// i18n ready under ./i18n/ — wire after App.jsx is restored from git history
// import { I18nProvider } from './i18n/I18nContext.jsx';
// import { initI18n } from './i18n/index.js';
// import './i18n/i18n.css';
// initI18n();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
