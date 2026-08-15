/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FRAPPE_URL?: string;
  readonly VITE_CONSENT_VERSION?: string;
  readonly VITE_PAYMENTS_ENABLED?: string;
  readonly VITE_ERROR_REPORTING_URL?: string;
  readonly VITE_APP_RELEASE?: string;
  readonly VITE_ADMIN_ROLES?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
