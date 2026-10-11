export declare function shellQuote(value: string): string;
export interface CommandRisk {
    safe: boolean;
    reason?: string;
}
export declare function assessDangerousCommand(command: string): CommandRisk;
export declare function randomId(prefix: string): string;
//# sourceMappingURL=shell.d.ts.map