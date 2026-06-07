/** Web stub for MetaMask SDK’s optional React Native peer (unused in the browser). */
const AsyncStorage = {
  getItem: async (_key: string): Promise<string | null> => null,
  setItem: async (_key: string, _value: string): Promise<void> => undefined,
  removeItem: async (_key: string): Promise<void> => undefined,
};

export default AsyncStorage;
