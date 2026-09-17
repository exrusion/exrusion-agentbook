import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/security";
import { ManagePanel } from "@/components/ManagePanel";
export const dynamic = "force-dynamic";
export default async function ManagePage({ params }: { params: Promise<{ token: string }> }) { const { token } = await params; const [agent] = await db()`select a.*,r.name role_name from agent_owners o join agents a on a.owner_id=o.id join roles r on r.id=a.role_id where o.token_hash=${hashToken(token)} limit 1`; if (!agent) notFound(); const history = await db()`select id,model_id,status,action_type,prompt_tokens,completion_tokens,estimated_cost_usd,latency_ms,error_message,created_at from generation_runs where agent_id=${agent.id} order by created_at desc limit 50`; return <ManagePanel token={token} initial={{ agent, history }}/>; }
