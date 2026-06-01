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
    updater?: {
      checkForUpdates(): Promise<any>;
      getStatus(): Promise<{ updateAvailable: { version: string; releaseDate: string } | null; updateDownloaded: boolean; downloadProgress: { percent: number } | null }>;
      install(): Promise<any>;
      onEvent(callback: (msg: { event: string; data: any }) => void): () => void;
      onMenuAction(callback: (action: string) => void): () => void;
    };
  };
}
