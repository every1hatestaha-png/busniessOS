interface BusinessOSDesktop {
  startAuth: () => void;
  signOut: () => Promise<boolean>;
  switchAccount: () => Promise<boolean>;
}

declare global {
  interface Window {
    businessOSDesktop?: BusinessOSDesktop;
  }
}

export {};
