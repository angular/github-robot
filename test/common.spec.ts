import {match} from "../functions/src/plugins/common";

describe('common', () => {
  describe('match', () => {
    it('should return true if it matches, false otherwise', async () => {
      const files = [
        "packages/common/BUILD.bazel",
        "README.md"
      ];
      const patterns = [
        "BUILD.bazel",
        "LICENSE",
        "WORKSPACE",
        "modules/**",
        "packages/**",
      ];
      const negPatterns = [
        "packages/language-service/**",
        "**/.gitignore",
        "**/.gitkeep",
      ];
      expect(match(files, [])).toBeFalsy();
      expect(match(files, patterns)).toBeTruthy();
      expect(match(files, patterns, negPatterns)).toBeTruthy();
      expect(match(["BUILD.bazel"], patterns, negPatterns)).toBeTruthy();
      expect(match(["packages/common/tsconfig.json"], patterns, negPatterns)).toBeTruthy();
      expect(match(["packages/language-service/tsconfig.json"], patterns, negPatterns)).toBeFalsy();

      const files2 = [
        "packages/common/BUILD.bazel",
        ".gitignore"
      ];
      expect(match(files2, patterns, negPatterns)).toBeTruthy();
      expect(match([".gitkeep"], patterns, negPatterns)).toBeFalsy();
      expect(match(["packages/common/.gitkeep"], patterns, negPatterns)).toBeFalsy();
    });
  });
});
