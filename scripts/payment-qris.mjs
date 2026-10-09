import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { put } from '@vercel/blob';
import './load-env.mjs';

const args=process.argv.slice(2).filter(value=>value!=='--');
if(args.includes('--help')||!args.length){
  console.log('Usage: pnpm payment:qris -- "path/to/original-qris.jpg" "MERCHANT NAME" [--local | --upload]');
  console.log('Without a flag: validate the original image and print environment values only.');
  console.log('--local: copy into local development storage. --upload: upload to the private Blob store configured in .env.local.');
  process.exit(0);
}
try {
  const [filename,merchant,...flags]=args;
  if(!filename||!merchant||merchant.trim().length<2||merchant.trim().length>100||/[\x00-\x1f\x7f]/.test(merchant))throw Error('Provide the original QRIS file and merchant name.');
  if(flags.some(flag=>!['--local','--upload'].includes(flag))||flags.length>1)throw Error('Choose only --local or --upload.');
  const source=path.resolve(filename),info=await stat(source);
  if(!info.isFile()||info.size<32||info.size>4*1024*1024)throw Error('QRIS must be a PNG/JPG/WebP file between 32 bytes and 4 MiB.');
  const bytes=await readFile(source);
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const webp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  const mime=png?'image/png':jpeg?'image/jpeg':webp?'image/webp':null;
  if(!mime)throw Error('Only an original PNG/JPG/WebP QRIS is accepted.');
  const sha256=createHash('sha256').update(bytes).digest('hex'),key='qris/'+randomUUID().replaceAll('-','');
  if(flags[0]==='--upload'){
    if(!process.env.BLOB_READ_WRITE_TOKEN)throw Error('Set the new private Blob store token in .env.local first.');
    await put('elite/'+key,bytes,{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:mime,token:process.env.BLOB_READ_WRITE_TOKEN});
    console.log('Original QRIS uploaded to the configured private Blob store. Existing files were not overwritten.');
  }else if(flags[0]==='--local'){
    if(process.env.VERCEL)throw Error('Local storage is for development only.');
    const destination=path.join(path.resolve(process.env.LOCAL_STORAGE_PATH||'.data/files'),key);
    await mkdir(path.dirname(destination),{recursive:true});
    await writeFile(destination,bytes,{flag:'wx'});await writeFile(destination+'.meta.json',JSON.stringify({contentType:mime}),{flag:'wx'});
    console.log('Original QRIS copied to local development storage.');
  }else console.log('Validation only: the image has not been stored. Run with --local or --upload before applying environment values.');
  console.log(['PAYMENT_QRIS_KEY='+key,'PAYMENT_QRIS_MIME='+mime,'PAYMENT_QRIS_MERCHANT='+merchant.trim(),'PAYMENT_QRIS_SHA256='+sha256].join('\n'));
}catch(error){console.error(error instanceof Error?error.message:'QRIS preparation failed.');process.exitCode=1;}
