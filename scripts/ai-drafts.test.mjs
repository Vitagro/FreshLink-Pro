import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../artifacts/api-server/src/lib/aiDrafts.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {generateDraft,validateDraft,transcribeAudio}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
process.env.OPENAI_API_KEY='isolated-test-key';
process.env.OPENAI_DRAFT_MODEL='test-model';
const valid={customer:null,lines:[{article:'Tomate',quantity:2,unit:'caisse',evidence:'2 caisses tomate'}],questions:['Quel client ?']};
const output=(draft)=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(draft)}]}]});
test('strict schema request, no retention flag, no totals or invented conversion',async()=>{
  const result=await generateDraft('order','2 caisses tomate',undefined,async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');
    const body=JSON.parse(options.body);
    assert.equal(body.store,false);assert.equal(body.text.format.strict,true);
    assert.equal(body.text.format.schema.additionalProperties,false);
    return output(valid);
  });
  assert.deepEqual(result.draft,valid); assert.equal(result.requiresHumanReview,true);
});
test('rejects negative quantities, missing fields, unexpected fields and malformed lines',()=>{
  for(const draft of [{...valid,total:10},{...valid,questions:undefined},{...valid,lines:[{...valid.lines[0],quantity:-1}]},{...valid,lines:[null]}]) assert.throws(()=>validateDraft('order',draft));
});
test('refusal, truncation and non JSON never become successful drafts',async()=>{
  for(const body of [{status:'incomplete'},{status:'completed',output:[{content:[{type:'refusal'}]}]},{status:'completed',output:[{content:[{type:'output_text',text:'not json'}]}]}]) {
    await assert.rejects(()=>generateDraft('order','test',undefined,async()=>Response.json(body)));
  }
});
test('provider errors never include provider response secrets',async()=>{
  await assert.rejects(()=>generateDraft('order','test',undefined,async()=>new Response('private provider error',{status:401})),{message:'PROVIDER_401'});
});
test('rejects unsupported and oversized audio without network',async()=>{
  const blocked=()=>{throw Error('network must not run')};
  await assert.rejects(()=>transcribeAudio(new Uint8Array([1]),'text/html',blocked),{message:'INVALID_AUDIO'});
  await assert.rejects(()=>transcribeAudio(new Uint8Array(2000001),'audio/webm',blocked),{message:'INVALID_AUDIO'});
});
test('transcription uses configured model and multipart, not invented language',async()=>{
  process.env.OPENAI_TRANSCRIBE_MODEL='test-transcription';
  const text=await transcribeAudio(new Uint8Array([1,2,3]),'audio/webm',async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/audio/transcriptions');
    assert.equal(options.body.get('model'),'test-transcription');
    assert.equal(options.body.get('language'),null);
    assert.equal(options.headers['Content-Type'],undefined);
    return Response.json({text:'2 caisses de tomates'});
  });
  assert.equal(text,'2 caisses de tomates');
});

test('Ollama text drafts validate locally, reject malformed output and block images before network',async()=>{
 process.env.OLLAMA_API_KEY='isolated-test';
 try {
  const result=await generateDraft('order','2 caisses tomate',undefined,async(url,options)=>{
   assert.equal(url,'https://ollama.com/api/chat');const body=JSON.parse(options.body);
   assert.equal(body.format,undefined);assert.equal(body.model,'gpt-oss:120b');
   return Response.json({done:true,message:{content:JSON.stringify(valid)}});
  });assert.deepEqual(result.draft,valid);
  await assert.rejects(()=>generateDraft('order','test',undefined,async()=>Response.json({done:true,message:{content:'{"total":5}'}})),{message:'INVALID_OUTPUT'});
  await assert.rejects(()=>generateDraft('order','test','data:image/png;base64,YQ==',()=>{throw Error('must not call')}),{message:'OLLAMA_TEXT_ONLY'});
 } finally {delete process.env.OLLAMA_API_KEY;}
});

test('Groq audio works alongside Ollama without provider fallback',async()=>{
 process.env.GROQ_API_KEY='test-groq';process.env.OLLAMA_API_KEY='test-ollama';
 try {
  const text=await transcribeAudio(new Uint8Array([1]),'audio/webm',async(url,options)=>{
   assert.equal(url,'https://api.groq.com/openai/v1/audio/transcriptions');
   assert.equal(options.body.get('model'),'whisper-large-v3-turbo');
   assert.equal(options.headers.Authorization,'Bearer test-groq');
   return Response.json({text:'Deux caisses de tomates'});
  });assert.equal(text,'Deux caisses de tomates');
  let calls=0;await assert.rejects(()=>transcribeAudio(new Uint8Array([1]),'audio/webm',async()=>{calls++;return new Response('secret',{status:401})}),{message:'PROVIDER_401'});assert.equal(calls,1);
 }finally{delete process.env.GROQ_API_KEY;delete process.env.OLLAMA_API_KEY;}
});
test('Gemini images require explicit selection and return validated drafts only',async()=>{
 process.env.OLLAMA_API_KEY='test-ollama';process.env.GEMINI_API_KEY='test-gemini';process.env.GEMINI_IMAGE_MODEL='test-vision';
 try {
  await assert.rejects(()=>generateDraft('order','test','data:image/png;base64,YQ==',()=>{throw Error('must not call')}),{message:'OLLAMA_TEXT_ONLY'});
  process.env.AI_IMAGE_PROVIDER='gemini';
  const result=await generateDraft('order','test','data:image/png;base64,YQ==',async(url,options)=>{
   assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/test-vision:generateContent');assert.doesNotMatch(url,/test-gemini/);
   const body=JSON.parse(options.body);assert.equal(body.contents[0].parts[1].inlineData.mimeType,'image/png');
   return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(valid)}]}}]});
  });assert.deepEqual(result.draft,valid);
  await assert.rejects(()=>generateDraft('quality','test',undefined,async()=>Response.json({candidates:[{finishReason:'MAX_TOKENS'}]})),{message:'INCOMPLETE_OUTPUT'});
 }finally{for(const k of ['OLLAMA_API_KEY','GEMINI_API_KEY','GEMINI_IMAGE_MODEL','AI_IMAGE_PROVIDER'])delete process.env[k];}
});

test('Groq text drafts validate output with Ollama also configured',async()=>{
 process.env.GROQ_API_KEY='test';process.env.OLLAMA_API_KEY='unused';
 try {
  const result=await generateDraft('order','2 caisses tomate',undefined,async(url)=>{assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(valid)}}]});});assert.deepEqual(result.draft,valid);
  await assert.rejects(()=>generateDraft('order','test',undefined,async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'{"total":20}'}}]})),{message:'INVALID_OUTPUT'});
 }finally{delete process.env.GROQ_API_KEY;delete process.env.OLLAMA_API_KEY;}
});
