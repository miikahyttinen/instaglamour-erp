/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCKS?: string;
  readonly VITE_DEV_LOGIN?: string;
  readonly VITE_AUTH_ALLOWED_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
