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
exports.SkillService = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const data_dir_1 = require("../utils/data-dir");
/**
 * Skill 服务 - 管理和加载 Skills
 *
 * Skills 存储位置：
 * - 系统内置：<project>/data/skills/*.md
 * - 用户自定义：~/.aicmd/skills/*.md
 */
class SkillService {
    skills = new Map();
    systemSkillsDir;
    userSkillsDir;
    constructor(systemSkillsDir) {
        // 系统 Skills 目录：项目根目录下的 data/skills
        this.systemSkillsDir = systemSkillsDir || path.join(process.cwd(), 'data', 'skills');
        // 用户 Skills 目录：统一通过 getDataPath 获取
        this.userSkillsDir = (0, data_dir_1.getDataPath)('skills');
        this.loadSkills();
    }
    /**
     * 加载所有 Skills
     */
    loadSkills() {
        this.skills.clear();
        // 加载系统 Skills
        this.loadFromDir(this.systemSkillsDir, 'system');
        // 加载用户 Skills（同名会覆盖系统 Skill）
        this.loadFromDir(this.userSkillsDir, 'user');
        console.log(`[SkillService] Loaded ${this.skills.size} skills`);
    }
    /**
     * 从目录加载 Skills
     */
    loadFromDir(dir, source) {
        try {
            if (!fs.existsSync(dir)) {
                // 自动创建目录（用户目录）
                if (source === 'user') {
                    fs.mkdirSync(dir, { recursive: true });
                }
                return;
            }
            const files = fs.readdirSync(dir);
            for (const file of files) {
                if (!file.endsWith('.md'))
                    continue;
                const filePath = path.join(dir, file);
                const id = path.basename(file, '.md');
                try {
                    const raw = fs.readFileSync(filePath, 'utf-8');
                    const skill = this.parseSkillFile(id, raw, source);
                    if (skill) {
                        this.skills.set(id, skill);
                    }
                }
                catch (err) {
                    console.error(`[SkillService] Failed to parse skill: ${file}`, err);
                }
            }
        }
        catch (err) {
            console.error(`[SkillService] Failed to load skills from ${dir}:`, err);
        }
    }
    /**
     * 解析 Skill 文件（YAML front matter + Markdown 内容）
     *
     * 格式：
     * ---
     * name: Skill Name
     * description: 描述
     * tags: [tag1, tag2]
     * ---
     *
     * ## 指令内容...
     */
    parseSkillFile(id, raw, source) {
        // 提取 front matter
        const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
        if (!fmMatch) {
            // 没有 front matter，整个文件作为内容
            return {
                id,
                name: id,
                description: '',
                tags: [],
                content: raw.trim(),
                source,
            };
        }
        const frontMatter = fmMatch[1];
        const content = fmMatch[2].trim();
        // 简单解析 YAML front matter
        const name = this.extractField(frontMatter, 'name') || id;
        const description = this.extractField(frontMatter, 'description') || '';
        const tagsStr = this.extractField(frontMatter, 'tags') || '';
        // 解析 tags: [tag1, tag2] 或 tags: tag1, tag2
        let tags = [];
        if (tagsStr) {
            const cleaned = tagsStr.replace(/[\[\]"]/g, '');
            tags = cleaned.split(',').map(t => t.trim()).filter(Boolean);
        }
        return { id, name, description, tags, content, source };
    }
    /**
     * 从 front matter 提取字段值
     */
    extractField(fm, key) {
        const regex = new RegExp(`^${key}:\\s*(.+)$`, 'm');
        const match = fm.match(regex);
        return match ? match[1].trim() : '';
    }
    /**
     * 获取所有 Skills 列表
     */
    getSkills() {
        return Array.from(this.skills.values());
    }
    /**
     * 获取指定 Skill
     */
    getSkill(id) {
        return this.skills.get(id);
    }
    /**
     * 保存用户 Skill（创建或更新）
     */
    saveUserSkill(skill) {
        const filePath = path.join(this.userSkillsDir, `${skill.id}.md`);
        // 确保目录存在
        if (!fs.existsSync(this.userSkillsDir)) {
            fs.mkdirSync(this.userSkillsDir, { recursive: true });
        }
        // 构建文件内容
        const tagsStr = skill.tags.length > 0 ? `[${skill.tags.join(', ')}]` : '[]';
        const content = `---\nname: ${skill.name}\ndescription: ${skill.description}\ntags: ${tagsStr}\n---\n\n${skill.content}\n`;
        fs.writeFileSync(filePath, content, 'utf-8');
        const fullSkill = { ...skill, source: 'user' };
        this.skills.set(skill.id, fullSkill);
        return fullSkill;
    }
    /**
     * 删除用户 Skill
     */
    deleteUserSkill(id) {
        const skill = this.skills.get(id);
        if (!skill || skill.source !== 'user')
            return false;
        const filePath = path.join(this.userSkillsDir, `${id}.md`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        this.skills.delete(id);
        return true;
    }
    /**
     * 重新加载 Skills
     */
    reload() {
        this.loadSkills();
    }
}
exports.SkillService = SkillService;
//# sourceMappingURL=skill.service.js.map