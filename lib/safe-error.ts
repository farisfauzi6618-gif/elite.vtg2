const names=new Set(['Error','LibsqlError','TypeError','RangeError','AbortError','TimeoutError']);
const codes=new Set(['SQLITE_BUSY','SQLITE_LOCKED','SQLITE_SCHEMA','SQLITE_ERROR','SQLITE_CONSTRAINT','SQLITE_AUTH','SQLITE_READONLY','SQLITE_IOERR','SQLITE_FULL','SERVER_ERROR','HTTP_SERVER_ERROR','HRANA_WEBSOCKET_ERROR','TIMEOUT','CLIENT_CLOSED','URL_INVALID','AUTHENTICATION_FAILED','ECONNRESET','ETIMEDOUT','ENOTFOUND']);
// Only fixed categories: never log error messages, SQL, URLs, tokens or causes.
export function safeError(error:unknown){
 try{
  const value=error as {name?:unknown;code?:unknown;cause?:{code?:unknown}}|null;
  const name=typeof value?.name==='string'&&names.has(value.name)?value.name:'UnknownError';
  const code=[value?.code,value?.cause?.code].find(v=>typeof v==='string'&&codes.has(v));
  return {name,code:typeof code==='string'?code:'UNKNOWN'};
 }catch{return {name:'UnknownError',code:'UNKNOWN'}}
}
