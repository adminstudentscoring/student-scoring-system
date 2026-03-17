/* Split game/tactics-fighter/tactics-fighter.js into:
 * - game/tactics-fighter/core.js  (prefix, keeps the opening IIFE)
 * - game/tactics-fighter/tactics-fighter.js (suffix, contains window.initTacticsFighter and closes the IIFE)
 *
 * This preserves runtime behavior while making the code easier to maintain in smaller chunks later.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const FILE: string = path.join(__dirname, "..", "game", "tactics-fighter", "tactics-fighter.js");
const OUT_CORE: string = path.join(__dirname, "..", "game", "tactics-fighter", "core.js");

function main(): void {
  const src: string = fs.readFileSync(FILE, "utf8");
  const needle = "window.initTacticsFighter";
  const idx = src.indexOf(needle);
  if (idx < 0) {
    console.error("Split marker not found:", needle);
    process.exit(1);
  }

  const core = src.slice(0, idx).replace(/\s*$/, "\n");
  const app = src.slice(idx);

  fs.writeFileSync(OUT_CORE, core, "utf8");
  fs.writeFileSync(FILE, app, "utf8");

  console.log("Split OK");
  console.log(" - core.js lines:", core.split(/\r?\n/).length);
  console.log(" - tactics-fighter.js lines:", app.split(/\r?\n/).length);
}

if (require.main === module) main();

