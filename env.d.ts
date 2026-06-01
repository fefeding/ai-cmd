/// <reference types="vite/client" />

declare interface Window {
  __INITIAL_STATE__?: any;
  electronAPI?: {
    isElectron: boolean;
    isPackaged: boolean;
    platform: string;
    terminalIPC: {
      send(message: any): void;
      onMessage(callback: (msg: any) => void): () => void;
    };
  };
}
