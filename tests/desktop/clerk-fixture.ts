// This fixture has no Clerk network access. It exercises renderer success,
// rejection and timeout independently of a real account's browser session.
export function useClerk() {
  return {
    signOut: async (callback: () => void) => {
      const mode = (window as Window & { clerkTestMode?: string }).clerkTestMode;
      if (mode === "reject") throw new Error("Fixture sign-out rejection");
      if (mode === "hang") return new Promise<void>(() => {});
      callback();
    },
  };
}

export function useUser() {
  return {
    user: {
      fullName: "Fixture User",
      primaryEmailAddress: { emailAddress: "fixture@example.com" },
    },
  };
}

export function useReverification<T extends (...args: never[]) => Promise<unknown>>(fetcher: T) {
  return async (...args: Parameters<T>) => {
    const target = window as Window & { clerkReverificationCalls?: number; clerkReverificationMode?: string };
    target.clerkReverificationCalls = (target.clerkReverificationCalls ?? 0) + 1;
    if (target.clerkReverificationMode === "cancel") return null;
    return fetcher(...args);
  };
}
