import type { BankQuestion } from '../shared/types';
export const javaAvailable=Boolean(process.env.JUDGE0_URL&&process.env.JUDGE0_JAVA_LANGUAGE_ID);
export async function judge(q:BankQuestion,source:string,examples=false){
  if(!javaAvailable)throw new Error('Java execution is not connected. Quiz and numeric matches are available.');
  const tests=examples?q.examples:q.tests;
  if(!tests?.length)throw new Error('This question has no tests.');
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if(process.env.JUDGE0_API_KEY)headers['X-Auth-Token']=process.env.JUDGE0_API_KEY;
  const base=process.env.JUDGE0_URL!.replace(/\/$/,'');
  let passed=0;const details:string[]=[];
  for(const test of tests){
    const response=await fetch(`${base}/submissions?base64_encoded=false&wait=false`,{method:'POST',headers,signal:AbortSignal.timeout(10000),body:JSON.stringify({source_code:source,language_id:Number(process.env.JUDGE0_JAVA_LANGUAGE_ID),stdin:test.input,expected_output:test.output,cpu_time_limit:2,wall_time_limit:5,memory_limit:262144,enable_network:false,max_file_size:1024})});
    if(!response.ok)throw new Error('The Java runner is unavailable. Please try again.');
    const {token}=await response.json() as {token:string};
    let result:any;
    for(let i=0;i<30;i++){
      await new Promise(resolve=>setTimeout(resolve,500));
      const poll=await fetch(`${base}/submissions/${encodeURIComponent(token)}?base64_encoded=false`,{headers,signal:AbortSignal.timeout(10000)});
      if(!poll.ok)throw new Error('The Java runner could not return a result.');
      result=await poll.json();if(result.status?.id>2)break;
    }
    if(!result||result.status?.id<=2||result.status?.id===13)throw new Error('The Java runner did not finish. This attempt was not graded.');
    if(result.status.id===3)passed++;
    details.push(result.status.id===3?'Passed':(result.compile_output||result.stderr||result.status.description||'Failed').slice(0,1500));
  }
  return {passed,total:tests.length,details};
}
