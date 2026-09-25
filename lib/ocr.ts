import { createWorker, OEM, PSM } from 'tesseract.js';
import sharp from 'sharp';
import { mkdir, copyFile, access, constants } from 'node:fs/promises';
import path from 'node:path';
import { parseSlipText, parseDateLine, cleanRecipient } from './slip-parser';

// Vercel traces these packages into the function bundle under node_modules.
// Avoid createRequire().resolve(): webpack can fold the createRequire call away
// while leaving the later `.resolve()` access in a production server bundle.
const packagePath=(...parts:string[])=>path.join(process.cwd(),'node_modules',...parts);
type Rect=readonly [number,number,number,number];
const regions:Record<string,{date:Rect,amount:Rect,recipient:Rect}>={
 paotang:{date:[.10,.293,.78,.035],amount:[.48,.64,.47,.23],recipient:[.18,.38,.66,.15]},
 make:{date:[.02,.09,.62,.10],amount:[.035,.61,.38,.065],recipient:[.14,.39,.58,.055]},
 bbl:{date:[.28,.32,.44,.03],amount:[.35,.382,.30,.036],recipient:[.37,.545,.59,.059]},
 scb:{date:[.34,.24,.42,.025],amount:[.60,.596,.35,.034],recipient:[.60,.455,.36,.034]},
};
function referenceDate(raw:string,provider:string):{date:string|null,time:string|null}{
 const match=provider==='bbl'
  ?[...raw.matchAll(/\b(20\d{6})([01]\d|2[0-3])([0-5]\d)\d{6,}\b/g)].at(-1)
  :provider==='scb'?raw.match(/\b(20\d{6})[a-zA-Z0-9]{8,}\b/):null;
 if(!match)return {date:null,time:null};
 const year=Number(match[1].slice(0,4)),month=Number(match[1].slice(4,6)),day=Number(match[1].slice(6,8));
 const valid=new Date(Date.UTC(year,month-1,day));
 if(valid.getUTCFullYear()!==year||valid.getUTCMonth()!==month-1||valid.getUTCDate()!==day)return {date:null,time:null};
 return {date:`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,time:provider==='bbl'?`${match[2]}:${match[3]}`:null};
}
let langCacheReady=false;
async function ensureLangCache(){
  if(langCacheReady)return;
  const langPath='/tmp/jod-jai-ocr-languages';
  await mkdir(langPath,{recursive:true});
  await Promise.all(['tha','eng'].map(async code=>{
    const dest=path.join(langPath,`${code}.traineddata.gz`);
    try{await access(dest,constants.F_OK);}catch{
      await copyFile(packagePath('@tesseract.js-data',code,'4.0.0_best_int',`${code}.traineddata.gz`),dest);
    }
  }));
  langCacheReady=true;
}
export async function recognizeSlip(image:Buffer) {
  await ensureLangCache();
  const langPath='/tmp/jod-jai-ocr-languages';
  const worker=await createWorker('eng+tha',OEM.LSTM_ONLY,{
   langPath,workerPath:packagePath('tesseract.js','src','worker-script','node','index.js'),
   corePath:packagePath('tesseract.js-core'),
   cacheMethod:'none',logger:()=>{},errorHandler:()=>{},
  });
 try {
  const source=await sharp(image,{limitInputPixels:25_000_000}).rotate().png().toBuffer();
  const meta=await sharp(source).metadata();
  async function crop(rect:Rect,retry=false,height=retry?180:110){
   let [x,y,w,h]=rect;
   if(retry){x=Math.max(0,x-w*.08);y=Math.max(0,y-h*.65);w=Math.min(1-x,w*1.16);h=Math.min(1-y,h*2.3);}
   let pipeline=sharp(source).extract({left:Math.round(meta.width!*x),top:Math.round(meta.height!*y),width:Math.max(1,Math.round(meta.width!*w)),height:Math.max(1,Math.round(meta.height!*h))}).resize({height}).grayscale().normalize().sharpen();
   if(retry)pipeline=pipeline.threshold(175);
   return pipeline.png().toBuffer();
  }
  await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT,preserve_interword_spaces:'1'});
  const prepared=await sharp(source).resize({width:1500}).png().toBuffer();
  const preparedMeta=await sharp(prepared).metadata();
  const result=await worker.recognize(prepared,{}, {blocks:true});const slip=parseSlipText(result.data.text);
  const lines=result.data.blocks?.flatMap(block=>block.paragraphs.flatMap(p=>p.lines))||[];
  const lineY=(line:typeof lines[number])=>line.bbox.y0/preparedMeta.height!;
  if(slip.provider==='unsupported'){
   await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_WORD});
   const header=(await worker.recognize(await crop([.405,.048,.215,.071]))).data.text;
   if(/SCB/i.test(header))slip.provider='scb';
   else {
    const makeHeader=(await worker.recognize(await crop([.68,.02,.31,.16]))).data.text;
    if(/make/i.test(makeHeader))slip.provider='make';
   }
  }
  const r=regions[slip.provider];const debug:Record<string,string>={};
  if(r){
   if(!slip.date||!slip.time||slip.provider==='make'){
    await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_LINE});
    let dateRegion:Rect=r.date;
    if(slip.provider==='scb'){
     const dateLine=lines.find(line=>/25\d{2}|20\d{2}/.test(line.text)&&lineY(line)<.35&&lineY(line)>.15&&line.bbox.x0/preparedMeta.width!<.55);
     if(dateLine)dateRegion=[.30,Math.max(0,lineY(dateLine)-.006),.48,Math.min(.055,(dateLine.bbox.y1-dateLine.bbox.y0)/preparedMeta.height!+.018)];
    }
    let dateText=(await worker.recognize(await crop(dateRegion,false,slip.provider==='make'?110:160))).data.text;let parsed=parseDateLine(dateText);
    if(!parsed.date||!parsed.time){
     const retryRegion:Rect=slip.provider==='make'?[.03,.12,.62,.07]:dateRegion;
     const retryText=(await worker.recognize(await crop(retryRegion,slip.provider!=='make',slip.provider==='make'?150:180))).data.text;
     dateText+=`\n${retryText}`;
     const retryParsed=parseDateLine(dateText);
     parsed={date:retryParsed.date||parsed.date,time:retryParsed.time||parsed.time};
    }
    debug.date=dateText;
    // The recognized MAKE header is a layout-specific source of truth. The
    // full-image text can contain an ID that resembles a date, so do not retain
    // that contradictory candidate when the header yields a complete timestamp.
    if(parsed.date&&(!slip.date||slip.provider==='make'))slip.date=parsed.date;
    if(parsed.time&&(!slip.time||slip.provider==='make'))slip.time=parsed.time;
   }
   if((slip.provider==='bbl'||slip.provider==='scb')&&(!slip.date||!slip.time)){
    const fallback=referenceDate(result.data.text,slip.provider);
    if(!slip.date)slip.date=fallback.date;
    if(!slip.time)slip.time=fallback.time;
   }
   // MAKE's large amount is more reliable than a digit inferred from the full image.
   if(slip.provider==='make'){
    await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT});
    const amountArea=await sharp(source).extract({left:Math.round(meta.width!*.02),top:Math.round(meta.height!*.54),width:Math.round(meta.width!*.48),height:Math.round(meta.height!*.32)}).resize({width:900}).grayscale().normalize().sharpen().png().toBuffer();
    const amountResult=await worker.recognize(amountArea);debug.amount=amountResult.data.text;
    const amountMatch=amountResult.data.text.match(/(?:^|\s)([1-9]\d{0,9}(?:,\d{3})*\.\d{2})(?=\s|บาท|THB|[a-z]{1,4}|$)/im);
    if(amountMatch && amountResult.data.confidence>=50)slip.amount=amountMatch[1];
   }else if(!slip.amount){
    await worker.setParameters({tessedit_pageseg_mode:slip.provider==='bbl'?PSM.SPARSE_TEXT:PSM.SINGLE_LINE});
    const amountArea=slip.provider==='bbl'
     ?await sharp(source).extract({left:Math.round(meta.width!*.27),top:Math.round(meta.height!*.30),width:Math.round(meta.width!*.46),height:Math.round(meta.height!*.14)}).resize({width:900}).grayscale().normalize().sharpen().png().toBuffer()
     :await crop(r.amount);
    const amountText=(await worker.recognize(amountArea)).data.text;debug.amount=amountText;
    const match=slip.provider==='bbl'?amountText.match(/(?:^|\s)([1-9]\d{0,9}(?:,\d{3})*\.\d{2})(?!\d)/m)
     :slip.provider==='paotang'?[...amountText.matchAll(/([1-9]\d{0,9}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:บาท|THB)?/gi)].at(-1)||null
     :amountText.match(/^\s*(\d[\d,]*(?:\.\d{2})?)\s*(?:บาท|THB|[a-z]{1,4})?\s*$/i);
    if(match)slip.amount=match[1];
   }
   await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_BLOCK});
   let recipientRegion=r.recipient;
   if(slip.provider==='make'){
    const amountLine=lines.find(line=>
     line.bbox.x0/preparedMeta.width!<.55 && line.bbox.y0/preparedMeta.height!>.5 && /[1-9]\d*[.,]\d{2}/.test(line.text));
    if(amountLine){
     const shift=Math.max(-.03,Math.min(.08,(amountLine.bbox.y0/preparedMeta.height!-.625)*.6));
     recipientRegion=[r.recipient[0],Math.max(0,Math.min(.94,r.recipient[1]+shift)),r.recipient[2],r.recipient[3]];
    }
   }
   if(slip.provider==='scb'){
    const label=lines.find(line=>line.text.replace(/\s/g,'').includes('ไปยัง')&&lineY(line)<.7);
    if(label)recipientRegion=[.37,Math.max(0,lineY(label)-.012),.61,.085];
   }
   if(slip.provider==='bbl'){
    const label=lines.find(line=>/ไปท[ี่ี]/.test(line.text.replace(/\s/g,''))&&lineY(line)<.75);
    if(label)recipientRegion=[.28,Math.max(0,lineY(label)-.008),.68,.09];
   }
   if(slip.provider!=='bbl'||!slip.recipient){
    const recipientText=(await worker.recognize(await crop(recipientRegion))).data.text.trim();debug.recipient=recipientText;
    let name=cleanRecipient(recipientText);
    if(slip.provider==='scb'){
     if(/มณี\s*SHOP/i.test(name||'')){
      const alias=recipientText.match(/\(([A-Za-z0-9 ]{3,})\)/)?.[1]?.trim();
      name=`SCB มณี SHOP${alias?` (${alias})`:''}`;
     }else if(/บัญชีทรู.*มันนี่/.test(slip.recipient||'')){
      name='บัญชีทรู มันนี่';
     }
    }
    if(name && name.length<200)slip.recipient=name;
   }
  }
  return {slip,text:result.data.text,confidence:result.data.confidence,debug};
 } finally {await worker.terminate();}
}
