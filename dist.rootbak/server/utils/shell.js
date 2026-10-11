"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.shellQuote = shellQuote;
exports.assessDangerousCommand = assessDangerousCommand;
exports.randomId = randomId;
const crypto = __importStar(require("crypto"));
function shellQuote(value) {
    return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}
function assessDangerousCommand(command) {
    const trimmed = String(command || '').trim();
    if (!trimmed)
        return { safe: false, reason: 'Empty command' };
    const normalized = trimmed.replace(/\\\n/g, ' ').replace(/\s+/g, ' ');
    const blocked = [
        /(?:^|[;&|]\s*)rm\s+[^\n]*\s(?:\/|\/\*|--no-preserve-root)(?:\s|$)/i,
        /(?:^|[;&|]\s*)sudo\s+rm\s+[^\n]*\s(?:\/|\/\*|--no-preserve-root)(?:\s|$)/i,
        /(?:^|[;&|]\s*)mkfs(?:\.|\s)/i,
        /(?:^|[;&|]\s*)dd\s+[^\n]*(?:of=\/dev\/|if=\/dev\/zero)/i,
        /(?:^|[;&|]\s*)shred\s+[^\n]*(?:\/dev\/|\s\/)/i,
        /(?:^|[;&|]\s*)chmod\s+-R\s+777\s+\//i,
        /(?:^|[;&|]\s*)chown\s+-R\s+[^\n]+\s+\//i,
        /(?:^|[;&|]\s*)format\s+[a-z]:/i,
        /(?:^|[;&|]\s*)Clear-Disk\b/i,
        /(?:^|[;&|]\s*)Remove-Item\s+[^\n]*(?:-Recurse\s+[^\n]*)?[a-z]:\\\s*$/i,
        /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;\s*:/,
        /curl\s+[^\n|;]+\|\s*(?:sudo\s+)?(?:sh|bash|zsh|python|node)/i,
        /wget\s+[^\n|;]+\|\s*(?:sudo\s+)?(?:sh|bash|zsh|python|node)/i,
    ];
    for (const pattern of blocked) {
        if (pattern.test(normalized)) {
            return { safe: false, reason: 'BLOCKED: high-risk destructive command requires manual execution' };
        }
    }
    return { safe: true };
}
function randomId(prefix) {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}
//# sourceMappingURL=shell.js.map