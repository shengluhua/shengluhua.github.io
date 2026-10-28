'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
module.exports=function loadCourse(){
 const base=path.resolve(__dirname,'../microcourses/eda'),html=fs.readFileSync(path.join(base,'index.html'),'utf8');
 const scripts=[...html.matchAll(/<script[^>]+src="\.\/([^"?]+)(?:\?[^" ]*)?"/g)].map(m=>m[1]);
 const ctx={window:{},console,setTimeout,clearTimeout,setInterval,clearInterval};vm.createContext(ctx);
 for(const file of scripts)if(file!=='course-ui.js')vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),ctx,{filename:file});
 return {...ctx.window,_scripts:scripts};
};
