require("esbuild").build({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  platform: "node",
  target: "node16", // or whatever matches VS Code
  outfile: "out/extension.js",
  external: ["vscode"], // don't bundle VS Code API
});
