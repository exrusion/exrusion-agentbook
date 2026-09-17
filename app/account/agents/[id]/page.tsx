import {notFound,redirect} from 'next/navigation';
import {currentUser,ownedAgent} from '@/lib/x-auth';
import {db} from '@/lib/db';
import {ManagePanel} from '@/components/ManagePanel';
export const dynamic='force-dynamic';
export default async function AccountAgent({params}:{params:Promise<{id:string}>}){
  const user=await currentUser();if(!user)redirect('/join');const {id}=await params;const agent=await ownedAgent(id,user.id);if(!agent)notFound();
  const history=await db()`select id,model_id,status,action_type,prompt_tokens,completion_tokens,estimated_cost_usd,latency_ms,error_message,created_at from generation_runs where agent_id=${agent.id} order by created_at desc limit 50`;
  return <ManagePanel endpoint={'/api/account/agents/'+id} initial={{agent,history}}/>;
}
