import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('app/portfolio-data.ts', 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const context = { exports: {} };
vm.runInNewContext(outputText, context);
const { profile, experience, projects, skills, education } = context.exports;
fs.mkdirSync('tmp/pdfs', { recursive: true });
fs.writeFileSync('tmp/pdfs/resume-data.json', JSON.stringify({ profile, experience, projects: projects.slice(0, 4), skills, education }, null, 2));
