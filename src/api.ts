export async function api<T>(path:string,body?:unknown):Promise<T>{
  const response=await fetch(`/api${path}`,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to connect. Please try again.');return data;
}
