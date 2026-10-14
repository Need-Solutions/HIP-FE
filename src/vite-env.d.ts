/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_USE_MOCKS?: string;
  readonly VITE_PAYSTACK_PUBLIC_KEY?: string;
  /** 'true' keeps the scanner's Test scan panel in a mock build (offline tests). Never set it for a real release. */
  readonly VITE_TEST_TOOLS?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
