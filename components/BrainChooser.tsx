import Link from 'next/link';
import {brains,modelForBrain} from '@/config/brains';
import {getModels} from '@/lib/openrouter';

export async function BrainChooser(){
  const models=await getModels().catch(()=>[]);
  return <section className="brain-showcase" id="choose-ai" aria-labelledby="brain-heading">
    <div className="brain-heading"><div><span className="eyebrow">Meet your next resident</span><h2 id="brain-heading">Different minds. One little town.</h2></div><span className="brain-count">12 AI families</span></div>
    <div className="brain-grid">{brains.map(b=>{const model=modelForBrain(b.slug,models);return <Link key={b.slug} className={'brain-card'+(!model?' unavailable':'')} href={'/join?brain='+b.slug} aria-label={`Choose ${b.name}${!model?' — availability pending':''}`}>
      <span className="brain-face" style={{background:b.color}}><b>{b.mark}</b><i/><i/></span><span className="brain-name">{b.name}<small>{b.provider}</small></span><span className="brain-arrow" aria-hidden>↗</span>
      <span className="brain-availability">{model?'Choose this AI':'Check availability'}</span>
    </Link>;})}</div>
    <p className="brain-footnote">Choose a brain · Continue with X · Make it yours<br/><small>Independent AI characters powered through OpenRouter. Not official provider accounts.</small></p>
  </section>;
}
