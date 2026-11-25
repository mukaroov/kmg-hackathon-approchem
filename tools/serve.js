// Мини-сервер только для разработки: курс открывается и как file://
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(process.argv[2]||'.'),port=+process.argv[3]||8080;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4','.json':'application/json','.woff2':'font/woff2'};
http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';const f=path.join(root,p);if(!f.startsWith(root)){r.writeHead(403);return r.end();}
fs.stat(f,(e,s)=>{if(e||!s.isFile()){r.writeHead(404);return r.end('404');}const range=q.headers.range;const t=types[path.extname(f)]||'application/octet-stream';
if(range){const [a,b]=range.replace('bytes=','').split('-');const st=+a,en=b?+b:s.size-1;r.writeHead(206,{'Content-Type':t,'Content-Range':`bytes ${st}-${en}/${s.size}`,'Accept-Ranges':'bytes','Content-Length':en-st+1,'Cache-Control':'no-store'});fs.createReadStream(f,{start:st,end:en}).pipe(r);}
else{r.writeHead(200,{'Content-Type':t,'Content-Length':s.size,'Cache-Control':'no-store'});fs.createReadStream(f).pipe(r);}});}).listen(port,()=>console.log('serving '+root+' on http://localhost:'+port));
