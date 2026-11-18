// Copia o xterm.js (o terminal da página) de node_modules para public/.
// Rode com `npm run vendor` depois de atualizar @xterm/xterm ou @xterm/addon-fit.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  ["node_modules/@xterm/xterm/lib/xterm.js", "public/xterm.js"],
  ["node_modules/@xterm/xterm/css/xterm.css", "public/xterm.css"],
  ["node_modules/@xterm/addon-fit/lib/addon-fit.js", "public/addon-fit.js"],
];

mkdirSync(join(root, "public"), { recursive: true });
for (const [from, to] of files) {
  copyFileSync(join(root, from), join(root, to));
  console.log(to);
}
