import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd(), files=[];
function walk(dir){
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    if(['node_modules','.git','dist','android'].includes(e.name)) continue;
    const f=path.join(dir,e.name);
    if(e.isDirectory()) walk(f);
    else if(/\\.(ts|tsx|js|jsx)$/.test(e.name)) files.push(f);
  }
}
walk(root);
const routes=[];
for(const file of files){
  const source=fs.readFileSync(file,'utf8');
  const re=/(?:app|router)\\.(get|post|put|patch|delete)\\(\\s*['"]([^'"]+)['"]/g;
  let m;
  while((m=re.exec(source))) routes.push({method:m[1].toUpperCase(),path:m[2],file:path.relative(root,file)});
}
routes.sort((a,b)=>a.method.localeCompare(b.method)||a.path.localeCompare(b.path)||a.file.localeCompare(b.file));
fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
fs.writeFileSync(path.join(root,'artifacts/api-inventory.json'),JSON.stringify({schemaVersion:'GEAS-API-INVENTORY-1.0',generatedAt:new Date().toISOString(),routeCount:routes.length,routes},null,2)+'\\n');
console.log('Generated API inventory:',routes.length);
