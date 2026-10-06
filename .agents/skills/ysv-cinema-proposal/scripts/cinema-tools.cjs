"use strict";
const core=require("./cinema-core.cjs");
function runCommand(args,io) {
  const [command,...rest]=args;
  const readJson=file=>JSON.parse(io.readText(file).replace(/^\uFEFF/,""));
  try {
    if(command==="inspect"&&rest.length===1) {
      const output=core.validateProject(readJson(rest[0]));return{exitCode:output.errors.length?1:0,output};
    }
    if(command==="metrics"&&rest.length===1) {
      const output=core.projectMetrics(readJson(rest[0]));return{exitCode:output.inspection.errors.length?1:0,output};
    }
    if(command==="compare"&&rest.length===2) {
      const output=core.compareGeometry(readJson(rest[0]),readJson(rest[1]));return{exitCode:output.unchanged?0:2,output};
    }
    if(command==="validate-skill"&&rest.length===1) {
      const output=core.validateSkillFiles(io.readSkillFiles(rest[0]));return{exitCode:output.valid?0:1,output};
    }
    if(command==="selftest"&&rest.length===0) {
      const output=require("./selftest-core.cjs").runSelfTests(core);return{exitCode:output.failed?1:0,output};
    }
    return{exitCode:1,output:{error:"用法：inspect FILE | metrics FILE | compare BASELINE CURRENT | validate-skill DIR | selftest"}};
  }catch(error){return{exitCode:1,output:{error:error.message}};}
}
module.exports={runCommand};
if(require.main===module) {
  const fs=require("node:fs"),path=require("node:path");
  const io={
    readText:file=>fs.readFileSync(path.resolve(file),"utf8"),
    readSkillFiles:directory=>{
      const root=path.resolve(directory),result={};
      function visit(dir) {
        for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
          if(entry.name===".git"||entry.name==="node_modules")continue;
          const full=path.join(dir,entry.name);
          if(entry.isDirectory())visit(full);
          else if(entry.isFile())result[path.relative(root,full).split(path.sep).join("/")]=fs.readFileSync(full,"utf8");
        }
      }
      visit(root);return result;
    }
  };
  const result=runCommand(process.argv.slice(2),io);
  console.log(JSON.stringify(result.output,null,2));process.exitCode=result.exitCode;
}
