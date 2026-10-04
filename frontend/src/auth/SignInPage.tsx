import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { isApiError } from '../api/client';
import { isSignInErrorCode } from '../api/enums';
import { authApi, GOOGLE_SIGN_IN_URL } from '../api/endpoints';
import type { Partner } from '../api/types';
import { devLoginEnabled } from '../config';
import { setLanguage } from '../i18n';
import { apiErrorMessage, signInErrorLabel } from '../i18n/labels';
import { Button } from '../components/Button';
import { buttonClass } from '../components/buttonClass';
import { Field } from '../components/fields';
import { Logo } from '../components/Logo';
import { LanguageButtons } from '../layout/LanguageButtons';
import { ThemeToggle } from '../layout/ThemeToggle';
import { useAuthContext } from './AuthContext';
import { meKey, useMe } from './useMe';

function targetFromState(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('/login') ? from : '/';
}

export function SignInPage() {
  const { t, i18n } = useTranslation();
  const { data: me } = useMe();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { sessionEnded, clearSessionEnded } = useAuthContext();
  const [email, setEmail] = useState('');

  const devLogin = useMutation({
    mutationFn: (value: string) => authApi.devLogin({ email: value }),
    onSuccess: (partner: Partner) => {
      clearSessionEnded();
      queryClient.setQueryData(meKey, partner);
      void navigate(targetFromState(location.state), { replace: true });
    },
  });

  if (me) return <Navigate to={targetFromState(location.state)} replace />;

  const errorParam = searchParams.get('error');
  const callbackError = isSignInErrorCode(errorParam) ? signInErrorLabel(t, errorParam) : null;

  let devError: string | null = null;
  if (devLogin.error) {
    const error = devLogin.error;
    if (isApiError(error) && error.status === 403) devError = t('signIn.errors.NOT_A_PARTNER');
    else if (isApiError(error) && error.status === 404) devError = t('signIn.errors.DEV_LOGIN_DISABLED');
    else devError = apiErrorMessage(t, error);
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (email.trim()) devLogin.mutate(email.trim());
  };

  return (
    <main className="signin">
      <div className="signin-top">
        <LanguageButtons value={i18n.language === 'en' ? 'en' : 'fi'} onChange={setLanguage} />
        <ThemeToggle />
      </div>
      <div className="signin-card">
        <h1 className="signin-brand">
          <Logo size="large" />
        </h1>
        <h2 className="signin-title">{t('signIn.title')}</h2>
        <p className="muted">{t('signIn.intro')}</p>

        {sessionEnded && !callbackError && (
          <p className="notice" role="status">
            {t('signIn.sessionEnded')}
          </p>
        )}
        {callbackError && (
          <p className="notice notice-error" role="alert">
            {callbackError}
          </p>
        )}

        <a className={buttonClass({ variant: 'primary', block: true })} href={GOOGLE_SIGN_IN_URL}>
          {t('signIn.google')}
        </a>

        {devLoginEnabled() && (
          <form className="dev-login" onSubmit={onSubmit} noValidate>
            <h3 className="section-label">{t('signIn.devTitle')}</h3>
            <p className="muted small">{t('signIn.devHint')}</p>
            <Field label={t('signIn.email')}>
              {(field) => (
                <input
                  {...field}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              )}
            </Field>
            {devError && (
              <p className="field-error" role="alert">
                {devError}
              </p>
            )}
            <Button type="submit" block disabled={devLogin.isPending}>
              {t('signIn.devSubmit')}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
