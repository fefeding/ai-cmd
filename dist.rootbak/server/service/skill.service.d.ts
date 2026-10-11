/**
 * Skill 定义接口
 */
export interface Skill {
    id: string;
    name: string;
    description: string;
    tags: string[];
    content: string;
    source: 'system' | 'user';
}
/**
 * Skill 服务 - 管理和加载 Skills
 *
 * Skills 存储位置：
 * - 系统内置：<project>/data/skills/*.md
 * - 用户自定义：~/.aicmd/skills/*.md
 */
export declare class SkillService {
    private skills;
    private systemSkillsDir;
    private userSkillsDir;
    constructor(systemSkillsDir?: string);
    /**
     * 加载所有 Skills
     */
    loadSkills(): void;
    /**
     * 从目录加载 Skills
     */
    private loadFromDir;
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
    private parseSkillFile;
    /**
     * 从 front matter 提取字段值
     */
    private extractField;
    /**
     * 获取所有 Skills 列表
     */
    getSkills(): Skill[];
    /**
     * 获取指定 Skill
     */
    getSkill(id: string): Skill | undefined;
    /**
     * 保存用户 Skill（创建或更新）
     */
    saveUserSkill(skill: Omit<Skill, 'source'>): Skill;
    /**
     * 删除用户 Skill
     */
    deleteUserSkill(id: string): boolean;
    /**
     * 重新加载 Skills
     */
    reload(): void;
}
//# sourceMappingURL=skill.service.d.ts.map