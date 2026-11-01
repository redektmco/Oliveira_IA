export function formatPhone(value:string,format='international'){
 if(!value||value.includes('•'))return value;
 const digits=value.replace(/\D/g,'');if(format==='digits')return digits;
 if(digits.startsWith('55')&&[12,13].includes(digits.length)){const local=digits.slice(4),cut=local.length-4;return `+55 (${digits.slice(2,4)}) ${local.slice(0,cut)}-${local.slice(cut)}`;}
 return value;
}
