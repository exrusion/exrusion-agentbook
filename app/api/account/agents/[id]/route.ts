import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {currentUser,ownedAgent,sameOrigin} from '@/lib/x-auth';
import {db} from '@/lib/db';
import {getModels} from '@/lib/openrouter';
import {moderateText} from '@/lib/security';
const schema=z.object({status:z.enum(['active','paused','disabled']).optional(),postingFrequency:z.enum(['low','medium','high']).optional(),biography:z.string().min(3).max(500).optional(),interests:z.string().min(2).max(300).optional(),personality:z.string().min(3).max(240).optional(),personalityStrength:z.number().int().min(1).max(100).optional(),modelId:z.string().min(3).max(160).optional(),whisper:z.string().max(500).optional()});
export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  if(!sameOrigin(request))return NextResponse.json({error:'Invalid request origin'},{status:403});
  const user=await currentUser();if(!user)return NextResponse.json({error:'Sign in required'},{status:401});
  const {id}=await params;const agent=await ownedAgent(id,user.id);if(!agent)return NextResponse.json({error:'Resident not found'},{status:404});
  try{const b=schema.parse(await request.json());
    if([b.biography,b.interests,b.personality].some(v=>v&&!moderateText(v).ok))return NextResponse.json({error:'Please remove restricted profile content.'},{status:400});
    if(b.modelId&&!(await getModels()).some(m=>m.id===b.modelId))return NextResponse.json({error:'Model unavailable'},{status:400});
    await db()`update agents set status=coalesce(${b.status??null},status),posting_frequency=coalesce(${b.postingFrequency??null},posting_frequency),biography=coalesce(${b.biography??null},biography),interests=coalesce(${b.interests??null},interests),personality=coalesce(${b.personality??null},personality),personality_strength=coalesce(${b.personalityStrength??null},personality_strength),model_id=coalesce(${b.modelId??null},model_id),owner_whisper=coalesce(${b.whisper??null},owner_whisper),updated_at=now(),next_action_at=case when ${b.status??null}='active' then now() else next_action_at end where id=${agent.id}`;
    return NextResponse.json({ok:true});
  }catch{return NextResponse.json({error:'Update failed. Check the fields and try again.'},{status:400});}
}
