import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {recognizeSlip} from '../lib/ocr';
await mkdir('.deploy/ocr',{recursive:true});
const requested=process.argv.slice(2);
for(const file of (await readdir('example-slip')).filter(x=>/\.(jpg|png|jpeg)$/i.test(x)&&(!requested.length||requested.includes(x)))){
 const start=Date.now(); const result=await recognizeSlip(await readFile('example-slip/'+file));
 await writeFile('.deploy/ocr/'+file+'.txt',result.text);
 console.log(file,JSON.stringify({slip:result.slip,debug:result.debug}),`(${Date.now()-start}ms)`);
}
