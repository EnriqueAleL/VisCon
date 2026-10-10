import { readFileSync } from 'node:fs';
import type { BankQuestion, Question, Settings, Subject } from '../shared/types';

function multiple(q: Omit<BankQuestion,'options'|'format'>, answer:number, offset:number):BankQuestion {
  const values=[answer,answer+1,Math.max(0,answer-1),answer+3];
  const unique=[...new Set(values)]; while(unique.length<4) unique.push(answer+unique.length+4);
  const rotated=unique.slice(offset%4).concat(unique.slice(0,offset%4));
  return {...q,format:'quiz',answer:`o${rotated.indexOf(answer)}`,options:rotated.map((v,i)=>({id:`o${i}`,text:String(v)}))};
}
const sample:BankQuestion[]=[];
for(let i=0;i<24;i++) {
  const n=i+3, difficulty=(['foundation','standard','challenge'] as const)[i%3];
  const base={difficulty,source:'Demo practice question · not an ETH exam',topic:'Counting',subject:'discrete',id:`sets-${i}`,title:'Subsets of a finite set',prompt:`A set A contains ${n} distinct elements. How many different subsets does A have?`,formula:`|A| = ${n} \\qquad |\\mathcal{P}(A)| = \\;?`,answer:2**n,explanation:`Each of the ${n} elements can either be included or excluded. There are 2^${n} = ${2**n} possible subsets.`};
  sample.push(multiple(base,2**n,i),{...base,id:`count-${i}`,format:'numeric',title:'Choose an unordered pair',prompt:`How many ways can you select two distinct students from a group of ${n}? The order does not matter.`,formula:`\\binom{${n}}{2} = \\;?`,answer:n*(n-1)/2,explanation:`Choose the first student in ${n} ways and the second in ${n-1} ways. Divide by 2 to remove duplicate orderings: ${n} × ${n-1} / 2 = ${n*(n-1)/2}.`});
  const a=i+2,b=i%5+1,c=i%4+1,d=i+4,det=a*d-b*c;
  const matrix={difficulty,source:base.source,topic:'Matrices',subject:'linear',id:`det-${i}`,title:'A two-by-two determinant',prompt:'Find the determinant of the matrix A.',formula:`A = \\begin{pmatrix} ${a} & ${b} \\\\ ${c} & ${d} \\end{pmatrix}`,answer:det,explanation:`For a 2×2 matrix the determinant is ad − bc. Here: ${a} × ${d} − ${b} × ${c} = ${det}.`};
  sample.push(multiple(matrix,det,i+1),{...matrix,id:`trace-${i}`,format:'numeric',title:'Trace of a matrix',prompt:'Find the trace of the matrix A.',answer:a+d,explanation:`The trace is the sum of the diagonal entries: ${a} + ${d} = ${a+d}.`});
  const prog={difficulty,source:base.source,topic:'Loops',subject:'programming',id:`loop-${i}`,title:'Read the loop',prompt:`What is the value of total after this Java loop?\n\nint total = 0;\nfor (int i = 1; i <= ${n}; i++) {\n    total += i;\n}`,answer:n*(n+1)/2,explanation:`The loop sums the integers from 1 to ${n}. Their sum is ${n} × ${n+1} / 2 = ${n*(n+1)/2}.`};
  sample.push(multiple(prog,n*(n+1)/2,i+2),{...prog,id:`loop-number-${i}`,format:'numeric'});
}
sample.push({id:'java-sum',subject:'programming',topic:'Loops',format:'java',difficulty:'foundation',title:'Sum from one to n',prompt:'Read one integer n from standard input (1 ≤ n ≤ 1000). Print the sum of all integers from 1 to n. Submit a complete Java program with a public class named Main.',source:'Demo practice question · not an ETH exam',answer:'Pass every test',starter:'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner input = new Scanner(System.in);\n        int n = input.nextInt();\n\n        // Calculate and print the sum.\n    }\n}',examples:[{input:'5',output:'15'},{input:'1',output:'1'}],tests:[{input:'1',output:'1'},{input:'5',output:'15'},{input:'1000',output:'500500'}],explanation:'Use n * (n + 1) / 2, or a loop that accumulates the integers. Use standard output to print the result.'});
sample.push({...sample[sample.length-1],id:'java-gcd',difficulty:'standard',topic:'Algorithms',title:'Greatest common divisor',prompt:'Read two positive integers a and b from standard input. Print their greatest common divisor. Submit a complete Java program with a public class named Main.',starter:'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner input = new Scanner(System.in);\n        int a = input.nextInt();\n        int b = input.nextInt();\n\n        // Print the greatest common divisor.\n    }\n}',examples:[{input:'12 18',output:'6'},{input:'7 13',output:'1'}],tests:[{input:'12 18',output:'6'},{input:'7 13',output:'1'},{input:'81 27',output:'27'}],explanation:'Euclid’s algorithm repeatedly replaces (a, b) with (b, a % b), until b is zero. The remaining a is the greatest common divisor.'});

export function validateBank(value: unknown): BankQuestion[] {
  if(!Array.isArray(value)||!value.length) throw new Error('Question bank must be a non-empty array.');
  const ids=new Set<string>();
  for(const q of value) {
    if(!q||!['quiz','numeric','java'].includes(q.format)||!['foundation','standard','challenge'].includes(q.difficulty)||!['id','subject','topic','title','prompt','source','explanation'].every(k=>typeof q[k]==='string'&&q[k].trim())||ids.has(q.id)) throw new Error('Invalid or duplicate question.');
    ids.add(q.id);
    if(q.format==='numeric'&&(!Number.isFinite(q.answer)||(q.tolerance!==undefined&&(!Number.isFinite(q.tolerance)||q.tolerance<0)))) throw new Error(`Invalid numeric answer: ${q.id}`);
    if(q.format==='quiz'&&(!Array.isArray(q.options)||q.options.length<2||new Set(q.options.map((o:any)=>o.id)).size!==q.options.length||!q.options.every((o:any)=>typeof o.id==='string'&&typeof o.text==='string')||!q.options.some((o:any)=>o.id===q.answer))) throw new Error(`Invalid choices: ${q.id}`);
    if(q.format==='java'&&(typeof q.starter!=='string'||!Array.isArray(q.tests)||!q.tests.length||!q.tests.every((t:any)=>typeof t.input==='string'&&typeof t.output==='string'))) throw new Error(`Missing Java tests: ${q.id}`);
  }
  return value;
}
/** Private, authored quizzes; never imported by a frontend bundle. */
export const authoredBank=validateBank(['discrete','linear','programming','ddca'].flatMap(subject =>
  JSON.parse(readFileSync(new URL(`../questions/versus/${subject}.json`, import.meta.url), 'utf8'))));
export const demoContent=!process.env.QUESTION_BANK_PATH;
// Preserve numeric and executable Java practice while replacing repeated quiz
// templates. An explicitly configured external bank still takes precedence.
export const bank=validateBank(process.env.QUESTION_BANK_PATH?JSON.parse(readFileSync(process.env.QUESTION_BANK_PATH,'utf8')):[...authoredBank,...sample.filter(q=>q.format!=='quiz')]);
const names:Record<string,{name:string;description:string}>={discrete:{name:'Discrete Mathematics',description:'Logic, sets, counting, probability, graphs and number theory.'},linear:{name:'Linear Algebra',description:'Vectors, matrices, systems, eigenvalues and linear transformations.'},programming:{name:'Introduction to Programming',description:'Java, algorithms, data structures and complexity.'},ddca:{name:'DDCA · Computer Architecture',description:'Digital logic, processors, memory and architecture practice.'}};
export const subjects:Subject[]=[...new Set(bank.map(q=>q.subject))].map(id=>({id,...(names[id]||{name:id,description:'Imported course questions.'}),topics:[...new Set(bank.filter(q=>q.subject===id).map(q=>q.topic))],formats:[...new Set(bank.filter(q=>q.subject===id).map(q=>q.format))],count:bank.filter(q=>q.subject===id).length}));
/** Add the grounded city recall bank without replacing existing imported questions. */
export function registerCourseQuestions(questions: BankQuestion[], meta: { id: string; name: string; description: string }) {
  const fresh = questions.filter(question => !bank.some(existing => existing.id === question.id));
  validateBank([...bank, ...fresh]); bank.push(...fresh);
  const course = { ...meta, topics: [...new Set(bank.filter(q => q.subject === meta.id).map(q => q.topic))], formats: [...new Set(bank.filter(q => q.subject === meta.id).map(q => q.format))], count: bank.filter(q => q.subject === meta.id).length };
  const existing = subjects.findIndex(subject => subject.id === meta.id);
  if (existing >= 0) subjects[existing] = course; else subjects.push(course);
}
export function eligible(settings:Settings){return bank.filter(q=>q.subject===settings.subject&&q.format===settings.format&&(settings.topic==='all'||q.topic===settings.topic)&&(settings.difficulty==='mixed'||q.difficulty===settings.difficulty));}
export function publicQuestion(q:BankQuestion):Question { const {answer,tolerance,explanation,tests,...visible}=q; return visible; }
export function numericValue(input:string):number | null {
  const value=input.trim().replace(',','.');
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return null;
  const n=Number(value); return Number.isFinite(n)?n:null;
}
export function correct(q:BankQuestion,input:string){return q.format==='quiz'?input===q.answer:q.format==='numeric'&&numericValue(input)!==null&&Math.abs(numericValue(input)!-Number(q.answer))<=(q.tolerance??0);}
export function answerLabel(q:BankQuestion,input:string){return q.options?.find(o=>o.id===input)?.text??input;}
