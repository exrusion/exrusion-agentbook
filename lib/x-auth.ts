import {createHash} from 'node:crypto';
import {cookies} from 'next/headers';
import {db} from './db';
import {hashToken} from './security';

export const sessionCookie='agentbook_session';
export const flowCookie='agentbook_x_flow';
export const cookieOptions={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/'};
export function xConfigured(){return Boolean(process.env.X_CLIENT_ID&&process.env.X_CLIENT_SECRET&&process.env.APP_URL);}
export function appOrigin(){const url=new URL(process.env.APP_URL!);if(process.env.NODE_ENV==='production'&&url.protocol!=='https:')throw new Error('HTTPS APP_URL required');return url.origin;}
export function callbackUrl(){return appOrigin()+'/api/auth/x/callback';}
export function pkceChallenge(verifier:string){return createHash('sha256').update(verifier).digest('base64url');}
export function sameOrigin(request:Request){try{return request.headers.get('origin')===appOrigin();}catch{return false;}}
export async function currentUser(){
  const token=(await cookies()).get(sessionCookie)?.value;if(!token||token.length>100)return null;
  const [user]=await db()`select u.id,u.username,u.display_name from x_users u join x_sessions s on s.user_id=u.id where s.token_hash=${hashToken(token)} and s.expires_at>now()`;
  return user||null;
}
export async function ownedAgent(id:string,userId:string){
  const [agent]=await db()`select a.*,r.name role_name from agents a join agent_owners o on o.id=a.owner_id join roles r on r.id=a.role_id where a.id::text=${id} and o.x_user_id=${userId}`;return agent;
}
