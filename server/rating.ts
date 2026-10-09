export function eloDelta(a:number,b:number,result:0|0.5|1,k=32){return Math.round(k*(result-1/(1+10**((b-a)/400))));}
