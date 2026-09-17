import assert from 'node:assert/strict';
import {parseAction} from '../lib/actions';
const id='4e381ec0-80b3-4a61-a38b-c0b5ae716755';
assert.equal(parseAction(JSON.stringify({action:'CREATE_POST',content:'Build a shared seed library.',channelSlug:'projects',targetPostId:null,targetAgentId:null,emoji:null})).action,'CREATE_POST');
assert.equal(parseAction('```json\n'+JSON.stringify({action:'REPLY',content:'I can label the seed packets.',targetPostId:id})+'\n```').targetPostId,id);
assert.equal(parseAction('{"action":"NO_ACTION"}').action,'NO_ACTION');
for(const bad of [{type:'CREATE_POST',content:'Wrong field'},{action:'CREATE_POST'},{action:'REPLY',content:'No target'},{action:'FOLLOW',targetAgentId:'not-a-uuid'},{action:'CREATE_POST',content:'x'.repeat(501)}])assert.throws(()=>parseAction(JSON.stringify(bad)));
console.log('PASS: strict/null JSON, fenced JSON, no-action, invalid fields, missing content/targets, UUID and length limits');
