import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { mocksEnabled } from './config';
import './i18n';
import { createQueryClient } from './queryClient';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles.css';
import { initTheme } from './theme/theme';

async function enableMocks(): Promise<void> {
  if (!mocksEnabled()) return;
  const { worker } = await import('./mocks/browser');
  await worker.start({ onUnhandledRequest: 'bypass' });
}

initTheme();

const queryClient = createQueryClient();

void enableMocks().then(() => {
  const root = document.getElementById('root');
  if (!root) throw new Error('#root missing');
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter>
        <App queryClient={queryClient} />
      </BrowserRouter>
    </StrictMode>,
  );
});
