import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Skill 定义接口
 */
export interface Skill {
  id: string;           // 文件名（不含扩展名），唯一标识
  name: string;         // 显示名称
  description: string;  // 简短描述
  tags: string[];       // 标签（用于搜索/匹配）
  content: string;      // 完整指令内容（front matter 之后的 markdown）
  source: 'system' | 'user'; // 来源
}

/**
 * Skill 服务 - 管理和加载 Skills
 * 
 * Skills 存储位置：
 * - 系统内置：<project>/data/skills/*.md
 * - 用户自定义：~/.fterm/skills/*.md
 */
export class SkillService {
  private skills: Map<string, Skill> = new Map();
  private systemSkillsDir: string;
  private userSkillsDir: string;

  constructor(systemSkillsDir?: string) {
    // 系统 Skills 目录：项目根目录下的 data/skills
    this.systemSkillsDir = systemSkillsDir || path.join(process.cwd(), 'data', 'skills');
    // 用户 Skills 目录：~/.fterm/skills
    const dataDir = process.env.fterm_DATA_DIR || path.join(os.homedir(), '.fterm');
    this.userSkillsDir = path.join(dataDir, 'skills');
    this.loadSkills();
  }

  /**
   * 加载所有 Skills
   */
  loadSkills(): void {
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
  private loadFromDir(dir: string, source: 'system' | 'user'): void {
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
        if (!file.endsWith('.md')) continue;

        const filePath = path.join(dir, file);
        const id = path.basename(file, '.md');

        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const skill = this.parseSkillFile(id, raw, source);
          if (skill) {
            this.skills.set(id, skill);
          }
        } catch (err) {
          console.error(`[SkillService] Failed to parse skill: ${file}`, err);
        }
      }
    } catch (err) {
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
  private parseSkillFile(id: string, raw: string, source: 'system' | 'user'): Skill | null {
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
    let tags: string[] = [];
    if (tagsStr) {
      const cleaned = tagsStr.replace(/[\[\]"]/g, '');
      tags = cleaned.split(',').map(t => t.trim()).filter(Boolean);
    }

    return { id, name, description, tags, content, source };
  }

  /**
   * 从 front matter 提取字段值
   */
  private extractField(fm: string, key: string): string {
    const regex = new RegExp(`^${key}:\\s*(.+)$`, 'm');
    const match = fm.match(regex);
    return match ? match[1].trim() : '';
  }

  /**
   * 获取所有 Skills 列表
   */
  getSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * 获取指定 Skill
   */
  getSkill(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  /**
   * 保存用户 Skill（创建或更新）
   */
  saveUserSkill(skill: Omit<Skill, 'source'>): Skill {
    const filePath = path.join(this.userSkillsDir, `${skill.id}.md`);
    
    // 确保目录存在
    if (!fs.existsSync(this.userSkillsDir)) {
      fs.mkdirSync(this.userSkillsDir, { recursive: true });
    }

    // 构建文件内容
    const tagsStr = skill.tags.length > 0 ? `[${skill.tags.join(', ')}]` : '[]';
    const content = `---\nname: ${skill.name}\ndescription: ${skill.description}\ntags: ${tagsStr}\n---\n\n${skill.content}\n`;

    fs.writeFileSync(filePath, content, 'utf-8');

    const fullSkill: Skill = { ...skill, source: 'user' };
    this.skills.set(skill.id, fullSkill);
    return fullSkill;
  }

  /**
   * 删除用户 Skill
   */
  deleteUserSkill(id: string): boolean {
    const skill = this.skills.get(id);
    if (!skill || skill.source !== 'user') return false;

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
  reload(): void {
    this.loadSkills();
  }
}
