// Public Supabase config for the browser.
//
// The anon / "publishable" key is SAFE to expose: Row-Level Security only
// allows reading non-draft paintings, and every write goes through Netlify
// Functions using the secret service-role key (never shipped to the browser).
// This is the standard Supabase pattern for a public site.

window.PABLO_CONFIG = {
  SUPABASE_URL: 'https://qolptrdezliegxpyieoy.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_xgr-0Vt6_5cIgY82iIEXZQ_GB7fJkyU',
};
