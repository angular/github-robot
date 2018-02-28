import {matchAny, matchAnyFile} from "../functions/src/plugins/common";

describe('common', () => {
  describe('match', () => {
    it('matchAnyFile should return true if it matches, false otherwise', async () => {
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
      expect(matchAnyFile(files, [])).toBeFalsy();
      expect(matchAnyFile(files, patterns)).toBeTruthy();
      expect(matchAnyFile(files, patterns, negPatterns)).toBeTruthy();
      expect(matchAnyFile(["BUILD.bazel"], patterns, negPatterns)).toBeTruthy();
      expect(matchAnyFile(["packages/common/tsconfig.json"], patterns, negPatterns)).toBeTruthy();
      expect(matchAnyFile(["packages/language-service/tsconfig.json"], patterns, negPatterns)).toBeFalsy();

      const files2 = [
        "packages/common/BUILD.bazel",
        ".gitignore"
      ];
      expect(matchAnyFile(files2, patterns, negPatterns)).toBeTruthy();
      expect(matchAnyFile([".gitkeep"], patterns, negPatterns)).toBeFalsy();
      expect(matchAnyFile(["packages/common/.gitkeep"], patterns, negPatterns)).toBeFalsy();
    });

    it('matchAny should return true if it matches, false otherwise', async () => {
      expect(matchAny(["cla: no"], ["PR target: *", "cla: yes"])).toBeFalsy();
      expect(matchAny(["type: bug/fix", "cla: yes"], ["PR target: *", "cla: yes"])).toBeTruthy();
      expect(matchAny(["continuous-integration/travis-ci/pr"], ["continuous-integration/*", "code-review/pullapprove"])).toBeTruthy();
      expect(matchAny(["PR target: master"], ["PR target: *", "cla: yes"], ["PR target: TBD", "cla: no"])).toBeTruthy();
      expect(matchAny(["PR target: TBD"], ["PR target: *", "cla: yes"], ["PR target: TBD", "cla: no"])).toBeFalsy();
    });
  });
});
