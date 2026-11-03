import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

/**
 * Return a require function rooted in the current run's private Token-2022
 * dependency directory. Refuse symlinks, group/world access, and foreign owners.
 */
export function createPrivateToken2022Require() {
  const modulesDirectory = process.env.GLORIFIER_TOKEN2022_NODE_MODULES_DIR;
  if (!modulesDirectory) {
    throw new Error("GLORIFIER_TOKEN2022_NODE_MODULES_DIR is required.");
  }

  const modulesStat = fs.lstatSync(modulesDirectory);
  if (
    !modulesStat.isDirectory() ||
    modulesStat.isSymbolicLink() ||
    (modulesStat.mode & 0o077) !== 0 ||
    (typeof process.getuid === "function" && modulesStat.uid !== process.getuid())
  ) {
    throw new Error(
      "Token-2022 dependency directory must be a non-symlink directory owned by the current user with mode 0700.",
    );
  }

  return createRequire(path.join(fs.realpathSync(modulesDirectory), "package.json"));
}
