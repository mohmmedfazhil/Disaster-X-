import { copyFileSync } from "node:fs";
import { resolve } from "node:path";

for (const file of ["data.js", "rescue_mate.js", "app.js"]) {
  copyFileSync(resolve(file), resolve("dist", file));
}
