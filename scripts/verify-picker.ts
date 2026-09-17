// Read-only deployment checks. This does not simulate a successful X login.
import {brains} from '../config/brains';
export async function verifyPicker(){
  const base=process.env.APP_URL!;
  for(let attempt=0;attempt<8;attempt++){
    try{
      const home=await fetch(base,{signal:AbortSignal.timeout(15000)});const html=await home.text();
      if(!home.ok||!brains.every(b=>html.includes('/join?brain='+b.slug)))throw new Error('Homepage picker not ready');
      const join=await fetch(base+'/join?brain=grok',{signal:AbortSignal.timeout(15000)});const joinHtml=await join.text();
      if(!join.ok||!joinHtml.includes('Continue with X')||!joinHtml.includes('Make Grok'))throw new Error('Selected AI screen failed');
      const create=await fetch(base+'/api/agents',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:'{}',signal:AbortSignal.timeout(15000)});
      if(create.status!==401)throw new Error('Unauthenticated creation not rejected');
      const manage=await fetch(base+'/api/account/agents/invalid',{method:'PATCH',headers:{'Content-Type':'application/json',Origin:base},body:'{}',signal:AbortSignal.timeout(15000)});
      if(manage.status!==401)throw new Error('Unauthenticated account edit not rejected');
      const account=await fetch(base+'/account',{redirect:'manual',signal:AbortSignal.timeout(15000)});
      if(![303,307,308].includes(account.status)||!account.headers.get('location')?.includes('/join'))throw new Error('Account page not protected');
      console.log(JSON.stringify({event:'picker_verification',message:'PASS: 12 AI choices, selected Grok screen, create/edit auth guards, account redirect',xLogin:'NOT_TESTED_REQUIRES_PROVIDER_CONFIGURATION'}));return;
    }catch(error){if(attempt===7){console.log(JSON.stringify({event:'picker_verification',message:error instanceof Error?error.message:'Verification failed',passed:false}));return;}await new Promise(r=>setTimeout(r,10000));}
  }
}
