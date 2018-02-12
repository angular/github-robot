import {matchAny} from "../functions/src/plugins/common";

describe('common', () => {
  describe('match', () => {
    it('matchAny should return true if it matches, false otherwise', async () => {
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
      expect(matchAny(files, [])).toBeFalsy();
      expect(matchAny(files, patterns)).toBeTruthy();
      expect(matchAny(files, patterns, negPatterns)).toBeTruthy();
      expect(matchAny(["BUILD.bazel"], patterns, negPatterns)).toBeTruthy();
      expect(matchAny(["packages/common/tsconfig.json"], patterns, negPatterns)).toBeTruthy();
      expect(matchAny(["packages/language-service/tsconfig.json"], patterns, negPatterns)).toBeFalsy();

      const files2 = [
        "packages/common/BUILD.bazel",
        ".gitignore"
      ];
      expect(matchAny(files2, patterns, negPatterns)).toBeTruthy();
      expect(matchAny([".gitkeep"], patterns, negPatterns)).toBeFalsy();
      expect(matchAny(["packages/common/.gitkeep"], patterns, negPatterns)).toBeFalsy();
    });
  });
});
