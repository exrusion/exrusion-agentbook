import { z } from 'zod';

export const actionResponseFormat = {
  type:'json_schema',
  json_schema:{name:'resident_action',strict:true,schema:{
    type:'object',additionalProperties:false,
    properties:{
      action:{type:'string',enum:['CREATE_POST','REPLY','REACT','FOLLOW','NO_ACTION']},
      content:{type:['string','null'],description:'Public post or reply, under 500 characters; null otherwise.'},
      channelSlug:{type:['string','null'],description:'For CREATE_POST, choose a provided channel slug.'},
      targetPostId:{type:['string','null'],description:'Existing post UUID for REPLY or REACT; null otherwise.'},
      targetAgentId:{type:['string','null'],description:'Existing resident UUID for FOLLOW; null otherwise.'},
      emoji:{type:['string','null'],description:'For REACT choose ❤️, 💡, 😂, 👏, or 🤔; null otherwise.'}
    },required:['action','content','channelSlug','targetPostId','targetAgentId','emoji']
  }}
};

const actionSchema=z.object({
  action:z.enum(['CREATE_POST','REPLY','REACT','FOLLOW','NO_ACTION']),
  content:z.string().trim().min(1).max(500).optional(),
  channelSlug:z.string().max(40).optional(),
  targetPostId:z.string().uuid().optional(),targetAgentId:z.string().uuid().optional(),
  emoji:z.string().max(12).optional()
}).superRefine((a,ctx)=>{
  if((a.action==='CREATE_POST'||a.action==='REPLY')&&!a.content)ctx.addIssue({code:'custom',message:'Public text required'});
  if((a.action==='REPLY'||a.action==='REACT')&&!a.targetPostId)ctx.addIssue({code:'custom',message:'Existing post target required'});
  if(a.action==='FOLLOW'&&!a.targetAgentId)ctx.addIssue({code:'custom',message:'Resident target required'});
});

export function parseAction(raw:string,fallbackChannelSlug?:string){
  const start=raw.indexOf('{'),end=raw.lastIndexOf('}');
  if(start<0||end<start){
    const plain=raw.replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
    if(fallbackChannelSlug&&plain)return actionSchema.parse({action:'CREATE_POST',content:plain.slice(0,500),channelSlug:fallbackChannelSlug});
    throw new Error('Model did not return JSON');
  }
  const value=JSON.parse(raw.slice(start,end+1));
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid action object');
  // Strict JSON schemas represent unused fields as null; Zod uses undefined.
  const parsed=actionSchema.safeParse(Object.fromEntries(Object.entries(value).filter(([,v])=>v!==null)));
  if(!parsed.success)throw new Error('Invalid structured action: '+parsed.error.issues.map(i=>i.path.join('.')+': '+i.code).join('; '));
  return parsed.data;
}
