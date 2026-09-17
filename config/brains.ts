import type { OpenRouterModel } from '../lib/openrouter';

export const brains = [
  {slug:'grok',name:'Grok',provider:'xAI',prefix:'x-ai/',mark:'Gr',color:'#d7e3ee',description:'A new perspective on town life.'},
  {slug:'claude',name:'Claude',provider:'Anthropic',prefix:'anthropic/',mark:'Cl',color:'#f4d7c4',description:'Give your ideas a thoughtful voice.'},
  {slug:'gpt',name:'GPT',provider:'OpenAI',prefix:'openai/',mark:'Gp',color:'#cce8dc',description:'A versatile brain for your character.'},
  {slug:'gemini',name:'Gemini',provider:'Google',prefix:'google/',mark:'Ge',color:'#d9ddfc',description:'Make room for a curious mind.'},
  {slug:'deepseek',name:'DeepSeek',provider:'DeepSeek',prefix:'deepseek/',mark:'Ds',color:'#d0e5fb',description:'Bring another angle to the conversation.'},
  {slug:'qwen',name:'Qwen',provider:'Qwen',prefix:'qwen/',mark:'Qw',color:'#e2d6fa',description:'A character with its own point of view.'},
  {slug:'llama',name:'Llama',provider:'Meta',prefix:'meta-llama/',mark:'Ll',color:'#d1edf3',description:'Find a place among the residents.'},
  {slug:'mistral',name:'Mistral',provider:'Mistral',prefix:'mistralai/',mark:'Mi',color:'#ffe2bd',description:'A little spark for the town.'},
  {slug:'kimi',name:'Kimi',provider:'Moonshot AI',prefix:'moonshotai/',mark:'Ki',color:'#d9e1ed',description:'Turn a small idea into a personality.'},
  {slug:'minimax',name:'MiniMax',provider:'MiniMax',prefix:'minimax/',mark:'Mm',color:'#f7d4e1',description:'An original resident, shaped by you.'},
  {slug:'glm',name:'GLM',provider:'Z.ai',prefix:'z-ai/',mark:'Gl',color:'#dbe7cb',description:'Add a fresh voice to the neighbourhood.'},
  {slug:'hermes',name:'Hermes',provider:'Nous Research',prefix:'nousresearch/',mark:'He',color:'#eadbcf',description:'Choose a role and start a story.'}
] as const;

export function brainFor(slug?:string){return brains.find(b=>b.slug===slug);}
export function modelForBrain(slug:string,models:OpenRouterModel[]){
  const brain=brainFor(slug);if(!brain)return undefined;
  return models.filter(m=>m.id.startsWith(brain.prefix)&&!m.id.includes(':')&&!/\b(image|embed|audio|guard)\b/i.test(m.name)&&Number.isFinite(Number(m.pricing?.prompt))&&Number.isFinite(Number(m.pricing?.completion)))
    .sort((a,b)=>(Number(a.pricing?.prompt)+Number(a.pricing?.completion))-(Number(b.pricing?.prompt)+Number(b.pricing?.completion))||a.id.localeCompare(b.id))[0];
}
