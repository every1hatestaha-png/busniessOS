/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function webMutationInventory(root = process.cwd()) {
  const routes = [];
  const serverActions = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) { walk(filename); continue; }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const source = ts.createSourceFile(filename, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true);
      const relative = path.relative(root, filename).replaceAll("\\", "/");
      const moduleAction = source.statements.some(node => ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression) && node.expression.text === "use server");
      for (const node of source.statements) {
        if (!node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
        const declarations = ts.isVariableStatement(node) ? node.declarationList.declarations : [node];
        for (const declaration of declarations) {
          const name = declaration.name?.getText(source);
          if (entry.name === "route.ts" && /^(POST|PUT|PATCH|DELETE)$/.test(name ?? "")) {
            const initializer = declaration.initializer;
            routes.push({ file: relative, method: name, apiHandler: Boolean(initializer && ts.isCallExpression(initializer) && initializer.expression.getText(source) === "apiHandler") });
          }
          if (moduleAction && ts.isFunctionDeclaration(declaration)) serverActions.push({ file: relative, name });
        }
      }
      function inline(node) {
        if (ts.isBlock(node) && node.statements.some(statement => ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression) && statement.expression.text === "use server")) {
          serverActions.push({ file: relative, name: "inline", line: source.getLineAndCharacterOfPosition(node.pos).line + 1 });
        }
        ts.forEachChild(node, inline);
      }
      inline(source);
    }
  }
  walk(path.join(root, "app"));
  return { routes, serverActions };
}
module.exports = { webMutationInventory };
if (require.main === module) console.log(JSON.stringify(webMutationInventory(), null, 2));
