/**
 * Utility functions for parsing skill levels from email content
 */

export interface ParsedSkill {
  category: 'beginner' | 'intermediate' | 'advanced' | null;
  level: 1 | 2 | 3 | null;
}

/**
 * Parse skill string from email into category and level
 * Expected formats:
 * - "Beginner Level - 1"
 * - "Intermediate Level - 2" 
 * - "Advanced Level - 3"
 * - "Beginner Level-1" (no spaces around dash)
 * - "beginner level - 1" (case insensitive)
 */
export function parseSkillString(skillString: string): ParsedSkill {
  if (!skillString) {
    return { category: null, level: null };
  }

  // Clean and normalize the input
  const cleaned = skillString.trim().toLowerCase();

  // Regular expression to match the skill pattern
  // Matches: "beginner/intermediate/advanced level - 1/2/3"
  const skillRegex = /^(beginner|intermediate|advanced)\s*level\s*-?\s*([1-3])$/;
  
  const match = cleaned.match(skillRegex);
  
  if (match && match[1] && match[2]) {
    const category = match[1] as 'beginner' | 'intermediate' | 'advanced';
    const level = parseInt(match[2]) as 1 | 2 | 3;
    
    return { category, level };
  }

  // If no match found, try to extract category and level separately
  const categoryRegex = /(beginner|intermediate|advanced)/;
  const levelRegex = /([1-3])/;
  
  const categoryMatch = cleaned.match(categoryRegex);
  const levelMatch = cleaned.match(levelRegex);
  
  const category = categoryMatch && categoryMatch[1] ? categoryMatch[1] as 'beginner' | 'intermediate' | 'advanced' : null;
  const level = levelMatch && levelMatch[1] ? parseInt(levelMatch[1]) as 1 | 2 | 3 : null;
  
  return { category, level };
}

/**
 * Validate if a skill category is valid
 */
export function isValidSkillCategory(category: any): category is 'beginner' | 'intermediate' | 'advanced' {
  return ['beginner', 'intermediate', 'advanced'].includes(category);
}

/**
 * Validate if a skill level is valid
 */
export function isValidSkillLevel(level: any): level is 1 | 2 | 3 {
  return [1, 2, 3].includes(level);
}

/**
 * Format skill for display
 */
export function formatSkill(category: string | null, level: number | null): string {
  if (!category || !level) {
    return 'Not specified';
  }
  
  const capitalizedCategory = category.charAt(0).toUpperCase() + category.slice(1);
  return `${capitalizedCategory} Level ${level}`;
}
