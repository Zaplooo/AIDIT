import React from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './ui/App';
import './ui/styles.css';
import './ui/wizard.css';
import './ui/v5.css';
import './ui/v6.css';

createRoot(document.getElementById('root')!).render(<App />);
