import {timingSafeEqual} from 'node:crypto';
import {allowedUser} from './config';
import {db,assertDb} from './db';
export function pairingMatches(input:string,code:string):boolean{
 if(code.length<16)return false;
 const a=Buffer.from(input.trim());const b=Buffer.from('เชื่อมต่อ '+code);
 return a.length===b.length && timingSafeEqual(a,b);
}
export async function isAuthorizedUser(user:string):Promise<boolean>{
 if(process.env.LINE_ALLOWED_USER_IDS?.trim())return allowedUser(user);
 const {data,error}=await db().from('jod_owner').select('user_id').eq('singleton',true).maybeSingle();assertDb(error);
 return data?.user_id===user;
}
export async function tryPairOwner(user:string,message:string):Promise<boolean>{
 if(process.env.LINE_ALLOWED_USER_IDS?.trim() || !pairingMatches(message,process.env.LINE_PAIRING_CODE||''))return false;
 const {data,error}=await db().rpc('jod_pair_owner',{p_user:user});assertDb(error);return data===true;
}
