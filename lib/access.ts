import {createHash,timingSafeEqual} from 'node:crypto';
import {allowedUser} from './config';
import {db,assertDb} from './db';
export function pairingMatches(input:string,code:string):boolean{
 if(code.length<16)return false;
 const a=Buffer.from(input.trim());const b=Buffer.from('เชื่อมต่อ '+code);
 return a.length===b.length && timingSafeEqual(a,b);
}
export async function isAuthorizedUser(user:string):Promise<boolean>{
 if(allowedUser(user))return true;
 const {data,error}=await db().rpc('jod_is_authorized',{p_user:user});assertDb(error);
 return data===true;
}
export async function isOwnerUser(user:string):Promise<boolean>{
 const configured=(process.env.LINE_ALLOWED_USER_IDS||'').split(',').map(value=>value.trim()).filter(Boolean);
 if(configured[0]===user)return true;
 const {data,error}=await db().from('jod_owner').select('user_id').eq('singleton',true).maybeSingle();assertDb(error);
 return data?.user_id===user;
}
export async function tryPairOwner(user:string,message:string):Promise<boolean>{
 if(process.env.LINE_ALLOWED_USER_IDS?.trim() || !pairingMatches(message,process.env.LINE_PAIRING_CODE||''))return false;
 const {data,error}=await db().rpc('jod_pair_owner',{p_user:user});assertDb(error);return data===true;
}
export async function tryJoinInvite(user:string,message:string):Promise<boolean>{
 const match=message.trim().toUpperCase().match(/^เข้าร่วม\s+([A-HJ-NP-Z2-9]{10})$/);
 if(!match)return false;
 const hash=createHash('sha256').update(match[1]).digest('hex');
 const {data,error}=await db().rpc('jod_redeem_invite',{p_hash:hash,p_user:user});assertDb(error);return data===true;
}
export async function takeRateLimit(user:string):Promise<{allowed:boolean,count:number,limit:number}>{
  const {data,error}=await db().rpc('jod_take_rate_limit',{p_user:user,p_limit:30,p_seconds:60});assertDb(error);
  return data as {allowed:boolean,count:number,limit:number};
}
export async function authorizeAndRate(user:string):Promise<{authorized:boolean,allowed:boolean,count:number,limit:number}>{
 if(allowedUser(user))return {authorized:true,...await takeRateLimit(user)};
 const {data,error}=await db().rpc('jod_authorize_and_rate',{p_user:user,p_limit:30,p_seconds:60});assertDb(error);
 return data as {authorized:boolean,allowed:boolean,count:number,limit:number};
}
