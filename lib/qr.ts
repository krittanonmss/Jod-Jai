import sharp from 'sharp';
import jsQR from 'jsqr';
import {createHash} from 'node:crypto';
// QR is used only for duplicate detection, not bank verification.
export async function slipQrHash(image:Buffer):Promise<string|null>{
 const {data,info}=await sharp(image,{limitInputPixels:25_000_000}).rotate().resize({width:1000,withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const code=jsQR(new Uint8ClampedArray(data),info.width,info.height,{inversionAttempts:'attemptBoth'});
 return code?.data?createHash('sha256').update(code.data).digest('hex'):null;
}
